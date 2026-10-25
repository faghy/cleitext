import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import sanitizeHtml from 'sanitize-html';

/** A color: hex, rgb(a), hsl(a), a name, or a variable of the theme's palette. */
const COLOR =
  /^(#[0-9a-f]{3,8}|(rgba?|hsla?)\([\d\s.,%deg/]{1,60}\)|[a-z]{3,20}|var\(--[a-z0-9-]{1,60}\))$/i;
/** A length (or a few, as margins have): numbers with a unit, `auto`, a palette variable. */
const LENGTHS =
  /^((-?\d{1,5}(\.\d{1,4})?(px|pt|em|rem|%|vh|vw|ch|ex)?|auto|var\(--[a-z0-9-]{1,60}\))\s*){1,4}$/i;
const KEYWORD = /^[a-z-]{1,30}$/i;
const STYLE_VALUES: Record<string, RegExp[]> = {
  color: [COLOR],
  'background-color': [COLOR],
  'font-size': [LENGTHS, KEYWORD],
  'font-weight': [/^(normal|bold|bolder|lighter|[1-9]00)$/i],
  'font-style': [/^(normal|italic|oblique)$/i],
  'font-variant': [KEYWORD],
  'line-height': [LENGTHS, /^normal$/i],
  'letter-spacing': [LENGTHS, /^normal$/i],
  'text-align': [/^(left|right|center|justify|start|end)$/i],
  'text-decoration': [/^[a-z -]{1,60}$/i],
  'text-transform': [/^(none|uppercase|lowercase|capitalize)$/i],
  'text-indent': [LENGTHS],
  'vertical-align': [KEYWORD, LENGTHS],
  'white-space': [KEYWORD],
  ...Object.fromEntries(
    ['margin', 'padding'].flatMap((p) =>
      ['', '-top', '-right', '-bottom', '-left'].map((side) => [`${p}${side}`, [LENGTHS]]),
    ),
  ),
  width: [LENGTHS],
  height: [LENGTHS],
  'max-width': [LENGTHS],
  'min-width': [LENGTHS],
  'border-width': [LENGTHS],
  'border-style': [/^[a-z ]{1,40}$/i],
  'border-color': [COLOR],
  'border-radius': [LENGTHS],
  display: [/^(inline|block|inline-block|none|flex|inline-flex|grid)$/i],
  float: [/^(left|right|none)$/i],
  clear: [/^(left|right|both|none)$/i],
};

/**
 * Allowlist for the `core/html` block of users without `unfiltered_html`
 * (docs/ARCHITECTURE.md §18): formatting, links, images, tables and the
 * players of known embed providers; no scripts, style sheets or event
 * handlers. Inline styles keep the safe text and box properties (as
 * WordPress's `safecss_filter_attr`), with plain values: no `url()`, no
 * expressions.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'figure',
    'figcaption',
    'picture',
    'source',
    'video',
    'audio',
    'track',
    'iframe',
    'details',
    'summary',
    'mark',
    'del',
    'ins',
    'sub',
    'sup',
    'small',
  ],
  allowedAttributes: {
    '*': ['class', 'id', 'title', 'lang', 'dir', 'aria-*', 'data-*', 'style'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'decoding'],
    source: ['src', 'srcset', 'sizes', 'type', 'media'],
    video: [
      'src',
      'poster',
      'controls',
      'width',
      'height',
      'muted',
      'loop',
      'playsinline',
      'preload',
    ],
    audio: ['src', 'controls', 'loop', 'muted', 'preload'],
    track: ['src', 'kind', 'srclang', 'label', 'default'],
    iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy'],
    ol: ['start', 'reversed', 'type'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
    details: ['open'],
  },
  allowedStyles: { '*': STYLE_VALUES },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src', 'srcset', 'poster'],
  allowProtocolRelative: false,
  allowedIframeHostnames: [
    'www.youtube-nocookie.com',
    'www.youtube.com',
    'player.vimeo.com',
    'open.spotify.com',
    'www.dailymotion.com',
  ],
  transformTags: {
    // Links opening a new tab cannot reach back to this page.
    a: (tagName, attribs) =>
      attribs.target === '_blank'
        ? { tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }
        : { tagName, attribs },
  },
};

export function sanitizeHtmlBlock(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

/**
 * The document with every raw HTML attribute sanitized (a new copy):
 * `core/html` blocks, and plugin blocks' attributes declared as HTML.
 */
export function sanitizeDocument(
  document: CxdDocument,
  htmlAttributes: (type: string) => string[] | undefined = () => undefined,
): CxdDocument {
  const clean = (block: CxdBlock): CxdBlock => {
    const keys = block.type === 'core/html' ? ['content'] : (htmlAttributes(block.type) ?? []);
    const attrs = { ...block.attrs };
    for (const key of keys) {
      if (typeof attrs[key] === 'string') attrs[key] = sanitizeHtmlBlock(attrs[key]);
    }
    return {
      ...block,
      attrs,
      ...(block.children ? { children: block.children.map(clean) } : {}),
    };
  };
  return { ...document, blocks: document.blocks.map(clean) };
}
