/**
 * HTML and WordPress block markup to Cleitext blocks (CXD), for imports and AI
 * assistants. A separate entry (`@cleitext/blocks/html`): it brings an HTML
 * parser that the admin does not need.
 */
export {
  htmlToCxd,
  IMPORTED_BLOCK,
  shortcodePlaceholder,
  type ConvertOptions,
} from './html/html-to-cxd.js';
export {
  findShortcodes,
  parseShortcodeAttrs,
  shortcodeLines,
  splitShortcodes,
  wholeShortcode,
  type Shortcode,
  type ShortcodePiece,
} from './html/shortcodes.js';
export { parseBlocks, type WpBlock } from './html/wp-blocks.js';
export { texturizeHtml, texturizeText } from './html/texturize.js';
