/**
 * The WordPress Importer from its admin page (WordPress Importer 1.27.0):
 * a WordPress export is uploaded, the page shows the background job's
 * progress (the step, media and posts done out of how many) and then the
 * report. The repository's version of the plugin is installed first; the
 * pages it makes are removed at the end, the import cleared, and the plugin
 * left active or not as it was found (uninstalled if it was not there).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { api, removeEntries, signIn } from './fixtures/api.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const EXT = '/ext/wordpress-importer';
const TITLE = 'E2E import page';
const PAGES = 60;

function cli(...args: string[]) {
  execFileSync('node', ['--env-file-if-exists=.env', 'packages/cli/dist/bin.js', ...args], {
    cwd: root,
    stdio: 'pipe',
  });
}

const cdata = (value: string) => `<![CDATA[${value}]]>`;

/**
 * A WordPress export of pages by the development administrator (an existing
 * account: no author is created), whose old addresses are their new ones (no
 * redirect is added), with images on the server's own network (never
 * downloaded: reported).
 */
function wxr(): string {
  const text = `<p>${'Una pagina importata da WordPress. '.repeat(40)}</p>`;
  const items = Array.from({ length: PAGES }, (_, index) => {
    const n = index + 1;
    return `<item>
<title>${cdata(`${TITLE} ${n}`)}</title>
<link>https://e2e-import.example.com/e2e-import-page-${n}/</link>
<dc:creator>${cdata('admin')}</dc:creator>
<content:encoded>${cdata(`<p><img src="http://127.0.0.1:9/wp-content/uploads/e2e-${n}.jpg"/></p>${text}`)}</content:encoded>
<wp:post_id>${n}</wp:post_id>
<wp:post_date_gmt>${cdata('2024-05-02 08:00:00')}</wp:post_date_gmt>
<wp:post_name>${cdata(`e2e-import-page-${n}`)}</wp:post_name>
<wp:status>${cdata('draft')}</wp:status>
<wp:post_parent>0</wp:post_parent>
<wp:post_type>${cdata('page')}</wp:post_type>
</item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
	xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
	xmlns:content="http://purl.org/rss/1.0/modules/content/"
	xmlns:dc="http://purl.org/dc/elements/1.1/"
	xmlns:wp="http://wordpress.org/export/1.2/"
>
<channel>
<title>E2E import</title>
<link>https://e2e-import.example.com</link>
<wp:wxr_version>1.2</wp:wxr_version>
<wp:base_site_url>https://e2e-import.example.com</wp:base_site_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>${cdata('admin')}</wp:author_login><wp:author_email>${cdata('admin@example.com')}</wp:author_email><wp:author_display_name>${cdata('Admin')}</wp:author_display_name></wp:author>
${items.join('\n')}
</channel>
</rss>`;
}

test.describe.configure({ mode: 'serial' });

let installedHere = false;
let wasActive = false;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await signIn(page);
    const plugins = await api<{ slug: string; active: boolean }[]>(page, 'GET', '/plugins');
    const found = plugins.find((p) => p.slug === 'wordpress-importer');
    // This repository's version, the one under test (an update when it is there).
    cli('plugin:install', 'plugins/wordpress-importer', '--build');
    installedHere = !found;
    wasActive = found?.active === true;
    if (!wasActive) await api(page, 'POST', '/plugins/wordpress-importer/activate');
    // A finished import of an earlier run would show its report instead of the form.
    const { job } = await api<{ job: { status: string } | null }>(page, 'GET', `${EXT}/status`);
    if (job && job.status !== 'running') await api(page, 'DELETE', `${EXT}/status`);
  } finally {
    await page.close();
  }
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await signIn(page);
    const { items } = await api<{ items: { id: string; title: string }[] }>(
      page,
      'GET',
      `/entries?type=page&limit=100&q=${encodeURIComponent(TITLE)}`,
    );
    await removeEntries(
      page,
      items.filter((e) => e.title.startsWith(TITLE)).map((e) => e.id),
    );
    await api(page, 'DELETE', `${EXT}/status`).catch(() => undefined);
    if (!wasActive) {
      await api(page, 'POST', '/plugins/wordpress-importer/deactivate').catch(() => undefined);
    }
  } finally {
    await page.close();
    if (installedHere) cli('plugin:uninstall', 'wordpress-importer', '--yes');
  }
});

test('uploads an export, follows its progress and shows the report', async ({ page }) => {
  await signIn(page);
  await page.goto('/cl-admin/ext/wordpress-importer');
  await expect(
    page.getByRole('heading', { name: /Import from WordPress|Importa da WordPress/ }),
  ).toBeVisible();
  await page
    .locator('input[type=file][accept^=".xml"]')
    .setInputFiles({ name: 'e2e-import.xml', mimeType: 'text/xml', buffer: Buffer.from(wxr()) });
  await page.getByRole('button', { name: /^(Import|Importa)$/ }).click();

  // The job: its progress while it runs (it may already be over by the first look).
  const progress = page.getByRole('progressbar');
  const report = page.getByRole('heading', { name: /^(Report|Resoconto)$/ });
  await expect(progress.or(report)).toBeVisible();
  if (await progress.isVisible()) {
    await expect(page.getByText(/e2e-import\.xml: (you can leave|puoi lasciare)/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Cancel|Annulla)$/ })).toBeVisible();
  }

  // Then the report: every page created, the images left out.
  await expect(report).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/e2e-import\.xml (imported|importato)/)).toBeVisible();
  await expect(
    page.getByText(new RegExp(`${PAGES}\\s+(posts and pages|articoli e pagine)`)),
  ).toBeVisible();
  const { job } = await api<{
    job: { status: string; counts: { entries: { done: number; total: number } } };
  }>(page, 'GET', `${EXT}/status`);
  expect(job.status).toBe('done');
  expect(job.counts.entries).toEqual({ done: PAGES, total: PAGES });
});
