import type { BlockPage } from '@cleitext/plugin-sdk';
/**
 * How other plugins (Fresco Pro) extend every element: more controls, more
 * attributes on the root, more CSS, and conditions deciding whether an
 * element shows on the page. Kept on `globalThis`, like the registry.
 */
import type {
  Control,
  ControlOption,
  ElementDefinition,
  FrescoNode,
  RenderContext,
  Settings,
} from './model.js';

export interface Extensions {
  /** Controls added to elements (e.g. motion effects in the Advanced tab). */
  controls: ((definition: ElementDefinition) => Control[])[];
  /** Attributes added to an element's root (data attributes, custom attributes). */
  root: ((node: FrescoNode, settings: Settings, editing: boolean) => Record<string, string>)[];
  /** CSS added for an element; `scope` is its selector (`.fr-e-<id>`). */
  css: ((node: FrescoNode, settings: Settings, scope: string) => string)[];
  /** On the page only: false hides the element (display conditions). */
  visible: ((node: FrescoNode, settings: Settings, context: RenderContext) => boolean)[];
  /**
   * On the page only, before rendering: settings computed from data
   * (dynamic tags), e.g. the entry's title in a heading.
   */
  resolve: ((attrs: Settings, context: ResolveContext) => Promise<Settings> | Settings)[];
  /** Editor: things shown next to a control's label (e.g. a "dynamic" button). */
  fieldAddons: unknown[];
  /** Editor: extra sections of the page settings (e.g. a template's conditions). */
  pageSettings: unknown[];
  /** Editor: more items of an element's right-click menu (e.g. "Save as global widget"). */
  menuActions: MenuAction[];
  /**
   * Editor: how much a user may change (role manager). `content`: texts,
   * images and links only; no structure, style or site settings. `none`:
   * the page can only be looked at.
   */
  editorAccess: ((user: {
    capabilities: readonly string[];
  }) => 'full' | 'content' | 'none' | undefined)[];
  /** Editor: icon sets added by plugins (custom icons), offered in the icon picker. */
  iconSets: { id: string; label: string; icons: { name: string; url: string }[] }[];
  /** Editor: font families added by plugins (custom fonts), offered in the font pickers. */
  customFonts: string[];
  /** Editor: choices of `select` controls with a `source`, loaded when shown. */
  optionSources: Record<string, () => Promise<ControlOption[]>>;
  /** Editor: more panels of the Site settings (e.g. Fresco Pro's custom CSS). */
  siteSettings: SiteSettingsPanel[];
  /** Editor: the site's global widgets, when a plugin keeps them (Fresco Pro). */
  globalWidgets: GlobalWidgets[];
  /**
   * Editor: the page the canvas shows a document as (e.g. a template previewed
   * with a chosen entry); the first one giving a page wins, none: no page.
   */
  previewPages: PreviewPage[];
  /**
   * Editor: more places templates come from, shown beside the site's own in
   * Templates (a remote library of blocks and pages). None yet: the hook is
   * ready for one.
   */
  librarySources: LibrarySource[];
}

/** A template offered by a library source. */
export interface LibraryItem {
  id: string;
  title: string;
  kind: 'page' | 'section';
  /** A picture of it, if the source has one. */
  thumbnail?: string;
}

/** A place templates come from, other than the site's own (Templates in the editor). */
export interface LibrarySource {
  id: string;
  /** In English: the editor translates it. */
  title: string;
  /** Its templates, found by words of their title. */
  list(query: { search: string; kind: 'all' | 'page' | 'section' }): Promise<LibraryItem[]>;
  /** A template's elements, to insert (they get new ids) or preview. */
  load(id: string): Promise<FrescoNode[]>;
}

/** What a preview page provider gets: the document being edited and the site. */
export interface PreviewPageInput {
  /** The entry's content type. */
  type: string;
  /** The document's page settings. */
  page: Settings;
  locale: string;
  site: RenderContext['site'];
}

export type PreviewPage = (input: PreviewPageInput) => Promise<BlockPage | null> | BlockPage | null;

