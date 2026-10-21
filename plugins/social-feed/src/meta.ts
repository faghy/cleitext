/**
 * Meta's APIs, as this plugin uses them. Only the supported ones:
 *
 * - Instagram API with Instagram Login (`graph.instagram.com`, Business and
 *   Creator accounts, permission `instagram_business_basic`);
 * - Graph API with Facebook Login (`graph.facebook.com`): Page posts with a
 *   Page access token (`pages_show_list`, `pages_read_engagement`,
 *   `pages_read_user_content`), and the Instagram account linked to the Page
 *   (`instagram_basic`).
 *
 * Every request goes through `http` (the plugin's `ctx.http.send`), so tests
 * replace it. Tokens travel in the query string, as Meta documents it, and
 * are never logged: errors carry Meta's message only.
 */
import type { ChannelError, ErrorKind, PageChoice } from './types';

export const GRAPH_VERSION = 'v24.0';
const IG_GRAPH = 'https://graph.instagram.com';
const FB_GRAPH = 'https://graph.facebook.com';

export type HttpSend = (request: {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  binary?: boolean;
}) => Promise<{ status: number; type: string; text: string; base64?: string }>;

export const INSTAGRAM_SCOPES = ['instagram_business_basic'];
export const FACEBOOK_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
];
/** Added when the Instagram account is read through the Page. */
export const FACEBOOK_INSTAGRAM_SCOPES = ['instagram_basic'];

/** An error of Meta (or of the way to it), with what it means for the site. */
export class MetaError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    readonly code?: number,
  ) {
    super(message);
  }

  toState(now: Date): ChannelError {
    return {
      kind: this.kind,
      message: this.message,
      ...(this.code !== undefined ? { code: this.code } : {}),
      at: now.toISOString(),
    };
  }
}

/** Meta's error codes, grouped by what the site can do about them. */
export function errorKind(code: number | undefined, status: number): ErrorKind {
  if (code === 190 || code === 102 || code === 463 || code === 467) return 'token';
  if (
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    (code !== undefined && code >= 80001 && code <= 80014) ||
    status === 429
  )
    return 'rate';
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) return 'permission';
  if (status === 401) return 'token';
  if (status === 403) return 'permission';
  return 'api';
}

/** Redacts tokens and secrets that a message might echo. */
function redact(text: string): string {
  return text.replace(/(access_token|client_secret|fb_exchange_token)=[^&\s"]+/g, '$1=…');
}

async function call<T>(
  http: HttpSend,
  url: string,
  init: Omit<Parameters<HttpSend>[0], 'url'> = {},
): Promise<T> {
  let res: Awaited<ReturnType<HttpSend>>;
  try {
    res = await http({ method: 'GET', timeoutMs: 15_000, ...init, url });
  } catch (error) {
    throw new MetaError(
      redact(
        `Meta could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      ),
      'network',
    );
  }
  let body: unknown = null;
  try {
    body = res.text ? JSON.parse(res.text) : null;
  } catch {
    // Not JSON: an error page of a proxy or of Meta.
  }
  const error = (body as { error?: unknown } | null)?.error;
  if (res.status >= 400 || error) {
    const e = (error && typeof error === 'object' ? error : {}) as {
      message?: unknown;
      code?: unknown;
      error_subcode?: unknown;
    };
    // The Instagram token endpoint answers `{ error_type, code, error_message }`.
    const flat = (body ?? {}) as { error_message?: unknown; code?: unknown };
    const message =
      typeof e.message === 'string'
        ? e.message
        : typeof flat.error_message === 'string'
          ? flat.error_message
          : typeof error === 'string'
            ? error
            : `Meta answered with status ${res.status}.`;
    const code =
      typeof e.code === 'number' ? e.code : typeof flat.code === 'number' ? flat.code : undefined;
    const subcode = typeof e.error_subcode === 'number' ? e.error_subcode : undefined;
    const kind = errorKind(subcode === 463 || subcode === 467 ? subcode : code, res.status);
    throw new MetaError(redact(message).slice(0, 500), kind, code);
  }
  if (body === null || typeof body !== 'object')
    throw new MetaError('Meta sent an answer that is not JSON.', 'api');
  return body as T;
}

const query = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

const expiry = (now: Date, seconds: unknown): string | null =>
  typeof seconds === 'number' && seconds > 0
    ? new Date(now.getTime() + seconds * 1000).toISOString()
    : null;

// ---- Sign-in addresses -----------------------------------------------------------------

/** Where the "Connect" button sends the person: Instagram's own sign-in. */
export function instagramAuthorizeUrl(appId: string, redirectUri: string, state: string): string {
  return `https://www.instagram.com/oauth/authorize?${query({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: INSTAGRAM_SCOPES.join(','),
    state,
  })}`;
}

/** Facebook Login, for a Page (and its Instagram account when asked). */
export function facebookAuthorizeUrl(
  appId: string,
  redirectUri: string,
  state: string,
  withInstagram: boolean,
): string {
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${query({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [...FACEBOOK_SCOPES, ...(withInstagram ? FACEBOOK_INSTAGRAM_SCOPES : [])].join(','),
    state,
  })}`;
}

// ---- Instagram tokens ------------------------------------------------------------------

export interface TokenGrant {
  token: string;
  expiresAt: string | null;
}

/** The sign-in code → a short-lived token (an hour) and the account's id. */
export async function instagramExchangeCode(
  http: HttpSend,
  app: { appId: string; secret: string },
  code: string,
  redirectUri: string,
): Promise<{ token: string; userId: string }> {
  const body = await call<{
    access_token?: string;
    user_id?: number | string;
    data?: { access_token?: string; user_id?: number | string }[];
  }>(http, 'https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: query({
      client_id: app.appId,
      client_secret: app.secret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      // Instagram adds `#_` to the code in the address.
      code: code.replace(/#_$/, ''),
    }),
  });
  // Older answers are flat, newer ones in `data`.
  const grant = body.data?.[0] ?? body;
  if (!grant.access_token) throw new MetaError('Instagram sent no access token.', 'api');
  return { token: grant.access_token, userId: String(grant.user_id ?? '') };
}

