/** Child themes and Additional CSS (core 0.79). */
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseClient } from '@cleitext/db';
import { sql } from 'drizzle-orm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { exportSite } from '../src/transfer/exporter.js';
import { importDocument } from '../src/transfer/importer.js';
import { MediaService } from '../src/media/media.service.js';
import { PageCacheService } from '../src/public/page-cache.service.js';
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

let app: NestFastifyApplication;
let owner: DatabaseClient;
let root: TestClient;
let admin: TestClient;
let editor: TestClient;
let visitor: TestClient;
let seeded: SeededSite;
let themesPath: string;

const BASE = `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
function Layout({ head, css, children }) {
  const s = sdk.useThemeSettings();
  return h('html', null, h('head', null, h('title', null, head.title), h('style', { id: 'base-css', dangerouslySetInnerHTML: { __html: css } })),
    h('body', null, h('p', { id: 'motto' }, 'Motto: ' + s.motto), children));
}
function Index() { return h('main', { id: 'base-index' }, 'Base index'); }
function Search() { return h('main', null, 'Base search'); }
export default sdk.defineTheme({ slug: 'base', name: 'Base', version: '1.2.0', menuLocations: { primary: 'Primary' },
  templates: { index: Index, search: Search }, Layout, css: '.base{color:blue}', editorCss: '.ed-base{}',
  settings: [{ name: 'motto', type: 'text', label: 'Motto', default: 'Base motto' }, { name: 'columns', type: 'number', label: 'Columns', min: 1, max: 4, default: 2 }],
  areas: { side: 'Side' } });
`;

/** A child with code: wraps the parent's index, new defaults, a setting of its own. */
const WRAP = `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
function Index(props) {
  return h('div', { id: 'wrap' }, h('p', null, 'Before the parent'), h(sdk.ParentTemplate, props));
}
function Search(props) {
  const Parent = sdk.useParentTemplate('search');
  return h('section', { id: 'child-search' }, h(Parent, props));
}
export default sdk.defineChildTheme((parent) => ({
  templates: { index: Index, search: Search },
  css: '.wrap-css{color:green}',
  editorCss: '.ed-child{}',
  settings: [{ name: 'ribbon', type: 'text', label: 'Ribbon', default: 'New' }],
  settingsDefaults: { motto: 'Child motto from ' + parent.name },
  areas: { extra: 'Extra' },
}));
`;

async function theme(
  name: string,
  manifest: Record<string, unknown>,
  files: Record<string, string> = {},
): Promise<void> {
  await mkdir(join(themesPath, name, 'dist'), { recursive: true });
  await writeFile(
    join(themesPath, name, 'theme.json'),
    JSON.stringify({ slug: name, name, version: '1.0.0', ...manifest }),
  );
  for (const [file, text] of Object.entries(files)) {
    await mkdir(join(themesPath, name, file, '..'), { recursive: true });
    await writeFile(join(themesPath, name, file), text);
  }
}

async function themesFolder(): Promise<string> {
  themesPath = await mkdtemp(join(tmpdir(), 'cleitext-child-themes-'));
  await theme(
    'base',
    { name: 'Base', version: '1.2.0' },
    {
      'dist/index.js': BASE,
      'campus-json/parent.json': '{"from":"parent"}',
      'campus-json/shared.json': '{"from":"parent"}',
    },
  );
  await theme(
    'base-kid',
    { name: 'Base Kid', parent: 'base', parentVersion: '^1.0.0' },
    {
      'style.css': '.kid-css{color:red}',
      'campus-json/kid.json': '{}',
      'campus-json/shared.json': '{"from":"child"}',
    },
  );
  await theme(
    'wrap-kid',
    { name: 'Wrap Kid', parent: 'base' },
    { 'dist/index.js': WRAP, 'editor.css': '.ed-file{}' },
  );
  await theme('aurora-kid', { parent: 'aurora' }, { 'style.css': '.aurora-kid{}' });
  // Refused: a missing parent, two levels, the wrong version, itself.
  await theme('orphan', { parent: 'nope' }, { 'style.css': '' });
  await theme('grandkid', { parent: 'base-kid' }, { 'style.css': '' });
  await theme('old-kid', { parent: 'base', parentVersion: '^2.0.0' }, { 'style.css': '' });
  await theme('narcissus', { parent: 'narcissus' }, { 'style.css': '' });
  // A child of a paid theme needs the parent's license.
  await theme(
    'paidbase',
    {
      name: 'Paid Base',
      paid: { licenseServer: 'https://license.invalid/api', purchaseUrl: 'https://shop.invalid' },
    },
    {
      'dist/index.js': BASE.replace(
        "slug: 'base', name: 'Base'",
        "slug: 'paidbase', name: 'Paid Base'",
      ),
    },
  );
  await theme('paidbase-kid', { parent: 'paidbase' }, { 'style.css': '' });
  return themesPath;
}

