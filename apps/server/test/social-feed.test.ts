/**
 * The official Social Feed plugin: connecting Instagram and Facebook (the
 * sign-in's state and code exchange, a pasted token), the cached posts and
 * their pictures copied to the site, the Social feed block on a page, and
 * the privacy declaration. Meta is never called: `ctx.http` answers as
 * Meta's documentation shows.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { PluginServicesProvider } from '../src/plugins/plugin-services.service.js';
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
const ext = (path: string) => `/api/v1/ext/social-feed${path}`;
const REDIRECT = 'https://feed.example/cl-admin/ext/social-feed';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1]);
const IG_TOKEN = 'IGAAlong-lived-instagram-token-0000';
const PAGE_TOKEN = 'EAAPage-token-of-the-trattoria-0000';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;
const calls: { url: string; method: string; body: string }[] = [];

/** Meta, as its documentation describes the answers. */
function meta(url: URL, method: string): { status: number; body: unknown } | Buffer {
  if (url.hostname.startsWith('scontent')) return JPEG;
  const ok = (body: unknown) => ({ status: 200, body });
  if (url.hostname === 'api.instagram.com' && method === 'POST')
    return ok({
      data: [{ access_token: 'IGshort', user_id: '17841400000000001', permissions: '' }],
    });
  if (url.hostname === 'graph.instagram.com') {
    if (url.pathname === '/access_token')
      return ok({ access_token: IG_TOKEN, expires_in: 5184000 });
    if (url.pathname === '/refresh_access_token')
      return ok({ access_token: IG_TOKEN, expires_in: 5184000 });
    if (url.pathname.endsWith('/me'))
      return ok({
        user_id: '17841400000000001',
        username: 'trattoria.da.mario',
        name: 'Trattoria da Mario',
        profile_picture_url: 'https://scontent.cdninstagram.com/avatar.jpg',
        followers_count: 1234,
      });
    if (url.pathname.endsWith('/me/media'))
      return ok({
        data: [
          {
            id: '1801',
            caption: 'Pasta fresca di oggi',
            media_type: 'IMAGE',
            media_url: 'https://scontent.cdninstagram.com/1801.jpg?oh=a',
            permalink: 'https://www.instagram.com/p/AAA/',
            timestamp: '2026-09-30T18:00:00+0000',
            like_count: 42,
            comments_count: 3,
          },
          {
            id: '1802',
            caption: 'Il forno a legna',
            media_type: 'VIDEO',
            media_url: 'https://scontent.cdninstagram.com/1802.mp4',
            thumbnail_url: 'https://scontent.cdninstagram.com/1802.jpg',
            permalink: 'https://www.instagram.com/reel/BBB/',
            timestamp: '2026-09-28T12:00:00+0000',
          },
        ],
      });
  }
  if (url.hostname === 'graph.facebook.com') {
    if (url.pathname.endsWith('/oauth/access_token'))
      return ok({
        access_token: url.searchParams.has('code') ? 'EAAshort' : 'EAAUser-long',
        expires_in: 5184000,
      });
    if (url.pathname.endsWith('/me/accounts'))
      return ok({
        data: [
          { id: '100200300', name: 'Trattoria da Mario', access_token: PAGE_TOKEN },
          { id: '999', name: 'Another Page', access_token: 'EAAOther-0000000000000000' },
        ],
      });
    if (url.pathname.endsWith('/debug_token'))
      return ok({
        data: { is_valid: true, type: 'PAGE', expires_at: 0, data_access_expires_at: 0 },
      });
    if (url.pathname.endsWith('/100200300/posts'))
      return ok({
        data: [
          {
            id: '100200300_1',
            message: 'Stasera musica dal vivo!',
            created_time: '2026-09-29T20:00:00+0000',
            permalink_url: 'https://www.facebook.com/trattoriadamario/posts/1',
            full_picture: 'https://scontent.xx.fbcdn.net/post1.jpg',
            attachments: { data: [{ media_type: 'photo', type: 'photo' }] },
          },
        ],
      });
    if (url.pathname.endsWith('/100200300'))
      return ok({
        id: '100200300',
        name: 'Trattoria da Mario',
        link: 'https://www.facebook.com/trattoriadamario',
      });
  }
  return { status: 400, body: { error: { message: 'Not mocked', code: 100 } } };
}

