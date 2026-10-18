/** Elements a block may print from its settings (anything else becomes the fallback). */
const TAGS = new Set([
  'div',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'main',
  'nav',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'span',
  'a',
  'figure',
  'figcaption',
  'ul',
  'ol',
  'li',
]);

export function safeTag(tag: unknown, fallback = 'div'): string {
  return typeof tag === 'string' && TAGS.has(tag) ? tag : fallback;
}
