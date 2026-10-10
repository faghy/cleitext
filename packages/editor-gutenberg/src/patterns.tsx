import { createCoreRegistry, type CxdDocument } from '@cleitext/blocks';
import type { PatternRef } from '@cleitext/editor-core';
import { BlockPreview } from '@wordpress/block-editor';
import { createBlock, registerBlockType, serialize } from '@wordpress/blocks';
import { toGutenberg } from './convert';
import { buildBlocks, isRegistered } from './gutenberg-tree';

const registry = createCoreRegistry();

/** Synced patterns known to the editor, by id, for their previews. */
const synced = new Map<string, PatternRef>();

export function setPatterns(patterns: PatternRef[]): void {
  synced.clear();
  for (const pattern of patterns) if (pattern.synced) synced.set(pattern.id, pattern);
}

function blocksOf(document: CxdDocument) {
  return buildBlocks(toGutenberg(document, { registry, isKnown: isRegistered }), new Map());
}

/**
 * Patterns for Gutenberg's inserter (RF-EDT-07): a copy of the blocks, or a
 * single `cleitext/pattern` block pointing to a synced pattern.
 */
export function inserterPatterns(patterns: PatternRef[]) {
  return patterns.map((pattern) => ({
    name: `cleitext/${pattern.id}`,
    title: pattern.synced ? `${pattern.title} (synced)` : pattern.title,
    categories: ['cleitext'],
    content: serialize(
      pattern.synced
        ? [createBlock('cleitext/pattern', { ref: pattern.id })]
        : blocksOf(pattern.document),
    ),
  }));
}

export const PATTERN_CATEGORIES = [{ name: 'cleitext', label: 'Saved patterns' }];

let registered = false;

/** The block of synced patterns: a read-only preview of the pattern. */
export function registerPatternBlock(): void {
  if (registered) return;
  registered = true;
  registerBlockType('cleitext/pattern', {
    apiVersion: 3,
    title: 'Synced pattern',
    category: 'design',
    attributes: { ref: { type: 'string' } },
    supports: { html: false, inserter: false, reusable: false },
    edit: ({ attributes }: { attributes: { ref?: string } }) => {
      const pattern = attributes.ref ? synced.get(attributes.ref) : undefined;
      if (!pattern) {
        return (
          <div style={{ padding: 12, border: '1px dashed #999', color: '#555', fontSize: 13 }}>
            This synced pattern no longer exists.
          </div>
        );
      }
      return (
        <div style={{ outline: '1px dashed #7c3aed', outlineOffset: 4 }}>
          <div style={{ fontSize: 12, color: '#6d28d9', marginBottom: 4 }}>
            Synced pattern: {pattern.title} — edit it from the pattern itself.
          </div>
          <BlockPreview blocks={blocksOf(pattern.document)} viewportWidth={800} />
        </div>
      );
    },
    save: () => null,
  } as never);
}