async function install(slug: string, pluginsPath: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

async function feedPage(title: string, attrs: Record<string, unknown>) {
  const created = (
    await admin.post('/api/v1/entries', {
      type: 'page',
      title,
      document: { schema: 1, blocks: [{ id: 'feed1', type: 'social-feed/feed', v: 1, attrs }] },
    })
  ).json();
  const published = await admin.post(`/api/v1/entries/${created.id}/publish`);
  expect(published.statusCode, published.body).toBe(200);
  return `/${published.json().slug as string}`;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('social-feed', pluginsPath);
  await install('privacy', pluginsPath);
  app = await startTestApp({ pluginsPath });
  vi.spyOn(app.get(PluginServicesProvider), 'httpSend').mockImplementation(
    async (_plugin, request) => {
      calls.push({ url: request.url, method: request.method, body: request.body ?? '' });
      const answer = meta(new URL(request.url), request.method);
      if (Buffer.isBuffer(answer))
        return { status: 200, type: 'image/jpeg', text: '', base64: answer.toString('base64') };
      return { status: answer.status, type: 'application/json', text: JSON.stringify(answer.body) };
    },
  );
  site = await seedSite(owner, 'social-feed');
  await seedUser(owner, {
    email: 'admin@social-feed.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.61.0.1');
  await admin.login('admin@social-feed.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.61.0.2');
  const activated = await admin.post('/api/v1/plugins/social-feed/activate');
  expect(activated.statusCode, activated.body).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Social Feed', () => {
  it('saves the app credentials and never sends the secrets back', async () => {
    const saved = await admin.request('PUT', ext('/settings'), {
      config: {
        instagram: { enabled: true, appId: '1122334455' },
        facebook: { enabled: true, appId: '6677889900' },
      },
      secrets: { instagramAppSecret: 'a'.repeat(32), facebookAppSecret: 'b'.repeat(32) },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().secrets).toEqual({ instagramAppSecret: true, facebookAppSecret: true });
    expect(saved.body).not.toContain('a'.repeat(32));
    const refused = await admin.request('PUT', ext('/settings'), {
      config: saved.json().config,
      secrets: { instagramAppSecret: 'not a secret' },
    });
    expect(refused.statusCode).toBe(400);
  });

  it('refuses a sign-in that was not started here', async () => {
    const start = await admin.post(ext('/oauth/start'), {
      channel: 'instagram',
      redirectUri: REDIRECT,
    });
    expect(start.statusCode, start.body).toBe(200);
    const url = new URL(start.json().url as string);
    expect(url.origin).toBe('https://www.instagram.com');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('client_id')).toBe('1122334455');
    const wrong = await admin.post(ext('/oauth/callback'), { code: 'abc', state: 'forged' });
    expect(wrong.statusCode).toBe(400);
    expect(calls.some((c) => c.url.includes('api.instagram.com'))).toBe(false);
    // Only this admin page over https.
    const http = await admin.post(ext('/oauth/start'), {
      channel: 'instagram',
      redirectUri: 'http://feed.example/cl-admin/ext/social-feed',
    });
    expect(http.statusCode).toBe(400);
  });

  it('connects Instagram through the sign-in and caches the posts', async () => {
    const start = await admin.post(ext('/oauth/start'), {
      channel: 'instagram',
      redirectUri: REDIRECT,
    });
    const state = new URL(start.json().url as string).searchParams.get('state');
    const back = await admin.post(ext('/oauth/callback'), { code: 'CODE#_', state });
    expect(back.statusCode, back.body).toBe(200);
    // The state works once.
    const replay = await admin.post(ext('/oauth/callback'), { code: 'CODE', state });
    expect(replay.statusCode).toBe(400);
    const exchange = calls.find((c) => c.url === 'https://api.instagram.com/oauth/access_token')!;
    expect(new URLSearchParams(exchange.body).get('code')).toBe('CODE');
    expect(new URLSearchParams(exchange.body).get('redirect_uri')).toBe(REDIRECT);
    const view = (await admin.get(ext('/settings'))).json();
    expect(view.channels.instagram).toMatchObject({
      connected: true,
      method: 'oauth',
      tokenStatus: 'ok',
      posts: 2,
      account: { username: 'trattoria.da.mario' },
    });
    // No token reaches the browser.
    expect(JSON.stringify(view)).not.toContain(IG_TOKEN);
  });

  it('shows the posts on a page, with pictures served by the site', async () => {
    const path = await feedPage('Instagram', { source: 'instagram', count: 6, caption: true });
    const html = (await visitor.get(path)).body;
    expect(html).toContain('class="cx-sfeed cx-sfeed--grid');
    expect(html).toContain('href="https://www.instagram.com/p/AAA/"');
    expect(html).toContain('<p>Pasta fresca di oggi</p>');
    expect(html).toContain('@trattoria.da.mario');
    expect(html).not.toContain('cdninstagram.com');
    expect(html).toMatch(/<script[^>]+plugin-assets\/social-feed\/1\.0\.0\/feed\.js/);
    expect(html).toContain('.cx-sfeed-feed1{--cx-sfeed-cols:3');
    const src = html.match(/<img src="(\/social-feed\/media\/[a-f0-9]{32}\.jpg)" alt="Pasta/)![1]!;
    const image = await visitor.get(src);
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(image.headers['cache-control']).toContain('immutable');
    expect(Buffer.from(image.rawPayload).equals(JPEG)).toBe(true);
    expect((await visitor.get('/social-feed/media/' + 'f'.repeat(32) + '.jpg')).statusCode).toBe(
      404,
    );
    expect((await visitor.get('/social-feed/media/../../etc')).statusCode).toBe(404);
  });

  it('connects a Facebook Page chosen after the sign-in', async () => {
    const start = await admin.post(ext('/oauth/start'), {
      channel: 'facebook',
      redirectUri: REDIRECT,
    });
    const url = new URL(start.json().url as string);
    expect(url.hostname).toBe('www.facebook.com');
    expect(url.searchParams.get('scope')).toBe(
      'pages_show_list,pages_read_engagement,pages_read_user_content',
    );
    const back = await admin.post(ext('/oauth/callback'), {
      code: 'FBCODE',
      state: url.searchParams.get('state'),
    });
    expect(back.statusCode, back.body).toBe(200);
    expect(back.json().pages.map((p: { id: string }) => p.id)).toEqual(['100200300', '999']);
    const chosen = await admin.post(ext('/facebook/page'), { pageId: '100200300' });
    expect(chosen.statusCode, chosen.body).toBe(200);
    expect(chosen.json().channels.facebook).toMatchObject({
      connected: true,
      tokenStatus: 'never',
      posts: 1,
    });
    expect(chosen.body).not.toContain(PAGE_TOKEN);
    // Both channels in one feed, by date.
    const path = await feedPage('Both', { source: 'all', count: 6 });
    const html = (await visitor.get(path)).body;
    const order = [...html.matchAll(/class="cx-sfeed__link" href="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual([
      'https://www.instagram.com/p/AAA/',
      'https://www.facebook.com/trattoriadamario/posts/1',
      'https://www.instagram.com/reel/BBB/',
    ]);
  });

  it('takes a pasted token, refreshes on demand and disconnects', async () => {
    const pasted = await admin.post(ext('/token'), { channel: 'instagram', token: IG_TOKEN });
    expect(pasted.statusCode, pasted.body).toBe(200);
    expect(pasted.json().channels.instagram.method).toBe('manual');
    const refreshed = await admin.post(ext('/refresh'), { channel: 'facebook' });
    expect(refreshed.statusCode).toBe(200);
    const gone = await admin.post(ext('/disconnect'), { channel: 'facebook' });
    expect(gone.json().channels.facebook.connected).toBe(false);
    const path = await feedPage('Facebook only', { source: 'facebook' });
    expect((await visitor.get(path)).body).not.toContain('class="cx-sfeed');
  });

  it('declares Meta’s servers to the privacy plugin only when pictures load from them', async () => {
    expect((await admin.post('/api/v1/plugins/privacy/activate')).statusCode).toBe(200);
    const trackers = async () =>
      (
        (await admin.get('/api/v1/ext/privacy/trackers')).json() as { trackers: { id: string }[] }
      ).trackers.filter((t) => t.id.startsWith('social-feed.'));
    expect(await trackers()).toEqual([]);
    const view = (await admin.get(ext('/settings'))).json();
    await admin.request('PUT', ext('/settings'), { config: { ...view.config, media: 'hotlink' } });
    expect(await trackers()).toEqual([
      expect.objectContaining({
        id: 'social-feed.meta',
        category: 'marketing',
        requiresConsent: true,
      }),
    ]);
    await admin.post(ext('/refresh'), { channel: 'instagram' });
    const path = await feedPage('Hotlinked', { source: 'instagram' });
    const html = (await visitor.get(path)).body;
    expect(html).toContain('data-cx-src="https://scontent.cdninstagram.com/1801.jpg?oh=a"');
    expect(html).not.toMatch(/<img src="https:\/\/scontent/);
  });

  it('only lets settings managers in', async () => {
    expect((await visitor.get(ext('/settings'))).statusCode).toBe(401);
  });
});
