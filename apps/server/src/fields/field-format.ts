import { entries, type SiteTransaction } from '@cleitext/db';
import {
  formatFieldValues,
  type FieldDefinition,
  type FieldFormatContext,
  type FieldGroupView,
  type FieldValues,
  type FormattedEntry,
  type FormattedMedia,
} from '@cleitext/shared';
import { and, inArray } from 'drizzle-orm';
import { isPublished } from '../public/site-data.js';
import { loadMedia } from '../public/site-data.js';
import type { UrlBuilder } from '../public/urls.js';

/**
 * Loads by id, batched: the ids asked for in the same tick are loaded with
 * one query (a page formats many fields at once).
 */
function batched<T>(
  load: (ids: string[]) => Promise<Map<string, T>>,
): (id: string) => Promise<T | null> {
  const cache = new Map<string, Promise<T | null>>();
  let pending: { id: string; resolve: (value: T | null) => void }[] = [];
  let scheduled = false;
  const flush = async () => {
    const batch = pending;
    pending = [];
    scheduled = false;
    try {
      const found = await load([...new Set(batch.map((p) => p.id))]);
      for (const p of batch) p.resolve(found.get(p.id) ?? null);
    } catch {
      for (const p of batch) p.resolve(null);
    }
  };
  return (id) => {
    const hit = cache.get(id);
    if (hit) return hit;
    const promise = new Promise<T | null>((resolve) => pending.push({ id, resolve }));
    cache.set(id, promise);
    if (!scheduled) {
      scheduled = true;
      void Promise.resolve().then(flush);
    }
    return promise;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What formatters look up on the server: media with their sizes, and
 * published entries with their address (when the site's URLs are known).
 */
export function formatContext(
  tx: SiteTransaction,
  siteId: string,
  locale: string,
  urls: UrlBuilder | null,
): Omit<FieldFormatContext, 'format'> {
  const media = batched<FormattedMedia>(async (ids) => {
    const found = await loadMedia(
      tx,
      ids.filter((id) => UUID_RE.test(id)),
      locale,
    );
    const out = new Map<string, FormattedMedia>();
    for (const [id, item] of found) {
      const sizes: FormattedMedia['sizes'] = {};
      // One copy per size: the modern format when there are several.
      for (const v of [...item.variants].sort((a, b) =>
        a.format === 'webp' ? -1 : b.format === 'webp' ? 1 : 0,
      )) {
        sizes[v.variant] ??= { url: v.url, width: v.width, height: v.height };
      }
      out.set(id, {
        id,
        url: item.url,
        alt: item.alt,
        width: item.width,
        height: item.height,
        mime: item.mime,
        sizes,
      });
    }
    return out;
  });
  const entry = batched<FormattedEntry>(async (ids) => {
    const valid = ids.filter((id) => UUID_RE.test(id));
    const out = new Map<string, FormattedEntry>();
    if (valid.length === 0) return out;
    const rows = await tx
      .select()
      .from(entries)
      .where(and(inArray(entries.id, valid), isPublished));
    for (const row of rows) {
      out.set(row.id, {
        id: row.id,
        type: row.typeSlug,
        title: row.title,
        url: urls ? urls.entry(row) : '',
      });
    }
    return out;
  });
  return { siteId, locale, media, entry };
}

/**
 * Formatted values of an object for templates (`fieldValues`): its own
 * fields by name, each group's whole values by id, and every group field by
 * `group.name` and, when no other field took it, by name alone.
 */
export async function formattedFields(
  own: readonly FieldDefinition[],
  groups: readonly FieldGroupView[],
  values: FieldValues,
  context: Omit<FieldFormatContext, 'format'>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (own.length > 0) Object.assign(out, await formatFieldValues(own, values, context));
  for (const group of groups) {
    const stored = values[group.id];
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) continue;
    const formatted = await formatFieldValues(group.fields, stored as FieldValues, context);
    out[group.id] ??= formatted;
    for (const [name, value] of Object.entries(formatted)) {
      out[`${group.id}.${name}`] = value;
      if (!(name in out)) out[name] = value;
    }
  }
  return out;
}
