// @vitest-environment node
import type { PluginContext } from '@cleitext/plugin-sdk';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeService } from '../src/model/normalize';
import { stringsFor } from '../src/model/strings';
import type { Appointment } from '../src/model/types';
import { BookingWidget, type BlockView } from '../src/render';
import type * as StoreModule from '../src/store';

const SERVICE_ID = '00000000-0000-4000-8000-000000000001';
const service = normalizeService({ name: 'Visita', duration: 30 }, SERVICE_ID);

// The database is not needed: the booking is stored by a fake store.
vi.mock('../src/store', async (original) => {
  const real = await original<typeof StoreModule>();
  return {
    ...real,
    databaseStore: () => ({
      getService: async (_siteId: string, id: string) => (id === SERVICE_ID ? service : null),
      countForLimit: async () => 0,
      book: async (_siteId: string, input: { start: number; email: string; name: string }) => ({
        appointment: {
          id: '00000000-0000-4000-8000-0000000000aa',
          serviceId: SERVICE_ID,
          start: new Date(input.start).toISOString(),
          end: new Date(input.start + 30 * 60_000).toISOString(),
          status: 'confirmed',
          sequence: 1,
          name: input.name,
          email: input.email,
          locale: 'it',
          fields: [],
        } as unknown as Appointment,
        used: 1,
      }),
    }),
  };
});

const KEY = Symbol.for('cleitext.newsletter.optIn');
const holder = globalThis as unknown as Record<symbol, unknown>;
afterEach(() => {
  delete holder[KEY];
});

function registry(box: { name: string; label: string } | null) {
  const subscribed: Record<string, unknown>[] = [];
  holder[KEY] = {
    version: 1,
    checkbox: async () => box,
    subscribe: async (input: Record<string, unknown>) => void subscribed.push(input),
  };
  return subscribed;
}

type Handler = (request: unknown) => Promise<{ status?: number; body?: unknown }>;

/** The plugin against a fake context, with its booking route. */
async function setUp(verdict: Record<string, unknown> = { ok: true }) {
  const routes = new Map<string, Handler>();
  const storage = new Map<string, unknown>();
  const ctx = {
    plugin: { slug: 'agenda', version: 'test' },
    access: { defineCapability: () => undefined },
    storage: {
      get: async (_s: string, key: string) => storage.get(key) ?? null,
      set: async (_s: string, key: string, value: unknown) => void storage.set(key, value),
      delete: async (_s: string, key: string) => void storage.delete(key),
    },
    secrets: { get: async () => 'k'.repeat(64), set: async () => undefined },
    site: async () => ({ name: 'Studio', defaultLocale: 'it', locales: ['it'], timezone: 'UTC' }),
    blocks: { register: () => undefined },
    assets: { enqueue: () => undefined },
    hooks: { on: () => undefined, filter: () => undefined, emit: async () => undefined },
    routes: {
      api: (r: { method: string; path: string; handler: Handler }) =>
        routes.set(`${r.method} ${r.path}`, r.handler),
      public: (r: { method: string; path: string; handler: Handler }) =>
        routes.set(`${r.method} ${r.path}`, r.handler),
    },
    schedule: { every: () => undefined },
    privacy: { registerExporter: () => undefined, registerEraser: () => undefined },
    forms: { challenge: async () => '', verify: async () => verdict },
    cache: { invalidate: async () => undefined },
    mail: { send: async () => undefined },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  } as unknown as PluginContext;
  const plugin = (await import('../src/server')).default;
  plugin.setup(ctx);
  return routes.get('POST /public/book')!;
}

let ip = 0;
const book = (handler: Handler, extra: Record<string, unknown> = {}) =>
  handler({
    siteId: 's',
    locale: 'it',
    origin: 'https://studio.test',
    ip: `10.1.0.${++ip}`,
    user: null,
    headers: { host: 'studio.test' },
    body: {
      service: SERVICE_ID,
      start: new Date(Date.now() + 7 * 86400_000).toISOString(),
      name: 'Ada',
      email: 'ada@example.test',
      consent: true,
      locale: 'it',
      ...extra,
    },
  });

// The first test loads the whole plugin server, slow on a busy CI runner.
describe('the newsletter opt-in', { timeout: 30_000 }, () => {
  const view = (newsletter?: { name: string; label: string } | null): BlockView => ({
    uid: 'ag-test',
    preview: false,
    heading: '',
    limitReached: false,
    challenge: '',
    newsletter,
    services: [service],
    settings: { phone: 'optional', privacyUrl: '', contact: '' },
    config: {
      api: '/api',
      manage: '/m',
      locale: 'it',
      timeZone: 'Europe/Rome',
      view: 'month',
      fixed: null,
      services: [],
      strings: stringsFor('it'),
    },
  });

  it('draws an unchecked box after the consent, only when offered', () => {
    expect(renderToStaticMarkup(<BookingWidget view={view()} />)).not.toContain('cx_newsletter');
    expect(renderToStaticMarkup(<BookingWidget view={view(null)} />)).not.toContain(
      'cx_newsletter',
    );
    const html = renderToStaticMarkup(
      <BookingWidget view={view({ name: 'cx_newsletter', label: 'Iscrivimi alla newsletter' })} />,
    );
    expect(html).toContain(
      '<label class="ag-check ag-newsletter" for="ag-test-newsletter"><input id="ag-test-newsletter" type="checkbox" name="cx_newsletter" value="1"/><span>Iscrivimi alla newsletter</span></label>',
    );
    expect(html.indexOf('name="consent"')).toBeLessThan(html.indexOf('name="cx_newsletter"'));
  });

  it('subscribes after a booking only when the box was ticked', async () => {
    const subscribed = registry({ name: 'cx_newsletter', label: 'Iscrivimi' });
    const handler = await setUp();
    expect((await book(handler)).status).toBe(201);
    expect(subscribed).toEqual([]);
    expect((await book(handler, { cx_newsletter: '1' })).status).toBe(201);
    expect(subscribed).toEqual([
      {
        siteId: 's',
        source: 'agenda',
        email: 'ada@example.test',
        name: 'Ada',
        locale: 'it',
        ip: expect.stringMatching(/^10\.1\.0\.\d+$/),
      },
    ]);
  });

  it('does not subscribe a refused or invalid booking', async () => {
    const subscribed = registry({ name: 'cx_newsletter', label: 'Iscrivimi' });
    const silent = await setUp({ ok: false, silent: true });
    expect((await book(silent, { cx_newsletter: '1' })).status).toBe(201);
    const refused = await setUp({ ok: false, message: 'No' });
    expect((await book(refused, { cx_newsletter: '1' })).status).toBe(403);
    const handler = await setUp();
    expect((await book(handler, { cx_newsletter: '1', consent: false })).status).toBe(400);
    expect(subscribed).toEqual([]);
  });
});
