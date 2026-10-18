/**
 * Design settings (shared by Fresco and Prisma). An element's `attrs` are its
 * settings, kept sparse: only the values that differ from the defaults.
 *
 * Setting keys:
 * - `title`: the value on every device (desktop first);
 * - `padding@tablet`, `padding@mobile`: the value from that breakpoint down;
 * - `color:hover`: the value on hover.
 */

export type Settings = Record<string, unknown>;

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
  /** Custom icons (sets added by plugins): an SVG drawn as a mask in the text color. */
  url?: string;
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
  | 'filters'
  | 'pluginBlock';

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
  /**
   * `select` only: more choices from an option source registered by a
   * plugin (`extensions().optionSources`), e.g. the site's templates.
   */
  source?: string;
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

export function isGroup(control: Control): control is GroupControl {
  return ['typography', 'background', 'border', 'shadow', 'textShadow', 'filters'].includes(
    control.type,
  );
}

/** The key of a setting for a device and state: `size`, `size@tablet`, `color:hover`. */
export function settingKey(name: string, device: Device = 'desktop', hover = false): string {
  return `${name}${hover ? ':hover' : ''}${device === 'desktop' ? '' : `@${device}`}`;
}
