/**
 * The official Maps plugin: the Map block draws places from links and
 * coordinates, and maps that set cookies wait for consent (Privacy & GDPR).
 * Only links and coordinates here: addresses would ask Nominatim.
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

async function mapPage(title: string, attrs: Record<string, unknown>) {
  const created = (
    await admin.post('/api/v1/entries', {
      type: 'page',
      title,
      document: { schema: 1, blocks: [{ id: 'map1', type: 'maps/map', v: 1, attrs }] },
    })
  ).json();
  const published = await admin.post(`/api/v1/entries/${created.id}/publish`);
  expect(published.statusCode, published.body).toBe(200);
  return `/${published.json().slug as string}`;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('maps', pluginsPath);
  await install('privacy', pluginsPath);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'maps');
  await seedUser(owner, {
    email: 'admin@maps.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.60.0.1');
  await admin.login('admin@maps.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.60.0.2');
  const activated = await admin.post('/api/v1/plugins/maps/activate');
  expect(activated.statusCode, activated.body).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Map block', () => {
  it('draws an OpenStreetMap link at once, with directions and "Open in" links', async () => {
    const path = await mapPage('Shop', {
      location: 'https://www.openstreetmap.org/?mlat=45.4642&mlon=9.19#map=17/45.4642/9.19',
      caption: 'Piazza del Duomo, Milano',
    });
    const html = (await visitor.get(path)).body;
    expect(html).toContain('class="cx-map"');
    expect(html).toMatch(
      /<iframe title="Map" loading="lazy" allowFullScreen="" src="https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=[^"]+&amp;layer=mapnik&amp;marker=45\.4642,9\.19"/,
    );
    expect(html).toContain('<figcaption>Piazza del Duomo, Milano</figcaption>');
    expect(html).toContain('https://www.google.com/maps/dir/?api=1&amp;destination=45.4642,9.19');
    expect(html).toContain('https://maps.apple.com/?ll=45.4642,9.19');
    expect(html).toContain('>Open in Apple Maps</a>');
    // Nothing waits for consent: no cookies.
    expect(html).not.toContain('data-cx-src');
  });

  it('holds a Google map until consent, and loads it without the privacy plugin', async () => {
    const path = await mapPage('Office', {
      location:
        'https://www.google.com/maps/place/Colosseo/@41.8902102,12.4922309,17z/data=!3d41.8902102!4d12.4922309',
      title: 'Map of the office',
      links: false,
    });
    const html = (await visitor.get(path)).body;
    expect(html).toContain(
      'data-cx-src="https://maps.google.com/maps?q=41.89021,12.492231&amp;z=17&amp;t=m&amp;hl=en&amp;output=embed" data-cx-category="marketing"',
    );
    expect(html).toContain('title="Map of the office"');
    expect(html).toContain('This map is shown by Google Maps, which may set cookies.');
    expect(html).toContain('href="#cookie-preferences" data-cx-open=""');
    expect(html).toContain('if(window.cleitextConsent)return;');
    expect(html).not.toContain('class="cx-map__links"');
  });

  it('tells the privacy plugin which map services the site uses', async () => {
    expect((await admin.post('/api/v1/plugins/privacy/activate')).statusCode).toBe(200);
    const { trackers } = (await admin.get('/api/v1/ext/privacy/trackers')).json() as {
      trackers: { id: string; category: string; requiresConsent: boolean }[];
    };
    expect(trackers.filter((t) => t.id.startsWith('maps.'))).toEqual([
      expect.objectContaining({ id: 'maps.google', category: 'marketing', requiresConsent: true }),
      expect.objectContaining({ id: 'maps.openstreetmap', requiresConsent: false }),
    ]);
    // The banner now offers the category of the Google map.
    const html = (await visitor.get('/')).body;
    expect(html).toMatch(/data-categories="[^"]*marketing/);
  });

  it('renders nothing for a link that is not a place', async () => {
    const path = await mapPage('Nothing', { location: 'https://example.com/somewhere' });
    const html = (await visitor.get(path)).body;
    expect(html).not.toContain('class="cx-map"');
  });
});
