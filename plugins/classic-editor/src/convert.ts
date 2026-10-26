/**
 * Blocks (CXD) ↔ classic HTML, the content of the Visual and Text tabs.
 *
 * The content is stored as ordinary CXD blocks: paragraphs, headings,
 * lists, quotes, code, images, tables, separators, embeds and custom HTML
 * become the HTML a classic editor works with. Blocks without a classic
 * counterpart (columns, buttons, galleries, plugin blocks…) become a
 * non-editable placeholder that carries the whole block, so they come back
 * unchanged. Block ids and the attributes HTML cannot show (styles, drop
 * caps…) are taken from the previous document where the blocks match.
 */
import type { CxdBlock, CxdDocument, CxdInline } from '@cleitext/blocks';
import { escapeHtml, htmlToInline, inlineText, inlineToHtml } from '@cleitext/blocks/inline';

/** Stored as `document.editor.id`. */
export const EDITOR_ID = 'classic';

/** WordPress's "More" tag: kept as a custom HTML block. */
export const MORE_TAG = '<!--more-->';

export interface ToHtmlOptions {
  /**
   * HTML for the Text tab: plain paragraphs are written as text separated by
   * blank lines (no `<p>`), and line breaks as new lines.
   */
  text?: boolean;
  /** Text of a placeholder, from the block's title (default `Block: <title>`). */
  placeholderLabel?: (title: string) => string;
  /** Text of the "More" tag in the Visual tab. */
  moreLabel?: string;
}

export interface ToCxdOptions {
  /**
   * The HTML comes from the Text tab: blank lines separate paragraphs and
   * single new lines are line breaks (as WordPress's wpautop).
   */
  text?: boolean;
}

/** Titles of the blocks shown as placeholders. */
const BLOCK_TITLES: Record<string, string> = {
  'core/gallery': 'Gallery',
  'core/buttons': 'Buttons',
  'core/button': 'Button',
  'core/columns': 'Columns',
  'core/column': 'Column',
  'core/group': 'Group',
  'core/spacer': 'Spacer',
  'core/html': 'Custom HTML',
  'core/embed': 'Embed',
  'core/image': 'Image',
  'core/media-text': 'Media & Text',
  'core/table': 'Table',
  'cleitext/pattern': 'Synced pattern',
};

export function blockTitle(type: string): string {
  if (BLOCK_TITLES[type]) return BLOCK_TITLES[type];
  const name = type.split('/').pop() ?? type;
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
}

// ---- Blocks → HTML -----------------------------------------------------------------------

/** A document as classic HTML (Visual tab), or as the Text tab shows it. */
export function cxdToHtml(document: CxdDocument, options: ToHtmlOptions = {}): string {
  return blocksHtml(document.blocks, options, true);
}

function blocksHtml(blocks: CxdBlock[], options: ToHtmlOptions, top: boolean): string {
  return blocks
    .map((block) => blockHtml(block, options, top))
    .filter((html) => html !== '')
    .join(options.text ? '\n\n' : '\n');
}

const attr = (name: string, value: unknown): string =>
  value === undefined || value === null || value === ''
    ? ''
    : ` ${name}="${escapeHtml(String(value))}"`;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const ALIGNS = new Set(['left', 'center', 'right', 'justify']);

/** `style="text-align: …"`, as TinyMCE writes the alignment of text blocks. */
function alignStyle(value: unknown): string {
  return typeof value === 'string' && ALIGNS.has(value) ? ` style="text-align: ${value};"` : '';
}

function common(block: CxdBlock, extraClasses: string[] = []): string {
  const classes = [...extraClasses, str(block.attrs.className) ?? ''].filter(Boolean).join(' ');
  return attr('id', str(block.attrs.anchor)) + attr('class', classes);
}

function inline(content: CxdInline[] | undefined): string {
  return inlineToHtml(Array.isArray(content) ? content : []);
}

/** Line breaks as new lines, as the Text tab shows them (repeated ones stay `<br>`). */
function textBreaks(html: string): string {
  return html.replace(/<br>(?!<br>|$)/g, '\n');
}

