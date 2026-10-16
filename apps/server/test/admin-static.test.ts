/** The built admin served by the server in production (docs/DEPLOYMENT.md). */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, startTestApp, type SeededSite } from './helpers.js';

let app: NestFastifyApplication;
let site: SeededSite;

beforeAll(async () => {
  const admin = await mkdtemp(join(tmpdir(), 'cleitext-admin-'));
  await mkdir(join(admin, 'assets'));
  await writeFile(
    join(admin, 'index.html'),
    '<!doctype html><title>Cleitext admin</title><script>window.x = 1;</script>',
  );
  await writeFile(join(admin, 'assets', 'main-abc123.js'), 'console.log(1)');
  await mkdir(join(admin, 'brand'));
  await writeFile(join(admin, 'brand', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  app = await startTestApp({ env: { ADMIN_PATH: admin } });
  const owner = ownerDatabase();
  site = await seedSite(owner, 'admin-static');
  await owner.close();
});

afterAll(async () => {
  await app?.close();
});

const get = (url: string) => app.inject({ method: 'GET', url, headers: { host: site.host } });

describe('built admin', () => {
  it('serves the Cleitext logo files', async () => {
    const res = await get('/cl-admin/brand/logo.svg');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.body).toContain('<svg');
  });

  it('answers every admin address with the single-page app', async () => {
    for (const url of ['/cl-admin', '/cl-admin/', '/cl-admin/posts', '/cl-admin/entries/123']) {
      const res = await get(url);
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Cleitext admin');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['x-frame-options']).toBe('DENY');
    }
  });

  it('sends the old /admin addresses to /cl-admin, with their path and query', async () => {
    for (const [from, to] of [
      ['/admin', '/cl-admin'],
      ['/admin/', '/cl-admin/'],
      ['/admin/entries/123?tab=seo', '/cl-admin/entries/123?tab=seo'],
    ]) {
      const res = await get(from!);
      expect(res.statusCode).toBe(301);
      expect(res.headers.location).toBe(to);
    }
  });

  it('sends a content security policy allowing only its own scripts', async () => {
    const res = await get('/cl-admin/login');
    const csp = String(res.headers['content-security-policy']);
    const hash = createHash('sha256').update('window.x = 1;').digest('base64');
    expect(csp).toContain(`script-src 'self' 'sha256-${hash}'`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves hashed assets with a long cache', async () => {
    const res = await get('/cl-admin/assets/main-abc123.js');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
    expect((await get('/cl-admin/assets/missing.js')).statusCode).toBe(404);
  });

  it('leaves the API and the public site alone', async () => {
    expect((await get('/api/v1/auth/me')).statusCode).toBe(401);
    expect((await get('/')).statusCode).toBe(200);
  });
});
