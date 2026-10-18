/** Slug from a title: transliterated, lowercase, hyphen-separated (RF-CNT-11). */
export function slugify(input: string, maxLength = 80): string {
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

/** First free slug among `base`, `base-2`, `base-3`… */
export function nextFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
