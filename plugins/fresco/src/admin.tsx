/**
 * Fresco in the admin: an editor for pages and posts ("Edit with Fresco"),
 * the elements registered for the editor's panel and canvas.
 */
import { defineAdminPlugin } from '@cleitext/admin-sdk';
import { installApi } from './api.js';
import {
  FrescoHome,
  SiteSettingsPage,
  SystemInfoPage,
  TemplatesPage,
  ToolsPage,
} from './admin-pages.js';
import { AdminDialogs, askText, confirmAction, notify } from './admin-dialogs.js';
import { ElementManagerPage } from './admin-elements.js';
import { registerFreeElements } from './elements/index.js';
import { fromBlocks, toBlocks } from './core/convert.js';
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
    dialogs: { askText, confirmAction, notify, Host: AdminDialogs },
  },
});

export default defineAdminPlugin({
  // Fresco's own menu, after Pages (as other page builders have).
  pages: [
    {
      path: '',
      title: 'Fresco',
      capability: 'edit_entries',
      after: '/pages',
      icon: 'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z M9 8h6 M9 12h4 M9 8v8',
      component: FrescoHome,
    },
    // Under Fresco, as other page builders have them.
    {
      path: 'site-settings',
      parent: '',
      title: { en: 'Site settings', it: 'Impostazioni del sito' },
      capability: 'manage_fresco',
      component: SiteSettingsPage,
    },
    {
      path: 'tools',
      parent: '',
      title: { en: 'Tools', it: 'Strumenti' },
      capability: 'manage_fresco',
      component: ToolsPage,
    },
    {
      path: 'element-manager',
      parent: '',
      title: { en: 'Element manager', it: 'Gestione elementi' },
      capability: 'manage_fresco',
      component: ElementManagerPage,
    },
    {
      path: 'system-info',
      parent: '',
      title: { en: 'System info', it: 'Informazioni di sistema' },
      capability: 'manage_fresco',
      component: SystemInfoPage,
    },
    {
      path: 'templates',
      title: { en: 'Templates', it: 'Modelli' },
      capability: 'edit_entries',
      after: '/ext/fresco',
      icon: 'M4 5h6v14H4z M12 5h3v14h-3z M17 6l3 1-3 12-3-1z',
      component: TemplatesPage,
    },
  ],
  editors: [
    {
      id: 'fresco',
      title: 'Fresco',
      // Full screen with its own top bar, as page builders are.
      chrome: 'none',
      fromBlocks,
      toBlocks,
      component: FrescoEditor,
    },
  ],
});
