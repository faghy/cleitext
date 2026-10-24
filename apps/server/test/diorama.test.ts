/**
 * The official Diorama plugin: one slider per site in the free version (a
 * second one is refused with the invitation's code, and Diorama Pro's hook
 * lifts the limit), the block on a public page with the media library's
 * responsive pictures (plugin API 1.46, `context.loadMedia`), the runtime
 * only where a slider is, the latest posts as slides, the `[diorama]`
 * shortcode, and the sliders in a site export and back.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config/config.js';
import { MediaService } from '../src/media/media.service.js';
import { DiskStorage } from '../src/media/storage.js';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
import { PageCacheService } from '../src/public/page-cache.service.js';
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

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;
let sliderId = '';

async function install(slug: string, pluginsPath: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules') && !file.includes(`${slug}/dist`),
  });
  await buildPlugin(source);
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
    expect(html).toMatch(/<script[^>]+plugin-assets\/diorama\/1\.0\.0\/diorama\.js/);
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
