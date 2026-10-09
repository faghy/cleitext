/**
 * Official plugins (milestone M4): SEO and Forms, built from plugins/ and
 * installed like any other plugin.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { CxdDocument } from '@cleitext/blocks';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
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

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;

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

async function publish(type: string, title: string, extra: Record<string, unknown> = {}) {
  const created = (await admin.post('/api/v1/entries', { type, title, ...extra })).json();
  const published = await admin.post(`/api/v1/entries/${created.id}/publish`);
  expect(published.statusCode).toBe(200);
  return published.json() as { id: string; slug: string };
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('seo', pluginsPath);
  await install('forms', pluginsPath);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'official');
  await seedUser(owner, {
    email: 'admin@official.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.9.0.1');
  await admin.login('admin@official.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.9.0.2');
  for (const slug of ['seo', 'forms']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('SEO', () => {
  it('adds a field group to pages and articles', async () => {
    const types = (await admin.get('/api/v1/content-types')).json();
    const article = types.find((t: { slug: string }) => t.slug === 'article');
    expect(article.fieldGroups.map((g: { id: string }) => g.id)).toEqual(['seo']);
  });

  it('uses the search title, description and indexing of an entry', async () => {
    const entry = await publish('article', 'A long and descriptive title', {
      fields: {
        seo: { title: 'Short title', description: 'What this article is about.', noindex: true },
      },
    });
    const html = (await visitor.get(`/${new Date().getUTCFullYear()}/${entry.slug}`)).body;
    expect(html).toContain('<title>Short title – Site official</title>');
    expect(html).toContain('<meta name="description" content="What this article is about."/>');
    expect(html).toContain('<meta name="robots" content="noindex, follow"/>');
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"headline":"Short title"');
  });

  it('validates its fields', async () => {
    const response = await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Too long',
      fields: { seo: { title: 'x'.repeat(71) } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].path).toBe('fields.seo.title');
  });

  it('applies the site settings', async () => {
    await admin.request('PATCH', '/api/v1/plugins/seo/settings', {
      separator: '|',
      defaultDescription: 'A site about things.',
      twitterSite: 'example',
    });
    const entry = await publish('page', 'About');
    const page = (await visitor.get(`/${entry.slug}`)).body;
    expect(page).toContain('<title>About | Site official</title>');
    expect(page).toContain('<meta name="description" content="A site about things."/>');
    expect(page).toContain('<meta name="twitter:site" content="@example"/>');
    expect((await visitor.get('/')).body).toContain('"@type":"WebSite"');
  });
});

describe('Forms', () => {
  let contact: { id: string; slug: string };
  const blockId = 'contact1';

  beforeAll(async () => {
    await admin.request('PATCH', '/api/v1/plugins/forms/settings', {
      recipient: 'owner@official.test',
    });
    const document: CxdDocument = {
      schema: 1,
      blocks: [
        {
          id: blockId,
          type: 'forms/contact',
          v: 1,
          attrs: { formName: 'Contact us', askPhone: true },
        },
      ],
    };
    contact = await publish('page', 'Contact', { document });
  });

  const submit = (fields: Record<string, string>, origin = `http://${site.host}`) =>
    app.inject({
      method: 'POST',
      url: '/_forms/submit',
      headers: {
        host: site.host,
        origin,
        referer: `http://${site.host}/${contact.slug}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      remoteAddress: `10.9.1.${Math.floor(Math.random() * 200)}`,
      payload: new URLSearchParams({ _form: 'Contact us', _block: blockId, ...fields }).toString(),
    });

  it('renders a form that works without JavaScript', async () => {
    const html = (await visitor.get(`/${contact.slug}`)).body;
    expect(html).toContain('action="/_forms/submit"');
    expect(html).toContain('name="phone"');
    expect(html).toContain('Thank you, we will reply soon.');
  });

  it('stores messages, emails them and goes back to the page', async () => {
    const response = await submit({
      name: 'Ada',
      email: 'ADA@example.com',
      message: 'Hello!\nHow are you?',
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(`/${contact.slug}#form-${blockId}-sent`);

    const messages = (await admin.get('/api/v1/ext/forms/submissions')).json();
    expect(messages[0]).toMatchObject({
      formName: 'Contact us',
      name: 'Ada',
      email: 'ada@example.com',
      pagePath: `/${contact.slug}`,
    });
    const mail = app.get(MailService).outbox.at(-1)!;
    expect(mail).toMatchObject({
      to: 'owner@official.test',
      replyTo: 'ada@example.com',
      subject: '[Contact us] Ada',
    });
  });

  it('refuses invalid, automated and cross-site messages', async () => {
    const before = (await admin.get('/api/v1/ext/forms/submissions')).json().length;
    const invalid = await submit({ name: 'Bob', email: 'not-an-email', message: 'Hi' });
    expect(invalid.headers.location).toMatch(/#form-contact1-error$/);
    const bot = await submit({
      name: 'Bot',
      email: 'bot@example.com',
      message: 'Buy',
      website: 'spam.test',
    });
    expect(bot.headers.location).toMatch(/-sent$/);
    expect(
      (await submit({ name: 'Eve', email: 'eve@example.com', message: 'Hi' }, 'https://evil.test'))
        .statusCode,
    ).toBe(403);
    expect((await admin.get('/api/v1/ext/forms/submissions')).json()).toHaveLength(before);
  });

  it('limits messages per address', async () => {
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/_forms/submit',
        headers: {
          host: site.host,
          origin: `http://${site.host}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        remoteAddress: '10.9.2.1',
        payload: 'name=Max&email=max%40example.com&message=Hi',
      });
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await send()).statusCode);
    expect(statuses).toEqual([303, 303, 303, 303, 303, 429]);
  });

  it('lets editors read and delete messages', async () => {
    const [message] = (await admin.get('/api/v1/ext/forms/submissions')).json();
    expect(
      (await admin.request('DELETE', `/api/v1/ext/forms/submissions/${message.id}`)).statusCode,
    ).toBe(204);
    expect((await visitor.get('/api/v1/ext/forms/submissions')).statusCode).toBe(401);
  });
});
