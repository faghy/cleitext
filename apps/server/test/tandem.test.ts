/**
 * The official Tandem plugin (affiliate program) with Cleishop and
 * Forms on a real database: a member applies from the account, is approved
 * (email), shares the link (visits counted, the page stays cached), a
 * customer who came through it orders in Cleishop: the order paid becomes
 * a commission in the affiliate area, approved after the refund window, a
 * partial refund shrinks it; the free version ignores the conversions of
 * another source (Forms) and the admin invites to Pro; self-referrals do
 * not count; payouts are listed, exported and marked as paid (email);
 * personal data are exported and erased.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { users, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
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
const pp = (path: string) => `/api/v1/ext/tandem${path}`;
const shop = (path: string) => `/api/v1/ext/shop${path}`;

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let mail: MailService;
let anna: TestClient;
let mug: string;
let code = '';
let affiliateId = '';
let orderId = '';

/** A browser that accepted the marketing cookies after arriving through the link. */
function withReferral(client: TestClient, value: string): TestClient {
  (client as unknown as { cookies: Map<string, string> }).cookies.set('cx_ref_tandem', value);
  return client;
}

const billing = {
  email: 'Bob@Example.test',
  'billing.firstName': 'Bob',
  'billing.lastName': 'Bianchi',
  'billing.address1': 'Via Roma 1',
  'billing.city': 'Varazze',
  'billing.postcode': '17019',
  'billing.province': 'Savona',
  'billing.country': 'IT',
  'billing.phone': '019 123456',
  payment: 'bacs',
  terms: '1',
};

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

async function order(client: TestClient): Promise<string> {
  expect((await client.postForm('/cart/add', { product: mug, quantity: '2' })).statusCode).toBe(
    303,
  );
  const placed = await client.postForm('/checkout', billing);
  expect(placed.statusCode, placed.body).toBe(303);
  const list = (await admin.get(shop('/orders'))).json() as { items: { id: string }[] };
  return list.items[0]!.id;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  for (const slug of ['shop', 'forms', 'tandem']) await install(slug, pluginsPath);
  app = await startTestApp({ pluginsPath });
  mail = app.get(MailService);
  site = await seedSite(owner, 'tandem');
  await seedUser(owner, {
    email: 'admin@tandem.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'anna@tandem.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
  });
  // Confirmed addresses: plugins with `users:read` see them.
  await owner.db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(inArray(users.email, ['admin@tandem.test', 'anna@tandem.test']));
  admin = new TestClient(app, site.host, '10.95.0.1');
  await admin.login('admin@tandem.test', PASSWORD);
  for (const slug of ['shop', 'forms', 'tandem'])
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  expect(
    (
      await admin.request('PUT', shop('/payments'), {
        bacs: {
          enabled: true,
          accounts: [{ accountName: 'Bottega', iban: 'IT60X0542811101000000123456' }],
        },
      })
    ).statusCode,
  ).toBe(200);
  const created = (await admin.post('/api/v1/entries', { type: 'product', title: 'Mug' })).json();
  mug = created.id;
  expect(
    (
      await admin.request('PUT', shop(`/products/${mug}`), {
        product: { sku: 'MUG', regularPrice: '20.00' },
      })
    ).statusCode,
  ).toBe(200);
  await admin.post(`/api/v1/entries/${mug}/publish`);
  anna = new TestClient(app, site.host, '10.95.0.2');
  await anna.login('anna@tandem.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('applying', () => {
  it('shows the form in the account, with the terms', async () => {
    await admin.request('PUT', pp('/settings'), {
      termsUrl: '/affiliate-terms',
      notifyEmail: 'boss@tandem.test',
      refundDays: 30,
    });
    const account = await anna.get('/account');
    expect(account.body).toContain('href="/account/affiliate"');
    const page = await anna.get('/account/affiliate');
    expect(page.statusCode).toBe(200);
    expect(page.headers['cache-control']).toBe('private, no-store');
    expect(page.body).toContain('action="/account/affiliate/apply"');
    expect(page.body).toContain('href="/affiliate-terms"');
    // Guests sign in first.
    const guest = await new TestClient(app, site.host, '10.95.0.3').get('/account/affiliate');
    expect(guest.statusCode).toBe(303);
    expect(guest.headers.location).toBe('/account/login?redirect=%2Faccount%2Faffiliate');
  });

  it('refuses an application without the terms or with bad details', async () => {
    const noTerms = await anna.postForm('/account/affiliate/apply', { code: 'anna' });
    expect(noTerms.statusCode).toBe(400);
    expect(noTerms.body).toContain('Please accept the program terms.');
    const badIban = await anna.postForm('/account/affiliate/apply', {
      terms: '1',
      iban: 'IT00 1234',
    });
    expect(badIban.body).toContain('Check the IBAN.');
  });

  it('takes the application and tells the administrators', async () => {
    mail.outbox.length = 0;
    const applied = await anna.postForm('/account/affiliate/apply', {
      code: 'anna',
      website: 'instagram.com/anna',
      paypal: 'anna.pay@example.test',
      terms: '1',
    });
    expect(applied.statusCode).toBe(303);
    expect((await anna.get('/account/affiliate')).body).toContain('being reviewed');
    await expect.poll(() => mail.outbox.length).toBe(1);
    expect(mail.outbox[0]!.to).toContain('boss@tandem.test');
    expect(mail.outbox[0]!.subject).toContain('new affiliate application from anna');
  });

  it('is approved by the administrator, with a welcome email', async () => {
    const list = (await admin.get(pp('/affiliates?status=pending'))).json();
    expect(list.total).toBe(1);
    const row = list.affiliates[0];
    expect(row).toMatchObject({
      code: 'anna',
      email: 'anna@tandem.test',
      website: 'https://instagram.com/anna',
      paypalEmail: 'anna.pay@example.test',
      link: `http://${site.host}/?ref=anna`,
    });
    affiliateId = row.id;
    code = row.code;
    mail.outbox.length = 0;
    expect(
      (await admin.post(pp(`/affiliates/${affiliateId}/status`), { status: 'active' })).statusCode,
    ).toBe(200);
    await expect.poll(() => mail.outbox.length).toBe(1);
    expect(mail.outbox[0]!.to).toContain('anna@tandem.test');
    expect(mail.outbox[0]!.text).toContain('Your code is anna');
    const area = await anna.get('/account/affiliate');
    expect(area.body).toContain(`value="http://${site.host}/?ref=anna"`);
    expect(area.body).toContain('data-ppl-copy');
  });
});

