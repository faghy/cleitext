/**
 * The Setax plugin (shipped on its own): a filter by type and place on a page,
 * each choice with results a page of its own for search engines.
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

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('setax', pluginsPath);
  await install('seo', pluginsPath);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'setax', { locale: 'it' });
  await seedUser(owner, {
    email: 'admin@setax.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.44.0.1');
  await admin.login('admin@setax.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.44.0.2');
  const activated = await admin.post('/api/v1/plugins/setax/activate');
  expect(activated.statusCode, activated.body).toBe(200);
  const seo = await admin.post('/api/v1/plugins/seo/activate');
  expect(seo.statusCode, seo.body).toBe(200);

  // As imported from WordPress: a taxonomy of the theme on pages, and the place field.
  expect(
    (
      await admin.post('/api/v1/taxonomies', {
        slug: 'elettrodomestici',
        name: { it: 'Elettrodomestici' },
        contentTypes: ['page'],
      })
    ).statusCode,
  ).toBe(201);
  const term = async (name: string) =>
    (await admin.post('/api/v1/taxonomies/elettrodomestici/terms', { name })).json() as {
      id: string;
    };
  // A second taxonomy on the same pages, as the brands of assistenzasavona.it: never the type.
  expect(
    (
      await admin.post('/api/v1/taxonomies', {
        slug: 'marche',
        name: { it: 'Marche' },
        contentTypes: ['page'],
      })
    ).statusCode,
  ).toBe(201);
  const aeg = (await admin.post('/api/v1/taxonomies/marche/terms', { name: 'Aeg' })).json() as {
    id: string;
  };
  const lavatrici = await term('Lavatrici');
  const frigo = await term('Frigoriferi a incasso');
  const page = async (title: string, terms: string[], place: string) => {
    const created = (await admin.post('/api/v1/entries', { type: 'page', title })).json();
    const saved = await admin.request('PATCH', `/api/v1/entries/${created.id}`, {
      terms: { marche: [aeg.id], elettrodomestici: terms },
      fields: { setax: { place } },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    await admin.post(`/api/v1/entries/${created.id}/publish`);
  };
  await page('Riparazione lavatrici Albenga', [lavatrici.id], 'Albenga');
  await page('Riparazione frigoriferi Albenga', [frigo.id], 'Albenga');
  await page('Riparazione lavatrici Cairo Montenotte', [lavatrici.id], 'Cairo Montenotte');
  const zone = (
    await admin.post('/api/v1/entries', {
      type: 'page',
      title: 'Tipo e Zone',
      slug: 'zone',
      document: {
        schema: 1,
        blocks: [
          {
            id: 'f1',
            type: 'setax/filter',
            v: 1,
            attrs: { taxonomy: 'elettrodomestici', paramPlace: 'comune' },
          },
        ],
      },
    })
  ).json();
  await admin.post(`/api/v1/entries/${zone.id}/publish`);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Setax', () => {
  it('shows the form and links to every choice with results on its page', async () => {
    const page = await visitor.get('/zone');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('name="tipo"');
    expect(page.body).toContain('<option value="lavatrici">Lavatrici</option>');
    expect(page.body).toContain('<option value="cairo-montenotte">Cairo Montenotte</option>');
    expect(page.body).toContain('href="/zone?tipo=lavatrici&amp;comune=albenga"');
    expect(page.body).not.toContain('noindex');
  });

  it('gives each choice with results its own title, description, canonical address and data', async () => {
    const page = await visitor.get('/zone?tipo=lavatrici&comune=albenga');
    expect(page.statusCode).toBe(200);
    const html = page.body;
    expect(html).toContain('<h2 class="setax-heading">Lavatrici ad Albenga</h2>');
    expect(html).toContain('Riparazione lavatrici Albenga');
    expect(html).not.toContain('>Riparazione frigoriferi Albenga<');
    expect(html).toMatch(/<title>Lavatrici ad Albenga/);
    // One graph (the SEO plugin's): its page is the choice, with one breadcrumb ending in it.
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
      (m) => JSON.parse(m[1]!) as Record<string, unknown>,
    );
    const nodes = blocks.flatMap((b) => (b['@graph'] as Record<string, unknown>[]) ?? [b]);
    const crumbs = nodes.filter((n) => n['@type'] === 'BreadcrumbList');
    expect(crumbs).toHaveLength(1);
    const choiceUrl = 'http://setax.test/zone?tipo=lavatrici&comune=albenga';
    const webPage = nodes.find((n) => n['@type'] === 'WebPage');
    expect(webPage).toMatchObject({ '@id': choiceUrl, url: choiceUrl });
    expect(String(webPage!.name)).toMatch(/^Lavatrici ad Albenga/);
    const steps = crumbs[0]!.itemListElement as { name: string; item?: string }[];
    expect(steps.at(-1)).toMatchObject({ name: 'Lavatrici ad Albenga' });
    expect(steps.at(-2)).toMatchObject({ name: 'Tipo e Zone', item: 'http://setax.test/zone' });
    // The page's own heading names the choice too (plugin API 1.65).
    expect(html).toMatch(/<h1[^>]*>Lavatrici ad Albenga<\/h1>/);
    expect((await visitor.get('/zone')).body).toMatch(/<h1[^>]*>Tipo e Zone<\/h1>/);
    expect((await visitor.get('/zone?tipo=xxx&comune=albenga')).body).toMatch(
      /<h1[^>]*>Tipo e Zone<\/h1>/,
    );
    expect(html).toContain(
      '<link rel="canonical" href="http://setax.test/zone?tipo=lavatrici&amp;comune=albenga"',
    );
    expect(html).toContain('"@type":"ItemList"');
    expect(html).not.toContain('noindex');
    // The same choice in another order: the canonical address is one.
    expect((await visitor.get('/zone?comune=albenga&tipo=lavatrici')).body).toContain(
      'href="http://setax.test/zone?tipo=lavatrici&amp;comune=albenga"',
    );
  });

  it('keeps choices without results out of search', async () => {
    const page = await visitor.get('/zone?tipo=frigoriferi-a-incasso&comune=cairo-montenotte');
    expect(page.body).toContain('Nessun risultato trovato.');
    expect(page.body).toMatch(/<meta name="robots" content="noindex, follow"/);
    expect((await visitor.get('/zone?tipo=sconosciuto')).body).toMatch(/noindex, follow/);
    // A choice with a value that does not exist, even next to a valid one.
    expect((await visitor.get('/zone?tipo=xxx&comune=albenga')).body).toMatch(
      /<meta name="robots" content="noindex, follow"/,
    );
  });

  it('describes each page with a place as a service in its town, by the business', async () => {
    const ld = (html: string) =>
      [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
        (m) => JSON.parse(m[1]!) as Record<string, unknown>,
      );
    const service = (html: string) => ld(html).find((d) => d['@type'] === 'Service');
    const before = service((await visitor.get('/riparazione-lavatrici-albenga')).body);
    expect(before).toMatchObject({
      '@type': 'Service',
      name: 'Riparazione lavatrici Albenga',
      serviceType: 'Lavatrici',
      areaServed: { '@type': 'City', name: 'Albenga' },
    });
    // With the SEO plugin describing the business, it is the provider.
    const seo = await admin.request('PUT', '/api/v1/ext/seo/config', {
      representation: {
        kind: 'organization',
        name: 'Assistenza',
        businessType: 'HomeAndConstructionBusiness',
      },
    });
    expect(seo.statusCode).toBe(200);
    const after = service((await visitor.get('/riparazione-lavatrici-albenga')).body);
    expect(after?.provider).toEqual({ '@id': 'http://setax.test/#organization' });
    await admin.request('PUT', '/api/v1/ext/seo/config', {});
    // The page with the filter is not a service.
    expect(service((await visitor.get('/zone')).body)).toBeUndefined();
  });

  it('lists the choices with results in the sitemap', async () => {
    const sitemap = (await visitor.get('/sitemap-page-it.xml')).body;
    expect(sitemap).toContain(
      '<loc>http://setax.test/zone?tipo=lavatrici&amp;comune=albenga</loc>',
    );
    expect(sitemap).toContain('<loc>http://setax.test/zone?comune=cairo-montenotte</loc>');
    expect(sitemap).not.toContain('tipo=frigoriferi-a-incasso&amp;comune=cairo-montenotte');
  });
});
