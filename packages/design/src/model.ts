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

/**
 * Devices, from the widest. Desktop is the base and has no suffix; tablet and
 * mobile are always there; the others are optional (switched on in the kit).
 * Widescreen starts at its breakpoint (min width), the others end at theirs
 * (max width).
 */
export const DEVICES = [
  'widescreen',
  'desktop',
  'laptop',
  'tablet_extra',
  'tablet',
  'mobile_extra',
  'mobile',
] as const;
export type Device = (typeof DEVICES)[number];

/** The three devices every breakpoint set has (what Prisma, like WordPress blocks, uses). */
export type BaseDevice = 'desktop' | 'tablet' | 'mobile';

/**
 * The order of the devices in a stylesheet: desktop first, then widescreen
 * (min width), then the smaller ones from the widest, so a smaller device's
 * rules win over the larger ones' and a device without a value inherits
 * from the next larger one.
 */
export const SHEET_ORDER: readonly Device[] = [
  'desktop',
  'widescreen',
  'laptop',
  'tablet_extra',
  'tablet',
  'mobile_extra',
  'mobile',
];

/** The devices that are off unless the kit gives them a breakpoint. */
export const OPTIONAL_DEVICES = ['widescreen', 'laptop', 'tablet_extra', 'mobile_extra'] as const;
export type OptionalDevice = (typeof OPTIONAL_DEVICES)[number];

/** The max-width devices, from the widest. */
export const MAX_WIDTH_DEVICES = [
  'laptop',
  'tablet_extra',
  'tablet',
  'mobile_extra',
  'mobile',
] as const;

/**
 * Breakpoints (px) the kit can change: the upper bound of each smaller device
 * and the lower bound of widescreen. An optional device is on when it has a value.
 */
export interface Breakpoints {
  tablet: number;
  mobile: number;
  mobile_extra?: number;
  tablet_extra?: number;
  laptop?: number;
  widescreen?: number;
}

export const DEFAULT_BREAKPOINTS: Breakpoints = { tablet: 1024, mobile: 767 };

/** The value an optional device gets when it is switched on. */
export const OPTIONAL_BREAKPOINTS: Record<OptionalDevice, number> = {
  mobile_extra: 880,
  tablet_extra: 1200,
  laptop: 1366,
  widescreen: 2400,
};

/** The devices in use with these breakpoints, from the widest (desktop always). */
export function activeDevices(breakpoints: Breakpoints = DEFAULT_BREAKPOINTS): Device[] {
  return DEVICES.filter(
    (device) => device === 'desktop' || typeof breakpoints[device] === 'number',
  );
}

/**
 * The devices a device inherits its values from, nearest first: the next
 * larger active device, and so on up to desktop. Laptop and widescreen
 * inherit from desktop.
 */
export function inheritChain(
  device: Device,
  breakpoints: Breakpoints = DEFAULT_BREAKPOINTS,
): Device[] {
  if (device === 'desktop') return [];
  if (device === 'widescreen') return ['desktop'];
  const index = MAX_WIDTH_DEVICES.indexOf(device);
  const larger = MAX_WIDTH_DEVICES.slice(0, index)
    .filter((d) => typeof breakpoints[d] === 'number')
    .reverse();
  return [...larger, 'desktop'];
}

/** The media query of a device (`(max-width:767px)`), or null for desktop and devices that are off. */
export function deviceMedia(device: Device, breakpoints: Breakpoints): string | null {
  if (device === 'desktop') return null;
  const value = breakpoints[device];
  if (typeof value !== 'number') return null;
  return device === 'widescreen' ? `(min-width:${value}px)` : `(max-width:${value}px)`;
}

/**
 * The width range (px) of a device alone, for showing or hiding something on
 * that device only: from the next smaller active breakpoint to its own.
 * Null when the device is off.
 */
export function deviceRange(
  device: Device,
  breakpoints: Breakpoints,
): { min?: number; max?: number } | null {
  const active = activeDevices(breakpoints);
  if (!active.includes(device)) return null;
  if (device === 'widescreen') return { min: breakpoints.widescreen! };
  const index = active.indexOf(device);
  const smaller = active[index + 1];
  const range: { min?: number; max?: number } = {};
  if (smaller && smaller !== 'widescreen' && smaller !== 'desktop')
    range.min = breakpoints[smaller]! + 1;
  if (device === 'desktop') {
    if (typeof breakpoints.widescreen === 'number') range.max = breakpoints.widescreen - 1;
  } else range.max = breakpoints[device]!;
  return range;
}

/** A media query for a range from `deviceRange` (`''` when it covers every width). */
export function rangeMedia(range: { min?: number; max?: number }): string {
  return [
    range.min !== undefined ? `(min-width:${range.min}px)` : '',
    range.max !== undefined ? `(max-width:${range.max}px)` : '',
  ]
    .filter(Boolean)
    .join(' and ');
}

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
  /**
   * Values written as other CSS in `{{value}}`, e.g. `{ start: '-99999' }`, or
   * `{ grow: 'flex-grow: 1; flex-shrink: 0' }` with the selector `{{value}}`.
   * `''` writes nothing. Keys are the values as text (`true` for a switch).
   */
  dictionary?: Record<string, string>;
  /**
   * `text` values matching this pattern (a regular expression's source,
   * matched whole) are written as they are, e.g. a grid template
   * `1fr 2fr` or `repeat(auto-fill, minmax(200px, 1fr))`. Quotes,
   * semicolons, braces and backslashes are never let through.
   */
  pattern?: string;
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
