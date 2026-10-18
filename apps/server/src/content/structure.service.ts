import {
  contentTypes,
  entries,
  newId,
  redirects,
  taxonomies,
  terms,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import type { ContentTypeView, FieldDefinition, TaxonomyView } from '@cleitext/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq, inArray, ne } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { entryPath, localePrefixes } from './paths.js';
import { permalinkShape } from './slug.js';
import { taxonomyView } from './terms.service.js';
import { LanguagesService } from './languages.service.js';

type TypeRow = typeof contentTypes.$inferSelect;

/** First path segments that belong to Cleitext itself. */
const RESERVED = new Set([
  'admin',
  'cl-admin',
  'admin-plugins',
  'plugin-assets',
  'api',
  'media',
  'health',
  'feed',
  'search',
  'page',
  '__preview',
  'robots.txt',
  'sitemap.xml',
]);
/** Default taxonomies: they can be edited, not deleted. */
const CORE_TAXONOMIES = new Set(['category', 'tag']);
/** Redirects made at most when a permalink changes. */
const MAX_REDIRECTS = 5_000;

/**
 * Content types and taxonomies made from the admin (RF-CNT-02, RF-TAX-02)
 * and permalink settings for every type (RF-SET-03).
 */
@Injectable()
export class StructureService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly audit: AuditService,
    private readonly cache: PageCacheService,
    private readonly languages: LanguagesService,
  ) {}

  private run<T>(siteId: string, auth: AuthContext, fn: (tx: SiteTransaction) => Promise<T>) {
    return withContext(this.database.db, { siteId, userId: auth.userId }, fn);
  }

  // ---- Content types --------------------------------------------------------------

  async createType(
    siteId: string,
    auth: AuthContext,
    input: {
      slug: string;
      name: Record<string, string>;
      hierarchical: boolean;
      supports: string[];
      permalink?: string | undefined;
      fields: FieldDefinition[];
    },
    ip: string,
  ): Promise<Pick<ContentTypeView, 'slug'>> {
    const permalink =
      input.permalink ?? (input.hierarchical ? `/${input.slug}/{path}` : `/${input.slug}/{slug}`);
    await this.run(siteId, auth, async (tx) => {
      const [taken] = await tx
        .select({ id: contentTypes.id })
        .from(contentTypes)
        .where(eq(contentTypes.slug, input.slug));
      if (taken) throw new ConflictException(`A content type "${input.slug}" already exists.`);
      await this.assertPermalink(tx, siteId, permalink, input.hierarchical, null);
      await tx.insert(contentTypes).values({
        id: newId(),
        siteId,
        slug: input.slug,
        name: input.name,
        source: 'user',
        hierarchical: input.hierarchical,
        supports: [...new Set(['title', 'revisions', ...input.supports])],
        fieldsSchema: { fields: input.fields },
        permalink,
      });
      await this.record(tx, siteId, auth, 'content_type.created', input.slug, ip);
    });
    await this.cache.invalidate(siteId, ['site']);
    return { slug: input.slug };
  }

  /**
   * Changes a type. Types of the core and of plugins only take a new
   * permalink; types made in the admin also change name, features and fields.
   * Published entries get 301 redirects from their old address.
   */
  async updateType(
    siteId: string,
    auth: AuthContext,
    slug: string,
    input: {
      name?: Record<string, string> | undefined;
      supports?: string[] | undefined;
      permalink?: string | undefined;
      fields?: FieldDefinition[] | undefined;
    },
    ip: string,
  ): Promise<{ redirects: number }> {
    const made = await this.run(siteId, auth, async (tx) => {
      const type = await this.type(tx, slug);
      const own = type.source === 'user';
      if (!own && (input.name || input.supports || input.fields)) {
        throw new BadRequestException(
          'Only the permalink of built-in and plugin content types can be changed.',
        );
      }
      const changes: Partial<TypeRow> = {};
      if (input.name) changes.name = input.name;
      if (input.supports)
        changes.supports = [...new Set(['title', 'revisions', ...input.supports])];
      if (input.fields) changes.fieldsSchema = { fields: input.fields };
      let made = 0;
      if (input.permalink !== undefined && input.permalink !== type.permalink) {
        await this.assertPermalink(tx, siteId, input.permalink, type.hierarchical, type.id);
        changes.permalink = input.permalink;
        made = await this.redirectEntries(tx, siteId, type, input.permalink);
      }
      if (Object.keys(changes).length > 0)
        await tx.update(contentTypes).set(changes).where(eq(contentTypes.id, type.id));
      await this.record(tx, siteId, auth, 'content_type.updated', slug, ip);
      return made;
    });
    await this.cache.invalidate(siteId, ['site']);
    return { redirects: made };
  }

  async deleteType(siteId: string, auth: AuthContext, slug: string, ip: string): Promise<void> {
    await this.run(siteId, auth, async (tx) => {
      const type = await this.type(tx, slug);
      if (type.source !== 'user') {
        throw new BadRequestException('Only content types made in the admin can be deleted.');
      }
      const [used] = await tx
        .select({ n: count() })
        .from(entries)
        .where(eq(entries.typeSlug, slug));
      if ((used?.n ?? 0) > 0) {
        throw new ConflictException('Delete its entries first (the trash included).');
      }
      await tx.delete(contentTypes).where(eq(contentTypes.id, type.id));
      // Taxonomies stop applying to the deleted type.
      const linked = await tx.select().from(taxonomies);
      for (const taxonomy of linked.filter((t) => t.contentTypes.includes(slug))) {
        await tx
          .update(taxonomies)
          .set({ contentTypes: taxonomy.contentTypes.filter((s) => s !== slug) })
          .where(eq(taxonomies.id, taxonomy.id));
      }
      await this.record(tx, siteId, auth, 'content_type.deleted', slug, ip);
    });
    await this.cache.invalidate(siteId, ['site']);
  }

  // ---- Taxonomies -----------------------------------------------------------------

  async createTaxonomy(
    siteId: string,
    auth: AuthContext,
    input: {
      slug: string;
      name: Record<string, string>;
      hierarchical: boolean;
      contentTypes: string[];
    },
    ip: string,
  ): Promise<TaxonomyView> {
    const view = await this.run(siteId, auth, async (tx) => {
      if (RESERVED.has(input.slug)) {
        throw new BadRequestException(`"${input.slug}" is reserved by Cleitext.`);
      }
      const [taken] = await tx
        .select({ id: taxonomies.id })
        .from(taxonomies)
        .where(eq(taxonomies.slug, input.slug));
      if (taken) throw new ConflictException(`A taxonomy "${input.slug}" already exists.`);
      const types = await this.knownTypes(tx, input.contentTypes);
      // A taxonomy's archives live at /{taxonomy}/…: no permalink may start there.
      const clash = (await tx.select().from(contentTypes)).find(
        (t) => firstLiteral(t.permalink) === input.slug,
      );
      if (clash) {
        throw new ConflictException(
          `The addresses of "${clash.slug}" start with /${input.slug}/: choose another identifier.`,
        );
      }
      await tx.insert(taxonomies).values({
        id: newId(),
        siteId,
        slug: input.slug,
        name: input.name,
        hierarchical: input.hierarchical,
        contentTypes: types,
      });
      await this.record(tx, siteId, auth, 'taxonomy.created', input.slug, ip);
      return {
        slug: input.slug,
        name: input.name,
        hierarchical: input.hierarchical,
        contentTypes: types,
        source: 'user',
        fields: [],
        base: null,
      };
    });
    await this.cache.invalidate(siteId, ['site']);
    return view;
  }

  async updateTaxonomy(
    siteId: string,
    auth: AuthContext,
    slug: string,
    input: {
      name?: Record<string, string> | undefined;
      contentTypes?: string[] | undefined;
      base?: string | null | undefined;
    },
    ip: string,
  ): Promise<TaxonomyView> {
    const view = await this.run(siteId, auth, async (tx) => {
      const taxonomy = await this.taxonomy(tx, slug);
      const changes: Partial<typeof taxonomies.$inferInsert> = {};
      if (input.name) changes.name = input.name;
      if (input.contentTypes) changes.contentTypes = await this.knownTypes(tx, input.contentTypes);
      // The first part of its archives' addresses; the old ones redirect.
      // Its own slug as base is the default (null).
      const base = input.base === undefined ? undefined : input.base === slug ? null : input.base;
      if (base !== undefined && base !== taxonomy.base) {
        if (taxonomy.source.startsWith('plugin:')) {
          throw new BadRequestException('The addresses of this taxonomy belong to its plugin.');
        }
        if (base) await this.assertTaxonomyBase(tx, siteId, base, taxonomy.id);
        changes.base = base;
        await this.redirectTerms(tx, siteId, taxonomy, base);
      }
      if (Object.keys(changes).length === 0) return taxonomyView(taxonomy);
      const [updated] = await tx
        .update(taxonomies)
        .set(changes)
        .where(eq(taxonomies.id, taxonomy.id))
        .returning();
      await this.record(tx, siteId, auth, 'taxonomy.updated', slug, ip);
      return taxonomyView(updated!);
    });
    await this.cache.invalidate(siteId, ['site']);
    return view;
  }

  async deleteTaxonomy(siteId: string, auth: AuthContext, slug: string, ip: string): Promise<void> {
    await this.run(siteId, auth, async (tx) => {
      if (CORE_TAXONOMIES.has(slug)) {
        throw new BadRequestException('Categories and tags cannot be deleted.');
      }
      const taxonomy = await this.taxonomy(tx, slug);
      if (taxonomy.source.startsWith('plugin:')) {
        throw new BadRequestException(
          'This taxonomy belongs to a plugin: it goes away with the plugin.',
        );
      }
      const [used] = await tx
        .select({ n: count() })
        .from(terms)
        .where(eq(terms.taxonomyId, taxonomy.id));
      if ((used?.n ?? 0) > 0) throw new ConflictException('Delete its terms first.');
      await tx.delete(taxonomies).where(eq(taxonomies.id, taxonomy.id));
      await this.record(tx, siteId, auth, 'taxonomy.deleted', slug, ip);
    });
    await this.cache.invalidate(siteId, ['site']);
  }

  // ---- Internals ----------------------------------------------------------------

  /**
   * A permalink (RF-SET-03): segments of letters, digits and dashes, or the
   * placeholders {year} and {month}, ending with {slug} — {path} for
   * hierarchical types, which includes the parents. It must not take a
   * reserved address or a taxonomy's; types sharing one must not share slugs.
   */
  private async assertPermalink(
    tx: SiteTransaction,
    siteId: string,
    permalink: string,
    hierarchical: boolean,
    selfId: string | null,
  ): Promise<void> {
    const segments = permalink.split('/');
    const last = hierarchical ? '{path}' : '{slug}';
    const valid =
      segments[0] === '' &&
      segments.length >= 2 &&
      segments.at(-1) === last &&
      segments
        .slice(1, -1)
        .every((s) => s === '{year}' || s === '{month}' || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s));
    if (!valid) {
      throw new BadRequestException(
        `The permalink must start with / and end with ${last}; the other parts may be words, {year} or {month}.`,
      );
    }
    const first = firstLiteral(permalink);
    if (first) {
      // Language prefixes (e.g. /en) belong to the language plugin.
      const prefixes = [...localePrefixes(await this.languages.localesIn(tx, siteId)).values()];
      const taxonomy = await tx
        .select({ slug: taxonomies.slug })
        .from(taxonomies)
        .where(eq(taxonomies.slug, first));
      if (RESERVED.has(first) || taxonomy.length > 0 || prefixes.includes(`/${first}`)) {
        throw new BadRequestException(`Addresses starting with /${first}/ are already used.`);
      }
    }
    // Types may share a kind of address (articles and pages at /{slug}): the
    // entry that exists answers, so no two entries may then have one address.
    const types = await tx.select().from(contentTypes);
    const self = types.find((t) => t.id === selfId);
    const sharing = types.filter(
      (t) => t.id !== selfId && permalinkShape(t.permalink) === permalinkShape(permalink),
    );
    if (self && sharing.length > 0) {
      const live = (slugs: string[]) =>
        tx
          .select({ slug: entries.slug, locale: entries.locale })
          .from(entries)
          .where(and(inArray(entries.typeSlug, slugs), ne(entries.status, 'trashed')));
      const theirs = new Set(
        (await live(sharing.map((t) => t.slug))).map((e) => `${e.locale}:${e.slug}`),
      );
      const clashes = [
        ...new Set(
          (await live([self.slug]))
            .filter((e) => theirs.has(`${e.locale}:${e.slug}`))
            .map((e) => e.slug),
        ),
      ];
      if (clashes.length > 0) {
        throw new ConflictException(
          `Entries of "${self.slug}" and of "${sharing.map((t) => t.slug).join('", "')}" would share these addresses: ${clashes
            .slice(0, 5)
            .join(', ')}${clashes.length > 5 ? '…' : ''}. Change their slugs first.`,
        );
      }
    }
  }

  /** 301 redirects from the old to the new address of published entries. */
  private async redirectEntries(
    tx: SiteTransaction,
    siteId: string,
    type: TypeRow,
    permalink: string,
  ): Promise<number> {
    const rows = await tx
      .select()
      .from(entries)
      .where(
        and(eq(entries.typeSlug, type.slug), inArray(entries.status, ['published', 'private'])),
      )
      .limit(MAX_REDIRECTS);
    const prefixes = localePrefixes(await this.languages.localesIn(tx, siteId));
    let made = 0;
    for (const entry of rows) {
      const prefix = prefixes.get(entry.locale) ?? '';
      const from = prefix + (await entryPath(tx, entry, type.permalink));
      const to = prefix + (await entryPath(tx, entry, permalink));
      if (from === to) continue;
      await tx.delete(redirects).where(eq(redirects.fromPath, to));
      await tx
        .insert(redirects)
        .values({ siteId, fromPath: from, toPath: to, status: 301 })
        .onConflictDoUpdate({
          target: [redirects.siteId, redirects.fromPath],
          set: { toPath: to },
        });
      await tx.update(redirects).set({ toPath: to }).where(eq(redirects.toPath, from));
      made++;
    }
    return made;
  }

  /** A taxonomy's own first part of addresses: free, not reserved, not a type's. */
  private async assertTaxonomyBase(
    tx: SiteTransaction,
    siteId: string,
    base: string,
    selfId: string,
  ): Promise<void> {
    const prefixes = [...localePrefixes(await this.languages.localesIn(tx, siteId)).values()];
    const others = await tx.select().from(taxonomies);
    const types = await tx.select({ permalink: contentTypes.permalink }).from(contentTypes);
    if (
      RESERVED.has(base) ||
      prefixes.includes(`/${base}`) ||
      others.some((t) => t.id !== selfId && (t.base ?? t.slug) === base) ||
      types.some((t) => firstLiteral(t.permalink) === base)
    ) {
      throw new ConflictException(`Addresses starting with /${base}/ are already used.`);
    }
  }

  /** 301 redirects from the old to the new addresses of a taxonomy's archives. */
  private async redirectTerms(
    tx: SiteTransaction,
    siteId: string,
    taxonomy: typeof taxonomies.$inferSelect,
    base: string | null,
  ): Promise<void> {
    const rows = await tx
      .select({ slug: terms.slug, locale: terms.locale })
      .from(terms)
      .where(eq(terms.taxonomyId, taxonomy.id))
      .limit(MAX_REDIRECTS);
    const prefixes = localePrefixes(await this.languages.localesIn(tx, siteId));
    const path = (b: string, slug: string) => (b ? `/${b}/${slug}` : `/${slug}`);
    for (const term of rows) {
      const prefix = prefixes.get(term.locale) ?? '';
      const from = prefix + path(taxonomy.base ?? taxonomy.slug, term.slug);
      const to = prefix + path(base ?? taxonomy.slug, term.slug);
      if (from === to) continue;
      await tx.delete(redirects).where(eq(redirects.fromPath, to));
      await tx
        .insert(redirects)
        .values({ siteId, fromPath: from, toPath: to, status: 301 })
        .onConflictDoUpdate({
          target: [redirects.siteId, redirects.fromPath],
          set: { toPath: to },
        });
      await tx.update(redirects).set({ toPath: to }).where(eq(redirects.toPath, from));
    }
  }

  private async knownTypes(tx: SiteTransaction, slugs: string[]): Promise<string[]> {
    const unique = [...new Set(slugs)];
    if (unique.length === 0) return [];
    const found = await tx
      .select({ slug: contentTypes.slug })
      .from(contentTypes)
      .where(inArray(contentTypes.slug, unique));
    if (found.length !== unique.length) {
      throw new BadRequestException('Some content types do not exist.');
    }
    return unique;
  }

  private async type(tx: SiteTransaction, slug: string): Promise<TypeRow> {
    const [type] = await tx.select().from(contentTypes).where(eq(contentTypes.slug, slug));
    if (!type) throw new NotFoundException(`Unknown content type "${slug}".`);
    return type;
  }

  private async taxonomy(tx: SiteTransaction, slug: string) {
    const [taxonomy] = await tx.select().from(taxonomies).where(eq(taxonomies.slug, slug));
    if (!taxonomy) throw new NotFoundException(`Unknown taxonomy "${slug}".`);
    return taxonomy;
  }

  private record(
    tx: SiteTransaction,
    siteId: string,
    auth: AuthContext,
    action: string,
    target: string,
    ip: string,
  ) {
    if (!auth.userId) throw new ForbiddenException();
    return this.audit.record(tx, {
      siteId,
      userId: auth.userId,
      action,
      targetType: action.split('.')[0]!,
      targetId: target,
      ip,
    });
  }
}

/** The first fixed part of a permalink (`/events/{slug}` → `events`). */
function firstLiteral(permalink: string): string | null {
  const first = permalink.split('/')[1] ?? '';
  return first && !first.startsWith('{') ? first : null;
}

/** Two permalinks with the same shape would match the same addresses. */
