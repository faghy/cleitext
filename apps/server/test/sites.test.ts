/** Site management by super admins (RF-SIT-03). */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
let root: TestClient;
let admin: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'hq');
  await seedUser(owner, { email: 'root@sites.test', password: PASSWORD, superAdmin: true });
  await seedUser(owner, {
    email: 'admin@sites.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  root = new TestClient(app, site.host, '10.15.0.1');
  await root.login('root@sites.test', PASSWORD);
  admin = new TestClient(app, site.host, '10.15.0.2');
  await admin.login('admin@sites.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('sites', () => {
  it('creates a site that answers on its domain at once', async () => {
    const created = await root.post('/api/v1/sites', {
      slug: 'blog',
      name: 'The Blog',
      host: 'https://Blog.Sites.test/',
      locale: 'it',
      forceHttps: false,
    });
    expect(created.statusCode).toBe(201);
    const blog = created.json().find((s: { slug: string }) => s.slug === 'blog');
    expect(blog).toMatchObject({
      name: 'The Blog',
      defaultLocale: 'it',
      domains: [{ host: 'blog.sites.test', isPrimary: true }],
    });

    const home = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'blog.sites.test' },
    });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain('lang="it"');

    expect(
      (await root.post('/api/v1/sites', { slug: 'blog', name: 'Again', host: 'other.sites.test' }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await root.post('/api/v1/sites', {
          slug: 'blog2',
          name: 'Same host',
          host: 'blog.sites.test',
        })
      ).statusCode,
    ).toBe(409);
  });

  it('manages domains: aliases, primary, removal', async () => {
    const list = (await root.get('/api/v1/sites')).json();
    const blog = list.find((s: { slug: string }) => s.slug === 'blog');
    let sites = (
      await root.post(`/api/v1/sites/${blog.id}/domains`, {
        host: 'www.blog.sites.test',
        forceHttps: false,
      })
    ).json();
    let domains = sites.find((s: { id: string }) => s.id === blog.id).domains;
    const alias = domains.find((d: { host: string }) => d.host === 'www.blog.sites.test');
    expect(alias.isPrimary).toBe(false);
    const redirected = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'www.blog.sites.test' },
    });
    expect(redirected.statusCode).toBe(301);

    sites = (
      await root.request('PATCH', `/api/v1/sites/domains/${alias.id}`, { isPrimary: true })
    ).json();
    domains = sites.find((s: { id: string }) => s.id === blog.id).domains;
    expect(domains[0]).toMatchObject({ host: 'www.blog.sites.test', isPrimary: true });
    const old = domains.find((d: { host: string }) => d.host === 'blog.sites.test');
    expect((await root.request('DELETE', `/api/v1/sites/domains/${alias.id}`)).statusCode).toBe(
      400,
    );
    expect((await root.request('DELETE', `/api/v1/sites/domains/${old.id}`)).statusCode).toBe(200);
  });

  it('archives a site: its domains stop answering', async () => {
    const blog = (await root.get('/api/v1/sites'))
      .json()
      .find((s: { slug: string }) => s.slug === 'blog');
    await root.request('PATCH', `/api/v1/sites/${blog.id}`, {
      status: 'archived',
      name: 'Old blog',
    });
    const gone = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'www.blog.sites.test' },
    });
    expect(gone.statusCode).toBe(404);
    const current = (await root.get('/api/v1/sites'))
      .json()
      .find((s: { slug: string }) => s.slug === 'hq');
    expect(
      (await root.request('PATCH', `/api/v1/sites/${current.id}`, { status: 'archived' }))
        .statusCode,
    ).toBe(400);
  });

  it('is reserved to super admins', async () => {
    expect((await admin.get('/api/v1/sites')).statusCode).toBe(403);
  });
});
