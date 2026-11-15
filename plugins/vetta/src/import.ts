/**
 * A WordPress import (`import.wxrMeta`, plugin API 1.48): the SEO of
 * categories, tags and other terms written with Rank Math (its term meta)
 * becomes Vetta's fields of the term. Entries need nothing here: the
 * WordPress Importer gives their Yoast SEO and Rank Math values to the SEO
 * fields that Vetta reads. Yoast SEO keeps its term values in an option
 * that WordPress exports leave out.
 */
import { TERM_GROUP } from './config.js';

/** The parts of a WordPress term this needs (`WxrMetaTerm`). */
export interface WxrTerm {
  ref: string;
  imported: boolean;
  meta: Record<string, string>;
}

/** Rank Math's own pattern for archives: left empty, the taxonomy's template applies. */
const DEFAULT_TITLE = /^%term%\s*(%page%\s*)?%sep%\s*%sitename%$/;

const clean = (value: string | undefined, max: number) =>
  (value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** Vetta's values of the imported terms, by ref (`{ 'vetta-term': {...} }`). */
export function termSeoFromWxr(
  terms: readonly WxrTerm[],
  metaValue: (text: string | undefined) => unknown,
): Record<string, Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const term of terms) {
    if (!term.imported) continue;
    const m = term.meta;
    // Vetta reads Rank Math's variables as they are (%term%, %sep%, %sitename%…).
    let title = clean(m.rank_math_title, 200);
    if (DEFAULT_TITLE.test(title)) title = '';
    let description = clean(m.rank_math_description, 400);
    if (description === '%term_description%') description = '';
    const keywords = clean(m.rank_math_focus_keyword, 300)
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 5)
      .join(', ');
    const robots = metaValue(m.rank_math_robots);
    const robotList = Array.isArray(robots)
      ? robots.map(String)
      : robots && typeof robots === 'object'
        ? Object.values(robots as Record<string, unknown>).map(String)
        : [];
    const canonical = (m.rank_math_canonical_url ?? '').trim();
    const ogTitle = clean(m.rank_math_facebook_title, 200);
    const ogDescription = clean(m.rank_math_facebook_description, 400);
    const imageId = Number(m.rank_math_facebook_image_id);
    const values: Record<string, unknown> = {
      ...(keywords ? { keywords } : {}),
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(robotList.includes('noindex') ? { noindex: true } : {}),
      ...(robotList.includes('nofollow') ? { nofollow: true } : {}),
      ...(/^https?:\/\/[^\s"'<>]+$/.test(canonical) ? { canonical } : {}),
      ...(ogTitle ? { ogTitle } : {}),
      ...(ogDescription ? { ogDescription } : {}),
      ...(Number.isInteger(imageId) && imageId > 0
        ? { ogImage: { $media: `att:${imageId}` } }
        : {}),
    };
    if (Object.keys(values).length > 0) out[term.ref] = { [TERM_GROUP]: values };
  }
  return out;
}
