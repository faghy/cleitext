import { newCommentStatus } from '../community/defaults.js';
import {
  allAdditionalCss,
  mergeAdditionalCss,
  SITE_CSS_KEY,
  themeCssKey,
  writeAdditionalCss,
} from '../themes/additional-css.js';
import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import { documentText, newBlockId } from '@cleitext/blocks';
import { IMPORTED_BLOCK } from '@cleitext/blocks/html';
import { isIP } from 'node:net';
import {
  auditLog,
  comments,
  contentTypes,
  entries,
  entryTerms,
  fieldGroups,
  importRefs,
  optionsPages,
  optionValues,
  menuItems,
  menus,
  newId,
  redirects,
  revisions,
  roles,
  settings,
  siteMembers,
  sites,
  superAdmins,
  taxonomies,
  terms,
  userFields,
  users,
  findLogin,
  withContext,
  type Database,
  type SiteTransaction,
} from '@cleitext/db';
import {
  CAPABILITIES,
  effectiveCapabilities,
  additionalCssProblem,
  balanceCss,
  ADDITIONAL_CSS_MAX,
  fieldGroupSchema,
  fieldListSchema,
  importFieldRefs,
  optionsPageSchema,
  sourceUrlPaths,
  type FieldDefinition,
  type FieldGroupInput,
  type ImportRefMaps,
} from '@cleitext/shared';
import { and, count as countRows, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { AuthContext } from '../common/request-context.js';
import { localePrefixes } from '../content/paths.js';
import { nextFreeSlug, permalinkShape, SLUG_MAX, slugify } from '../content/slug.js';
import {
  assertPermalink,
  assertTaxonomyBase,
  redirectEntries,
  redirectTerms,
} from '../content/structure.service.js';
import type { MediaService } from '../media/media.service.js';
import { uploadsFolderDate } from '../media/storage-names.js';
import { RESERVED_IDS } from '../fields/field-groups.service.js';
import type { PageCacheService } from '../public/page-cache.service.js';
import { loadSiteData } from '../public/site-data.js';
import { storedThemeSettings, themeNamespace } from '../public/theme-data.js';
import { themeFor } from '../public/themes.js';
import { addressKey, isSlashOnlyRedirect } from '../public/urls.js';
import { defaultLocaleIn, PENDING } from '../content/languages.service.js';
import type {
  ContentLocale,
  ImportIdMap,
  ImportPluginDataResult,
  ImportProgress,
  PendingLanguages,
} from '@cleitext/plugin-sdk';
import {
  count,
  emptyReport,
  resolveEntryRefs,
  transferDocumentSchema,
  type ImportReport,
  type TransferComment,
  type TransferDocument,
  type TransferEntry,
  type TransferMenuItem,
} from './model.js';
import {
  mediaByUrl,
  mediaTextRewriter,
  mediaUrlKey,
  type MediaTarget,
  type MediaTextRewriter,
} from './media-urls.js';

export interface ImportOptions {
  /** Owner connection: imports create users and write every table of the site. */
  db: Database;
  siteId: string;
  /** Existing user recorded as author of the import (a super admin). */
  asUserId: string;
  media: MediaService;
  cache: PageCacheService;
  /** Reads the bytes of a media file (archive path, local file or URL). */
  readFile(file: string): Promise<Buffer>;
  /** Plugins active on the site (to compute addresses). */
  activePlugins?: ReadonlySet<string>;
  /** The site's languages (LanguagesService); only the default one when omitted. */
  locales?: ContentLocale[];
  /**
   * Called when languages or translations were handed over to a language
   * plugin (`ctx.languages.pending`), so that an active one takes them now.
   */
  onLanguagesPending?(): Promise<void>;
  /** A message now and then (`Media 26/250`). */
  onProgress?(message: string): void;
  /** The counts so far, after every media file and entry (core 0.82). */
  onCounts?(progress: ImportProgress): void;
  /**
   * Stops the import between two records (core 0.82): it rejects with the
   * signal's reason; what was imported so far is kept.
   */
  signal?: AbortSignal;
  /**
   * Blocks of other WordPress plugins (`core/imported` placeholders): their
   * replacement by an active plugin (the `import.block` filter), or null to
   * keep their content.
   */
  importBlock?(block: {
    name: string;
    attrs: Record<string, unknown>;
    html: string;
    children: CxdBlock[];
  }): Promise<CxdBlock[] | null>;
  /**
   * Shortcodes standing alone (`core/imported` placeholders with a
   * `shortcode`): their replacement by an active plugin (the
   * `import.shortcode` filter), or null to keep their text.
   */
  importShortcode?(shortcode: {
    tag: string;
    attrs: Record<string, string>;
    content: string | null;
    text: string;
  }): Promise<CxdBlock[] | null>;
  /**
   * Cleans each document before it is written (raw HTML of users without
   * `unfiltered_html`), after the blocks of other plugins were converted.
   */
  sanitize?(document: CxdDocument): CxdDocument;
  /**
   * The data of `document.plugins` for one plugin, given to the active
   * plugins (the `import.pluginData` filter): their result, or null when no
   * plugin took it.
   */
  importPluginData?(input: {
    slug: string;
    data: unknown;
    idMap: ImportIdMap;
  }): Promise<ImportPluginDataResult | null>;
}

/** The built-in roles, from the least to the most powerful. */
const ROLE_RANK = ['subscriber', 'contributor', 'author', 'editor', 'administrator'];

/**
 * Whether a role is above another: by rank for the built-in ones, else when
 * it grants every capability of the other and more.
 */
export function outranks(
  next: { slug: string; capabilities: string[] },
  current: { slug: string; capabilities: string[] },
): boolean {
  const a = ROLE_RANK.indexOf(next.slug);
  const b = ROLE_RANK.indexOf(current.slug);
  if (a >= 0 && b >= 0) return a > b;
  const give = effectiveCapabilities(next.capabilities, false);
  const have = effectiveCapabilities(current.capabilities, false);
  return give.length > have.length && have.every((c) => give.includes(c));
}

/**
 * Writes a transfer document into a site (RF-IMP-01…04). Records get new
 * ids; existing locales, types, taxonomies, terms and users are reused.
 * One failing record is reported and skipped, the rest goes on.
 */
export async function importDocument(
  input: unknown,
  options: ImportOptions,
): Promise<ImportReport> {
  const report = emptyReport();
  const parsed = transferDocumentSchema.safeParse(input);
  if (!parsed.success) {
    report.errors.push(
      ...parsed.error.issues
        .slice(0, 20)
        .map((i) => `Invalid document at ${i.path.join('.') || 'root'}: ${i.message}`),
    );
    return report;
  }
  const doc = parsed.data;
  const { db, siteId } = options;
  const progress = options.onProgress ?? (() => {});
  const counts: ImportProgress = {
    phase: 'structure',
    done: 0,
    total: 0,
    media: { done: 0, total: doc.media.length },
    entries: { done: 0, total: doc.entries.length },
  };
  const tick = (phase: ImportProgress['phase'], done: number, total: number) => {
    counts.phase = phase;
    counts.done = done;
    counts.total = total;
    if (phase === 'media') counts.media = { done, total };
    if (phase === 'entries') counts.entries = { done, total };
    options.onCounts?.({ ...counts, media: { ...counts.media }, entries: { ...counts.entries } });
  };
  const stopIfCancelled = () => options.signal?.throwIfAborted();
  /**
   * Records of earlier imports of the same source, recognised by their ref
   * (core 0.82); null for a document that does not say where it comes from.
   */
  const source = importSource(doc);
  tick('structure', 0, 0);
  await resolveImportedBlocks(doc.entries, options, report);
  stopIfCancelled();
  if (options.sanitize) {
    for (const entry of doc.entries) entry.document = options.sanitize(entry.document);
  }
  const run = <T>(fn: (tx: SiteTransaction) => Promise<T>) =>
    withContext(db, { siteId, userId: options.asUserId }, fn);

  // Languages and translation links, for a language plugin.
  const pending: PendingLanguages = {
    locales: doc.locales.map((l, position) => ({
      code: l.code,
      name: l.name,
      isDefault: l.isDefault ?? false,
      position,
      urlPrefix: l.urlPrefix ?? null,
    })),
    entries: [],
    terms: [],
  };

  // ---- Structure -------------------------------------------------------------------
  /** Field groups created by this import, whose rules may name imported records. */
  const importedGroups: string[] = [];
  await run(async (tx) => {
    // Languages are a language plugin's: they wait for one (see the end).
    for (let i = 0; i < doc.locales.length; i++) count(report, 'locales');
    const types = new Set((await tx.select().from(contentTypes)).map((t) => t.slug));
    for (const type of doc.contentTypes) {
      if (types.has(type.slug)) continue;
      const fields = definitionsOf(type.fields, `Content type "${type.slug}"`, report);
      await tx.insert(contentTypes).values({
        siteId,
        slug: type.slug,
        name: type.name,
        source: 'user',
        hierarchical: type.hierarchical,
        permalink: type.permalink,
        ...(fields ? { fieldsSchema: { fields } } : {}),
      });
      count(report, 'contentTypes');
    }
    const taxonomySlugs = new Set((await tx.select().from(taxonomies)).map((t) => t.slug));
    for (const { fields: own, ...taxonomy } of doc.taxonomies) {
      if (taxonomySlugs.has(taxonomy.slug)) continue;
      const fields = definitionsOf(own, `Taxonomy "${taxonomy.slug}"`, report);
      await tx
        .insert(taxonomies)
        .values({ siteId, ...taxonomy, ...(fields ? { fieldsSchema: { fields } } : {}) });
      count(report, 'taxonomies');
    }
    // Field groups and options pages of the site's owners (plugin API 1.48),
    // before the values that use them; those already on the site are kept.
    const groupKeys = new Set((await tx.select().from(fieldGroups)).map((g) => g.key));
    for (const input of doc.fieldGroups) {
      const parsed = fieldGroupSchema.safeParse(input);
      if (!parsed.success) {
        report.warnings.push(
          `Field group "${String(input.id)}" not imported: ${parsed.error.issues[0]?.path.join('.') ?? ''} ${parsed.error.issues[0]?.message ?? ''}`.trim(),
        );
        continue;
      }
      if (RESERVED_IDS.has(parsed.data.id)) {
        report.warnings.push(`Field group "${parsed.data.id}" not imported: its id is reserved.`);
        continue;
      }
      if (groupKeys.has(parsed.data.id)) {
        count(report, 'fieldGroups', 'skipped');
        continue;
      }
      groupKeys.add(parsed.data.id);
      await tx.insert(fieldGroups).values({ siteId, key: parsed.data.id, definition: parsed.data });
      importedGroups.push(parsed.data.id);
      count(report, 'fieldGroups');
    }
    const pageSlugs = new Set((await tx.select().from(optionsPages)).map((p) => p.slug));
    for (const input of doc.optionsPages) {
      const parsed = optionsPageSchema.safeParse(input);
      if (!parsed.success) {
        report.warnings.push(
          `Options page "${String(input.slug)}" not imported: ${parsed.error.issues[0]?.path.join('.') ?? ''} ${parsed.error.issues[0]?.message ?? ''}`.trim(),
        );
        continue;
      }
      if (pageSlugs.has(parsed.data.slug)) {
        count(report, 'optionsPages', 'skipped');
        continue;
      }
      pageSlugs.add(parsed.data.slug);
      await tx
        .insert(optionsPages)
        .values({ siteId, slug: parsed.data.slug, definition: parsed.data });
      count(report, 'optionsPages');
    }
  });

  // ---- Permalinks of the source (plugin API 1.55) -----------------------------------
  if (doc.permalinks) {
    const permalinks = doc.permalinks;
    await run((tx) =>
      applyPermalinks(tx, siteId, permalinks, localePrefixes(options.locales ?? []), report),
    );
  }

  // ---- Users -----------------------------------------------------------------------
  const userIds = new Map<string, string>();
  // Accounts of other sites are not visible under RLS: looked up by email,
  // before the transaction (the lookup takes a connection of its own).
  const existing = new Map<string, string | undefined>();
  for (const user of doc.users) {
    const email = user.email.trim().toLowerCase();
    if (!existing.has(email)) existing.set(email, (await findLogin(db, email))?.userId);
  }
  await run(async (tx) => {
    const roleRows = await tx.select().from(roles);
    let created = 0;
    for (const user of doc.users) {
      const email = user.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        report.warnings.push(`User "${user.displayName}" skipped: invalid email "${user.email}".`);
        continue;
      }
      // Inserted without RETURNING: a new user is not a member yet.
      let userId = existing.get(email);
      if (!userId) {
        userId = newId();
        await tx.insert(users).values({
          id: userId,
          email,
          displayName: user.displayName || email,
          passwordHash: null,
          locale: user.locale ?? 'en',
        });
        existing.set(email, userId);
        created++;
        count(report, 'users');
      } else {
        count(report, 'users', 'skipped');
      }
      userIds.set(user.ref, userId);
      const role =
        roleRows.find((r) => r.slug === user.role && r.siteId === siteId) ??
        roleRows.find((r) => r.slug === (user.role ?? 'subscriber') && r.siteId === null);
      if (role) {
        const added = await tx
          .insert(siteMembers)
          .values({ siteId, userId, roleId: role.id })
          .onConflictDoNothing()
          .returning({ userId: siteMembers.userId });
        if (added.length === 0) {
          // Already a member: a higher role from the import raises theirs, never lowers it.
          const [member] = await tx
            .select({ role: roles })
            .from(siteMembers)
            .innerJoin(roles, eq(roles.id, siteMembers.roleId))
            .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, userId)));
          if (member && member.role.id !== role.id && outranks(role, member.role)) {
            await tx
              .update(siteMembers)
              .set({ roleId: role.id })
              .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, userId)));
            await tx.insert(auditLog).values({
              siteId,
              userId: options.asUserId,
              action: 'member.role.changed',
              targetType: 'user',
              targetId: userId,
              meta: { from: member.role.slug, to: role.slug, via: 'import' },
              ip: null,
            });
            count(report, 'roleUpgrades');
            report.warnings.push(
              `${email}: role on this site raised from ${member.role.slug} to ${role.slug}.`,
            );
          }
        }
      } else {
        report.warnings.push(`Unknown role "${user.role}" for ${email}: not added to the site.`);
      }
    }
    if (created) {
      report.warnings.push(
        `${created} user(s) were created without a password: they sign in after "Forgot password".`,
      );
    }
  });
  // People named in field values but not imported (plugin API 1.49): a ref
  // `user:<email>` points to the account with that email, when there is one.
  {
    const named = new Set<string>();
    const values = [
      ...doc.entries.map((e) => e.fields),
      ...doc.terms.map((t) => t.fields),
      ...doc.users.map((u) => u.fields),
      ...doc.options.map((o) => o.fields),
    ];
    for (const value of values) collectUserRefs(value, named);
    for (const ref of named) {
      if (userIds.has(ref)) continue;
      const email = ref
        .replace(/^user:/, '')
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      const found = existing.get(email) ?? (await findLogin(db, email))?.userId;
      if (found) userIds.set(ref, found);
    }
  }

  // ---- Terms -----------------------------------------------------------------------
  const termIds = new Map<string, string>();
  await run(async (tx) => {
    const taxonomyRows = await tx.select().from(taxonomies);
    for (const term of orderByParent(doc.terms)) {
      const taxonomy = taxonomyRows.find((t) => t.slug === term.taxonomy);
      if (!taxonomy) {
        report.errors.push(`Term "${term.name}": unknown taxonomy "${term.taxonomy}".`);
        continue;
      }
      const slug = slugify(term.slug, SLUG_MAX) || slugify(term.name) || 'term';
      // Imports before core 0.82 cut slugs at 80 characters.
      const short = slugify(term.slug) || slug;
      const [existing] = await tx
        .select()
        .from(terms)
        .where(
          and(
            eq(terms.taxonomyId, taxonomy.id),
            eq(terms.locale, term.locale),
            inArray(terms.slug, [...new Set([slug, short])]),
          ),
        );
      if (existing) {
        termIds.set(term.ref, existing.id);
        count(report, 'terms', 'skipped');
        continue;
      }
      const id = newId();
      if (term.translationRef) pending.terms.push({ id, group: term.translationRef });
      await tx.insert(terms).values({
        id,
        siteId,
        taxonomyId: taxonomy.id,
        locale: term.locale,
        parentId: term.parentRef ? (termIds.get(term.parentRef) ?? null) : null,
        slug,
        name: term.name,
        description: term.description ?? null,
        fields: term.fields ?? {},
        position: term.position ?? 0,
      });
      termIds.set(term.ref, id);
      count(report, 'terms');
    }
  });

  // ---- Media -----------------------------------------------------------------------
  const mediaTargets = new Map<string, MediaTarget>();
  const urlMap = new Map<string, MediaTarget>();
  const auth = importAuth(options.asUserId);
  // Media of an earlier import of the same source: kept, not downloaded again.
  const knownMedia = new Map(
    source
      ? (
          await run((tx) =>
            tx
              .select({ ref: importRefs.ref, id: importRefs.mediaId })
              .from(importRefs)
              .where(and(eq(importRefs.source, source), isNotNull(importRefs.mediaId))),
          )
        ).map((r) => [r.ref, r.id!])
      : [],
  );
  const mapUrls = (item: (typeof doc.media)[number], target: MediaTarget) => {
    mediaTargets.set(item.ref, target);
    for (const url of item.urls ?? []) {
      urlMap.set(url, target);
      // WordPress's resized copies and scaled originals point to it too.
      urlMap.set(mediaUrlKey(url), target);
    }
  };
  /** Imported media and the old address they had. */
  const movedMedia: { from: string; to: string }[] = [];
  for (const [index, item] of doc.media.entries()) {
    stopIfCancelled();
    if (index % 25 === 0) progress(`Media ${index + 1}/${doc.media.length}`);
    tick('media', index, doc.media.length);
    const known = knownMedia.get(item.ref);
    if (known) {
      const view = await options.media.get(siteId, auth, known).catch(() => null);
      if (view) {
        mapUrls(item, { id: view.id, url: view.url });
        // Imported by an older core: its old addresses redirect from now on.
        await run((tx) => recordPaths(tx, siteId, source!, sourcePaths(item), view.id));
        count(report, 'media', 'skipped');
        continue;
      }
    }
    try {
      const data = await options.readFile(item.file);
      const view = await options.media.upload(
        siteId,
        auth,
        { filename: item.filename, data },
        '127.0.0.1',
        // In the folder of the month it had on the old site (core 0.85),
        // under WordPress's name exactly, case included (core 0.87).
        { date: mediaDate(item), keepName: doc.source.kind === 'wordpress' },
      );
      if (item.alt || item.caption) {
        await options.media.update(siteId, auth, view.id, {
          ...(item.alt ? { alt: item.alt } : {}),
          ...(item.caption ? { caption: item.caption } : {}),
        });
      }
      mapUrls(item, { id: view.id, url: view.url });
      const paths = sourcePaths(item);
      if (source) {
        await run(async (tx) => {
          await recordRef(tx, siteId, source, item.ref, { mediaId: view.id });
          // Its old addresses, which redirect to it (core 0.85).
          await recordPaths(tx, siteId, source, paths, view.id);
        });
      }
      if (paths[0]) movedMedia.push({ from: paths[0], to: view.url });
      count(report, 'media');
    } catch (error) {
      report.errors.push(`Media "${item.filename}" not imported: ${message(error)}`);
    }
  }
  tick('media', doc.media.length, doc.media.length);
  reportMovedMedia(report, movedMedia, Boolean(source), doc.source.kind === 'wordpress');
  await options.media.idle();
  // The old site's media addresses inside text (HTML, CSS) become the new ones.
  const mediaText = mediaTextRewriter(urlMap, doc.source.url);
  const importedCss = doc.site.additionalCss;
  if (importedCss) {
    if (importedCss.site) importedCss.site = mediaText.rewrite(importedCss.site);
    for (const [slug, text] of Object.entries(importedCss.themes ?? {})) {
      importedCss.themes![slug] = mediaText.rewrite(text);
    }
    for (const url of mediaText.takeMissing()) {
      report.warnings.push(`Additional CSS: image not imported, it still points to ${url}.`);
    }
  }

  // ---- Entries ---------------------------------------------------------------------
  const entryIds = new Map<string, { id: string }>();
  /** Entries written by this import whose document points to other entries. */
  const withRefs: { revisionId: string; document: CxdDocument }[] = [];
  /** And those whose custom fields do (plugin API 1.47). */
  const fieldsWithRefs: { revisionId: string; fields: Record<string, unknown> }[] = [];
  // References in field values: media, terms and users are known by now.
  const fieldRefs: Partial<ImportRefMaps> = {
    media: (ref) => mediaTargets.get(ref)?.id ?? null,
    term: (ref) => termIds.get(ref) ?? null,
    user: (ref) => userIds.get(ref) ?? null,
  };
  // Entries of types the site does not have (e.g. of a plugin that is not active).
  const knownTypes = new Set(
    (await run((tx) => tx.select({ slug: contentTypes.slug }).from(contentTypes))).map(
      (t) => t.slug,
    ),
  );
  const missingTypes = new Map<string, number>();
  const ordered = orderByParent(doc.entries).filter((entry) => {
    if (knownTypes.has(entry.type)) return true;
    missingTypes.set(entry.type, (missingTypes.get(entry.type) ?? 0) + 1);
    return false;
  });
  for (const [type, n] of missingTypes) {
    report.warnings.push(
      `${n} entr${n === 1 ? 'y' : 'ies'} of the type "${type}" ${n === 1 ? 'was' : 'were'} not imported: the site has no such content type (activate the plugin that adds it, then import again).`,
    );
  }
  for (const [index, entry] of ordered.entries()) {
    stopIfCancelled();
    if (index % 50 === 0) progress(`Entries ${index + 1}/${ordered.length}`);
    tick('entries', index, ordered.length);
    try {
      // Imported before (the same file again, or a later export of the same site):
      // kept as it is, only the comments it lacks are added.
      const already = await run(async (tx) => {
        const found = await findImported(tx, entry, source);
        if (found && !found.recorded && source) {
          await recordRef(tx, siteId, source, entry.ref, { entryId: found.id });
        }
        return found;
      });
      if (already) {
        entryIds.set(entry.ref, { id: already.id });
        if (entry.comments?.length) {
          await run((tx) =>
            insertComments(tx, siteId, already.id, entry.comments!, userIds, report, true),
          );
        }
        count(report, 'entries', 'skipped');
        continue;
      }
      const result = await run(async (tx) => {
        const inserted = await insertEntry(tx, siteId, entry, {
          author: (entry.authorRef && userIds.get(entry.authorRef)) || options.asUserId,
          parent: entry.parentRef ? entryIds.get(entry.parentRef)?.id : undefined,
          terms: termIds,
          media: mediaTargets,
          urls: urlMap,
          text: mediaText,
          report,
          refs: fieldRefs,
        });
        if (source) await recordRef(tx, siteId, source, entry.ref, { entryId: inserted.id });
        return inserted;
      });
      entryIds.set(entry.ref, { id: result.id });
      if (JSON.stringify(result.document).includes('"$entry"')) {
        withRefs.push({ revisionId: result.revisionId, document: result.document });
      }
      if (JSON.stringify(result.fields).includes('"$entry"')) {
        fieldsWithRefs.push({ revisionId: result.revisionId, fields: result.fields });
      }
      if (entry.comments?.length) {
        await run((tx) => insertComments(tx, siteId, result.id, entry.comments!, userIds, report));
      }
      if (entry.translationRef)
        pending.entries.push({ id: result.id, group: entry.translationRef });
      count(report, 'entries');
    } catch (error) {
      report.errors.push(
        `Entry "${entry.title}" (${entry.type}, ${entry.locale}) not imported: ${message(error)}`,
      );
    }
  }
  tick('entries', ordered.length, ordered.length);

  // References between entries (`{ $entry: ref }`), now that every entry has its id.
  const idOf = (ref: string) => entryIds.get(ref)?.id;
  for (const { revisionId, document } of withRefs) {
    await run((tx) =>
      tx
        .update(revisions)
        .set({ document: resolveEntryRefs(document, idOf) as CxdDocument })
        .where(eq(revisions.id, revisionId)),
    );
  }
  const allRefs: Partial<ImportRefMaps> = { ...fieldRefs, entry: (ref) => idOf(ref) ?? null };
  for (const { revisionId, fields } of fieldsWithRefs) {
    await run((tx) =>
      tx
        .update(revisions)
        .set({ fields: importFieldRefs(fields, allRefs) as Record<string, unknown> })
        .where(eq(revisions.id, revisionId)),
    );
  }
  // Term fields (written before the media and entries existed) and user fields.
  await run(async (tx) => {
    for (const term of doc.terms) {
      const id = termIds.get(term.ref);
      if (!id || !term.fields || !JSON.stringify(term.fields).includes('"$')) continue;
      await tx
        .update(terms)
        .set({ fields: importFieldRefs(term.fields, allRefs) as Record<string, unknown> })
        .where(eq(terms.id, id));
    }
    for (const user of doc.users) {
      const userId = userIds.get(user.ref);
      if (!userId || !user.fields || Object.keys(user.fields).length === 0) continue;
      const [existing] = await tx
        .select({ userId: userFields.userId })
        .from(userFields)
        .where(eq(userFields.userId, userId));
      // Values already on the site are kept, as for entries imported again.
      if (existing) continue;
      await tx.insert(userFields).values({
        siteId,
        userId,
        fields: importFieldRefs(user.fields, allRefs) as Record<string, unknown>,
      });
    }
    // Rules of the imported field groups naming entries and terms (plugin API 1.48).
    for (const key of importedGroups) {
      const [row] = await tx.select().from(fieldGroups).where(eq(fieldGroups.key, key));
      const group = row?.definition as FieldGroupInput | undefined;
      if (!group) continue;
      let changed = false;
      const location = group.location.map((and) =>
        and.map((rule) => {
          const id =
            rule.param === 'entry' || rule.param === 'parent'
              ? idOf(rule.value)
              : rule.param === 'term'
                ? termIds.get(rule.value)
                : undefined;
          if (!id || id === rule.value) return rule;
          changed = true;
          return { ...rule, value: id };
        }),
      );
      if (changed) {
        await tx
          .update(fieldGroups)
          .set({ definition: { ...group, location } })
          .where(eq(fieldGroups.key, key));
      }
    }
    // Values of options pages (plugin API 1.48): those already on the site are kept.
    const defaultLocale = await defaultLocaleIn(tx, siteId);
    const stored = new Set(
      (await tx.select().from(optionValues)).map((row) => `${row.page}|${row.locale}`),
    );
    for (const option of doc.options) {
      const locale = !option.locale || option.locale === defaultLocale ? '' : option.locale;
      if (!/^[a-z][a-z0-9_-]{0,63}$/.test(option.page)) continue;
      if (stored.has(`${option.page}|${locale}`)) {
        count(report, 'options', 'skipped');
        continue;
      }
      stored.add(`${option.page}|${locale}`);
      await tx.insert(optionValues).values({
        siteId,
        page: option.page,
        locale,
        fields: importFieldRefs(option.fields, allRefs) as Record<string, unknown>,
      });
      count(report, 'options');
    }
  });

  // ---- Settings, menus, redirects --------------------------------------------------
  stopIfCancelled();
  tick('menus', 0, doc.menus.length);
  await run(async (tx) => {
    const values: Record<string, unknown> = {};
    if (doc.site.title) values.title = doc.site.title;
    if (doc.site.tagline) values.tagline = doc.site.tagline;
    if (doc.site.postsPerPage) values.postsPerPage = doc.site.postsPerPage;
    if (doc.site.dateFormat) values.dateFormat = doc.site.dateFormat;
    const front = doc.site.frontPageRef && entryIds.get(doc.site.frontPageRef);
    if (front) values.frontPage = front.id;
    const posts = doc.site.postsPageRef && entryIds.get(doc.site.postsPageRef);
    if (posts) values.postsPage = posts.id;
    for (const [key, value] of Object.entries(values)) {
      await tx
        .insert(settings)
        .values({ siteId, namespace: 'core', key, value })
        .onConflictDoUpdate({
          target: [settings.siteId, settings.namespace, settings.key],
          set: { value },
        });
    }
    // Additional CSS (core 0.79): only what can be printed safely, added to
    // the site's own (core 0.80: appended under a comment, never replacing it,
    // and not again when the site already has it).
    const css = doc.site.additionalCss;
    const parts: [string, string, string][] = [
      ...(css?.site
        ? [[SITE_CSS_KEY, css.site, 'for every theme'] as [string, string, string]]
        : []),
      ...Object.entries(css?.themes ?? {}).map(
        ([slug, text]) =>
          [themeCssKey(slug), text, `for the theme “${slug}”`] as [string, string, string],
      ),
    ];
    if (parts.length > 0) {
      const all = await allAdditionalCss(tx);
      const stored = (key: string) =>
        (key === SITE_CSS_KEY ? all.site : all.themes?.[key.slice('theme:'.length)]) ?? '';
      const from = [doc.source.name, doc.source.url].filter(Boolean).join(', ') || doc.source.kind;
      for (const [key, original, what] of parts) {
        // Braces matched first (core 0.82): a block left open would swallow the CSS after it.
        const balanced = balanceCss(original);
        const text = balanced.css;
        const fixes = [
          balanced.dropped && `removed ${balanced.dropped} empty block(s) left open at the end`,
          balanced.closed && `closed ${balanced.closed} block(s) left open at the end`,
          balanced.stray && `removed ${balanced.stray} } with no {`,
          balanced.ended && 'ended a comment or string left open',
        ].filter(Boolean);
        if (fixes.length) {
          report.warnings.push(
            `Additional CSS ${what}: its braces did not match (${fixes.join(', ')}), so it could not break the CSS printed after it.`,
          );
        }
        const refused = additionalCssProblem(text);
        if (refused) {
          report.warnings.push(`Additional CSS ${what} not imported: ${refused}`);
          count(report, 'additionalCss', 'skipped');
          continue;
        }
        const merged = mergeAdditionalCss(stored(key), text, from);
        if (merged.outcome === 'present') {
          count(report, 'additionalCss', 'skipped');
          continue;
        }
        const together = additionalCssProblem(merged.css);
        if (together) {
          report.warnings.push(
            merged.css.length > ADDITIONAL_CSS_MAX
              ? `Additional CSS ${what} not imported: with the site's own it would be longer than ${ADDITIONAL_CSS_MAX.toLocaleString('en')} characters.`
              : `Additional CSS ${what} not imported: the site's own has a problem to fix first in Customize (${together})`,
          );
          count(report, 'additionalCss', 'skipped');
          continue;
        }
        await writeAdditionalCss(tx, siteId, key, merged.css);
        count(report, 'additionalCss');
        if (merged.outcome === 'appended') {
          report.warnings.push(
            `Additional CSS ${what}: the imported CSS was added after the site's own, under the comment “Imported from ${from}”.`,
          );
        }
      }
    }

    // The source's colour scheme (core 0.81): the active theme's `colorScheme`, unless chosen.
    if (doc.site.colorScheme) {
      const applied = await importColorScheme(tx, siteId, doc.site.colorScheme);
      if (applied) {
        count(report, 'colorScheme');
        report.warnings.push(
          `Colour scheme: the theme “${applied}” is set to ${doc.site.colorScheme}, as the imported site; change it in Appearance → Customize.`,
        );
      }
    }

    const takenMenus = new Set((await tx.select().from(menus)).map((m) => `${m.locale}|${m.slug}`));
    const menuNames = new Set(
      (await tx.select({ name: menus.name, locale: menus.locale }).from(menus)).map(
        (m) => `${m.locale}|${m.name.trim().toLowerCase()}`,
      ),
    );
    for (const menu of doc.menus) {
      // The same menu imported before: kept as it is.
      if (menuNames.has(`${menu.locale}|${menu.name.trim().toLowerCase()}`)) {
        count(report, 'menus', 'skipped');
        continue;
      }
      const slug = nextFreeSlug(
        slugify(menu.name) || 'menu',
        new Set(
          [...takenMenus]
            .filter((k) => k.startsWith(`${menu.locale}|`))
            .map((k) => k.split('|')[1]!),
        ),
      );
      takenMenus.add(`${menu.locale}|${slug}`);
      const menuId = newId();
      if (menu.location) {
        await tx
          .update(menus)
          .set({ location: null })
          .where(and(eq(menus.locale, menu.locale), eq(menus.location, menu.location)));
      }
      await tx.insert(menus).values({
        id: menuId,
        siteId,
        slug,
        name: menu.name,
        locale: menu.locale,
        location: menu.location ?? null,
      });
      const rows: (typeof menuItems.$inferInsert)[] = [];
      const walk = (items: TransferMenuItem[], parentId: string | null) => {
        items.forEach((item, position) => {
          const entry = item.entryRef ? entryIds.get(item.entryRef) : undefined;
          const term = item.termRef ? termIds.get(item.termRef) : undefined;
          let kind = item.kind;
          if ((kind === 'entry' && !entry) || (kind === 'term' && !term)) {
            if (!item.url && !item.label) {
              report.warnings.push(`Menu "${menu.name}": a link to a missing item was dropped.`);
              return;
            }
            kind = item.url ? 'url' : 'custom';
          }
          const id = newId();
          rows.push({
            id,
            siteId,
            menuId,
            parentId,
            position,
            kind,
            entryId: kind === 'entry' ? entry!.id : null,
            termId: kind === 'term' ? term! : null,
            url: kind === 'url' ? (urlMap.get(item.url!)?.url ?? item.url!) : null,
            label: item.label?.trim() || (kind === 'url' || kind === 'custom' ? 'Link' : null),
            target: item.target ?? null,
          });
          walk(item.children ?? [], id);
        });
      };
      walk(menu.items, null);
      if (rows.length) await tx.insert(menuItems).values(rows);
      count(report, 'menus');
    }

    // Old addresses keep working (301), computed after every entry exists.
    const defaultLocale = await defaultLocaleIn(tx, siteId);
    const data = await loadSiteData(
      tx,
      options.activePlugins ?? new Set(),
      options.locales ?? [
        { code: defaultLocale, name: defaultLocale, prefix: '', isDefault: true },
      ],
    );
    // Addresses are compared as the router tells them apart: `/menu` and `/menu/`
    // are one page. Redirects from an address to itself with or without the
    // slash (earlier imports made them) do nothing and only hide the address
    // from the site owner's own redirects: they go.
    const saved = await tx
      .select({ id: redirects.id, from: redirects.fromPath, to: redirects.toPath })
      .from(redirects);
    const idle = saved.filter((r) => isSlashOnlyRedirect(r.from, r.to)).map((r) => r.id);
    if (idle.length) await tx.delete(redirects).where(inArray(redirects.id, idle));
    const existing = new Set(
      saved.filter((r) => !idle.includes(r.id)).map((r) => addressKey(r.from)),
    );
    // A redirect must never hide a page that exists (redirects win over routing).
    const live = new Set(
      (await tx.select().from(entries).where(ne(entries.status, 'trashed'))).map((row) =>
        addressKey(data.urls.entry(row)),
      ),
    );
    const add = async (from: string, to: string, status: number) => {
      const path = normalizePath(from);
      if (!path || isSlashOnlyRedirect(path, to)) return;
      const key = addressKey(path);
      if (existing.has(key) || live.has(key)) return;
      existing.add(key);
      await tx.insert(redirects).values({ siteId, fromPath: path, toPath: to, status });
      count(report, 'redirects');
    };
    for (const entry of doc.entries) {
      const target = entryIds.get(entry.ref);
      if (!target || !entry.oldPaths?.length) continue;
      const [row] = await tx.select().from(entries).where(eq(entries.id, target.id));
      if (!row) continue;
      const url = data.urls.entry(row);
      for (const old of entry.oldPaths) await add(old, url, 301);
    }
    for (const redirect of doc.redirects) await add(redirect.from, redirect.to, redirect.status);
  });

  // A language plugin takes the languages and translation links over.
  if (pending.locales.length > 1 || pending.entries.length > 0 || pending.terms.length > 0) {
    await run(async (tx) => {
      const [current] = await tx
        .select({ value: settings.value })
        .from(settings)
        .where(and(eq(settings.namespace, PENDING.namespace), eq(settings.key, PENDING.key)));
      const before = (current?.value as PendingLanguages | undefined) ?? {
        locales: [],
        entries: [],
        terms: [],
      };
      const value: PendingLanguages = {
        locales: [
          ...before.locales,
          ...pending.locales.filter((l) => !before.locales.some((b) => b.code === l.code)),
        ],
        entries: [...before.entries, ...pending.entries],
        terms: [...before.terms, ...pending.terms],
      };
      await tx
        .insert(settings)
        .values({ siteId, namespace: PENDING.namespace, key: PENDING.key, value })
        .onConflictDoUpdate({
          target: [settings.siteId, settings.namespace, settings.key],
          set: { value },
        });
    });
    await options.onLanguagesPending?.();
  }
  // ---- Plugin data -----------------------------------------------------------------
  tick('finishing', 0, 0);
  const slugs = Object.keys(doc.plugins);
  if (slugs.length > 0) {
    const idMap: ImportIdMap = {
      entries: Object.fromEntries([...entryIds].map(([ref, { id }]) => [ref, id])),
      terms: Object.fromEntries(termIds),
      media: Object.fromEntries(mediaTargets),
    };
    for (const slug of slugs) {
      mediaText.takeMissing();
      const data = resolveEntryRefs(
        remapMediaValues(doc.plugins[slug], mediaTargets, urlMap, mediaText),
        idOf,
      );
      for (const url of mediaText.takeMissing()) {
        report.warnings.push(
          `Settings for the plugin "${slug}": image not imported, it still points to ${url}.`,
        );
      }
      try {
        const result = options.importPluginData
          ? await options.importPluginData({ slug, data, idMap })
          : null;
        if (result) report.warnings.push(...(result.warnings ?? []));
        else {
          report.warnings.push(
            `Settings for the plugin "${slug}" were not imported: it is not active on this site.`,
          );
        }
      } catch (error) {
        report.errors.push(`Settings for the plugin "${slug}" not imported: ${message(error)}`);
      }
    }
  }
  await options.cache.invalidate(siteId, ['site']);
  return report;
}

