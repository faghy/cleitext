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
  /** Editor: font families added by plugins (custom fonts), offered in the font pickers. */
  customFonts: string[];
  /** Editor: choices of `select` controls with a `source`, loaded when shown. */
  optionSources: Record<string, () => Promise<ControlOption[]>>;
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
  return (holder[KEY] ??= {
    controls: [],
    root: [],
    css: [],
    visible: [],
    resolve: [],
    fieldAddons: [],
    pageSettings: [],
    menuActions: [],
    customFonts: [],
    optionSources: {},
  });
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
