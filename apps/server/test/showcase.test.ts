/** The Catalog showcase plugin: the "Catalog" block shows the signed catalog. */
import { cp, mkdtemp } from 'node:fs/promises';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
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
let server: Server;
const keys = generateKeyPairSync('ed25519');
const files = new Map<string, Buffer>();

const ITEMS = [
  {
    type: 'plugin',
    slug: 'privacy',
    name: 'Privacy & GDPR',
    summary: { en: 'Cookie banner and policies.', it: 'Banner dei cookie e policy.' },
    tags: ['gdpr'],
    icon: 'https://example.com/privacy.svg',
    screenshots: [],
    version: '1.2.0',
    apiVersion: '^1.4',
    license: 'GPL-2.0-or-later',
    author: 'Cleitext',
    download: 'https://example.com/privacy.zip',
    sha256: 'a'.repeat(64),
    size: 74790,
    homepage: 'https://example.com/privacy',
    updatedAt: '2026-10-11T00:00:00Z',
  },
  {
    type: 'theme',
    slug: 'canvas',
    name: 'Canvas',
    summary: { en: 'A page-builder theme.', it: 'Un tema page builder.' },
    tags: [],
    icon: null,
    screenshots: ['https://example.com/canvas.png'],
    version: '1.0.3',
    requires: '>=0.9.0',
    license: 'GPL-2.0-or-later',
    author: 'Cleitext',
    download: 'https://example.com/canvas.zip',
    sha256: 'b'.repeat(64),
    size: 16240,
    updatedAt: '2026-10-11T00:00:00Z',
  },
  {
    type: 'theme',
    slug: 'vivid',
    name: 'Vivid',
    summary: { en: 'A paid theme.', it: 'Un tema a pagamento.' },
    tags: [],
    icon: null,
    screenshots: [],
    version: '1.0.0',
    license: 'GPL-2.0-or-later',
    author: 'Cleitext',
    download: 'https://store.example/v1/download/vivid/1.0.0',
    sha256: 'c'.repeat(64),
    size: 52000,
    updatedAt: '2026-10-11T00:00:00Z',
    paid: {
      price: { amount: 59, currency: 'EUR', per: 'site' },
      updatesMonths: 12,
      purchaseUrl: 'https://store.example/vivid',
      licenseServer: 'https://store.example/v1',
    },
  },
];

function publish(signer = keys.privateKey) {
  const body = Buffer.from(
    JSON.stringify({ schema: 1, generatedAt: new Date().toISOString(), items: ITEMS }),
  );
  files.set('/catalog.json', body);
  files.set('/catalog.json.sig', Buffer.from(sign(null, body, signer).toString('base64')));
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const data = files.get(req.url ?? '');
    if (!data) return void res.writeHead(404).end();
    res.writeHead(200).end(data);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  // The plugin reads the server's catalog settings from the environment.
  process.env.CATALOG_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/catalog.json`;
  process.env.CATALOG_PUBLIC_KEY = keys.publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64');
  publish();

  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'showcase-src-')), 'showcase');
  await cp(join(pluginsRoot, 'showcase'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'showcase');
  await seedUser(owner, {
    email: 'admin@showcase.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.44.0.1');
  await admin.login('admin@showcase.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.44.0.2');
  expect((await admin.post('/api/v1/plugins/showcase/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  delete process.env.CATALOG_URL;
  delete process.env.CATALOG_PUBLIC_KEY;
  await app?.close();
  await owner?.close();
  server?.close();
});

async function pageWith(kind: string) {
  const created = (
    await admin.post('/api/v1/entries', {
      type: 'page',
      title: `Catalog ${kind}`,
      document: {
        schema: 1,
        blocks: [{ id: `cat-${kind}`, type: 'showcase/catalog', v: 1, attrs: { kind } }],
      },
    })
  ).json();
  return (await admin.post(`/api/v1/entries/${created.id}/publish`)).json() as { slug: string };
}

describe('catalog showcase', () => {
  it('shows the plugins of the signed catalog', async () => {
    const page = await pageWith('plugin');
    const html = (await visitor.get(`/${page.slug}`)).body;
    expect(html).toContain('<h3 class="cx-catalog__name">Privacy &amp; GDPR</h3>');
    expect(html).toContain('href="https://example.com/privacy.zip"');
    expect(html).toContain('Plugins → Add New');
    expect(html).not.toContain('Canvas');
  });

  it('shows the themes with their screenshot', async () => {
    const page = await pageWith('theme');
    const html = (await visitor.get(`/${page.slug}`)).body;
    expect(html).toContain('src="https://example.com/canvas.png"');
    expect(html).toContain('Needs Cleitext ≥ 0.9.0');
    expect(html).not.toContain('privacy.zip');
  });

  it('shows the price of paid themes, with Buy instead of Download', async () => {
    const page = await pageWith('theme');
    const html = (await visitor.get(`/${page.slug}`)).body;
    expect(html).toMatch(/<strong>€59<\/strong> per site · 12 months of updates/);
    expect(html).toContain('href="https://store.example/vivid">Buy</a>');
    expect(html).toContain('then Live Preview');
    expect(html).not.toContain('download/vivid');
  });
});
