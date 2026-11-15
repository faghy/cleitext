/**
 * The calls to the Mastodon-compatible server: registering the app, the
 * sign-in with PKCE, the account, Disbigle's articles endpoint and the
 * replies of a post. Requests go through `Http` (the core's `ctx.http`),
 * so tests answer them without a network.
 */
import { SCOPES } from './config';
import type { ArticlePayload } from './payload';
import type { Mention } from './types';

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}
export type Http = (request: HttpRequest) => Promise<{ status: number; text: string }>;

/** A refused or failed call; `status` 0 when the server could not be reached. */
export class ServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json' };
/** OAuth's own endpoints take a form, as RFC 6749 says. */
const FORM_HEADERS = {
  'content-type': 'application/x-www-form-urlencoded',
  accept: 'application/json',
};

const parse = (text: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};
const str = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

/** The server's own words, as Mastodon gives them (`error`, `error_description`). */
function errorText(status: number, body: Record<string, unknown>): string {
  const own = str(body.error_description) || str(body.error);
  if (own) return own.slice(0, 300);
  if (status === 401) return 'The server refused the access token.';
  if (status === 403) return 'The account may not do this.';
  if (status === 404) return 'The server does not know this address.';
  if (status === 429) return 'Too many requests: the server asks to wait.';
  return `The server answered ${status}.`;
}

async function call(http: Http, request: HttpRequest): Promise<Record<string, unknown>> {
  let response: { status: number; text: string };
  try {
    response = await http(request);
  } catch (error) {
    throw new ServerError(
      `The server cannot be reached (${error instanceof Error ? error.message : String(error)}).`,
      0,
    );
  }
  const body = parse(response.text);
  if (response.status < 200 || response.status >= 300)
    throw new ServerError(errorText(response.status, body), response.status);
  return body;
}

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
}

/** `POST /api/v1/apps`: the site as an app of the server, with its way back. */
export async function registerApp(
  http: Http,
  instance: string,
  input: { clientName: string; redirectUri: string; website: string },
): Promise<AppCredentials> {
  const body = await call(http, {
    url: `${instance}/api/v1/apps`,
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      client_name: input.clientName,
      redirect_uris: input.redirectUri,
      scopes: SCOPES,
      website: input.website,
    }),
  });
  const clientId = str(body.client_id);
  const clientSecret = str(body.client_secret);
  if (!clientId || !clientSecret)
    throw new ServerError('The server did not register the app.', 502);
  return { clientId, clientSecret };
}

/** Where the browser goes to sign in and allow the app. */
export function authorizeUrl(
  instance: string,
  input: { clientId: string; redirectUri: string; challenge: string; state: string },
): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: SCOPES,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
    state: input.state,
  });
  return `${instance}/oauth/authorize?${query.toString()}`;
}

/** `POST /oauth/token`: the code of the way back, with the verifier, for a token. */
export async function exchangeCode(
  http: Http,
  instance: string,
  input: AppCredentials & { code: string; redirectUri: string; verifier: string },
): Promise<string> {
  const body = await call(http, {
    url: `${instance}/oauth/token`,
    method: 'POST',
    headers: FORM_HEADERS,
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier,
      scope: SCOPES,
    }).toString(),
  });
  const token = str(body.access_token);
  if (!token) throw new ServerError('The server gave no access token.', 502);
  return token;
}

/** `POST /oauth/revoke`, on disconnect; failures do not matter. */
export async function revokeToken(
  http: Http,
  instance: string,
  input: AppCredentials & { token: string },
): Promise<void> {
  await call(http, {
    url: `${instance}/oauth/revoke`,
    method: 'POST',
    headers: FORM_HEADERS,
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      token: input.token,
    }).toString(),
    timeoutMs: 5000,
  });
}

export interface Account {
  id: string;
  /** `user@host`. */
  acct: string;
  url: string;
}

/** `GET /api/v1/accounts/verify_credentials`: who the token is. */
export async function verifyCredentials(
  http: Http,
  instance: string,
  token: string,
): Promise<Account> {
  const body = await call(http, {
    url: `${instance}/api/v1/accounts/verify_credentials`,
    method: 'GET',
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  });
  const id = str(body.id);
  const acct = str(body.acct);
  if (!id || !acct) throw new ServerError('The server did not say which account this is.', 502);
  const host = new URL(instance).hostname;
  return {
    id,
    acct: acct.includes('@') ? acct : `${acct}@${host}`,
    url: str(body.url),
  };
}

export interface PublishedStatus {
  id: string;
  url: string;
  mentions: Mention[];
}

/**
 * `POST /api/v1/disbigle/articles`. The entry's id is the idempotency key:
 * the same article sent again gives back the same post.
 */
export async function publishArticle(
  http: Http,
  instance: string,
  input: { token: string; key: string; payload: ArticlePayload; timeoutMs?: number },
): Promise<PublishedStatus> {
  const body = await call(http, {
    url: `${instance}/api/v1/disbigle/articles`,
    method: 'POST',
    headers: {
      ...JSON_HEADERS,
      authorization: `Bearer ${input.token}`,
      'idempotency-key': input.key,
    },
    body: JSON.stringify(input.payload),
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
  });
  // The status itself, or `{ status: … }`.
  const status =
    body.status && typeof body.status === 'object' ? (body.status as typeof body) : body;
  const id = str(status.id);
  const url = str(status.url) || str(status.uri);
  if (!id || !/^https?:\/\//i.test(url))
    throw new ServerError('The server did not give the address of the post.', 502);
  const host = new URL(instance).hostname.toLowerCase();
  const mentions: Mention[] = [];
  // The people mentioned: in the public post, and in the replies in other
  // languages (Disbigle mentions there those who read another language).
  const replies = Array.isArray(body.replies) ? (body.replies as unknown[]) : [];
  const statuses = [
    status,
    ...replies.map((reply) => {
      const r = reply && typeof reply === 'object' ? (reply as Record<string, unknown>) : {};
      return (r.status && typeof r.status === 'object' ? r.status : {}) as Record<string, unknown>;
    }),
  ];
  for (const one of statuses)
    if (Array.isArray(one.mentions))
      for (const item of one.mentions as unknown[]) {
        const mention = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const acct = str(mention.acct).replace(/^@/, '').toLowerCase();
        const profile = str(mention.url);
        if (!acct || !/^https?:\/\//i.test(profile)) continue;
        const full = acct.includes('@') ? acct : `${acct}@${host}`;
        if (!mentions.some((m) => m.acct === full)) mentions.push({ acct: full, url: profile });
      }
  return { id, url, mentions };
}

/**
 * The domain of the server's handles (`GET /api/v1/instance`: `uri`, or v2's
 * `domain`), e.g. `disbigle.com` for app.disbigle.com; null when not given.
 */
export async function instanceDomain(http: Http, instance: string): Promise<string | null> {
  const body = await call(http, {
    url: `${instance}/api/v1/instance`,
    method: 'GET',
    headers: { accept: 'application/json' },
    timeoutMs: 3000,
  });
  const raw = str(body.uri) || str(body.domain);
  const host = raw
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
}

/** `GET /api/v1/statuses/:id/context`, without a token: what anyone may read. */
export async function statusContext(
  http: Http,
  instance: string,
  statusId: string,
  timeoutMs?: number,
): Promise<Record<string, unknown>> {
  return call(http, {
    url: `${instance}/api/v1/statuses/${encodeURIComponent(statusId)}/context`,
    method: 'GET',
    headers: { accept: 'application/json' },
    ...(timeoutMs ? { timeoutMs } : {}),
  });
}