function blockHtml(block: CxdBlock, options: ToHtmlOptions, top: boolean): string {
  const a = block.attrs;
  switch (block.type) {
    case 'core/paragraph': {
      const attributes = common(block) + alignStyle(a.align);
      const html = inline(block.content);
      if (options.text && attributes === '') return textBreaks(html);
      return `<p${attributes}>${html}</p>`;
    }
    case 'core/heading': {
      const level = typeof a.level === 'number' && a.level >= 1 && a.level <= 6 ? a.level : 2;
      return `<h${level}${common(block)}${alignStyle(a.textAlign)}>${inline(block.content)}</h${level}>`;
    }
    case 'core/list':
      return listHtml(block, options);
    case 'core/quote': {
      const children = blocksHtml(block.children ?? [], options, false);
      const citation = Array.isArray(a.citation) ? inline(a.citation as CxdInline[]) : '';
      const separator = options.text ? '\n' : '';
      return `<blockquote${common(block)}>${children}${citation ? `${separator}<cite>${citation}</cite>` : ''}</blockquote>`;
    }
    case 'core/code': {
      const text = inlineText(Array.isArray(block.content) ? block.content : []);
      // The parser drops a new line right after <pre>: keep a leading one.
      return `<pre${common(block)}>${text.startsWith('\n') ? '\n' : ''}${escapeHtml(text)}</pre>`;
    }
    case 'core/image':
      return imageHtml(block, options, top);
    case 'core/table':
      return tableHtml(block);
    case 'core/separator':
      return `<hr${common(block)}>`;
    case 'core/html': {
      const content = typeof a.content === 'string' ? a.content : '';
      if (content.trim() === MORE_TAG) return moreHtml(options);
      // Markup the visual editor would change (scripts, frames, forms…), or
      // that would not come back as the same block, stays a placeholder.
      if (!options.text && !safeForVisual(content)) return placeholderHtml(block, options);
      if (!comesBackAsHtml(content, options.text === true)) return placeholderHtml(block, options);
      return content.trim();
    }
    case 'core/embed': {
      const url = str(a.url);
      if (!url) return placeholderHtml(block, options);
      // As WordPress: the address alone on its line.
      return options.text ? escapeHtml(url) : `<p>${escapeHtml(url)}</p>`;
    }
    default:
      return placeholderHtml(block, options);
  }
}

function listHtml(block: CxdBlock, options: ToHtmlOptions): string {
  const ordered = block.attrs.ordered === true;
  const tag = ordered ? 'ol' : 'ul';
  const start =
    ordered && typeof block.attrs.start === 'number' ? attr('start', block.attrs.start) : '';
  const nl = options.text ? '\n' : '';
  const items = (block.children ?? []).map((item) => {
    if (item.type !== 'core/list-item') return blockHtml(item, options, false);
    const nested = (item.children ?? []).map((child) =>
      child.type === 'core/list' ? listHtml(child, options) : blockHtml(child, options, false),
    );
    return `<li${common(item)}>${inline(item.content)}${nested.join('')}</li>`;
  });
  return `<${tag}${common(block)}${start}>${nl}${items.join(nl)}${nl}</${tag}>`;
}

function imageHtml(block: CxdBlock, options: ToHtmlOptions, top: boolean): string {
  const a = block.attrs;
  const url = str(a.url);
  if (!url) return placeholderHtml(block, options);
  const numeric = (value: unknown) =>
    typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))
      ? value
      : undefined;
  const align = str(a.align) ? `align${String(a.align)}` : '';
  const size = str(a.sizeSlug) ? `size-${String(a.sizeSlug)}` : '';
  const caption = Array.isArray(a.caption) ? inline(a.caption as CxdInline[]) : '';
  const imgClasses = [caption ? '' : align, size, caption ? '' : (str(a.className) ?? '')]
    .filter(Boolean)
    .join(' ');
  let html =
    `<img src="${escapeHtml(url)}"` +
    ` alt="${escapeHtml(typeof a.alt === 'string' ? a.alt : '')}"` +
    attr('class', imgClasses) +
    attr('width', numeric(a.width)) +
    attr('height', numeric(a.height)) +
    attr('data-id', a.id) +
    '>';
  const href = str(a.href);
  if (href) {
    const target = a.linkTarget === '_blank' ? ' target="_blank"' : '';
    const rel = attr('rel', str(a.rel));
    html = `<a href="${escapeHtml(href)}"${target}${rel}>${html}</a>`;
  }
  if (caption) {
    const classes = ['ce-image', align, str(a.className) ?? ''].filter(Boolean).join(' ');
    return `<figure${attr('id', str(a.anchor))} class="${escapeHtml(classes)}">${html}<figcaption>${caption}</figcaption></figure>`;
  }
  // Images sit in a paragraph in the Visual tab, alone on their line in the Text tab.
  return options.text || !top ? html : `<p${attr('id', str(a.anchor))}>${html}</p>`;
}

interface TableCell {
  content?: CxdInline[];
  tag?: 'td' | 'th';
  scope?: string;
  align?: string;
  colspan?: number;
  rowspan?: number;
}
type TableRow = { cells?: TableCell[] };

