/**
 * The catalog's "Load more" button (Cleishop 1.21): fetches the next page
 * and adds its product cards to the grid, then takes that page's button (or
 * none on the last page). Without JavaScript the button is a link to the
 * next page.
 */
async function more(link: HTMLAnchorElement): Promise<void> {
  const holder = link.closest('.shop-more') as HTMLElement | null;
  const grid = document.querySelector<HTMLElement>('.shop-catalog .shop-grid');
  if (!holder || !grid) {
    window.location.href = link.href;
    return;
  }
  holder.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(link.href, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(String(response.status));
    const next = new DOMParser().parseFromString(await response.text(), 'text/html');
    const cards = next.querySelectorAll('.shop-catalog .shop-grid > li');
    const first = cards[0] as HTMLElement | undefined;
    for (const card of Array.from(cards)) grid.appendChild(document.importNode(card, true));
    const nextLink = next.querySelector<HTMLAnchorElement>('[data-shop-more]');
    if (nextLink) {
      link.href = nextLink.getAttribute('href') ?? link.href;
      holder.removeAttribute('aria-busy');
    } else holder.remove();
    // The first new card's link takes the focus, for keyboards and screen readers.
    const focus = first
      ? grid.querySelector<HTMLElement>(
          `[data-product="${first.dataset.product ?? ''}"] .shop-card__title a`,
        )
      : null;
    focus?.focus();
  } catch {
    window.location.href = link.href;
  }
}

document.addEventListener('click', (event) => {
  const target = event.target as Element | null;
  const link = target?.closest?.('a[data-shop-more]') as HTMLAnchorElement | null;
  if (!link || event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  void more(link);
});