beforeAll(async () => {
  app = await startTestApp({
    env: {
      THEMES_PATH: await themesFolder(),
      DATABASE_ADMIN_URL: inject('ownerUrl'),
    },
  });
  owner = ownerDatabase();
  seeded = await seedSite(owner, 'children');
  await seedUser(owner, {
    email: 'admin@children.test',
    password: PASSWORD,
    site: seeded,
    role: 'administrator',
  });
  await seedUser(owner, {
    email: 'editor@children.test',
    password: PASSWORD,
    site: seeded,
    role: 'editor',
  });
  await seedUser(owner, {
    email: 'root@children.test',
    password: PASSWORD,
    site: seeded,
    role: 'subscriber',
    superAdmin: true,
  });
  admin = new TestClient(app, seeded.host, '10.36.0.1');
  editor = new TestClient(app, seeded.host, '10.36.0.2');
  visitor = new TestClient(app, seeded.host, '10.36.0.3');
  root = new TestClient(app, seeded.host, '10.36.0.4');
  await admin.login('admin@children.test', PASSWORD);
  await editor.login('editor@children.test', PASSWORD);
  await root.login('root@children.test', PASSWORD);
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

interface ListedTheme {
  slug: string;
  error: string | null;
  parent?: { slug: string; name: string } | null;
  children?: string[];
  needsParentLicense?: boolean;
}

const listed = async () => (await admin.get('/api/v1/themes')).json() as ListedTheme[];

describe('child themes', () => {
  it('are listed with their parent; broken ones say why', async () => {
    const themes = await listed();
    const by = (slug: string) => themes.find((t) => t.slug === slug)!;
    expect(by('base-kid')).toMatchObject({ error: null, parent: { slug: 'base', name: 'Base' } });
    expect(by('base').children?.sort()).toEqual(['base-kid', 'wrap-kid']);
    expect(by('aurora-kid').parent?.slug).toBe('aurora');
    expect(by('orphan').error).toContain('needs the parent theme nope');
    expect(by('grandkid').error).toContain('one level only');
    expect(by('old-kid').error).toContain('needs base ^2.0.0');
    expect(by('narcissus').error).toContain('its own parent');
    expect(by('paidbase-kid').needsParentLicense).toBe(true);
  });

  it('switches from the parent to a child keeping the look and the settings', async () => {
    expect((await admin.post('/api/v1/themes/base/activate')).statusCode).toBe(200);
    const saved = await admin.request('PUT', '/api/v1/themes/active/settings', {
      values: { motto: 'Mine', columns: 3 },
    });
    expect(saved.statusCode).toBe(200);
    expect((await visitor.get('/')).body).toContain('Motto: Mine');

    expect((await admin.post('/api/v1/themes/base-kid/activate')).statusCode).toBe(200);
    const page = (await visitor.get('/')).body;
    // The parent's layout and templates, the settings copied over.
    expect(page).toContain('Motto: Mine');
    expect(page).toContain('Base index');
    // CSS order: the parent's, then the child's.
    expect(page.indexOf('.base{color:blue}')).toBeGreaterThan(-1);
    expect(page.indexOf('.kid-css{color:red}')).toBeGreaterThan(page.indexOf('.base{color:blue}'));
    const active = (await admin.get('/api/v1/themes/active')).json();
    expect(active.theme.slug).toBe('base-kid');
    expect(active.values).toMatchObject({ motto: 'Mine', columns: 3 });
    // Its own values from now on: the parent's stay as they were.
    await admin.request('PUT', '/api/v1/themes/active/settings', { values: { motto: 'Kid' } });
    expect((await visitor.get('/')).body).toContain('Motto: Kid');
    await admin.post('/api/v1/themes/base/activate');
    expect((await visitor.get('/')).body).toContain('Motto: Mine');
    // A second activation keeps the child's own values.
    await admin.post('/api/v1/themes/base-kid/activate');
    expect((await visitor.get('/')).body).toContain('Motto: Kid');
  });

  it('give plugins the child’s files over the parent’s', async () => {
    const services = app.get(PluginServicesProvider);
    expect(await services.activeTheme(seeded.id)).toMatchObject({
      slug: 'base-kid',
      parent: 'base',
    });
    expect(await services.themeFiles(seeded.id, 'campus-json')).toEqual([
      'kid.json',
      'parent.json',
      'shared.json',
    ]);
    expect(await services.themeFile(seeded.id, 'campus-json/shared.json')).toBe('{"from":"child"}');
    expect(await services.themeFile(seeded.id, 'campus-json/parent.json')).toBe(
      '{"from":"parent"}',
    );
    expect(await services.themeFile(seeded.id, '../base/theme.json')).toBeNull();
    expect(await services.themeFile(seeded.id, 'campus-json/none.json')).toBeNull();
  });

  it('overrides and wraps the parent’s templates', async () => {
    // Live Preview of a child never activated: the parent's saved values.
    const preview = await admin.post('/api/v1/themes/wrap-kid/preview', { path: '/' });
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toContain('<div id="wrap"><p>Before the parent</p><main id="base-index">');
    expect(preview.body).toContain('Motto: Mine');
    expect(preview.body).toContain('.wrap-css{color:green}');
    const search = await admin.post('/api/v1/themes/wrap-kid/preview', { path: '/search?q=x' });
    expect(search.body).toContain('<section id="child-search"><main>Base search</main>');

    expect((await admin.post('/api/v1/themes/wrap-kid/activate')).statusCode).toBe(200);
    const active = (await admin.get('/api/v1/themes/active')).json();
    // Settings of its own, areas added to the parent's.
    expect(active.theme.settings.map((f: { name: string }) => f.name)).toEqual([
      'motto',
      'columns',
      'ribbon',
    ]);
    expect(active.values).toMatchObject({ motto: 'Mine', ribbon: 'New' });
    expect(Object.keys(active.theme.areas)).toEqual(['side', 'extra']);
    // Editor styles: the parent's, the child's, its editor.css.
    const styles = (await editor.get('/api/v1/themes/active/editor-styles')).json().css as string;
    expect(styles.indexOf('.ed-base')).toBeLessThan(styles.indexOf('.ed-child'));
    expect(styles.indexOf('.ed-child')).toBeLessThan(styles.indexOf('.ed-file'));
    await admin.post('/api/v1/themes/base-kid/activate');
  });

  it('a child of a paid theme needs the parent’s license', async () => {
    const res = await admin.post('/api/v1/themes/paidbase-kid/activate');
    expect(res.statusCode).toBe(402);
    expect(res.json().detail ?? res.json().message).toContain('Paid Base');
    // Its demo can still be tried.
    expect(
      (await admin.post('/api/v1/themes/paidbase-kid/preview', { path: '/' })).statusCode,
    ).toBe(200);
  });

  it('are created, downloaded and uploaded back; a parent in use by children stays', async () => {
    // Those who install themes only.
    expect(
      (await editor.post('/api/v1/themes/base/child', { name: 'Mine', slug: 'mine' })).statusCode,
    ).toBe(403);
    expect(
      (await root.post('/api/v1/themes/base-kid/child', { name: 'Deep', slug: 'deep' })).statusCode,
    ).toBe(400);
    expect(
      (await root.post('/api/v1/themes/base/child', { name: 'Dup', slug: 'base-kid' })).statusCode,
    ).toBe(400);
    expect(
      (await root.post('/api/v1/themes/base/child', { name: 'Bad', slug: '../x' })).statusCode,
    ).toBe(400);

    const created = await root.post('/api/v1/themes/base/child', {
      name: 'My Base',
      slug: 'my-base',
      activate: true,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ slug: 'my-base', parent: 'base', warnings: [] });
    const manifest = JSON.parse(await readFile(join(themesPath, 'my-base', 'theme.json'), 'utf8'));
    expect(manifest).toMatchObject({ slug: 'my-base', name: 'My Base', parent: 'base' });
    expect(await readFile(join(themesPath, 'my-base', 'README.md'), 'utf8')).toContain(
      'useParentTemplate',
    );
    const active = (await admin.get('/api/v1/themes/active')).json();
    expect(active.theme.slug).toBe('my-base');
    // The settings of the theme it was made from (the parent's saved values).
    expect(active.values.motto).toBe('Mine');

    // Download: a zip of the child, for those who install themes; only children.
    expect((await editor.get('/api/v1/themes/my-base/download')).statusCode).toBe(403);
    expect((await root.get('/api/v1/themes/base/download')).statusCode).toBe(400);
    const download = await root.get('/api/v1/themes/my-base/download');
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toContain('application/zip');
    const files = unzipSync(new Uint8Array(download.rawPayload));
    expect(Object.keys(files).sort()).toEqual([
      'my-base/README.md',
      'my-base/style.css',
      'my-base/theme.json',
    ]);

    // Edited and uploaded back: an update of the child.
    files['my-base/style.css'] = strToU8('.edited-locally{color:purple}');
    files['my-base/theme.json'] = strToU8(
      JSON.stringify({ ...JSON.parse(strFromU8(files['my-base/theme.json']!)), version: '1.0.1' }),
    );
    const uploaded = await root.upload(
      '/api/v1/themes/upload',
      'my-base.zip',
      Buffer.from(zipSync(files)),
    );
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json()).toMatchObject({ slug: 'my-base', version: '1.0.1' });
    expect((await visitor.get('/')).body).toContain('.edited-locally{color:purple}');

    // A child whose parent is missing is refused at upload.
    const orphanZip = zipSync({
      'lost/theme.json': strToU8(
        JSON.stringify({ slug: 'lost', name: 'Lost', version: '1.0.0', parent: 'gone' }),
      ),
      'lost/style.css': strToU8(''),
    });
    const orphan = await root.upload('/api/v1/themes/upload', 'lost.zip', Buffer.from(orphanZip));
    expect(orphan.statusCode).toBe(400);
    expect(orphan.json().detail).toContain('install gone first');

    // The parent cannot be deleted while children use it.
    await root.post('/api/v1/themes/aurora/activate');
    const refused = await root.delete('/api/v1/themes/base');
    expect(refused.statusCode).toBe(400);
    expect(refused.json().detail).toContain('child theme');
    expect((await root.delete('/api/v1/themes/my-base')).statusCode).toBe(204);
    await admin.post('/api/v1/themes/base-kid/activate');
  });
});

describe('Additional CSS', () => {
  it('is kept by the site, checked, printed last and previewed', async () => {
    expect((await editor.get('/api/v1/themes/additional-css')).statusCode).toBe(403);
    const empty = (await admin.get('/api/v1/themes/additional-css')).json();
    expect(empty).toEqual({ site: '', theme: '', themeSlug: 'base-kid', max: 100_000 });

    for (const bad of [
      '</style><script>alert(1)</script>',
      '</STYLE >',
      'a{}<style>',
      'x'.repeat(100_001),
    ]) {
      const res = await admin.request('PUT', '/api/v1/themes/additional-css', { site: bad });
      expect(res.statusCode).toBe(400);
    }
    const saved = await admin.request('PUT', '/api/v1/themes/additional-css', {
      site: '.site-wide{color:teal}',
      theme: '.only-kid{color:gold}',
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      site: '.site-wide{color:teal}',
      theme: '.only-kid{color:gold}',
    });
    const page = (await visitor.get('/')).body;
    const at = page.indexOf(
      '<style id="cx-additional-css">.site-wide{color:teal}\n.only-kid{color:gold}</style>',
    );
    expect(at).toBeGreaterThan(page.indexOf('.kid-css{color:red}'));
    expect(at).toBeGreaterThan(page.indexOf('.base{color:blue}'));
    expect(page.indexOf('</head>')).toBeGreaterThan(at);

    // The preview shows CSS being written; nothing is saved.
    const preview = await admin.post('/api/v1/themes/active/preview', {
      path: '/',
      values: {},
      additionalCss: { site: '.draft{color:pink}', theme: '' },
    });
    expect(preview.body).toContain('.draft{color:pink}');
    expect(preview.body).not.toContain('.site-wide{color:teal}');
    const badPreview = await admin.post('/api/v1/themes/active/preview', {
      path: '/',
      values: {},
      additionalCss: { site: '</style>', theme: '' },
    });
    expect(badPreview.statusCode).toBe(400);

    // Another theme: the site-wide part stays, the theme's part does not.
    await admin.post('/api/v1/themes/aurora/activate');
    const other = (await visitor.get('/')).body;
    expect(other).toContain('.site-wide{color:teal}');
    expect(other).not.toContain('.only-kid');
    expect((await admin.get('/api/v1/themes/additional-css')).json()).toMatchObject({
      site: '.site-wide{color:teal}',
      theme: '',
      themeSlug: 'aurora',
    });
    await admin.post('/api/v1/themes/base-kid/activate');
    expect((await visitor.get('/')).body).toContain('.only-kid{color:gold}');
  });

  it('goes with the site in transfers', async () => {
    const { document } = await exportSite(owner.db, seeded.id, { name: 'children' });
    expect(document.site?.additionalCss).toEqual({
      site: '.site-wide{color:teal}',
      themes: { 'base-kid': '.only-kid{color:gold}' },
    });
    const copy = await seedSite(owner, 'children-copy');
    const [importer] = (await owner.db.execute(
      sql`select id from users where email = 'root@children.test'`,
    )) as unknown as { id: string }[];
    const report = await importDocument(
      {
        ...document,
        site: {
          ...document.site,
          additionalCss: {
            site: '.copied{}',
            themes: { 'base-kid': '</style>', aurora: '.for-aurora{}' },
          },
        },
      },
      {
        db: owner.db,
        siteId: copy.id,
        asUserId: importer!.id,
        media: app.get(MediaService),
        cache: app.get(PageCacheService),
        readFile: async () => Buffer.alloc(0),
      },
    );
    expect(report.errors).toEqual([]);
    const copied = new TestClient(app, copy.host, '10.36.0.9');
    const page = (await copied.get('/')).body;
    // Unsafe parts are left out.
    expect(page).toContain('.copied{}\n.for-aurora{}');
    expect(page.match(/id="cx-additional-css"/g)).toHaveLength(1);
  });
});
