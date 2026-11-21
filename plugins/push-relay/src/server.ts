/**
 * Push Relay: the push notifications of the official Cleitext app, sent
 * through Firebase Cloud Messaging for every Cleitext site. Installed on
 * cleitext.com, it holds the Firebase service account: sites only post
 * `{ tokens, title, body, data }` to `/api/v1/ext/push-relay/send` with the
 * header `x-cleitext-site: <site origin>`, and drop the tokens it reports
 * as invalid. Inert (503) until the service account is set.
 */
import { definePlugin, type PluginContext, type RouteRequest } from '@cleitext/plugin-sdk';
import {
  fcmMessage,
  fcmUrl,
  InvalidServiceAccount,
  outcomeOf,
  parseServiceAccount,
  tokenRequestBody,
  TOKEN_URL,
  type SendOutcome,
  type ServiceAccount,
} from './fcm';

const CAPABILITY = 'manage_push_relay';
const ACCOUNT_SECRET = 'service-account';
const LIMIT_KEY = 'rate-limit';
export const DEFAULT_LIMIT = 300;
const HOUR_MS = 3600_000;
/** Requests per minute from one address (a server may host many sites). */
const IP_LIMIT_PER_MINUTE = 120;

export const MAX_TOKENS = 100;
export const MAX_TITLE = 120;
export const MAX_BODY = 400;
const MAX_DATA_KEYS = 20;
/** The route must answer within the core's 5 seconds. */
const BUDGET_MS = 4_000;
const PARALLEL = 25;
/** Access tokens last an hour: used for 55 minutes. */
const ACCESS_TTL_MS = 55 * 60_000;

/** `/settings` for the admin: never the key itself. */
export interface SettingsView {
  configured: boolean;
  projectId: string | null;
  clientEmail: string | null;
  rateLimit: number;
}

export interface SendBody {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
}

/** Keys FCM keeps for itself in `data`. */
const RESERVED_DATA = /^(from|notification|message_type|collapse_key)$|^(google|gcm)/i;

/** Checks the body of `/send`; a text saying what is wrong, or the body. */
export function parseSendBody(input: unknown): SendBody | string {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (!Array.isArray(raw.tokens) || raw.tokens.length === 0) return 'tokens: give 1 to 100 tokens.';
  if (raw.tokens.length > MAX_TOKENS) return `tokens: at most ${MAX_TOKENS}.`;
  const tokens = [...new Set(raw.tokens)];
  if (!tokens.every((t) => typeof t === 'string' && /^[\x21-\x7e]{1,4096}$/.test(t)))
    return 'tokens: not valid.';
  if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > MAX_TITLE)
    return `title: 1 to ${MAX_TITLE} characters.`;
  const body = raw.body ?? '';
  if (typeof body !== 'string' || body.length > MAX_BODY)
    return `body: at most ${MAX_BODY} characters.`;
  const data = raw.data ?? {};
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return 'data: a map of texts.';
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length > MAX_DATA_KEYS) return `data: at most ${MAX_DATA_KEYS} keys.`;
  for (const [key, value] of entries) {
    if (!/^[A-Za-z][\w.-]{0,63}$/.test(key) || RESERVED_DATA.test(key))
      return `data: the key "${key.slice(0, 64)}" is not allowed.`;
    if (typeof value !== 'string' || value.length > 1000)
      return `data: "${key}" must be a text of 1000 characters at most.`;
  }
  return {
    tokens: tokens as string[],
    title: raw.title.trim(),
    body: body.trim(),
    data: Object.fromEntries(entries) as Record<string, string>,
  };
}

