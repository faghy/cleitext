/**
 * The choices Diorama offers: entrance and exit effects, slide transitions,
 * easings, navigation styles, Ken Burns, icons, and the sizes of devices.
 * Labels are in English: the admin translates them.
 */
import type {
  Anchor,
  Device,
  EasingId,
  FontFamily,
  HoverId,
  KenBurns,
  MotionId,
  NavStyle,
  TransitionId,
} from './types';

/** Width of the canvas for each device, in pixels (also the base of fluid font sizes). */
export const DESIGN_WIDTH: Record<Device, number> = { desktop: 1200, tablet: 768, mobile: 390 };

/** Media queries of tablets and phones (the windows at most this wide). */
export const BREAKPOINT: Record<Exclude<Device, 'desktop'>, number> = { tablet: 1024, mobile: 767 };

export const MOTIONS: readonly { id: MotionId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'fade-up', label: 'Fade up' },
  { id: 'fade-down', label: 'Fade down' },
  { id: 'fade-left', label: 'Fade from the right' },
  { id: 'fade-right', label: 'Fade from the left' },
  { id: 'zoom-in', label: 'Zoom in' },
  { id: 'zoom-out', label: 'Zoom out' },
  { id: 'slide-up', label: 'Slide up' },
  { id: 'slide-down', label: 'Slide down' },
  { id: 'slide-left', label: 'Slide from the right' },
  { id: 'slide-right', label: 'Slide from the left' },
  { id: 'blur', label: 'Blur' },
  { id: 'flip', label: 'Flip' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'skew', label: 'Skew' },
];

/**
 * The state a layer enters from (and exits to): CSS `transform`, opacity
 * and filter. The visible state is `none`, 1 and `none`.
 */
export const MOTION_FROM: Record<
  Exclude<MotionId, 'none'>,
  { transform: string; filter?: string }
> = {
  fade: { transform: 'none' },
  'fade-up': { transform: 'translateY(32px)' },
  'fade-down': { transform: 'translateY(-32px)' },
  'fade-left': { transform: 'translateX(40px)' },
  'fade-right': { transform: 'translateX(-40px)' },
  'zoom-in': { transform: 'scale(.7)' },
  'zoom-out': { transform: 'scale(1.3)' },
  'slide-up': { transform: 'translateY(100%)' },
  'slide-down': { transform: 'translateY(-100%)' },
  'slide-left': { transform: 'translateX(100%)' },
  'slide-right': { transform: 'translateX(-100%)' },
  blur: { transform: 'scale(1.05)', filter: 'blur(12px)' },
  flip: { transform: 'perspective(600px) rotateX(80deg)' },
  rotate: { transform: 'rotate(-12deg) scale(.9)' },
  skew: { transform: 'skewX(-14deg) translateX(-24px)' },
};

export const HOVERS: readonly { id: HoverId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'lift', label: 'Lift' },
  { id: 'grow', label: 'Grow' },
  { id: 'glow', label: 'Glow' },
  { id: 'darken', label: 'Darken' },
  { id: 'shift', label: 'Nudge the arrow' },
];

export const TRANSITIONS: readonly { id: TransitionId; label: string }[] = [
  { id: 'fade', label: 'Fade' },
  { id: 'crossfade', label: 'Crossfade' },
  { id: 'slide-left', label: 'Slide to the left' },
  { id: 'slide-right', label: 'Slide to the right' },
  { id: 'slide-up', label: 'Slide up' },
  { id: 'slide-down', label: 'Slide down' },
  { id: 'slide-over', label: 'Slide over' },
  { id: 'zoom', label: 'Zoom' },
];

export const EASINGS: Record<EasingId, { label: string; css: string }> = {
  ease: { label: 'Gentle', css: 'ease' },
  'ease-out': { label: 'Slow down at the end', css: 'cubic-bezier(.16,1,.3,1)' },
  'ease-in-out': { label: 'Slow start and end', css: 'cubic-bezier(.65,0,.35,1)' },
  linear: { label: 'Even', css: 'linear' },
  smooth: { label: 'Smooth', css: 'cubic-bezier(.25,.8,.25,1)' },
  bounce: { label: 'Bounce', css: 'cubic-bezier(.34,1.56,.64,1)' },
};

export const NAV_STYLES: readonly { id: NavStyle; label: string }[] = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'circle', label: 'Circles' },
  { id: 'square', label: 'Squares' },
  { id: 'pill', label: 'Pills' },
  { id: 'line', label: 'Lines' },
  { id: 'outline', label: 'Outline' },
];

export const KEN_BURNS: readonly { id: KenBurns; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'zoom-in', label: 'Slow zoom in' },
  { id: 'zoom-out', label: 'Slow zoom out' },
  { id: 'pan', label: 'Pan across' },
];

export const FONT_STACKS: Record<FontFamily, string> = {
  inherit: 'inherit',
  sans: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  serif: 'Georgia,"Times New Roman",Times,serif',
  display: '"Avenir Next","Montserrat","Segoe UI",system-ui,sans-serif',
  mono: 'ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace',
};

