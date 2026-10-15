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

/** The CXD block of an element, as Fresco handles it. */
export interface FrescoNode {
  id: string;
  type: string;
  v: number;
  attrs: Settings;
  children?: FrescoNode[];
}

export type Settings = Record<string, unknown>;

/** A node before it gets ids (what `create` returns). */
export interface NewNode {
  type: string;
  v: number;
  attrs: Settings;
  children?: NewNode[];
}

/** A length with its unit, e.g. `{ size: 24, unit: 'px' }`. */
export interface SizeValue {
  size: number | '';
  unit: string;
}

/** Four sides, e.g. padding: `{ top: 10, right: 20, bottom: 10, left: 20, unit: 'px' }`. */
export interface BoxValue {
  top: number | '';
  right: number | '';
  bottom: number | '';
  left: number | '';
  unit: string;
  /** The four sides change together in the panel. */
  linked?: boolean;
}

/** A media file: its id in the library and its address (for the editor). */
export interface MediaValue {
  id: string | null;
  url: string;
  alt?: string;
}

/** A link. */
export interface LinkValue {
  url: string;
  newTab?: boolean;
  nofollow?: boolean;
}

/** An icon: a set and a name (see core/icons.ts), or an SVG from the media library. */
export interface IconValue {
  set: string;
  name: string;
}

/** Devices, from the widest. Desktop has no suffix. */
export const DEVICES = ['desktop', 'tablet', 'mobile'] as const;
export type Device = (typeof DEVICES)[number];

/** Upper bounds (px) of the smaller devices; the kit can change them. */
export interface Breakpoints {
  tablet: number;
  mobile: number;
}

export const DEFAULT_BREAKPOINTS: Breakpoints = { tablet: 1024, mobile: 767 };

// ---- Controls ------------------------------------------------------------------------

export type ControlType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'code'
  | 'number'
  | 'select'
  | 'choose'
  | 'switch'
  | 'color'
  | 'slider'
  | 'box'
  | 'media'
  | 'gallery'
  | 'url'
  | 'icon'
  | 'font'
  | 'date'
  | 'repeater'
  | 'animation'
  | 'children'
  | 'heading'
  | 'notice'
  | 'typography'
  | 'background'
  | 'border'
  | 'shadow'
  | 'textShadow'
  | 'filters';

export type Tab = 'content' | 'style' | 'advanced';

export interface ControlOption {
  value: string;
  label: string;
  /** Icon of a `choose` button: SVG path data on a 24×24 grid. */
  icon?: string;
}

/**
 * A setting and its place in the panel. `selectors` turn its value into CSS:
 * `{ '{{el}} .fr-heading__title': 'color: {{value}}' }`. Placeholders:
 * `{{el}}` (the element), `{{value}}`, `{{size}}`, `{{unit}}`, and for boxes
 * `{{top}}`, `{{right}}`, `{{bottom}}`, `{{left}}`.
 */
export interface Control {
  name: string;
  type: ControlType;
  label: string;
  tab: Tab;
  /** The panel section it belongs to (sections are folded). */
  section: string;
  default?: unknown;
  /** One value per device. */
  responsive?: boolean;
  /** Has a hover value (`name:hover`). */
  hover?: boolean;
  /** Choices of `select` and `choose`. */
  options?: ControlOption[];
  /** Units of `slider` and `box`. */
  units?: string[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /** Help under the control. */
  help?: string;
  selectors?: Record<string, string>;
  /** Shown only when other settings match, e.g. `{ layout: 'grid' }` or `{ layout: ['a', 'b'] }`. */
  condition?: Record<string, unknown>;
  /** Fields of each item of a `repeater`. */
  fields?: Control[];
  /** Label of a repeater item, from one of its fields. */
  itemTitle?: string;
  /** For `media`: kinds accepted. */
  accept?: 'image' | 'video' | 'svg';
  /** Not in the panel's text: kept out of the page's CSS rules. */
  noCss?: boolean;
}

/** Group controls (typography, background…) expand into several settings with a prefix. */
export interface GroupControl extends Control {
  type: 'typography' | 'background' | 'border' | 'shadow' | 'textShadow' | 'filters';
  /** Where the group's CSS goes, e.g. `{{el}} .fr-heading__title`. */
  selector: string;
}

// ---- Elements --------------------------------------------------------------------------

export type ElementCategory = 'layout' | 'basic' | 'general' | 'media' | 'site' | 'pro' | 'atomic';

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
  load?: (settings: Settings, context: BlockLoadContext) => Promise<unknown>;
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

export function isGroup(control: Control): control is GroupControl {
  return ['typography', 'background', 'border', 'shadow', 'textShadow', 'filters'].includes(
    control.type,
  );
}

/** The key of a setting for a device and state: `size`, `size@tablet`, `color:hover`. */
export function settingKey(name: string, device: Device = 'desktop', hover = false): string {
  return `${name}${hover ? ':hover' : ''}${device === 'desktop' ? '' : `@${device}`}`;
}
