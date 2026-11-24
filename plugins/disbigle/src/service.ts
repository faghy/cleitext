/**
 * What the plugin does on a site: its settings and connection, announcing
 * an article once per translation group, and the replies kept for a few
 * minutes. The token and the app's secret live in `ctx.secrets` only.
 */
import type { PluginContext, PluginEntry } from '@cleitext/plugin-sdk';
import { commentsFromContext } from './comments';
import { DEFAULT_CONFIG, FIELD_GROUP, hostOf, normalizeConfig } from './config';
import {
  instanceDomain,
  lookupAccount,
  publishArticle,
  ServerError,
  statusContext,
  type Http,
} from './mastodon';
import { buildPayload, documentText, languageOf, type ArticleVersion } from './payload';
import type {
  Announcement,
  AnnouncementRef,
  CommentsCache,
  Connection,
  DisbigleConfig,
  FediComment,
  LogLine,
  Mention,
  SettingsView,
} from './types';

export const KEY = {
  config: 'config',
  connection: 'connection',
  oauth: 'oauth',
  log: 'log',
  index: 'announced',
  post: (entryId: string) => `post:${entryId}`,
  comments: (statusId: string) => `comments:${statusId}`,
  /** The domain of the connected server's handles (`disbigle.com`), read once. */
  domain: 'domain',
} as const;

export const SECRET = { clientSecret: 'client-secret', token: 'access-token' } as const;

/** Replies are fetched again after this time. */
export const COMMENTS_TTL = 5 * 60 * 1000;
/** After a failed fetch, the old replies stay this long. */
export const COMMENTS_RETRY = 60 * 1000;
/** An attempt still running is not started again before this time. */
export const PENDING_TTL = 2 * 60 * 1000;
/** Failed announcements are tried again this many times by the scheduled task. */
export const MAX_ATTEMPTS = 6;
const LOG_SIZE = 50;
const INDEX_SIZE = 500;
const DAY = 24 * 60 * 60 * 1000;
/**
 * How long the translation group stays still before it is announced: the
 * translations of an article often come out a few seconds or minutes after
 * it, and one post carries every language.
 */
export const SETTLE_MS = 2 * 60 * 1000;

/** Categories every site has, not worth a hashtag. */
const DEFAULT_CATEGORIES = new Set(['uncategorized', 'senza-categoria', 'non-classificato']);

export interface IndexItem {
  entryId: string;
  statusId: string;
  at: string;
}

export type AnnounceResult =
  'announced' | 'already' | 'failed' | 'skipped' | 'not-connected' | 'busy' | 'waiting';

