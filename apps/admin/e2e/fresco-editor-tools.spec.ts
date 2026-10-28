/**
 * Fresco's editor, wave 2 of the Elementor parity:
 * - Site settings: a panel opened from the Finder, Esc back to the menu,
 *   button styles live in the canvas;
 * - Elementor's structures, with 10px of padding on new columns;
 * - User preferences (Ctrl+Shift+U): the dark theme;
 * - elements pasted from the system clipboard (as from another site);
 * - the Structure window with the keyboard and its right-click menu;
 * - "Add new container" in the right-click menu, History naming the setting;
 * - the canvas loads the Google font an element uses.
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
      return (await res.json()) as T;
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
const container = (id: string, attrs: Record<string, unknown>, children: Node[] = []): Node => ({
  id,
  type: 'fresco/container',
  v: 1,
  attrs,
  children,
});

async function openPage(page: Page, title: string, blocks: Node[]): Promise<Frame> {
  const entry = await api<{ id: string }>(page, 'POST', '/entries', {
    type: 'page',
    title,
    document: { schema: 1, blocks, editor: { id: 'fresco' } },
  });
  await page.goto(`/cl-admin/entries/${entry.id}`);
  await expect(page.locator('.fre-root--full .fre-bar')).toBeVisible();
  const canvas = page.frameLocator('.fre-iframe');
  await expect(canvas.locator(`[data-fr-id="${blocks[0]!.id}"]`)).toBeVisible();
  const frame = page.frames().find((f) => f.url().includes('/__preview/'));
  if (!frame) throw new Error('No canvas frame');
  return frame;
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await signIn(page);
  // The preferences stay as other tests expect them (light theme).
  await api(page, 'PUT', '/ext/fresco/preferences', {}).catch(() => undefined);
  await api(page, 'POST', '/plugins/fresco/deactivate', {}).catch(() => undefined);
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await activateFresco(page);
});

test('site settings, structures and preferences', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  let frame = await openPage(page, `Fresco kit ${stamp}`, [
    container('w', {}, [
      {
        id: 'btn',
        type: 'fresco/button',
        v: 1,
        attrs: { text: 'Go', typography_family: 'Lobster' },
      },
    ]),
  ]);
  const canvas = page.frameLocator('.fre-iframe');

  // The Google font of the button is loaded in the canvas. Fonts hosted on the
  // site need the server to reach Google (covered by fresco-fonts.test.ts with
  // a fake Google): here the site loads them from Google, its other choice.
  const kit = await api<Record<string, unknown>>(page, 'GET', '/ext/fresco/kit');
  await api(page, 'PUT', '/ext/fresco/kit', { ...kit, googleFontsMode: 'google' });
  try {
    await page.reload();
    await expect(
      page.frameLocator('.fre-iframe').locator('link[data-fre-font][href*="family=Lobster"]'),
    ).toHaveCount(1);
  } finally {
    await api(page, 'PUT', '/ext/fresco/kit', kit);
  }
  // The editor again with the site's own settings.
  await page.reload();
  await expect(canvas.locator('[data-fr-id="btn"]')).toBeVisible();
  frame = page.frames().find((f) => f.url().includes('/__preview/'))!;

  // The Finder opens a panel of Site settings; Esc goes back to the menu.
  await page.keyboard.press('ControlOrMeta+e');
  await page.locator('.fre-finder input').fill('Buttons');
  await page
    .locator('.fre-finder__item', { hasText: /^(Buttons|Pulsanti)/ })
    .first()
    .click();
  await expect(page.locator('.fre-site__back')).toHaveText(/Buttons|Pulsanti/);
  // A button style shows at once in the canvas.
  const radius = page
    .locator('.fre-control', {
      has: page.locator('.fre-control__label', { hasText: /^(Border radius|Raggio del bordo)$/ }),
    })
    .first()
    .locator('input[type=number]');
  await radius.fill('9');
  await expect
    .poll(() =>
      frame.evaluate(
        () =>
          getComputedStyle(document.querySelector('[data-fr-id="btn"] .fr-button__link')!)
            .borderTopLeftRadius,
      ),
    )
    .toBe('9px');
  await page.keyboard.press('Escape');
  await expect(page.locator('.fre-site--menu')).toBeVisible();

  // Layout: the container padding of the site, live in the canvas.
  await page.locator('.fre-sitemenu button', { hasText: /^(Layout)$/ }).click();
  const padding = page.locator('.fre-control', {
    has: page.locator('.fre-control__label', { hasText: /Container padding|Spaziatura interna/ }),
  });
  for (const input of await padding.locator('input[type=number]').all()) await input.fill('24');
  await expect
    .poll(() =>
      frame.evaluate(
        () => getComputedStyle(document.querySelector('[data-fr-id="w"]')!).paddingTop,
      ),
    )
    .toBe('24px');

  // Elementor's structures: 50% + 50% + 100%, columns with 10px of padding.
  await page.keyboard.press('Escape');
  await canvas.locator('.fre-add__round--add').last().click();
  await canvas.locator('.fre-add__kinds button').first().click();
  await expect(canvas.locator('.fre-add__preset')).toHaveCount(15);
  await canvas.locator('[data-preset="50-50-100"]').click();
  const row = canvas.locator('.fre-tree > .fr-container').last();
  await expect(row.locator(':scope > .fr-container__in > .fr-container')).toHaveCount(3);
  expect(
    await row
      .locator(':scope > .fr-container__in > .fr-container')
      .first()
      .evaluate((e) => getComputedStyle(e).paddingLeft),
  ).toBe('10px');

  // User preferences: the dark theme, back to light.
  await page.keyboard.press('ControlOrMeta+Shift+u');
  await expect(page.locator('.fre-prefs')).toBeVisible();
  await page.locator('.fre-prefs .fre-choose button').nth(2).click();
  await expect(page.locator('.fre-root--dark')).toHaveCount(1);
  await page.locator('.fre-prefs .fre-choose button').nth(1).click();
  await expect(page.locator('.fre-root--dark')).toHaveCount(0);

  expect(appErrors(errors)).toEqual([]);
});

test('clipboard, structure window, menu and history', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  await openPage(page, `Fresco tools ${stamp}`, [
    container('a', {}, [
      { id: 'h1', type: 'fresco/heading', v: 1, attrs: { title: 'First', _hide_mobile: true } },
      { id: 'h2', type: 'fresco/heading', v: 1, attrs: { title: 'Second' } },
    ]),
  ]);
  const canvas = page.frameLocator('.fre-iframe');

  // Elements copied on another site arrive through the clipboard ("Paste from
  // other site": the browser may not let the page read it, then they are pasted in a box).
  const copied = JSON.stringify({
    'cleitext/fresco': 1,
    origin: 'https://other.example',
    nodes: [{ id: 'x1', type: 'fresco/heading', v: 1, attrs: { title: 'From another site' } }],
  });
  await canvas.locator('[data-fr-id="h2"]').click({ button: 'right' });
  await page
    .locator('.fre-menu button', { hasText: /Paste from other site|Incolla da un altro sito/ })
    .click();
  const box = page.locator('.fre-dialog input');
  if (await box.isVisible({ timeout: 3000 }).catch(() => false)) {
    await box.fill(copied);
    await box.press('Enter');
  }
  await expect(canvas.locator('.fr-heading', { hasText: 'From another site' })).toHaveCount(1);

  // The Structure window: signs, the keyboard, and the right-click menu.
  await page.keyboard.press('ControlOrMeta+i');
  const rows = page.locator('.fre-navw__row');
  await expect(page.locator('[data-nav-id="h1"] .fre-navw__sign--hidden')).toHaveCount(1);
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.fre-navw__row.is-on')).toHaveCount(1);
  await expect(page.locator('.fre-navw__row:focus')).toHaveCount(1);
  await rows.first().click({ button: 'right' });
  await expect(page.locator('.fre-menu')).toBeVisible();

  // Add new container: inside the top-level one.
  await page
    .locator('.fre-menu button', { hasText: /Add new container|Aggiungi nuovo contenitore/ })
    .click();
  await expect(canvas.locator('[data-fr-id="a"] .fr-container')).toHaveCount(1);

  // History names the setting changed.
  await canvas.locator('[data-fr-id="h1"]').click({ position: { x: 2, y: 2 } });
  const title = page.locator('.fre-panel textarea, .fre-panel input.fre-input').first();
  await title.fill('Changed');
  await page.keyboard.press('ControlOrMeta+Shift+h');
  await expect(page.locator('.fre-history__item').first()).toContainText(/: (Title|Titolo)/);

  expect(appErrors(errors)).toEqual([]);
});
