/**
 * The Element manager (Fresco → Element manager), as in Elementor: how much
 * each element is used in the site's Fresco documents, and which elements
 * the editor's panel no longer offers. Elements switched off still show on
 * the pages that have them, and can still be edited there.
 */
import type { PluginContext, PluginEntry } from '@cleitext/plugin-sdk';
import { normalizeElementManager } from './editor/availability.js';
import { frescoEntries } from './tools.js';

const KEY = 'element-manager';

export interface ElementUsage {
  /** By element type: how many there are, and in how many documents. */
  types: Record<string, { elements: number; documents: number }>;
  /** The documents looked at (pages, posts, templates made with Fresco). */
  documents: number;
}

interface NodeLike {
  type?: unknown;
  children?: unknown;
}

/** How much each element type is used in some documents. */
export function elementUsage(entries: Pick<PluginEntry, 'document'>[]): ElementUsage {
  const types: ElementUsage['types'] = {};
  let documents = 0;
  for (const entry of entries) {
    const blocks = (entry.document as { blocks?: unknown } | null | undefined)?.blocks;
    if (!Array.isArray(blocks)) continue;
    documents++;
    const seen = new Set<string>();
    const walk = (nodes: unknown[], depth: number) => {
      if (depth > 60) return;
      for (const raw of nodes) {
        const node = raw as NodeLike | null;
        if (!node || typeof node.type !== 'string') continue;
        const row = (types[node.type] ??= { elements: 0, documents: 0 });
        row.elements++;
        if (!seen.has(node.type)) {
          seen.add(node.type);
          row.documents++;
        }
        if (Array.isArray(node.children)) walk(node.children, depth + 1);
      }
    };
    walk(blocks, 0);
  }
  return { types, documents };
}

export function registerElementManager(ctx: PluginContext): void {
  // The editor reads it: elements switched off are not in its panel.
  ctx.routes.api({
    method: 'GET',
    path: '/element-manager',
    capability: 'edit_entries',
    async handler(request) {
      return { body: normalizeElementManager(await ctx.storage.get(request.siteId, KEY)) };
    },
  });
  ctx.routes.api({
    method: 'PUT',
    path: '/element-manager',
    capability: 'manage_fresco',
    async handler(request) {
      const value = normalizeElementManager(request.body);
      await ctx.storage.set(request.siteId, KEY, value);
      return { body: value };
    },
  });
  // Counted when asked: it reads the site's Fresco documents (up to 200 of each kind, newest first).
  ctx.routes.api({
    method: 'GET',
    path: '/element-usage',
    capability: 'manage_fresco',
    async handler(request) {
      return { body: elementUsage(await frescoEntries(ctx, request.siteId)) };
    },
  });
}
