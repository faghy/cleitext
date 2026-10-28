/**
 * Fresco, wave 3 of the Elementor parity:
 * - Templates: search, preview, rename, delete, export and import of a file;
 * - image files dropped from the desktop onto the canvas (new Image elements,
 *   or the picture of an Image element replaced);
 * - the free Floating buttons and Link in bio, in the editor and on the page;
 * - the Element manager (an element switched off leaves the panel) and Safe mode.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

async function signIn(page: Page) {
  await page.goto('/cl-admin/login');
  await page.locator('input[autocomplete="username"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/cl-admin/');
}

function api<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const { token } = (await (await fetch('/api/v1/auth/csrf')).json()) as { token: string };
      const res = await fetch(`/api/v1${path}`, {
        method,
        // A JSON content type only with a body: the server refuses an empty one.
        headers: {
          'x-csrf-token': token,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
    },
    { method, path, body },
  );
}

async function activateFresco(page: Page) {
  try {
    await api(page, 'POST', '/plugins/fresco/activate', {});
  } catch {
    execFileSync(
      'node',
      [
        '--env-file-if-exists=.env',
        'packages/cli/dist/bin.js',
        'plugin:install',
        'plugins/fresco',
        '--build',
      ],
      { cwd: root, stdio: 'pipe' },
    );
    await api(page, 'POST', '/plugins/fresco/activate', {});
  }
}

interface Node {
  id: string;
  type: string;
  v: 1;
  attrs: Record<string, unknown>;
  children?: Node[];
}
const container = (id: string, children: Node[] = []): Node => ({
  id,
  type: 'fresco/container',
  v: 1,
  attrs: {},
  children,
});
const heading = (id: string, title: string): Node => ({
  id,
  type: 'fresco/heading',
  v: 1,
  attrs: { title },
});

async function createPage(
  page: Page,
  title: string,
  blocks: Node[],
  status?: 'published',
): Promise<string> {
  const entry = await api<{ id: string }>(page, 'POST', '/entries', {
    type: 'page',
    title,
    document: { schema: 1, blocks, editor: { id: 'fresco' } },
  });
  if (status === 'published') await api(page, 'POST', `/entries/${entry.id}/publish`, {});
  return entry.id;
}

async function openEditor(page: Page, id: string, first: string, hash = ''): Promise<Frame> {
  await page.goto(`/cl-admin/entries/${id}${hash}`);
  await expect(page.locator('.fre-root--full .fre-bar')).toBeVisible();
  const canvas = page.frameLocator('.fre-iframe');
  await expect(canvas.locator(`[data-fr-id="${first}"]`)).toBeVisible();
  const frame = page.frames().find((f) => f.url().includes('/__preview/'));
  if (!frame) throw new Error('No canvas frame');
  return frame;
}

/**
 * Drops image files from "the desktop" at an element of the canvas (a real
 * drag of files cannot be scripted). Each file is a picture of its own color:
 * the media library keeps one copy of identical files.
 */
async function dropFiles(frame: Frame, selector: string, names: string[]) {
  await frame.evaluate(
    async ({ selector, names }) => {
      const target = document.querySelector<HTMLElement>(selector)!;
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = target.getBoundingClientRect();
      const data = new DataTransfer();
      for (const [i, name] of names.entries()) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 40;
        const paint = canvas.getContext('2d')!;
        paint.fillStyle = `hsl(${(Date.now() + i * 97) % 360} 70% 50%)`;
        paint.fillRect(0, 0, 40, 40);
        paint.fillText(name, 2, 20);
        const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'));
        data.items.add(new File([blob], name, { type: 'image/png' }));
      }
      const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      const hit = document.elementFromPoint(at.clientX, at.clientY) ?? target;
      for (const type of ['dragenter', 'dragover', 'drop']) {
        hit.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data, ...at }),
        );
      }
    },
    { selector, names },
  );
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await signIn(page);
  await api(page, 'PUT', '/ext/fresco/element-manager', { disabled: [] }).catch(() => undefined);
  await api(page, 'POST', '/plugins/fresco/deactivate', {}).catch(() => undefined);
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await activateFresco(page);
});

