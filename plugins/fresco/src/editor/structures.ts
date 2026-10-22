/**
 * The ready-made structures of the "add" area, as in Elementor: a column or
 * a row, rows of columns (on more lines when they add up to more than 100%),
 * a column beside two stacked ones, or a grid. New columns get 10px of
 * padding (Elementor's default), saved on them: containers made before keep
 * theirs.
 */
import type { BoxValue, FrescoNode } from '../core/model.js';
import { create } from './store.js';

export interface FlexPreset {
  kind: 'flex';
  /** Elementor's name of the structure, e.g. `33-66`, `c100`, `c100-c50-50`. */
  id: string;
  /** Widths of the columns, in percent (none: one container, a column or a row). */
  columns: number[];
  /** The direction of a single container (`c100` and `r100`). */
  direction?: 'row' | 'column';
}

export interface GridPreset {
  kind: 'grid';
  columns: number;
  rows: number;
}

export type Preset = FlexPreset | GridPreset;

const flex = (id: string): FlexPreset => ({
  kind: 'flex',
  id,
  columns: id.split('-').map(Number).filter(Number.isFinite),
});

/** Elementor's twelve structures, then the rows Fresco had (thirds, two thirds, quarters). */
export const FLEX_PRESETS: FlexPreset[] = [
  { kind: 'flex', id: 'c100', columns: [], direction: 'column' },
  { kind: 'flex', id: 'r100', columns: [], direction: 'row' },
  flex('50-50'),
  flex('33-66'),
  flex('25-25-25-25'),
  flex('25-50-25'),
  flex('50-50-50-50'),
  flex('50-50-100'),
  { kind: 'flex', id: 'c100-c50-50', columns: [50, 50] },
  flex('33-33-33-33-33-33'),
  flex('33-33-33-33-66'),
  flex('66-33-33-66'),
  flex('33-33-33'),
  flex('66-33'),
  flex('25-75'),
];

export const GRID_PRESETS: GridPreset[] = [
  { kind: 'grid', columns: 2, rows: 1 },
  { kind: 'grid', columns: 3, rows: 1 },
  { kind: 'grid', columns: 4, rows: 1 },
  { kind: 'grid', columns: 2, rows: 2 },
  { kind: 'grid', columns: 3, rows: 2 },
  { kind: 'grid', columns: 4, rows: 2 },
];

/** The width of a column in percent: 33 and 66 are thirds. */
export function columnWidth(size: number): number {
  return size === 33 ? 33.33 : size === 66 ? 66.66 : size;
}

/** Elementor's default padding of a container, saved on new columns. */
export const COLUMN_PADDING: BoxValue = {
  top: 10,
  right: 10,
  bottom: 10,
  left: 10,
  unit: 'px',
  linked: true,
};

const NO_GAP = { size: 0, unit: 'px' };

/** A new column of a row: its width (100% on phones) and the default padding. */
function column(width: number): FrescoNode {
  const node = create('fresco/container')!;
  node.attrs = {
    ...node.attrs,
    width: { size: columnWidth(width), unit: '%' },
    'width@mobile': { size: 100, unit: '%' },
    _padding: { ...COLUMN_PADDING },
  };
  return node;
}

/** The containers of a structure: one, or a row holding one per column. */
export function buildStructure(preset: Preset): FrescoNode | null {
  const outer = create('fresco/container');
  if (!outer) return null;
  if (preset.kind === 'grid') {
    outer.attrs = { ...outer.attrs, container_type: 'grid', grid_columns: preset.columns };
    if (preset.rows > 1) outer.attrs.grid_rows = preset.rows;
    return outer;
  }
  if (preset.id === 'c100-c50-50') {
    // A column beside two stacked ones, without gaps (as Elementor makes it).
    const right = column(50);
    right.attrs = {
      ...right.attrs,
      _padding: { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true },
      gap: NO_GAP,
    };
    right.children = [create('fresco/container')!, create('fresco/container')!].map((child) => ({
      ...child,
      attrs: { ...child.attrs, _padding: { ...COLUMN_PADDING } },
    }));
    outer.attrs = {
      ...outer.attrs,
      flex_direction: 'row',
      'flex_direction@mobile': 'column',
      gap: NO_GAP,
    };
    outer.children = [column(50), right];
    return outer;
  }
  if (preset.columns.length === 0 || (preset.columns.length === 1 && preset.columns[0] === 100)) {
    if (preset.direction === 'row') {
      outer.attrs = { ...outer.attrs, flex_direction: 'row', 'flex_direction@mobile': 'column' };
    }
    return outer;
  }
  // More than 100% in all: the columns go on several lines, side by side without a gap.
  const wraps = preset.columns.reduce((sum, n) => sum + n, 0) > 100;
  outer.attrs = {
    ...outer.attrs,
    flex_direction: 'row',
    'flex_direction@mobile': 'column',
    ...(wraps ? { flex_wrap: 'wrap', column_gap: NO_GAP } : {}),
  };
  outer.children = preset.columns.map(column);
  return outer;
}
