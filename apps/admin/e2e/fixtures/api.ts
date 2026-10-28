/**
 * Signing in and calling the admin API from the signed-in page, shared by
 * specs. Specs share one database across browsers: what a spec creates it
 * removes, in a `finally`.
 */
import type { Page } from '@playwright/test';

// Development credentials seeded by tools/dev-db.
export const ADMIN = { email: 'admin@example.com', password: 'cleitext-admin' };

/** The public site (the server), as the browser reaches it. */
export const SITE =
  process.env.CLEITEXT_SERVER_URL?.replace('127.0.0.1', 'localhost') ?? 'http://localhost:3000';

export async function signIn(page: Page): Promise<void> {
  await page.goto('/cl-admin/login');
  await page.locator('input[autocomplete="username"]').fill(ADMIN.email);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/cl-admin/');
}

/** A call to the admin API from the signed-in page; a JSON content type only with a body. */
export function api<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const { token } = (await (await fetch('/api/v1/auth/csrf')).json()) as { token: string };
      const res = await fetch(`/api/v1${path}`, {
        method,
        // The server refuses a JSON content type without a body.
        headers: {
          'x-csrf-token': token,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
      return (res.status === 204 ? null : await res.json()) as T;
    },
    { method, path, body },
  );
}

/** Removes entries for good (trash, then delete), ignoring those already gone. */
export async function removeEntries(page: Page, ids: string[]): Promise<void> {
  for (const id of ids) {
    await api(page, 'POST', `/entries/${id}/trash`).catch(() => undefined);
    await api(page, 'DELETE', `/entries/${id}`).catch(() => undefined);
  }
}