test('templates: search, preview, rename, export and import', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const names = [`Hero ${stamp}`, `Pricing ${stamp}`];
  for (const [i, title] of names.entries()) {
    await api(page, 'POST', '/patterns', {
      title,
      synced: false,
      document: {
        schema: 1,
        blocks: [container(`t${i}`, [heading(`th${i}`, `${title} heading`)])],
        editor: { id: 'fresco', data: { kind: 'section' } },
      },
    });
  }
  const id = await createPage(page, `Fresco library ${stamp}`, [
    container('w', [heading('h', 'Page')]),
  ]);
  await openEditor(page, id, 'h');
  await page.keyboard.press('ControlOrMeta+Shift+l');
  const library = page.locator('.fre-library');
  await expect(library.locator('.fre-library__item', { hasText: names[0]! })).toHaveCount(1);

  // Search: only the templates with the words typed.
  await library.locator('.fre-library__search input').fill(`pricing ${stamp}`);
  await expect(library.locator('.fre-library__item')).toHaveCount(1);
  await expect(library.locator('.fre-library__item')).toContainText(names[1]!);

  // Preview: the template drawn in a frame, at the width of a phone too.
  await library
    .locator('.fre-library__item')
    .getByRole('button', { name: /Preview|Anteprima/ })
    .click();
  const preview = page.locator('.fre-preview');
  await expect(preview).toBeVisible();
  await expect(
    page
      .frameLocator('.fre-preview iframe')
      .locator('.fr-heading', { hasText: `${names[1]} heading` }),
  ).toBeVisible();
  await preview.getByRole('button', { name: /^(Mobile)$/ }).click();
  await expect(preview.locator('iframe')).toHaveAttribute('style', /390px/);
  await preview.getByRole('button', { name: /^(Insert|Inserisci)$/ }).click();
  await expect(preview).toHaveCount(0);
  await expect(
    page.frameLocator('.fre-iframe').locator('.fr-heading', { hasText: `${names[1]} heading` }),
  ).toHaveCount(1);

  // Rename.
  await library
    .locator('.fre-library__item')
    .getByRole('button', { name: /Rename|Rinomina/ })
    .click();
  await page.locator('.fre-dialog input').fill(`Prices ${stamp}`);
  await page.locator('.fre-dialog input').press('Enter');
  await library.locator('.fre-library__search input').fill(`prices ${stamp}`);
  await expect(library.locator('.fre-library__item')).toContainText(`Prices ${stamp}`);

  // Export to a file, then import it again as another template.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    library
      .locator('.fre-library__item')
      .getByRole('button', { name: /Export|Esporta/ })
      .click(),
  ]);
  const path = await download.path();
  expect(download.suggestedFilename()).toMatch(/\.fresco\.json$/);
  await library.locator('input[type=file]').setInputFiles(path!);
  await expect(library.locator('.fre-library__item')).toHaveCount(2);

  // Delete one of the two.
  await library
    .locator('.fre-library__item')
    .first()
    .getByRole('button', { name: /Delete|Elimina/ })
    .click();
  await page.locator('.fre-dialog .fre-button--danger').click();
  await expect(library.locator('.fre-library__item')).toHaveCount(1);

  // The same search in Fresco → Templates.
  await page.goto('/cl-admin/ext/fresco/templates');
  await page.locator('input[type=search]').fill(`prices ${stamp}`);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: /^(Preview|Anteprima)$/ }).click();
  await expect(
    page
      .frameLocator('.fre-preview iframe')
      .locator('.fr-heading', { hasText: `${names[1]} heading` }),
  ).toBeVisible();

  expect(appErrors(errors)).toEqual([]);
});

test('images dropped from the desktop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const id = await createPage(page, `Fresco drop ${stamp}`, [
    container('w', [heading('h', 'Drop here')]),
  ]);
  const frame = await openEditor(page, id, 'h');
  const canvas = page.frameLocator('.fre-iframe');

  // Two files dropped on the heading: two Image elements next to it.
  await dropFiles(frame, '[data-fr-id="h"]', [`a-${stamp}.png`, `b-${stamp}.png`]);
  const images = canvas.locator('[data-fr-id="w"] .fr-image img');
  await expect(images).toHaveCount(2);
  const first = await images.first().getAttribute('src');
  expect(first).toMatch(/\/media\//);

  // One dropped on an Image element replaces its picture.
  await dropFiles(frame, '[data-fr-id="w"] .fr-image', [`c-${stamp}.png`]);
  await expect(images).toHaveCount(2);
  await expect.poll(() => images.first().getAttribute('src')).not.toBe(first);

  // Other files are refused.
  await frame.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    const target = document.querySelector('[data-fr-id="h"]')!;
    for (const type of ['dragover', 'drop'])
      target.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }),
      );
  });
  await expect(page.locator('.fre-toast--error')).toContainText(/Only images|solo immagini/);
  await expect(images).toHaveCount(2);

  expect(appErrors(errors)).toEqual([]);
});

