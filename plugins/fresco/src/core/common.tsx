/**
 * What every element shares: the Advanced tab (spacing, size, position,
 * entrance animation, background, border, responsive visibility, id and
 * classes) and the root element that carries its classes and attributes.
 */
import type { ReactNode } from 'react';
import { elementClass } from './css.js';
import { extraRootProps } from './extensions.js';
import { elementGoogleFonts } from './fonts.js';
import { interactionsAttribute, waitsHidden } from './interactions.js';
import { MASK_SHAPES, MASK_URLS } from './masks.js';
import {
  DEVICES,
  type Control,
  type Device,
  type FrescoNode,
  type Settings,
  type Tab,
} from './model.js';

/** Devices other than desktop (their values have a `@device` suffix). */
export const OTHER_DEVICES: readonly Device[] = DEVICES.filter((d) => d !== 'desktop');

/** English names of the devices (translated in the editor). */
export const DEVICE_NAMES: Record<Device, string> = {
  widescreen: 'Widescreen',
  desktop: 'Desktop',
  laptop: 'Laptop',
  tablet_extra: 'Tablet extra',
  tablet: 'Tablet',
  mobile_extra: 'Mobile extra',
  mobile: 'Mobile',
};

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
        ] satisfies Control[])),
    {
      // Fresco 2.11: a limit to the width, as Divi's modules and rows have
      // (also over the 100% cap of items in a container).
      name: '_max_width',
      type: 'slider',
      label: 'Max width',
      tab,
      section: 'Layout',
      responsive: true,
      units: UNITS.length,
      max: 1600,
      selectors: { '{{el}}, .fr-container__in > {{el}}.fr-e': 'max-width: {{value}}' },
    },
    ...flexItemControls(),
    {
      name: '_order',
      type: 'number',
      label: 'Order',
      tab,
      section: 'Layout',
      responsive: true,
      help: 'Lower numbers come first in the row or column.',
      condition: { _flex_order: ['', 'custom'] },
      selectors: { '{{el}}': 'order: {{value}}' },
    },
    ...flexSizeControls(),
    ...gridItemControls(),
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
      // Per device: "Default" takes the larger device's, "None" switches it off there.
      responsive: true,
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
      condition: { _animation: ENTRANCE_VALUES },
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
      condition: { _animation: ENTRANCE_VALUES },
      noCss: true,
    },
    ...transformControls(),
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
    transitionControl('_background_hover_transition', 'Background', '--fr-bg-transition'),
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
    ...hoverBorderControls('_', 'advanced', 'Border'),
    ...maskControls(),
    // One switch per device; the panel shows those of the active devices.
    ...DEVICES.map((device): Control => ({
      name: `_hide_${device}`,
      type: 'switch',
      label: `Hide on ${DEVICE_NAMES[device].toLowerCase()}`,
      tab,
      section: 'Responsive',
      noCss: true,
    })),
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

// ---- Flex and grid items ------------------------------------------------------------------

const ADVANCED = 'advanced' as const;

