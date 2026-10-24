/**
 * Prisma's Google Fonts (Settings → Prisma → Google Fonts): kept on the
 * site by default, so no visitor's browser reaches Google before
 * consenting; from Google, or not at all, when the site says so. With
 * Fresco on the same page a family is linked once. Google is replaced by a
 * fake answering as it does to browsers.
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
const GOOGLE = /fonts\.googleapis\.com|fonts\.gstatic\.com/;

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

/** A Prisma heading in `family`, as the editor saves it. */
function heading(id: string, title: string, family: string) {
  return {
    id,
    type: 'prisma/heading',
    v: 1,
    attrs: {
      blockId: id,
      headingTitle: [{ text: title }],
      headFontFamily: family,
      headLoadGoogleFonts: true,
    },
  };
}

/** A published page of these blocks; its path. */
async function publish(title: string, blocks: unknown[], editor?: string): Promise<string> {
  const created = await admin.post('/api/v1/entries', {
    type: 'page',
    title,
    document: { schema: 1, ...(editor ? { editor: { id: editor } } : {}), blocks },
  });
  expect(created.statusCode, created.body).toBe(201);
  const published = await admin.post(`/api/v1/entries/${created.json().id}/publish`);
  return `/${published.json().slug as string}`;
}

const prismaPage = (title: string, family: string) =>
  publish(title, [heading(`h${title.length}x`, title, family)]);

