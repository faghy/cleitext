import type { CxdBlock } from '@cleitext/blocks';
import { registerBlockRenderer } from '@cleitext/renderer';
import { createElement } from 'react';

/**
 * Pages of plugins in the active theme (`page` in a public route's answer,
 * plugin API 1.14): the plugin's markup becomes the content of a virtual
 * entry. The HTML is kept beside the block object, never in its attributes,
 * so that a document saved by a user cannot carry raw HTML this way.
 */
const contents = new WeakMap<CxdBlock, string>();

registerBlockRenderer('cleitext/plugin-page', ({ block }) => {
  const html = contents.get(block);
  return html === undefined
    ? null
    : createElement('div', {
        className: 'cx-plugin-page',
        dangerouslySetInnerHTML: { __html: html },
      });
});

export function pluginPageBlock(html: string): CxdBlock {
  const block: CxdBlock = { id: 'plugin-page', type: 'cleitext/plugin-page', v: 1, attrs: {} };
  contents.set(block, html);
  return block;
}