function tableHtml(block: CxdBlock): string {
  const a = block.attrs;
  const rows = (value: unknown, tag: string) => {
    const list = Array.isArray(value) ? (value as TableRow[]) : [];
    if (list.length === 0) return '';
    const html = list
      .map(
        (row) =>
          '<tr>' +
          (row.cells ?? [])
            .map((cell) => {
              const name = cell.tag === 'th' ? 'th' : 'td';
              return (
                `<${name}` +
                attr('scope', cell.scope) +
                attr('colspan', cell.colspan) +
                attr('rowspan', cell.rowspan) +
                alignStyle(cell.align) +
                `>${inline(cell.content)}</${name}>`
              );
            })
            .join('') +
          '</tr>',
      )
      .join('\n');
    return `<${tag}>\n${html}\n</${tag}>\n`;
  };
  const caption = Array.isArray(a.caption) ? inline(a.caption as CxdInline[]) : '';
  const classes = a.hasFixedLayout === true ? ['has-fixed-layout'] : [];
  return (
    `<table${common(block, classes)}>\n` +
    (caption ? `<caption>${caption}</caption>\n` : '') +
    rows(a.head, 'thead') +
    rows(a.body, 'tbody') +
    rows(a.foot, 'tfoot') +
    '</table>'
  );
}

function moreHtml(options: ToHtmlOptions): string {
  if (options.text) return MORE_TAG;
  const label = escapeHtml(options.moreLabel ?? 'More');
  return `<div class="ce-more mceNonEditable" contenteditable="false" data-ce-more="1">${label}</div>`;
}

/** Elements and attributes the visual editor removes or rewrites. */
const UNSAFE_FOR_VISUAL =
  /<(script|style|iframe|object|embed|form|input|button|select|textarea|svg|math|video|audio|canvas|noscript|template|link|meta)\b|\son[a-z]+\s*=|javascript:/i;

function safeForVisual(html: string): boolean {
  return !UNSAFE_FOR_VISUAL.test(html);
}

/** Whether this HTML is read back as one custom HTML block with the same content. */
function comesBackAsHtml(html: string, text: boolean): boolean {
  const source = html.trim();
  if (!source) return false;
  const blocks = blocksFrom(Array.from(parseHtml(source).childNodes), {
    text,
    embeds: new Set(),
  });
  return (
    blocks.length === 1 && blocks[0]!.type === 'core/html' && blocks[0]!.attrs.content === source
  );
}

function placeholderHtml(block: CxdBlock, options: ToHtmlOptions): string {
  const title = blockTitle(block.type);
  const label = options.placeholderLabel ? options.placeholderLabel(title) : `Block: ${title}`;
  return (
    `<div class="ce-block mceNonEditable" contenteditable="false" data-ce-block="${encodeBlock(block)}">` +
    `${escapeHtml(label)}</div>`
  );
}

/** A block as base64 JSON (UTF-8), for a placeholder's `data-ce-block`. */
export function encodeBlock(block: CxdBlock): string {
  const bytes = new TextEncoder().encode(JSON.stringify(block));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBlock(value: string): CxdBlock | null {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const block = JSON.parse(new TextDecoder().decode(bytes)) as CxdBlock;
    return block && typeof block.type === 'string' && typeof block.id === 'string' ? block : null;
  } catch {
    return null;
  }
}

// ---- HTML → blocks -----------------------------------------------------------------------

let counter = 0;

/** A new block id, in the same form as the core's. */
export function newId(): string {
  counter = (counter + 1) % 1_296;
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `b_${time}${counter.toString(36).padStart(2, '0')}${random}`;
}

const make = (type: string, attrs: Record<string, unknown>, content?: CxdInline[]): CxdBlock => ({
  id: newId(),
  type,
  v: 1,
  attrs,
  ...(content ? { content } : {}),
});

/** Phrasing elements: they gather into paragraphs. */
const INLINE_TAGS = new Set([
  'A',
  'ABBR',
  'ACRONYM',
  'B',
  'BDI',
  'BDO',
  'BIG',
  'BR',
  'CITE',
  'CODE',
  'DATA',
  'DEL',
  'DFN',
  'EM',
  'FONT',
  'I',
  'IMG',
  'INS',
  'KBD',
  'LABEL',
  'MARK',
  'Q',
  'S',
  'SAMP',
  'SMALL',
  'SPAN',
  'STRIKE',
  'STRONG',
  'SUB',
  'SUP',
  'TIME',
  'TT',
  'U',
  'VAR',
  'WBR',
]);

interface Context {
  text: boolean;
  /** Addresses of the previous document's embeds: they stay embeds. */
  embeds: Set<string>;
}