test('floating buttons and link in bio, free', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const id = await createPage(page, `Fresco contact ${stamp}`, [
    container('w', [heading('h', 'Contacts')]),
  ]);
  await openEditor(page, id, 'h');
  const canvas = page.frameLocator('.fre-iframe');
  for (const [search, selector] of [
    [/Floating buttons|Pulsanti flottanti/, '.fr-fab'],
    [/Link in bio/, '.fr-bio'],
  ] as const) {
    await page.locator('.fre-searchbox input').first().fill(search.source.split('|')[0]!);
    await page.locator('.fre-tile', { hasText: search }).first().click();
    await expect(canvas.locator(selector)).toHaveCount(1);
    // Back to the elements (nothing selected).
    await page.keyboard.press('Escape');
    await expect(page.locator('.fre-searchbox input').first()).toBeVisible();
  }
  // In the editor the buttons stay in the page, where they can be selected.
  await expect(canvas.locator('.fr-fab')).toHaveClass(/fr-fab--editing/);

  // On the page: fixed to the window; the chat box opens from its button.
  const published = await createPage(
    page,
    `Fresco chat ${stamp}`,
    [
      container('c', [
        {
          id: 'fab',
          type: 'fresco/floating-buttons',
          v: 1,
          attrs: { mode: 'chat', chat_name: 'Ada', chat_message: 'Hello!' },
        },
        { id: 'bio', type: 'fresco/link-in-bio', v: 1, attrs: { name: 'Ada Lovelace' } },
      ]),
    ],
    'published',
  );
  const { url } = await api<{ url: string }>(page, 'GET', `/ext/fresco/entry-link?id=${published}`);
  await page.goto(url);
  const fab = page.locator('.fr-fab');
  await expect(fab).toBeVisible();
  expect(await fab.evaluate((e) => getComputedStyle(e).position)).toBe('fixed');
  await expect(page.locator('.fr-bio__name')).toHaveText('Ada Lovelace');
  await expect(page.locator('.fr-fab__chat')).toBeHidden();
  await page.locator('.fr-fab__toggle').click();
  await expect(page.locator('.fr-fab__chat')).toBeVisible();
  await expect(page.locator('.fr-fab__bubble')).toHaveText('Hello!');
  await page.keyboard.press('Escape');
  await expect(page.locator('.fr-fab__chat')).toBeHidden();

  expect(appErrors(errors)).toEqual([]);
});

test('element manager and safe mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const id = await createPage(page, `Fresco manager ${stamp}`, [
    container('w', [heading('h', 'Manager'), { id: 'n', type: 'fresco/counter', v: 1, attrs: {} }]),
  ]);

  // Fresco → Element manager: switch the Counter off, with its usage counted.
  await page.goto('/cl-admin/ext/fresco/element-manager');
  const row = page.locator('tr[data-type="fresco/counter"]');
  await expect(row).toHaveCount(1);
  await page.getByRole('button', { name: /Count the usage|Conta l’utilizzo/ }).click();
  await expect(row).toContainText(/\d+ in \d+/);
  await expect(
    page.locator('tr[data-type="fresco/container"] input[type=checkbox]'),
  ).toBeDisabled();
  await row.locator('input[type=checkbox]').uncheck();
  await page.getByRole('button', { name: /Save changes|Salva le modifiche/ }).click();
  await expect(page.locator('.fre-toast--success')).toBeVisible();

  // The editor's panel no longer offers it; the page keeps showing it.
  await openEditor(page, id, 'h');
  await expect(page.frameLocator('.fre-iframe').locator('[data-fr-id="n"]')).toBeVisible();
  await page.locator('.fre-searchbox input').first().fill('Count');
  await expect(page.locator('.fre-tile', { hasText: /^(Counter|Contatore)$/ })).toHaveCount(0);

  // Safe mode: the theme's styles are off in the canvas, until left.
  await page.goto('/cl-admin/');
  const frame = await openEditor(page, id, 'h', '#fresco-safe');
  await expect(page.locator('.fre-safebar')).toBeVisible();
  expect(
    await frame.evaluate(() => document.querySelectorAll('[data-fre-safe-off]').length),
  ).toBeGreaterThan(0);
  await expect
    .poll(() => frame.evaluate(() => document.querySelectorAll('.fr-e').length))
    .toBeGreaterThan(0);
  await page.locator('.fre-safebar button').click();
  await expect(page.locator('.fre-root--full .fre-bar')).toBeVisible();
  await expect(page.locator('.fre-safebar')).toHaveCount(0);

  expect(appErrors(errors)).toEqual([]);
});
