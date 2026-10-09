/** Media library (milestone M2): uploads, type checks, variants, isolation. */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MediaService } from '../src/media/media.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let author: TestClient;
let contributor: TestClient;
let stranger: TestClient;

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#3366cc' } })
    .png()
    .toBuffer();

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'media');
  const other = await seedSite(owner, 'media-other');
  await seedUser(owner, { email: 'author@media.test', password: PASSWORD, site, role: 'author' });
  await seedUser(owner, {
    email: 'contrib@media.test',
    password: PASSWORD,
    site,
    role: 'contributor',
  });
  await seedUser(owner, {
    email: 'admin@media-other.test',
    password: PASSWORD,
    site: other,
    role: 'administrator',
  });
  author = new TestClient(app, site.host, '10.8.0.1');
  contributor = new TestClient(app, site.host, '10.8.0.2');
  stranger = new TestClient(app, other.host, '10.8.0.3');
  await author.login('author@media.test', PASSWORD);
  await contributor.login('contrib@media.test', PASSWORD);
  await stranger.login('admin@media-other.test', PASSWORD);
});

afterAll(async () => {
  await app?.get(MediaService).idle();
  await app?.close();
  await owner?.close();
});

describe('upload', () => {
  it('stores an image under a generated name and creates resized variants', async () => {
    const res = await author.upload(
      '/api/v1/media',
      '../../evil name.png',
      await png(1600, 900),
      'image/png',
    );
    expect(res.statusCode, res.body).toBe(201);
    const uploaded = res.json();
    expect(uploaded).toMatchObject({
      filename: 'evil name.png',
      mime: 'image/png',
      kind: 'image',
      width: 1600,
      height: 900,
    });
    expect(uploaded.url).toMatch(new RegExp(`^/media/${site.id}/\\d{4}/\\d{2}/[0-9a-f-]+\\.png$`));

    await app.get(MediaService).idle();
    const media = (await author.get(`/api/v1/media/${uploaded.id}`)).json();
    const names = media.variants.map(
      (v: { variant: string; format: string }) => `${v.variant}.${v.format}`,
    );
    // 1600 px wide: thumb, md and lg; no xl (it would be an enlargement).
    expect(names.sort()).toEqual([
      'lg.avif',
      'lg.webp',
      'md.avif',
      'md.webp',
      'thumb.avif',
      'thumb.webp',
    ]);
    const thumb = media.variants.find(
      (v: { variant: string; format: string }) => v.variant === 'thumb' && v.format === 'webp',
    );
    expect(thumb).toMatchObject({ width: 300, height: 169 });

    const file = await author.get(media.url);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect((await author.get(thumb.url)).headers['content-type']).toBe('image/webp');
  });

  it('checks the real type of the file, not its name', async () => {
    const fake = Buffer.from('MZ\x90\x00 this is an executable');
    const res = await author.upload('/api/v1/media', 'photo.png', fake, 'image/png');
    expect(res.statusCode).toBe(415);
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(
      (await author.upload('/api/v1/media', 'logo.svg', svg, 'image/svg+xml')).statusCode,
    ).toBe(415);
  });

  it('accepts PDF documents without variants', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF');
    const res = await author.upload('/api/v1/media', 'brochure.pdf', pdf);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      mime: 'application/pdf',
      kind: 'document',
      width: null,
      variants: [],
    });
  });

  it('is not allowed without upload_media', async () => {
    const res = await contributor.upload('/api/v1/media', 'a.png', await png(10, 10), 'image/png');
    expect(res.statusCode).toBe(403);
  });
});

describe('library', () => {
  it('lists, filters and updates alternative text per language', async () => {
    const res = await author.upload('/api/v1/media', 'cat.png', await png(400, 300), 'image/png');
    const id = res.json().id;
    const images = (await author.get('/api/v1/media?kind=image')).json();
    expect(images.items.every((m: { kind: string }) => m.kind === 'image')).toBe(true);
    expect(images.items.some((m: { id: string }) => m.id === id)).toBe(true);
    const found = (await author.get('/api/v1/media?q=cat')).json();
    expect(found.items.map((m: { filename: string }) => m.filename)).toContain('cat.png');

    const updated = await author.request('PATCH', `/api/v1/media/${id}`, {
      alt: { en: 'A cat', it: 'Un gatto' },
    });
    expect(updated.json().alt).toEqual({ en: 'A cat', it: 'Un gatto' });
  });

  it('deletes the file and its variants', async () => {
    const res = await author.upload('/api/v1/media', 'gone.png', await png(800, 600), 'image/png');
    const { id, url } = res.json();
    await app.get(MediaService).idle();
    const variants = (await author.get(`/api/v1/media/${id}`)).json().variants;
    expect((await author.request('DELETE', `/api/v1/media/${id}`)).statusCode).toBe(204);
    expect((await author.get(`/api/v1/media/${id}`)).statusCode).toBe(404);
    expect((await author.get(url)).statusCode).toBe(404);
    expect((await author.get(variants[0].url)).statusCode).toBe(404);
  });
});

describe('isolation', () => {
  it('does not serve or expose files of another site', async () => {
    const res = await author.upload('/api/v1/media', 'mine.png', await png(50, 50), 'image/png');
    const { id, url } = res.json();
    expect((await stranger.get(url)).statusCode).toBe(404);
    expect((await stranger.get(`/api/v1/media/${id}`)).statusCode).toBe(404);
    expect((await stranger.get('/api/v1/media')).json().items).toEqual([]);
  });

  it('rejects path traversal', async () => {
    for (const path of [
      `/media/${site.id}/../../etc/passwd`,
      `/media/${site.id}/%2e%2e/%2e%2e/etc/passwd`,
      `/media/${site.id}/..%2f..%2fetc%2fpasswd`,
    ]) {
      const res = await author.get(path);
      expect([400, 403, 404], path).toContain(res.statusCode);
      expect(res.body).not.toContain('root:');
    }
  });
});
