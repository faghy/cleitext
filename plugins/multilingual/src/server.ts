import { DeepL, translateContent, type MachineTranslator } from './machine';
import {
  definePlugin,
  type FieldDefinition,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
  type TranslatableKind,
  type TranslationLink,
} from '@cleitext/plugin-sdk';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  languages,
  strings,
  translations,
  type OverviewRow,
  type StringsResponse,
  type LanguageView,
  type TranslationsResponse,
  type TranslationView,
} from './schema';

/**
 * Multilingual (M7): the site's languages and the links between the
 * versions of an entry or a term in each of them. The core only knows the
 * language of each item; it asks this plugin for the rest (LanguageProvider)
 * and does the routing, the addresses, hreflang and the theme's language
 * switcher with what it gets.
 */

const CODE_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const PREFIX_RE = /^\/[a-z0-9-]{1,20}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Addresses the core uses for itself. */
const RESERVED = new Set([
  '/admin',
  '/cl-admin',
  '/api',
  '/media',
  '/feed',
  '/search',
  '/page',
  '/health',
]);

/** The language's own name, e.g. `Italiano` for `it`. */
export function nativeName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    // Unknown to this runtime.
  }
  return code.toUpperCase();
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export default definePlugin({
  setup(ctx) {
    ctx.languages.provide({
      async locales(siteId) {
        const rows = await ctx.db.transaction(siteId, (tx) =>
          tx.select().from(languages).orderBy(asc(languages.position), asc(languages.code)),
        );
        return rows.map((row) => ({
          code: row.code,
          name: row.name,
          prefix: row.urlPrefix ?? `/${row.code}`,
          isDefault: false,
          ...(row.host ? { host: row.host } : {}),
        }));
      },
      translations: (siteId, kind, ids) => linksOf(ctx, siteId, kind, ids),
      // "Show untranslated content": lists of a language also show the
      // default language's entries that have no version in it.
      async fallback(siteId, locale) {
        if ((await ctx.storage.get<boolean>(siteId, 'showUntranslated')) !== true) return null;
        return ctx.db.transaction(siteId, async (tx) => {
          const groups = tx
            .select({ group: translations.groupId })
            .from(translations)
            .where(and(eq(translations.kind, 'entry'), eq(translations.locale, locale)));
          const rows = await tx
            .select({ id: translations.elementId })
            .from(translations)
            .where(and(eq(translations.kind, 'entry'), inArray(translations.groupId, groups)));
          return rows.map((r) => r.id);
        });
      },
    });

    // An item that is gone leaves its group.
    ctx.hooks.on('entry.deleted', ({ entry }, { siteId }) =>
      unlink(ctx, siteId, 'entry', entry.id),
    );
    ctx.hooks.on('term.deleted', ({ term }, { siteId }) => unlink(ctx, siteId, 'term', term.id));
    // An imported site brought languages and translations.
    ctx.hooks.on('languages.pending', (_, { siteId }) => takeOver(ctx, siteId));
    // Saving an original flags its translations and keeps their `copy` fields
    // in step; saving a translation brings it up to date.
    ctx.hooks.on('entry.saved', ({ entry }, { siteId, userId }) =>
      onEntrySaved(ctx, siteId, entry, userId),
    );
    // Site title and tagline of the other languages.
    ctx.hooks.filter('site.strings', async (value, { siteId, locale }) => {
      const rows = await ctx.db.transaction(siteId, (tx) =>
        tx.select().from(strings).where(eq(strings.locale, locale)),
      );
      const text = (key: 'title' | 'tagline') => rows.find((r) => r.key === key)?.value;
      return { title: text('title') || value.title, tagline: text('tagline') ?? value.tagline };
    });

    routes(ctx);
  },

  async onActivate(site, ctx) {
    // The default language is the core's; it is listed here too, first.
    await ctx.db.transaction(site.id, (tx) =>
      tx
        .insert(languages)
        .values({
          siteId: site.id,
          code: site.defaultLocale,
          name: nativeName(site.defaultLocale),
          position: 0,
        })
        .onConflictDoNothing(),
    );
    await takeOver(ctx, site.id);
    await ctx.languages.changed(site.id);
  },

  async onDeactivate(site, ctx) {
    // Back to one language: addresses, hreflang and lists change at once.
    await ctx.languages.changed(site.id);
  },
});

// ---- Status and synced fields ---------------------------------------------------------

