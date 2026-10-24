import type { CxdInline } from '@cleitext/plugin-sdk';

/** The plain text of rich text (links' text included). */
export function inlineText(nodes: readonly CxdInline[]): string {
  return nodes
    .map((node) => ('type' in node ? node.children.map((child) => child.text).join('') : node.text))
    .join('');
}
