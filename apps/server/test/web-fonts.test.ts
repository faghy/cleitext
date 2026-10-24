/**
 * Web fonts kept on the site for every theme (Settings → Privacy → Web
 * fonts): a theme linking Bunny Fonts and importing Google Fonts gets the
 * site's copies, served with a long cache; nothing names the services
 * unless the settings say so; Fresco's own copies are not linked twice.
 * Google and Bunny are replaced by fakes answering as they do to browsers.
 */
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlugin, installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { PluginServicesProvider } from '../src/plugins/plugin-services.service.js';
import { WebFontsService } from '../src/public/web-fonts.service.js';
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
const SERVICES = /fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.bunny\.net/;
const BUNNY_LINK =
  'https://fonts.bunny.net/css?family=inter:400,700|jetbrains-mono:400,600&display=swap';
const GOOGLE_IMPORT = 'https://fonts.googleapis.com/css2?family=Lora:wght@400&display=swap';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let site: SeededSite;
let admin: TestClient;
let visitor: TestClient;
let down = false;
/** Families whose stylesheet answers only after this many milliseconds. */
const slow = new Map<string, number>();
const calls: string[] = [];

/** A stylesheet as the service writes it (Bunny also lists WOFF files). */
function serviceCss(url: URL): string {
  const family = url.searchParams.get('family')!.split(':')[0]!;
  const slug = family.toLowerCase().replace(/[ +]/g, '-');
  return ['latin-ext', 'latin']
    .map((range) =>
      url.hostname === 'fonts.bunny.net'
        ? `/* ${range} */\n@font-face {\n  font-family: '${family}';\n  font-weight: 400;\n  src: url(https://fonts.bunny.net/${slug}/files/${slug}-${range}-400-normal.woff2) format('woff2'), url(https://fonts.bunny.net/${slug}/files/${slug}-${range}-400-normal.woff) format('woff'); \n}\n`
        : `/* ${range} */\n@font-face {\n  font-family: '${family}';\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/${slug}/v1/${range}.woff2) format('woff2');\n}\n`,
    )
    .join('');
}

async function fakeService(request: { url: string }) {
  calls.push(request.url);
  const url = new URL(request.url);
  if (down) return { status: 503, type: 'text/html', text: 'down' };
  if (/^\/css2?$/.test(url.pathname)) {
    const wait = slow.get(url.searchParams.get('family')!.split(':')[0]!);
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    return { status: 200, type: 'text/css', text: serviceCss(url) };
  }
  if (url.pathname.endsWith('.woff2')) {
    return { status: 200, type: 'font/woff2', text: '', base64: WOFF2.toString('base64') };
  }
  return { status: 404, type: 'text/plain', text: '' };
}

/** A theme as many are written: a preconnect and a link to Bunny Fonts, an @import of Google's. */
async function themesFolder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cleitext-themes-'));
  await mkdir(join(dir, 'linker', 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'linker', 'theme.json'),
    JSON.stringify({ slug: 'linker', name: 'Linker', version: '1.0.0' }),
  );
  await writeFile(
    join(dir, 'linker', 'dist', 'index.js'),
    `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
function Layout({ head, children }) {
  const s = sdk.useThemeSettings();
  return h('html', null,
    h('head', null, h('title', null, head.title),
      h('link', { rel: 'preconnect', href: 'https://fonts.bunny.net' }),
      h('link', { rel: 'stylesheet', href: ${JSON.stringify(BUNNY_LINK)} }),
      s.extra ? h('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=' + s.extra }) : null,
      h('style', { dangerouslySetInnerHTML: { __html: '@import url(${GOOGLE_IMPORT});body{font-family:Inter}' } })),
    h('body', null, children));
}
function Index(props) {
  return props.kind === 'entry'
    ? h('main', null, h(sdk.EntryContent, { document: props.entry.document }))
    : h('main', null, 'index');
}
export default sdk.defineTheme({ slug: 'linker', name: 'Linker', version: '1.0.0', menuLocations: {},
  templates: { index: Index }, Layout, css: '',
  settings: [{ name: 'extra', type: 'text', label: 'Extra Google family', default: '' }],
  editorCss: "@import url('${BUNNY_LINK}');\\nbody{font-family:Inter}" });
`,
  );
  return dir;
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