/** Entries being updated by the sync, whose own `entry.saved` must not clear their flag. */
const syncing = new Set<string>();

async function onEntrySaved(
  ctx: PluginContext,
  siteId: string,
  entry: { id: string; type: string; fields: Record<string, unknown> },
  userId: string | undefined,
): Promise<void> {
  if (syncing.has(entry.id)) return;
  const others = await ctx.db.transaction(siteId, async (tx) => {
    const [own] = await tx
      .select()
      .from(translations)
      .where(and(eq(translations.kind, 'entry'), eq(translations.elementId, entry.id)));
    if (!own) return [];
    if (!(await isOriginal(ctx, siteId, own))) {
      await tx
        .update(translations)
        .set({ needsUpdate: false })
        .where(and(eq(translations.kind, 'entry'), eq(translations.elementId, entry.id)));
      return [];
    }
    const members = await tx
      .select({ id: translations.elementId })
      .from(translations)
      .where(and(eq(translations.kind, 'entry'), eq(translations.groupId, own.groupId)));
    const ids = members.map((m) => m.id).filter((id) => id !== entry.id);
    if (ids.length > 0) {
      await tx
        .update(translations)
        .set({ needsUpdate: true })
        .where(and(eq(translations.kind, 'entry'), inArray(translations.elementId, ids)));
    }
    return ids;
  });
  if (others.length === 0 || !userId) return;

  // Fields marked `translation: 'copy'` stay the same in every language.
  const values = await copiedValues(ctx, siteId, entry.type, entry.fields);
  if (Object.keys(values).length === 0) return;
  for (const id of others) {
    syncing.add(id);
    try {
      await ctx.content.updateFields(siteId, id, values, { userId });
    } catch (error) {
      ctx.log.warn('A copied field could not be synced', { id, error: String(error) });
    } finally {
      syncing.delete(id);
    }
  }
  // The sync is no review: they still need one, even if the plugin was
  // reloaded meanwhile (the `syncing` memo is per loaded copy).
  await ctx.db.transaction(siteId, (tx) =>
    tx
      .update(translations)
      .set({ needsUpdate: true })
      .where(and(eq(translations.kind, 'entry'), inArray(translations.elementId, others))),
  );
}

/** The original of a group: the item not translated from another, else the default language's. */
async function isOriginal(
  ctx: PluginContext,
  siteId: string,
  row: typeof translations.$inferSelect,
): Promise<boolean> {
  if (row.sourceLocale !== null) return false;
  const roots = await ctx.db.transaction(siteId, (tx) =>
    tx
      .select({ locale: translations.locale })
      .from(translations)
      .where(
        and(
          eq(translations.kind, row.kind),
          eq(translations.groupId, row.groupId),
          isNull(translations.sourceLocale),
        ),
      ),
  );
  if (roots.length <= 1) return true;
  return row.locale === (await ctx.languages.defaultLocale(siteId));
}

async function copiedValues(
  ctx: PluginContext,
  siteId: string,
  type: string,
  fields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { fields: own, groups } = await ctx.content.fields(siteId, type);
  const values: Record<string, unknown> = {};
  for (const field of own) {
    if (field.translation === 'copy' && field.name in fields)
      values[field.name] = fields[field.name];
  }
  for (const group of groups) {
    const stored = fields[group.id];
    if (typeof stored !== 'object' || stored === null) continue;
    const picked: Record<string, unknown> = {};
    for (const field of group.fields) {
      if (field.translation === 'copy' && field.name in stored)
        picked[field.name] = (stored as Record<string, unknown>)[field.name];
    }
    if (Object.keys(picked).length > 0) values[group.id] = picked;
  }
  return values;
}

// ---- Links ----------------------------------------------------------------------------

async function linksOf(
  ctx: PluginContext,
  siteId: string,
  kind: TranslatableKind,
  ids: string[],
): Promise<Record<string, TranslationLink[]>> {
  const valid = ids.filter((id) => UUID_RE.test(id));
  if (valid.length === 0) return {};
  return ctx.db.transaction(siteId, async (tx) => {
    const own = await tx
      .select({ id: translations.elementId, group: translations.groupId })
      .from(translations)
      .where(and(eq(translations.kind, kind), inArray(translations.elementId, valid)));
    if (own.length === 0) return {};
    const members = await tx
      .select({
        id: translations.elementId,
        group: translations.groupId,
        locale: translations.locale,
      })
      .from(translations)
      .where(
        and(
          eq(translations.kind, kind),
          inArray(translations.groupId, [...new Set(own.map((o) => o.group))]),
        ),
      );
    const result: Record<string, TranslationLink[]> = {};
    for (const { id, group } of own) {
      result[id] = members
        .filter((m) => m.group === group && m.id !== id)
        .map((m) => ({ id: m.id, locale: m.locale }));
    }
    return result;
  });
}

