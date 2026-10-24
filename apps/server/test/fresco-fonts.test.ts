/**
 * Fresco's Google Fonts (Site settings → Global fonts → Google Fonts): kept
 * on the site by default, so no visitor's browser reaches Google before
 * consenting; from Google, or not at all, when the site says so. Google is
 * replaced by a fake answering as it does to browsers.
 */
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { PluginServicesProvider } from '../src/plugins/plugin-services.service.js';
import {
  ownerDatabase,
  seedSite,
  seedUser,
  startTestApp,
  TestClient,
  type SeededSite,
} from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const pluginsRoot = fileURLToPath(new URL('../../../plugins', import.meta.url));
/** "wOF2" and some bytes. */
const WOFF2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(60, 7)]);

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;
let googleDown = false;
const calls: { url: string; userAgent?: string | undefined }[] = [];

function googleCss(family: string): string {
  const slug = family.toLowerCase().replace(/ /g, '');
  return ['latin-ext', 'latin']
    .map(
      (range) =>
        `/* ${range} */\n@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: 400;\n  font-display: swap;\n  src: url(https://fonts.gstatic.com/s/${slug}/v1/${range}.woff2) format('woff2');\n}\n`,
    )
    .join('');
}

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

/** A published Fresco page with a heading in `family`. */
async function frescoPage(title: string, family: string): Promise<string> {
  const created = await admin.post('/api/v1/entries', {
    type: 'page',
    title,
    document: {
      schema: 1,
      editor: { id: 'fresco' },
      blocks: [
        {
          id: 'c1',
          type: 'fresco/container',
          v: 1,
          attrs: {},
          children: [
            {
              id: 'h1',
              type: 'fresco/heading',
              v: 1,
              attrs: { title, tag: 'h2', title_typography_family: family },
            },
          ],
        },
      ],
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  const published = await admin.post(`/api/v1/entries/${created.json().id}/publish`);
  return `/${published.json().slug as string}`;
}

async function setMode(mode: 'local' | 'google' | 'none') {
  const kit = (await admin.get('/api/v1/ext/fresco/kit')).json();
  const saved = await admin.request('PUT', '/api/v1/ext/fresco/kit', {
    ...kit,
    googleFontsMode: mode,
  });
  expect(saved.statusCode, saved.body).toBe(200);
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('fresco', pluginsPath);
  await install('privacy', pluginsPath);
  app = await startTestApp({ pluginsPath });
  vi.spyOn(app.get(PluginServicesProvider), 'httpSend').mockImplementation(
    async (_plugin, request) => {
      calls.push({ url: request.url, userAgent: request.userAgent });
      const url = new URL(request.url);
      if (googleDown) return { status: 503, type: 'text/html', text: 'down' };
      if (url.hostname === 'fonts.googleapis.com') {
        const family = url.searchParams.get('family')!.split(':')[0]!;
        return { status: 200, type: 'text/css', text: googleCss(family) };
      }
      if (url.hostname === 'fonts.gstatic.com') {
        return { status: 200, type: 'font/woff2', text: '', base64: WOFF2.toString('base64') };
      }
      return { status: 404, type: 'text/plain', text: '' };
    },
  );
  site = await seedSite(owner, 'fresco-fonts');
  await seedUser(owner, {
    email: 'admin@fresco-fonts.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.74.0.1');
  visitor = new TestClient(app, site.host, '10.74.0.2');
  await admin.login('admin@fresco-fonts.test', PASSWORD);
  for (const slug of ['fresco', 'privacy']) {
    expect((await admin.post(`/api/v1/plugins/${slug}/activate`)).statusCode).toBe(200);
  }
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Google Fonts of Fresco pages', () => {
  it('are kept on the site by default: pages link the site’s copies, never Google', async () => {
    const path = await frescoPage('Local fonts', 'Lora');
    const html = (await visitor.get(path)).body;
    expect(html).toContain('data-fr-fonts="Lora"');
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    const links = [
      ...html.matchAll(
        /<link rel="stylesheet" href="(\/_fresco\/gfonts\/[a-f0-9]{32}\.css)" data-font-family="[^"]+">/g,
      ),
    ].map((m) => m[1]!);
    // The kit's Inter and the heading's Lora.
    expect(links).toHaveLength(2);
    // The server asked Google as a browser does, and only Google's two hosts.
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(['fonts.googleapis.com', 'fonts.gstatic.com']).toContain(new URL(call.url).hostname);
    }
    expect(calls.find((c) => c.url.includes('googleapis'))?.userAgent).toMatch(/Chrome/);

    // The stylesheet and its files are served by the site, cached for a year.
    const css = await visitor.get(links[1]!);
    expect(css.statusCode).toBe(200);
    expect(css.headers['content-type']).toContain('text/css');
    expect(css.headers['cache-control']).toContain('immutable');
    expect(css.body).not.toContain('gstatic');
    const file = /url\((\/_fresco\/gfonts\/[a-f0-9]{32}\.woff2)\)/.exec(css.body)![1]!;
    const font = await visitor.get(file);
    expect(font.statusCode).toBe(200);
    expect(font.headers['content-type']).toBe('font/woff2');
    expect(font.rawPayload.equals(WOFF2)).toBe(true);
    expect((await visitor.get('/_fresco/gfonts/../../etc/passwd')).statusCode).toBe(404);
    expect((await visitor.get(`/_fresco/gfonts/${'0'.repeat(32)}.woff2`)).statusCode).toBe(404);

    // Downloaded once: other pages reuse the copies.
    calls.length = 0;
    const again = (await visitor.get(await frescoPage('Local again', 'Lora'))).body;
    expect(again).toContain(links[1]!);
    expect(calls).toHaveLength(0);
  });

  it('render no font link, not Google’s, while a download fails', async () => {
    googleDown = true;
    try {
      const html = (await visitor.get(await frescoPage('Google down', 'Karla'))).body;
      expect(html).toContain('data-fr-fonts="Karla"');
      expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
      // Inter is kept already; Karla is not there.
      expect([...html.matchAll(/\/_fresco\/gfonts\//g)]).toHaveLength(1);
    } finally {
      googleDown = false;
    }
  });

  it('come from Google only when the site settings say so, and not at all with “Don’t load”', async () => {
    const path = await frescoPage('Modes', 'Lora');
    await setMode('google');
    const google = (await visitor.get(path)).body;
    expect(google).toContain('href="https://fonts.googleapis.com/css2?family=Inter');
    expect(google).toContain('family=Lora');
    expect(google).not.toContain('/_fresco/gfonts/');

    await setMode('none');
    const none = (await visitor.get(path)).body;
    expect(none).not.toMatch(/fonts\.googleapis\.com|\/_fresco\/gfonts\//);

    await setMode('local');
    const local = (await visitor.get(path)).body;
    expect(local).not.toContain('fonts.googleapis.com');
    expect(local).toContain('/_fresco/gfonts/');
    expect((await admin.get('/api/v1/ext/fresco/kit')).json().googleFontsMode).toBeUndefined();
  });

  it('are what the Privacy plugin’s check reports, only when they come from Google', async () => {
    await frescoPage('Checked', 'Lora');
    const answer = await admin.get('/api/v1/ext/privacy/checks/pages');
    expect(answer.statusCode, answer.body).toBe(200);
    const pages = (answer.json() as { pages: string[] }).pages;
    expect(pages[0]).toBe('/');
    expect(pages).toContain('/checked');
    // What the check looks for in each page (plugins/privacy/src/checks.ts, unit-tested there).
    const scan = async () => {
      const found: string[] = [];
      for (const path of pages) {
        const html = (await visitor.get(path)).body;
        if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html)) found.push(path);
      }
      return found;
    };
    expect(await scan()).toEqual([]);
    await setMode('google');
    try {
      expect(await scan()).toContain('/checked');
    } finally {
      await setMode('local');
    }
  });

  it('give the editor’s canvas the site’s copies', async () => {
    const answer = await admin.get('/api/v1/ext/fresco/fonts/local?families=Lora|Nope');
    expect(answer.statusCode).toBe(200);
    expect(answer.json().fonts).toEqual({
      Lora: expect.stringMatching(/^\/_fresco\/gfonts\/[a-f0-9]{32}\.css$/),
    });
    expect((await visitor.get('/api/v1/ext/fresco/fonts/local?families=Lora')).statusCode).toBe(
      401,
    );
  });
});
