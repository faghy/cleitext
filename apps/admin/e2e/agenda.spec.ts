/**
 * Agenda, the appointments plugin, from a fresh install: the first-run
 * wizard makes a service and a published booking page; a visitor books a
 * time on it (service → day → time → details → done), the administrator
 * sees the appointment, and the cancel link of the confirmation works.
 * Then two visitors try the same time at once: only one gets it, the
 * other is told and sees the free times again. The owner shapes a
 * service's booking form (required, hidden, a question moved up with the
 * keyboard) and a visitor gets that form. The plugin is installed
 * fresh at the start and uninstalled (with all its data) at the end, so the
 * three browsers sharing the database start from the same state.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { api, removeEntries, signIn, SITE } from './fixtures/api.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function cli(...args: string[]) {
  execFileSync('node', ['--env-file-if-exists=.env', 'packages/cli/dist/bin.js', ...args], {
    cwd: root,
    stdio: 'pipe',
  });
}

test.describe.configure({ mode: 'serial' });

const pages: string[] = [];

test.beforeAll(() => {
  // A fresh install: no services, no settings, the wizard shows.
  try {
    cli('plugin:uninstall', 'agenda', '--yes');
  } catch {
    // Not installed yet.
  }
  cli('plugin:install', 'plugins/agenda', '--build');
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await signIn(page);
    await removeEntries(page, pages);
  } finally {
    await page.close();
    cli('plugin:uninstall', 'agenda', '--yes');
  }
});

async function activate(page: Page) {
  const plugins = await api<{ slug: string; active: boolean }[]>(page, 'GET', '/plugins');
  const agenda = plugins.find((p) => p.slug === 'agenda');
  if (!agenda?.active) await api(page, 'POST', '/plugins/agenda/activate');
}

/** Picks the first free day of the calendar (or jumps to the next available one) and returns the times. */
async function chooseDay(visitor: Page) {
  const widget = visitor.locator('.ag');
  await expect(widget.locator('.ag-nav')).toBeVisible();
  const free = widget.locator('.ag-day.is-free');
  if ((await free.count()) === 0)
    await widget.getByRole('button', { name: /Next available|Primo giorno libero/ }).click();
  await widget.locator('.ag-day.is-free').first().click();
  await expect(widget.locator('.ag-time').first()).toBeVisible();
  return widget.locator('.ag-time');
}

async function fillDetails(visitor: Page, name: string, email: string) {
  const form = visitor.locator('.ag-form');
  await expect(form).toBeVisible();
  await form.getByLabel(/Name and surname|Nome e cognome/).fill(name);
  await form.getByLabel(/^Email/).fill(email);
  await form.locator('input[name="consent"]').check();
}

async function newVisitor(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  return context.newPage();
}

