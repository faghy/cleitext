/** Pure operations on the element tree. Every change returns a new tree. */
import { newId } from '../core/ids.js';
import type { FrescoNode, Settings } from '../core/model.js';

export type Tree = FrescoNode[];

/** Where a node is: its parent (null at the top) and its index there. */
export interface Place {
  parent: string | null;
  index: number;
}

export function find(tree: Tree, id: string): FrescoNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children) {
      const found = find(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function placeOf(tree: Tree, id: string, parent: string | null = null): Place | null {
  for (const [index, node] of tree.entries()) {
    if (node.id === id) return { parent, index };
    if (node.children) {
      const found = placeOf(node.children, id, node.id);
      if (found) return found;
    }
  }
  return null;
}

/** Ids from the top down to the node (included). */
export function pathTo(tree: Tree, id: string): string[] {
  for (const node of tree) {
    if (node.id === id) return [id];
    if (node.children) {
      const below = pathTo(node.children, id);
      if (below.length) return [node.id, ...below];
    }
  }
  return [];
}

export function contains(node: FrescoNode, id: string): boolean {
  return node.id === id || (node.children ?? []).some((child) => contains(child, id));
}

function mapTree(tree: Tree, fn: (node: FrescoNode) => FrescoNode): Tree {
  return tree.map((node) => {
    const next = fn(node);
    return next.children ? { ...next, children: mapTree(next.children, fn) } : next;
  });
}

export function update(tree: Tree, id: string, fn: (node: FrescoNode) => FrescoNode): Tree {
  return mapTree(tree, (node) => (node.id === id ? fn(node) : node));
}

/** Sets settings (undefined removes the key, so values stay sparse). */
export function setSettings(tree: Tree, id: string, changes: Settings): Tree {
  return update(tree, id, (node) => {
    const attrs = { ...node.attrs };
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === null || value === '') delete attrs[key];
      else attrs[key] = value;
    }
    return { ...node, attrs };
  });
}

export function remove(tree: Tree, id: string): Tree {
  return tree
    .filter((node) => node.id !== id)
    .map((node) => (node.children ? { ...node, children: remove(node.children, id) } : node));
}

export function insert(tree: Tree, node: FrescoNode, place: Place): Tree {
  if (place.parent === null) {
    const next = [...tree];
    next.splice(Math.max(0, Math.min(place.index, next.length)), 0, node);
    return next;
  }
  return update(tree, place.parent, (parent) => {
    const children = [...(parent.children ?? [])];
    children.splice(Math.max(0, Math.min(place.index, children.length)), 0, node);
    return { ...parent, children };
  });
}

/**
 * Moves a node. The index is counted before the move, as the drop target
 * shows it; a node cannot go inside itself.
 */
export function move(tree: Tree, id: string, to: Place): Tree {
  const node = find(tree, id);
  const from = placeOf(tree, id);
  if (!node || !from) return tree;
  if (to.parent !== null && contains(node, to.parent)) return tree;
  let index = to.index;
  if (from.parent === to.parent && from.index < to.index) index -= 1;
  if (from.parent === to.parent && from.index === index) return tree;
  return insert(remove(tree, id), node, { parent: to.parent, index });
}

/** A deep copy with new ids (duplicate, paste, templates). */
export function cloneWithNewIds(node: FrescoNode): FrescoNode {
  return {
    ...node,
    id: newId(),
    attrs: structuredClone(node.attrs),
    ...(node.children ? { children: node.children.map(cloneWithNewIds) } : {}),
  };
}

export function duplicate(tree: Tree, id: string): { tree: Tree; id: string | null } {
  const node = find(tree, id);
  const place = placeOf(tree, id);
  if (!node || !place) return { tree, id: null };
  const copy = cloneWithNewIds(node);
  return {
    tree: insert(tree, copy, { parent: place.parent, index: place.index + 1 }),
    id: copy.id,
  };
}

/** Every node, depth first. */
export function walk(tree: Tree, fn: (node: FrescoNode, depth: number) => void, depth = 0): void {
  for (const node of tree) {
    fn(node, depth);
    if (node.children) walk(node.children, fn, depth + 1);
  }
}
