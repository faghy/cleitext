import {
  entries,
  media as mediaTable,
  siteMembers,
  taxonomies,
  terms,
  users,
  type SiteTransaction,
} from '@cleitext/db';
import {
  formatFieldValues,
  type FieldDefinition,
  type FieldFormatContext,
  type FieldGroupView,
  type FieldValues,
  type FormattedEntry,
  type FormattedMedia,
  type FormattedTerm,
  type FormattedUser,
} from '@cleitext/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { avatarUrl } from '../profile/avatar.js';
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
  // Terms, members and files (plugin API 1.48).
  const term = batched<FormattedTerm>(async (ids) => {
    const valid = ids.filter((id) => UUID_RE.test(id));
    const out = new Map<string, FormattedTerm>();
    if (valid.length === 0) return out;
    const rows = await tx
      .select({ term: terms, taxonomy: taxonomies.slug })
      .from(terms)
      .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
      .where(inArray(terms.id, valid));
    for (const row of rows) {
      out.set(row.term.id, {
        id: row.term.id,
        taxonomy: row.taxonomy,
        name: row.term.name,
        slug: row.term.slug,
        url: urls ? urls.term(row.taxonomy, row.term.slug, row.term.locale) : '',
      });
    }
    return out;
  });
  const user = batched<FormattedUser>(async (ids) => {
    const valid = ids.filter((id) => UUID_RE.test(id));
    const out = new Map<string, FormattedUser>();
    if (valid.length === 0) return out;
    // Members of the site only: accounts are shared by sites.
    const rows = await tx
      .select({
        id: users.id,
        name: users.displayName,
        avatarKey: users.avatarKey,
        slug: users.slug,
      })
      .from(siteMembers)
      .innerJoin(users, eq(users.id, siteMembers.userId))
      .where(inArray(users.id, valid));
    for (const row of rows) {
      out.set(row.id, {
        id: row.id,
        name: row.name,
        avatarUrl: avatarUrl(row.avatarKey),
        url: urls && row.slug ? urls.author(locale, row.slug) : null,
      });
    }
    return out;
  });
  const names = batched<string>(async (ids) => {
    const valid = ids.filter((id) => UUID_RE.test(id));
    const out = new Map<string, string>();
    if (valid.length === 0) return out;
    const rows = await tx
      .select({ id: mediaTable.id, filename: mediaTable.filename })
      .from(mediaTable)
      .where(inArray(mediaTable.id, valid));
    for (const row of rows) out.set(row.id, row.filename);
    return out;
  });
  const file = async (id: string): Promise<FormattedMedia | null> => {
    const [found, filename] = await Promise.all([media(id), names(id)]);
    return found ? { ...found, ...(filename ? { filename } : {}) } : null;
  };
  return { siteId, locale, media, entry, term, user, file };
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
