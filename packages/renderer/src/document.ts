import { inlineText, type CxdBlock, type CxdDocument } from '@cleitext/blocks';

/** Media ids referenced by image blocks, to preload before rendering. */
export function collectMediaIds(doc: CxdDocument | null | undefined): string[] {
  const ids = new Set<string>();
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      if (block.type === 'core/image' && typeof block.attrs.id === 'string')
        ids.add(block.attrs.id);
      if (block.children) walk(block.children);
    }
  };
  if (doc) walk(doc.blocks);
  return [...ids];
}

/** The first image of a document (for social previews). */
export function firstImage(
  doc: CxdDocument | null | undefined,
): { id?: string; url?: string } | null {
  const walk = (blocks: CxdBlock[]): CxdBlock | null => {
    for (const block of blocks) {
      if (block.type === 'core/image') return block;
      const nested = block.children ? walk(block.children) : null;
      if (nested) return nested;
    }
    return null;
  };
  const block = doc ? walk(doc.blocks) : null;
  if (!block) return null;
  return {
    ...(typeof block.attrs.id === 'string' ? { id: block.attrs.id } : {}),
    ...(typeof block.attrs.url === 'string' ? { url: block.attrs.url } : {}),
  };
}

/** Plain-text excerpt from the first paragraphs (meta description). */
export function documentExcerpt(doc: CxdDocument | null | undefined, maxLength = 160): string {
  const parts: string[] = [];
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      if (parts.join(' ').length >= maxLength) return;
      if (block.type === 'core/paragraph' && block.content) parts.push(inlineText(block.content));
      if (block.children) walk(block.children);
    }
  };
  if (doc) walk(doc.blocks);
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), maxLength - 30))}…`;
}
