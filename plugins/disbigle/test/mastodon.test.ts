import { describe, expect, it } from 'vitest';
import {
  authorizeUrl,
  exchangeCode,
  publishArticle,
  registerApp,
  ServerError,
  type Http,
  type HttpRequest,
} from '../src/mastodon';

function fake(answer: (request: HttpRequest) => { status: number; body: unknown }) {
  const requests: HttpRequest[] = [];
  const http: Http = async (request) => {
    requests.push(request);
    const { status, body } = answer(request);
    return { status, text: JSON.stringify(body) };
  };
  return { http, requests };
}

const INSTANCE = 'https://app.disbigle.com';
const payload = {
  translations: { en: { title: 'Hello', url: 'https://blog.example/hello/' } },
  language: 'en' as const,
  mentions: ['anna'],
  tags: [],
};

describe('server calls', () => {
  it('registers the app and builds the sign-in address with PKCE', async () => {
    const { http, requests } = fake(() => ({
      status: 200,
      body: { client_id: 'cid', client_secret: 'csecret' },
    }));
    const app = await registerApp(http, INSTANCE, {
      clientName: 'Cleitext · Blog',
      redirectUri: 'https://blog.example/cl-admin/ext/disbigle',
      website: 'https://blog.example',
    });
    expect(app).toEqual({ clientId: 'cid', clientSecret: 'csecret' });
    expect(requests[0]!.url).toBe(`${INSTANCE}/api/v1/apps`);
    expect(JSON.parse(requests[0]!.body!)).toEqual({
      client_name: 'Cleitext · Blog',
      redirect_uris: 'https://blog.example/cl-admin/ext/disbigle',
      scopes: 'read write:statuses',
      website: 'https://blog.example',
    });
    const url = new URL(
      authorizeUrl(INSTANCE, {
        clientId: 'cid',
        redirectUri: 'https://blog.example/cl-admin/ext/disbigle',
        challenge: 'CH',
        state: 'ST',
      }),
    );
    expect(url.origin + url.pathname).toBe(`${INSTANCE}/oauth/authorize`);
    expect(url.search).toContain('scope=read+write%3Astatuses');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'cid',
      redirect_uri: 'https://blog.example/cl-admin/ext/disbigle',
      scope: 'read write:statuses',
      code_challenge: 'CH',
      code_challenge_method: 'S256',
      state: 'ST',
    });
  });

  it('exchanges the code with the verifier', async () => {
    const { http, requests } = fake(() => ({ status: 200, body: { access_token: 'TOKEN' } }));
    const token = await exchangeCode(http, INSTANCE, {
      clientId: 'cid',
      clientSecret: 'cs',
      code: 'CODE',
      redirectUri: 'https://blog.example/cl-admin/ext/disbigle',
      verifier: 'VER',
    });
    expect(token).toBe('TOKEN');
    const form = new URLSearchParams(requests[0]!.body);
    expect(Object.fromEntries(form)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'CODE',
      client_id: 'cid',
      client_secret: 'cs',
      code_verifier: 'VER',
    });
  });

  it('publishes with the token and the idempotency key, and reads the mentions', async () => {
    const { http, requests } = fake(() => ({
      status: 200,
      body: {
        id: '555',
        url: `${INSTANCE}/@blog/555`,
        mentions: [
          { acct: 'anna', url: `${INSTANCE}/@anna` },
          { acct: 'bob@mastodon.social', url: 'https://mastodon.social/@bob' },
          { acct: 'x@y.example', url: 'ftp://nope' },
        ],
      },
    }));
    const status = await publishArticle(http, INSTANCE, { token: 'T', key: 'entry-1', payload });
    expect(status).toEqual({
      id: '555',
      url: `${INSTANCE}/@blog/555`,
      mentions: [
        { acct: 'anna@app.disbigle.com', url: `${INSTANCE}/@anna` },
        { acct: 'bob@mastodon.social', url: 'https://mastodon.social/@bob' },
      ],
    });
    expect(requests[0]!.headers).toMatchObject({
      authorization: 'Bearer T',
      'content-type': 'application/json',
      'idempotency-key': 'entry-1',
    });
    expect(JSON.parse(requests[0]!.body!)).toEqual(payload);
  });

  it('gives the server’s error with its status', async () => {
    const { http } = fake(() => ({ status: 422, body: { error: 'Validation failed: too long' } }));
    const error = await publishArticle(http, INSTANCE, { token: 'T', key: 'k', payload }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ServerError);
    expect(error).toMatchObject({ status: 422, message: 'Validation failed: too long' });
    const down: Http = async () => {
      throw new Error('ECONNREFUSED');
    };
    await expect(
      publishArticle(down, INSTANCE, { token: 'T', key: 'k', payload }),
    ).rejects.toMatchObject({ status: 0 });
  });
});
