/**
 * Atomic styling: an element's look is a list of style variants (device ×
 * state) of plain CSS properties, local to the element or shared through
 * global classes. Variables (colors, fonts, sizes) are named values kept in
 * the kit and used as `var(--fr-v-<id>)`.
 */
import { boxCss, isBox, isSize, safeColor, safeFont } from './css.js';
import {
  DEVICES,
  SHEET_ORDER,
  deviceMedia,
  type BoxValue,
  type Breakpoints,
  type Device,
  type SizeValue,
} from './model.js';

export type StyleState = '' | 'hover' | 'focus' | 'active';

export interface StyleVariant {
  device: Device;
  state: StyleState;
  props: Record<string, unknown>;
}

export interface GlobalClass {
  id: string;
  label: string;
  variants: StyleVariant[];
}

export interface Variable {
  id: string;
  label: string;
  type: 'color' | 'font' | 'size';
  value: string;
  /**
   * Deleted in the Variables manager, as in Elementor: kept so the elements
   * using it look the same, no longer offered, and can be restored.
   */
  deleted?: boolean;
}

export type StylePropType =
  'size' | 'box' | 'color' | 'select' | 'number' | 'font' | 'text' | 'shadow';

export interface StyleProp {
  key: string;
  label: string;
  css: string;
  type: StylePropType;
  section: string;
  options?: string[];
  units?: string[];
}

const LEN = ['px', '%', 'em', 'rem', 'vw', 'vh'];

