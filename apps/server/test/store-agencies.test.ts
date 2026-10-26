/**
 * The Store plugin on a real database (Store 1.4.0): bundles valid for
 * several products with seats counted per site, the customer portal (sign-in
 * by email link, agency vs customer vs stranger, freeing a seat, downloads)
 * and partners. GitHub is a fake.
 */
import { createHmac } from 'node:crypto';
import { cp, mkdtemp } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
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
const ext = (path: string) => `/api/v1/ext/store${path}`;

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let mail: MailService;
let github: Server;
let githubBase: string;

/** Releases of the fake private repository. */
const releases = [
  { tag: 'theme-vitality-1.0.0', asset: 'cleitext-theme-vitality-1.0.0.zip', at: '2026-01-10' },
  { tag: 'theme-vitality-1.1.0', asset: 'cleitext-theme-vitality-1.1.0.zip', at: '2026-05-10' },
  { tag: 'plugin-campus-2.0.0', asset: 'cleitext-plugin-campus-2.0.0.zip', at: '2026-04-01' },
  { tag: 'theme-zenit-1.0.0', asset: 'cleitext-theme-zenit-1.0.0.zip', at: '2026-02-01' },
];
const asJson = (r: (typeof releases)[number], i: number) => ({
  tag_name: r.tag,
  draft: false,
  published_at: `${r.at}T00:00:00Z`,
  assets: [{ name: r.asset, url: `${githubBase}/assets/${i}` }],
});

/** A site calling the license server, as Cleitext does (another server: no session). */
function siteCall(client: TestClient, action: string, body: Record<string, unknown>) {
  return client.request('POST', ext(`/v1/${action}`), body, { csrf: false, origin: null });
}

const keys: Record<string, string> = {};
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};

async function signIn(client: TestClient, email: string) {
  const before = mail.outbox.length;
  const asked = await client.postForm('/my-licenses/sign-in', { email });
  expect(asked.statusCode).toBe(303);
  expect(asked.headers.location).toBe('/my-licenses?sent=1');
  // The email is sent after the answer (same timing with or without licenses).
  const token = await vi.waitFor(() => {
    const message = mail.outbox.slice(before).find((m) => m.to === email);
    const found = message?.text.match(/\/my-licenses\/link\?t=([A-Za-z0-9_-]+)/)?.[1];
    if (!found) throw new Error(`No sign-in link for ${email} yet`);
    return found;
  });
  const opened = await client.get(`/my-licenses/link?t=${token}`);
  expect(opened.statusCode).toBe(200);
  expect(client.hasCookie('store_portal')).toBe(false);
  const confirmed = await client.postForm('/my-licenses/link', { t: token! });
  expect(confirmed.statusCode).toBe(303);
  expect(confirmed.headers.location).toBe('/my-licenses');
  expect(client.hasCookie('store_portal')).toBe(true);
  return token!;
}

