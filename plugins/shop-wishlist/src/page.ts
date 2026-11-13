/** The wishlist page: Cleishop's product cards, each with Remove; the share box. */
import type { Translate } from './strings';

export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export const PAGE_CSS = `
.shop-wishlist__share{margin:1.5rem 0 0;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.shop-wishlist__share a,.shop-wishlist__share button{display:inline-block;padding:.45rem .9rem;border-radius:3px;background:#333;color:#fff;text-decoration:none;border:0;font:inherit;font-size:.9em;cursor:pointer}
.shop-wishlist__remove{background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer;font:inherit;font-size:.85em}
.shop-wishlist__empty{margin:1rem 0 2rem}
`;

/** Share links: email, Facebook, Pinterest, WhatsApp, and copying the link. */
export function shareLinks(t: Translate, url: string): string {
  const u = encodeURIComponent(url);
  const title = encodeURIComponent(t('My wishlist'));
  const links = [
    ['Email', `mailto:?subject=${title}&body=${u}`],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['Pinterest', `https://pinterest.com/pin/create/button/?url=${u}&description=${title}`],
    ['WhatsApp', `https://wa.me/?text=${title}%20${u}`],
  ];
  return `<div class="shop-wishlist__share"><strong>${escapeHtml(t('Share your list'))}</strong>
${links.map(([name, href]) => `<a href="${escapeHtml(href!)}" target="_blank" rel="noopener noreferrer">${name}</a>`).join('\n')}
<button type="button" data-wishlist-copy="${escapeHtml(url)}">${escapeHtml(t('Copy the link'))}</button></div>`;
}

/**
 * The page: the cards (the heart on each one, added by the script, removes
 * it from the list), a message when there is none, and the share box.
 */
export function listPage(o: {
  t: Translate;
  cards: string;
  count: number;
  shared: boolean;
  prefix: string;
  share: string;
  shop: boolean;
}): string {
  const { t } = o;
  const head = `<style>${PAGE_CSS}</style><div class="shop-wishlist" data-wishlist${o.shared ? '-shared' : ''}="">`;
  if (!o.count) {
    return `${head}<p class="shop-wishlist__empty">${escapeHtml(o.shared ? t('This list is empty.') : t('Your wishlist is empty.'))}${
      o.shared ? '' : ` ${escapeHtml(t('Save products with the heart on their page or card.'))}`
    }</p><p><a href="${o.prefix}/shop">${escapeHtml(t('Back to the shop'))}</a></p></div>`;
  }
  const counted = o.count === 1 ? t('1 product') : t('{n} products', { n: o.count });
  return `${head}<p class="shop-wishlist__count">${escapeHtml(counted)}</p>${o.cards}${o.share}</div>`;
}
