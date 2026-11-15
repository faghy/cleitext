/**
 * A strict sanitizer for the HTML of fediverse replies. Mastodon already
 * cleans it, but the page shows what another server sent: only a few text
 * tags are kept, links only to http(s) with `rel="nofollow ugc noopener
 * noreferrer"`, no other attribute but two classes Mastodon uses to shorten
 * links. Everything else is dropped, the text of unknown tags kept (not that
 * of scripts, styles and the like). No I/O here.
 */

const ALLOWED = new Set([
  'p',
  'br',
  'a',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'del',
  's',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
]);
/** Their content is dropped with them. */
const DROPPED = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'template',
  'textarea',
  'title',
  'svg',
  'math',
  'noscript',
  'select',
  'head',
  'frameset',
  'frame',
  'noembed',
  'xmp',
]);
const CLASSES = new Set(['invisible', 'ellipsis']);
export const MAX_INPUT = 20_000;

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes the entities of an attribute value (numeric and the usual named ones). */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});?/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Text of the source as safe HTML: entities kept, stray `&`, `<`, `>` escaped. */
function text(value: string): string {
  return value
    .replace(/&(?!(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,31});)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function attributes(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(re)) {
    const name = match[1]!.toLowerCase();
    if (!map.has(name)) map.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return map;
}

/** An http(s) address with nothing hidden in it, else null. */
export function safeHref(value: string | undefined): string | null {
  if (!value) return null;
  const href = value.trim();
  // eslint-disable-next-line no-control-regex
  if (!/^https?:\/\//i.test(href) || /[\s\u0000-\u001f\u007f]/.test(href) || href.length > 2000)
    return null;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? href : null;
  } catch {
    return null;
  }
}

function openTag(name: string, source: string): string {
  if (name === 'a') {
    const href = safeHref(attributes(source).get('href'));
    return href
      ? `<a href="${escapeHtml(href)}" rel="nofollow ugc noopener noreferrer" target="_blank">`
      : '<a>';
  }
  if (name === 'span') {
    const classes = (attributes(source).get('class') ?? '')
      .split(/\s+/)
      .filter((c) => CLASSES.has(c));
    return classes.length ? `<span class="${classes.join(' ')}">` : '<span>';
  }
  return `<${name}>`;
}

/** The HTML of a reply, made safe to put in the page. */
export function sanitizeHtml(input: unknown): string {
  if (typeof input !== 'string' || !input) return '';
  const source = input.slice(0, MAX_INPUT);
  const tokens =
    /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<[!?][^>]*>?|<\/?([a-z][a-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<|[^<]+/gi;
  const open: string[] = [];
  let out = '';
  let skip: string | null = null;
  for (const match of source.matchAll(tokens)) {
    const token = match[0];
    const tag = match[1]?.toLowerCase();
    if (skip) {
      if (tag === skip && token.startsWith('</')) skip = null;
      continue;
    }
    if (!tag) {
      // Comments, doctype and processing instructions go; text stays.
      if (token.startsWith('<!') || token.startsWith('<?')) continue;
      out += text(token);
      continue;
    }
    if (token.startsWith('</')) {
      const at = open.lastIndexOf(tag);
      if (at < 0) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }
    if (DROPPED.has(tag)) {
      if (!/\/\s*>$/.test(token)) skip = tag;
      continue;
    }
    if (!ALLOWED.has(tag)) continue;
    if (tag === 'br') {
      out += '<br>';
      continue;
    }
    // No links inside links.
    if (tag === 'a' && open.includes('a')) continue;
    out += openTag(tag, match[2] ?? '');
    open.push(tag);
  }
  while (open.length) out += `</${open.pop()}>`;
  return out;
}
