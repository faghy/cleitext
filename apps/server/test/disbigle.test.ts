/**
 * The official Disbigle plugin: connecting an account (app registration,
 * sign-in with PKCE and state, the account), announcing an article once per
 * translation group with an idempotency key, the mentions linked in the
 * article, the link to comment and the replies shown under it. No network:
 * `ctx.http` answers as a fake Mastodon-compatible server with Disbigle's
 * articles endpoint.
 */
import { createHash } from 'node:crypto';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { PluginServicesProvider } from '../src/plugins/plugin-services.service.js';
import { PluginHost } from '../src/plugins/plugin-host.service.js';
import { sql } from 'drizzle-orm';
import { withSiteContext } from '@cleitext/db';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  unlockMultilingual,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const ext = (path: string) => `/api/v1/ext/disbigle${path}`;
const INSTANCE = 'https://fedi.example';
const CLIENT_SECRET = 'CLIENT-SECRET-0123456789';
const TOKEN = 'ACCESS-TOKEN-0123456789';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;

interface Call {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: string;
}
const calls: Call[] = [];
/** Posts made, by idempotency key: the same key gives back the same post. */
const posts = new Map<string, string>();
/** What the articles endpoint answers instead of a post, when set. */
let refuse: { status: number; body: unknown } | null = null;
let down = false;

const PEOPLE: Record<string, { acct: string; url: string }> = {
  'anna@fedi.example': { acct: 'anna', url: `${INSTANCE}/@anna` },
  'bob@mastodon.social': { acct: 'bob@mastodon.social', url: 'https://mastodon.social/@bob' },
};

const account = (id: string, acct: string, url: string, avatar: string, name: string) => ({
  id,
  acct,
  username: acct.split('@')[0],
  display_name: name,
  url,
  avatar: avatar.replace('.png', '.gif'),
  avatar_static: avatar,
});

/** Replies of the thread of a post. */
const replies = (statusId: string) => [
  {
    id: `${statusId}1`,
    in_reply_to_id: statusId,
    visibility: 'public',
    url: `${INSTANCE}/@anna/${statusId}1`,
    created_at: '2026-11-15T09:00:00.000Z',
    spoiler_text: '',
    content: '<p>Bellissimo articolo!<script>alert(1)</script><img src=x onerror=alert(1)></p>',
    account: account(
      '7',
      'anna',
      `${INSTANCE}/@anna`,
      `${INSTANCE}/system/accounts/avatars/anna.png`,
      'Anna Rossi',
    ),
  },
  {
    // The connected account's notice in another language: not a comment.
    id: `${statusId}2`,
    in_reply_to_id: statusId,
    visibility: 'unlisted',
    url: `${INSTANCE}/@blog/${statusId}2`,
    created_at: '2026-11-15T09:01:00.000Z',
    spoiler_text: '',
    content: '<p>In italiano: …</p>',
    account: account('1', 'blog', `${INSTANCE}/@blog`, `${INSTANCE}/system/blog.png`, 'Blog'),
  },
  {
    id: `${statusId}3`,
    in_reply_to_id: `${statusId}1`,
    visibility: 'unlisted',
    url: 'https://mastodon.social/@bob/3',
    created_at: '2026-11-15T09:02:00.000Z',
    spoiler_text: '',
    content: '<p>Concordo con <a href="javascript:alert(1)">Anna</a></p>',
    account: account(
      '8',
      'bob@mastodon.social',
      'https://mastodon.social/@bob',
      'https://files.mastodon.social/bob.png',
      'Bob',
    ),
  },
];

