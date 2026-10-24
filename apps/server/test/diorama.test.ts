/**
 * The official Diorama plugin: one slider per site in the free version (a
 * second one is refused with the invitation's code, and Diorama Pro's hook
 * lifts the limit), the block on a public page with the media library's
 * responsive pictures (plugin API 1.46, `context.loadMedia`), the runtime
 * only where a slider is, the latest posts as slides, the `[diorama]`
 * shortcode, and the sliders in a site export and back. Diorama 1.2: a
 * Google font chosen for a layer is kept on the site by Cleitext's web fonts
 * (no address of Google on the page), and the editor's page of the site's
 * fonts answers only people who manage sliders. Google is a fake here.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config/config.js';
import { MediaService } from '../src/media/media.service.js';
import { DiskStorage } from '../src/media/storage.js';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
import { PageCacheService } from '../src/public/page-cache.service.js';
import { WebFontsService } from '../src/public/web-fonts.service.js';
import { fileReader, openArchive, writeArchive } from '../src/transfer/archive.js';
import { exportSite } from '../src/transfer/exporter.js';
import { importDocument } from '../src/transfer/importer.js';
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
const ext = (path: string) => `/api/v1/ext/diorama${path}`;

const WOFF2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(60, 7)]);
const GOOGLE = /fonts\.googleapis\.com|fonts\.gstatic\.com/;

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;
let sliderId = '';
const calls: string[] = [];

async function fakeGoogle(request: { url: string }) {
  calls.push(request.url);
  const url = new URL(request.url);
  if (url.pathname === '/css2') {
    const family = url.searchParams.get('family')!.split(':')[0]!;
    const slug = family.toLowerCase().replace(/ /g, '');
    return {
      status: 200,
      type: 'text/css',
      text: `@font-face {\n  font-family: '${family}';\n  font-weight: 700;\n  src: url(https://fonts.gstatic.com/s/${slug}/v1/latin.woff2) format('woff2');\n}\n`,
    };
  }
  if (url.pathname.endsWith('.woff2'))
    return { status: 200, type: 'font/woff2', text: '', base64: WOFF2.toString('base64') };
  return { status: 404, type: 'text/plain', text: '' };
}

const copies = (html: string) =>
  [
    ...html.matchAll(
      /<link rel="stylesheet" href="(\/_fonts\/[a-f0-9]{32}\.css)" data-font-family="([^"]+)">/g,
    ),
  ].map((m) => m[2]!);

async function install(slug: string, pluginsPath: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  // Built where it lives: it bundles the workspace's font helpers (Diorama 1.2).
  await buildPlugin(join(pluginsRoot, slug));
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

async function publish(type: string, title: string, blocks: unknown[]) {
  const created = await admin.post('/api/v1/entries', {
    type,
    title,
    document: { schema: 1, blocks },
  });
  expect(created.statusCode, created.body).toBe(201);
  const published = await admin.post(`/api/v1/entries/${created.json().id}/publish`);
  expect(published.statusCode, published.body).toBe(200);
  return { id: created.json().id as string, path: `/${published.json().slug as string}` };
}

const sliderBlock = (attrs: Record<string, unknown>) => ({
  id: `b${Math.random().toString(16).slice(2, 10)}`,
  type: 'diorama/slider',
  v: 1,
  attrs,
});

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('diorama', pluginsPath);
  app = await startTestApp({ pluginsPath });
  vi.spyOn(app.get(WebFontsService), 'download').mockImplementation(fakeGoogle);
  site = await seedSite(owner, 'diorama');
  await seedUser(owner, {
    email: 'admin@diorama.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.62.0.1');
  await admin.login('admin@diorama.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.62.0.2');
  const activated = await admin.post('/api/v1/plugins/diorama/activate');
  expect(activated.statusCode, activated.body).toBe(200);
});

afterAll(async () => {
  await app?.get(MediaService).idle();
  await app?.close();
  await owner?.close();
});

describe('Diorama', () => {
  it('makes one slider from pictures, and invites to Pro for a second one', async () => {
    const png = await sharp({
      create: { width: 1800, height: 1000, channels: 3, background: '#2266aa' },
    })
      .png()
      .toBuffer();
    const uploaded = await admin.upload('/api/v1/media', 'harbour.png', png, 'image/png');
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const media = uploaded.json();
    await admin.request('PATCH', `/api/v1/media/${media.id}`, {
      alt: { en: 'The harbour at dawn' },
    });
    await app.get(MediaService).idle();

    expect((await admin.get(ext('/sliders'))).json()).toMatchObject({
      count: 0,
      limit: 1,
      canCreate: true,
    });
    const created = await admin.post(ext('/sliders'), {
      title: 'Home',
      quick: [
        {
          image: { id: media.id, url: media.url },
          title: 'Welcome aboard',
          button: 'Book',
          link: { kind: 'url', value: 'https://example.com/book' },
        },
        { image: { id: media.id, url: media.url }, title: 'Second' },
      ],
    });
    expect(created.statusCode, created.body).toBe(201);
    sliderId = created.json().id;
    expect(created.json()).toMatchObject({ title: 'Home', alias: 'home' });
    expect(created.json().data.slides).toHaveLength(2);

    const second = await admin.post(ext('/sliders'), { template: 'hero-cta' });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: 'limit', limit: 1 });
    expect(second.json().upgradeUrl).toContain('diorama-pro');
    expect((await admin.post(ext(`/sliders/${sliderId}/duplicate`))).statusCode).toBe(409);
    expect((await admin.get(ext('/sliders'))).json()).toMatchObject({ count: 1, canCreate: false });

    // Editing the slider is always allowed.
    const saved = await admin.request('PUT', ext(`/sliders/${sliderId}`), {
      title: 'Home slider',
      data: {
        ...created.json().data,
        navigation: { ...created.json().data.navigation, style: 'pill' },
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().data.navigation.style).toBe('pill');
  });

  it('shows the slider on a public page, light and accessible', async () => {
    const { path } = await publish('page', 'With slider', [sliderBlock({ slider: sliderId })]);
    const res = await visitor.get(path);
    expect(res.statusCode).toBe(200);
    const html = res.body;
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('aria-label="Home slider"');
    expect(html).toContain('class="dio dio--slider dio--fullwidth dio-nav--pill');
    expect(html).toMatch(/<script[^>]+plugin-assets\/diorama\/1\.2\.0\/diorama\.js/);
    // The height is reserved in CSS, in the head (no layout shift).
    expect(html).toMatch(/<style[^>]*>[^<]*\.dio__stage\{position:relative;height:var\(--dio-h\)/);
    // The media library's picture: responsive sources, its alternative text, the first one first.
    expect(html).toMatch(/<source type="image\/webp" srcSet="[^"]+ \d+w/);
    expect(html).toContain('alt="The harbour at dawn"');
    expect(html).toContain('fetchPriority="high"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('<h2 class="dio-l');
    expect(html).toContain('href="https://example.com/book"');

    const plain = await publish('page', 'Without slider', []);
    expect((await visitor.get(plain.path)).body).not.toContain('diorama.js');
  });

  it('turns a [diorama] shortcode alone in a paragraph into the slider', async () => {
    const { path } = await publish('page', 'Shortcode', [
      {
        id: 'p1',
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: '[diorama alias="home"]' }],
      },
    ]);
    const html = (await visitor.get(path)).body;
    expect(html).toContain('aria-label="Home slider"');
    expect(html).not.toContain('[diorama');
  });

  it('shows the latest posts as slides', async () => {
    await publish('article', 'Autumn menu is here', [
      {
        id: 'a1',
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: 'Chestnuts and mushrooms.' }],
      },
    ]);
    const record = (await admin.get(ext(`/sliders/${sliderId}`))).json();
    const template = record.data.slides[0];
    template.layers[0].children[0].content.text = '{{title}}';
    template.layers[0].children[1].content.link = { kind: 'post', value: '' };
    const saved = await admin.request('PUT', ext(`/sliders/${sliderId}`), {
      data: {
        ...record.data,
        source: { kind: 'posts', count: 3, category: '', excerptLength: 100 },
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const { path } = await publish('page', 'News', [sliderBlock({ slider: sliderId })]);
    const html = (await visitor.get(path)).body;
    expect(html).toContain('>Autumn menu is here</h2>');
    expect(html).toMatch(/href="[^"]*autumn-menu-is-here"/);
    // Back to slides made by hand for the next tests.
    await admin.request('PUT', ext(`/sliders/${sliderId}`), { data: record.data });
  });

  it('moves the sliders with a site export, and back', async () => {
    const host = app.get(PluginHost);
    const exported = (await host.applyFilter(
      'export.pluginData',
      {},
      { siteId: site.id },
      site.id,
    )) as Record<string, { sliders: { id: string; title: string; data: { slides: unknown[] } }[] }>;
    expect(exported.diorama!.sliders).toHaveLength(1);
    expect(exported.diorama!.sliders[0]!.id).toBe(sliderId);
    const data = structuredClone(exported.diorama!);
    data.sliders[0]!.title = 'Imported';
    const result = await host.applyFilter(
      'import.pluginData',
      null,
      {
        siteId: site.id,
        slug: 'diorama',
        data,
        idMap: { entries: {}, terms: {}, media: {} },
        userId: '',
      },
      site.id,
    );
    expect(result?.warnings).toContain('Diorama: 1 slider imported.');
    const list = (await admin.get(ext('/sliders'))).json();
    expect(list.count).toBe(1);
    expect(list.sliders[0].title).toBe('Imported');
  });

  it('moves sliders and their pictures to another site through an archive', async () => {
    const host = app.get(PluginHost);
    const storage = new DiskStorage(app.get<AppConfig>(APP_CONFIG).media.path);
    const pluginData = await host.applyFilter(
      'export.pluginData',
      {},
      { siteId: site.id },
      site.id,
    );
    const { document, files } = await exportSite(
      owner.db,
      site.id,
      { name: 'Diorama' },
      undefined,
      pluginData,
    );
    expect(document.plugins?.diorama).toBeDefined();
    const archive = join(await mkdtemp(join(tmpdir(), 'diorama-archive-')), 'site.tar.gz');
    await writeArchive(archive, document, files, (key) => storage.pathOf(key));

    const copy = await seedSite(owner, 'diorama-copy');
    const copyAdmin = await seedUser(owner, {
      email: 'admin@diorama-copy.test',
      password: PASSWORD,
      site: copy,
      role: 'administrator',
    });
    const client = new TestClient(app, copy.host, '10.62.0.3');
    await client.login('admin@diorama-copy.test', PASSWORD);
    expect((await client.post('/api/v1/plugins/diorama/activate')).statusCode).toBe(200);
    const opened = await openArchive(archive);
    const report = await importDocument(opened.document, {
      db: owner.db,
      siteId: copy.id,
      asUserId: copyAdmin,
      media: app.get(MediaService),
      cache: app.get(PageCacheService),
      readFile: fileReader(opened.dir),
      importPluginData: (input) =>
        host.applyFilter(
          'import.pluginData',
          null,
          { siteId: copy.id, userId: copyAdmin, ...input },
          copy.id,
        ),
      activePlugins: await host.activeSlugs(copy.id),
    });
    await opened.close();
    expect(report.errors).toEqual([]);
    expect(report.warnings).toContain('Diorama: 1 slider imported.');

    const list = (await client.get(ext('/sliders'))).json();
    expect(list.count).toBe(1);
    const moved = (await client.get(ext(`/sliders/${list.sliders[0].id}`))).json();
    // Same server: the id was taken, so the copy has its own; its pictures are the copy's.
    expect(moved.id).not.toBe(sliderId);
    const image = moved.data.slides[0].background.image;
    expect(image.url).toContain(`/media/${copy.id}/`);
    expect(image.id).not.toBe(document.media![0]!.ref);
    // Pages of the copy still show it, through the old id.
    const page = await new TestClient(app, copy.host, '10.62.0.4').get('/with-slider');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('aria-roledescription="carousel"');
    expect(page.body).toContain(`/media/${copy.id}/`);
  });

  it('lets Diorama Pro lift the limit', async () => {
    const api = (globalThis as unknown as Record<symbol, { sliderLimit: (() => number)[] }>)[
      Symbol.for('cleitext.diorama')
    ]!;
    api.sliderLimit.push(() => Infinity);
    try {
      const second = await admin.post(ext('/sliders'), { template: 'restaurant' });
      expect(second.statusCode, second.body).toBe(201);
      expect(second.json().title).toBe('Restaurant');
      expect((await admin.get(ext('/sliders'))).json()).toMatchObject({
        count: 2,
        limit: null,
        canCreate: true,
      });
    } finally {
      api.sliderLimit.pop();
    }
  });

  it('keeps its API for people who manage sliders', async () => {
    expect((await visitor.get(ext('/sliders'))).statusCode).toBe(401);
    expect((await admin.get(ext('/sliders/not-an-id'))).statusCode).toBe(404);
  });
});

async function setMode(fontsAdmin: TestClient, mode: 'local' | 'provider' | 'theme') {
  const saved = await fontsAdmin.request('PATCH', '/api/v1/settings/core', { webFonts: mode });
  expect(saved.statusCode, saved.body).toBe(200);
}

describe('Diorama’s fonts (1.2)', () => {
  let path = '';
  let fontsAdmin: TestClient;
  let fontsVisitor: TestClient;

  beforeAll(async () => {
    // Another site: the free version keeps one slider per site.
    const other = await seedSite(owner, 'diorama-fonts');
    await seedUser(owner, {
      email: 'admin@diorama-fonts.test',
      password: PASSWORD,
      site: other,
      role: 'administrator',
    });
    fontsAdmin = new TestClient(app, other.host, '10.62.0.5');
    await fontsAdmin.login('admin@diorama-fonts.test', PASSWORD);
    fontsVisitor = new TestClient(app, other.host, '10.62.0.6');
    expect((await fontsAdmin.post('/api/v1/plugins/diorama/activate')).statusCode).toBe(200);
  });

  it('keeps a Google font chosen in a slider on the site: no address of Google on the page', async () => {
    const created = await fontsAdmin.post(ext('/sliders'), {
      title: 'Outdoor',
      data: {
        type: 'hero',
        slides: [
          {
            layers: [
              {
                type: 'heading',
                content: { text: 'Cimone\nOutdoor', tag: 'h1' },
                style: {
                  base: { fontFamily: 'Rubik', fontWeight: 700, strokeWidth: 2, outline: true },
                },
              },
              {
                type: 'button',
                content: { text: 'Book' },
                style: { base: { fontFamily: 'Rubik', minHeight: 52 } },
              },
            ],
          },
        ],
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const entry = await fontsAdmin.post('/api/v1/entries', {
      type: 'page',
      title: 'Outdoor',
      document: {
        schema: 1,
        blocks: [
          {
            id: 'bfont1',
            type: 'diorama/slider',
            v: 1,
            attrs: { slider: created.json().id },
          },
        ],
      },
    });
    const published = await fontsAdmin.post(`/api/v1/entries/${entry.json().id}/publish`);
    expect(published.statusCode, published.body).toBe(200);
    path = `/${published.json().slug as string}`;

    const html = (await fontsVisitor.get(path)).body;
    expect(html).toContain('font-family:"Rubik",sans-serif');
    expect(html).toContain('-webkit-text-stroke:2px #000000');
    expect(html).toContain('Cimone<br/>Outdoor');
    expect(html).not.toMatch(GOOGLE);
    expect(html).not.toContain('data-dio-fonts');
    // One copy of the family, in the head.
    expect(copies(html)).toEqual(['Rubik']);
    const head = html.slice(0, html.indexOf('</head>'));
    expect(copies(head)).toEqual(['Rubik']);
    // Asked of Google once, with the weights the slider uses.
    expect(calls.filter((c) => c.includes('/css2'))).toEqual([
      'https://fonts.googleapis.com/css2?family=Rubik:wght@600;700&display=swap',
    ]);
  });

  it('links Google once when the site lets pages use the services', async () => {
    await setMode(fontsAdmin, 'provider');
    try {
      const html = (await fontsVisitor.get(path)).body;
      const links = html.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]+/g) ?? [];
      expect(links).toEqual([
        'https://fonts.googleapis.com/css2?family=Rubik:wght@600;700&amp;display=swap',
      ]);
      expect(html.indexOf(links[0]!)).toBeLessThan(html.indexOf('</head>'));
    } finally {
      await setMode(fontsAdmin, 'local');
    }
  });

  it('gives the editor the site’s copies of the fonts asked for, only to people who manage sliders', async () => {
    const page = await fontsAdmin.get('/_diorama/fonts?f=Rubik:700');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('data-dio-probe="heading"');
    expect(page.body).toContain('data-dio-probe="text"');
    expect(copies(page.body)).toContain('Rubik');
    expect(page.body).not.toMatch(GOOGLE);
    expect((await fontsVisitor.get('/_diorama/fonts?f=Rubik:700')).statusCode).toBe(404);
  });
});
