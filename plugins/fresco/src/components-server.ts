/**
 * Components on the server: kept in Fresco's storage (`components`), listed
 * and saved by the editor, drawn into the pages before rendering (instances
 * become the component's elements, with the instance's overrides), and the
 * usage of the Class and Variables managers.
 */
import type { PluginContext } from '@cleitext/plugin-sdk';
import {
  COMPONENT_TYPE,
  MAX_COMPONENTS,
  expandTree,
  hasInstances,
  instancesIn,
  makesCycle,
  normalizeComponent,
  normalizeComponents,
  type Component,
} from './core/components.js';
import { designUsage } from './core/design-system.js';
import type { Kit } from './core/kit.js';
import type { FrescoNode } from './core/model.js';
import { getElement } from './core/registry.js';
import { frescoEntries } from './tools.js';

const KEY = 'components';
export const COMPONENTS_TAG = 'fresco:components';

/** Components by site, kept for a minute (and dropped when saved). */
const cache = new Map<string, { list: Component[]; at: number }>();

export async function componentsFor(ctx: PluginContext, siteId: string): Promise<Component[]> {
  const hit = cache.get(siteId);
  if (hit && Date.now() - hit.at < 60_000) return hit.list;
  const list = normalizeComponents(await ctx.storage.get(siteId, KEY));
  cache.set(siteId, { list, at: Date.now() });
  return list;
}

async function store(ctx: PluginContext, siteId: string, list: Component[]): Promise<void> {
  await ctx.storage.set(siteId, KEY, { items: list });
  cache.delete(siteId);
  await ctx.cache.invalidate(siteId, [COMPONENTS_TAG]);
}

/** Elements a component may hold: atomic ones and other components (as in Elementor). */
export function componentElementsAllowed(nodes: FrescoNode[]): boolean {
  return nodes.every(
    (node) =>
      (node.type === COMPONENT_TYPE || getElement(node.type)?.atomic === true) &&
      componentElementsAllowed(node.children ?? []),
  );
}

/** The blocks of a page (or template) with their instances drawn. */
export async function drawInstances(
  ctx: PluginContext,
  siteId: string,
  blocks: unknown[],
  tag: (tag: string) => void,
): Promise<unknown[]> {
  if (!hasInstances(blocks)) return blocks;
  tag(COMPONENTS_TAG);
  const list = await componentsFor(ctx, siteId);
  const byId = new Map(list.map((c) => [c.id, c]));
  return expandTree(blocks as FrescoNode[], (id) => byId.get(id));
}

/** Imported components (WordPress importer, Elementor 4): added, or replacing those with the same id. */
export async function importComponents(
  ctx: PluginContext,
  siteId: string,
  incoming: unknown,
): Promise<number> {
  const items = normalizeComponents({ items: incoming });
  if (items.length === 0) return 0;
  const current = await componentsFor(ctx, siteId);
  const ids = new Set(items.map((c) => c.id));
  const at = new Date().toISOString();
  const next = [
    ...current.filter((c) => !ids.has(c.id)),
    ...items.map((c) => ({ ...c, updatedAt: at })),
  ].slice(0, MAX_COMPONENTS);
  await store(ctx, siteId, next);
  return items.length;
}

export function registerComponents(
  ctx: PluginContext,
  kitFor: (siteId: string) => Promise<Kit>,
): void {
  cache.clear();
  ctx.routes.api({
    method: 'GET',
    path: '/components',
    capability: 'edit_entries',
    async handler(request) {
      return { body: await componentsFor(ctx, request.siteId) };
    },
  });
  // Saves one component (new or changed): every page showing it changes.
  ctx.routes.api({
    method: 'PUT',
    path: '/components/:id',
    capability: 'edit_entries',
    async handler(request) {
      const component = normalizeComponent({
        ...(request.body as object),
        id: request.params.id,
      });
      if (!component) return { status: 400, body: { message: 'Not a valid component.' } };
      if (!componentElementsAllowed(component.nodes)) {
        return {
          status: 400,
          body: { message: 'A component holds atomic elements only.' },
        };
      }
      const list = await componentsFor(ctx, request.siteId);
      const others = new Map(list.filter((c) => c.id !== component.id).map((c) => [c.id, c]));
      if (makesCycle(component.id, component.nodes, (id) => others.get(id))) {
        return { status: 400, body: { message: 'A component cannot contain itself.' } };
      }
      const exists = list.some((c) => c.id === component.id);
      if (!exists && list.length >= MAX_COMPONENTS) {
        return { status: 400, body: { message: 'Too many components.' } };
      }
      const saved = { ...component, updatedAt: new Date().toISOString() };
      await store(
        ctx,
        request.siteId,
        exists ? list.map((c) => (c.id === saved.id ? saved : c)) : [...list, saved],
      );
      return { body: saved };
    },
  });
  // Deleting one: its instances show nothing (as a deleted global widget).
  ctx.routes.api({
    method: 'DELETE',
    path: '/components/:id',
    capability: 'manage_fresco',
    async handler(request) {
      const list = await componentsFor(ctx, request.siteId);
      const used = list.filter(
        (c) => c.id !== request.params.id && instancesIn(c.nodes).includes(request.params.id ?? ''),
      );
      if (used.length) {
        return {
          status: 409,
          body: {
            message: `Used by other components: ${used.map((c) => c.title).join(', ')}.`,
          },
        };
      }
      await store(
        ctx,
        request.siteId,
        list.filter((c) => c.id !== request.params.id),
      );
      return { body: { ok: true } };
    },
  });
  // Usage of components, global classes and variables (Fresco documents and components).
  ctx.routes.api({
    method: 'GET',
    path: '/design-usage',
    capability: 'edit_entries',
    async handler(request) {
      const [entries, list, kit] = await Promise.all([
        frescoEntries(ctx, request.siteId),
        componentsFor(ctx, request.siteId),
        kitFor(request.siteId),
      ]);
      const documents = [
        ...entries.map((e) => ({ blocks: (e.document as { blocks?: unknown } | null)?.blocks })),
        ...list.map((c) => ({ blocks: c.nodes })),
      ];
      const usage = designUsage(documents, kit);
      const components: Record<string, { instances: number; documents: number }> = {};
      for (const document of documents) {
        const ids = instancesIn((document.blocks ?? []) as FrescoNode[]);
        for (const id of ids) (components[id] ??= { instances: 0, documents: 0 }).instances++;
        for (const id of new Set(ids)) components[id]!.documents++;
      }
      return { body: { ...usage, components } };
    },
  });
}