async function unlink(
  ctx: PluginContext,
  siteId: string,
  kind: TranslatableKind,
  id: string,
): Promise<void> {
  await ctx.db.transaction(siteId, (tx) =>
    tx.delete(translations).where(and(eq(translations.kind, kind), eq(translations.elementId, id))),
  );
}

/**
 * Puts `target` (in `targetLocale`) in the group of `source`, which gets
 * one when it had none. A group has one item per language.
 */
async function link(
  ctx: PluginContext,
  siteId: string,
  kind: TranslatableKind,
  source: { id: string; locale: string },
  target: { id: string; locale: string },
): Promise<void> {
  if (source.locale === target.locale) {
    throw new HttpError(400, 'A translation must be in another language.');
  }
  await ctx.db.transaction(siteId, async (tx) => {
    const [existing] = await tx
      .select({ group: translations.groupId })
      .from(translations)
      .where(and(eq(translations.kind, kind), eq(translations.elementId, source.id)));
    const group = existing?.group ?? crypto.randomUUID();
    if (!existing) {
      await tx.insert(translations).values({
        siteId,
        kind,
        elementId: source.id,
        groupId: group,
        locale: source.locale,
      });
    }
    const [taken] = await tx
      .select({ id: translations.elementId })
      .from(translations)
      .where(
        and(
          eq(translations.kind, kind),
          eq(translations.groupId, group),
          eq(translations.locale, target.locale),
        ),
      );
    if (taken && taken.id !== target.id) {
      throw new HttpError(409, 'There is already a translation in that language.');
    }
    await tx
      .delete(translations)
      .where(and(eq(translations.kind, kind), eq(translations.elementId, target.id)));
    await tx.insert(translations).values({
      siteId,
      kind,
      elementId: target.id,
      groupId: group,
      locale: target.locale,
      sourceLocale: source.locale,
    });
  });
  // Addresses in other languages appear on many pages (switcher, hreflang, sitemaps).
  await ctx.cache.invalidate(siteId, ['site']);
}

/**
 * Takes over the languages and links the core kept: from before this plugin
 * existed (migration 0016), or brought by an imported site.
 */
async function takeOver(ctx: PluginContext, siteId: string): Promise<void> {
  const pending = await ctx.languages.pending(siteId);
  if (!pending) return;
  const defaultLocale = await ctx.languages.defaultLocale(siteId);

  // Languages first: links are only kept for languages of the site.
  await ctx.db.transaction(siteId, async (tx) => {
    const known = new Set(
      (await tx.select({ code: languages.code }).from(languages)).map((l) => l.code),
    );
    let position = known.size;
    for (const locale of [...pending.locales].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    )) {
      if (!CODE_RE.test(locale.code) || known.has(locale.code)) continue;
      known.add(locale.code);
      await tx.insert(languages).values({
        siteId,
        code: locale.code,
        name: locale.name?.trim() || nativeName(locale.code),
        urlPrefix:
          locale.code !== defaultLocale && locale.urlPrefix && PREFIX_RE.test(locale.urlPrefix)
            ? locale.urlPrefix
            : null,
        position: position++,
      });
    }
  });

  for (const kind of ['entry', 'term'] as const) {
    const items = kind === 'entry' ? pending.entries : pending.terms;
    const ids = items.map((i) => i.id).filter((id) => UUID_RE.test(id));
    const locales = await localesOf(ctx, siteId, kind, ids);
    const groups = new Map<string, string>();
    await ctx.db.transaction(siteId, async (tx) => {
      for (const item of items) {
        const locale = locales.get(item.id);
        if (!locale) continue;
        let group = groups.get(item.group);
        if (!group) groups.set(item.group, (group = crypto.randomUUID()));
        await tx
          .insert(translations)
          .values({ siteId, kind, elementId: item.id, groupId: group, locale })
          .onConflictDoNothing();
      }
    });
  }

  await ctx.languages.clearPending(siteId);
  await ctx.languages.changed(siteId);
  ctx.log.info('Languages and translations taken over', {
    siteId,
    locales: pending.locales.length,
    entries: pending.entries.length,
    terms: pending.terms.length,
  });
}

