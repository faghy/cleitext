/**
 * Plugin block: a block of another active plugin (e.g. a shop's product
 * grid) in a Fresco page. The block is the element's only child, stored as
 * Cleitext stores it, so Cleitext renders it on the page; the element adds
 * the Advanced tab (spacing, visibility, animation) around it. The panel
 * offers one tile per plugin block (editor/plugin-blocks.tsx).
 */
import { advancedControls, ElementRoot } from '../core/common.js';
import type { ElementDefinition } from '../core/model.js';

export const pluginBlock: ElementDefinition = {
  type: 'fresco/block',
  title: 'Plugin block',
  icon: 'M4 7.5l8-4.5 8 4.5v9l-8 4.5-8-4.5z M4 7.5l8 4.5 8-4.5 M12 12v9',
  category: 'plugins',
  hidden: true,
  container: true,
  accepts: () => false,
  controls: [
    {
      name: '_block',
      type: 'pluginBlock',
      label: 'Settings',
      tab: 'content',
      section: 'Block',
      noCss: true,
    },
    ...advancedControls(),
  ],
  render({ node, settings, children, context }) {
    const inner = node.children?.[0];
    return (
      <ElementRoot node={node} settings={settings} name="fr-block" editing={context.editing}>
        {context.editing ? inner && context.pluginBlock?.(inner) : children}
      </ElementRoot>
    );
  },
};
