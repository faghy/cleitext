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

    const hit = await visitor.get('/old-page');
    expect(hit.statusCode).toBe(301);
    expect(hit.headers.location).toBe('/new-page');
    const list = (await admin.get('/api/v1/redirects?q=old')).json();
    expect(list).toEqual([{ id, from: '/old-page', to: '/new-page', status: 301, hits: 1 }]);

    await admin.request('PATCH', `/api/v1/redirects/${id}`, {
      from: '/old-page',
      to: 'https://example.com/',
      status: 302,
    });
    const moved = await visitor.get('/old-page');
    expect([moved.statusCode, moved.headers.location]).toEqual([302, 'https://example.com/']);

    await admin.post('/api/v1/redirects', { from: '/gone', to: '', status: 410 });
    expect((await visitor.get('/gone')).statusCode).toBe(410);

    expect((await admin.request('DELETE', `/api/v1/redirects/${id}`)).statusCode).toBe(204);
    expect((await visitor.get('/old-page')).statusCode).toBe(404);
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
