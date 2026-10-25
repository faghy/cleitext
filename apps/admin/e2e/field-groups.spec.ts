/**
 * Custom fields (plugin API 1.47): a field group of the site's owners,
 * created with the API, shows in the editor only for pages of its template
 * (live, as the template changes), and its required field stops publishing
 * with a message under the field.
 */
import { expect, test, type Page } from '@playwright/test';
import { appErrors } from './fixtures/errors.js';

const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

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
        headers: { 'x-csrf-token': token, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
      return (res.status === 204 ? null : await res.json()) as T;
    },
    { method, path, body },
  );
}

test('a field group with a page template rule shows for that template and blocks publishing', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  const suffix = Date.now().toString(36);
  const id = `hero${suffix}`;
  const title = `Hero ${suffix}`;
  // A template of the active theme (Aurora offers "Wide"); with a theme that
  // offers none, a template set through the API, as one left by another theme.
  const screen = await api<{ templates: { name: string; types?: string[] }[] }>(
    page,
    'GET',
    '/field-screens/entry',
  );
  const offered = screen.templates.find((t) => (t.types ?? ['page']).includes('page'))?.name;
  const template = offered ?? `landing-${suffix}`;
  await api(page, 'POST', '/field-groups', {
    id,
    title,
    location: [
      [
        { param: 'contentType', operator: '==', value: 'page' },
        { param: 'template', operator: '==', value: template },
      ],
    ],
    fields: [{ name: 'tagline', type: 'text', label: 'Hero tagline', required: true }],
  });
  const other = await api<{ id: string }>(page, 'POST', '/entries', {
    type: 'page',
    title: `Other ${suffix}`,
  });
  const entry = await api<{ id: string }>(page, 'POST', '/entries', {
    type: 'page',
    title: `Landing ${suffix}`,
    ...(offered ? {} : { template }),
  });

  try {
    const settings = page.getByRole('complementary', { name: 'Settings' });
    // A page with the default template: no group.
    const groupsLoaded = () =>
      page.waitForResponse((response) => response.url().includes('/field-screens/entry'));
    let loaded = groupsLoaded();
    await page.goto(`/cl-admin/entries/${other.id}`);
    await loaded;
    await expect(settings.getByRole('region', { name: 'Statistics' })).toBeVisible();
    await expect(settings.getByRole('region', { name: title })).toHaveCount(0);

    loaded = groupsLoaded();
    await page.goto(`/cl-admin/entries/${entry.id}`);
    await loaded;
    const select = settings.getByRole('combobox', { name: 'Template' });
    if (offered) {
      await expect(settings.getByRole('region', { name: 'Statistics' })).toBeVisible();
      await expect(settings.getByRole('region', { name: title })).toHaveCount(0);
      // Chosen in the sidebar: the group shows at once.
      await select.selectOption(template);
    }
    const group = settings.getByRole('region', { name: title });
    await expect(group).toBeVisible();

    // The required field is empty: publishing is refused, the message is under it.
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(group.getByText('This field is required.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();

    await group.getByLabel('Hero tagline').fill('Fresh every morning');
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByRole('button', { name: 'Update' })).toBeVisible();
    const saved = await api<{ status: string; revision: { fields: Record<string, unknown> } }>(
      page,
      'GET',
      `/entries/${entry.id}`,
    );
    expect(saved.status).toBe('published');
    expect(saved.revision.fields[id]).toEqual({ tagline: 'Fresh every morning' });

    // Back to the default template: the group goes away, its values stay.
    await select.selectOption('');
    await expect(settings.getByRole('region', { name: title })).toHaveCount(0);
    expect(appErrors(errors)).toEqual([]);
  } finally {
    for (const created of [entry, other]) {
      await api(page, 'POST', `/entries/${created.id}/trash`).catch(() => undefined);
      await api(page, 'DELETE', `/entries/${created.id}`).catch(() => undefined);
    }
    await api(page, 'DELETE', `/field-groups/${id}`).catch(() => undefined);
  }
});
