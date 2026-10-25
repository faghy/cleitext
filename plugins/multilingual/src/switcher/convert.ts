/**
 * Other switchers into Multilingual's block (Multilingual 1.6.0): WPML's
 * and Polylang's shortcodes, blocks and widgets met while importing a
 * WordPress site, and `[language_switcher]` written in a paragraph.
 */
import type { CxdBlock } from '@cleitext/plugin-sdk';

export const BLOCK_TYPE = 'multilingual/language-switcher';

/** The shortcodes that become the switcher. */
export const SHORTCODES = new Set([
  'language_switcher',
  'wpml_language_selector_widget',
  'wpml_language_selector_footer',
  'wpml_language_switcher',
  'polylang_langswitcher',
  'polylang_language_switcher',
  'pll_language_switcher',
]);

type Attrs = Record<string, string>;

const on = (value: unknown) =>
  value === true || value === 1 || ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
const has = (attrs: Record<string, unknown>, key: string) =>
  attrs[key] !== undefined && attrs[key] !== null && attrs[key] !== '';

function block(attrs: Attrs): CxdBlock {
  return { id: crypto.randomUUID(), type: BLOCK_TYPE, v: 1, attrs };
}

/** Polylang's options (`pll_the_languages`, its block and widget). */
function polylang(options: Record<string, unknown>): Attrs {
  const attrs: Attrs = {};
  if (has(options, 'dropdown')) attrs.style = on(options.dropdown) ? 'dropdown' : 'inline';
  const names = has(options, 'show_names') ? on(options.show_names) : undefined;
  const flags = has(options, 'show_flags') ? on(options.show_flags) : undefined;
  if (flags !== undefined) attrs.flags = flags ? 'yes' : 'no';
  if (options.display_names_as === 'slug' || (names === false && flags === false)) {
    attrs.names = 'code';
  } else if (names === false && flags) {
    // Flags only: the codes stay, small, for those who do not know the flags.
    attrs.names = 'code';
  } else if (names) attrs.names = 'native';
  if (has(options, 'hide_current')) attrs.showCurrent = on(options.hide_current) ? 'no' : 'yes';
  if (has(options, 'hide_if_no_translation'))
    attrs.untranslated = on(options.hide_if_no_translation) ? 'hide' : 'home';
  return attrs;
}

/** WPML's shortcode options (`[wpml_language_switcher flags=1 native=1 translated=0]`). */
function wpml(tag: string, options: Attrs): Attrs {
  const attrs: Attrs = {};
  if (tag === 'wpml_language_selector_widget') attrs.style = 'dropdown';
  else if (tag === 'wpml_language_selector_footer') attrs.style = 'inline';
  else if (tag === 'wpml_language_switcher') {
    attrs.style = options.type === 'widget' ? 'dropdown' : 'inline';
  }
  if (has(options, 'flags')) attrs.flags = on(options.flags) ? 'yes' : 'no';
  const native = has(options, 'native') ? on(options.native) : undefined;
  const translated = has(options, 'translated') ? on(options.translated) : undefined;
  if (translated && !native) attrs.names = 'translated';
  else if (native) attrs.names = 'native';
  else if (native === false && translated === false) attrs.names = 'code';
  if (has(options, 'link_current')) attrs.showCurrent = on(options.link_current) ? 'yes' : 'no';
  return attrs;
}

/** Our own shortcode: `[language_switcher style="inline" names="code" flags="no" current="hide"]`. */
function own(options: Attrs): Attrs {
  const attrs: Attrs = {};
  if (['dropdown', 'inline', 'list'].includes(options.style ?? '')) attrs.style = options.style!;
  if (['native', 'translated', 'code'].includes(options.names ?? '')) attrs.names = options.names!;
  if (has(options, 'flags')) attrs.flags = on(options.flags) ? 'yes' : 'no';
  if (options.current === 'hide' || options.current === 'show')
    attrs.showCurrent = options.current === 'show' ? 'yes' : 'no';
  if (options.untranslated === 'hide' || options.untranslated === 'home')
    attrs.untranslated = options.untranslated;
  return attrs;
}

/** The switcher block for a shortcode, or null when it is not one of a switcher. */
export function blockFromShortcode(tag: string, attrs: Attrs): CxdBlock | null {
  const name = tag.toLowerCase();
  if (!SHORTCODES.has(name)) return null;
  if (name === 'language_switcher') return block(own(attrs));
  if (name.startsWith('wpml_')) return block(wpml(name, attrs));
  return block(polylang(attrs));
}

/** The switcher block for a WordPress block (WPML's, Polylang's, their legacy widgets), or null. */
export function blockFromWordPress(name: string, attrs: Record<string, unknown>): CxdBlock | null {
  if (/^wpml\/(navigation-)?language-switcher(-block)?$/.test(name)) {
    return block({ style: name.includes('navigation') ? 'dropdown' : 'inline' });
  }
  if (/^polylang\/(navigation-)?language-switcher$/.test(name)) return block(polylang(attrs));
  if (name === 'core/legacy-widget') {
    const base = String(attrs.idBase ?? attrs.id_base ?? '');
    const raw = ((attrs.instance as { raw?: unknown } | undefined)?.raw ?? {}) as Record<
      string,
      unknown
    >;
    if (base === 'icl_lang_sel_widget') return block({ style: 'dropdown' });
    if (base === 'polylang') return block(polylang(raw));
  }
  return null;
}

/** `key="value" key='value' key=value`, by lowercase name. */
export function shortcodeAttrs(text: string): Attrs {
  const attrs: Attrs = {};
  for (const match of text.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/g)) {
    attrs[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

const ALONE_RE = /^\[([a-z_]+)((?:\s[^\]]*)?)\]$/i;

/** A shortcode standing alone in a text (`[language_switcher names="code"]`), as the switcher. */
export function blockFromText(text: string): CxdBlock | null {
  const match = ALONE_RE.exec(text.trim());
  if (!match) return null;
  return blockFromShortcode(match[1]!, shortcodeAttrs(match[2] ?? ''));
}

/** The plain text of a paragraph's content (CXD inline nodes). */
function plainText(nodes: unknown): string {
  if (!Array.isArray(nodes)) return '';
  return nodes
    .map((node) => {
      if (!node || typeof node !== 'object') return '';
      const n = node as { text?: unknown; children?: unknown };
      return typeof n.text === 'string' ? n.text : plainText(n.children);
    })
    .join('');
}

/**
 * Blocks of an entry with each paragraph holding only a switcher shortcode
 * replaced by the block (the same array when there is none).
 */
export function replaceShortcodes(blocks: CxdBlock[]): CxdBlock[] {
  let changed = false;
  const walk = (list: CxdBlock[]): CxdBlock[] =>
    list.map((item) => {
      if (item.type === 'core/paragraph') {
        const text = plainText((item as { content?: unknown }).content);
        if (text.includes('[')) {
          const found = blockFromText(text);
          if (found) {
            changed = true;
            return { ...found, id: item.id };
          }
        }
      }
      if (item.children?.length) {
        const children = walk(item.children);
        if (children !== item.children) return { ...item, children };
      }
      return item;
    });
  const result = walk(blocks);
  return changed ? result : blocks;
}
