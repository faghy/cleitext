/**
 * Fresco in the admin: an editor for pages and posts ("Edit with Fresco"),
 * the elements registered for the editor's panel and canvas.
 */
import { defineAdminPlugin } from '@cleitext/admin-sdk';
import { installApi } from './api.js';
import { registerFreeElements } from './elements/index.js';
import { fromBlocks, toBlocks } from './editor/convert.js';
import { FrescoEditor } from './editor/editor.js';
import { ColorPicker, ControlField, MediaPicker, Svg } from './editor/controls.js';
import { EDITOR_CSS } from './editor/styles.js';
import { normalizeKit } from './core/kit.js';
import { iconDataLoaded, setIconData, type IconData } from './core/icons.js';

registerFreeElements();

/** The icons of the icon picker, from this version's public files (once). */
async function loadIcons(): Promise<void> {
  if (iconDataLoaded()) return;
  const version = /\/fresco\/([^/]+)\/[^/]*$/.exec(new URL(import.meta.url).pathname)?.[1];
  if (!version) return;
  const response = await fetch(`/plugin-assets/fresco/${version}/icons.json`);
  if (response.ok) setIconData((await response.json()) as IconData);
}

// Other editors over Fresco's elements (plugins) use the same fields and styles.
installApi({
  ui: {
    ControlField,
    ColorPicker,
    MediaPicker,
    Svg,
    EDITOR_CSS,
    normalizeKit,
    fromBlocks,
    toBlocks,
    loadIcons,
  },
});

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
