/** Two-factor authentication (RF-USR-04): setup, sign-in, recovery codes, required roles. */
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentStep, totpCode } from '../src/auth/totp.js';
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

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  site = await seedSite(owner, '2fa');
  await seedUser(owner, {
    email: 'admin@2fa.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'editor@2fa.test', password: PASSWORD, site, role: 'editor' });
  admin = new TestClient(app, site.host, '10.30.0.1');
  await admin.login('admin@2fa.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

/** A code for the next time step: the current one may already be used. */
const nextCode = (secret: string, offset = 1) => totpCode(secret, currentStep() + offset);

describe('two-factor authentication', () => {
  let secret = '';
  let recovery: string[] = [];

  it('is turned on with a code from the authenticator app', async () => {
    const user = new TestClient(app, site.host, '10.30.0.2');
    await user.login('editor@2fa.test', PASSWORD);
    expect((await user.get('/api/v1/profile/2fa')).json()).toMatchObject({ enabled: false });

    const setup = (await user.post('/api/v1/profile/2fa/setup')).json();
    secret = setup.secret;
    expect(setup.otpauthUrl).toContain(`secret=${secret}`);
    expect((await user.post('/api/v1/profile/2fa/enable', { code: '000000' })).statusCode).toBe(
      400,
    );
    const enabled = await user.post('/api/v1/profile/2fa/enable', {
      code: totpCode(secret, currentStep()),
    });
    expect(enabled.statusCode).toBe(200);
    recovery = enabled.json().recoveryCodes;
    expect(recovery).toHaveLength(10);
    expect((await user.get('/api/v1/auth/me')).json().user.twoFactorEnabled).toBe(true);
  });

  it('asks for a code after the password, and each code works once', async () => {
    const user = new TestClient(app, site.host, '10.30.0.3');
    const first = await user.login('editor@2fa.test', PASSWORD);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ twoFactorRequired: true });
    expect(user.hasCookie('cleitext_session')).toBe(false);
    const challenge = first.json().challenge;

    const wrong = await user.post('/api/v1/auth/2fa', { challenge, code: '123456' });
    expect(wrong.statusCode).toBe(401);
    const code = nextCode(secret);
    const ok = await user.post('/api/v1/auth/2fa', { challenge, code });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.email).toBe('editor@2fa.test');
    expect((await user.get('/api/v1/entries')).statusCode).toBe(200);

    // The challenge and the code are spent.
    expect((await user.post('/api/v1/auth/2fa', { challenge, code })).statusCode).toBe(401);
    const again = new TestClient(app, site.host, '10.30.0.4');
    const second = (await again.login('editor@2fa.test', PASSWORD)).json();
    expect(
      (await again.post('/api/v1/auth/2fa', { challenge: second.challenge, code })).statusCode,
    ).toBe(401);
  });

  it('accepts each recovery code once', async () => {
    const user = new TestClient(app, site.host, '10.30.0.5');
    const { challenge } = (await user.login('editor@2fa.test', PASSWORD)).json();
    const ok = await user.post('/api/v1/auth/2fa', { challenge, code: recovery[0]!.toUpperCase() });
    expect(ok.statusCode).toBe(200);
    expect((await user.get('/api/v1/profile/2fa')).json().recoveryCodesLeft).toBe(9);

    const other = new TestClient(app, site.host, '10.30.0.6');
    const next = (await other.login('editor@2fa.test', PASSWORD)).json();
    expect(
      (await other.post('/api/v1/auth/2fa', { challenge: next.challenge, code: recovery[0] }))
        .statusCode,
    ).toBe(401);
  });

  it('is turned off with the password', async () => {
    const user = new TestClient(app, site.host, '10.30.0.7');
    const { challenge } = (await user.login('editor@2fa.test', PASSWORD)).json();
    await user.post('/api/v1/auth/2fa', { challenge, code: recovery[1] });
    expect((await user.post('/api/v1/profile/2fa/disable', { password: 'nope' })).statusCode).toBe(
      400,
    );
    expect(
      (await user.post('/api/v1/profile/2fa/disable', { password: PASSWORD })).statusCode,
    ).toBe(204);
    const plain = new TestClient(app, site.host, '10.30.0.8');
    expect((await plain.login('editor@2fa.test', PASSWORD)).json().user).toBeDefined();
  });

  it('can be required for a role: until it is on, only the setup is reachable', async () => {
    expect(
      (await admin.request('PUT', '/api/v1/settings/security', { require2fa: ['editor'] }))
        .statusCode,
    ).toBe(200);
    const user = new TestClient(app, site.host, '10.30.0.9');
    const me = (await user.login('editor@2fa.test', PASSWORD)).json();
    expect(me.user).toMatchObject({ twoFactorRequired: true, twoFactorEnabled: false });
    expect((await user.get('/api/v1/entries')).statusCode).toBe(403);
    expect((await user.get('/api/v1/auth/me')).statusCode).toBe(200);

    const { secret: newSecret } = (await user.post('/api/v1/profile/2fa/setup')).json();
    await user.post('/api/v1/profile/2fa/enable', { code: totpCode(newSecret, currentStep()) });
    expect((await user.get('/api/v1/entries')).statusCode).toBe(200);
    // A required 2FA cannot be turned off.
    expect(
      (await user.post('/api/v1/profile/2fa/disable', { password: PASSWORD })).statusCode,
    ).toBe(400);
    // Administrators are not affected.
    expect((await admin.get('/api/v1/entries')).statusCode).toBe(200);
    await admin.request('PUT', '/api/v1/settings/security', { require2fa: [] });
  });
});
