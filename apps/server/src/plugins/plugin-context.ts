import {
  PluginPermissionError,
  SDK_VERSION,
  type CopyOptions,
  type LanguageUsage,
  type PendingLanguages,
  type ImportReport,
  type PersonalDataGroup,
  type PluginContext,
  type PluginMedia,
  type PluginUser,
  type UserQuery,
  type CommentsApi,
  type PluginComment,
  type RouteRequest,
  type PluginEntry,
  type PluginLogger,
  type PluginPermission,
  type PluginSite,
  type PluginTerm,
  type PluginTransaction,
  type EntryQuery,
  type TermQuery,
  type TranslationLink,
  type DocumentImportOptions,
  type DynamicContext,
  type DynamicSourceInfo,
} from '@cleitext/plugin-sdk';
import type {
  FieldDefinition,
  FieldGroupInput,
  FieldGroupView,
  FieldObject,
  FieldValues,
  LocationScreen,
  OptionsPageInput,
  OptionsPageView,
} from '@cleitext/shared';
import { Logger } from '@nestjs/common';
import type { LoadedPlugin, PluginHost } from './plugin-host.service.js';
import { pluginAssetUrl } from './plugin-assets.js';
import type { MailMessage } from '../mail/mail.service.js';
import { pluginMail } from '../mail/plugin-mail.js';

