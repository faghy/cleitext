import type { EntrySummary } from '@cleitext/shared';

export interface TreeRow<T> {
  entry: T;
  depth: number;
}

type Node = Pick<EntrySummary, 'id' | 'parentId' | 'position' | 'title'>;

/**
 * Entries of a hierarchical type in tree order (RF-CNT-13): children under
 * their parent, siblings by manual order then title. Entries whose parent
 * is not in the list are shown at the top level.
 */
export function entryTree<T extends Node>(entries: T[]): TreeRow<T>[] {
  const ids = new Set(entries.map((e) => e.id));
  const children = new Map<string | null, T[]>();
  for (const entry of entries) {
    const parent = entry.parentId && ids.has(entry.parentId) ? entry.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), entry]);
  }
  const rows: TreeRow<T>[] = [];
  const visit = (parent: string | null, depth: number) => {
    const siblings = (children.get(parent) ?? []).sort(
      (a, b) => a.position - b.position || a.title.localeCompare(b.title),
    );
    for (const entry of siblings) {
      rows.push({ entry, depth });
      visit(entry.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

/** The entry and everything below it: entries that cannot become its parent. */
export function descendantsOf(entries: Node[], id: string): Set<string> {
  const found = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const entry of entries) {
      if (entry.parentId && found.has(entry.parentId) && !found.has(entry.id)) {
        found.add(entry.id);
        grew = true;
      }
    }
  }
  return found;
}