/** Classic HTML (Visual or Text tab) → a document of the classic editor. */
export function htmlToCxd(
  html: string,
  previous?: CxdDocument | null,
  options: ToCxdOptions = {},
): CxdDocument {
  const body = parseHtml(html);
  const embeds = new Set<string>();
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      if (block.type === 'core/embed' && typeof block.attrs.url === 'string')
        embeds.add(block.attrs.url);
      if (block.children) walk(block.children);
    }
  };
  walk(previous?.blocks ?? []);
  const context: Context = { text: options.text === true, embeds };
  let blocks = blocksFrom(Array.from(body.childNodes), context);
  if (previous) blocks = adopt(blocks, previous.blocks);
  blocks = uniqueIds(blocks, new Set());
  const data = previous?.editor?.id === EDITOR_ID ? previous.editor.data : undefined;
  return {
    schema: 1,
    blocks,
    editor: { id: EDITOR_ID, ...(data ? { data } : {}) },
  };
}

function parseHtml(html: string): HTMLElement {
  // In <body> from the start, so leading comments (<!--more-->) stay in it.
  return new DOMParser().parseFromString(
    `<!DOCTYPE html><html><head></head><body>${html}`,
    'text/html',
  ).body;
}

const isElement = (node: Node): node is HTMLElement => node.nodeType === 1;
const isText = (node: Node): node is Text => node.nodeType === 3;
const isComment = (node: Node): node is Comment => node.nodeType === 8;

function serialize(nodes: Node[]): string {
  return nodes
    .map((node) =>
      isElement(node)
        ? node.outerHTML
        : isText(node)
          ? escapeHtml(node.data)
          : isComment(node)
            ? `<!--${node.data}-->`
            : '',
    )
    .join('');
}

/** Inline HTML → rich text, with the whitespace rules of the tab. */
function inlineFrom(html: string, context: Context): CxdInline[] {
  let source = html.replace(/<!--[\s\S]*?-->/g, '');
  source = context.text
    ? source.replace(/[ \t]*\r?\n[ \t]*/g, '<br>')
    : source.replace(/[ \t\r\n]+/g, ' ');
  source = source.replace(/(<br\s*\/?>)\s+/gi, '$1');
  const content = htmlToInline(source);
  return trimInline(content);
}

/** Leading and trailing spaces (and line breaks) removed. */
function trimInline(content: CxdInline[]): CxdInline[] {
  const out = content.map((node) =>
    'type' in node ? { ...node, children: node.children.map((c) => ({ ...c })) } : { ...node },
  );
  const textOf = (node: CxdInline) => ('type' in node ? node.children : [node]);
  while (out.length) {
    const runs = textOf(out[0]!);
    const first = runs[0];
    if (first) first.text = first.text.replace(/^[ \n]+/, '');
    if (first && first.text === '') runs.shift();
    if (runs.length === 0) out.shift();
    else if (first && first.text === '') continue;
    else break;
  }
  while (out.length) {
    const runs = textOf(out[out.length - 1]!);
    const last = runs[runs.length - 1];
    if (last) last.text = last.text.replace(/[ \n]+$/, '');
    if (last && last.text === '') runs.pop();
    if (runs.length === 0) out.pop();
    else if (last && last.text === '') continue;
    else break;
  }
  return out;
}

const blank = (content: CxdInline[]) => inlineText(content).replace(/\s/g, '') === '';

function blocksFrom(nodes: Node[], context: Context): CxdBlock[] {
  const blocks: CxdBlock[] = [];
  let pending: Node[] = [];
  const flush = () => {
    if (pending.length) blocks.push(...looseBlocks(pending, context));
    pending = [];
  };
  for (const node of nodes) {
    if (isText(node)) {
      pending.push(node);
      continue;
    }
    if (isComment(node)) {
      flush();
      const comment = `<!--${node.data}-->`;
      blocks.push(make('core/html', { content: comment.trim() === MORE_TAG ? MORE_TAG : comment }));
      continue;
    }
    if (!isElement(node)) continue;
    const placeholder = node.getAttribute('data-ce-block');
    if (placeholder !== null) {
      flush();
      const block = decodeBlock(placeholder);
      if (block) blocks.push(block);
      continue;
    }
    if (node.hasAttribute('data-ce-more') || node.classList.contains('ce-more')) {
      flush();
      blocks.push(make('core/html', { content: MORE_TAG }));
      continue;
    }
    if (INLINE_TAGS.has(node.tagName)) {
      pending.push(node);
      continue;
    }
    flush();
    blocks.push(...elementBlocks(node, context));
  }
  flush();
  return blocks;
}

/** Loose text and inline elements: paragraphs (split on blank lines in the Text tab). */
function looseBlocks(nodes: Node[], context: Context): CxdBlock[] {
  if (!context.text) return paragraphBlocks(nodes, {}, context);
  const html = serialize(nodes);
  if (!html.trim()) return [];
  return html
    .split(/[ \t]*\r?\n[ \t]*\r?\n\s*/)
    .flatMap((chunk) => paragraphBlocks(Array.from(parseHtml(chunk).childNodes), {}, context));
}

