/** Email settings per site, with a test message (RF-SET-02). */
import { settings, withSiteContext, type DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let mail: MailService;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'mailing');
  await seedUser(owner, {
    email: 'admin@mailing.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'editor@mailing.test', password: PASSWORD, site, role: 'editor' });
  admin = new TestClient(app, site.host, '10.14.0.1');
  await admin.login('admin@mailing.test', PASSWORD);
  mail = app.get(MailService);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('site email settings', () => {
  it('uses the server settings until the site has its own', async () => {
    expect((await admin.get('/api/v1/settings/mail')).json()).toMatchObject({ configured: false });
    await admin.post('/api/v1/settings/mail/test', { to: 'me@mailing.test' });
    // Without MAIL_FROM, as the site: its name, no-reply at its domain.
    expect(mail.outbox.at(-1)).toMatchObject({
      to: 'me@mailing.test',
      via: 'server',
      from: expect.stringMatching(
        new RegExp(`^".+" <no-reply@${site.host.replace(/\./g, '\\.')}>$`),
      ),
    });
  });

  it('stores SMTP settings with an encrypted password, never returned', async () => {
    const saved = await admin.request('PUT', '/api/v1/settings/mail', {
      host: 'smtp.mailing.test',
      port: 587,
      security: 'starttls',
      user: 'mailer',
      password: 'smtp secret password',
      from: 'Mailing <hello@mailing.test>',
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({
      configured: true,
      host: 'smtp.mailing.test',
      port: 587,
      security: 'starttls',
      user: 'mailer',
      from: 'Mailing <hello@mailing.test>',
      hasPassword: true,
      serverLogsOnly: false,
    });
    const rows = await withSiteContext(owner.db, site.id, (tx) =>
      tx.select().from(settings).where(eq(settings.namespace, 'mail')),
    );
    expect(JSON.stringify(rows)).not.toContain('smtp secret password');

    // Saving without a password keeps it.
    const again = await admin.request('PUT', '/api/v1/settings/mail', {
      host: 'smtp.mailing.test',
      port: 465,
      security: 'tls',
      from: 'Mailing <hello@mailing.test>',
    });
    expect(again.json()).toMatchObject({ port: 465, hasPassword: true, user: null });
  });

  it('sends test emails and site emails with the site sender', async () => {
    const test = await admin.post('/api/v1/settings/mail/test', { to: 'me@mailing.test' });
    expect(test.json()).toEqual({ sent: true });
    expect(mail.outbox.at(-1)).toMatchObject({ via: 'site', from: 'Mailing <hello@mailing.test>' });
    await admin.post('/api/v1/users/invite', {
      email: 'new@mailing.test',
      displayName: 'New',
      role: 'author',
    });
    expect(mail.outbox.at(-1)).toMatchObject({ to: 'new@mailing.test', via: 'site' });
  });

  it('can go back to the server settings', async () => {
    expect((await admin.request('DELETE', '/api/v1/settings/mail')).json().configured).toBe(false);
    await admin.post('/api/v1/settings/mail/test', { to: 'me@mailing.test' });
    expect(mail.outbox.at(-1)).toMatchObject({ via: 'server' });
  });

  it('validates input and is reserved to administrators', async () => {
    expect(
      (await admin.request('PUT', '/api/v1/settings/mail', { host: 'bad host', port: 0 }))
        .statusCode,
    ).toBe(400);
    const editor = new TestClient(app, site.host, '10.14.0.2');
    await editor.login('editor@mailing.test', PASSWORD);
    expect((await editor.get('/api/v1/settings/mail')).statusCode).toBe(403);
  });
});
