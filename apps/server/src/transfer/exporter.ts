import type { CxdDocument } from '@cleitext/blocks';
import { allAdditionalCss } from '../themes/additional-css.js';
import {
  comments,
  contentTypes,
  entries,
  entryTerms,
  fieldGroups,
  media,
  menuItems,
  menus,
  optionsPages,
  optionValues,
  redirects,
  revisions,
  roles,
  settings,
  siteMembers,
  taxonomies,
  terms,
  userFields,
  users,
  withContext,
  type Database,
} from '@cleitext/db';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { ContentLocale, TranslatableKind, TranslationLink } from '@cleitext/plugin-sdk';
import { exportFieldValues, type FieldDefinition, type FieldValues } from '@cleitext/shared';
import type { TransferDocumentInput, TransferMenuItem } from './model.js';

const CORE_TYPES = new Set(['page', 'article']);

/** What the language plugin knows, through LanguagesService (omitted without one). */
export interface ExportLanguages {
  locales: ContentLocale[];
  translations(kind: TranslatableKind, ids: string[]): Promise<Map<string, TranslationLink[]>>;
}

/** The definitions of an object's fields: its own (top level) and its groups'. */
export interface FieldSet {
  own: readonly FieldDefinition[];
  groups: readonly { id: string; fields: readonly FieldDefinition[] }[];
}

/**
 * Field definitions, so that values referring to media, entries, terms and
 * users are exported as refs (plugin API 1.47). Without them values are
 * exported as they are.
 */
export interface ExportFieldDefinitions {
  entry(type: string): FieldSet;
  term(taxonomy: string): FieldSet;
  user: FieldSet;
}

/** Field values with their references written as refs (`{ $media: id }`…). */
export function exportFields(set: FieldSet | undefined, values: FieldValues): FieldValues {
  if (!set) return values;
  const out = exportFieldValues(set.own, values);
  for (const group of set.groups) {
    const nested = values[group.id];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      out[group.id] = exportFieldValues(group.fields, nested as FieldValues);
    }
  }
  return out;
}

/** The own fields of a type or taxonomy (`fields_schema`). */
function ownFields(schema: unknown): Record<string, unknown>[] {
  const fields = (schema as { fields?: unknown } | null)?.fields;
  return Array.isArray(fields) ? (fields as Record<string, unknown>[]) : [];
}

export interface ExportResult {
  document: TransferDocumentInput;
  /** Media files to add to the archive: archive path → storage key. */
  files: Map<string, string>;
}

/**
 * Full export of a site in Cleitext format (RF-IMP-03): structure, users
 * (without passwords), terms, media, entries with their public or latest
 * version, menus, redirects and settings.
 */
