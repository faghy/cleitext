/**
 * Switching editors: block editor content becomes Fresco elements
 * (`fromBlocks`), and back (`toBlocks`). Text keeps its formatting; what
 * has no counterpart becomes HTML, so nothing is lost silently.
 *
 * Pure code: the admin uses it when switching editors, the server when an
 * AI assistant sends blocks for a Fresco page (`ctx.ai`, plugin API 1.40).
 */
import type { CxdBlock, CxdDocument, CxdInline } from '@cleitext/blocks';
import { htmlToBlocks, htmlToInline } from '@cleitext/blocks/inline';
import { newId } from './ids.js';
import type { FrescoNode, Settings } from './model.js';

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TAG: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  code: 'code',
  sup: 'sup',
  sub: 'sub',
  highlight: 'mark',
};

/** CXD inline nodes as HTML. */
export function inlineHtml(nodes: CxdInline[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if ('type' in node && node.type === 'link') {
        const target = node.target ? ` target="_blank" rel="noopener"` : '';
        return `<a href="${escape(node.href)}"${target}>${inlineHtml(node.children)}</a>`;
      }
      const text = node as { text: string; marks?: string[] };
      let html = escape(text.text).replace(/\n/g, '<br>');
      for (const mark of text.marks ?? []) {
        const tag = TAG[mark];
        if (tag) html = `<${tag}>${html}</${tag}>`;
      }
      return html;
    })
    .join('');
}

export function inlineText(nodes: CxdInline[] | undefined): string {
  return (nodes ?? [])
    .map((node) =>
      'type' in node && node.type === 'link'
        ? inlineText(node.children)
        : (node as { text: string }).text,
    )
    .join('');
}

const el = (type: string, attrs: Settings, children?: FrescoNode[]): FrescoNode => ({
  id: newId(),
  type: `fresco/${type}`,
  v: 1,
  attrs,
  ...(children ? { children } : {}),
});

function listHtml(block: CxdBlock): string {
  const tag = block.attrs.ordered === true ? 'ol' : 'ul';
  const items = (block.children ?? [])
    .map(
      (item) =>
        `<li>${inlineHtml(item.content)}${(item.children ?? []).map(listHtml).join('')}</li>`,
    )
    .join('');
  return `<${tag}>${items}</${tag}>`;
}

