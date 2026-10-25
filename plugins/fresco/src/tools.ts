/**
 * Fresco's tools on the server, for the Tools and System info pages of its
 * menu: the pages made with Fresco, regenerating the CSS, replacing an
 * address in every Fresco document and in what Fresco keeps beside them (the
 * imported header and footer, site settings, components), counted first, and
 * what support asks about the system.
 */
import { SDK_VERSION, type PluginContext, type PluginEntry } from '@cleitext/plugin-sdk';

/** Content types searched for Fresco documents (others are found by the untyped query). */
const TYPES = ['page', 'article', 'fresco_template'];

/** Entries made with Fresco (newest first, drafts included), with their documents. */
export async function frescoEntries(ctx: PluginContext, siteId: string): Promise<PluginEntry[]> {
  const queries = [undefined, ...TYPES].map((type) =>
    ctx.content
      .find(siteId, {
        ...(type ? { type } : {}),
        status: 'any',
        limit: 200,
        withDocument: true,
      })
      .catch(() => [] as PluginEntry[]),
  );
  const seen = new Map<string, PluginEntry>();
  for (const list of await Promise.all(queries)) {
    for (const entry of list) {
      if (entry.document?.editor?.id === 'fresco' && !seen.has(entry.id)) seen.set(entry.id, entry);
    }
  }
  return [...seen.values()];
}

/** An address the Replace URL tool accepts: http(s), without spaces or quotes. */
export function validUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim().replace(/\/+$/, '');
  if (url.length > 2000 || !/^https?:\/\/[^\s"'<>]+$/i.test(url)) return null;
  return url;
}

/** Occurrences of `from` in a text. */
function occurrences(text: string, from: string): number {
  let count = 0;
  for (let at = text.indexOf(from); at !== -1; at = text.indexOf(from, at + from.length)) count++;
  return count;
}

/**
 * Every string of a value (a document, its elements' settings) with `from`
 * replaced by `to`, and how many were replaced. Keys and other values stay.
 */
export function replaceInValue<T>(value: T, from: string, to: string): { value: T; count: number } {
  let count = 0;
  const walk = (item: unknown): unknown => {
    if (typeof item === 'string') {
      const found = occurrences(item, from);
      if (found === 0) return item;
      count += found;
      return item.split(from).join(to);
    }
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).map(([key, inner]) => [key, walk(inner)]));
    }
    return item;
  };
  const next = walk(value) as T;
  return { value: count > 0 ? next : value, count };
}

export interface ReplaceResult {
  /** Occurrences found (and replaced, unless counted only). */
  replaced: number;
  /** Documents, and Fresco's stored data (`stored`, its title to translate). */
  entries: { id: string; title: string; count: number; stored?: boolean }[];
  dryRun: boolean;
}

/**
 * What Fresco keeps in its storage besides the documents, searched by
 * Replace URL too (Fresco 2.11.3): its key, a title for the list, and the
 * cache tags of the pages that show it.
 */
export interface ReplaceStore {
  key: string;
  title: string;
  tags: string[];
}

/** Node's `process`, as much as needed (without Node's types). */
interface ProcessLike {
  version: string;
  platform: string;
  arch: string;
  uptime(): number;
  memoryUsage(): { rss: number; heapUsed: number; heapTotal: number };
}

export interface FrescoSystemInfo {
  fresco: { version: string; pages: number; templates: number };
  pluginApi: string;
  node: string | null;
  platform: string | null;
  uptimeSeconds: number | null;
  memory: { rss: number; heapUsed: number; heapTotal: number } | null;
  site: { name: string; defaultLocale: string; locales: string[] };
}

/** What Fresco knows of the system: its own version and pages, the plugin API, Node. */
export function systemInfo(input: {
  version: string;
  entries: Pick<PluginEntry, 'type'>[];
  site: { name: string; defaultLocale: string; locales: string[] };
  process?: ProcessLike | undefined;
}): FrescoSystemInfo {
  const proc = input.process;
  const memory = proc?.memoryUsage();
  const templates = input.entries.filter((entry) => entry.type === 'fresco_template').length;
  return {
    fresco: {
      version: input.version,
      pages: input.entries.length - templates,
      templates,
    },
    pluginApi: SDK_VERSION,
    node: proc?.version ?? null,
    platform: proc ? `${proc.platform} ${proc.arch}` : null,
    uptimeSeconds: proc ? Math.round(proc.uptime()) : null,
    memory: memory
      ? { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal }
      : null,
    site: {
      name: input.site.name,
      defaultLocale: input.site.defaultLocale,
      locales: input.site.locales,
    },
  };
}

/** An error as the admin reads it (problem details). */
const refuse = (status: number, detail: string) => ({
  status,
  body: { title: status === 401 ? 'Unauthorized' : 'Bad Request', status, detail },
});

/** The routes of the Tools and System info pages (site settings rights only). */
export function registerTools(
  ctx: PluginContext,
  options: {
    regenerate: (siteId: string) => Promise<void>;
    /** Stored data searched after the documents (the imported header and footer, the kit…). */
    stores?: ReplaceStore[];
  },
): void {
  ctx.routes.api({
    method: 'POST',
    path: '/tools/regenerate-css',
    capability: 'manage_fresco',
    async handler(request) {
      await options.regenerate(request.siteId);
      return { body: { ok: true } };
    },
  });

  ctx.routes.api({
    method: 'POST',
    path: '/tools/replace-url',
    capability: 'manage_fresco',
    async handler(request) {
      const body = (request.body ?? {}) as { from?: unknown; to?: unknown; dryRun?: unknown };
      const from = validUrl(body.from);
      const to = validUrl(body.to);
      if (!from || !to) {
        return refuse(400, 'Both addresses must start with http:// or https://.');
      }
      if (from === to) return refuse(400, 'The two addresses are the same.');
      const user = request.user;
      if (!user) return refuse(401, 'Sign in to continue.');
      const dryRun = body.dryRun !== false;
      const result: ReplaceResult = { replaced: 0, entries: [], dryRun };
      for (const entry of await frescoEntries(ctx, request.siteId)) {
        const { value, count } = replaceInValue(entry.document, from, to);
        if (count === 0) continue;
        if (!dryRun) {
          await ctx.content.update(
            request.siteId,
            entry.id,
            { document: value },
            { userId: user.id },
          );
        }
        result.replaced += count;
        result.entries.push({ id: entry.id, title: entry.title, count });
      }
      const tags: string[] = [];
      for (const store of options.stores ?? []) {
        const stored: unknown = await ctx.storage.get(request.siteId, store.key);
        if (stored === null || stored === undefined) continue;
        const { value, count } = replaceInValue(stored, from, to);
        if (count === 0) continue;
        if (!dryRun) {
          await ctx.storage.set(request.siteId, store.key, value);
          tags.push(...store.tags);
        }
        result.replaced += count;
        result.entries.push({
          id: `storage:${store.key}`,
          title: store.title,
          count,
          stored: true,
        });
      }
      if (tags.length > 0) await ctx.cache.invalidate(request.siteId, tags);
      if (!dryRun && result.replaced > 0) await options.regenerate(request.siteId);
      return { body: result };
    },
  });

  ctx.routes.api({
    method: 'GET',
    path: '/system',
    capability: 'manage_fresco',
    async handler(request) {
      const [entries, site] = await Promise.all([
        frescoEntries(ctx, request.siteId),
        ctx.site(request.siteId),
      ]);
      return {
        body: systemInfo({
          version: ctx.plugin.version,
          entries,
          site,
          process: (globalThis as { process?: ProcessLike }).process,
        }),
      };
    },
  });
}
