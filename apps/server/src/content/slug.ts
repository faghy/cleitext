/**
 * The longest slug (core 0.82): as WordPress's `post_name`, so addresses of
 * an imported site stay the same. Slugs made from a title stay shorter
 * (`TITLE_SLUG_MAX`), as before.
 */
export const SLUG_MAX = 200;
/** Slugs made from a title, not written by someone. */
export const TITLE_SLUG_MAX = 80;

/** Slug from a title: transliterated, lowercase, hyphen-separated (RF-CNT-11). */
export function slugify(input: string, maxLength = TITLE_SLUG_MAX): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'o')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug;
}

/** What a permalink looks like, placeholders aside: types with the same one share addresses. */
export function permalinkShape(permalink: string): string {
  return permalink.replace(/\{(slug|path)\}/g, '{x}').replace(/\{(year|month)\}/g, '{n}');
}

/**
 * First free slug among `base`, `base-2`, `base-3`… as WordPress's
 * `wp_unique_post_slug`. With `maxLength` the suffix stays within it: the
 * base is shortened to make room (`…-abilita` → `…-abili-2`), so a slug cut
 * at the limit never becomes the same as another one.
 */
export function nextFreeSlug(
  base: string,
  taken: ReadonlySet<string>,
  maxLength = Number.POSITIVE_INFINITY,
): string {
  const first = base.length > maxLength ? base.slice(0, maxLength).replace(/-+$/g, '') : base;
  if (!taken.has(first)) return first;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const stem = first.slice(0, Math.max(1, maxLength - suffix.length)).replace(/-+$/g, '');
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