/** What a panel of the Site settings gets from the editor. */
export interface SiteSettingsPanelProps {
  /**
   * Marks the panel's changes as not saved: `save` runs when the page is
   * saved (or with the Save button of the Site settings); null: nothing to save.
   */
  setPending(save: (() => Promise<void>) | null): void;
  /** The page shown in the canvas, for live previews (null while it loads). */
  canvas(): Document | null;
  readOnly: boolean;
}

/** A panel of the Site settings added by a plugin. */
export interface SiteSettingsPanel {
  id: string;
  /** In English: the editor translates it. */
  title: string;
  /** An SVG path (24×24). */
  icon: string;
  /** Its group in the menu (Settings by default). */
  group?: 'design' | 'theme' | 'settings';
  /** Shown only to users with this capability. */
  capability?: string;
  component: unknown;
}

/** Global widgets: elements saved once and shown in many places, edited in one. */
export interface GlobalWidgets {
  /** The global widgets of the site. */
  list(): Promise<{ id: string; title: string }[]>;
  /** The element that shows a global widget on a page. */
  node(id: string): FrescoNode;
  /** The global widget an element shows, or null. */
  idOf(node: FrescoNode): string | null;
  /** Its content (the elements saved in it). */
  load(id: string): Promise<FrescoNode[]>;
  /** Saves new content: every page showing it changes. */
  save(id: string, nodes: FrescoNode[]): Promise<void>;
}

export interface MenuAction {
  label: string;
  /** Shown only for some elements. */
  when?: (node: FrescoNode) => boolean;
  run: (node: FrescoNode, editor: { replace(node: FrescoNode): void }) => void | Promise<void>;
}

export interface ResolveContext {
  siteId: string;
  locale: string;
  /** The page being rendered (entry, archive, search). */
  page?: BlockPage;
  /** The entry being shown, if any. */
  entry?: { id: string; type: string };
  /** Adds a page-cache tag. */
  tag(tag: string): void;
}

const KEY = Symbol.for('cleitext.fresco.extensions');

export function extensions(): Extensions {
  const holder = globalThis as unknown as Record<symbol, Extensions | undefined>;
  const all = (holder[KEY] ??= {
    controls: [],
    root: [],
    css: [],
    visible: [],
    resolve: [],
    fieldAddons: [],
    pageSettings: [],
    menuActions: [],
    customFonts: [],
    iconSets: [],
    editorAccess: [],
    optionSources: {},
    siteSettings: [],
    globalWidgets: [],
    previewPages: [],
    librarySources: [],
  });
  // Lists added after the object was made (another copy of Fresco loaded first).
  all.siteSettings ??= [];
  all.globalWidgets ??= [];
  all.previewPages ??= [];
  all.librarySources ??= [];
  return all;
}

/** Empties the lists: on the server, plugins set them up again when they reload. */
export function resetExtensions(): void {
  const all = extensions();
  for (const list of Object.values(all)) {
    if (Array.isArray(list)) list.length = 0;
  }
  all.optionSources = {};
}

/** An element's controls, with those added by extensions. */
export function controlsOf(definition: ElementDefinition): Control[] {
  const extra = extensions().controls.flatMap((fn) => {
    try {
      return fn(definition);
    } catch {
      return [];
    }
  });
  return extra.length ? [...definition.controls, ...extra] : definition.controls;
}

export function extraRootProps(
  node: FrescoNode,
  settings: Settings,
  editing: boolean,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const fn of extensions().root) {
    try {
      Object.assign(out, fn(node, settings, editing));
    } catch {
      // A failing extension never breaks the element.
    }
  }
  return out;
}

export function extraCss(node: FrescoNode, settings: Settings, scope: string): string {
  return extensions()
    .css.map((fn) => {
      try {
        return fn(node, settings, scope);
      } catch {
        return '';
      }
    })
    .join('');
}

export function isVisible(node: FrescoNode, settings: Settings, context: RenderContext): boolean {
  return extensions().visible.every((fn) => {
    try {
      return fn(node, settings, context);
    } catch {
      return true;
    }
  });
}

/** Settings after the resolvers (dynamic tags); unchanged when there are none. */
export async function resolveSettings(attrs: Settings, context: ResolveContext): Promise<Settings> {
  let current = attrs;
  for (const fn of extensions().resolve) {
    try {
      current = await fn(current, context);
    } catch {
      // Keep what was there.
    }
  }
  return current;
}