/** What plugin contexts need from the core, implemented by `PluginServices`. */
export interface PluginServices {
  /** Custom fields (plugin API 1.47). */
  fieldGroups(siteId: string, object?: FieldObject): Promise<FieldGroupView[]>;
  /** The fields of a plugin block (plugin API 1.49). */
  blockFields(
    siteId: string,
    block: string,
  ): Promise<{ fields: FieldDefinition[]; groups: FieldGroupView[] }>;
  /** The site's theme and its files (plugin API 1.49). */
  activeTheme(
    siteId: string,
  ): Promise<{ slug: string; name: string; version: string; parent?: string }>;
  themeFiles(siteId: string, dir: string): Promise<string[]>;
  themeFile(siteId: string, path: string): Promise<string | null>;
  matchingFieldGroups(siteId: string, screen: LocationScreen): Promise<FieldGroupView[]>;
  siteFieldGroups(siteId: string): Promise<FieldGroupInput[]>;
  saveSiteFieldGroup(siteId: string, group: unknown): Promise<FieldGroupInput>;
  removeSiteFieldGroup(siteId: string, id: string): Promise<void>;
  updateTermFields(siteId: string, id: string, values: FieldValues): Promise<void>;
  userFields(siteId: string, id: string): Promise<FieldValues>;
  updateUserFields(siteId: string, id: string, values: FieldValues): Promise<void>;
  dynamicSources(siteId: string): Promise<DynamicSourceInfo[]>;
  eraseUserFields(siteId: string, email: string): Promise<{ removed: number; retained: number }>;
  resolveDynamic(siteId: string, id: string, context: DynamicContext): Promise<unknown>;
  /** Options pages (plugin API 1.48). */
  optionsPages(siteId: string): Promise<OptionsPageView[]>;
  siteOptionsPages(siteId: string): Promise<OptionsPageInput[]>;
  saveSiteOptionsPage(siteId: string, page: unknown): Promise<OptionsPageInput>;
  removeSiteOptionsPage(siteId: string, slug: string): Promise<void>;
  options(siteId: string, page: string, locale?: string): Promise<FieldValues>;
  updateOptions(
    siteId: string,
    page: string,
    values: FieldValues,
    locale?: string,
  ): Promise<FieldValues>;
  site(siteId: string): Promise<PluginSite>;
  /** The sites where a plugin is active, the oldest first (plugin API 1.59). */
  pluginSites(slug: string): Promise<string[]>;
  findEntries(siteId: string, query: EntryQuery): Promise<PluginEntry[]>;
  copyEntry(siteId: string, id: string, options: CopyOptions): Promise<PluginEntry>;
  entryTranslations(siteId: string, id: string): Promise<TranslationLink[]>;
  updateFields(
    siteId: string,
    id: string,
    values: FieldValues,
    options: { userId: string },
  ): Promise<void>;
  fieldsOf(
    siteId: string,
    type: string,
  ): Promise<{ fields: FieldDefinition[]; groups: { id: string; fields: FieldDefinition[] }[] }>;
  updateEntry(
    siteId: string,
    id: string,
    changes: { title?: string; excerpt?: string | null; document?: unknown; fields?: FieldValues },
    options: { userId: string },
  ): Promise<void>;
  revisionOf(
    siteId: string,
    id: string,
  ): Promise<{
    title: string;
    excerpt: string | null;
    document: unknown;
    fields: FieldValues;
  } | null>;
  findTerms(siteId: string, query: TermQuery): Promise<PluginTerm[]>;
  copyTerm(
    siteId: string,
    id: string,
    options: CopyOptions & { name?: string; parentId?: string | null },
  ): Promise<PluginTerm>;
  languageUsage(siteId: string): Promise<Record<string, LanguageUsage>>;
  setDefaultLocale(siteId: string, code: string): Promise<void>;
  languagesChanged(siteId: string): Promise<void>;
  pendingLanguages(siteId: string): Promise<PendingLanguages | null>;
  clearPendingLanguages(siteId: string): Promise<void>;
  storageGet(plugin: LoadedPlugin, siteId: string, key: string): Promise<unknown>;
  storageSet(plugin: LoadedPlugin, siteId: string, key: string, value: unknown): Promise<void>;
  storageDelete(plugin: LoadedPlugin, siteId: string, key: string): Promise<void>;
  /** AES-256-GCM with a key from APP_SECRET (common/secrets.ts). */
  seal(value: string): unknown;
  unseal(sealed: unknown): string | null;
  settings(plugin: LoadedPlugin, siteId: string): Promise<FieldValues>;
  transaction<T>(
    plugin: LoadedPlugin,
    siteId: string,
    fn: (tx: PluginTransaction) => Promise<T>,
  ): Promise<T>;
  invalidate(siteId: string, tags: string[]): Promise<void>;
  /** A message checked by `pluginMail` (plugin API 1.41). */
  sendMail(message: MailMessage, siteId?: string): Promise<void>;
  mediaItem(siteId: string, id: string): Promise<PluginMedia | null>;
  /** Active members of a site (`ctx.users`, plugin API 1.42); the query is checked. */
  findUsers(
    siteId: string,
    query: Required<Pick<UserQuery, 'limit' | 'offset'>> & Omit<UserQuery, 'limit' | 'offset'>,
  ): Promise<PluginUser[]>;
  mediaFromUrl(
    plugin: LoadedPlugin,
    siteId: string,
    url: string,
    options: { userId: string; alt?: string; filename?: string },
  ): Promise<PluginMedia>;
  findComments(siteId: string, query: Parameters<CommentsApi['find']>[1]): Promise<PluginComment[]>;
  postComment(
    request: RouteRequest,
    input: Parameters<CommentsApi['post']>[1],
  ): Promise<{ id: string; status: PluginComment['status'] }>;
  /** `ctx.comments.setStatus` (API 1.45): for a user, or for the plugin itself. */
  setCommentStatus(
    siteId: string,
    ids: string[],
    status: PluginComment['status'],
    options: { origin: string; plugin: string; userId?: string },
  ): Promise<number>;
  /** `ctx.comments.remove` (API 1.45): spam and trash only. */
  removeComments(
    siteId: string,
    ids: string[],
    options: { plugin: string; userId?: string },
  ): Promise<number>;
  /** A request to a public address for a plugin (`ctx.http.send`); tests replace it. */
  httpSend(
    plugin: LoadedPlugin,
    request: {
      url: string;
      method: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs: number;
      binary?: boolean;
      userAgent?: string;
    },
  ): Promise<{ status: number; type: string; text: string; base64?: string }>;
  /** What the core keeps about an email on a site: account, sessions, activity. */
  corePersonalData(siteId: string, email: string): Promise<PersonalDataGroup[]>;
  /** Anonymizes the comments and removes the likes of an email (art. 17). */
  eraseCommunityData(
    siteId: string,
    email: string,
  ): Promise<{ removed: number; retained: number; messages?: string[] }>;
  importDocument(
    siteId: string,
    document: unknown,
    options: DocumentImportOptions,
  ): Promise<ImportReport>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertSiteId(siteId: string): void {
  if (!UUID_RE.test(siteId)) throw new TypeError(`Invalid site id: ${siteId}`);
}

export function pluginLogger(slug: string): PluginLogger {
  const logger = new Logger(`plugin:${slug}`);
  const format = (message: string, data?: Record<string, unknown>) =>
    data ? `${message} ${JSON.stringify(data)}` : message;
  return {
    debug: (message, data) => logger.debug(format(message, data)),
    info: (message, data) => logger.log(format(message, data)),
    warn: (message, data) => logger.warn(format(message, data)),
    error: (message, data) => logger.error(format(message, data)),
  };
}

/** A `ctx.users.find` query, checked: bounded limit, valid ids, plain strings. */
export function userQuery(
  query: UserQuery,
): Required<Pick<UserQuery, 'limit' | 'offset'>> & Omit<UserQuery, 'limit' | 'offset'> {
  const integer = (value: unknown, fallback: number, max: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), max) : fallback;
  };
  const result: Required<Pick<UserQuery, 'limit' | 'offset'>> &
    Omit<UserQuery, 'limit' | 'offset'> = {
    limit: query.limit === undefined ? 20 : integer(query.limit, 20, 100),
    offset: query.offset === undefined ? 0 : integer(query.offset, 0, 100_000),
  };
  if (query.search !== undefined && query.search !== null) {
    const search = String(query.search).trim().slice(0, 100);
    if (search) result.search = search;
  }
  if (query.role !== undefined && query.role !== null) result.role = String(query.role);
  if (query.ids !== undefined) {
    if (!Array.isArray(query.ids)) throw new TypeError('`ids` must be a list of user ids.');
    if (query.ids.length > 100) throw new TypeError('At most 100 ids.');
    // Ids that cannot exist find nobody.
    result.ids = query.ids.filter((id) => typeof id === 'string' && UUID_RE.test(id));
  }
  return result;
}