// ---- Entries --------------------------------------------------------------------------

/** The setting themes name for their colour scheme (`auto`, `light`, `dark`). */
export const COLOR_SCHEME_SETTING = 'colorScheme';

/**
 * A colour scheme given by an import (`site.colorScheme`, core 0.81), e.g.
 * `light` for a WordPress site, which had no dark mode: saved in the active
 * theme's setting named `colorScheme` when the theme has one offering that
 * value (a select, as Aurora's) and the site has not chosen yet. Themes
 * without it, and choices already made, are left alone. Answers the theme's
 * slug when the value was saved.
 */
export async function importColorScheme(
  tx: SiteTransaction,
  siteId: string,
  scheme: string,
): Promise<string | null> {
  const [site] = await tx
    .select({ theme: sites.themeSlug })
    .from(sites)
    .where(eq(sites.id, siteId));
  const theme = themeFor(site?.theme);
  const field = theme.settings?.find((f) => f.name === COLOR_SCHEME_SETTING);
  if (field?.type !== 'select' || !field.options.some((o) => o.value === scheme)) return null;
  const stored = await storedThemeSettings(tx, theme.slug, theme.parent);
  if (stored[COLOR_SCHEME_SETTING] !== undefined) return null;
  const value = { ...stored, [COLOR_SCHEME_SETTING]: scheme };
  await tx
    .insert(settings)
    .values({ siteId, namespace: themeNamespace(theme.slug), key: 'values', value })
    .onConflictDoUpdate({
      target: [settings.siteId, settings.namespace, settings.key],
      set: { value },
    });
  return theme.slug;
}

