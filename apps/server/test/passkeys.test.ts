/**
 * Passkeys (RF-USR-05): options and refusals. The full ceremony with a real
 * authenticator is covered by the admin end-to-end test (virtual authenticator).
 */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let user: TestClient;
let visitor: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const site = await seedSite(owner, 'passkeys');
  await seedUser(owner, {
    email: 'author@passkeys.test',
    password: PASSWORD,
    site,
    role: 'author',
  });
  user = new TestClient(app, site.host, '10.31.0.1');
  await user.login('author@passkeys.test', PASSWORD);
  visitor = new TestClient(app, site.host, '10.31.0.2');
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const credential = (id: string) => ({
  id,
  rawId: id,
  type: 'public-key',
  response: { clientDataJSON: 'e30', authenticatorData: 'AA', signature: 'AA' },
  clientExtensionResults: {},
});

describe('passkeys', () => {
  it('gives registration options for the domain, excluding nothing at first', async () => {
    const res = await user.post('/api/v1/profile/passkeys/options');
    expect(res.statusCode).toBe(200);
    const options = res.json();
    expect(options.rp.id).toBe('passkeys.test');
    expect(options.user.name).toBe('author@passkeys.test');
    expect(options.authenticatorSelection.residentKey).toBe('required');
    expect(options.excludeCredentials).toEqual([]);
    expect(res.cookies.some((c: { name: string }) => c.name === 'cleitext_webauthn')).toBe(true);
    expect((await user.get('/api/v1/profile/passkeys')).json()).toEqual([]);
  });

  it('refuses sign-ins without a pending prompt or with an unknown passkey', async () => {
    // No prompt was opened by this browser.
    const lost = await visitor.post('/api/v1/auth/passkey/verify', { response: credential('abc') });
    expect(lost.statusCode).toBe(400);

    const options = await visitor.post('/api/v1/auth/passkey/options');
    expect(options.statusCode).toBe(200);
    expect(options.json().rpId).toBe('passkeys.test');
    const unknown = await visitor.post('/api/v1/auth/passkey/verify', {
      response: credential('unknown-credential'),
    });
    expect(unknown.statusCode).toBe(401);
    // The prompt is single use.
    const again = await visitor.post('/api/v1/auth/passkey/verify', {
      response: credential('unknown-credential'),
    });
    expect(again.statusCode).toBe(400);
  });

  it('answers 404 for passkeys of other users', async () => {
    expect((await user.request('DELETE', '/api/v1/profile/passkeys/nope')).statusCode).toBe(404);
    expect(
      (await user.request('PATCH', '/api/v1/profile/passkeys/nope', { name: 'x' })).statusCode,
    ).toBe(404);
  });
});
