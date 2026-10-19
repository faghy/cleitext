/**
 * The ready-made structures of the "add" area: a row of flexbox columns, or
 * a grid, built from containers.
 */
import type { FrescoNode } from '../core/model.js';
import { create } from './store.js';

export interface FlexPreset {
  kind: 'flex';
  /** Widths of the columns, in percent. */
  columns: number[];
}

export interface GridPreset {
  kind: 'grid';
  columns: number;
  rows: number;
}

export type Preset = FlexPreset | GridPreset;

export const FLEX_PRESETS: FlexPreset[] = [
  { kind: 'flex', columns: [100] },
  { kind: 'flex', columns: [50, 50] },
  { kind: 'flex', columns: [33.33, 33.33, 33.33] },
  { kind: 'flex', columns: [25, 25, 25, 25] },
  { kind: 'flex', columns: [66.66, 33.33] },
  { kind: 'flex', columns: [33.33, 66.66] },
  { kind: 'flex', columns: [25, 75] },
  { kind: 'flex', columns: [75, 25] },
  { kind: 'flex', columns: [25, 50, 25] },
];

export const GRID_PRESETS: GridPreset[] = [
  { kind: 'grid', columns: 2, rows: 1 },
  { kind: 'grid', columns: 3, rows: 1 },
  { kind: 'grid', columns: 4, rows: 1 },
  { kind: 'grid', columns: 2, rows: 2 },
  { kind: 'grid', columns: 3, rows: 2 },
  { kind: 'grid', columns: 4, rows: 2 },
];

/** The containers of a structure: one, or a row holding one per column. */
export function buildStructure(preset: Preset): FrescoNode | null {
  const outer = create('fresco/container');
  if (!outer) return null;
  if (preset.kind === 'grid') {
    outer.attrs = { ...outer.attrs, container_type: 'grid', grid_columns: preset.columns };
    if (preset.rows > 1) outer.attrs.grid_rows = preset.rows;
    return outer;
  }
  if (preset.columns.length === 1) return outer;
  outer.attrs = { ...outer.attrs, flex_direction: 'row', 'flex_direction@mobile': 'column' };
  outer.children = preset.columns.map((width) => {
    const column = create('fresco/container')!;
    column.attrs = {
      ...column.attrs,
      width: { size: width, unit: '%' },
      'width@mobile': { size: 100, unit: '%' },
    };
    return column;
  });
  return outer;
}
