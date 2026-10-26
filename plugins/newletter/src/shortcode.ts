/**
 * `[newletter …]` standing alone in a paragraph, a shortcode block or an
 * HTML block becomes the signup block when the page is shown (the
 * `render.blocks` filter), with the attributes of the shortcode.
 */
import type { CxdBlock } from '@cleitext/plugin-sdk';
import { SHORTCODE } from './config';
import { blockFromShortcode } from './import/convert';

const OWN = new RegExp(
  `^\\s*\\[${SHORTCODE}((?:\\s+[\\w-]+\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s\\]]+))*)\\s*\\/?\\]\\s*$`,
  'i',
);

export function parseOwnShortcode(text: string): Record<string, string> | null {
  const m = OWN.exec(text);
  if (!m) return null;
  const attrs: Record<string, string> = {};
  for (const a of (m[1] ?? '').matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/g))
    attrs[a[1]!.toLowerCase()] = (a[2] ?? a[3] ?? a[4] ?? '').trim();
  return attrs;
}

function plainText(block: CxdBlock): string | null {
  if (block.type === 'core/paragraph' && block.content)
    return block.content
      .map((node) => ('type' in node ? node.children.map((c) => c.text).join('') : node.text))
      .join('');
  if (block.type === 'core/shortcode' && typeof block.attrs.text === 'string')
    return block.attrs.text;
  if (block.type === 'core/html' && typeof block.attrs.content === 'string')
    return block.attrs.content;
  return null;
}

/** The blocks with the shortcode replaced; the same array when there is none. */
export function replaceShortcodes(blocks: CxdBlock[]): CxdBlock[] {
  let changed = false;
  const walk = (items: CxdBlock[]): CxdBlock[] =>
    items.map((block) => {
      const text = plainText(block);
      if (text !== null && text.toLowerCase().includes(`[${SHORTCODE}`)) {
        const attrs = parseOwnShortcode(text);
        const replaced = attrs ? blockFromShortcode(SHORTCODE, attrs, block.id) : null;
        if (replaced) {
          changed = true;
          return replaced;
        }
      }
      if (block.children?.length) {
        const children = walk(block.children);
        if (children !== block.children) return { ...block, children };
      }
      return block;
    });
  const out = walk(blocks);
  return changed ? out : blocks;
}
