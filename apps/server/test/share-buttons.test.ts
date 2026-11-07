/**
 * The Share Buttons plugin (shipped on its own): buttons for social networks
 * and the fediverse under the posts, in the order each site chooses.
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

let postPath = '';

const settings = async (values: Record<string, unknown>) => {
  const saved = await admin.request('PATCH', '/api/v1/plugins/share-buttons/settings', values);
  expect(saved.statusCode, saved.body).toBe(200);
};

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('share-buttons', pluginsPath);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'share-buttons');
  await seedUser(owner, {
    email: 'admin@share.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.43.0.1');
  await admin.login('admin@share.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.43.0.2');
  expect((await admin.post('/api/v1/plugins/share-buttons/activate')).statusCode).toBe(200);
  const created = (
    await admin.post('/api/v1/entries', {
      type: 'article',
      title: 'Un post da condividere',
      slug: 'condividere',
      document: {
        schema: 1,
        blocks: [
          { id: 'p1', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Il testo.' }] },
        ],
      },
    })
  ).json();
  await admin.post(`/api/v1/entries/${created.id}/publish`);
  postPath = `/${new Date().getFullYear()}/condividere`;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('share buttons', () => {
  it('go under the posts, with social networks, the fediverse, email and copy', async () => {
    const page = await visitor.get(postPath);
    expect(page.statusCode).toBe(200);
    const html = page.body;
    expect(html).toContain('class="sb"');
    expect(html).toContain('>Il testo.<');
    expect(html.indexOf('>Il testo.<')).toBeLessThan(html.indexOf('class="sb"'));
    for (const id of [
      'facebook',
      'x',
      'linkedin',
      'instagram',
      'whatsapp',
      'telegram',
      'disbigle',
      'diaspora',
      'mastodon',
      'fediverse',
    ])
      expect(html).toContain(`sb-link sb-${id}"`);
    expect(html).toContain('https://app.disbigle.com/share?text=');
    // Full addresses already in the page (without the script, and for crawlers).
    expect(html).toContain(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`http://${site.host}${postPath}`)}`,
    );
    expect(html).toContain('window.__sbReady');
  });

  it('follow the settings: order, other networks, before the content, icons only', async () => {
    await settings({
      social: [{ network: 'bluesky' }, { network: 'threads' }, { network: 'facebook' }],
      fediverse: [{ network: 'mastodon' }],
      place: 'before',
      look: 'icons',
    });
    const html = (await visitor.get(postPath)).body;
    expect(html.indexOf('class="sb sb--icons"')).toBeLessThan(html.indexOf('>Il testo.<'));
    expect(html.indexOf('sb-link sb-bluesky')).toBeLessThan(html.indexOf('sb-link sb-facebook'));
    expect(html).toContain('sb-link sb-threads');
    expect(html).not.toContain('sb-link sb-disbigle');
    expect(html).toContain('aria-label="Bluesky"');
  });

  it('stay off the posts when only the block is used', async () => {
    await settings({ place: 'none' });
    expect((await visitor.get(postPath)).body).not.toContain('class="sb');
  });
});
