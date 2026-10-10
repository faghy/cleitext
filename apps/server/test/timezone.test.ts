/** Time zone and date format of a site (RF-SET-01, RF-CNT-08). */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'timezone');
  await seedUser(owner, {
    email: 'admin@timezone.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.13.0.1');
  await admin.login('admin@timezone.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('time zone and date format', () => {
  it('are used for public dates and returned to the admin', async () => {
    await admin.request('PATCH', '/api/v1/settings/core', {
      timezone: 'Pacific/Auckland',
      dateStyle: 'short',
    });
    expect((await admin.get('/api/v1/auth/me')).json().site.timezone).toBe('Pacific/Auckland');
    expect(
      (await admin.request('PATCH', '/api/v1/settings/core', { timezone: 'Mars/Olympus' }))
        .statusCode,
    ).toBe(400);

    // 23:30 UTC is already the next day in Auckland.
    const entry = (
      await admin.post('/api/v1/entries', { type: 'article', title: 'Late news' })
    ).json();
    await admin.post(`/api/v1/entries/${entry.id}/publish`);
    const { entries } = await import('@cleitext/db');
    const { eq } = await import('drizzle-orm');
    const { withSiteContext } = await import('@cleitext/db');
    await withSiteContext(owner.db, site.id, (tx) =>
      tx
        .update(entries)
        .set({ publishedAt: new Date('2026-03-01T23:30:00Z') })
        .where(eq(entries.id, entry.id)),
    );
    await admin.request('PATCH', '/api/v1/settings/core', { tagline: 'refresh' });
    const page = (await new TestClient(app, site.host, '10.13.0.4').get('/2026/late-news')).body;
    expect(page).toContain('>3/2/26</time>');
  });
});
