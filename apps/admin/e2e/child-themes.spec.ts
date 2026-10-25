/** Child themes and Additional CSS (core 0.79): Appearance → Themes and Customize. */
import { expect, test, type Page } from '@playwright/test';
import { api, signIn, SITE } from './fixtures/api.js';
import { appErrors } from './fixtures/errors.js';

interface ThemeView {
  slug: string;
  name: string;
  active: boolean;
  bundled: boolean;
  error: string | null;
  parent?: { slug: string } | null;
  paid: unknown;
}

interface Css {
  site: string;
  theme: string;
}

/** Replaces the text of a code editor, typed key by key. */
async function write(page: Page, label: string, text: string): Promise<void> {
  const box = page.getByRole('textbox', { name: label });
  // CodeMirror is loaded when the section opens (a textarea until then).
  await expect(box).toHaveAttribute('contenteditable', 'true');
  await box.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  if (text) await page.keyboard.type(text);
  await expect(box).toHaveText(text);
}

/** The public home page's body, as a visitor gets it. */
async function homeBody(page: Page): Promise<string> {
  const res = await page.request.get(`${SITE}/?e2e=${Date.now()}`);
  const html = await res.text();
  return html.slice(html.indexOf('<body'));
}

test('a child theme of the active theme looks the same, Additional CSS changes the page', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  await signIn(page);

  const before = await api<{ theme: ThemeView }>(page, 'GET', '/themes/active');
  const parent = before.theme;
  const savedCss = await api<Css>(page, 'GET', '/themes/additional-css');
  const childSlug = `e2e-child-${stamp}`;
  const childName = `E2E Child ${stamp}`;
  // A theme of its own to try deleting while a child uses it.
  const themes = await api<ThemeView[]>(page, 'GET', '/themes');
  const other = themes.find(
    (t) => !t.bundled && !t.error && !t.parent && !t.paid && t.slug !== parent.slug,
  );
  const otherChild = `e2e-kid-${stamp}`;
  const bodyBefore = await homeBody(page);

  try {
    await page.goto('/cl-admin/appearance');
    const card = page.getByRole('listitem', { name: parent.name, exact: true });
    await card.getByRole('button', { name: `Create child theme ${parent.name}` }).click();
    const form = page.getByRole('form', { name: 'Create child theme' });
    await form.getByLabel('Name').fill(childName);
    await expect(form.getByLabel('Slug')).toHaveValue(childSlug);
    await expect(form.getByLabel('Activate it now, keeping the current settings')).toBeChecked();
    await form.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(`${childName} was created and activated`)).toBeVisible();

    const child = page.getByRole('listitem', { name: childName });
    await expect(child).toContainText(`Child theme of ${parent.name}`);
    await expect(child).toContainText('Active');
    await expect(child.getByRole('link', { name: `Download ${childName}` })).toBeVisible();

    // The site looks the same: the parent's page, with the child's (empty) stylesheet.
    const bodyAfter = await homeBody(page);
    expect(bodyAfter).toBe(bodyBefore);

    // Additional CSS: shown live in the preview, then on the site once published.
    await child.getByRole('button', { name: `Customize ${childName}` }).click();
    const panel = page.getByRole('complementary', { name: 'Customize' });
    // The core's section, listed last (an old theme may still have one of its own).
    const cssLink = panel.getByRole('button', { name: 'Additional CSS', exact: true }).last();
    await cssLink.click();
    const css = `body { outline: 7px solid rgb(255, 0, 0); } /* ${stamp} */`;
    // A code editor (CodeMirror, core 0.80): the text is typed in.
    await write(page, 'CSS for every theme', css);
    const preview = page.frameLocator('iframe[title="Site preview"]');
    await expect
      .poll(async () =>
        // The preview reloads as the CSS changes: a reload between two reads is retried.
        preview
          .locator('body')
          .evaluate((b) => getComputedStyle(b).outlineWidth)
          .catch(() => ''),
      )
      .toBe('7px');
    // CSS that could close its <style> is refused before publishing.
    await write(page, `CSS for ${childName} only`, '</style>');
    await expect(page.getByRole('alert').filter({ hasText: '</style>' })).toBeVisible();
    await write(page, `CSS for ${childName} only`, '');
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published.')).toBeVisible();

    const visitor = await browser.newContext();
    const site = await visitor.newPage();
    await site.goto(`${SITE}/`);
    await expect
      .poll(() => site.locator('body').evaluate((b) => getComputedStyle(b).outlineWidth))
      .toBe('7px');
    expect(await site.content()).toContain(stamp);
    await visitor.close();
    await page.getByRole('button', { name: 'Close customizer' }).click();

    // A parent with a child installed cannot be deleted.
    if (other) {
      await api(page, 'POST', `/themes/${other.slug}/child`, { name: 'E2E kid', slug: otherChild });
      await page.reload();
      page.once('dialog', (dialog) => void dialog.accept());
      await page
        .getByRole('listitem', { name: other.name, exact: true })
        .getByRole('button', { name: `Delete ${other.name}` })
        .click();
      await expect(page.getByText(`${otherChild} is a child theme of ${other.slug}`)).toBeVisible();
      await expect(page.getByRole('listitem', { name: other.name, exact: true })).toBeVisible();
    }
  } finally {
    // The theme and the CSS of before; the themes made here removed.
    await api(page, 'POST', `/themes/${parent.slug}/activate`).catch(() => undefined);
    await api(page, 'PUT', '/themes/additional-css', savedCss).catch(() => undefined);
    await api(page, 'DELETE', `/themes/${childSlug}`).catch(() => undefined);
    await api(page, 'DELETE', `/themes/${otherChild}`).catch(() => undefined);
  }
  expect(appErrors(errors)).toEqual([]);
});
