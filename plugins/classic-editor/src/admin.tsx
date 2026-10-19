/**
 * Classic Editor in the admin: "Edit with Classic Editor" on every content
 * type, with the content kept as blocks.
 */
import { defineAdminPlugin } from '@cleitext/admin-sdk';
import { ClassicEditor } from './classic-editor.js';
import { EDITOR_ID, fromBlocks, toBlocks } from './convert.js';

export default defineAdminPlugin({
  editors: [
    {
      id: EDITOR_ID,
      title: { en: 'Classic Editor', it: 'Editor classico' },
      fromBlocks,
      toBlocks,
      component: ClassicEditor,
    },
  ],
});
