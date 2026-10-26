/**
 * WordPress shortcodes (`[tag attr="value"]`, `[tag]content[/tag]`) during an
 * import: parsed as WordPress does (`get_shortcode_regex`,
 * `shortcode_parse_atts`), so that plugins can turn the ones standing alone
 * into their blocks (the `import.shortcode` filter, plugin API 1.36).
 */
import { newBlockId } from '../block-id.js';
import type { CxdBlock } from '../cxd.js';

/** A shortcode as written in the content. */
export interface Shortcode {
  /** Its name, e.g. `kross-booking`. */
  tag: string;
  /** Attributes by name (lowercase); positional ones by index (`0`, `1`…). */
  attrs: Record<string, string>;
  /** The text between `[tag]` and `[/tag]`, or null when it does not enclose any. */
  content: string | null;
  /** The shortcode as written. */
  text: string;
}

/** A part of some HTML: HTML to keep, or a shortcode standing alone. */
export type ShortcodePiece = { html: string } | { shortcode: Shortcode };

/**
 * Shortcodes whose text is part of something else (an image's caption):
 * they are never taken apart from it.
 */
const KEPT = new Set(['caption', 'wp_caption']);

/** WordPress's shortcode regex, for any lowercase name; `[[tag]]` is an escaped one. */
function shortcodeRegex(): RegExp {
  return /\[(\[?)([a-z][a-z0-9_-]*)(?![\w-])([^\]/]*(?:\/(?!\])[^\]/]*)*?)(?:(\/)\]|\](?:([^[]*(?:\[(?!\/\2\])[^[]*)*)\[\/\2\])?)(\]?)/g;
}

const QUOTES: Record<string, string> = {
  '&quot;': '"',
  '&#34;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&#8220;': '"',
  '&#8221;': '"',
  '&#8243;': '"',
  '&#8216;': "'",
  '&#8217;': "'",
  '&#8242;': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2033': '"',
  '\u2018': "'",
  '\u2019': "'",
  '\u2032': "'",
};

function decodeValue(value: string): string {
  return value
    .replace(/&#(\d{1,7});/g, (_, code: string) => safeChar(Number(code)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, code: string) => safeChar(parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function safeChar(code: number): string {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

/**
 * Attributes of a shortcode, as WordPress's `shortcode_parse_atts`: names
 * lowercased, values in double, single or no quotes, the rest positional.
 * Quotes typed as entities or curly quotes (a visual editor) count too.
 */
export function parseShortcodeAttrs(text: string): Record<string, string> {
  const source = text
    .replace(
      /&quot;|&#34;|&#0?39;|&#82(?:20|21|43|16|17|42);|[\u201c\u201d\u2033\u2018\u2019\u2032]/g,
      (m) => QUOTES[m] ?? m,
    )
    .replace(/&nbsp;|[\u00a0\u200b]/g, ' ');
  const attrs: Record<string, string> = {};
  const pattern =
    /([\w-]+)\s*=\s*"([^"]*)"(?:\s|$)|([\w-]+)\s*=\s*'([^']*)'(?:\s|$)|([\w-]+)\s*=\s*([^\s'"]+)(?:\s|$)|"([^"]*)"(?:\s|$)|'([^']*)'(?:\s|$)|(\S+)(?:\s|$)/g;
  let position = 0;
  for (const m of source.matchAll(pattern)) {
    if (m[1] !== undefined) attrs[m[1].toLowerCase()] = decodeValue(m[2]!);
    else if (m[3] !== undefined) attrs[m[3].toLowerCase()] = decodeValue(m[4]!);
    else if (m[5] !== undefined) attrs[m[5].toLowerCase()] = decodeValue(m[6]!);
    else {
      const value = m[7] ?? m[8] ?? m[9] ?? '';
      attrs[String(position++)] = decodeValue(value);
    }
  }
  return attrs;
}

/** The shortcodes of a text, in order (escaped `[[tag]]` ones left out). */
export function findShortcodes(text: string): (Shortcode & { index: number })[] {
  const found: (Shortcode & { index: number })[] = [];
  for (const m of text.matchAll(shortcodeRegex())) {
    if (m[1] === '[' && m[6] === ']') continue;
    found.push({
      tag: m[2]!,
      attrs: parseShortcodeAttrs(m[3] ?? ''),
      content: m[5] ?? null,
      text: m[0],
      index: m.index,
    });
  }
  return found;
}

function withoutIndex(found: Shortcode & { index: number }): Shortcode {
  return { tag: found.tag, attrs: found.attrs, content: found.content, text: found.text };
}

/**
 * The shortcode a text is made of, alone (spaces and `&nbsp;` around it
 * allowed), or null.
 */
export function wholeShortcode(text: string): Shortcode | null {
  const trimmed = text.replace(/^(?:\s|&nbsp;)+|(?:\s|&nbsp;)+$/g, '');
  const [first] = findShortcodes(trimmed);
  if (!first || first.index !== 0 || first.text.length !== trimmed.length) return null;
  if (KEPT.has(first.tag)) return null;
  return withoutIndex(first);
}

/** Spaces, `&nbsp;` and line breaks between shortcodes standing alone. */
const BETWEEN = /^(?:\s|&nbsp;|<br\s*\/?>)*$/i;

/**
 * The shortcodes of a text made only of shortcodes, one per line (empty
 * lines and `<br>` allowed), or null when it holds anything else. An
 * enclosing shortcode may span several lines and hold others, e.g. The
 * Newsletter Plugin's `[newsletter_form]` with its `[newsletter_field]`s.
 */
