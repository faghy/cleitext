/**
 * Fresco, the official page builder, in full screen (`chrome: 'none'`): the
 * editor opens with its own top bar, a heading is added from the "add" area
 * at the end of the page, and Ctrl/⌘+S pressed inside the canvas saves the
 * page exactly once.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

test.beforeAll(() => {
  // As a site owner installs it; running servers reload their plugins.
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
});

// The other specs run without Fresco's blocks, even after a failure here.
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await signIn(page);
  await api(page, 'POST', '/plugins/fresco/deactivate', {}).catch(() => undefined);
  await page.close();
});

async function signIn(page: Page) {
  await page.goto('/cl-admin/login');
  await page.locator('input[type="email"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/cl-admin/');
}

/** A call to the admin API from the signed-in page. */
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

test('Fresco full screen: add a heading from the add area, Ctrl+S in the canvas saves once', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await api(page, 'POST', '/plugins/fresco/activate', {});

  // An empty Fresco page.
  const stamp = Date.now().toString(36);
  const entry = await api<{ id: string }>(page, 'POST', '/entries', {
    type: 'page',
    title: `Fresco ${stamp}`,
    document: { schema: 1, blocks: [], editor: { id: 'fresco' } },
  });
  await page.goto(`/cl-admin/entries/${entry.id}`);

  // Full screen: Fresco's own top bar, and the page in the canvas.
  await expect(page.locator('.fre-root--full .fre-bar')).toBeVisible();
  const canvas = page.frameLocator('.fre-iframe');
  const add = canvas.locator('.fre-add__round--add');
  await expect(add).toBeVisible();

  // The add area: a container with one column, then a Heading from the panel.
  await add.click();
  await canvas.locator('.fre-add__kinds button').first().click();
  await canvas.locator('.fre-add__preset').first().click();
  await expect(canvas.locator('.fre-tree > .fr-container')).toHaveCount(1);
  // The first Heading is the basic one (the atomic one comes later).
  await page
    .locator('.fre-tile')
    .filter({ hasText: /^(Heading|Titolo)$/ })
    .first()
    .click();
  const heading = canvas.locator('.fre-tree .fr-heading');
  await expect(heading).toHaveCount(1);

  // Ctrl+S inside the canvas: one save of the entry, no browser dialog.
  const saves: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().includes(`/entries/${entry.id}`))
      saves.push(request.url());
  });
  const saved = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().includes(`/entries/${entry.id}`),
  );
  await canvas.locator('body').press('ControlOrMeta+s');
  expect((await saved).ok()).toBe(true);
  await page.waitForTimeout(1000);
  expect(saves).toHaveLength(1);

  // The heading was saved with the page.
  const view = await api<{
    revision: { document: { blocks: { type: string; children?: unknown[] }[] } };
  }>(page, 'GET', `/entries/${entry.id}`);
  const types = (nodes: { type: string; children?: unknown[] }[]): string[] =>
    nodes.flatMap((node) => [
      node.type,
      ...types((node.children ?? []) as { type: string; children?: unknown[] }[]),
    ]);
  expect(view.revision.document.blocks).toHaveLength(1);
  expect(types(view.revision.document.blocks)).toContain('fresco/heading');

  expect(appErrors(errors)).toEqual([]);
});
