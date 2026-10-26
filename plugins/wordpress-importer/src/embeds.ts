/**
 * WordPress's oEmbed cache (since 1.32.0): the HTML its providers answered
 * for the addresses embedded in a post, kept in the post's `_oembed_<hash>`
 * meta (and in `oembed_cache` posts for addresses outside posts). The hash
 * is of the address and the embed's size, so the HTML is matched to the
 * address by the address it links to. Used only for providers Cleitext has
 * no player for: the others become Embed blocks.
 */

type Node = Record<string, unknown>;

/** WordPress caches failed lookups as this. */
const FAILED = '{{unknown}}';

const variants = (url: string): string[] => {
  const base = url
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '');
  const bare = base.replace(/^https?:\/\/(www\.)?/i, '');
  return [url.trim(), base, bare, encodeURIComponent(base), bare.replaceAll('/', '\\/')].filter(
    (v) => v.length > 8,
  );
};

/** The cached HTML of the post's embeds, by the address they show. */
export function oembedLookup(
  rows: Node[],
  text: (value: unknown) => string,
  shared: readonly string[] = [],
): (url: string) => string | undefined {
  const own = rows
    .filter((row) => /^_oembed_[0-9a-f]{32}$/.test(text(row['wp:meta_key'])))
    .map((row) => text(row['wp:meta_value']).trim());
  const cached = [...own, ...shared].filter((html) => html && html !== FAILED && /</.test(html));
  if (!cached.length) return () => undefined;
  return (url) => {
    const wanted = variants(url);
    return cached.find((html) => {
      const plain = html.replaceAll('&amp;', '&');
      return wanted.some((v) => plain.includes(v));
    });
  };
}

/** The HTML of WordPress's `oembed_cache` posts (addresses embedded outside posts). */
export function sharedOembeds(items: Node[], text: (value: unknown) => string): string[] {
  return items
    .filter((item) => text(item['wp:post_type']) === 'oembed_cache')
    .map((item) => text(item['content:encoded']).trim())
    .filter((html) => html && html !== FAILED);
}
