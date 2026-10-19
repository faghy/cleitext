import {
  CXD_SCHEMA_VERSION,
  cleanBlockStyle,
  cleanLayout,
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
  /**
   * Keep blocks without an equivalent as `core/imported` placeholders, with
   * their name, attributes, HTML, converted inner blocks (`children`) and
   * text (`attrs.fallback`): the import turns them into plugin blocks (the
   * `import.block` filter, plugin API 1.23) or into that text.
   */
  keepUnknown?: boolean;
}

/** Placeholder of a WordPress block without an equivalent, during an import. */
export const IMPORTED_BLOCK = 'core/imported';

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

/** Text alignment as WordPress 6.9+ saves it, in the block's `style.typography.textAlign`. */
function styleTextAlign(attrs: Record<string, unknown>): string | undefined {
  const style = attrs.style as { typography?: { textAlign?: unknown } } | undefined;
  const value = style?.typography?.textAlign;
  return typeof value === 'string' && ['left', 'center', 'right', 'justify'].includes(value)
    ? value
    : undefined;
}

function fromWpBlock(
  block: WpBlock,
  options: ConvertOptions,
  warn: (m: string) => void,
): CxdBlock[] {
  const name = block.blockName;
  const attrs = block.attrs ?? {};
  const html = block.innerHTML ?? '';
  const children = () => block.innerBlocks.flatMap((b) => fromWpBlock(b, options, warn));
  const common = withPaletteClasses(pick(attrs, ['anchor', 'className', 'align']), attrs);
  // Spacing, custom colors and text size set on the block in WordPress.
  const blockStyle = cleanBlockStyle(attrs.style);
  if (blockStyle) common.style = blockStyle;
  if (!name) return html.trim() ? fromClassic(html, options, warn) : [];

  switch (name) {
    case 'core/paragraph': {
      const content = inline(firstElementInner(html, 'p') ?? html);
      const align = attrs.align ?? styleTextAlign(attrs);
      return hasText(content)
        ? [
            make(
              'core/paragraph',
              { ...common, ...(align ? { align } : {}), ...pick(attrs, ['dropCap']) },
              content,
            ),
          ]
        : [];
    }
    case 'core/heading': {
      const element = parse(html).querySelector('h1,h2,h3,h4,h5,h6');
      const level =
        typeof attrs.level === 'number' ? attrs.level : Number(element?.tagName.slice(1) ?? 2);
      const textAlign = attrs.textAlign ?? styleTextAlign(attrs);
      return [
        make(
          'core/heading',
          { ...common, level, ...(textAlign ? { textAlign } : {}) },
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
      const root = parse(html);
      const images = block.innerBlocks.length
        ? children()
        : // Older galleries: each image once, with its nearest figure (and caption).
          root
            .querySelectorAll('img')
            .map((img) => imageBlock(img.closest('figure') ?? img, {}, undefined, options));
      const caption = root.querySelector('.blocks-gallery-caption');
      return [
        {
          ...make('core/gallery', {
            ...common,
            ...pick(attrs, ['columns', 'imageCrop', 'linkTo', 'sizeSlug']),
            ...(caption?.textContent.trim() ? { caption: inline(caption.innerHTML) } : {}),
          }),
          children: images,
        },
      ];
    }
    case 'core/table': {
      const table = parse(html).querySelector('table');
      if (!table) return [];
      return (
        layoutTable(table, options, warn) ?? [
          tableBlock(table, common, parse(html).querySelector('figcaption')),
        ]
      );
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
          ...make('core/columns', {
            ...common,
            ...pick(attrs, ['isStackedOnMobile', 'verticalAlignment']),
          }),
          children: children(),
        },
      ];
    case 'core/column':
      return [
        {
          ...make('core/column', { ...common, ...pick(attrs, ['width', 'verticalAlignment']) }),
          children: children(),
        },
      ];
    case 'core/group':
    case 'core/cover':
    case 'core/media-text': {
      // During an import a plugin may have a block for covers (the import.block
      // filter): the group is the placeholder's content, used when none does.
      const inner = children();
      if (name === 'core/media-text' || name === 'core/cover') {
        const image = parse(html).querySelector('img');
        if (image) inner.unshift(imageBlock(image, {}, attrs.mediaId ?? attrs.id, options));
      }
      // Rows and grids of WordPress's layout support (groups only).
      const layout = name === 'core/group' ? cleanLayout(attrs.layout) : undefined;
      const group = {
        ...make('core/group', {
          ...common,
          ...pick(attrs, ['tagName']),
          ...(layout ? { layout } : {}),
        }),
        children: inner,
      };
      if (name === 'core/cover' && options.keepUnknown) {
        return [
          { ...make(IMPORTED_BLOCK, { name, attrs, html, fallback: [] }), children: [group] },
        ];
      }
      if (name !== 'core/group') warn(`A ${name.slice(5)} block became a group.`);
      return [group];
    }
    case 'core/separator':
      return [make('core/separator', common)];
    case 'core/spacer':
      return [make('core/spacer', { ...common, ...pick(attrs, ['height']) })];
    case 'core/code':
    case 'core/preformatted':
    case 'core/verse': {
      const root = parse(html);
      // The <pre> (code, preformatted, verse); a bare <code> otherwise.
      const code = root.querySelector('pre') ?? root.querySelector('code') ?? root;
      return [make('core/code', common, [{ text: preText(code.innerHTML) }])];
    }
    case 'core/html':
      // Kept as it is (maps, forms, widgets of other services): sanitized when shown.
      return html.trim() ? [make('core/html', { content: html.trim() })] : [];
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
    case 'core/shortcode': {
      const gallery = galleryShortcode(html.trim(), options);
      if (gallery) return [gallery];
      warn(`Shortcode left as text: ${html.trim().slice(0, 60)}`);
      return [make('core/paragraph', {}, [{ text: html.trim() }])];
    }
    case 'core/latest-posts':
    case 'core/latest-comments':
    case 'core/tag-cloud':
    case 'core/categories':
    case 'core/search': {
      const widget = wpWidget(name, attrs);
      warn(`Block ${name} became ${widget.type}: it is shown with the Widgets plugin.`);
      return [widget];
    }
    default: {
      // Unknown blocks (plugins, themes): keep their text.
      const nested = children();
      if (options.keepUnknown) {
        const text = parse(html).textContent.trim();
        return [
          {
            ...make(IMPORTED_BLOCK, {
              name,
              attrs,
              html,
              fallback: nested.length || !text ? [] : fromClassic(html, options, () => {}),
            }),
            children: nested,
          },
        ];
      }
      const text = parse(html).textContent.trim();
      warn(
        `Block ${name} has no equivalent: ${nested.length ? 'its content' : 'its text'} was kept.`,
      );
      if (nested.length) return nested;
      return text ? fromClassic(html, options, () => {}) : [];
    }
  }
}

/**
 * Colors picked from the theme's palette, kept as WordPress's classes
 * (`has-<slug>-color`), which the theme's stylesheet colors.
 */
function withPaletteClasses(
  common: Record<string, unknown>,
  attrs: Record<string, unknown>,
): Record<string, unknown> {
  const slug = (value: unknown) =>
    typeof value === 'string' && /^[a-z0-9-]{1,60}$/.test(value) ? value : null;
  const text = slug(attrs.textColor);
  const background = slug(attrs.backgroundColor);
  const gradient = slug(attrs.gradient);
  const fontSize = slug(attrs.fontSize);
  const fontFamily = slug(attrs.fontFamily);
  // Custom colors get WordPress's marker classes too (themes pad blocks with a background).
  const custom = (attrs.style as { color?: Record<string, unknown> } | undefined)?.color ?? {};
  const classes = [
    ...(typeof common.className === 'string' ? common.className.split(/\s+/) : []),
    ...(text ? [`has-${text}-color`, 'has-text-color'] : []),
    ...(!text && typeof custom.text === 'string' ? ['has-text-color'] : []),
    ...(background ? [`has-${background}-background-color`, 'has-background'] : []),
    ...(gradient ? [`has-${gradient}-gradient-background`, 'has-background'] : []),
    ...(!background &&
    !gradient &&
    (typeof custom.background === 'string' || typeof custom.gradient === 'string')
      ? ['has-background']
      : []),
    ...(fontSize ? [`has-${fontSize}-font-size`] : []),
    ...(fontFamily ? [`has-${fontFamily}-font-family`] : []),
  ].filter(Boolean);
  const unique = [...new Set(classes)].join(' ');
  return unique ? { ...common, className: unique } : common;
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
      // [gallery ids="1,2,3" columns="3"] alone on its line: a gallery.
      const gallery = galleryShortcode(chunk.trim(), options);
      if (gallery) {
        blocks.push(gallery);
        continue;
      }
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
          blocks.push(make('core/code', {}, [{ text: preText(node.innerHTML) }]));
          break;
        case 'HR':
          blocks.push(make('core/separator', {}));
          break;
        case 'TABLE':
          blocks.push(...(layoutTable(node, options, warn) ?? [tableBlock(node, {}, null)]));
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

/** An HTML table: its head, body and foot rows, cells with their text, spans and alignment. */
/**
 * Tables used for layout, with pictures or videos side by side (old
 * WordPress pages): table cells hold text only, so each row becomes columns
 * with the cells' content. Null for data tables.
 */
function layoutTable(
  table: HTMLElement,
  options: ConvertOptions,
  warn: (m: string) => void,
): CxdBlock[] | null {
  if (!table.querySelector('img, iframe, video, figure')) return null;
  const rows = table
    .querySelectorAll('tr')
    // Rows of this table, not of tables inside its cells.
    .filter((row) => row.closest('table') === table);
  const blocks: CxdBlock[] = [];
  for (const row of rows) {
    const cells = row.childNodes.filter(
      (c): c is HTMLElement => c instanceof HTMLElement && /^T[HD]$/.test(c.tagName),
    );
    const columns = cells.map((cell) => ({
      ...make('core/column', {}),
      children: fromClassic(cell.innerHTML, options, warn),
    }));
    if (columns.every((c) => c.children.length === 0)) continue;
    blocks.push({ ...make('core/columns', {}), children: columns });
  }
  if (blocks.length > 0) warn('A table with pictures became rows of columns.');
  return blocks;
}

function tableBlock(
  table: HTMLElement,
  base: Record<string, unknown>,
  figcaption: HTMLElement | null,
): CxdBlock {
  const rowsOf = (rows: HTMLElement[]) =>
    rows
      .map((row) => ({
        cells: row.childNodes
          .filter((c): c is HTMLElement => c instanceof HTMLElement && /^T[HD]$/.test(c.tagName))
          .map((cell) => {
            const span = (name: string) => {
              const n = Number(cell.getAttribute(name));
              return Number.isInteger(n) && n > 1 ? n : undefined;
            };
            const align =
              /text-align:\s*(left|center|right)/i.exec(cell.getAttribute('style') ?? '')?.[1] ??
              /has-text-align-(left|center|right)/.exec(cell.getAttribute('class') ?? '')?.[1] ??
              (/^(left|center|right)$/i.test(cell.getAttribute('align') ?? '')
                ? cell.getAttribute('align')
                : undefined);
            const scope = cell.getAttribute('scope');
            return {
              content: inline(cell.innerHTML),
              tag: cell.tagName === 'TH' ? 'th' : 'td',
              ...(scope && /^(row|col|rowgroup|colgroup)$/.test(scope) ? { scope } : {}),
              ...(align ? { align: align.toLowerCase() } : {}),
              ...(span('colspan') ? { colspan: span('colspan') } : {}),
              ...(span('rowspan') ? { rowspan: span('rowspan') } : {}),
            };
          }),
      }))
      .filter((row) => row.cells.length > 0);
  const elements = (node: HTMLElement) =>
    node.childNodes.filter((c): c is HTMLElement => c instanceof HTMLElement);
  const section = (tag: string) =>
    elements(table)
      .filter((c) => c.tagName === tag.toUpperCase())
      .flatMap((c) => elements(c).filter((r) => r.tagName === 'TR'));
  // Rows straight under <table> (classic editors) belong to the body.
  const loose = elements(table).filter((c) => c.tagName === 'TR');
  const head = rowsOf(section('thead'));
  const body = rowsOf([...section('tbody'), ...loose]);
  const foot = rowsOf(section('tfoot'));
  const caption = figcaption ?? table.querySelector('caption');
  return make('core/table', {
    ...base,
    ...(head.length ? { head } : {}),
    ...(body.length ? { body } : {}),
    ...(foot.length ? { foot } : {}),
    hasFixedLayout: /\bhas-fixed-layout\b/.test(table.getAttribute('class') ?? ''),
    ...(caption?.textContent.trim() ? { caption: inline(caption.innerHTML) } : {}),
  });
}

/** WordPress's [gallery ids="…"] shortcode, when its attachments are known. */
function galleryShortcode(text: string, options: ConvertOptions): CxdBlock | null {
  const match = /^\[gallery\b([^\]]*)\]$/i.exec(text);
  if (!match) return null;
  const ids = /ids\s*=\s*["']([\d,\s]+)["']/i.exec(match[1]!)?.[1];
  const refs = (ids ?? '')
    .split(',')
    .map((id) => options.mediaRef?.(Number(id.trim())))
    .filter((ref): ref is string => Boolean(ref));
  if (refs.length === 0) return null;
  const columns = Number(/columns\s*=\s*["']?(\d)/i.exec(match[1]!)?.[1]);
  return {
    ...make('core/gallery', columns >= 1 && columns <= 8 ? { columns } : {}),
    children: refs.map((ref) => make('core/image', { id: ref, alt: '' })),
  };
}

/**
 * WordPress's dynamic blog blocks → the blocks of the Widgets plugin, with
 * WordPress's defaults (no title, the same things shown).
 */
function wpWidget(name: string, a: Record<string, unknown>): CxdBlock {
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? { value: v } : null);
  const taxonomy = (v: unknown, fallback: string) =>
    v === 'post_tag' ? 'tag' : v === 'category' ? 'category' : fallback;
  switch (name) {
    case 'core/latest-posts':
      return make('widgets/recent-posts', {
        title: '-',
        layout: a.postLayout === 'grid' ? 'grid' : 'list',
        count: num(a.postsToShow)?.value ?? 5,
        ...(num(a.columns) ? { columns: a.columns } : {}),
        orderBy: a.orderBy === 'title' ? 'title' : 'date',
        image: a.displayFeaturedImage === true,
        date: a.displayPostDate === true,
        author: a.displayAuthor === true,
        excerpt: a.displayPostContent === true,
        excludeCurrent: false,
      });
    case 'core/latest-comments':
      return make('widgets/recent-comments', {
        title: '-',
        count: num(a.commentsToShow)?.value ?? 5,
        excerpt: a.displayExcerpt !== false,
        date: a.displayDate !== false,
      });
    case 'core/tag-cloud':
      return make('widgets/tag-cloud', {
        title: '-',
        taxonomy: taxonomy(a.taxonomy, 'tag'),
        count: num(a.numberOfTags)?.value ?? 45,
        counts: a.showTagCounts === true,
      });
    case 'core/categories':
      return make('widgets/categories', {
        title: '-',
        taxonomy: taxonomy(a.taxonomy, 'category'),
        counts: a.showPostCounts === true,
        hierarchy: a.showHierarchy === true,
        hideEmpty: a.showEmpty !== true,
      });
    default:
      return make('widgets/search', {
        label: typeof a.label === 'string' ? a.label : '',
        showLabel: a.showLabel !== false,
        placeholder: typeof a.placeholder === 'string' ? a.placeholder : '',
        button: typeof a.buttonText === 'string' ? a.buttonText : '',
      });
  }
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

/** Markup that highlighters and editors put around code: removed, its text kept. */
const CODE_MARKUP =
  /<\/?(?:code|span|b|strong|i|em|u|mark|kbd|samp|var|font|small|big|sub|sup|a)(?:\s[^<>]*)?>/gi;

/**
 * The text of a <pre>, from its HTML as written: escaped code (`&lt;div&gt;`)
 * is decoded only after the markup is removed, so it never loses its tags.
 * The markup around
 * the code (`<pre><code>`, the spans of highlighters) is removed and `<br>`
 * becomes a line break; anything else is the code itself, kept as written:
 * plugins such as SyntaxHighlighter store `<?php … ?>` or `<div>` unescaped.
 */
function preText(raw: string): string {
  return decode(raw.replace(/<br\s*\/?>/gi, '\n').replace(CODE_MARKUP, ''));
}

function decode(text: string): string {
  return text
    .replace(/&#(\d{1,7});/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
