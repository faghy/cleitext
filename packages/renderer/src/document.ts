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

/** Synced patterns referenced by a document (RF-EDT-07), to preload. */
export function collectPatternIds(doc: CxdDocument | null | undefined): string[] {
  const ids = new Set<string>();
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      if (block.type === 'cleitext/pattern' && typeof block.attrs.ref === 'string')
        ids.add(block.attrs.ref);
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

/** A web address alone (an embed, as WordPress turns a URL on its own line into a player). */
const BARE_URL = /^<?https?:\/\/\S+>?$/i;
/** Shortcodes (`[embed]…[/embed]`, `[gallery ids="1"]`): WordPress leaves them out of excerpts. */
const SHORTCODE = /\[(\/?)([a-z][\w-]*)(?:\s[^\]]*)?\]/gi;

/** A paragraph's words as an excerpt shows them: none for an embed or shortcodes alone. */
function excerptText(text: string): string {
  const withoutEmbeds = text.replace(
    /\[(embed|video|audio|caption)(?:\s[^\]]*)?\][\s\S]*?\[\/\1\]/gi,
    ' ',
  );
  const words = withoutEmbeds.replace(SHORTCODE, ' ').replace(/\s+/g, ' ').trim();
  return BARE_URL.test(words) ? '' : words;
}

/**
 * Plain-text excerpt from the first paragraphs (meta description, lists of
 * posts). As WordPress's automatic excerpts, without embeds: a paragraph
 * holding only a web address (a video) or shortcodes adds nothing.
 */
export function documentExcerpt(doc: CxdDocument | null | undefined, maxLength = 160): string {
  const parts: string[] = [];
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      if (parts.join(' ').length >= maxLength) return;
      if (block.type === 'core/paragraph' && block.content) {
        const text = excerptText(inlineText(block.content));
        if (text) parts.push(text);
      }
      if (block.children) walk(block.children);
    }
  };
  if (doc) walk(doc.blocks);
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), maxLength - 30))}…`;
}
