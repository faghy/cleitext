/**
 * The header and footer of an imported site (e.g. Divi's Theme Builder), for
 * sites without Fresco Pro: Fresco shows them in the theme's place, on the
 * pages their rules choose (Fresco 2.11). With Fresco Pro they are its theme
 * templates instead, so the import keeps them only when no template took
 * them. They can be removed from Fresco → Tools.
 */
import type { CxdDocument } from '@cleitext/blocks';
import type { ImportIdMap, PluginContext, RenderHookContext } from '@cleitext/plugin-sdk';

export const LOCATIONS_KEY = 'imported-locations';
export const LOCATIONS_TAG = 'fresco-locations';
export const LOCATION_KINDS = ['header', 'footer'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export interface LocationRule {
  mode: 'include' | 'exclude';
  rule: string;
}

export interface ImportedLocation {
  title: string;
  blocks: CxdDocument['blocks'];
  rules: LocationRule[];
}

export type ImportedLocations = Partial<Record<LocationKind, ImportedLocation>>;

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Stored or imported locations: only well-formed ones. */
export function normalizeLocations(value: unknown): ImportedLocations {
  const out: ImportedLocations = {};
  for (const kind of LOCATION_KINDS) {
    const item = obj(obj(value)[kind]);
    if (!Array.isArray(item.blocks) || item.blocks.length === 0) continue;
    const rules = (Array.isArray(item.rules) ? item.rules : [])
      .map((r) => obj(r))
      .filter((r) => typeof r.rule === 'string' && r.rule.length <= 200)
      .map((r) => ({
        mode: r.mode === 'exclude' ? ('exclude' as const) : ('include' as const),
        rule: r.rule as string,
      }));
    if (!rules.some((r) => r.mode === 'include')) continue;
    out[kind] = {
      title: typeof item.title === 'string' ? item.title.slice(0, 200) : kind,
      blocks: item.blocks as CxdDocument['blocks'],
      rules,
    };
  }
  return out;
}

/**
 * The imported locations to keep: those whose theme template was not
 * imported (no Fresco Pro), by the ref of that template (`ref`).
 */
export function locationsToKeep(data: unknown, idMap?: ImportIdMap): ImportedLocations {
  const incoming = obj(data);
  const kept: Record<string, unknown> = {};
  for (const kind of LOCATION_KINDS) {
    const item = obj(incoming[kind]);
    const ref = typeof item.ref === 'string' ? item.ref : '';
    if (ref && idMap?.entries[ref]) continue;
    kept[kind] = item;
  }
  return normalizeLocations(kept);
}

/** Whether a rule matches the page shown. */
function ruleMatches(rule: string, context: RenderHookContext): boolean {
  const entry = context.entry;
  const [name, a, b] = rule.split(':');
  switch (name) {
    case 'all':
      return true;
    case 'front':
      return context.isFrontPage === true;
    case 'singular':
      return context.route === 'entry';
    case 'type':
      return context.route === 'entry' && entry?.type === a;
    case 'entry':
      return context.route === 'entry' && entry?.id === a;
    case 'archive':
      return context.route === 'archive';
    case 'archive-type':
      return context.route === 'archive' && context.archive?.type === a;
    case 'taxonomy':
      return context.route === 'archive' && context.archive?.taxonomy === a;
    case 'term':
      return (
        context.route === 'archive' &&
        context.archive?.taxonomy === a &&
        context.archive?.term === b
      );
    case 'search':
      return context.route === 'search';
    case '404':
      return context.route === '404';
    default:
      return false;
  }
}

/** Whether a location's rules choose the page shown. */
export function locationMatches(rules: LocationRule[], context: RenderHookContext): boolean {
  const included = rules.some((r) => r.mode === 'include' && ruleMatches(r.rule, context));
  return included && !rules.some((r) => r.mode === 'exclude' && ruleMatches(r.rule, context));
}

/** The imported locations: kept at import, shown in the theme's place, listed and removed in Tools. */
export function registerImportedLocations(ctx: PluginContext): void {
  ctx.hooks.filter('render.locations', async (locations, context) => {
    context.tag(LOCATIONS_TAG);
    const stored = normalizeLocations(await ctx.storage.get(context.siteId, LOCATIONS_KEY));
    // Canvas pages and the editor's frame keep what the theme (or Fresco Pro) decides.
    const data = obj(context.entry?.document.editor?.data);
    if (context.editorFrame || data.layout === 'canvas') return locations;
    let next = locations;
    for (const kind of LOCATION_KINDS) {
      const location = stored[kind];
      if (!location || !locationMatches(location.rules, context)) continue;
      next = {
        ...next,
        [kind]: { schema: 1, blocks: location.blocks, editor: { id: 'fresco' } },
      };
    }
    return next;
  });

  ctx.routes.api({
    method: 'GET',
    path: '/tools/locations',
    capability: 'manage_fresco',
    async handler(request) {
      const stored = normalizeLocations(await ctx.storage.get(request.siteId, LOCATIONS_KEY));
      return {
        body: {
          locations: LOCATION_KINDS.filter((kind) => stored[kind]).map((kind) => ({
            kind,
            title: stored[kind]!.title,
          })),
        },
      };
    },
  });

  ctx.routes.api({
    method: 'DELETE',
    path: '/tools/locations',
    capability: 'manage_fresco',
    async handler(request) {
      const kind = LOCATION_KINDS.find((k) => k === request.query.kind);
      const stored = normalizeLocations(await ctx.storage.get(request.siteId, LOCATIONS_KEY));
      if (kind) delete stored[kind];
      if (!kind || Object.keys(stored).length === 0)
        await ctx.storage.delete(request.siteId, LOCATIONS_KEY);
      else await ctx.storage.set(request.siteId, LOCATIONS_KEY, stored);
      await ctx.cache.invalidate(request.siteId, [LOCATIONS_TAG]);
      return { status: 204 };
    },
  });
}

/** Keeps the locations of an import (those Fresco Pro did not take), replacing earlier ones. */
export async function importLocations(
  ctx: PluginContext,
  siteId: string,
  data: unknown,
  idMap?: ImportIdMap,
): Promise<number> {
  const kept = locationsToKeep(data, idMap);
  const count = Object.keys(kept).length;
  if (count === 0) return 0;
  const stored = normalizeLocations(await ctx.storage.get(siteId, LOCATIONS_KEY));
  await ctx.storage.set(siteId, LOCATIONS_KEY, { ...stored, ...kept });
  await ctx.cache.invalidate(siteId, [LOCATIONS_TAG]);
  return count;
}
