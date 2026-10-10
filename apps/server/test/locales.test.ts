/** Languages, time zone and date format of a site (RF-SET-01, RF-CNT-08). */
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
  site = await seedSite(owner, 'languages');
  await seedUser(owner, {
    email: 'admin@languages.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'editor@languages.test',
    password: PASSWORD,
    site,
    role: 'editor',
  });
  admin = new TestClient(app, site.host, '10.13.0.1');
  await admin.login('admin@languages.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('languages', () => {
  it('adds a language, makes it the default and removes unused ones', async () => {
    const added = await admin.post('/api/v1/site/locales', { code: 'it', name: 'Italiano' });
    expect(added.statusCode).toBe(201);
    expect(added.json().map((l: { code: string }) => l.code)).toEqual(['en', 'it']);
    expect(
      (await admin.post('/api/v1/site/locales', { code: 'it', name: 'Again' })).statusCode,
    ).toBe(409);
    expect(
      (await admin.post('/api/v1/site/locales', { code: 'Italian', name: 'X' })).statusCode,
    ).toBe(400);

    const entry = (
      await admin.post('/api/v1/entries', { type: 'page', title: 'Chi siamo', locale: 'it' })
    ).json();
    await admin.post(`/api/v1/entries/${entry.id}/publish`);
    const visitor = new TestClient(app, site.host, '10.13.0.2');
    expect((await visitor.get('/it/chi-siamo')).statusCode).toBe(200);

    // Italian becomes the default: no prefix any more, English gets /en.
    const changed = await admin.request('PATCH', '/api/v1/site/locales/it', { isDefault: true });
    expect(changed.json().find((l: { code: string }) => l.code === 'it').isDefault).toBe(true);
    expect((await admin.get('/api/v1/auth/me')).json().site.defaultLocale).toBe('it');
    expect((await visitor.get('/chi-siamo')).statusCode).toBe(200);

    // The default and used languages cannot be removed.
    expect((await admin.request('DELETE', '/api/v1/site/locales/it')).statusCode).toBe(400);
    await admin.request('PATCH', '/api/v1/site/locales/en', { isDefault: true });
    expect((await admin.request('DELETE', '/api/v1/site/locales/it')).statusCode).toBe(409);
    await admin.post('/api/v1/site/locales', { code: 'de', name: 'Deutsch' });
    const removed = await admin.request('DELETE', '/api/v1/site/locales/de');
    expect(removed.json().map((l: { code: string }) => l.code)).toEqual(['en', 'it']);
  });

  it('is reserved to users who manage settings', async () => {
    const editor = new TestClient(app, site.host, '10.13.0.3');
    await editor.login('editor@languages.test', PASSWORD);
    expect((await editor.get('/api/v1/site/locales')).statusCode).toBe(403);
  });
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
