/**
 * Pure helpers of the public downloads (`/downloads/<slug>/…`) and of the
 * anonymous server reports (`…/v1/server-report`).
 */

const SLUG_RE = /^[a-z][a-z0-9-]{1,39}$/;
export const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;
const FILENAME_RE = /^[a-z0-9][a-z0-9._-]{0,120}\.zip$/;

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * Compares two versions by all their digit groups (split on `.` and `-`):
 * 0.6.0-1 > 0.5.1-1 > 0.5.0-2 > 0.5.0. Negative when a < b.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split(/[.+-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : -1));
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

/** The item with the highest version, or null. */
export function latestOf<T extends { version: string }>(items: T[]): T | null {
  return items.reduce<T | null>(
    (best, item) => (!best || compareVersions(item.version, best.version) > 0 ? item : best),
    null,
  );
}

/** A file name safe in an address and a header: lower case, `.zip`; null otherwise. */
export function safeFilename(name: unknown): string | null {
  const base = text(name, 200).split(/[\\/]/).pop()!.toLowerCase().replace(/\s+/g, '-');
  return FILENAME_RE.test(base) ? base : null;
}

/** Whether the bytes are a zip archive (local file header). */
export function isZip(data: Buffer): boolean {
  return data.length > 22 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 3 && data[3] === 4;
}

export type ServerReport =
  | {
      forget: false;
      product: string;
      server: string;
      version: string;
      panel: string;
      panelVersion: string;
      installations: number;
    }
  | { forget: true; product: string; server: string };

/**
 * A server report as the Toolkit for Plesk sends it, checked field by field;
 * anything else in the body is dropped. Null when not valid.
 */
export function parseServerReport(body: unknown): ServerReport | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const product = text(b.product, 40);
  const server = text(b.server, 64);
  if (!SLUG_RE.test(product) || !/^[0-9a-f]{64}$/.test(server)) return null;
  if (b.forget === true) return { forget: true, product, server };
  const version = text(b.version, 40);
  const panel = text(b.panel, 20);
  const panelVersion = text(b.panelVersion, 20);
  const installations = b.installations;
  if (
    !VERSION_RE.test(version) ||
    !/^[a-z][a-z0-9-]{1,19}$/.test(panel) ||
    !/^\d+(\.\d+){0,3}$/.test(panelVersion) ||
    typeof installations !== 'number' ||
    !Number.isInteger(installations) ||
    installations < 0 ||
    installations > 100_000
  ) {
    return null;
  }
  return { forget: false, product, server, version, panel, panelVersion, installations };
}
