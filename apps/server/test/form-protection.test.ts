/**
 * Bot protection of forms (plugin API 1.38): a plugin with `forms:protect`
 * adds its challenge to the core's sign-in, sign-up, password and comment
 * forms (`form.challenge`) and refuses submissions (`form.verify`); plugins
 * with forms of their own ask it through `ctx.forms`. Without such a plugin
 * nothing changes.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { resetLimits } from '../src/community/limits.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const fixture = fileURLToPath(new URL('./fixtures/guard-plugin', import.meta.url));
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let host: string;
let postPath: string;
let postId: string;

/** Posted a moment after the page was opened, as people do (bots are faster). */
const later = () => String(Date.now() - 5000);
const where = (location: unknown) => decodeURIComponent(String(location).replace(/\+/g, ' '));

async function eventually(check: () => Promise<boolean>, timeoutMs = 5_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('condition not met in time');
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  const source = join(await mkdtemp(join(tmpdir(), 'guard-src-')), 'guard');
  await cp(fixture, source, { recursive: true });
  await buildPlugin(source);
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  // The official Captcha plugin, for the checks that need no network.
  const captcha = join(await mkdtemp(join(tmpdir(), 'captcha-src-')), 'captcha');
  await cp(join(pluginsRoot, 'captcha'), captcha, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await buildPlugin(captcha);
  await installPlugin(owner.db, {
    source: captcha,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath });
  const site = await seedSite(owner, 'guarded');
  host = site.host;
  await seedUser(owner, {
    email: 'admin@guarded.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, host, '10.81.0.1');
  await admin.login('admin@guarded.test', PASSWORD);
  await admin.request('PATCH', '/api/v1/settings/core', { registration: true });
  const created = (
    await admin.post('/api/v1/entries', { type: 'article', title: 'Guarded post', slug: 'guarded' })
  ).json();
  postId = created.id;
  await admin.post(`/api/v1/entries/${postId}/publish`);
  postPath = `/${new Date().getFullYear()}/guarded`;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('without a protection plugin', () => {
  it('shows and accepts the forms as before', async () => {
    resetLimits();
    const visitor = new TestClient(app, host, '10.81.0.2');
    for (const path of ['/account/login', '/account/register', '/account/lost-password']) {
      const page = await visitor.get(path);
      expect(page.statusCode).toBe(200);
      expect(page.body).not.toContain('class="cx-challenge"');
    }
    expect((await visitor.get(postPath)).body).not.toContain('class="cx-challenge"');

    const signedIn = await visitor.postForm('/account/login', {
      email: 'admin@guarded.test',
      password: PASSWORD,
    });
    expect(signedIn.statusCode).toBe(303);
    expect(signedIn.headers.location).toBe('/account');

    const guest = new TestClient(app, host, '10.81.0.3');
    const posted = await guest.postForm('/comments', {
      entry: postId,
      back: postPath,
      comment: 'Hello without a guard',
      name: 'Gina',
      email: 'gina@guarded.test',
      ts: later(),
    });
    expect(posted.headers.location).toBe(`${postPath}?comment=pending#comments`);

    // ctx.forms answers "go on" when no plugin protects forms.
    const own = await guest.postForm('/_guard/send', {});
    expect(own.statusCode).toBe(404); // the fixture is not active yet
  });

  it('activates the protection plugin', async () => {
    const activated = await admin.post('/api/v1/plugins/guard/activate');
    expect(activated.statusCode, activated.body).toBe(200);
  });
});

describe('with a protection plugin', () => {
  it('adds its challenge to the core forms', async () => {
    const visitor = new TestClient(app, host, '10.81.0.4');
    const login = await visitor.get('/account/login');
    expect(login.body).toContain('class="cx-challenge"');
    expect(login.body).toContain('value="core/login|en|0"');
    expect((await visitor.get('/account/register')).body).toContain('value="core/register|en|0"');
    expect((await visitor.get('/account/lost-password')).body).toContain(
      'value="core/lost-password|en|0"',
    );
    expect((await visitor.get('/account/reset-password?token=x')).body).toContain(
      'value="core/reset-password|en|0"',
    );
    await eventually(async () =>
      (await visitor.get(postPath)).body.includes('value="core/comment|en|0"'),
    );
    // Signed-in people get the comment form's challenge with signedIn.
    expect((await admin.get(postPath)).body).toContain('value="core/comment|en|1"');
  });

  it('refuses a sign-in that fails the check, with the same notice as other errors', async () => {
    resetLimits();
    const visitor = new TestClient(app, host, '10.81.0.5');
    const refused = await visitor.postForm('/account/login', {
      email: 'admin@guarded.test',
      password: PASSWORD,
    });
    expect(refused.statusCode).toBe(303);
    expect(where(refused.headers.location)).toContain('/account/login?error=The guard says no');
    expect(where(refused.headers.location)).toContain('email=admin@guarded.test');
    expect(refused.cookies.length).toBe(0);
    const page = await visitor.get(String(refused.headers.location));
    expect(page.body).toContain('The guard says no');

    // Forms sent with JavaScript get JSON.
    const json = await app.inject({
      method: 'POST',
      url: '/account/login',
      remoteAddress: '10.81.0.5',
      headers: {
        host,
        origin: `http://${host}`,
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({ email: 'admin@guarded.test', password: PASSWORD }).toString(),
    });
    expect(json.statusCode).toBe(400);
    expect(json.json()).toEqual({ ok: false, message: 'The guard says no' });

    const passed = await visitor.postForm('/account/login', {
      email: 'admin@guarded.test',
      password: PASSWORD,
      'guard-token': 'pass',
    });
    expect(passed.headers.location).toBe('/account');
    expect((await visitor.get('/account')).statusCode).toBe(200);
  });

  it('refuses sign-ups and password requests that fail the check', async () => {
    resetLimits();
    const visitor = new TestClient(app, host, '10.81.0.6');
    const signUp = await visitor.postForm('/account/register', {
      name: 'Rob Ot',
      email: 'rob@guarded.test',
      password: 'a-long-password-9',
      ts: later(),
    });
    expect(where(signUp.headers.location)).toContain('/account/register?error=The guard says no');
    const lost = await visitor.postForm('/account/lost-password', { email: 'rob@guarded.test' });
    expect(where(lost.headers.location)).toContain(
      '/account/lost-password?error=The guard says no',
    );
    const reset = await visitor.postForm('/account/reset-password', {
      token: 'x',
      password: 'a-long-password-9',
    });
    expect(where(reset.headers.location)).toContain('/account/reset-password?token=x&error=');
  });

  it('refuses comments that fail the check and accepts those that pass', async () => {
    resetLimits();
    const guest = new TestClient(app, host, '10.81.0.7');
    const fields = {
      entry: postId,
      back: postPath,
      comment: 'Beep boop',
      name: 'Bot',
      email: 'bot@guarded.test',
      ts: later(),
    };
    const refused = await guest.postForm('/comments', fields);
    expect(where(refused.headers.location)).toBe(
      `${postPath}?comment-error=The guard says no#respond`,
    );
    const page = await guest.get(String(refused.headers.location));
    expect(page.body).toContain('The guard says no');

    const passed = await guest.postForm('/comments', { ...fields, 'guard-token': 'pass' });
    expect(passed.headers.location).toBe(`${postPath}?comment=pending#comments`);
  });

  it('answers plugins through ctx.forms', async () => {
    const guest = new TestClient(app, host, '10.81.0.8');
    const refused = await guest.postForm('/_guard/send', {});
    expect(refused.json()).toEqual({
      ok: false,
      message: 'The guard says no',
      challenge: '<input type="hidden" name="guard-form" value="guard/form|en|0">',
    });
    const passed = await guest.postForm('/_guard/send', { 'guard-token': 'pass' });
    expect(passed.json()).toMatchObject({ ok: true });
  });

  it('stops when the plugin is deactivated', async () => {
    resetLimits();
    expect((await admin.post('/api/v1/plugins/guard/deactivate')).statusCode).toBe(200);
    const visitor = new TestClient(app, host, '10.81.0.9');
    expect((await visitor.get('/account/login')).body).not.toContain('class="cx-challenge"');
    const passed = await visitor.postForm('/account/login', {
      email: 'admin@guarded.test',
      password: PASSWORD,
    });
    expect(passed.headers.location).toBe('/account');
  });
});

describe('the Captcha plugin', () => {
  it('shows nothing until its keys are set', async () => {
    expect((await admin.post('/api/v1/plugins/captcha/activate')).statusCode).toBe(200);
    const visitor = new TestClient(app, host, '10.81.0.10');
    expect((await visitor.get('/account/login')).body).not.toContain('data-cl-captcha');
  });

  it('keeps the secret key write-only', async () => {
    const saved = await admin.request('PUT', '/api/v1/ext/captcha/settings', {
      // Cloudflare's test keys (always pass).
      config: { provider: 'turnstile', siteKey: '1x00000000000000000000AA', theme: 'dark' },
      secrets: { secret: '1x0000000000000000000000000000000AA' },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({
      config: { provider: 'turnstile', siteKey: '1x00000000000000000000AA', theme: 'dark' },
      secrets: { secret: true, fallbackSecret: false },
    });
    expect(saved.body).not.toContain('1x0000000000000000000000000000000AA');
    const visitor = new TestClient(app, host, '10.81.0.11');
    expect((await visitor.get('/api/v1/ext/captcha/settings')).statusCode).toBe(401);
  });

  it('adds Turnstile to the core forms and refuses submissions without a token', async () => {
    resetLimits();
    const visitor = new TestClient(app, host, '10.81.0.12');
    const page = (await visitor.get('/account/login')).body;
    expect(page).toContain('data-cl-captcha="');
    expect(page).toContain('/plugin-assets/captcha/1.0.0/captcha.js');
    const refused = await visitor.postForm('/account/login', {
      email: 'admin@guarded.test',
      password: PASSWORD,
    });
    expect(where(refused.headers.location)).toContain(
      'error=Please confirm that you are not a robot, then try again.',
    );
    await eventually(async () => (await visitor.get(postPath)).body.includes('data-cl-captcha="'));
    // Signed-in people are not asked by default.
    expect((await admin.get(postPath)).body).not.toContain('data-cl-captcha="');
  });

  it('lets trusted addresses through', async () => {
    resetLimits();
    const current = (await admin.get('/api/v1/ext/captcha/settings')).json();
    await admin.request('PUT', '/api/v1/ext/captcha/settings', {
      config: { ...current.config, trustedIps: ['10.81.0.13', '10.82.0.0/16'] },
      secrets: {},
    });
    const trusted = new TestClient(app, host, '10.81.0.13');
    const passed = await trusted.postForm('/account/login', {
      email: 'admin@guarded.test',
      password: PASSWORD,
    });
    expect(passed.headers.location).toBe('/account');
  });
});
