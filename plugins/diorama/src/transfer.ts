/**
 * Sliders in a site export and back (`export.pluginData`, `import.pluginData`)
 * and the `[diorama]` shortcode. In the export, media stay `{ id, url }`
 * objects and the entries buttons lead to become `{ $entry: <id> }`, so the
 * import gives them the new site's ids.
 */
import type { CxdBlock } from '@cleitext/plugin-sdk';
import { inlineText } from './inline';
import type { Layer, Link, Slide, SliderRecord } from './model/types';

export const BLOCK_TYPE = 'diorama/slider';

export interface ExportedSlider {
  id: string;
  title: string;
  alias: string;
  data: unknown;
}

export interface ExportData {
  version: 1;
  sliders: ExportedSlider[];
}

function mapLinks(slide: Slide, map: (link: Link) => unknown): unknown {
  const layer = (l: Layer): unknown => ({
    ...l,
    content: { ...l.content, link: map(l.content.link) },
    children: l.children.map(layer),
  });
  return { ...slide, link: map(slide.link), layers: slide.layers.map(layer) };
}

/** A link to an entry, as the transfer format refers to entries. */
function exportLink(link: Link): unknown {
  return link.kind === 'page' && link.entryId
    ? { ...link, entryId: { $entry: link.entryId, prefix: '' } }
    : link;
}

export function exportSliders(records: SliderRecord[]): ExportData {
  return {
    version: 1,
    sliders: records.map((r) => ({
      id: r.id,
      title: r.title,
      alias: r.alias,
      data: { ...r.data, slides: r.data.slides.map((s) => mapLinks(s, exportLink)) },
    })),
  };
}

/** The sliders of an import's data (anything else is left out). */
export function importedSliders(data: unknown): ExportedSlider[] {
  const list = (data as { sliders?: unknown } | null)?.sliders;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    if (!o.data || typeof o.data !== 'object') return [];
    return [
      {
        id: typeof o.id === 'string' ? o.id : '',
        title: typeof o.title === 'string' ? o.title : 'Slider',
        alias: typeof o.alias === 'string' ? o.alias : '',
        data: o.data,
      },
    ];
  });
}

// ---- Shortcode -------------------------------------------------------------------------

const SHORTCODE = /^\s*\[diorama\s+((?:\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s\]]+)\s*)+)\]\s*$/i;

/** The attributes of a `[diorama …]` shortcode standing alone, or null. */
export function parseShortcode(text: string): Record<string, string> | null {
  const m = SHORTCODE.exec(text);
  if (!m) return null;
  const attrs: Record<string, string> = {};
  for (const a of m[1]!.matchAll(/(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/g)) {
    attrs[a[1]!.toLowerCase()] = (a[2] ?? a[3] ?? a[4] ?? '').trim();
  }
  return attrs;
}

/** The slider block a shortcode stands for. */
export function blockFromShortcode(attrs: Record<string, string>, id: string): CxdBlock | null {
  const slider = (attrs.id ?? '').slice(0, 80);
  const alias = (attrs.alias ?? '').slice(0, 80);
  if (!slider && !alias) return null;
  return {
    id,
    type: BLOCK_TYPE,
    v: 1,
    attrs: { slider: slider || alias, ...(alias ? { alias } : {}) },
  };
}

/**
 * Paragraphs (and shortcode or HTML blocks) holding only `[diorama id="…"]`
 * become the slider's block, wherever they are in the page.
 */
export function replaceShortcodes(blocks: CxdBlock[]): CxdBlock[] {
  let changed = false;
  const walk = (list: CxdBlock[]): CxdBlock[] =>
    list.map((block) => {
      let source: string | null = null;
      if (block.type === 'core/paragraph' && block.content) source = inlineText(block.content);
      else if (block.type === 'core/shortcode' && typeof block.attrs.text === 'string')
        source = block.attrs.text;
      else if (block.type === 'core/html' && typeof block.attrs.content === 'string')
        source = block.attrs.content;
      if (source !== null && source.includes('[diorama')) {
        const attrs = parseShortcode(source);
        const replaced = attrs && blockFromShortcode(attrs, block.id);
        if (replaced) {
          changed = true;
          return replaced;
        }
      }
      if (block.children?.length) {
        const children = walk(block.children);
        if (children !== block.children) return { ...block, children };
      }
      return block;
    });
  const out = walk(blocks);
  return changed ? out : blocks;
}