/** Align self and the order's start/end/custom choice, inside a flex container. */
function flexItemControls(): Control[] {
  return [
    {
      name: '_align_self',
      type: 'choose',
      label: 'Align self',
      tab: ADVANCED,
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
    {
      name: '_flex_order',
      type: 'choose',
      label: 'Order',
      tab: ADVANCED,
      section: 'Layout',
      responsive: true,
      default: '',
      options: [
        { value: 'start', label: 'First', icon: 'M4 6h4v12H4z M12 8h8 M12 12h8 M12 16h8' },
        { value: 'end', label: 'Last', icon: 'M16 6h4v12h-4z M4 8h8 M4 12h8 M4 16h8' },
        { value: 'custom', label: 'Custom', icon: 'M6 12h.01 M12 12h.01 M18 12h.01' },
      ],
      // Before or after every other item, whatever their own order.
      dictionary: { start: '-99999', end: '99999', custom: '' },
      selectors: { '{{el}}': 'order: {{value}}' },
    },
  ];
}

/** How the item grows and shrinks in a flex container, and its basis. */
function flexSizeControls(): Control[] {
  return [
    {
      name: '_flex_size',
      type: 'choose',
      label: 'Size',
      tab: ADVANCED,
      section: 'Layout',
      responsive: true,
      options: [
        { value: 'none', label: 'None', icon: 'M5 5l14 14 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' },
        { value: 'grow', label: 'Grow', icon: 'M3 12h18 M7 8l-4 4 4 4 M17 8l4 4-4 4' },
        { value: 'shrink', label: 'Shrink', icon: 'M3 12h7 M14 12h7 M7 8l4 4-4 4 M17 8l-4 4 4 4' },
        { value: 'custom', label: 'Custom', icon: 'M6 12h.01 M12 12h.01 M18 12h.01' },
      ],
      dictionary: {
        none: 'flex-grow: 0; flex-shrink: 0',
        grow: 'flex-grow: 1; flex-shrink: 0',
        shrink: 'flex-grow: 0; flex-shrink: 1',
        custom: '',
      },
      selectors: { '{{el}}': '{{value}}' },
    },
    {
      name: '_flex_grow',
      type: 'number',
      label: 'Flex grow',
      tab: ADVANCED,
      section: 'Layout',
      responsive: true,
      min: 0,
      placeholder: '1',
      default: 1,
      condition: { _flex_size: 'custom' },
      selectors: { '{{el}}': 'flex-grow: {{value}}' },
    },
    {
      name: '_flex_shrink',
      type: 'number',
      label: 'Flex shrink',
      tab: ADVANCED,
      section: 'Layout',
      responsive: true,
      min: 0,
      placeholder: '1',
      default: 1,
      condition: { _flex_size: 'custom' },
      selectors: { '{{el}}': 'flex-shrink: {{value}}' },
    },
    {
      name: '_flex_basis_type',
      type: 'select',
      label: 'Flex basis',
      tab: ADVANCED,
      section: 'Layout',
      responsive: true,
      options: [
        { value: '', label: 'Default' },
        { value: 'custom', label: 'Custom' },
      ],
      noCss: true,
    },
    {
      name: '_flex_basis',
      type: 'slider',
      label: 'Custom flex basis',
      tab: ADVANCED,
      section: 'Layout',
      responsive: true,
      units: ['%', 'px', 'em', 'rem', 'vw'],
      max: 1000,
      condition: { _flex_basis_type: 'custom' },
      selectors: { '{{el}}': 'flex-basis: {{value}}' },
    },
  ];
}

const SPANS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

/** Grid item: columns and rows it spans, or its own start and end lines. */
function gridItemControls(): Control[] {
  return (['column', 'row'] as const).flatMap((axis): Control[] => [
    {
      name: `_grid_${axis}`,
      type: 'select',
      label: axis === 'column' ? 'Grid column' : 'Grid row',
      tab: ADVANCED,
      section: 'Layout',
      responsive: true,
      options: [{ value: '', label: 'Default' }, ...SPANS, { value: 'custom', label: 'Custom' }],
      help:
        axis === 'column'
          ? 'Columns the item spans, in a grid container.'
          : 'Rows the item spans, in a grid container.',
      dictionary: { custom: '' },
      selectors: { '{{el}}': `grid-${axis}: span {{value}}` },
    },
    {
      name: `_grid_${axis}_custom`,
      type: 'text',
      label: axis === 'column' ? 'Custom grid column' : 'Custom grid row',
      tab: ADVANCED,
      section: 'Layout',
      responsive: true,
      placeholder: '1 / 3',
      help: 'Start and end lines, e.g. 1 / 3 or 2 / span 2.',
      condition: { [`_grid_${axis}`]: 'custom' },
      pattern: '-?\\d{1,3}( ?/ ?(-?\\d{1,3}|span \\d{1,3}))?|span \\d{1,3}( ?/ ?-?\\d{1,3})?|auto',
      selectors: { '{{el}}': `grid-${axis}: {{value}}` },
    },
  ]);
}

// ---- Transform -------------------------------------------------------------------------------

/**
 * One transform setting: a CSS variable on the element, on hover too; the
 * transform itself is composed in fresco.css (`.fr-transform`).
 */
function transformSlider(
  name: string,
  label: string,
  variable: string,
  units: string[],
  condition: Record<string, unknown>,
  range: { min?: number; max?: number; step?: number },
): Control {
  return {
    name: `_transform_${name}`,
    type: 'slider',
    label,
    tab: ADVANCED,
    section: 'Transform',
    responsive: true,
    hover: true,
    units,
    ...range,
    condition,
    selectors: {
      '{{el}}': units[0] === '' ? `${variable}: {{size}}` : `${variable}: {{value}}`,
    },
  };
}

const toggle = (name: string, label: string, extra: Partial<Control> = {}): Control => ({
  name: `_transform_${name}`,
  type: 'switch',
  label,
  tab: ADVANCED,
  section: 'Transform',
  noCss: true,
  ...extra,
});

/** The toggles that switch a transform on (the element then gets `fr-transform`). */
export const TRANSFORM_TOGGLES = [
  '_transform_rotate_popover',
  '_transform_translate_popover',
  '_transform_scale_popover',
  '_transform_skew_popover',
];

function transformControls(): Control[] {
  const deg = ['deg'];
  const angle = { min: -360, max: 360 };
  const rotate = { _transform_rotate_popover: true };
  const rotate3d = { _transform_rotate_popover: true, _transform_rotate_3d: true };
  const scale = { _transform_scale_popover: true };
  const flip = (axis: 'X' | 'Y', label: string): Control => ({
    name: `_transform_flip${axis}_effect`,
    type: 'switch',
    label,
    tab: ADVANCED,
    section: 'Transform',
    hover: true,
    dictionary: { true: '-1' },
    selectors: { '{{el}}': `--fr-tr-flip-${axis.toLowerCase()}: {{value}}` },
  });
  return [
    toggle('rotate_popover', 'Rotate'),
    transformSlider('rotateZ_effect', 'Rotate (deg)', '--fr-tr-rotate', deg, rotate, angle),
    toggle('rotate_3d', '3D rotate', { condition: rotate }),
    transformSlider('rotateX_effect', 'Rotate X (deg)', '--fr-tr-rotate-x', deg, rotate3d, angle),
    transformSlider('rotateY_effect', 'Rotate Y (deg)', '--fr-tr-rotate-y', deg, rotate3d, angle),
    {
      ...transformSlider('perspective_effect', 'Perspective (px)', '', ['px'], rotate3d, {
        min: 0,
        max: 1000,
      }),
      // The whole function, so that without it there is no perspective at all.
      selectors: { '{{el}}': '--fr-tr-perspective: perspective({{value}})' },
    },
    toggle('translate_popover', 'Offset'),
    ...(['X', 'Y'] as const).map((axis) =>
      transformSlider(
        `translate${axis}_effect`,
        `Offset ${axis}`,
        `--fr-tr-${axis.toLowerCase()}`,
        ['px', '%', 'em', 'rem', axis === 'X' ? 'vw' : 'vh'],
        { _transform_translate_popover: true },
        { min: -1000, max: 1000 },
      ),
    ),
    toggle('scale_popover', 'Scale'),
    toggle('scale_separate', 'Scale X and Y separately', { condition: scale }),
    transformSlider(
      'scale_effect',
      'Scale',
      '--fr-tr-scale',
      [''],
      { ...scale, _transform_scale_separate: [undefined, false] },
      { min: 0, max: 2, step: 0.05 },
    ),
    transformSlider(
      'scaleX_effect',
      'Scale X',
      '--fr-tr-scale-x',
      [''],
      { ...scale, _transform_scale_separate: true },
      { min: 0, max: 2, step: 0.05 },
    ),
    transformSlider(
      'scaleY_effect',
      'Scale Y',
      '--fr-tr-scale-y',
      [''],
      { ...scale, _transform_scale_separate: true },
      { min: 0, max: 2, step: 0.05 },
    ),
    toggle('skew_popover', 'Skew'),
    ...(['X', 'Y'] as const).map((axis) =>
      transformSlider(
        `skew${axis}_effect`,
        `Skew ${axis} (deg)`,
        `--fr-tr-skew-${axis.toLowerCase()}`,
        deg,
        { _transform_skew_popover: true },
        angle,
      ),
    ),
    flip('X', 'Flip horizontal'),
    flip('Y', 'Flip vertical'),
    {
      name: '_transform_transition_hover',
      type: 'slider',
      label: 'Transition duration (ms)',
      tab: ADVANCED,
      section: 'Transform',
      units: ['ms'],
      min: 0,
      max: 10000,
      step: 100,
      selectors: { '{{el}}': '--fr-tr-duration: {{value}}' },
    },
    {
      name: '_transform_origin_x',
      type: 'choose',
      label: 'X anchor point',
      tab: ADVANCED,
      section: 'Transform',
      responsive: true,
      options: [
        { value: 'left', label: 'Left', icon: 'M4 4v16 M8 12h12' },
        { value: 'center', label: 'Center', icon: 'M12 4v16 M4 12h16' },
        { value: 'right', label: 'Right', icon: 'M20 4v16 M4 12h12' },
      ],
      selectors: { '{{el}}': '--fr-tr-origin-x: {{value}}' },
    },
    {
      name: '_transform_origin_y',
      type: 'choose',
      label: 'Y anchor point',
      tab: ADVANCED,
      section: 'Transform',
      responsive: true,
      options: [
        { value: 'top', label: 'Top', icon: 'M4 4h16 M12 8v12' },
        { value: 'center', label: 'Center', icon: 'M4 12h16 M12 4v16' },
        { value: 'bottom', label: 'Bottom', icon: 'M4 20h16 M12 4v12' },
      ],
      selectors: { '{{el}}': '--fr-tr-origin-y: {{value}}' },
    },
  ];
}

// ---- Hover border, transitions, mask ----------------------------------------------------------

/** A transition duration in seconds, as a CSS variable (`.fr-transition` uses it). */
export function transitionControl(
  name: string,
  section: string,
  variable: string,
  tab: Tab = ADVANCED,
): Control {
  return {
    name,
    type: 'slider',
    label: 'Transition duration (s)',
    tab,
    section,
    units: ['s'],
    min: 0,
    max: 3,
    step: 0.1,
    selectors: { '{{el}}': `${variable}: {{value}}` },
  };
}

/** Border, radius and shadow on hover, and how long the change takes (`prefix`: `_` or ``). */
export function hoverBorderControls(prefix: string, tab: Tab, section: string): Control[] {
  return [
    {
      name: `${prefix}border_hover`,
      type: 'border',
      label: 'Border on hover',
      tab,
      section,
      selector: '{{el}}:hover',
    } as Control,
    {
      name: `${prefix}shadow_hover`,
      type: 'shadow',
      label: 'Box shadow on hover',
      tab,
      section,
      selector: '{{el}}:hover',
    } as Control,
    transitionControl(`${prefix}border_hover_transition`, section, '--fr-border-transition', tab),
  ];
}

/** Settings whose values make the element animate its hover changes. */
export const TRANSITION_KEYS = [
  '_background_hover_transition',
  '_border_hover_transition',
  'background_hover_transition',
  'border_hover_transition',
];

function maskControls(): Control[] {
  const on = { _mask_switch: true };
  const section = 'Mask';
  const selectors = (declaration: string) => ({
    '{{el}}': `-webkit-${declaration}; ${declaration}`,
  });
  return [
    {
      name: '_mask_switch',
      type: 'switch',
      label: 'Mask',
      tab: ADVANCED,
      section,
      noCss: true,
    },
    {
      name: '_mask_shape',
      type: 'select',
      label: 'Shape',
      tab: ADVANCED,
      section,
      default: 'circle',
      options: MASK_SHAPES,
      dictionary: MASK_URLS,
      condition: on,
      selectors: selectors('mask-image: {{value}}'),
    },
    {
      name: '_mask_image',
      type: 'media',
      label: 'Image',
      tab: ADVANCED,
      section,
      responsive: true,
      accept: 'image',
      help: 'An SVG or a PNG with transparency: the element shows where the image is opaque.',
      condition: { ...on, _mask_shape: 'custom' },
      selectors: selectors('mask-image: {{value}}'),
    },
    {
      name: '_mask_size',
      type: 'select',
      label: 'Size',
      tab: ADVANCED,
      section,
      responsive: true,
      default: 'contain',
      options: [
        { value: 'contain', label: 'Fit' },
        { value: 'cover', label: 'Fill' },
        { value: 'custom', label: 'Custom' },
      ],
      dictionary: { custom: '' },
      condition: on,
      selectors: selectors('mask-size: {{value}}'),
    },
    {
      name: '_mask_size_scale',
      type: 'slider',
      label: 'Scale',
      tab: ADVANCED,
      section,
      responsive: true,
      units: ['%', 'px', 'em', 'rem', 'vw'],
      max: 500,
      condition: { ...on, _mask_size: 'custom' },
      selectors: selectors('mask-size: {{value}}'),
    },
    {
      name: '_mask_position',
      type: 'select',
      label: 'Position',
      tab: ADVANCED,
      section,
      responsive: true,
      default: 'center center',
      options: [
        { value: 'center center', label: 'Center center' },
        { value: 'center left', label: 'Center left' },
        { value: 'center right', label: 'Center right' },
        { value: 'top center', label: 'Top center' },
        { value: 'top left', label: 'Top left' },
        { value: 'top right', label: 'Top right' },
        { value: 'bottom center', label: 'Bottom center' },
        { value: 'bottom left', label: 'Bottom left' },
        { value: 'bottom right', label: 'Bottom right' },
        { value: 'custom', label: 'Custom' },
      ],
      dictionary: { custom: '' },
      condition: on,
      selectors: selectors('mask-position: {{value}}'),
    },
    ...(['x', 'y'] as const).map((axis): Control => ({
      name: `_mask_position_${axis}`,
      type: 'slider',
      label: axis === 'x' ? 'X position' : 'Y position',
      tab: ADVANCED,
      section,
      responsive: true,
      units: ['%', 'px', 'em', 'rem', 'vw'],
      min: -500,
      max: 500,
      condition: { ...on, _mask_position: 'custom' },
      selectors: selectors(`mask-position-${axis}: {{value}}`),
    })),
    {
      name: '_mask_repeat',
      type: 'select',
      label: 'Repeat',
      tab: ADVANCED,
      section,
      responsive: true,
      default: 'no-repeat',
      options: [
        { value: 'no-repeat', label: 'No-repeat' },
        { value: 'repeat', label: 'Repeat' },
        { value: 'repeat-x', label: 'Repeat-x' },
        { value: 'repeat-y', label: 'Repeat-y' },
        { value: 'round', label: 'Round' },
        { value: 'space', label: 'Space' },
      ],
      condition: on,
      selectors: selectors('mask-repeat: {{value}}'),
    },
  ];
}

/**
 * Entrance animations (keyframes in public/fresco.css, written for Fresco).
 * `''` is the default: none on desktop, the larger device's on the others;
 * `none` switches the animation off on a device.
 */
export const ANIMATIONS: { value: string; label: string }[] = [
  { value: '', label: 'Default' },
  { value: 'none', label: 'None' },
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
  { value: 'zoom-in-up', label: 'Zoom in up' },
  { value: 'zoom-in-down', label: 'Zoom in down' },
  { value: 'zoom-in-left', label: 'Zoom in from the left' },
  { value: 'zoom-in-right', label: 'Zoom in from the right' },
  { value: 'bounce-in-up', label: 'Bounce in up' },
  { value: 'bounce-in-down', label: 'Bounce in down' },
  { value: 'bounce-in-left', label: 'Bounce in from the left' },
  { value: 'bounce-in-right', label: 'Bounce in from the right' },
  { value: 'rotate-in-down-left', label: 'Rotate in down left' },
  { value: 'rotate-in-down-right', label: 'Rotate in down right' },
  { value: 'rotate-in-up-left', label: 'Rotate in up left' },
  { value: 'rotate-in-up-right', label: 'Rotate in up right' },
  { value: 'light-speed-in', label: 'Light speed in' },
  { value: 'roll-in', label: 'Roll in' },
  // Attention seekers: the element is there from the start and moves once.
  { value: 'bounce', label: 'Bounce' },
  { value: 'flash', label: 'Flash' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'rubber-band', label: 'Rubber band' },
  { value: 'shake', label: 'Shake' },
  { value: 'head-shake', label: 'Head shake' },
  { value: 'swing', label: 'Swing' },
  { value: 'tada', label: 'Tada' },
  { value: 'wobble', label: 'Wobble' },
  { value: 'jello', label: 'Jello' },
];

/** The animations that move the element (not `''` nor `none`). */
const ENTRANCE_VALUES = ANIMATIONS.map((a) => a.value).filter((v) => v && v !== 'none');
const isEntrance = (value: unknown): value is string =>
  typeof value === 'string' && ENTRANCE_VALUES.includes(value);

// ---- Hover animations ------------------------------------------------------------------------

/** Hover animations (Elementor's 27), drawn by fresco.css as `fr-hover-<name>`. */
export const HOVER_ANIMATIONS: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'grow', label: 'Grow' },
  { value: 'shrink', label: 'Shrink' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'pulse-grow', label: 'Pulse grow' },
  { value: 'pulse-shrink', label: 'Pulse shrink' },
  { value: 'push', label: 'Push' },
  { value: 'pop', label: 'Pop' },
  { value: 'bounce-in', label: 'Bounce in' },
  { value: 'bounce-out', label: 'Bounce out' },
  { value: 'rotate', label: 'Rotate' },
  { value: 'grow-rotate', label: 'Grow rotate' },
  { value: 'float', label: 'Float' },
  { value: 'sink', label: 'Sink' },
  { value: 'bob', label: 'Bob' },
  { value: 'hang', label: 'Hang' },
  { value: 'skew', label: 'Skew' },
  { value: 'skew-forward', label: 'Skew forward' },
  { value: 'skew-backward', label: 'Skew backward' },
  { value: 'wobble-vertical', label: 'Wobble vertical' },
  { value: 'wobble-horizontal', label: 'Wobble horizontal' },
  { value: 'wobble-to-bottom-right', label: 'Wobble to bottom right' },
  { value: 'wobble-to-top-right', label: 'Wobble to top right' },
  { value: 'wobble-top', label: 'Wobble top' },
  { value: 'wobble-bottom', label: 'Wobble bottom' },
  { value: 'wobble-skew', label: 'Wobble skew' },
  { value: 'buzz', label: 'Buzz' },
  { value: 'buzz-out', label: 'Buzz out' },
];

