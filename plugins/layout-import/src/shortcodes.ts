/**
 * The `[av_…]` shortcodes of the old theme's layout builder as a tree, and
 * WordPress's automatic paragraphs for the text typed between them. Only
 * `av_` tags are parsed: any other shortcode (`[caption]`, `[gallery]`,
 * those of other plugins) stays in the text.
 */

export interface Code {
  tag: string;
  attrs: Record<string, string>;
  /** Positional attributes, e.g. `first` on columns. */
  flags: string[];
  /** Text and nested shortcodes, in order. */
  children: Node[];
}

export type Node = Code | string;

export const isCode = (node: Node): node is Code => typeof node !== 'string';

const ATTR = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s'"\]]+))|([\w-]+)/g;

function parseAttrs(source: string): { attrs: Record<string, string>; flags: string[] } {
  const attrs: Record<string, string> = {};
  const flags: string[] = [];
  for (const m of source.matchAll(ATTR)) {
    if (m[1]) {
      attrs[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? '')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"');
    } else if (m[5]) flags.push(m[5]);
  }
  return { attrs, flags };
}

/** Curly quotes around attribute values (typed in a word processor) as straight ones. */
function straightQuotes(tag: string): string {
  return tag
    .replace(/=\s*[‘’′]([^‘’′\]]*)[‘’′]/g, "='$1'")
    .replace(/=\s*[“”″]([^“”″\]]*)[“”″]/g, '="$1"');
}

/**
 * The `[av_…]` shortcodes of a text as a tree: closing tags are found by
 * name, and a tag without a closing tag later on is self-closing.
 */
export function parseShortcodes(text: string): Node[] {
  const token = /\[(\/?)(av_[\w-]*)([^\]]*)\]/gi;
  const root: Code = { tag: '#root', attrs: {}, flags: [], children: [] };
  const stack: Code[] = [root];
  let last = 0;
  const closers = new Set(
    [...text.matchAll(/\[\/(av_[\w-]*)\s*\]/gi)].map((m) => m[1]!.toLowerCase()),
  );
  for (const m of text.matchAll(token)) {
    const before = text.slice(last, m.index);
    if (before) stack[stack.length - 1]!.children.push(before);
    last = m.index + m[0].length;
    const tag = m[2]!.toLowerCase();
    if (m[1]) {
      const at = stack.map((c) => c.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const raw = straightQuotes(m[3]!).replace(/\/\s*$/, '');
    const node: Code = { tag, ...parseAttrs(raw), children: [] };
    stack[stack.length - 1]!.children.push(node);
    if (closers.has(tag) && !m[3]!.trim().endsWith('/')) stack.push(node);
  }
  const rest = text.slice(last);
  if (rest) stack[stack.length - 1]!.children.push(rest);
  return root.children;
}

/** Whether a text holds `[av_…]` shortcodes. */
export const hasLayout = (content: string): boolean => /\[av_[a-z_]+/i.test(content);

/** How many `[av_…]` elements a text has (closing tags not counted). */
export const countElements = (content: string): number =>
  (content.match(/\[av_[a-z_]+/gi) ?? []).length;

const BLOCK_START = /^<(p|ul|ol|h[1-6]|div|blockquote|table|figure|pre|hr|section)\b/i;

/** WordPress's `[caption]` shortcode as a figure with its caption. */
function captions(html: string): string {
  return html.replace(/\[caption\b[^\]]*\]([\s\S]*?)\[\/caption\]/gi, (_whole, inner: string) => {
    const image = /<img\b[^>]*>/i.exec(inner)?.[0];
    if (!image) return inner;
    const text = inner
      .replace(/<a\b[^>]*>\s*<img\b[^>]*>\s*<\/a>/i, '')
      .replace(/<img\b[^>]*>/i, '')
      .trim();
    return `\n\n<figure>${image}${text ? `<figcaption>${text}</figcaption>` : ''}</figure>\n\n`;
  });
}

/**
 * Images out of the paragraphs that hold them (with their link, which the
 * block editor's image keeps elsewhere), so that they become image blocks.
 */
function liftImages(html: string): string {
  return html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (whole, inner: string) => {
    if (!/<img\b/i.test(inner)) return whole;
    const parts = inner.split(/((?:<a\b[^>]*>\s*)?<img\b[^>]*>(?:\s*<\/a>)?)/i);
    return parts
      .map((part) => {
        const image = /<img\b[^>]*>/i.exec(part);
        if (image && /^(?:<a\b[^>]*>\s*)?<img\b[^>]*>(?:\s*<\/a>)?$/i.test(part)) return image[0];
        const line = part.replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, '');
        return line ? `<p>${line}</p>` : '';
      })
      .join('');
  });
}

/** WordPress's automatic paragraphs, for text typed in the classic editor. */
export function paragraphs(html: string): string {
  const text = captions(html).trim();
  if (!text) return '';
  if (BLOCK_START.test(text) && !/\n\s*\n/.test(text)) return liftImages(text);
  return liftImages(
    text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => (BLOCK_START.test(p) ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`))
      .join(''),
  );
}