export function shortcodeLines(text: string): Shortcode[] | null {
  const trimmed = text.replace(/^(?:\s|&nbsp;|<br\s*\/?>)+|(?:\s|&nbsp;|<br\s*\/?>)+$/gi, '');
  if (!trimmed) return null;
  const shortcodes: Shortcode[] = [];
  let at = 0;
  for (const found of findShortcodes(trimmed)) {
    const gap = trimmed.slice(at, found.index);
    // The first at the start, each other on a line of its own.
    if (shortcodes.length === 0 ? gap !== '' : !BETWEEN.test(gap) || !/\n|<br/i.test(gap)) {
      return null;
    }
    if (KEPT.has(found.tag)) return null;
    shortcodes.push(withoutIndex(found));
    at = found.index + found.text.length;
  }
  return shortcodes.length > 0 && at === trimmed.length ? shortcodes : null;
}

/** Text made only of shortcodes and the spaces and line breaks between them. */
function onlyShortcodes(text: string): boolean {
  let rest = text;
  for (const found of findShortcodes(text)) rest = rest.replace(found.text, '');
  return BETWEEN.test(rest);
}

/**
 * Text split into paragraphs at its blank lines, as WordPress's wpautop
 * does, except inside an enclosing shortcode made of other shortcodes (a
 * form and its fields), which stays whole. One that encloses text keeps
 * its paragraphs.
 */
export function splitParagraphs(text: string): string[] {
  const inside = findShortcodes(text)
    .filter((found) => found.content !== null && onlyShortcodes(found.content))
    .map((found) => [found.index, found.index + found.text.length] as const);
  const chunks: string[] = [];
  let start = 0;
  for (const m of text.matchAll(/\n\s*\n/g)) {
    if (inside.some(([from, to]) => m.index > from && m.index < to)) continue;
    chunks.push(text.slice(start, m.index));
    start = m.index + m[0].length;
  }
  chunks.push(text.slice(start));
  return chunks;
}

/** What may come right before a shortcode standing alone in HTML. */
const ALONE_BEFORE =
  /(?:^|<p(?:\s[^>]*)?>|<div(?:\s[^>]*)?>|<br\s*\/?>|\n|<\/(?:p|div|h[1-6]|ul|ol|li|blockquote|figure|table|pre|section)>)(?:\s|&nbsp;)*$/i;
/** What may come right after it. */
const ALONE_AFTER =
  /^(?:\s|&nbsp;)*(?:$|<\/p>|<\/div>|<br\s*\/?>|\n|<(?:p|div|h[1-6]|ul|ol|blockquote|figure|table|pre|section)[\s>])/i;

/** HTML that shows something: text, or an element such as an image. */
function hasContent(html: string): boolean {
  if (
    /<(?:img|iframe|video|audio|svg|hr|table|input|select|textarea|form|embed|object|script|style|canvas|picture)\b/i.test(
      html,
    )
  ) {
    return true;
  }
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '') !== '';
}

/**
 * HTML split around the shortcodes standing alone in it: on their own line
 * or paragraph, as WordPress pages have them (a booking widget, a form).
 * A shortcode inside a sentence stays in the HTML. A paragraph left empty
 * around a shortcode is dropped, so are pieces with nothing to show.
 */
export function splitShortcodes(html: string): ShortcodePiece[] {
  const pieces: ShortcodePiece[] = [];
  let rest = 0;
  let pending = '';
  for (const found of findShortcodes(html)) {
    if (found.index < rest || KEPT.has(found.tag)) continue;
    const end = found.index + found.text.length;
    let before = pending + html.slice(rest, found.index);
    const after = html.slice(end);
    if (!ALONE_BEFORE.test(before) || !ALONE_AFTER.test(after)) {
      pending = before + found.text;
      rest = end;
      continue;
    }
    // `<p>[tag]</p>`: the paragraph goes with the shortcode.
    const open = /<p(?:\s[^>]*)?>(?:\s|&nbsp;)*$/i.exec(before);
    let skip = 0;
    if (open) {
      const close = /^(?:\s|&nbsp;)*<\/p>/i.exec(after);
      if (close) {
        before = before.slice(0, open.index);
        skip = close[0].length;
      }
    }
    if (hasContent(before)) pieces.push({ html: before.trim() });
    pieces.push({ shortcode: withoutIndex(found) });
    pending = '';
    rest = end + skip;
  }
  if (pieces.length === 0) return [{ html }];
  const tail = pending + html.slice(rest);
  if (hasContent(tail)) pieces.push({ html: tail.trim() });
  return pieces;
}

/** Placeholder of a WordPress block without an equivalent, during an import. */
export const IMPORTED_BLOCK = 'core/imported';

/**
 * Placeholder of a shortcode standing alone, during an import: a plugin may
 * turn it into its blocks (`import.shortcode`); otherwise `fallback` (its
 * text) is kept. `wrap`, when set, is the element each of the plugin's
 * blocks goes into (e.g. a page builder's element for plugin blocks).
 */
export function shortcodePlaceholder(
  shortcode: Shortcode,
  fallback: CxdBlock[],
  wrap?: { type: string; v?: number; attrs?: Record<string, unknown> },
): CxdBlock {
  return {
    id: newBlockId(),
    type: IMPORTED_BLOCK,
    v: 1,
    attrs: {
      name: 'core/shortcode',
      shortcode,
      html: shortcode.text,
      fallback,
      ...(wrap ? { wrap } : {}),
    },
  };
}
