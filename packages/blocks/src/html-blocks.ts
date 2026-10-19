/**
 * Rich-text HTML, as page builders keep it in their text elements, as block
 * editor blocks: paragraphs, headings, lists, quotes, code, images and
 * separators. Boxes (`div`, `section`…) are opened; what has no block
 * (tables, forms, embeds) stays as a Custom HTML block, so nothing is lost.
 * Dependency-free and DOM-free like inline.ts, for editors and the admin
 * entries of plugins (`@cleitext/blocks/inline`).
 */
import type { CxdBlock } from './cxd.js';
import { decodeEntities, htmlToInline } from './inline.js';
import type { CxdInline } from './marks.js';

const TAG =
  /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** Elements without a closing tag. */
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'source', 'col']);
/** Elements that are part of a line of text: they go into paragraphs. */
const INLINE = new Set([
  'a',
  'abbr',
  'b',
  'br',
  'cite',
  'code',
  'del',
  'em',
  'font',
  'i',
  'kbd',
  'mark',
  'q',
  's',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'wbr',
]);
/** Boxes whose content is taken as it is. */
const BOXES = new Set([
  'article',
  'aside',
  'center',
  'div',
  'footer',
  'header',
  'main',
  'nav',
  'section',
]);

const SAFE_URL = /^(https?:|\/|\.|#|\?)/i;

interface Element {
  tag: string;
  attrs: Record<string, string>;
  inner: string;
  outer: string;
}

type Segment = { text: string } | Element;

function parseAttributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) {
    result[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

/** The top-level elements of a fragment and the text between them. */
function segments(html: string): Segment[] {
  const out: Segment[] = [];
  const re = new RegExp(TAG.source, 'g');
  let last = 0;
  let open: { tag: string; attrs: Record<string, string>; start: number; body: number } | null =
    null;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const [whole, closing, rawName, rawAttrs, selfClosing] = match;
    const tag = rawName!.toLowerCase();
    if (open) {
      if (tag !== open.tag) continue;
      if (closing) depth--;
      else if (!selfClosing) depth++;
      if (depth > 0) continue;
      out.push({
        tag: open.tag,
        attrs: open.attrs,
        inner: html.slice(open.body, match.index),
        outer: html.slice(open.start, match.index + whole.length),
      });
      last = match.index + whole.length;
      open = null;
      continue;
    }
    if (match.index > last) out.push({ text: html.slice(last, match.index) });
    last = match.index + whole.length;
    // A stray closing tag is dropped.
    if (closing) continue;
    const attrs = parseAttributes(rawAttrs ?? '');
    if (VOID.has(tag) || selfClosing) {
      out.push({ tag, attrs, inner: '', outer: whole });
      continue;
    }
    open = { tag, attrs, start: match.index, body: last };
    depth = 1;
  }
  if (open) {
    // Never closed: it runs to the end.
    out.push({
      tag: open.tag,
      attrs: open.attrs,
      inner: html.slice(open.body),
      outer: html.slice(open.start),
    });
  } else if (last < html.length) {
    out.push({ text: html.slice(last) });
  }
  return out;
}

const isText = (segment: Segment): segment is { text: string } => 'text' in segment;

/** Rich text of a line, with HTML white space collapsed. */
function inline(html: string): CxdInline[] {
  const nodes = htmlToInline(html.replace(/\s+/g, ' ').replace(/\s*<br\s*\/?>\s*/gi, '<br>'));
  // Spaces at both ends are not part of the text.
  const first = nodes[0];
  if (first && !('type' in first)) first.text = first.text.replace(/^\s+/, '');
  const end = nodes.at(-1);
  if (end && !('type' in end)) end.text = end.text.replace(/\s+$/, '');
  return nodes.filter((node) => 'type' in node || node.text !== '');
}

const textOf = (nodes: CxdInline[]): string =>
  nodes.map((n) => ('type' in n ? n.children.map((c) => c.text).join('') : n.text)).join('');

let counter = 0;

/** A block id like `newBlockId` (without loading the document schema). */
function blockId(): string {
  counter = (counter + 1) % 1_296;
  return `b_${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export interface HtmlToBlocksOptions {
  /** Ids of the new blocks (default: like `newBlockId`). */
  newId?: () => string;
}

/**
 * Rich-text HTML → block editor blocks (`core/paragraph`, `core/heading`,
 * `core/list`, `core/quote`, `core/code`, `core/image`, `core/separator`);
 * what has no block becomes `core/html` with its markup.
 */
export function htmlToBlocks(html: string, options: HtmlToBlocksOptions = {}): CxdBlock[] {
  const newId = options.newId ?? blockId;
  const make = (
    type: string,
    attrs: Record<string, unknown> = {},
    extra: Partial<CxdBlock> = {},
  ): CxdBlock => ({ id: newId(), type, v: 1, attrs, ...extra });

  const paragraphs = (run: string): CxdBlock[] =>
    run
      // Blank lines and double line breaks start a new paragraph, as in WordPress.
      .split(/\n\s*\n|(?:\s*<br\s*\/?>\s*){2,}/i)
      .map(inline)
      .filter((content) => textOf(content).trim() !== '')
      .map((content) => make('core/paragraph', {}, { content }));

  const image = (element: Element, caption?: CxdInline[]): CxdBlock[] => {
    const src = element.attrs.src ?? '';
    if (!SAFE_URL.test(src.trim())) return [];
    return [
      make('core/image', {
        url: src.trim(),
        alt: element.attrs.alt ?? '',
        ...(caption && caption.length ? { caption } : {}),
      }),
    ];
  };

  const listItems = (inner: string): CxdBlock[] =>
    segments(inner)
      .filter((s): s is Element => !isText(s) && s.tag === 'li')
      .map((li) => {
        const parts = segments(li.inner);
        const nested = parts.filter((s): s is Element => !isText(s) && /^(ul|ol)$/.test(s.tag));
        const text = parts
          .filter((s) => isText(s) || !/^(ul|ol)$/.test(s.tag))
          .map((s) => (isText(s) ? s.text : s.outer))
          .join('');
        return make(
          'core/list-item',
          {},
          {
            content: inline(text),
            ...(nested.length ? { children: nested.map(list) } : {}),
          },
        );
      });

  const list = (element: Element): CxdBlock =>
    make('core/list', element.tag === 'ol' ? { ordered: true } : {}, {
      children: listItems(element.inner),
    });

  const convert = (fragment: string): CxdBlock[] => {
    const out: CxdBlock[] = [];
    let run = '';
    const flush = () => {
      out.push(...paragraphs(run));
      run = '';
    };
    for (const segment of segments(fragment.replace(/<!--[\s\S]*?(?:-->|$)/g, ''))) {
      if (isText(segment) || INLINE.has(segment.tag)) {
        run += isText(segment) ? segment.text : segment.outer;
        continue;
      }
      flush();
      const { tag, inner } = segment;
      switch (tag) {
        case 'p': {
          const parts = segments(inner).filter((s) => !isText(s) || s.text.trim());
          const only = parts.length === 1 ? parts[0] : undefined;
          // A paragraph with only an image is the image.
          if (only && !isText(only) && only.tag === 'img') out.push(...image(only));
          else out.push(...paragraphs(inner));
          break;
        }
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6': {
          const content = inline(inner);
          if (textOf(content).trim()) {
            out.push(make('core/heading', { level: Number(tag[1]) }, { content }));
          }
          break;
        }
        case 'ul':
        case 'ol':
          out.push(list(segment));
          break;
        case 'blockquote': {
          const children = convert(inner);
          if (children.length) out.push(make('core/quote', {}, { children }));
          break;
        }
        case 'pre': {
          const code = decodeEntities(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''));
          if (code.trim()) out.push(make('core/code', {}, { content: [{ text: code }] }));
          break;
        }
        case 'hr':
          out.push(make('core/separator'));
          break;
        case 'img':
          out.push(...image(segment));
          break;
        case 'figure': {
          const parts = segments(inner).filter((s): s is Element => !isText(s));
          const img = parts.find((s) => s.tag === 'img');
          const caption = parts.find((s) => s.tag === 'figcaption');
          if (img && parts.every((s) => s.tag === 'img' || s.tag === 'figcaption')) {
            out.push(...image(img, caption ? inline(caption.inner) : undefined));
          } else {
            out.push(...convert(inner));
          }
          break;
        }
        default:
          if (BOXES.has(tag)) out.push(...convert(inner));
          else if (!['script', 'style', 'template', 'noscript'].includes(tag)) {
            out.push(make('core/html', { content: segment.outer }));
          }
      }
    }
    flush();
    return out;
  };

  return convert(html);
}