/** One block editor block as Fresco elements (none when it is empty). */
function fromBlock(block: CxdBlock): FrescoNode[] {
  const a = block.attrs;
  switch (block.type) {
    case 'core/paragraph':
      return inlineText(block.content).trim()
        ? [el('text', { content: `<p>${inlineHtml(block.content)}</p>` })]
        : [];
    case 'core/heading':
      return [
        el('heading', {
          title: inlineText(block.content),
          ...(a.textAlign === 'center' || a.textAlign === 'right' ? { align: a.textAlign } : {}),
          tag: `h${typeof a.level === 'number' ? a.level : 2}`,
        }),
      ];
    case 'core/list':
      return [el('text', { content: listHtml(block) })];
    case 'core/quote': {
      const inner = (block.children ?? [])
        .map((child) => `<p>${inlineHtml(child.content)}</p>`)
        .join('');
      return [el('text', { content: `<blockquote>${inner}</blockquote>` })];
    }
    case 'core/code':
      return [
        el('text', { content: `<pre><code>${escape(inlineText(block.content))}</code></pre>` }),
      ];
    case 'core/image': {
      if (typeof a.url !== 'string' || !a.url) return [];
      const image = {
        id: typeof a.id === 'string' ? a.id : null,
        url: a.url,
        ...(typeof a.alt === 'string' ? { alt: a.alt } : {}),
      };
      return [
        el('image', {
          image,
          ...(Array.isArray(a.caption) && inlineText(a.caption as CxdInline[])
            ? { caption_source: 'custom', caption: inlineText(a.caption as CxdInline[]) }
            : {}),
        }),
      ];
    }
    case 'core/buttons':
      return (block.children ?? []).flatMap(fromBlock);
    case 'core/button':
      return [
        el('button', {
          text: inlineText(block.content) || 'Button',
          ...(typeof a.url === 'string' && a.url
            ? { link: { url: a.url, ...(a.linkTarget === '_blank' ? { newTab: true } : {}) } }
            : {}),
        }),
      ];
    case 'core/separator':
      return [el('divider', {})];
    case 'core/spacer': {
      const height = Number.parseInt(String(a.height ?? '50'), 10);
      return [el('spacer', { space: { size: Number.isFinite(height) ? height : 50, unit: 'px' } })];
    }
    case 'core/embed': {
      const url = typeof a.url === 'string' ? a.url : '';
      if (/youtu\.?be/.test(url)) return [el('video', { source: 'youtube', url })];
      if (/vimeo\.com/.test(url)) return [el('video', { source: 'vimeo', url })];
      return url
        ? [el('text', { content: `<p><a href="${escape(url)}">${escape(url)}</a></p>` })]
        : [];
    }
    case 'core/html':
      return [el('html', { code: typeof a.content === 'string' ? a.content : '' })];
    case 'core/gallery': {
      const images = (block.children ?? [])
        .filter((c) => c.type === 'core/image')
        .map((c) => ({
          id: typeof c.attrs.id === 'string' ? c.attrs.id : null,
          url: typeof c.attrs.url === 'string' ? c.attrs.url : '',
          ...(typeof c.attrs.alt === 'string' ? { alt: c.attrs.alt } : {}),
        }));
      const columns = Number(a.columns);
      return images.length
        ? [el('gallery', { images, ...(columns >= 1 && columns <= 8 ? { columns } : {}) })]
        : [];
    }
    case 'core/table':
      // A table keeps its cells as HTML.
      return [el('html', { code: tableHtml(block) })];
    case 'core/columns':
      return [
        el(
          'container',
          {
            flex_direction: 'row',
            'flex_direction@mobile': 'column',
            content_width: 'full',
            _padding: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px' },
          },
          (block.children ?? []).map((column) =>
            el('container', { content_width: 'full' }, (column.children ?? []).flatMap(fromBlock)),
          ),
        ),
      ];
    case 'core/group':
      return [
        el('container', { content_width: 'full' }, (block.children ?? []).flatMap(fromBlock)),
      ];
    default: {
      // Blocks of plugins go into a plugin block element, unchanged.
      if (!block.type.startsWith('core/') && block.type.includes('/')) {
        return [el('block', {}, [block as unknown as FrescoNode])];
      }
      // Unknown blocks: their text, so nothing disappears.
      const text = inlineText(block.content);
      return text ? [el('text', { content: `<p>${escape(text)}</p>` })] : [];
    }
  }
}

/** A core/table as HTML: its sections, rows and cells. */
function tableHtml(table: CxdBlock): string {
  const cell = (c: Record<string, unknown>) => {
    const tag = c.tag === 'th' ? 'th' : 'td';
    const span = (name: string) => (Number(c[name]) > 1 ? ` ${name}="${Number(c[name])}"` : '');
    const align = /^(left|center|right)$/.test(String(c.align))
      ? ` style="text-align:${c.align}"`
      : '';
    return `<${tag}${span('colspan')}${span('rowspan')}${align}>${inlineHtml(Array.isArray(c.content) ? (c.content as CxdInline[]) : [])}</${tag}>`;
  };
  const section = (name: string, tag: string) => {
    const rows = table.attrs[name];
    if (!Array.isArray(rows) || rows.length === 0) return '';
    return `<${tag}>${rows
      .map(
        (r) =>
          `<tr>${((r as { cells?: Record<string, unknown>[] }).cells ?? []).map(cell).join('')}</tr>`,
      )
      .join('')}</${tag}>`;
  };
  return `<table>${section('head', 'thead')}${section('body', 'tbody')}${section('foot', 'tfoot')}</table>`;
}

/** A block editor document as a Fresco page: top-level widgets go into containers. */
export function fromBlocks(document: CxdDocument): CxdDocument {
  const nodes = document.blocks.flatMap(fromBlock);
  const blocks: FrescoNode[] = [];
  let open: FrescoNode | null = null;
  for (const node of nodes) {
    if (node.type === 'fresco/container') {
      blocks.push(node);
      open = null;
      continue;
    }
    if (!open) {
      open = el('container', {}, []);
      blocks.push(open);
    }
    open.children!.push(node);
  }
  return { schema: 1, blocks: blocks as unknown as CxdBlock[], editor: { id: 'fresco' } };
}

