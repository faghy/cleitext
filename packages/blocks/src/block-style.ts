import { INLINE_COLOR } from './cxd.js';

/**
 * The `style` attribute of core blocks, as WordPress saves it (block
 * supports): spacing, custom colors and text size. Only a safe subset is
 * kept; it is shown as the block's inline style, like WordPress does, and
 * the block editor edits it with its own controls.
 */
export interface BlockStyle {
  spacing?: {
    margin?: Sides;
    padding?: Sides;
    blockGap?: string | { top?: string; left?: string };
  };
  color?: { text?: string; background?: string };
  typography?: { fontSize?: string; lineHeight?: string };
}

type Sides = Partial<Record<'top' | 'right' | 'bottom' | 'left', string>>;

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

/** A length: `0`, `12px`, `1.5rem`, `-2em`, `10%`, `auto`, or a WordPress preset. */
const LENGTH =
  /^(0|auto|-?\d{1,5}(\.\d{1,4})?(px|em|rem|%|vh|vw|vmin|vmax|ch)|var:preset\|[a-z0-9-]{1,40}\|[a-z0-9-]{1,40}|var\(--[a-z0-9-]{1,80}\))$/i;
const LINE_HEIGHT = /^\d{1,2}(\.\d{1,3})?$/;

/** `var:preset|spacing|20` → `var(--wp--preset--spacing--20)`. */
function cssValue(value: string): string {
  const preset = /^var:preset\|([a-z0-9-]+)\|([a-z0-9-]+)$/i.exec(value);
  return preset ? `var(--wp--preset--${preset[1]}--${preset[2]})` : value;
}

function length(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value === 0 ? '0' : `${value}px`;
  return typeof value === 'string' && LENGTH.test(value.trim()) ? value.trim() : undefined;
}

function sides(value: unknown): Sides | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Sides = {};
  for (const side of SIDES) {
    const v = length((value as Record<string, unknown>)[side]);
    if (v !== undefined) out[side] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function color(value: unknown): string | undefined {
  return typeof value === 'string' && INLINE_COLOR.test(value.trim()) ? value.trim() : undefined;
}

/** The safe part of a block's `style` attribute, or undefined when nothing is left. */
export function cleanBlockStyle(value: unknown): BlockStyle | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, Record<string, unknown> | undefined>;
  const style: BlockStyle = {};
  const margin = sides(v.spacing?.margin);
  const padding = sides(v.spacing?.padding);
  const gapValue = v.spacing?.blockGap;
  const blockGap =
    gapValue && typeof gapValue === 'object'
      ? (() => {
          const top = length((gapValue as Record<string, unknown>).top);
          const left = length((gapValue as Record<string, unknown>).left);
          return top || left ? { ...(top && { top }), ...(left && { left }) } : undefined;
        })()
      : length(gapValue);
  if (margin || padding || blockGap) {
    style.spacing = {
      ...(margin && { margin }),
      ...(padding && { padding }),
      ...(blockGap && { blockGap }),
    };
  }
  const text = color(v.color?.text);
  const background = color(v.color?.background);
  if (text || background)
    style.color = { ...(text && { text }), ...(background && { background }) };
  const fontSize = length(v.typography?.fontSize);
  const lineHeight =
    typeof v.typography?.lineHeight === 'string' || typeof v.typography?.lineHeight === 'number'
      ? String(v.typography.lineHeight)
      : undefined;
  const typography = {
    ...(fontSize && { fontSize }),
    ...(lineHeight && LINE_HEIGHT.test(lineHeight) && { lineHeight }),
  };
  if (Object.keys(typography).length) style.typography = typography;
  return Object.keys(style).length ? style : undefined;
}

/**
 * CSS declarations (camelCase, for React) of a block's `style` attribute.
 * `flex`: the block lays its children out in a row (columns, buttons), so
 * its block gap is the CSS gap between them.
 */
export function blockStyleCss(
  value: unknown,
  options: { flex?: boolean } = {},
): Record<string, string> | undefined {
  const style = cleanBlockStyle(value);
  if (!style) return undefined;
  const css: Record<string, string> = {};
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  for (const kind of ['margin', 'padding'] as const) {
    for (const side of SIDES) {
      const v = style.spacing?.[kind]?.[side];
      if (v !== undefined) css[`${kind}${cap(side)}`] = cssValue(v);
    }
  }
  const gap = style.spacing?.blockGap;
  if (options.flex && gap) {
    if (typeof gap === 'string') css.gap = cssValue(gap);
    else {
      if (gap.top) css.rowGap = cssValue(gap.top);
      if (gap.left) css.columnGap = cssValue(gap.left);
    }
  } else if (gap) {
    // Blocks stacked one under the other: the space between them (see `hasFlowGap`).
    const top = typeof gap === 'string' ? gap : gap.top;
    if (top) css['--cx-block-gap'] = cssValue(top);
  }
  if (style.color?.text) css.color = style.color.text;
  if (style.color?.background) css.backgroundColor = style.color.background;
  if (style.typography?.fontSize) css.fontSize = cssValue(style.typography.fontSize);
  if (style.typography?.lineHeight) css.lineHeight = style.typography.lineHeight;
  return Object.keys(css).length ? css : undefined;
}

