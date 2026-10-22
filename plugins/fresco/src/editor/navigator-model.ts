/**
 * What the Structure window shows beside each element (as Elementor's
 * navigator indicators) and the order of its rows for the keyboard.
 */
import type { Device, FrescoNode } from '../core/model.js';

export type IndicatorKind = 'hidden' | 'position' | 'css' | 'motion' | 'conditions';

export interface Indicator {
  kind: IndicatorKind;
  /** In English, translated where shown; `{devices}` is filled in. */
  title: string;
  /** Devices, for "hidden". */
  devices?: Device[];
}

const filled = (v: unknown) =>
  (typeof v === 'string' && v.trim() !== '') || v === true || (Array.isArray(v) && v.length > 0);

/** The element's settings worth a sign in the Structure window. */
export function indicatorsOf(node: FrescoNode, devices: readonly Device[]): Indicator[] {
  const a = node.attrs ?? {};
  const out: Indicator[] = [];
  const hidden = devices.filter((d) => a[`_hide_${d}`] === true);
  if (hidden.length) out.push({ kind: 'hidden', title: 'Hidden on {devices}', devices: hidden });
  if (a._position === 'absolute' || a._position === 'fixed')
    out.push({ kind: 'position', title: 'Custom position' });
  if (filled(a._custom_css)) out.push({ kind: 'css', title: 'Custom CSS' });
  if (
    filled(a._animation) ||
    filled(a._sticky) ||
    a._motion_scroll === true ||
    a._motion_mouse === true
  )
    out.push({ kind: 'motion', title: 'Motion effects' });
  if (filled(a._conditions)) out.push({ kind: 'conditions', title: 'Display conditions' });
  return out;
}

/** The ids of the rows shown, from the top (children of closed rows are not). */
export function visibleRows(
  blocks: FrescoNode[],
  closed: Record<string, boolean>,
  out: string[] = [],
): string[] {
  for (const node of blocks) {
    out.push(node.id);
    const kids = node.type === 'fresco/block' ? [] : (node.children ?? []);
    if (kids.length && !closed[node.id]) visibleRows(kids, closed, out);
  }
  return out;
}

/** The element holding another one, or null at the top. */
export function parentOf(blocks: FrescoNode[], id: string): FrescoNode | null {
  for (const node of blocks) {
    if (node.children?.some((c) => c.id === id)) return node;
    const found = node.children ? parentOf(node.children, id) : null;
    if (found) return found;
  }
  return null;
}

/**
 * Where the keyboard goes from a row: up and down through the rows shown,
 * right opens a row (or goes to its first child), left closes it (or goes to
 * its parent), Home and End to the first and last row.
 */
export function navigatorKey(
  key: string,
  current: string,
  blocks: FrescoNode[],
  closed: Record<string, boolean>,
  find: (id: string) => FrescoNode | null,
): { focus?: string; open?: string; close?: string } | null {
  const rows = visibleRows(blocks, closed);
  const index = rows.indexOf(current);
  if (index === -1) return rows[0] ? { focus: rows[0] } : null;
  const node = find(current);
  const kids = node && node.type !== 'fresco/block' ? (node.children ?? []) : [];
  switch (key) {
    case 'ArrowDown':
      return rows[index + 1] ? { focus: rows[index + 1] } : null;
    case 'ArrowUp':
      return index > 0 ? { focus: rows[index - 1] } : null;
    case 'Home':
      return { focus: rows[0] };
    case 'End':
      return { focus: rows[rows.length - 1] };
    case 'ArrowRight':
      if (!kids.length) return null;
      return closed[current] ? { open: current } : { focus: kids[0]!.id };
    case 'ArrowLeft': {
      if (kids.length && !closed[current]) return { close: current };
      const parent = parentOf(blocks, current);
      return parent ? { focus: parent.id } : null;
    }
    default:
      return null;
  }
}
