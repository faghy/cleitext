/**
 * Fresco, wave 4 of the Elementor parity (Elementor 4's editor tools):
 * - the Class manager and the Variables manager (usage, duplicate, delete
 *   and restore, import of the global colors and fonts);
 * - components: created from an atomic element, edited in place with an
 *   overridable property, overridden by an instance, detached; drawn on the page;
 * - interactions: added in the editor, played on the page (load and scroll).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

async function signIn(page: Page) {
  await page.goto('/cl-admin/login');
  await page.locator('input[type="email"]').fill(ADMIN.email);
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
        headers: { 'x-csrf-token': token, 'content-type': 'application/json' },
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
const node = (
  id: string,
  type: string,
  attrs: Record<string, unknown>,
  children?: Node[],
): Node => ({
  id,
  type: `fresco/${type}`,
  v: 1,
  attrs,
  ...(children ? { children } : {}),
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

async function openEditor(page: Page, id: string, first: string): Promise<Frame> {
  await page.goto(`/cl-admin/entries/${id}`);
  await expect(page.locator('.fre-root--full .fre-bar')).toBeVisible();
  await expect(page.frameLocator('.fre-iframe').locator(`[data-fr-id="${first}"]`)).toBeVisible();
  const frame = page.frames().find((f) => f.url().includes('/__preview/'));
  if (!frame) throw new Error('No canvas frame');
  return frame;
}

/** Opens a panel of Site settings from the Finder. */
async function siteSettings(page: Page, name: RegExp) {
  await page.keyboard.press('ControlOrMeta+e');
  await page.locator('.fre-finder input').fill(name.source.split('|')[0]!);
  await page.locator('.fre-finder__item', { hasText: name }).first().click();
  await expect(page.locator('.fre-site__back')).toHaveText(name);
}

/** The kit as it was, put back after each test (it is the site's). */
let savedKit: unknown = null;

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await signIn(page);
  await api(page, 'POST', '/plugins/fresco/deactivate', {}).catch(() => undefined);
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await activateFresco(page);
  savedKit = await api(page, 'GET', '/ext/fresco/kit');
});

test.afterEach(async ({ page }) => {
  if (savedKit) await api(page, 'PUT', '/ext/fresco/kit', savedKit).catch(() => undefined);
});

