import {
  INLINE_COLOR,
  MARKS,
  type CxdInline,
  type CxdLink,
  type CxdText,
  type Mark,
} from './marks.js';

/**
 * Conversion between rich-text HTML (as produced by editors) and CXD inline
 * nodes. Dependency-free and DOM-free: works in browsers, Node and workers.
 *
 * Only a small, safe subset is kept: bold, italic, underline, strike, code,
 * superscript, subscript, highlight (`<mark>`), text colors (WordPress's
 * `<mark class="has-inline-color" style="color:…">`, or any tag's inline `color`),
 * links and line breaks. Every other tag is dropped but its text is kept;
 * scripts, styles and comments are dropped entirely.
 */

const TAG_MARKS: Record<string, Mark> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  u: 'underline',
  s: 'strike',
  del: 'strike',
  strike: 'strike',
  code: 'code',
  kbd: 'code',
  sup: 'sup',
  sub: 'sub',
  mark: 'highlight',
};

const MARK_TAGS: Record<Mark, string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  code: 'code',
  sup: 'sup',
  sub: 'sub',
  highlight: 'mark',
};

/** Tags whose whole content is discarded. */
const DROP_CONTENT = new Set(['script', 'style', 'template', 'iframe', 'object', 'noscript']);

const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#|\?)/i;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface OpenLink {
  href: string;
  target?: '_blank';
  rel?: string;
  color?: string;
}

/** The `color` of an inline `style`, when it is a color rich text allows. */
function styleColor(style: string | undefined): string | undefined {
  const match = /(?:^|;)\s*color\s*:\s*([^;]+?)\s*(?:!important\s*)?(?:;|$)/i.exec(style ?? '');
  const color = match?.[1]?.trim();
  return color && INLINE_COLOR.test(color) ? color : undefined;
}

const TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+|<)/g;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    result[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

/** Rich-text HTML → CXD inline nodes (normalized). */
export function htmlToInline(html: string): CxdInline[] {
  const result: CxdInline[] = [];
  const markStack: { tag: string; mark: Mark | null; color?: string }[] = [];
  let link: (OpenLink & { children: CxdText[] }) | null = null;
  let dropDepth = 0;

  const activeMarks = (): Mark[] => {
    const set = new Set<Mark>();
    for (const entry of markStack) if (entry.mark) set.add(entry.mark);
    return MARKS.filter((m) => set.has(m));
  };

  const activeColor = (): string | undefined => markStack.findLast((entry) => entry.color)?.color;

  const pushText = (text: string) => {
    if (!text) return;
    const marks = activeMarks();
    const node: CxdText = marks.length ? { text, marks } : { text };
    const color = activeColor();
    if (color) node.color = color;
    if (link) link.children.push(node);
    else result.push(node);
  };

  const closeLink = () => {
    if (!link) return;
    const { children, ...attrs } = link;
    if (children.length > 0) result.push({ type: 'link', ...attrs, children });
    link = null;
  };

  for (const match of html.matchAll(TOKEN)) {
    const [whole, rawTag, rawAttributes = '', selfClosing] = match;
    if (whole.startsWith('<!--')) continue;

    if (rawTag === undefined) {
      if (dropDepth === 0) pushText(decodeEntities(whole));
      continue;
    }

    const tag = rawTag.toLowerCase();
    const closing = whole.startsWith('</');

    if (DROP_CONTENT.has(tag)) {
      if (!selfClosing) dropDepth += closing ? -1 : 1;
      dropDepth = Math.max(dropDepth, 0);
      continue;
    }
    if (dropDepth > 0) continue;

    if (tag === 'br') {
      pushText('\n');
      continue;
    }

    if (tag === 'a') {
      if (closing) {
        closeLink();
      } else {
        closeLink();
        const attributes = parseAttributes(rawAttributes);
        const href = (attributes.href ?? '').trim();
        if (href && SAFE_HREF.test(href)) {
          link = { href, children: [] };
          if (attributes.target === '_blank') link.target = '_blank';
          if (attributes.rel) link.rel = attributes.rel;
          const color = styleColor(attributes.style);
          if (color) link.color = color;
        }
      }
      continue;
    }

    if (closing) {
      const index = markStack.map((e) => e.tag).lastIndexOf(tag);
      if (index !== -1) markStack.splice(index, 1);
    } else if (!selfClosing) {
      const attributes = parseAttributes(rawAttributes);
      // WordPress's text color is a <mark> too: a color, not a highlight.
      const textColor = tag === 'mark' && /\bhas-inline-color\b/.test(attributes.class ?? '');
      // A highlight keeps no attributes; other tags may carry a text color.
      const color = tag === 'mark' && !textColor ? undefined : styleColor(attributes.style);
      markStack.push({
        tag,
        mark: textColor ? null : (TAG_MARKS[tag] ?? null),
        ...(color ? { color } : {}),
      });
    }
  }
  closeLink();
  return normalizeInline(result);
}

/**
 * CXD inline nodes → HTML for editors (canonical tag order: links outermost,
 * then the color, then marks). A link's color is written on its text, as
 * WordPress's text color, since editors keep no style on links;
 * `normalizeInline` puts it back on the link.
 */
export function inlineToHtml(nodes: CxdInline[]): string {
  return nodes
    .map((node) => {
      if ('type' in node) {
        const attributes = [`href="${escapeHtml(node.href)}"`];
        if (node.target) attributes.push(`target="${node.target}"`);
        if (node.rel) attributes.push(`rel="${escapeHtml(node.rel)}"`);
        const children = node.children.map((child) =>
          textToHtml(node.color && !child.color ? { ...child, color: node.color } : child),
        );
        return `<a ${attributes.join(' ')}>${children.join('')}</a>`;
      }
      return textToHtml(node);
    })
    .join('');
}

function textToHtml(node: CxdText): string {
  let html = escapeHtml(node.text).replace(/\n/g, '<br>');
  const marks = [...(node.marks ?? [])].sort((a, b) => MARKS.indexOf(b) - MARKS.indexOf(a));
  for (const mark of marks) html = `<${MARK_TAGS[mark]}>${html}</${MARK_TAGS[mark]}>`;
  if (node.color) {
    html = `<mark style="background-color:rgba(0, 0, 0, 0);color:${escapeHtml(node.color)}" class="has-inline-color">${html}</mark>`;
  }
  return html;
}

/**
 * Canonical form: marks sorted and de-duplicated, empty runs removed,
 * adjacent runs with the same marks (and adjacent identical links) merged.
 */
export function normalizeInline(nodes: CxdInline[]): CxdInline[] {
  const out: CxdInline[] = [];
  for (const node of nodes) {
    if ('type' in node) {
      let children = mergeTexts(node.children.map(normalizeText));
      if (children.length === 0) continue;
      // One color for all its text is the link's color.
      const shared = children.every((c) => c.color && c.color === children[0]!.color)
        ? children[0]!.color
        : undefined;
      const color = validColor(node.color) ?? shared;
      if (color) {
        children = mergeTexts(
          children.map(({ color: own, ...rest }) =>
            own && own !== color ? { ...rest, color: own } : rest,
          ),
        );
      }
      const normalized: CxdLink = { type: 'link', href: node.href, children };
      if (node.target) normalized.target = node.target;
      if (node.rel) normalized.rel = node.rel;
      if (color) normalized.color = color;
      const previous = out.at(-1);
      if (previous && 'type' in previous && sameLink(previous, normalized)) {
        previous.children = mergeTexts([...previous.children, ...normalized.children]);
      } else {
        out.push(normalized);
      }
    } else {
      const text = normalizeText(node);
      if (!text.text) continue;
      const previous = out.at(-1);
      if (previous && !('type' in previous) && sameMarks(previous, text)) {
        previous.text += text.text;
      } else {
        out.push(text);
      }
    }
  }
  return out;
}

function normalizeText(node: CxdText): CxdText {
  const marks = MARKS.filter((m) => node.marks?.includes(m));
  const text: CxdText = marks.length ? { text: node.text, marks } : { text: node.text };
  const color = validColor(node.color);
  if (color) text.color = color;
  return text;
}

function validColor(color: string | undefined): string | undefined {
  return color && INLINE_COLOR.test(color) ? color : undefined;
}

function mergeTexts(nodes: CxdText[]): CxdText[] {
  return normalizeInline(nodes) as CxdText[];
}

function sameMarks(a: CxdText, b: CxdText): boolean {
  return (a.marks ?? []).join() === (b.marks ?? []).join() && a.color === b.color;
}

function sameLink(a: CxdLink, b: CxdLink): boolean {
  return a.href === b.href && a.target === b.target && a.rel === b.rel && a.color === b.color;
}
