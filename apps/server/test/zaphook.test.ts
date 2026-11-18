/**
 * The official Zaphook plugin with Forms (`forms.delivered`, Forms 1.9.0): a
 * message sent with a form is queued while the visitor waits, then sent by
 * the scheduled task to the webhook as JSON with the fields at the root,
 * signed; answers that mean "later" are tried again, the others end it; the
 * log keeps no values and no secret; privacy requests find what is queued.
 * No network: `ctx.http` answers as the receiving service.
 */
import { createHmac } from 'node:crypto';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import { withSiteContext } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
import { PluginServicesProvider } from '../src/plugins/plugin-services.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const ext = (path: string) => `/api/v1/ext/zaphook${path}`;
const HOOK_URL = 'https://hooks.zapier.com/hooks/catch/123/abcdef/';
const SECRET = 'zaphook-test-secret-0123';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let pageSlug: string;
let spec: string;

interface Call {
  url: string;
  headers: Record<string, string>;
  body: string;
}
const calls: Call[] = [];
/** What the receiving service answers next (then 200). */
const answers: (number | 'down')[] = [];

async function install(slug: string, pluginsPath: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

let clock = Date.now();
/** The scheduled task, with every queued delivery due. */
async function deliverNow() {
  await withSiteContext(owner.db, site.id, (tx) =>
    tx.execute(
      sql`update plg_zaphook.deliveries set next_at = now() - interval '1 second' where status in ('queued', 'retrying')`,
    ),
  );
  clock += 2 * 60_000;
  await app.get(PluginHost).runSchedules(clock);
}

/** The form of the first real case: the names the existing Zap expects. */
const REQUEST = {
  nome: 'Mario Rossi',
  telefono: '+39 333 1234567',
  email: 'Mario.Rossi@Example.com',
  comune: 'Varazze',
  richiesta: 'Vorrei un preventivo per il giardino.',
};

const submit = (fields: Record<string, string>, ip = '10.81.0.9') =>
  app.inject({
    method: 'POST',
    url: '/_forms/submit',
    headers: {
      host: site.host,
      origin: `http://${site.host}`,
      referer: `http://${site.host}/${pageSlug}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'TestBrowser/1.0',
    },
    remoteAddress: ip,
    payload: new URLSearchParams({ _block: 'req1', _spec: spec, ...fields }).toString(),
  });

const log = async () =>
  (await admin.get(ext('/state'))).json().log as {
    id: string;
    status: string;
    httpStatus: number | null;
    attempts: number;
    fields: string[];
    error: string | null;
    canRetry: boolean;
  }[];

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  for (const slug of ['forms', 'zaphook', 'privacy']) await install(slug, pluginsPath);
  app = await startTestApp({ pluginsPath });
  vi.spyOn(app.get(PluginServicesProvider), 'httpSend').mockImplementation(
    async (_plugin, request) => {
      calls.push({
        url: request.url,
        headers: Object.fromEntries(
          Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
        ),
        body: request.body ?? '',
      });
      const answer = answers.shift() ?? 200;
      if (answer === 'down') throw new Error(`connect ECONNREFUSED ${request.url}`);
      return { status: answer, type: 'application/json', text: '{"status":"success"}' };
    },
  );
  site = await seedSite(owner, 'zaphook');
  await seedUser(owner, {
    email: 'admin@zaphook.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.81.0.1');
  await admin.login('admin@zaphook.test', PASSWORD);
  // Zaphook requires Forms: activated first.
  expect((await admin.post('/api/v1/plugins/zaphook/activate')).statusCode).toBeGreaterThan(299);
  for (const slug of ['forms', 'zaphook', 'privacy']) {
    const activated = await admin.post(`/api/v1/plugins/${slug}/activate`);
    expect(activated.statusCode, activated.body).toBe(200);
  }
  const created = (
    await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Contatti',
      document: {
        schema: 1,
        blocks: [
          {
            id: 'req1',
            type: 'forms/contact',
            v: 1,
            attrs: {
              formName: 'Richiesta informazioni',
              buttonLabel: 'Invia',
              successMessage: 'Grazie!',
              fields: [
                { name: 'nome', type: 'text', label: 'Nome', required: true },
                { name: 'telefono', type: 'tel', label: 'Telefono' },
                { name: 'email', type: 'email', label: 'Email', required: true },
                { name: 'comune', type: 'text', label: 'Comune' },
                { name: 'richiesta', type: 'textarea', label: 'Richiesta', required: true },
              ],
            },
          },
        ],
      },
    })
  ).json();
  const published = await admin.post(`/api/v1/entries/${created.id}/publish`);
  expect(published.statusCode).toBe(200);
  pageSlug = published.json().slug;
  const html = (await new TestClient(app, site.host, '10.81.0.2').get(`/${pageSlug}`)).body;
  spec = /name="_spec" value="([^"]+)"/.exec(html)![1]!;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Zaphook', () => {
  let hookId: string;

  it('knows Forms and its forms, and saves a webhook without giving the secret back', async () => {
    expect((await submit(REQUEST)).statusCode).toBe(303);
    // No webhook yet: nothing queued, nothing sent.
    await deliverNow();
    expect(calls).toHaveLength(0);

    const state = (await admin.get(ext('/state'))).json();
    expect(state).toMatchObject({
      formsActive: true,
      formNames: ['Richiesta informazioni'],
      webhooks: [],
      log: [],
    });
    expect(
      (await admin.post(ext('/webhooks'), { url: 'http://hooks.zapier.com/x' })).statusCode,
    ).toBe(400);
    const saved = await admin.post(ext('/webhooks'), {
      label: 'Zapier',
      url: HOOK_URL,
      scope: 'selected',
      forms: ['Richiesta informazioni'],
      secret: SECRET,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.body).not.toContain(SECRET);
    hookId = saved.json().webhooks[0].id;
    expect(saved.json().webhooks[0]).toMatchObject({ hasSecret: true, includeIp: false });
  });

  it('queues while the visitor waits, then sends the fields at the root, signed', async () => {
    expect((await submit(REQUEST)).statusCode).toBe(303);
    expect(calls).toHaveLength(0);
    const queued = await log();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ status: 'queued', attempts: 0 });

    await deliverNow();
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(HOOK_URL);
    expect(call.headers['content-type']).toBe('application/json');
    const body = JSON.parse(call.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      nome: 'Mario Rossi',
      telefono: '+39 333 1234567',
      email: 'mario.rossi@example.com',
      comune: 'Varazze',
      richiesta: 'Vorrei un preventivo per il giardino.',
      _form: 'Richiesta informazioni',
      _page_url: `http://${site.host}/${pageSlug}`,
      _locale: 'en',
    });
    expect(typeof body._message_id).toBe('string');
    expect(Number.isNaN(Date.parse(body._submitted_at as string))).toBe(false);
    expect(body).not.toHaveProperty('_ip');
    expect(body).not.toHaveProperty('_user_agent');
    expect(body).not.toHaveProperty('_spec');
    expect(body).not.toHaveProperty('website');
    const timestamp = call.headers['x-zaphook-timestamp']!;
    expect(call.headers['x-zaphook-signature']).toBe(
      `sha256=${createHmac('sha256', SECRET).update(`${timestamp}.${call.body}`).digest('hex')}`,
    );

    const [sent] = await log();
    expect(sent).toMatchObject({
      status: 'sent',
      httpStatus: 200,
      attempts: 1,
      fields: ['nome', 'telefono', 'email', 'comune', 'richiesta'],
      canRetry: false,
    });
    // The values went with it.
    const [row] = await withSiteContext(owner.db, site.id, (tx) =>
      tx.execute<{ payload: unknown; email: string | null }>(
        sql`select payload, email from plg_zaphook.deliveries where status = 'sent'`,
      ),
    );
    expect(row).toMatchObject({ payload: null, email: null });
    const state = JSON.stringify((await admin.get(ext('/state'))).json());
    expect(state).not.toContain('Mario');
    expect(state).not.toContain(SECRET);
  });

  it('tries again when the service is busy or down, and stops on refusal', async () => {
    calls.length = 0;
    answers.push(503, 'down', 410);
    expect((await submit(REQUEST, '10.81.0.10')).statusCode).toBe(303);
    await deliverNow();
    expect((await log())[0]).toMatchObject({
      status: 'retrying',
      httpStatus: 503,
      attempts: 1,
      error: 'HTTP 503',
    });
    // Not before its time.
    clock += 2 * 60_000;
    await app.get(PluginHost).runSchedules(clock);
    expect(calls).toHaveLength(1);

    await deliverNow();
    const down = (await log())[0]!;
    expect(down).toMatchObject({ status: 'retrying', httpStatus: null, attempts: 2 });
    expect(down.error).toContain('ECONNREFUSED');
    expect(down.error).not.toContain('zapier');

    await deliverNow();
    expect((await log())[0]).toMatchObject({
      status: 'failed',
      httpStatus: 410,
      attempts: 3,
      canRetry: true,
    });
    expect(calls).toHaveLength(3);
  });

  it('finds a failed delivery’s values in privacy requests', async () => {
    const exported = (
      await admin.post('/api/v1/ext/privacy/requests', {
        kind: 'export',
        email: 'mario.rossi@example.com',
      })
    ).json();
    const zaphook = exported.data.find((s: { source: string }) => s.source === 'zaphook');
    expect(zaphook.groups[0].items).toHaveLength(1);
    expect(zaphook.groups[0].items[0]).toMatchObject({
      nome: 'Mario Rossi',
      form: 'Richiesta informazioni',
      webhook: 'Zapier',
      status: 'failed',
    });
    expect(JSON.stringify(zaphook)).not.toContain(SECRET);
  });

  it('tries a failed one again by hand, and sends a test on request', async () => {
    calls.length = 0;
    const failed = (await log()).find((l) => l.status === 'failed')!;
    const retried = await admin.post(ext(`/deliveries/${failed.id}/retry`));
    expect(retried.statusCode, retried.body).toBe(200);
    expect(calls).toHaveLength(1);
    expect(retried.json().log.find((l: { id: string }) => l.id === failed.id)).toMatchObject({
      status: 'sent',
      canRetry: false,
    });

    const test = await admin.post(ext(`/webhooks/${hookId}/test`), { locale: 'it' });
    expect(test.json()).toEqual({ ok: true, httpStatus: 200, error: null });
    expect(JSON.parse(calls[1]!.body)).toMatchObject({ _test: true, _form: 'Prova' });
  });

  it('leaves other forms alone, and keeps the email back when asked', async () => {
    calls.length = 0;
    const saved = await admin.request('PUT', ext(`/webhooks/${hookId}`), {
      skipMail: true,
      includeIp: true,
      includeUserAgent: true,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().webhooks[0]).toMatchObject({ hasSecret: true, skipMail: true });
    expect((await submit(REQUEST, '10.81.0.11')).statusCode).toBe(303);
    await deliverNow();
    const body = JSON.parse(calls[0]!.body) as Record<string, unknown>;
    expect(body._ip).toBe('10.81.0.11');
    expect(body._user_agent).toBe('TestBrowser/1.0');
    // The message is still kept in Forms.
    const messages = (await admin.get('/api/v1/ext/forms/submissions')).json();
    expect(messages.length).toBeGreaterThanOrEqual(4);

    // Another form: not this webhook's.
    await admin.request('PUT', ext(`/webhooks/${hookId}`), { forms: ['Newsletter'] });
    expect((await submit(REQUEST, '10.81.0.12')).statusCode).toBe(303);
    await deliverNow();
    expect(calls).toHaveLength(1);
  });

  it('removes a webhook and its secret', async () => {
    const removed = await admin.request('DELETE', ext(`/webhooks/${hookId}`));
    expect(removed.statusCode).toBe(200);
    expect(removed.json().webhooks).toEqual([]);
  });
});
