/**
 * The work of the plugin, apart from the routes and the block: connecting
 * accounts, refreshing tokens, fetching and caching the posts, copying
 * their pictures. Everything it needs comes in `FeedDeps`, so tests run it
 * against fake storage and fake Meta answers.
 */
import { normalizeConfig, normalizeState } from './config';
import {
  download,
  imageKey,
  KEEP_UNUSED_MS,
  localPath,
  MAX_IMAGES,
  type ImageStore,
} from './images';
import {
  facebookDebugToken,
  facebookMe,
  facebookPage,
  facebookPages,
  facebookPosts,
  instagramMedia,
  instagramProfile,
  instagramRefresh,
  MetaError,
  type HttpSend,
  type InstagramSource,
  type PageAccount,
} from './meta';
import {
  facebookProfileOf,
  feedSignature,
  instagramProfileOf,
  normalizeFacebook,
  normalizeInstagram,
} from './normalize';
import {
  assumedExpiry,
  nextFetch,
  shouldFetch,
  shouldRefreshInstagram,
  tokenStatus,
} from './tokens';
import {
  CHANNELS,
  EMPTY_STATE,
  type Channel,
  type ChannelState,
  type ChannelView,
  type FeedCache,
  type FeedConfig,
  type PageChoice,
  type SocialPost,
} from './types';

export interface FeedDeps {
  http: HttpSend;
  storage: {
    get<T = unknown>(siteId: string, key: string): Promise<T | null>;
    set(siteId: string, key: string, value: unknown): Promise<void>;
    delete(siteId: string, key: string): Promise<void>;
  };
  secrets: {
    get(siteId: string, name: string): Promise<string | null>;
    set(siteId: string, name: string, value: string): Promise<void>;
    delete(siteId: string, name: string): Promise<void>;
  };
  images: ImageStore;
  /** Drops the cached pages that show feeds. */
  invalidate(siteId: string): Promise<void>;
  log: { info(message: string, data?: object): void; warn(message: string, data?: object): void };
  now(): Date;
}

/** Names of the secrets: tokens and app secrets never leave the server. */
export const SECRET = {
  instagramAppSecret: 'instagram_app_secret',
  facebookAppSecret: 'facebook_app_secret',
  instagramToken: 'instagram_token',
  facebookPageToken: 'facebook_page_token',
  facebookUserToken: 'facebook_user_token',
} as const;

const KEY = {
  config: 'config',
  state: (c: Channel) => `state:${c}`,
  cache: (c: Channel) => `cache:${c}`,
  lock: (c: Channel) => `lock:${c}`,
  pages: 'pages',
};

export const CACHE_TAG = 'social-feed';

// ---- Stored data -----------------------------------------------------------------------

export async function loadConfig(deps: FeedDeps, siteId: string): Promise<FeedConfig> {
  return normalizeConfig(await deps.storage.get(siteId, KEY.config));
}

export async function saveConfig(deps: FeedDeps, siteId: string, config: FeedConfig) {
  await deps.storage.set(siteId, KEY.config, config);
}

export async function loadState(
  deps: FeedDeps,
  siteId: string,
  channel: Channel,
): Promise<ChannelState> {
  return normalizeState(await deps.storage.get(siteId, KEY.state(channel)));
}

async function saveState(deps: FeedDeps, siteId: string, channel: Channel, state: ChannelState) {
  await deps.storage.set(siteId, KEY.state(channel), state);
}

export async function loadCache(
  deps: FeedDeps,
  siteId: string,
  channel: Channel,
): Promise<FeedCache | null> {
  const cache = await deps.storage.get<FeedCache>(siteId, KEY.cache(channel));
  return cache && Array.isArray(cache.posts) ? cache : null;
}

/** Pages offered after connecting Facebook, until one is chosen (without their tokens). */
export async function pendingPages(deps: FeedDeps, siteId: string): Promise<PageChoice[]> {
  return (await deps.storage.get<PageChoice[]>(siteId, KEY.pages)) ?? [];
}

// ---- Connecting ------------------------------------------------------------------------

/**
 * Connects the Instagram account of a long-lived Instagram token (from the
 * sign-in, or pasted): checks it, keeps it as a secret, fetches the feed.
 */
