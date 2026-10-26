/**
 * A fake plugin context: enough of the core for `setupNewLetter`, with the
 * plugin's routes, hooks, blocks and tasks kept so tests can call them, and
 * the log in memory.
 */
import type {
  PluginBlockDefinition,
  FormVerifyResult,
  PluginContext,
  RouteRequest,
  RouteResponse,
} from '@cleitext/plugin-sdk';
import type { LogEntry } from '../src/schema';
import type { LogStore, NewLogRow } from '../src/store';

type AnyBlock = PluginBlockDefinition<Record<string, unknown>, unknown>;
type Handler = (request: RouteRequest) => Promise<RouteResponse> | RouteResponse;

export function memoryStore(): LogStore & {
  rows: (LogEntry & { siteId: string; emailHash: string })[];
} {
  const rows: (LogEntry & { siteId: string; emailHash: string })[] = [];
  let n = 0;
  return {
    rows,
    async add(siteId, row: NewLogRow) {
      const id = `row-${++n}`;
      rows.unshift({
        id,
        siteId,
        createdAt: new Date().toISOString(),
        source: row.source,
        provider: row.provider,
        status: row.status,
        error: null,
        emailHint: row.emailHint,
        emailHash: row.emailHash,
        listIds: row.listIds ?? [],
        locale: row.locale,
        consent: row.consent ?? null,
        notes: row.notes ?? null,
      });
      return id;
    },
    async finish(siteId, id, patch) {
      const row = rows.find((r) => r.id === id && r.siteId === siteId);
      if (row) Object.assign(row, patch);
    },
    async latest(siteId, limit) {
      return rows.filter((r) => r.siteId === siteId).slice(0, limit);
    },
    async byEmailHash(siteId, hash) {
      return rows.filter((r) => r.siteId === siteId && r.emailHash === hash);
    },
    async eraseEmailHash(siteId, hash) {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--)
        if (rows[i]!.siteId === siteId && rows[i]!.emailHash === hash) rows.splice(i, 1);
      return before - rows.length;
    },
    async olderThan(siteId, date) {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--)
        if (rows[i]!.siteId === siteId && Date.parse(rows[i]!.createdAt) < date.getTime())
          rows.splice(i, 1);
      return before - rows.length;
    },
    async clear(siteId) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.siteId === siteId) rows.splice(i, 1);
    },
  };
}

export function fakeContext(
  options: { verify?: (input: unknown) => FormVerifyResult | null } = {},
) {
  const storage = new Map<string, unknown>();
  const secrets = new Map<string, string>();
  const publicRoutes = new Map<string, Handler>();
  const apiRoutes = new Map<string, Handler>();
  const filters = new Map<string, ((value: unknown, context: unknown) => unknown)[]>();
  const actions = new Map<string, ((payload: unknown, context: unknown) => unknown)[]>();
  const blocks: AnyBlock[] = [];
  const tasks = new Map<string, (siteId: string) => Promise<void>>();
  const exporters: { export(siteId: string, email: string): Promise<unknown> }[] = [];
  const erasers: { erase(siteId: string, email: string): Promise<unknown> }[] = [];
  const verified: unknown[] = [];
  const invalidated: string[][] = [];
  const logs: string[] = [];
  const k = (siteId: string, name: string) => `${siteId}|${name}`;

  const ctx = {
    plugin: { slug: 'newletter', version: '1.0.0' },
    log: {
      debug: () => undefined,
      info: () => undefined,
      warn: (m: string) => logs.push(m),
      error: (m: string) => logs.push(m),
    },
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
    http: { send: async () => ({ status: 500, type: '', text: '' }) },
    forms: {
      challenge: async () => '<div class="captcha"></div>',
      verify: async (input: unknown) => {
        verified.push(input);
        return options.verify?.(input) ?? { ok: true };
      },
    },
    blocks: { register: (b: unknown) => void blocks.push(b as AnyBlock) },
    assets: { enqueue: () => undefined },
    hooks: {
      filter: (name: string, fn: (value: unknown, context: unknown) => unknown) =>
        void filters.set(name, [...(filters.get(name) ?? []), fn]),
      on: (name: string, fn: (payload: unknown, context: unknown) => unknown) =>
        void actions.set(name, [...(actions.get(name) ?? []), fn]),
    },
    routes: {
      public: (r: { method: string; path: string; handler: Handler }) =>
        void publicRoutes.set(`${r.method} ${r.path}`, r.handler),
      api: (r: { method: string; path: string; handler: Handler }) =>
        void apiRoutes.set(`${r.method} ${r.path}`, r.handler),
    },
    site: async () => ({ name: 'Site', defaultLocale: 'en', locales: ['en', 'it'] }),
    schedule: {
      every: (name: string, _m: number, fn: (siteId: string) => Promise<void>) =>
        void tasks.set(name, fn),
    },
    privacy: {
      registerExporter: (e: (typeof exporters)[number]) => void exporters.push(e),
      registerEraser: (e: (typeof erasers)[number]) => void erasers.push(e),
    },
    cache: { invalidate: async (_siteId: string, tags: string[]) => void invalidated.push(tags) },
    ai: { addContext: () => undefined },
  } as unknown as PluginContext;

  const request = (input: Partial<RouteRequest> & { body?: unknown }): RouteRequest =>
    ({
      siteId: 'site-1',
      method: 'POST',
      path: '/',
      params: {},
      query: {},
      body: {},
      rawBody: null,
      ip: '198.51.100.1',
      user: null,
      headers: { host: 'example.com', referer: 'https://example.com/news' },
      cookies: {},
      locale: 'en',
      origin: 'https://example.com',
      ...input,
    }) as RouteRequest;

  return {
    ctx,
    storage,
    secrets,
    blocks,
    tasks,
    exporters,
    erasers,
    verified,
    invalidated,
    logs,
    request,
    async api(method: string, path: string, body?: unknown, query: Record<string, string> = {}) {
      const handler = apiRoutes.get(`${method} ${path}`);
      if (!handler) throw new Error(`No route ${method} ${path}`);
      return handler(
        request({ method, path, body: body ?? {}, query, user: { id: 'u' } as never }),
      );
    },
    async post(path: string, body: Record<string, unknown>, extra: Partial<RouteRequest> = {}) {
      const handler = publicRoutes.get(`POST ${path}`);
      if (!handler) throw new Error(`No route POST ${path}`);
      return handler(request({ path, body, ...extra }));
    },
    async filter(name: string, value: unknown, context: unknown) {
      let out = value;
      for (const fn of filters.get(name) ?? []) out = await fn(out, context);
      return out;
    },
    async emit(name: string, payload: unknown, context: unknown) {
      for (const fn of actions.get(name) ?? []) await fn(payload, context);
    },
  };
}
