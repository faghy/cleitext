/**
 * turboSMTP's public REST API (v2), through `Http`: the core's `ctx.http`
 * on a site, a fake in tests. Keys, account details, sending and
 * statistics, with the same requests as turboSMTP's own WordPress plugin.
 */
import type { OutgoingMail } from '@cleitext/plugin-sdk';
import { API_URL, SEND_URL } from './config';

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  text: string;
}

export type Http = (request: HttpRequest) => Promise<HttpResponse>;

/** The account's API keys (turboSMTP → Settings → API keys). */
export interface Keys {
  consumerKey: string;
  consumerSecret: string;
}

export type TurboErrorCode = 'network' | 'invalid-keys' | 'invalid-login' | 'service' | 'input';

export class TurboError extends Error {
  override readonly name = 'TurboError';
  constructor(
    readonly code: TurboErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function parse(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value };
  } catch {
    return { text: text.slice(0, 300) };
  }
}

/** turboSMTP's own words for an error, short. */
function messageOf(data: Record<string, unknown>): string {
  for (const key of ['message', 'error', 'detail', 'text']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 300);
  }
  return '';
}

/**
 * A request and its JSON answer. Network failures and any status but 2xx
 * throw; 401 and 403 mean refused keys (or a refused sign-in, `refused`).
 */
