/**
 * Fresco's live editor, as a user works in it:
 * - the canvas lays the page out as the site does (the theme's content width);
 * - drag and drop lands where the line shows, also after a diagonal path
 *   across other sections: the page never moves while dragging;
 * - texts are typed in place in every element with a main text (icon boxes,
 *   lists, tabs…), the panel follows the typing, and the element stays the
 *   one the panel edits;
 * - elements hidden on a device stay in the canvas, faded, with a badge;
 * - Ctrl+Shift+M goes through every device.
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
      return (await res.json()) as T;
    },
    { method, path, body },
  );
}

/** Fresco active (installed first where it is not, as a site owner does). */
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
const column = (id: string, children: Node[] = []) =>
  container(id, { width: { size: 33.33, unit: '%' } }, children);

/** A Fresco page opened in the editor; returns the canvas frame. */
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

type Box = { x: number; y: number; width: number; height: number };

/** An element's box in the canvas window. */
function boxIn(frame: Frame, selector: string): Promise<Box> {
  return frame.evaluate((selector) => {
    const r = document.querySelector(selector)!.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }, selector);
}

/**
 * Drags a tile of the panel to the middle of an element of the canvas, in
 * small steps along a straight (often diagonal) line; returns the target's
 * box measured just before the release.
 */
async function dragTile(page: Page, frame: Frame, tile: RegExp, target: string): Promise<Box> {
  const back = page.locator('.fre-panel__headbtn');
  if (await back.count()) await back.click();
  const source = page.locator('.fre-tile').filter({ hasText: tile }).first();
  await source.scrollIntoViewIfNeeded();
  const from = (await source.boundingBox())!;
  const frameBox = (await page.locator('.fre-iframe').boundingBox())!;
  const to = await boxIn(frame, target);
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: frameBox.x + to.x + to.width / 2, y: frameBox.y + to.y + to.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      start.x + ((end.x - start.x) * i) / steps,
      start.y + ((end.y - start.y) * i) / steps,
    );
  }
  await expect(page.frameLocator('.fre-iframe').locator('.fre-dropline')).toBeVisible();
  const before = await boxIn(frame, target);
  await page.mouse.up();
  expect(before).toEqual(to);
  return before;
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await activateFresco(page);
});

test('the canvas has the site layout, and drops land where the line shows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const frame = await openPage(page, `Fresco drag ${stamp}`, [
    container('hero', { min_height: { size: 420, unit: 'px' } }, [
      { id: 'hh', type: 'fresco/heading', v: 1, attrs: { title: 'Hero' } },
    ]),
    container('row', { flex_direction: 'row' }, [column('c1'), column('c2'), column('c3')]),
    container('sec2', {}),
  ]);

  // As on the site: the top-level container spans the theme's content
  // column, not a narrower box made by the editor's wrappers.
  const content = await frame.evaluate(() => {
    const element = document.querySelector('[data-fr-id="row"]')!;
    const holder = document.querySelector('[data-fre-content]')!;
    return {
      row: element.getBoundingClientRect().width,
      holder: holder.getBoundingClientRect().width,
    };
  });
  expect(content.row).toBe(content.holder);

  // Three Icon boxes, dragged diagonally across the hero into the middle of each column.
  for (const target of ['c2', 'c1', 'c3']) {
    await dragTile(page, frame, /^(Icon box|Box con icona)$/, `[data-fr-id="${target}"]`);
    await expect(
      page.frameLocator('.fre-iframe').locator(`[data-fr-id="${target}"] .fr-icon-box`),
    ).toHaveCount(1);
  }
  // Nothing went to the top level or into the hero.
  const canvas = page.frameLocator('.fre-iframe');
  await expect(canvas.locator('.fre-tree > .fr-container')).toHaveCount(3);
  await expect(canvas.locator('[data-fr-id="hero"] .fr-icon-box')).toHaveCount(0);

  // An Image carousel into the empty section below (scrolled into view).
  await frame.evaluate(() =>
    document.querySelector('[data-fr-id="sec2"]')!.scrollIntoView({ block: 'center' }),
  );
  await dragTile(page, frame, /^(Image carousel|Carosello di immagini)$/, '[data-fr-id="sec2"]');
  await expect(canvas.locator('[data-fr-id="sec2"] .fr-image-carousel')).toHaveCount(1);
  await expect(canvas.locator('[data-fr-id="row"] .fr-image-carousel')).toHaveCount(0);

  // An element moved by its handle, from the first column to the third, below its box.
  await frame.evaluate(() => window.scrollTo(0, 0));
  const moved = canvas.locator('[data-fr-id="c1"] .fr-icon-box');
  await moved.hover();
  const grip = canvas.locator('.fre-handle--widget .fre-handle__grip[title*="Icon box"]');
  await expect(grip).toBeVisible();
  const frameBox = (await page.locator('.fre-iframe').boundingBox())!;
  const g = (await grip.boundingBox())!;
  const third = await boxIn(frame, '[data-fr-id="c3"] .fr-icon-box');
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  const end = {
    x: frameBox.x + third.x + third.width / 2,
    y: frameBox.y + third.y + third.height - 4,
  };
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(
      g.x + ((end.x - g.x) * i) / 20,
      g.y + g.height / 2 + ((end.y - g.y - g.height / 2) * i) / 20,
    );
  }
  await page.mouse.up();
  await expect(canvas.locator('[data-fr-id="c1"] .fr-icon-box')).toHaveCount(0);
  await expect(canvas.locator('[data-fr-id="c3"] .fr-icon-box')).toHaveCount(2);

  expect(appErrors(errors)).toEqual([]);
});

