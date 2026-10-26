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
    // Nothing of an external consent manager.
    expect(html).not.toMatch(/iubenda|cookiebot|cookieyes/i);
    expect(html).not.toContain('data-cmp=');
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

  it('holds videos of other sites until consent to marketing, with a notice', async () => {
    const page = await publish('page', 'Video', {
      document: {
        schema: 1,
        blocks: [
          {
            id: 'yt1',
            type: 'core/embed',
            v: 1,
            attrs: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
          },
        ],
      },
    });
    const html = (await visitor.get(`/${page.slug}`)).body;
    expect(html).toMatch(
      /<iframe data-cx-category="marketing" data-cx-src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ[^"]*" srcdoc="[^"]*Content of YouTube/,
    );
    // The notice: accept and show, the cookie preferences, the video on its own site.
    const notice = /srcdoc="([^"]*)"/.exec(html)![1]!;
    expect(notice).toContain('data-cx-allow=&#34;marketing&#34;');
    expect(notice).toContain('Accept and show');
    expect(notice).toContain('Cookie preferences');
    expect(notice).toContain('Open on YouTube');
    expect(notice).not.toContain('youtube.com/vi');
    // The page's consent script answers the notice's buttons.
    expect(html).toContain('data-cx-allow');
    expect(html).not.toMatch(/<iframe[^>]*\ssrc="https:\/\/www\.youtube/);
    // The consent script swaps the notice for the video.
    expect(html).toContain("n.removeAttribute('srcdoc')");
  });

  it('holds social embeds too, in the category chosen for embeds', async () => {
    const page = await publish('page', 'Canale Tik Tok', {
      document: {
        schema: 1,
        blocks: [
          {
            id: 'tt1',
            type: 'core/embed',
            v: 1,
            attrs: { url: 'https://www.tiktok.com/@linomissio', providerNameSlug: 'tiktok' },
          },
        ],
      },
    });
    const held = (await visitor.get(`/${page.slug}`)).body;
    expect(held).toMatch(
      /<iframe data-cx-category="marketing" data-cx-src="https:\/\/www\.tiktok\.com\/embed\/@linomissio" srcdoc="[^"]*Content of TikTok[^"]*“Marketing”/,
    );
    expect(held).toContain('title="TikTok profile @linomissio"');
    expect(held).not.toMatch(/<iframe[^>]*\ssrc="https:\/\/www\.tiktok/);

    const current = await config();
    const saved = await saveConfig({
      ...current,
      banner: { ...current.banner, embedCategory: 'statistics' },
    });
    expect(saved.json().banner.embedCategory).toBe('statistics');
    // Not a change of what visitors agreed to: they are not asked again.
    expect(saved.json().version).toBe(current.version);
    const statistics = (await visitor.get(`/${page.slug}`)).body;
    expect(statistics).toMatch(
      /<iframe data-cx-category="statistics" data-cx-src="https:\/\/www\.tiktok\.com\/embed\/@linomissio" srcdoc="[^"]*“Statistics”[^"]*data-cx-allow=&#34;statistics&#34;/,
    );
    // An unknown category is not saved.
    const stored = saved.json() as { banner: Record<string, unknown> };
    const bogus = await saveConfig({ ...stored, banner: { ...stored.banner, embedCategory: 'x' } });
    expect(bogus.json().banner.embedCategory).toBe('statistics');
    await saveConfig({ ...current, banner: { ...current.banner, embedCategory: 'marketing' } });
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
    // The version recorded is the site's, not the one the browser sends.
    expect(csv.body).toMatch(/abc123def456,"statistics",\d+,203\.0\.113\.0,"Test"/);
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

  it('exports comments, then anonymizes them and keeps their text', async () => {
    const post = await publish('article', 'Comment on me');
    const sent = await app.inject({
      method: 'POST',
      url: '/comments',
      headers: {
        host: site.host,
        origin: `http://${site.host}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      remoteAddress: '10.40.2.1',
      payload: new URLSearchParams({
        entry: post.id,
        back: '/',
        comment: 'A thoughtful remark.',
        name: 'Carla',
        email: 'carla@example.com',
        url: 'https://carla.example',
        ts: String(Date.now() - 5000),
      }).toString(),
    });
    expect(sent.statusCode).toBe(303);

    const exported = (
      await admin.post('/api/v1/ext/privacy/requests', {
        kind: 'export',
        email: 'carla@example.com',
      })
    ).json();
    const core = exported.data.find((s: { source: string }) => s.source === 'core');
    expect(core.groups.map((g: { id: string }) => g.id)).toEqual(['core.comments']);
    expect(core.groups[0].items[0]).toMatchObject({
      on: 'Comment on me',
      name: 'Carla',
      website: 'https://carla.example',
      content: 'A thoughtful remark.',
      ip: '10.40.2.1',
    });

    const erased = (
      await admin.post('/api/v1/ext/privacy/requests', {
        kind: 'erase',
        email: 'carla@example.com',
      })
    ).json();
    const comments = erased.results.find((r: { source: string }) => r.source === 'core.comments');
    expect(comments).toMatchObject({ removed: 1, retained: 0 });
    const list = (await admin.get('/api/v1/comments?search=thoughtful')).json();
    expect(list.items[0]).toMatchObject({
      authorName: 'Anonymous',
      authorEmail: '',
      ip: null,
      content: 'A thoughtful remark.',
    });
  });

  it('refuses invalid requests', async () => {
    expect(
      (await admin.post('/api/v1/ext/privacy/requests', { kind: 'export', email: 'nope' }))
        .statusCode,
    ).toBe(400);
  });
});

describe('external consent managers', () => {
  const CBID = '1a2b3c4d-1111-2222-3333-444455556666';
  let videoSlug: string;
  const withCmp = async (cmp: Record<string, unknown>, banner: Record<string, unknown> = {}) => {
    const current = await config();
    return saveConfig({
      ...current,
      banner: { ...current.banner, ...banner },
      cmp: { ...current.cmp, ...cmp },
    });
  };

  beforeAll(async () => {
    videoSlug = (
      await publish('page', 'Video with a manager', {
        document: {
          schema: 1,
          blocks: [
            {
              id: 'yt2',
              type: 'core/embed',
              v: 1,
              attrs: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
            },
          ],
        },
      })
    ).slug;
  });

  afterAll(async () => {
    await withCmp({ provider: 'none', policies: false });
  });

  it('refuses IDs in the wrong format', async () => {
    const current = await config();
    const bad = await withCmp({
      provider: 'iubenda',
      iubenda: { ...current.cmp.iubenda, siteId: 'abc', cookiePolicyId: '123' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().problems).toEqual(['iubenda.siteId', 'iubenda.cookiePolicyId']);
    const cookiebot = await withCmp({ provider: 'cookiebot', cookiebot: { cbid: 'x' } });
    expect(cookiebot.json().problems).toEqual(['cookiebot.cbid']);
    // Nothing was saved.
    expect((await config()).cmp.provider).toBe('none');
  });

  it('iubenda: its script first in the head, no banner of this plugin, embeds still held', async () => {
    const current = await config();
    const saved = await withCmp({
      provider: 'iubenda',
      iubenda: {
        ...current.cmp.iubenda,
        siteId: '1234567',
        cookiePolicyId: '7654321',
        options: '{"banner":{"position":"float-bottom-center"}}',
      },
    });
    expect(saved.statusCode).toBe(200);
    const html = (await visitor.get('/')).body;
    expect(html).toMatch(/<head[^>]*><script>\(function\(\)\{function n\(\)/);
    expect(html).toContain('"siteId":1234567');
    expect(html).toContain('"cookiePolicyId":7654321');
    expect(html).toContain('"lang":"en"');
    expect(html).toContain('"position":"float-bottom-center"');
    // iubenda sets Google Consent Mode: not twice.
    expect(html).toContain('"googleConsentMode":true');
    expect(html).not.toContain('window.dataLayer=window.dataLayer||[];function gtag');
    expect(html).toContain(
      '<script src="https://cdn.iubenda.com/cs/iubenda_cs.js" charset="UTF-8" async></script>',
    );
    expect(html).toContain('<div id="cx-consent" hidden data-cmp="iubenda"');
    expect(html).not.toContain('class="cx-consent ');
    expect(html).not.toContain('cx-consent-reopen');
    expect(html).not.toContain('CONSENT_PATH');
    expect(html).not.toContain('/_privacy/consent');
    // Scripts pasted by category stay inert, and the bridge releases them.
    expect(html).toContain('<script type="text/plain" data-cx-category="statistics">track()');
    expect(html).toContain('A.listen(sync)');

    const video = (await visitor.get(`/${videoSlug}`)).body;
    expect(video).toMatch(
      /<iframe data-cx-category="marketing" data-cx-src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ[^"]*" srcdoc="[^"]*Accept and show/,
    );
    expect(video).not.toMatch(/<iframe[^>]*\ssrc="https:\/\/www\.youtube/);
  });

  it('does not write the consent log: the manager keeps it', async () => {
    const before = (await admin.get('/api/v1/ext/privacy/consents')).json().total;
    expect((await consent({ id: 'cmp123cmp456', categories: ['statistics'] })).statusCode).toBe(
      404,
    );
    expect((await admin.get('/api/v1/ext/privacy/consents')).json().total).toBe(before);
  });

  it('iubenda: the policy pages show its policy in their language', async () => {
    const current = await config();
    await withCmp({
      policies: true,
      iubenda: { ...current.cmp.iubenda, cookiePolicyIds: { it: '1111111' } },
    });
    const draft = (await admin.get('/api/v1/ext/privacy/policy/privacy?locale=en')).json();
    expect(draft.document.blocks.map((b: { type: string }) => b.type)).toEqual([
      'privacy/cmp-policy',
    ]);
    const cookies = (await admin.get('/api/v1/ext/privacy/policy/cookies?locale=en')).json();
    expect(cookies.document.blocks.map((b: { type: string }) => b.type)).toContain(
      'privacy/preferences',
    );
    const page = await publish('page', 'iubenda privacy', {
      slug: 'iubenda-privacy',
      document: draft.document,
    });
    const html = (await visitor.get(`/${page.slug}`)).body;
    expect(html).toContain(
      '<a href="https://www.iubenda.com/privacy-policy/7654321" class="iubenda-white iubenda-noiframe iubenda-embed" title="Privacy Policy">',
    );
    expect(html).toContain('https://cdn.iubenda.com/iubenda.js');
    // The Cookie table block shows iubenda's cookie policy.
    const cookiePage = (await visitor.get('/cookie-policy')).body;
    expect(cookiePage).toContain('https://www.iubenda.com/privacy-policy/7654321/cookie-policy');
    expect(cookiePage).not.toContain('<code>cx_consent</code>');
  });

  it('Cookiebot: its script with Consent Mode left to this plugin, and its cookie declaration', async () => {
    const saved = await withCmp({
      provider: 'cookiebot',
      consentMode: 'privacy',
      policies: false,
      cookiebot: { cbid: CBID, blocking: 'manual' },
    });
    expect(saved.statusCode).toBe(200);
    const html = (await visitor.get('/')).body;
    // The defaults (all denied, the old cx_consent cookie is not read), then Cookiebot.
    expect(html).toMatch(
      /<head[^>]*><script>window\.dataLayer=window\.dataLayer\|\|\[\];function gtag\(\)\{dataLayer\.push\(arguments\);\}\(function\(\)\{var g=\{[^}]*\};gtag\('consent','default',g\);\}\)\(\);<\/script><script id="Cookiebot" src="https:\/\/consent\.cookiebot\.com\/uc\.js" data-cbid="1a2b3c4d-1111-2222-3333-444455556666" data-culture="EN" data-consentmode="disabled"><\/script>/,
    );
    expect(html).toContain('data-cmp="cookiebot"');
    expect(html).toContain('data-consent-mode="1"');
    expect(html).not.toContain('data-blockingmode');
    expect(html).not.toContain('class="cx-consent ');

    // Its consent cookie in the cookie table.
    expect((await visitor.get('/cookie-policy')).body).toContain('<code>CookieConsent</code>');
    await withCmp({ policies: true, cookiebot: { cbid: CBID, blocking: 'auto' } });
    expect((await visitor.get('/')).body).toContain('data-blockingmode="auto"');
    const declaration = (await visitor.get('/cookie-policy')).body;
    expect(declaration).toContain(
      `<script id="CookieDeclaration" src="https://consent.cookiebot.com/${CBID}/cd.js" data-culture="EN" async></script>`,
    );
    // The privacy policy stays the one written here.
    const draft = (await admin.get('/api/v1/ext/privacy/policy/privacy?locale=en')).json();
    expect(draft.document.blocks[0].type).toBe('core/paragraph');
  });

  it('CookieYes: its script, with the key taken from the pasted code', async () => {
    const saved = await withCmp({
      provider: 'cookieyes',
      consentMode: 'cmp',
      cookieyes: {
        key: '<script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/abcdef0123456789abcdef01/script.js"></script>',
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().cmp.cookieyes.key).toBe('abcdef0123456789abcdef01');
    const html = (await visitor.get('/')).body;
    expect(html).toMatch(
      /<head[^>]*><script id="cookieyes" src="https:\/\/cdn-cookieyes\.com\/client_data\/abcdef0123456789abcdef01\/script\.js"><\/script>/,
    );
    expect(html).toContain('class="cky-banner-element"');
    expect(html).not.toContain("gtag('consent','default'");
    const video = (await visitor.get(`/${videoSlug}`)).body;
    expect(video).toContain('srcdoc=');
  });

  it('back to the built-in banner, nothing of the managers is left', async () => {
    await withCmp({ provider: 'none' });
    const html = (await visitor.get('/')).body;
    expect(html).toContain('class="cx-consent ');
    expect(html).not.toMatch(/iubenda|cookiebot|cookieyes/i);
  });
});
