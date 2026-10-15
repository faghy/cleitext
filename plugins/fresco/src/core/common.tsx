/**
 * What every element shares: the Advanced tab (spacing, size, position,
 * entrance animation, background, border, responsive visibility, id and
 * classes) and the root element that carries its classes and attributes.
 */
import type { ReactNode } from 'react';
import { elementClass } from './css.js';
import { extraRootProps } from './extensions.js';
import type { Control, FrescoNode, Settings } from './model.js';

export const UNITS = {
  length: ['px', '%', 'em', 'rem', 'vw'],
  box: ['px', '%', 'em', 'rem'],
  font: ['px', 'em', 'rem', 'vw'],
  height: ['px', 'vh', 'em', 'rem'],
};

/** Controls of the Advanced tab, for every element. */
export function advancedControls(options: { container?: boolean } = {}): Control[] {
  const tab = 'advanced' as const;
  return [
    {
      name: '_margin',
      type: 'box',
      label: 'Margin',
      tab,
      section: 'Layout',
      responsive: true,
      units: [...UNITS.box, 'vw'],
      selectors: { '{{el}}': 'margin: {{top}} {{right}} {{bottom}} {{left}}' },
    },
    {
      name: '_padding',
      type: 'box',
      label: 'Padding',
      tab,
      section: 'Layout',
      responsive: true,
      units: UNITS.box,
      selectors: { '{{el}}': 'padding: {{top}} {{right}} {{bottom}} {{left}}' },
    },
    ...(options.container
      ? []
      : ([
          {
            name: '_width',
            type: 'select',
            label: 'Width',
            tab,
            section: 'Layout',
            responsive: true,
            options: [
              { value: '', label: 'Default' },
              { value: 'full', label: 'Full width (100%)' },
              { value: 'auto', label: 'Inline (auto)' },
              { value: 'custom', label: 'Custom' },
            ],
            selectors: {},
            noCss: true,
          },
          {
            name: '_width_custom',
            type: 'slider',
            label: 'Custom width',
            tab,
            section: 'Layout',
            responsive: true,
            units: UNITS.length,
            max: 1600,
            condition: { _width: 'custom' },
            selectors: { '{{el}}': 'width: {{value}}; max-width: {{value}}; flex: 0 0 auto' },
          },
          {
            name: '_align_self',
            type: 'choose',
            label: 'Align self',
            tab,
            section: 'Layout',
            responsive: true,
            options: [
              { value: 'flex-start', label: 'Start', icon: 'M6 4v16 M10 8h8 M10 16h5' },
              { value: 'center', label: 'Center', icon: 'M12 4v16 M7 8h10 M8 16h8' },
              { value: 'flex-end', label: 'End', icon: 'M18 4v16 M6 8h8 M9 16h5' },
              { value: 'stretch', label: 'Stretch', icon: 'M4 4v16 M20 4v16 M7 12h10' },
            ],
            selectors: { '{{el}}': 'align-self: {{value}}' },
          },
        ] satisfies Control[])),
    {
      name: '_order',
      type: 'number',
      label: 'Order',
      tab,
      section: 'Layout',
      responsive: true,
      help: 'Lower numbers come first in the row or column.',
      selectors: { '{{el}}': 'order: {{value}}' },
    },
    {
      name: '_z_index',
      type: 'number',
      label: 'Z-index',
      tab,
      section: 'Layout',
      responsive: true,
      selectors: { '{{el}}': 'z-index: {{value}}' },
    },
    {
      name: '_position',
      type: 'select',
      label: 'Position',
      tab,
      section: 'Position',
      default: '',
      options: [
        { value: '', label: 'Default' },
        { value: 'relative', label: 'Relative' },
        { value: 'absolute', label: 'Absolute' },
        { value: 'fixed', label: 'Fixed' },
      ],
      selectors: { '{{el}}': 'position: {{value}}' },
    },
    ...(['top', 'right', 'bottom', 'left'] as const).map((side): Control => ({
      name: `_offset_${side}`,
      type: 'slider',
      label: side[0]!.toUpperCase() + side.slice(1),
      tab,
      section: 'Position',
      responsive: true,
      units: ['px', '%', 'vw', 'vh'],
      min: -1000,
      max: 1000,
      condition: { _position: ['relative', 'absolute', 'fixed'] },
      selectors: { '{{el}}': `${side}: {{value}}` },
    })),
    {
      name: '_animation',
      type: 'animation',
      label: 'Entrance animation',
      tab,
      section: 'Motion',
      default: '',
      noCss: true,
    },
    {
      name: '_animation_duration',
      type: 'select',
      label: 'Duration',
      tab,
      section: 'Motion',
      default: 'normal',
      options: [
        { value: 'slow', label: 'Slow' },
        { value: 'normal', label: 'Normal' },
        { value: 'fast', label: 'Fast' },
      ],
      condition: { _animation: ANIMATIONS.map((a) => a.value).filter(Boolean) },
      noCss: true,
    },
    {
      name: '_animation_delay',
      type: 'number',
      label: 'Delay (ms)',
      tab,
      section: 'Motion',
      min: 0,
      max: 10000,
      step: 100,
      condition: { _animation: ANIMATIONS.map((a) => a.value).filter(Boolean) },
      noCss: true,
    },
    {
      name: '_background',
      type: 'background',
      label: 'Background',
      tab,
      section: 'Background',
      selector: '{{el}}',
    } as Control,
    {
      name: '_background_hover',
      type: 'background',
      label: 'Background on hover',
      tab,
      section: 'Background',
      selector: '{{el}}:hover',
    } as Control,
    {
      name: '_border',
      type: 'border',
      label: 'Border',
      tab,
      section: 'Border',
      selector: '{{el}}',
    } as Control,
    {
      name: '_shadow',
      type: 'shadow',
      label: 'Box shadow',
      tab,
      section: 'Border',
      selector: '{{el}}',
    } as Control,
    {
      name: '_hide_desktop',
      type: 'switch',
      label: 'Hide on desktop',
      tab,
      section: 'Responsive',
      noCss: true,
    },
    {
      name: '_hide_tablet',
      type: 'switch',
      label: 'Hide on tablet',
      tab,
      section: 'Responsive',
      noCss: true,
    },
    {
      name: '_hide_mobile',
      type: 'switch',
      label: 'Hide on mobile',
      tab,
      section: 'Responsive',
      noCss: true,
    },
    {
      name: '_css_id',
      type: 'text',
      label: 'CSS ID',
      tab,
      section: 'Attributes',
      help: 'Letters, digits, dashes and underscores. Links to #id jump here.',
      noCss: true,
    },
    {
      name: '_css_classes',
      type: 'text',
      label: 'CSS classes',
      tab,
      section: 'Attributes',
      help: 'Separated by spaces, without the dot.',
      noCss: true,
    },
  ];
}

