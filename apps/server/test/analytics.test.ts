/**
 * The Analytics plugin (shipped on its own) with Privacy & GDPR: each service
 * declares its rules, and the privacy plugin applies them.
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

const analytics = async (change: Record<string, unknown>) => {
  const current = (await admin.get('/api/v1/ext/analytics/config')).json().config;
  const saved = await admin.request('PUT', '/api/v1/ext/analytics/config', {
    ...current,
    ...change,
  });
  expect(saved.statusCode).toBe(200);
  return saved.json() as { config: Record<string, unknown>; problems: string[] };
};
const home = async () => (await visitor.get('/')).body;

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('privacy', pluginsPath);
  await install('analytics', pluginsPath);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'analytics');
  await seedUser(owner, {
    email: 'admin@analytics.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.42.0.1');
  await admin.login('admin@analytics.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.42.0.2');
  expect((await admin.post('/api/v1/plugins/analytics/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('analytics', () => {
  it('without the privacy banner, loads only what needs no consent', async () => {
    const saved = await analytics({
      matomo: { enabled: true, url: 'https://stats.example.com', siteId: '3', mode: 'anonymous' },
      ga4: { enabled: true, measurementId: 'g-abc123xyz' },
      searchConsole: {
        enabled: true,
        token: '<meta name="google-site-verification" content="AbCdEf123456_-xyz" />',
      },
      bing: { enabled: true, token: '0123456789ABCDEF' },
    });
    expect(saved.problems).toEqual([]);
    expect(saved.config.ga4).toEqual({ enabled: true, measurementId: 'G-ABC123XYZ' });

    const html = await home();
    expect(html).toContain('<meta name="google-site-verification" content="AbCdEf123456_-xyz">');
    expect(html).toContain('<meta name="msvalidate.01" content="0123456789ABCDEF">');
    // Anonymous Matomo runs at once, without cookies.
    expect(html).toMatch(/<script>var _paq=.*_paq\.push\(\['disableCookies'\]\)/);
    expect(html).toContain('"https://stats.example.com/"');
    // Google Analytics needs consent: without a banner it stays off.
    expect(html).not.toContain('googletagmanager.com');
  });

  it('with Privacy & GDPR, asks consent for the services that need it', async () => {
    expect((await admin.post('/api/v1/plugins/privacy/activate')).statusCode).toBe(200);
    // The site itself offers no optional category: the trackers bring theirs.
    const privacy = (await admin.get('/api/v1/ext/privacy/config')).json();
    await admin.request('PUT', '/api/v1/ext/privacy/config', {
      ...privacy,
      banner: { ...privacy.banner, categories: [] },
    });

    const html = await home();
    expect(html).toContain('id="cx-consent"');
    expect(html).toContain('data-categories="statistics"');
    expect(html).toContain(
      '<script type="text/plain" data-cx-category="statistics" async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ">',
    );
    // Google Consent Mode defaults come first in <head>, before the Google tags.
    expect(html.indexOf("gtag('consent','default'")).toBeGreaterThan(-1);
    expect(html.indexOf("gtag('consent','default'")).toBeLessThan(html.indexOf('gtag/js?id='));
    // Anonymous Matomo still needs no consent.
    expect(html).toMatch(/<script>var _paq=/);

    const trackers = (await admin.get('/api/v1/ext/privacy/trackers')).json();
    expect(trackers.trackers.map((t: { id: string }) => t.id)).toEqual([
      'analytics.matomo',
      'analytics.ga4',
    ]);
    expect(trackers).toMatchObject({
      categories: ['statistics'],
      consentMode: true,
      bannerShown: true,
    });

    const policy = JSON.stringify(
      (await admin.get('/api/v1/ext/privacy/policy/privacy?locale=it')).json().document,
    );
    expect(policy).toContain('Google Analytics 4');
    expect(policy).toContain('Data Privacy Framework');
    expect(policy).toContain('legittimo interesse');
  });

  it('lists the cookies of the services in the cookie table', async () => {
    const created = (
      await admin.post('/api/v1/entries', {
        type: 'page',
        title: 'Cookies',
        document: {
          schema: 1,
          blocks: [{ id: 'table1', type: 'privacy/cookie-table', v: 1, attrs: {} }],
        },
      })
    ).json();
    const published = (await admin.post(`/api/v1/entries/${created.id}/publish`)).json();
    const html = (await visitor.get(`/${published.slug}`)).body;
    expect(html).toContain('<code>cx_consent</code>');
    expect(html).toContain('<code>_ga</code>');
    expect(html).toContain('<code>_ga_ABC123XYZ</code>');
    expect(html).toContain('Google Ireland Ltd');
    expect(html).not.toContain('_pk_id');
  });

  it('asks again when the services change, and adds their categories', async () => {
    const before = /data-version="([^"]+)"/.exec(await home())![1];
    await analytics({
      metaPixel: { enabled: true, pixelId: '1234567890' },
      matomo: { enabled: true, url: 'https://stats.example.com/', siteId: '3', mode: 'consent' },
    });
    const html = await home();
    const after = /data-version="([^"]+)"/.exec(html)![1];
    expect(after).not.toBe(before);
    expect(html).toContain('data-categories="statistics,marketing"');
    expect(html).toContain('<script type="text/plain" data-cx-category="statistics">var _paq=');
    expect(html).not.toContain("_paq.push(['disableCookies'])");
    expect(html).toContain(
      '<script type="text/plain" data-cx-category="marketing">!function(f,b,e,v,n,t,s)',
    );
  });

  it('keeps invalid services off and says which', async () => {
    const saved = await analytics({
      gtm: { enabled: true, containerId: 'nope', category: 'marketing' },
    });
    expect(saved.problems).toEqual(['gtm']);
    expect(await home()).not.toContain('gtm.js');
  });

  it('is only for analytics managers', async () => {
    expect((await visitor.get('/api/v1/ext/analytics/config')).statusCode).toBe(401);
  });
});
