/**
 * Per-process limits for public actions (sign-ups, comments, likes): enough
 * against casual abuse on one server; login keeps its own database throttle.
 */
const buckets = new Map<string, number[]>();

/** True when `key` may act again: at most `max` times in `windowMs`. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const times = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (times.length >= max) {
    buckets.set(key, times);
    return false;
  }
  times.push(now);
  buckets.set(key, times);
  if (buckets.size > 50_000) buckets.clear();
  return true;
}

/** For tests. */
export function resetLimits(): void {
  buckets.clear();
}

/** A text in the visitor's language: Italian or English for now. */
export const say = (locale: string, en: string, it: string): string =>
  locale.startsWith('it') ? it : en;

/** A URL-safe name from someone's display name, e.g. "Anna Rossi" → "anna-rossi". */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'user';
}