/** The properties the style panel offers, grouped by section. */
export const STYLE_PROPS: StyleProp[] = [
  {
    key: 'display',
    label: 'Display',
    css: 'display',
    type: 'select',
    section: 'Layout',
    options: ['block', 'flex', 'grid', 'inline-block', 'inline-flex', 'none'],
  },
  {
    key: 'flexDirection',
    label: 'Direction',
    css: 'flex-direction',
    type: 'select',
    section: 'Layout',
    options: ['row', 'column', 'row-reverse', 'column-reverse'],
  },
  {
    key: 'justifyContent',
    label: 'Justify content',
    css: 'justify-content',
    type: 'select',
    section: 'Layout',
    options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
  },
  {
    key: 'alignItems',
    label: 'Align items',
    css: 'align-items',
    type: 'select',
    section: 'Layout',
    options: ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'],
  },
  {
    key: 'flexWrap',
    label: 'Wrap',
    css: 'flex-wrap',
    type: 'select',
    section: 'Layout',
    options: ['nowrap', 'wrap'],
  },
  { key: 'gap', label: 'Gap', css: 'gap', type: 'size', section: 'Layout', units: LEN },
  {
    key: 'gridTemplateColumns',
    label: 'Grid columns',
    css: 'grid-template-columns',
    type: 'number',
    section: 'Layout',
  },
  {
    key: 'alignSelf',
    label: 'Align self',
    css: 'align-self',
    type: 'select',
    section: 'Layout',
    options: ['auto', 'flex-start', 'center', 'flex-end', 'stretch'],
  },
  { key: 'flexGrow', label: 'Grow', css: 'flex-grow', type: 'number', section: 'Layout' },
  { key: 'order', label: 'Order', css: 'order', type: 'number', section: 'Layout' },
  { key: 'padding', label: 'Padding', css: 'padding', type: 'box', section: 'Spacing', units: LEN },
  { key: 'margin', label: 'Margin', css: 'margin', type: 'box', section: 'Spacing', units: LEN },
  { key: 'width', label: 'Width', css: 'width', type: 'size', section: 'Size', units: LEN },
  { key: 'height', label: 'Height', css: 'height', type: 'size', section: 'Size', units: LEN },
  {
    key: 'minWidth',
    label: 'Min width',
    css: 'min-width',
    type: 'size',
    section: 'Size',
    units: LEN,
  },
  {
    key: 'minHeight',
    label: 'Min height',
    css: 'min-height',
    type: 'size',
    section: 'Size',
    units: LEN,
  },
  {
    key: 'maxWidth',
    label: 'Max width',
    css: 'max-width',
    type: 'size',
    section: 'Size',
    units: LEN,
  },
  {
    key: 'maxHeight',
    label: 'Max height',
    css: 'max-height',
    type: 'size',
    section: 'Size',
    units: LEN,
  },
  {
    key: 'overflow',
    label: 'Overflow',
    css: 'overflow',
    type: 'select',
    section: 'Size',
    options: ['visible', 'hidden', 'auto'],
  },
  {
    key: 'objectFit',
    label: 'Object fit',
    css: 'object-fit',
    type: 'select',
    section: 'Size',
    options: ['fill', 'cover', 'contain', 'none'],
  },
  {
    key: 'aspectRatio',
    label: 'Aspect ratio',
    css: 'aspect-ratio',
    type: 'select',
    section: 'Size',
    options: ['auto', '1/1', '4/3', '3/2', '16/9', '9/16', '21/9'],
  },
  {
    key: 'position',
    label: 'Position',
    css: 'position',
    type: 'select',
    section: 'Position',
    options: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  },
  { key: 'top', label: 'Top', css: 'top', type: 'size', section: 'Position', units: LEN },
  { key: 'right', label: 'Right', css: 'right', type: 'size', section: 'Position', units: LEN },
  { key: 'bottom', label: 'Bottom', css: 'bottom', type: 'size', section: 'Position', units: LEN },
  { key: 'left', label: 'Left', css: 'left', type: 'size', section: 'Position', units: LEN },
  { key: 'zIndex', label: 'Z-index', css: 'z-index', type: 'number', section: 'Position' },
  {
    key: 'fontFamily',
    label: 'Font family',
    css: 'font-family',
    type: 'font',
    section: 'Typography',
  },
  {
    key: 'fontSize',
    label: 'Font size',
    css: 'font-size',
    type: 'size',
    section: 'Typography',
    units: ['px', 'em', 'rem', 'vw'],
  },
  {
    key: 'fontWeight',
    label: 'Font weight',
    css: 'font-weight',
    type: 'select',
    section: 'Typography',
    options: ['300', '400', '500', '600', '700', '800', '900'],
  },
  { key: 'color', label: 'Color', css: 'color', type: 'color', section: 'Typography' },
  {
    key: 'textAlign',
    label: 'Text align',
    css: 'text-align',
    type: 'select',
    section: 'Typography',
    options: ['left', 'center', 'right', 'justify'],
  },
  {
    key: 'lineHeight',
    label: 'Line height',
    css: 'line-height',
    type: 'size',
    section: 'Typography',
    units: ['', 'px', 'em'],
  },
  {
    key: 'letterSpacing',
    label: 'Letter spacing',
    css: 'letter-spacing',
    type: 'size',
    section: 'Typography',
    units: ['px', 'em'],
  },
  {
    key: 'textTransform',
    label: 'Transform',
    css: 'text-transform',
    type: 'select',
    section: 'Typography',
    options: ['none', 'uppercase', 'lowercase', 'capitalize'],
  },
  {
    key: 'fontStyle',
    label: 'Style',
    css: 'font-style',
    type: 'select',
    section: 'Typography',
    options: ['normal', 'italic'],
  },
  {
    key: 'textDecoration',
    label: 'Decoration',
    css: 'text-decoration',
    type: 'select',
    section: 'Typography',
    options: ['none', 'underline', 'line-through'],
  },
  {
    key: 'backgroundColor',
    label: 'Background color',
    css: 'background-color',
    type: 'color',
    section: 'Background',
  },
  {
    key: 'backgroundImage',
    label: 'Background image (URL)',
    css: 'background-image',
    type: 'text',
    section: 'Background',
  },
  {
    key: 'backgroundSize',
    label: 'Background size',
    css: 'background-size',
    type: 'select',
    section: 'Background',
    options: ['auto', 'cover', 'contain'],
  },
  {
    key: 'backgroundPosition',
    label: 'Background position',
    css: 'background-position',
    type: 'select',
    section: 'Background',
    options: ['center center', 'center top', 'center bottom', 'left center', 'right center'],
  },
  {
    key: 'borderStyle',
    label: 'Border style',
    css: 'border-style',
    type: 'select',
    section: 'Border',
    options: ['none', 'solid', 'dashed', 'dotted', 'double'],
  },
  {
    key: 'borderWidth',
    label: 'Border width',
    css: 'border-width',
    type: 'box',
    section: 'Border',
    units: ['px', 'em'],
  },
  {
    key: 'borderColor',
    label: 'Border color',
    css: 'border-color',
    type: 'color',
    section: 'Border',
  },
  {
    key: 'borderRadius',
    label: 'Border radius',
    css: 'border-radius',
    type: 'box',
    section: 'Border',
    units: ['px', '%', 'em'],
  },
  { key: 'opacity', label: 'Opacity', css: 'opacity', type: 'number', section: 'Effects' },
  { key: 'boxShadow', label: 'Box shadow', css: 'box-shadow', type: 'shadow', section: 'Effects' },
  {
    key: 'transition',
    label: 'Transition (ms)',
    css: 'transition',
    type: 'number',
    section: 'Effects',
  },
];

const UNIT = /^(px|%|em|rem|vw|vh|)$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
const VARIABLE = /^var\(--fr-v-[a-z0-9-]+\)$/;