/** The language of existing entries or terms (missing ones are left out). */
async function localesOf(
  ctx: PluginContext,
  siteId: string,
  kind: TranslatableKind,
  ids: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const size = kind === 'entry' ? 200 : 500;
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    const items =
      kind === 'entry'
        ? await ctx.content.find(siteId, { ids: chunk, status: 'any', limit: size })
        : await ctx.terms.find(siteId, { ids: chunk, limit: size });
    for (const item of items) result.set(item.id, item.locale);
  }
  return result;
}

// ---- Routes (/api/v1/ext/multilingual) ------------------------------------------------

function routes(ctx: PluginContext): void {
  const handle =
    (fn: (request: RouteRequest) => Promise<RouteResponse>) =>
    async (request: RouteRequest): Promise<RouteResponse> => {
      try {
        return await fn(request);
      } catch (error) {
        // Refusals of the core (permissions, validation) are answers, not failures.
        const status =
          error instanceof HttpError
            ? error.status
            : typeof (error as { getStatus?: () => number }).getStatus === 'function'
              ? (error as { getStatus: () => number }).getStatus()
              : null;
        if (status === null || status >= 500) throw error;
        return { status, body: { title: (error as Error).message, status } };
      }
    };

  // Languages (Settings → Languages).
  ctx.routes.api({
    method: 'GET',
    path: '/languages',
    capability: 'manage_settings',
    handler: handle(async (request) => ({ body: await languageViews(ctx, request.siteId) })),
  });

  ctx.routes.api({
    method: 'POST',
    path: '/languages',
    capability: 'manage_settings',
    handler: handle(async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!CODE_RE.test(code)) throw new HttpError(400, 'A language code such as it or de-CH.');
      const name =
        typeof body.name === 'string' && body.name.trim()
          ? body.name.trim().slice(0, 60)
          : nativeName(code);
      const urlPrefix = prefixOf(body.urlPrefix);
      const host = hostOf(body.host);
      await ctx.db.transaction(request.siteId, async (tx) => {
        const rows = await tx.select().from(languages);
        if (rows.some((r) => r.code === code)) {
          throw new HttpError(409, `The language "${code}" is already there.`);
        }
        assertPrefixFree(
          rows.map((r) => r.urlPrefix ?? `/${r.code}`),
          urlPrefix ?? `/${code}`,
        );
        if (host && rows.some((r) => r.host === host)) {
          throw new HttpError(409, `The domain ${host} is already used by a language.`);
        }
        await tx.insert(languages).values({
          siteId: request.siteId,
          code,
          name,
          urlPrefix,
          host,
          position: Math.max(0, ...rows.map((r) => r.position + 1)),
        });
      });
      await ctx.languages.changed(request.siteId);
      return { status: 201, body: await languageViews(ctx, request.siteId) };
    }),
  });

  ctx.routes.api({
    method: 'PATCH',
    path: '/languages/:code',
    capability: 'manage_settings',
    handler: handle(async (request) => {
      const code = request.params.code ?? '';
      const body = (request.body ?? {}) as Record<string, unknown>;
      await ctx.db.transaction(request.siteId, async (tx) => {
        const rows = await tx.select().from(languages);
        const row = rows.find((r) => r.code === code);
        if (!row) throw new HttpError(404, 'Language not found.');
        const changes: Partial<typeof languages.$inferInsert> = {};
        if (typeof body.name === 'string' && body.name.trim())
          changes.name = body.name.trim().slice(0, 60);
        if (body.urlPrefix !== undefined) {
          changes.urlPrefix = prefixOf(body.urlPrefix);
          assertPrefixFree(
            rows.filter((r) => r.code !== code).map((r) => r.urlPrefix ?? `/${r.code}`),
            changes.urlPrefix ?? `/${code}`,
          );
        }
        if (body.host !== undefined) {
          changes.host = hostOf(body.host);
          if (changes.host && code === (await ctx.languages.defaultLocale(request.siteId))) {
            throw new HttpError(400, 'The default language uses the primary domain.');
          }
          if (changes.host && rows.some((r) => r.code !== code && r.host === changes.host)) {
            throw new HttpError(409, `The domain ${changes.host} is already used by a language.`);
          }
        }
        if (typeof body.position === 'number' && Number.isInteger(body.position))
          changes.position = Math.min(Math.max(body.position, 0), 1000);
        if (Object.keys(changes).length > 0) {
          await tx.update(languages).set(changes).where(eq(languages.code, code));
        }
      });
      if (body.isDefault === true) await ctx.languages.setDefault(request.siteId, code);
      await ctx.languages.changed(request.siteId);
      return { body: await languageViews(ctx, request.siteId) };
    }),
  });

  ctx.routes.api({
    method: 'DELETE',
    path: '/languages/:code',
    capability: 'manage_settings',
    handler: handle(async (request) => {
      const code = request.params.code ?? '';
      const views = await languageViews(ctx, request.siteId);
      const view = views.find((v) => v.code === code);
      if (!view) throw new HttpError(404, 'Language not found.');
      if (view.isDefault) throw new HttpError(409, 'The default language cannot be removed.');
      const used = view.usage.entries + view.usage.terms + view.usage.menus;
      if (used > 0) {
        throw new HttpError(
          409,
          `Content is written in this language (${view.usage.entries} entries, ${view.usage.terms} terms, ${view.usage.menus} menus): move or delete it first.`,
        );
      }
      await ctx.db.transaction(request.siteId, (tx) =>
        tx.delete(languages).where(eq(languages.code, code)),
      );
      await ctx.languages.changed(request.siteId);
      return { body: await languageViews(ctx, request.siteId) };
    }),
  });

  // Site title and tagline per language.
  ctx.routes.api({
    method: 'GET',
    path: '/strings',
    capability: 'manage_settings',
    handler: handle(async (request) => {
      const rows = await ctx.db.transaction(request.siteId, (tx) => tx.select().from(strings));
      const body: StringsResponse = {};
      for (const row of rows)
        (body[row.locale] ??= { title: '', tagline: '' })[row.key] = row.value;
      return { body };
    }),
  });

  ctx.routes.api({
    method: 'PUT',
    path: '/strings/:locale',
    capability: 'manage_settings',
    handler: handle(async (request) => {
      const locale = request.params.locale ?? '';
      if (!CODE_RE.test(locale)) throw new HttpError(400, 'Invalid language.');
      if (locale === (await ctx.languages.defaultLocale(request.siteId))) {
        throw new HttpError(400, 'The texts of the default language are in Settings.');
      }
      const body = (request.body ?? {}) as Record<string, unknown>;
      await ctx.db.transaction(request.siteId, async (tx) => {
        for (const key of ['title', 'tagline'] as const) {
          const value =
            typeof body[key] === 'string' ? (body[key] as string).trim().slice(0, 300) : '';
          await tx.delete(strings).where(and(eq(strings.locale, locale), eq(strings.key, key)));
          if (value)
            await tx.insert(strings).values({ siteId: request.siteId, locale, key, value });
        }
      });
      await ctx.cache.invalidate(request.siteId, ['site']);
      return { status: 204 };
    }),
  });

  // Overview: entries of a type in the default language and their translations.
  ctx.routes.api({
    method: 'GET',
    path: '/overview',
    capability: 'edit_entries',
    handler: handle(async (request) => {
      const type = /^[a-z0-9-]{1,64}$/.test(request.query.type ?? '')
        ? request.query.type!
        : 'article';
      const locale = await ctx.languages.defaultLocale(request.siteId);
      const items = await ctx.content.find(request.siteId, {
        type,
        locale,
        status: 'any',
        limit: 200,
      });
      const views = await translationViews(
        ctx,
        request.siteId,
        'entry',
        items.map((i) => i.id),
      );
      const body: OverviewRow[] = items.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        links: views[item.id]?.links ?? [],
      }));
      return { body };
    }),
  });

  // Translations of entries and terms.
  ctx.routes.api({
    method: 'GET',
    path: '/translations',
    capability: 'edit_entries',
    handler: handle(async (request) => {
      const kind = request.query.kind === 'term' ? 'term' : 'entry';
      const ids = (request.query.ids ?? '')
        .split(',')
        .filter((id) => UUID_RE.test(id))
        .slice(0, 200);
      return { body: await translationViews(ctx, request.siteId, kind, ids) };
    }),
  });

  ctx.routes.api({
    method: 'POST',
    path: '/translations/entry/:id',
    capability: 'edit_entries',
    handler: handle(async (request) => {
      const id = request.params.id ?? '';
      const body = (request.body ?? {}) as { locale?: unknown; machine?: unknown };
      const locale = body.locale;
      if (!UUID_RE.test(id) || typeof locale !== 'string')
        throw new HttpError(400, 'Invalid request.');
      const source = await ctx.content.get(request.siteId, id);
      if (!source) throw new HttpError(404, 'Entry not found.');
      await assertFree(ctx, request.siteId, 'entry', id, locale);
      const translator = body.machine === true ? await machineFor(ctx, request.siteId) : null;
      const copy = await ctx.content.copy(request.siteId, id, {
        userId: request.user!.id,
        locale,
      });
      await link(ctx, request.siteId, 'entry', source, copy);
      if (!translator) return { status: 201, body: { id: copy.id } };
      // The copy exists either way; a failed machine translation is reported.
      try {
        await machineTranslate(ctx, request.siteId, translator, source, copy, request.user!.id);
        return { status: 201, body: { id: copy.id } };
      } catch (error) {
        return { status: 201, body: { id: copy.id, warning: (error as Error).message } };
      }
    }),
  });

  // Updates a translation from its original with machine translation.
  ctx.routes.api({
    method: 'POST',
    path: '/translations/entry/:id/machine',
    capability: 'edit_entries',
    handler: handle(async (request) => {
      const id = request.params.id ?? '';
      if (!UUID_RE.test(id)) throw new HttpError(404, 'Not found.');
      const translator = await machineFor(ctx, request.siteId);
      if (!translator) throw new HttpError(409, 'Automatic translation is not set up.');
      const target = await ctx.content.get(request.siteId, id);
      if (!target) throw new HttpError(404, 'Entry not found.');
      const originalId = await originalOf(ctx, request.siteId, id);
      if (!originalId) throw new HttpError(409, 'This entry is not a translation.');
      const original = await ctx.content.get(request.siteId, originalId);
      if (!original) throw new HttpError(404, 'The original is gone.');
      try {
        await machineTranslate(ctx, request.siteId, translator, original, target, request.user!.id);
      } catch (error) {
        throw new HttpError(502, (error as Error).message);
      }
      return { status: 204 };
    }),
  });

  // Options of the site.
  ctx.routes.api({
    method: 'GET',
    path: '/options',
    capability: 'manage_settings',
    handler: handle(async (request) => ({
      body: {
        showUntranslated:
          (await ctx.storage.get<boolean>(request.siteId, 'showUntranslated')) === true,
      },
    })),
  });

  ctx.routes.api({
    method: 'PUT',
    path: '/options',
    capability: 'manage_settings',
    handler: handle(async (request) => {
      const body = (request.body ?? {}) as { showUntranslated?: unknown };
      await ctx.storage.set(request.siteId, 'showUntranslated', body.showUntranslated === true);
      await ctx.cache.invalidate(request.siteId, ['site']);
      return { status: 204 };
    }),
  });

  // Automatic translation settings (the API key is stored encrypted).
  ctx.routes.api({
    method: 'GET',
    path: '/machine',
    capability: 'edit_entries',
    handler: handle(async (request) => ({
      body: {
        provider: 'deepl',
        configured: (await ctx.secrets.get(request.siteId, 'deepl')) !== null,
      },
    })),
  });

  ctx.routes.api({
    method: 'PUT',
    path: '/machine',
    capability: 'manage_settings',
    handler: handle(async (request) => {
      const key = (request.body as { apiKey?: unknown } | null)?.apiKey;
      if (typeof key !== 'string' || !/^[\w:-]{20,100}$/.test(key.trim())) {
        throw new HttpError(400, 'Paste the API key of your DeepL account.');
      }
      await ctx.secrets.set(request.siteId, 'deepl', key.trim());
      return { status: 204 };
    }),
  });

  ctx.routes.api({
    method: 'DELETE',
    path: '/machine',
    capability: 'manage_settings',
    handler: handle(async (request) => {
      await ctx.secrets.delete(request.siteId, 'deepl');
      return { status: 204 };
    }),
  });

  ctx.routes.api({
    method: 'POST',
    path: '/translations/term/:id',
    capability: 'manage_terms',
    handler: handle(async (request) => {
      const id = request.params.id ?? '';
      const body = (request.body ?? {}) as { locale?: unknown; name?: unknown };
      if (!UUID_RE.test(id) || typeof body.locale !== 'string') {
        throw new HttpError(400, 'Invalid request.');
      }
      const [source] = await ctx.terms.find(request.siteId, { ids: [id], limit: 1 });
      if (!source) throw new HttpError(404, 'Term not found.');
      await assertFree(ctx, request.siteId, 'term', id, body.locale);
      // The parent of the copy: the translation of the source's parent.
      const parentId = source.parentId
        ? ((await linksOf(ctx, request.siteId, 'term', [source.parentId]))[source.parentId]?.find(
            (l) => l.locale === body.locale,
          )?.id ?? null)
        : null;
      const copy = await ctx.terms.copy(request.siteId, id, {
        userId: request.user!.id,
        locale: body.locale,
        ...(typeof body.name === 'string' && body.name.trim()
          ? { name: body.name.trim().slice(0, 200) }
          : {}),
        parentId,
      });
      await link(ctx, request.siteId, 'term', source, copy);
      return { status: 201, body: { id: copy.id } };
    }),
  });

  ctx.routes.api({
    method: 'DELETE',
    path: '/translations/:kind/:id',
    capability: 'edit_entries',
    handler: handle(async (request) => {
      const kind = request.params.kind === 'term' ? 'term' : 'entry';
      const id = request.params.id ?? '';
      if (!UUID_RE.test(id)) throw new HttpError(404, 'Not found.');
      if (kind === 'term' && !request.user?.capabilities.includes('manage_terms')) {
        throw new HttpError(403, 'You cannot manage terms.');
      }
      await unlink(ctx, request.siteId, kind, id);
      await ctx.cache.invalidate(request.siteId, ['site']);
      return { status: 204 };
    }),
  });
}

