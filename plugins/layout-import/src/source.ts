/**
 * Pages imported from WordPress before this plugin: the importer keeps the
 * shortcodes it does not know as text, so a layout of `[av_…]` shortcodes
 * ends up in paragraphs. Here the blocks are written back as the text typed
 * in the classic editor (paragraphs separated by blank lines, other blocks
 * as HTML), so that the layout can be converted again.
 */
import type { CxdBlock, CxdInline } from '@cleitext/blocks';
import { decodeEntities, escapeHtml, inlineToHtml } from '@cleitext/blocks/inline';
import { hasLayout } from './shortcodes.js';

const text = (nodes: CxdInline[] | undefined) =>
  inlineToHtml(nodes ?? []).replace(/<br\s*\/?>/gi, '\n');

const cells = (rows: unknown, tag: string) =>
  (Array.isArray(rows) ? rows : [])
    .map(
      (row: { cells?: { content?: CxdInline[]; tag?: string }[] }) =>
        `<tr>${(row.cells ?? [])
          .map((c) => {
            const t = c.tag === 'th' ? 'th' : tag;
            return `<${t}>${inlineToHtml(c.content ?? [])}</${t}>`;
          })
          .join('')}</tr>`,
    )
    .join('');

function blockSource(block: CxdBlock): string {
  const children = () => (block.children ?? []).map(blockSource).filter(Boolean).join('\n\n');
  const a = block.attrs;
  switch (block.type) {
    case 'core/paragraph':
      return text(block.content);
    case 'core/heading': {
      const level = Number(a.level) >= 1 && Number(a.level) <= 6 ? Number(a.level) : 2;
      return `<h${level}>${inlineToHtml(block.content ?? [])}</h${level}>`;
    }
    case 'core/list': {
      const tag = a.ordered ? 'ol' : 'ul';
      return `<${tag}>${(block.children ?? []).map(blockSource).join('')}</${tag}>`;
    }
    case 'core/list-item':
      return `<li>${inlineToHtml(block.content ?? [])}${(block.children ?? []).map(blockSource).join('')}</li>`;
    case 'core/quote':
      return `<blockquote>${children()}</blockquote>`;
    case 'core/code':
      return `<pre>${escapeHtml((block.content ?? []).map((n) => ('text' in n ? n.text : '')).join(''))}</pre>`;
    case 'core/image':
      return typeof a.url === 'string'
        ? `<img src="${escapeHtml(a.url)}" alt="${escapeHtml(typeof a.alt === 'string' ? a.alt : '')}">`
        : '';
    case 'core/html':
      return typeof a.content === 'string' ? a.content : '';
    case 'core/separator':
      return '<hr>';
    case 'core/table':
      return `<table>${cells(a.head, 'th')}${cells(a.body, 'td')}${cells(a.foot, 'td')}</table>`;
    case 'core/embed':
      return typeof a.url === 'string' ? a.url : '';
    case 'core/button':
      return text(block.content);
    case 'core/imported': {
      // A block of another plugin kept by the importer: its text, or its HTML.
      const fallback = Array.isArray(a.fallback) ? (a.fallback as CxdBlock[]) : [];
      if (fallback.length) return fallback.map(blockSource).join('\n\n');
      return typeof a.html === 'string' ? a.html : children();
    }
    default:
      if (block.content) return text(block.content);
      return children();
  }
}

/**
 * The classic-editor text of blocks: the shortcodes come back as they were
 * typed (entities inside the brackets decoded, so attributes keep their quotes).
 */
export function blocksToSource(blocks: readonly CxdBlock[]): string {
  return blocks
    .map(blockSource)
    .filter((s) => s.trim())
    .join('\n\n')
    .replace(/\[[^\][]*\]/g, (tag) => decodeEntities(tag));
}

/** Whether blocks still hold a layout of `[av_…]` shortcodes as text. */
export function blocksHaveLayout(blocks: readonly CxdBlock[] | undefined): boolean {
  return hasLayout(blocksToSource(blocks ?? []));
}