export async function connectInstagram(
  deps: FeedDeps,
  siteId: string,
  token: string,
  options: { method: 'oauth' | 'manual'; expiresAt: string | null },
): Promise<ChannelState> {
  const now = deps.now();
  const user = await instagramProfile(deps.http, { via: 'instagram', userId: 'me', token });
  const profile = instagramProfileOf(user, '');
  let expiresAt = options.expiresAt;
  let estimated = false;
  let refreshedAt = now.toISOString();
  if (options.method === 'manual') {
    // A pasted token says nothing of its age: a refresh tells its expiry
    // (it works once the token is a day old); until then, 60 days is a guess.
    try {
      const fresh = await instagramRefresh(deps.http, token, now);
      token = fresh.token;
      expiresAt = fresh.expiresAt;
    } catch {
      expiresAt = assumedExpiry(now);
      estimated = true;
      refreshedAt = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();
    }
  }
  await deps.secrets.set(siteId, SECRET.instagramToken, token);
  const state: ChannelState = {
    ...EMPTY_STATE,
    connected: true,
    method: options.method,
    account: { id: profile.id, name: profile.name, username: profile.username },
    connectedAt: now.toISOString(),
    tokenExpiresAt: expiresAt,
    expiresEstimated: estimated,
    tokenRefreshedAt: refreshedAt,
  };
  await saveState(deps, siteId, 'instagram', state);
  return fetchChannel(deps, siteId, 'instagram');
}

/**
 * A Facebook user token (from the sign-in, or pasted): its Pages are listed.
 * With one Page it is connected at once; with several, the admin chooses.
 */
export async function offerPages(
  deps: FeedDeps,
  siteId: string,
  userToken: string,
): Promise<{ pages: PageChoice[]; connected: boolean }> {
  const pages = await facebookPages(deps.http, userToken);
  if (pages.length === 0)
    throw new MetaError(
      'This Facebook account manages no Page this app may read. Choose the Page when Facebook asks, or check the app’s permissions.',
      'permission',
    );
  // Kept only until a Page is chosen.
  await deps.secrets.set(siteId, SECRET.facebookUserToken, userToken);
  if (pages.length === 1) {
    await connectPage(deps, siteId, pages[0]!, 'oauth');
    return { pages: [], connected: true };
  }
  const choices: PageChoice[] = pages.map(({ id, name, instagram }) => ({ id, name, instagram }));
  await deps.storage.set(siteId, KEY.pages, choices);
  return { pages: choices, connected: false };
}

/** The Page chosen among those offered. */
export async function choosePage(deps: FeedDeps, siteId: string, pageId: string) {
  const userToken = await deps.secrets.get(siteId, SECRET.facebookUserToken);
  if (!userToken) throw new MetaError('Connect Facebook again: the sign-in has expired.', 'token');
  const page = (await facebookPages(deps.http, userToken)).find((p) => p.id === pageId);
  if (!page) throw new MetaError('That Page is not among those of this account.', 'permission');
  await connectPage(deps, siteId, page, 'oauth');
}

/** A pasted Facebook token: a Page token, or a user token whose Pages are offered. */
export async function connectFacebookToken(
  deps: FeedDeps,
  siteId: string,
  token: string,
): Promise<{ pages: PageChoice[]; connected: boolean }> {
  let pages: PageAccount[] = [];
  try {
    pages = await facebookPages(deps.http, token);
  } catch (error) {
    // A Page token cannot list Pages: that is the expected case.
    if (error instanceof MetaError && error.kind === 'network') throw error;
  }
  if (pages.length > 0) return offerPages(deps, siteId, token);
  const me = await facebookMe(deps.http, token);
  await connectPage(deps, siteId, { id: me.id, name: me.name, token, instagram: null }, 'manual');
  return { pages: [], connected: true };
}

