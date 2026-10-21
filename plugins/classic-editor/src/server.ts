/**
 * Classic Editor on the server (plugin API 1.40): Cleitext's AI assistants
 * keep classic pages classic. Their content is ordinary blocks, so blocks
 * and HTML from an assistant are saved as they are, with `editor: classic`.
 */
import { definePlugin, type CxdDocument } from '@cleitext/plugin-sdk';
import { EDITOR_ID, fromBlocks, toBlocks } from './convert.js';

const GUIDE = `Classic Editor pages are stored as ordinary blocks and edited as HTML in the Visual
and Text tabs, like WordPress's classic editor. Write them as **plain HTML** in \`content\`:
paragraphs, headings (h2, h3…), lists, quotes, links, bold and italic, images (\`<img>\` with the
\`src\` of a media item and its alt text), tables, \`<hr>\`, code, and \`<!--more-->\` for the
"Read more" break. They become paragraph, heading, list, quote, image, table, separator and code
blocks, all editable in the Visual tab.

Avoid layout blocks (columns, groups, buttons, galleries) and theme sections: the Classic Editor
shows them as placeholders that people cannot edit there. If the page needs a layout, ask whether
to move it to the block editor (\`editor: "blocks"\`).

\`native\` (the blocks as get_entry returns them in \`native\`) is accepted too.`;

export default definePlugin({
  setup(ctx) {
    ctx.ai?.registerEditor({
      id: EDITOR_ID,
      title: 'Classic Editor',
      guide: GUIDE,
      fromBlocks: (blocks) => fromBlocks({ schema: 1, blocks }),
      toBlocks: (document) => toBlocks(document).blocks,
      // The same blocks: Cleitext validates them as for every save.
      validate: (document: CxdDocument) => ({ document: fromBlocks(document) }),
    });
  },
});
