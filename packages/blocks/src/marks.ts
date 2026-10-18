/**
 * Rich text's own types and helpers, without the document schema (no zod):
 * what editors and plugins' editor entries need (`@cleitext/blocks/inline`).
 */

export const MARKS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'sup',
  'sub',
  'highlight',
] as const;
export type Mark = (typeof MARKS)[number];

/**
 * Colors allowed in rich text (`color` of a run or a link): hex, rgb(a),
 * hsl(a) or a CSS variable of the theme's palette.
 */
export const INLINE_COLOR =
  /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]{1,60}\)|hsla?\([\d\s.,%deg]{1,60}\)|var\(--[a-z0-9-]{1,60}\))$/i;

/** A run of text with the same formatting. `\n` is a line break. */
export interface CxdText {
  text: string;
  marks?: Mark[];
  /** Text color (WordPress's "Text color" format). */
  color?: string;
}

export interface CxdLink {
  type: 'link';
  href: string;
  target?: '_blank';
  rel?: string;
  /** Color of the link, its underline included. */
  color?: string;
  children: CxdText[];
}

export type CxdInline = CxdText | CxdLink;

export function inlineText(inlines: CxdInline[]): string {
  return inlines
    .map((node) => ('type' in node ? node.children.map((c) => c.text).join('') : node.text))
    .join('');
}
