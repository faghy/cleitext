/**
 * Options of menu items declared by a theme (`menuItemFields`, plugin API
 * 1.34) and by plugins extending it: validated on save, given to the theme
 * in `MenuItemView.data` per level, kept while not declared.
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installPlugin } from '@cleitext/cli';
import type { DatabaseClient } from '@cleitext/db';
import type { MenuView, ThemeInfo } from '@cleitext/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ownerDatabase, seedSite, seedUser, startTestApp, TestClient } from './helpers.js';

const PASSWORD = 'correct horse battery staple';
const PLUGIN = 'mega-fixture';

let app: NestFastifyApplication;
let owner: DatabaseClient;
let admin: TestClient;
let visitor: TestClient;
let menuId: string;

/** A theme that prints its primary menu with each item's data. */
async function themesFolder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cleitext-themes-'));
  await mkdir(join(dir, 'menu', 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'menu', 'theme.json'),
    JSON.stringify({ slug: 'menu', name: 'Menu', version: '1.0.0' }),
  );
  await writeFile(
    join(dir, 'menu', 'dist', 'index.js'),
    `const { createElement: h } = globalThis.__cleitextShared.react;
const sdk = globalThis.__cleitextShared['@cleitext/theme-sdk'];
const flat = (items) => items.flatMap((i) => [{ label: i.label, data: i.data ?? null }, ...flat(i.children)]);
function Layout({ head, children }) {
  const page = sdk.usePage();
  return h('html', null, h('head', null, h('title', null, head.title)),
    h('body', null, h('pre', { id: 'menu' }, 'MENU' + JSON.stringify(flat(page.menus.primary ?? [])) + 'END'), children));
}
function Index() { return h('main', null, 'index'); }
export default sdk.defineTheme({ slug: 'menu', name: 'Menu', version: '1.0.0', menuLocations: { primary: 'Primary' },
  templates: { index: Index }, Layout, css: '',
  menuItemFields: [
    { field: { name: 'columns', type: 'number', label: 'Columns', min: 1, max: 6, default: 1 }, levels: 'top' },
    { field: { name: 'icon', type: 'text', label: 'Icon', maxLength: 10 } },
  ] });
`,
  );
  return dir;
}

/** A plugin adding a mega menu option, and one whose name the theme already uses. */
async function pluginSource(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'mega-src-')), PLUGIN);
  await mkdir(join(dir, 'dist'), { recursive: true });
  await writeFile(
    join(dir, 'cleitext.plugin.json'),
    JSON.stringify({
      slug: PLUGIN,
      name: 'Mega menu (test fixture)',
      version: '1.0.0',
      apiVersion: '^1.34',
      license: 'GPL-2.0-or-later',
      server: 'dist/server.js',
      permissions: ['theme:hooks'],
    }),
  );
  await writeFile(
    join(dir, 'dist', 'server.js'),
    `export default { setup(ctx) {
  ctx.themes.extend('menu', {
    menuItemFields: [
      { field: { name: 'mega', type: 'boolean', label: 'Mega menu', default: false }, levels: 'top' },
      { field: { name: 'icon', type: 'number', label: 'Clashing icon' } },
    ],
  });
} };
`,
  );
  return dir;
}

beforeAll(async () => {
  owner = ownerDatabase();
  const pluginsPath = await mkdtemp(join(tmpdir(), 'cleitext-plugins-'));
  await installPlugin(owner.db, {
    source: await pluginSource(),
    pluginsPath,
    appRole: new URL(inject('appUrl')).username,
  });
  app = await startTestApp({ pluginsPath, env: { THEMES_PATH: await themesFolder() } });
  const site = await seedSite(owner, 'menu-item-fields');
  await seedUser(owner, {
    email: 'admin@menu-item-fields.test',
    password: PASSWORD,
    site,
    role: 'administrator',
  });
  admin = new TestClient(app, site.host, '10.38.0.1');
  visitor = new TestClient(app, site.host, '10.38.0.2');
  await admin.login('admin@menu-item-fields.test', PASSWORD);
  expect((await admin.post('/api/v1/themes/menu/activate')).statusCode).toBe(200);
  const created = await admin.request('POST', '/api/v1/menus', {
    name: 'Main',
    location: 'primary',
  });
  expect(created.statusCode).toBe(201);
  menuId = (created.json() as MenuView).id;
});

afterAll(async () => {
  await app?.close();
  await owner?.close();
});

