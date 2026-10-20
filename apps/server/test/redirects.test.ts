/** Redirects from the admin (RF-NAV-04). */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCsvLine } from '../src/settings/redirects.controller.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let editor: TestClient;
let visitor: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const site = await seedSite(owner, 'redirects');
  await seedUser(owner, {
    email: 'admin@redirects.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'editor@redirects.test',
    password: PASSWORD,
    site,
    role: 'editor',
  });
  admin = new TestClient(app, site.host, '10.36.0.1');
  editor = new TestClient(app, site.host, '10.36.0.2');
  visitor = new TestClient(app, site.host, '10.36.0.3');
  await admin.login('admin@redirects.test', PASSWORD);
  await editor.login('editor@redirects.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('redirects', () => {
  it('creates, follows, counts, edits and deletes redirects', async () => {
    const created = await admin.post('/api/v1/redirects', { from: '/old-page', to: '/new-page' });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await editor.get('/api/v1/redirects')).statusCode).toBe(403);
    expect(
      (await admin.post('/api/v1/redirects', { from: '/old-page', to: '/x' })).statusCode,
    ).toBe(409);
    expect((await admin.post('/api/v1/redirects', { from: '/loop', to: '/loop' })).statusCode).toBe(
      400,
    );
    expect((await admin.post('/api/v1/redirects', { from: 'no-slash', to: '/x' })).statusCode).toBe(
      400,
    );

    // With a trailing slash (as WordPress wrote addresses), straight there: one hop (and a hit).
    const slashed = await visitor.get('/old-page/');
    expect(slashed.statusCode).toBe(301);
    expect(slashed.headers.location).toBe('/new-page');
    const hit = await visitor.get('/old-page');
    expect(hit.statusCode).toBe(301);
    expect(hit.headers.location).toBe('/new-page');
    const list = (await admin.get('/api/v1/redirects?q=old')).json();
    expect(list).toEqual([{ id, from: '/old-page', to: '/new-page', status: 301, hits: 2 }]);

    await admin.request('PATCH', `/api/v1/redirects/${id}`, {
      from: '/old-page',
      to: 'https://example.com/',
      status: 302,
    });
    const moved = await visitor.get('/old-page');
    expect([moved.statusCode, moved.headers.location]).toEqual([302, 'https://example.com/']);

    await admin.post('/api/v1/redirects', { from: '/gone', to: '', status: 410 });
    expect((await visitor.get('/gone')).statusCode).toBe(410);

    // Old addresses with a query, as WordPress's /?p=123.
    await admin.post('/api/v1/redirects', { from: '/?p=123', to: '/new-page' });
    const query = await visitor.get('/?p=123');
    expect([query.statusCode, query.headers.location]).toEqual([301, '/new-page']);
    expect((await visitor.get('/?p=124')).statusCode).toBe(200);

    expect((await admin.request('DELETE', `/api/v1/redirects/${id}`)).statusCode).toBe(204);
    expect((await visitor.get('/old-page')).statusCode).toBe(404);
  });

  it('follows pages that move, with their subpages', async () => {
    const page = async (title: string, slug: string, parentId?: string) => {
      const created = (
        await admin.post('/api/v1/entries', {
          type: 'page',
          title,
          slug,
          ...(parentId ? { parentId } : {}),
        })
      ).json();
      await admin.post(`/api/v1/entries/${created.id}/publish`);
      return created.id as string;
    };
    const services = await page('Services', 'services');
    await page('Design', 'design', services);
    const other = await page('Company', 'company');
    expect((await visitor.get('/services/design')).statusCode).toBe(200);

    // The parent changes slug: it and its subpage redirect.
    await admin.request('PATCH', `/api/v1/entries/${services}`, { slug: 'what-we-do' });
    for (const [from, to] of [
      ['/services', '/what-we-do'],
      ['/services/design', '/what-we-do/design'],
    ]) {
      const res = await visitor.get(from!);
      expect(res.statusCode).toBe(301);
      expect(res.headers.location).toBe(to);
    }
    expect((await visitor.get('/what-we-do/design')).statusCode).toBe(200);

    // The subpage moves to another parent: the old address follows it.
    const design = (await admin.get('/api/v1/entries?type=page&limit=50'))
      .json()
      .items.find((e: { slug: string }) => e.slug === 'design').id;
    await admin.request('PATCH', `/api/v1/entries/${design}`, { parentId: other });
    const moved = await visitor.get('/what-we-do/design');
    expect(moved.statusCode).toBe(301);
    expect(moved.headers.location).toBe('/company/design');
    // Older redirects are updated, so there is never a chain.
    expect((await visitor.get('/services/design')).headers.location).toBe('/company/design');
  });

  it('imports CSV, reporting bad lines', async () => {
    const csv = [
      'from,to,status',
      '/a,/b',
      '"/c, with comma","/d",308',
      '/e,',
      'x,/y',
      '/a,/b2,301',
    ].join('\n');
    const result = (await admin.post('/api/v1/redirects/import', { csv })).json();
    expect(result.saved).toBe(3);
    expect(result.errors.map((e: { line: number }) => e.line)).toEqual([4, 5]);
    const list = (await admin.get('/api/v1/redirects')).json();
    expect(list.find((r: { from: string }) => r.from === '/a').to).toBe('/b2');
    expect(list.find((r: { from: string }) => r.from === '/c, with comma').status).toBe(308);
  });

  it('parses quoted CSV cells', () => {
    expect(parseCsvLine('"a ""b""",c;d')).toEqual(['a "b"', 'c', 'd']);
  });
});