/** The site's origin from `x-cleitext-site`, e.g. `https://example.com`; null when not valid. */
export function siteOriginOf(header: string | undefined): string | null {
  if (!header || header.length > 300) return null;
  try {
    const url = new URL(header);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Counters in a sliding window, in memory (one server). */
export class Window {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly spanMs: number) {}

  /** Takes `count` from the key's allowance; false (and nothing taken) when it is used up. */
  take(key: string, count: number, limit: number, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.spanMs);
    if (recent.length + count > limit) {
      this.hits.set(key, recent);
      return false;
    }
    for (let i = 0; i < count; i++) recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  private prune(now: number) {
    for (const [key, times] of this.hits) {
      if (!times.some((t) => now - t < this.spanMs)) this.hits.delete(key);
    }
  }
}

const problem = (status: number, error: string, detail?: string) => ({
  status,
  body: { error, ...(detail ? { detail } : {}) },
});

export function setupPushRelay(ctx: PluginContext, options: { now?: () => number } = {}): void {
  const now = options.now ?? Date.now;
  const perOrigin = new Window(HOUR_MS);
  const perIp = new Window(60_000);
  const accounts = new Map<string, { raw: string; account: ServiceAccount }>();
  const access = new Map<string, { token: string; until: number }>();

  ctx.access.defineCapability(CAPABILITY, {
    label: { en: 'Manage the push relay', it: 'Gestire il relay delle notifiche push' },
    roles: ['administrator'],
  });

  async function account(siteId: string): Promise<ServiceAccount | null> {
    const raw = await ctx.secrets.get(siteId, ACCOUNT_SECRET);
    if (!raw) return null;
    const cached = accounts.get(siteId);
    if (cached?.raw === raw) return cached.account;
    try {
      const parsed = parseServiceAccount(raw);
      accounts.set(siteId, { raw, account: parsed });
      return parsed;
    } catch {
      return null;
    }
  }

  async function rateLimit(siteId: string): Promise<number> {
    const stored = await ctx.storage.get<number>(siteId, LIMIT_KEY);
    return typeof stored === 'number' && Number.isInteger(stored) && stored > 0
      ? stored
      : DEFAULT_LIMIT;
  }

  const remaining = (deadline: number) => deadline - now();
  const timeout = (deadline: number) => Math.max(1000, Math.min(3000, remaining(deadline) - 200));

  /** An OAuth 2.0 access token of the service account, kept for 55 minutes. */
  async function accessToken(sa: ServiceAccount, deadline: number): Promise<string> {
    const key = `${sa.clientEmail}|${sa.privateKey.length}|${sa.privateKey.slice(-40)}`;
    const cached = access.get(key);
    if (cached && cached.until > now()) return cached.token;
    const res = await ctx.http.send({
      url: TOKEN_URL,
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenRequestBody(sa, now()),
      timeoutMs: timeout(deadline),
    });
    let answer: { access_token?: unknown; expires_in?: unknown } = {};
    try {
      answer = JSON.parse(res.text) as typeof answer;
    } catch {
      // Handled below.
    }
    if (res.status !== 200 || typeof answer.access_token !== 'string')
      throw new Error(`Google refused the service account (${res.status}).`);
    const lifetime =
      typeof answer.expires_in === 'number'
        ? Math.max(60_000, answer.expires_in * 1000 - 300_000)
        : ACCESS_TTL_MS;
    access.set(key, {
      token: answer.access_token,
      until: now() + Math.min(ACCESS_TTL_MS, lifetime),
    });
    return answer.access_token;
  }

  async function sendOne(
    sa: ServiceAccount,
    bearer: string,
    token: string,
    notice: SendBody,
    deadline: number,
  ): Promise<SendOutcome> {
    try {
      const res = await ctx.http.send({
        url: fcmUrl(sa.projectId),
        method: 'POST',
        headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
        body: JSON.stringify(fcmMessage(token, notice)),
        timeoutMs: timeout(deadline),
      });
      return outcomeOf(res.status, res.text);
    } catch {
      return 'failed';
    }
  }

  async function send(request: RouteRequest) {
    const deadline = now() + BUDGET_MS;
    if (!perIp.take(request.ip || '?', 1, IP_LIMIT_PER_MINUTE, now()))
      return { ...problem(429, 'rate_limited'), headers: { 'retry-after': '60' } };
    const origin = siteOriginOf(request.headers['x-cleitext-site']);
    if (!origin) return problem(400, 'invalid_request', 'x-cleitext-site: the site’s address.');
    const parsed = parseSendBody(request.body);
    if (typeof parsed === 'string') return problem(400, 'invalid_request', parsed);
    const sa = await account(request.siteId);
    if (!sa) return problem(503, 'not_configured');
    if (!perOrigin.take(origin, parsed.tokens.length, await rateLimit(request.siteId), now()))
      return { ...problem(429, 'rate_limited'), headers: { 'retry-after': '600' } };

    let bearer: string;
    try {
      bearer = await accessToken(sa, deadline);
    } catch (error) {
      ctx.log.warn(`push-relay: ${String(error)}`);
      return problem(502, 'upstream_error');
    }
    const outcomes = new Map<string, SendOutcome>();
    const queue = [...parsed.tokens];
    const worker = async () => {
      for (let token = queue.shift(); token !== undefined; token = queue.shift()) {
        // Not enough time left for another request: these stay unsent.
        if (remaining(deadline) < 1100) {
          outcomes.set(token, 'failed');
          continue;
        }
        outcomes.set(token, await sendOne(sa, bearer, token, parsed, deadline));
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
    const values = [...outcomes.values()];
    // The access token stopped working: a new one next time.
    if (values.includes('unauthorized')) access.clear();
    return {
      status: 200,
      body: {
        sent: values.filter((o) => o === 'sent').length,
        invalid: [...outcomes].filter(([, o]) => o === 'invalid').map(([t]) => t),
        failed: values.filter((o) => o === 'failed' || o === 'unauthorized').length,
      },
    };
  }

  // Called by the sites' servers: anonymous, no origin check, no session.
  ctx.routes.api({ method: 'POST', path: '/send', webhook: true, handler: send });

  async function view(siteId: string): Promise<SettingsView> {
    const sa = await account(siteId);
    return {
      configured: sa !== null,
      projectId: sa?.projectId ?? null,
      clientEmail: sa?.clientEmail ?? null,
      rateLimit: await rateLimit(siteId),
    };
  }

  ctx.routes.api({
    method: 'GET',
    path: '/settings',
    capability: CAPABILITY,
    handler: async (request) => ({ body: await view(request.siteId) }),
  });

  /** `{ serviceAccount?: string, rateLimit?: number }`: the key is stored as a secret. */
  ctx.routes.api({
    method: 'PUT',
    path: '/settings',
    capability: CAPABILITY,
    handler: async (request) => {
      const body = (request.body ?? {}) as { serviceAccount?: unknown; rateLimit?: unknown };
      if (body.rateLimit !== undefined) {
        const limit = Number(body.rateLimit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 1_000_000)
          return {
            status: 400,
            body: { detail: 'The limit must be a whole number from 1 to 1,000,000.' },
          };
        await ctx.storage.set(request.siteId, LIMIT_KEY, limit);
      }
      if (typeof body.serviceAccount === 'string' && body.serviceAccount.trim()) {
        try {
          parseServiceAccount(body.serviceAccount);
        } catch (error) {
          if (error instanceof InvalidServiceAccount)
            return { status: 400, body: { detail: error.message } };
          throw error;
        }
        await ctx.secrets.set(request.siteId, ACCOUNT_SECRET, body.serviceAccount.trim());
        access.clear();
      }
      return { body: await view(request.siteId) };
    },
  });

  ctx.routes.api({
    method: 'DELETE',
    path: '/settings/service-account',
    capability: CAPABILITY,
    handler: async (request) => {
      await ctx.secrets.delete(request.siteId, ACCOUNT_SECRET);
      accounts.delete(request.siteId);
      access.clear();
      return { body: await view(request.siteId) };
    },
  });
}

export default definePlugin({
  setup(ctx: PluginContext) {
    setupPushRelay(ctx);
  },
});
