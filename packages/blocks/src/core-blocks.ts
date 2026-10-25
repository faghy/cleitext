import { z } from 'zod';
import { cxdInlineSchema } from './cxd.js';
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

/** WordPress's block supports (spacing, colors, text size); cleaned when shown (block-style.ts). */
const style = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 2000, 'Style too large')
  .optional();

const common = { anchor, className, style };

/** A table cell: rich text (inline nodes), header or data, alignment and spans. */
const tableCell = z
  .object({
    content: z.array(cxdInlineSchema).max(2_000).default([]),
    tag: z.enum(['td', 'th']).default('td'),
    scope: z.enum(['row', 'col', 'rowgroup', 'colgroup']).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    colspan: z.number().int().min(1).max(100).optional(),
    rowspan: z.number().int().min(1).max(1_000).optional(),
  })
  .loose();
const tableRows = z.array(z.object({ cells: z.array(tableCell).max(100) }).loose()).max(5_000);

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
    /** A table: head, body and foot rows of cells with rich text (Gutenberg's core/table). */
    type: 'core/table',
    version: 1,
    title: 'Table',
    category: 'text',
    richAttributes: ['caption'],
    attrs: z
      .object({
        ...common,
        head: tableRows.optional(),
        body: tableRows.optional(),
        foot: tableRows.optional(),
        hasFixedLayout: z.boolean().optional(),
        align,
      })
      .loose(),
  },
  {
    /** Pictures in a grid: its children are core/image blocks (Gutenberg's core/gallery). */
    type: 'core/gallery',
    version: 1,
    title: 'Gallery',
    category: 'media',
    container: true,
    richAttributes: ['caption'],
    attrs: z
      .object({
        ...common,
        columns: z.number().int().min(1).max(8).optional(),
        imageCrop: z.boolean().optional(),
        linkTo: z.enum(['none', 'media', 'attachment']).optional(),
        sizeSlug: z.string().optional(),
        align,
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
    type: 'core/embed',
    version: 1,
    title: 'Embed',
    category: 'embed',
    richAttributes: ['caption'],
    attrs: z
      .object({
        ...common,
        url: z.string().max(2_000).optional(),
        providerNameSlug: z.string().max(64).optional(),
        type: z.string().max(32).optional(),
        responsive: z.boolean().optional(),
        align,
      })
      .loose(),
  },
  {
    /**
     * Raw HTML. Sanitized on save unless the author has `unfiltered_html`
     * (docs/ARCHITECTURE.md §18).
     */
    type: 'core/html',
    version: 1,
    title: 'Custom HTML',
    category: 'widgets',
    attrs: z.object({ content: z.string().max(200_000).optional() }).loose(),
  },
  {
    /** A synced pattern (RF-EDT-07): rendered from the pattern wherever it is used. */
    type: 'cleitext/pattern',
    version: 1,
    title: 'Synced pattern',
    category: 'design',
    attrs: z.object({ ref: z.uuid() }).loose(),
  },
  {
    /**
     * A field shown with its formatter (plugin API 1.48): an entry's,
     * term's, person's or option's, or the site's; inside Field rows, the
     * row's. `source` is a dynamic source id (e.g. `entry.field:price`).
     */
    type: 'cleitext/field',
    version: 1,
    title: 'Field',
    category: 'text',
    attrs: z
      .object({
        ...common,
        source: z.string().max(300).optional(),
        /** Shown before the value, e.g. "Price:". */
        label: z.string().max(200).optional(),
        tagName: z.enum(['p', 'div', 'span', 'h2', 'h3', 'h4', 'h5', 'h6']).optional(),
        /** Shown when the field has no value. */
        fallback: z.string().max(500).optional(),
        textAlign: z.string().optional(),
      })
      .loose(),
  },
  {
    /**
     * Its blocks repeated for each row of a list field, or each related
     * entry, term or member (plugin API 1.48): bindings inside read the row.
     */
    type: 'cleitext/field-rows',
    version: 1,
    title: 'Field rows',
    category: 'design',
    container: true,
    attrs: z
      .object({
        ...common,
        source: z.string().max(300).optional(),
        /** At most this many rows. */
        limit: z.number().int().min(1).max(200).optional(),
        /** Shown when there are no rows. */
        emptyText: z.string().max(500).optional(),
        layout: z.enum(['stack', 'grid']).optional(),
        columns: z.number().int().min(1).max(6).optional(),
      })
      .loose(),
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
