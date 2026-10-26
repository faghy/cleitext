/**
 * The addresses of a WordPress site, read from its export (since 1.31.0).
 * WXR files do not carry the `permalink_structure` option, but every item's
 * `<link>` is its real address: the structure of the posts is the one their
 * links share (`/%postname%/` → `/{slug}`, `/%year%/%monthnum%/%postname%/`
 * → `/{year}/{month}/{slug}`). The first part of category and tag archives
 * is read from the links to them in the content and in menus.
 */

/** What the structure of the posts is read from: each published post. */
export interface PostAddress {
  id: number;
  /** `<link>`, as exported. */
  link: string;
  /** `wp:post_name`. */
  slug: string;
  /** `wp:post_date`: `2024-05-02 08:00:00`. */
  date: string;
  /** Slugs of its categories (`%category%`). */
  categories: string[];
}

export interface PostsPermalink {
  /** The structure as WordPress writes it: `/%year%/%monthnum%/%postname%/`. */
  wordpress: string;
  /** Cleitext's permalink for it, or null when Cleitext has no equivalent. */
  cleitext: string | null;
}

/** Share of the posts that must agree on a structure (the rest redirect). */
const AGREEMENT = 0.8;

const WORDPRESS_TAGS: Record<string, string> = {
  '{slug}': '%postname%',
  '{year}': '%year%',
  '{month}': '%monthnum%',
  '{day}': '%day%',
  '{id}': '%post_id%',
  '{category}': '%category%',
};

const LITERAL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The path of an address of the site, decoded, without host, query and trailing slash. */
export function sitePath(link: string, baseUrl: string): string | null {
  let url: URL;
  let base: URL;
  try {
    base = new URL(baseUrl);
    url = new URL(link, base);
  } catch {
    return null;
  }
  if (url.host.replace(/^www\./, '') !== base.host.replace(/^www\./, '')) return null;
  if (url.search) return null;
  // A site in a folder (example.com/blog): its addresses start after it.
  const root = base.pathname.replace(/\/+$/, '');
  let path = url.pathname;
  if (root) {
    if (path !== root && !path.startsWith(`${root}/`)) return null;
    path = path.slice(root.length);
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  return path.replace(/\/+$/, '') || '/';
}

/** The structure of one post's address, as placeholders (`/{year}/{slug}`), or null. */
function structureOf(post: PostAddress, baseUrl: string): string | null {
  const path = sitePath(post.link, baseUrl);
  let slug: string;
  try {
    slug = decodeURIComponent(post.slug);
  } catch {
    slug = post.slug;
  }
  if (!path || path === '/' || !slug) return null;
  const [, year = '', month = '', day = ''] = /^(\d{4})-(\d{2})-(\d{2})/.exec(post.date) ?? [];
  const categories = new Set(post.categories);
  const tokens: string[] = [];
  for (const segment of path.split('/').slice(1)) {
    const previous = tokens.at(-1);
    if (segment === slug) tokens.push('{slug}');
    else if (segment === year && !tokens.includes('{year}')) tokens.push('{year}');
    else if (segment === month && previous === '{year}') tokens.push('{month}');
    else if (segment === day && previous === '{month}') tokens.push('{day}');
    else if (segment === String(post.id)) tokens.push('{id}');
    else if (categories.has(segment)) {
      // Categories with parents are one placeholder: /parent/child/.
      if (previous !== '{category}') tokens.push('{category}');
    } else tokens.push(segment);
  }
  return tokens.includes('{slug}') || tokens.includes('{id}') ? `/${tokens.join('/')}` : null;
}

/**
 * The structure of the posts' addresses: the one most of them share, as
 * WordPress writes it and as Cleitext's permalink (null when Cleitext has no
 * equivalent, such as `%day%`, `%post_id%` or `%category%`). Null when the
 * posts do not agree or use plain addresses (`/?p=123`).
 */
export function postsPermalink(posts: PostAddress[], baseUrl: string): PostsPermalink | null {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const structure = structureOf(post, baseUrl);
    if (structure) counts.set(structure, (counts.get(structure) ?? 0) + 1);
  }
  const [best, n = 0] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!best || n < posts.length * AGREEMENT) return null;
  const segments = best.split('/').slice(1);
  const wordpress = `/${segments.map((s) => WORDPRESS_TAGS[s] ?? s).join('/')}/`;
  const supported =
    segments.at(-1) === '{slug}' &&
    segments
      .slice(0, -1)
      .every((s) => s === '{year}' || s === '{month}' || (LITERAL.test(s) && !s.startsWith('{')));
  return { wordpress, cleitext: supported ? best : null };
}

/**
 * The first part of a taxonomy's archives (`category` for /category/news/,
 * '' for /news/), from links to its terms: null when no link says it, or
 * the links do not agree. Addresses of posts and pages are not archives.
 */
export function taxonomyBase(
  links: string[],
  baseUrl: string,
  termSlugs: ReadonlySet<string>,
  itemPaths: ReadonlySet<string>,
): string | null {
  const counts = new Map<string, number>();
  let total = 0;
  for (const link of links) {
    const path = sitePath(link, baseUrl);
    if (!path || path === '/' || itemPaths.has(path)) continue;
    const segments = path.split('/').slice(1);
    // Feeds and later pages of an archive: /news/feed, /news/page/2.
    if (segments.at(-1) === 'feed') segments.pop();
    if (segments.length > 2 && segments.at(-2) === 'page' && /^\d+$/.test(segments.at(-1)!)) {
      segments.splice(-2);
    }
    if (!termSlugs.has(segments.at(-1) ?? '')) continue;
    // Terms with parents: /category/parent/child.
    while (segments.length > 0 && termSlugs.has(segments.at(-1)!)) segments.pop();
    if (segments.length > 1) continue;
    const base = segments[0] ?? '';
    if (base && !LITERAL.test(base)) continue;
    counts.set(base, (counts.get(base) ?? 0) + 1);
    total++;
  }
  const [best, n = 0] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  return best !== undefined && n >= total * AGREEMENT ? best : null;
}

/** Addresses in the `href` of links of an HTML text. */
export function hrefs(html: string): string[] {
  return [...html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) =>
    m[1]!.replace(/&amp;/g, '&'),
  );
}

const decodeXml = (value: string) =>
  value
    .replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

/**
 * The structure of the posts' addresses of an export, read without an XML
 * parser: for the admin's preview, before the file is uploaded.
 */
export function scanPostsPermalink(xml: string): PostsPermalink | null {
  const tag = (chunk: string, name: string) => {
    const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(chunk);
    return match ? decodeXml(match[1]!) : '';
  };
  const head = xml.slice(0, Math.max(0, xml.indexOf('<item>')) || 20_000);
  const baseUrl = tag(head, 'wp:base_blog_url') || tag(head, 'link');
  const posts: PostAddress[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const chunk = match[1]!;
    if (tag(chunk, 'wp:post_type') !== 'post' || tag(chunk, 'wp:status') !== 'publish') continue;
    posts.push({
      id: Number(tag(chunk, 'wp:post_id')) || 0,
      link: tag(chunk, 'link'),
      slug: tag(chunk, 'wp:post_name'),
      date: tag(chunk, 'wp:post_date'),
      categories: [...chunk.matchAll(/<category\s+domain="category"\s+nicename="([^"]*)"/g)].map(
        (m) => decodeXml(m[1]!),
      ),
    });
  }
  return posts.length > 0 && baseUrl ? postsPermalink(posts, baseUrl) : null;
}