/** The point of a layer at x/y, as a translation of the layer (% of its own size). */
export const ANCHOR_SHIFT: Record<Anchor, [number, number]> = {
  tl: [0, 0],
  t: [-50, 0],
  tr: [-100, 0],
  l: [0, -50],
  c: [-50, -50],
  r: [-100, -50],
  bl: [0, -100],
  b: [-50, -100],
  br: [-100, -100],
};

/** Ready positions of the content box: anchor and point. */
export const BOX_PLACES: readonly { id: Anchor; label: string; x: number; y: number }[] = [
  { id: 'tl', label: 'Top left', x: 6, y: 10 },
  { id: 't', label: 'Top', x: 50, y: 10 },
  { id: 'tr', label: 'Top right', x: 94, y: 10 },
  { id: 'l', label: 'Left', x: 6, y: 50 },
  { id: 'c', label: 'Centre', x: 50, y: 50 },
  { id: 'r', label: 'Right', x: 94, y: 50 },
  { id: 'bl', label: 'Bottom left', x: 6, y: 90 },
  { id: 'b', label: 'Bottom', x: 50, y: 90 },
  { id: 'br', label: 'Bottom right', x: 94, y: 90 },
];

/**
 * Icons drawn on a 24×24 grid as outlines (stroke 2, round ends), with the
 * current colour.
 */
export const ICONS: Record<string, { label: string; path: string }> = {
  'arrow-right': { label: 'Arrow right', path: 'M5 12h14 M13 6l6 6-6 6' },
  'arrow-down': { label: 'Arrow down', path: 'M12 5v14 M6 13l6 6 6-6' },
  check: { label: 'Check', path: 'M4 12.5l5 5L20 6.5' },
  star: {
    label: 'Star',
    path: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z',
  },
  heart: {
    label: 'Heart',
    path: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z',
  },
  phone: {
    label: 'Phone',
    path: 'M5 4h3.5l1.5 4-2.2 1.4a11 11 0 0 0 6.8 6.8L16 14l4 1.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z',
  },
  mail: { label: 'Email', path: 'M3.5 6h17v12h-17z M3.5 7l8.5 6.5L20.5 7' },
  pin: {
    label: 'Place',
    path: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z M12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  },
  calendar: { label: 'Calendar', path: 'M4 6h16v14H4z M4 10h16 M8 3.5V7 M16 3.5V7' },
  clock: { label: 'Clock', path: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z M12 7.5V12l3 2' },
  play: {
    label: 'Play',
    path: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z M10 8.5v7l5.5-3.5z',
  },
  cart: {
    label: 'Cart',
    path: 'M3.5 4.5h2.2l2.1 10.2h10.4l1.8-7.2H6.6 M9.5 19.5h.01 M17 19.5h.01',
  },
  tag: {
    label: 'Price tag',
    path: 'M3.5 12.2V4.5h7.7l9 9-7.7 7.7z M8 8h.01',
  },
  gift: {
    label: 'Gift',
    path: 'M4 10h16v10H4z M3 7h18v3H3z M12 7v13 M12 7c-1.5-3.5-6-3.5-5 0 M12 7c1.5-3.5 6-3.5 5 0',
  },
  quote: {
    label: 'Quote',
    path: 'M5 17c2-1 3-3 3-6H5V6h5v5c0 4-2 6.5-5 7.5z M14 17c2-1 3-3 3-6h-3V6h5v5c0 4-2 6.5-5 7.5z',
  },
  sparkle: {
    label: 'Sparkle',
    path: 'M12 3l1.8 5.7L19.5 10.5l-5.7 1.8L12 18l-1.8-5.7L4.5 10.5l5.7-1.8z M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  },
  leaf: {
    label: 'Leaf',
    path: 'M5 19c0-8 5-13.5 14-14.5-.5 9-6 14-14 14.5z M5 19l7-7',
  },
  cup: {
    label: 'Cup',
    path: 'M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16 M8 3.5v2 M11 3.5v2 M14 3.5v2',
  },
  bed: {
    label: 'Bed',
    path: 'M3 18V6 M3 14h18v4 M21 14v-2.5A2.5 2.5 0 0 0 18.5 9H11v5 M6.5 11.5h.01',
  },
  user: {
    label: 'Person',
    path: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6',
  },
  shield: {
    label: 'Shield',
    path: 'M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z',
  },
  bolt: { label: 'Lightning', path: 'M13 3L5 13.5h6L10 21l8-10.5h-6z' },
  globe: {
    label: 'Globe',
    path: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z M3.5 12h17 M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z',
  },
  music: {
    label: 'Music',
    path: 'M9 18V5.5l11-2V16 M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  },
};

/** Arrows of the navigation (24×24 outlines). */
export const NAV_ICONS = {
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  pause: 'M8.5 5.5v13 M15.5 5.5v13',
  play: 'M7.5 5v14l11-7z',
};
