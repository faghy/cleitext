/**
 * Rich text of Fresco widgets (Text, Tabs, Accordion…) is HTML written in the
 * editor. Before it reaches a page it goes through this allowlist: known
 * tags and attributes only, safe link addresses, no scripts, styles or event
 * handlers. The same code runs in the editor and on the server.
 */
import { Parser } from 'htmlparser2';

const TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'ins',
  'mark',
  'small',
  'sub',
  'sup',
  'code',
  'pre',
  'kbd',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'span',
  'div',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'figure',
  'figcaption',
  'img',
]);

const VOID = new Set(['br', 'hr', 'img']);

/** Attributes allowed on every tag, plus some per tag. */
const COMMON = new Set(['class', 'id', 'dir', 'lang', 'title']);
const BY_TAG: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  ol: new Set(['start', 'reversed']),
};

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#|\?)/i;
const SAFE_SRC = /^(https?:\/\/|\/(?!\/))/i;

const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text: string) => escapeText(text).replace(/"/g, '&quot;');

function attribute(tag: string, name: string, value: string): string | null {
  const key = name.toLowerCase();
  if (!COMMON.has(key) && !BY_TAG[tag]?.has(key)) return null;
  if (key === 'href' && !SAFE_URL.test(value.trim())) return null;
  if (key === 'src' && !SAFE_SRC.test(value.trim())) return null;
  if (key === 'target' && value !== '_blank') return null;
  if (key === 'class' && !/^[\w\s-]{0,200}$/.test(value)) return null;
  if (key === 'id' && !/^[A-Za-z][\w-]{0,63}$/.test(value)) return null;
  return `${key}="${escapeAttr(value)}"`;
}

/** Allowed HTML only; text is escaped, the rest is dropped (its text kept). */
export function sanitizeRich(html: unknown): string {
  if (typeof html !== 'string' || !html) return '';
  let out = '';
  const open: string[] = [];
  // Inside <script>, <style> and similar, nothing is kept, not even the text.
  let skipping = 0;
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        const tag = name.toLowerCase();
        if (
          [
            'script',
            'style',
            'iframe',
            'object',
            'embed',
            'template',
            'noscript',
            'textarea',
            'select',
            'svg',
            'math',
          ].includes(tag)
        ) {
          skipping++;
          return;
        }
        if (skipping || !TAGS.has(tag)) return;
        const list = Object.entries(attrs)
          .map(([k, v]) => attribute(tag, k, v))
          .filter((a): a is string => a !== null);
        if (tag === 'a' && attrs.target === '_blank' && !list.some((a) => a.startsWith('rel='))) {
          list.push('rel="noopener"');
        }
        out += `<${tag}${list.length ? ` ${list.join(' ')}` : ''}>`;
        if (!VOID.has(tag)) open.push(tag);
      },
      ontext(text) {
        if (!skipping) out += escapeText(text);
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        if (
          [
            'script',
            'style',
            'iframe',
            'object',
            'embed',
            'template',
            'noscript',
            'textarea',
            'select',
            'svg',
            'math',
          ].includes(tag)
        ) {
          skipping = Math.max(0, skipping - 1);
          return;
        }
        if (skipping || !TAGS.has(tag) || VOID.has(tag)) return;
        const at = open.lastIndexOf(tag);
        if (at === -1) return;
        // Close what was left open inside it.
        while (open.length > at) out += `</${open.pop()!}>`;
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  while (open.length) out += `</${open.pop()!}>`;
  return out;
}

/** Plain text: no markup at all (titles, labels). */
export function plainText(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value === undefined || value === null
      ? ''
      : String(value);
}