// ---- Machine translation ------------------------------------------------------------

async function machineFor(ctx: PluginContext, siteId: string): Promise<MachineTranslator | null> {
  const key = await ctx.secrets.get(siteId, 'deepl');
  return key ? new DeepL(key) : null;
}

/** Writes into `target` the machine translation of `source`'s latest saved version. */
async function machineTranslate(
  ctx: PluginContext,
  siteId: string,
  translator: MachineTranslator,
  source: { id: string; type: string; locale: string },
  target: { id: string; locale: string },
  userId: string,
): Promise<void> {
  const original = await ctx.content.revision(siteId, source.id);
  const current = await ctx.content.revision(siteId, target.id);
  if (!original || !current) throw new Error('The entry has no saved version.');
  const { fields: own, groups } = await ctx.content.fields(siteId, source.type);
  const translated = await translateContent(
    translator,
    {
      ...original,
      fields: { ...current.fields, ...pickTranslatable(original.fields, own, groups) },
    },
    { own, groups },
    source.locale,
    target.locale,
  );
  await ctx.content.update(
    siteId,
    target.id,
    {
      title: translated.title,
      excerpt: translated.excerpt,
      document: translated.document,
      fields: translated.fields,
    },
    { userId },
  );
}

/** Values of the fields that are translated (the others keep the target's). */
function pickTranslatable(
  fields: Record<string, unknown>,
  own: FieldDefinition[],
  groups: { id: string; fields: FieldDefinition[] }[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of own) {
    if ((field.translation ?? 'translate') === 'translate' && field.name in fields)
      result[field.name] = fields[field.name];
  }
  for (const group of groups) {
    const values = fields[group.id];
    if (!values || typeof values !== 'object') continue;
    const picked: Record<string, unknown> = {};
    for (const field of group.fields) {
      if ((field.translation ?? 'translate') === 'translate' && field.name in values)
        picked[field.name] = (values as Record<string, unknown>)[field.name];
    }
    result[group.id] = picked;
  }
  return result;
}

