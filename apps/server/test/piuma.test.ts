/**
 * Piuma (official plugin): new pictures made lighter at upload (smaller,
 * compressed again, PNG photos to JPEG), the library done in the background
 * with addresses unchanged (plugin API 1.82: media.upload, ctx.media.find,
 * read, replace, inspect, encode).
 */
import { randomBytes } from 'node:crypto';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { MediaService } from '../src/media/media.service.js';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
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

async function install(slug: string, pluginsPath: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules') && !file.includes('.build-lock'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

const ext = (path: string) => `/api/v1/ext/piuma${path}`;
/** A photo: smooth colors, as cameras take them (noise would not compress). */
const photo = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: '#000' },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}"><defs><linearGradient id="g"><stop offset="0" stop-color="#2a6"/><stop offset="1" stop-color="#d84"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width / 3}" cy="${height / 2}" r="${height / 3}" fill="#38c"/></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer()
    .then((png) =>
      // A little grain, as in real photos.
      sharp(png)
        .composite([
          {
            input: randomBytes(64 * 64 * 3),
            raw: { width: 64, height: 64, channels: 3 },
            tile: true,
            blend: 'soft-light',
          },
        ])
        .toBuffer(),
    );
let clock = Date.now();
const runLibrary = async () => {
  clock += 2 * 60_000;
  await app.get(PluginHost).runSchedules(clock);
};
const config = (change: Record<string, unknown>) =>
  admin.request('PUT', ext('/config'), {
    onUpload: true,
    maxSize: 2560,
    quality: 82,
    pngToJpeg: true,
    ...change,
  });

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('piuma', pluginsPath);
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'piuma');
  await seedUser(owner, {
    email: 'admin@piuma.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.83.0.1');
  await admin.login('admin@piuma.test', PASSWORD);
  expect((await admin.post('/api/v1/plugins/piuma/activate')).statusCode).toBe(200);
}, 180_000);

afterAll(async () => {
  await app?.get(MediaService).idle();
  await app?.close();
  await owner?.close();
});

describe('Piuma', () => {
  it('makes new pictures smaller and lighter at upload', async () => {
    const big = await sharp(await photo(3200, 2000))
      .jpeg({ quality: 98 })
      .toBuffer();
    const uploaded = (await admin.upload('/api/v1/media', 'big.jpg', big, 'image/jpeg')).json();
    expect(uploaded).toMatchObject({ mime: 'image/jpeg', width: 2560, height: 1600 });
    expect(uploaded.sizeBytes).toBeLessThan(big.length / 2);

    // A PNG photo becomes JPEG; a logo with transparency stays PNG.
    const pngPhoto = await sharp(await photo(1200, 800))
      .png()
      .toBuffer();
    const converted = (
      await admin.upload('/api/v1/media', 'photo.png', pngPhoto, 'image/png')
    ).json();
    expect(converted.mime).toBe('image/jpeg');
    expect(converted.url).toMatch(/\/photo\.jpg$/);
    const logo = await sharp({
      create: { width: 400, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="400" height="200"><circle cx="100" cy="100" r="80" fill="#c33"/></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    const kept = (await admin.upload('/api/v1/media', 'logo.png', logo, 'image/png')).json();
    expect(kept.mime).toBe('image/png');

    // Off: the upload stays as it is.
    expect((await config({ onUpload: false })).statusCode).toBe(200);
    const raw = await sharp(await photo(3000, 1000))
      .jpeg({ quality: 98 })
      .toBuffer();
    const untouched = (await admin.upload('/api/v1/media', 'raw.jpg', raw, 'image/jpeg')).json();
    expect(untouched.width).toBe(3000);
    await config({});
  });

  it('makes the library lighter in the background, addresses unchanged', async () => {
    await config({ onUpload: false });
    const heavy = await sharp(await photo(3600, 2400))
      .jpeg({ quality: 100 })
      .toBuffer();
    const before = (await admin.upload('/api/v1/media', 'old.jpg', heavy, 'image/jpeg')).json();
    expect(before.width).toBe(3600);
    await config({});
    await app.get(MediaService).idle();

    const started = await admin.post(ext('/library/start'));
    expect(started.json()).toMatchObject({ state: 'running', seen: 0 });
    for (let i = 0; i < 5; i++) {
      await runLibrary();
      if ((await admin.get(ext('/status'))).json().job.state === 'done') break;
    }
    const { job } = (await admin.get(ext('/status'))).json();
    expect(job).toMatchObject({ state: 'done', failed: 0 });
    expect(job.optimized).toBeGreaterThanOrEqual(1);
    expect(job.bytesAfter).toBeLessThan(job.bytesBefore);

    const after = (await admin.get(`/api/v1/media/${before.id}`)).json();
    expect(after.url).toBe(before.url);
    expect(after).toMatchObject({ width: 2560, height: 1707 });
    expect(after.sizeBytes).toBeLessThan(before.sizeBytes / 2);
    const file = await admin.get(before.url);
    expect(file.statusCode).toBe(200);
    expect((await sharp(file.rawPayload).metadata()).width).toBe(2560);

    // Started again: pictures already done are left alone.
    await admin.post(ext('/library/start'));
    await runLibrary();
    const again = (await admin.get(ext('/status'))).json().job;
    expect(again).toMatchObject({ state: 'done', optimized: 0 });
  }, 120_000);
});
