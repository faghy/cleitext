/**
 * Plugin API 1.58: paid conversions (`ctx.conversions`, `conversion.paid`,
 * `conversion.reversed`) delivered after the commit, never after a
 * rollback, each listener on its own; referral links (`ctx.referrals`):
 * the parameter stays out of the page cache and of the page, the page's
 * script carries the capture, visits reach `referral.visit`, and routes
 * read the codes kept in the referral cookies.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const fixtures = fileURLToPath(new URL('./fixtures', import.meta.url));
const seen = ((globalThis as unknown as { __referrerSeen?: unknown[] }).__referrerSeen ??= []);

type Seen = { name: string; event: Record<string, unknown>; siteId?: string };

let app: NestFastifyApplication;
let owner: DatabaseClient;
let host: string;
let siteId: string;
let ip = 1;
const visitor = () => new TestClient(app, host, `10.93.0.${ip++}`);

async function eventually(check: () => boolean, timeoutMs = 5_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('condition not met in time');
}
const settle = () => new Promise((r) => setTimeout(r, 150));
const of = (name: string) => (seen as Seen[]).filter((s) => s.name === name);

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  for (const name of ['seller', 'referrer']) {
    const source = join(await mkdtemp(join(tmpdir(), `${name}-src-`)), name);
    await cp(join(fixtures, `${name}-plugin`), source, { recursive: true });
    await buildPlugin(source);
    await installPlugin(owner.db, {
      source,
      pluginsPath,
      appRole: new URL(inject('appUrl')).username,
    });
  }
  app = await startTestApp({ pluginsPath });
  const site = await seedSite(owner, 'referrals');
  host = site.host;
  siteId = site.id;
  await seedUser(owner, {
    email: 'admin@referrals.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  const admin = new TestClient(app, host, '10.93.1.1');
  await admin.login('admin@referrals.test', PASSWORD);
  for (const slug of ['seller', 'referrer'])
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

beforeEach(() => {
  seen.length = 0;
});

describe('conversions', () => {
  it('delivers a conversion once its transaction committed, checked and complete', async () => {
    const res = await visitor().get('/seller/buy?id=o-1');
    expect(res.statusCode).toBe(200);
    await eventually(() => of('paid').length === 1);
    const [paid] = of('paid');
    expect(paid!.siteId).toBe(siteId);
    expect(paid!.event).toMatchObject({
      source: 'seller',
      kind: 'order',
      id: 'o-1',
      amount: '49.90',
      currency: 'EUR',
      customer: { email: 'buyer@example.test', userId: null },
      items: [{ id: 'p1', name: 'Mug', amount: '49.90' }],
      label: 'Order o-1',
      referrals: {},
    });
    expect(typeof paid!.event.at).toBe('string');
  });

  it('never delivers a conversion whose transaction rolled back', async () => {
    expect((await visitor().get('/seller/fail?id=o-2')).statusCode).toBe(200);
    await settle();
    expect(of('paid')).toEqual([]);
  });

  it('drops an invalid conversion without failing the plugin', async () => {
    expect((await visitor().get('/seller/bad')).statusCode).toBe(200);
    await settle();
    expect(of('paid')).toEqual([]);
  });

  it('delivers reversals, full and partial', async () => {
    await visitor().get('/seller/refund?id=o-1&amount=10.00');
    await visitor().get('/seller/refund?id=o-1');
    await eventually(() => of('reversed').length === 2);
    expect(of('reversed').map((s) => s.event)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'seller', id: 'o-1', amount: '10.00', reason: 'refund' }),
        expect.not.objectContaining({ amount: expect.anything() }),
      ]),
    );
  });
});

describe('referral links', () => {
  it('keeps the parameter out of the page and of the page cache', async () => {
    const first = await visitor().get('/?ref=anna');
    expect(first.statusCode).toBe(200);
    expect(first.body).toContain('data-cx-referrals');
    expect(first.body).toContain('"q":"ref"');
    expect(first.body).toContain('"c":"marketing"');
    expect(first.body).not.toContain('anna');
    // Nothing is stored by the server: the cookie needs the visitor's consent.
    expect(first.headers['set-cookie']).toBeUndefined();
    const second = await visitor().get('/?ref=bob');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).not.toContain('bob');
    const plain = await visitor().get('/');
    expect(plain.headers['x-cache']).toBe('HIT');
    // Other parameters still make their own page.
    const other = await visitor().get('/?ref=carl&utm_source=x');
    expect(other.headers['x-cache']).toBe('MISS');
    expect(other.body).not.toContain('carl');
    expect(other.body).not.toMatch(/href="[^"]*[?&]ref=/);
  });

  it('passes visits to the plugins, without the visitor’s address', async () => {
    const client = visitor();
    const res = await client.request('POST', '/_cx/referral', {
      plugin: 'referrer',
      code: 'anna',
      path: '/shop',
      referrer: 'news.example',
      stored: false,
    });
    expect(res.statusCode).toBe(204);
    await eventually(() => of('visit').length === 1);
    expect(of('visit')[0]!.event).toEqual({
      plugin: 'referrer',
      code: 'anna',
      path: '/shop',
      referrer: 'news.example',
      stored: false,
    });
    // Not a capturing plugin, a bad code, another origin.
    for (const body of [
      { plugin: 'seller', code: 'anna', path: '/' },
      { plugin: 'referrer', code: 'an na', path: '/' },
      { plugin: 'referrer', code: 'anna', path: 'https://evil.example/' },
    ])
      expect((await client.request('POST', '/_cx/referral', body)).statusCode).toBe(400);
    const cross = await client.request(
      'POST',
      '/_cx/referral',
      { plugin: 'referrer', code: 'anna', path: '/' },
      { origin: 'https://evil.example' },
    );
    expect(cross.statusCode).toBe(403);
  });

  it('limits visits from one address', async () => {
    const client = visitor();
    const codes: number[] = [];
    for (let i = 0; i < 22; i++)
      codes.push(
        (
          await client.request('POST', '/_cx/referral', {
            plugin: 'referrer',
            code: 'x',
            path: '/',
          })
        ).statusCode,
      );
    expect(codes.slice(0, 20).every((c) => c === 204)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it('gives routes the codes of the referral cookies, and conversions carry them', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/seller/whoami',
      headers: { host, cookie: 'cx_ref_referrer=anna; cx_ref_bad=%20x; other=1' },
    });
    expect(res.json()).toEqual({ referrals: { referrer: 'anna' }, query: {} });
    // Plugin routes never see the captured parameter either: their answers may be cached.
    const routed = await app.inject({
      method: 'GET',
      url: '/seller/whoami?ref=bob&a=1',
      headers: { host },
    });
    expect(routed.json().query).toEqual({ a: '1' });
    await app.inject({
      method: 'GET',
      url: '/seller/buy?id=o-3',
      headers: { host, cookie: 'cx_ref_referrer=anna' },
    });
    await eventually(() => of('paid').length === 1);
    expect(of('paid')[0]!.event.referrals).toEqual({ referrer: 'anna' });
  });
});
