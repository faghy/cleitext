/**
 * The plugin blocks a page renders, one per instance. A page is drawn from
 * several documents (the entry, the theme's areas and locations, synced
 * patterns), and two of them may hold a block with the same id: an element
 * copied from a header template into the page, or imported twice. Plugin
 * blocks are loaded and styled by id, so the two shared one load (the wrong
 * settings for one of them) and one CSS scope (the other one's styles lost).
 *
 * Here the later of two different blocks with one id gets another id, made
 * from the first, for this render only (nothing is saved). Pages without
 * such twins render exactly as before: the same object met twice (a synced
 * pattern used twice) and copies with the same content stay one instance.
 */
import type { CxdBlock, CxdDocument } from '@cleitext/blocks';

export interface BlockInstances {
  /** The blocks to load, style and render, each once (some with a new id). */
  instances: CxdBlock[];
  /** The instance a block of the documents renders as (itself when not met). */
  resolve(block: CxdBlock): CxdBlock;
}

export function pluginBlockInstances(
  documents: readonly CxdDocument[],
  isPluginBlock: (type: string) => boolean,
): BlockInstances {
  // Every id in use, so that a new one never takes another block's.
  const used = new Set<string>();
  const collect = (blocks: readonly CxdBlock[]) => {
    for (const block of blocks) {
      used.add(block.id);
      if (block.children) collect(block.children);
    }
  };
  for (const document of documents) collect(document.blocks);

  const instances: CxdBlock[] = [];
  const alias = new Map<CxdBlock, CxdBlock>();
  // The blocks met by id: their content (as JSON, once needed) and their instance.
  const byId = new Map<string, { block: CxdBlock; json?: string; instance: CxdBlock }[]>();
  const content = (entry: { block: CxdBlock; json?: string }) =>
    (entry.json ??= JSON.stringify(entry.block));

  const walk = (blocks: readonly CxdBlock[]) => {
    for (const block of blocks) {
      if (alias.has(block)) continue;
      if (isPluginBlock(block.type)) {
        const met = byId.get(block.id);
        if (!met) {
          byId.set(block.id, [{ block, instance: block }]);
          alias.set(block, block);
          instances.push(block);
        } else {
          const self = { block };
          const twin = met.find((other) => content(other) === content(self));
          if (twin) {
            alias.set(block, twin.instance);
          } else {
            let n = 2;
            while (used.has(`${block.id}-${n}`)) n++;
            const id = `${block.id}-${n}`;
            used.add(id);
            const instance = { ...block, id };
            alias.set(block, instance);
            instances.push(instance);
            met.push({ ...self, instance });
          }
        }
      }
      if (block.children) walk(block.children);
    }
  };
  for (const document of documents) walk(document.blocks);

  return { instances, resolve: (block) => alias.get(block) ?? block };
}
