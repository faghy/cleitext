/**
 * A fake core for `setupTurboSmtp`: storage, secrets, the plugin's admin
 * routes, its `mail.deliver` filter (which `ctx.mail.send` runs, as the
 * core does) and a fake turboSMTP that records every request.
 */
import type {
  MailDeliverResult,
  OutgoingMail,
  PluginContext,
  RouteRequest,
  RouteResponse,
} from '@cleitext/plugin-sdk';
import type { Http, HttpRequest } from '../src/api';

type Handler = (request: RouteRequest) => Promise<RouteResponse> | RouteResponse;
type Deliver = (
  result: MailDeliverResult | null,
  context: { siteId: string; message: OutgoingMail },
) => unknown;

export interface FakeTurbo {
  http: Http;
  requests: (HttpRequest & { json: Record<string, unknown> })[];
  /** Answers by `METHOD path` (path without the query); 200 `{}` otherwise. */
  answers: Map<string, { status: number; body: unknown }>;
  /** Throws on every request, as a network failure. */
  down: boolean;
}

export function fakeTurbo(): FakeTurbo {
  const turbo: FakeTurbo = {
    requests: [],
    answers: new Map(),
    down: false,
    http: async (request) => {
      turbo.requests.push({ ...request, json: request.body ? JSON.parse(request.body) : {} });
      if (turbo.down) throw new Error('connection refused');
      const url = new URL(request.url);
      const answer = turbo.answers.get(`${request.method} ${url.host}${url.pathname}`);
      return answer
        ? { status: answer.status, text: JSON.stringify(answer.body) }
        : { status: 200, text: '{}' };
    },
  };
  return turbo;
}

export function fakeContext() {
  const storage = new Map<string, unknown>();
  const secrets = new Map<string, string>();
  const routes = new Map<string, Handler>();
  let deliver: Deliver | null = null;
  /** What the "core" did with each email: the plugin's result, or the usual way. */
  const sent: { message: OutgoingMail; result: MailDeliverResult | null }[] = [];
  const k = (siteId: string, name: string) => `${siteId}|${name}`;

  const ctx = {
    plugin: { slug: 'turbosmtp', version: '1.0.0' },
    log: { debug() {}, info() {}, warn() {}, error() {} },
    access: { defineCapability: () => undefined },
    storage: {
      get: async (siteId: string, name: string) => storage.get(k(siteId, name)) ?? null,
      set: async (siteId: string, name: string, value: unknown) =>
        void storage.set(k(siteId, name), structuredClone(value)),
      delete: async (siteId: string, name: string) => void storage.delete(k(siteId, name)),
    },
    secrets: {
      get: async (siteId: string, name: string) => secrets.get(k(siteId, name)) ?? null,
      set: async (siteId: string, name: string, value: string) =>
        void secrets.set(k(siteId, name), value),
      delete: async (siteId: string, name: string) => void secrets.delete(k(siteId, name)),
    },
    hooks: {
      filter: (name: string, fn: Deliver) => {
        if (name === 'mail.deliver') deliver = fn;
      },
      on: () => undefined,
    },
    routes: {
      api: (r: { method: string; path: string; handler: Handler }) =>
        void routes.set(`${r.method} ${r.path}`, r.handler),
    },
    site: async (id: string) => ({
      id,
      name: 'Hotel Aurora',
      defaultLocale: 'it',
      locales: ['it'],
      timezone: 'Europe/Rome',
    }),
    mail: {
      send: async (m: {
        siteId: string;
        to: string;
        subject: string;
        text: string;
        html?: string;
      }) =>
        void (await mailDeliver(m.siteId, {
          from: '"Hotel Aurora" <no-reply@aurora.test>',
          fromChosen: false,
          to: [m.to],
          cc: [],
          bcc: [],
          subject: m.subject,
          text: m.text,
          ...(m.html ? { html: m.html } : {}),
          attachments: [],
        })),
    },
  } as unknown as PluginContext;

  /** The core's side of `mail.deliver`: a filter that throws means "the usual way". */
  async function mailDeliver(siteId: string, message: OutgoingMail) {
    let result: MailDeliverResult | null;
    try {
      result = ((await deliver?.(null, { siteId, message })) ?? null) as MailDeliverResult | null;
    } catch {
      result = null;
    }
    sent.push({ message, result });
    return result;
  }

  async function call(method: string, path: string, input: Partial<RouteRequest> = {}) {
    const handler = routes.get(`${method} ${path}`);
    if (!handler) throw new Error(`no route ${method} ${path}`);
    return handler({
      siteId: 'site-1',
      query: {},
      queryAll: {},
      body: undefined,
      user: { id: 'u1', displayName: 'Admin', capabilities: ['manage_turbosmtp'] },
      ...input,
    } as RouteRequest);
  }

  /** The plugin's filter itself, e.g. with another plugin's result. */
  const filter = () => deliver!;

  return { ctx, storage, secrets, sent, call, mailDeliver, filter };
}