/** The Mastodon-compatible server, with Disbigle's articles endpoint. */
function server(call: Call): { status: number; body: unknown } {
  const { url, method, headers } = call;
  const bearer = headers.authorization === `Bearer ${TOKEN}`;
  if (url.origin !== INSTANCE) return { status: 404, body: { error: 'Unknown server' } };
  if (method === 'POST' && url.pathname === '/api/v1/apps')
    return { status: 200, body: { id: '9', client_id: 'client-1', client_secret: CLIENT_SECRET } };
  if (method === 'POST' && url.pathname === '/oauth/token') {
    const form = new URLSearchParams(call.body);
    return form.get('code') === 'GOOD-CODE' && form.get('client_secret') === CLIENT_SECRET
      ? { status: 200, body: { access_token: TOKEN, token_type: 'Bearer' } }
      : { status: 400, body: { error: 'invalid_grant' } };
  }
  if (method === 'POST' && url.pathname === '/oauth/revoke') return { status: 200, body: {} };
  if (method === 'GET' && url.pathname === '/api/v1/accounts/verify_credentials')
    return bearer
      ? { status: 200, body: { id: '1', acct: 'blog', username: 'blog', url: `${INSTANCE}/@blog` } }
      : { status: 401, body: { error: 'The access token is invalid' } };
  if (method === 'POST' && url.pathname === '/api/v1/disbigle/articles') {
    if (!bearer) return { status: 401, body: { error: 'The access token is invalid' } };
    if (refuse) return refuse;
    const key = headers['idempotency-key']!;
    const payload = JSON.parse(call.body) as { mentions: string[] };
    const id = posts.get(key) ?? String(1000 + posts.size);
    posts.set(key, id);
    return {
      status: 200,
      body: {
        id,
        url: `${INSTANCE}/@blog/${id}`,
        visibility: 'public',
        mentions: payload.mentions
          .filter((m) => PEOPLE[m])
          .map((m) => ({ id: m, username: m.split('@')[0], ...PEOPLE[m] })),
      },
    };
  }
  // A person the post did not report back.
  if (method === 'GET' && url.pathname === '/api/v1/accounts/lookup')
    return url.searchParams.get('acct') === 'carl@social.example'
      ? { status: 200, body: { id: '12', acct: 'carl', url: `${INSTANCE}/@carl` } }
      : { status: 404, body: { error: 'Record not found' } };
  // The server's web domain differs from its address (as on Disbigle).
  if (method === 'GET' && url.pathname === '/api/v1/instance')
    return { status: 200, body: { uri: 'social.example', title: 'Social' } };
  const context = url.pathname.match(/^\/api\/v1\/statuses\/(\d+)\/context$/);
  if (method === 'GET' && context)
    return { status: 200, body: { ancestors: [], descendants: replies(context[1]!) } };
  return { status: 404, body: { error: 'Record not found' } };
}

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

const articleCalls = () =>
  calls.filter((c) => c.method === 'POST' && c.url.pathname === '/api/v1/disbigle/articles');

async function article(
  title: string,
  slug: string,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const created = await admin.post('/api/v1/entries', {
    type: 'article',
    title,
    slug,
    excerpt: `Il riassunto di ${title}.`,
    document: {
      schema: 1,
      blocks: [{ id: 'p1', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text }] }],
    },
    ...extra,
  });
  expect(created.statusCode, created.body).toBe(201);
  return created.json().id as string;
}

let clock = Date.now();
/**
 * Publishes, then lets the translation group "settle" (Disbigle 1.0.2 waits a
 * couple of minutes for the translations): its publication is moved back
 * three minutes and the plugin's scheduled announcements run.
 */
