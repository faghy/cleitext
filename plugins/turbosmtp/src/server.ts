/**
 * turboSMTP (official plugin): every email of the site goes through the
 * turboSMTP service, by its sending API or by its SMTP servers, through the
 * core's `mail.deliver` filter (plugin API 1.60). When turboSMTP fails, the
 * core sends the email the usual way, so the site never stops sending. The
 * admin connects the account (API keys, or email and password that make
 * new keys and are not kept), sets the sender, sends a test and reads the
 * statistics of turboSMTP.
 */
import { definePlugin, type PluginContext, type RouteRequest } from '@cleitext/plugin-sdk';
import {
  account,
  analytics,
  checkLogin,
  cleanKeys,
  keysFromLogin,
  send,
  sendPayload,
  TurboError,
  type Http,
  type Keys,
} from './api';
import { CAPABILITY, NAME, TEST_ENDPOINT_ENV } from './config';
import {
  chosenSender,
  decodeAggs,
  isEmail,
  isoDay,
  line,
  messageRow,
  normalizeSettings,
  statusesOf,
  type Settings,
} from './model';

const SETTINGS_KEY = 'settings';
const LAST_ERROR_KEY = 'last-error';
const KEY_SECRET = 'consumer-key';
const SECRET_SECRET = 'consumer-secret';
const SMTP_PASSWORD_SECRET = 'smtp-password';

/** Messages per page of the statistics. */
const PAGE_SIZE = 20;

