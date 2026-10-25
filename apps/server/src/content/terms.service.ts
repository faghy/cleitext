import {
  entries,
  entryTerms,
  newId,
  sites,
  taxonomies,
  terms,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import { type FieldDefinition, type TaxonomyView, type TermView } from '@cleitext/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { AuthContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { isTypeAvailable } from '../public/site-data.js';
import { LanguagesService } from './languages.service.js';
import { FieldGroupsService } from '../fields/field-groups.service.js';
import { nextFreeSlug, slugify } from './slug.js';

type TaxonomyRow = typeof taxonomies.$inferSelect;
type TermRow = typeof terms.$inferSelect;

/**
 * Taxonomies and terms (RF-TAX-01/03). Like WordPress: terms of hierarchical
 * taxonomies (categories) need `manage_terms`; flat ones (tags) can also be
 * created by anyone who writes entries.
 */
@Injectable()
export class TermsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly cache: PageCacheService,
    private readonly languages: LanguagesService,
    private readonly plugins: PluginHost,
    private readonly fieldGroups: FieldGroupsService,
  ) {}

  /**
   * Term fields checked against the taxonomy's own fields and the field
   * groups shown for its terms (plugin API 1.47). `partial`: required
   * fields may stay empty (a term added from the editor, a copy).
   */
  private async validTermFields(
    siteId: string,
    auth: AuthContext | null,
    taxonomy: TaxonomyRow,
    values: Record<string, unknown>,
    options: { partial?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const result = await this.fieldGroups.check(
      siteId,
      taxonomyFields(taxonomy),
      values,
      { object: 'term', taxonomy: taxonomy.slug, currentUserRole: auth?.role?.slug ?? null },
      options,
    );
    if (!result.ok) {
      throw new BadRequestException({
        message: 'Some fields are not valid.',
        errors: result.errors.map((e) => ({
          field: e.path.slice('fields.'.length),
          path: e.path,
          message: e.message,
        })),
      });
    }
    return result.values;
  }

  /**
   * New values of some fields of a term (`ctx.terms.updateFields`, plugin
   * API 1.47): the others keep theirs; groups are merged one level down.
   */
  async updateTermFields(siteId: string, id: string, values: Record<string, unknown>) {
    const saved = await withContext(this.database.db, { siteId }, async (tx) => {
      const term = await this.term(tx, id);
      const [taxonomy] = await tx
        .select()
        .from(taxonomies)
        .where(eq(taxonomies.id, term.taxonomyId));
      const fields = await this.validTermFields(
        siteId,
        null,
        taxonomy!,
        mergeFieldValues(term.fields as Record<string, unknown>, values),
      );
      await tx.update(terms).set({ fields }).where(eq(terms.id, id));
      return {
        view: toView({ ...term, fields }, taxonomy!.slug, 0),
        previous: term.fields as Record<string, unknown>,
      };
    });
    await this.cache.invalidate(siteId, ['site']);
    await this.emitSaved(siteId, saved.view, saved.previous);
  }

  private run<T>(siteId: string, auth: AuthContext, fn: (tx: SiteTransaction) => Promise<T>) {
    return withContext(this.database.db, { siteId, userId: auth.userId }, fn);
  }

  listTaxonomies(siteId: string, auth: AuthContext): Promise<TaxonomyView[]> {
    return this.run(siteId, auth, async (tx) => {
      const active = await this.plugins.activeSlugs(siteId);
      const rows = await tx.select().from(taxonomies).orderBy(asc(taxonomies.slug));
      return rows.filter((t) => isTypeAvailable(t.source, active)).map(taxonomyView);
    });
  }

  listTerms(
    siteId: string,
    auth: AuthContext,
    taxonomySlug: string,
    locale?: string,
  ): Promise<TermView[]> {
    return this.run(siteId, auth, async (tx) => {
      const taxonomy = await this.taxonomy(tx, taxonomySlug, siteId);
      const rows = await tx
        .select({
          term: terms,
          count: sql<number>`(select count(*)::int from ${entryTerms} where ${entryTerms.termId} = ${terms.id})`,
        })
        .from(terms)
        .where(
          and(eq(terms.taxonomyId, taxonomy.id), locale ? eq(terms.locale, locale) : undefined),
        )
        .orderBy(asc(terms.position), asc(terms.name));
      return rows.map(({ term, count }) => toView(term, taxonomy.slug, count));
    });
  }

  async createTerm(
    siteId: string,
    auth: AuthContext,
    taxonomySlug: string,
    input: {
      name: string;
      slug?: string | undefined;
      parentId?: string | null | undefined;
      locale?: string | undefined;
      description?: string | undefined;
      fields?: Record<string, unknown> | undefined;
      position?: number | undefined;
    },
  ): Promise<TermView> {
    const view = await this.run(siteId, auth, async (tx) => {
      const taxonomy = await this.taxonomy(tx, taxonomySlug, siteId);
      this.assertCanCreate(auth, taxonomy);
      const locale = input.locale ?? (await this.defaultLocale(tx, siteId));
      await this.assertLocale(tx, siteId, locale);
      return toView(
        await this.insertTerm(tx, siteId, taxonomy, { ...input, locale }, auth),
        taxonomy.slug,
        0,
      );
    });
    await this.emitTerm(siteId, 'term.created', view, auth.userId);
    await this.emitSaved(siteId, view, null, auth.userId);
    return view;
  }

  /**
   * A copy of a term in a language (`ctx.terms.copy`, used by the language
   * plugin to translate it). The plugin gives the parent in that language.
   */
  async copyToLocale(
    siteId: string,
    auth: AuthContext,
    id: string,
    input: { locale: string; name?: string | undefined; parentId?: string | null | undefined },
  ): Promise<TermView> {
    const view = await this.run(siteId, auth, async (tx) => {
      const source = await this.term(tx, id);
      const [taxonomy] = await tx
        .select()
        .from(taxonomies)
        .where(eq(taxonomies.id, source.taxonomyId));
      this.assertCanCreate(auth, taxonomy!);
      await this.assertLocale(tx, siteId, input.locale);
      const term = await this.insertTerm(tx, siteId, taxonomy!, {
        name: input.name ?? source.name,
        // A translated name gets its own slug; otherwise the source's is kept.
        slug: input.locale === source.locale || input.name ? undefined : source.slug,
        parentId: input.parentId ?? null,
        locale: input.locale,
        description: source.description ?? undefined,
        fields: source.fields as Record<string, unknown>,
        position: source.position,
        copy: true,
      });
      return toView(term, taxonomy!.slug, 0);
    });
    await this.emitTerm(siteId, 'term.created', view, auth.userId);
    await this.emitSaved(siteId, view, null, auth.userId);
    return view;
  }

  async updateTerm(
    siteId: string,
    auth: AuthContext,
    id: string,
    input: {
      name?: string | undefined;
      slug?: string | undefined;
      parentId?: string | null | undefined;
      description?: string | undefined;
      fields?: Record<string, unknown> | undefined;
      position?: number | undefined;
    },
  ): Promise<TermView> {
    const before: { fields: Record<string, unknown> | null } = { fields: null };
    const view = await this.run(siteId, auth, async (tx) => {
      if (!auth.capabilities.includes('manage_terms'))
        throw new ForbiddenException('You cannot manage terms.');
      const term = await this.term(tx, id);
      before.fields = term.fields as Record<string, unknown>;
      const [taxonomy] = await tx
        .select()
        .from(taxonomies)
        .where(eq(taxonomies.id, term.taxonomyId));
      const changes: Partial<TermRow> = {};
      if (input.name !== undefined) changes.name = input.name;
      if (input.description !== undefined) changes.description = input.description;
      if (input.position !== undefined) changes.position = input.position;
      if (input.fields !== undefined) {
        // Only the given fields change; the others keep their values.
        changes.fields = await this.validTermFields(siteId, auth, taxonomy!, {
          ...(term.fields as Record<string, unknown>),
          ...input.fields,
        });
      }
      if (input.slug !== undefined && input.slug !== term.slug) {
        changes.slug = await this.uniqueSlug(tx, term.taxonomyId, term.locale, input.slug, term.id);
      }
      if (input.parentId !== undefined) {
        changes.parentId = await this.validParent(
          tx,
          taxonomy!,
          term.locale,
          input.parentId,
          term.id,
        );
      }
      // Nothing new (e.g. the same slug again): the term as it is.
      if (Object.keys(changes).length === 0) {
        before.fields = null;
        return toView(term, taxonomy!.slug, 0);
      }
      const [updated] = await tx.update(terms).set(changes).where(eq(terms.id, id)).returning();
      return toView(updated!, taxonomy!.slug, 0);
    });
    // Term names and slugs appear on many pages: refresh the whole site.
    await this.cache.invalidate(siteId, ['site']);
    if (before.fields) await this.emitSaved(siteId, view, before.fields, auth.userId);
    return view;
  }

  async deleteTerm(siteId: string, auth: AuthContext, id: string): Promise<void> {
    const view = await this.run(siteId, auth, async (tx) => {
      if (!auth.capabilities.includes('manage_terms'))
        throw new ForbiddenException('You cannot manage terms.');
      const term = await this.term(tx, id);
      const [taxonomy] = await tx
        .select({ slug: taxonomies.slug })
        .from(taxonomies)
        .where(eq(taxonomies.id, term.taxonomyId));
      // Children move up to the deleted term's parent, as in WordPress.
      await tx.update(terms).set({ parentId: term.parentId }).where(eq(terms.parentId, id));
      await tx.delete(terms).where(eq(terms.id, id));
      return toView(term, taxonomy?.slug ?? '', 0);
    });
    await this.cache.invalidate(siteId, ['site']);
    await this.emitTerm(siteId, 'term.deleted', view, auth.userId);
  }

  /** `term.saved` (plugin API 1.49): the term with its values, and those it had (null: new). */
  private async emitSaved(
    siteId: string,
    view: TermView,
    previous: Record<string, unknown> | null,
    userId?: string,
  ): Promise<void> {
    await this.plugins.emit(
      'term.saved',
      {
        term: {
          id: view.id,
          siteId,
          taxonomy: view.taxonomy,
          locale: view.locale,
          slug: view.slug,
          name: view.name,
          fields: view.fields ?? {},
        },
        previous,
      },
      siteId,
      userId,
    );
  }

  /** Runs plugin actions after the change is committed. */
  private async emitTerm(
    siteId: string,
    action: 'term.created' | 'term.deleted',
    view: TermView,
    userId?: string,
  ): Promise<void> {
    await this.plugins.emit(
      action,
      {
        term: {
          id: view.id,
          siteId,
          taxonomy: view.taxonomy,
          locale: view.locale,
          slug: view.slug,
          name: view.name,
        },
      },
      siteId,
      userId,
    );
  }

  /** Terms assigned to an entry, grouped by taxonomy slug. */
  async termsOfEntry(tx: SiteTransaction, entryId: string): Promise<Record<string, TermView[]>> {
    const rows = await tx
      .select({ term: terms, taxonomySlug: taxonomies.slug })
      .from(entryTerms)
      .innerJoin(terms, eq(terms.id, entryTerms.termId))
      .innerJoin(taxonomies, eq(taxonomies.id, terms.taxonomyId))
      .where(eq(entryTerms.entryId, entryId))
      .orderBy(asc(entryTerms.position), asc(terms.name));
    const result: Record<string, TermView[]> = {};
    for (const { term, taxonomySlug } of rows) {
      (result[taxonomySlug] ??= []).push(toView(term, taxonomySlug, 0));
    }
    return result;
  }

  /**
   * Replaces the terms of an entry for the given taxonomies. Tags may be
   * given by name: missing ones are created on the fly.
   */
  async assign(
    tx: SiteTransaction,
    siteId: string,
    auth: AuthContext,
    entry: typeof entries.$inferSelect,
    assignments: Record<string, (string | { name: string })[]>,
  ): Promise<void> {
    for (const [taxonomySlug, values] of Object.entries(assignments)) {
      const taxonomy = await this.taxonomy(tx, taxonomySlug, siteId);
      if (!taxonomy.contentTypes.includes(entry.typeSlug)) {
        throw new BadRequestException(
          `${taxonomySlug} does not apply to ${entry.typeSlug} entries.`,
        );
      }
      const ids: string[] = [];
      for (const value of values) {
        if (typeof value === 'string') {
          ids.push(value);
        } else {
          const slug = slugify(value.name);
          const [existing] = await tx
            .select()
            .from(terms)
            .where(
              and(
                eq(terms.taxonomyId, taxonomy.id),
                eq(terms.locale, entry.locale),
                eq(terms.slug, slug),
              ),
            );
          if (existing) {
            ids.push(existing.id);
          } else {
            this.assertCanCreate(auth, taxonomy);
            ids.push(
              (
                await this.insertTerm(tx, siteId, taxonomy, {
                  name: value.name,
                  locale: entry.locale,
                })
              ).id,
            );
          }
        }
      }
      const unique = [...new Set(ids)];
      if (unique.length > 0) {
        const found = await tx
          .select({ id: terms.id })
          .from(terms)
          .where(
            and(
              inArray(terms.id, unique),
              eq(terms.taxonomyId, taxonomy.id),
              eq(terms.locale, entry.locale),
            ),
          );
        if (found.length !== unique.length) {
          throw new BadRequestException(
            `Some ${taxonomySlug} terms do not exist in this language.`,
          );
        }
      }
      const current = tx
        .select({ id: terms.id })
        .from(terms)
        .where(eq(terms.taxonomyId, taxonomy.id));
      await tx
        .delete(entryTerms)
        .where(and(eq(entryTerms.entryId, entry.id), inArray(entryTerms.termId, current)));
      if (unique.length > 0) {
        await tx
          .insert(entryTerms)
          .values(
            unique.map((termId, position) => ({ siteId, entryId: entry.id, termId, position })),
          );
      }
    }
  }

  // ---- Internals ----------------------------------------------------------------

  private async insertTerm(
    tx: SiteTransaction,
    siteId: string,
    taxonomy: TaxonomyRow,
    input: {
      name: string;
      slug?: string | undefined;
      parentId?: string | null | undefined;
      locale: string;
      description?: string | undefined;
      fields?: Record<string, unknown> | undefined;
      position?: number | undefined;
      /** A copy (translation): its values are kept as they are. */
      copy?: boolean;
    },
    auth: AuthContext | null = null,
  ): Promise<TermRow> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('The name is required.');
    const parentId = await this.validParent(
      tx,
      taxonomy,
      input.locale,
      input.parentId ?? null,
      null,
    );
    const [term] = await tx
      .insert(terms)
      .values({
        id: newId(),
        siteId,
        taxonomyId: taxonomy.id,
        locale: input.locale,
        parentId,
        slug: await this.uniqueSlug(tx, taxonomy.id, input.locale, input.slug ?? name, null),
        name,
        description: input.description ?? null,
        fields: await this.validTermFields(siteId, auth, taxonomy, input.fields ?? {}, {
          partial: input.fields === undefined || input.copy === true,
        }),
        position: input.position ?? 0,
      })
      .returning();
    return term!;
  }

  private async defaultLocale(tx: SiteTransaction, siteId: string): Promise<string> {
    const [site] = await tx
      .select({ locale: sites.defaultLocale })
      .from(sites)
      .where(eq(sites.id, siteId));
    return site?.locale ?? 'en';
  }

  private async assertLocale(tx: SiteTransaction, siteId: string, locale: string): Promise<void> {
    if (!(await this.languages.allowed(siteId, await this.defaultLocale(tx, siteId), locale)))
      throw new BadRequestException(`The language "${locale}" is not enabled on this site.`);
  }

  private assertCanCreate(auth: AuthContext, taxonomy: TaxonomyRow): void {
    const allowed =
      auth.capabilities.includes('manage_terms') ||
      (!taxonomy.hierarchical && auth.capabilities.includes('edit_entries'));
    if (!allowed) throw new ForbiddenException(`You cannot add ${taxonomy.slug} terms.`);
  }

  private async taxonomy(tx: SiteTransaction, slug: string, siteId?: string): Promise<TaxonomyRow> {
    const [taxonomy] = await tx.select().from(taxonomies).where(eq(taxonomies.slug, slug));
    // A plugin's taxonomy is only there while the plugin is active.
    const available =
      taxonomy &&
      (!siteId || isTypeAvailable(taxonomy.source, await this.plugins.activeSlugs(siteId)));
    if (!taxonomy || !available) throw new NotFoundException(`Unknown taxonomy "${slug}".`);
    return taxonomy;
  }

  private async term(tx: SiteTransaction, id: string): Promise<TermRow> {
    const [term] = await tx.select().from(terms).where(eq(terms.id, id));
    if (!term) throw new NotFoundException('Term not found.');
    return term;
  }

  private async validParent(
    tx: SiteTransaction,
    taxonomy: TaxonomyRow,
    locale: string,
    parentId: string | null,
    selfId: string | null,
  ): Promise<string | null> {
    if (!parentId) return null;
    if (!taxonomy.hierarchical)
      throw new BadRequestException(`${taxonomy.slug} terms cannot have a parent.`);
    if (parentId === selfId) throw new BadRequestException('A term cannot be its own parent.');
    const [parent] = await tx.select().from(terms).where(eq(terms.id, parentId));
    if (!parent || parent.taxonomyId !== taxonomy.id || parent.locale !== locale) {
      throw new BadRequestException('The parent must be a term of the same taxonomy and language.');
    }
    let cursor = parent.parentId;
    for (let depth = 0; cursor && depth < 100; depth++) {
      if (cursor === selfId) throw new BadRequestException('This would create a loop of parents.');
      const [next] = await tx
        .select({ parentId: terms.parentId })
        .from(terms)
        .where(eq(terms.id, cursor));
      cursor = next?.parentId ?? null;
    }
    return parentId;
  }

  private async uniqueSlug(
    tx: SiteTransaction,
    taxonomyId: string,
    locale: string,
    wanted: string,
    excludeId: string | null,
  ): Promise<string> {
    const base = slugify(wanted);
    if (!base) throw new ConflictException('The name must contain letters or digits.');
    const rows = await tx
      .select({ slug: terms.slug })
      .from(terms)
      .where(
        and(
          eq(terms.taxonomyId, taxonomyId),
          eq(terms.locale, locale),
          excludeId ? ne(terms.id, excludeId) : undefined,
        ),
      );
    return nextFreeSlug(base, new Set(rows.map((r) => r.slug)));
  }
}

export function taxonomyView(t: TaxonomyRow): TaxonomyView {
  return {
    slug: t.slug,
    name: t.name as Record<string, string>,
    hierarchical: t.hierarchical,
    contentTypes: t.contentTypes,
    source: t.source,
    fields: taxonomyFields(t),
    base: t.base,
  };
}

export function taxonomyFields(t: TaxonomyRow): FieldDefinition[] {
  return ((t.fieldsSchema as { fields?: FieldDefinition[] }).fields ?? []) as FieldDefinition[];
}

/** Values merged with new ones: groups (objects) one level down, the rest replaced. */
export function mergeFieldValues(
  current: Record<string, unknown>,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    const before = out[key];
    out[key] =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      before &&
      typeof before === 'object' &&
      !Array.isArray(before)
        ? { ...(before as Record<string, unknown>), ...(value as Record<string, unknown>) }
        : value;
  }
  return out;
}

function toView(term: TermRow, taxonomy: string, count: number): TermView {
  return {
    id: term.id,
    taxonomy,
    locale: term.locale,
    parentId: term.parentId,
    slug: term.slug,
    name: term.name,
    description: term.description,
    fields: term.fields as Record<string, unknown>,
    position: term.position,
    count,
  };
}
