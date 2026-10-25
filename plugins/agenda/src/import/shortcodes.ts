/**
 * Shortcodes that become the booking block: Agenda's own `[agenda]` (on
 * pages, at render time) and, on WordPress import, Simply Schedule
 * Appointments' `[ssa_booking type="…"]` and Booking Calendar's
 * `[booking type=1]` / `[bookingcalendar]`, pointing to the services the
 * importers made (found by their import id when the page is shown).
 */
import type { CxdBlock } from '@cleitext/plugin-sdk';
import { BLOCK_TYPE, SHORTCODE } from '../config';

export interface BlockAttrs {
  /** A service id, or empty: the visitor chooses. */
  service?: string;
  /** An imported service (`ssa:type:3`, `ssa:slug:consulenza`, `wpbc:resource:1`), found when shown. */
  ref?: string;
  /** Week or month calendar. */
  view?: 'week' | 'month';
  /** Services of a category only. */
  category?: string;
  heading?: string;
}

const IMPORTED_TAGS = new Set(['ssa_booking', 'booking', 'bookingcalendar', 'bookingform']);

export function isBookingShortcode(tag: string): boolean {
  const t = tag.toLowerCase();
  return t === SHORTCODE || IMPORTED_TAGS.has(t);
}

/** The block's attributes for a shortcode's. */
export function attrsFromShortcode(tag: string, attrs: Record<string, string>): BlockAttrs {
  const t = tag.toLowerCase();
  const a = Object.fromEntries(
    Object.entries(attrs).map(([k, v]) => [k.toLowerCase(), String(v).trim()]),
  );
  const out: BlockAttrs = {};
  if (t === SHORTCODE) {
    if (a.service) out.service = a.service.slice(0, 80);
    if (a.category) out.category = a.category.slice(0, 100);
  } else if (t === 'ssa_booking') {
    // `type` is an id or a slug; `types` a list (the visitor chooses).
    const type = a.type ?? a.appointment_type ?? '';
    if (/^\d+$/.test(type)) out.ref = `ssa:type:${type}`;
    else if (type) out.ref = `ssa:slug:${type.slice(0, 100)}`;
    if (a.view === 'month' || a.view === 'week') out.view = a.view;
  } else {
    const type = a.resource_id ?? a.type ?? '1';
    if (/^\d+$/.test(type)) out.ref = `wpbc:resource:${type}`;
  }
  if (a.view === 'month' || a.view === 'week') out.view = a.view;
  return out;
}

export function blockFromShortcode(
  tag: string,
  attrs: Record<string, string>,
  id: string,
): CxdBlock {
  return {
    id,
    type: BLOCK_TYPE,
    v: 1,
    attrs: attrsFromShortcode(tag, attrs) as Record<string, unknown>,
  };
}

const OWN = new RegExp(
  `^\\s*\\[${SHORTCODE}((?:\\s+\\w+\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s\\]]+))*)\\s*\\/?\\]\\s*$`,
  'i',
);

export function parseOwnShortcode(text: string): Record<string, string> | null {
  const m = OWN.exec(text);
  if (!m) return null;
  const attrs: Record<string, string> = {};
  for (const a of (m[1] ?? '').matchAll(/(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/g)) {
    attrs[a[1]!.toLowerCase()] = (a[2] ?? a[3] ?? a[4] ?? '').trim();
  }
  return attrs;
}

function plainText(block: CxdBlock): string | null {
  if (block.type === 'core/paragraph' && block.content)
    return block.content
      .map((node) => ('type' in node ? node.children.map((c) => c.text).join('') : node.text))
      .join('');
  if (block.type === 'core/shortcode' && typeof block.attrs.text === 'string')
    return block.attrs.text;
  if (block.type === 'core/html' && typeof block.attrs.content === 'string')
    return block.attrs.content;
  return null;
}

/** Paragraphs (and shortcode or HTML blocks) holding only `[agenda …]` become the block. */
export function replaceShortcodes(blocks: CxdBlock[]): CxdBlock[] {
  let changed = false;
  const walk = (items: CxdBlock[]): CxdBlock[] =>
    items.map((block) => {
      const text = plainText(block);
      if (text !== null && text.toLowerCase().includes(`[${SHORTCODE}`)) {
        const attrs = parseOwnShortcode(text);
        if (attrs) {
          changed = true;
          return blockFromShortcode(SHORTCODE, attrs, block.id);
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
