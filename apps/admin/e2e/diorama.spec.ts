/**
 * Diorama, the slider plugin: the fast path (two pictures, a title, done),
 * the slider on a published page that changes slide, and the visual editor
 * (a layer dragged on the canvas, then saved; a Google font picked for its
 * heading, drawn in the canvas and kept on the site). The site may have one slider
 * in the free version, so the test starts by removing the site's sliders.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };
const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';

test.beforeAll(() => {
  execFileSync(
    'node',
    [
      '--env-file-if-exists=.env',
      'packages/cli/dist/bin.js',
      'plugin:install',
      'plugins/diorama',
      '--build',
    ],
    { cwd: root, stdio: 'pipe' },
  );
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

/** Two different pictures, drawn in the browser and uploaded to the media library. */
async function uploadPictures(page: Page, stamp: string): Promise<string[]> {
  return page.evaluate(async (stamp) => {
    const { token } = (await (await fetch('/api/v1/auth/csrf')).json()) as { token: string };
    const ids: string[] = [];
    for (const [i, colors] of [
      ['#0ea5e9', '#1e3a8a'],
      ['#f97316', '#7c2d12'],
    ].entries()) {
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 900;
      const c = canvas.getContext('2d')!;
      const g = c.createLinearGradient(0, 0, 1600, 900);
      g.addColorStop(0, colors[0]!);
      g.addColorStop(1, colors[1]!);
      c.fillStyle = g;
      c.fillRect(0, 0, 1600, 900);
      c.fillStyle = 'rgba(255,255,255,.25)';
      c.beginPath();
      c.arc(1200, 300 + i * 200, 220, 0, Math.PI * 2);
      c.fill();
      c.fillText(stamp, 20, 20);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      const form = new FormData();
      form.append('file', blob, `diorama-${stamp}-${i + 1}.png`);
      const res = await fetch('/api/v1/media', {
        method: 'POST',
        headers: { 'x-csrf-token': token },
        body: form,
      });
      ids.push(((await res.json()) as { id: string }).id);
    }
    return ids;
  }, stamp);
}

