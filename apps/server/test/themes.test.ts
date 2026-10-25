/** Themes (RF-THM-01/03/04): installation, activation, settings, preview, areas. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
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
let admin: TestClient;
let editor: TestClient;
let visitor: TestClient;
let seeded: SeededSite;

/** A minimal installed theme, as `cleitext theme:build` would bundle it. */
async function themesFolder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cleitext-themes-'));
  await mkdir(join(dir, 'plain', 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'plain', 'theme.json'),
    JSON.stringify({ slug: 'plain', name: 'Plain', version: '1.0.0' }),
  );
  await writeFile(
    join(dir, 'plain', 'dist', 'index.js'),
    `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
function Layout({ head, children }) {
  const page = sdk.usePage();
  return h('html', null, h('head', null, h('title', null, head.title)),
    h('body', null, h('p', { id: 'plain' }, 'Plain theme of ' + page.site.title), children, h(sdk.BlockArea, { name: 'note' })));
}
function Index() { return h('main', null, 'index'); }
export default sdk.defineTheme({ slug: 'plain', name: 'Plain', version: '1.0.0', menuLocations: {}, templates: { index: Index }, Layout, css: '',
  settings: [{ name: 'motto', type: 'text', label: 'Motto', maxLength: 20 }, { name: 'columns', type: 'number', label: 'Columns', min: 1, max: 4 }],
  areas: { note: 'Note' },
  areaDefaults: { note: { schema: 1, blocks: [{ id: 'd', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Default note' }] }] } },
  importSettings: (data) => (data && data.oldTheme ? { motto: data.oldTheme.motto, columns: data.oldTheme.columns } : null) });
`,
  );
  // A broken one is reported, not fatal.
  await mkdir(join(dir, 'broken'));
  await writeFile(join(dir, 'broken', 'theme.json'), '{"slug":"broken"}');
  return dir;
}