/** Entrance animations (keyframes in public/fresco.css, written for Fresco). */
export const ANIMATIONS: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'fade-in', label: 'Fade in' },
  { value: 'fade-up', label: 'Fade in up' },
  { value: 'fade-down', label: 'Fade in down' },
  { value: 'fade-left', label: 'Fade in from the left' },
  { value: 'fade-right', label: 'Fade in from the right' },
  { value: 'zoom-in', label: 'Zoom in' },
  { value: 'zoom-out', label: 'Zoom out' },
  { value: 'slide-up', label: 'Slide up' },
  { value: 'slide-down', label: 'Slide down' },
  { value: 'slide-left', label: 'Slide from the left' },
  { value: 'slide-right', label: 'Slide from the right' },
  { value: 'flip-x', label: 'Flip (horizontal axis)' },
  { value: 'flip-y', label: 'Flip (vertical axis)' },
  { value: 'bounce-in', label: 'Bounce in' },
  { value: 'pop', label: 'Pop' },
  { value: 'rotate-in', label: 'Rotate in' },
  { value: 'blur-in', label: 'Blur in' },
];

const CLASS = /^-?[_a-zA-Z][_a-zA-Z0-9-]{0,63}$/;
const CSS_ID = /^[A-Za-z][\w-]{0,63}$/;

/** Classes and attributes of an element's root, from its Advanced settings. */
export function rootProps(
  node: FrescoNode,
  settings: Settings,
  name: string,
  editing: boolean,
): {
  className: string;
  id?: string;
  'data-fr-anim'?: string;
  'data-fr-delay'?: string;
  'data-fr-id'?: string;
  style?: Record<string, string>;
  [attribute: string]: unknown;
} {
  const classes = ['fr-e', elementClass(node.id), name];
  if (typeof settings._css_classes === 'string') {
    for (const c of settings._css_classes.split(/\s+/)) if (CLASS.test(c)) classes.push(c);
  }
  for (const device of ['desktop', 'tablet', 'mobile']) {
    if (settings[`_hide_${device}`] === true) classes.push(`fr-hide-${device}`);
  }
  const width = settings._width;
  if (width === 'full') classes.push('fr-w-full');
  if (width === 'auto') classes.push('fr-w-auto');
  for (const device of ['tablet', 'mobile']) {
    const w = node.attrs[`_width@${device}`];
    if (w === 'full' || w === 'auto') classes.push(`fr-w-${w}-${device}`);
  }
  // Global classes of atomic elements.
  if (Array.isArray(settings._classes)) {
    for (const id of settings._classes) {
      if (typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id)) classes.push(`fr-g-${id}`);
    }
  }
  const props: ReturnType<typeof rootProps> = { className: classes.join(' ') };
  if (typeof settings._css_id === 'string' && CSS_ID.test(settings._css_id))
    props.id = settings._css_id;
  const animation = settings._animation;
  if (typeof animation === 'string' && ANIMATIONS.some((a) => a.value === animation && a.value)) {
    props['data-fr-anim'] = animation;
    props.className += ` fr-anim fr-anim-${settings._animation_duration === 'slow' ? 'slow' : settings._animation_duration === 'fast' ? 'fast' : 'normal'}`;
    const delay = Number(settings._animation_delay);
    if (Number.isFinite(delay) && delay > 0)
      props['data-fr-delay'] = String(Math.min(delay, 10000));
  }
  if (editing) props['data-fr-id'] = node.id;
  // Attributes from extensions (Fresco Pro); their classes are added, not replaced.
  const { className: extraClass, ...extra } = extraRootProps(node, settings, editing);
  if (extraClass) props.className += ` ${extraClass}`;
  for (const [key, value] of Object.entries(extra)) if (!(key in props)) props[key] = value;
  return props;
}

/** The root element of a widget or container. */
export function ElementRoot({
  node,
  settings,
  name,
  editing,
  tag = 'div',
  children,
  extra,
}: {
  node: FrescoNode;
  settings: Settings;
  name: string;
  editing: boolean;
  tag?:
    | 'div'
    | 'section'
    | 'article'
    | 'aside'
    | 'header'
    | 'footer'
    | 'nav'
    | 'main'
    | 'a'
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'
    | 'p'
    | 'span';
  children?: ReactNode;
  extra?: Record<string, string | undefined>;
}) {
  const Tag = tag;
  return (
    <Tag {...rootProps(node, settings, name, editing)} {...extra}>
      {children}
    </Tag>
  );
}
