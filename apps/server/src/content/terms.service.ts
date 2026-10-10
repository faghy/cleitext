import {
  entries,
  entryTerms,
  newId,
  siteLocales,
  sites,
  taxonomies,
  terms,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import type { TaxonomyView, TermView } from '@cleitext/shared';
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
import { PageCacheService } from '../public/page-cache.service.js';
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
  ) {}

  private run<T>(siteId: string, auth: AuthContext, fn: (tx: SiteTransaction) => Promise<T>) {
    return withContext(this.database.db, { siteId, userId: auth.userId }, fn);
  }

  listTaxonomies(siteId: string, auth: AuthContext): Promise<TaxonomyView[]> {
    return this.run(siteId, auth, async (tx) => {
      const rows = await tx.select().from(taxonomies).orderBy(asc(taxonomies.slug));
      return rows.map((t) => ({
        slug: t.slug,
        name: t.name as Record<string, string>,
        hierarchical: t.hierarchical,
        contentTypes: t.contentTypes,
      }));
    });
  }

  listTerms(
    siteId: string,
    auth: AuthContext,
    taxonomySlug: string,
    locale?: string,
  ): Promise<TermView[]> {
    return this.run(siteId, auth, async (tx) => {
      const taxonomy = await this.taxonomy(tx, taxonomySlug);
      const rows = await tx
        .select({
          term: terms,
          count: sql<number>`(select count(*)::int from ${entryTerms} where ${entryTerms.termId} = ${terms.id})`,
        })
        .from(terms)
        .where(
          and(eq(terms.taxonomyId, taxonomy.id), locale ? eq(terms.locale, locale) : undefined),
        )
        .orderBy(asc(terms.name));
      const groups = [...new Set(rows.map(({ term }) => term.translationGroup))];
      const siblings =
        groups.length > 0
          ? await tx
              .select({
                id: terms.id,
                locale: terms.locale,
                name: terms.name,
                group: terms.translationGroup,
              })
              .from(terms)
              .where(
                and(eq(terms.taxonomyId, taxonomy.id), inArray(terms.translationGroup, groups)),
              )
              .orderBy(asc(terms.locale))
          : [];
      return rows.map(({ term, count }) => ({
        ...toView(term, taxonomy.slug, count),
        translations: siblings
          .filter((s) => s.group === term.translationGroup && s.id !== term.id)
          .map(({ id, locale, name }) => ({ id, locale, name })),
      }));
    });
  }

  createTerm(
    siteId: string,
    auth: AuthContext,
    taxonomySlug: string,
    input: {
      name: string;
      slug?: string | undefined;
      parentId?: string | null | undefined;
      locale?: string | undefined;
      description?: string | undefined;
      translationOf?: string | undefined;
    },
  ): Promise<TermView> {
    return this.run(siteId, auth, async (tx) => {
      const taxonomy = await this.taxonomy(tx, taxonomySlug);
      this.assertCanCreate(auth, taxonomy);
      const locale = input.locale ?? (await this.defaultLocale(tx, siteId));
      const [enabled] = await tx.select().from(siteLocales).where(eq(siteLocales.code, locale));
      if (!enabled)
        throw new BadRequestException(`The language "${locale}" is not enabled on this site.`);
      let translationGroup: string | undefined;
      let parentId = input.parentId;
      if (input.translationOf) {
        const source = await this.term(tx, input.translationOf);
        if (source.taxonomyId !== taxonomy.id)
          throw new BadRequestException('A translation must belong to the same taxonomy.');
        await this.assertLocaleFree(tx, source.translationGroup, locale, null);
        translationGroup = source.translationGroup;
        // The parent follows the source's parent, when it is translated too.
        if (parentId === undefined && source.parentId) {
          parentId = (await this.translationIn(tx, source.parentId, locale))?.id ?? null;
        }
      }
      return toView(
        await this.insertTerm(tx, siteId, taxonomy, {
          ...input,
          parentId,
          locale,
          translationGroup,
        }),
        taxonomy.slug,
        0,
      );
    });
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
      translationOf?: string | null | undefined;
    },
  ): Promise<TermView> {
    const view = await this.run(siteId, auth, async (tx) => {
      if (!auth.capabilities.includes('manage_terms'))
        throw new ForbiddenException('You cannot manage terms.');
      const term = await this.term(tx, id);
      const [taxonomy] = await tx
        .select()
        .from(taxonomies)
        .where(eq(taxonomies.id, term.taxonomyId));
      const changes: Partial<TermRow> = {};
      if (input.name !== undefined) changes.name = input.name;
      if (input.description !== undefined) changes.description = input.description;
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
      if (input.translationOf === null) {
        changes.translationGroup = newId();
      } else if (input.translationOf !== undefined) {
        const other = await this.term(tx, input.translationOf);
        if (other.taxonomyId !== term.taxonomyId)
          throw new BadRequestException('A translation must belong to the same taxonomy.');
        await this.assertLocaleFree(tx, other.translationGroup, term.locale, term.id);
        changes.translationGroup = other.translationGroup;
      }
      const [updated] = await tx.update(terms).set(changes).where(eq(terms.id, id)).returning();
      return toView(updated!, taxonomy!.slug, 0);
    });
    // Term names and slugs appear on many pages: refresh the whole site.
    await this.cache.invalidate(siteId, ['site']);
    return view;
  }

  async deleteTerm(siteId: string, auth: AuthContext, id: string): Promise<void> {
    await this.run(siteId, auth, async (tx) => {
      if (!auth.capabilities.includes('manage_terms'))
        throw new ForbiddenException('You cannot manage terms.');
      const term = await this.term(tx, id);
      // Children move up to the deleted term's parent, as in WordPress.
      await tx.update(terms).set({ parentId: term.parentId }).where(eq(terms.parentId, id));
      await tx.delete(terms).where(eq(terms.id, id));
    });
    await this.cache.invalidate(siteId, ['site']);
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
      const taxonomy = await this.taxonomy(tx, taxonomySlug);
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
      translationGroup?: string | undefined;
    },
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
        translationGroup: input.translationGroup ?? newId(),
        parentId,
        slug: await this.uniqueSlug(tx, taxonomy.id, input.locale, input.slug ?? name, null),
        name,
        description: input.description ?? null,
      })
      .returning();
    return term!;
  }

  /** A translation group has at most one term per language. */
  private async assertLocaleFree(
    tx: SiteTransaction,
    group: string,
    locale: string,
    exceptId: string | null,
  ): Promise<void> {
    const [taken] = await tx
      .select({ id: terms.id })
      .from(terms)
      .where(
        and(
          eq(terms.translationGroup, group),
          eq(terms.locale, locale),
          exceptId ? ne(terms.id, exceptId) : undefined,
        ),
      );
    if (taken) throw new ConflictException('This term already has a translation in that language.');
  }

  /** The translation of a term in a language, if any. */
  private async translationIn(
    tx: SiteTransaction,
    id: string,
    locale: string,
  ): Promise<TermRow | undefined> {
    const source = await this.term(tx, id);
    const [found] = await tx
      .select()
      .from(terms)
      .where(and(eq(terms.translationGroup, source.translationGroup), eq(terms.locale, locale)));
    return found;
  }

  private async defaultLocale(tx: SiteTransaction, siteId: string): Promise<string> {
    const [site] = await tx
      .select({ locale: sites.defaultLocale })
      .from(sites)
      .where(eq(sites.id, siteId));
    return site?.locale ?? 'en';
  }

  private assertCanCreate(auth: AuthContext, taxonomy: TaxonomyRow): void {
    const allowed =
      auth.capabilities.includes('manage_terms') ||
      (!taxonomy.hierarchical && auth.capabilities.includes('edit_entries'));
    if (!allowed) throw new ForbiddenException(`You cannot add ${taxonomy.slug} terms.`);
  }

  private async taxonomy(tx: SiteTransaction, slug: string): Promise<TaxonomyRow> {
    const [taxonomy] = await tx.select().from(taxonomies).where(eq(taxonomies.slug, slug));
    if (!taxonomy) throw new NotFoundException(`Unknown taxonomy "${slug}".`);
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

function toView(term: TermRow, taxonomy: string, count: number): TermView {
  return {
    id: term.id,
    taxonomy,
    locale: term.locale,
    translationGroup: term.translationGroup,
    parentId: term.parentId,
    slug: term.slug,
    name: term.name,
    description: term.description,
    count,
  };
}