test('Diorama: the fast path, a slider that moves on a page, and a layer dragged in the editor', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await api(page, 'POST', '/plugins/diorama/activate', {}).catch(() => undefined);
  // One slider per site in the free version: start without any.
  const before = await api<{ sliders: { id: string }[] }>(page, 'GET', '/ext/diorama/sliders');
  for (const slider of before.sliders)
    await api(page, 'DELETE', `/ext/diorama/sliders/${slider.id}`);

  const stamp = Date.now().toString(36);
  await uploadPictures(page, stamp);

  // The fast path: New slider → From your pictures → two pictures → a title → Create.
  await page.goto('/cl-admin/ext/diorama');
  await page.getByTestId('dio-new').click();
  await page.getByTestId('dio-door-pictures').click();
  await page.getByRole('searchbox').fill(`diorama-${stamp}`);
  const items = page.getByTestId('dio-media-item');
  await expect(items).toHaveCount(2);
  await items.nth(1).click();
  await items.nth(0).click();
  await page.getByTestId('dio-media-choose').click();
  await page.getByTestId('dio-quick-name').fill(`Home ${stamp}`);
  await page.getByTestId('dio-quick-title').first().fill('Welcome to the harbour');
  await page.getByTestId('dio-quick-create').click();

  // The editor opens on the new slider.
  await page.waitForURL(/slider=[0-9a-f-]{36}/);
  const id = new URL(page.url()).searchParams.get('slider')!;
  const canvas = page.getByTestId('dio-canvas');
  await expect(canvas.locator('.dio__slide')).toHaveCount(1);
  await expect(canvas.getByText('Welcome to the harbour')).toBeVisible();

  // A second slider is not made: the invitation to Pro says why, only now.
  const second = await page.evaluate(async () => {
    const { token } = (await (await fetch('/api/v1/auth/csrf')).json()) as { token: string };
    const res = await fetch('/api/v1/ext/diorama/sliders', {
      method: 'POST',
      headers: { 'x-csrf-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ template: 'hero-cta' }),
    });
    return { status: res.status, body: await res.json() };
  });
  expect(second.status).toBe(409);
  expect(second.body.code).toBe('limit');

  // The visual path: drag the content box to the right on the canvas, then save.
  const box = canvas.locator('.dio__layers > [data-dio-layer]').first();
  const start = (await box.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 60, start.y + start.height / 2 - 10, {
    steps: 6,
  });
  await page.mouse.move(start.x + start.width / 2 + 120, start.y + start.height / 2 - 20, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(page.getByTestId('dio-selection')).toBeVisible();
  const moved = (await box.boundingBox())!;
  expect(moved.x).toBeGreaterThan(start.x + 40);
  await page.getByTestId('dio-save').click();
  await expect(page.getByTestId('dio-save')).toHaveText(/Saved|Salvato/);
  const saved = await api<{ data: { slides: { layers: { pos: { base: { x: number } } }[] }[] } }>(
    page,
    'GET',
    `/ext/diorama/sliders/${id}`,
  );
  expect(saved.data.slides[0]!.layers[0]!.pos.base.x).toBeGreaterThan(7.5);

  // Diorama 1.2: a Google font from the picker's search, drawn in the canvas, and line breaks.
  await canvas.locator('.dio-heading').first().click();
  await page.getByRole('tab', { name: /^(Style|Stile)$/ }).click();
  await page.getByTestId('dio-font').click();
  await page.getByTestId('dio-font-search').fill('Rubik');
  await page.getByRole('option', { name: 'Rubik', exact: true }).click();
  await expect(page.getByTestId('dio-font')).toContainText('Rubik');
  await expect
    .poll(() =>
      canvas
        .locator('.dio-heading')
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily),
    )
    .toContain('Rubik');
  await page.getByTestId('dio-text-wrap').selectOption('normal');
  await page.getByTestId('dio-save').click();
  await expect(page.getByTestId('dio-save')).toHaveText(/Saved|Salvato/);
  const styled = await api<{
    data: { slides: { layers: { children: { style: { base: Record<string, unknown> } }[] }[] }[] };
  }>(page, 'GET', `/ext/diorama/sliders/${id}`);
  expect(styled.data.slides[0]!.layers[0]!.children[0]!.style.base).toMatchObject({
    fontFamily: 'Rubik',
    textWrap: 'normal',
  });

  // A page with the block, published: the slider shows and changes slide.
  const entry = await api<{ id: string }>(page, 'POST', '/entries', {
    type: 'page',
    title: `Slider ${stamp}`,
    document: {
      schema: 1,
      blocks: [{ id: `dio${stamp}`, type: 'diorama/slider', v: 1, attrs: { slider: id } }],
    },
  });
  const published = await api<{ slug: string }>(page, 'POST', `/entries/${entry.id}/publish`, {});
  const visitor = await context.browser()!.newContext();
  const site = await visitor.newPage();
  const siteErrors: string[] = [];
  site.on('pageerror', (e) => siteErrors.push(e.message));
  await site.goto(`${SITE}/${published.slug}`);
  const slider = site.locator('section.dio');
  await expect(slider).toHaveAttribute('aria-roledescription', 'carousel');
  const slide = (n: number) => slider.locator(`.dio__slide[data-index="${n}"]`);
  await expect(slide(0)).toHaveClass(/is-active/);
  await expect(slide(0)).toContainText('Welcome to the harbour');
  // The slider's Google font is kept on the site: the page never names Google.
  expect(await site.content()).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  await slider.locator('[data-dio-next]').click();
  await expect(slide(1)).toHaveClass(/is-active/);
  await expect(slide(0)).not.toHaveClass(/is-active/);
  await expect(slide(0)).toHaveAttribute('aria-hidden', 'true');
  await expect(slider.locator('.dio__bullet').nth(1)).toHaveAttribute('aria-current', 'true');
  // The pause button stops autoplay and says so.
  const pause = slider.locator('[data-dio-pause]');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-label', 'Play the slideshow');
  expect(siteErrors).toEqual([]);
  await visitor.close();
  expect(errors).toEqual([]);
});