describe('the link', () => {
  it('counts visits, while the page stays the same for everyone', async () => {
    const visitor = new TestClient(app, site.host, '10.95.0.4');
    const page = await visitor.get(`/?ref=${code}`);
    expect(page.body).toContain('"s":"tandem"');
    expect(page.body).not.toContain(`ref=${code}`);
    expect((await visitor.get('/?ref=someone-else')).headers['x-cache']).toBe('HIT');
    for (let i = 0; i < 3; i++)
      expect(
        (
          await visitor.request('POST', '/_cx/referral', {
            plugin: 'tandem',
            code,
            path: '/',
            stored: true,
          })
        ).statusCode,
      ).toBe(204);
    // An unknown code is not counted anywhere.
    await visitor.request('POST', '/_cx/referral', {
      plugin: 'tandem',
      code: 'ghost',
      path: '/',
    });
    await expect
      .poll(async () => (await admin.get(pp('/affiliates'))).json().affiliates[0].visits)
      .toBe(3);
  });
});

describe('conversions', () => {
  it('turns an order paid in Cleishop into a commission of the affiliate', async () => {
    const bob = withReferral(new TestClient(app, site.host, '10.95.0.5'), code);
    orderId = await order(bob);
    // A bank transfer: nothing until the money arrives.
    await new Promise((r) => setTimeout(r, 200));
    expect((await admin.get(pp('/referrals'))).json().total).toBe(0);
    mail.outbox.length = 0;
    expect(
      (await admin.request('PATCH', shop(`/orders/${orderId}/status`), { status: 'processing' }))
        .statusCode,
    ).toBe(200);
    await expect.poll(async () => (await admin.get(pp('/referrals'))).json().total).toBe(1);
    const { rows } = (await admin.get(pp('/referrals'))).json();
    expect(rows[0].referral).toMatchObject({
      source: 'shop',
      status: 'pending',
      // 10% of the products (2 × 20.00), without shipping.
      amountCents: 400,
      currency: 'EUR',
      customerEmail: 'bob@example.test',
    });
    await expect
      .poll(() => mail.outbox.filter((m) => String(m.to).includes('anna@')).length)
      .toBe(1);
    const area = (await anna.get('/account/affiliate')).body;
    expect(area).toMatch(/Conversions<b>1<\/b>/);
    expect(area).toContain('€4.00');
  });

  it('never counts a self-referral', async () => {
    const self = withReferral(new TestClient(app, site.host, '10.95.0.6'), code);
    await self.postForm('/cart/add', { product: mug, quantity: '1' });
    await self.postForm('/checkout', { ...billing, email: 'anna@tandem.test' });
    const list = (await admin.get(shop('/orders'))).json() as { items: { id: string }[] };
    await admin.request('PATCH', shop(`/orders/${list.items[0]!.id}/status`), {
      status: 'processing',
    });
    await new Promise((r) => setTimeout(r, 300));
    expect((await admin.get(pp('/referrals'))).json().total).toBe(1);
  });

  it('counts one source in the free version, and invites to Pro for the others', async () => {
    const visitor = withReferral(new TestClient(app, site.host, '10.95.0.7'), code);
    const sent = await visitor.postForm('/_forms/submit', {
      _block: 'b1',
      name: 'Carla',
      email: 'carla@example.test',
      message: 'Hello',
    });
    expect(sent.statusCode).toBe(303);
    await expect
      .poll(async () => (await admin.get(pp('/overview'))).json().missed.forms ?? 0)
      .toBe(1);
    expect((await admin.get(pp('/referrals'))).json().total).toBe(1);
    expect((await admin.get(pp('/overview'))).json().upgradeUrl).toBe(
      'https://cleitext.com/plugins/tandem',
    );
  });

  it('shrinks the commission when part of the order is refunded', async () => {
    const refunded = await admin.post(shop(`/orders/${orderId}/refunds`), {
      amount: '20.00',
      gateway: false,
    });
    expect(refunded.statusCode, refunded.body).toBe(201);
    const total = Number((await admin.get(shop(`/orders/${orderId}`))).json().order.total);
    await expect
      .poll(async () => (await admin.get(pp('/referrals'))).json().rows[0].referral.amountCents)
      .toBe(Math.round((400 * (total - 20)) / total));
  });

  it('approves commissions after the refund window', async () => {
    await admin.request('PUT', pp('/settings'), {
      ...(await admin.get(pp('/settings'))).json().settings,
      refundDays: 0,
      minPayout: 1,
    });
    await app.get(PluginHost).runSchedules(Date.now() + 2 * 3600_000);
    await expect
      .poll(async () => (await admin.get(pp('/referrals'))).json().rows[0].referral.status)
      .toBe('approved');
  });
});

