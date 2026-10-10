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

  it('searches captions and alternative texts and filters by type', async () => {
    const res = await author.upload('/api/v1/media', 'img-1.png', await png(20, 20), 'image/png');
    const id = res.json().id;
    const updated = await author.request('PATCH', `/api/v1/media/${id}`, {
      caption: { it: 'Tramonto sul lago' },
      alt: { en: 'Lighthouse' },
    });
    expect(updated.json().caption).toEqual({ it: 'Tramonto sul lago' });
    const byCaption = (await author.get('/api/v1/media?q=tramonto')).json();
    expect(byCaption.items.map((m: { id: string }) => m.id)).toEqual([id]);
    const byAlt = (await author.get('/api/v1/media?q=lighthouse')).json();
    expect(byAlt.items.map((m: { id: string }) => m.id)).toEqual([id]);
    expect((await author.get('/api/v1/media?kind=video')).json().items).toEqual([]);
    expect((await author.get('/api/v1/media?kind=other')).statusCode).toBe(400);
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

describe('duplicates, usage and focal point', () => {
  it('reuses a file uploaded twice and tells where media are used', async () => {
    const data = await png(31, 17);
    const first = (await author.upload('/api/v1/media', 'same.png', data, 'image/png')).json();
    const again = await author.upload('/api/v1/media', 'same-again.png', data, 'image/png');
    expect(again.json()).toMatchObject({ id: first.id, duplicate: true });

    expect((await author.get(`/api/v1/media/${first.id}/usage`)).json()).toEqual([]);
    const entry = (
      await author.post('/api/v1/entries', {
        type: 'article',
        title: 'Uses it',
        featuredMediaId: first.id,
      })
    ).json();
    const usage = (await author.get(`/api/v1/media/${first.id}/usage`)).json();
    expect(usage).toEqual([{ id: entry.id, type: 'article', title: 'Uses it', status: 'draft' }]);
  });

  it('keeps a focal point, used where images are cropped', async () => {
    const image = (
      await author.upload('/api/v1/media', 'focus.png', await png(60, 40), 'image/png')
    ).json();
    const updated = await author.request('PATCH', `/api/v1/media/${image.id}`, {
      focalPoint: { x: 0.25, y: 0.8 },
    });
    expect(updated.json().focalPoint).toEqual({ x: 0.25, y: 0.8 });
    expect(
      (await author.request('PATCH', `/api/v1/media/${image.id}`, { focalPoint: { x: 2, y: 0 } }))
        .statusCode,
    ).toBe(400);
    const entry = (
      await author.post('/api/v1/entries', {
        type: 'article',
        title: 'Focus',
        document: {
          schema: 1,
          blocks: [{ id: 'i', type: 'core/image', v: 1, attrs: { id: image.id, url: image.url } }],
        },
      })
    ).json();
    await author.post(`/api/v1/entries/${entry.id}/publish`);
    const page = await author.get(`/${new Date().getUTCFullYear()}/${entry.slug}`);
    expect(page.body).toContain('object-position:25% 80%');
  });

  it('refuses SVG unless enabled', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect((await author.upload('/api/v1/media', 'x.svg', svg, 'image/svg+xml')).statusCode).toBe(
      415,
    );
  });
});

describe('profile pictures', () => {
  it('crops the image, serves it on every site and replaces it', async () => {
    const res = await author.upload('/api/v1/profile/avatar', 'me.png', await png(600, 300));
    expect(res.statusCode).toBe(201);
    const { avatarUrl } = res.json();
    expect(avatarUrl).toMatch(/^\/media\/avatars\/[0-9a-f-]+\/[0-9a-f-]+\.webp$/);
    const image = await author.get(avatarUrl);
    expect(image.statusCode).toBe(200);
    const meta = await sharp(image.rawPayload).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 256, 256]);
    // Users belong to several sites: the picture is served on all of them.
    expect((await stranger.get(avatarUrl)).statusCode).toBe(200);
    expect((await author.get('/api/v1/auth/me')).json().user.avatarUrl).toBe(avatarUrl);

    const next = (
      await author.upload('/api/v1/profile/avatar', 'me2.png', await png(80, 80))
    ).json().avatarUrl;
    expect(next).not.toBe(avatarUrl);
    expect((await author.get(avatarUrl)).statusCode).toBe(404);

    const removed = await author.request('DELETE', '/api/v1/profile/avatar');
    expect(removed.json()).toEqual({ avatarUrl: null });
    expect((await author.get(next)).statusCode).toBe(404);
  });

  it('accepts only images', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    const res = await author.upload('/api/v1/profile/avatar', 'me.pdf', pdf);
    expect(res.statusCode).toBe(415);
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