interface PublicItem {
  label: string;
  data: Record<string, unknown> | null;
}

/** The primary menu as the theme gets it. */
async function publicMenu(): Promise<PublicItem[]> {
  const body = (await visitor.get('/')).body.replaceAll('&quot;', '"');
  const match = /MENU(.*?)END/s.exec(body);
  return JSON.parse(match![1]!) as PublicItem[];
}

const tree = (top: Record<string, unknown>, child: Record<string, unknown>, ids?: string[]) => ({
  items: [
    {
      ...(ids ? { id: ids[0] } : {}),
      kind: 'custom',
      label: 'Products',
      data: top,
      children: [
        {
          ...(ids ? { id: ids[1] } : {}),
          kind: 'url',
          url: 'https://example.com/a',
          label: 'Shoes',
          data: child,
        },
      ],
    },
  ],
});

const saveItems = (body: unknown) => admin.request('PUT', `/api/v1/menus/${menuId}/items`, body);

describe('menu item options', () => {
  it('are given with the active theme', async () => {
    const theme = (await admin.get('/api/v1/themes/current')).json() as ThemeInfo;
    expect(theme.menuItemFields.map((m) => m.field.name)).toEqual(['columns', 'icon']);
  });

  it('are validated on save: unknown keys dropped, invalid values refused', async () => {
    const bad = await saveItems(tree({ columns: 9 }, {}));
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ detail: expect.stringContaining('Products') });

    // "columns" is for first-level items only: on a sub-item it is unknown.
    const saved = await saveItems(
      tree({ columns: 3, icon: 'cart', stray: 1 }, { columns: 4, icon: 'shoe' }),
    );
    expect(saved.statusCode).toBe(200);
    const [top] = (saved.json() as MenuView).items;
    expect(top!.data).toEqual({ columns: 3, icon: 'cart' });
    expect(top!.children[0]!.data).toEqual({ icon: 'shoe' });
  });

  it('reach the theme per level, with defaults', async () => {
    expect(await publicMenu()).toEqual([
      { label: 'Products', data: { columns: 3, icon: 'cart' } },
      { label: 'Shoes', data: { icon: 'shoe' } },
    ]);
    await saveItems(tree({}, {}));
    expect(await publicMenu()).toEqual([
      { label: 'Products', data: { columns: 1 } },
      { label: 'Shoes', data: {} },
    ]);
  });

  it('include those of an active plugin extending the theme, kept while it is inactive', async () => {
    expect((await admin.post(`/api/v1/plugins/${PLUGIN}/activate`)).statusCode).toBeLessThan(300);
    const theme = (await admin.get('/api/v1/themes/current')).json() as ThemeInfo;
    // The clashing "icon" is ignored: the theme's own stays.
    expect(theme.menuItemFields.map((m) => [m.field.name, m.field.type])).toEqual([
      ['columns', 'number'],
      ['icon', 'text'],
      ['mega', 'boolean'],
    ]);
    const bad = await saveItems(tree({ mega: 'yes' }, {}));
    expect(bad.statusCode).toBe(400);
    const saved = await saveItems(tree({ mega: true, columns: 2 }, {}));
    expect(saved.statusCode).toBe(200);
    const view = saved.json() as MenuView;
    expect(view.items[0]!.data).toEqual({ mega: true, columns: 2 });
    expect(await publicMenu()).toEqual([
      { label: 'Products', data: { columns: 2, mega: true } },
      { label: 'Shoes', data: {} },
    ]);

    // Deactivated: the option disappears from the theme and the public menu…
    expect((await admin.post(`/api/v1/plugins/${PLUGIN}/deactivate`)).statusCode).toBeLessThan(300);
    const ids = [view.items[0]!.id, view.items[0]!.children[0]!.id];
    expect(await publicMenu()).toEqual([
      { label: 'Products', data: { columns: 2 } },
      { label: 'Shoes', data: {} },
    ]);
    // …but saving the menu meanwhile keeps its value, stored with the item.
    const again = await saveItems(tree({ columns: 5, mega: 'ignored' }, {}, ids));
    expect(again.statusCode).toBe(200);
    expect((again.json() as MenuView).items[0]!.data).toEqual({ mega: true, columns: 5 });

    await admin.post(`/api/v1/plugins/${PLUGIN}/activate`);
    expect(await publicMenu()).toEqual([
      { label: 'Products', data: { columns: 5, mega: true } },
      { label: 'Shoes', data: {} },
    ]);
  });
});