/** The CSS value of a style property, or null when it is not safe. */
export function stylePropCss(prop: StyleProp, value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && VARIABLE.test(value)) return value;
  switch (prop.type) {
    case 'size': {
      if (!isSize(value)) return null;
      const size = value as SizeValue;
      if (!NUMBER.test(String(size.size)) || !UNIT.test(size.unit)) return null;
      return `${size.size}${size.unit}`;
    }
    case 'box':
      return isBox(value) ? boxCss(value as BoxValue) : null;
    case 'color':
      return safeColor(value);
    case 'font':
      return safeFont(value);
    case 'number': {
      const text = String(value);
      if (!NUMBER.test(text)) return null;
      if (prop.key === 'gridTemplateColumns')
        return `repeat(${Math.max(1, Math.min(12, Math.round(Number(text))))}, minmax(0, 1fr))`;
      if (prop.key === 'transition')
        return `all ${Math.max(0, Math.min(5000, Number(text)))}ms ease`;
      return text;
    }
    case 'select':
      return typeof value === 'string' && prop.options?.includes(value) ? value : null;
    case 'text': {
      // Background image addresses only.
      const url = String(value).trim();
      return /^(https?:\/\/|\/(?!\/))[^\s"'()\\<>]*$/.test(url) ? `url("${url}")` : null;
    }
    case 'shadow': {
      const s = value as { x?: number; y?: number; blur?: number; spread?: number; color?: string };
      if (typeof s !== 'object') return null;
      const n = (v: unknown) => (NUMBER.test(String(v ?? 0)) ? `${Number(v ?? 0)}px` : '0px');
      return `${n(s.x)} ${n(s.y)} ${n(s.blur)} ${n(s.spread)} ${safeColor(s.color) ?? 'rgba(0,0,0,0.2)'}`;
    }
  }
}

const BY_KEY = new Map(STYLE_PROPS.map((p) => [p.key, p]));

function declarations(props: Record<string, unknown>): string {
  return Object.entries(props)
    .map(([key, value]) => {
      const prop = BY_KEY.get(key);
      const css = prop ? stylePropCss(prop, value) : null;
      return prop && css ? `${prop.css}:${css}` : null;
    })
    .filter(Boolean)
    .join(';');
}

/**
 * CSS of style variants for a selector: desktop first, then the other active
 * devices (widescreen, then the smaller ones from the widest).
 */
export function variantsCss(
  selector: string,
  variants: StyleVariant[],
  breakpoints: Breakpoints,
): string {
  let css = '';
  for (const device of SHEET_ORDER) {
    const media = device === 'desktop' ? '' : deviceMedia(device, breakpoints);
    if (media === null) continue;
    let block = '';
    for (const variant of variants.filter((v) => v.device === device)) {
      const body = declarations(variant.props ?? {});
      if (!body) continue;
      const state = ['hover', 'focus', 'active'].includes(variant.state) ? `:${variant.state}` : '';
      block += `${selector}${state}{${body}}`;
    }
    if (!block) continue;
    css += media ? `@media ${media}{${block}}` : block;
  }
  return css.replace(/<\/?style/gi, '');
}

export const classSelector = (id: string) => `.fr-g-${id.replace(/[^a-z0-9-]/gi, '')}`;

/** Global classes and variables, for the kit's stylesheet. */
export function atomicKitCss(
  classes: GlobalClass[],
  variables: Variable[],
  breakpoints: Breakpoints,
): string {
  const vars = variables
    .map((v) => {
      const value =
        v.type === 'color'
          ? safeColor(v.value)
          : v.type === 'font'
            ? safeFont(v.value)
            : /^-?\d+(\.\d+)?(px|%|em|rem|vw|vh)$/.test(v.value)
              ? v.value
              : null;
      return value && /^[a-z0-9-]+$/.test(v.id) ? `--fr-v-${v.id}:${value}` : null;
    })
    .filter(Boolean);
  return (
    (vars.length ? `:root{${vars.join(';')}}` : '') +
    classes.map((c) => variantsCss(classSelector(c.id), c.variants, breakpoints)).join('')
  );
}

/** Keeps only well-formed variants (from storage or a document). */
export function normalizeVariants(value: unknown): StyleVariant[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is StyleVariant => Boolean(v) && typeof v === 'object')
    .map((v) => ({
      device: DEVICES.includes(v.device) ? v.device : 'desktop',
      state: (['', 'hover', 'focus', 'active'] as const).includes(v.state) ? v.state : '',
      props: v.props && typeof v.props === 'object' ? v.props : {},
    }));
}
