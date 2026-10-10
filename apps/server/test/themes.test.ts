/** Themes (RF-THM-01/03/04): installation, activation, settings, preview, areas. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseClient } from '@cleitext/db';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
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
    h('body', null, h('p', { id: 'plain' }, 'Plain theme of ' + page.site.title), children));
}
function Index() { return h('main', null, 'index'); }
export default sdk.defineTheme({ slug: 'plain', name: 'Plain', version: '1.0.0', menuLocations: {}, templates: { index: Index }, Layout, css: '' });
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
    expect((await visitor.get('/')).body).toContain('Made in Rome');
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
    expect((await admin.post('/api/v1/themes/plain/activate')).statusCode).toBe(204);
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
    const without2fa = await root.upload('/api/v1/themes/upload', 'shiny.zip', zip);
    expect(without2fa.statusCode).toBe(400);
    expect(without2fa.json().detail).toContain('two-factor');

    const { secret } = (await root.post('/api/v1/profile/2fa/setup')).json();
    await root.post('/api/v1/profile/2fa/enable', { code: totpCode(secret, currentStep()) });
    const evil = Buffer.from(zipSync({ '../evil.txt': strToU8('x') }));
    expect((await root.upload('/api/v1/themes/upload', 'evil.zip', evil)).statusCode).toBe(400);

    const res = await root.upload('/api/v1/themes/upload', 'shiny.zip', zip);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ slug: 'shiny', version: '2.0.0' });
    await eventually(async () =>
      (await root.get('/api/v1/themes')).json().some((t: { slug: string }) => t.slug === 'shiny'),
    );
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
