import { z } from 'zod';

/**
 * Cleitext Document (CXD): the editor-independent format in which content is
 * stored (docs/ARCHITECTURE.md §10.1, docs/SPECIFICATIONS.md §9).
 */

export const CXD_SCHEMA_VERSION = 1;

export {
  INLINE_COLOR,
  MARKS,
  inlineText,
  type CxdInline,
  type CxdLink,
  type CxdText,
  type Mark,
} from './marks.js';
import { INLINE_COLOR, MARKS, inlineText, type CxdInline } from './marks.js';

export interface CxdBlock {
  /** Stable id, kept across saves (anchors, comments, diffs). */
  id: string;
  /** `namespace/name`, e.g. `core/paragraph`. */
  type: string;
  /** Version of the block's attribute schema, for migrations. */
  v: number;
  attrs: Record<string, unknown>;
  /** Main rich text of text blocks. */
  content?: CxdInline[];
  /** Nested blocks of container blocks. */
  children?: CxdBlock[];
}

export interface CxdDocument {
  schema: typeof CXD_SCHEMA_VERSION;
  blocks: CxdBlock[];
  /**
   * The editor that made the document, when it is not the block editor
   * (e.g. a page builder plugin), with its page-level settings. The admin
   * opens the document with that editor.
   */
  editor?: CxdEditorInfo;
}

export interface CxdEditorInfo {
  /** Editor id, e.g. `fresco`. */
  id: string;
  /** Settings of the whole page, kept by that editor. */
  data?: Record<string, unknown>;
}

/** Safety limits for stored documents. */
export const CXD_LIMITS = {
  // Page builders nest containers deeply.
  maxDepth: 32,
  maxBlocks: 5_000,
  maxTextLength: 200_000,
} as const;

const markSchema = z.enum(MARKS);

export const cxdTextSchema = z
  .object({
    text: z.string().max(CXD_LIMITS.maxTextLength),
    marks: z.array(markSchema).max(MARKS.length).optional(),
    color: z.string().max(80).regex(INLINE_COLOR).optional(),
  })
  .strict();

const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#|\?)/i;

export const cxdLinkSchema = z
  .object({
    type: z.literal('link'),
    href: z
      .string()
      .max(2_000)
      .refine((href) => SAFE_HREF.test(href.trim()), 'Unsupported link protocol'),
    target: z.literal('_blank').optional(),
    rel: z.string().max(200).optional(),
    color: z.string().max(80).regex(INLINE_COLOR).optional(),
    children: z.array(cxdTextSchema),
  })
  .strict();

export const cxdInlineSchema = z.union([cxdTextSchema, cxdLinkSchema]);

export const cxdBlockSchema: z.ZodType<CxdBlock> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1).max(64),
      type: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'Block type must be namespace/name'),
      v: z.number().int().min(1),
      attrs: z.record(z.string(), z.unknown()),
      content: z.array(cxdInlineSchema).optional(),
      children: z.array(cxdBlockSchema).optional(),
    })
    .strict(),
);

export const cxdDocumentSchema = z
  .object({
    schema: z.literal(CXD_SCHEMA_VERSION),
    blocks: z.array(cxdBlockSchema),
    editor: z
      .object({
        id: z.string().regex(/^[a-z0-9-]{1,64}$/, 'Editor id: lowercase letters, digits, dashes'),
        data: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    let count = 0;
    const walk = (blocks: CxdBlock[], depth: number) => {
      if (depth > CXD_LIMITS.maxDepth) {
        ctx.addIssue({
          code: 'custom',
          message: `Blocks nested deeper than ${CXD_LIMITS.maxDepth}`,
        });
        return;
      }
      for (const block of blocks) {
        count++;
        if (block.children) walk(block.children, depth + 1);
      }
    };
    walk(doc.blocks, 1);
    if (count > CXD_LIMITS.maxBlocks) {
      ctx.addIssue({ code: 'custom', message: `More than ${CXD_LIMITS.maxBlocks} blocks` });
    }
  });

export function emptyDocument(): CxdDocument {
  return { schema: CXD_SCHEMA_VERSION, blocks: [] };
}

export { newBlockId } from './block-id.js';

/** Plain text of a document, for search indexing and excerpts. */
/** The text of a table's cells, row by row (core/table keeps it in its attributes). */
export function tableText(block: CxdBlock): string[] {
  if (block.type !== 'core/table') return [];
  const rows = ['head', 'body', 'foot'].flatMap(
    (section) =>
      (block.attrs[section] as { cells?: { content?: CxdInline[] }[] }[] | undefined) ?? [],
  );
  return rows.map((row) =>
    (row.cells ?? [])
      .map((cell) => inlineText(Array.isArray(cell.content) ? cell.content : []))
      .join(' '),
  );
}

export function documentText(doc: CxdDocument): string {
  const parts: string[] = [];
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      if (block.content) parts.push(inlineText(block.content));
      parts.push(...tableText(block));
      if (block.children) walk(block.children);
    }
  };
  walk(doc.blocks);
  return parts.filter(Boolean).join('\n');
}
