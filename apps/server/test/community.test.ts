/** Blogging as in WordPress: sign-ups, comments with moderation, likes (RF-USR-11, RF-COM). */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { users, type DatabaseClient } from '@cleitext/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetLimits } from '../src/community/limits.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  tokenFromMail,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let mail: MailService;
let admin: TestClient;
let host: string;
let postPath: string;
let postId: string;

/** Posted a moment after the page was opened, as people do (bots are faster). */
const later = () => String(Date.now() - 5000);
/** A redirect's address, readable (query strings use + for spaces). */
const where = (location: unknown) => decodeURIComponent(String(location).replace(/\+/g, ' '));

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  mail = app.get(MailService);
  const site = await seedSite(owner, 'community');
  host = site.host;
  await seedUser(owner, {
    email: 'admin@community.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, host, '10.51.0.1');
  await admin.login('admin@community.test', PASSWORD);
  const created = (
    await admin.post('/api/v1/entries', { type: 'article', title: 'Talk to me', slug: 'talk' })
  ).json();
  postId = created.id;
  await admin.post(`/api/v1/entries/${postId}/publish`);
  postPath = `/${new Date().getFullYear()}/talk`;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('sign-ups', () => {
  it('are closed until the setting opens them', async () => {
    const visitor = new TestClient(app, host, '10.51.0.2');
    expect((await visitor.get('/account/register')).statusCode).toBe(404);
    const posted = await visitor.postForm('/account/register', {
      name: 'Nina',
      email: 'nina@x.test',
      password: 'a-long-password-9',
      ts: later(),
    });
    expect(posted.headers.location).toContain('error=');
  });

  it('create an account that confirms its email, then signs in', async () => {
    await admin.request('PATCH', '/api/v1/settings/core', {
      registration: true,
      verifyEmail: true,
    });
    const visitor = new TestClient(app, host, '10.51.0.3');
    const page = await visitor.get('/account/register');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('action="/account/register"');

    const posted = await visitor.postForm('/account/register', {
      name: 'Nina Reader',
      email: 'nina@x.test',
      password: 'a-long-password-9',
      ts: later(),
    });
    expect(posted.headers.location).toBe('/account/register?sent=1');
    // Not yet: the address is not confirmed.
    const early = await visitor.postForm('/account/login', {
      email: 'nina@x.test',
      password: 'a-long-password-9',
    });
    expect(where(early.headers.location)).toContain('Confirm your email');

    const token = tokenFromMail(mail.outbox, 'nina@x.test');
    const verified = await visitor.get(`/account/verify?token=${token}`);
    expect(verified.headers.location).toBe('/account?verified=1');
    const profile = await visitor.get('/account');
    expect(profile.statusCode).toBe(200);
    expect(profile.body).toContain('value="Nina Reader"');
    // The link works once.
    expect((await visitor.get(`/account/verify?token=${token}`)).headers.location).toContain(
      '/account/login',
    );
    // A subscriber's toolbar leads to the account, not the admin.
    expect(profile.body).toContain('href="/account"');
  });

  it('never tell whether an address has an account', async () => {
    const visitor = new TestClient(app, host, '10.51.0.4');
    const again = await visitor.postForm('/account/register', {
      name: 'Someone',
      email: 'nina@x.test',
      password: 'another-password-7',
      ts: later(),
    });
    expect(again.headers.location).toBe('/account/register?sent=1');
    expect(mail.outbox.at(-1)?.text).toContain('already has an account');
  });

  it('let people update their profile and leave the site', async () => {
    const visitor = new TestClient(app, host, '10.51.0.5');
    const login = await visitor.postForm('/account/login', {
      email: 'nina@x.test',
      password: 'a-long-password-9',
    });
    expect(login.headers.location).toBe('/account');
    const saved = await visitor.postForm('/account/profile', {
      name: 'Nina R.',
      bio: 'Reads a lot.',
      website: 'https://nina.example',
    });
    expect(where(saved.headers.location)).toContain('Profile saved');
    expect((await visitor.get('/account')).body).toContain('Reads a lot.');
  });

  it('ignore bots that fill the hidden field', async () => {
    const bot = new TestClient(app, host, '10.51.0.6');
    const posted = await bot.postForm('/account/register', {
      name: 'Bot',
      email: 'bot@x.test',
      password: 'a-long-password-9',
      homepage: 'http://spam',
      ts: later(),
    });
    expect(posted.headers.location).toBe('/account/register?sent=1');
    expect(mail.outbox.some((m) => m.to === 'bot@x.test')).toBe(false);
  });
});

describe('comments', () => {
  it('are shown under posts with a form, and held for approval the first time', async () => {
    resetLimits();
    const guest = new TestClient(app, host, '10.51.0.7');
    const page = await guest.get(postPath);
    expect(page.body).toContain('id="comments"');
    expect(page.body).toContain('action="/comments"');

    const posted = await guest.postForm('/comments', {
      entry: postId,
      back: postPath,
      comment: 'First!',
      name: 'Gina',
      email: 'gina@x.test',
      ts: later(),
    });
    expect(posted.headers.location).toBe(`${postPath}?comment=pending#comments`);
    expect((await guest.get(postPath)).body).not.toContain('First!');
    // Moderators hear about it.
    expect(mail.outbox.at(-1)?.text).toContain('First!');

    const queue = (await admin.get('/api/v1/comments?status=pending')).json();
    expect(queue.counts.pending).toBe(1);
    expect(
      (
        await admin.post('/api/v1/comments/status', {
          ids: [queue.items[0].id],
          status: 'approved',
        })
      ).json(),
    ).toEqual({ changed: 1 });
    const after = await guest.get(postPath);
    expect(after.body).toContain('First!');
    expect(after.body).toContain('1 comment');
    // The comments feed lists it, as WordPress's /comments/feed.
    const feed = await guest.get('/comments/feed');
    expect(feed.headers['content-type']).toContain('application/rss+xml');
    expect(feed.body).toContain('Comment on Talk to me by Gina');
    expect(feed.body).toContain('First!');
  });

  it('publish at once the next comments of approved people, and threads replies', async () => {
    resetLimits();
    const guest = new TestClient(app, host, '10.51.0.8');
    const list = (await admin.get('/api/v1/comments?status=approved')).json();
    const posted = await guest.postForm('/comments', {
      entry: postId,
      back: postPath,
      comment: 'Me again',
      name: 'Gina',
      email: 'gina@x.test',
      parent: list.items[0].id,
      ts: later(),
    });
    expect(posted.headers.location).toMatch(/comment=posted#comment-/);
    const body = (await guest.get(postPath)).body;
    expect(body).toMatch(/cx-comments__children[\s\S]*Me again/);
    // Without JavaScript, the reply link opens the form answering the comment.
    const replying = (await guest.get(`${postPath}?replyto=${list.items[0].id}`)).body;
    expect(replying).toContain(`name="parent" value="${list.items[0].id}"`);
    expect(replying).toContain('Reply to Gina');
  });

  it('send to spam what has blocked words, and refuse closed entries', async () => {
    resetLimits();
    await admin.request('PATCH', '/api/v1/settings/core', { commentBlockWords: 'casino' });
    const guest = new TestClient(app, host, '10.51.0.9');
    await guest.postForm('/comments', {
      entry: postId,
      back: postPath,
      comment: 'Best casino here',
      name: 'Spam',
      email: 'spam@x.test',
      ts: later(),
    });
    expect((await admin.get('/api/v1/comments?status=spam')).json().counts.spam).toBe(1);

    await admin.request('PATCH', `/api/v1/entries/${postId}/comments`, { status: 'closed' });
    resetLimits();
    const closed = await guest.postForm('/comments', {
      entry: postId,
      back: postPath,
      comment: 'Hello',
      name: 'Late',
      email: 'late@x.test',
      ts: later(),
    });
    expect(where(closed.headers.location)).toContain('Comments are closed');
    expect((await guest.get(postPath)).body).toContain('Comments are closed.');
    await admin.request('PATCH', `/api/v1/entries/${postId}/comments`, { status: 'open' });
  });

  it('can be required to come from signed-in people', async () => {
    resetLimits();
    await admin.request('PATCH', '/api/v1/settings/core', { commentRegistration: true });
    const guest = new TestClient(app, host, '10.51.0.10');
    expect((await guest.get(postPath)).body).toContain('You must be signed in to comment.');
    const refused = await guest.postForm('/comments', {
      entry: postId,
      back: postPath,
      comment: 'Hi',
      name: 'G',
      email: 'g@x.test',
      ts: later(),
    });
    expect(where(refused.headers.location)).toContain('Sign in to comment');
    await admin.request('PATCH', '/api/v1/settings/core', { commentRegistration: false });
  });
});

describe('likes', () => {
  it('count once per browser, and toggle', async () => {
    resetLimits();
    const visitor = new TestClient(app, host, '10.51.0.11');
    const json = async () =>
      (
        await app.inject({
          method: 'POST',
          url: '/likes',
          headers: {
            host,
            origin: `http://${host}`,
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
            ...(visitor.hasCookie('cleitext_visitor') ? {} : {}),
          },
          payload: new URLSearchParams({ entry: postId, back: postPath }).toString(),
        })
      ).json();
    const first = await json();
    expect(first).toMatchObject({ ok: true, count: 1, liked: true });
    // A new browser (no cookie) adds its own like.
    expect((await json()).count).toBe(2);
    const liked = await visitor.postForm('/likes', { entry: postId, back: postPath });
    expect(liked.statusCode).toBe(303);
    const unliked = await visitor.postForm('/likes', { entry: postId, back: postPath });
    expect(unliked.statusCode).toBe(303);
    expect((await visitor.get(postPath)).body).toMatch(/data-cx-like-count="">2</);
  });
});

describe('authors', () => {
  it('have an archive of their posts, and a box with their bio under posts', async () => {
    const about = (await admin.get('/api/v1/profile/about')).json();
    expect(about.slug).toBeTruthy();
    const saved = await admin.request('PATCH', '/api/v1/profile', {
      bio: 'Writes about gardens.',
      website: 'https://writer.example',
      slug: 'the-writer',
    });
    expect(saved.statusCode).toBe(200);

    const visitor = new TestClient(app, host, '10.51.0.12');
    const archive = await visitor.get('/author/the-writer');
    expect(archive.statusCode).toBe(200);
    expect(archive.body).toContain('Talk to me');
    expect(archive.body).toContain('Writes about gardens.');
    expect(archive.body).toContain('cx-author--page');

    const post = (await visitor.get(postPath)).body;
    expect(post).toContain('class="cx-author cx-author--entry"');
    expect(post).toContain('href="/author/the-writer"');
    // Cloudflare's email obfuscation leaves the share-by-email link alone.
    expect(post).toMatch(
      /<!--email_off--><a href="mailto:\?subject=[^"]*&amp;body=[^"]+" rel="noopener noreferrer">Email<\/a><!--\/email_off-->/,
    );
    expect(post).toContain('https://writer.example');

    // Without a bio or a website the author page has nothing to add to its title.
    await admin.request('PATCH', '/api/v1/profile', { bio: '', website: '' });
    const bare = (await visitor.get('/author/the-writer')).body;
    expect(bare).not.toContain('class="cx-author cx-author--page"');
    await admin.request('PATCH', '/api/v1/profile', {
      bio: 'Writes about gardens.',
      website: 'https://writer.example',
    });
  });

  it('exist only for people with published posts', async () => {
    const visitor = new TestClient(app, host, '10.51.0.13');
    expect((await visitor.get('/author/nobody-here')).statusCode).toBe(404);
    // Nina registered and comments, but writes nothing: no page that lists accounts.
    const [nina] = await owner.db
      .select({ slug: users.slug })
      .from(users)
      .where(eq(users.email, 'nina@x.test'));
    expect((await visitor.get(`/author/${nina!.slug}`)).statusCode).toBe(404);
  });
});