/** An image alone (or in a link): `<img>` or `<a><img></a>`. */
function imageElement(node: Node): HTMLElement | null {
  if (!isElement(node)) return null;
  if (node.tagName === 'IMG') return node;
  if (node.tagName === 'A') {
    const children = Array.from(node.childNodes).filter(
      (child) => !(isText(child) && child.data.trim() === ''),
    );
    if (children.length === 1 && isElement(children[0]!) && children[0].tagName === 'IMG')
      return node;
  }
  return null;
}

/**
 * Paragraphs from inline nodes; images among them become image blocks, and
 * an address alone becomes an embed, as in WordPress.
 */
function paragraphBlocks(
  nodes: Node[],
  attrs: Record<string, unknown>,
  context: Context,
): CxdBlock[] {
  const blocks: CxdBlock[] = [];
  let run: Node[] = [];
  const flush = () => {
    const content = inlineFrom(serialize(run), context);
    run = [];
    if (blank(content)) return;
    const url = soleUrl(content);
    const embed = url ? embedFor(url, context) : null;
    blocks.push(embed ?? make('core/paragraph', { ...attrs }, content));
  };
  for (const node of nodes) {
    const image = imageElement(node);
    if (image) {
      flush();
      blocks.push(imageBlock(image, null, context));
    } else {
      run.push(node);
    }
  }
  flush();
  return blocks;
}

function soleUrl(content: CxdInline[]): string | null {
  if (content.length !== 1) return null;
  const node = content[0]!;
  if ('type' in node) {
    const text = inlineText([node]).trim();
    return node.href === text && /^https?:\/\/\S+$/.test(text) ? text : null;
  }
  if (node.marks?.length || node.color) return null;
  const text = node.text.trim();
  return /^https?:\/\/\S+$/.test(text) ? text : null;
}

const EMBED_PROVIDERS: { host: RegExp; provider: string; type: string }[] = [
  {
    host: /^(?:www\.|m\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i,
    provider: 'youtube',
    type: 'video',
  },
  { host: /^(?:www\.|player\.)?vimeo\.com$/i, provider: 'vimeo', type: 'video' },
  { host: /^(?:www\.)?(?:dailymotion\.com|dai\.ly)$/i, provider: 'dailymotion', type: 'video' },
  { host: /^open\.spotify\.com$/i, provider: 'spotify', type: 'rich' },
];

function embedFor(url: string, context: Context): CxdBlock | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  const known = EMBED_PROVIDERS.find((p) => p.host.test(host));
  if (!known && !context.embeds.has(url)) return null;
  return make('core/embed', {
    url,
    ...(known ? { type: known.type, providerNameSlug: known.provider, responsive: true } : {}),
  });
}

const textAlign = (element: HTMLElement): string | undefined => {
  const value = /(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)/i.exec(
    element.getAttribute('style') ?? '',
  )?.[1];
  return value?.toLowerCase();
};

/** `id` and `class` of an element, as the block's anchor and class name. */
function commonAttrs(element: HTMLElement, skip?: RegExp): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const id = element.getAttribute('id');
  if (id) result.anchor = id;
  const classes = Array.from(element.classList).filter(
    (name) => !name.startsWith('ce-') && !name.startsWith('mce') && !(skip && skip.test(name)),
  );
  if (classes.length) result.className = classes.join(' ');
  return result;
}

function elementBlocks(element: HTMLElement, context: Context): CxdBlock[] {
  const tag = element.tagName;
  switch (tag) {
    case 'P': {
      const align = textAlign(element);
      const attrs = { ...commonAttrs(element), ...(align ? { align } : {}) };
      return paragraphBlocks(Array.from(element.childNodes), attrs, context);
    }
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6': {
      const align = textAlign(element);
      return [
        make(
          'core/heading',
          {
            level: Number(tag.slice(1)),
            ...commonAttrs(element),
            ...(align ? { textAlign: align } : {}),
          },
          inlineFrom(element.innerHTML, context),
        ),
      ];
    }
    case 'UL':
    case 'OL':
      return [listBlock(element, context)];
    case 'BLOCKQUOTE':
      return [quoteBlock(element, context)];
    case 'PRE':
      return [make('core/code', commonAttrs(element), [{ text: preText(element) }])];
    case 'HR':
      return [make('core/separator', commonAttrs(element))];
    case 'TABLE':
      return [tableBlock(element, context)];
    case 'FIGURE': {
      const image = element.querySelector('img');
      if (image) return [imageBlock(element, image, context)];
      const table = element.querySelector('table');
      if (table) return [tableBlock(table, context, element.querySelector('figcaption'))];
      return [make('core/html', { content: element.outerHTML })];
    }
    case 'DIV': {
      // A plain wrapper (pasted content): its content.
      if (element.attributes.length === 0)
        return blocksFrom(Array.from(element.childNodes), context);
      return [make('core/html', { content: element.outerHTML })];
    }
    default:
      // Anything else (forms, frames, scripts, sections…) is kept as it is.
      return [make('core/html', { content: element.outerHTML })];
  }
}

