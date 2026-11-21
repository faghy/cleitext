import { createVerify, generateKeyPairSync } from 'node:crypto';
import type { PluginContext } from '@cleitext/plugin-sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import { outcomeOf, parseServiceAccount, signedAssertion, TOKEN_URL } from '../src/fcm';
import { parseSendBody, setupPushRelay, siteOriginOf } from '../src/server';

type Handler = (
  request: Record<string, unknown>,
) => Promise<{ status?: number; body?: unknown; headers?: Record<string, string> }>;

let privateKey: string;
let publicKey: string;
let serviceAccount: string;

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  serviceAccount = JSON.stringify({
    type: 'service_account',
    project_id: 'cleitext-app',
    private_key_id: 'abc',
    private_key: privateKey,
    client_email: 'push@cleitext-app.iam.gserviceaccount.com',
  });
});

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

/** The relay against a fake context; `fcm` answers each phone. */
function setUp(
  fcm: (token: string) => { status: number; text?: string } = () => ({ status: 200 }),
) {
  const storage = new Map<string, unknown>();
  const secrets = new Map<string, string>();
  const routes = new Map<string, Handler>();
  const requests: Sent[] = [];
  let clock = 1_800_000_000_000;
  const ctx = {
    access: { defineCapability: () => undefined },
    storage: {
      get: async (_s: string, key: string) => storage.get(key) ?? null,
      set: async (_s: string, key: string, value: unknown) => void storage.set(key, value),
    },
    secrets: {
      get: async (_s: string, key: string) => secrets.get(key) ?? null,
      set: async (_s: string, key: string, value: string) => void secrets.set(key, value),
      delete: async (_s: string, key: string) => void secrets.delete(key),
    },
    http: {
      send: async (request: Sent) => {
        requests.push(request);
        if (request.url === TOKEN_URL)
          return {
            status: 200,
            type: 'application/json',
            text: JSON.stringify({ access_token: 'ya29.token', expires_in: 3599 }),
          };
        const token = (JSON.parse(request.body) as { message: { token: string } }).message.token;
        const answer = fcm(token);
        return { status: answer.status, type: 'application/json', text: answer.text ?? '{}' };
      },
    },
    routes: {
      api: (route: { method: string; path: string; handler: Handler }) =>
        void routes.set(`${route.method} ${route.path}`, route.handler),
    },
    log: { warn: () => undefined, error: () => undefined, info: () => undefined },
  } as unknown as PluginContext;
  setupPushRelay(ctx, { now: () => clock });
  const call = (
    key: string,
    body: unknown = {},
    headers: Record<string, string> = { 'x-cleitext-site': 'https://example.it' },
    ip = '203.0.113.5',
  ) => routes.get(key)!({ siteId: 's', body, params: {}, headers, ip });
  const send = (body: unknown, headers?: Record<string, string>, ip?: string) =>
    call('POST /send', body, headers, ip);
  const configure = () => call('PUT /settings', { serviceAccount });
  return {
    call,
    send,
    configure,
    requests,
    secrets,
    advance: (ms: number) => void (clock += ms),
  };
}

const notice = (tokens: string[]) => ({
  tokens,
  title: 'Nuovo ordine n. 12 — 71,98 €',
  body: 'Ada Rossi · 3 prodotti',
  data: { type: 'shop.order', siteUrl: 'https://example.it', adminPath: '/cl-admin', id: 'o1' },
});