async function setExtra(family: string) {
  const saved = await admin.request('PUT', '/api/v1/themes/active/settings', {
    values: { extra: family },
  });
  expect(saved.statusCode, saved.body).toBe(200);
}

async function setMode(mode: 'local' | 'provider' | 'theme') {
  const saved = await admin.request('PATCH', '/api/v1/settings/core', { webFonts: mode });
  expect(saved.statusCode, saved.body).toBe(200);
  expect(saved.json().webFonts).toBe(mode);
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await install('fresco', pluginsPath);
  app = await startTestApp({ pluginsPath, env: { THEMES_PATH: await themesFolder() } });
  vi.spyOn(app.get(WebFontsService), 'download').mockImplementation(fakeService);
  vi.spyOn(app.get(PluginServicesProvider), 'httpSend').mockImplementation((_plugin, request) =>
    fakeService(request),
  );
  site = await seedSite(owner, 'web-fonts');
  await seedUser(owner, {
    email: 'admin@web-fonts.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.76.0.1');
  visitor = new TestClient(app, site.host, '10.76.0.2');
  await admin.login('admin@web-fonts.test', PASSWORD);
  expect((await admin.post('/api/v1/themes/linker/activate')).statusCode).toBe(200);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

const copies = (html: string) =>
  [
    ...html.matchAll(
      /<link rel="stylesheet" href="(\/_fonts\/[a-f0-9]{32}\.css)" data-font-family="([^"]+)">/g,
    ),
  ].map((m) => ({ href: m[1]!, family: m[2]! }));