// ---- Back to blocks ---------------------------------------------------------------------

const block = (
  type: string,
  attrs: Record<string, unknown>,
  extra: Partial<CxdBlock> = {},
): CxdBlock => ({
  id: newId(),
  type,
  v: 1,
  attrs,
  ...extra,
});

/** Text and rich text of a widget, as blocks (titles become headings). */
function textBlocks(a: Settings, keys: { heading?: string; html?: string[]; text?: string[] }) {
  const out: CxdBlock[] = [];
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (keys.heading && str(a[keys.heading])) {
    out.push(block('core/heading', { level: 3 }, { content: htmlToInline(str(a[keys.heading])) }));
  }
  for (const key of keys.html ?? []) {
    if (str(a[key])) out.push(...htmlToBlocks(paragraphsOf(str(a[key])), { newId }));
  }
  for (const key of keys.text ?? []) {
    if (str(a[key])) out.push(block('core/paragraph', {}, { content: [{ text: str(a[key]) }] }));
  }
  return out;
}

/** Plain text with blank lines as paragraphs; HTML as it is. */
const paragraphsOf = (value: string) =>
  /<[a-z][^>]*>/i.test(value)
    ? value
    : value
        .split(/\n{2,}/)
        .map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
        .join('');

/** A Fresco link value ({ url, newTab }) as block attributes. */
function linkAttrs(value: unknown, key: 'url' | 'href'): Record<string, unknown> {
  const link = value as { url?: unknown; newTab?: unknown } | undefined;
  if (!link || typeof link.url !== 'string' || !link.url.trim()) return {};
  return {
    [key]: link.url.trim(),
    ...(link.newTab ? { linkTarget: '_blank' } : {}),
  };
}

function imageBlock(
  image: { id?: string | null; url?: string; alt?: string } | undefined,
  extra: Record<string, unknown> = {},
): CxdBlock[] {
  return image?.url
    ? [
        block('core/image', {
          ...(image.id ? { id: image.id } : {}),
          url: image.url,
          alt: image.alt ?? '',
          ...extra,
        }),
      ]
    : [];
}