test('class manager and variables manager', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const kit = savedKit as { classes: unknown[]; variables: unknown[] };
  await api(page, 'PUT', '/ext/fresco/kit', {
    ...kit,
    classes: [
      ...kit.classes,
      {
        id: `w4-low-${stamp}`,
        label: `Low ${stamp}`,
        variants: [{ device: 'desktop', state: '', props: { color: '#00ff00' } }],
      },
      {
        id: `w4-high-${stamp}`,
        label: `High ${stamp}`,
        variants: [{ device: 'desktop', state: '', props: { color: 'var(--fr-v-w4-brand)' } }],
      },
    ],
    variables: [
      ...kit.variables.filter((v) => (v as { id: string }).id !== 'w4-brand'),
      { id: 'w4-brand', label: `Brand ${stamp}`, type: 'color', value: '#ff0000' },
    ],
  });
  const id = await createPage(page, `Fresco classes ${stamp}`, [
    node('box', 'a-div', {}, [
      node('h', 'a-heading', {
        title: 'Classy',
        _classes: [`w4-low-${stamp}`, `w4-high-${stamp}`],
      }),
    ]),
  ]);
  const frame = await openEditor(page, id, 'h');
  // The class higher in priority (the last in the kit) wins: the variable's red.
  expect(
    await frame.evaluate(() => getComputedStyle(document.querySelector('[data-fr-id="h"]')!).color),
  ).toBe('rgb(255, 0, 0)');

  // Class manager: the strongest class first, with how many elements use it.
  await siteSettings(page, /Class manager|Gestione classi/);
  const rows = page.locator('.fre-classmanager .fre-dsrow');
  const high = rows.filter({ has: page.locator(`input[value="High ${stamp}"]`) });
  const low = rows.filter({ has: page.locator(`input[value="Low ${stamp}"]`) });
  await expect(rows.first().locator('input')).toHaveValue(`High ${stamp}`);
  await expect(high.locator('.fre-dsusage')).toHaveText('1');
  // Lower its priority with the keyboard: the other class wins in the canvas.
  await high.locator('.fre-draghandle').focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.first().locator('input')).toHaveValue(`Low ${stamp}`);
  await expect
    .poll(() =>
      frame.evaluate(() => getComputedStyle(document.querySelector('[data-fr-id="h"]')!).color),
    )
    .toBe('rgb(0, 255, 0)');
  // Duplicate, then delete the copy (nobody uses it).
  await low.locator('button', { hasText: '⧉' }).click();
  const copy = rows.filter({
    has: page.locator(`input[value="Low ${stamp} copy"], input[value="Low ${stamp} copia"]`),
  });
  await expect(copy).toHaveCount(1);
  await copy.locator('button', { hasText: '×' }).click();
  await expect(page.locator('.fre-dialog')).toContainText(
    /No element uses it|Nessun elemento la usa/,
  );
  await page.locator('.fre-dialog .fre-button--primary').click();
  await expect(copy).toHaveCount(0);

  // Variables manager: usage, soft delete and restore, import of the kit's colors and fonts.
  await page.keyboard.press('Escape');
  await siteSettings(page, /Variables manager|Gestione variabili/);
  const brand = page
    .locator('.fre-varmanager .fre-dsrow')
    .filter({ has: page.locator(`input[value="Brand ${stamp}"]`) });
  await expect(brand.locator('.fre-dsusage')).toHaveText('1');
  await brand.locator('button', { hasText: '×' }).click();
  await expect(page.locator('.fre-dialog')).toContainText(/1/);
  await page.locator('.fre-dialog .fre-button--primary').click();
  await expect(brand).toHaveCount(0);
  const deleted = page.locator('.fre-dsrow.is-deleted', { hasText: `Brand ${stamp}` });
  await expect(deleted).toHaveCount(1);
  // Deleted, it still styles the elements that use it.
  expect(
    await frame.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--fr-v-w4-brand'),
    ),
  ).toContain('#ff0000');
  await deleted.locator('button').click();
  await expect(brand).toHaveCount(1);
  const before = await page.locator('.fre-varmanager .fre-dsrow:not(.is-deleted)').count();
  const importButton = page.locator('.fre-varmanager button', {
    hasText: /Import global colors and fonts|Importa colori e font globali/,
  });
  if (await importButton.isEnabled()) {
    await importButton.click();
    expect(
      await page.locator('.fre-varmanager .fre-dsrow:not(.is-deleted)').count(),
    ).toBeGreaterThan(before);
    await expect(importButton).toBeDisabled();
  }

  expect(appErrors(errors)).toEqual([]);
});

test('components: create, edit in place, override, detach, on the page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const id = await createPage(page, `Fresco components ${stamp}`, [
    node('wrap', 'container', {}, [node('card', 'a-heading', { title: `Card ${stamp}` })]),
  ]);
  await openEditor(page, id, 'card');
  const canvas = page.frameLocator('.fre-iframe');

  // Create component: the heading becomes the first instance of a new component.
  await canvas.locator('[data-fr-id="card"]').click({ button: 'right' });
  await page
    .locator('.fre-menu button', { hasText: /^(Create component|Crea componente)$/ })
    .click();
  await page.locator('.fre-dialog input').fill(`Card ${stamp}`);
  await page.locator('.fre-dialog .fre-button--primary').click();
  await expect(canvas.locator('[data-fr-id="card"]')).toHaveCount(0);
  const instance = canvas.locator('.fr-a-heading', { hasText: `Card ${stamp}` });
  await expect(instance).toHaveCount(1);
  const instanceId = (await instance.getAttribute('data-fr-id'))!;
  const components = await api<{ id: string; title: string }[]>(
    page,
    'GET',
    '/ext/fresco/components',
  );
  const component = components.find((c) => c.title === `Card ${stamp}`)!;
  expect(component).toBeTruthy();

  // Edit component: its heading is editable; its title becomes overridable.
  await instance.click({ button: 'right' });
  await page
    .locator('.fre-menu button', { hasText: /^(Edit component|Modifica componente)$/ })
    .click();
  await expect(page.locator('.fre-globalbar')).toBeVisible();
  await canvas.locator('.fr-a-heading', { hasText: `Card ${stamp}` }).click();
  const props = page.locator('.fre-compprops');
  await expect(props).toBeVisible();
  await props.locator('input[type=checkbox]').first().check();
  await page.locator('.fre-globalbar .fre-button--primary').click();
  await expect(page.locator('.fre-globalbar')).toHaveCount(0);
  await expect
    .poll(async () => {
      const list = await api<{ id: string; props: unknown[] }[]>(
        page,
        'GET',
        '/ext/fresco/components',
      );
      return list.find((c) => c.id === component.id)?.props.length;
    })
    .toBe(1);

  // The instance overrides the title.
  await canvas.locator(`[data-fr-id="${instanceId}"]`).click();
  const field = page.locator('.fre-component-panel textarea, .fre-component-panel input').first();
  await field.fill(`Mine ${stamp}`);
  await expect(canvas.locator(`[data-fr-id="${instanceId}"]`)).toHaveText(`Mine ${stamp}`);

  // On the page: the component's element, with the instance's id and its override.
  const published = await createPage(
    page,
    `Fresco instances ${stamp}`,
    [
      node('c', 'container', {}, [
        node('i1', 'component', { component: component.id }),
        node('i2', 'component', {
          component: component.id,
          overrides: { title: `Other ${stamp}` },
        }),
      ]),
    ],
    'published',
  );
  const { url } = await api<{ url: string }>(page, 'GET', `/ext/fresco/entry-link?id=${published}`);
  const html = await page.evaluate(async (u) => (await fetch(u)).text(), url);
  expect(html).toContain(`fr-e fr-e-i1 fr-a fr-a-heading`);
  expect(html).toContain(`>Card ${stamp}<`);
  expect(html).toContain(`>Other ${stamp}<`);

  // Detach: the instance becomes a heading of its own, keeping its override.
  await canvas.locator(`[data-fr-id="${instanceId}"]`).click({ button: 'right' });
  await page.locator('.fre-menu button', { hasText: /^(Detach|Scollega)$/ }).click();
  await expect(canvas.locator(`[data-fr-id="${instanceId}"]`)).toHaveCount(0);
  await expect(canvas.locator('.fr-a-heading', { hasText: `Mine ${stamp}` })).toHaveCount(1);

  await api(page, 'DELETE', `/ext/fresco/components/${component.id}`, {});
  expect(appErrors(errors)).toEqual([]);
});

