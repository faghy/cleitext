import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import sanitizeHtml from 'sanitize-html';

/**
 * Allowlist for the `core/html` block of users without `unfiltered_html`
 * (docs/ARCHITECTURE.md §18): formatting, links, images, tables and the
 * players of known embed providers; no scripts, styles or event handlers.
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
    '*': ['class', 'id', 'title', 'lang', 'dir', 'aria-*', 'data-*'],
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
