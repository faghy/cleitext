import { newCommentStatus } from '../community/defaults.js';
import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import { documentText } from '@cleitext/blocks';
import { IMPORTED_BLOCK } from '@cleitext/blocks/html';
import { isIP } from 'node:net';
import {
  comments,
  contentTypes,
  entries,
  entryTerms,
  menuItems,
  menus,
  newId,
  redirects,
  revisions,
  roles,
  settings,
  siteMembers,
  superAdmins,
  taxonomies,
  terms,
  users,
  findLogin,
  withContext,
  type Database,
  type SiteTransaction,
} from '@cleitext/db';
import { CAPABILITIES } from '@cleitext/shared';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { AuthContext } from '../common/request-context.js';
import { nextFreeSlug, permalinkShape, slugify } from '../content/slug.js';
import type { MediaService } from '../media/media.service.js';
import type { PageCacheService } from '../public/page-cache.service.js';
import { loadSiteData } from '../public/site-data.js';
import { defaultLocaleIn, PENDING } from '../content/languages.service.js';
import type { ContentLocale, PendingLanguages } from '@cleitext/plugin-sdk';
import {
  count,
  emptyReport,
  transferDocumentSchema,
  type ImportReport,
  type TransferComment,
  type TransferEntry,
  type TransferMenuItem,
} from './model.js';

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
  onProgress?(message: string): void;
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
}