async function connectPage(
  deps: FeedDeps,
  siteId: string,
  page: PageAccount,
  method: 'oauth' | 'manual',
): Promise<void> {
  const now = deps.now();
  const config = await loadConfig(deps, siteId);
  let expiresAt: string | null = null;
  let dataAccessExpiresAt: string | null = null;
  const secret = await deps.secrets.get(siteId, SECRET.facebookAppSecret);
  if (config.facebook.appId && secret) {
    try {
      const info = await facebookDebugToken(
        deps.http,
        { appId: config.facebook.appId, secret },
        page.token,
      );
      expiresAt = info.expiresAt;
      dataAccessExpiresAt = info.dataAccessExpiresAt;
    } catch (error) {
      deps.log.warn('The Page token could not be checked', { error: String(error) });
    }
  }
  await deps.secrets.set(siteId, SECRET.facebookPageToken, page.token);
  // The user token and the offered Pages are not needed any more.
  await deps.secrets.delete(siteId, SECRET.facebookUserToken);
  await deps.storage.delete(siteId, KEY.pages);
  const base: ChannelState = {
    ...EMPTY_STATE,
    connected: true,
    method,
    connectedAt: now.toISOString(),
    tokenExpiresAt: expiresAt,
    dataAccessExpiresAt,
    tokenRefreshedAt: now.toISOString(),
  };
  await saveState(deps, siteId, 'facebook', {
    ...base,
    account: { id: page.id, name: page.name },
  });
  await fetchChannel(deps, siteId, 'facebook');
  // The Page's Instagram account, when Instagram is read through Facebook.
  if (config.instagram.via === 'facebook') {
    if (page.instagram) {
      await deps.secrets.delete(siteId, SECRET.instagramToken);
      await saveState(deps, siteId, 'instagram', {
        ...base,
        method: 'page',
        account: {
          id: page.instagram.id,
          name: page.instagram.username,
          username: page.instagram.username,
        },
      });
      await fetchChannel(deps, siteId, 'instagram');
    } else {
      deps.log.info('The Page has no Instagram professional account linked');
    }
  }
}

/** Forgets a channel: tokens, state, cached posts and their pictures. */
export async function disconnect(deps: FeedDeps, siteId: string, channel: Channel) {
  if (channel === 'instagram') {
    await deps.secrets.delete(siteId, SECRET.instagramToken);
  } else {
    await deps.secrets.delete(siteId, SECRET.facebookPageToken);
    await deps.secrets.delete(siteId, SECRET.facebookUserToken);
    await deps.storage.delete(siteId, KEY.pages);
    // An Instagram account read through the Page goes with it.
    const ig = await loadState(deps, siteId, 'instagram');
    if (ig.method === 'page') await disconnect(deps, siteId, 'instagram');
  }
  await deps.storage.delete(siteId, KEY.state(channel));
  await deps.storage.delete(siteId, KEY.cache(channel));
  await cleanupImages(deps, siteId, true);
  await deps.invalidate(siteId);
}

/** The next scheduled run fetches every connected channel (after a change of settings). */
export async function fetchSoon(deps: FeedDeps, siteId: string) {
  for (const channel of CHANNELS) {
    const state = await loadState(deps, siteId, channel);
    if (state.connected)
      await saveState(deps, siteId, channel, { ...state, nextFetchAt: deps.now().toISOString() });
  }
}

// ---- Tokens ----------------------------------------------------------------------------

/** Refreshes the Instagram token when its time has come (see `shouldRefreshInstagram`). */
export async function refreshTokens(deps: FeedDeps, siteId: string): Promise<boolean> {
  const now = deps.now();
  const state = await loadState(deps, siteId, 'instagram');
  if (!shouldRefreshInstagram(state, now)) return false;
  const token = await deps.secrets.get(siteId, SECRET.instagramToken);
  if (!token) return false;
  const attempt = { ...state, lastRefreshAttempt: now.toISOString() };
  try {
    const fresh = await instagramRefresh(deps.http, token, now);
    await deps.secrets.set(siteId, SECRET.instagramToken, fresh.token);
    await saveState(deps, siteId, 'instagram', {
      ...attempt,
      tokenExpiresAt: fresh.expiresAt ?? state.tokenExpiresAt,
      expiresEstimated: false,
      tokenRefreshedAt: now.toISOString(),
      refreshFailures: 0,
      // A token error is solved by a working token.
      lastError: state.lastError?.kind === 'token' ? null : state.lastError,
    });
    deps.log.info('Instagram token refreshed', { siteId, expiresAt: fresh.expiresAt });
    return true;
  } catch (error) {
    const failure = error instanceof MetaError ? error : new MetaError(String(error), 'api');
    deps.log.warn('The Instagram token could not be refreshed', {
      siteId,
      kind: failure.kind,
      message: failure.message,
    });
    await saveState(deps, siteId, 'instagram', {
      ...attempt,
      refreshFailures: state.refreshFailures + 1,
      lastError: failure.kind === 'token' ? failure.toState(now) : state.lastError,
    });
    return false;
  }
}

// ---- Fetching --------------------------------------------------------------------------

