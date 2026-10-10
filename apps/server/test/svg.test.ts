/** SVG uploads when enabled (RF-MED-09): sanitized, served without scripts. */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../src/media/media-types.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const EVIL = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" onload="alert(1)">
  <script>alert(2)</script>
  <style>circle { fill: url(https://evil.example/x) }</style>
  <foreignObject><iframe src="https://evil.example"></iframe></foreignObject>
  <defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>
  <circle cx="5" cy="5" r="4" fill="url(#g)" onclick="alert(3)"/>
  <use xlink:href="https://evil.example/sprite.svg#a"/>
  <use href="#g"/>
  <a href="javascript:alert(4)"><text x="1" y="9">Hi</text></a>
</svg>`;

let app: NestFastifyApplication;
let owner: DatabaseClient;
let author: TestClient;

beforeAll(async () => {
  app = await startTestApp({ env: { MEDIA_ALLOW_SVG: 'true' } });
  owner = ownerDatabase();
  const site = await seedSite(owner, 'svg');
  await seedUser(owner, { email: 'author@svg.test', password: PASSWORD, site, role: 'author' });
  author = new TestClient(app, site.host, '10.38.0.1');
  await author.login('author@svg.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('SVG', () => {
  it('keeps the drawing and drops everything active', () => {
    const clean = sanitizeSvg(EVIL);
    expect(clean).toContain('viewBox="0 0 10 10"');
    expect(clean).toContain('<circle cx="5" cy="5" r="4" fill="url(#g)"');
    expect(clean).toContain('<use href="#g"');
    expect(clean).toContain('stop-color="red"');
    expect(clean).not.toMatch(
      /script|onload|onclick|style|foreignObject|iframe|evil\.example|javascript/i,
    );
  });

  it('stores sanitized SVG and serves it with a sandbox policy', async () => {
    const res = await author.upload(
      '/api/v1/media',
      'drawing.svg',
      Buffer.from(EVIL),
      'image/svg+xml',
    );
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ mime: 'image/svg+xml', kind: 'image', width: 10 });
    const file = await author.get(res.json().url);
    expect(file.body).not.toContain('alert');
    expect(file.headers['content-security-policy']).toContain('sandbox');
  });
});
