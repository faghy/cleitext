import type { z } from 'zod';
import type { CxdBlock, CxdDocument } from './cxd.js';

/**
 * Editor-independent block definition (docs/ARCHITECTURE.md §10.3). Editors
 * contribute their own editing components through adapters; nothing here
 * depends on Gutenberg.
 */
export interface BlockDefinition {
  type: string;
  /** Current version of the attribute schema. */
  version: number;
  title: string;
  category: 'text' | 'media' | 'design' | 'widgets' | 'embed';
  /** Validates `attrs`. Should be permissive (`.loose()`) for unknown keys. */
  attrs: z.ZodType<Record<string, unknown>>;
  /**
   * Name of the editor attribute holding the block's main rich text, stored
   * in CXD as `content` (e.g. `content` for paragraphs, `text` for buttons).
   */
  contentAttribute?: string;
  /** Other rich-text attributes, stored in `attrs` as CXD inline nodes. */
  richAttributes?: string[];
  /** Container blocks keep nested blocks in `children`. */
  container?: boolean;
  /** Attributes holding raw HTML, cleaned for authors without `unfiltered_html`. */
  htmlAttributes?: string[];
  /** Migrations from older attribute versions: `{ 1: (attrs) => attrsV2 }`. */
  migrate?: Record<number, (attrs: Record<string, unknown>) => Record<string, unknown>>;
}

export class BlockRegistry {
  private readonly definitions = new Map<string, BlockDefinition>();

  register(definition: BlockDefinition): this {
    if (this.definitions.has(definition.type)) {
      throw new Error(`Block type ${definition.type} is already registered`);
    }
    this.definitions.set(definition.type, definition);
    return this;
  }

  /** Removes a definition (e.g. when a plugin is reloaded). */
  unregister(type: string): void {
    this.definitions.delete(type);
  }

  get(type: string): BlockDefinition | undefined {
    return this.definitions.get(type);
  }

  has(type: string): boolean {
    return this.definitions.has(type);
  }

  list(): BlockDefinition[] {
    return [...this.definitions.values()];
  }
}

export interface BlockIssue {
  blockId: string;
  type: string;
  message: string;
}

/**
 * Validates known blocks against their definitions. Unknown blocks (e.g. from
 * a disabled plugin) are not errors: they are preserved as they are.
 */
export function validateBlocks(doc: CxdDocument, registry: BlockRegistry): BlockIssue[] {
  const issues: BlockIssue[] = [];
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      const definition = registry.get(block.type);
      if (definition) {
        if (block.v > definition.version) {
          issues.push({
            blockId: block.id,
            type: block.type,
            message: `Version ${block.v} is newer than the installed definition (${definition.version})`,
          });
        }
        const result = definition.attrs.safeParse(block.attrs);
        if (!result.success) {
          issues.push({
            blockId: block.id,
            type: block.type,
            message: result.error.issues
              .map((i) => `${i.path.join('.') || 'attrs'}: ${i.message}`)
              .join('; '),
          });
        }
        if (block.children && !definition.container) {
          issues.push({
            blockId: block.id,
            type: block.type,
            message: 'Block cannot contain blocks',
          });
        }
      }
      if (block.children) walk(block.children);
    }
  };
  walk(doc.blocks);
  return issues;
}

/** Applies attribute migrations to blocks stored with an older version. */
export function migrateDocument(doc: CxdDocument, registry: BlockRegistry): CxdDocument {
  const migrateBlock = (block: CxdBlock): CxdBlock => {
    const definition = registry.get(block.type);
    let { attrs, v } = block;
    if (definition) {
      while (v < definition.version) {
        const step = definition.migrate?.[v];
        if (!step) break;
        attrs = step(attrs);
        v++;
      }
    }
    const migrated: CxdBlock = { ...block, v, attrs };
    if (block.children) migrated.children = block.children.map(migrateBlock);
    return migrated;
  };
  return { ...doc, blocks: doc.blocks.map(migrateBlock) };
}
