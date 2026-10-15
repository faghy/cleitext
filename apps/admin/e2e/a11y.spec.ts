/**
 * Accessibility (RNF-09): the admin screens and the default theme have no
 * WCAG 2.1 A/AA violations that axe can detect. Manual review still applies.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Development credentials seeded by tools/dev-db.
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
/** The public site is served by the application server, not by Vite. */
const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';

const ADMIN_SCREENS = [
  '/admin/',
  '/admin/posts',
  '/admin/pages',
  '/admin/taxonomies/category',
  '/admin/media',
  '/admin/comments',
  '/admin/appearance',
  '/admin/plugins',
  '/admin/users',
  '/admin/profile',
  '/admin/settings',
  '/admin/redirects',
  '/admin/structure',
  '/admin/activity',
  '/admin/system',
  '/admin/sites',
];

async function violations(page: Page, exclude: string[] = []) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  return violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
}

test('the sign-in screen', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test('the admin screens', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/');

  const found: Record<string, unknown> = {};
  for (const screen of ADMIN_SCREENS) {
    await page.goto(screen);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const list = await violations(page);
    if (list.length > 0) found[screen] = list;
  }
  expect(found).toEqual({});

  // The editor around the canvas (the canvas is Gutenberg's own iframe).
  await page.goto('/admin/posts');
  await page.getByRole('button', { name: 'Add New' }).click();
  await page.waitForURL('**/admin/entries/**');
  await expect(page.frameLocator('iframe[name="editor-canvas"]').locator('body')).toBeVisible();
  expect(await violations(page, ['iframe[name="editor-canvas"]'])).toEqual([]);
});

test('the default theme', async ({ page }) => {
  await page.goto(`${SITE}/`);
  expect(await violations(page)).toEqual([]);
  const first = page.locator('main a[href]').first();
  if ((await first.count()) > 0) {
    await first.click();
    await page.waitForLoadState('load');
    expect(await violations(page)).toEqual([]);
  }
});