test('interactions: added in the editor, played on the page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const id = await createPage(page, `Fresco interactions ${stamp}`, [
    node('w', 'container', {}, [node('h', 'a-heading', { title: 'Moving' })]),
  ]);
  await openEditor(page, id, 'h');
  const canvas = page.frameLocator('.fre-iframe');
  await canvas.locator('[data-fr-id="h"]').click();
  await page.locator('.fre-tabs button', { hasText: /^(Interactions|Interazioni)$/ }).click();
  await page.locator('.fre-ia > .fre-button').click();
  await expect(page.locator('.fre-ia__item')).toHaveCount(1);
  await page.locator('.fre-ia__item select').nth(1).selectOption('slide');
  await expect(page.locator('.fre-ia__item select').nth(3)).toHaveValue('bottom');

  // On the page: one plays on load, one when it scrolls into view.
  const published = await createPage(
    page,
    `Fresco interactions page ${stamp}`,
    [
      node('c', 'container', {}, [
        node('now', 'a-heading', {
          title: 'At once',
          _interactions: [{ trigger: 'load', effect: 'fade', duration: 100 }],
        }),
        node('gap', 'a-div', {
          _styles: [
            { device: 'desktop', state: '', props: { height: { size: 2500, unit: 'px' } } },
          ],
        }),
        node('later', 'a-heading', {
          title: 'Later',
          _interactions: [
            { trigger: 'scrollIn', effect: 'slide', direction: 'left', duration: 100 },
          ],
        }),
      ]),
    ],
    'published',
  );
  const { url } = await api<{ url: string }>(page, 'GET', `/ext/fresco/entry-link?id=${published}`);
  // In a tab of its own: the editor keeps its unsaved change.
  const front = await page.context().newPage();
  front.on('pageerror', (e) => errors.push(e.message));
  await front.goto(url);
  const now = front.locator('.fr-e-now');
  const later = front.locator('.fr-e-later');
  await expect(now).not.toHaveAttribute('data-fr-ia-wait', '');
  await expect(now).toBeVisible();
  // Waiting hidden below the fold, then shown once scrolled to.
  await expect(later).toHaveAttribute('data-fr-ia-wait', '');
  expect(await later.evaluate((e) => getComputedStyle(e).visibility)).toBe('hidden');
  await later.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(later).not.toHaveAttribute('data-fr-ia-wait', '');
  await expect.poll(() => later.evaluate((e) => getComputedStyle(e).visibility)).toBe('visible');
  await front.close();

  expect(appErrors(errors)).toEqual([]);
});
