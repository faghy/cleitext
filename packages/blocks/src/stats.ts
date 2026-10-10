import { inlineText, type CxdBlock, type CxdDocument } from './cxd.js';

export interface DocumentStats {
  words: number;
  characters: number;
  /** At 200 words a minute, at least one minute when there is text. */
  readingMinutes: number;
  /** Headings in order; `problem` explains a level that breaks the outline. */
  headings: { id: string; level: number; text: string; problem: 'h1' | 'skipped' | null }[];
}

/**
 * Word count, reading time and heading outline of a document (RF-EDT-10).
 * The title of the page is its H1: headings in the content start at H2 and
 * never skip a level.
 */
export function documentStats(doc: CxdDocument): DocumentStats {
  const texts: string[] = [];
  const headings: DocumentStats['headings'] = [];
  let previous = 1;
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      if (block.content) texts.push(inlineText(block.content));
      for (const value of Object.values(block.attrs)) {
        // Rich attributes (captions, citations) are arrays of inline nodes.
        if (Array.isArray(value) && value.every((v) => typeof v === 'object' && v !== null)) {
          texts.push(inlineText(value as never));
        }
      }
      if (block.type === 'core/heading') {
        const level = Number(block.attrs.level) || 2;
        headings.push({
          id: block.id,
          level,
          text: inlineText(block.content ?? []),
          problem: level === 1 ? 'h1' : level > previous + 1 ? 'skipped' : null,
        });
        previous = level;
      }
      if (block.children) walk(block.children);
    }
  };
  walk(doc.blocks);
  const text = texts.join(' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
  return {
    words,
    characters: text.length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / 200)),
    headings,
  };
}
