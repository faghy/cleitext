/**
 * Divi's layouts as WordPress keeps them: shortcodes (`[et_pb_section …]`
 * … `[/et_pb_section]`) in the post content. Read here into a tree of
 * modules with their attributes and content. The shortcode names and the
 * encoding of their attributes are a data format: they appear here only to
 * be read.
 */
import { parseShortcodeAttrs } from '../html/shortcodes.js';

export type DiviAttrs = Record<string, string>;

/** One Divi element (section, row, column or module) of a layout. */
export interface DiviNode {
  /** The shortcode name, e.g. `et_pb_text`. */
  tag: string;
  attrs: DiviAttrs;
  /** Child elements (sections → rows → columns → modules). */
  children: DiviNode[];
  /** The text inside the element (a module's HTML), without its child elements. */
  content: string;
}

/** Characters Divi writes as codes inside attribute values. */
const ATTR_CODES: Record<string, string> = {
  '%22': '"',
  '%91': '[',
  '%93': ']',
  '%92': '\\',
  '%5c': '\\',
  '%5C': '\\',
};

/** An attribute value as Divi meant it (its own codes for quotes and brackets). */
export function decodeAttr(value: string): string {
  return value.replace(/%22|%91|%93|%92|%5c/gi, (code) => ATTR_CODES[code] ?? code);
}

const TAG = /\[(\/?)(et_pb_[a-z0-9_]+)((?:[^\]"']|"[^"]*"|'[^']*')*?)(\/?)\]/g;

/** Whether a text holds a Divi layout. */
export const isDiviLayout = (text: string): boolean => /\[et_pb_[a-z0-9_]+[\s\]]/.test(text);

/**
 * The Divi elements of a text, as a tree. Text between elements that are
 * not modules (spaces, paragraphs added by an editor) is dropped; text
 * inside a module is its content. Unclosed elements end with their parent.
 */
export function parseDivi(text: string): DiviNode[] {
  const root: DiviNode = { tag: '', attrs: {}, children: [], content: '' };
  const stack: DiviNode[] = [root];
  let last = 0;
  const addText = (to: DiviNode, piece: string) => {
    if (to !== root) to.content += piece;
  };
  for (const m of text.matchAll(TAG)) {
    const top = stack.at(-1)!;
    addText(top, text.slice(last, m.index));
    last = m.index + m[0].length;
    const [, closing, tag, rawAttrs, selfClosing] = m;
    // Markers of Divi's code editor (line breaks) are text of the module.
    if (/^et_pb_(line_break|br)_holder$/.test(tag!)) {
      addText(top, m[0]);
      continue;
    }
    if (closing) {
      const at = stack.findLastIndex((entry) => entry.tag === tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const attrs: DiviAttrs = {};
    for (const [key, value] of Object.entries(parseShortcodeAttrs(rawAttrs ?? ''))) {
      if (!/^\d+$/.test(key)) attrs[key] = decodeAttr(value);
    }
    const node: DiviNode = { tag: tag!, attrs, children: [], content: '' };
    top.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  addText(stack.at(-1)!, text.slice(last));
  return root.children;
}

/**
 * The HTML of a code module (or any content Divi saved for its code
 * editor): its line breaks and the brackets it wrote as codes.
 */
export function diviCode(content: string): string {
  return content
    .replace(/<!--\s*\[et_pb_line_break_holder\]\s*-->/g, '\n')
    .replace(/<!--\s*\[et_pb_br_holder\]\s*-->/g, '<br />')
    .replace(/&#0?91;/g, '[')
    .replace(/&#0?93;/g, ']')
    .replace(/%22/g, '"')
    .replace(/%91/g, '[')
    .replace(/%93/g, ']');
}