describe('payouts', () => {
  it('lists what is to pay, exports it, and marks it as paid', async () => {
    const payouts = (await admin.get(pp('/payouts'))).json();
    expect(payouts.lines).toHaveLength(1);
    const line = payouts.lines[0];
    expect(line).toMatchObject({ affiliateId, currency: 'EUR', due: true, count: 1 });
    const csv = await admin.get(pp('/payouts.csv'));
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('anna.pay@example.test');
    expect(csv.body).toContain(`,${line.amount},EUR,1`);
    mail.outbox.length = 0;
    const paid = await admin.post(pp('/payouts'), {
      affiliateId,
      currency: 'EUR',
      note: 'PayPal, October',
      paidAt: '2026-10-30',
    });
    expect(paid.statusCode).toBe(201);
    expect((await admin.get(pp('/payouts'))).json().lines).toHaveLength(0);
    expect((await admin.post(pp('/payouts'), { affiliateId, currency: 'EUR' })).statusCode).toBe(
      400,
    );
    await expect.poll(() => mail.outbox.length).toBe(1);
    expect(mail.outbox[0]!.text).toContain('PayPal, October');
    expect((await anna.get('/account/affiliate')).body).toContain('PayPal, October');
  });

  it('takes a refund of a paid order off the next payout', async () => {
    await admin.post(shop(`/orders/${orderId}/refunds`), { amount: '5.00', gateway: false });
    await expect
      .poll(async () => (await admin.get(pp('/payouts'))).json().lines[0]?.amountCents ?? 0)
      .toBeLessThan(0);
  });
});

describe('personal data', () => {
  it('exports and erases what the program keeps about an email', async () => {
    const host = app.get(PluginHost);
    const exported = await host.exportPersonalData(site.id, 'anna@tandem.test');
    const mine = exported.find((e) => e.source === 'tandem');
    expect(mine?.groups.map((g) => g.id)).toEqual(['tandem.affiliate', 'tandem.payouts']);
    const erased = await host.erasePersonalData(site.id, 'anna@tandem.test');
    expect(erased.find((e) => e.source === 'tandem')).toMatchObject({
      removed: 1,
      retained: 1,
    });
    const after = (await admin.get(pp(`/affiliates?search=anna`))).json();
    expect(after.affiliates[0]?.email ?? '').toBe('');
    expect(
      await owner.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'anna@tandem.test')),
    ).toHaveLength(1);
  });
});
