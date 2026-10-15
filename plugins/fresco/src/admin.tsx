/**
 * Fresco in the admin: an editor for pages and posts ("Edit with Fresco"),
 * the elements registered for the editor's panel and canvas.
 */
import { defineAdminPlugin } from '@cleitext/admin-sdk';
import { installApi } from './api.js';
import { registerFreeElements } from './elements/index.js';
import { fromBlocks, toBlocks } from './editor/convert.js';
import { FrescoEditor } from './editor/editor.js';

registerFreeElements();
installApi();

export default defineAdminPlugin({
  editors: [
    {
      id: 'fresco',
      title: 'Fresco',
      fromBlocks,
      toBlocks,
      component: FrescoEditor,
    },
  ],
});
