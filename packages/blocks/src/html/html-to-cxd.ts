import {
  CXD_SCHEMA_VERSION,
  htmlToInline,
  inlineText,
  newBlockId,
  type CxdBlock,
  type CxdDocument,
  type CxdInline,
} from '../index.js';
import { HTMLElement, parse, TextNode, type Node } from 'node-html-parser';
import { parseBlocks, type WpBlock } from './wp-blocks.js';

export interface ConvertOptions {
  /** Media ref of a WordPress attachment id (e.g. `att:123`). */
  mediaRef?(attachmentId: number): string | undefined;
  /** Collects what could not be converted exactly. */
  warn?(message: string): void;
}

/**
 * WordPress post content → CXD (RF-IMP-01). Block markup (`<!-- wp:… -->`)
 * is mapped block by block; classic content is split into paragraphs as
 * WordPress does (blank lines) and block elements become blocks. What has
 * no equivalent keeps its text and is reported.
 */
export function htmlToCxd(html: string, options: ConvertOptions = {}): CxdDocument {
  const warn = options.warn ?? (() => {});
  const blocks = /<!--\s+wp:/.test(html)
    ? parseBlocks(html).flatMap((b) => fromWpBlock(b, options, warn))
    : fromClassic(html, options, warn);
  return { schema: CXD_SCHEMA_VERSION, blocks };
}

// ---- Block markup ----------------------------------------------------------------------

function fromWpBlock(
  block: WpBlock,
  options: ConvertOptions,
  warn: (m: string) => void,
): CxdBlock[] {
  const name = block.blockName;
  const attrs = block.attrs ?? {};
  const html = block.innerHTML ?? '';
  const children = () => block.innerBlocks.flatMap((b) => fromWpBlock(b, options, warn));
  const common = pick(attrs, ['anchor', 'className', 'align']);
  if (!name) return html.trim() ? fromClassic(html, options, warn) : [];

  switch (name) {
    case 'core/paragraph': {
      const content = inline(firstElementInner(html, 'p') ?? html);
      return hasText(content)
        ? [make('core/paragraph', { ...common, ...pick(attrs, ['dropCap']) }, content)]
        : [];
    }
    case 'core/heading': {
      const element = parse(html).querySelector('h1,h2,h3,h4,h5,h6');
      const level =
        typeof attrs.level === 'number' ? attrs.level : Number(element?.tagName.slice(1) ?? 2);
      return [
        make(
          'core/heading',
          { ...common, level, ...pick(attrs, ['textAlign']) },
          inline(element?.innerHTML ?? html),
        ),
      ];
    }
    case 'core/list': {
      const ordered = attrs.ordered === true || /^\s*<ol/i.test(html);
      const items = block.innerBlocks.length
        ? children()
        : listItems(parse(html).querySelector('ul,ol'), options, warn);
      return [
        {
          ...make('core/list', { ...common, ...(ordered ? { ordered: true } : {}) }),
          children: items,
        },
      ];
    }
    case 'core/list-item': {
      const element = parse(html).querySelector('li');
      return [listItem(element, block.innerBlocks.length ? children() : [], options, warn)];
    }
    case 'core/quote':
    case 'core/pullquote': {
      const root = parse(html);
      const cite = root.querySelector('cite');
      const inner = block.innerBlocks.length
        ? children()
        : root.querySelectorAll('p').map((p) => make('core/paragraph', {}, inline(p.innerHTML)));
      if (name === 'core/pullquote') warn('Pull quotes became quotes.');
      return [
        {
          ...make('core/quote', {
            ...common,
            ...(cite ? { citation: inline(cite.innerHTML) } : {}),
          }),
          children: inner.length ? inner : [make('core/paragraph', {}, inline(root.textContent))],
        },
      ];
    }
    case 'core/image':
      return [
        imageBlock(
          parse(html),
          { ...common, ...pick(attrs, ['width', 'height', 'sizeSlug']) },
          attrs.id,
          options,
        ),
      ];
    case 'core/gallery': {
      warn('A gallery became a group of images.');
      const images = block.innerBlocks.length
        ? children()
        : parse(html)
            .querySelectorAll('figure,img')
            .filter((n) => n.tagName === 'IMG' || !n.querySelector('figure'))
            .map((node) => imageBlock(node, {}, undefined, options));
      return [{ ...make('core/group', { className: 'wp-block-gallery' }), children: images }];
    }
    case 'core/buttons':
      return [{ ...make('core/buttons', common), children: children() }];
    case 'core/button': {
      const link = parse(html).querySelector('a');
      return [
        make(
          'core/button',
          { ...common, ...(link?.getAttribute('href') ? { url: link.getAttribute('href') } : {}) },
          inline(link?.innerHTML ?? parse(html).textContent),
        ),
      ];
    }
    case 'core/columns':
      return [
        {
          ...make('core/columns', { ...common, ...pick(attrs, ['isStackedOnMobile']) }),
          children: children(),
        },
      ];
    case 'core/column':
      return [
        { ...make('core/column', { ...common, ...pick(attrs, ['width']) }), children: children() },
      ];
    case 'core/group':
    case 'core/cover':
    case 'core/media-text': {
      if (name !== 'core/group') warn(`A ${name.slice(5)} block became a group.`);
      const inner = children();
      if (name === 'core/media-text' || name === 'core/cover') {
        const image = parse(html).querySelector('img');
        if (image) inner.unshift(imageBlock(image, {}, attrs.mediaId ?? attrs.id, options));
      }
      return [
        { ...make('core/group', { ...common, ...pick(attrs, ['tagName']) }), children: inner },
      ];
    }
    case 'core/separator':
      return [make('core/separator', common)];
    case 'core/spacer':
      return [make('core/spacer', { ...common, ...pick(attrs, ['height']) })];
    case 'core/code':
    case 'core/preformatted':
    case 'core/verse': {
      const code = parse(html).querySelector('code,pre');
      return [
        make('core/code', common, [{ text: decode(code?.textContent ?? parse(html).textContent) }]),
      ];
    }
    case 'core/more':
    case 'core/nextpage':
      return [];
    case 'core/embed':
    case 'core/video':
    case 'core/audio':
    case 'core/file': {
      const element = parse(html).querySelector('a,video,audio,source');
      const url =
        typeof attrs.url === 'string'
          ? attrs.url
          : (element?.getAttribute('href') ?? element?.getAttribute('src') ?? null);
      warn(`A ${name.slice(5)} block became a link.`);
      return url ? [make('core/paragraph', {}, [linkTo(url)])] : [];
    }
    case 'core/shortcode':
      warn(`Shortcode left as text: ${html.trim().slice(0, 60)}`);
      return [make('core/paragraph', {}, [{ text: html.trim() }])];
    default: {
      // Unknown blocks (plugins, themes): keep their text.
      const nested = children();
      const text = parse(html).textContent.trim();
      warn(
        `Block ${name} has no equivalent: ${nested.length ? 'its content' : 'its text'} was kept.`,
      );
      if (nested.length) return nested;
      return text ? fromClassic(html, options, () => {}) : [];
    }
  }
}

