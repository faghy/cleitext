/**
 * Rich text of `richtext` fields (plugin API 1.48): a small HTML subset,
 * cleaned on save and again when shown. Every tag is written again from
 * scratch, so no attribute other than a link's address and target survives.
 */

/** Tags kept (anything else is dropped, its text kept). */
const ALLOWED = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'a',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'code',
  'sub',
  'sup',
]);
const VOID = new Set(['br']);
/** Dropped with everything inside them. */
const DROPPED =
  /<(script|style|iframe|object|embed|template|noscript|textarea|title|svg|math)\b[\s\S]*?(<\/\1\s*>|$)/gi;
const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#|\?)/i;
/** Comments, tags (with quoted attributes), doctypes; a `<` not starting a tag is text. */
const TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>|<[!?][^>]*>/g;

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Character references decoded (for checking a link's address). */
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (match, ref: string) => {
    if (ref[0] === '#') {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return NAMED[ref.toLowerCase()] ?? match;
  });
}

function escapeText(text: string): string {
  return text
    .replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(
    attributes,
  );
  return match ? (match[2] ?? match[3] ?? match[4] ?? '') : undefined;
}

/** A link's opening tag: its address when it is safe, and a new tab when asked. */
function linkTag(attributes: string): string {
  const raw = attribute(attributes, 'href');
  // Control characters and spaces are ignored by browsers in a scheme ("java\tscript:").
  // eslint-disable-next-line no-control-regex
  const href = raw === undefined ? '' : decodeEntities(raw).replace(/[\u0000- ]/g, '');
  const target = attribute(attributes, 'target') === '_blank';
  const parts = ['<a'];
  if (href && SAFE_HREF.test(href)) parts.push(` href="${escapeAttribute(href)}"`);
  if (target) parts.push(' target="_blank" rel="noopener noreferrer"');
  return `${parts.join('')}>`;
}

/**
 * Rich text cleaned: paragraphs, line breaks, bold, italic, underline,
 * strike-through, links, lists, headings (2 to 4), quotes, code, sub- and
 * superscript. Other tags are dropped (scripts and styles with their
 * content), tags left open are closed.
 */
export function sanitizeRichText(html: string): string {
  const source = html.replace(DROPPED, '');
  const out: string[] = [];
  const open: string[] = [];
  let at = 0;
  for (const match of source.matchAll(TOKEN)) {
    out.push(escapeText(source.slice(at, match.index)));
    at = match.index + match[0].length;
    const name = match[2]?.toLowerCase();
    if (!name || !ALLOWED.has(name)) continue;
    if (match[1]) {
      // A closing tag closes what is open inside it; one never opened is dropped.
      const index = open.lastIndexOf(name);
      if (index === -1) continue;
      while (open.length > index) out.push(`</${open.pop()!}>`);
      continue;
    }
    if (VOID.has(name)) {
      out.push(`<${name}>`);
      continue;
    }
    out.push(name === 'a' ? linkTag(match[3] ?? '') : `<${name}>`);
    open.push(name);
  }
  out.push(escapeText(source.slice(at)));
  while (open.length) out.push(`</${open.pop()!}>`);
  return out.join('').trim();
}

/** The text of rich text, without tags (search, plain-text output). */
export function richTextToPlain(html: string): string {
  return decodeEntities(
    html.replace(/<(br|\/p|\/li|\/h[2-4]|\/blockquote)\s*\/?>/gi, '$&\n').replace(/<[^>]*>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
