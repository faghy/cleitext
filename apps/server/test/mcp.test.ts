/** MCP for AI assistants (RF-AI-01/02): tools over the REST API, and OAuth 2.1 with PKCE. */
import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    expect(entry.preview_url).toContain('/__preview');

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
      payload: { client_name: 'Claude', redirect_uris: [redirect] },
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
    const anonymous = await get(`/oauth/authorize?${query}`);
    expect(anonymous.statusCode).toBe(302);
    expect(anonymous.headers.location).toContain('/admin/login?redirect=');

    const page = await get(`/oauth/authorize?${query}`, admin);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Claude');
    const csrf = /name="csrf" value="([^"]+)"/.exec(page.body)![1]!;

    const approved = await admin.postForm('/oauth/authorize', {
      client_id: clientId,
      redirect_uri: redirect,
      state: 'xyz',
      code_challenge: challenge,
      scope: 'read write',
      csrf,
      decision: 'allow',
    });
    expect(approved.statusCode).toBe(302);
    const back = new URL(String(approved.headers.location));
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
    const page = await get(`/oauth/authorize?${query}`, admin);
    const csrf = /name="csrf" value="([^"]+)"/.exec(page.body)![1]!;
    // A forged form without the page's token is refused.
    expect(
      (
        await admin.postForm('/oauth/authorize', {
          client_id: clientId,
          redirect_uri: redirect,
          code_challenge: challenge,
          csrf: 'forged',
          decision: 'allow',
        })
      ).statusCode,
    ).toBe(403);
    const approved = await admin.postForm('/oauth/authorize', {
      client_id: clientId,
      redirect_uri: redirect,
      code_challenge: challenge,
      scope: 'read write',
      csrf,
      decision: 'allow',
      publish: 'on',
    });
    const code = new URL(String(approved.headers.location)).searchParams.get('code')!;
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
    const connected = list.find((t) => t.name === 'Claude (MCP)')!;
    expect((await admin.request('DELETE', `/api/v1/tokens/${connected.id}`)).statusCode).toBe(204);
    expect((await rpc(renewed.access_token, 'ping')).statusCode).toBe(401);
  });
});
