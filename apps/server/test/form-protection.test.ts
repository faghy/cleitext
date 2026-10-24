/**
 * Bot protection of forms (plugin API 1.38): a plugin with `forms:protect`
 * adds its challenge to the core's sign-in, sign-up, password and comment
 * forms (`form.challenge`) and refuses submissions (`form.verify`); plugins
 * with forms of their own ask it through `ctx.forms`. Without such a plugin
 * nothing changes.
 */
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, deactivatePlugin, installPlugin } from '@cleitext/cli';
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
let siteSlug: string;
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
  // A built admin, for its Content Security Policy.
  const adminPath = await mkdtemp(join(tmpdir(), 'cleitext-admin-'));
  await mkdir(join(adminPath, 'assets'));
  await writeFile(join(adminPath, 'index.html'), '<!doctype html><title>Cleitext admin</title>');
  app = await startTestApp({ pluginsPath, env: { ADMIN_PATH: adminPath } });
  const site = await seedSite(owner, 'guarded');
  host = site.host;
  siteSlug = 'guarded';
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

  it('leaves the admin sign-in and its strict policy as they were', async () => {
    const client = new TestClient(app, host, '10.81.1.1');
    expect((await client.get('/api/v1/auth/challenge?form=core/admin-login')).json()).toEqual({
      html: '',
    });
    expect((await adminLogin(client)).statusCode).toBe(200);
    const csp = await adminCsp();
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('guard.example');
  });

  it('activates the protection plugin', async () => {
    const activated = await admin.post('/api/v1/plugins/guard/activate');
    expect(activated.statusCode, activated.body).toBe(200);
  });
});

