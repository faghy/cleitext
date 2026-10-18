/**
 * Share links of Prisma's blockquotes: the address shared is the page's own,
 * known only in the browser, so it is added to the link here.
 */
function initShareLinks() {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-pr-blockquote]')) {
    try {
      const url = new URL(link.href);
      url.searchParams.set('url', window.location.href);
      link.href = url.toString();
    } catch {
      // A malformed address stays as it is.
    }
  }
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', initShareLinks);
else initShareLinks();

export {};