// ---- Classic content -------------------------------------------------------------------

const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'FIGURE',
  'PRE',
  'HR',
  'DIV',
  'SECTION',
  'ARTICLE',
  'TABLE',
  'IMG',
  'IFRAME',
  'SCRIPT',
  'STYLE',
  'FORM',
  'DL',
  'ADDRESS',
]);

function fromClassic(html: string, options: ConvertOptions, warn: (m: string) => void): CxdBlock[] {
  const root = parse(html, {
    comment: false,
    blockTextElements: { pre: true, script: true, style: true },
  });
  const blocks: CxdBlock[] = [];
  let pending = '';
  const flush = () => {
    // Like WordPress's wpautop: blank lines separate paragraphs, single newlines are breaks.
    for (const chunk of pending.split(/\n\s*\n/)) {
      const content = inline(chunk.trim().replace(/\n/g, '<br>'));
      if (hasText(content)) blocks.push(make('core/paragraph', {}, content));
    }
    pending = '';
  };
  const visit = (nodes: Node[]) => {
    for (const node of nodes) {
      if (node instanceof TextNode) {
        pending += node.rawText;
        continue;
      }
      if (!(node instanceof HTMLElement)) continue;
      const tag = node.tagName;
      if (!tag || !BLOCK_TAGS.has(tag)) {
        // Inline element; an image alone in a link/paragraph becomes an image block.
        if (
          tag === 'A' &&
          node.childNodes.length === 1 &&
          (node.firstChild as HTMLElement | undefined)?.tagName === 'IMG'
        ) {
          flush();
          blocks.push(imageBlock(node, {}, undefined, options));
          continue;
        }
        pending += node.outerHTML;
        continue;
      }
      flush();
      switch (tag) {
        case 'P': {
          const only = node.childNodes.filter((n) => !(n instanceof TextNode && !n.rawText.trim()));
          const single = only.length === 1 ? (only[0] as HTMLElement) : null;
          if (
            single?.tagName === 'IMG' ||
            (single?.tagName === 'A' && single.querySelector('img') && !single.textContent.trim())
          ) {
            blocks.push(imageBlock(single, {}, undefined, options));
          } else {
            pending = node.innerHTML;
            flush();
          }
          break;
        }
        case 'H1':
        case 'H2':
        case 'H3':
        case 'H4':
        case 'H5':
        case 'H6':
          blocks.push(
            make('core/heading', { level: Number(tag.slice(1)) }, inline(node.innerHTML)),
          );
          break;
        case 'UL':
        case 'OL':
          blocks.push({
            ...make('core/list', tag === 'OL' ? { ordered: true } : {}),
            children: listItems(node, options, warn),
          });
          break;
        case 'BLOCKQUOTE': {
          const inner = fromClassic(node.innerHTML, options, warn);
          blocks.push({
            ...make('core/quote', {}),
            children: inner.length ? inner : [make('core/paragraph', {}, inline(node.textContent))],
          });
          break;
        }
        case 'FIGURE':
        case 'IMG':
          if (node.querySelector('img') || tag === 'IMG')
            blocks.push(imageBlock(node, {}, undefined, options));
          break;
        case 'PRE':
          blocks.push(make('core/code', {}, [{ text: decode(node.textContent) }]));
          break;
        case 'HR':
          blocks.push(make('core/separator', {}));
          break;
        case 'TABLE':
          warn('A table became text (tables are not supported yet).');
          for (const row of node.querySelectorAll('tr')) {
            const cells = row
              .querySelectorAll('th,td')
              .map((c) => c.textContent.trim())
              .filter(Boolean);
            if (cells.length)
              blocks.push(make('core/paragraph', {}, [{ text: cells.join(' · ') }]));
          }
          break;
        case 'IFRAME': {
          const src = node.getAttribute('src');
          warn('An embedded frame became a link.');
          if (src) blocks.push(make('core/paragraph', {}, [linkTo(src)]));
          break;
        }
        case 'SCRIPT':
        case 'STYLE':
        case 'FORM':
          warn(`A <${tag.toLowerCase()}> element was left out.`);
          break;
        default:
          visit(node.childNodes);
          flush();
      }
    }
  };
  visit(root.childNodes);
  flush();
  return blocks;
}