export async function exportSite(
  db: Database,
  siteId: string,
  source: { name?: string; url?: string } = {},
  languages?: ExportLanguages,
  /** The plugins' own data (`export.pluginData`, plugin API 1.46), by plugin slug. */
  plugins: Record<string, unknown> = {},
  /** Field definitions (plugin API 1.47), for references in field values. */
  fieldDefinitions?: ExportFieldDefinitions,
  /**
   * The options pages' values with their references as refs (plugin API
   * 1.48, `OptionsPagesService.exportValues`); as stored when omitted.
   */
  optionValuesWithRefs?: { page: string; locale?: string; fields: FieldValues }[],
): Promise<ExportResult> {
  return withContext(db, { siteId }, async (tx) => {
    const files = new Map<string, string>();
    const locales = languages && languages.locales.length > 1 ? languages.locales : [];
    const members = await tx
      .select({ user: users, role: roles.slug })
      .from(siteMembers)
      .innerJoin(users, eq(users.id, siteMembers.userId))
      .innerJoin(roles, eq(roles.id, siteMembers.roleId))
      .where(eq(siteMembers.siteId, siteId));
    const typeRows = await tx.select().from(contentTypes);
    const userValues = new Map(
      (await tx.select().from(userFields)).map((r) => [r.userId, r.fields as FieldValues]),
    );
    const taxonomyRows = await tx.select().from(taxonomies);
    const taxonomySlug = new Map(taxonomyRows.map((t) => [t.id, t.slug]));
    const termRows = await tx.select().from(terms);
    const mediaRows = await tx.select().from(media).orderBy(asc(media.createdAt));
    const entryRows = await tx
      .select()
      .from(entries)
      .where(ne(entries.status, 'trashed'))
      .orderBy(asc(entries.createdAt));
    const revisionRows = await tx.select().from(revisions);
    const commentRows = await tx
      .select()
      .from(comments)
      .where(ne(comments.status, 'trash'))
      .orderBy(asc(comments.createdAt));
    const commentsOf = new Map<string, (typeof commentRows)[number][]>();
    for (const c of commentRows)
      (commentsOf.get(c.entryId) ?? commentsOf.set(c.entryId, []).get(c.entryId)!).push(c);
    const revisionById = new Map(revisionRows.map((r) => [r.id, r]));
    const entryTermRows = await tx.select().from(entryTerms).orderBy(asc(entryTerms.position));
    const termById = new Map(termRows.map((t) => [t.id, t]));
    const settingRows = await tx.select().from(settings).where(eq(settings.namespace, 'core'));
    // Additional CSS of Customize (core 0.79): it belongs to the site, not to a theme.
    const additionalCss = await allAdditionalCss(tx);
    const setting = (key: string) => settingRows.find((s) => s.key === key)?.value;
    const pageRef = (id: unknown) =>
      typeof id === 'string' && entryRows.some((e) => e.id === id) ? id : undefined;
    // Translations: items of a group share the ref of its first member.
    const groupRefs = async (kind: TranslatableKind, ids: string[]) => {
      const refs = new Map<string, string>();
      if (locales.length === 0) return refs;
      for (const [id, links] of await languages!.translations(kind, ids)) {
        if (links.length > 0) refs.set(id, [id, ...links.map((l) => l.id)].sort()[0]!);
      }
      return refs;
    };
    const entryGroups = await groupRefs(
      'entry',
      entryRows.map((e) => e.id),
    );
    const termGroups = await groupRefs(
      'term',
      termRows.map((t) => t.id),
    );

    for (const row of mediaRows) files.set(`media/${row.id}/${row.filename}`, row.storageKey);

    const menuRows = await tx.select().from(menus);
    const itemRows = await tx.select().from(menuItems).orderBy(asc(menuItems.position));
    const tree = (menuId: string, parentId: string | null): TransferMenuItem[] =>
      itemRows
        .filter((i) => i.menuId === menuId && i.parentId === parentId)
        .map((i) => ({
          kind: i.kind as TransferMenuItem['kind'],
          ...(i.entryId ? { entryRef: i.entryId } : {}),
          ...(i.termId ? { termRef: i.termId } : {}),
          ...(i.url ? { url: i.url } : {}),
          label: i.label,
          target: i.target === '_blank' ? '_blank' : null,
          children: tree(menuId, i.id),
        }));

    const document: TransferDocumentInput = {
      format: 'cleitext-transfer',
      version: 1,
      source: { kind: 'cleitext', exportedAt: new Date().toISOString(), ...source },
      site: {
        ...(typeof setting('title') === 'string' ? { title: setting('title') as string } : {}),
        ...(typeof setting('tagline') === 'string'
          ? { tagline: setting('tagline') as string }
          : {}),
        ...(typeof setting('postsPerPage') === 'number'
          ? { postsPerPage: setting('postsPerPage') as number }
          : {}),
        ...(typeof setting('dateFormat') === 'string' && setting('dateFormat')
          ? { dateFormat: setting('dateFormat') as string }
          : {}),
        ...(pageRef(setting('frontPage')) ? { frontPageRef: pageRef(setting('frontPage'))! } : {}),
        ...(pageRef(setting('postsPage')) ? { postsPageRef: pageRef(setting('postsPage'))! } : {}),
        ...(additionalCss.site || additionalCss.themes ? { additionalCss } : {}),
      },
      locales: locales.map((l) => ({
        code: l.code,
        name: l.name,
        isDefault: l.isDefault,
        urlPrefix: l.isDefault ? null : l.prefix,
      })),
      users: members.map((m) => {
        const values = userValues.get(m.user.id);
        return {
          ref: m.user.id,
          email: m.user.email,
          ...(m.user.username ? { username: m.user.username } : {}),
          displayName: m.user.displayName,
          role: m.role,
          locale: m.user.locale,
          ...(values && Object.keys(values).length > 0
            ? { fields: exportFields(fieldDefinitions?.user, values) }
            : {}),
        };
      }),
      contentTypes: typeRows
        .filter((t) => !CORE_TYPES.has(t.slug))
        .map((t) => ({
          slug: t.slug,
          name: t.name as Record<string, string>,
          hierarchical: t.hierarchical,
          permalink: t.permalink,
          // Fields made in Content structure (plugin API 1.48); plugins' types bring theirs.
          ...(t.source === 'user' && ownFields(t.fieldsSchema).length > 0
            ? { fields: ownFields(t.fieldsSchema) }
            : {}),
        })),
      taxonomies: taxonomyRows.map((t) => ({
        slug: t.slug,
        name: t.name as Record<string, string>,
        hierarchical: t.hierarchical,
        contentTypes: t.contentTypes,
        ...(t.source === 'user' && ownFields(t.fieldsSchema).length > 0
          ? { fields: ownFields(t.fieldsSchema) }
          : {}),
      })),
      // Field groups and options pages of the site's owners, and every
      // options page's values (plugin API 1.48).
      fieldGroups: (await tx.select().from(fieldGroups).orderBy(asc(fieldGroups.key))).map(
        (g) => g.definition as Record<string, unknown>,
      ),
      optionsPages: (await tx.select().from(optionsPages).orderBy(asc(optionsPages.slug))).map(
        (p) => p.definition as Record<string, unknown>,
      ),
      options:
        optionValuesWithRefs ??
        (await tx.select().from(optionValues)).map((row) => ({
          page: row.page,
          ...(row.locale ? { locale: row.locale } : {}),
          fields: row.fields as FieldValues,
        })),
      terms: termRows.map((t) => ({
        ref: t.id,
        taxonomy: taxonomySlug.get(t.taxonomyId)!,
        locale: t.locale,
        ...(termGroups.has(t.id) ? { translationRef: termGroups.get(t.id)! } : {}),
        ...(t.parentId ? { parentRef: t.parentId } : {}),
        slug: t.slug,
        name: t.name,
        description: t.description,
        ...(Object.keys(t.fields as object).length > 0
          ? {
              fields: exportFields(
                fieldDefinitions?.term(taxonomySlug.get(t.taxonomyId)!),
                t.fields as Record<string, unknown>,
              ),
            }
          : {}),
        ...(t.position ? { position: t.position } : {}),
      })),
      media: mediaRows.map((m) => ({
        ref: m.id,
        file: `media/${m.id}/${m.filename}`,
        filename: m.filename,
        alt: m.alt as Record<string, string>,
        caption: m.caption as Record<string, string>,
        date: m.createdAt.toISOString(),
      })),
      entries: entryRows.flatMap((e) => {
        // The public version of published entries, the latest one otherwise.
        const revision = revisionById.get(e.publishedRevisionId ?? e.currentRevisionId ?? '');
        if (!revision) return [];
        const termsOf: Record<string, string[]> = {};
        for (const link of entryTermRows.filter((t) => t.entryId === e.id)) {
          const term = termById.get(link.termId);
          const slug = term && taxonomySlug.get(term.taxonomyId);
          if (slug) (termsOf[slug] ??= []).push(link.termId);
        }
        return [
          {
            ref: e.id,
            type: e.typeSlug,
            locale: e.locale,
            ...(entryGroups.has(e.id) ? { translationRef: entryGroups.get(e.id)! } : {}),
            ...(e.parentId ? { parentRef: e.parentId } : {}),
            slug: e.slug,
            title: revision.title,
            status: e.status as 'draft' | 'pending' | 'scheduled' | 'published' | 'private',
            ...(e.authorId ? { authorRef: e.authorId } : {}),
            publishedAt: e.publishedAt?.toISOString() ?? null,
            scheduledAt: e.scheduledAt?.toISOString() ?? null,
            createdAt: e.createdAt.toISOString(),
            position: e.position,
            fields: exportFields(
              fieldDefinitions?.entry(e.typeSlug),
              revision.fields as Record<string, unknown>,
            ),
            ...(e.template ? { template: e.template } : {}),
            document: revision.document as CxdDocument,
            ...(revision.featuredMediaId ? { featuredMediaRef: revision.featuredMediaId } : {}),
            terms: termsOf,
            commentStatus: e.commentStatus === 'open' ? ('open' as const) : ('closed' as const),
            ...(commentsOf.has(e.id)
              ? {
                  comments: commentsOf.get(e.id)!.map((c) => ({
                    ref: c.id,
                    ...(c.parentId ? { parentRef: c.parentId } : {}),
                    ...(c.userId ? { userRef: c.userId } : {}),
                    authorName: c.authorName,
                    authorEmail: c.authorEmail,
                    authorUrl: c.authorUrl,
                    content: c.content,
                    status: c.status as 'pending' | 'approved' | 'spam',
                    createdAt: c.createdAt.toISOString(),
                  })),
                }
              : {}),
          },
        ];
      }),
      menus: menuRows.map((m) => ({
        name: m.name,
        locale: m.locale,
        location: m.location,
        items: tree(m.id, null),
      })),
      redirects: (
        await tx
          .select()
          .from(redirects)
          .where(and(ne(redirects.status, 302)))
      ).map((r) => ({
        from: r.fromPath,
        to: r.toPath,
        status: r.status as 301 | 410,
      })),
      ...(Object.keys(plugins).length > 0 ? { plugins } : {}),
    };
    return { document, files };
  });
}
