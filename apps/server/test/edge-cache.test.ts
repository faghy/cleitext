/**
 * Plugin API 1.9 (`cache.headers`, `cache.invalidated`) through the official
 * Edge cache plugin: pages carry the headers for Varnish and Cloudflare, and
 * changes purge them by tag. Varnish and the Cloudflare API are local fakes.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createServer as createTcpServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
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
const TOKEN = 'cf-test-token-0123456789abcdef';

interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;
let varnish: ReturnType<typeof createTcpServer>;
let cloudflare: Server;
const bans: Seen[] = [];
const purges: Seen[] = [];

function fake(record: Seen[], answer: (req: Seen) => unknown): Promise<Server> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      const seen = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body };
      record.push(seen);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(answer(seen)));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const port = (server: { address(): unknown }) => (server.address() as AddressInfo).port;

/** Varnish's side of a BAN: Node's HTTP parser refuses the method, so plain TCP. */
function fakeVarnish(record: Seen[]): Promise<ReturnType<typeof createTcpServer>> {
  const server = createTcpServer((socket) => {
    let data = '';
    socket.on('data', (chunk: Buffer) => {
      data += chunk.toString();
      if (!data.includes('\r\n\r\n')) return;
      const [head] = data.split('\r\n\r\n');
      const [line, ...lines] = head!.split('\r\n');
      const [method, url] = line!.split(' ');
      const headers: IncomingMessage['headers'] = {};
      for (const l of lines) {
        const i = l.indexOf(':');
        headers[l.slice(0, i).toLowerCase()] = l.slice(i + 1).trim();
      }
      record.push({ method: method!, url: url!, headers, body: '' });
      socket.end('HTTP/1.1 200 Banned\r\ncontent-length: 0\r\nconnection: close\r\n\r\n');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function publish(title: string) {
  const created = (await admin.post('/api/v1/entries', { type: 'page', title })).json();
  const published = await admin.post(`/api/v1/entries/${created.id}/publish`);
  expect(published.statusCode, published.body).toBe(200);
  return published.json() as { id: string; slug: string };
}

beforeAll(async () => {
  varnish = await fakeVarnish(bans);
  cloudflare = await fake(purges, (req) =>
    req.url.endsWith('/user/tokens/verify')
      ? { success: req.headers.authorization === `Bearer ${TOKEN}`, result: { status: 'active' } }
      : { success: true },
  );
  process.env.EDGE_CACHE_CLOUDFLARE_API = `http://127.0.0.1:${port(cloudflare)}`;

  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'edge-cache-src-')), 'edge-cache');
  await cp(join(pluginsRoot, 'edge-cache'), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  site = await seedSite(owner, 'edge');
  await seedUser(owner, {
    email: 'admin@edge.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.80.0.1');
  await admin.login('admin@edge.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.80.0.2');
  expect((await admin.post('/api/v1/plugins/edge-cache/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
  varnish?.close();
  cloudflare?.close();
  delete process.env.EDGE_CACHE_CLOUDFLARE_API;
});

describe('Edge cache', () => {
  it('changes nothing until a cache is turned on', async () => {
    const res = await visitor.get('/');
    expect(res.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(res.headers['x-cleitext-tags']).toBeUndefined();
  });

  it('refuses a Cloudflare token that does not work, and keeps a good one', async () => {
    const saved = await admin.request('PATCH', '/api/v1/plugins/edge-cache/settings', {
      ttl: 7200,
      varnish: true,
      varnish_url: `http://127.0.0.1:${port(varnish)}`,
      cloudflare: true,
      cloudflare_zone: 'zone123',
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const bad = await admin.request('PUT', '/api/v1/ext/edge-cache/cloudflare-token', {
      token: 'wrong-token-0123456789abcdef',
    });
    expect(bad.statusCode).toBe(400);
    const good = await admin.request('PUT', '/api/v1/ext/edge-cache/cloudflare-token', {
      token: TOKEN,
    });
    expect(good.statusCode, good.body).toBe(200);
  });

  it('gives cached pages the headers for Varnish and Cloudflare, not signed-in visitors', async () => {
    const page = await publish('Prices');
    const first = await visitor.get(`/${page.slug}`);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(first.headers['cache-control']).toBe(
      'public, max-age=0, s-maxage=7200, must-revalidate',
    );
    expect(first.headers['cdn-cache-control']).toBe('max-age=7200');
    expect(String(first.headers['x-cleitext-tags'])).toMatch(
      new RegExp(`^site .*entry:${page.id}`),
    );
    expect(String(first.headers['cache-tag'])).toMatch(/^cx-[0-9a-f]{12}-site,/);
    const again = await visitor.get(`/${page.slug}`);
    expect(again.headers['x-cache']).toBe('HIT');
    expect(again.headers['x-cleitext-tags']).toBe(first.headers['x-cleitext-tags']);
    expect(again.headers['cache-control']).toBe(first.headers['cache-control']);

    const signedIn = await admin.get(`/${page.slug}`);
    expect(signedIn.headers['cache-control']).toBe('private, no-cache');
    expect(signedIn.headers['x-cleitext-tags']).toBeUndefined();
    expect(signedIn.headers['cache-tag']).toBeUndefined();
  });

  it('purges the changed pages from Varnish and Cloudflare, once, after the change', async () => {
    const page = await publish('Opening hours');
    await visitor.get(`/${page.slug}`);
    // The purges of the earlier changes (settings, publishing) go out first.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    bans.length = 0;
    purges.length = 0;
    const updated = await admin.request('PATCH', `/api/v1/entries/${page.id}`, { title: 'Hours' });
    expect(updated.statusCode, updated.body).toBe(200);
    await admin.post(`/api/v1/entries/${page.id}/publish`);
    await vi.waitFor(() => expect(bans.length).toBeGreaterThan(0), { timeout: 5000 });
    await vi.waitFor(() => expect(purges.length).toBeGreaterThan(0), { timeout: 5000 });

    expect(bans).toHaveLength(1);
    expect(bans[0]).toMatchObject({ method: 'BAN', headers: { host: site.host } });
    const ban = new RegExp(String(bans[0]!.headers['x-cleitext-ban']));
    expect(ban.test(`site entry:${page.id}`)).toBe(true);
    expect(purges).toHaveLength(1);
    expect(purges[0]).toMatchObject({
      method: 'POST',
      url: '/zones/zone123/purge_cache',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect((JSON.parse(purges[0]!.body) as { tags: string[] }).tags[0]).toMatch(
      /^cx-[0-9a-f]{12}-/,
    );
  });

  it('purges the whole site on demand and shows the log', async () => {
    // Automatic purges still pending (from the test before) go out first.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    bans.length = 0;
    purges.length = 0;
    const res = await admin.post('/api/v1/ext/edge-cache/purge');
    expect(res.statusCode, res.body).toBe(200);
    expect(
      res.json().results.map((r: { target: string; ok: boolean }) => [r.target, r.ok]),
    ).toEqual([
      ['varnish', true],
      ['cloudflare', true],
    ]);
    expect(bans.some((b) => b.headers['x-cleitext-ban'] === undefined)).toBe(true);
    expect(purges.map((p) => JSON.parse(p.body) as unknown)).toContainEqual({
      tags: [expect.stringMatching(/^cx-[0-9a-f]{12}-site$/)],
    });

    const status = (await admin.get('/api/v1/ext/edge-cache/status')).json();
    expect(status.hosts).toEqual([site.host]);
    expect(status.cloudflareToken).toBe(true);
    expect(status.log.map((entry: { what: string }) => entry.what)).toContain('all');
    expect(status.vcl).toContain('x-cleitext-ban');
    expect(status.cloudflareRule).toContain(`http.host eq "${site.host}"`);
    expect((await visitor.get('/api/v1/ext/edge-cache/status')).statusCode).toBe(401);
  });
});