async function setMode(mode: 'local' | 'google' | 'none' | null) {
  const saved = await admin.request('PATCH', '/api/v1/plugins/prisma/settings', {
    googleFonts: mode,
  });
  expect(saved.statusCode, saved.body).toBe(200);
  // Links to Google stay only when the core leaves them (Settings → General → Privacy).
  const core = await admin.request('PATCH', '/api/v1/settings/core', {
    webFonts: mode === 'google' ? 'provider' : 'local',
  });
  expect(core.statusCode, core.body).toBe(200);
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('prisma', pluginsPath);
  await install('fresco', pluginsPath);
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
  site = await seedSite(owner, 'prisma-fonts');
  await seedUser(owner, {
    email: 'admin@prisma-fonts.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.75.0.1');
  visitor = new TestClient(app, site.host, '10.75.0.2');
  await admin.login('admin@prisma-fonts.test', PASSWORD);
  const activated = await admin.post('/api/v1/plugins/prisma/activate');
  expect(activated.statusCode, activated.body).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('Google Fonts of Prisma blocks', () => {
  it('are kept on the site by default: pages link the site’s copies, never Google', async () => {
    const path = await prismaPage('Local fonts', 'Poiret One');
    const html = (await visitor.get(path)).body;
    expect(html).toContain('data-pr-fonts="Poiret One"');
    expect(html).not.toMatch(GOOGLE);
    const links = [
      ...html.matchAll(
        /<link rel="stylesheet" href="(\/_prisma\/gfonts\/[a-f0-9]{32}\.css)" data-font-family="Poiret One">/g,
      ),
    ].map((m) => m[1]!);
    expect(links).toHaveLength(1);
    // The server asked Google as a browser does, and only Google's two hosts.
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(['fonts.googleapis.com', 'fonts.gstatic.com']).toContain(new URL(call.url).hostname);
    }
    expect(calls.find((c) => c.url.includes('googleapis'))).toMatchObject({
      url: 'https://fonts.googleapis.com/css2?family=Poiret+One:wght@400;700&display=swap',
      userAgent: expect.stringMatching(/Chrome/),
    });

    // The stylesheet and its files are served by the site, cached for a year.
    const css = await visitor.get(links[0]!);
    expect(css.statusCode).toBe(200);
    expect(css.headers['content-type']).toContain('text/css');
    expect(css.headers['cache-control']).toContain('immutable');
    expect(css.body).not.toContain('gstatic');
    const file = /url\((\/_prisma\/gfonts\/[a-f0-9]{32}\.woff2)\)/.exec(css.body)![1]!;
    const font = await visitor.get(file);
    expect(font.statusCode).toBe(200);
    expect(font.headers['content-type']).toBe('font/woff2');
    expect(font.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(font.rawPayload.equals(WOFF2)).toBe(true);
    expect((await visitor.get('/_prisma/gfonts/../../etc/passwd')).statusCode).toBe(404);
    expect((await visitor.get(`/_prisma/gfonts/${'0'.repeat(32)}.woff2`)).statusCode).toBe(404);
    // Fresco's route is Fresco's: not active here.
    expect((await visitor.get(links[0]!.replace('_prisma', '_fresco'))).statusCode).toBe(404);

    // Downloaded once: other pages reuse the copies.
    calls.length = 0;
    const again = (await visitor.get(await prismaPage('Local again', 'Poiret One'))).body;
    expect(again).toContain(links[0]!);
    expect(calls).toHaveLength(0);
  });

  it('render no font link, not Google’s, while a download fails', async () => {
    googleDown = true;
    try {
      const html = (await visitor.get(await prismaPage('Google down', 'Karla'))).body;
      expect(html).toContain('data-pr-fonts="Karla"');
      expect(html).not.toMatch(GOOGLE);
      expect(html).not.toContain('/_prisma/gfonts/');
    } finally {
      googleDown = false;
    }
  });

  it('come from Google only when the settings say so, and not at all with “Don’t load”', async () => {
    const path = await prismaPage('Modes', 'Lora');
    await setMode('google');
    const google = (await visitor.get(path)).body;
    expect(google).toContain(
      'href="https://fonts.googleapis.com/css2?family=Lora:wght@400;700&amp;display=swap"',
    );
    expect(google).not.toContain('/_prisma/gfonts/');

    await setMode('none');
    const none = (await visitor.get(path)).body;
    expect(none).not.toMatch(/fonts\.googleapis\.com|\/_prisma\/gfonts\//);

    await setMode(null);
    const local = (await visitor.get(path)).body;
    expect(local).not.toMatch(GOOGLE);
    expect(local).toContain('/_prisma/gfonts/');
  });

  it('give the editor the site’s mode and copies', async () => {
    const answer = await admin.get('/api/v1/ext/prisma/fonts/local?fonts=Poiret%20One|bad!');
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toEqual({
      mode: 'local',
      fonts: { 'Poiret One': expect.stringMatching(/^\/_prisma\/gfonts\/[a-f0-9]{32}\.css$/) },
    });
    await setMode('google');
    try {
      expect((await admin.get('/api/v1/ext/prisma/fonts/local?fonts=Lora')).json()).toEqual({
        mode: 'google',
        fonts: {},
      });
    } finally {
      await setMode(null);
    }
    expect((await visitor.get('/api/v1/ext/prisma/fonts/local?fonts=Lora')).statusCode).toBe(401);
  });

  it('are linked once when Fresco wants the same family on the page', async () => {
    expect((await admin.post('/api/v1/plugins/fresco/activate')).statusCode).toBe(200);
    try {
      const path = await publish(
        'Both builders',
        [
          {
            id: 'c1',
            type: 'fresco/container',
            v: 1,
            attrs: {},
            children: [
              {
                id: 'f1',
                type: 'fresco/heading',
                v: 1,
                attrs: { title: 'Fresco', tag: 'h2', title_typography_family: 'Lora' },
              },
            ],
          },
          heading('pboth1', 'Prisma', 'Lora'),
        ],
        'fresco',
      );
      const html = (await visitor.get(path)).body;
      expect(html).toContain('data-fr-fonts="Lora"');
      expect(html).toContain('data-pr-fonts="Lora"');
      expect(html).not.toMatch(GOOGLE);
      // Lora once (by one plugin or the other), and Fresco's Inter.
      expect([...html.matchAll(/data-font-family="Lora"/g)]).toHaveLength(1);
      expect([...html.matchAll(/\/_(fresco|prisma)\/gfonts\/[a-f0-9]{32}\.css/g)]).toHaveLength(2);
    } finally {
      await admin.post('/api/v1/plugins/fresco/deactivate');
    }
  });
});
