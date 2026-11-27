/**
 * The official Reklaim plugin: the call-to-action bar on the public pages,
 * its texts per language, the pages without it, what Reklaim Pro adds through
 * its hook, the script and styles, and the click counter.
 */
import { mkdtemp } from 'node:fs/promises';
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

interface ReklaimApi {
  providers: ((page: { siteId: string; path: string }) => unknown)[];
}
const reklaim = () =>
  (globalThis as unknown as Record<symbol, ReklaimApi>)[Symbol.for('cleitext.reklaim')]!;

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;

async function page(title: string, extra: Record<string, unknown> = {}) {
  const created = (await admin.post('/api/v1/entries', { type: 'page', title, ...extra })).json();
  const published = await admin.post(`/api/v1/entries/${created.id}/publish`);
  expect(published.statusCode, published.body).toBe(200);
  return `/${published.json().slug as string}`;
}

/** The configuration the script gets on a page, or null without the bar. */
async function barOf(path: string) {
  const html = (await visitor.get(path)).body;
  const json = /<script type="application\/json" id="reklaim-config">([^<]*)<\/script>/.exec(html);
  return json ? JSON.parse(json[1]!) : null;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await buildPlugin(join(pluginsRoot, 'reklaim'));
  await installPlugin(owner.db, {
    source: join(pluginsRoot, 'reklaim'),
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'reklaim');
  await seedUser(owner, {
    email: 'admin@reklaim.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.71.0.1');
  await admin.login('admin@reklaim.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.71.0.2');
  const activated = await admin.post('/api/v1/plugins/reklaim/activate');
  expect(activated.statusCode, activated.body).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Reklaim', () => {
  it('shows nothing until there is a text', async () => {
    const html = (await visitor.get('/')).body;
    expect(html).not.toContain('reklaim-config');
    expect(html).not.toContain('/reklaim/front.js');
  });

  it('adds the bar in the language of the page, with the script and the styles', async () => {
    const saved = await admin.request('PATCH', '/api/v1/plugins/reklaim/settings', {
      texts: [
        { locale: 'fr', text: 'Dès 32,50 €', button: 'Demander une démo', link: '/fr#demo' },
        { locale: '', text: 'Da 32,50 € al mese', button: 'Richiedi una demo', link: '/#demo' },
      ],
      anchor: '#demo',
      background: '#302622',
      hide_paths: '/grazie\n/legal/*',
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const path = await page('Prezzi');
    const html = (await visitor.get(path)).body;
    expect(html).toMatch(
      /<link rel="stylesheet" href="\/reklaim\/front\.css\?v=\w+"><style>\.reklaim\{--rk-bg:#302622;--rk-fg:#ffffff;--rk-btn:#2563eb;--rk-btn-fg:#ffffff\}<\/style><\/head>/,
    );
    expect(html).toMatch(/<script src="\/reklaim\/front\.js\?v=\w+" defer><\/script><\/body>/);
    expect(await barOf(path)).toEqual({
      bars: [
        {
          id: 'default',
          anchor: 'demo',
          text: 'Da 32,50 € al mese',
          button: 'Richiedi una demo',
          link: '/#demo',
        },
      ],
      scroll: 500,
      maxWidth: 768,
      position: 'bottom',
      gaEvent: 'generate_lead',
      track: '/reklaim/track',
    });
  });

  it('leaves out the pages listed', async () => {
    expect(await barOf(await page('Grazie'))).toBeNull();
    expect(await barOf(await page('Altro'))).not.toBeNull();
  });

  it('takes the bars and the page settings of Reklaim Pro', async () => {
    const special = await page('Menu pronto');
    const hidden = await page('Senza barra');
    const provider = (p: { siteId: string; path: string }) =>
      p.siteId !== site.id
        ? null
        : p.path === hidden
          ? { hide: true }
          : p.path === special
            ? {
                bars: [
                  {
                    id: 'Prepara',
                    anchor: 'prepara',
                    text: 'Gratis, senza impegno',
                    button: 'Preparatemi il menu',
                    link: '',
                  },
                ],
                desktop: true,
              }
            : null;
    reklaim().providers.push(provider);
    try {
      const bar = await barOf(special);
      expect(bar.bars.map((b: { id: string }) => b.id)).toEqual(['Prepara', 'default']);
      expect(bar.maxWidth).toBe(0);
      expect(await barOf(hidden)).toBeNull();
    } finally {
      reklaim().providers.splice(reklaim().providers.indexOf(provider), 1);
    }
  });

  it('serves the script and the styles with a long cache', async () => {
    const js = await visitor.get('/reklaim/front.js');
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toContain('javascript');
    expect(js.headers['cache-control']).toContain('immutable');
    expect(js.body).toContain('reklaim-config');
    const css = await visitor.get('/reklaim/front.css');
    expect(css.body).toContain('safe-area-inset-bottom');
  });

  it('counts the clicks per bar, once per visitor and minute, and not those of bots', async () => {
    const track = (agent: string, bar: string) =>
      app.inject({
        method: 'POST',
        url: '/reklaim/track',
        remoteAddress: '203.0.113.10',
        headers: {
          host: site.host,
          origin: `http://${site.host}`,
          'user-agent': agent,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: `bar=${encodeURIComponent(bar)}`,
      });
    expect((await track('Mozilla/5.0 (iPhone)', 'default')).statusCode).toBe(204);
    expect((await track('Mozilla/5.0 (iPhone)', 'default')).statusCode).toBe(204);
    expect((await track('Mozilla/5.0 (iPhone)', 'Prepara')).statusCode).toBe(204);
    expect((await track('Googlebot/2.1', 'default')).statusCode).toBe(204);
    const stats = (await admin.get('/api/v1/ext/reklaim/stats')).json();
    expect(stats).toMatchObject({ today: 2, week: 2, month: 2, total: 2 });
    expect(stats.days).toHaveLength(30);
    expect(stats.bars).toEqual(
      expect.arrayContaining([
        { bar: 'default', clicks: 1 },
        { bar: 'Prepara', clicks: 1 },
      ]),
    );
    expect((await visitor.get('/api/v1/ext/reklaim/stats')).statusCode).toBe(401);
  });
});