/** The Hover animation select of a widget (`hover_effect`, as Image and Button have it). */
export function hoverAnimationControl(
  section: string,
  tab: Tab = 'style',
  name = 'hover_effect',
): Control {
  return {
    name,
    type: 'select',
    label: 'Hover animation',
    tab,
    section,
    options: HOVER_ANIMATIONS,
    noCss: true,
  };
}

/** The class of a hover animation (` fr-hover-grow`), or `''`. */
export function hoverClass(value: unknown): string {
  return typeof value === 'string' && value && HOVER_ANIMATIONS.some((a) => a.value === value)
    ? ` fr-hover-${value}`
    : '';
}

// ---- Text stroke -----------------------------------------------------------------------------

/**
 * Elementor's Text Stroke group as two settings: the stroke's width
 * (`<name>`, per device) and its color (`<name>_color`).
 */
export function textStrokeControls(
  name: string,
  section: string,
  selector: string,
  tab: Tab = 'style',
): Control[] {
  return [
    {
      name,
      type: 'slider',
      label: 'Text stroke',
      tab,
      section,
      responsive: true,
      units: ['px', 'em'],
      max: 10,
      step: 0.1,
      selectors: { [selector]: '-webkit-text-stroke-width: {{value}}; stroke-width: {{value}}' },
    },
    {
      name: `${name}_color`,
      type: 'color',
      label: 'Stroke color',
      tab,
      section,
      selectors: { [selector]: '-webkit-text-stroke-color: {{value}}; stroke: {{value}}' },
    },
  ];
}

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
  for (const device of DEVICES) {
    if (settings[`_hide_${device}`] === true) classes.push(`fr-hide-${device}`);
  }
  // Transform (rotate, offset, scale, skew, flip) and hover transitions: composed in fresco.css.
  if (
    TRANSFORM_TOGGLES.some((key) => settings[key] === true) ||
    Object.entries(node.attrs).some(
      ([key, value]) => value === true && /^_transform_flip[XY]_effect\b/.test(key),
    )
  ) {
    classes.push('fr-transform');
  }
  if (TRANSITION_KEYS.some((key) => node.attrs[key] !== undefined && node.attrs[key] !== '')) {
    classes.push('fr-transition');
  }
  const width = settings._width;
  if (width === 'full') classes.push('fr-w-full');
  if (width === 'auto') classes.push('fr-w-auto');
  for (const device of OTHER_DEVICES) {
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
  // Entrance animation; other devices may have their own (frontend.js picks the one
  // of the device in use, from the kit's `--fr-device`), or none (`none`).
  const animation = settings._animation;
  const perDevice: [string, string][] = [];
  for (const device of OTHER_DEVICES) {
    const value = node.attrs[`_animation@${device}`];
    if (value === 'none' || isEntrance(value)) perDevice.push([device, value]);
  }
  const animated = isEntrance(animation) || perDevice.some(([, value]) => value !== 'none');
  if (animated) {
    props['data-fr-anim'] = isEntrance(animation) ? animation : '';
    props.className += ` fr-anim fr-anim-${settings._animation_duration === 'slow' ? 'slow' : settings._animation_duration === 'fast' ? 'fast' : 'normal'}`;
    const delay = Number(settings._animation_delay);
    if (Number.isFinite(delay) && delay > 0)
      props['data-fr-delay'] = String(Math.min(delay, 10000));
    for (const [device, value] of perDevice) props[`data-fr-anim-${device}`] = value;
  }
  if (editing) props['data-fr-id'] = node.id;
  else {
    // Interactions (atomic elements): played by frontend.js.
    const interactions = interactionsAttribute(node.attrs._interactions);
    if (interactions) {
      props['data-fr-ia'] = interactions;
      if (waitsHidden(node.attrs._interactions)) props['data-fr-ia-wait'] = '';
    }
    // Google fonts it uses, for the page to load (see the kit's render.html filter).
    const fonts = elementGoogleFonts(node.attrs);
    if (fonts.length) props['data-fr-fonts'] = fonts.join('|');
  }
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
