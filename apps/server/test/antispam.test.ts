/**
 * Antispam (official plugin, free): local checks on comments, sign-ups,
 * the Forms plugin and Prisma's form, through the core's form protection
 * (plugin API 1.38) and its spam verdicts (1.45): the hidden field, the
 * time token of cached pages, the score, the spam queue with "Not spam"
 * delivering what was held, what the filter learns, and the Captcha plugin
 * asked only when Antispam is unsure.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { resetLimits } from '../src/community/limits.js';
import { MailService } from '../src/mail/mail.service.js';
import { PluginServicesProvider } from '../src/plugins/plugin-services.service.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
const ext = (path: string) => `/api/v1/ext/antispam${path}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let host: string;
let postId: string;
let postPath: string;
let contactPath: string;
let prismaPath: string;
let prismaEntry: string;
let ip = 10;
/** Answers of the fake Cloudflare (Turnstile's siteverify). */
const siteverify: { url: string; body: string }[] = [];

async function install(slug: string, pluginsPath: string) {
  const source = join(await mkdtemp(join(tmpdir(), `${slug}-src-`)), slug);
  await buildPlugin(join(pluginsRoot, slug));
  await cp(join(pluginsRoot, slug), source, {
    recursive: true,
    filter: (file) => !file.includes('node_modules'),
  });
  await installPlugin(owner.db, {
    source,
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
}

async function publish(type: string, title: string, extra: Record<string, unknown> = {}) {
  const created = await admin.post('/api/v1/entries', { type, title, ...extra });
  expect(created.statusCode, created.body).toBe(201);
  const published = await admin.post(`/api/v1/entries/${created.json().id}/publish`);
  expect(published.statusCode).toBe(200);
  return published.json() as { id: string; slug: string };
}

/** A new visitor, from an address of their own. */
const visitor = () => new TestClient(app, host, `10.91.0.${++ip}`);

/** A time token, as the plugin's script gets it. */
async function token(client: TestClient): Promise<string> {
  const answer = await client.get('/_antispam/token');
  expect(answer.statusCode).toBe(200);
  return (answer.json() as { token: string }).token;
}

/** A token old enough (the minimum time is one second in these tests). */
async function agedToken(client: TestClient): Promise<string> {
  const t = await token(client);
  await sleep(1100);
  return t;
}

const comment = (client: TestClient, fields: Record<string, string>) => {
  resetLimits();
  return client.postForm('/comments', {
    entry: postId,
    back: postPath,
    name: 'Anna',
    email: `anna${++ip}@example.com`,
    cl_as: '1',
    cl_as_hp: '',
    ts: String(Date.now() - 5000),
    ...fields,
  });
};

async function commentsWith(status: string, text: string) {
  const list = (await admin.get(`/api/v1/comments?status=${status}`)).json() as {
    items: { id: string; content: string; status: string }[];
  };
  return list.items.filter((c) => c.content === text);
}

interface Item {
  id: string;
  kind: string;
  form: string;
  text: string;
  reasons: string[];
  deliverable: boolean;
  fields: { name: string; value: string }[];
}
const queue = async () => ((await admin.get(ext('/queue'))).json() as { items: Item[] }).items;
const itemWith = async (text: string) => (await queue()).find((i) => i.text.includes(text));

const LINKS = 'Look https://a.example https://b.example https://c.example https://d.example';

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  for (const slug of ['antispam', 'captcha', 'forms', 'prisma']) await install(slug, pluginsPath);
  app = await startTestApp({ pluginsPath });
  // Cloudflare's answer for Turnstile tokens: `good` passes.
  const services = app.get(PluginServicesProvider);
  vi.spyOn(services, 'httpSend').mockImplementation(async (_plugin, request) => {
    if (request.url.includes('challenges.cloudflare.com/turnstile/v0/siteverify')) {
      siteverify.push({ url: request.url, body: request.body ?? '' });
      const success = new URLSearchParams(request.body ?? '').get('response') === 'good';
      return { status: 200, type: 'application/json', text: JSON.stringify({ success }) };
    }
    return { status: 503, type: 'text/plain', text: '' };
  });
  const site = await seedSite(owner, 'antispam');
  host = site.host;
  await seedUser(owner, {
    email: 'admin@antispam.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, host, '10.91.1.1');
  await admin.login('admin@antispam.test', PASSWORD);
  await admin.request('PATCH', '/api/v1/settings/core', {
    registration: true,
    commentModeration: 'none',
    commentMaxLinks: 20,
  });
  for (const slug of ['forms', 'prisma', 'antispam']) {
    const activated = await admin.post(`/api/v1/plugins/${slug}/activate`);
    expect(activated.statusCode, activated.body).toBe(200);
  }
  await admin.request('PATCH', '/api/v1/plugins/forms/settings', {
    recipient: 'owner@antispam.test',
  });
  // One second instead of three, and a blocked word and address.
  const saved = await admin.request('PUT', ext('/settings'), {
    config: { minSeconds: 1, blocklist: ['casino-royale', 'spammer@junk.example'] },
  });
  expect(saved.statusCode, saved.body).toBe(200);

  const post = await publish('article', 'A post', { slug: 'a-post' });
  postId = post.id;
  postPath = `/${new Date().getFullYear()}/a-post`;
  const contact = await publish('page', 'Contact', {
    document: {
      schema: 1,
      blocks: [{ id: 'c1', type: 'forms/contact', v: 1, attrs: { formName: 'Contact' } }],
    },
  });
  contactPath = `/${contact.slug}`;
  const prisma = await publish('page', 'Write to us', {
    document: {
      schema: 1,
      blocks: [
        {
          id: 'pf',
          type: 'prisma/form',
          v: 1,
          attrs: { blockId: 'f1', afterSubmitToEmail: 'prisma-owner@antispam.test' },
          children: [
            { id: 'n', type: 'prisma/form-name', v: 1, attrs: { blockId: 'name' } },
            { id: 'm', type: 'prisma/form-email', v: 1, attrs: { blockId: 'mail' } },
            { id: 't', type: 'prisma/form-textarea', v: 1, attrs: { blockId: 'msg' } },
          ],
        },
      ],
    },
  });
  prismaPath = `/${prisma.slug}`;
  prismaEntry = prisma.id;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('the invisible checks', () => {
  it('add the same hidden fields to every protected form, cached pages included', async () => {
    const guest = visitor();
    const post = (await guest.get(postPath)).body;
    expect(post).toContain('data-cl-antispam="core/comment"');
    expect(post).toContain('name="cl_as_hp"');
    expect(post).toContain('<input type="hidden" name="cl_as_t" value="">');
    expect(post).toMatch(/plugin-assets\/antispam\/1\.0\.0\/antispam\.js/);
    expect((await guest.get('/account/register')).body).toContain(
      'data-cl-antispam="core/register"',
    );
    expect((await guest.get(contactPath)).body).toContain('data-cl-antispam="forms/contact"');
    expect((await guest.get(prismaPath)).body).toContain('data-cl-antispam="prisma/form"');
    // Never on sign-in forms.
    expect((await guest.get('/account/login')).body).not.toContain('data-cl-antispam');
    // The same markup for the next visitor (a cached page).
    expect((await visitor().get(postPath)).body).toContain('data-cl-antispam="core/comment"');
  });

  it('give a time token that is never cached', async () => {
    const answer = await visitor().get('/_antispam/token');
    expect(answer.headers['cache-control']).toContain('no-store');
    expect(answer.json()).toMatchObject({
      token: expect.stringMatching(/^\d+\.[\w-]{32}$/),
      wait: 1,
    });
  });

  it('let people through', async () => {
    const guest = visitor();
    const sent = await comment(guest, {
      comment: 'Lovely recipe, thank you!',
      cl_as_t: await agedToken(guest),
    });
    expect(sent.headers.location).toMatch(/\?comment=posted#comment-/);
    expect(await commentsWith('approved', 'Lovely recipe, thank you!')).toHaveLength(1);
  });

  it('drop bots that fill the hidden field, telling them it worked', async () => {
    const guest = visitor();
    const sent = await comment(guest, {
      comment: 'I am a bot',
      cl_as_hp: 'http://bot.example',
      cl_as_t: await token(guest),
    });
    expect(sent.headers.location).toBe(`${postPath}?comment=pending#comments`);
    for (const status of ['approved', 'pending', 'spam'])
      expect(await commentsWith(status, 'I am a bot')).toHaveLength(0);
  });

  it('hold comments sent too fast or with a forged token in the spam queue', async () => {
    const guest = visitor();
    const fast = await comment(guest, {
      comment: 'Too quick to be true',
      cl_as_t: await token(guest),
    });
    expect(fast.headers.location).toBe(`${postPath}?comment=pending#comments`);
    expect(await commentsWith('spam', 'Too quick to be true')).toHaveLength(1);
    const forged = await comment(guest, {
      comment: 'Forged token here',
      cl_as_t: `${Date.now() - 60_000}.${'A'.repeat(32)}`,
    });
    expect(forged.statusCode).toBe(303);
    expect(await commentsWith('spam', 'Forged token here')).toHaveLength(1);
    const item = await itemWith('Too quick to be true');
    expect(item).toMatchObject({ kind: 'comment', form: 'core/comment', deliverable: true });
    expect(item!.reasons).toContain('too-fast');
    expect((await itemWith('Forged token here'))!.reasons).toContain('token');
  });

  it('let people without JavaScript through when no captcha can decide', async () => {
    const sent = await comment(visitor(), { comment: 'No scripts in my browser', cl_as_t: '' });
    expect(sent.headers.location).toMatch(/\?comment=posted#comment-/);
  });
});

describe('the spam queue', () => {
  it('publishes a comment marked as not spam, and learns from it', async () => {
    const guest = visitor();
    const t = await agedToken(guest);
    // Four links: doubtful, and without a captcha it waits in the queue.
    await comment(guest, { comment: LINKS, cl_as_t: t });
    const [held] = await commentsWith('spam', LINKS);
    expect(held).toBeDefined();
    const item = (await itemWith(LINKS))!;
    expect(item.reasons).toContain('links');

    const restored = await admin.post(ext('/queue/not-spam'), { ids: [item.id] });
    expect(restored.json()).toMatchObject({ done: 1, failed: [] });
    expect(await commentsWith('approved', LINKS)).toHaveLength(1);
    expect(await itemWith(LINKS)).toBeUndefined();

    // The same text is now known to be good: it goes through.
    await comment(visitor(), { comment: LINKS, cl_as_t: t });
    expect(await commentsWith('approved', LINKS)).toHaveLength(2);
  });

  it('deletes spam for good, and remembers the text', async () => {
    const guest = visitor();
    const text = 'Best replica watches at bargain prices every day';
    await comment(guest, { comment: text, cl_as_t: await token(guest) });
    const item = (await itemWith(text))!;
    expect((await admin.post(ext('/queue/spam'), { ids: [item.id] })).json()).toMatchObject({
      done: 1,
    });
    for (const status of ['approved', 'pending', 'spam'])
      expect(await commentsWith(status, text)).toHaveLength(0);

    // Sent again, in time and from someone else: known spam, held.
    await comment(visitor(), { comment: text, cl_as_t: await agedToken(guest) });
    expect(await commentsWith('spam', text)).toHaveLength(1);
    expect((await itemWith(text))!.reasons).toContain('known-spam');
  });

  it('is only for those who moderate comments', async () => {
    expect((await visitor().get(ext('/queue'))).statusCode).toBe(401);
  });
});

describe('sign-ups', () => {
  it('drop bots and refuse blocked addresses with a message', async () => {
    resetLimits();
    const guest = visitor();
    const bot = await guest.postForm('/account/register', {
      name: 'Bot',
      email: 'bot@example.com',
      password: 'a-long-password-9',
      ts: String(Date.now() - 5000),
      cl_as: '1',
      cl_as_hp: 'filled',
      cl_as_t: await token(guest),
    });
    expect(bot.headers.location).toBe('/account/register?sent=1');

    const t = await agedToken(guest);
    const blocked = await guest.postForm('/account/register', {
      name: 'Spammer',
      email: 'spammer@junk.example',
      password: 'a-long-password-9',
      ts: String(Date.now() - 5000),
      cl_as: '1',
      cl_as_hp: '',
      cl_as_t: t,
    });
    expect(decodeURIComponent(String(blocked.headers.location).replace(/\+/g, ' '))).toContain(
      'Your message looks like spam',
    );
    const item = (await queue()).find((i) => i.form === 'core/register');
    expect(item).toMatchObject({ kind: 'refused', deliverable: false });
    expect(item!.reasons).toContain('blocklist');
  });
});

describe('the Forms plugin', () => {
  const submit = (client: TestClient, fields: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: '/_forms/submit',
      remoteAddress: `10.91.2.${++ip}`,
      headers: {
        host,
        origin: `http://${host}`,
        referer: `http://${host}${contactPath}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        _form: 'Contact',
        _block: 'c1',
        cl_as: '1',
        ...fields,
      }).toString(),
    });

  it('keeps spam aside and delivers it when marked as not spam', async () => {
    const guest = visitor();
    const t = await agedToken(guest);
    const mails = app.get(MailService).outbox;
    const before = mails.length;
    const sent = await submit(guest, {
      name: 'Carl',
      email: 'carl@example.com',
      message: 'Visit casino-royale for free spins',
      cl_as_t: t,
    });
    expect(sent.headers.location).toBe(`${contactPath}#form-c1-sent`);
    expect((await admin.get('/api/v1/ext/forms/submissions')).json()).toHaveLength(0);
    expect(mails.length).toBe(before);

    const item = (await itemWith('casino-royale'))!;
    expect(item).toMatchObject({ kind: 'form', form: 'forms/contact', deliverable: true });
    expect(item.reasons).toContain('blocklist');
    expect(item.fields.map((f) => f.name)).toEqual(['name', 'email', 'message']);

    expect((await admin.post(ext('/queue/not-spam'), { ids: [item.id] })).json()).toMatchObject({
      done: 1,
    });
    const stored = (await admin.get('/api/v1/ext/forms/submissions')).json();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: 'Carl', pagePath: contactPath });
    expect(mails.at(-1)).toMatchObject({ to: 'owner@antispam.test', replyTo: 'carl@example.com' });
  });

  it('delivers good messages at once', async () => {
    const guest = visitor();
    const sent = await submit(guest, {
      name: 'Dora',
      email: 'dora@example.com',
      message: 'Do you have a room for two in May?',
      cl_as_t: await agedToken(guest),
    });
    expect(sent.headers.location).toBe(`${contactPath}#form-c1-sent`);
    expect((await admin.get('/api/v1/ext/forms/submissions')).json()).toHaveLength(2);
  });
});

describe("Prisma's form", () => {
  it('keeps spam aside and sends it when marked as not spam', async () => {
    const guest = visitor();
    const page = (await guest.get(prismaPath)).body;
    const prismaToken = /name="_pr_token" value="([^"]+)"/.exec(page)![1]!;
    const t = await token(guest);
    // Prisma wants three seconds since the page was drawn.
    await sleep(3100);
    const mails = app.get(MailService).outbox;
    const before = mails.length;
    const sent = await app.inject({
      method: 'POST',
      url: '/_prisma/form',
      remoteAddress: `10.91.3.${++ip}`,
      headers: {
        host,
        origin: `http://${host}`,
        referer: `http://${host}${prismaPath}`,
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        _pr_form: 'f1',
        _pr_entry: prismaEntry,
        _pr_token: prismaToken,
        _pr_website: '',
        cl_as: '1',
        cl_as_t: t,
        name: 'Eve',
        mail: 'eve@example.com',
        msg: 'Play at casino-royale tonight',
      }).toString(),
    });
    expect(sent.json()).toMatchObject({ ok: true });
    expect(mails.length).toBe(before);
    const item = (await itemWith('casino-royale tonight'))!;
    expect(item).toMatchObject({ kind: 'form', form: 'prisma/form' });
    await admin.post(ext('/queue/not-spam'), { ids: [item.id] });
    expect(mails.at(-1)).toMatchObject({ to: 'prisma-owner@antispam.test' });
    expect(mails.at(-1)!.text).toContain('Play at casino-royale tonight');
  });
});

describe('with the Captcha plugin, only when unsure', () => {
  beforeAll(async () => {
    expect((await admin.post('/api/v1/plugins/captcha/activate')).statusCode).toBe(200);
    const saved = await admin.request('PUT', '/api/v1/ext/captcha/settings', {
      // Cloudflare's test keys; the answers come from the fake above.
      config: { provider: 'turnstile', siteKey: '1x00000000000000000000AA', mode: 'on-demand' },
      secrets: { secret: '1x0000000000000000000000000000000AA' },
    });
    expect(saved.statusCode, saved.body).toBe(200);
  });

  it('hides the widget and lets plain messages through without it', async () => {
    const page = (await visitor().get(postPath)).body;
    expect(page).toContain('data-cl-captcha="');
    expect(page).toContain('&quot;d&quot;:true');
    const guest = visitor();
    const calls = siteverify.length;
    const sent = await comment(guest, {
      comment: 'Plain and friendly',
      cl_as_t: await agedToken(guest),
    });
    expect(sent.headers.location).toMatch(/\?comment=posted#comment-/);
    expect(siteverify.length).toBe(calls);
  });

  it('asks for the captcha when unsure, and accepts the message once solved', async () => {
    const guest = visitor();
    const t = await agedToken(guest);
    const text = `${LINKS} https://e.example`;
    const asked = await comment(guest, { comment: text, cl_as_t: t });
    expect(decodeURIComponent(String(asked.headers.location))).toContain(
      'cl-challenge=core/comment#respond',
    );
    for (const status of ['approved', 'spam'])
      expect(await commentsWith(status, text)).toHaveLength(0);

    const wrong = await comment(guest, {
      comment: text,
      cl_as_t: t,
      'cf-turnstile-response': 'bad',
    });
    expect(String(wrong.headers.location)).toContain('cl-challenge');
    const solved = await comment(guest, {
      comment: text,
      cl_as_t: t,
      'cf-turnstile-response': 'good',
    });
    expect(solved.headers.location).toMatch(/\?comment=posted#comment-/);
    expect(await commentsWith('approved', text)).toHaveLength(1);
  });

  it('asks people without JavaScript too', async () => {
    const asked = await comment(visitor(), { comment: 'No script, no token', cl_as_t: '' });
    expect(String(asked.headers.location)).toContain('cl-challenge=core%2Fcomment');
  });

  it('keeps clear spam in the queue even when the captcha is solved', async () => {
    const guest = visitor();
    const text = 'casino-royale bonus for everyone today';
    await comment(guest, {
      comment: text,
      cl_as_t: await agedToken(guest),
      'cf-turnstile-response': 'good',
    });
    expect(await commentsWith('spam', text)).toHaveLength(1);
  });
});

describe('statistics and settings', () => {
  it('count what was stopped, per day and per reason', async () => {
    const stats = (await admin.get(ext('/stats'))).json() as {
      days: { day: string; held: number; rejected: number; refused: number; challenged: number }[];
      reasons: { reason: string; n: number }[];
    };
    expect(stats.days).toHaveLength(30);
    const today = stats.days.at(-1)!;
    expect(today.rejected).toBeGreaterThanOrEqual(2);
    expect(today.held).toBeGreaterThanOrEqual(4);
    expect(today.refused).toBeGreaterThanOrEqual(1);
    expect(today.challenged).toBeGreaterThanOrEqual(2);
    const reasons = Object.fromEntries(stats.reasons.map((r) => [r.reason, r.n]));
    expect(reasons).toMatchObject({
      honeypot: 2,
      blocklist: expect.any(Number),
      links: expect.any(Number),
    });
  });

  it('turn a form off', async () => {
    const current = (await admin.get(ext('/settings'))).json();
    await admin.request('PUT', ext('/settings'), {
      config: { ...current.config, forms: { ...current.config.forms, comments: false } },
    });
    expect((await visitor().get(postPath)).body).not.toContain('data-cl-antispam');
    const guest = visitor();
    const sent = await comment(guest, { comment: 'Unchecked now', cl_as_t: await token(guest) });
    expect(sent.headers.location).toMatch(/\?comment=posted#comment-/);
  });
});