const body = (request: RouteRequest) =>
  (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;

/** The test endpoint, only on this machine (http on 127.0.0.1 or localhost). */
export function testEndpoint(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** An `Http` over the core's `ctx.http`, or straight to the test endpoint. */
function siteHttp(ctx: PluginContext, testBase: string | null): Http {
  if (testBase)
    return async (request) => {
      const url = new URL(request.url);
      const res = await fetch(`${testBase}/${url.host}${url.pathname}${url.search}`, {
        method: request.method,
        headers: request.headers,
        ...(request.body !== undefined ? { body: request.body } : {}),
        signal: AbortSignal.timeout(10_000),
      });
      return { status: res.status, text: await res.text() };
    };
  return async (request) => {
    const res = await ctx.http.send({ ...request, timeoutMs: 30_000 });
    return { status: res.status, text: res.text };
  };
}

export interface SetupOptions {
  /** Requests to turboSMTP (the core's client, or the test endpoint, by default). */
  http?: Http;
}

/** Everything the plugin declares; exported for the tests, which give a fake context. */
export function setupTurboSmtp(ctx: PluginContext, options: SetupOptions = {}): void {
  const http = options.http ?? siteHttp(ctx, testEndpoint(process.env[TEST_ENDPOINT_ENV]));

  ctx.access.defineCapability(CAPABILITY, {
    label: { en: `Manage the site's emails (${NAME})`, it: `Gestire le email del sito (${NAME})` },
    roles: ['administrator'],
  });

  const settingsOf = async (siteId: string): Promise<Settings> =>
    normalizeSettings(await ctx.storage.get(siteId, SETTINGS_KEY));

  async function keysOf(siteId: string): Promise<Keys | null> {
    const [consumerKey, consumerSecret] = await Promise.all([
      ctx.secrets.get(siteId, KEY_SECRET),
      ctx.secrets.get(siteId, SECRET_SECRET),
    ]);
    return consumerKey && consumerSecret ? { consumerKey, consumerSecret } : null;
  }

  /** Whether the emails go through turboSMTP now. */
  async function ready(siteId: string, settings: Settings): Promise<boolean> {
    if (!settings.enabled) return false;
    if (settings.mode === 'smtp')
      return Boolean(settings.smtpUser && (await ctx.secrets.get(siteId, SMTP_PASSWORD_SECRET)));
    return Boolean(await keysOf(siteId));
  }

  // ---- Sending -----------------------------------------------------------------------

  /** Sites whose last delivery failed (so a success clears the saved error once). */
  const failing = new Set<string>();

  ctx.hooks.filter('mail.deliver', async (result, { siteId, message }) => {
    // Another plugin took it already.
    if (result) return result;
    const settings = await settingsOf(siteId);
    if (!(await ready(siteId, settings))) return null;
    // A sender chosen for this email (e.g. by a form) stays.
    const from = message.fromChosen
      ? message.from
      : (chosenSender(settings, message.from) ?? message.from);
    if (settings.mode === 'smtp') {
      const password = await ctx.secrets.get(siteId, SMTP_PASSWORD_SECRET);
      return {
        smtp: {
          host: settings.host,
          port: settings.port,
          security: settings.security,
          user: settings.smtpUser,
          password: password ?? '',
        },
        from,
      };
    }
    try {
      await send(http, (await keysOf(siteId))!, sendPayload(message, from));
    } catch (error) {
      // Kept for the admin; the core sends the email the usual way.
      failing.add(siteId);
      await ctx.storage.set(siteId, LAST_ERROR_KEY, {
        at: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    if (failing.delete(siteId)) await ctx.storage.delete(siteId, LAST_ERROR_KEY);
    return { delivered: true, from };
  });

  // ---- Admin API ---------------------------------------------------------------------

  const adminRoute = (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    handler: Parameters<typeof ctx.routes.api>[0]['handler'],
  ) =>
    ctx.routes.api({
      method,
      path,
      capability: CAPABILITY,
      async handler(request) {
        try {
          return await handler(request);
        } catch (error) {
          if (error instanceof TurboError) {
            const status = error.code === 'network' || error.code === 'service' ? 502 : 400;
            return problem(status, error.code, error.message);
          }
          throw error;
        }
      },
    });

  /** An error as the admin reads it: problem details (`title`, `detail`) with the code. */
  const problem = (status: number, code: string, message: string) => ({
    status,
    body: { type: 'about:blank', title: message, detail: message, status, code, message },
  });

  /** The settings as the admin sees them: never a key or a password, only whether there is one. */
  async function adminView(siteId: string) {
    const settings = await settingsOf(siteId);
    return {
      settings,
      connected: Boolean(await keysOf(siteId)),
      hasSmtpPassword: Boolean(await ctx.secrets.get(siteId, SMTP_PASSWORD_SECRET)),
      sending: await ready(siteId, settings),
      lastError: await ctx.storage.get(siteId, LAST_ERROR_KEY),
    };
  }

  adminRoute('GET', '/settings', async (request) => ({ body: await adminView(request.siteId) }));

  adminRoute('PUT', '/settings', async (request) => {
    const current = await settingsOf(request.siteId);
    const input = body(request);
    // The account changes through /connection only.
    const merged: Record<string, unknown> = { ...current, ...input, account: current.account };
    // A new port without a security of its own takes the one it uses.
    if ('port' in input && !('security' in input)) delete merged.security;
    const next = normalizeSettings(merged);
    const fromEmail = line(input.fromEmail, 254);
    if (fromEmail && !next.fromEmail) return problem(400, 'input', 'Enter a valid sender address.');
    const password = typeof input.smtpPassword === 'string' ? input.smtpPassword : '';
    if (next.mode === 'smtp') {
      if (!next.smtpUser) return problem(400, 'input', 'Enter the SMTP user.');
      const saved = await ctx.secrets.get(request.siteId, SMTP_PASSWORD_SECRET);
      const changed = password || next.smtpUser !== current.smtpUser;
      if (!password && !saved) return problem(400, 'input', 'Enter the SMTP password.');
      // As turboSMTP's own plugin does: a sign-in that does not work is not saved.
      if (changed) await checkLogin(http, next.smtpUser, password || saved!);
    }
    if (password) await ctx.secrets.set(request.siteId, SMTP_PASSWORD_SECRET, password);
    await ctx.storage.set(request.siteId, SETTINGS_KEY, next);
    return { body: await adminView(request.siteId) };
  });

  adminRoute('PUT', '/connection', async (request) => {
    const input = body(request);
    const current = await settingsOf(request.siteId);
    let keys: Keys;
    let smtpUser = current.smtpUser;
    if (typeof input.email === 'string' || typeof input.password === 'string') {
      // Email and password make new keys, as in WordPress; the password is not kept.
      const email = line(input.email, 254);
      const site = await ctx.site(request.siteId);
      keys = await keysFromLogin(http, {
        email,
        password: typeof input.password === 'string' ? input.password : '',
        label: `${site.name || 'Site'} (Cleitext)`,
      });
      smtpUser ||= email;
    } else {
      keys = cleanKeys(input);
    }
    const name = await account(http, keys);
    await ctx.secrets.set(request.siteId, KEY_SECRET, keys.consumerKey);
    await ctx.secrets.set(request.siteId, SECRET_SECRET, keys.consumerSecret);
    await ctx.storage.set(request.siteId, SETTINGS_KEY, {
      ...current,
      account: name,
      smtpUser,
      enabled: true,
    });
    await ctx.storage.delete(request.siteId, LAST_ERROR_KEY);
    return { body: await adminView(request.siteId) };
  });

  adminRoute('DELETE', '/connection', async (request) => {
    for (const name of [KEY_SECRET, SECRET_SECRET, SMTP_PASSWORD_SECRET])
      await ctx.secrets.delete(request.siteId, name);
    const current = await settingsOf(request.siteId);
    await ctx.storage.set(request.siteId, SETTINGS_KEY, { ...current, account: '' });
    await ctx.storage.delete(request.siteId, LAST_ERROR_KEY);
    return { body: await adminView(request.siteId) };
  });

  adminRoute('POST', '/test', async (request) => {
    const to = line(body(request).to, 254).toLowerCase();
    if (!isEmail(to)) return problem(400, 'input', 'Enter the address to send the test to.');
    const settings = await settingsOf(request.siteId);
    if (!(await ready(request.siteId, settings)))
      return problem(400, 'input', 'Connect turboSMTP and turn the sending on first.');
    const it = (await ctx.site(request.siteId)).defaultLocale.startsWith('it');
    const subject = it ? `Email di prova da ${NAME}` : `Test email from ${NAME}`;
    const text = it
      ? `Questa email è arrivata tramite ${NAME}: le email del sito partono correttamente.`
      : `This email came through ${NAME}: the site's emails are being sent correctly.`;
    const html = `<p style="font-family:sans-serif">${text}</p>`;
    // Through the site's mail, as every email: a failure of turboSMTP's API
    // is saved by the filter, and read back here (the core then sent it the
    // usual way).
    await ctx.storage.delete(request.siteId, LAST_ERROR_KEY);
    await ctx.mail.send({ siteId: request.siteId, to, subject, text, html });
    const failed = (await ctx.storage.get(request.siteId, LAST_ERROR_KEY)) as {
      message?: string;
    } | null;
    if (failed)
      return problem(502, 'service', failed.message || 'turboSMTP did not take the email.');
    return { body: { ok: true } };
  });

  /** The period asked, the last 30 days by default. */
  function period(request: RouteRequest) {
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const from = isoDay(request.query.from) ?? monthAgo;
    const to = isoDay(request.query.to) ?? today;
    return from <= to ? { from, to } : { from: to, to: from };
  }

  async function connectedKeys(siteId: string): Promise<Keys> {
    const keys = await keysOf(siteId);
    if (!keys) throw new TurboError('input', 'Connect turboSMTP first.');
    return keys;
  }

  adminRoute('GET', '/stats', async (request) => {
    const keys = await connectedKeys(request.siteId);
    const tz = (await ctx.site(request.siteId)).timezone ?? 'UTC';
    const { from, to } = period(request);
    const answer = await analytics(http, keys, { from, to, tz, limit: 1 });
    return { body: { from, to, count: answer.count, series: decodeAggs(answer.aggs) } };
  });

  adminRoute('GET', '/messages', async (request) => {
    const keys = await connectedKeys(request.siteId);
    const tz = (await ctx.site(request.siteId)).timezone ?? 'UTC';
    const { from, to } = period(request);
    const page = Math.max(1, Math.min(1000, Number(request.query.page) || 1));
    const answer = await analytics(http, keys, {
      from,
      to,
      tz,
      page,
      limit: PAGE_SIZE,
      status: statusesOf(request.query.group),
    });
    return {
      body: {
        count: answer.count,
        page,
        pages: Math.max(1, Math.ceil(answer.count / PAGE_SIZE)),
        rows: answer.results.map(messageRow),
      },
    };
  });
}

export default definePlugin({
  setup(ctx: PluginContext) {
    setupTurboSmtp(ctx);
  },
});