export class Disbigle {
  constructor(
    private readonly ctx: PluginContext,
    private readonly http: Http,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---- Settings and connection -------------------------------------------------------

  async config(siteId: string): Promise<DisbigleConfig> {
    return normalizeConfig(await this.ctx.storage.get(siteId, KEY.config), DEFAULT_CONFIG);
  }

  saveConfig(siteId: string, config: DisbigleConfig): Promise<void> {
    return this.ctx.storage.set(siteId, KEY.config, config);
  }

  connection(siteId: string): Promise<Connection | null> {
    return this.ctx.storage.get<Connection>(siteId, KEY.connection);
  }

  async disconnect(siteId: string): Promise<void> {
    await this.ctx.storage.delete(siteId, KEY.connection);
    await this.ctx.secrets.delete(siteId, SECRET.token);
    await this.ctx.secrets.delete(siteId, SECRET.clientSecret);
  }

  async log(siteId: string): Promise<LogLine[]> {
    return (await this.ctx.storage.get<LogLine[]>(siteId, KEY.log)) ?? [];
  }

  private async addLog(siteId: string, line: LogLine): Promise<void> {
    const lines = await this.log(siteId);
    await this.ctx.storage.set(siteId, KEY.log, [line, ...lines].slice(0, LOG_SIZE));
  }

  async index(siteId: string): Promise<IndexItem[]> {
    return (await this.ctx.storage.get<IndexItem[]>(siteId, KEY.index)) ?? [];
  }

  /** Failed announcements, newest first (from the log: the records are per entry). */
  async failed(siteId: string): Promise<SettingsView['failed']> {
    const seen = new Set<string>();
    const out: SettingsView['failed'] = [];
    for (const line of await this.log(siteId)) {
      if (seen.has(line.entryId)) continue;
      seen.add(line.entryId);
      const record = await this.record(siteId, line.entryId);
      if (record?.state !== 'failed') continue;
      out.push({
        entryId: record.entryId,
        title: record.title,
        error: record.error ?? '',
        at: record.at,
        retrying: Boolean(record.nextTry),
      });
    }
    return out;
  }

  async view(siteId: string): Promise<SettingsView> {
    const connection = await this.connection(siteId);
    return {
      config: await this.config(siteId),
      connection: connection
        ? {
            acct: connection.acct,
            accountUrl: connection.accountUrl,
            instance: connection.instance,
            connectedAt: connection.connectedAt,
            refused: Boolean(connection.refused),
          }
        : null,
      failed: await this.failed(siteId),
      log: await this.log(siteId),
    };
  }

  // ---- Announcements -----------------------------------------------------------------

  /** The record kept for an entry itself (or the pointer of a translation). */
  private rawRecord(siteId: string, entryId: string) {
    return this.ctx.storage.get<Announcement | AnnouncementRef>(siteId, KEY.post(entryId));
  }

  /** The announcement of an entry, following a translation's pointer. */
  async record(siteId: string, entryId: string): Promise<Announcement | null> {
    const raw = await this.rawRecord(siteId, entryId);
    if (!raw) return null;
    if ('ref' in raw) {
      const target = await this.rawRecord(siteId, raw.ref);
      return target && !('ref' in target) ? target : null;
    }
    return raw;
  }

  /** The published post of an entry, or null. */
  async published(siteId: string, entryId: string): Promise<Announcement | null> {
    const record = await this.record(siteId, entryId);
    return record?.state === 'done' && record.statusId && record.url ? record : null;
  }

  /**
   * Announces an article on its first publication, once for its whole
   * translation group. `manual` (a retry from the admin) also sends one
   * that failed for good or came out before the connection.
   */
  async announce(
    siteId: string,
    entryId: string,
    options: { manual?: boolean } = {},
  ): Promise<AnnounceResult> {
    const connection = await this.connection(siteId);
    const token = connection ? await this.ctx.secrets.get(siteId, SECRET.token) : null;
    if (!connection || !token || connection.refused) return 'not-connected';
    const config = await this.config(siteId);
    if (!config.announce && !options.manual) return 'skipped';

    const entry = await this.ctx.content.get(siteId, entryId);
    if (!entry || entry.type !== 'article' || entry.status !== 'published') return 'skipped';
    const own = (entry.fields?.[FIELD_GROUP] ?? {}) as Record<string, unknown>;
    if (own.announce === false) return 'skipped';
    // Only articles that come out after the connection: not old ones published again.
    if (
      !options.manual &&
      entry.publishedAt &&
      Date.parse(entry.publishedAt) < Date.parse(connection.connectedAt) - 60_000
    )
      return 'skipped';

    const now = this.now();
    const group = (await this.ctx.content.translations(siteId, entryId)).map((t) => t.id);
    // One announcement per translation group.
    for (const id of group) {
      const other = await this.record(siteId, id);
      if (!other) continue;
      if (other.state === 'done' || this.running(other, now)) {
        if (other.state === 'done')
          await this.ctx.storage.set(siteId, KEY.post(entryId), { ref: other.entryId });
        return other.state === 'done' ? 'already' : 'busy';
      }
    }
    const previous = await this.rawRecord(siteId, entryId);
    if (previous && 'ref' in previous) return 'already';
    if (previous?.state === 'done') return 'already';
    if (previous && this.running(previous, now)) return 'busy';
    if (
      previous?.state === 'failed' &&
      !options.manual &&
      (!previous.nextTry || Date.parse(previous.nextTry) > now.getTime())
    )
      return 'skipped';

    const found = await this.publishedVersions(siteId, entry, group);
    // Wait until the group stays still (its translations published too), unless asked by hand.
    const latest = Math.max(
      ...found.map((e) => (e.publishedAt ? Date.parse(e.publishedAt) : 0)),
      0,
    );
    if (!options.manual && now.getTime() - latest < SETTLE_MS) return 'waiting';
    const versions = this.versions(found, entry, connection.siteUrl);
    // The post speaks the main language (English when there is one): its
    // hashtags and the title in the log come from that version, not from the
    // translation that happened to come out last.
    const main =
      found.find((e) => e.url && languageOf(e.locale) === 'en') ??
      found.find((e) => e.id === entry.id) ??
      entry;
    const built = buildPayload(versions, await this.tagNames(siteId, main));
    // The connected account never mentions itself (by any of its addresses).
    const self = await this.ownAccts(siteId, connection);
    const payload = built
      ? { ...built, mentions: built.mentions.filter((m) => !self.has(m.toLowerCase())) }
      : built;
    const attempts = (previous?.attempts ?? 0) + 1;
    const base: Announcement = {
      state: 'pending',
      entryId,
      title: main.title,
      instance: connection.instance,
      accountId: connection.accountId,
      at: now.toISOString(),
      attempts,
      ids: [entryId, ...group],
    };
    if (!payload) {
      const error =
        'The article has no version in English, Italian, Spanish, French, German or Chinese.';
      await this.ctx.storage.set(siteId, KEY.post(entryId), {
        ...base,
        state: 'failed',
        nextTry: null,
        error,
      });
      await this.addLog(siteId, {
        at: base.at,
        entryId,
        title: main.title,
        ok: false,
        message: error,
      });
      return 'failed';
    }
    await this.ctx.storage.set(siteId, KEY.post(entryId), base);

    try {
      const status = await publishArticle(this.http, connection.instance, {
        token,
        key: entryId,
        payload,
        timeoutMs: 4000,
      });
      const done: Announcement = {
        ...base,
        state: 'done',
        statusId: status.id,
        url: status.url,
        mentions: await this.resolveMentions(
          siteId,
          connection,
          token,
          payload.mentions,
          status.mentions,
        ),
      };
      await this.ctx.storage.set(siteId, KEY.post(entryId), done);
      for (const id of group) {
        const raw = await this.rawRecord(siteId, id);
        if (!raw || !('ref' in raw))
          await this.ctx.storage.set(siteId, KEY.post(id), { ref: entryId });
      }
      const index = await this.index(siteId);
      await this.ctx.storage.set(
        siteId,
        KEY.index,
        [{ entryId, statusId: status.id, at: base.at }, ...index].slice(0, INDEX_SIZE),
      );
      await this.addLog(siteId, {
        at: base.at,
        entryId,
        title: main.title,
        ok: true,
        message: 'Announced.',
        url: status.url,
      });
      await this.ctx.cache.invalidate(
        siteId,
        [entryId, ...group].map((id) => `entry:${id}`),
      );
      return 'announced';
    } catch (error) {
      const status = error instanceof ServerError ? error.status : 0;
      const message = error instanceof Error ? error.message : String(error);
      // The server or the network may come back; a refusal will not by itself.
      const transient = status === 0 || status === 408 || status === 429 || status >= 500;
      const nextTry =
        transient && attempts < MAX_ATTEMPTS
          ? new Date(now.getTime() + 5 * 60 * 1000 * 2 ** (attempts - 1)).toISOString()
          : null;
      await this.ctx.storage.set(siteId, KEY.post(entryId), {
        ...base,
        state: 'failed',
        error: message,
        httpStatus: status,
        nextTry,
      } satisfies Announcement);
      if (status === 401)
        await this.ctx.storage.set(siteId, KEY.connection, { ...connection, refused: true });
      await this.addLog(siteId, {
        at: base.at,
        entryId,
        title: main.title,
        ok: false,
        message: status ? `${status}: ${message}` : message,
      });
      this.ctx.log.warn('The announcement on Disbigle failed', {
        siteId,
        entryId,
        status,
        message,
      });
      return 'failed';
    }
  }

  private running(record: Announcement, now: Date): boolean {
    return record.state === 'pending' && now.getTime() - Date.parse(record.at) < PENDING_TTL;
  }

  /** The published versions of the article's translation group. */
  private publishedVersions(siteId: string, entry: PluginEntry, group: string[]) {
    return this.ctx.content.find(siteId, {
      ids: [entry.id, ...group],
      type: 'article',
      status: 'published',
      withDocument: true,
      limit: 50,
    });
  }

  /**
   * The hosts of the connected server: its address and the domain its handles
   * use (e.g. disbigle.com for app.disbigle.com), read from the server once.
   */
  async serverHosts(siteId: string, connection: Connection): Promise<Set<string>> {
    const hosts = new Set<string>([new URL(connection.instance).hostname.toLowerCase()]);
    let domain = await this.ctx.storage.get<string>(siteId, KEY.domain);
    if (domain === null || domain === undefined) {
      domain = (await instanceDomain(this.http, connection.instance).catch(() => null)) ?? '';
      await this.ctx.storage.set(siteId, KEY.domain, domain);
    }
    if (domain) hosts.add(domain.toLowerCase());
    return hosts;
  }

  /**
   * The addresses of the connected account (`user@host`): its server's, its
   * profile's and the domain its handles use (`disbigle@disbigle.com`).
   */
  private async ownAccts(siteId: string, connection: Connection): Promise<Set<string>> {
    const user = connection.acct.split('@')[0]!.toLowerCase();
    const hosts = await this.serverHosts(siteId, connection);
    const [, accountHost] = connection.acct.toLowerCase().split('@');
    if (accountHost) hosts.add(accountHost);
    try {
      hosts.add(new URL(connection.accountUrl).hostname.toLowerCase());
    } catch {
      // No profile address.
    }
    return new Set([...hosts].map((host) => `${user}@${host}`));
  }

  /**
   * The profiles of the people mentioned: those the server reported, then the
   * ones it left out, looked up (a few at most).
   */
  private async resolveMentions(
    siteId: string,
    connection: Connection,
    token: string,
    asked: string[],
    reported: Mention[],
  ): Promise<Mention[]> {
    const hosts = await this.serverHosts(siteId, connection);
    const known = withAliases(reported, hosts);
    const keys = new Set(known.map((m) => m.acct));
    for (const acct of asked
      .map((a) => a.toLowerCase())
      .filter((a) => !keys.has(a))
      .slice(0, 10)) {
      const url = await lookupAccount(this.http, connection.instance, acct, token);
      if (url) known.push({ acct, url });
    }
    return known;
  }

  /** The published versions, the one being published first, with full addresses. */
  private versions(found: PluginEntry[], entry: PluginEntry, siteUrl: string): ArticleVersion[] {
    const ordered = [
      ...found.filter((e) => e.id === entry.id),
      ...found.filter((e) => e.id !== entry.id),
    ];
    return ordered
      .filter((e) => e.url)
      .map((e) => ({
        locale: e.locale,
        title: e.title,
        excerpt: e.excerpt ?? null,
        text: documentText(e.document),
        url: absolute(e.url, siteUrl),
      }));
  }

  /** Names of the article's categories, then its tags. */
  private async tagNames(siteId: string, entry: PluginEntry): Promise<string[]> {
    const ids = [...(entry.terms.category ?? []), ...(entry.terms.tag ?? [])];
    if (ids.length === 0) return [];
    const terms = await this.ctx.terms.find(siteId, { ids, limit: 100 });
    const byId = new Map(terms.map((t) => [t.id, t]));
    return ids
      .map((id) => byId.get(id))
      .filter((t) => t && !DEFAULT_CATEGORIES.has(t.slug))
      .map((t) => t!.name);
  }

  /** Articles of the last hours not announced yet, and retries that are due. */
  async announcePending(siteId: string, max = 5): Promise<void> {
    const connection = await this.connection(siteId);
    if (!connection || connection.refused || !(await this.config(siteId)).announce) return;
    const since = Date.parse(connection.connectedAt) - 60_000;
    const recent = await this.ctx.content.find(siteId, {
      type: 'article',
      status: 'published',
      limit: 30,
    });
    let tried = 0;
    for (const entry of recent) {
      if (tried >= max) break;
      if (!entry.publishedAt || Date.parse(entry.publishedAt) < since) continue;
      if (this.now().getTime() - Date.parse(entry.publishedAt) > 7 * DAY) continue;
      const record = await this.rawRecord(siteId, entry.id);
      if (record && ('ref' in record || record.state === 'done')) continue;
      if (record?.state === 'failed' && !record.nextTry) continue;
      const result = await this.announce(siteId, entry.id);
      if (result === 'announced' || result === 'failed') tried++;
    }
  }

  // ---- Replies -----------------------------------------------------------------------

  /** The replies to show under an article: kept a few minutes, none when the server is down. */
  async comments(
    siteId: string,
    record: Announcement,
    options: { timeoutMs?: number; force?: boolean } = {},
  ): Promise<{ items: FediComment[]; changed: boolean }> {
    const key = KEY.comments(record.statusId!);
    const cached = await this.ctx.storage.get<CommentsCache>(siteId, key);
    const now = this.now().getTime();
    if (cached && !options.force) {
      const until = cached.retryAt
        ? Date.parse(cached.retryAt)
        : Date.parse(cached.at) + COMMENTS_TTL;
      if (until > now) return { items: cached.items, changed: false };
    }
    try {
      const context = await statusContext(
        this.http,
        record.instance,
        record.statusId!,
        options.timeoutMs ?? 3000,
      );
      const items = commentsFromContext(context, {
        statusId: record.statusId!,
        accountId: record.accountId,
        instanceHost: hostOf(record.instance),
        // Chosen when shown (`withAvatars`), so the setting applies at once.
        remoteAvatars: true,
      });
      await this.ctx.storage.set(siteId, key, {
        at: new Date(now).toISOString(),
        items,
      } satisfies CommentsCache);
      return { items, changed: JSON.stringify(items) !== JSON.stringify(cached?.items ?? []) };
    } catch {
      await this.ctx.storage.set(siteId, key, {
        at: cached?.at ?? new Date(now).toISOString(),
        retryAt: new Date(now + COMMENTS_RETRY).toISOString(),
        items: cached?.items ?? [],
      } satisfies CommentsCache);
      return { items: cached?.items ?? [], changed: false };
    }
  }

  /**
   * Fetches the replies of recent announcements again, so cached pages
   * show new ones: every few minutes in the first day, then every half
   * hour for a week. Pages change only when the replies did.
   */
  async refreshComments(siteId: string, max = 20): Promise<void> {
    if (!(await this.config(siteId)).comments) return;
    const now = this.now().getTime();
    let done = 0;
    for (const item of await this.index(siteId)) {
      if (done >= max) break;
      const age = now - Date.parse(item.at);
      if (age > 7 * DAY) break;
      const cached = await this.ctx.storage.get<CommentsCache>(siteId, KEY.comments(item.statusId));
      const every = age < DAY ? COMMENTS_TTL : 30 * 60 * 1000;
      if (cached && now - Date.parse(cached.at) < every) continue;
      const record = await this.published(siteId, item.entryId);
      if (!record) continue;
      done++;
      const { changed } = await this.comments(siteId, record, { force: true, timeoutMs: 8000 });
      if (changed) await this.ctx.cache.invalidate(siteId, [commentsTag(record.statusId!)]);
    }
  }
}

/** The cache tag of the pages showing the replies of a post. */
export const commentsTag = (statusId: string) => `disbigle:${statusId}`;
/** The cache tag of every page showing the plugin's section. */
export const CACHE_TAG = 'disbigle';

/** A path made a full address with the site's (an absolute one stays). */
export function absolute(path: string, origin: string): string {
  try {
    return new URL(path, origin).href;
  } catch {
    return path;
  }
}

/**
 * The mentions with the other names of the connected server's people: an
 * account of app.disbigle.com is also written `user@disbigle.com`.
 */
export function withAliases(mentions: Mention[], hosts: Set<string>): Mention[] {
  const out = [...mentions];
  const keys = new Set(out.map((m) => m.acct.toLowerCase()));
  for (const mention of mentions) {
    const [user, host] = mention.acct.toLowerCase().split('@');
    if (!user || !host || !hosts.has(host)) continue;
    for (const other of hosts) {
      const acct = `${user}@${other}`;
      if (keys.has(acct)) continue;
      keys.add(acct);
      out.push({ acct, url: mention.url });
    }
  }
  return out;
}
