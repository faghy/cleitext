/**
 * The texts of a testimonial (description, name, company) are kept as
 * small HTML strings inside the `test_block` list, as Spectra saves them.
 * Only simple inline formatting reaches the page: bold, italic, underline,
 * strike, highlight, super/subscript, line breaks and safe links; every
 * other tag is dropped (its text kept) and the rest is escaped.
 */

const KEPT = new Set([
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'mark',
  'sup',
  'sub',
  'code',
  'br',
]);
const SAFE_HREF = /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i;

const escapeText = (text: string) =>
  text
    .replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escapeAttr = (text: string) =>
  text
    .replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');

/** Inline HTML reduced to safe formatting. */
export function safeInline(html: unknown): string {
  if (typeof html !== 'string' || !html) return '';
  // Scripts, styles and comments go entirely.
  const source = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|template|iframe|object)\b[\s\S]*?<\/\1\s*>/gi, '');
  let out = '';
  const open: string[] = [];
  const pattern = /<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|([^<]+|<)/g;
  for (const match of source.matchAll(pattern)) {
    if (match[3] !== undefined) {
      out += escapeText(match[3]);
      continue;
    }
    const tag = match[1]!.toLowerCase();
    const closing = match[0].startsWith('</');
    if (tag === 'a') {
      if (closing) {
        if (open.includes('a')) {
          out += '</a>';
          open.splice(open.lastIndexOf('a'), 1);
        }
        continue;
      }
      const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(match[2] ?? '');
      const value = (href?.[1] ?? href?.[2] ?? '').trim();
      const blank = /\starget\s*=\s*["']?_blank/i.test(match[2] ?? '');
      if (value && SAFE_HREF.test(value)) {
        out += `<a href="${escapeAttr(value)}"${blank ? ' target="_blank" rel="noopener"' : ''}>`;
        open.push('a');
      }
      continue;
    }
    if (!KEPT.has(tag)) continue;
    if (tag === 'br') {
      if (!closing) out += '<br>';
      continue;
    }
    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at === -1) continue;
      // Tags left open inside are closed first.
      while (open.length > at) out += `</${open.pop()}>`;
    } else {
      out += `<${tag}>`;
      open.push(tag);
    }
  }
  while (open.length) out += `</${open.pop()}>`;
  return out;
}