beforeAll(async () => {
  github = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const tag = /^\/repos\/o\/r\/releases\/tags\/(.+)$/.exec(url.pathname);
    if (tag) {
      const i = releases.findIndex((r) => r.tag === tag[1]);
      res.writeHead(i === -1 ? 404 : 200, { 'content-type': 'application/json' });
      res.end(i === -1 ? '{}' : JSON.stringify(asJson(releases[i]!, i)));
      return;
    }
    if (url.pathname === '/repos/o/r/releases') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(releases.map(asJson)));
      return;
    }
    const asset = /^\/assets\/(\d+)$/.exec(url.pathname);
    if (asset) {
      res.writeHead(302, { location: `https://objects.example/${releases[+asset[1]!]!.asset}` });
      res.end();
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => github.listen(0, '127.0.0.1', resolve));
  githubBase = `http://127.0.0.1:${(github.address() as AddressInfo).port}`;

  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'store-src-')), 'store');
  await cp(join(pluginsRoot, 'store'), source, {
    recursive: true,
    filter: (f) => !f.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  mail = app.get(MailService);
  site = await seedSite(owner, 'store');
  await seedUser(owner, {
    email: 'admin@store.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.80.0.1');
  await admin.login('admin@store.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/store/activate')).statusCode).toBe(200);
  expect(
    (
      await admin.request('PATCH', '/api/v1/plugins/store/settings', {
        github_repo: 'o/r',
        github_api: githubBase,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await admin.request('PUT', ext('/admin/secrets/githubToken'), { value: 'ghp_test_token' }))
      .statusCode,
  ).toBe(200);
  const product = (slug: string, body: Record<string, unknown>) =>
    admin.request('PUT', ext(`/admin/products/${slug}`), { updatesMonths: 12, ...body });
  for (const [slug, body] of [
    ['vitality', { name: 'Vitality', priceCents: 5900 }],
    ['campus', { name: 'Campus', priceCents: 2900 }],
    ['zenit', { name: 'Zenit Pro', priceCents: 5900 }],
    ['cleitext-toolkit', { name: 'Toolkit', free: true }],
    ['agency', { name: 'Agency License', bundle: true, covers: 'all', priceCents: 29900 }],
  ] as const) {
    expect((await product(slug, body)).statusCode).toBe(200);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
  await new Promise((resolve) => github?.close(resolve));
});

describe('bundles', () => {
  it('cover products, never bundles or free products', async () => {
    const save = (covers: unknown) =>
      admin.request('PUT', ext('/admin/products/themes-pack'), {
        name: 'Themes pack',
        updatesMonths: 12,
        bundle: true,
        covers,
      });
    expect((await save(['agency'])).statusCode).toBe(400);
    expect((await save(['cleitext-toolkit'])).statusCode).toBe(400);
    expect((await save(['nope'])).statusCode).toBe(400);
    expect((await save([])).statusCode).toBe(400);
    expect((await save(['vitality', 'zenit'])).statusCode).toBe(200);

    const overview = (await admin.get(ext('/admin/overview'))).json();
    expect(overview.products.find((p: { slug: string }) => p.slug === 'themes-pack')).toMatchObject(
      { bundle: true, covers: ['vitality', 'zenit'], demo: false },
    );
    expect(overview.products.find((p: { slug: string }) => p.slug === 'agency')).toMatchObject({
      bundle: true,
      covers: null,
    });
  });

  it('partners get their discount on manual licenses, for the record', async () => {
    const partner = await admin.request('PUT', ext('/admin/partners'), {
      email: 'Agency@Example.com',
      name: 'Web Agency',
      discountPercent: 30,
      code: 'webagency',
      lsDiscountCode: 'WEB30',
    });
    expect(partner.statusCode).toBe(200);
    const created = await admin.post(ext('/admin/licenses'), {
      productSlug: 'agency',
      email: 'client@example.com',
      ownerEmail: 'agency@example.com',
      seats: 2,
      send: false,
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      partner: { name: 'Web Agency', discountPercent: 30 },
      listPriceCents: 29900,
      priceCents: 20930,
      currency: 'EUR',
    });
    keys.agency = created.json().key;
    ids.agency = created.json().id;

    const plain = await admin.post(ext('/admin/licenses'), {
      productSlug: 'vitality',
      email: 'solo@example.com',
      seats: 1,
      send: false,
    });
    expect(plain.json()).toMatchObject({ partner: null, priceCents: 5900 });
    keys.solo = plain.json().key;
    ids.solo = plain.json().id;
  });

  it('validates for every covered product, counting seats per site', async () => {
    const a = new TestClient(app, site.host, '10.80.1.1');
    const activate = async (slug: string, origin: string, key = keys.agency!) =>
      siteCall(a, 'activate', { key, slug, siteOrigin: origin, siteId: 'x' });

    const first = await activate('vitality', 'https://a.example');
    expect(first.statusCode).toBe(200);
    expect(first.json().seats).toEqual({ used: 1, total: 2 });
    tokens.aVitality = first.json().activation;

    // Same site, another product of the bundle: still one seat.
    const second = await activate('campus', 'https://a.example');
    expect(second.statusCode).toBe(200);
    expect(second.json().seats).toEqual({ used: 1, total: 2 });
    tokens.aCampus = second.json().activation;

    // Entered again on the same site and product: the same seat, a new token.
    const again = await activate('vitality', 'https://a.example');
    expect(again.json().seats).toEqual({ used: 1, total: 2 });
    expect(again.json().activation).not.toBe(tokens.aVitality);
    tokens.aVitality = again.json().activation;

    const b = await activate('zenit', 'https://b.example');
    expect(b.json().seats).toEqual({ used: 2, total: 2 });
    tokens.bZenit = b.json().activation;

    const full = await activate('vitality', 'https://c.example');
    expect(full.statusCode).toBe(409);
    // Free products and unknown products are not covered.
    expect((await activate('cleitext-toolkit', 'https://a.example')).statusCode).toBe(400);
    expect((await activate('unknown', 'https://a.example')).statusCode).toBe(400);
  });

  it('a plain key stays valid for its own product only', async () => {
    const s = new TestClient(app, site.host, '10.80.1.2');
    const wrong = await siteCall(s, 'activate', {
      key: keys.solo,
      slug: 'campus',
      siteOrigin: 'https://solo.example',
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().message).toContain('vitality');
    const right = await siteCall(s, 'activate', {
      key: keys.solo,
      slug: 'vitality',
      siteOrigin: 'https://solo.example',
    });
    expect(right.statusCode).toBe(200);
    expect(right.json().seats).toEqual({ used: 1, total: 1 });
    tokens.solo = right.json().activation;
    // Its activation does not download another product.
    const other = await siteCall(s, 'download-token', {
      activation: tokens.solo,
      slug: 'campus',
      version: '2.0.0',
    });
    expect(other.statusCode).toBe(403);
  });

  it('status and downloads work for covered products', async () => {
    const a = new TestClient(app, site.host, '10.80.1.3');
    const status = await siteCall(a, 'status', { activation: tokens.aCampus, slug: 'campus' });
    expect(status.json()).toMatchObject({ status: 'active', seats: { used: 2, total: 2 } });
    for (const [slug, version] of [
      ['campus', '2.0.0'],
      ['vitality', '1.1.0'],
    ]) {
      const token = await siteCall(a, 'download-token', {
        activation: tokens.aCampus,
        slug,
        version,
      });
      expect(token.statusCode).toBe(200);
      expect(token.json().url).toContain(`download/${slug}/${version}`);
    }
  });

  it('frees the seat when the site deactivates its last product', async () => {
    const a = new TestClient(app, site.host, '10.80.1.4');
    await siteCall(a, 'deactivate', { activation: tokens.aCampus, slug: 'campus' });
    const status = await siteCall(a, 'status', { activation: tokens.aVitality, slug: 'vitality' });
    expect(status.json().seats).toEqual({ used: 2, total: 2 });
    await siteCall(a, 'deactivate', { activation: tokens.aVitality, slug: 'vitality' });
    const c = await siteCall(a, 'activate', {
      key: keys.agency,
      slug: 'campus',
      siteOrigin: 'https://c.example',
    });
    expect(c.statusCode).toBe(200);
    expect(c.json().seats).toEqual({ used: 2, total: 2 });
    tokens.cCampus = c.json().activation;
  });
});

describe('customer portal', () => {
  it('asks for an email, and never says whether it has licenses', async () => {
    const visitor = new TestClient(app, site.host, '10.80.2.1');
    const page = await visitor.get('/my-licenses');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Email me a sign-in link');
    expect(page.headers['cache-control']).toContain('no-store');

    const before = mail.outbox.length;
    const stranger = await visitor.postForm('/my-licenses/sign-in', {
      email: 'stranger@example.com',
    });
    expect(stranger.statusCode).toBe(303);
    expect(stranger.headers.location).toBe('/my-licenses?sent=1');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mail.outbox.length).toBe(before);
    const bad = await visitor.postForm('/my-licenses/sign-in', { email: 'not an email' });
    expect(bad.headers.location).toBe('/my-licenses?sent=1');
    expect(visitor.hasCookie('store_portal')).toBe(false);
  });

  it('signs in with a link that works once', async () => {
    const agency = new TestClient(app, site.host, '10.80.2.2');
    const token = await signIn(agency, 'agency@example.com');
    const thief = new TestClient(app, site.host, '10.80.2.3');
    const reused = await thief.postForm('/my-licenses/link', { t: token });
    expect(reused.headers.location).toBe('/my-licenses?error=link');
    expect(thief.hasCookie('store_portal')).toBe(false);
  });

  it('shows the agency its licenses, sites and downloads, and frees a seat', async () => {
    const agency = new TestClient(app, site.host, '10.80.2.4');
    await signIn(agency, 'agency@example.com');
    const page = (await agency.get('/my-licenses')).body;
    expect(page).toContain('Agency License');
    expect(page).toContain('Customer: client@example.com');
    expect(page).toContain('https://b.example');
    expect(page).toContain('https://c.example');
    expect(page).toContain('2 of 2');
    expect(page).toContain('Free this seat');
    expect(page).toContain('/my-licenses/download/campus');
    expect(page).not.toContain('/my-licenses/download/cleitext-toolkit');
    // Not the license of someone else.
    expect(page).not.toContain('Vitality</h2>');
    expect(page).not.toContain(keys.agency);

    const revealed = await agency.postForm('/my-licenses/reveal', { license: ids.agency! });
    expect(revealed.statusCode).toBe(200);
    expect(revealed.body).toContain(keys.agency);

    const download = await agency.get('/my-licenses/download/campus');
    expect(download.statusCode).toBe(302);
    expect(download.headers.location).toBe(
      'https://objects.example/cleitext-plugin-campus-2.0.0.zip',
    );
    const latest = await agency.get('/my-licenses/download/vitality');
    expect(latest.headers.location).toBe(
      'https://objects.example/cleitext-theme-vitality-1.1.0.zip',
    );
    const notCovered = await agency.get('/my-licenses/download/cleitext-toolkit');
    expect(notCovered.headers.location).toBe('/my-licenses?error=denied');

    const freed = await agency.postForm('/my-licenses/free-seat', {
      license: ids.agency!,
      site: 'https://b.example',
    });
    expect(freed.headers.location).toBe('/my-licenses?freed=1');
    const b = new TestClient(app, site.host, '10.80.2.5');
    const status = await siteCall(b, 'status', { activation: tokens.bZenit, slug: 'zenit' });
    expect(status.json().status).toBe('unknown');
    const after = await siteCall(b, 'status', { activation: tokens.cCampus, slug: 'campus' });
    expect(after.json().seats).toEqual({ used: 1, total: 2 });

    const out = await agency.postForm('/my-licenses/sign-out', {});
    expect(out.statusCode).toBe(303);
    expect(agency.hasCookie('store_portal')).toBe(false);
    expect((await agency.get('/my-licenses')).body).toContain('Email me a sign-in link');
  });

  it('lets the customer see a license its agency manages, not manage it', async () => {
    const client = new TestClient(app, site.host, '10.80.2.6');
    await signIn(client, 'client@example.com');
    const page = (await client.get('/my-licenses')).body;
    expect(page).toContain('Agency License');
    expect(page).toContain('Managed by agency@example.com');
    expect(page).not.toContain('Free this seat');
    expect(page).not.toContain('Show key');

    const reveal = await client.postForm('/my-licenses/reveal', { license: ids.agency! });
    expect(reveal.headers.location).toBe('/my-licenses?error=denied');
    const free = await client.postForm('/my-licenses/free-seat', {
      license: ids.agency!,
      site: 'https://c.example',
    });
    expect(free.headers.location).toBe('/my-licenses?error=denied');
    const status = await siteCall(client, 'status', {
      activation: tokens.cCampus,
      slug: 'campus',
    });
    expect(status.json().status).toBe('active');
  });

  it('gives strangers nothing', async () => {
    const solo = new TestClient(app, site.host, '10.80.2.7');
    await signIn(solo, 'solo@example.com');
    const page = (await solo.get('/my-licenses')).body;
    expect(page).toContain('Vitality');
    expect(page).not.toContain('Agency License');
    expect(page).not.toContain('https://c.example');
    for (const action of ['reveal', 'free-seat']) {
      const denied = await solo.postForm(`/my-licenses/${action}`, {
        license: ids.agency!,
        site: 'https://c.example',
      });
      expect(denied.headers.location).toBe('/my-licenses?error=denied');
    }
    expect((await solo.get('/my-licenses/download/campus')).headers.location).toBe(
      '/my-licenses?error=denied',
    );
    // Without a session, actions only go back to the sign-in page.
    const anonymous = new TestClient(app, site.host, '10.80.2.8');
    const free = await anonymous.postForm('/my-licenses/free-seat', {
      license: ids.agency!,
      site: 'https://c.example',
    });
    expect(free.headers.location).toBe('/my-licenses');
    // Another site's form cannot post here.
    const forged = await app.inject({
      method: 'POST',
      url: '/my-licenses/free-seat',
      headers: {
        host: site.host,
        origin: 'https://evil.example',
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: `license=${ids.agency}&site=https://c.example`,
    });
    expect(forged.statusCode).toBe(403);
  });

  it('limits sign-in requests per address', async () => {
    const spammer = new TestClient(app, site.host, '10.80.2.9');
    for (let i = 0; i < 5; i++) {
      const r = await spammer.postForm('/my-licenses/sign-in', { email: `x${i}@example.com` });
      expect(r.headers.location).toBe('/my-licenses?sent=1');
    }
    const limited = await spammer.postForm('/my-licenses/sign-in', { email: 'x@example.com' });
    expect(limited.headers.location).toBe('/my-licenses?error=limit');
  });
});

describe('partners', () => {
  it('reports each partner’s licenses and seats', async () => {
    const list = (await admin.get(ext('/admin/partners'))).json();
    expect(list).toEqual([
      expect.objectContaining({
        email: 'agency@example.com',
        name: 'Web Agency',
        discountPercent: 30,
        code: 'webagency',
        lsDiscountCode: 'WEB30',
        licenses: 1,
        activeLicenses: 1,
        seatsUsed: 1,
        seatsTotal: 2,
        revenueCents: 20930,
      }),
    ]);
    const licenses = (await admin.get(ext('/admin/partners/agency@example.com/licenses'))).json();
    expect(licenses).toHaveLength(1);
    expect(licenses[0]).toMatchObject({ productSlug: 'agency', used: 1 });
    expect(licenses[0].sites).toEqual(['https://c.example']);
    expect(licenses[0].keyHash).toBeUndefined();
    expect(licenses[0].keySealed).toBeUndefined();

    // Codes are unique.
    const taken = await admin.request('PUT', ext('/admin/partners'), {
      email: 'other@example.com',
      name: 'Other',
      code: 'webagency',
    });
    expect(taken.statusCode).toBe(409);
  });

  it('gives Lemon Squeezy orders with a partner code to the partner', async () => {
    await admin.request('PUT', ext('/admin/secrets/lemonSqueezySecret'), { value: 'whsec_test' });
    await admin.request('PUT', ext('/admin/variants'), {
      variantId: '901',
      productSlug: 'agency',
      seats: 5,
      kind: 'new',
    });
    const raw = JSON.stringify({
      meta: { event_name: 'order_created', custom_data: { partner: 'webagency' } },
      data: {
        id: '5001',
        attributes: {
          status: 'paid',
          user_email: 'shop@client2.example',
          user_name: 'Client Two',
          subtotal: 29900,
          discount_total: 8970,
          currency: 'EUR',
          first_order_item: { variant_id: 901, quantity: 1 },
        },
      },
    });
    const hook = await app.inject({
      method: 'POST',
      url: ext('/v1/webhooks/lemonsqueezy'),
      headers: {
        host: site.host,
        'content-type': 'application/json',
        'x-signature': createHmac('sha256', 'whsec_test').update(raw).digest('hex'),
      },
      payload: raw,
    });
    expect(hook.statusCode).toBe(200);
    const found = (await admin.get(ext('/admin/licenses?q=client2'))).json();
    expect(found[0]).toMatchObject({
      productSlug: 'agency',
      email: 'shop@client2.example',
      ownerEmail: 'agency@example.com',
      seats: 5,
      listPriceCents: 29900,
      discountPercent: 30,
      priceCents: 20930,
    });
    // The admin changes who holds it and who manages it.
    const moved = await admin.request('PUT', ext(`/admin/licenses/${found[0].id}/people`), {
      email: 'owner@client2.example',
      ownerEmail: '',
    });
    expect(moved.statusCode).toBe(200);
    const after = (await admin.get(ext('/admin/licenses?q=client2'))).json();
    expect(after[0]).toMatchObject({ email: 'owner@client2.example', ownerEmail: null });
  });
});
