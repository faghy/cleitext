/**
 * Fresco's CSS: an element's settings become CSS rules scoped by its id
 * (`.fr-e-<id>`), through the design engine shared with Prisma, plus the
 * style variants of atomic elements and the extensions' CSS.
 */
import {
  printSheet,
  settingsSheet,
  withControlDefaults,
  type Breakpoints,
  type Settings,
} from '@cleitext/design';
import type { ElementDefinition, FrescoNode } from './model.js';
import { normalizeVariants, variantsCss } from './atomic.js';
import { controlsOf, extraCss } from './extensions.js';

export {
  boxCss,
  conditionMet,
  cssValue,
  groupKeys,
  isBox,
  isSize,
  printSheet,
  safeColor,
  safeFont,
} from '@cleitext/design';

export const elementClass = (id: string): string => `fr-e-${id.replace(/[^A-Za-z0-9_-]/g, '')}`;

/** The element's settings with the defaults of its controls. */
export function withDefaults(definition: ElementDefinition, attrs: Settings): Settings {
  return withControlDefaults(controlsOf(definition), attrs);
}

/** The CSS of one element (its own rules only), with its media queries. */
export function elementCss(
  definition: ElementDefinition,
  node: FrescoNode,
  breakpoints: Breakpoints,
): string {
  const settings = withDefaults(definition, node.attrs);
  const scope = `.${elementClass(node.id)}`;
  // Atomic elements: their own style variants.
  const atomic = definition.atomic
    ? variantsCss(scope, normalizeVariants(node.attrs._styles), breakpoints)
    : '';
  const sheet = settingsSheet(controlsOf(definition), settings, node.attrs, scope);
  return (
    atomic +
    printSheet(sheet, breakpoints) +
    extraCss(node, settings, scope).replace(/<\/?style/gi, '')
  );
}

/** CSS of every element of a tree, in document order. */
export function documentCss(
  nodes: FrescoNode[],
  lookup: (type: string) => ElementDefinition | undefined,
  breakpoints: Breakpoints,
): string {
  let css = '';
  const walk = (list: FrescoNode[]) => {
    for (const node of list) {
      const definition = lookup(node.type);
      if (definition) css += elementCss(definition, node, breakpoints);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return css;
}
