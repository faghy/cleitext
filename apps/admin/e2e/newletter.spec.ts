/**
 * NewLetter, the newsletter plugin, against a fake email service: the
 * server sends every provider request to a local endpoint named by
 * NEWLETTER_TEST_ENDPOINT (never a real account), which this spec runs. The
 * owner connects "Brevo" and picks a list in the admin, puts the signup
 * block on a page with the block editor, a visitor subscribes (with
 * JavaScript, then without), the fake service gets the contacts, and the
 * administrator sees them in the log. The plugin is installed fresh and
 * uninstalled (with its data) at the end; the page is removed.
 *
 * Run it with a server started with NEWLETTER_TEST_ENDPOINT, e.g.
 * `NEWLETTER_TEST_ENDPOINT=http://127.0.0.1:4799 pnpm e2e newletter`; it is
 * skipped otherwise.
 */
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { api, removeEntries, signIn, SITE } from './fixtures/api.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const ENDPOINT = process.env.NEWLETTER_TEST_ENDPOINT ?? '';

function cli(...args: string[]) {
  execFileSync('node', ['--env-file-if-exists=.env', 'packages/cli/dist/bin.js', ...args], {
    cwd: root,
    stdio: 'pipe',
  });
}

test.describe.configure({ mode: 'serial' });
test.skip(!ENDPOINT, 'NEWLETTER_TEST_ENDPOINT is not set: no fake email service to talk to.');

/** What the fake service received: method, path (with the provider's host) and body. */
const received: { method: string; path: string; body: Record<string, unknown> }[] = [];
let fake: Server | null = null;
const pages: string[] = [];

test.beforeAll(async () => {
  const url = new URL(ENDPOINT);
  fake = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0]!;
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      received.push({ method: req.method ?? '', path, body });
      const send = (status: number, data?: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(data === undefined ? '' : JSON.stringify(data));
      };
      if (req.headers['api-key'] !== 'fake-brevo-key')
        return send(401, { message: 'Key not found' });
      if (path === '/api.brevo.com/v3/account') return send(200, { companyName: 'Fake Brevo' });
      if (path === '/api.brevo.com/v3/contacts/lists')
        return send(200, { lists: [{ id: 7, name: 'Fake news', totalSubscribers: 0 }] });
      if (path === '/api.brevo.com/v3/contacts/attributes')
        return send(200, { attributes: [{ name: 'FIRSTNAME', category: 'normal', type: 'text' }] });
      if (req.method === 'GET' && path.startsWith('/api.brevo.com/v3/contacts/'))
        return send(404, { code: 'document_not_found' });
      if (req.method === 'POST' && path === '/api.brevo.com/v3/contacts')
        return send(201, { id: 1 });
      send(404, { message: `No fake route ${req.method} ${path}` });
    });
  });
  await new Promise<void>((resolve) => fake!.listen(Number(url.port), url.hostname, resolve));
  try {
    cli('plugin:uninstall', 'newletter', '--yes');
  } catch {
    // Not installed yet.
  }
  cli('plugin:install', 'plugins/newletter', '--build');
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await signIn(page);
    await removeEntries(page, pages);
  } finally {
    await page.close();
    cli('plugin:uninstall', 'newletter', '--yes');
    await new Promise<void>((resolve) => (fake ? fake.close(() => resolve()) : resolve()));
  }
});

