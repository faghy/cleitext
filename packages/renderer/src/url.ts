/**
 * URLs coming from content are rendered only if they use a safe scheme:
 * http(s), mailto, tel, or a relative/fragment/query URL. Anything else
 * (javascript:, data:, vbscript:…) is dropped.
 */
const SAFE = /^(https?:|mailto:|tel:|\/(?!\/)|\/\/|#|\?|\.{0,2}\/)/i;

export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Browsers ignore control characters and whitespace in schemes ("java\nscript:").
  // eslint-disable-next-line no-control-regex
  const url = value.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (!url) return undefined;
  if (SAFE.test(url)) return url;
  // Relative URLs without a leading slash ("page.html", "img/a.png").
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return undefined;
}
