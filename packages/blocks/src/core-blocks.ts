import { z } from 'zod';
import { BlockRegistry, type BlockDefinition } from './registry.js';

/**
 * Core blocks of the MVP (docs/ARCHITECTURE.md §10.5). Names match Gutenberg
 * (`core/…`) so that the adapter is almost a one-to-one mapping, but their
 * meaning is defined here. Schemas validate the attributes Cleitext relies on
 * and keep any other attribute (`.loose()`), e.g. styles set in the editor.
 */

const align = z.enum(['left', 'center', 'right', 'wide', 'full']).optional();
const anchor = z.string().max(100).optional();
const className = z.string().max(500).optional();

const common = { anchor, className };

export const CORE_BLOCKS: BlockDefinition[] = [
  {
    type: 'core/paragraph',
    version: 1,
    title: 'Paragraph',
    category: 'text',
    contentAttribute: 'content',
    attrs: z
      .object({ ...common, align: z.string().optional(), dropCap: z.boolean().optional() })
      .loose(),
  },
  {
    type: 'core/heading',
    version: 1,
    title: 'Heading',
    category: 'text',
    contentAttribute: 'content',
    attrs: z
      .object({
        ...common,
        level: z.number().int().min(1).max(6).optional(),
        textAlign: z.string().optional(),
      })
      .loose(),
  },
  {
    type: 'core/list',
    version: 1,
    title: 'List',
    category: 'text',
    container: true,
    attrs: z
      .object({ ...common, ordered: z.boolean().optional(), start: z.number().int().optional() })
      .loose(),
  },
  {
    type: 'core/list-item',
    version: 1,
    title: 'List item',
    category: 'text',
    contentAttribute: 'content',
    container: true,
    attrs: z.object({ ...common }).loose(),
  },
  {
    type: 'core/quote',
    version: 1,
    title: 'Quote',
    category: 'text',
    container: true,
    richAttributes: ['citation'],
    attrs: z.object({ ...common }).loose(),
  },
  {
    type: 'core/code',
    version: 1,
    title: 'Code',
    category: 'text',
    contentAttribute: 'content',
    attrs: z.object({ ...common }).loose(),
  },
  {
    type: 'core/image',
    version: 1,
    title: 'Image',
    category: 'media',
    richAttributes: ['caption'],
    attrs: z
      .object({
        ...common,
        /** Cleitext media id (or the editor's numeric id before upload). */
        id: z.union([z.string(), z.number()]).optional(),
        url: z.string().max(2_000).optional(),
        alt: z.string().max(1_000).optional(),
        align,
        width: z.union([z.string(), z.number()]).optional(),
        height: z.union([z.string(), z.number()]).optional(),
        sizeSlug: z.string().optional(),
        href: z.string().max(2_000).optional(),
      })
      .loose(),
  },
  {
    type: 'core/buttons',
    version: 1,
    title: 'Buttons',
    category: 'design',
    container: true,
    attrs: z.object({ ...common }).loose(),
  },
  {
    type: 'core/button',
    version: 1,
    title: 'Button',
    category: 'design',
    contentAttribute: 'text',
    attrs: z
      .object({
        ...common,
        url: z.string().max(2_000).optional(),
        linkTarget: z.string().optional(),
        rel: z.string().optional(),
      })
      .loose(),
  },
  {
    type: 'core/columns',
    version: 1,
    title: 'Columns',
    category: 'design',
    container: true,
    attrs: z.object({ ...common, isStackedOnMobile: z.boolean().optional() }).loose(),
  },
  {
    type: 'core/column',
    version: 1,
    title: 'Column',
    category: 'design',
    container: true,
    attrs: z.object({ ...common, width: z.string().optional() }).loose(),
  },
  {
    type: 'core/group',
    version: 1,
    title: 'Group',
    category: 'design',
    container: true,
    attrs: z.object({ ...common, tagName: z.string().optional() }).loose(),
  },
  {
    type: 'core/separator',
    version: 1,
    title: 'Separator',
    category: 'design',
    attrs: z.object({ ...common }).loose(),
  },
  {
    type: 'core/spacer',
    version: 1,
    title: 'Spacer',
    category: 'design',
    attrs: z.object({ ...common, height: z.union([z.string(), z.number()]).optional() }).loose(),
  },
];

/** Registry with the core blocks; plugins add theirs to a copy. */
export function createCoreRegistry(): BlockRegistry {
  const registry = new BlockRegistry();
  for (const definition of CORE_BLOCKS) registry.register(definition);
  return registry;
}