/** The comments of an imported entry, threads kept, and its comment count. */
async function insertComments(
  tx: SiteTransaction,
  siteId: string,
  entryId: string,
  list: TransferComment[],
  userIds: Map<string, string>,
  report: ImportReport,
  /** Comments already on the entry (same author, time and text) are not added again. */
  skipExisting = false,
): Promise<void> {
  const key = (name: string, at: Date, content: string) =>
    `${name.trim().toLowerCase()}|${at.getTime()}|${content.trim()}`;
  const present = new Map<string, string>();
  if (skipExisting) {
    for (const c of await tx
      .select({
        id: comments.id,
        authorName: comments.authorName,
        createdAt: comments.createdAt,
        content: comments.content,
      })
      .from(comments)
      .where(eq(comments.entryId, entryId))) {
      present.set(key(c.authorName, c.createdAt, c.content), c.id);
    }
  }
  const ids = new Map<string, string>();
  const fresh = list.filter((c) => {
    const found = present.get(
      key(c.authorName.slice(0, 120) || 'Anonymous', new Date(c.createdAt), c.content),
    );
    ids.set(c.ref, found ?? newId());
    if (found) count(report, 'comments', 'skipped');
    return !found;
  });
  const rows = fresh.map((c) => {
    const ip = c.ip && isIP(c.ip) ? c.ip : null;
    const url = c.authorUrl && /^https?:\/\/\S+$/i.test(c.authorUrl) ? c.authorUrl : null;
    return {
      id: ids.get(c.ref)!,
      siteId,
      entryId,
      parentId: (c.parentRef && ids.get(c.parentRef)) || null,
      userId: (c.userRef && userIds.get(c.userRef)) || null,
      authorName: c.authorName.trim().slice(0, 120) || 'Anonymous',
      authorEmail: c.authorEmail.trim().toLowerCase().slice(0, 200),
      authorUrl: url,
      content: c.content,
      status: c.status,
      ip,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.createdAt),
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    await tx.insert(comments).values(rows.slice(i, i + 500));
  }
  for (let i = 0; i < rows.length; i++) count(report, 'comments');
  const [approved] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(comments)
    .where(and(eq(comments.entryId, entryId), eq(comments.status, 'approved')));
  await tx
    .update(entries)
    .set({ commentCount: approved?.n ?? 0 })
    .where(eq(entries.id, entryId));
}

/**
 * The source of a document, for `import_refs` (core 0.82): its kind and the
 * old site's address without scheme, `www.` and final slash
 * (`wordpress:example.com`), or its name when it has no address; null when
 * it has neither (its refs cannot be told apart from another's).
 */
export function importSource(doc: Pick<TransferDocument, 'source'>): string | null {
  const url = (doc.source.url ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
  const name = url || (doc.source.name ?? '').trim();
  return name ? `${doc.source.kind}:${name}`.slice(0, 500) : null;
}

/**
 * The month a media file is stored under: its date on the old site, else the
 * `/uploads/<yyyy>/<mm>/` of its address (WordPress), else none (now).
 */
export function mediaDate(item: TransferDocument['media'][number]): Date | undefined {
  if (item.date) return new Date(item.date);
  for (const url of [...(item.urls ?? []), item.file]) {
    const date = uploadsFolderDate(url);
    if (date) return date;
  }
  return undefined;
}

/**
 * The paths of a media file's addresses on the old site (decoded, without
 * host and query), as a visitor's request for them arrives:
 * `/wp-content/uploads/2015/07/photo.jpg`.
 */
export function sourcePaths(item: TransferDocument['media'][number]): string[] {
  return sourceUrlPaths(item.urls ?? []);
}

/** Ref of an old address of a media file in `import_refs` (core 0.85). */
export const PATH_REF = 'path:';

/**
 * Records the old addresses of an imported media file (`path:<path>`), and
 * the same without the size of WordPress's copies, so that a request for
 * `photo-300x200.jpg` finds `photo.jpg`; an address of its own wins over that.
 */
async function recordPaths(
  tx: SiteTransaction,
  siteId: string,
  source: string,
  paths: string[],
  mediaId: string,
): Promise<void> {
  for (const path of paths) {
    await recordRef(tx, siteId, source, `${PATH_REF}${path}`, { mediaId });
    const key = mediaUrlKey(path);
    if (key !== path) {
      await tx
        .insert(importRefs)
        .values({ siteId, source, ref: `${PATH_REF}${key}`, mediaId })
        .onConflictDoNothing();
    }
  }
}

/** At most this many media are listed one by one in the report. */
const MOVED_LISTED = 100;

/**
 * Tells which media addresses changed (core 0.85): the rule from the old
 * folder to the new one and how many, and one by one those whose name
 * changed (made safe, or a number added because the name was taken).
 */
function reportMovedMedia(
  report: ImportReport,
  moved: { from: string; to: string }[],
  redirected: boolean,
  /** WordPress's names kept, case included (core 0.87). */
  keptCase: boolean,
): void {
  if (moved.length === 0) return;
  const name = (path: string) => path.slice(path.lastIndexOf('/') + 1);
  const renamed = moved.filter((m) => name(m.from) !== name(m.to));
  const { from, to } = moved[0]!;
  report.warnings.push(
    redirected
      ? `Media addresses changed: ${moved.length} file(s), in the same year and month, e.g. ${from} → ${to}; the old addresses redirect (301) to the new ones.`
      : `Media addresses changed: ${moved.length} file(s), in the same year and month, e.g. ${from} → ${to}; the old addresses do not redirect (the export does not say which site it comes from).`,
  );
  if (renamed.length === 0) return;
  report.warnings.push(
    keptCase
      ? `${renamed.length} media file(s) got another name (without accents, spaces or other unsafe characters, or with a number because the name was taken):`
      : `${renamed.length} media file(s) got another name (lowercase, without accents or spaces, or with a number because the name was taken):`,
  );
  for (const m of renamed.slice(0, MOVED_LISTED)) {
    report.warnings.push(`Media address changed: ${m.from} → ${m.to}`);
  }
  if (renamed.length > MOVED_LISTED) {
    report.warnings.push(
      `…and ${renamed.length - MOVED_LISTED} more media file(s) with another name.`,
    );
  }
}

/** Records what a record of the source became (the latest import wins). */
async function recordRef(
  tx: SiteTransaction,
  siteId: string,
  source: string,
  ref: string,
  target: { entryId: string } | { mediaId: string },
): Promise<void> {
  const values = {
    entryId: 'entryId' in target ? target.entryId : null,
    mediaId: 'mediaId' in target ? target.mediaId : null,
  };
  await tx
    .insert(importRefs)
    .values({ siteId, source, ref, ...values })
    .onConflictDoUpdate({
      target: [importRefs.siteId, importRefs.source, importRefs.ref],
      set: values,
    });
}

/**
 * An entry imported before, not in the trash: the one made of the same
 * record of the same source (its `ref`, e.g. the WordPress post id; core
 * 0.82). Entries imported by older cores have no ref: one with the same
 * type, language, address and title is taken, unless another record already
 * claimed it, so two posts with the same title are never merged.
 * `recorded`: found by its ref.
 */
async function findImported(
  tx: SiteTransaction,
  entry: TransferEntry,
  source: string | null,
): Promise<{ id: string; recorded: boolean } | null> {
  const [byRef] = !source
    ? []
    : await tx
        .select({ id: entries.id })
        .from(importRefs)
        .innerJoin(entries, eq(entries.id, importRefs.entryId))
        .where(
          and(
            eq(importRefs.source, source),
            eq(importRefs.ref, entry.ref),
            ne(entries.status, 'trashed'),
          ),
        )
        .limit(1);
  if (byRef) return { id: byRef.id, recorded: true };
  // Addresses as older cores made them too: written slugs were cut at 80 characters.
  const written = slugify(entry.slug, SLUG_MAX);
  const slugs = written ? [written, slugify(entry.slug)] : [slugify(entry.title)];
  const wanted = [...new Set(slugs.filter(Boolean))];
  if (wanted.length === 0) return null;
  const [found] = await tx
    .select({ id: entries.id })
    .from(entries)
    .where(
      and(
        eq(entries.typeSlug, entry.type),
        eq(entries.locale, entry.locale),
        inArray(entries.slug, wanted),
        eq(entries.title, entry.title),
        ne(entries.status, 'trashed'),
        sql`not exists (select 1 from ${importRefs} where ${importRefs.entryId} = ${entries.id})`,
      ),
    )
    .orderBy(entries.createdAt)
    .limit(1);
  return found ? { id: found.id, recorded: false } : null;
}

async function insertEntry(
  tx: SiteTransaction,
  siteId: string,
  entry: TransferEntry,
  context: {
    author: string;
    parent: string | undefined;
    terms: Map<string, string>;
    media: Map<string, MediaTarget>;
    urls: Map<string, MediaTarget>;
    text: MediaTextRewriter;
    report: ImportReport;
    /** References in field values (plugin API 1.47); entries are resolved afterwards. */
    refs: Partial<ImportRefMaps>;
  },
): Promise<{
  id: string;
  revisionId: string;
  document: CxdDocument;
  fields: Record<string, unknown>;
}> {
  const types = await tx.select().from(contentTypes);
  const type = types.find((t) => t.slug === entry.type);
  if (!type) throw new Error(`unknown content type "${entry.type}"`);
  // Types with the same kind of address (articles and pages at /{slug}) share slugs.
  const sharing = types
    .filter((t) => permalinkShape(t.permalink) === permalinkShape(type.permalink))
    .map((t) => t.slug);
  const taken = new Set(
    (
      await tx
        .select({ slug: entries.slug })
        .from(entries)
        .where(and(inArray(entries.typeSlug, sharing), eq(entries.locale, entry.locale)))
    ).map((e) => e.slug),
  );
  // The source's address as it was, up to WordPress's 200 characters (core 0.82);
  // when taken, a suffix within the limit, as WordPress does (`…-2`).
  const wanted = slugify(entry.slug, SLUG_MAX) || slugify(entry.title) || 'entry';
  const slug = nextFreeSlug(wanted, taken, SLUG_MAX);
  if (slug !== wanted) {
    context.report.warnings.push(
      `"${entry.title}": the address "${wanted}" was taken, "${slug}" used instead.`,
    );
  }

  const document = blockRefs(
    remapMedia(
      entry.document,
      context.media,
      context.urls,
      context.text,
      context.report,
      entry.title,
    ),
    context.refs,
  );
  const fields = importFieldRefs(entry.fields ?? {}, context.refs) as Record<string, unknown>;
  const id = newId();
  const revisionId = newId();
  const publishedAt = entry.publishedAt ? new Date(entry.publishedAt) : null;
  const isPublic = entry.status === 'published' || entry.status === 'private';
  await tx.insert(entries).values({
    id,
    siteId,
    typeSlug: entry.type,
    locale: entry.locale,
    parentId: type.hierarchical ? (context.parent ?? null) : null,
    slug,
    title: entry.title,
    template: entry.template ?? null,
    status: entry.status,
    authorId: context.author,
    publishedAt: isPublic ? (publishedAt ?? new Date()) : publishedAt,
    scheduledAt: entry.scheduledAt ? new Date(entry.scheduledAt) : null,
    position: entry.position ?? 0,
    commentStatus:
      entry.commentStatus && (type.supports ?? []).includes('comments')
        ? entry.commentStatus
        : await newCommentStatus(tx, type.supports ?? []),
    ...(entry.createdAt
      ? { createdAt: new Date(entry.createdAt), updatedAt: new Date(entry.createdAt) }
      : {}),
  });
  await tx.insert(revisions).values({
    id: revisionId,
    siteId,
    entryId: id,
    kind: 'import',
    title: entry.title,
    fields,
    ...(entry.excerpt ? { excerpt: entry.excerpt } : {}),
    featuredMediaId: entry.featuredMediaRef
      ? (context.media.get(entry.featuredMediaRef)?.id ?? null)
      : null,
    document,
    schemaVersion: document.schema,
    authorId: context.author,
  });
  await tx
    .update(entries)
    .set({
      currentRevisionId: revisionId,
      ...(isPublic
        ? {
            publishedRevisionId: revisionId,
            search:
              sql`to_tsvector('simple', unaccent(${`${entry.title}\n${documentText(document)}`}))` as never,
          }
        : {}),
    })
    .where(eq(entries.id, id));

  let position = 0;
  for (const [taxonomy, refs] of Object.entries(entry.terms ?? {})) {
    for (const ref of refs) {
      const termId = context.terms.get(ref);
      if (!termId) {
        context.report.warnings.push(`"${entry.title}": ${taxonomy} term ${ref} not found.`);
        continue;
      }
      await tx
        .insert(entryTerms)
        .values({ siteId, entryId: id, termId, position: position++ })
        .onConflictDoNothing();
    }
  }
  return { id, revisionId, document, fields };
}

/**
 * Refs to media, terms and people in blocks' attributes (plugin API 1.49),
 * e.g. a plugin block made of a WordPress block's data: `{ $media: ref }`
 * (also `$term`, `$user`) becomes the new id, as in field values. Entry
 * refs are resolved later, with the entries.
 */
function blockRefs(document: CxdDocument, refs: Partial<ImportRefMaps>): CxdDocument {
  if (!JSON.stringify(document.blocks).match(/"\$(media|term|user)"/)) return document;
  const walk = (blocks: CxdBlock[]): CxdBlock[] =>
    blocks.map((block) => ({
      ...block,
      attrs: importFieldRefs(block.attrs, refs) as CxdBlock['attrs'],
      ...(block.children ? { children: walk(block.children) } : {}),
    }));
  return { ...document, blocks: walk(document.blocks) };
}

/**
 * Image blocks: media refs become the imported media ids and URLs; the old
 * site's media addresses in other attributes (HTML, CSS) too, and those that
 * were not imported are reported, each once.
 */
function remapMedia(
  document: CxdDocument,
  media: Map<string, MediaTarget>,
  urls: Map<string, MediaTarget>,
  text: MediaTextRewriter,
  report: ImportReport,
  title: string,
): CxdDocument {
  text.takeMissing();
  const reported = new Set<string>();
  const missing = (url: string) => {
    if (reported.has(url)) return;
    reported.add(url);
    report.warnings.push(`"${title}": image not imported, it still points to ${url}.`);
  };
  const walk = (blocks: CxdBlock[]): CxdBlock[] =>
    blocks.map((block) => {
      let attrs = block.attrs;
      if (block.type === 'core/image') {
        const target =
          (typeof attrs.id === 'string' || typeof attrs.id === 'number'
            ? media.get(String(attrs.id))
            : undefined) ??
          (typeof attrs.url === 'string' ? mediaByUrl(urls, attrs.url) : undefined);
        if (target) {
          attrs = { ...attrs, url: target.url, ...(target.id ? { id: target.id } : {}) };
          if (!target.id) delete attrs.id;
        } else {
          attrs = { ...attrs };
          delete attrs.id;
          if (typeof attrs.url === 'string') missing(attrs.url);
        }
      } else attrs = remapMediaValues(attrs, media, urls, text) as typeof attrs;
      return { ...block, attrs, ...(block.children ? { children: walk(block.children) } : {}) };
    });
  const out = { ...document, blocks: walk(document.blocks) };
  for (const url of text.takeMissing()) missing(url);
  return out;
}

/**
 * Media inside other blocks' attributes (e.g. a page builder's images):
 * objects `{ id: <media ref>, url }` get the imported id and address, and
 * known old addresses in `url` are replaced, as in every other text (inline
 * HTML, `srcset`, CSS `url()`).
 */
function remapMediaValues(
  value: unknown,
  media: Map<string, MediaTarget>,
  urls: Map<string, MediaTarget>,
  text: MediaTextRewriter,
): unknown {
  if (typeof value === 'string') return text.rewrite(value);
  if (Array.isArray(value)) return value.map((v) => remapMediaValues(v, media, urls, text));
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(object)) {
    out[key] = remapMediaValues(v, media, urls, text);
  }
  if ('url' in object) {
    const target =
      typeof object.id === 'string' || typeof object.id === 'number'
        ? media.get(String(object.id))
        : undefined;
    const found =
      target ?? (typeof object.url === 'string' ? mediaByUrl(urls, object.url) : undefined);
    if (found) {
      out.url = found.url;
      out.id = found.id ?? null;
    }
  }
  return out;
}

// ---- Helpers --------------------------------------------------------------------------

/** Field definitions of a type or taxonomy (plugin API 1.48): checked, or reported and left out. */
function definitionsOf(
  value: unknown[] | undefined,
  what: string,
  report: ImportReport,
): FieldDefinition[] | null {
  if (!value || value.length === 0) return null;
  const parsed = fieldListSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  report.warnings.push(
    `${what}: its fields were not imported (${parsed.error.issues[0]?.path.join('.') ?? ''} ${parsed.error.issues[0]?.message ?? ''}).`.trim(),
  );
  return null;
}

/** Parents before children (unknown parents are ignored). */
function orderByParent<T extends { ref: string; parentRef?: string | undefined }>(items: T[]): T[] {
  const byRef = new Map(items.map((i) => [i.ref, i]));
  const done = new Set<string>();
  const result: T[] = [];
  const visit = (item: T, depth: number) => {
    if (done.has(item.ref) || depth > 50) return;
    const parent = item.parentRef ? byRef.get(item.parentRef) : undefined;
    if (parent && parent !== item) visit(parent, depth + 1);
    if (done.has(item.ref)) return;
    done.add(item.ref);
    result.push(item);
  };
  for (const item of items) visit(item, 0);
  return result;
}

function normalizePath(value: string): string | null {
  let path = value.trim();
  try {
    if (/^https?:\/\//i.test(path)) {
      const url = new URL(path);
      path = url.pathname + url.search;
    }
  } catch {
    return null;
  }
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  try {
    path = decodeURI(path);
  } catch {
    // keep as is
  }
  return path === '/' ? null : path;
}

function importAuth(userId: string): AuthContext {
  return {
    userId,
    sessionId: 'import',
    email: '',
    displayName: 'Import',
    locale: 'en',
    avatarUrl: null,
    twoFactor: { enabled: false },
    isSuperAdmin: true,
    role: null,
    capabilities: [...CAPABILITIES],
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Super admin used as author of an import: by email, or the first one. */
export async function importUser(db: Database, email?: string): Promise<string> {
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(superAdmins)
    .innerJoin(users, eq(users.id, superAdmins.userId));
  const user = email ? rows.find((r) => r.email.toLowerCase() === email.toLowerCase()) : rows[0];
  if (!user) {
    throw new Error(
      email
        ? `${email} is not a super admin.`
        : 'Create a super admin first (cleitext user:create --super-admin).',
    );
  }
  return user.id;
}

/** A shortcode placeholder's data (`shortcodePlaceholder` of `@cleitext/blocks/html`). */
function shortcodeOf(value: unknown): {
  tag: string;
  attrs: Record<string, string>;
  content: string | null;
  text: string;
} | null {
  if (!value || typeof value !== 'object') return null;
  const { tag, attrs, content, text } = value as Record<string, unknown>;
  if (typeof tag !== 'string' || typeof text !== 'string') return null;
  const clean: Record<string, string> = {};
  if (attrs && typeof attrs === 'object') {
    for (const [key, v] of Object.entries(attrs)) if (typeof v === 'string') clean[key] = v;
  }
  return { tag, attrs: clean, content: typeof content === 'string' ? content : null, text };
}

/**
 * Blocks of other WordPress plugins, kept as `core/imported` placeholders by
 * the conversion: replaced by an active plugin's blocks (inner blocks first),
 * or by their content, with a warning for each kind left. Shortcodes
 * standing alone are placeholders too: a plugin's blocks (each inside
 * `wrap`, when set, e.g. a page builder's element) or their text.
 */
async function resolveImportedBlocks(
  entries: { document: CxdDocument }[],
  options: Pick<ImportOptions, 'importBlock' | 'importShortcode'>,
  report: ImportReport,
): Promise<void> {
  const left = new Map<string, number>();
  const shortcodesLeft = new Map<string, number>();
  const shortcodesDone = new Map<string, number>();
  const resolve = async (blocks: CxdBlock[]): Promise<CxdBlock[]> => {
    const out: CxdBlock[] = [];
    for (const block of blocks) {
      const children = block.children ? await resolve(block.children) : undefined;
      if (block.type !== IMPORTED_BLOCK) {
        out.push(children ? { ...block, children } : block);
        continue;
      }
      const { name, attrs, html, fallback, shortcode, wrap } = block.attrs as {
        name?: string;
        attrs?: Record<string, unknown>;
        html?: string;
        fallback?: CxdBlock[];
        shortcode?: unknown;
        wrap?: { type?: unknown; v?: unknown; attrs?: unknown };
      };
      const found = shortcodeOf(shortcode);
      if (found) {
        const converted = options.importShortcode ? await options.importShortcode(found) : null;
        if (converted && converted.length > 0) {
          const wrapper = typeof wrap?.type === 'string' ? wrap : null;
          out.push(
            ...(wrapper
              ? converted.map((inner) => ({
                  id: newBlockId(),
                  type: wrapper.type as string,
                  v: typeof wrapper.v === 'number' ? wrapper.v : 1,
                  attrs: { ...((wrapper.attrs as Record<string, unknown> | undefined) ?? {}) },
                  children: [inner],
                }))
              : converted),
          );
          shortcodesDone.set(found.tag, (shortcodesDone.get(found.tag) ?? 0) + 1);
        } else {
          shortcodesLeft.set(found.tag, (shortcodesLeft.get(found.tag) ?? 0) + 1);
          out.push(...(fallback ?? []));
        }
        continue;
      }
      const converted = options.importBlock
        ? await options.importBlock({
            name: String(name ?? ''),
            attrs: attrs ?? {},
            html: html ?? '',
            children: children ?? [],
          })
        : null;
      if (converted) {
        out.push(...converted);
        continue;
      }
      left.set(String(name), (left.get(String(name)) ?? 0) + 1);
      out.push(...(children?.length ? children : (fallback ?? [])));
    }
    return out;
  };
  for (const entry of entries) {
    entry.document = { ...entry.document, blocks: await resolve(entry.document.blocks) };
  }
  for (const [name, count] of left) {
    report.warnings.push(
      `Block ${name} has no equivalent (${count}×): its content was kept. A plugin may add it.`,
    );
  }
  for (const [tag, count] of shortcodesDone) {
    report.warnings.push(`Shortcode [${tag}] became a block of an active plugin (${count}×).`);
  }
  for (const [tag, count] of shortcodesLeft) {
    report.warnings.push(
      `Shortcode [${tag}] has no equivalent (${count}×): kept as text. A plugin may add it.`,
    );
  }
}

/** The `{ $user: ref }` refs of field values, anywhere in them (at most 1000). */
function collectUserRefs(value: unknown, into: Set<string>, depth = 0): void {
  if (into.size >= 1000 || depth > 20 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectUserRefs(item, into, depth + 1);
    return;
  }
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object);
  if (keys.length === 1 && keys[0] === '$user' && typeof object.$user === 'string') {
    into.add(object.$user);
    return;
  }
  for (const item of Object.values(object)) collectUserRefs(item, into, depth + 1);
}

/** A content type's or taxonomy's name for the report: "Posts", "Categories"… */
const STRUCTURE_NAMES: Record<string, string> = {
  article: 'Posts',
  page: 'Pages',
  category: 'Categories',
  tag: 'Tags',
};

/**
 * The addresses the source used (plugin API 1.55): permalinks of content
 * types and the first part of taxonomies' archives. Applied where there is no
 * content yet, or everywhere with `replace` (the old addresses redirect);
 * otherwise the site's are kept and the report says so. Invalid or taken
 * addresses are reported and left alone.
 */
async function applyPermalinks(
  tx: SiteTransaction,
  siteId: string,
  permalinks: NonNullable<TransferDocument['permalinks']>,
  localePaths: Map<string, string>,
  report: ImportReport,
): Promise<void> {
  const setting = (path: string) => `in Settings → Content structure (now ${path})`;
  for (const [slug, permalink] of Object.entries(permalinks.types)) {
    const [type] = await tx.select().from(contentTypes).where(eq(contentTypes.slug, slug));
    if (!type || type.permalink === permalink) continue;
    const name = STRUCTURE_NAMES[slug] ?? `"${slug}"`;
    const [used] = await tx
      .select({ n: countRows() })
      .from(entries)
      .where(and(eq(entries.typeSlug, slug), ne(entries.status, 'trashed')));
    if ((used?.n ?? 0) > 0 && !permalinks.replace) {
      report.warnings.push(
        `${name} had addresses like ${permalink}: the site already has some, so their addresses stay ${type.permalink} and the old ones redirect. To keep them, set the permalink to ${permalink} ${setting(type.permalink)}, or import again choosing to use the addresses of the export.`,
      );
      continue;
    }
    try {
      await assertPermalink(tx, siteId, localePaths, permalink, type.hierarchical, type.id);
    } catch (error) {
      report.warnings.push(
        `${name}: the addresses of the export (${permalink}) cannot be used: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const redirected = await redirectEntries(tx, siteId, localePaths, type, permalink);
    await tx.update(contentTypes).set({ permalink }).where(eq(contentTypes.id, type.id));
    report.warnings.push(
      `${name} keep the addresses of the export: their permalink is now ${permalink} (it was ${type.permalink})${redirected ? `; ${redirected} existing address(es) redirect` : ''}.`,
    );
  }
  for (const [slug, wanted] of Object.entries(permalinks.taxonomyBases)) {
    const [taxonomy] = await tx.select().from(taxonomies).where(eq(taxonomies.slug, slug));
    if (!taxonomy || taxonomy.source.startsWith('plugin:')) continue;
    const base = wanted === slug ? null : wanted;
    if ((taxonomy.base ?? null) === base) continue;
    const name = STRUCTURE_NAMES[slug] ?? `"${slug}"`;
    const shown = (b: string | null) => (b === null ? `/${slug}/…` : b ? `/${b}/…` : '/…');
    const [used] = await tx
      .select({ n: countRows() })
      .from(terms)
      .where(eq(terms.taxonomyId, taxonomy.id));
    if ((used?.n ?? 0) > 0 && !permalinks.replace) {
      report.warnings.push(
        `${name} had archives at ${shown(base)}: the site already has some, so theirs stay at ${shown(taxonomy.base)}. Change the base ${setting(shown(taxonomy.base))}, or import again choosing to use the addresses of the export.`,
      );
      continue;
    }
    try {
      if (base) await assertTaxonomyBase(tx, siteId, localePaths, base, taxonomy.id);
    } catch (error) {
      report.warnings.push(
        `${name}: the archives' addresses of the export (${shown(base)}) cannot be used: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    await redirectTerms(tx, siteId, localePaths, taxonomy, base);
    await tx.update(taxonomies).set({ base }).where(eq(taxonomies.id, taxonomy.id));
    report.warnings.push(
      `${name} keep the archives' addresses of the export: ${shown(base)} (they were at ${shown(taxonomy.base)}).`,
    );
  }
}