interface MediaTarget {
  id: string;
  url: string;
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
  await resolveImportedBlocks(doc.entries, options, report);
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
  await run(async (tx) => {
    // Languages are a language plugin's: they wait for one (see the end).
    for (let i = 0; i < doc.locales.length; i++) count(report, 'locales');
    const types = new Set((await tx.select().from(contentTypes)).map((t) => t.slug));
    for (const type of doc.contentTypes) {
      if (types.has(type.slug)) continue;
      await tx.insert(contentTypes).values({
        siteId,
        slug: type.slug,
        name: type.name,
        source: 'user',
        hierarchical: type.hierarchical,
        permalink: type.permalink,
      });
      count(report, 'contentTypes');
    }
    const taxonomySlugs = new Set((await tx.select().from(taxonomies)).map((t) => t.slug));
    for (const taxonomy of doc.taxonomies) {
      if (taxonomySlugs.has(taxonomy.slug)) continue;
      await tx.insert(taxonomies).values({ siteId, ...taxonomy });
      count(report, 'taxonomies');
    }
  });

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
        await tx
          .insert(siteMembers)
          .values({ siteId, userId, roleId: role.id })
          .onConflictDoNothing();
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
      const slug = slugify(term.slug) || slugify(term.name) || 'term';
      const [existing] = await tx
        .select()
        .from(terms)
        .where(
          and(
            eq(terms.taxonomyId, taxonomy.id),
            eq(terms.locale, term.locale),
            eq(terms.slug, slug),
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
  for (const [index, item] of doc.media.entries()) {
    if (index % 25 === 0) progress(`Media ${index + 1}/${doc.media.length}`);
    try {
      const data = await options.readFile(item.file);
      const view = await options.media.upload(
        siteId,
        auth,
        { filename: item.filename, data },
        '127.0.0.1',
      );
      if (item.alt || item.caption) {
        await options.media.update(siteId, auth, view.id, {
          ...(item.alt ? { alt: item.alt } : {}),
          ...(item.caption ? { caption: item.caption } : {}),
        });
      }
      mediaTargets.set(item.ref, { id: view.id, url: view.url });
      for (const url of item.urls ?? []) {
        urlMap.set(url, { id: view.id, url: view.url });
        // WordPress's resized copies and scaled originals point to it too.
        urlMap.set(mediaUrlKey(url), { id: view.id, url: view.url });
      }
      count(report, 'media');
    } catch (error) {
      report.errors.push(`Media "${item.filename}" not imported: ${message(error)}`);
    }
  }
  await options.media.idle();

  // ---- Entries ---------------------------------------------------------------------
  const entryIds = new Map<string, { id: string }>();
  const ordered = orderByParent(doc.entries);
  for (const [index, entry] of ordered.entries()) {
    if (index % 50 === 0) progress(`Entries ${index + 1}/${ordered.length}`);
    try {
      // Imported before (the same file again, or a later export of the same site):
      // kept as it is, only the comments it lacks are added.
      const already = await run((tx) => findImported(tx, entry));
      if (already) {
        entryIds.set(entry.ref, already);
        if (entry.comments?.length) {
          await run((tx) =>
            insertComments(tx, siteId, already.id, entry.comments!, userIds, report, true),
          );
        }
        count(report, 'entries', 'skipped');
        continue;
      }
      const result = await run((tx) =>
        insertEntry(tx, siteId, entry, {
          author: (entry.authorRef && userIds.get(entry.authorRef)) || options.asUserId,
          parent: entry.parentRef ? entryIds.get(entry.parentRef)?.id : undefined,
          terms: termIds,
          media: mediaTargets,
          urls: urlMap,
          report,
        }),
      );
      entryIds.set(entry.ref, result);
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

  // ---- Settings, menus, redirects --------------------------------------------------
  await run(async (tx) => {
    const values: Record<string, unknown> = {};
    if (doc.site.title) values.title = doc.site.title;
    if (doc.site.tagline) values.tagline = doc.site.tagline;
    if (doc.site.postsPerPage) values.postsPerPage = doc.site.postsPerPage;
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
    const existing = new Set(
      (await tx.select({ from: redirects.fromPath }).from(redirects)).map((r) => r.from),
    );
    // A redirect must never hide a page that exists (redirects win over routing).
    const live = new Set(
      (await tx.select().from(entries).where(ne(entries.status, 'trashed'))).map((row) =>
        data.urls.entry(row),
      ),
    );
    const add = async (from: string, to: string, status: number) => {
      const path = normalizePath(from);
      if (!path || path === to || existing.has(path) || live.has(path)) return;
      existing.add(path);
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
  await options.cache.invalidate(siteId, ['site']);
  return report;
}

// ---- Entries --------------------------------------------------------------------------

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

/** An entry imported before: same type, language, address and title, not in the trash. */
async function findImported(
  tx: SiteTransaction,
  entry: TransferEntry,
): Promise<{ id: string } | null> {
  const slug = slugify(entry.slug) || slugify(entry.title);
  if (!slug) return null;
  const [found] = await tx
    .select({ id: entries.id })
    .from(entries)
    .where(
      and(
        eq(entries.typeSlug, entry.type),
        eq(entries.locale, entry.locale),
        eq(entries.slug, slug),
        eq(entries.title, entry.title),
        ne(entries.status, 'trashed'),
      ),
    )
    .limit(1);
  return found ?? null;
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
    report: ImportReport;
  },
): Promise<{ id: string }> {
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
  const wanted = slugify(entry.slug) || slugify(entry.title) || 'entry';
  const slug = nextFreeSlug(wanted, taken);
  if (slug !== wanted) {
    context.report.warnings.push(
      `"${entry.title}": the address "${wanted}" was taken, "${slug}" used instead.`,
    );
  }

  const document = remapMedia(
    entry.document,
    context.media,
    context.urls,
    context.report,
    entry.title,
  );
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
    fields: entry.fields ?? {},
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
  return { id };
}

/** Image blocks: media refs become the imported media ids and URLs. */
function remapMedia(
  document: CxdDocument,
  media: Map<string, MediaTarget>,
  urls: Map<string, MediaTarget>,
  report: ImportReport,
  title: string,
): CxdDocument {
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
          if (typeof attrs.url === 'string') {
            report.warnings.push(
              `"${title}": image not imported, it still points to ${attrs.url}.`,
            );
          }
        }
      } else attrs = remapMediaValues(attrs, media, urls) as typeof attrs;
      return { ...block, attrs, ...(block.children ? { children: walk(block.children) } : {}) };
    });
  return { ...document, blocks: walk(document.blocks) };
}

/**
 * Media inside other blocks' attributes (e.g. a page builder's images):
 * objects `{ id: <media ref>, url }` get the imported id and address, and
 * known old addresses in `url` are replaced.
 */
function remapMediaValues(
  value: unknown,
  media: Map<string, MediaTarget>,
  urls: Map<string, MediaTarget>,
): unknown {
  if (Array.isArray(value)) return value.map((v) => remapMediaValues(v, media, urls));
  if (!value || typeof value !== 'object') return value;
  const object = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(object)) out[key] = remapMediaValues(v, media, urls);
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

/**
 * The address of a media file without what WordPress adds to its copies:
 * the size of a resized copy (`photo-1024x768.webp`), `-scaled`, the query.
 */
function mediaUrlKey(url: string): string {
  return url
    .replace(/[?#].*$/, '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/-(?:\d+x\d+|scaled)(\.[a-z0-9]+)$/i, '$1');
}

/** An imported media file by an old address, or by the address of one of its copies. */
function mediaByUrl(urls: Map<string, MediaTarget>, url: string): MediaTarget | undefined {
  return urls.get(url) ?? urls.get(mediaUrlKey(url));
}

// ---- Helpers --------------------------------------------------------------------------

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

/**
 * Blocks of other WordPress plugins, kept as `core/imported` placeholders by
 * the conversion: replaced by an active plugin's blocks (inner blocks first),
 * or by their content, with a warning for each kind left.
 */
async function resolveImportedBlocks(
  entries: { document: CxdDocument }[],
  options: Pick<ImportOptions, 'importBlock'>,
  report: ImportReport,
): Promise<void> {
  const left = new Map<string, number>();
  const resolve = async (blocks: CxdBlock[]): Promise<CxdBlock[]> => {
    const out: CxdBlock[] = [];
    for (const block of blocks) {
      const children = block.children ? await resolve(block.children) : undefined;
      if (block.type !== IMPORTED_BLOCK) {
        out.push(children ? { ...block, children } : block);
        continue;
      }
      const { name, attrs, html, fallback } = block.attrs as {
        name?: string;
        attrs?: Record<string, unknown>;
        html?: string;
        fallback?: CxdBlock[];
      };
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
}