/** Comment ids given by a plugin: valid ones only, at most 500. */
function commentIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) throw new TypeError('`ids` must be a list of comment ids.');
  return ids.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id)).slice(0, 500);
}

/** The common part of the inputs of `ctx.forms`, checked. */
function formInput<T extends { siteId: string; form: string; locale: string; signedIn: boolean }>(
  input: T,
): T {
  if (typeof input.form !== 'string' || !/^[a-z0-9][\w./-]{0,119}$/i.test(input.form)) {
    throw new TypeError('Invalid form id: use `<plugin slug>/<form>`.');
  }
  return { ...input, locale: String(input.locale ?? ''), signedIn: input.signedIn === true };
}

/**
 * The `ctx` object a plugin receives. Each facade checks the permissions
 * declared in the manifest (docs/SPECIFICATIONS.md §7.3).
 */
export function createPluginContext(plugin: LoadedPlugin, host: PluginHost): PluginContext {
  const require = (permission: PluginPermission) => {
    if (!plugin.manifest.permissions.includes(permission)) {
      throw new PluginPermissionError(plugin.slug, permission);
    }
  };
  const services = () => host.pluginServices;
  const secretKey = (name: string) => `secret.${name}`;
  const sealValue = (value: string) => services().seal(value);
  const unsealValue = (sealed: unknown) => (sealed === null ? null : services().unseal(sealed));

  return {
    plugin: { slug: plugin.slug, version: plugin.version },
    apiVersion: SDK_VERSION,
    site(siteId) {
      assertSiteId(siteId);
      return services().site(siteId);
    },
    activeSites() {
      return services().pluginSites(plugin.slug);
    },
    log: pluginLogger(plugin.slug),

    hooks: {
      on(name, handler, options) {
        host.addHook(plugin, 'action', name, handler as never, options?.priority);
      },
      filter(name, handler, options) {
        if (name.startsWith('render.') || name.startsWith('theme.') || name.startsWith('cache.'))
          require('theme:hooks');
        if (name.startsWith('site.')) require('languages');
        if (name.startsWith('form.')) require('forms:protect');
        // The meta of WordPress exports (plugin API 1.48).
        if (name === 'import.wxrMeta') require('import');
        host.addHook(plugin, 'filter', name, handler as never, options?.priority);
      },
      async emit(name, payload, context) {
        if (!String(name).startsWith(`${plugin.slug}.`)) {
          throw new Error(`Plugins can only emit their own actions ("${plugin.slug}.*")`);
        }
        await host.emit(name, payload, context.siteId);
      },
    },

    content: {
      registerType(definition) {
        require('content:write');
        host.addType(plugin, definition);
      },
      registerTaxonomy(definition) {
        require('content:write');
        host.addTaxonomy(plugin, definition);
      },
      registerFieldGroup(definition) {
        require('content:write');
        host.addFieldGroup(plugin, definition);
      },
      async find(siteId, query = {}) {
        require('content:read');
        assertSiteId(siteId);
        return services().findEntries(siteId, query);
      },
      async copy(siteId, id, options) {
        require('content:write');
        assertSiteId(siteId);
        if (!UUID_RE.test(id) || !UUID_RE.test(options.userId)) throw new TypeError('Invalid id');
        return services().copyEntry(siteId, id, options);
      },
      async translations(siteId, id) {
        require('content:read');
        assertSiteId(siteId);
        if (!UUID_RE.test(id)) throw new TypeError('Invalid id');
        return services().entryTranslations(siteId, id);
      },
      async updateFields(siteId, id, values, options) {
        require('content:write');
        assertSiteId(siteId);
        if (!UUID_RE.test(id) || !UUID_RE.test(options.userId)) throw new TypeError('Invalid id');
        return services().updateFields(siteId, id, values, options);
      },
      async fields(siteId, type) {
        require('content:read');
        assertSiteId(siteId);
        return services().fieldsOf(siteId, type);
      },
      async update(siteId, id, changes, options) {
        require('content:write');
        assertSiteId(siteId);
        if (!UUID_RE.test(id) || !UUID_RE.test(options.userId)) throw new TypeError('Invalid id');
        return services().updateEntry(siteId, id, changes, options);
      },
      async revision(siteId, id) {
        require('content:read');
        assertSiteId(siteId);
        if (!UUID_RE.test(id)) return null;
        return services().revisionOf(siteId, id);
      },
      async get(siteId, id) {
        require('content:read');
        assertSiteId(siteId);
        if (!UUID_RE.test(id)) return null;
        const [entry] = await services().findEntries(siteId, {
          ids: [id],
          status: 'any',
          limit: 1,
        });
        return entry ?? null;
      },
    },

    terms: {
      async find(siteId, query = {}) {
        require('content:read');
        assertSiteId(siteId);
        return services().findTerms(siteId, query);
      },
      async copy(siteId, id, options) {
        require('content:write');
        assertSiteId(siteId);
        if (!UUID_RE.test(id) || !UUID_RE.test(options.userId)) throw new TypeError('Invalid id');
        return services().copyTerm(siteId, id, options);
      },
      async updateFields(siteId, id, values) {
        require('content:write');
        assertSiteId(siteId);
        if (!UUID_RE.test(id)) throw new TypeError('Invalid id');
        return services().updateTermFields(siteId, id, values);
      },
    },

    languages: {
      provide(provider) {
        require('languages');
        if (
          typeof provider?.locales !== 'function' ||
          typeof provider.translations !== 'function'
        ) {
          throw new TypeError('A language provider needs locales() and translations()');
        }
        plugin.languageProvider = provider;
      },
      async defaultLocale(siteId) {
        require('languages');
        assertSiteId(siteId);
        return (await services().site(siteId)).defaultLocale;
      },
      async usage(siteId) {
        require('languages');
        assertSiteId(siteId);
        return services().languageUsage(siteId);
      },
      async setDefault(siteId, code) {
        require('languages');
        assertSiteId(siteId);
        return services().setDefaultLocale(siteId, code);
      },
      async changed(siteId) {
        require('languages');
        assertSiteId(siteId);
        return services().languagesChanged(siteId);
      },
      async pending(siteId) {
        require('languages');
        assertSiteId(siteId);
        return services().pendingLanguages(siteId);
      },
      async clearPending(siteId) {
        require('languages');
        assertSiteId(siteId);
        return services().clearPendingLanguages(siteId);
      },
    },

    secrets: {
      async set(siteId, name, value) {
        require('settings:own');
        assertSiteId(siteId);
        return services().storageSet(plugin, siteId, secretKey(name), sealValue(value));
      },
      async get(siteId, name) {
        require('settings:own');
        assertSiteId(siteId);
        return unsealValue(await services().storageGet(plugin, siteId, secretKey(name)));
      },
      async delete(siteId, name) {
        require('settings:own');
        assertSiteId(siteId);
        return services().storageDelete(plugin, siteId, secretKey(name));
      },
    },

    storage: {
      async get(siteId, key) {
        require('settings:own');
        assertSiteId(siteId);
        return (await services().storageGet(plugin, siteId, key)) as never;
      },
      async set(siteId, key, value) {
        require('settings:own');
        assertSiteId(siteId);
        return services().storageSet(plugin, siteId, key, value);
      },
      async delete(siteId, key) {
        require('settings:own');
        assertSiteId(siteId);
        return services().storageDelete(plugin, siteId, key);
      },
    },

    assets: {
      url(file) {
        return pluginAssetUrl(plugin.slug, plugin.version, file);
      },
      enqueue(asset) {
        require('theme:hooks');
        if (!plugin.manifest.public) {
          throw new Error('Assets need a "public" folder in cleitext.plugin.json.');
        }
        if (!/\.(m?js|css)$/.test(asset.file)) {
          throw new Error(`Only .js, .mjs and .css files can be added to pages: ${asset.file}`);
        }
        plugin.assets.push(asset);
      },
    },

    themes: {
      extend(theme, extension) {
        require('theme:hooks');
        host.addThemeExtension(plugin, theme, extension);
      },
      async active(siteId) {
        assertSiteId(siteId);
        return services().activeTheme(siteId);
      },
      async files(siteId, dir) {
        assertSiteId(siteId);
        return services().themeFiles(siteId, String(dir ?? ''));
      },
      async readFile(siteId, file) {
        assertSiteId(siteId);
        return services().themeFile(siteId, String(file ?? ''));
      },
    },

    blocks: {
      register(definition) {
        require('blocks');
        host.addBlock(plugin, definition as never);
      },
    },

    routes: {
      api(route) {
        require('routes:admin');
        host.addRoute(plugin, 'api', route);
      },
      public(route) {
        require('routes:public');
        host.addRoute(plugin, 'public', route);
      },
    },

    settings: {
      define(fields: FieldDefinition[], options) {
        require('settings:own');
        plugin.settings = {
          fields,
          ...(options?.title !== undefined ? { title: options.title } : {}),
          ...(options?.capability ? { capability: options.capability } : {}),
        };
      },
      async get(siteId) {
        require('settings:own');
        assertSiteId(siteId);
        return services().settings(plugin, siteId);
      },
    },

    access: {
      defineCapability(name, options) {
        if (!plugin.manifest.capabilities.includes(name)) {
          throw new Error(`Declare the capability "${name}" in cleitext.plugin.json`);
        }
        plugin.capabilities.set(name, { label: options.label, roles: options.roles });
      },
    },

    db: {
      transaction(siteId, fn) {
        assertSiteId(siteId);
        return services().transaction(plugin, siteId, fn);
      },
    },

    cache: {
      invalidate(siteId, tags) {
        assertSiteId(siteId);
        return services().invalidate(siteId, tags);
      },
    },

    mail: {
      async send(message) {
        require('mail:send');
        const { siteId, ...rest } = message;
        return services().sendMail(pluginMail(rest), siteId);
      },
    },

    http: {
      async send(request) {
        require('network');
        return services().httpSend(plugin, {
          url: request.url,
          method: request.method ?? 'POST',
          ...(request.headers ? { headers: request.headers } : {}),
          ...(request.body !== undefined ? { body: request.body } : {}),
          timeoutMs: Math.min(Math.max(request.timeoutMs ?? 10_000, 1000), 30_000),
          ...(request.binary ? { binary: true } : {}),
          // A browser's, e.g. to be given the files a browser gets (plugin API 1.44).
          ...(typeof request.userAgent === 'string' &&
          /^[\x20-\x7e]{1,200}$/.test(request.userAgent)
            ? { userAgent: request.userAgent }
            : {}),
        });
      },
    },

    media: {
      async get(siteId, id) {
        require('media:read');
        assertSiteId(siteId);
        if (!UUID_RE.test(id)) return null;
        return services().mediaItem(siteId, id);
      },
      async fromUrl(siteId, url, options) {
        require('media:write');
        assertSiteId(siteId);
        if (!UUID_RE.test(options.userId)) throw new Error('A user id is needed.');
        return services().mediaFromUrl(plugin, siteId, url, options);
      },
    },

    users: {
      async find(siteId, query = {}) {
        require('users:read');
        assertSiteId(siteId);
        return services().findUsers(siteId, userQuery(query));
      },
      async get(siteId, id) {
        require('users:read');
        assertSiteId(siteId);
        if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
        const [user] = await services().findUsers(siteId, { ids: [id], limit: 1, offset: 0 });
        return user ?? null;
      },
      async fields(siteId, id) {
        require('users:read');
        assertSiteId(siteId);
        if (typeof id !== 'string' || !UUID_RE.test(id)) throw new TypeError('Invalid id');
        return services().userFields(siteId, id);
      },
      async updateFields(siteId, id, values) {
        require('users:read');
        require('content:write');
        assertSiteId(siteId);
        if (typeof id !== 'string' || !UUID_RE.test(id)) throw new TypeError('Invalid id');
        return services().updateUserFields(siteId, id, values);
      },
    },

    fields: {
      registerType(definition) {
        host.addFieldType(plugin, definition);
      },
      addGroup(group) {
        require('content:write');
        host.addFieldGroup(plugin, group);
      },
      removeGroup(id) {
        host.removeFieldGroup(plugin, id);
      },
      provideGroups(provider) {
        require('content:write');
        if (typeof provider !== 'function') throw new TypeError('provideGroups needs a function');
        plugin.groupProviders.push(provider);
      },
      async groups(siteId, object) {
        require('content:read');
        assertSiteId(siteId);
        return services().fieldGroups(siteId, object);
      },
      async matching(siteId, screen) {
        require('content:read');
        assertSiteId(siteId);
        return services().matchingFieldGroups(siteId, screen);
      },
      addOptionsPage(page) {
        require('content:write');
        host.addOptionsPage(plugin, page);
      },
      removeOptionsPage(slug) {
        host.removeOptionsPage(plugin, slug);
      },
      async optionsPages(siteId) {
        require('content:read');
        assertSiteId(siteId);
        return services().optionsPages(siteId);
      },
      siteOptionsPages: {
        async list(siteId) {
          require('content:write');
          assertSiteId(siteId);
          return services().siteOptionsPages(siteId);
        },
        async save(siteId, page) {
          require('content:write');
          assertSiteId(siteId);
          return services().saveSiteOptionsPage(siteId, page);
        },
        async remove(siteId, slug) {
          require('content:write');
          assertSiteId(siteId);
          return services().removeSiteOptionsPage(siteId, String(slug));
        },
      },
      async blockFields(siteId, block) {
        require('content:read');
        assertSiteId(siteId);
        return services().blockFields(siteId, String(block ?? ''));
      },
      async options(siteId, page, options) {
        require('content:read');
        assertSiteId(siteId);
        return services().options(siteId, String(page), options?.locale);
      },
      async updateOptions(siteId, page, values, options) {
        require('content:write');
        assertSiteId(siteId);
        return services().updateOptions(siteId, String(page), values, options?.locale);
      },
      siteGroups: {
        async list(siteId) {
          require('content:write');
          assertSiteId(siteId);
          return services().siteFieldGroups(siteId);
        },
        async save(siteId, group) {
          require('content:write');
          assertSiteId(siteId);
          return services().saveSiteFieldGroup(siteId, group);
        },
        async remove(siteId, id) {
          require('content:write');
          assertSiteId(siteId);
          return services().removeSiteFieldGroup(siteId, id);
        },
      },
    },

    dynamic: {
      registerSource(source) {
        host.addDynamicSource(plugin, source);
      },
      registerProvider(provider) {
        if (typeof provider !== 'function')
          throw new TypeError('registerProvider needs a function');
        plugin.dynamicProviders.push(provider);
      },
      async sources(siteId) {
        assertSiteId(siteId);
        return services().dynamicSources(siteId);
      },
      async resolve(siteId, id, context) {
        assertSiteId(siteId);
        return services().resolveDynamic(siteId, String(id), context ?? { locale: '' });
      },
    },

    comments: {
      async find(siteId, query) {
        require('comments');
        assertSiteId(siteId);
        return services().findComments(siteId, query);
      },
      async post(request, input) {
        require('comments');
        assertSiteId(request.siteId);
        if (!/^[a-z][a-z0-9-]{0,39}$/.test(input.type) || input.type === 'comment')
          throw new Error(`Plugins post comments of their own type, not "${input.type}"`);
        return services().postComment(request, input);
      },
      async setStatus(siteId, input) {
        require('comments');
        assertSiteId(siteId);
        if (!['pending', 'approved', 'spam', 'trash'].includes(input.status))
          throw new TypeError(`Invalid comment status: ${String(input.status)}`);
        let origin: string;
        try {
          origin = new URL(String(input.origin)).origin;
        } catch {
          throw new TypeError('`origin` must be an address such as https://example.com.');
        }
        if (!/^https?:/.test(origin)) throw new TypeError('`origin` must be http or https.');
        return services().setCommentStatus(siteId, commentIds(input.ids), input.status, {
          origin,
          plugin: plugin.slug,
          ...(input.userId ? { userId: String(input.userId) } : {}),
        });
      },
      async remove(siteId, input) {
        require('comments');
        assertSiteId(siteId);
        return services().removeComments(siteId, commentIds(input.ids), {
          plugin: plugin.slug,
          ...(input.userId ? { userId: String(input.userId) } : {}),
        });
      },
    },

    schedule: {
      every(name, minutes, handler) {
        if (!/^[a-z0-9-]{1,60}$/.test(name)) throw new Error(`Invalid task name: ${name}`);
        if (plugin.schedules.some((t) => t.name === name))
          throw new Error(`Task ${name} is already scheduled`);
        if (typeof handler !== 'function') throw new Error('A scheduled task needs a handler');
        plugin.schedules.push({ name, minutes: Math.max(1, Math.floor(minutes) || 1), handler });
      },
    },

    privacy: {
      declareTrackers(provider) {
        plugin.trackerProviders.push(provider);
      },
      async trackers(siteId) {
        require('privacy');
        assertSiteId(siteId);
        return host.trackers(siteId);
      },
      registerExporter(exporter) {
        host.addPrivacyHandler(plugin, 'exporter', exporter);
      },
      registerEraser(eraser) {
        host.addPrivacyHandler(plugin, 'eraser', eraser);
      },
      async exportPersonalData(siteId, email) {
        require('privacy');
        assertSiteId(siteId);
        return host.exportPersonalData(siteId, email);
      },
      async erasePersonalData(siteId, email) {
        require('privacy');
        assertSiteId(siteId);
        return host.erasePersonalData(siteId, email);
      },
    },

    forms: {
      async challenge(input) {
        assertSiteId(input.siteId);
        return host.formChallenge(formInput(input));
      },
      async verify(input) {
        assertSiteId(input.siteId);
        return host.formVerify({
          ...formInput(input),
          fields: input.fields && typeof input.fields === 'object' ? input.fields : {},
          ip: String(input.ip ?? ''),
          ...(input.host ? { host: String(input.host) } : {}),
          ...(input.hold === true ? { hold: true } : {}),
        });
      },
      async release(input) {
        require('forms:protect');
        assertSiteId(input.siteId);
        const { form } = formInput({ ...input, signedIn: false });
        await host.formRelease(input.siteId, {
          form,
          locale: String(input.locale ?? ''),
          fields: input.fields && typeof input.fields === 'object' ? { ...input.fields } : {},
        });
      },
    },

    ai: {
      registerEditor(definition) {
        host.addAiEditor(plugin, definition);
      },
      addContext(section) {
        host.addAiSection(plugin, section);
      },
      registerTool(definition) {
        host.addAiTool(plugin, definition);
      },
    },

    conversions: {
      paid(siteId, conversion) {
        try {
          assertSiteId(siteId);
        } catch (error) {
          pluginLogger(plugin.slug).error(String(error));
          return;
        }
        host.announceConversion(plugin.slug, siteId, 'paid', conversion);
      },
      reversed(siteId, reversal) {
        try {
          assertSiteId(siteId);
        } catch (error) {
          pluginLogger(plugin.slug).error(String(error));
          return;
        }
        host.announceConversion(plugin.slug, siteId, 'reversed', reversal);
      },
    },

    referrals: {
      capture(provider) {
        if (typeof provider !== 'function') throw new TypeError('capture needs a function');
        if (plugin.referralProviders.length > 0)
          throw new Error('A plugin captures one referral parameter: call capture once.');
        plugin.referralProviders.push(provider);
      },
    },

    transfer: {
      async importDocument(siteId, document, options) {
        require('import');
        assertSiteId(siteId);
        if (!UUID_RE.test(options.userId)) throw new TypeError('Invalid user id.');
        return services().importDocument(siteId, document, options);
      },
    },
  };
}