async function sourceOf(
  deps: FeedDeps,
  siteId: string,
  channel: Channel,
  state: ChannelState,
): Promise<{ token: string; id: string; via: 'instagram' | 'facebook' } | null> {
  if (!state.connected || !state.account) return null;
  if (channel === 'instagram' && state.method !== 'page') {
    const token = await deps.secrets.get(siteId, SECRET.instagramToken);
    return token ? { token, id: state.account.id, via: 'instagram' } : null;
  }
  const token = await deps.secrets.get(siteId, SECRET.facebookPageToken);
  return token ? { token, id: state.account.id, via: 'facebook' } : null;
}

/**
 * Fetches a channel's latest posts now and caches them. On an error the
 * last good posts stay, and the error is kept for the admin.
 */
export async function fetchChannel(
  deps: FeedDeps,
  siteId: string,
  channel: Channel,
): Promise<ChannelState> {
  const now = deps.now();
  const config = await loadConfig(deps, siteId);
  const state = await loadState(deps, siteId, channel);
  const source = await sourceOf(deps, siteId, channel, state);
  if (!source) {
    if (!state.connected) return state;
    const lost: ChannelState = {
      ...state,
      lastFetchAt: now.toISOString(),
      lastError: {
        kind: 'token',
        message: 'The access token is missing: connect the account again.',
        at: now.toISOString(),
      },
      nextFetchAt: nextFetch(now, config.refreshMinutes, { kind: 'token', message: '', at: '' }, 1),
    };
    await saveState(deps, siteId, channel, lost);
    return lost;
  }
  try {
    let cache: FeedCache;
    if (channel === 'instagram') {
      const ig: InstagramSource = { via: source.via, userId: source.id, token: source.token };
      const [user, media] = await Promise.all([
        instagramProfile(deps.http, ig),
        instagramMedia(deps.http, ig, config.count),
      ]);
      cache = {
        profile: instagramProfileOf(user, source.id),
        posts: normalizeInstagram(media),
        fetchedAt: now.toISOString(),
      };
    } else {
      const [page, posts] = await Promise.all([
        facebookPage(deps.http, source.id, source.token),
        facebookPosts(deps.http, source.id, source.token, config.count),
      ]);
      cache = {
        profile: facebookProfileOf(page, source.id),
        posts: normalizeFacebook(posts),
        fetchedAt: now.toISOString(),
      };
    }
    const previous = await loadCache(deps, siteId, channel);
    if (config.media === 'local') await copyImages(deps, siteId, cache);
    await deps.storage.set(siteId, KEY.cache(channel), cache);
    const next: ChannelState = {
      ...state,
      account: state.account
        ? {
            ...state.account,
            name: cache.profile?.name || state.account.name,
            ...(cache.profile?.username ? { username: cache.profile.username } : {}),
          }
        : null,
      lastFetchAt: now.toISOString(),
      lastSuccessAt: now.toISOString(),
      nextFetchAt: nextFetch(now, config.refreshMinutes, null, 0),
      lastError: null,
      failures: 0,
    };
    await saveState(deps, siteId, channel, next);
    await cleanupImages(deps, siteId, false);
    const changed =
      !previous ||
      feedSignature(previous.posts) !== feedSignature(cache.posts) ||
      JSON.stringify(previous.profile) !== JSON.stringify(cache.profile);
    if (changed) await deps.invalidate(siteId);
    return next;
  } catch (error) {
    const failure =
      error instanceof MetaError
        ? error
        : new MetaError(error instanceof Error ? error.message : String(error), 'api');
    const failures = state.failures + 1;
    deps.log.warn(`The ${channel} feed could not be refreshed`, {
      siteId,
      kind: failure.kind,
      code: failure.code,
      message: failure.message,
    });
    const next: ChannelState = {
      ...state,
      lastFetchAt: now.toISOString(),
      lastError: failure.toState(now),
      failures,
      nextFetchAt: nextFetch(now, config.refreshMinutes, failure.toState(now), failures),
    };
    await saveState(deps, siteId, channel, next);
    return next;
  }
}

/**
 * The scheduled task, for one site: refresh the Instagram token when due,
 * then fetch each enabled channel whose time has come. Two server processes
 * may run it at once: a short lock in storage avoids most double fetches,
 * and a double fetch is harmless.
 */