test('the owner connects a service, a visitor subscribes, the log shows it', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  await signIn(page);
  const plugins = await api<{ slug: string; active: boolean }[]>(page, 'GET', '/plugins');
  if (!plugins.find((p) => p.slug === 'newletter')?.active)
    await api(page, 'POST', '/plugins/newletter/activate');

  // 1. Connection: a wrong key is refused, the right one connects and the list shows.
  await page.goto('/cl-admin/ext/newletter');
  await expect(page.getByRole('heading', { name: 'NewLetter' })).toBeVisible();
  await expect(page.getByText('Every subscriber, a new letter')).toBeVisible();
  await page.getByLabel('Service').selectOption('brevo');
  await page.getByLabel('API key').fill('wrong-key');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Key not found' })).toBeVisible();
  await page.getByLabel('API key').fill('fake-brevo-key');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected to Fake Brevo.')).toBeVisible();
  await page.getByRole('button', { name: 'Save connection' }).click();
  await expect(page.getByText('Connected to Brevo: Fake Brevo.')).toBeVisible();
  // The key never comes back to the browser.
  expect(JSON.stringify(await api(page, 'GET', '/ext/newletter/settings'))).not.toContain(
    'fake-brevo-key',
  );
  await page
    .getByRole('group', { name: 'Subscribe people to' })
    .getByRole('checkbox', { name: /Fake news/ })
    .check();
  await page.getByRole('checkbox', { name: /Double opt-in/ }).uncheck();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  // 2. The block on a page, from the block editor.
  await page.goto('/cl-admin/pages');
  await page.getByRole('button', { name: 'Add New' }).click();
  await page.waitForURL('**/cl-admin/entries/**');
  await page.locator('#entry-title').fill(`News ${stamp}`);
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  await canvas
    .locator(
      '.block-editor-default-block-appender__content, [data-empty="true"], .wp-block-paragraph',
    )
    .first()
    .click();
  await page.keyboard.type('/newsletter signup');
  await expect(page.getByRole('option', { name: /Newsletter signup/i }).first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published', { exact: true })).toBeVisible();
  const entries = await api<{ items: { id: string; title: string }[] }>(
    page,
    'GET',
    `/entries?type=page&q=${encodeURIComponent(`News ${stamp}`)}`,
  );
  pages.push(...entries.items.filter((e) => e.title === `News ${stamp}`).map((e) => e.id));

  // 3. A visitor subscribes, the form answers in place.
  const visitor = await browser.newContext();
  const site = await visitor.newPage();
  const siteErrors: string[] = [];
  site.on('pageerror', (e) => siteErrors.push(e.message));
  await site.goto(`${SITE}/news-${stamp}`);
  const form = site.locator('.cx-nl form');
  await form.getByLabel(/^Email/).fill(`ada-${stamp}@example.com`);
  await form.getByRole('checkbox', { name: /I agree to receive the newsletter/ }).check();
  await form.getByRole('button', { name: 'Subscribe' }).click();
  await expect(site.locator('.cx-nl__live')).toHaveText('Thank you! You are subscribed.');
  await expect(form).toBeHidden();
  expect(siteErrors).toEqual([]);
  await visitor.close();

  // 4. Without JavaScript: a POST, then back to the page with the message.
  const plain = await browser.newContext({ javaScriptEnabled: false });
  const noJs = await plain.newPage();
  await noJs.goto(`${SITE}/news-${stamp}`);
  const form2 = noJs.locator('.cx-nl form');
  await form2.getByLabel(/^Email/).fill(`grace-${stamp}@example.com`);
  await form2.getByRole('checkbox', { name: /I agree to receive the newsletter/ }).check();
  await form2.getByRole('button', { name: 'Subscribe' }).click();
  await noJs.waitForURL(/#nl-.+-success$/);
  await expect(noJs.getByText('Thank you! You are subscribed.')).toBeVisible();
  await plain.close();

  // The fake service got both, on the chosen list.
  const contacts = received.filter(
    (r) => r.method === 'POST' && r.path === '/api.brevo.com/v3/contacts',
  );
  expect(contacts.map((c) => c.body.email)).toEqual([
    `ada-${stamp}@example.com`,
    `grace-${stamp}@example.com`,
  ]);
  expect(contacts[0]!.body.listIds).toEqual([7]);

  // 5. The log: both subscriptions, without the addresses in clear.
  await page.goto('/cl-admin/ext/newletter');
  await page.getByRole('tab', { name: 'Subscriptions' }).click();
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Subscribed');
  await expect(rows.first()).toContainText('g•••@e•••.com');
  await expect(page.locator('tbody')).not.toContainText(`ada-${stamp}@example.com`);
  expect(errors).toEqual([]);
});
