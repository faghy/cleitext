/**
 * Which controls of a section the panel shows: Normal and Hover views (as
 * Elementor's tabs), and the item fields of the parent's layout (flex or grid).
 */
import { withDefaults } from '../core/css.js';
import type { Control, FrescoNode } from '../core/model.js';
import { getElement } from '../core/registry.js';

/**
 * Settings that apply on hover only, kept apart from the normal ones
 * (`_border_hover`, `_shadow_hover`, `_background_hover_transition`, and
 * the container's own without `_`): shown in the Hover view only.
 */
export function isHoverOnly(control: Pick<Control, 'name'>): boolean {
  return /^_?(background|border|shadow)_hover(_|$)/.test(control.name);
}

/** Item fields of a flex parent (align self, order, size). */
function isFlexItemField(name: string): boolean {
  return name === '_align_self' || name.startsWith('_flex_');
}

/** Item fields of a grid parent (spans and lines). */
function isGridItemField(name: string): boolean {
  return name.startsWith('_grid_');
}

/** The layout of an element's parent: a container's flex or grid, or null (the page, tabs…). */
export function parentLayout(parent: FrescoNode | null | undefined): 'flex' | 'grid' | null {
  if (!parent || parent.type !== 'fresco/container') return null;
  const definition = getElement(parent.type);
  const settings = definition ? withDefaults(definition, parent.attrs) : parent.attrs;
  return settings.container_type === 'grid' ? 'grid' : 'flex';
}

/** Whether a control shows, in the Normal or Hover view, under a parent of that layout. */
export function controlShown(
  control: Control,
  view: { hover: boolean; layout: 'flex' | 'grid' | null },
): boolean {
  if (isFlexItemField(control.name) && view.layout !== 'flex') return false;
  if (isGridItemField(control.name) && view.layout !== 'grid') return false;
  return view.hover ? control.hover === true || isHoverOnly(control) : !isHoverOnly(control);
}

/** Whether a section has a Hover view. */
export function hasHoverView(controls: Control[]): boolean {
  return controls.some((c) => c.hover === true || isHoverOnly(c));
}
