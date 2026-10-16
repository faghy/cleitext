/** Toolbar on the public site for signed-in users, as in WordPress. */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { users, type DatabaseClient } from '@cleitext/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let editor: TestClient;
let subscriber: TestClient;
let visitor: TestClient;
let entryId: string;
let path: string;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const site = await seedSite(owner, 'toolbar');
  await seedUser(owner, {
    email: 'editor@toolbar.test',
    password: PASSWORD,
    site,
    role: 'editor',
  });
  await owner.db
    .update(users)
    .set({ displayName: 'Ada <Editor>' })
    .where(eq(users.email, 'editor@toolbar.test'));
  await seedUser(owner, {
    email: 'reader@toolbar.test',
    password: PASSWORD,
    site,
    role: 'subscriber',
  });
  editor = new TestClient(app, site.host, '10.41.0.1');
  subscriber = new TestClient(app, site.host, '10.41.0.2');
  visitor = new TestClient(app, site.host, '10.41.0.3');
  await editor.login('editor@toolbar.test', PASSWORD);
  await subscriber.login('reader@toolbar.test', PASSWORD);
  const created = (
    await editor.post('/api/v1/entries', { type: 'page', title: 'About us', slug: 'about' })
  ).json();
  entryId = created.id;
  await editor.post(`/api/v1/entries/${entryId}/publish`);
  path = '/about';
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('public toolbar', () => {
  it('is not shown to visitors, and stays out of the page cache', async () => {
    const first = await visitor.get(path);
    expect(first.statusCode).toBe(200);
    expect(first.body).not.toContain('cleitext-admin-bar');

    const signedIn = await editor.get(path);
    expect(signedIn.body).toContain('id="cleitext-admin-bar"');
    expect(signedIn.headers['x-cache']).toBe('BYPASS');
    expect(signedIn.headers['cache-control']).toContain('private');

    const again = await visitor.get(path);
    expect(again.headers['x-cache']).toBe('HIT');
    expect(again.body).not.toContain('cleitext-admin-bar');
  });

  it('leads editors to the admin and to the editor of the page', async () => {
    const { body } = await editor.get(path);
    const bar = /<nav id="cleitext-admin-bar"[\s\S]*?<\/nav>/.exec(body)![0];
    expect(bar).toContain('href="/cl-admin/"');
    expect(bar).toContain(`href="/cl-admin/entries/${entryId}"`);
    expect(bar).toContain('Edit page');
    // Escaped user data.
    expect(bar).toContain('Ada &lt;Editor&gt;');
    expect(bar).not.toContain('<Editor>');
    // Right after <body>, so it works with every theme.
    expect(body).toMatch(/<body[^>]*><style>/);
  });

  it('shows subscribers who they are, with their account instead of the admin', async () => {
    const { body } = await subscriber.get(path);
    expect(body).toContain('id="cleitext-admin-bar"');
    expect(body).not.toContain('/cl-admin/entries/');
    expect(body).not.toContain('href="/cl-admin/');
    expect(body).toContain('href="/account"');
    expect(body).toContain('action="/account/logout"');
  });
});
