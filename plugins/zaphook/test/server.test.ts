import { createHmac } from 'node:crypto';
import type { PluginContext } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import type { DeliveredMessage } from '../src/model';
import { setupZaphook } from '../src/server';

type Handler = (request: Record<string, unknown>) => Promise<{ status?: number; body?: unknown }>;

/** Zaphook against a fake context: no database, the network answers `answer`. */
function setUp(answer: { status: number } | Error = { status: 200 }) {
  const storage = new Map<string, unknown>();
  const secrets = new Map<string, string>();
  const services = new Map<string, Record<string, (...args: never[]) => unknown>>();
  const routes = new Map<string, Handler>();
  const inserted: Record<string, unknown>[] = [];
  const requests: { url: string; headers: Record<string, string>; body: string }[] = [];
  const logs: string[] = [];
  const log = (message: string, data?: unknown) =>
    void logs.push(`${message} ${JSON.stringify(data ?? {})}`);
  const ctx = {
    access: { defineCapability: () => undefined },
    storage: {
      get: async (_s: string, key: string) => storage.get(key) ?? null,
      set: async (_s: string, key: string, value: unknown) => void storage.set(key, value),
      delete: async (_s: string, key: string) => void storage.delete(key),
    },
    secrets: {
      get: async (_s: string, key: string) => secrets.get(key) ?? null,
      set: async (_s: string, key: string, value: string) => void secrets.set(key, value),
      delete: async (_s: string, key: string) => void secrets.delete(key),
    },
    services: {
      provide: (name: string, fns: Record<string, (...args: never[]) => unknown>) =>
        void services.set(name, fns),
      use: async (_s: string, name: string) =>
        name === 'forms' ? { formNames: async () => ['Richiesta informazioni'] } : null,
    },
    db: {
      transaction: async (_s: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          insert: () => ({
            values: async (rows: Record<string, unknown>[]) => void inserted.push(...rows),
          }),
          // The log (empty here).
          select: () => ({
            from: () => ({ orderBy: () => ({ limit: async () => [] }) }),
          }),
        }),
    },
    http: {
      send: async (request: { url: string; headers: Record<string, string>; body: string }) => {
        requests.push(request);
        if (answer instanceof Error) throw answer;
        return { status: answer.status, type: 'text/plain', text: '' };
      },
    },
    schedule: { every: () => undefined },
    privacy: { registerExporter: () => undefined, registerEraser: () => undefined },
    routes: {
      api: (route: { method: string; path: string; handler: Handler }) =>
        void routes.set(`${route.method} ${route.path}`, route.handler),
    },
    log: { warn: log, error: log, info: log },
  } as unknown as PluginContext;
  setupZaphook(ctx);
  const call = (key: string, body: unknown = {}, params: Record<string, string> = {}) =>
    routes.get(key)!({
      siteId: 's',
      body,
      params,
      origin: 'https://example.it',
      locale: 'it',
      user: { id: 'u' },
    });
  const delivered = (message: DeliveredMessage) =>
    (
      services.get('forms.delivered')!.delivered as unknown as (
        s: string,
        m: DeliveredMessage,
      ) => Promise<{ skipMail: boolean }>
    )('s', message);
  return { call, delivered, inserted, requests, secrets, storage, logs };
}

const MESSAGE: DeliveredMessage = {
  messageId: 'm-1',
  form: 'Richiesta informazioni',
  fields: {
    nome: 'Mario Rossi',
    telefono: '+39 333 1234567',
    email: 'Mario@Example.com',
    comune: 'Varazze',
    richiesta: 'Vorrei un preventivo.',
  },
  page: { path: '/contatti', url: 'https://example.it/contatti' },
  locale: 'it',
  submittedAt: '2026-11-18T09:30:00.000Z',
  ip: '198.51.100.4',
};

