/** The admin in Italian (RF-ADM-04): the language chosen in the profile. */
import { expect, test, type Page } from '@playwright/test';

const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

/** Profile language through the API (also restores English if the test fails). */
async function setLocale(page: Page, locale: string) {
  await page.evaluate(async (value) => {
    const { token } = await (await fetch('/api/v1/auth/csrf')).json();
    await fetch('/api/v1/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      body: JSON.stringify({ locale: value }),
    });
  }, locale);
}

test.afterEach(async ({ page }) => {
  if (page.url().includes('/cl-admin')) await setLocale(page, 'en');
});

test('switches the admin to Italian and back', async ({ page }) => {
  await page.goto('/cl-admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/cl-admin/');

  await page.goto('/cl-admin/profile');
  await page.getByLabel('Admin language').selectOption('it');
  await page
    .locator('form', { has: page.getByLabel('Admin language') })
    .getByRole('button', { name: 'Save', exact: true })
    .click();

  const sidebar = page.getByRole('navigation', { name: 'Principale' });
  await expect(sidebar.getByRole('link', { name: 'Articoli' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Impostazioni' })).toBeVisible();
  await sidebar.getByRole('link', { name: 'Impostazioni' }).click();
  await expect(page.getByRole('heading', { name: 'Email' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invia email di prova' })).toBeVisible();
  await sidebar.getByRole('link', { name: 'Siti' }).click();
  await expect(page.getByRole('heading', { name: 'Aggiungi nuovo sito' })).toBeVisible();

  // Back to English for the other tests.
  await page.goto('/cl-admin/profile');
  await page.getByLabel('Lingua della bacheca').selectOption('en');
  await page
    .locator('form', { has: page.getByLabel('Lingua della bacheca') })
    .getByRole('button', { name: 'Salva', exact: true })
    .click();
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Posts' }),
  ).toBeVisible();
});