// ---- Helpers --------------------------------------------------------------------------

function listItems(
  list: HTMLElement | null,
  options: ConvertOptions,
  warn: (m: string) => void,
): CxdBlock[] {
  if (!list) return [];
  return list.childNodes
    .filter((n): n is HTMLElement => n instanceof HTMLElement && n.tagName === 'LI')
    .map((li) => listItem(li, [], options, warn));
}

function listItem(
  li: HTMLElement | null,
  nested: CxdBlock[],
  options: ConvertOptions,
  warn: (m: string) => void,
): CxdBlock {
  const sublists = li
    ? li.childNodes.filter(
        (n): n is HTMLElement =>
          n instanceof HTMLElement && (n.tagName === 'UL' || n.tagName === 'OL'),
      )
    : [];
  const own = li
    ? li.childNodes
        .filter((n) => !sublists.includes(n as HTMLElement))
        .map((n) => (n instanceof HTMLElement ? n.outerHTML : n.rawText))
        .join('')
    : '';
  const children = [
    ...nested,
    ...sublists.map((list) => ({
      ...make('core/list', list.tagName === 'OL' ? { ordered: true } : {}),
      children: listItems(list, options, warn),
    })),
  ];
  return { ...make('core/list-item', {}, inline(own)), ...(children.length ? { children } : {}) };
}

/** An image block from an <img> (possibly in a link or a figure with a caption). */
function imageBlock(
  node: HTMLElement,
  base: Record<string, unknown>,
  id: unknown,
  options: ConvertOptions,
): CxdBlock {
  const img = node.tagName === 'IMG' ? node : node.querySelector('img');
  const link = node.tagName === 'A' ? node : node.querySelector('a');
  const caption = node.querySelector('figcaption');
  const fromClass = /wp-image-(\d+)/.exec(img?.getAttribute('class') ?? '')?.[1];
  const attachment = typeof id === 'number' ? id : fromClass ? Number(fromClass) : undefined;
  const ref = attachment !== undefined ? options.mediaRef?.(attachment) : undefined;
  const href = link?.getAttribute('href');
  const src = img?.getAttribute('src');
  return make('core/image', {
    ...base,
    ...(ref ? { id: ref } : {}),
    ...(src ? { url: src } : {}),
    alt: decode(img?.getAttribute('alt') ?? ''),
    // A link to the image itself is not kept (it was WordPress's default).
    ...(href && href !== src && !/\.(jpe?g|png|gif|webp|avif)$/i.test(href) ? { href } : {}),
    ...(caption && caption.textContent.trim() ? { caption: inline(caption.innerHTML) } : {}),
  });
}

function make(type: string, attrs: Record<string, unknown>, content?: CxdInline[]): CxdBlock {
  return { id: newBlockId(), type, v: 1, attrs, ...(content ? { content } : {}) };
}

function inline(html: string): CxdInline[] {
  return htmlToInline(html.replace(/\s*\n\s*/g, ' ').replace(/<br\s*\/?>\s*/gi, '\n'));
}

function linkTo(url: string): CxdInline {
  return { type: 'link', href: url, children: [{ text: url }] };
}

function hasText(content: CxdInline[]): boolean {
  return inlineText(content).trim().length > 0;
}

function firstElementInner(html: string, tag: string): string | null {
  return parse(html).querySelector(tag)?.innerHTML ?? null;
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]));
}

function decode(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
