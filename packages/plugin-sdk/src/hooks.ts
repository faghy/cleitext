import type { CxdBlock } from '@cleitext/blocks';
import type { HeadData, PublicEntry } from '@cleitext/theme-sdk';

/**
 * Hook catalog (docs/SPECIFICATIONS.md §8). Plugins add their own hooks with
 * declaration merging:
 *
 * ```ts
 * declare module '@cleitext/plugin-sdk' {
 *   interface Actions { 'events.rsvp': { eventId: string; email: string } }
 * }
 * ```
 */

/** An entry as hooks see it. */
export interface EntryEvent {
  id: string;
  siteId: string;
  type: string;
  locale: string;
  slug: string;
  title: string;
  status: string;
  fields: Record<string, unknown>;
}

/** A taxonomy term as hooks see it. */
export interface TermEvent {
  id: string;
  siteId: string;
  taxonomy: string;
  locale: string;
  slug: string;
  name: string;
}

/** Actions (events): payload by name. Handlers run after the change is saved. */
export interface Actions {
  'entry.created': { entry: EntryEvent };
  'entry.saved': { entry: EntryEvent };
  'entry.published': { entry: EntryEvent };
  'entry.unpublished': { entry: EntryEvent };
  'entry.trashed': { entry: EntryEvent };
  'entry.deleted': { entry: EntryEvent };
  'term.created': { term: TermEvent };
  'term.deleted': { term: TermEvent };
  /** Languages and translations were imported for the site: see `ctx.languages.pending`. */
  'languages.pending': Record<string, never>;
  'media.uploaded': { media: { id: string; mime: string; filename: string; url: string } };
  'plugin.activated': { plugin: string };
  'plugin.deactivated': { plugin: string };
}

/** Context of the public-rendering filters. */
export interface RenderHookContext {
  siteId: string;
  locale: string;
  route: 'entry' | 'archive' | 'search' | '404' | 'maintenance';
  path: string;
  /** Set on single entries. */
  entry?: PublicEntry;
  /** Adds a page-cache tag, so the page refreshes when that data changes. */
  tag(tag: string): void;
}

/** Filters (transformations): `[value, context]` by name. */
export interface Filters {
  /** Title, meta tags and extra `<head>` tags of a public page (needs `theme:hooks`). */
  'render.head': [head: HeadData, context: RenderHookContext];
  /** Blocks of an entry before rendering, e.g. to add a details box (needs `theme:hooks`). */
  'render.blocks': [blocks: CxdBlock[], context: RenderHookContext & { entry: PublicEntry }];
  /** Final HTML of a public page; use sparingly (needs `theme:hooks`). */
  'render.html': [html: string, context: RenderHookContext];
  /** Template names tried in order, e.g. `entry-event` (needs `theme:hooks`). */
  'theme.templateCandidates': [candidates: string[], context: RenderHookContext];
  /**
   * Site title and tagline in a language other than the default one, e.g.
   * translated by the language plugin (needs `languages`). Never called for
   * the default language.
   */
  'site.strings': [
    strings: { title: string; tagline: string },
    context: { siteId: string; locale: string },
  ];
}

/** Context of action handlers. */
export interface HookContext {
  siteId: string;
  /** The user whose change emitted the action, when there is one. */
  userId?: string;
}

export interface HookOptions {
  /** Lower runs first. Default 10, as in WordPress. */
  priority?: number;
}

export type ActionHandler<K extends keyof Actions> = (
  payload: Actions[K],
  context: HookContext,
) => void | Promise<void>;

export type FilterHandler<K extends keyof Filters> = (
  value: Filters[K][0],
  context: Filters[K][1],
) => Filters[K][0] | Promise<Filters[K][0]>;

/**
 * Hook bus as seen by a plugin. Handlers only run on sites where the plugin
 * is active. An error in a handler is logged and does not stop the others.
 */
export interface HookApi {
  on<K extends keyof Actions>(name: K, handler: ActionHandler<K>, options?: HookOptions): void;
  filter<K extends keyof Filters>(name: K, handler: FilterHandler<K>, options?: HookOptions): void;
  /** Emits an action declared by this plugin (its name must start with `<slug>.`). */
  emit<K extends keyof Actions>(name: K, payload: Actions[K], context: HookContext): Promise<void>;
}
