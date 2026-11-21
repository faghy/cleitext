/** Push notifications of the official app: devices, status, and what the relay is sent. */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pushDevices, users, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { appVersion } from '../src/common/version.js';
import { resetLimits } from '../src/community/limits.js';
import { PushService, type RelayPayload } from '../src/push/push.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const RELAY = 'https://relay.example/api/v1/ext/push-relay/send';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let author: TestClient;
let adminToken: string;
let readToken: string;
const sent: { url: string; payload: RelayPayload; origin: string }[] = [];
let invalid: string[] = [];

/** A request with a Bearer token, as the app sends it (no cookie, no CSRF). */
const bearer = (
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    headers: { host: site.host, authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });

async function apiToken(client: TestClient, scopes: string[]) {
  const response = await client.post('/api/v1/tokens', {
    name: 'app',
    scopes,
    expiresInDays: null,
  });
  expect(response.statusCode).toBe(201);
  return response.json().token as string;
}

beforeAll(async () => {
  app = await startTestApp({ env: { CLEITEXT_PUSH_RELAY: RELAY } });
  app.get(PushService).transport = async (url, payload, origin) => {
    sent.push({ url, payload, origin });
    return { invalid };
  };
  owner = ownerDatabase();
  site = await seedSite(owner, 'push');
  const adminId = await seedUser(owner, {
    email: 'admin@push.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  // The administrator reads Italian.
  await owner.db.update(users).set({ locale: 'it' }).where(eq(users.id, adminId));
  await seedUser(owner, { email: 'author@push.test', password: PASSWORD, site, role: 'author' });
  admin = new TestClient(app, site.host, '10.71.0.1');
  await admin.login('admin@push.test', PASSWORD);
  author = new TestClient(app, site.host, '10.71.0.2');
  await author.login('author@push.test', PASSWORD);
  adminToken = await apiToken(admin, ['read', 'write']);
  readToken = await apiToken(admin, ['read']);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('push devices', () => {
  let phone: string;

  it('tells the app which events the person can receive', async () => {
    const status = await bearer(adminToken, 'GET', '/api/v1/push/status');
    expect(status.statusCode).toBe(200);
    // Forms and Cleishop are not active here.
    expect(status.json()).toEqual({ enabled: true, events: ['comment.pending'] });
    expect((await author.get('/api/v1/push/status')).json()).toEqual({
      enabled: true,
      events: [],
    });
  });

  it('registers a phone with a Bearer token, and refreshes it', async () => {
    const created = await bearer(adminToken, 'POST', '/api/v1/push/devices', {
      token: 'fcm-admin-1',
      platform: 'ios',
      name: 'iPhone',
    });
    expect(created.statusCode).toBe(201);
    const device = created.json();
    expect(device).toMatchObject({
      platform: 'ios',
      name: 'iPhone',
      events: ['comment.pending', 'form.message', 'shop.order'],
    });
    expect(Object.keys(device).sort()).toEqual(
      ['createdAt', 'events', 'id', 'lastSeenAt', 'name', 'platform'].sort(),
    );
    phone = device.id;

    const events = await bearer(adminToken, 'PUT', `/api/v1/push/devices/${phone}`, {
      events: ['comment.pending'],
    });
    expect(events.json().events).toEqual(['comment.pending']);
    const again = await bearer(adminToken, 'POST', '/api/v1/push/devices', {
      token: 'fcm-admin-1',
      platform: 'ios',
    });
    // Same phone: same id, name and events kept.
    expect(again.json()).toMatchObject({ id: phone, name: 'iPhone', events: ['comment.pending'] });
  });

  it('checks what it is given', async () => {
    const bad = [
      { token: '', platform: 'ios' },
      { token: 'x', platform: 'windows' },
      { token: 'with space', platform: 'android' },
    ];
    for (const body of bad)
      expect((await bearer(adminToken, 'POST', '/api/v1/push/devices', body)).statusCode).toBe(400);
    expect(
      (
        await bearer(adminToken, 'PUT', `/api/v1/push/devices/${phone}`, {
          events: ['everything'],
        })
      ).statusCode,
    ).toBe(400);
    // A read-only token cannot register.
    expect(
      (
        await bearer(readToken, 'POST', '/api/v1/push/devices', {
          token: 'fcm-read',
          platform: 'android',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: '/api/v1/push/devices', headers: { host: site.host } })).statusCode,
    ).toBe(401);
  });

  it('shows and changes only the person’s own phones', async () => {
    const theirs = (
      await author.post('/api/v1/push/devices', { token: 'fcm-author-1', platform: 'android' })
    ).json();
    const mine = (await admin.get('/api/v1/push/devices')).json() as { id: string }[];
    expect(mine.map((d) => d.id)).toEqual([phone]);
    expect(
      (await admin.request('PUT', `/api/v1/push/devices/${theirs.id}`, { events: [] })).statusCode,
    ).toBe(404);
    expect((await admin.delete(`/api/v1/push/devices/${theirs.id}`)).statusCode).toBe(404);
    expect((await author.get('/api/v1/push/devices')).json()).toHaveLength(1);
  });

  it('sends a waiting comment to the moderators, in their language', async () => {
    resetLimits();
    const created = (
      await admin.post('/api/v1/entries', { type: 'article', title: 'Talk', slug: 'talk' })
    ).json();
    await admin.post(`/api/v1/entries/${created.id}/publish`);
    const guest = new TestClient(app, site.host, '10.71.0.9');
    const posted = await guest.postForm('/comments', {
      entry: created.id,
      back: `/${new Date().getFullYear()}/talk`,
      comment: 'Is it\nopen on Sunday?',
      name: 'Gina',
      email: 'gina@x.test',
      ts: String(Date.now() - 5000),
    });
    expect(posted.statusCode).toBe(303);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const [call] = sent;
    expect(call!.url).toBe(RELAY);
    expect(call!.origin).toBe(`http://${site.host}`);
    // The author has no moderation capability: only the administrator's phone.
    expect(call!.payload).toMatchObject({
      tokens: ['fcm-admin-1'],
      title: 'Commento da moderare',
      body: 'Gina: Is it open on Sunday?',
      data: {
        type: 'comment.pending',
        siteUrl: `http://${site.host}`,
        adminPath: '/cl-admin/comments?status=pending',
      },
    });
    expect(call!.payload.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('forgets the phones the relay reports as invalid', async () => {
    invalid = ['fcm-admin-1'];
    sent.length = 0;
    const created = (
      await admin.post('/api/v1/entries', { type: 'article', title: 'More', slug: 'more' })
    ).json();
    await admin.post(`/api/v1/entries/${created.id}/publish`);
    await new TestClient(app, site.host, '10.71.0.10').postForm('/comments', {
      entry: created.id,
      back: `/${new Date().getFullYear()}/more`,
      comment: 'Hello',
      name: 'Pia',
      email: 'pia@x.test',
      ts: String(Date.now() - 5000),
    });
    await vi.waitFor(async () => {
      expect(sent).toHaveLength(1);
      const left = await withSiteContext(owner.db, site.id, (tx) =>
        tx.select().from(pushDevices).where(eq(pushDevices.token, 'fcm-admin-1')),
      );
      expect(left).toHaveLength(0);
    });
    invalid = [];
  });

  it('removes a phone', async () => {
    const theirs = (await author.get('/api/v1/push/devices')).json() as { id: string }[];
    expect((await author.delete(`/api/v1/push/devices/${theirs[0]!.id}`)).statusCode).toBe(204);
    expect((await author.get('/api/v1/push/devices')).json()).toEqual([]);
  });
});

describe('the call to the relay', () => {
  it('says who calls, with the core version', async () => {
    const seen: Record<string, string | string[] | undefined>[] = [];
    const server = createServer((req, res) => {
      seen.push(req.headers);
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"invalid":[]}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      // The service's own transport, not the one the tests above replaced.
      const service = new PushService(null as never, null as never, null as never);
      await service.transport(
        `http://127.0.0.1:${port}/send`,
        {} as RelayPayload,
        'https://site.example',
      );
      expect(seen[0]!['user-agent']).toBe(`Cleitext/${appVersion()} (+https://cleitext.com)`);
      expect(appVersion()).toMatch(/^\d+\.\d+\.\d+/);
      expect(seen[0]!['x-cleitext-site']).toBe('https://site.example');
    } finally {
      server.close();
    }
  });
});