/**
 * Whether a block that stacks its children has a block gap: it then gets the
 * `cx-flow-gap` class, whose rule puts the gap between its children.
 */
export function hasFlowGap(value: unknown): boolean {
  const gap = cleanBlockStyle(value)?.spacing?.blockGap;
  return typeof gap === 'string' || Boolean(gap?.top);
}

/**
 * The `layout` of a group as WordPress saves it: a row or a column (flex)
 * or a grid. The default "flow" and "constrained" layouts need nothing.
 */
export interface BlockLayout {
  type: 'flex' | 'grid';
  orientation?: 'horizontal' | 'vertical';
  flexWrap?: 'wrap' | 'nowrap';
  justifyContent?: 'left' | 'center' | 'right' | 'space-between' | 'stretch';
  verticalAlignment?: 'top' | 'center' | 'bottom' | 'stretch' | 'space-between';
  columnCount?: number;
  minimumColumnWidth?: string;
}

const pickOne = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  allowed.includes(value as T) ? (value as T) : undefined;

/** The safe part of a block's `layout` attribute, or undefined for the default layouts. */
export function cleanLayout(value: unknown): BlockLayout | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const type = pickOne(v.type, ['flex', 'grid'] as const);
  if (!type) return undefined;
  const layout: BlockLayout = { type };
  const orientation = pickOne(v.orientation, ['horizontal', 'vertical'] as const);
  const flexWrap = pickOne(v.flexWrap, ['wrap', 'nowrap'] as const);
  const justifyContent = pickOne(v.justifyContent, [
    'left',
    'center',
    'right',
    'space-between',
    'stretch',
  ] as const);
  const verticalAlignment = pickOne(v.verticalAlignment, [
    'top',
    'center',
    'bottom',
    'stretch',
    'space-between',
  ] as const);
  if (orientation) layout.orientation = orientation;
  if (flexWrap) layout.flexWrap = flexWrap;
  if (justifyContent) layout.justifyContent = justifyContent;
  if (verticalAlignment) layout.verticalAlignment = verticalAlignment;
  if (typeof v.columnCount === 'number' && v.columnCount >= 1 && v.columnCount <= 16)
    layout.columnCount = Math.floor(v.columnCount);
  const min = length(v.minimumColumnWidth);
  if (min) layout.minimumColumnWidth = min;
  return layout;
}

const FLEX_POSITION = {
  left: 'flex-start',
  top: 'flex-start',
  center: 'center',
  right: 'flex-end',
  bottom: 'flex-end',
  'space-between': 'space-between',
  stretch: 'stretch',
} as const;

/**
 * WordPress's classes and the CSS of a flex or grid layout, as its layout
 * support prints them: rows centered vertically and wrapping by default,
 * grids of a number of columns or of columns at least 12rem wide. The gap is
 * the block's own (`blockStyleCss` with `flex`), else the theme's (`CORE_BLOCK_CSS`).
 */
export function layoutCss(
  value: unknown,
): { className: string; css: Record<string, string> } | undefined {
  const layout = cleanLayout(value);
  if (!layout) return undefined;
  if (layout.type === 'grid') {
    const columns = layout.columnCount
      ? `repeat(${layout.columnCount}, minmax(0, 1fr))`
      : `repeat(auto-fill, minmax(min(${cssValue(layout.minimumColumnWidth ?? '12rem')}, 100%), 1fr))`;
    return {
      className: 'is-layout-grid',
      css: { display: 'grid', gridTemplateColumns: columns },
    };
  }
  const vertical = layout.orientation === 'vertical';
  const justify = layout.justifyContent ?? 'left';
  const align = layout.verticalAlignment ?? (vertical ? 'top' : 'center');
  const classes = [
    'is-layout-flex',
    vertical && 'is-vertical',
    layout.flexWrap === 'nowrap' && 'is-nowrap',
    `is-content-justification-${justify}`,
  ].filter(Boolean);
  return {
    className: classes.join(' '),
    css: {
      display: 'flex',
      flexDirection: vertical ? 'column' : 'row',
      flexWrap: layout.flexWrap ?? 'wrap',
      // A row places its items along the line, a column across it.
      [vertical ? 'alignItems' : 'justifyContent']: FLEX_POSITION[justify],
      [vertical ? 'justifyContent' : 'alignItems']: FLEX_POSITION[align],
    },
  };
}