function listBlock(list: HTMLElement, context: Context): CxdBlock {
  const ordered = list.tagName === 'OL';
  const start = Number(list.getAttribute('start'));
  const items: CxdBlock[] = [];
  for (const child of Array.from(list.childNodes)) {
    if (!isElement(child)) continue;
    if (child.tagName === 'LI') {
      items.push(listItem(child, context));
    } else if (child.tagName === 'UL' || child.tagName === 'OL') {
      // A list right inside a list: it belongs to the item before it.
      const nested = listBlock(child, context);
      const last = items[items.length - 1];
      if (last) last.children = [...(last.children ?? []), nested];
      else items.push({ ...make('core/list-item', {}, []), children: [nested] });
    }
  }
  return {
    ...make('core/list', {
      ...commonAttrs(list),
      ...(ordered ? { ordered: true } : {}),
      ...(ordered && Number.isInteger(start) && list.hasAttribute('start') ? { start } : {}),
    }),
    children: items,
  };
}

function listItem(li: HTMLElement, context: Context): CxdBlock {
  const own: Node[] = [];
  const children: CxdBlock[] = [];
  for (const node of Array.from(li.childNodes)) {
    if (isElement(node) && (node.tagName === 'UL' || node.tagName === 'OL')) {
      children.push(listBlock(node, context));
    } else if (isElement(node) && node.hasAttribute('data-ce-block')) {
      const block = decodeBlock(node.getAttribute('data-ce-block') ?? '');
      if (block) children.push(block);
    } else {
      own.push(node);
    }
  }
  // Paragraphs inside an item (pasted content): their lines, one after the other.
  const html = serialize(own)
    .replace(/<\/p>\s*<p[^>]*>/gi, '<br>')
    .replace(/<\/?p[^>]*>/gi, '');
  return {
    ...make('core/list-item', commonAttrs(li), inlineFrom(html, context)),
    ...(children.length ? { children } : {}),
  };
}

function quoteBlock(quote: HTMLElement, context: Context): CxdBlock {
  const nodes = Array.from(quote.childNodes);
  // The citation: a <cite> (or a paragraph with only a <cite>) at the end.
  let citation: CxdInline[] | undefined;
  let end = nodes.length;
  while (end > 0 && isText(nodes[end - 1]!) && (nodes[end - 1] as Text).data.trim() === '') end--;
  const last = nodes[end - 1];
  const citeOf = (node: Node | undefined): HTMLElement | null => {
    if (!node || !isElement(node)) return null;
    if (node.tagName === 'CITE') return node;
    if (node.tagName === 'P' || node.tagName === 'FOOTER') {
      const children = Array.from(node.childNodes).filter(
        (child) => !(isText(child) && child.data.trim() === ''),
      );
      if (children.length === 1 && isElement(children[0]!) && children[0].tagName === 'CITE')
        return children[0];
    }
    return null;
  };
  const cite = citeOf(last);
  if (cite) {
    citation = inlineFrom(cite.innerHTML, context);
    end--;
  }
  const children = blocksFrom(nodes.slice(0, end), context);
  return {
    ...make('core/quote', {
      ...commonAttrs(quote),
      ...(citation && !blank(citation) ? { citation } : {}),
    }),
    children,
  };
}

/** The text of a <pre>: its line breaks (`<br>` included) and its characters. */
function preText(pre: HTMLElement): string {
  const copy = pre.cloneNode(true) as HTMLElement;
  for (const br of Array.from(copy.querySelectorAll('br'))) br.replaceWith('\n');
  return copy.textContent ?? '';
}