beforeAll(async () => {
  app = await startTestApp({
    env: { THEMES_PATH: await themesFolder(), DATABASE_ADMIN_URL: inject('ownerUrl') },
  });
  owner = ownerDatabase();
  const site = await seedSite(owner, 'themes');
  seeded = site;
  await seedUser(owner, {
    email: 'admin@themes.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  await seedUser(owner, { email: 'editor@themes.test', password: PASSWORD, site, role: 'editor' });
  admin = new TestClient(app, site.host, '10.35.0.1');
  editor = new TestClient(app, site.host, '10.35.0.2');
  visitor = new TestClient(app, site.host, '10.35.0.3');
  await admin.login('admin@themes.test', PASSWORD);
  await editor.login('editor@themes.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

describe('theme settings and areas', () => {
  it('saves settings checked against the schema, used by the pages', async () => {
    const active = (await admin.get('/api/v1/themes/active')).json();
    expect(active.theme.slug).toBe('aurora');
    expect(active.values).toMatchObject({ showTagline: true, showSearch: false });
    // No search box by default.
    expect((await visitor.get('/')).body).not.toContain('role="search"');
    expect((await editor.get('/api/v1/themes/active')).statusCode).toBe(403);

    const bad = await admin.request('PUT', '/api/v1/themes/active/settings', {
      values: { showSearch: 'no' },
    });
    expect(bad.statusCode).toBe(400);
    const saved = await admin.request('PUT', '/api/v1/themes/active/settings', {
      values: { showSearch: true, footerText: 'Made in Rome', accentColor: '#aa3300' },
    });
    expect(saved.json()).toMatchObject({ showSearch: true, footerText: 'Made in Rome' });
    const home = await visitor.get('/');
    expect(home.body).toContain('Made in Rome');
    expect(home.body).toContain('role="search"');
    expect(home.body).toContain('--accent: #aa3300');
  });

  it('previews unsaved settings without saving them', async () => {
    const res = await admin.post('/api/v1/themes/active/preview', {
      path: '/',
      values: { footerText: 'Draft footer' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Draft footer');
    expect(res.body).toContain('<base href="http://themes.test/">');
    expect(res.body).toContain('<script src="/api/v1/themes/preview.js"></script>');
    expect((await visitor.get('/')).body).toContain('Made in Rome');
    // The preview's script (pencils, links) needs no login.
    const script = await visitor.get('/api/v1/themes/preview.js');
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('javascript');
    expect(script.body).toContain('cleitext:customize');
  });

  it('chooses the colour scheme: automatic by default, light or dark, previewed', async () => {
    const before = (await admin.get('/api/v1/themes/active')).json().values;
    expect(before.colorScheme).toBe('auto');
    const html = async (colorScheme: string) => {
      const saved = await admin.request('PUT', '/api/v1/themes/active/settings', {
        values: { ...before, colorScheme },
      });
      expect(saved.statusCode).toBe(200);
      return (await visitor.get('/')).body;
    };
    try {
      // Automatic: the dark colors follow the system, the accent only in light mode.
      const auto = await html('auto');
      expect(auto).toContain('<html lang="en" data-color-scheme="auto">');
      expect(auto).toContain('<meta name="color-scheme" content="light dark"/>');
      expect(auto).toContain(
        '@media (prefers-color-scheme: light) { :root { --accent: #aa3300; } }',
      );
      expect(auto).toContain(
        ":root:not([data-color-scheme='light']):not([data-color-scheme='dark'])",
      );

      const light = await html('light');
      expect(light).toContain('data-color-scheme="light"');
      expect(light).toContain('<meta name="color-scheme" content="light"/>');
      expect(light).toContain('<style>:root { --accent: #aa3300; }</style>');

      const dark = await html('dark');
      expect(dark).toContain('data-color-scheme="dark"');
      expect(dark).toContain('<meta name="color-scheme" content="dark"/>');
      expect(dark).not.toContain('--accent: #aa3300');

      expect(
        (
          await admin.request('PUT', '/api/v1/themes/active/settings', {
            values: { colorScheme: 'sepia' },
          })
        ).statusCode,
      ).toBe(400);

      // The Customize preview shows a choice not saved yet.
      const preview = await admin.post('/api/v1/themes/active/preview', {
        path: '/',
        values: { ...before, colorScheme: 'light' },
      });
      expect(preview.body).toContain('data-color-scheme="light"');
      expect((await visitor.get('/')).body).toContain('data-color-scheme="dark"');
    } finally {
      await admin.request('PUT', '/api/v1/themes/active/settings', { values: before });
    }
    expect((await visitor.get('/')).body).toContain('data-color-scheme="auto"');
  });

  it('keeps a preview at an address of its own, with the public policy', async () => {
    const res = await admin.post('/api/v1/themes/active/preview', {
      path: '/',
      values: { footerText: 'Framed footer' },
      frame: true,
    });
    expect(res.statusCode).toBe(200);
    const { url } = res.json() as { url: string };
    expect(url).toMatch(/^\/api\/v1\/themes\/preview\/[\w-]{20,}$/);
    const page = await visitor.get(url);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Framed footer');
    expect(page.headers['content-security-policy']).toContain('sandbox allow-scripts');
    expect((await visitor.get('/api/v1/themes/preview/nope-nope-nope-nope-nope')).statusCode).toBe(
      404,
    );
  });

  it('renders block areas per language', async () => {
    const document = {
      schema: 1,
      blocks: [
        { id: 'p', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Footer note' }] },
      ],
    };
    const saved = await admin.request('PUT', '/api/v1/themes/active/areas/footer?locale=en', {
      document,
    });
    expect(saved.statusCode).toBe(200);
    expect((await admin.get('/api/v1/themes/active/areas/footer?locale=en')).json()).toEqual(
      document,
    );
    expect((await visitor.get('/')).body).toContain('Footer note');
    expect((await admin.get('/api/v1/themes/active/areas/nope?locale=en')).statusCode).toBe(404);
  });

  it('gives the editor the theme styles', async () => {
    const res = await editor.get('/api/v1/themes/active/editor-styles');
    expect(res.json().css).toContain('font');
  });
});

describe('installed themes', () => {
  it('lists bundled and installed themes, with load errors', async () => {
    const themes = (await admin.get('/api/v1/themes')).json();
    expect(themes.map((t: { slug: string }) => t.slug)).toEqual(['aurora', 'plain', 'broken']);
    expect(themes.find((t: { slug: string }) => t.slug === 'broken').error).toBeTruthy();
    expect((await editor.get('/api/v1/themes')).statusCode).toBe(403);
  });

  it('activates a theme for the site', async () => {
    expect((await admin.post('/api/v1/themes/missing/activate')).statusCode).toBe(404);
    expect((await admin.post('/api/v1/themes/plain/activate')).statusCode).toBe(200);
    const home = await visitor.get('/');
    expect(home.body).toContain('Plain theme of');
    await admin.post('/api/v1/themes/aurora/activate');
    expect((await visitor.get('/')).body).not.toContain('Plain theme of');
  });
});

describe('Upload Theme', () => {
  it('installs a .zip package, only for super admins with 2FA', async () => {
    const files = {
      'shiny/theme.json': strToU8(
        JSON.stringify({ slug: 'shiny', name: 'Shiny', version: '2.0.0' }),
      ),
      'shiny/dist/index.js': strToU8(
        `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
export default sdk.defineTheme({ slug: 'shiny', name: 'Shiny', version: '2.0.0', menuLocations: {},
  templates: { index: () => h('main', null, 'shiny') }, Layout: ({ children }) => h('html', null, h('body', null, children)), css: '' });`,
      ),
    };
    const zip = Buffer.from(zipSync(files));
    // An administrator cannot install code.
    expect((await admin.upload('/api/v1/themes/upload', 'shiny.zip', zip)).statusCode).toBe(403);

    await seedUser(owner, {
      email: 'root@themes.test',
      password: PASSWORD,
      site: seeded,
      role: 'subscriber',
      superAdmin: true,
    });
    const root = new TestClient(app, 'themes.test', '10.35.0.9');
    await root.login('root@themes.test', PASSWORD);
    // Two-factor authentication is not needed (it is optional).
    const evil = Buffer.from(zipSync({ '../evil.txt': strToU8('x') }));
    expect((await root.upload('/api/v1/themes/upload', 'evil.zip', evil)).statusCode).toBe(400);

    const res = await root.upload('/api/v1/themes/upload', 'shiny.zip', zip);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ slug: 'shiny', version: '2.0.0' });
    await eventually(async () =>
      (await root.get('/api/v1/themes')).json().some((t: { slug: string }) => t.slug === 'shiny'),
    );

    // Delete: super admins only, never a bundled theme or one a site uses.
    expect((await admin.delete('/api/v1/themes/shiny')).statusCode).toBe(403);
    expect((await root.delete('/api/v1/themes/aurora')).statusCode).toBe(400);
    expect((await root.post('/api/v1/themes/shiny/activate')).statusCode).toBe(200);
    const used = await root.delete('/api/v1/themes/shiny');
    expect(used.statusCode).toBe(400);
    expect(used.json().detail).toContain('activate another theme there first');
    expect((await root.post('/api/v1/themes/aurora/activate')).statusCode).toBe(200);
    expect((await root.delete('/api/v1/themes/shiny')).statusCode).toBe(204);
    await eventually(
      async () =>
        !(await root.get('/api/v1/themes'))
          .json()
          .some((t: { slug: string }) => t.slug === 'shiny'),
    );
  });
});

describe('settings of another system', () => {
  it('are imported through the active theme', async () => {
    // The default theme does not read other formats.
    expect((await admin.post('/api/v1/themes/active/import', { data: { x: 1 } })).statusCode).toBe(
      400,
    );
    expect((await admin.post('/api/v1/themes/plain/activate')).statusCode).toBe(200);
    try {
      const res = await admin.post('/api/v1/themes/active/import', {
        data: { oldTheme: { motto: 'From the old site', columns: 9 } },
      });
      expect(res.statusCode).toBe(200);
      // Values that fail validation (9 columns) are left out.
      expect(res.json()).toEqual({ values: { motto: 'From the old site' }, skipped: 1 });
      const other = await admin.post('/api/v1/themes/active/import', { data: { other: true } });
      expect(other.statusCode).toBe(400);
      const denied = await editor.post('/api/v1/themes/active/import', { data: {} });
      expect(denied.statusCode).toBe(403);
      // An area never edited shows the theme's default content.
      expect((await visitor.get('/')).body).toContain('Default note');
      const area = (await admin.get('/api/v1/themes/active/areas/note?locale=en')).json();
      expect(area.blocks[0].content[0].text).toBe('Default note');
    } finally {
      await admin.post('/api/v1/themes/aurora/activate');
    }
  });
});

async function eventually(check: () => Promise<boolean>, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('condition not met in time');
}