describe('the service account', () => {
  it('is checked when saved, stored as a secret and never shown back', async () => {
    const relay = setUp();
    expect((await relay.call('PUT /settings', { serviceAccount: '{"type":"x"}' })).status).toBe(
      400,
    );
    expect((await relay.call('GET /settings')).body).toEqual({
      configured: false,
      projectId: null,
      clientEmail: null,
      rateLimit: 300,
    });
    const saved = await relay.configure();
    expect(saved.body).toEqual({
      configured: true,
      projectId: 'cleitext-app',
      clientEmail: 'push@cleitext-app.iam.gserviceaccount.com',
      rateLimit: 300,
    });
    expect(JSON.stringify(saved.body)).not.toContain('PRIVATE KEY');
    expect(relay.secrets.get('service-account')).toContain('PRIVATE KEY');
    const removed = await relay.call('DELETE /settings/service-account');
    expect((removed.body as { configured: boolean }).configured).toBe(false);
  });

  it('signs the JWT bearer grant with RS256', () => {
    const jwt = signedAssertion(parseServiceAccount(serviceAccount), 1_800_000_000_000);
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toEqual({
      iss: 'push@cleitext-app.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const verify = createVerify('RSA-SHA256');
    verify.update(`${header}.${claims}`);
    expect(verify.verify(publicKey, Buffer.from(signature!, 'base64url'))).toBe(true);
  });
});

describe('POST /send', () => {
  it('answers 503 until it is configured', async () => {
    const relay = setUp();
    const answer = await relay.send(notice(['a']));
    expect(answer).toMatchObject({ status: 503, body: { error: 'not_configured' } });
    expect(relay.requests).toHaveLength(0);
  });

  it('sends each phone a message through FCM HTTP v1, and reports invalid tokens', async () => {
    const relay = setUp((token) =>
      token === 'gone'
        ? {
            status: 404,
            text: JSON.stringify({
              error: {
                status: 'NOT_FOUND',
                details: [
                  {
                    '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
                    errorCode: 'UNREGISTERED',
                  },
                ],
              },
            }),
          }
        : token === 'junk'
          ? {
              status: 400,
              text: JSON.stringify({
                error: {
                  status: 'INVALID_ARGUMENT',
                  message: 'The registration token is not a valid FCM registration token',
                },
              }),
            }
          : token === 'busy'
            ? { status: 503 }
            : { status: 200 },
    );
    await relay.configure();
    const answer = await relay.send(notice(['ok1', 'gone', 'junk', 'busy', 'ok2', 'ok1']));
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ sent: 2, invalid: ['gone', 'junk'], failed: 1 });

    const [token, ...messages] = relay.requests;
    expect(token!.url).toBe('https://oauth2.googleapis.com/token');
    expect(token!.body).toContain(
      'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer',
    );
    expect(messages).toHaveLength(5);
    const first = messages.find((m) => m.body.includes('"ok1"'))!;
    expect(first.url).toBe('https://fcm.googleapis.com/v1/projects/cleitext-app/messages:send');
    expect(first.headers.authorization).toBe('Bearer ya29.token');
    expect(first.timeoutMs).toBeLessThanOrEqual(3000);
    expect(JSON.parse(first.body)).toEqual({
      message: {
        token: 'ok1',
        notification: { title: 'Nuovo ordine n. 12 — 71,98 €', body: 'Ada Rossi · 3 prodotti' },
        data: {
          type: 'shop.order',
          siteUrl: 'https://example.it',
          adminPath: '/cl-admin',
          id: 'o1',
        },
        android: { priority: 'HIGH', notification: { sound: 'default' } },
        apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
      },
    });
  });

  it('keeps the access token for 55 minutes', async () => {
    const relay = setUp();
    await relay.configure();
    await relay.send(notice(['a']));
    relay.advance(54 * 60_000);
    await relay.send(notice(['b']));
    const tokenRequests = () => relay.requests.filter((r) => r.url === TOKEN_URL).length;
    expect(tokenRequests()).toBe(1);
    relay.advance(2 * 60_000);
    await relay.send(notice(['c']));
    expect(tokenRequests()).toBe(2);
  });

  it('checks the request', async () => {
    const relay = setUp();
    await relay.configure();
    const tooMany = Array.from({ length: 101 }, (_, i) => `t${i}`);
    for (const body of [
      notice([]),
      notice(tooMany),
      { ...notice(['a']), title: '' },
      { ...notice(['a']), title: 'x'.repeat(121) },
      { ...notice(['a']), body: 'x'.repeat(401) },
      { ...notice(['a']), data: { n: 1 } },
      { ...notice(['a']), data: { from: 'x' } },
      { ...notice(['a']), data: ['x'] },
    ])
      expect((await relay.send(body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    expect((await relay.send(notice(['a']), {})).status).toBe(400);
    expect((await relay.send(notice(['a']), { 'x-cleitext-site': 'ftp://x' })).status).toBe(400);
  });

  it('limits each site, and each address', async () => {
    const relay = setUp();
    await relay.configure();
    await relay.call('PUT /settings', { rateLimit: 3 });
    expect((await relay.send(notice(['a', 'b']))).status).toBe(200);
    expect((await relay.send(notice(['c', 'd']))).status).toBe(429);
    // Another site is counted apart.
    expect(
      (await relay.send(notice(['c', 'd']), { 'x-cleitext-site': 'https://other.example' })).status,
    ).toBe(200);
    relay.advance(3600_000);
    expect((await relay.send(notice(['c', 'd']))).status).toBe(200);

    const other = setUp();
    await other.configure();
    let last = 0;
    for (let i = 0; i < 121; i++)
      last = (
        await other.send(
          notice(['a']),
          { 'x-cleitext-site': `https://s${i}.example` },
          '198.51.100.1',
        )
      ).status!;
    expect(last).toBe(429);
  });

  it('stops starting requests when the time is almost over', async () => {
    let relayAdvance: (ms: number) => void = () => undefined;
    const relay = setUp(() => {
      relayAdvance(1500);
      return { status: 200 };
    });
    relayAdvance = relay.advance;
    await relay.configure();
    const tokens = Array.from({ length: 30 }, (_, i) => `t${i}`);
    const answer = (await relay.send(notice(tokens))).body as { sent: number; failed: number };
    expect(answer.sent + answer.failed).toBe(30);
    expect(answer.failed).toBeGreaterThan(0);
  });
});

describe('helpers', () => {
  it('read FCM errors', () => {
    expect(outcomeOf(200, '{}')).toBe('sent');
    expect(outcomeOf(401, '')).toBe('unauthorized');
    expect(
      outcomeOf(
        400,
        JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'bad data' } }),
      ),
    ).toBe('failed');
    expect(outcomeOf(500, 'oops')).toBe('failed');
  });

  it('read the site’s origin and the body', () => {
    expect(siteOriginOf('https://example.it/')).toBe('https://example.it');
    expect(siteOriginOf('nope')).toBeNull();
    expect(parseSendBody({ tokens: ['a', 'a'], title: ' T ' })).toEqual({
      tokens: ['a'],
      title: 'T',
      body: '',
      data: {},
    });
  });
});