test('texts are typed in place, with the panel following', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  const item = (id: string, title: string) =>
    container(id, { _title: title, content_width: 'full' });
  await openPage(page, `Fresco inline ${stamp}`, [
    container('w', {}, [
      { id: 'box', type: 'fresco/icon-box', v: 1, attrs: { title: 'Fast delivery' } },
      { id: 'list', type: 'fresco/icon-list', v: 1, attrs: {} },
      {
        id: 'tabs',
        type: 'fresco/tabs',
        v: 1,
        attrs: {},
        children: [item('t1', 'First'), item('t2', 'Second')],
      },
      {
        id: 'gone',
        type: 'fresco/heading',
        v: 1,
        attrs: { title: 'Only on phones', _hide_desktop: true },
      },
    ]),
  ]);
  const canvas = page.frameLocator('.fre-iframe');
  const panelTitle = page.locator('.fre-panel__head h2');

  // The icon box's title: one click, typing, and the panel's Title field follows.
  const title = canvas.locator('[data-fr-id="box"] .fr-box__title');
  await title.click();
  await expect(title).toHaveAttribute('contenteditable', /.+/);
  await expect(panelTitle).toHaveText(/Icon box|Box con icona/);
  await page.keyboard.press('End');
  await page.keyboard.type(' today');
  await expect(page.locator('.fre-panel input.fre-input').first()).toHaveValue(
    'Fast delivery today',
  );

  // Another place of the page ends the typing; the text clicked again is edited
  // again, and its element is the one the panel edits.
  await canvas.locator('[data-fr-id="w"]').click({ position: { x: 4, y: 4 } });
  await expect(panelTitle).toHaveText(/Container|Contenitore/);
  await expect(title).not.toHaveAttribute('contenteditable', /.+/);
  await title.click();
  await expect(panelTitle).toHaveText(/Icon box|Box con icona/);
  await expect(title).toHaveAttribute('contenteditable', /.+/);
  // A click inside the text being typed keeps it going, and the element selected.
  await title.click({ position: { x: 5, y: 5 } });
  await expect(title).toHaveAttribute('contenteditable', /.+/);
  await expect(panelTitle).toHaveText(/Icon box|Box con icona/);
  // Escape ends the typing only.
  await page.keyboard.press('Escape');
  await expect(title).not.toHaveAttribute('contenteditable', /.+/);
  await expect(panelTitle).toHaveText(/Icon box|Box con icona/);

  // The second item of an icon list.
  const second = canvas.locator('[data-fr-id="list"] .fr-list__text').nth(1);
  await second.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' two');
  await page.keyboard.press('Escape');
  await expect(second).toHaveText(/ two$/);

  // A tab title: the first click shows the tab, the next one edits its title.
  const tab = canvas.locator('[data-fr-id="tabs"] .fr-tabs__title').nth(1);
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(tab).not.toHaveAttribute('contenteditable', /.+/);
  await tab.click();
  await expect(tab).toHaveAttribute('contenteditable', /.+/);
  await page.keyboard.press('End');
  await page.keyboard.type(' tab');
  await page.keyboard.press('Enter');
  await expect(tab).toHaveText('Second tab');

  // Hidden on desktop: still in the canvas, faded, with its badge.
  const gone = canvas.locator('[data-fr-id="gone"]');
  await expect(gone).toBeVisible();
  expect(Number(await gone.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(1);
  await expect(canvas.locator('.fre-hiddenbadge')).toHaveText(/desktop/i);

  // Ctrl+Shift+M: tablet, mobile, back to desktop.
  const device = page.locator('.fre-bar__devices .is-on');
  const devices: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Control+Shift+M');
    devices.push((await device.getAttribute('aria-label')) ?? '');
  }
  expect(devices).toHaveLength(3);
  expect(new Set(devices).size).toBe(3);
  expect(devices[2]).toMatch(/Desktop/);

  // Saved as typed.
  const saved = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().includes('/entries/'),
  );
  await page.keyboard.press('ControlOrMeta+s');
  expect((await saved).ok()).toBe(true);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  const view = await api<{ revision: { document: { blocks: Node[] } } }>(
    page,
    'GET',
    `/entries/${id}`,
  );
  const [box, list, tabs] = view.revision.document.blocks[0]!.children!;
  expect(box!.attrs.title).toBe('Fast delivery today');
  expect((list!.attrs.items as { text: string }[])[1]!.text).toMatch(/ two$/);
  expect(tabs!.children![1]!.attrs._title).toBe('Second tab');

  expect(appErrors(errors)).toEqual([]);
});