/** The original of a translation's group (the language it was translated from). */
async function originalOf(ctx: PluginContext, siteId: string, id: string): Promise<string | null> {
  const [own] = await ctx.db.transaction(siteId, (tx) =>
    tx
      .select()
      .from(translations)
      .where(and(eq(translations.kind, 'entry'), eq(translations.elementId, id))),
  );
  if (!own?.sourceLocale) return null;
  const [original] = await ctx.db.transaction(siteId, (tx) =>
    tx
      .select({ id: translations.elementId })
      .from(translations)
      .where(
        and(
          eq(translations.kind, 'entry'),
          eq(translations.groupId, own.groupId),
          eq(translations.locale, own.sourceLocale!),
        ),
      ),
  );
  return original?.id ?? null;
}

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** A domain without scheme or port, e.g. `example.de`; null clears it. */
function hostOf(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const host = typeof value === 'string' ? value.trim().toLowerCase().replace(/\.$/, '') : '';
  if (!HOST_RE.test(host)) {
    throw new HttpError(400, 'A domain such as example.de, without https:// or a path.');
  }
  return host;
}

function prefixOf(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !PREFIX_RE.test(value)) {
    throw new HttpError(400, 'An address prefix such as /en (letters, digits and dashes).');
  }
  return value;
}

function assertPrefixFree(taken: string[], prefix: string): void {
  if (RESERVED.has(prefix) || taken.includes(prefix)) {
    throw new HttpError(409, `The address ${prefix} is already used.`);
  }
}