async function request(
  http: Http,
  input: HttpRequest,
  refused: TurboErrorCode = 'invalid-keys',
): Promise<Record<string, unknown>> {
  let response: HttpResponse;
  try {
    response = await http({
      ...input,
      headers: {
        accept: 'application/json',
        ...(input.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...input.headers,
      },
    });
  } catch (error) {
    throw new TurboError(
      'network',
      `turboSMTP could not be reached: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const data = parse(response.text);
  if (response.status === 401 || response.status === 403) {
    throw new TurboError(
      refused,
      refused === 'invalid-login'
        ? 'turboSMTP refused this email and password.'
        : 'turboSMTP refused these API keys.',
      response.status,
    );
  }
  if (response.status < 200 || response.status >= 300) {
    const said = messageOf(data);
    throw new TurboError(
      'service',
      said ? `turboSMTP: ${said} (${response.status})` : `turboSMTP answered ${response.status}.`,
      response.status,
    );
  }
  return data;
}

const keyHeaders = (keys: Keys) => ({
  consumerKey: keys.consumerKey,
  consumerSecret: keys.consumerSecret,
});

const str = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

/** Keys as typed: trimmed, no spaces inside. */
export function cleanKeys(input: { consumerKey?: unknown; consumerSecret?: unknown }): Keys {
  const consumerKey = str(input.consumerKey).trim();
  const consumerSecret = str(input.consumerSecret).trim();
  if (!consumerKey || !consumerSecret || /\s/.test(consumerKey + consumerSecret)) {
    throw new TurboError('input', 'Enter the Consumer Key and the Consumer Secret.');
  }
  return { consumerKey, consumerSecret };
}

/** The account the keys belong to (`GET /user/config`): its email, or its name. */
export async function account(http: Http, keys: Keys): Promise<string> {
  const data = await request(http, {
    url: `${API_URL}/user/config`,
    method: 'GET',
    headers: keyHeaders(keys),
  });
  for (const key of ['email', 'username', 'user', 'name', 'company']) {
    const value = str(data[key]).trim();
    if (value) return value.slice(0, 200);
  }
  return '';
}

/**
 * New API keys from the account's email and password, as turboSMTP's
 * WordPress plugin does: sign in (`/authorize`), make keys labelled with
 * the site's name (`/user/consumerKeys`), sign out (`/deauthorize`). The
 * password is used for this only, and never kept.
 */
export async function keysFromLogin(
  http: Http,
  input: { email: string; password: string; label: string },
): Promise<Keys> {
  const email = input.email.trim();
  if (!email || !input.password) throw new TurboError('input', 'Enter the email and the password.');
  const signedIn = await request(
    http,
    {
      url: `${API_URL}/authorize`,
      method: 'POST',
      headers: {},
      body: JSON.stringify({ email, password: input.password }),
    },
    'invalid-login',
  );
  const auth = str(signedIn.auth);
  if (!auth) throw new TurboError('invalid-login', 'turboSMTP refused this email and password.');
  try {
    const made = await request(http, {
      url: `${API_URL}/user/consumerKeys`,
      method: 'POST',
      headers: { authorization: auth },
      body: JSON.stringify({ label: input.label.slice(0, 100) }),
    });
    const keys = { consumerKey: str(made.consumerKey), consumerSecret: str(made.consumerSecret) };
    if (!keys.consumerKey || !keys.consumerSecret)
      throw new TurboError('service', 'turboSMTP did not give the API keys.');
    return keys;
  } finally {
    // Signing out is good manners: its failure does not undo the keys.
    await request(http, {
      url: `${API_URL}/deauthorize`,
      method: 'POST',
      headers: { authorization: auth },
    }).catch(() => undefined);
  }
}

/**
 * Whether turboSMTP takes this email and password (the SMTP sign-in), as
 * its WordPress plugin checks before saving them: signs in and out.
 */
export async function checkLogin(http: Http, email: string, password: string): Promise<void> {
  const signedIn = await request(
    http,
    {
      url: `${API_URL}/authorize`,
      method: 'POST',
      headers: {},
      body: JSON.stringify({ email: email.trim(), password }),
    },
    'invalid-login',
  );
  const auth = str(signedIn.auth);
  if (!auth) throw new TurboError('invalid-login', 'turboSMTP refused this email and password.');
  await request(http, {
    url: `${API_URL}/deauthorize`,
    method: 'POST',
    headers: { authorization: auth },
  }).catch(() => undefined);
}

/** One attachment as the sending API wants it. */
interface Attachment {
  content: string;
  name: string;
  type: string;
}

/** The sending API's fields for an email (`POST /mail/send`). */
export interface SendPayload {
  from: string;
  to: string;
  subject: string;
  content: string;
  html_content?: string;
  cc?: string;
  bcc?: string;
  reply_to?: string;
  attachments?: Attachment[];
}

/** The payload for an email, with the sender to show (`"Name" <address>`). */
export function sendPayload(message: OutgoingMail, from: string): SendPayload {
  return {
    from,
    to: message.to.join(','),
    subject: message.subject,
    content: message.text,
    ...(message.html !== undefined ? { html_content: message.html } : {}),
    ...(message.cc.length ? { cc: message.cc.join(',') } : {}),
    ...(message.bcc.length ? { bcc: message.bcc.join(',') } : {}),
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    ...(message.attachments.length
      ? {
          attachments: message.attachments.map((a) => ({
            content: Buffer.from(a.content).toString('base64'),
            name: a.filename,
            type: a.contentType,
          })),
        }
      : {}),
  };
}

/** Sends an email with the sending API; throws when turboSMTP does not take it. */
export async function send(http: Http, keys: Keys, payload: SendPayload): Promise<void> {
  await request(http, {
    url: SEND_URL,
    method: 'POST',
    headers: keyHeaders(keys),
    body: JSON.stringify(payload),
  });
}

/** The statistics' filters (`GET /analytics`). */
export interface AnalyticsQuery {
  /** `YYYY-MM-DD`, both included. */
  from: string;
  to: string;
  /** turboSMTP statuses, e.g. `SUCCESS,OPEN`; empty for all. */
  status?: string;
  page?: number;
  limit?: number;
  /** The site's time zone, e.g. `Europe/Rome`. */
  tz?: string;
}

/** The answer of `/analytics`: the total, the packed day series and one page of messages. */
export interface AnalyticsAnswer {
  count: number;
  aggs: unknown[];
  results: Record<string, unknown>[];
}

export async function analytics(
  http: Http,
  keys: Keys,
  query: AnalyticsQuery,
): Promise<AnalyticsAnswer> {
  const params = new URLSearchParams({
    int: '1',
    orderby: 'send_time',
    ordertype: 'desc',
    grp: 'day',
    from: query.from,
    to: query.to,
    page: String(query.page ?? 1),
    limit: String(query.limit ?? 10),
    tz: query.tz ?? 'UTC',
    status: query.status ?? '',
  });
  const data = await request(http, {
    url: `${API_URL}/analytics?${params}`,
    method: 'GET',
    headers: keyHeaders(keys),
  });
  return {
    count: Number(data.count) || 0,
    aggs: Array.isArray(data.aggs) ? data.aggs : [],
    results: Array.isArray(data.results)
      ? data.results.filter(
          (r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object',
        )
      : [],
  };
}
