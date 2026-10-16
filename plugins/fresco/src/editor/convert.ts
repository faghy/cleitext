/**
 * Switching editors: block editor content becomes Fresco elements
 * (`fromBlocks`), and back (`toBlocks`). Text keeps its formatting; what
 * has no counterpart becomes HTML, so nothing is lost silently.
 */
import type { CxdBlock, CxdDocument, CxdInline } from '@cleitext/blocks';
import { newId } from '../core/ids.js';
import type { FrescoNode, Settings } from '../core/model.js';

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

function toBlock(node: FrescoNode): CxdBlock[] {
  const a = node.attrs;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  switch (node.type) {
    case 'fresco/heading': {
      const level = Number(/^h([1-6])$/.exec(text(a.tag))?.[1] ?? 2);
      return [
        block('core/heading', { level }, { content: [{ text: text(a.title) || 'Heading' }] }),
      ];
    }
    case 'fresco/text':
      return [block('core/html', { content: text(a.content) })];
    case 'fresco/html':
      return [block('core/html', { content: text(a.code) })];
    case 'fresco/image': {
      const image = a.image as { id?: string | null; url?: string; alt?: string } | undefined;
      return image?.url
        ? [
            block('core/image', {
              ...(image.id ? { id: image.id } : {}),
              url: image.url,
              alt: image.alt ?? '',
            }),
          ]
        : [];
    }
    case 'fresco/button': {
      const link = a.link as { url?: string } | undefined;
      return [
        block(
          'core/buttons',
          {},
          {
            children: [
              block(
                'core/button',
                { ...(link?.url ? { url: link.url } : {}) },
                { content: [{ text: text(a.text) || 'Button' }] },
              ),
            ],
          },
        ),
      ];
    }
    case 'fresco/divider':
      return [block('core/separator', {})];
    case 'fresco/spacer': {
      const space = a.space as { size?: number } | undefined;
      return [block('core/spacer', { height: `${space?.size ?? 50}px` })];
    }
    case 'fresco/block':
      // The plugin's block, as it was.
      return (node.children ?? []) as unknown as CxdBlock[];
    case 'fresco/video':
      return typeof a.url === 'string' && a.url ? [block('core/embed', { url: a.url })] : [];
    default:
      // Containers and the other widgets: their children, in order.
      return (node.children ?? []).flatMap(toBlock);
  }
}

/** A Fresco page as block editor content (layout and styles are dropped). */
export function toBlocks(document: CxdDocument): CxdDocument {
  return { schema: 1, blocks: (document.blocks as unknown as FrescoNode[]).flatMap(toBlock) };
}
