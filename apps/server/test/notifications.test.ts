/** Each person can turn off the notification emails in their profile (plugin API 1.75). */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { DatabaseClient } from '@cleitext/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetLimits } from '../src/community/limits.js';
import { MailService } from '../src/mail/mail.service.js';
import { PluginServicesProvider } from '../src/plugins/plugin-services.service.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let mail: MailService;
let admin: TestClient;
let host: string;
let postId: string;
let postPath: string;

const later = () => String(Date.now() - 5000);

async function comment(text: string, ip: string) {
  resetLimits();
  const guest = new TestClient(app, host, ip);
  await guest.get(postPath);
  const posted = await guest.postForm('/comments', {
    entry: postId,
    back: postPath,
    comment: text,
    name: 'Gina',
    email: `gina-${ip}@x.test`,
    ts: later(),
  });
  expect(posted.statusCode).toBe(303);
}

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  mail = app.get(MailService);
  const site = await seedSite(owner, 'notifications');
  host = site.host;
  await seedUser(owner, {
    email: 'admin@notifications.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, host, '10.52.0.1');
  await admin.login('admin@notifications.test', PASSWORD);
  postId = (
    await admin.post('/api/v1/entries', { type: 'article', title: 'Quiet', slug: 'quiet-please' })
  ).json().id;
  await admin.post(`/api/v1/entries/${postId}/publish`);
  postPath = `/${new Date().getFullYear()}/quiet-please`;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('notification emails', () => {
  it('are on by default: moderators hear about a comment waiting', async () => {
    expect((await admin.get('/api/v1/profile/about')).json().notifications).toBe(true);
    await comment('Waiting one', '10.52.0.2');
    expect(
      mail.outbox.some(
        (m) => m.to === 'admin@notifications.test' && m.text.includes('Waiting one'),
      ),
    ).toBe(true);
  });

  it('stop when the person turns them off in the profile', async () => {
    const saved = await admin.request('PATCH', '/api/v1/profile', { notifications: false });
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await admin.get('/api/v1/profile/about')).json().notifications).toBe(false);
    await comment('Waiting two', '10.52.0.3');
    expect(mail.outbox.some((m) => m.text.includes('Waiting two'))).toBe(false);
    // Plugins' notices (`notification: true`) leave the address out too.
    const muted = await app
      .get(PluginServicesProvider)
      .mutedEmails(['ADMIN@notifications.test', 'someone@else.test']);
    expect([...muted]).toEqual(['admin@notifications.test']);
  });

  it('come back when turned on again', async () => {
    await admin.request('PATCH', '/api/v1/profile', { notifications: true });
    await comment('Waiting three', '10.52.0.4');
    expect(mail.outbox.some((m) => m.text.includes('Waiting three'))).toBe(true);
  });
});