/** A short-lived Instagram token → a long-lived one (60 days). */
export async function instagramLongLived(
  http: HttpSend,
  secret: string,
  shortToken: string,
  now: Date,
): Promise<TokenGrant> {
  const body = await call<{ access_token?: string; expires_in?: number }>(
    http,
    `${IG_GRAPH}/access_token?${query({
      grant_type: 'ig_exchange_token',
      client_secret: secret,
      access_token: shortToken,
    })}`,
  );
  if (!body.access_token) throw new MetaError('Instagram sent no long-lived token.', 'api');
  return { token: body.access_token, expiresAt: expiry(now, body.expires_in) };
}

/**
 * A long-lived Instagram token, at least a day old and still valid → a new
 * one, valid 60 days from now. No app secret is needed.
 */
export async function instagramRefresh(
  http: HttpSend,
  token: string,
  now: Date,
): Promise<TokenGrant> {
  const body = await call<{ access_token?: string; expires_in?: number }>(
    http,
    `${IG_GRAPH}/refresh_access_token?${query({ grant_type: 'ig_refresh_token', access_token: token })}`,
  );
  if (!body.access_token) throw new MetaError('Instagram sent no refreshed token.', 'api');
  return { token: body.access_token, expiresAt: expiry(now, body.expires_in) };
}

// ---- Facebook tokens -------------------------------------------------------------------

/** The sign-in code → a user token, then a long-lived one (about 60 days). */
export async function facebookExchangeCode(
  http: HttpSend,
  app: { appId: string; secret: string },
  code: string,
  redirectUri: string,
  now: Date,
): Promise<TokenGrant> {
  const short = await call<{ access_token?: string }>(
    http,
    `${FB_GRAPH}/${GRAPH_VERSION}/oauth/access_token?${query({
      client_id: app.appId,
      client_secret: app.secret,
      redirect_uri: redirectUri,
      code,
    })}`,
  );
  if (!short.access_token) throw new MetaError('Facebook sent no access token.', 'api');
  return facebookLongLived(http, app, short.access_token, now);
}

export async function facebookLongLived(
  http: HttpSend,
  app: { appId: string; secret: string },
  token: string,
  now: Date,
): Promise<TokenGrant> {
  const body = await call<{ access_token?: string; expires_in?: number }>(
    http,
    `${FB_GRAPH}/${GRAPH_VERSION}/oauth/access_token?${query({
      grant_type: 'fb_exchange_token',
      client_id: app.appId,
      client_secret: app.secret,
      fb_exchange_token: token,
    })}`,
  );
  if (!body.access_token) throw new MetaError('Facebook sent no long-lived token.', 'api');
  return { token: body.access_token, expiresAt: expiry(now, body.expires_in) };
}

export interface PageAccount extends PageChoice {
  token: string;
}

/**
 * The Pages the person manages, with their Page tokens. Tokens of Pages got
 * with a long-lived user token do not expire.
 */
export async function facebookPages(http: HttpSend, userToken: string): Promise<PageAccount[]> {
  const body = await call<{
    data?: {
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string; username?: string };
    }[];
  }>(
    http,
    `${FB_GRAPH}/${GRAPH_VERSION}/me/accounts?${query({
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      limit: 100,
      access_token: userToken,
    })}`,
  );
  return (body.data ?? [])
    .filter((p) => p.id && p.access_token)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name ?? p.id),
      token: String(p.access_token),
      instagram: p.instagram_business_account?.id
        ? {
            id: String(p.instagram_business_account.id),
            username: String(p.instagram_business_account.username ?? ''),
          }
        : null,
    }));
}

