/**
 * The Privacy & GDPR plugin (shipped on its own) with Forms: cookie banner,
 * consent log, policies, and requests to export or erase personal data.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
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
let contactSlug: string;

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

const config = async () => (await admin.get('/api/v1/ext/privacy/config')).json();
const saveConfig = (body: unknown) => admin.request('PUT', '/api/v1/ext/privacy/config', body);
const consent = (body: unknown, origin = `http://${site.host}`) =>
  app.inject({
    method: 'POST',
    url: '/_privacy/consent',
    headers: { host: site.host, origin, 'content-type': 'application/json', 'user-agent': 'Test' },
    remoteAddress: '203.0.113.42',
    payload: JSON.stringify(body),
  });

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('forms', pluginsPath);
  await install('privacy', pluginsPath);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'privacy');
  await seedUser(owner, {
    email: 'admin@privacy.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.40.0.1');
  await admin.login('admin@privacy.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.40.0.2');
  for (const slug of ['forms', 'privacy']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  }
  contactSlug = (
    await publish('page', 'Contact', {
      document: {
        schema: 1,
        blocks: [
          {
            id: 'contact1',
            type: 'forms/contact',
            v: 1,
            attrs: { formName: 'Contact', privacyUrl: '/privacy-policy' },
          },
        ],
      },
    })
  ).slug;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('cookie banner', () => {
  it('is on every public page, with "Reject all" as visible as "Accept all"', async () => {
    const html = (await visitor.get('/')).body;
    expect(html).toContain('id="cx-consent"');
    expect(html).toContain('data-version="1"');
    expect(html).toContain('data-categories="statistics,marketing"');
    expect(html).toMatch(/data-cx="reject">Reject all</);
    expect(html).toMatch(/data-cx="accept">Accept all</);
    // Nothing is pre-checked.
    expect(html).not.toMatch(/name="cx-category" value="\w+" checked/);
  });

  it('keeps scripts inert until consent, and sets Google Consent Mode defaults', async () => {
    const current = await config();
    const saved = await saveConfig({
      ...current,
      banner: {
        ...current.banner,
        consentMode: true,
        scripts: {
          statistics:
            '<script async src="https://stats.example/a.js"></script><script>track()</script>',
          marketing: '<iframe src="https://video.example/embed/1" title="Video"></iframe>',
        },
      },
    });
    expect(saved.statusCode).toBe(200);
    // Same categories and cookies: visitors are not asked again.
    expect(saved.json().version).toBe(1);
    const html = (await visitor.get('/')).body;
    expect(html).toContain(
      '<script type="text/plain" data-cx-category="statistics" async src="https://stats.example/a.js">',
    );
    expect(html).toContain('<script type="text/plain" data-cx-category="statistics">track()');
    expect(html).toContain(
      'data-cx-category="marketing" data-cx-src="https://video.example/embed/1"',
    );
    expect(html).not.toMatch(/\ssrc="https:\/\/video\.example/);
    expect(html).toMatch(/<head[^>]*><script>window\.dataLayer/);
  });

  it('asks again when categories or cookies change', async () => {
    const current = await config();
    const saved = (
      await saveConfig({ ...current, banner: { ...current.banner, categories: ['statistics'] } })
    ).json();
    expect(saved.version).toBe(2);
    expect((await saveConfig({ ...saved, askAgain: true })).json().version).toBe(3);
  });

  it('is not shown when the site only uses technical cookies', async () => {
    const current = await config();
    await saveConfig({ ...current, banner: { ...current.banner, categories: [] } });
    expect((await visitor.get('/')).body).not.toContain('id="cx-consent"');
    await saveConfig({
      ...current,
      banner: { ...current.banner, categories: ['statistics', 'marketing'] },
    });
  });
});

describe('consent log', () => {
  it('records choices with a shortened IP', async () => {
    expect(
      (await consent({ id: 'abc123def456', categories: ['statistics', 'bogus'], version: 4 }))
        .statusCode,
    ).toBe(204);
    expect((await consent({ id: 'fed654cba321', categories: [], version: 4 })).statusCode).toBe(
      204,
    );
    expect((await consent({ id: 'x', categories: [] })).statusCode).toBe(400);
    // Other sites cannot write here.
    expect(
      (await consent({ id: 'abc123def456', categories: [] }, 'https://evil.test')).statusCode,
    ).toBe(403);

    const stats = (await admin.get('/api/v1/ext/privacy/consents')).json();
    expect(stats).toMatchObject({
      total: 2,
      rejected: 1,
      byCategory: { statistics: 1, marketing: 0 },
    });
    expect(stats.recent[1]).toMatchObject({
      id: 'abc123def456',
      categories: ['statistics'],
      ip: '203.0.113.0',
    });
    const csv = await admin.get('/api/v1/ext/privacy/consents.csv');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('abc123def456,"statistics",4,203.0.113.0,"Test"');
  });

  it('is only for privacy managers', async () => {
    expect((await visitor.get('/api/v1/ext/privacy/consents')).statusCode).toBe(401);
  });
});

describe('policies', () => {
  it('writes the policies as ordinary blocks, linked from the banner once published', async () => {
    const current = await config();
    await saveConfig({
      ...current,
      controller: { ...current.controller, name: 'Rossi Srl', email: 'privacy@rossi.test' },
      processing: { ...current.processing, analytics: 'Matomo', hosting: 'Hosting Spa' },
    });
    const draft = (
      await admin.get(
        `/api/v1/ext/privacy/policy/privacy?locale=it&site=Rossi&origin=https://rossi.test`,
      )
    ).json();
    expect(draft).toMatchObject({ title: 'Privacy policy', slug: 'privacy-policy' });
    const text = JSON.stringify(draft.document);
    expect(text).toContain('Rossi Srl');
    expect(text).toContain('Matomo');
    expect(text).toContain('Garante per la protezione dei dati personali');
    expect(draft.document.blocks[0].type).toBe('core/paragraph');

    const cookies = (await admin.get('/api/v1/ext/privacy/policy/cookies?locale=en')).json();
    const types = cookies.document.blocks.map((b: { type: string }) => b.type);
    expect(types).toContain('privacy/cookie-table');
    expect(types).toContain('privacy/preferences');

    const page = await publish('page', draft.title, { slug: draft.slug, document: draft.document });
    const cookiePage = await publish('page', cookies.title, {
      slug: cookies.slug,
      document: cookies.document,
    });
    const saved = await config();
    await saveConfig({ ...saved, pages: { en: { privacy: page.id, cookies: cookiePage.id } } });
    const home = (await visitor.get('/')).body;
    expect(home).toContain(`<a href="/${page.slug}">Privacy policy</a>`);

    // Marked next to their title in the admin.
    const marked = (await admin.get(`/api/v1/entries/${page.id}`)).json();
    expect(marked.states).toEqual([{ key: 'privacy', label: 'Privacy policy' }]);
    const list = (await admin.get('/api/v1/entries?type=page&limit=50')).json() as {
      items: { id: string; states?: { key: string }[] }[];
    };
    expect(list.items.find((e) => e.id === cookiePage.id)?.states?.[0]?.key).toBe('cookies');

    const html = (await visitor.get(`/${cookiePage.slug}`)).body;
    expect(html).toContain('<code>cx_consent</code>');
    expect(html).toContain('href="#cookie-preferences"');
  });

  it('adds a privacy notice to contact forms', async () => {
    const html = (await visitor.get(`/${contactSlug}`)).body;
    expect(html).toContain('<a href="/privacy-policy">privacy policy</a>');
  });
});

describe('requests about personal data', () => {
  it('exports the data of the core and of the plugins, then erases it', async () => {
    const sent = await app.inject({
      method: 'POST',
      url: '/_forms/submit',
      headers: {
        host: site.host,
        origin: `http://${site.host}`,
        referer: `http://${site.host}/${contactSlug}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      remoteAddress: '10.40.1.1',
      payload: new URLSearchParams({
        _form: 'Contact',
        _block: 'contact1',
        name: 'Bob',
        email: 'bob@example.com',
        message: 'Please call me.',
      }).toString(),
    });
    expect(sent.statusCode).toBe(303);

    const exported = await admin.post('/api/v1/ext/privacy/requests', {
      kind: 'export',
      email: 'BOB@example.com',
      locale: 'it',
    });
    expect(exported.statusCode).toBe(200);
    const data = exported.json();
    expect(data.items).toBe(1);
    const forms = data.data.find((s: { source: string }) => s.source === 'forms');
    expect(forms.label).toBe('Messaggi dei moduli');
    expect(forms.groups[0].items[0]).toMatchObject({ name: 'Bob', message: 'Please call me.' });

    // The core: the account of a member, with sessions and activity.
    const account = (
      await admin.post('/api/v1/ext/privacy/requests', {
        kind: 'export',
        email: 'admin@privacy.test',
      })
    ).json();
    const core = account.data.find((s: { source: string }) => s.source === 'core');
    expect(core.groups.map((g: { id: string }) => g.id)).toEqual([
      'core.account',
      'core.sessions',
      'core.tokens',
      'core.activity',
    ]);
    expect(core.groups[0].items[0]).toMatchObject({ email: 'admin@privacy.test' });

    const erased = (
      await admin.post('/api/v1/ext/privacy/requests', { kind: 'erase', email: 'bob@example.com' })
    ).json();
    // The message, and the address in the earlier export request.
    expect(erased).toMatchObject({ removed: 2, retained: 0 });
    const again = (
      await admin.post('/api/v1/ext/privacy/requests', { kind: 'export', email: 'bob@example.com' })
    ).json();
    expect(again.items).toBe(0);
    expect((await admin.get('/api/v1/ext/forms/submissions')).json()).toEqual([]);

    // The log keeps what was done; erasures without the full address.
    const log = (await admin.get('/api/v1/ext/privacy/requests')).json();
    expect(log.map((r: { kind: string }) => r.kind)).toEqual([
      'export',
      'erase',
      'export',
      'export',
    ]);
    expect(log[1].email).toBe('bo…@example.com');
    expect(log[3].email).toBe('bo…@example.com');
  });

  it('keeps accounts, which are deleted from Users', async () => {
    const erased = (
      await admin.post('/api/v1/ext/privacy/requests', {
        kind: 'erase',
        email: 'admin@privacy.test',
      })
    ).json();
    expect(erased.retained).toBe(1);
    expect(erased.results[0].messages[0]).toContain('delete it from Users');
  });

  it('refuses invalid requests', async () => {
    expect(
      (await admin.post('/api/v1/ext/privacy/requests', { kind: 'export', email: 'nope' }))
        .statusCode,
    ).toBe(400);
  });
});