describe('web fonts of the theme', () => {
  it('are kept on the site by default: no page names Google or Bunny', async () => {
    expect((await admin.get('/api/v1/settings/core')).json().webFonts).toBe('local');
    const html = (await visitor.get('/')).body;
    expect(html).toContain('<main>index</main>');
    expect(html).not.toMatch(SERVICES);
    expect(html).not.toContain('preconnect');
    expect(copies(html).map((c) => c.family)).toEqual(['inter', 'jetbrains-mono']);
    expect(html).toMatch(
      /<style>@import url\("\/_fonts\/[a-f0-9]{32}\.css"\);body\{font-family:Inter\}/,
    );
    // Only the services were asked, each family on its own; Bunny's WOFF files never.
    for (const call of calls) expect(new URL(call).hostname).toMatch(SERVICES);
    expect(calls.filter((c) => c.endsWith('.woff'))).toEqual([]);
    expect(calls).toContain('https://fonts.bunny.net/css?family=inter%3A400%2C700&display=swap');

    // The copies are served by the site, cached for a year.
    const css = await visitor.get(copies(html)[0]!.href);
    expect(css.statusCode).toBe(200);
    expect(css.headers['content-type']).toContain('text/css');
    expect(css.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(css.body).not.toMatch(SERVICES);
    expect(css.body).not.toContain('.woff)');
    const file = /url\((\/_fonts\/[a-f0-9]{32}\.woff2)\)/.exec(css.body)![1]!;
    const font = await visitor.get(file);
    expect(font.statusCode).toBe(200);
    expect(font.headers['content-type']).toBe('font/woff2');
    expect(font.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(font.rawPayload.equals(WOFF2)).toBe(true);
    expect((await visitor.get('/_fonts/../../etc/passwd')).statusCode).toBe(404);
    expect((await visitor.get(`/_fonts/${'0'.repeat(32)}.woff2`)).statusCode).toBe(404);
    // Another site never sees them.
    const other = await seedSite(owner, 'web-fonts-other');
    const stranger = new TestClient(app, other.host, '10.76.0.3');
    expect((await stranger.get(file)).statusCode).toBe(404);

    // Downloaded once: the copies are reused.
    calls.length = 0;
    expect(copies((await admin.get('/')).body)).toEqual(copies(html));
    expect(calls).toEqual([]);
  });

  it('give the block editor the copies instead of the import', async () => {
    const styles = await admin.get('/api/v1/themes/active/editor-styles');
    expect(styles.statusCode).toBe(200);
    const css = styles.json().css as string;
    expect(css).not.toMatch(SERVICES);
    expect(css).toMatch(/^@import url\("\/_fonts\/[a-f0-9]{32}\.css"\);@import url\("\/_fonts\//);
  });

  it('come from the services, as written, when the settings say so', async () => {
    await setMode('provider');
    const provider = (await visitor.get('/')).body;
    expect(provider).toContain('<link rel="preconnect" href="https://fonts.bunny.net"/>');
    expect(provider).toContain(BUNNY_LINK.replace(/&/g, '&amp;'));
    expect(provider).not.toContain('/_fonts/');
    expect((await admin.get('/api/v1/themes/active/editor-styles')).json().css).toContain(
      'fonts.bunny.net',
    );
    await setMode('theme');
    const theme = (await visitor.get('/')).body;
    expect(theme).toContain(GOOGLE_IMPORT);
    expect(theme).not.toContain('/_fonts/');
    await setMode('local');
    expect((await visitor.get('/')).body).not.toMatch(SERVICES);
  });

  it('render without the family, never the service, until its copy is ready, then refresh', async () => {
    slow.set('Karla', 3500);
    try {
      await setExtra('Karla');
      const first = await visitor.get('/');
      expect(first.body).not.toMatch(SERVICES);
      expect(copies(first.body).map((c) => c.family)).toEqual(['inter', 'jetbrains-mono']);
      // Cached meanwhile; made again once Karla is kept.
      expect((await visitor.get('/')).headers['x-cache']).toBe('HIT');
      await vi.waitFor(
        async () =>
          expect(copies((await visitor.get('/')).body).map((c) => c.family)).toContain('Karla'),
        { timeout: 10_000, interval: 250 },
      );
    } finally {
      slow.clear();
    }
  });

  it('render no font link while a service fails', async () => {
    down = true;
    try {
      await setExtra('Arvo');
      const html = (await visitor.get('/')).body;
      expect(html).not.toMatch(SERVICES);
      expect(copies(html).map((c) => c.family)).not.toContain('Arvo');
    } finally {
      down = false;
      await setExtra('');
    }
  });
});

describe('web fonts with Fresco', () => {
  it('link each family once: the theme’s by the core, Fresco’s by Fresco', async () => {
    expect((await admin.post('/api/v1/plugins/fresco/activate')).statusCode).toBe(200);
    try {
      const created = await admin.post('/api/v1/entries', {
        type: 'page',
        title: 'Builder',
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
                  id: 'f1',
                  type: 'fresco/heading',
                  v: 1,
                  attrs: { title: 'Fresco', tag: 'h2', title_typography_family: 'Poiret One' },
                },
                {
                  id: 'f2',
                  type: 'fresco/heading',
                  v: 1,
                  attrs: { title: 'Same', tag: 'h2', title_typography_family: 'Inter' },
                },
              ],
            },
          ],
        },
      });
      expect(created.statusCode, created.body).toBe(201);
      const published = await admin.post(`/api/v1/entries/${created.json().id}/publish`);
      const html = (await visitor.get(`/${published.json().slug as string}`)).body;
      expect(html).toContain('data-fr-fonts');
      expect(html).not.toMatch(SERVICES);
      const families = [...html.matchAll(/data-font-family="([^"]+)"/g)].map((m) =>
        m[1]!.toLowerCase().replace(/[^a-z]/g, ''),
      );
      expect(families.filter((f) => f === 'inter')).toHaveLength(1);
      expect(families).toContain('poiretone');
      expect(html).toMatch(/\/_fresco\/gfonts\/[a-f0-9]{32}\.css" data-font-family="Poiret One"/);
      expect(new Set(families).size).toBe(families.length);
    } finally {
      await admin.post('/api/v1/plugins/fresco/deactivate');
    }
  });
});