async function assertFree(
  ctx: PluginContext,
  siteId: string,
  kind: TranslatableKind,
  id: string,
  locale: string,
): Promise<void> {
  const links = (await linksOf(ctx, siteId, kind, [id]))[id] ?? [];
  if (links.some((l) => l.locale === locale)) {
    throw new HttpError(409, 'There is already a translation in that language.');
  }
}

async function languageViews(ctx: PluginContext, siteId: string): Promise<LanguageView[]> {
  const [rows, usage, defaultLocale] = await Promise.all([
    ctx.db.transaction(siteId, (tx) =>
      tx.select().from(languages).orderBy(asc(languages.position), asc(languages.code)),
    ),
    ctx.languages.usage(siteId),
    ctx.languages.defaultLocale(siteId),
  ]);
  const views = rows.map((row) => {
    const isDefault = row.code === defaultLocale;
    return {
      code: row.code,
      name: row.name,
      prefix: isDefault || row.host ? '' : (row.urlPrefix ?? `/${row.code}`),
      urlPrefix: row.urlPrefix,
      host: isDefault ? null : row.host,
      position: row.position,
      isDefault,
      usage: usage[row.code] ?? { entries: 0, terms: 0, menus: 0 },
    };
  });
  // The default first, as everywhere.
  return [...views.filter((v) => v.isDefault), ...views.filter((v) => !v.isDefault)];
}

