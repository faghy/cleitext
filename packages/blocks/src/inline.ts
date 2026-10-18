import { MARKS, type CxdInline, type CxdLink, type CxdText, type Mark } from './cxd.js';

/**
 * Conversion between rich-text HTML (as produced by editors) and CXD inline
 * nodes. Dependency-free and DOM-free: works in browsers, Node and workers.
 *
 * Only a small, safe subset is kept: bold, italic, underline, strike, code,
 * superscript, subscript, highlight (`<mark>`), links and line breaks. Every other tag is dropped
 * but its text is kept; scripts, styles and comments are dropped entirely.
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
  const markStack: { tag: string; mark: Mark | null }[] = [];
  let link: (OpenLink & { children: CxdText[] }) | null = null;
  let dropDepth = 0;

  const activeMarks = (): Mark[] => {
    const set = new Set<Mark>();
    for (const entry of markStack) if (entry.mark) set.add(entry.mark);
    return MARKS.filter((m) => set.has(m));
  };

  const pushText = (text: string) => {
    if (!text) return;
    const marks = activeMarks();
    const node: CxdText = marks.length ? { text, marks } : { text };
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
        }
      }
      continue;
    }

    if (closing) {
      const index = markStack.map((e) => e.tag).lastIndexOf(tag);
      if (index !== -1) markStack.splice(index, 1);
    } else if (!selfClosing) {
      markStack.push({ tag, mark: TAG_MARKS[tag] ?? null });
    }
  }
  closeLink();
  return normalizeInline(result);
}

/** CXD inline nodes → HTML (canonical tag order: links outermost, then marks). */
export function inlineToHtml(nodes: CxdInline[]): string {
  return nodes
    .map((node) => {
      if ('type' in node) {
        const attributes = [`href="${escapeHtml(node.href)}"`];
        if (node.target) attributes.push(`target="${node.target}"`);
        if (node.rel) attributes.push(`rel="${escapeHtml(node.rel)}"`);
        return `<a ${attributes.join(' ')}>${node.children.map(textToHtml).join('')}</a>`;
      }
      return textToHtml(node);
    })
    .join('');
}

function textToHtml(node: CxdText): string {
  let html = escapeHtml(node.text).replace(/\n/g, '<br>');
  const marks = [...(node.marks ?? [])].sort((a, b) => MARKS.indexOf(b) - MARKS.indexOf(a));
  for (const mark of marks) html = `<${MARK_TAGS[mark]}>${html}</${MARK_TAGS[mark]}>`;
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
      const children = mergeTexts(node.children.map(normalizeText));
      if (children.length === 0) continue;
      const normalized: CxdLink = { type: 'link', href: node.href, children };
      if (node.target) normalized.target = node.target;
      if (node.rel) normalized.rel = node.rel;
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
  return marks.length ? { text: node.text, marks } : { text: node.text };
}

function mergeTexts(nodes: CxdText[]): CxdText[] {
  return normalizeInline(nodes) as CxdText[];
}

function sameMarks(a: CxdText, b: CxdText): boolean {
  return (a.marks ?? []).join() === (b.marks ?? []).join();
}

function sameLink(a: CxdLink, b: CxdLink): boolean {
  return a.href === b.href && a.target === b.target && a.rel === b.rel;
}