test('the wizard makes a booking page, and a visitor books, sees the admin and cancels', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stamp = Date.now().toString(36);
  await signIn(page);
  await activate(page);

  await page.goto('/cl-admin/ext/agenda');
  await expect(page.getByRole('heading', { name: 'Welcome to Agenda' })).toBeVisible();
  // 1. The service, with a live preview beside it.
  await page.getByLabel('Name of the service').fill(`Visit ${stamp}`);
  await page.getByRole('button', { name: '45 min' }).click();
  await expect(page.locator('.agx-preview')).toContainText(`Visit ${stamp}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  // 2. The hours: open on the weekend too, so the test finds a free day whatever the day.
  await expect(page.getByRole('heading', { name: 'When can customers book?' })).toBeVisible();
  for (let i = 0; i < 2; i++)
    await page.getByRole('button', { name: 'Open this day' }).first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  // 3. Notifications.
  await page.getByLabel('Your email').fill('studio@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();
  // 4. The page.
  await page.getByLabel('Title of the page').fill(`Book ${stamp}`);
  await page.getByRole('button', { name: 'Create the booking page' }).click();
  await expect(page.getByRole('heading', { name: 'Your booking page is ready!' })).toBeVisible();
  const href = await page.getByRole('link', { name: 'Open the booking page' }).getAttribute('href');
  expect(href).toBeTruthy();
  const entries = await api<{ items: { id: string; title: string }[] }>(
    page,
    'GET',
    `/entries?type=page&q=${encodeURIComponent(`Book ${stamp}`)}`,
  );
  pages.push(...entries.items.filter((e) => e.title === `Book ${stamp}`).map((e) => e.id));

  // A visitor on a phone books a time.
  const visitor = await newVisitor(browser);
  const visitorErrors: string[] = [];
  visitor.on('pageerror', (e) => visitorErrors.push(e.message));
  await visitor.goto(new URL(href!, SITE).toString());
  await expect(visitor.locator('.ag-summary').first()).toContainText(`Visit ${stamp}`);
  const times = await chooseDay(visitor);
  const box = await times.first().boundingBox();
  // Thumb-friendly targets.
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await times.first().click();
  await fillDetails(visitor, `Grace ${stamp}`, `grace-${stamp}@example.com`);
  await visitor.getByRole('button', { name: /^(Book|Prenota)$/ }).click();
  await expect(
    visitor.getByRole('heading', { name: /You are booked!|Prenotazione fatta!/ }),
  ).toBeVisible();
  await expect(
    visitor.getByRole('link', { name: /Add to calendar|Aggiungi al calendario/ }),
  ).toBeVisible();
  const manage = await visitor
    .getByRole('link', { name: /Cancel or move|Annulla o sposta/ })
    .getAttribute('href');

  // The administrator sees it.
  await page.getByRole('button', { name: 'Go to Agenda' }).click();
  await expect(page.locator('.agx-table')).toContainText(`Grace ${stamp}`);
  await expect(page.locator('.agx-counter')).toContainText('1 / 30');
  await page.getByText(`Grace ${stamp}`).click();
  await expect(page.getByRole('dialog', { name: 'Appointment' })).toContainText(
    `grace-${stamp}@example.com`,
  );

  // The link of the confirmation cancels it (the first free time may be tomorrow: no notice asked).
  await api(page, 'PUT', '/ext/agenda/settings', { changeNoticeHours: 0 });
  await visitor.goto(manage!);
  await expect(
    visitor.getByRole('heading', { name: /Move to another time|Sposta a un altro orario/ }),
  ).toBeVisible();
  await visitor.getByText(/Cancel the appointment|Annulla l’appuntamento/).click();
  await visitor.getByRole('button', { name: /Yes, cancel it|Sì, annullalo/ }).click();
  await expect(
    visitor.getByText(/The appointment is cancelled|L’appuntamento è annullato/),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('combobox', { name: 'Status' }).selectOption('cancelled');
  await expect(page.locator('.agx-table')).toContainText(`Grace ${stamp}`);
  await visitor.context().close();
  expect(errors).toEqual([]);
  expect(visitorErrors).toEqual([]);
});

test('the owner shapes a service’s booking form, and visitors get it', async ({
  page,
  browser,
}) => {
  const stamp = Date.now().toString(36);
  await signIn(page);
  await activate(page);
  const days = Array.from({ length: 7 }, () => ({
    windows: [{ start: '09:00', end: '17:00' }],
    times: [],
  }));
  const service = await api<{ id: string }>(page, 'POST', '/ext/agenda/services', {
    name: `Form ${stamp}`,
    duration: 60,
    schedule: { mode: 'intervals', step: 60, days },
  });
  await page.goto('/cl-admin/ext/agenda?tab=services');
  await page.getByRole('button', { name: `Form ${stamp}` }).click();
  const editor = page.locator('.agx-form-list');
  // The phone required, the notes hidden… and a question of the service, moved up with the keyboard.
  await editor
    .locator('[data-field="phone"]')
    .getByRole('button', { name: 'Required', exact: true })
    .click();
  await page.getByRole('button', { name: '+ Add a question' }).click();
  const question = editor.locator('li').last();
  await question.getByLabel('Question').fill('Allergies');
  await question.getByLabel('Help text (optional)').fill('So we can prepare');
  await question.getByRole('button', { name: /^Move up/ }).focus();
  await page.keyboard.press('Enter');
  await expect(editor.locator('li').nth(3)).toHaveAttribute('data-field', 'question-5');
  const preview = page.locator('[data-agx-form-preview]');
  await expect(preview).toContainText('Allergies');
  await expect(preview).toContainText('So we can prepare');
  await expect(preview.locator('textarea')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.agx-table')).toContainText(`Form ${stamp}`);

  const entry = await api<{ id: string }>(page, 'POST', '/entries', {
    type: 'page',
    title: `Form ${stamp}`,
    document: {
      schema: 1,
      blocks: [{ id: `b_${stamp}`, type: 'agenda/booking', v: 1, attrs: { service: service.id } }],
    },
  });
  pages.push(entry.id);
  const published = await api<{ slug: string }>(page, 'POST', `/entries/${entry.id}/publish`);
  const visitor = await newVisitor(browser);
  await visitor.goto(new URL(`/${published.slug}`, SITE).toString());
  const times = await chooseDay(visitor);
  await times.first().click();
  await fillDetails(visitor, `Form ${stamp}`, `form-${stamp}@example.com`);
  const form = visitor.locator('.ag-form');
  await expect(form.locator('input[name="phone"]')).toHaveAttribute('required', '');
  await expect(form.locator('[name="f_notes"]')).toHaveCount(0);
  const names = await form
    .locator('fieldset:not([disabled]) [name]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('name')));
  expect(names).toEqual(['name', 'email', 'phone', 'f_question-5']);
  // The phone is required now: the booking waits for it.
  await visitor.getByRole('button', { name: /^(Book|Prenota)$/ }).click();
  await expect(form.locator('input[name="phone"]')).toHaveAttribute('aria-invalid', 'true');
  await form.locator('input[name="phone"]').fill('+39 333 1234567');
  await form.locator('[name="f_question-5"]').fill('None');
  await visitor.getByRole('button', { name: /^(Book|Prenota)$/ }).click();
  await expect(
    visitor.getByRole('heading', { name: /You are booked!|Prenotazione fatta!/ }),
  ).toBeVisible();
  const list = await api<{ items: { fields: { label: string; value: string }[] }[] }>(
    page,
    'GET',
    `/ext/agenda/appointments?service=${service.id}`,
  );
  expect(list.items[0]!.fields).toEqual([
    { name: 'question-5', label: 'Allergies', value: 'None' },
  ]);
  await visitor.context().close();
});

test('the same time cannot be booked twice', async ({ page, browser }) => {
  const stamp = Date.now().toString(36);
  await signIn(page);
  await activate(page);
  const days = Array.from({ length: 7 }, () => ({
    windows: [{ start: '09:00', end: '17:00' }],
    times: [],
  }));
  const service = await api<{ id: string }>(page, 'POST', '/ext/agenda/services', {
    name: `Race ${stamp}`,
    duration: 60,
    schedule: { mode: 'intervals', step: 60, days },
  });
  const entry = await api<{ id: string }>(page, 'POST', '/entries', {
    type: 'page',
    title: `Race ${stamp}`,
    document: {
      schema: 1,
      blocks: [
        {
          id: `b_${stamp}`,
          type: 'agenda/booking',
          v: 1,
          attrs: { service: service.id, view: 'week' },
        },
      ],
    },
  });
  pages.push(entry.id);
  const published = await api<{ slug: string }>(page, 'POST', `/entries/${entry.id}/publish`);
  const url = new URL(`/${published.slug}`, SITE).toString();

  const [one, two] = [await newVisitor(browser), await newVisitor(browser)];
  for (const visitor of [one, two]) {
    await visitor.goto(url);
    await expect(visitor.locator('.ag-chip.is-free').first()).toBeVisible();
    await visitor.locator('.ag-chip.is-free').first().click();
  }
  const first = await one.locator('.ag-time').first().textContent();
  expect(await two.locator('.ag-time').first().textContent()).toBe(first);
  for (const [i, visitor] of [one, two].entries()) {
    await visitor.locator('.ag-time').first().click();
    await fillDetails(visitor, `Racer ${i} ${stamp}`, `racer${i}-${stamp}@example.com`);
  }
  await one.getByRole('button', { name: /^(Book|Prenota)$/ }).click();
  await expect(
    one.getByRole('heading', { name: /You are booked!|Prenotazione fatta!/ }),
  ).toBeVisible();
  await two.getByRole('button', { name: /^(Book|Prenota)$/ }).click();
  // The second one is told, and the time is gone from the list.
  await expect(
    two.getByRole('alert').filter({ hasText: /just taken|appena stato preso/ }),
  ).toBeVisible();
  await expect(two.locator('.ag-time').first()).not.toHaveText(first!);
  const list = await api<{ items: { name: string; start: string }[] }>(
    page,
    'GET',
    `/ext/agenda/appointments?service=${service.id}`,
  );
  expect(list.items.filter((a) => a.name.startsWith('Racer'))).toHaveLength(1);
  await one.context().close();
  await two.context().close();
});
