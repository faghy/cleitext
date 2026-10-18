/** MCP for AI assistants (RF-AI-01/02): tools over the REST API, and OAuth 2.1 with PKCE. */
import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sendPublic } from '../src/common/public-fetch.js';
import { isPublicAddress } from '../src/mcp/fetch-public.js';
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
let admin: TestClient;
let writeToken: string;
let readToken: string;
let publishToken: string;

const rpc = (
  token: string | null,
  method: string,
  params?: unknown,
  extra: Record<string, string> = {},
) =>
  app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      host: site.host,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    payload: { jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) },
  });

async function call(token: string, name: string, args: Record<string, unknown> = {}) {
  const response = await rpc(token, 'tools/call', { name, arguments: args });
  expect(response.statusCode).toBe(200);
  const result = response.json().result as { content: { text: string }[]; isError?: boolean };
  return { text: result.content[0]!.text, isError: result.isError === true };
}

async function token(scopes: string[]) {
  const response = await admin.post('/api/v1/tokens', {
    name: scopes.join('+'),
    scopes,
    expiresInDays: null,
  });
  expect(response.statusCode).toBe(201);
  return response.json().token as string;
}

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'mcp');
  await seedUser(owner, {
    email: 'admin@mcp.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.37.0.1');
  await admin.login('admin@mcp.test', PASSWORD);
  writeToken = await token(['read', 'write']);
  readToken = await token(['read']);
  publishToken = await token(['read', 'write', 'publish']);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('MCP', () => {
  it('is off until the site turns it on', async () => {
    expect((await rpc(writeToken, 'initialize')).statusCode).toBe(404);
    expect((await admin.get('/api/v1/assistants')).json()).toEqual({
      enabled: false,
      address: `http://${site.host}/mcp`,
      chat: false,
    });
    expect(
      (
        await app.inject({
          url: '/.well-known/oauth-authorization-server',
          headers: { host: site.host },
        })
      ).statusCode,
    ).toBe(404);
    const saved = await admin.request('PATCH', '/api/v1/settings/core', { mcp: true });
    expect(saved.statusCode).toBe(200);
  });

  it('sends people who open the address in a browser to the admin', async () => {
    const browser = await app.inject({
      url: '/mcp',
      headers: { host: site.host, accept: 'text/html,application/xhtml+xml' },
    });
    expect(browser.statusCode).toBe(302);
    expect(browser.headers.location).toBe('/cl-admin/assistants');
    expect((await app.inject({ url: '/mcp', headers: { host: site.host } })).statusCode).toBe(405);
    expect((await admin.get('/api/v1/assistants')).json().enabled).toBe(true);
  });

  it('asks for a token and points to OAuth', async () => {
    const response = await rpc(null, 'initialize');
    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toContain('/.well-known/oauth-protected-resource');
    // A page of another site cannot call it from a browser.
    expect(
      (await rpc(writeToken, 'ping', undefined, { origin: 'https://evil.example' })).statusCode,
    ).toBe(403);
  });

  it('initializes, and lists the tools the token allows', async () => {
    const init = (
      await rpc(writeToken, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      })
    ).json();
    expect(init.result).toMatchObject({
      protocolVersion: '2025-06-18',
      serverInfo: { name: 'cleitext' },
    });
    expect(init.result.instructions).toContain('get_block_guide');
    const notification = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        host: site.host,
        'content-type': 'application/json',
        authorization: `Bearer ${writeToken}`,
      },
      payload: { jsonrpc: '2.0', method: 'notifications/initialized' },
    });
    expect(notification.statusCode).toBe(202);

    const names = (t: string) =>
      rpc(t, 'tools/list').then((r) => r.json().result.tools.map((x: { name: string }) => x.name));
    const read = await names(readToken);
    expect(read).toContain('get_site');
    expect(read).not.toContain('create_entry');
    const write = await names(writeToken);
    expect(write).toEqual(
      expect.arrayContaining(['create_entry', 'update_entry', 'upload_image', 'set_menu']),
    );
    expect(write).not.toContain('publish_entry');
    expect(await names(publishToken)).toContain('publish_entry');
  });

  it('tells about the site and how to write blocks', async () => {
    const info = JSON.parse((await call(readToken, 'get_site')).text);
    expect(info.site.name).toBe('Site mcp');
    expect(info.content_types.map((t: { slug: string }) => t.slug)).toEqual(
      expect.arrayContaining(['page', 'article']),
    );
    const guide = await call(readToken, 'get_block_guide');
    expect(guide.text).toContain('WordPress block markup');
  });

  it('creates a draft from block markup, keeping the classes', async () => {
    const created = await call(writeToken, 'create_entry', {
      type: 'page',
      title: 'About us',
      content:
        '<!-- wp:group {"className":"cv-section","align":"full","tagName":"section"} --><section class="wp-block-group"><!-- wp:heading --><h2>Who we are</h2><!-- /wp:heading --><!-- wp:paragraph --><p>We make <strong>sites</strong>.</p><!-- /wp:paragraph --></section><!-- /wp:group -->',
    });
    expect(created.isError).toBe(false);
    const entry = JSON.parse(created.text);
    expect(entry).toMatchObject({ status: 'draft', title: 'About us', blocks_count: 1 });
    expect(entry.preview_url).toMatch(/^https?:\/\/[^/]+\/__preview\//);

    const stored = JSON.parse((await call(readToken, 'get_entry', { id: entry.id })).text);
    expect(stored.blocks[0]).toMatchObject({
      type: 'core/group',
      attrs: { className: 'cv-section', align: 'full' },
    });
    expect(stored.blocks[0].children.map((b: { type: string }) => b.type)).toEqual([
      'core/heading',
      'core/paragraph',
    ]);

    // Not with a read-only token.
    const refused = await call(readToken, 'create_entry', { title: 'No' });
    expect(refused.isError).toBe(true);
  });

  it('reports invalid blocks so the assistant can fix them', async () => {
    const bad = await call(writeToken, 'create_entry', {
      title: 'Broken',
      blocks: [
        { v: 1, id: 'b_x', type: 'core/heading', attrs: { level: 9 }, content: [{ text: 'x' }] },
      ],
    });
    expect(bad.isError).toBe(true);
  });

  it('publishes only with the publish permission', async () => {
    const entry = JSON.parse(
      (await call(writeToken, 'create_entry', { title: 'News', content: '<p>Hello</p>' })).text,
    );
    expect((await call(writeToken, 'publish_entry', { id: entry.id })).isError).toBe(true);
    const published = JSON.parse(
      (await call(publishToken, 'publish_entry', { id: entry.id })).text,
    );
    expect(published.status).toBe('published');
  });

  it('moderates and answers comments', async () => {
    const post = JSON.parse(
      (
        await call(publishToken, 'create_entry', {
          type: 'article',
          title: 'Talk',
          content: '<p>Say something</p>',
        })
      ).text,
    );
    await call(publishToken, 'publish_entry', { id: post.id });
    const sent = await app.inject({
      method: 'POST',
      url: '/comments',
      headers: {
        host: site.host,
        origin: `http://${site.host}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      remoteAddress: '10.37.5.1',
      payload: new URLSearchParams({
        entry: post.id,
        back: '/',
        comment: 'Is this on?',
        name: 'Pia',
        email: 'pia@example.com',
        ts: String(Date.now() - 5000),
      }).toString(),
    });
    expect(sent.statusCode).toBe(303);

    const pending = JSON.parse(
      (await call(readToken, 'list_comments', { status: 'pending' })).text,
    );
    expect(pending.comments[0]).toMatchObject({ author: 'Pia', content: 'Is this on?' });
    const id = pending.comments[0].id as string;
    // Approving shows it on the site: the publish permission.
    expect(
      (await call(writeToken, 'moderate_comments', { ids: [id], status: 'approved' })).isError,
    ).toBe(true);
    const reply = JSON.parse(
      (await call(publishToken, 'reply_to_comment', { id, content: 'Loud and clear.' })).text,
    );
    expect(reply.status).toBe('approved');
    const approved = JSON.parse(
      (await call(readToken, 'list_comments', { status: 'approved' })).text,
    );
    expect(approved.comments.map((c: { content: string }) => c.content)).toEqual([
      'Loud and clear.',
      'Is this on?',
    ]);
    expect(
      JSON.parse(
        (await call(publishToken, 'moderate_comments', { ids: [id], status: 'spam' })).text,
      ),
    ).toEqual({ changed: 1 });
  });

  it('downloads images only from public https addresses', async () => {
    expect(
      (await call(writeToken, 'upload_image', { url: 'http://example.com/a.png', alt: 'a' })).text,
    ).toContain('https');
    expect(
      (await call(writeToken, 'upload_image', { url: 'https://127.0.0.1/a.png', alt: 'a' })).text,
    ).toContain('not public');
    expect(isPublicAddress('10.0.0.200')).toBe(false);
    expect(isPublicAddress('::1')).toBe(false);
    expect(isPublicAddress('169.254.169.254')).toBe(false);
    expect(isPublicAddress('93.184.216.34')).toBe(true);
    expect(isPublicAddress('::ffff:10.0.0.1')).toBe(false);
    expect(isPublicAddress('2a00:1450:4001:80b::200e')).toBe(true);
    // NAT64 (DNS64 resolvers): the IPv4 address inside decides.
    expect(isPublicAddress('64:ff9b::59a3:87b2')).toBe(true);
    expect(isPublicAddress('64:ff9b::93.184.216.34')).toBe(true);
    expect(isPublicAddress('64:ff9b::a00:1')).toBe(false);
    expect(isPublicAddress('64:ff9b::7f00:1')).toBe(false);
    // Plugins' requests (webhooks) are held to the same rules.
    const post = (url: string) =>
      sendPublic(url, { method: 'POST', body: '{}', maxBytes: 1000, timeoutMs: 2000 });
    await expect(post('http://example.com/hook')).rejects.toThrow('https');
    await expect(post('https://127.0.0.1/hook')).rejects.toThrow('not public');
    await expect(post('https://localhost/hook')).rejects.toThrow('not a public address');
  });
});

describe('OAuth for AI assistants', () => {
  const verifier = randomBytes(40).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirect = 'https://assistant.example/callback';
  let clientId: string;

  const get = (url: string, client?: TestClient) =>
    client ? client.get(url) : app.inject({ url, headers: { host: site.host } });
  const form = (fields: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { host: site.host, 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams(fields).toString(),
    });

  it('publishes its metadata and registers clients', async () => {
    const resource = (await get('/.well-known/oauth-protected-resource')).json();
    expect(resource.resource).toBe(`http://${site.host}/mcp`);
    const server = (await get('/.well-known/oauth-authorization-server')).json();
    expect(server).toMatchObject({
      code_challenge_methods_supported: ['S256'],
      registration_endpoint: `http://${site.host}/oauth/register`,
    });

    const bad = await app.inject({
      method: 'POST',
      url: '/oauth/register',
      headers: { host: site.host },
      payload: { client_name: 'X', redirect_uris: ['http://evil.example/cb'] },
    });
    expect(bad.statusCode).toBe(400);
    const registered = await app.inject({
      method: 'POST',
      url: '/oauth/register',
      headers: { host: site.host },
      payload: { client_name: 'Assistant', redirect_uris: [redirect] },
    });
    expect(registered.statusCode).toBe(201);
    clientId = registered.json().client_id;
  });

  it('signs in, asks for consent and issues tokens for the code', async () => {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirect,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
      scope: 'read write',
    });
    // The consent is in the admin, which asks to sign in first.
    const authorize = await get(`/oauth/authorize?${query}`);
    expect(authorize.statusCode).toBe(302);
    expect(authorize.headers.location).toBe(`/cl-admin/connect?${query}`);
    const params = Object.fromEntries(query);
    expect((await get(`/api/v1/oauth/consent?${query}`)).statusCode).toBe(401);

    const view = await get(`/api/v1/oauth/consent?${query}`, admin);
    expect(view.statusCode).toBe(200);
    expect(view.json()).toMatchObject({
      client: 'Assistant',
      scopes: ['read', 'write'],
      canPublish: true,
    });
    const bad = await get(
      `/api/v1/oauth/consent?${query}&redirect_uri=https://evil.example/cb`,
      admin,
    );
    expect(bad.statusCode).toBe(400);

    const denied = await admin.post('/api/v1/oauth/consent', { params, allow: false });
    expect(new URL(denied.json().redirect).searchParams.get('error')).toBe('access_denied');

    const approved = await admin.post('/api/v1/oauth/consent', { params, allow: true });
    expect(approved.statusCode).toBe(200);
    const back = new URL(approved.json().redirect);
    expect(back.origin + back.pathname).toBe(redirect);
    expect(back.searchParams.get('state')).toBe('xyz');
    const code = back.searchParams.get('code')!;

    const wrong = await form({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirect,
      code_verifier: 'x'.repeat(50),
    });
    expect(wrong.json().error).toBe('invalid_grant');
    // The failed attempt used the code up.
    const reused = await form({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirect,
      code_verifier: verifier,
    });
    expect(reused.json().error).toBe('invalid_grant');
  });

  it('works end to end, refreshes and revokes', async () => {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirect,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const params = { ...Object.fromEntries(query), scope: 'read write' };
    // An API token cannot give consent: only a person signed in to the admin.
    const apiToken = await token(['read', 'write']);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/oauth/consent',
          headers: { host: site.host, authorization: `Bearer ${apiToken}` },
          payload: { params, allow: true },
        })
      ).statusCode,
    ).toBe(403);
    const approved = await admin.post('/api/v1/oauth/consent', {
      params,
      allow: true,
      publish: true,
    });
    const code = new URL(approved.json().redirect).searchParams.get('code')!;
    const tokens = (
      await form({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirect,
        code_verifier: verifier,
      })
    ).json();
    expect(tokens).toMatchObject({ token_type: 'Bearer', scope: 'read write publish' });

    // It is listed among the connected assistants (tokens marked as such).
    const listed = (await admin.get('/api/v1/tokens')).json() as {
      name: string;
      assistant: boolean;
    }[];
    expect(listed.find((t) => t.name === 'Assistant (MCP)')?.assistant).toBe(true);
    expect(listed.find((t) => t.name === 'read+write')?.assistant).toBe(false);

    const tools = (await rpc(tokens.access_token, 'tools/list')).json().result.tools;
    expect(tools.map((t: { name: string }) => t.name)).toContain('publish_entry');

    const renewed = (
      await form({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: clientId,
      })
    ).json();
    expect(renewed.access_token).toBeDefined();
    expect((await rpc(tokens.access_token, 'ping')).statusCode).toBe(401);
    expect((await rpc(renewed.access_token, 'ping')).statusCode).toBe(200);
    expect(
      (
        await form({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
          client_id: clientId,
        })
      ).json().error,
    ).toBe('invalid_grant');

    // The connection is an API token of the user: revoking it disconnects the assistant.
    const list = (await admin.get('/api/v1/tokens')).json() as { id: string; name: string }[];
    const connected = list.find((t) => t.name === 'Assistant (MCP)')!;
    expect((await admin.request('DELETE', `/api/v1/tokens/${connected.id}`)).statusCode).toBe(204);
    expect((await rpc(renewed.access_token, 'ping')).statusCode).toBe(401);
  });
});
