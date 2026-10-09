/**
 * Conversion between Gutenberg block trees and CXD (docs/ARCHITECTURE.md
 * §10.1-10.3). Pure functions: no @wordpress imports, so they can be tested
 * in isolation and reused by importers.
 */
import {
  CXD_SCHEMA_VERSION,
  htmlToInline,
  inlineToHtml,
  newBlockId,
  type BlockRegistry,
  type CxdBlock,
  type CxdDocument,
  type CxdInline,
} from '@cleitext/blocks';

/** The shape of a Gutenberg block that the conversion needs. */
export interface GutenbergNode {
  name: string;
  attributes: Record<string, unknown>;
  innerBlocks: GutenbergNode[];
  clientId?: string;
}

/** A Gutenberg node to create, carrying the CXD id it comes from. */
export interface GutenbergSeed {
  name: string;
  attributes: Record<string, unknown>;
  innerBlocks: GutenbergSeed[];
  cxdId: string;
}

/** Placeholder for blocks the editor does not know (e.g. a disabled plugin). */
export const UNAVAILABLE_BLOCK = 'cleitext/unavailable';

export interface ConvertOptions {
  registry: BlockRegistry;
  /** Default attribute values of a Gutenberg block type, stripped from CXD. */
  defaultsOf?: (name: string) => Record<string, unknown>;
  /** CXD id previously assigned to a Gutenberg client id. */
  idOf?: (clientId: string) => string | undefined;
}

/** Gutenberg blocks → CXD document. */
export function fromGutenberg(nodes: GutenbergNode[], options: ConvertOptions): CxdDocument {
  return { schema: CXD_SCHEMA_VERSION, blocks: nodes.map((node) => toCxdBlock(node, options)) };
}

function toCxdBlock(node: GutenbergNode, options: ConvertOptions): CxdBlock {
  if (node.name === UNAVAILABLE_BLOCK) {
    return structuredClone(node.attributes.cxd as CxdBlock);
  }

  const definition = options.registry.get(node.name);
  const defaults = options.defaultsOf?.(node.name) ?? {};
  const contentKey = definition?.contentAttribute;
  const richKeys = new Set(definition?.richAttributes ?? []);

  const attrs: Record<string, unknown> = {};
  let content: CxdInline[] | undefined;

  for (const [key, raw] of Object.entries(node.attributes)) {
    if (raw === undefined) continue;
    if (key === contentKey) {
      content = htmlToInline(richTextToHtml(raw));
      continue;
    }
    if (richKeys.has(key)) {
      const inline = htmlToInline(richTextToHtml(raw));
      if (inline.length > 0) attrs[key] = inline;
      continue;
    }
    if (key in defaults && deepEqual(raw, defaults[key])) continue;
    attrs[key] = toJson(raw);
  }

  const block: CxdBlock = {
    id: (node.clientId && options.idOf?.(node.clientId)) || newBlockId(),
    type: node.name,
    v: definition?.version ?? 1,
    attrs,
  };
  if (contentKey !== undefined) block.content = content ?? [];
  if (definition?.container || node.innerBlocks.length > 0) {
    block.children = node.innerBlocks.map((child) => toCxdBlock(child, options));
  }
  return block;
}

/** CXD document → Gutenberg blocks to create. */
export function toGutenberg(
  doc: CxdDocument,
  options: Pick<ConvertOptions, 'registry'> & { isKnown?: (name: string) => boolean },
): GutenbergSeed[] {
  const convert = (block: CxdBlock): GutenbergSeed => {
    const known = options.isKnown ? options.isKnown(block.type) : options.registry.has(block.type);
    if (!known) {
      return {
        name: UNAVAILABLE_BLOCK,
        attributes: { cxd: structuredClone(block) },
        innerBlocks: [],
        cxdId: block.id,
      };
    }
    const definition = options.registry.get(block.type);
    const richKeys = new Set(definition?.richAttributes ?? []);
    const attributes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(block.attrs)) {
      attributes[key] = richKeys.has(key)
        ? inlineToHtml(value as CxdInline[])
        : structuredClone(value);
    }
    if (definition?.contentAttribute) {
      attributes[definition.contentAttribute] = inlineToHtml(block.content ?? []);
    }
    return {
      name: block.type,
      attributes,
      innerBlocks: (block.children ?? []).map(convert),
      cxdId: block.id,
    };
  };
  return doc.blocks.map(convert);
}

/** Gutenberg rich-text values are strings or RichTextData objects. */
function richTextToHtml(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const v = value as { toHTMLString?: () => string };
    if (typeof v.toHTMLString === 'function') return v.toHTMLString();
  }
  return value == null ? '' : String(value);
}

function toJson(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