const publish = async (id: string, settle = true) => {
  const published = await admin.post(`/api/v1/entries/${id}/publish`);
  expect(published.statusCode, published.body).toBe(200);
  if (settle) await announceNow();
  return published.json() as { slug: string; locale: string };
};
const announceNow = async () => {
  await withSiteContext(owner.db, site.id, async (tx) => {
    await tx.execute(
      sql`update entries set published_at = published_at - interval '3 minutes' where published_at > now() - interval '3 minutes'`,
    );
    // The connection is older than the (moved back) publication.
    await tx.execute(
      sql`update settings set value = jsonb_set(value, '{connectedAt}', to_jsonb((now() - interval '1 hour')::text)) where namespace = 'plugin:disbigle' and key = 'storage:connection'`,
    );
  });
  clock += 2 * 60_000;
  await app.get(PluginHost).runSchedules(clock);
};
const pathOf = (slug: string, prefix = '') => `${prefix}/${new Date().getFullYear()}/${slug}`;

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('disbigle', pluginsPath);
  await install('multilingual', pluginsPath);
  app = await startTestApp({ pluginsPath });
  unlockMultilingual();
  vi.spyOn(app.get(PluginServicesProvider), 'httpSend').mockImplementation(
    async (_plugin, request) => {
      const call: Call = {
        url: new URL(request.url),
        method: request.method,
        headers: Object.fromEntries(
          Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
        ),
        body: request.body ?? '',
      };
      calls.push(call);
      if (down) throw new Error('connect ECONNREFUSED');
      const answer = server(call);
      return { status: answer.status, type: 'application/json', text: JSON.stringify(answer.body) };
    },
  );
  site = await seedSite(owner, 'disbigle');
  await seedUser(owner, {
    email: 'admin@disbigle.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.71.0.1');
  await admin.login('admin@disbigle.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.71.0.2');
  for (const slug of ['multilingual', 'disbigle']) {
    const activated = await admin.post(`/api/v1/plugins/${slug}/activate`);
    expect(activated.statusCode, activated.body).toBe(200);
  }
  expect(
    (await admin.post('/api/v1/ext/multilingual/languages', { code: 'it' })).statusCode,
  ).toBeLessThan(300);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Disbigle', () => {
  it('starts on app.disbigle.com, not connected, and refuses non-https servers', async () => {
    const view = (await admin.get(ext('/settings'))).json();
    expect(view.config).toEqual({
      instance: 'https://app.disbigle.com',
      announce: true,
      comments: true,
      remoteAvatars: false,
    });
    expect(view.connection).toBeNull();
    const refused = await admin.request('PUT', ext('/settings'), {
      config: { instance: 'http://fedi.example' },
    });
    expect(refused.statusCode).toBe(400);
    const saved = await admin.request('PUT', ext('/settings'), {
      config: { instance: 'fedi.example/' },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().config.instance).toBe(INSTANCE);
    // Only the admins.
    expect((await visitor.get(ext('/settings'))).statusCode).toBeGreaterThanOrEqual(401);
  });

  it('does nothing on publish while no account is connected', async () => {
    const id = await article('Prima del collegamento', 'prima', 'Niente da annunciare.');
    await publish(id);
    expect(articleCalls()).toHaveLength(0);
    // Well before the connection (the helper dates the connection an hour back).
    await withSiteContext(owner.db, site.id, (tx) =>
      tx.execute(
        sql`update entries set published_at = now() - interval '2 hours' where id = ${id}`,
      ),
    );
  });

  it('connects through the server’s sign-in with PKCE and a state used once', async () => {
    const start = await admin.post(ext('/connect'), {});
    expect(start.statusCode, start.body).toBe(200);
    const apps = calls.find((c) => c.url.pathname === '/api/v1/apps')!;
    const redirectUri = `http://${site.host}/cl-admin/ext/disbigle`;
    expect(JSON.parse(apps.body)).toEqual({
      client_name: 'Cleitext · Site disbigle',
      redirect_uris: redirectUri,
      scopes: 'read write:statuses',
      website: `http://${site.host}`,
    });
    const url = new URL(start.json().url as string);
    expect(`${url.origin}${url.pathname}`).toBe(`${INSTANCE}/oauth/authorize`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(url.searchParams.get('scope')).toBe('read write:statuses');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const state = url.searchParams.get('state')!;
    const challenge = url.searchParams.get('code_challenge')!;
    expect(start.body).not.toContain(CLIENT_SECRET);

    const forged = await admin.post(ext('/callback'), { code: 'GOOD-CODE', state: 'forged' });
    expect(forged.statusCode).toBe(400);
    expect(calls.some((c) => c.url.pathname === '/oauth/token')).toBe(false);

    const back = await admin.post(ext('/callback'), { code: 'GOOD-CODE', state });
    expect(back.statusCode, back.body).toBe(200);
    const exchange = new URLSearchParams(
      calls.find((c) => c.url.pathname === '/oauth/token')!.body,
    );
    expect(exchange.get('grant_type')).toBe('authorization_code');
    expect(exchange.get('client_id')).toBe('client-1');
    expect(exchange.get('redirect_uri')).toBe(redirectUri);
    expect(createHash('sha256').update(exchange.get('code_verifier')!).digest('base64url')).toBe(
      challenge,
    );
    expect(back.json().connection).toMatchObject({
      acct: 'blog@fedi.example',
      accountUrl: `${INSTANCE}/@blog`,
      instance: INSTANCE,
      refused: false,
    });
    // The state works once; no secret reaches the browser.
    expect((await admin.post(ext('/callback'), { code: 'GOOD-CODE', state })).statusCode).toBe(400);
    const view = (await admin.get(ext('/settings'))).body;
    for (const secret of [TOKEN, CLIENT_SECRET]) {
      expect(view).not.toContain(secret);
      expect(back.body).not.toContain(secret);
    }
  });

  let firstPath = '';
  let firstId = '';

  it('announces an article once, with the idempotency key, mentions and tags', async () => {
    const category = (
      await admin.post('/api/v1/taxonomies/category/terms', { name: 'Open Source & Web' })
    ).json();
    firstId = await article(
      'Hello fediverse',
      'hello-fediverse',
      'Thanks @anna@fedi.example and @bob@mastodon.social, and write to carla@nowhere.example (an email address, not a mention).',
    );
    await admin.request('PATCH', `/api/v1/entries/${firstId}`, {
      terms: { category: [category.id], tag: [{ name: 'Cleitext 2026' }] },
    });
    const { slug } = await publish(firstId);
    firstPath = pathOf(slug);
    const sent = articleCalls();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
      'idempotency-key': firstId,
    });
    expect(JSON.parse(sent[0]!.body)).toEqual({
      translations: {
        en: {
          title: 'Hello fediverse',
          summary: 'Il riassunto di Hello fediverse.',
          url: `http://${site.host}${firstPath}`,
        },
      },
      language: 'en',
      mentions: ['anna@fedi.example', 'bob@mastodon.social'],
      tags: ['OpenSourceWeb', 'Cleitext2026'],
    });

    // Published again (an update): no second announcement.
    await publish(firstId);
    expect(articleCalls()).toHaveLength(1);
    const view = (await admin.get(ext('/settings'))).json();
    expect(view.log[0]).toMatchObject({
      entryId: firstId,
      ok: true,
      url: `${INSTANCE}/@blog/1000`,
    });
  });

  it('links the mentions, and shows the link to comment and the replies', async () => {
    const page = await visitor.get(firstPath);
    expect(page.statusCode).toBe(200);
    const html = page.body;
    expect(html).toMatch(
      /<a [^>]*href="https:\/\/fedi\.example\/@anna"[^>]*><!--email_off-->@anna@fedi\.example<!--email_on--><\/a>/,
    );
    expect(html).toMatch(
      /<a [^>]*href="https:\/\/mastodon\.social\/@bob"[^>]*><!--email_off-->@bob@mastodon\.social<!--email_on--><\/a>/,
    );
    expect(html).toContain('carla@nowhere.example');
    expect(html).not.toMatch(/href="[^"]*carla/);
    // The link to comment, after the text.
    expect(html).toContain('Comment on the fediverse');
    expect(html).toMatch(/href="https:\/\/fedi\.example\/@blog\/1000"/);
    expect(html.indexOf('Thanks')).toBeLessThan(html.indexOf('Comment on the fediverse'));
    // Replies: Anna's and Bob's, not the account's own notice; sanitized.
    const context = calls.find((c) => c.url.pathname === '/api/v1/statuses/1000/context')!;
    expect(context.headers.authorization).toBeUndefined();
    expect(html).toContain('Comments from the fediverse');
    expect(html).toContain('Bellissimo articolo!');
    expect(html).toContain('Concordo con');
    expect(html).not.toContain('In italiano: …');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('onerror');
    expect(html).toContain('href="https://fedi.example/@anna/10001"');
    // Pictures from the connected server only; initials for the others.
    expect(html).toContain('src="https://fedi.example/system/accounts/avatars/anna.png"');
    expect(html).not.toContain('files.mastodon.social');
    expect(html).not.toContain('anna.gif');
  });

  it('shows remote avatars when allowed', async () => {
    const saved = await admin.request('PUT', ext('/settings'), {
      config: { remoteAvatars: true },
    });
    expect(saved.json().config).toMatchObject({ instance: INSTANCE, remoteAvatars: true });
    const html = (await visitor.get(firstPath)).body;
    expect(html).toContain('src="https://files.mastodon.social/bob.png"');
    expect(html).not.toContain('bob.gif');
    await admin.request('PUT', ext('/settings'), { config: { remoteAvatars: false } });
  });

  it('announces a translation group once, with every published language', async () => {
    // The original fails (the server is down) …
    down = true;
    const id = await article('Group test', 'group-test', 'English text.');
    await admin.request('PATCH', `/api/v1/entries/${id}`, {
      terms: { tag: [{ name: 'Features' }] },
    });
    await publish(id);
    down = false;
    const failed = (await admin.get(ext('/settings'))).json();
    expect(failed.failed[0]).toMatchObject({ entryId: id, retrying: true });
    expect(failed.log[0]).toMatchObject({ entryId: id, ok: false });
    // … the article itself is published all the same.
    expect((await visitor.get(pathOf('group-test'))).statusCode).toBe(200);

    // The Italian translation comes out: one post with both languages.
    const before = articleCalls().length;
    const translated = await admin.post(`/api/v1/ext/multilingual/translations/entry/${id}`, {
      locale: 'it',
    });
    expect(translated.statusCode, translated.body).toBe(201);
    const itId = translated.json().id as string;
    await admin.request('PATCH', `/api/v1/entries/${itId}`, {
      title: 'Prova di gruppo',
      excerpt: 'Il riassunto in italiano.',
      terms: { tag: [{ name: 'Funzioni' }] },
    });
    const itPublished = await publish(itId);
    const sent = articleCalls().slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.headers['idempotency-key']).toBe(itId);
    const body = JSON.parse(sent[0]!.body);
    expect(Object.keys(body.translations).sort()).toEqual(['en', 'it']);
    expect(body.language).toBe('en');
    expect(body.translations.it).toMatchObject({ title: 'Prova di gruppo' });
    // Announced from the translation, the post still speaks English: its tags and its log.
    expect(body.tags).toEqual(['Features']);
    expect((await admin.get(ext('/settings'))).json().log[0]).toMatchObject({
      entryId: itId,
      title: 'Group test',
      ok: true,
    });

    // Trying the original again: already announced with its translation.
    const retry = await admin.post(ext('/retry'), { entryId: id });
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.json().result).toBe('already');
    expect(articleCalls().slice(before)).toHaveLength(1);
    // Both pages link the same post; the Italian one in Italian.
    const postUrl = `${INSTANCE}/@blog/${posts.get(itId)}`;
    expect((await visitor.get(pathOf('group-test'))).body).toContain(`href="${postUrl}"`);
    const itPage = await visitor.get(pathOf(itPublished.slug, '/it'));
    expect(itPage.statusCode).toBe(200);
    expect(itPage.body).toContain(`href="${postUrl}"`);
    expect(itPage.body).toContain('Commenta sul fediverso');
  });

  it('logs a refusal without blocking the article, and retries with the same key', async () => {
    refuse = { status: 422, body: { error: 'Title is too long' } };
    const id = await article('Refused', 'refused', 'Some text.');
    await publish(id);
    refuse = null;
    const view = (await admin.get(ext('/settings'))).json();
    expect(view.log[0]).toMatchObject({
      entryId: id,
      ok: false,
      message: '422: Title is too long',
    });
    // A refusal is not tried again by itself.
    expect(view.failed.find((f: { entryId: string }) => f.entryId === id)).toMatchObject({
      retrying: false,
      error: 'Title is too long',
    });
    const page = await visitor.get(pathOf('refused'));
    expect(page.statusCode).toBe(200);
    expect(page.body).not.toContain('Comment on the fediverse');
    const retry = await admin.post(ext('/retry'), { entryId: id });
    expect(retry.json().result).toBe('announced');
    const keys = articleCalls()
      .slice(-2)
      .map((c) => c.headers['idempotency-key']);
    expect(keys).toEqual([id, id]);
  });

  it('waits for the translations, and never mentions its own account', async () => {
    const before = articleCalls().length;
    const id = await article(
      'Self',
      'self',
      `By @blog@${new URL(INSTANCE).host} (also @Blog@social.example), with @anna@fedi.example and @carl@social.example.`,
    );
    await publish(id, false);
    // Just published: the article waits a couple of minutes for its translations.
    await app.get(PluginHost).runSchedules((clock += 2 * 60_000));
    expect(articleCalls()).toHaveLength(before);
    await announceNow();
    expect(articleCalls()).toHaveLength(before + 1);
    expect(JSON.parse(articleCalls().at(-1)!.body).mentions).toEqual([
      'anna@fedi.example',
      'carl@social.example',
    ]);
    // Carl, left out of the post, is looked up; the handles are hidden from Cloudflare.
    const page = await visitor.get(pathOf('self'));
    expect(page.body).toContain(
      `<a href="${INSTANCE}/@carl" rel="nofollow noopener"><!--email_off-->@carl@social.example<!--email_on--></a>`,
    );
    expect(page.body).toContain('<!--email_off-->@anna@fedi.example<!--email_on-->');
  });

  it('leaves out an article whose option is off', async () => {
    const before = articleCalls().length;
    const id = await article('Private thoughts', 'private-thoughts', 'Not for the fediverse.', {
      fields: { disbigle: { announce: false } },
    });
    await publish(id);
    expect(articleCalls()).toHaveLength(before);
    expect((await visitor.get(pathOf('private-thoughts'))).body).not.toContain(
      'Comment on the fediverse',
    );
  });

  it('disconnects: the token is revoked and forgotten, announcements stop', async () => {
    const out = await admin.post(ext('/disconnect'), {});
    expect(out.statusCode).toBe(200);
    expect(out.json().connection).toBeNull();
    const revoke = calls.find((c) => c.url.pathname === '/oauth/revoke')!;
    expect(new URLSearchParams(revoke.body).get('token')).toBe(TOKEN);
    const before = articleCalls().length;
    const id = await article('After', 'after', 'Text.');
    await publish(id);
    expect(articleCalls()).toHaveLength(before);
    // Earlier posts keep their link.
    expect((await visitor.get(firstPath)).body).toContain('Comment on the fediverse');
  });
});
