/**
 * TinyMCE, bundled: the core, its theme, model, icons, skin and the plugins
 * used here are imported statically, and the skin's styles are registered
 * as resources, so nothing is loaded from other addresses (admin CSP).
 */
/*! @license TinyMCE 8.10.0 | GPL-2.0-or-later | Copyright (c) 2025 Ephox Corporation DBA Tiny Technologies, Inc.
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 2 of the License, or (at your option)
 * any later version. https://www.gnu.org/licenses/gpl-2.0.html
 */
import tinymce from 'tinymce';
import 'tinymce/models/dom/model.js';
import 'tinymce/themes/silver/theme.js';
import 'tinymce/icons/default/icons.js';
import 'tinymce/skins/ui/oxide/skin.js';
import 'tinymce/skins/ui/oxide/content.js';
import 'tinymce/skins/content/default/content.js';
import 'tinymce/plugins/lists/plugin.js';
import 'tinymce/plugins/link/plugin.js';
import 'tinymce/plugins/charmap/plugin.js';
import 'tinymce/plugins/fullscreen/plugin.js';
import 'tinymce/plugins/help/plugin.js';
import 'tinymce/plugins/help/js/i18n/keynav/en.js';
import 'tinymce/plugins/help/js/i18n/keynav/it.js';
import { TINYMCE_IT } from './i18n.js';

tinymce.addI18n('it', TINYMCE_IT);

export default tinymce;