function toBlock(node: FrescoNode): CxdBlock[] {
  const a = node.attrs;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  const kids = () => (node.children ?? []).flatMap(toBlock);
  switch (node.type) {
    case 'fresco/heading':
    case 'fresco/a-heading': {
      const level = Number(/^h([1-6])$/.exec(text(a.tag))?.[1] ?? 2);
      const content = htmlToInline(text(a.title));
      const align = a.align === 'center' || a.align === 'right' ? { textAlign: a.align } : {};
      return [
        block(
          'core/heading',
          { level, ...align },
          { content: content.length ? content : [{ text: 'Heading' }] },
        ),
      ];
    }
    case 'fresco/text':
    case 'fresco/a-paragraph':
      // Paragraphs, headings and lists become blocks; the rest stays as HTML.
      return htmlToBlocks(text(a.content), { newId });
    case 'fresco/html':
      return text(a.code).trim() ? [block('core/html', { content: text(a.code) })] : [];
    case 'fresco/gallery': {
      const images = (Array.isArray(a.images) ? a.images : []) as {
        id?: string | null;
        url?: string;
        alt?: string;
      }[];
      const columns = Number(a.columns);
      return images.length
        ? [
            block('core/gallery', columns >= 1 && columns <= 8 ? { columns } : {}, {
              children: images.map((image) =>
                block('core/image', {
                  ...(image.id ? { id: image.id } : {}),
                  ...(image.url ? { url: image.url } : {}),
                  alt: image.alt ?? '',
                }),
              ),
            }),
          ]
        : [];
    }
    case 'fresco/image': {
      const caption = a.caption_source === 'custom' ? text(a.caption).trim() : '';
      return imageBlock(a.image as { url?: string } | undefined, {
        ...(caption ? { caption: [{ text: caption }] } : {}),
        ...(a.link_to === 'custom' ? linkAttrs(a.link, 'href') : {}),
      });
    }
    case 'fresco/a-image': {
      const image = a.image as { id?: string | null; url?: string; alt?: string } | undefined;
      return imageBlock(
        image && text(a.alt) ? { ...image, alt: text(a.alt) } : image,
        linkAttrs(a.link, 'href'),
      );
    }
    case 'fresco/button':
    case 'fresco/a-button':
      return [
        block(
          'core/buttons',
          {},
          {
            children: [
              block('core/button', linkAttrs(a.link, 'url'), {
                content: [{ text: text(a.text) || 'Button' }],
              }),
            ],
          },
        ),
      ];
    case 'fresco/divider':
    case 'fresco/a-divider':
      return [block('core/separator', {})];
    case 'fresco/spacer': {
      const space = a.space as { size?: number } | undefined;
      return [block('core/spacer', { height: `${space?.size ?? 50}px` })];
    }
    case 'fresco/block':
      // The plugin's block, as it was.
      return (node.children ?? []) as unknown as CxdBlock[];
    case 'fresco/video':
    case 'fresco/a-youtube':
      return typeof a.url === 'string' && a.url ? [block('core/embed', { url: a.url })] : [];
    case 'fresco/icon-box':
      return textBlocks(a, { heading: 'title', html: ['description'] });
    case 'fresco/image-box':
      return [
        ...imageBlock(a.image as { url?: string } | undefined),
        ...textBlocks(a, { heading: 'title', html: ['description'] }),
      ];
    case 'fresco/alert':
      return textBlocks(a, { heading: 'title', html: ['description'] });
    case 'fresco/icon-list': {
      const items = (Array.isArray(a.items) ? a.items : []) as { text?: unknown }[];
      const texts = items.map((item) => text(item.text).trim()).filter(Boolean);
      return texts.length
        ? [
            block(
              'core/list',
              {},
              {
                children: texts.map((t) =>
                  block('core/list-item', {}, { content: htmlToInline(t) }),
                ),
              },
            ),
          ]
        : [];
    }
    case 'fresco/testimonial': {
      const who = [text(a.name), text(a.job)].filter((v) => v.trim()).join(', ');
      const children = [
        ...htmlToBlocks(paragraphsOf(text(a.content)), { newId }),
        ...(who ? [block('core/paragraph', {}, { content: [{ text: `— ${who}` }] })] : []),
      ];
      return children.length ? [block('core/quote', {}, { children })] : [];
    }
    case 'fresco/counter': {
      const number = `${text(a.prefix)}${a.end ?? ''}${text(a.suffix)}`;
      return textBlocks({ ...a, number }, { heading: 'title', text: ['number'] });
    }
    case 'fresco/progress':
      return textBlocks(a, { text: ['title', 'inner'] });
    case 'fresco/tabs':
    case 'fresco/accordion':
    case 'fresco/toggle':
      // Each item: its title as a heading, then its content.
      return (node.children ?? []).flatMap((item, i) => [
        block(
          'core/heading',
          { level: 3 },
          { content: [{ text: text(item.attrs._title).trim() || `${i + 1}` }] },
        ),
        ...(item.children ?? []).flatMap(toBlock),
      ]);
    case 'fresco/container': {
      const children = node.children ?? [];
      // A row of boxes: columns.
      const row =
        a.flex_direction === 'row' &&
        children.length > 1 &&
        children.every((c) => c.type === 'fresco/container');
      if (row) {
        return [
          block(
            'core/columns',
            {},
            {
              children: children.map((c) =>
                block('core/column', {}, { children: (c.children ?? []).flatMap(toBlock) }),
              ),
            },
          ),
        ];
      }
      return kids();
    }
    default:
      // Other boxes and widgets: their children, in order.
      return kids();
  }
}

/** A Fresco page as block editor content (layout and styles are dropped). */
export function toBlocks(document: CxdDocument): CxdDocument {
  return { schema: 1, blocks: (document.blocks as unknown as FrescoNode[]).flatMap(toBlock) };
}