export async function runScheduled(deps: FeedDeps, siteId: string): Promise<void> {
  const config = await loadConfig(deps, siteId);
  if (!config.instagram.enabled && !config.facebook.enabled) return;
  await refreshTokens(deps, siteId);
  const now = deps.now();
  for (const channel of CHANNELS) {
    if (!config[channel].enabled) continue;
    const state = await loadState(deps, siteId, channel);
    if (!shouldFetch(state, now, config.refreshMinutes)) continue;
    const lock = await deps.storage.get<string>(siteId, KEY.lock(channel));
    if (lock && Date.parse(lock) > now.getTime()) continue;
    await deps.storage.set(
      siteId,
      KEY.lock(channel),
      new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    );
    try {
      await fetchChannel(deps, siteId, channel);
    } finally {
      await deps.storage.delete(siteId, KEY.lock(channel));
    }
  }
}

// ---- Pictures --------------------------------------------------------------------------

/**
 * Copies the pictures of the posts and the profile picture, once each:
 * those already copied are only linked. Over the limits a picture is left
 * out (the post shows its text), never loaded from Meta in its place.
 */
export async function copyImages(deps: FeedDeps, siteId: string, cache: FeedCache) {
  const stored = new Map((await deps.images.list(siteId)).map((i) => [i.key, i]));
  let room = Math.max(0, MAX_IMAGES - stored.size);
  const copy = async (owner: string, url: string | null): Promise<string | null> => {
    if (!url) return null;
    const key = imageKey(owner, 'cover');
    const known = stored.get(key);
    if (known) return localPath(key, known.mime);
    if (room <= 0) return null;
    try {
      const file = await download(deps.http, url);
      if (!file) return null;
      await deps.images.put(siteId, key, file.mime, file.bytes);
      stored.set(key, { key, mime: file.mime, size: file.bytes.length, createdAt: deps.now() });
      room--;
      return localPath(key, file.mime);
    } catch (error) {
      deps.log.warn('A picture could not be copied', { error: String(error) });
      return null;
    }
  };
  if (cache.profile)
    cache.profile.avatarLocal = await copy(
      `${cache.profile.channel}:avatar:${cache.profile.id}`,
      cache.profile.avatar,
    );
  // A few at a time: fast enough, gentle with Meta and the server.
  const queue = [...cache.posts];
  const workers = Array.from({ length: 3 }, async () => {
    for (let post = queue.shift(); post; post = queue.shift()) {
      post.local = await copy(post.id, post.image);
    }
  });
  await Promise.all(workers);
}

/** The keys of the pictures the cached feeds use. */
async function usedKeys(deps: FeedDeps, siteId: string): Promise<Set<string>> {
  const used = new Set<string>();
  const add = (path: string | null | undefined) => {
    const key = path?.match(/\/([a-f0-9]{32})\.\w+$/)?.[1];
    if (key) used.add(key);
  };
  for (const channel of CHANNELS) {
    const cache = await loadCache(deps, siteId, channel);
    if (!cache) continue;
    add(cache.profile?.avatarLocal);
    for (const post of cache.posts) add(post.local);
  }
  return used;
}

/**
 * Deletes pictures no cached post uses: after a day (pages cached by a CDN
 * may still show them), or at once with `now` (an account disconnected).
 */
export async function cleanupImages(deps: FeedDeps, siteId: string, now: boolean) {
  const used = await usedKeys(deps, siteId);
  const limit = deps.now().getTime() - KEEP_UNUSED_MS;
  const stale = (await deps.images.list(siteId))
    .filter((i) => !used.has(i.key) && (now || new Date(i.createdAt).getTime() < limit))
    .map((i) => i.key);
  await deps.images.remove(siteId, stale);
  return stale.length;
}

// ---- The admin's view ------------------------------------------------------------------

export async function channelView(
  deps: FeedDeps,
  siteId: string,
  channel: Channel,
): Promise<ChannelView> {
  const state = await loadState(deps, siteId, channel);
  const cache = await loadCache(deps, siteId, channel);
  const config = await loadConfig(deps, siteId);
  return {
    ...state,
    tokenStatus: tokenStatus(state, deps.now()),
    posts: cache?.posts.length ?? 0,
    fetchedAt: cache?.fetchedAt ?? null,
    profile: cache?.profile ?? null,
    preview: (cache?.posts ?? []).slice(0, 6).map((p: SocialPost) => ({
      id: p.id,
      image: config.media === 'local' ? p.local : p.image,
      text: p.text.slice(0, 140),
      permalink: p.permalink,
    })),
  };
}