function imageBlock(node: HTMLElement, img: HTMLElement | null, context: Context): CxdBlock {
  const image = img ?? (node.tagName === 'IMG' ? node : node.querySelector('img'));
  const link = node.tagName === 'A' ? node : node.querySelector('a');
  const caption = node.tagName === 'FIGURE' ? node.querySelector('figcaption') : null;
  const classes = [
    ...Array.from(image?.classList ?? []),
    ...(node.tagName === 'FIGURE' ? Array.from(node.classList) : []),
  ];
  const align = classes
    .map((name) => /^align(left|center|right|wide|full)$/.exec(name)?.[1])
    .find(Boolean);
  const size = classes.map((name) => /^size-([\w-]+)$/.exec(name)?.[1]).find(Boolean);
  const className = classes
    .filter(
      (name) =>
        !/^(align(left|center|right|wide|full|none)|size-[\w-]+|wp-image-\d+)$/.test(name) &&
        !name.startsWith('ce-') &&
        !name.startsWith('mce'),
    )
    .join(' ');
  const number = (name: string) => {
    const value = image?.getAttribute(name);
    return value && /^\d+$/.test(value) ? Number(value) : undefined;
  };
  const id = image?.getAttribute('data-id');
  const href = link?.getAttribute('href');
  const anchor = node.tagName === 'FIGURE' ? node.getAttribute('id') : null;
  const captionContent = caption ? inlineFrom(caption.innerHTML, context) : [];
  return make('core/image', {
    ...(id ? { id } : {}),
    url: image?.getAttribute('src') ?? '',
    alt: image?.getAttribute('alt') ?? '',
    ...(align ? { align } : {}),
    ...(number('width') !== undefined ? { width: number('width') } : {}),
    ...(number('height') !== undefined ? { height: number('height') } : {}),
    ...(size ? { sizeSlug: size } : {}),
    ...(href ? { href } : {}),
    ...(href && link?.getAttribute('target') === '_blank' ? { linkTarget: '_blank' } : {}),
    ...(href && link?.getAttribute('rel') ? { rel: link.getAttribute('rel') } : {}),
    ...(className ? { className } : {}),
    ...(anchor ? { anchor } : {}),
    ...(!blank(captionContent) ? { caption: captionContent } : {}),
  });
}

function tableBlock(
  table: HTMLElement,
  context: Context,
  figcaption: HTMLElement | null = null,
): CxdBlock {
  const elements = (node: Element) => Array.from(node.children) as HTMLElement[];
  const rowsOf = (rows: HTMLElement[]) =>
    rows
      .map((row) => ({
        cells: elements(row)
          .filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH')
          .map((cell) => {
            const span = (name: string) => {
              const n = Number(cell.getAttribute(name));
              return Number.isInteger(n) && n > 1 ? n : undefined;
            };
            const align = textAlign(cell);
            const scope = cell.getAttribute('scope');
            return {
              content: inlineFrom(cell.innerHTML, context),
              tag: cell.tagName === 'TH' ? 'th' : 'td',
              ...(scope && /^(row|col|rowgroup|colgroup)$/.test(scope) ? { scope } : {}),
              ...(align && align !== 'justify' ? { align } : {}),
              ...(span('colspan') ? { colspan: span('colspan') } : {}),
              ...(span('rowspan') ? { rowspan: span('rowspan') } : {}),
            };
          }),
      }))
      .filter((row) => row.cells.length > 0);
  const section = (tag: string) =>
    elements(table)
      .filter((child) => child.tagName === tag)
      .flatMap((child) => elements(child).filter((row) => row.tagName === 'TR'));
  const loose = elements(table).filter((child) => child.tagName === 'TR');
  const head = rowsOf(section('THEAD'));
  const body = rowsOf([...section('TBODY'), ...loose]);
  const foot = rowsOf(section('TFOOT'));
  const captionElement = figcaption ?? elements(table).find((child) => child.tagName === 'CAPTION');
  const caption = captionElement ? inlineFrom(captionElement.innerHTML, context) : [];
  return make('core/table', {
    ...commonAttrs(table, /^has-fixed-layout$/),
    ...(head.length ? { head } : {}),
    ...(body.length ? { body } : {}),
    ...(foot.length ? { foot } : {}),
    ...(table.classList.contains('has-fixed-layout') ? { hasFixedLayout: true } : {}),
    ...(!blank(caption) ? { caption } : {}),
  });
}

// ---- Ids and attributes of the previous document -----------------------------------------

/** Attributes each block shows in HTML; the others are taken from the previous block. */
const SHOWN: Record<string, string[]> = {
  'core/paragraph': ['align', 'anchor', 'className'],
  'core/heading': ['level', 'textAlign', 'anchor', 'className'],
  'core/list': ['ordered', 'start', 'anchor', 'className'],
  'core/list-item': ['anchor', 'className'],
  'core/quote': ['citation', 'anchor', 'className'],
  'core/code': ['anchor', 'className'],
  'core/image': [
    'id',
    'url',
    'alt',
    'align',
    'width',
    'height',
    'sizeSlug',
    'href',
    'linkTarget',
    'rel',
    'caption',
    'anchor',
    'className',
  ],
  'core/table': ['head', 'body', 'foot', 'caption', 'hasFixedLayout', 'anchor', 'className'],
  'core/separator': ['anchor', 'className'],
  'core/embed': ['url'],
  'core/html': ['content'],
};

