import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import type { TransferDocumentInput } from '@cleitext/blocks/transfer';
import type {
  FieldDefinition,
  FieldGroupInput,
  FieldGroupView,
  FieldObject,
  FieldTypeDefinition,
  FieldValueKind,
  FieldValues,
  Label,
  LocationScreen,
  MenuItemField,
  OptionsPageInput,
  OptionsPageView,
  ZoneItem,
} from '@cleitext/shared';
import type { PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type { ReactNode } from 'react';
import type {
  EntryAuthor,
  HeadTag,
  Pagination,
  PublicEntry,
  PublicEntrySummary,
  ThemeDefinition,
  ThemeSettingsSection,
} from '@cleitext/theme-sdk';
import type {
  FormChallengeContext,
  FormVerifyContext,
  FormVerifyResult,
  FormReleasedEvent,
  HookApi,
  RenderHookContext,
  WxrMetaInput,
} from './hooks.js';

/** A site, as plugins see it. */
export interface PluginSite {
  id: string;
  name: string;
  defaultLocale: string;
  /** Content languages, the default first (only the default without a language plugin). */
  locales: string[];
  /**
   * Public addresses end with a slash (`/about/`, the core `trailingSlash`
   * setting; plugin API 1.37). Missing on older cores.
   */
  trailingSlash?: boolean;
}

export interface PluginLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ---- Content ------------------------------------------------------------------------

/** A content type added by a plugin, like WordPress's `register_post_type`. */
export interface ContentTypeDefinition {
  /** e.g. `event`. Unique on the site. */
  slug: string;
  /** Plural label, e.g. `{ en: 'Events', it: 'Eventi' }`. */
  name: Label;
  hierarchical?: boolean;
  /** Public address pattern: `{slug}`, `{path}`, `{year}`, `{month}`. Default `/<type>/{slug}`. */
  permalink?: string;
  /** Custom fields, edited in the entry sidebar and stored with the entry. */
  fields?: FieldDefinition[];
  /**
   * `false`: entries have no public address and stay out of sitemaps,
   * search and the admin sidebar (e.g. templates the plugin uses itself).
   */
  public?: boolean;
}

/**
 * A taxonomy added by a plugin, like WordPress's `register_taxonomy`
 * (plugin API 1.13): its archives are at `/<slug>/<term>`, and it is hidden
 * while the plugin is not active.
 */
export interface TaxonomyDefinition {
  /** e.g. `brand`. Unique on the site; also the first segment of its archives. */
  slug: string;
  /** Plural label, e.g. `{ en: 'Brands', it: 'Marchi' }`. */
  name: Label;
  /** Terms have parents (like categories). */
  hierarchical?: boolean;
  /** Content types whose entries take these terms. */
  types: string[];
  /** Custom fields of each term (e.g. an image), edited with the term. */
  fields?: FieldDefinition[];
}

/**
 * Extra fields on existing content types, stored under `fields[<id>]`.
 * Since plugin API 1.47 it may also have `location` rules and the other
 * settings of `ctx.fields.addGroup` (then `types` may be left out).
 */
export interface FieldGroupDefinition extends Partial<
  Omit<FieldGroupInput, 'id' | 'title' | 'fields'>
> {
  /** Key of the stored values; must start with the plugin slug, e.g. `seo`. */
  id: string;
  title: Label;
  /** Content types that show the group; `'*'` for all of them (API 1.24). */
  types?: string[];
  fields: FieldDefinition[];
}

export interface PluginEntry {
  id: string;
  type: string;
  locale: string;
  slug: string;
  title: string;
  status: string;
  /** Public address (also for drafts, where it is the future address). */
  url: string;
  /** Parent entry of hierarchical types (pages), or null. */
  parentId: string | null;
  publishedAt: string | null;
  fields: FieldValues;
  /** Ids of its terms by taxonomy slug (plugin API 1.13). */
  terms: Record<string, string[]>;
  /** Its featured image (plugin API 1.13). */
  featuredMediaId: string | null;
  /** The block document (with `withDocument` in the query): the published one, or the latest. */
  document?: CxdDocument;
}

export interface EntryQuery {
  type?: string;
  locale?: string;
  /** Only published entries unless `any` (default `published`). */
  status?: 'published' | 'any';
  ids?: string[];
  /** Default 50, at most 200. */
  limit?: number;
  /** Also return each entry's block document. */
  withDocument?: boolean;
}

/** A taxonomy term, as plugins see it. */
export interface PluginTerm {
  id: string;
  /** Taxonomy slug, e.g. `category`. */
  taxonomy: string;
  locale: string;
  slug: string;
  name: string;
  parentId: string | null;
  /** Public address of the term archive. */
  url: string;
  description: string | null;
  /** Values of the taxonomy's custom fields (plugin API 1.13). */
  fields: FieldValues;
  /** Manual order among siblings (plugin API 1.13). */
  position: number;
  /** Published entries with the term, with `withCounts` (plugin API 1.22). */
  count?: number;
}

export interface TermQuery {
  taxonomy?: string;
  locale?: string;
  ids?: string[];
  /** Default 100, at most 500. */
  limit?: number;
  /** Also count the published entries of each term (plugin API 1.22), e.g. for a tag cloud. */
  withCounts?: boolean;
}

/** Options of a copy made on behalf of a user, whose permissions apply. */
export interface CopyOptions {
  /** The user doing it (e.g. `request.user.id`): their rights are checked and audited. */
  userId: string;
  /** Language of the copy; the source's when omitted. */
  locale?: string;
}

export interface ContentApi {
  /** Adds a content type to the sites where the plugin is active (needs `content:write`). */
  registerType(definition: ContentTypeDefinition): void;
  /** Adds a taxonomy to the sites where the plugin is active (needs `content:write`). */
  registerTaxonomy(definition: TaxonomyDefinition): void;
  /** Adds fields to existing content types (needs `content:write`). */
  registerFieldGroup(definition: FieldGroupDefinition): void;
  /** Reads entries of a site, newest first (needs `content:read`). */
  find(siteId: string, query?: EntryQuery): Promise<PluginEntry[]>;
  get(siteId: string, id: string): Promise<PluginEntry | null>;
  /**
   * The other versions of an entry in other languages, from the site's
   * language plugin; none without one (plugin API 1.21, needs `content:read`).
   */
  translations(siteId: string, id: string): Promise<TranslationLink[]>;
  /**
   * Copies an entry as a new draft, with its content, fields, excerpt and
   * featured image, e.g. into another language (needs `content:write`).
   * The parent becomes the parent's copy in that language, when there is one.
   */
  copy(siteId: string, id: string, options: CopyOptions): Promise<PluginEntry>;
  /**
   * Saves new values of some custom fields of an entry, as a new revision by
   * the given user (needs `content:write`). Other fields keep their values.
   */
  updateFields(
    siteId: string,
    id: string,
    values: FieldValues,
    options: { userId: string },
  ): Promise<void>;
  /**
   * Saves a new revision of an entry with a new title, excerpt, block
   * document and/or custom fields, as the given user (needs `content:write`).
   * The document is validated like one saved from the editor.
   */
  update(
    siteId: string,
    id: string,
    changes: { title?: string; excerpt?: string | null; document?: unknown; fields?: FieldValues },
    options: { userId: string },
  ): Promise<void>;
  /** The latest saved version of an entry: title, excerpt, document and fields (needs `content:read`). */
  revision(
    siteId: string,
    id: string,
  ): Promise<{
    title: string;
    excerpt: string | null;
    document: unknown;
    fields: FieldValues;
  } | null>;
  /** Custom fields of a content type on the site: its own and the plugin field groups. */
  fields(
    siteId: string,
    type: string,
  ): Promise<{ fields: FieldDefinition[]; groups: { id: string; fields: FieldDefinition[] }[] }>;
}

export interface TermsApi {
  /** Reads terms of a site (needs `content:read`). */
  find(siteId: string, query?: TermQuery): Promise<PluginTerm[]>;
  /**
   * Saves new values of some fields of a term (plugin API 1.47, needs
   * `content:write`): the taxonomy's own fields and field groups
   * (`{ <group id>: { ... } }`), checked like the admin's. Others keep theirs.
   */
  updateFields?(siteId: string, id: string, values: FieldValues): Promise<void>;
  /**
   * Copies a term, e.g. into another language (needs `content:write`).
   * `parentId` is the parent of the copy, in the copy's language.
   */
  copy(
    siteId: string,
    id: string,
    options: CopyOptions & { name?: string; parentId?: string | null },
  ): Promise<PluginTerm>;
}

// ---- Languages ----------------------------------------------------------------------

/** A language of a site's content. */
export interface ContentLocale {
  /** e.g. `it`, `en`, `pt-BR`. */
  code: string;
  /** e.g. `Italiano`. */
  name: string;
  /** Address prefix: `''` for the default language, e.g. `/en` for the others. */
  prefix: string;
  isDefault: boolean;
  /**
   * A domain of its own, e.g. `example.de`, instead of a prefix. It must be
   * one of the site's domains (not the primary one); others are ignored.
   */
  host?: string;
}

export type TranslatableKind = 'entry' | 'term';

/** Another version of an item, in another language. */
export interface TranslationLink {
  id: string;
  locale: string;
}

/**
 * What a language plugin tells the core. Without one, a site has only its
 * default language, and the core does no multilingual work at all.
 */
export interface LanguageProvider {
  /** The site's languages. The core puts the default first and gives it no prefix. */
  locales(siteId: string): ContentLocale[] | Promise<ContentLocale[]>;
  /** For each id, the other items of its translation group. Ids without any may be left out. */
  translations(
    siteId: string,
    kind: TranslatableKind,
    ids: string[],
  ): Record<string, TranslationLink[]> | Promise<Record<string, TranslationLink[]>>;
  /**
   * Optional, for lists in a language other than the default one (home,
   * posts page, search, feeds): `null` lists only that language's entries;
   * an array also lists the default language's entries, except those
   * translated into it (the ids given: entries with a version in `locale`).
   */
  fallback?(siteId: string, locale: string): string[] | null | Promise<string[] | null>;
}

export interface LanguageUsage {
  entries: number;
  terms: number;
  menus: number;
}

/**
 * Languages and translation links the core holds for a language plugin:
 * from before M7, or from an imported site. Groups are opaque ids shared by
 * the items that translate each other.
 */
export interface PendingLanguages {
  locales: {
    code: string;
    name: string;
    isDefault?: boolean;
    position?: number;
    urlPrefix?: string | null;
  }[];
  entries: { id: string; group: string }[];
  terms: { id: string; group: string }[];
}

export interface LanguagesApi {
  /** Makes the plugin the language provider of the sites where it is active (needs `languages`). */
  provide(provider: LanguageProvider): void;
  /** Entries, terms and menus in each language that has any (needs `languages`). */
  usage(siteId: string): Promise<Record<string, LanguageUsage>>;
  /** The site's default language, kept by the core (needs `languages`). */
  defaultLocale(siteId: string): Promise<string>;
  /** Changes the site's default language, which must be one of its languages (needs `languages`). */
  setDefault(siteId: string, code: string): Promise<void>;
  /** Drops the core's cached languages of a site after they change (needs `languages`). */
  changed(siteId: string): Promise<void>;
  /** Language data waiting for a plugin; the action `languages.pending` says when some arrives. */
  pending(siteId: string): Promise<PendingLanguages | null>;
  /** Forgets the pending data once taken over. */
  clearPending(siteId: string): Promise<void>;
}

/**
 * Secrets of the plugin per site, e.g. an API key (needs `settings:own`).
 * Encrypted in the database with a key derived from the server's APP_SECRET.
 */
/**
 * Work done again and again (plugin API 1.18), e.g. cancelling unpaid
 * orders: `ctx.schedule.every('cancel-unpaid', 15, async (siteId) => …)`.
 * The handler runs for each site where the plugin is active, about every
 * `minutes` (at least 1), in every server process: it must be harmless when
 * two run at once.
 */
export interface ScheduleApi {
  every(name: string, minutes: number, handler: (siteId: string) => Promise<void> | void): void;
}

/** A comment as plugins see it (plugin API 1.19). */
export interface PluginComment {
  id: string;
  entryId: string;
  parentId: string | null;
  /** `comment`, or a plugin's own type such as `review`. */
  type: string;
  status: 'pending' | 'approved' | 'spam' | 'trash';
  userId: string | null;
  authorName: string;
  /** Plain text. */
  content: string;
  /** The plugin's data, e.g. `{ rating: 5 }`. */
  meta: Record<string, unknown>;
  createdAt: string;
}

/**
 * Comments of a site (needs `comments`, plugin API 1.19): reviews, questions…
 * Plugins post comments of their own type for the visitor of a request, with
 * the core's moderation, spam checks, limits and notifications. Comments of
 * other types than `comment` never appear in the entries' comment threads.
 */
export interface CommentsApi {
  find(
    siteId: string,
    query: {
      entryId?: string;
      type?: string;
      /** Default `approved`. */
      status?: PluginComment['status'] | 'any';
      userId?: string;
      authorEmail?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<PluginComment[]>;
  /**
   * Posts a comment of the plugin's type for the visitor of `request` (signed
   * in or a guest with name and email). The entry must be published; whether
   * it takes comments is the plugin's call. Fails with an error whose message
   * the visitor can read (in their language) and a `status` (400, 403, 429).
   */
  post(
    request: RouteRequest,
    input: {
      entryId: string;
      type: string;
      content: string;
      meta?: Record<string, unknown>;
      authorName?: string;
      authorEmail?: string;
    },
  ): Promise<{ id: string; status: PluginComment['status'] }>;
  /**
   * Moves comments of any type to a status (plugin API 1.45), as the
   * moderation screen does: counts, the page cache, the `comment.status`
   * action and the emails follow. With `userId` the plugin acts for that
   * person, who must be able to moderate comments; without it, for itself
   * (e.g. a scheduled task). `origin` (`https://example.com`) makes the
   * links of the emails. Gives how many comments it found.
   */
  setStatus(
    siteId: string,
    input: {
      ids: string[];
      status: PluginComment['status'];
      origin: string;
      userId?: string;
    },
  ): Promise<number>;
  /**
   * Deletes comments for good (plugin API 1.45): only those in the spam or
   * the trash, at most 500 at a time; replies move up a level. Gives how
   * many were deleted.
   */
  remove(siteId: string, input: { ids: string[]; userId?: string }): Promise<number>;
}

export interface SecretsApi {
  set(siteId: string, name: string, value: string): Promise<void>;
  /** The value, or null when unset (or APP_SECRET changed). */
  get(siteId: string, name: string): Promise<string | null>;
  delete(siteId: string, name: string): Promise<void>;
}

/**
 * Small values of the plugin per site, e.g. a migration marker (needs
 * `settings:own`). Stored next to the plugin settings.
 */
export interface StorageApi {
  get<T = unknown>(siteId: string, key: string): Promise<T | null>;
  set(siteId: string, key: string, value: unknown): Promise<void>;
  delete(siteId: string, key: string): Promise<void>;
}

// ---- Media --------------------------------------------------------------------------

/** An item of the media library, as plugins see it. */
export interface PluginMedia {
  id: string;
  /** Public path, e.g. `/media/…`. */
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  /** Alternative text by language. */
  alt: Record<string, string>;
}

export interface MediaApi {
  /** One item of the site's media library (needs `media:read`). */
  get(siteId: string, id: string): Promise<PluginMedia | null>;
  /**
   * Downloads a picture or a document from a public address into the site's
   * library, as uploaded by `userId` (needs `media:write`, plugin API 1.30).
   * Only public http(s) addresses, as large as uploads may be; a file already
   * in the library is reused. Throws when the address cannot be read or the
   * file is not allowed.
   */
  fromUrl(
    siteId: string,
    url: string,
    options: { userId: string; alt?: string; filename?: string },
  ): Promise<PluginMedia>;
}

/**
 * A member of a site as plugins see it (plugin API 1.42), e.g. to mention
 * people in notes and email them.
 */
export interface PluginUser {
  id: string;
  displayName: string;
  /**
   * The address only when its owner confirmed it (a confirmed sign-up, an
   * accepted invitation or a password reset by email); null otherwise.
   */
  email: string | null;
  /** The profile picture, or Gravatar when the site uses it; null for initials. */
  avatarUrl: string | null;
  /** The slug of the person's role on the site, e.g. `editor`. */
  role: string;
}

/** What `ctx.users.find` looks for (plugin API 1.42). */
export interface UserQuery {
  /** Words of the name, or of a confirmed address (case-insensitive). */
  search?: string;
  /** Only these people (at most 100 ids). */
  ids?: string[];
  /** Only people with this role slug. */
  role?: string;
  /** Default 20, at most 100. */
  limit?: number;
  offset?: number;
}

/**
 * The site's members, read-only (needs `users:read`, plugin API 1.42). Only
 * active accounts of the site, sorted by name; missing on older cores, so
 * call it as `ctx.users?.find(...)` there.
 */
export interface UsersApi {
  find(siteId: string, query?: UserQuery): Promise<PluginUser[]>;
  /** One member of the site; null for anyone else. */
  get(siteId: string, id: string): Promise<PluginUser | null>;
  /**
   * The person's values of the site's user fields (plugin API 1.47), by
   * group: `{ <group id>: { ... } }`.
   */
  fields?(siteId: string, id: string): Promise<FieldValues>;
  /**
   * Saves new values of some user fields (plugin API 1.47, also needs
   * `content:write`), checked against the groups shown for the person.
   * Other values are kept.
   */
  updateFields?(siteId: string, id: string, values: FieldValues): Promise<void>;
}

// ---- Fields (plugin API 1.47) -------------------------------------------------------------

/**
 * Custom fields (plugin API 1.47): field types, field groups with location
 * rules, and the groups of the site's owners. Missing on older cores: call
 * it as `ctx.fields?.addGroup(...)` there.
 */
export interface FieldsApi {
  /**
   * A field type of the plugin, named `<slug>/<name>` (e.g. `campus/gallery`):
   * its settings, how values are checked, formatted for templates, indexed
   * and exported. The admin draws it with the component given in
   * `defineAdminPlugin({ fieldTypes })`. While the plugin is not active,
   * values are kept and shown read-only. No permission needed.
   */
  registerType(definition: FieldTypeDefinition): void;
  /**
   * A field group shown where its `location` rules match, on the sites where
   * the plugin is active (needs `content:write`). Its id starts with the
   * plugin slug; adding it again replaces it. It can be called at any time.
   */
  addGroup(group: FieldGroupInput): void;
  /** Removes a group added with `addGroup`. */
  removeGroup(id: string): void;
  /**
   * Groups computed for each site, e.g. from the plugin's own data (needs
   * `content:write`): called whenever groups are needed, so keep it fast
   * (cache what it reads). Ids start with the plugin slug.
   */
  provideGroups(provider: (siteId: string) => FieldGroupInput[] | Promise<FieldGroupInput[]>): void;
  /**
   * Every group of a site for an object (all objects when omitted): the
   * owners', the plugins' and the theme's, with their rules (needs `content:read`).
   */
  groups(siteId: string, object?: FieldObject): Promise<FieldGroupView[]>;
  /** The groups whose rules match what is edited, in order (needs `content:read`). */
  matching(siteId: string, screen: LocationScreen): Promise<FieldGroupView[]>;
  /**
   * The groups of the site's owners (stored by the core, also edited with
   * the REST API `/field-groups`): read, saved and deleted by a visual
   * builder (needs `content:write`). Saving checks the group like the API.
   */
  siteGroups: {
    list(siteId: string): Promise<FieldGroupInput[]>;
    save(siteId: string, group: FieldGroupInput): Promise<FieldGroupInput>;
    remove(siteId: string, id: string): Promise<void>;
  };
  /**
   * An options page of the plugin (plugin API 1.48; missing on older cores,
   * call it as `ctx.fields.addOptionsPage?.(…)`), on the sites where the
   * plugin is active: a page of the admin menu (or under `parent`) with a
   * save button, showing its own `fields` and the field groups whose
   * `optionsPage` rule names it. Its slug starts with the plugin slug;
   * adding it again replaces it. Needs `content:write`.
   */
  addOptionsPage?(page: OptionsPageInput): void;
  removeOptionsPage?(slug: string): void;
  /** Every options page of a site: the owners', the plugins', the theme's (needs `content:read`). */
  optionsPages?(siteId: string): Promise<OptionsPageView[]>;
  /**
   * The options pages of the site's owners (stored by the core, also edited
   * with the REST API `/options-pages`), for a visual builder (needs `content:write`).
   */
  siteOptionsPages?: {
    list(siteId: string): Promise<OptionsPageInput[]>;
    save(siteId: string, page: OptionsPageInput): Promise<OptionsPageInput>;
    remove(siteId: string, slug: string): Promise<void>;
  };
  /**
   * The values of an options page, as stored (own fields at the top, each
   * group's under its id), in a language (default: the site's default one;
   * other languages give their translations of translatable fields). Needs
   * `content:read`.
   */
  options?(siteId: string, page: string, options?: { locale?: string }): Promise<FieldValues>;
  /**
   * The fields of a plugin block (plugin API 1.49; missing on older cores):
   * those of the groups whose `block` rule names it (e.g. `myplugin/hero`),
   * in order, the first of a name winning. The block editor shows them with
   * `useBlockFields(name)` of the admin SDK. Needs `content:read`.
   */
  blockFields?(
    siteId: string,
    block: string,
  ): Promise<{ fields: FieldDefinition[]; groups: FieldGroupView[] }>;
  /**
   * Saves new values of an options page (needs `content:write`), checked like
   * the admin's; other values are kept. In a language other than the
   * default one, only translatable fields are saved, for that language.
   */
  updateOptions?(
    siteId: string,
    page: string,
    values: FieldValues,
    options?: { locale?: string },
  ): Promise<FieldValues>;
}

// ---- Dynamic data (plugin API 1.47) ---------------------------------------------------

/** What is shown, for a dynamic source: the page, or a given entry, term or person. */
export interface DynamicContext {
  locale: string;
  /** The page being rendered, as blocks see it. */
  page?: BlockPage;
  /** An entry (default: the page's). */
  entry?: { id: string };
  /** A term (default: the archive's). */
  term?: { id: string };
  /** A person (default: the author of the archive, or of the entry shown). */
  user?: { id: string };
  /** The row of a list shown (Field rows, plugin API 1.48): `row.field:<name>` reads it. */
  row?: Record<string, unknown>;
}

/**
 * A value pages can show in place of a fixed one: Fresco's dynamic tags,
 * block bindings and themes read the same sources. The core's are the
 * entry's (`entry.title`, `entry.url`, `entry.excerpt`, `entry.date`,
 * `entry.featuredImage`), the term's (`term.name`, `term.description`,
 * `term.url`), the site's (`site.title`, `site.tagline`, `site.url`) and
 * every custom field: `entry.field:<name>` (or `<group>.<name>`),
 * `term.field:…`, `user.field:…`; since plugin API 1.48 options pages'
 * (`option.field:<page>.<name>`, `<page>.<group>.<name>`) and list rows'
 * (`row.field:<name>`).
 */
export interface DynamicSource {
  /** Unique; a plugin's start with its slug and `:` (e.g. `shop:price`). */
  id: string;
  label: Label;
  /** Heading of pickers, e.g. `Entry`, `Fields`. */
  group?: Label;
  /** What the value is (pickers offer media sources to image controls…). */
  type: FieldValueKind;
  /**
   * Lists (plugin API 1.48): what each row is, for the Field rows block —
   * rows of fields (their `row.field:<name>` sources in `rows`), or related
   * entries, terms or members.
   */
  rowKind?: 'fields' | 'entry' | 'term' | 'user';
  rows?: Omit<DynamicSource, 'resolve'>[];
  /**
   * Resolved but left out of the lists of pickers (plugin API 1.49), e.g. an
   * old id kept for content that still uses it.
   */
  hidden?: boolean;
  /** The value, formatted as `useField` gives it; undefined when there is none. */
  resolve(context: DynamicContext & { siteId: string }): unknown;
}

/** A source as pickers list it. */
export type DynamicSourceInfo = Omit<DynamicSource, 'resolve'>;

/** Dynamic data sources (plugin API 1.47). No permission needed. */
export interface DynamicApi {
  /** A source on the sites where the plugin is active. */
  registerSource(source: DynamicSource): void;
  /** Sources computed for each site, e.g. from the plugin's data. */
  registerProvider(provider: (siteId: string) => DynamicSource[] | Promise<DynamicSource[]>): void;
  /** The sources of a site: the core's, its fields', then the plugins'. */
  sources(siteId: string): Promise<DynamicSourceInfo[]>;
  /** The value of a source; undefined when it has none (or the source is unknown). */
  resolve(siteId: string, id: string, context: DynamicContext): Promise<unknown>;
}

// ---- Blocks -------------------------------------------------------------------------

/** The page being rendered, for blocks that show its data (a theme builder's widgets). */
export interface BlockPage {
  route: 'entry' | 'archive' | 'search' | '404' | 'maintenance';
  site: {
    title: string;
    tagline: string;
    home: string;
    /** The logo chosen in the theme's settings (plugin API 1.41), when there is one. */
    logo?: BlockPageLogo;
  };
  /**
   * The signed-in visitor (plugin API 1.41), missing for everyone else. Pages
   * of signed-in visitors are never cached, so blocks may show it (a "Hello,
   * Ann" or an avatar); for visitors who are not signed in the same page is
   * cached and shared, so show nothing personal without it.
   */
  user?: BlockPageUser;
  /** Query parameters of the address (plugin API 1.11), e.g. a loop's page number. */
  params?: Record<string, string>;
  /** Entry pages: the entry shown. */
  entry?: PublicEntry;
  /** Archives (and the latest posts on the home page). */
  archive?: {
    title: string;
    description?: string;
    term?: { taxonomy: string; slug: string; name: string; description: string | null };
    contentType?: string;
    /** Author archives (plugin API 1.12). */
    author?: EntryAuthor & { slug: string };
    entries: PublicEntrySummary[];
    pagination: Pagination;
    /**
     * Archives of plugin pages (plugin API 1.20): the plugin's own listing,
     * to show where an archive's entries go. `entries` is then empty.
     */
    html?: string;
  };
  /** Search results. */
  search?: { query: string; entries: PublicEntrySummary[]; pagination: Pagination };
}

/** The site's logo as blocks see it (plugin API 1.41). */
export interface BlockPageLogo {
  /** The media file's id. */
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  /** Its alternative text, or the site title. */
  alt: string;
}

/** The signed-in visitor as blocks see it (plugin API 1.41). */
export interface BlockPageUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  email?: string;
  /** Their role on the site, e.g. `{ slug: 'editor', name: 'Editor' }`; null for none. */
  role: { slug: string; name: string } | null;
}

/** Published entries for a listing (loops, related posts), like `WP_Query`. */
export interface PublicQuery {
  /** Content types; all public ones when left out. */
  type?: string | string[];
  /** Entries with at least one of these terms. */
  terms?: { taxonomy: string; slugs: string[] };
  ids?: string[];
  exclude?: string[];
  /** Newest first by default; `order` is the manual order of the admin (plugin API 1.31). */
  orderBy?: 'date' | 'title' | 'modified' | 'random' | 'order';
  order?: 'asc' | 'desc';
  /** Default 10, at most 100. */
  limit?: number;
  offset?: number;
}

export interface BlockLoadContext {
  siteId: string;
  locale: string;
  /**
   * Published entries of the site in the page's language, as themes get
   * them (plugin API 1.11). The page refreshes when entries of those types
   * change. `total` counts all matches, for pagination.
   */
  query(query: PublicQuery): Promise<{ entries: PublicEntry[]; total: number }>;
  /** The page being rendered. */
  page: BlockPage;
  /** The entry being rendered, if any. */
  entry?: { id: string; type: string };
  /** Adds a page-cache tag, e.g. `type:event`, so the page refreshes with that data. */
  tag(tag: string): void;
  /**
   * The visitor is signed in (plugin API 1.38), e.g. for
   * `ctx.forms.challenge`. Their pages are never cached.
   */
  signedIn?: boolean;
  /**
   * Media of the library by id, as `context.media` gives them in `render`
   * (resized variants, focal point, alternative text in the page's
   * language), for media named by the plugin's own data rather than by the
   * block's attributes (plugin API 1.46; missing on older cores). Unknown
   * ids are left out; at most 200 ids.
   */
  loadMedia?(ids: string[]): Promise<ReadonlyMap<string, BlockMedia>>;
  /**
   * Renders blocks as the page would (plugin API 1.49; missing on older
   * cores): core blocks, plugin blocks, bindings and the Field and Field
   * rows blocks, resolved against the page and `scope`, e.g. a template of
   * the plugin shown with its own data as the row (`row.field:<name>`).
   * Gives the HTML to place in `render` (with `dangerouslySetInnerHTML`);
   * the CSS of the blocks goes to the page. Blocks are checked as saved
   * documents are; nested calls stop after a few levels.
   */
  renderBlocks?(blocks: CxdBlock[], options?: RenderBlocksOptions): Promise<string>;
}

/** What `renderBlocks` resolves bindings against (plugin API 1.49). */
export interface RenderBlocksOptions {
  /**
   * The row shown: `row.field:<name>` sources read it. Values as templates
   * get them (formatted, e.g. a media field's `{ id, url, alt… }`).
   */
  row?: Record<string, unknown>;
  /** The definitions of the row's fields: what each value is (an image, rich text, rows…). */
  fields?: FieldDefinition[];
  /** An entry, term or person instead of the page's. */
  entry?: { id: string };
  term?: { id: string };
  user?: { id: string };
}

export interface BlockRenderContext {
  siteId: string;
  locale: string;
  /** The page being rendered. */
  page: BlockPage;
  /** Media preloaded for the page (those listed by `media`), by id. */
  media: ReadonlyMap<string, BlockMedia>;
  /** The site's menus in the page's language, by theme location (e.g. `primary`). */
  menus: Readonly<Record<string, BlockMenuItem[]>>;
  /**
   * Rendered for an editor's preview of the block (`POST /blocks/preview`,
   * e.g. in Fresco's canvas), not for a page (plugin API 1.36): a block that
   * shows nothing until its script runs can show a placeholder instead.
   */
  preview?: boolean;
}

/** A menu item as blocks see it. */
export interface BlockMenuItem {
  id: string;
  label: string;
  url: string;
  target?: '_blank';
  /** Points to the current page or one of its ancestors. */
  current: boolean;
  children: BlockMenuItem[];
}

/** A media file as blocks see it: the original and its resized variants. */
export interface BlockMedia {
  id: string;
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  alt: string;
  variants: { variant: string; format: string; url: string; width: number; height: number }[];
  focalPoint?: { x: number; y: number } | null;
}

/**
 * A block contributed by a plugin. Its attributes are described with the
 * field DSL: every editor builds the editing form from them, so the block
 * does not depend on a particular editor.
 */
export interface PluginBlockDefinition<A extends object = FieldValues, D = undefined> {
  /** `<plugin-slug>/<name>`, e.g. `events/upcoming`. */
  type: string;
  title: Label;
  description?: Label;
  /** Dashicon name shown in the editor, e.g. `calendar`. */
  icon?: string;
  category?: 'text' | 'media' | 'design' | 'widgets' | 'embed';
  /** Attribute schema version, for future migrations. Default 1. */
  version?: number;
  attributes?: FieldDefinition[];
  /**
   * `json` (plugin API 1.23): a block with its own editor, registered by the
   * plugin's `editor` entry with `registerBlockType`. Its attributes are any
   * JSON object (at most 64 KB), as the editor saves them, instead of
   * `attributes` fields; `render` must accept whatever it finds.
   */
  schema?: 'fields' | 'json';
  /**
   * Attributes edited as rich text (`RichText` in the editor), stored as CXD
   * inline nodes: render them with `inlineToHtml` (plugin API 1.23).
   */
  richAttributes?: string[];
  /** Loads data before rendering (rendering itself is synchronous). */
  load?(attrs: A, context: BlockLoadContext): Promise<D>;
  /**
   * Server-side render for the public site. No client JavaScript. Container
   * blocks get their rendered `children` to place.
   */
  render(props: {
    attrs: A;
    data: D;
    block: CxdBlock;
    context: BlockRenderContext;
    children?: ReactNode;
    /** Container blocks: each child rendered on its own (to wrap them one by one). */
    items?: ReactNode[];
  }): ReactNode;
  /**
   * The block holds other blocks (`block.children`), rendered by Cleitext
   * and passed to `render` as `children`. Such blocks, and those with
   * `wrapper: false`, render inside the page: `render` must not throw.
   */
  container?: boolean;
  /**
   * Without the `<div class="wp-block-<plugin>-<name>">` wrapper (e.g. for
   * flex and grid layouts). Default true, except for containers.
   */
  wrapper?: boolean;
  /**
   * Attributes holding raw HTML. When the author cannot publish unfiltered
   * HTML, they are cleaned on save, like the Custom HTML block.
   */
  html?: string[];
  /** Media ids used by an instance, preloaded into `context.media`. */
  media?(attrs: A): string[];
  /**
   * CSS for one instance (e.g. its own colors and sizes, scoped by its id).
   * The CSS of all instances on a page goes into one `<style>` in `<head>`.
   */
  css?(props: { attrs: A; block: CxdBlock; context: BlockRenderContext }): string;
}

export interface BlockApi {
  /** Needs the `blocks` permission. */
  register<A extends object, D>(definition: PluginBlockDefinition<A, D>): void;
}

// ---- Routes -------------------------------------------------------------------------

export interface RouteRequest {
  siteId: string;
  method: string;
  path: string;
  params: Record<string, string>;
  /** Query parameters; the last one when a name repeats. */
  query: Record<string, string>;
  /** Every value of each query parameter (plugin API 1.17), e.g. `?brand=a&brand=b`. */
  queryAll: Record<string, string[]>;
  /** Parsed JSON or form body. */
  body: unknown;
  /** The body as received (JSON and forms), e.g. to check a webhook signature. */
  rawBody: Buffer | null;
  ip: string;
  /** Signed-in user, if any. */
  user: { id: string; displayName: string; capabilities: string[] } | null;
  headers: Record<string, string | undefined>;
  /**
   * The plugin's own cookies (plugin API 1.14): only those named
   * `<slug>_…`, e.g. `shop_cart`. Others (the session among them) are never given.
   */
  cookies: Record<string, string>;
  /** The site's address as the visitor reached it, e.g. `https://example.com` (plugin API 1.16). */
  origin: string;
  /**
   * Public routes: the language of the address (plugin API 1.14). A route
   * `/cart` also answers `/it/cart` on a site with Italian, with `it` here.
   */
  locale: string;
  /**
   * The `file` field of a multipart/form-data request (the admin's `uploadFile`),
   * within the server's upload limit; null when the request has none.
   */
  file(): Promise<UploadedFile | null>;
}

export interface UploadedFile {
  filename: string;
  mime: string;
  data: Buffer;
}

export interface RouteResponse {
  status?: number;
  /** A string or a Buffer (plugin API 1.10) is sent as is; anything else as JSON. */
  body?: unknown;
  contentType?: string;
  headers?: Record<string, string>;
  /**
   * Public GET routes: cache tags; the response is cached when set, a `page`
   * too (plugin API 1.17) for visitors who are not signed in.
   */
  cacheTags?: string[];
  /**
   * Cookies to set (plugin API 1.14): names must start with `<slug>_`. They
   * are HTTP-only, `SameSite=Lax` and secure on HTTPS; `maxAge` 0 deletes one.
   */
  cookies?: { name: string; value: string; maxAge?: number }[];
  /**
   * Public routes: a page of the site in the active theme (plugin API 1.14),
   * like a cart or a checkout, with `html` as its content (the plugin's own
   * markup, trusted). Not cached unless it has `cacheTags`; `noindex` for
   * search engines unless `index` is set.
   */
  page?: PluginPageContent;
}

export interface PluginPageContent {
  title: string;
  html: string;
  /** Meta description. */
  description?: string;
  /** Shown in search engines (plugin API 1.17), e.g. a shop's catalog. */
  index?: boolean;
  /** Extra tags for the page's head, e.g. structured data (plugin API 1.17). */
  head?: HeadTag[];
  /**
   * The page lists entries like an archive (plugin API 1.20), e.g. a shop's
   * catalog or one of its categories. Hooks see it as an archive of that
   * term or content type, so theme builders apply their archive templates;
   * blocks find `html` in `page.archive`.
   */
  archive?: {
    term?: { taxonomy: string; slug: string; name: string; description?: string | null };
    /** The content type listed, e.g. `product`. */
    type?: string;
  };
}

export type RouteHandler = (request: RouteRequest) => Promise<RouteResponse> | RouteResponse;

export interface ApiRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path under `/api/v1/ext/<slug>`, with `:params`, e.g. `/forms/:id/entries`. */
  path: string;
  /** Capability required; omit with `public: true` for anonymous calls. */
  capability?: string;
  /** Anonymous access (e.g. a form submission); the request origin is still checked. */
  public?: boolean;
  /**
   * Called by other servers (payment webhooks, license clients; plugin API
   * 1.10): anonymous, no origin check, no session even with a cookie. The
   * handler must authenticate the caller itself, e.g. with a signature over
   * `rawBody`.
   */
  webhook?: boolean;
  handler: RouteHandler;
}

export interface PublicRoute {
  method: 'GET' | 'POST';
  /** Path on the public site, e.g. `/events.ics`. Matched before permalinks. */
  path: string;
  handler: RouteHandler;
}

export interface RouteApi {
  /** REST endpoint for the admin or integrations (needs `routes:admin`). */
  api(route: ApiRoute): void;
  /** Address on the public site (needs `routes:public`). */
  public(route: PublicRoute): void;
}

// ---- Settings, access, data, cache, mail --------------------------------------------

export interface SettingsApi {
  /**
   * Declares the plugin settings (needs `settings:own`). The admin shows a
   * form under Settings, stored per site in the `plugin:<slug>` namespace.
   */
  define(fields: FieldDefinition[], options?: { title?: Label; capability?: string }): void;
  /** Values for a site, with the defaults. */
  get(siteId: string): Promise<FieldValues>;
}

export interface AccessApi {
  /** A capability granted to the given roles, e.g. `['administrator', 'editor']`. */
  defineCapability(name: string, options: { label: Label; roles: string[] }): void;
}

/**
 * The plugin's own database schema (`plg_<slug>`), with a PostgreSQL role
 * that cannot see core tables. Row Level Security limits rows to the site.
 */
export interface PluginDatabase {
  transaction<T>(siteId: string, fn: (tx: PluginTransaction) => Promise<T>): Promise<T>;
}

/** A Drizzle transaction; build queries with `drizzle-orm` (shared with the host). */
export type PluginTransaction = PgTransaction<PgQueryResultHKT, Record<string, never>>;

export interface CacheApi {
  /** Drops cached pages showing these tags (e.g. `type:event`) on the site. */
  invalidate(siteId: string, tags: string[]): Promise<void>;
}

/** A file attached to an email (plugin API 1.41), from memory. */
export interface MailAttachment {
  /** Shown to the recipient; folders and line breaks are removed. */
  filename: string;
  /** The bytes (a `Buffer` works), or text written as UTF-8. */
  content: Uint8Array | string;
  /** E.g. `application/pdf`; `application/octet-stream` when missing or invalid. */
  contentType?: string;
}

/**
 * An email (needs `mail:send`). Addresses are a string (several separated by
 * commas) or a list, each a bare address or `Name <address>`; an address with
 * a line break or that is not valid makes `send` fail (header injection).
 * Subject and sender name are kept on one line. Limits (plugin API 1.41): 50
 * recipients in To, Cc and Bcc together, 10 attachments of 20 MB together,
 * 2,000,000 characters for `text` and for `html`.
 */
export interface MailMessage {
  to: string | string[];
  subject: string;
  text: string;
  /** An HTML version (plugin API 1.16), with `text` for clients without HTML. */
  html?: string;
  replyTo?: string;
  /** With it, the site's own SMTP settings are used when it has them. */
  siteId?: string;
  /**
   * The sender's address (plugin API 1.41), in place of the site's. Mail
   * servers may refuse or flag addresses of other domains (SPF, DMARC):
   * prefer `replyTo` for the visitor's address.
   */
  from?: string;
  /** The sender's name (plugin API 1.41); alone, it goes with the site's address. */
  fromName?: string;
  /** Copies (plugin API 1.41). */
  cc?: string | string[];
  /** Hidden copies (plugin API 1.41): recipients do not see them. */
  bcc?: string | string[];
  /** Files (plugin API 1.41), never read from disk or an address. */
  attachments?: MailAttachment[];
}

export interface MailApi {
  /**
   * Sends an email (needs `mail:send`). Before plugin API 1.41, only `to`,
   * `subject`, `text`, `html`, `replyTo` and `siteId` are official.
   */
  send(message: MailMessage): Promise<void>;
}

/**
 * Requests to other services (webhooks, mailing lists, chat notifications).
 * Needs `network` (plugin API 1.11). Only public https addresses: the
 * server's own network cannot be reached, redirects are not followed and
 * answers are limited to 1 MB.
 */
export interface HttpApi {
  send(request: {
    url: string;
    /** POST when left out. */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    body?: string;
    /** 10 seconds when left out, 30 at most. */
    timeoutMs?: number;
    /**
     * A file rather than text (plugin API 1.36): the answer's bytes come as
     * `base64`, up to 5 MB, and `text` is empty.
     */
    binary?: boolean;
    /**
     * The `User-Agent` sent (plugin API 1.44; printable ASCII, 200 characters
     * at most), e.g. a browser's to be given the files a browser gets.
     * `Cleitext-Plugin/<slug>` when left out, or on older cores.
     */
    userAgent?: string;
  }): Promise<{ status: number; type: string; text: string; base64?: string }>;
}

// ---- Import -------------------------------------------------------------------------

/** What an import did: counts by kind, and what was adapted or left out. */
export interface ImportReport {
  created: Record<string, number>;
  skipped: Record<string, number>;
  /** Not blocking: something was adapted or left out. */
  warnings: string[];
  /** Blocking for that record: it was not imported. */
  errors: string[];
}

export interface DocumentImportOptions {
  /** Existing user recorded as author of the import (the person who started it). */
  userId: string;
  onProgress?(message: string): void;
  /**
   * The meta of a WordPress export (plugin API 1.48; ignored by older
   * cores): given to the active plugins through `import.wxrMeta`, whose
   * field values, field groups, options pages and options are added to the
   * document before it is imported.
   */
  wxrMeta?: WxrMetaInput;
}

export interface TransferApi {
  /**
   * Imports a transfer document (`@cleitext/blocks/transfer`, built by the
   * plugin from another system's export) into a site (needs `import`):
   * entries, media, terms, menus, users and redirects. Its languages must be
   * languages of the site. Media files are downloaded from public http(s)
   * addresses only. Existing records are kept. It can take minutes: run it
   * outside the request.
   */
  importDocument(
    siteId: string,
    document: TransferDocumentInput,
    options: DocumentImportOptions,
  ): Promise<ImportReport>;
}

// ---- Privacy ------------------------------------------------------------------------

/**
 * Personal data of a person, found by email, in one place: rows of name
 * and value pairs, e.g. one row per message sent through a form.
 */
export interface PersonalDataGroup {
  /** e.g. `forms.submissions`. */
  id: string;
  label: Label;
  items: Record<string, string | number | boolean | null>[];
}

/** Finds the personal data a plugin keeps about an email address (GDPR art. 15 and 20). */
export interface PersonalDataExporter {
  /** Starts with the plugin slug, e.g. `forms`. */
  id: string;
  label: Label;
  export(siteId: string, email: string): Promise<PersonalDataGroup[]>;
}

export interface ErasureResult {
  /** Items deleted or anonymized. */
  removed: number;
  /** Items kept, e.g. for a legal obligation; say why in `messages`. */
  retained: number;
  messages?: string[];
}

/** Erases or anonymizes the personal data a plugin keeps about an email address (art. 17). */
export interface PersonalDataEraser {
  id: string;
  label: Label;
  erase(siteId: string, email: string): Promise<ErasureResult>;
}

/**
 * A service that tracks visitors (analytics, ads, pixels), declared by the
 * plugin that adds it, so that the privacy plugin can ask for consent, list
 * its cookies and describe it in the policies.
 */
export interface TrackerDeclaration {
  /** Starts with the plugin slug, e.g. `analytics.ga4`. */
  id: string;
  /** e.g. `Google Analytics 4`. */
  name: string;
  /** Who runs it, e.g. `Google Ireland Ltd`. */
  provider: string;
  category: 'preferences' | 'statistics' | 'marketing';
  /** False when it may run without consent, e.g. anonymous analytics without cookies. */
  requiresConsent: boolean;
  cookies: { name: string; duration: string; purpose: Label }[];
  /** What it does with the data, for the privacy policy (one or two sentences). */
  purpose: Label;
  /** Data may go outside the European Economic Area. */
  transfersOutsideEu?: boolean;
  /** The provider's privacy policy. */
  privacyPolicyUrl?: string;
  /** Uses Google tags: Google Consent Mode v2 should be on. */
  googleConsentMode?: boolean;
}

export interface PrivacyApi {
  /**
   * Declares the trackers the plugin adds to a site, given its settings
   * (no permission needed). Plugins that load tracking scripts should.
   */
  declareTrackers(
    provider: (siteId: string) => TrackerDeclaration[] | Promise<TrackerDeclaration[]>,
  ): void;
  /** The trackers declared by the plugins active on a site (needs `privacy`). */
  trackers(siteId: string): Promise<TrackerDeclaration[]>;
  /** Any plugin keeping personal data should register one; no permission needed. */
  registerExporter(exporter: PersonalDataExporter): void;
  registerEraser(eraser: PersonalDataEraser): void;
  /**
   * The personal data about an email on a site, from the core (account,
   * sessions, activity) and from the plugins active there (needs `privacy`).
   */
  exportPersonalData(
    siteId: string,
    email: string,
  ): Promise<{ source: string; label: Label; groups: PersonalDataGroup[] }[]>;
  /** Runs the erasers of the plugins active on the site (needs `privacy`). */
  erasePersonalData(
    siteId: string,
    email: string,
  ): Promise<({ source: string; label: Label } & ErasureResult)[]>;
}

// ---- Plugin -------------------------------------------------------------------------

/** A file of the plugin's `public` folder added to public pages. */
export interface PublicAsset {
  /** Path inside the `public` folder: `.js`/`.mjs` scripts, `.css` styles. */
  file: string;
  /**
   * Pages that get it (all when omitted), e.g. only those using the
   * plugin's blocks: `({ html }) => html.includes('my-widget')`.
   */
  when?: (context: RenderHookContext & { html: string }) => boolean | Promise<boolean>;
}

export interface AssetsApi {
  /** Address of a file of the `public` folder, with the version (cached for a year). */
  url(file: string): string;
  /**
   * Adds a script (before `</body>`, deferred; `.mjs` as a module) or a
   * stylesheet (in `<head>`) to public pages. Needs `theme:hooks`.
   */
  enqueue(asset: PublicAsset): void;
}

/**
 * What a plugin adds to a theme's options (plugin API 1.32), e.g. a "Pro"
 * add-on: shown in Appearance → Customize and given to the theme's templates
 * like the theme's own settings, only on sites where the plugin is active.
 * Names and ids already used by the theme are ignored.
 */
export interface ThemeExtension {
  /** More settings, as a theme's `settings` (`section`, `tab`, `showIf`, zones…). */
  settings?: FieldDefinition[];
  /** More sections of the options panel; `parent` may name one of the theme's. */
  settingsSections?: ThemeSettingsSection[];
  /** More ready-made sets of settings (skins). */
  presets?: NonNullable<ThemeDefinition['presets']>;
  /** More elements for the theme's zones fields (header or footer builder), by field name. */
  zoneItems?: Record<string, ZoneItem[]>;
  /** More block areas, e.g. `{ 'top-bar': 'Top bar' }`, rendered by the theme by name. */
  areas?: Record<string, string>;
  /** What the added areas show until they are edited. */
  areaDefaults?: Record<string, CxdDocument>;
  /**
   * More options of menu items, as a theme's `menuItemFields` (plugin API
   * 1.34), e.g. a mega menu. Values stay stored while the plugin is inactive.
   */
  menuItemFields?: MenuItemField[];
}

export interface ThemesApi {
  /**
   * Extends the options of a theme, by slug (needs `theme:hooks`, plugin API
   * 1.32). Call it in `setup`; it applies while the theme is a site's theme
   * and the plugin is active there. Values of the added settings are kept
   * when the plugin is deactivated, but no longer reach the theme.
   */
  extend(theme: string, extension: ThemeExtension): void;
  /**
   * The theme a site uses (plugin API 1.49; missing on older cores). No
   * permission needed.
   */
  active?(siteId: string): Promise<{ slug: string; name: string; version: string }>;
  /**
   * Names of the files of a folder of the site's theme (plugin API 1.49),
   * e.g. `files(siteId, 'campus-json')`; `[]` when it has none (or the theme
   * has no folder, as the bundled Aurora). At most 200, no sub-folders.
   */
  files?(siteId: string, dir: string): Promise<string[]>;
  /**
   * A text file of the site's theme, by its path inside the theme's folder
   * (plugin API 1.49), e.g. `campus-json/group_hero.json`; null when there is
   * none. Paths may not leave the folder; files over 1 MB are not read.
   */
  readFile?(siteId: string, path: string): Promise<string | null>;
}

/**
 * Bot protection of forms (plugin API 1.38), for plugins with forms of their
 * own: they ask the plugins that protect forms (the `form.challenge` and
 * `form.verify` filters, e.g. the Captcha plugin) instead of each having
 * its own captcha. Without such a plugin nothing changes: the challenge is
 * empty and every submission passes. No permission needed.
 *
 * In the browser, a form sent with JavaScript calls
 * `await window.cleitextChallenge?.prepare(form)` before reading its fields
 * (invisible captchas get their token then) and
 * `window.cleitextChallenge?.reset(form)` after a refused submission, since
 * tokens work once. Markup added after the page loaded (`innerHTML`) needs
 * its `<script>` elements created again, or `window.cleitextChallenge?.render(root)`.
 */
export interface FormsApi {
  /**
   * Markup to place inside the form, before its submit button: empty when
   * no plugin protects this form. Pages of guests may be cached, so it
   * depends only on the site, the form, the language and `signedIn`.
   */
  challenge(input: FormChallengeContext): Promise<string>;
  /**
   * Whether a submission may go on; `{ ok: false, message }` refuses it,
   * with a message for the visitor in `locale`. Always `{ ok: true }`
   * without a protection plugin.
   */
  verify(input: FormVerifyContext): Promise<FormVerifyResult>;
  /**
   * Releases a submission kept aside as spam (plugin API 1.45, needs
   * `forms:protect`): the `form.released` action reaches the plugin that
   * owns the form, which delivers it. For protection plugins that keep
   * held submissions, when someone marks one as not spam.
   */
  release(input: { siteId: string } & FormReleasedEvent): Promise<void>;
}

// ---- AI (plugin API 1.40) ---------------------------------------------------------------

/** Who an AI assistant works for, when a plugin converts, validates or runs a tool. */
export interface AiContext {
  siteId: string;
  /** The person the assistant acts as. */
  userId: string;
  /** Language of the entry being written (the site's default language otherwise). */
  locale: string;
  /** Content type of the entry, when there is one. */
  type?: string;
}

/** What a validation gives back: the document to save, or what is wrong for the assistant. */
export type AiValidation = { document: CxdDocument } | { errors: string[] };

/**
 * An editor that AI assistants can write with (plugin API 1.40), e.g. a page
 * builder. Assistants of the site (MCP and the admin chat) then keep pages
 * in this editor instead of turning them into block editor pages, read its
 * guide, and send either blocks (converted with `fromBlocks`) or documents
 * in the editor's own format (checked with `validate`).
 */
export interface AiEditorDefinition {
  /** `document.editor.id` of its documents, as the admin editor's `id`. */
  id: string;
  title: string;
  /** Content types it can edit (all when omitted). */
  types?: string[];
  /**
   * How to write documents of this editor, in Markdown: the format, the main
   * elements and their settings, an example. Keep it short: assistants read
   * it before every page. A function gets the site (e.g. its global colors).
   */
  guide: string | ((context: AiContext) => string | Promise<string>);
  /**
   * Block editor blocks (core and plugin blocks, CXD) as a document of this
   * editor, with `editor: { id }`. Without it, assistants must send
   * documents in the editor's format.
   */
  fromBlocks?: (blocks: CxdBlock[], context: AiContext) => CxdDocument | Promise<CxdDocument>;
  /** A document of this editor as blocks, for assistants that ask to read it as blocks. */
  toBlocks?: (document: CxdDocument, context: AiContext) => CxdBlock[] | Promise<CxdBlock[]>;
  /**
   * Checks a document an assistant wrote in this editor's format (its
   * `blocks`, and `editor.data` kept from the page): the cleaned document,
   * or the problems. Without it, assistants cannot send such documents.
   * The core validates and sanitizes blocks afterwards as for every save.
   */
  validate?: (document: CxdDocument, context: AiContext) => AiValidation | Promise<AiValidation>;
}

/** A section added to the guide AI assistants read before writing (plugin API 1.40). */
export interface AiContextSection {
  title: string;
  /** Markdown; a function gets the site, e.g. to describe its settings. */
  markdown: string | ((context: Omit<AiContext, 'type'>) => string | Promise<string>);
}

/** What a plugin tool gets: the person, and the site's REST API as them. */
export interface AiToolContext extends Omit<AiContext, 'type'> {
  /** The REST API of the site (`/api/v1` + `path`), with the person's permissions. */
  api(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }>;
}

/**
 * A tool AI assistants can call (plugin API 1.40), named `<plugin>_<name>`
 * for them (dashes become underscores). It runs as the person the assistant
 * acts for; `write` tools need a connection that may write.
 */
export interface AiToolDefinition {
  /** Lowercase letters, digits and `_`, e.g. `list_products`. */
  name: string;
  title: string;
  description: string;
  scope: 'read' | 'write';
  /** A JSON schema of type `object`: assistants get it as it is. */
  inputSchema: Record<string, unknown>;
  /** A capability the person needs, e.g. `manage_shop`. */
  capability?: string;
  /**
   * The answer, as text or JSON. Throw an error whose message the assistant
   * can act on (it gets the message of errors with `expose: true`, a
   * generic one otherwise).
   */
  run(args: Record<string, unknown>, context: AiToolContext): unknown;
}

/** Cleitext's AI assistants (plugin API 1.40): what plugins teach them. No permission needed. */
export interface AiApi {
  /** An editor assistants can write with (one per `id`). */
  registerEditor(definition: AiEditorDefinition): void;
  /** A section of the guide, e.g. how the plugin's blocks or fields are used. */
  addContext(section: AiContextSection): void;
  /** A tool of the plugin. */
  registerTool(definition: AiToolDefinition): void;
}

export interface PluginContext {
  readonly plugin: { slug: string; version: string };
  /**
   * The plugin API this core implements, e.g. `1.42.0` (plugin API 1.41;
   * missing on older cores), to use newer features only where they exist.
   */
  readonly apiVersion: string;
  /** A site's name and languages (plugin API 1.16), e.g. for emails sent outside a request. */
  site(siteId: string): Promise<PluginSite>;
  readonly assets: AssetsApi;
  /** Adds settings, sections and areas to a theme (plugin API 1.32). */
  readonly themes: ThemesApi;
  readonly log: PluginLogger;
  readonly hooks: HookApi;
  readonly content: ContentApi;
  readonly terms: TermsApi;
  readonly languages: LanguagesApi;
  readonly storage: StorageApi;
  readonly secrets: SecretsApi;
  readonly schedule: ScheduleApi;
  readonly comments: CommentsApi;
  readonly blocks: BlockApi;
  readonly routes: RouteApi;
  readonly settings: SettingsApi;
  readonly access: AccessApi;
  readonly db: PluginDatabase;
  readonly cache: CacheApi;
  readonly mail: MailApi;
  readonly http: HttpApi;
  readonly media: MediaApi;
  /** The site's members, read-only (plugin API 1.42, needs `users:read`). */
  readonly users: UsersApi;
  /** Field types, field groups with location rules (plugin API 1.47). */
  readonly fields: FieldsApi;
  /** Dynamic data sources shared by page builders, blocks and themes (plugin API 1.47). */
  readonly dynamic: DynamicApi;
  readonly privacy: PrivacyApi;
  readonly transfer: TransferApi;
  /** Bot protection of the plugin's own forms (plugin API 1.38). */
  readonly forms: FormsApi;
  /**
   * Guides, editors and tools for the site's AI assistants (plugin API 1.40).
   * Missing on older cores: call it as `ctx.ai?.registerEditor(...)`.
   */
  readonly ai: AiApi;
}

export interface PluginDefinition {
  /** Runs once when the server starts: register hooks, types, blocks, routes. */
  setup(context: PluginContext): void | Promise<void>;
  /** Runs when the plugin is activated on a site. */
  onActivate?(site: PluginSite, context: PluginContext): void | Promise<void>;
  /** Runs when the plugin is deactivated on a site. Data is kept. */
  onDeactivate?(site: PluginSite, context: PluginContext): void | Promise<void>;
  /** Runs before the plugin's schema and settings are removed. */
  onUninstall?(context: {
    plugin: { slug: string; version: string };
    log: PluginLogger;
  }): void | Promise<void>;
}
