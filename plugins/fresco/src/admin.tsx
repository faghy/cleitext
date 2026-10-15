/**
 * Fresco in the admin: an editor for pages and posts ("Edit with Fresco"),
 * the elements registered for the editor's panel and canvas.
 */
import { defineAdminPlugin } from '@cleitext/admin-sdk';
import { registerFreeElements } from './elements/index.js';
import { FrescoEditor } from './editor/editor.js';

registerFreeElements();

export default defineAdminPlugin({
  editors: [
    {
      id: 'fresco',
      title: 'Fresco',
      types: ['page', 'article'],
      component: FrescoEditor,
    },
  ],
});
