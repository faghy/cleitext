/**
 * TinyMCE, bundled: the core, its theme, model, icons, skin and the plugins
 * used here are imported statically, and the skin's styles are registered
 * as resources, so nothing is loaded from other addresses (admin CSP).
 */
/*! @license TinyMCE 6.8.6 | MIT License | Copyright (c) 2022 Ephox Corporation DBA Tiny Technologies, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
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
