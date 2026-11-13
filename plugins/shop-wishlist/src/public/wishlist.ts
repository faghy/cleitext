/**
 * The Wishlist's hearts, added in the browser so pages stay cached for
 * everyone: on Cleishop's product cards and buy box (`data-product`), the
 * count in wishlist links (`data-wishlist-count`), and «Copy the link».
 */
(() => {
  const lang = (document.documentElement.lang || 'en').toLowerCase();
  const it = lang.startsWith('it');
  const text = {
    add: it ? 'Aggiungi alla lista desideri' : 'Add to wishlist',
    remove: it ? 'Rimuovi dalla lista desideri' : 'Remove from wishlist',
    saved: it ? 'Nella lista desideri' : 'In your wishlist',
    copied: it ? 'Link copiato' : 'Link copied',
  };
  // The language prefix of the page (`/it`), when the address has one.
  const match = /^\/([a-z]{2,3}(?:-[a-z]{2,4})?)(\/|$)/i.exec(location.pathname);
  const prefix = match && match[1]!.toLowerCase() === lang ? `/${match[1]}` : '';
  const onListPage = Boolean(document.querySelector('[data-wishlist].shop-wishlist'));

  const style = document.createElement('style');
  style.textContent = `
.shop-wishlist-heart{display:inline-flex;align-items:center;gap:.4rem;border:0;border-radius:3px;background:#333;color:#fff;font:inherit;font-size:.9em;padding:.5rem .9rem;cursor:pointer;margin:.6rem 0 0}
.shop-wishlist-heart[aria-pressed="true"] .shop-wishlist-heart__icon{color:#ff6b81}
.shop-card .shop-wishlist-heart{position:absolute;top:.5rem;right:.5rem;margin:0;padding:.35rem .5rem;border-radius:50%;line-height:1;font-size:1.1em;background:rgba(51,51,51,.85)}
.shop-card .shop-wishlist-heart__label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.shop-wishlist-link__count:empty{display:none}
`;
  document.head.appendChild(style);

  let saved = new Set<string>();

  const setCount = (count: number) => {
    document.querySelectorAll<HTMLElement>('[data-wishlist-count]').forEach((el) => {
      el.textContent = count ? String(count) : '';
    });
  };

  const paint = (button: HTMLButtonElement, id: string) => {
    const on = saved.has(id);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.title = on ? text.remove : text.add;
    const label = button.querySelector('.shop-wishlist-heart__label');
    if (label) label.textContent = on ? text.saved : text.add;
    const icon = button.querySelector('.shop-wishlist-heart__icon');
    if (icon) icon.textContent = on ? '♥' : '♡';
  };

  const toggle = async (button: HTMLButtonElement, id: string, card: Element | null) => {
    button.disabled = true;
    try {
      const response = await fetch(`${prefix}/wishlist/toggle`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ product: id }),
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const result = (await response.json()) as { saved: boolean; count: number };
      if (result.saved) saved.add(id);
      else saved.delete(id);
      paint(button, id);
      setCount(result.count);
      // On the list itself, a product taken out leaves the page.
      if (onListPage && !result.saved && card) card.remove();
    } finally {
      button.disabled = false;
    }
  };

  const decorate = () => {
    document.querySelectorAll<HTMLElement>('[data-product]').forEach((el) => {
      if (el.dataset.wishlistReady) return;
      const id = el.dataset.product!;
      el.dataset.wishlistReady = '1';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shop-wishlist-heart';
      button.innerHTML =
        '<span class="shop-wishlist-heart__icon" aria-hidden="true">♡</span><span class="shop-wishlist-heart__label"></span>';
      paint(button, id);
      button.addEventListener('click', () => void toggle(button, id, el.closest('.shop-card')));
      // Below the add to cart of a product's page; on a card's picture.
      const form = el.querySelector('.shop-buy__form');
      if (form) form.insertAdjacentElement('afterend', button);
      else el.appendChild(button);
    });
  };

  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      '[data-wishlist-copy]',
    );
    if (!button) return;
    void navigator.clipboard?.writeText(button.dataset.wishlistCopy ?? '').then(() => {
      button.textContent = text.copied;
    });
  });

  // Shared lists are read-only: no hearts there.
  if (document.querySelector('[data-wishlist-shared]')) return;
  fetch(`${prefix}/wishlist/state`, { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : { count: 0, ids: [] }))
    .then((state: { count: number; ids: string[] }) => {
      saved = new Set(state.ids);
      setCount(state.count);
      decorate();
    })
    .catch(() => decorate());
})();
