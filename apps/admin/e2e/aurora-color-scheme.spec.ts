/**
 * Aurora's colour scheme (Aurora 0.4): automatic by default, or always light
 * or dark, chosen in Customize with a live preview. The admin's own scheme is
 * in theme.spec.ts.
 */
import { expect, test, type Browser } from '@playwright/test';
import { api, signIn, SITE } from './fixtures/api.js';
import { appErrors } from './fixtures/errors.js';

interface ActiveTheme {
  theme: { slug: string };
  values: Record<string, unknown>;
}

/** The public home page's background, seen by a visitor whose system is dark. */
async function darkVisitor(browser: Browser) {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto(`${SITE}/`);
  const result = {
    scheme: await page.locator('html').getAttribute('data-color-scheme'),
    background: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    colorScheme: await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
  };
  await context.close();
  return result;
}

test('Aurora’s colour scheme is chosen in Customize, previewed and published', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  const active = await api<ActiveTheme>(page, 'GET', '/themes/active');
  test.skip(active.theme.slug !== 'aurora', 'Aurora is not the active theme');
  const before = active.values;

  try {
    // Automatic: a dark system gets the dark colors.
    await api(page, 'PUT', '/themes/active/settings', {
      values: { ...before, colorScheme: 'auto' },
    });
    const auto = await darkVisitor(browser);
    expect(auto.scheme).toBe('auto');
    expect(auto.background).toBe('rgb(18, 22, 28)');

    // Customize: the preview follows the choice before it is published.
    await page.goto('/cl-admin/appearance');
    await page
      .getByRole('listitem', { name: 'Aurora' })
      .getByRole('button', { name: 'Customize Aurora' })
      .click();
    const select = page.getByLabel('Colour scheme');
    await expect(select).toHaveValue('auto');
    await select.selectOption('light');
    const preview = page.frameLocator('iframe[title="Site preview"]');
    await expect(preview.locator('html')).toHaveAttribute('data-color-scheme', 'light');
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published.')).toBeVisible();

    // Always light: white with a dark system, and light form controls.
    const light = await darkVisitor(browser);
    expect(light.scheme).toBe('light');
    expect(light.background).toBe('rgb(255, 255, 255)');
    expect(light.colorScheme).toBe('light');
  } finally {
    await api(page, 'PUT', '/themes/active/settings', { values: before });
  }

  expect(appErrors(errors)).toEqual([]);
});
