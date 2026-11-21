/**
 * The official Cleitext app signs in with OAuth 2.1 (PKCE), redirected to its
 * private-use scheme (RFC 8252 §7.1), also where AI assistants (MCP) are off.
 */
import { createHash, randomBytes } from 'node:crypto';
import { APP_REDIRECT_URI } from '@cleitext/shared';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validRedirectUri } from '../src/mcp/oauth.service.js';
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

const inject = (method: 'GET' | 'POST', url: string, payload?: object | string, type?: string) =>
  app.inject({
    method,
    url,
    headers: { host: site.host, ...(type ? { 'content-type': type } : {}) },
    ...(payload !== undefined ? { payload } : {}),
  });

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, 'oauth-app');
  await seedUser(owner, {
    email: 'admin@oauth-app.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.72.0.1');
  await admin.login('admin@oauth-app.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('redirect addresses', () => {
  it('accept https, the loopback and exactly the app’s scheme', () => {
    expect(validRedirectUri('https://assistant.example/cb')).toBe(true);
    expect(validRedirectUri('http://127.0.0.1:8123/cb')).toBe(true);
    expect(validRedirectUri(APP_REDIRECT_URI)).toBe(true);
    expect(validRedirectUri('com.cleitext.app:/oauth/callback')).toBe(true);
    for (const uri of [
      'com.cleitext.app:/oauth/other',
      'com.cleitext.app://oauth/callback',
      'com.cleitext.app:/oauth/callback#x',
      'com.cleitext.app:/oauth/callback?x=1',
      'com.evil.app:/oauth/callback',
      'javascript:alert(1)',
      'http://example.com/cb',
    ])
      expect(validRedirectUri(uri), uri).toBe(false);
  });
});

describe('the official app', () => {
  const verifier = randomBytes(40).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let clientId: string;

  it('discovers the endpoints and registers while AI assistants are off', async () => {
    expect((await inject('GET', '/.well-known/oauth-protected-resource')).statusCode).toBe(404);
    const server = await inject('GET', '/.well-known/oauth-authorization-server');
    expect(server.statusCode).toBe(200);
    expect(server.json().authorization_endpoint).toBe(`http://${site.host}/oauth/authorize`);

    // Assistants cannot register while MCP is off.
    const assistant = await inject('POST', '/oauth/register', {
      client_name: 'Assistant',
      redirect_uris: ['https://assistant.example/cb'],
    });
    expect(assistant.statusCode).toBe(404);
    const mixed = await inject('POST', '/oauth/register', {
      client_name: 'Cleitext app',
      redirect_uris: [APP_REDIRECT_URI, 'https://assistant.example/cb'],
    });
    expect(mixed.statusCode).toBe(404);

    const registered = await inject('POST', '/oauth/register', {
      client_name: 'Cleitext app',
      redirect_uris: [APP_REDIRECT_URI],
    });
    expect(registered.statusCode).toBe(201);
    expect(registered.json()).toMatchObject({
      client_name: 'Cleitext app',
      redirect_uris: [APP_REDIRECT_URI],
    });
    clientId = registered.json().client_id;
  });

  it('asks for consent and goes back to the app with a code', async () => {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: APP_REDIRECT_URI,
      scope: 'read write publish',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'st-1',
    });
    const authorize = await inject('GET', `/oauth/authorize?${query}`);
    expect(authorize.statusCode).toBe(302);
    expect(authorize.headers.location).toBe(`/cl-admin/connect?${query}`);

    const view = await admin.get(`/api/v1/oauth/consent?${query}`);
    expect(view.statusCode).toBe(200);
    expect(view.json()).toMatchObject({
      client: 'Cleitext app',
      scopes: ['read', 'write', 'publish'],
      app: true,
    });

    const params = Object.fromEntries(query);
    const approved = await admin.post('/api/v1/oauth/consent', {
      params,
      allow: true,
      publish: true,
    });
    expect(approved.statusCode).toBe(200);
    const redirect = approved.json().redirect as string;
    expect(redirect.startsWith(`${APP_REDIRECT_URI}?`)).toBe(true);
    const back = new URL(redirect);
    expect(back.searchParams.get('state')).toBe('st-1');
    expect(back.searchParams.get('iss')).toBe(`http://${site.host}`);

    const tokens = await inject(
      'POST',
      '/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: back.searchParams.get('code')!,
        client_id: clientId,
        redirect_uri: APP_REDIRECT_URI,
        code_verifier: verifier,
      }).toString(),
      'application/x-www-form-urlencoded',
    );
    expect(tokens.statusCode).toBe(200);
    const { access_token: access, refresh_token: refresh } = tokens.json();
    expect(tokens.json().scope).toBe('read write publish');

    // The app's token, named after it, works on the REST API.
    const me = await app.inject({
      url: '/api/v1/auth/me',
      headers: { host: site.host, authorization: `Bearer ${access}` },
    });
    expect(me.statusCode).toBe(200);
    const listed = (await admin.get('/api/v1/tokens')).json() as { name: string }[];
    expect(listed.map((t) => t.name)).toContain('Cleitext app');

    const renewed = await inject(
      'POST',
      '/oauth/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: clientId,
      }).toString(),
      'application/x-www-form-urlencoded',
    );
    expect(renewed.statusCode).toBe(200);
    expect(renewed.json().access_token).toBeDefined();
  });

  it('denies with the error in the redirect', async () => {
    const params = {
      response_type: 'code',
      client_id: clientId,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    };
    const denied = await admin.post('/api/v1/oauth/consent', { params, allow: false });
    const back = new URL(denied.json().redirect);
    expect(`${back.protocol}${back.pathname}`).toBe(APP_REDIRECT_URI);
    expect(back.searchParams.get('error')).toBe('access_denied');
  });
});
