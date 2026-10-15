import type { CxdBlock } from '@cleitext/blocks';
import type { TransferDocumentInput } from '@cleitext/blocks/transfer';
import type { FieldDefinition, FieldValues, Label } from '@cleitext/shared';
import type { PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type { ReactNode } from 'react';
import type { HookApi, RenderHookContext } from './hooks.js';

/** A site, as plugins see it. */
export interface PluginSite {
  id: string;
  name: string;
  defaultLocale: string;
  /** Content languages, the default first (only the default without a language plugin). */
  locales: string[];
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

/** Extra fields on existing content types, stored under `fields[<id>]`. */
export interface FieldGroupDefinition {
  /** Key of the stored values; must start with the plugin slug, e.g. `seo`. */
  id: string;
  title: Label;
  /** Content types that show the group. */
  types: string[];
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
}

export interface EntryQuery {
  type?: string;
  locale?: string;
  /** Only published entries unless `any` (default `published`). */
  status?: 'published' | 'any';
  ids?: string[];
  /** Default 50, at most 200. */
  limit?: number;
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
}

export interface TermQuery {
  taxonomy?: string;
  locale?: string;
  ids?: string[];
  /** Default 100, at most 500. */
  limit?: number;
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
  /** Adds fields to existing content types (needs `content:write`). */
  registerFieldGroup(definition: FieldGroupDefinition): void;
  /** Reads entries of a site, newest first (needs `content:read`). */
  find(siteId: string, query?: EntryQuery): Promise<PluginEntry[]>;
  get(siteId: string, id: string): Promise<PluginEntry | null>;
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
}

// ---- Blocks -------------------------------------------------------------------------

export interface BlockLoadContext {
  siteId: string;
  locale: string;
  /** The entry being rendered, if any. */
  entry?: { id: string; type: string };
  /** Adds a page-cache tag, e.g. `type:event`, so the page refreshes with that data. */
  tag(tag: string): void;
}

export interface BlockRenderContext {
  siteId: string;
  locale: string;
  /** Media preloaded for the page (those listed by `media`), by id. */
  media: ReadonlyMap<string, BlockMedia>;
  /** The site's menus in the page's language, by theme location (e.g. `primary`). */
  menus: Readonly<Record<string, BlockMenuItem[]>>;
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
  query: Record<string, string>;
  /** Parsed JSON or form body. */
  body: unknown;
  /** The body as received (JSON and forms), e.g. to check a webhook signature. */
  rawBody: Buffer | null;
  ip: string;
  /** Signed-in user, if any. */
  user: { id: string; displayName: string; capabilities: string[] } | null;
  headers: Record<string, string | undefined>;
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
  /** Public GET routes: cache tags; the response is cached when set. */
  cacheTags?: string[];
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

export interface MailApi {
  /** Needs `mail:send`. */
  /** With `siteId`, the site's own SMTP settings are used when it has them. */
  send(message: {
    to: string;
    subject: string;
    text: string;
    replyTo?: string;
    siteId?: string;
  }): Promise<void>;
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

export interface PluginContext {
  readonly plugin: { slug: string; version: string };
  readonly assets: AssetsApi;
  readonly log: PluginLogger;
  readonly hooks: HookApi;
  readonly content: ContentApi;
  readonly terms: TermsApi;
  readonly languages: LanguagesApi;
  readonly storage: StorageApi;
  readonly secrets: SecretsApi;
  readonly blocks: BlockApi;
  readonly routes: RouteApi;
  readonly settings: SettingsApi;
  readonly access: AccessApi;
  readonly db: PluginDatabase;
  readonly cache: CacheApi;
  readonly mail: MailApi;
  readonly media: MediaApi;
  readonly privacy: PrivacyApi;
  readonly transfer: TransferApi;
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
