import type { BlockLoadContext } from '@cleitext/plugin-sdk';
/**
 * Fresco's model. A page is a CXD document whose blocks are Fresco elements:
 * `fresco/container` (flex or grid, nested freely) and widgets such as
 * `fresco/heading`. An element's `attrs` are its settings, kept sparse: only
 * the values that differ from the defaults.
 *
 * Setting keys:
 * - `title`: the value on every device (desktop first);
 * - `padding@tablet`, `padding@mobile`: the value from that breakpoint down;
 * - `color:hover`: the value on hover.
 */
import type { BlockPage } from '@cleitext/plugin-sdk';
import type { ReactNode } from 'react';
import type { Breakpoints, Control, Settings } from '@cleitext/design';

// The design settings (values, devices, controls) are shared with Prisma.
export * from '@cleitext/design/model';

/** The CXD block of an element, as Fresco handles it. */
export interface FrescoNode {
  id: string;
  type: string;
  v: number;
  attrs: Settings;
  children?: FrescoNode[];
}

/** A node before it gets ids (what `create` returns). */
export interface NewNode {
  type: string;
  v: number;
  attrs: Settings;
  children?: NewNode[];
}

// ---- Elements --------------------------------------------------------------------------

export type ElementCategory =
  'layout' | 'basic' | 'general' | 'media' | 'site' | 'plugins' | 'pro' | 'atomic';

export interface RenderContext {
  /** Media preloaded for the page, by id. */
  media: ReadonlyMap<string, RenderMediaItem>;
  locale: string;
  /** True inside the editor's canvas. */
  editing: boolean;
  /** Site-wide values the elements may need (menus, site title…). */
  site: { title: string; tagline: string; home: string };
  /** The site's menus, by theme location. */
  menus?: Readonly<Record<string, MenuItem[]>>;
  /** On the page: what is shown (the entry, the archive…), for theme widgets. */
  page?: BlockPage;
  /** Editor only: which item of a tabs-like element is shown. */
  ui?: { active(id: string): number | undefined };
  /** Editor only: the preview of another plugin's block (rendered by the server). */
  pluginBlock?: (block: FrescoNode) => ReactNode;
}

export interface MenuItem {
  id: string;
  label: string;
  url: string;
  target?: '_blank';
  current: boolean;
  children: MenuItem[];
}

export interface RenderMediaItem {
  id: string;
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  alt: string;
  variants: { variant: string; format: string; url: string; width: number; height: number }[];
}

export interface RenderProps {
  node: FrescoNode;
  /** Settings with their defaults, for the current values (desktop). */
  settings: Settings;
  /** Rendered children of a container. */
  children?: ReactNode;
  /** The same children, one node each (to wrap them one by one). */
  items?: ReactNode[];
  context: RenderContext;
  /** On the page: what the element's `load` returned (undefined in the editor). */
  data?: unknown;
}

/** What an element's `load` gets: Cleitext's block load context and the site's breakpoints. */
export interface ElementLoadContext extends BlockLoadContext {
  breakpoints: Breakpoints;
}

/**
 * An element type: its panel (controls), its markup and, optionally, the
 * script that brings it to life on the page (`handler`, in public/frontend).
 */
export interface ElementDefinition {
  /** Block type, e.g. `fresco/heading`. */
  type: string;
  title: string;
  /** Icon in the panel: SVG path data on a 24×24 grid. */
  icon: string;
  category: ElementCategory;
  /** Words that find it in the panel's search. */
  keywords?: string[];
  /** Holds other elements. */
  container?: boolean;
  /** Children it accepts (containers only); all when omitted. */
  accepts?: (type: string) => boolean;
  controls: Control[];
  render: (props: RenderProps) => ReactNode;
  /**
   * On the server, before rendering: data the element needs (e.g. the
   * entries of a loop), with Cleitext's block load context.
   */
  load?: (settings: Settings, context: ElementLoadContext) => Promise<unknown>;
  /** Media ids its settings use (images, galleries, backgrounds). */
  media?: (settings: Settings) => string[];
  /** Name of the front-end handler (public/frontend.ts) that runs on it. */
  handler?: string;
  /** The element when dropped from the panel (e.g. children of tabs). */
  create?: () => NewNode;
  /** Pro elements need Fresco Pro. */
  pro?: boolean;
  /** Not offered in the panel (placed by code, e.g. the popup wrapper). */
  hidden?: boolean;
  /**
   * Atomic element: styled with style variants (`_styles`) and global
   * classes (`_classes`) instead of style controls.
   */
  atomic?: boolean;
  /** Settings holding raw HTML (cleaned on save for authors without unfiltered_html). */
  html?: string[];
  /**
   * Its children are items with a title (`_title`), edited in the panel's
   * Items list: tabs, accordions, carousels of containers.
   */
  itemsLabel?: string;
}
