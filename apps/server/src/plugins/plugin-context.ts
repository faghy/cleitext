import {
  PluginPermissionError,
  type CopyOptions,
  type LanguageUsage,
  type PendingLanguages,
  type PluginContext,
  type PluginEntry,
  type PluginLogger,
  type PluginPermission,
  type PluginSite,
  type PluginTerm,
  type PluginTransaction,
  type EntryQuery,
  type TermQuery,
} from '@cleitext/plugin-sdk';
import type { FieldDefinition, FieldValues } from '@cleitext/shared';
import { Logger } from '@nestjs/common';
import type { LoadedPlugin, PluginHost } from './plugin-host.service.js';

/** What plugin contexts need from the core, implemented by `PluginServices`. */
export interface PluginServices {
  site(siteId: string): Promise<PluginSite>;
  findEntries(siteId: string, query: EntryQuery): Promise<PluginEntry[]>;
  copyEntry(siteId: string, id: string, options: CopyOptions): Promise<PluginEntry>;
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
  settings(plugin: LoadedPlugin, siteId: string): Promise<FieldValues>;
  transaction<T>(
    plugin: LoadedPlugin,
    siteId: string,
    fn: (tx: PluginTransaction) => Promise<T>,
  ): Promise<T>;
  invalidate(siteId: string, tags: string[]): Promise<void>;
  sendMail(message: {
    to: string;
    subject: string;
    text: string;
    replyTo?: string;
    siteId?: string;
  }): Promise<void>;
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

  return {
    plugin: { slug: plugin.slug, version: plugin.version },
    log: pluginLogger(plugin.slug),

    hooks: {
      on(name, handler, options) {
        host.addHook(plugin, 'action', name, handler as never, options?.priority);
      },
      filter(name, handler, options) {
        if (name.startsWith('render.') || name.startsWith('theme.')) require('theme:hooks');
        if (name.startsWith('site.')) require('languages');
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
      send(message) {
        require('mail:send');
        return services().sendMail(message);
      },
    },
  };
}
