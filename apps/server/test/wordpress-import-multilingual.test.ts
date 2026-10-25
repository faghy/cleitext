/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers, read field by field. */
/**
 * WordPress Importer 1.28.0 through the real import: a WPML site (it, en, de)
 * into a site with Multilingual, whose languages are used without asking;
 * the menus of the other languages rebuilt; Contact Form 7 forms as Forms
 * blocks, rendered by the Forms plugin; CookieYes leftovers stripped; the
 * Additional CSS written for Spectra's classes renamed by Prisma (plugin API
 * 1.53, `import.cssClasses`); WPML's and Polylang's language switchers as
 * Multilingual's (WordPress Importer 1.29.0, Multilingual 1.6.0).
 */
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import { entries, withSiteContext, type DatabaseClient } from '@cleitext/db';
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
const fixtures = fileURLToPath(new URL('./fixtures/wxr/', import.meta.url));
const EXT = '/api/v1/ext/wordpress-importer';

let app: NestFastifyApplication;
let owner: DatabaseClient;

async function install(slug: string, pluginsPath: string) {
  // Built in place: plugins bundle their own dependencies (the WordPress reader).
  await buildPlugin(join(pluginsRoot, slug));
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

async function newSite(slug: string, ip: string): Promise<{ site: SeededSite; admin: TestClient }> {
  const site = await seedSite(owner, slug);
  await seedUser(owner, {
    email: `admin@${slug}.test`,
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  const admin = new TestClient(app, site.host, ip);
  await admin.login(`admin@${slug}.test`, PASSWORD);
  expect((await admin.post('/api/v1/plugins/wordpress-importer/activate')).statusCode).toBe(200);
  return { site, admin };
}

async function importFile(admin: TestClient, file: string, query: string) {
  const started = await admin.upload(
    `${EXT}/imports?${query}`,
    file,
    await readFile(join(fixtures, file)),
    'text/xml',
  );
  expect(started.statusCode, started.body).toBe(202);
  for (let i = 0; i < 300; i++) {
    const { job } = (await admin.get(`${EXT}/status`)).json() as { job: any };
    if (job.status !== 'running') {
      expect(job.error ?? job.status).toBe('done');
      return job.report as {
        created: Record<string, number>;
        warnings: string[];
        errors: string[];
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The import did not finish.');
}

async function pages(site: SeededSite) {
  return withSiteContext(owner.db, site.id, (tx) =>
    tx
      .select({ id: entries.id, slug: entries.slug, locale: entries.locale, title: entries.title })
      .from(entries),
  );
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  for (const slug of ['wordpress-importer', 'multilingual', 'forms', 'prisma'])
    await install(slug, pluginsPath);
  app = await startTestApp({ pluginsPath });
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('a WPML site', () => {
  it('goes into the site’s languages by default, with its translations and menus', async () => {
    const { site, admin } = await newSite('wpml-import', '10.61.0.1');
    expect((await admin.post('/api/v1/plugins/multilingual/activate')).statusCode).toBe(200);
    for (const [code, name] of [
      ['it', 'Italiano'],
      ['de', 'Deutsch'],
    ]) {
      const added = await admin.post('/api/v1/ext/multilingual/languages', { code, name });
      expect(added.statusCode, added.body).toBe(201);
    }
    // No `languages`: the site's (en, it, de).
    const report = await importFile(admin, 'wpml.xml', 'locale=it');
    expect(report.errors).toEqual([]);
    expect(report.warnings.join('\n')).toContain('Languages from WPML: 3 in it, 3 in en, 2 in de');
    expect(report.warnings.join('\n')).toContain('in "fr" were not imported');

    const rows = await pages(site);
    const key = (r: { slug: string; locale: string }) => `${r.locale}:${r.slug}`;
    expect(rows.map(key).sort()).toEqual(
      [
        'it:home',
        'en:home',
        'de:startseite',
        'it:camere',
        'en:camere',
        'de:zimmer',
        'it:contatti',
        'en:contact',
      ].sort(),
    );
    const byKey = new Map(rows.map((r) => [key(r), r]));
    const camere = byKey.get('it:camere')!;
    const links = (
      await admin.get(`/api/v1/ext/multilingual/translations?kind=entry&ids=${camere.id}`)
    ).json()[camere.id];
    expect(links.links.map((l: any) => [l.locale, l.id]).sort()).toEqual(
      [
        ['de', byKey.get('de:zimmer')!.id],
        ['en', byKey.get('en:camere')!.id],
      ].sort(),
    );

    const menus = (await admin.get('/api/v1/menus')).json() as any[];
    const all = [
      ...menus,
      ...((await admin.get('/api/v1/menus?locale=it')).json() as any[]),
      ...((await admin.get('/api/v1/menus?locale=de')).json() as any[]),
    ];
    const slugOf = new Map(rows.map((r) => [r.id, key(r)]));
    const shown = new Map<string, string[]>();
    for (const menu of all) {
      const full = (await admin.get(`/api/v1/menus/${menu.id}`)).json();
      shown.set(
        `${full.locale}:${full.name}`,
        full.items.map((i: any) => slugOf.get(i.entryId)),
      );
    }
    expect(Object.fromEntries(shown)).toEqual({
      'it:Menu principale': ['it:home', 'it:camere', 'it:contatti'],
      'en:Main menu': ['en:home', 'en:camere', 'en:contact'],
      'de:Menu principale': ['de:startseite', 'de:zimmer'],
    });
  });
});

describe('a site with Contact Form 7 and CookieYes', () => {
  it('gets Forms blocks that render, and no banner leftovers', async () => {
    const { site, admin } = await newSite('cf7-import', '10.61.0.2');
    expect((await admin.post('/api/v1/plugins/forms/activate')).statusCode).toBe(200);
    expect((await admin.post('/api/v1/plugins/prisma/activate')).statusCode).toBe(200);
    const report = await importFile(admin, 'cf7.xml', 'locale=en');
    const warnings = report.warnings.join('\n');
    expect(warnings).toContain('3 Contact Form 7 shortcode(s) became Forms blocks (2 form(s))');
    expect(warnings).toContain('Leftovers of the cookie banner (CookieYes, Cookiebot)');
    expect(warnings).toContain('Shortcode [contact-form-7] has no equivalent (1×)');
    expect(warnings).toContain(
      'The Additional CSS names classes that active plugins render under their own names: 1 selector name was renamed (.uagb-ifb-separator → .pr-info-box__separator), in selectors only.',
    );
    expect(warnings).toContain('3 CSS rule(s) or style block(s) removed');
    const css = (await admin.get('/api/v1/themes/additional-css')).json().site as string;
    expect(css).toContain(
      '.custom-infobox .pr-info-box__separator{background-image:url(https://rooms.example.com/brush.png)}',
    );
    expect(css).toContain('.site-title{letter-spacing:1px}');
    expect(css).not.toContain('cky-');

    const rows = await pages(site);
    const book = rows.find((r) => r.slug === 'book')!;
    const entry = (await admin.get(`/api/v1/entries/${book.id}`)).json();
    await admin.post(`/api/v1/entries/${book.id}/publish`);
    expect(JSON.stringify(entry.revision.document)).toContain('forms/contact');
    const visitor = new TestClient(app, site.host, '10.61.0.3');
    const html = (await visitor.get('/book')).body;
    expect(html).toContain('<form class="cf-grid" action="/_forms/submit" method="post">');
    expect(html).toContain('name="your-email"');
    expect(html).toContain('<option value="double" selected="">Double</option>');
    expect(html).toContain('Send request');

    const about = rows.find((r) => r.slug === 'about')!;
    const aboutHtml = JSON.stringify(
      (await admin.get(`/api/v1/entries/${about.id}`)).json().revision.document,
    );
    expect(aboutHtml).not.toContain('cky-');
    expect(aboutHtml).toContain('#cookie-preferences');
  });
});

describe('WPML’s and Polylang’s language switchers', () => {
  it('become Multilingual’s block and menu item, shown on the page', async () => {
    const { site, admin } = await newSite('switcher-import', '10.61.0.4');
    expect((await admin.post('/api/v1/plugins/multilingual/activate')).statusCode).toBe(200);
    await admin.post('/api/v1/ext/multilingual/languages', { code: 'it', name: 'Italiano' });
    const report = await importFile(admin, 'language-switchers.xml', 'locale=en');
    const warnings = report.warnings.join('\n');
    expect(warnings).toContain('Shortcode [wpml_language_selector_widget] became a block');
    expect(warnings).toContain("Polylang's language switcher in menus became Multilingual's (1×)");

    const welcome = (await pages(site)).find((r) => r.slug === 'welcome')!;
    const entry = (await admin.get(`/api/v1/entries/${welcome.id}`)).json();
    const blocks = (entry.revision.document.blocks as any[]).filter(
      (b) => b.type === 'multilingual/language-switcher',
    );
    expect(blocks.map((b) => b.attrs)).toEqual([
      { style: 'dropdown' },
      { style: 'inline', flags: 'yes', names: 'code' },
    ]);
    const [menu] = (await admin.get('/api/v1/menus')).json() as any[];
    const items = (await admin.get(`/api/v1/menus/${menu.id}`)).json().items as any[];
    expect(items[1]).toMatchObject({
      kind: 'url',
      url: '#language-switcher?style=dropdown',
      label: 'Languages',
    });

    await admin.request('PATCH', `/api/v1/menus/${menu.id}`, { location: 'primary' });
    await admin.post(`/api/v1/entries/${welcome.id}/publish`);
    const html = (await new TestClient(app, site.host, '10.61.0.5').get('/welcome')).body;
    expect(html).toContain('<details class="ml-switcher__dropdown">');
    expect(html).toContain('<span class="ml-switcher__name" aria-hidden="true">IT</span>');
    // The menu item: the page's language, the other under it.
    expect(html).toMatch(
      /<a href="\/welcome"[^>]*>English<\/a><ul><li><a href="\/it">Italiano<\/a>/,
    );
  });
});