async function translationViews(
  ctx: PluginContext,
  siteId: string,
  kind: TranslatableKind,
  ids: string[],
): Promise<TranslationsResponse> {
  const links = await linksOf(ctx, siteId, kind, ids);
  const all = [
    ...new Set([
      ...ids,
      ...Object.values(links)
        .flat()
        .map((l) => l.id),
    ]),
  ];
  const details = new Map<string, TranslationView>();
  if (kind === 'entry') {
    for (let i = 0; i < all.length; i += 200) {
      for (const e of await ctx.content.find(siteId, {
        ids: all.slice(i, i + 200),
        status: 'any',
        limit: 200,
      })) {
        details.set(e.id, { id: e.id, locale: e.locale, title: e.title, status: e.status });
      }
    }
  } else {
    for (const t of await ctx.terms.find(siteId, { ids: all, limit: 500 })) {
      details.set(t.id, { id: t.id, locale: t.locale, title: t.name });
    }
  }
  const rows = await ctx.db.transaction(siteId, (tx) =>
    tx
      .select({
        id: translations.elementId,
        needsUpdate: translations.needsUpdate,
        sourceLocale: translations.sourceLocale,
      })
      .from(translations)
      .where(and(eq(translations.kind, kind), inArray(translations.elementId, all))),
  );
  const state = new Map(rows.map((r) => [r.id, r]));
  const result: TranslationsResponse = {};
  for (const id of ids) {
    const own = details.get(id);
    if (!own) continue;
    result[id] = {
      locale: own.locale,
      needsUpdate: state.get(id)?.needsUpdate ?? false,
      isOriginal: (state.get(id)?.sourceLocale ?? null) === null,
      links: (links[id] ?? []).flatMap((l) => {
        const detail = details.get(l.id);
        return detail ? [{ ...detail, needsUpdate: state.get(l.id)?.needsUpdate ?? false }] : [];
      }),
    };
  }
  return result;
}
