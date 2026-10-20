/**
 * Product pictures enlarged in a window over the page, instead of the bare
 * file: a close button, Esc and a click outside the picture close it; arrows,
 * the arrow keys and a swipe move between the pictures of the product.
 * Without JavaScript the links still open the picture.
 */
const LINKS = '.shop-summary__main, .shop-gallery a';
const it = document.documentElement.lang.toLowerCase().startsWith('it');
const label = {
  close: it ? 'Chiudi' : 'Close',
  previous: it ? 'Immagine precedente' : 'Previous picture',
  next: it ? 'Immagine successiva' : 'Next picture',
  dialog: it ? 'Immagini del prodotto' : 'Product pictures',
};

function button(className: string, text: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  b.title = title;
  b.setAttribute('aria-label', title);
  return b;
}

function open(links: HTMLAnchorElement[], start: number): void {
  let index = start;
  const dialog = document.createElement('dialog');
  dialog.className = 'shop-lightbox';
  dialog.setAttribute('aria-label', label.dialog);
  const image = document.createElement('img');
  image.className = 'shop-lightbox__image';
  const close = button('shop-lightbox__close', '×', label.close);
  const prev = button('shop-lightbox__nav shop-lightbox__nav--prev', '‹', label.previous);
  const next = button('shop-lightbox__nav shop-lightbox__nav--next', '›', label.next);
  const count = document.createElement('p');
  count.className = 'shop-lightbox__count';
  dialog.append(image, close, count);
  if (links.length > 1) dialog.append(prev, next);

  const show = (i: number) => {
    index = (i + links.length) % links.length;
    const link = links[index]!;
    image.src = link.href;
    image.alt = link.querySelector('img')?.alt ?? '';
    count.textContent = links.length > 1 ? `${index + 1} / ${links.length}` : '';
  };
  const shut = () => dialog.close();

  close.addEventListener('click', shut);
  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  // A click on the dark area around the picture closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) shut();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });
  // Swipe on phones.
  let startX: number | null = null;
  dialog.addEventListener('touchstart', (event) => {
    startX = event.touches[0]?.clientX ?? null;
  });
  dialog.addEventListener('touchend', (event) => {
    const endX = event.changedTouches[0]?.clientX;
    if (startX !== null && endX !== undefined && Math.abs(endX - startX) > 50 && links.length > 1) {
      show(endX < startX ? index + 1 : index - 1);
    }
    startX = null;
  });
  // Esc closes the dialog natively; then it is removed and the focus goes back.
  dialog.addEventListener('close', () => {
    dialog.remove();
    links[index]?.focus();
  });

  show(start);
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
}

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(LINKS);
  if (!link || typeof HTMLDialogElement !== 'function') return;
  // The pictures of the same product: the main one and the gallery next to it.
  const scope = link.closest('.shop-summary') ?? link.closest('.shop-gallery') ?? document;
  const links = [...scope.querySelectorAll<HTMLAnchorElement>(LINKS)].filter(
    (a, i, all) => all.findIndex((b) => b.href === a.href) === i,
  );
  event.preventDefault();
  open(
    links,
    Math.max(
      0,
      links.findIndex((a) => a.href === link.href),
    ),
  );
});
