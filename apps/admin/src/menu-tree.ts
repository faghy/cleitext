import type { MenuItemInput, MenuItemNode } from '@cleitext/shared';

/** Menu tree edited as a flat list with depths, like the WordPress menu screen. */
export interface FlatItem {
  key: string;
  depth: number;
  kind: MenuItemNode['kind'];
  entryId: string | null;
  termId: string | null;
  url: string | null;
  label: string | null;
  target: '_blank' | null;
  /** Title of the linked entry or term, for display. */
  title: string;
}

/** Up to 5 levels (depth 0–4), as the server accepts. */
export const MAX_DEPTH = 4;

let counter = 0;
export const newKey = (): string => `item-${++counter}`;

export function flatten(nodes: MenuItemNode[], depth = 0): FlatItem[] {
  return nodes.flatMap((node) => [
    {
      key: node.id,
      depth,
      kind: node.kind,
      entryId: node.entryId,
      termId: node.termId,
      url: node.url,
      label: node.label,
      target: node.target,
      title: node.displayLabel,
    },
    ...flatten(node.children, depth + 1),
  ]);
}

export function toTree(items: FlatItem[]): MenuItemInput[] {
  const roots: MenuItemInput[] = [];
  const stack: { depth: number; children: MenuItemInput[] }[] = [{ depth: -1, children: roots }];
  for (const item of items) {
    while (stack.length > 1 && stack.at(-1)!.depth >= item.depth) stack.pop();
    const node: MenuItemInput = {
      kind: item.kind,
      ...(item.entryId ? { entryId: item.entryId } : {}),
      ...(item.termId ? { termId: item.termId } : {}),
      ...(item.url ? { url: item.url } : {}),
      label: item.label?.trim() || null,
      target: item.target,
      children: [],
    };
    stack.at(-1)!.children.push(node);
    stack.push({ depth: item.depth, children: node.children! });
  }
  return roots;
}

/** End (exclusive) of the item's subtree. */
function blockEnd(items: FlatItem[], index: number): number {
  const depth = items[index]!.depth;
  let end = index + 1;
  while (end < items.length && items[end]!.depth > depth) end++;
  return end;
}

/** Index of the previous sibling, or -1. */
function previousSibling(items: FlatItem[], index: number): number {
  const depth = items[index]!.depth;
  for (let k = index - 1; k >= 0; k--) {
    if (items[k]!.depth === depth) return k;
    if (items[k]!.depth < depth) return -1;
  }
  return -1;
}

export function moveUp(items: FlatItem[], index: number): FlatItem[] {
  const previous = previousSibling(items, index);
  if (previous < 0) return items;
  const end = blockEnd(items, index);
  return [
    ...items.slice(0, previous),
    ...items.slice(index, end),
    ...items.slice(previous, index),
    ...items.slice(end),
  ];
}

export function moveDown(items: FlatItem[], index: number): FlatItem[] {
  const end = blockEnd(items, index);
  if (end >= items.length || items[end]!.depth !== items[index]!.depth) return items;
  return moveUp(items, end);
}

export function canIndent(items: FlatItem[], index: number): boolean {
  if (previousSibling(items, index) < 0) return false;
  const end = blockEnd(items, index);
  return items.slice(index, end).every((item) => item.depth < MAX_DEPTH);
}

/** Makes the item (with its children) a child of its previous sibling. */
export function indent(items: FlatItem[], index: number): FlatItem[] {
  if (!canIndent(items, index)) return items;
  return shiftDepth(items, index, 1);
}

/** Moves the item (with its children) one level up. */
export function outdent(items: FlatItem[], index: number): FlatItem[] {
  if (items[index]!.depth === 0) return items;
  return shiftDepth(items, index, -1);
}

export function remove(items: FlatItem[], index: number): FlatItem[] {
  return [...items.slice(0, index), ...items.slice(blockEnd(items, index))];
}

function shiftDepth(items: FlatItem[], index: number, delta: number): FlatItem[] {
  const end = blockEnd(items, index);
  return items.map((item, i) =>
    i >= index && i < end ? { ...item, depth: item.depth + delta } : item,
  );
}

/** The item's subtree: its index range and how many levels it spans below it. */
export function block(items: FlatItem[], index: number): { end: number; height: number } {
  const end = blockEnd(items, index);
  const depth = items[index]!.depth;
  const height = Math.max(...items.slice(index, end).map((item) => item.depth - depth));
  return { end, height };
}

/**
 * Depths allowed when the subtree of `from` is dropped at position `to` of
 * the list without it (drag & drop): at most one level below the item before,
 * at least one level above the item after, within MAX_DEPTH.
 */
export function dropDepths(
  items: FlatItem[],
  from: number,
  to: number,
): { min: number; max: number } {
  const { end, height } = block(items, from);
  const rest = [...items.slice(0, from), ...items.slice(end)];
  const before = rest[to - 1];
  const after = rest[to];
  const max = Math.min(before ? before.depth + 1 : 0, MAX_DEPTH - height);
  const min = Math.min(after ? Math.max(0, after.depth - 1) : 0, max);
  return { min, max };
}

/** Moves the subtree of `from` to position `to` of the list without it, at `depth`. */
export function moveTo(items: FlatItem[], from: number, to: number, depth: number): FlatItem[] {
  const { end } = block(items, from);
  const { min, max } = dropDepths(items, from, to);
  const delta = Math.min(max, Math.max(min, depth)) - items[from]!.depth;
  const moved = items.slice(from, end).map((item) => ({ ...item, depth: item.depth + delta }));
  const rest = [...items.slice(0, from), ...items.slice(end)];
  return [...rest.slice(0, to), ...moved, ...rest.slice(to)];
}
