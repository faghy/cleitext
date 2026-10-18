/**
 * Share links of Prisma on the site: the server writes each network's
 * share address with the page's address as it knows it (a path); here it
 * becomes the full address the visitor sees, as networks need it. Nothing
 * else happens: no counters, no requests, no tracking.
 */
export {};

function complete() {
  const page = window.location.href.split('#')[0] ?? '';
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-pr-share]')) {
    const base = link.dataset.prShare ?? '';
    if (!/^(https:\/\/|mailto:)/.test(base)) continue;
    let href = base + encodeURIComponent(page);
    const media = link.dataset.prMedia;
    if (media) {
      try {
        href += `&media=${encodeURIComponent(new URL(media, page).href)}`;
      } catch {
        // A picture that is not an address is left out.
      }
    }
    link.href = href;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', complete);
else complete();