/** Whether the HTML writer shows this value (else it is kept from the previous block). */
function shown(type: string, key: string, value: unknown): boolean {
  if (!SHOWN[type]?.includes(key)) return false;
  if (
    (type === 'core/paragraph' && key === 'align') ||
    (type === 'core/heading' && key === 'textAlign')
  )
    return typeof value === 'string' && ALIGNS.has(value);
  if (type === 'core/image' && (key === 'width' || key === 'height'))
    return typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value));
  if (type === 'core/heading' && key === 'level') return true;
  return true;
}

/** What identifies a block's content, ids aside. */
function signature(block: CxdBlock): string {
  return JSON.stringify([
    block.type,
    block.content ?? null,
    block.attrs.url ?? null,
    block.attrs.content ?? null,
    (block.children ?? []).map(signature),
  ]);
}

/**
 * Gives new blocks the ids (and the attributes HTML does not show) of the
 * previous blocks they match: the same content first, else the same type at
 * the same place.
 */
function adopt(blocks: CxdBlock[], previous: CxdBlock[]): CxdBlock[] {
  const used = new Set<CxdBlock>();
  const signatures = new Map<CxdBlock, string>(previous.map((b) => [b, signature(b)]));
  const matches = blocks.map((block) => {
    const sig = signature(block);
    const same = previous.find((old) => !used.has(old) && signatures.get(old) === sig);
    if (same) used.add(same);
    return same;
  });
  return blocks.map((block, index) => {
    // Placeholders came back as they were.
    if (!SHOWN[block.type]) return block;
    let old = matches[index];
    if (!old) {
      const candidate = previous[index];
      if (candidate && !used.has(candidate) && candidate.type === block.type) {
        old = candidate;
        used.add(candidate);
      }
    }
    if (!old) return block;
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(old.attrs)) {
      if (!(key in block.attrs) && !shown(block.type, key, value)) attrs[key] = value;
    }
    Object.assign(attrs, block.attrs);
    // The media id keeps its type (a number from WordPress, a string otherwise).
    if (block.type === 'core/image' && String(old.attrs.id) === String(block.attrs.id))
      attrs.id = old.attrs.id;
    const children = block.children ? { children: adopt(block.children, old.children ?? []) } : {};
    return { ...block, id: old.id, attrs: orderLike(attrs, old.attrs), ...children };
  });
}

/** Keys in the previous order, so unchanged blocks stay identical. */
function orderLike(
  attrs: Record<string, unknown>,
  model: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(model)) if (key in attrs) result[key] = attrs[key];
  for (const key of Object.keys(attrs)) if (!(key in result)) result[key] = attrs[key];
  return result;
}

/** A pasted copy of a block gets new ids (its children too). */
function uniqueIds(blocks: CxdBlock[], seen: Set<string>, fresh = false): CxdBlock[] {
  return blocks.map((block) => {
    const duplicate = fresh || seen.has(block.id);
    const id = duplicate ? newId() : block.id;
    seen.add(id);
    const children = block.children ? { children: uniqueIds(block.children, seen, duplicate) } : {};
    return duplicate || block.children ? { ...block, id, ...children } : block;
  });
}

// ---- Switching editors ------------------------------------------------------------------

/** From the block editor: the same blocks, opened with the classic editor. */
export function fromBlocks(document: CxdDocument): CxdDocument {
  return { ...document, editor: { id: EDITOR_ID } };
}

/** Back to the block editor: the same blocks. */
export function toBlocks(document: CxdDocument): CxdDocument {
  const rest = { ...document };
  delete rest.editor;
  return rest;
}

/** Words of a document, as the status bar counts them. */
export function countWords(text: string): number {
  const words = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word));
  return words.length;
}

/** Words of a document's text (rich text, captions, citations and table cells). */
export function documentWords(document: CxdDocument): number {
  const parts: string[] = [];
  const add = (value: unknown) => {
    if (Array.isArray(value)) parts.push(inlineText(value as CxdInline[]));
  };
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      add(block.content);
      add(block.attrs.caption);
      add(block.attrs.citation);
      for (const section of ['head', 'body', 'foot']) {
        const rows = block.attrs[section];
        if (block.type !== 'core/table' || !Array.isArray(rows)) continue;
        for (const row of rows as TableRow[]) for (const cell of row.cells ?? []) add(cell.content);
      }
      if (block.children) walk(block.children);
    }
  };
  walk(document.blocks);
  return countWords(parts.join('\n'));
}