/** The account behind a token: the Page for a Page token. */
export async function facebookMe(
  http: HttpSend,
  token: string,
): Promise<{ id: string; name: string }> {
  const body = await call<{ id?: string; name?: string }>(
    http,
    `${FB_GRAPH}/${GRAPH_VERSION}/me?${query({ fields: 'id,name', access_token: token })}`,
  );
  if (!body.id) throw new MetaError('Facebook did not say whose token this is.', 'token');
  return { id: String(body.id), name: String(body.name ?? body.id) };
}

export interface TokenInfo {
  valid: boolean;
  type: string;
  expiresAt: string | null;
  dataAccessExpiresAt: string | null;
  scopes: string[];
}

/** What Meta knows about a Facebook token (needs the app's id and secret). */
export async function facebookDebugToken(
  http: HttpSend,
  app: { appId: string; secret: string },
  token: string,
): Promise<TokenInfo> {
  const body = await call<{
    data?: {
      is_valid?: boolean;
      type?: string;
      expires_at?: number;
      data_access_expires_at?: number;
      scopes?: string[];
    };
  }>(
    http,
    `${FB_GRAPH}/${GRAPH_VERSION}/debug_token?${query({
      input_token: token,
      access_token: `${app.appId}|${app.secret}`,
    })}`,
  );
  const d = body.data ?? {};
  const at = (s: number | undefined) => (s && s > 0 ? new Date(s * 1000).toISOString() : null);
  return {
    valid: d.is_valid === true,
    type: String(d.type ?? ''),
    expiresAt: at(d.expires_at),
    dataAccessExpiresAt: at(d.data_access_expires_at),
    scopes: Array.isArray(d.scopes) ? d.scopes.map(String) : [],
  };
}

// ---- Content ---------------------------------------------------------------------------

export const INSTAGRAM_MEDIA_FIELDS =
  'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{media_type,media_url,thumbnail_url}';

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  children?: { data?: { media_type?: string; media_url?: string; thumbnail_url?: string }[] };
}

export interface InstagramUser {
  id?: string;
  user_id?: string | number;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
}

/** Where an Instagram account is read: Instagram Login, or Graph through its Page. */
export interface InstagramSource {
  via: 'instagram' | 'facebook';
  /** The account's id (needed through the Page; `me` otherwise). */
  userId: string;
  token: string;
}

const instagramBase = (source: InstagramSource) =>
  source.via === 'instagram'
    ? `${IG_GRAPH}/${GRAPH_VERSION}/me`
    : `${FB_GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(source.userId)}`;

export async function instagramProfile(
  http: HttpSend,
  source: InstagramSource,
): Promise<InstagramUser> {
  const fields =
    source.via === 'instagram'
      ? 'user_id,username,name,profile_picture_url,followers_count'
      : 'id,username,name,profile_picture_url,followers_count';
  return call<InstagramUser>(
    http,
    `${instagramBase(source)}?${query({ fields, access_token: source.token })}`,
  );
}

export async function instagramMedia(
  http: HttpSend,
  source: InstagramSource,
  limit: number,
): Promise<InstagramMedia[]> {
  const body = await call<{ data?: InstagramMedia[] }>(
    http,
    `${instagramBase(source)}/media?${query({
      fields: INSTAGRAM_MEDIA_FIELDS,
      limit,
      access_token: source.token,
    })}`,
  );
  return Array.isArray(body.data) ? body.data : [];
}

export const FACEBOOK_POST_FIELDS =
  'id,message,story,created_time,permalink_url,full_picture,status_type,attachments{media_type,type,url,title,unshimmed_url,media,subattachments.limit(10){media_type,type,media}},reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)';

export interface FacebookAttachment {
  media_type?: string;
  type?: string;
  url?: string;
  unshimmed_url?: string;
  title?: string;
  media?: { image?: { src?: string; width?: number; height?: number }; source?: string };
  subattachments?: { data?: FacebookAttachment[] };
}

export interface FacebookPost {
  id: string;
  message?: string;
  story?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  status_type?: string;
  attachments?: { data?: FacebookAttachment[] };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
}

export interface FacebookPage {
  id?: string;
  name?: string;
  username?: string;
  link?: string;
  picture?: { data?: { url?: string } };
  followers_count?: number;
  fan_count?: number;
}

export async function facebookPage(
  http: HttpSend,
  pageId: string,
  token: string,
): Promise<FacebookPage> {
  return call<FacebookPage>(
    http,
    `${FB_GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(pageId)}?${query({
      fields: 'id,name,username,link,picture.type(large){url},followers_count,fan_count',
      access_token: token,
    })}`,
  );
}

export async function facebookPosts(
  http: HttpSend,
  pageId: string,
  token: string,
  limit: number,
): Promise<FacebookPost[]> {
  const body = await call<{ data?: FacebookPost[] }>(
    http,
    `${FB_GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/posts?${query({
      fields: FACEBOOK_POST_FIELDS,
      limit,
      access_token: token,
    })}`,
  );
  return Array.isArray(body.data) ? body.data : [];
}