/** The admin's sign-in, as the admin app sends it (JSON, CSRF). */
async function adminLogin(client: TestClient, extra: Record<string, unknown> = {}) {
  return client.post('/api/v1/auth/login', {
    email: 'admin@guarded.test',
    password: PASSWORD,
    ...extra,
  });
}
const adminCsp = async () =>
  String(
    (await app.inject({ method: 'GET', url: '/cl-admin/login', headers: { host } })).headers[
      'content-security-policy'
    ],
  );

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

  it('holds spam, drops it silently or asks for a challenge (plugin API 1.45)', async () => {
    resetLimits();
    const guest = new TestClient(app, host, '10.81.0.14');
    const fields = {
      entry: postId,
      back: postPath,
      comment: 'Cheap watches here',
      name: 'Spammy',
      email: 'spammy@guarded.test',
      ts: later(),
    };
    // Spam: the comment is kept in the spam queue; the visitor reads "pending".
    const held = await guest.postForm('/comments', { ...fields, 'guard-token': 'spam' });
    expect(held.headers.location).toBe(`${postPath}?comment=pending#comments`);
    const spam = (await admin.get('/api/v1/comments?status=spam')).json();
    expect(spam.items.map((c: { content: string }) => c.content)).toContain('Cheap watches here');

    // Silent: nothing stored, the visitor reads "pending" too.
    resetLimits();
    const silent = await guest.postForm('/comments', {
      ...fields,
      comment: 'Silent spam',
      'guard-token': 'silent',
    });
    expect(silent.headers.location).toBe(`${postPath}?comment=pending#comments`);
    const all = (await admin.get('/api/v1/comments?status=spam')).json();
    expect(all.items.map((c: { content: string }) => c.content)).not.toContain('Silent spam');

    // A challenge first: the page shows it (cl-challenge), JSON says so.
    resetLimits();
    const challenge = await guest.postForm('/comments', { ...fields, 'guard-token': 'challenge' });
    expect(where(challenge.headers.location)).toBe(
      `${postPath}?comment-error=Solve it&cl-challenge=core/comment#respond`,
    );
    const json = await app.inject({
      method: 'POST',
      url: '/comments',
      remoteAddress: '10.81.0.14',
      headers: {
        host,
        origin: `http://${host}`,
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({ ...fields, 'guard-token': 'challenge' }).toString(),
    });
    expect(json.json()).toEqual({ ok: false, message: 'Solve it', challenge: true });

    // Sign-ups cannot be held: spam is refused; silent pretends it worked.
    const signUp = { name: 'Sam Pam', email: 'sam@guarded.test', password: 'a-long-password-9' };
    const refusedSpam = await guest.postForm('/account/register', {
      ...signUp,
      ts: later(),
      'guard-token': 'spam',
    });
    expect(where(refusedSpam.headers.location)).toContain('/account/register?error=Held as spam');
    const quiet = await guest.postForm('/account/register', {
      ...signUp,
      ts: later(),
      'guard-token': 'silent',
    });
    expect(quiet.headers.location).toBe('/account/register?sent=1');

    // Plugins: spam is held only when the form says it can (`hold`).
    expect((await guest.postForm('/_guard/send', { 'guard-token': 'spam' })).json()).toMatchObject({
      ok: false,
      message: 'Held as spam',
    });
    expect(
      (await guest.postForm('/_guard/send', { 'guard-token': 'spam', hold: '1' })).json(),
    ).toMatchObject({ ok: true, spam: true });
    expect(
      (await guest.postForm('/_guard/send', { 'guard-token': 'silent' })).json(),
    ).toMatchObject({ ok: false, silent: true });
  });

  it('protects the admin sign-in (password step) and opens its policy to the widget only', async () => {
    const client = new TestClient(app, host, '10.81.1.2');
    const challenge = (await client.get('/api/v1/auth/challenge?form=core/admin-login')).json() as {
      html: string;
    };
    expect(challenge.html).toBe(
      '<input type="hidden" name="guard-form" value="core/admin-login|en|0">',
    );
    expect((await client.get('/api/v1/auth/challenge?form=core/comment')).json()).toEqual({
      html: '',
    });

    const refused = await adminLogin(client);
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ status: 400, detail: 'The guard says no' });
    const forgot = await client.post('/api/v1/auth/password/forgot', {
      email: 'admin@guarded.test',
    });
    expect(forgot.statusCode).toBe(400);
    const reset = await client.post('/api/v1/auth/password/reset', {
      token: 'x'.repeat(30),
      password: 'a-long-password-9',
    });
    expect(reset.json()).toMatchObject({ detail: 'The guard says no' });

    const passed = await adminLogin(client, { 'guard-token': 'pass' });
    expect(passed.statusCode, passed.body).toBe(200);
    expect(passed.json().user.email).toBe('admin@guarded.test');
    // Signed in: the session works as usual.
    expect((await client.get('/api/v1/auth/me')).statusCode).toBe(200);

    const csp = await adminCsp();
    expect(csp).toContain("script-src 'self' https://guard.example");
    expect(csp).toContain('https://guard.example/frames/');
    expect(csp).not.toContain("unsafe-inline' https");
    expect(csp).not.toContain('insecure.example');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('leaves API tokens alone', async () => {
    const created = await admin.post('/api/v1/tokens', {
      name: 'Script',
      scopes: ['read'],
      expiresInDays: 1,
    });
    expect(created.statusCode).toBe(201);
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { host, authorization: `Bearer ${created.json().token}` },
    });
    expect(me.statusCode).toBe(200);
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
    expect(page).toContain('/plugin-assets/captcha/1.1.0/captcha.js');
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

  it('protects the admin sign-in with Turnstile and lets its origin in the admin policy', async () => {
    const client = new TestClient(app, host, '10.81.1.3');
    const { html } = (await client.get('/api/v1/auth/challenge?form=core/admin-login')).json();
    expect(html).toContain('data-cl-captcha="');
    expect(html).toContain('core_admin-login');
    const refused = await adminLogin(client);
    expect(refused.statusCode).toBe(400);
    expect(refused.json().detail).toBe('Please confirm that you are not a robot, then try again.');
    const csp = await adminCsp();
    expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(csp).toMatch(/frame-src [^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).not.toContain('google.com');
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
    expect((await adminLogin(new TestClient(app, host, '10.82.5.5'))).statusCode).toBe(200);
  });

  it('can leave the admin sign-in alone', async () => {
    const current = (await admin.get('/api/v1/ext/captcha/settings')).json();
    await admin.request('PUT', '/api/v1/ext/captcha/settings', {
      config: {
        ...current.config,
        trustedIps: [],
        forms: { ...current.config.forms, admin: false },
      },
      secrets: {},
    });
    const client = new TestClient(app, host, '10.81.1.4');
    expect((await client.get('/api/v1/auth/challenge?form=core/admin-login')).json()).toEqual({
      html: '',
    });
    expect((await adminLogin(client)).statusCode).toBe(200);
    expect(await adminCsp()).not.toContain('cloudflare');
  });

  it('can be turned off from the command line by a locked-out operator', async () => {
    const current = (await admin.get('/api/v1/ext/captcha/settings')).json();
    await admin.request('PUT', '/api/v1/ext/captcha/settings', {
      config: { ...current.config, forms: { ...current.config.forms, admin: true } },
      secrets: {},
    });
    const client = new TestClient(app, host, '10.81.1.5');
    expect((await adminLogin(client)).statusCode).toBe(400);
    expect(await deactivatePlugin(owner.db, 'captcha', { site: siteSlug })).toBe(
      `captcha deactivated on ${siteSlug}.`,
    );
    await eventually(async () => (await adminLogin(client)).statusCode === 200);
  });
});
