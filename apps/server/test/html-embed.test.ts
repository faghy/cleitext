/** HTML and embed blocks (RF-EDT-02): sanitizing by capability, oEmbed previews. */
import { resolveEmbed } from '@cleitext/blocks';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminCsp } from '../src/common/security-headers.js';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const DIRTY =
  '<p onclick="steal()">Hi <a href="javascript:alert(1)" target="_blank">x</a></p>' +
  '<script>alert(1)</script><iframe src="https://evil.example/"></iframe>' +
  '<iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe><img src="/a.png" alt="A">';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let author: TestClient;

beforeAll(async () => {
  app = await startTestApp();
  owner = ownerDatabase();
  const site = await seedSite(owner, 'html-embed');
  await seedUser(owner, {
    email: 'admin@he.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'author@he.test', password: PASSWORD, site, role: 'author' });
  admin = new TestClient(app, site.host, '10.9.0.1');
  author = new TestClient(app, site.host, '10.9.0.2');
  await admin.login('admin@he.test', PASSWORD);
  await author.login('author@he.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const document = (content: string) => ({
  schema: 1,
  blocks: [{ id: 'h', type: 'core/html', v: 1, attrs: { content } }],
});

async function saved(client: TestClient): Promise<string> {
  const res = await client.post('/api/v1/entries', {
    type: 'article',
    title: 'HTML',
    document: document(DIRTY),
  });
  expect(res.statusCode).toBe(201);
  return res.json().revision.document.blocks[0].attrs.content;
}

describe('HTML block', () => {
  it('is sanitized for users without unfiltered_html', async () => {
    const html = await saved(author);
    expect(html).not.toMatch(/script|onclick|javascript:|evil\.example/);
    expect(html).toContain('<iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe>');
    expect(html).toContain('<img src="/a.png" alt="A" />');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('is kept as written for administrators', async () => {
    expect(await saved(admin)).toBe(DIRTY);
  });

  it('is sanitized in autosaves and updates too', async () => {
    const created = (
      await author.post('/api/v1/entries', { type: 'article', title: 'Mine' })
    ).json();
    await author.request('PUT', `/api/v1/entries/${created.id}/autosave`, {
      title: 'Mine',
      document: document(DIRTY),
    });
    const updated = await author.request('PATCH', `/api/v1/entries/${created.id}`, {
      document: document(DIRTY),
    });
    expect(updated.json().revision.document.blocks[0].attrs.content).not.toContain('<script>');
    const entry = (await author.get(`/api/v1/entries/${created.id}`)).json();
    expect(JSON.stringify(entry.autosave?.document ?? null)).not.toContain('<script>');
  });
});

describe('oEmbed previews', () => {
  it('describes known providers without contacting them', async () => {
    const res = await author.get(
      `/api/v1/oembed?url=${encodeURIComponent('https://vimeo.com/76979871')}`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ type: 'video', provider_name: 'Vimeo' });
    expect(res.json().html).toContain('src="https://player.vimeo.com/video/76979871?dnt=1"');
  });

  it('previews social posts in their frame and profiles without one as a card', async () => {
    const get = async (url: string) =>
      (await author.get(`/api/v1/oembed?url=${encodeURIComponent(url)}`)).json();
    const profile = await get('https://www.tiktok.com/@linomissio');
    expect(profile).toMatchObject({ type: 'rich', provider_name: 'TikTok', height: 479 });
    expect(profile.html).toContain('src="https://www.tiktok.com/embed/@linomissio"');
    expect(profile.html).toContain('title="TikTok profile @linomissio"');
    const card = await get('https://www.instagram.com/someone/');
    expect(card).toMatchObject({ type: 'rich', provider_name: 'Instagram' });
    expect(card.html).toContain('href="https://www.instagram.com/someone/"');
    expect(card.html).not.toContain('<iframe');
  });

  it('lets every embedded player into the admin, so the editor can preview it', () => {
    const frameSrc = adminCsp([])
      .split('; ')
      .find((d) => d.startsWith('frame-src '))!;
    for (const url of [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://vimeo.com/76979871',
      'https://www.tiktok.com/@linomissio',
      'https://www.tiktok.com/@linomissio/video/7300000000000000000',
      'https://www.instagram.com/p/C1a2b3c4d5e/',
      'https://www.facebook.com/someone/posts/pfbid0abc',
      'https://x.com/someone/status/1800000000000000000',
    ]) {
      const embed = resolveEmbed(url);
      expect(embed?.layout, url).not.toBe('card');
      expect(frameSrc.split(' '), url).toContain(new URL(embed!.src).origin);
    }
  });

  it('refuses unknown addresses and missing parameters', async () => {
    expect(
      (await author.get(`/api/v1/oembed?url=${encodeURIComponent('http://127.0.0.1/')}`))
        .statusCode,
    ).toBe(404);
    expect((await author.get('/api/v1/oembed')).statusCode).toBe(400);
  });
});