describe('Zaphook', () => {
  it('queues a message for each matching webhook, and keeps the email when asked', async () => {
    const z = setUp();
    expect(await z.delivered(MESSAGE)).toEqual({ skipMail: false });
    expect(z.inserted).toHaveLength(0);

    const all = await z.call('POST /webhooks', {
      url: 'https://hooks.zapier.com/hooks/catch/1/a/',
    });
    expect(all.status ?? 200).toBe(200);
    await z.call('POST /webhooks', {
      url: 'https://hook.eu1.make.com/b',
      scope: 'selected',
      forms: ['Newsletter'],
      skipMail: true,
    });
    expect(await z.delivered(MESSAGE)).toEqual({ skipMail: false });
    expect(z.inserted).toHaveLength(1);
    expect(z.inserted[0]).toMatchObject({
      formName: 'Richiesta informazioni',
      status: 'queued',
      fieldNames: ['nome', 'telefono', 'email', 'comune', 'richiesta'],
      email: 'mario@example.com',
      payload: { nome: 'Mario Rossi', _form: 'Richiesta informazioni', _message_id: 'm-1' },
    });
    expect(z.inserted[0]!.payload).not.toHaveProperty('_ip');
    // No network while the visitor waits.
    expect(z.requests).toHaveLength(0);

    // The second webhook gets the newsletter form, and keeps its email back.
    expect(await z.delivered({ ...MESSAGE, form: 'Newsletter' })).toEqual({ skipMail: true });
    expect(z.inserted).toHaveLength(3);
  });

  it('refuses addresses that are not https, and never gives the secret back', async () => {
    const z = setUp();
    const refused = await z.call('POST /webhooks', { url: 'http://hooks.zapier.com/x' });
    expect(refused.status).toBe(400);
    const saved = await z.call('POST /webhooks', {
      url: 'https://hooks.zapier.com/hooks/catch/1/a/',
      secret: 'a-long-secret',
    });
    const view = saved.body as { webhooks: { id: string; hasSecret: boolean }[] };
    expect(view.webhooks[0]!.hasSecret).toBe(true);
    expect(JSON.stringify(saved.body)).not.toContain('a-long-secret');
    expect(JSON.stringify([...z.storage.values()])).not.toContain('a-long-secret');
    expect([...z.secrets.values()]).toEqual(['a-long-secret']);
    expect((await z.call('GET /state')).body).toMatchObject({
      formsActive: true,
      formNames: ['Richiesta informazioni'],
    });
  });

  it('sends a signed test now and tells the answer', async () => {
    const z = setUp({ status: 200 });
    const saved = await z.call('POST /webhooks', {
      url: 'https://hooks.zapier.com/hooks/catch/1/a/',
      secret: 'a-long-secret',
      includeIp: true,
    });
    const id = (saved.body as { webhooks: { id: string }[] }).webhooks[0]!.id;
    const result = await z.call('POST /webhooks/:id/test', { locale: 'it' }, { id });
    expect(result.body).toEqual({ ok: true, httpStatus: 200, error: null });
    const request = z.requests[0]!;
    const body = JSON.parse(request.body) as Record<string, unknown>;
    expect(body).toMatchObject({ _test: true, _form: 'Prova', _ip: '203.0.113.7' });
    expect(request.headers['Content-Type']).toBe('application/json');
    const timestamp = request.headers['X-Zaphook-Timestamp']!;
    expect(request.headers['X-Zaphook-Signature']).toBe(
      `sha256=${createHmac('sha256', 'a-long-secret').update(`${timestamp}.${request.body}`).digest('hex')}`,
    );
  });

  it('reports a test that did not get through, without the address or the secret', async () => {
    const z = setUp(new Error('connect ETIMEDOUT https://hooks.zapier.com/hooks/catch/1/a/'));
    const saved = await z.call('POST /webhooks', {
      url: 'https://hooks.zapier.com/hooks/catch/1/a/',
      secret: 'a-long-secret',
    });
    const id = (saved.body as { webhooks: { id: string }[] }).webhooks[0]!.id;
    const result = (await z.call('POST /webhooks/:id/test', {}, { id })).body as {
      ok: boolean;
      error: string;
    };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ETIMEDOUT');
    expect(result.error).not.toContain('zapier');
    expect(z.logs.join('\n')).not.toContain('a-long-secret');

    const gone = setUp({ status: 410 });
    const hook = await gone.call('POST /webhooks', { url: 'https://n8n.example.com/w' });
    const goneId = (hook.body as { webhooks: { id: string }[] }).webhooks[0]!.id;
    expect((await gone.call('POST /webhooks/:id/test', {}, { id: goneId })).body).toEqual({
      ok: false,
      httpStatus: 410,
      error: 'HTTP 410',
    });
  });
});
