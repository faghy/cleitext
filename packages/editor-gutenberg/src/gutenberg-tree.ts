import { createBlock, getBlockType, type Block } from '@wordpress/blocks';
import type { GutenbergSeed } from './convert';

/** Default attribute values of a registered Gutenberg block type. */
export function defaultsOf(name: string): Record<string, unknown> {
  const attributes = (getBlockType(name)?.attributes ?? {}) as Record<
    string,
    { default?: unknown }
  >;
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([, definition]) => definition && 'default' in definition)
      .map(([key, definition]) => [key, definition.default]),
  );
}

/** Creates Gutenberg blocks from seeds, recording clientId → CXD id. */
export function buildBlocks(seeds: GutenbergSeed[], ids: Map<string, string>): Block[] {
  return seeds.map((seed) => {
    const block = createBlock(seed.name, seed.attributes, buildBlocks(seed.innerBlocks, ids));
    ids.set(block.clientId, seed.cxdId);
    return block;
  });
}

export function isRegistered(name: string): boolean {
  return Boolean(getBlockType(name));
}
