/**
 * The Social feed block in the browser: "Load more", the carousel's arrows,
 * the lightbox, and the pictures that wait for consent when they come from
 * Meta's servers. Without JavaScript the posts stay links to the originals.
 */
const it = document.documentElement.lang.toLowerCase().startsWith('it');
const label = {
  close: it ? 'Chiudi' : 'Close',
  previous: it ? 'Post precedente' : 'Previous post',
  next: it ? 'Post successivo' : 'Next post',
  open: (network: string) => (it ? `Apri su ${network}` : `Open on ${network}`),
};

interface Consent {
  categories?: string[];
}

/**
 * Pictures from Meta's servers: shown once their category is accepted, or at
 * once on sites without the consent banner (the Privacy & GDPR plugin puts
 * `#cx-consent` in the page, whatever the order the scripts run in).
 */
function showPictures(): void {
  const banner = document.getElementById('cx-consent');
  const consent = (window as unknown as { cleitextConsent?: Consent }).cleitextConsent;
  const accepted = consent?.categories ?? [];
  document.querySelectorAll<HTMLImageElement>('.cx-sfeed img[data-cx-src]').forEach((image) => {
    const category = image.getAttribute('data-cx-category') ?? '';
    if (banner && !accepted.includes(category)) return;
    image.src = image.getAttribute('data-cx-src') ?? '';
    image.removeAttribute('data-cx-src');
    image.parentElement?.querySelector('[data-cx-sfeed-consent]')?.remove();
  });
}

function setUpMore(feed: HTMLElement): void {
  const button = feed.querySelector<HTMLButtonElement>('[data-cx-sfeed-more]');
  if (!button) return;
  const step = Number(feed.getAttribute('data-step')) || 9;
  const box = button.parentElement!;
  box.hidden = false;
  button.addEventListener('click', () => {
    const hidden = [...feed.querySelectorAll<HTMLElement>('.cx-sfeed__item[hidden]')];
    hidden.slice(0, step).forEach((item) => (item.hidden = false));
    hidden[0]?.querySelector<HTMLElement>('a')?.focus();
    if (hidden.length <= step) box.remove();
  });
}

function setUpCarousel(feed: HTMLElement): void {
  const nav = feed.querySelector<HTMLElement>('.cx-sfeed__nav');
  const track = feed.querySelector<HTMLElement>('.cx-sfeed__items');
  if (!nav || !track) return;
  nav.hidden = false;
  const prev = nav.querySelector<HTMLButtonElement>('[data-cx-sfeed-prev]')!;
  const next = nav.querySelector<HTMLButtonElement>('[data-cx-sfeed-next]')!;
  const update = () => {
    prev.disabled = track.scrollLeft <= 1;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
  };
  const move = (direction: number) =>
    track.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' });
  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  track.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

function button(className: string, text: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  b.setAttribute('aria-label', title);
  return b;
}

function openLightbox(links: HTMLAnchorElement[], start: number, opener: HTMLElement): void {
  let index = start;
  const dialog = document.createElement('dialog');
  dialog.className = 'cx-sfeed-lightbox';
  const body = document.createElement('div');
  body.className = 'cx-sfeed-lightbox__body';
  const media = document.createElement('div');
  media.className = 'cx-sfeed-lightbox__media';
  const side = document.createElement('div');
  side.className = 'cx-sfeed-lightbox__side';
  body.append(media, side);
  const close = button('cx-sfeed-lightbox__close', '×', label.close);
  const prev = button('cx-sfeed-lightbox__nav cx-sfeed-lightbox__nav--prev', '‹', label.previous);
  const next = button('cx-sfeed-lightbox__nav cx-sfeed-lightbox__nav--next', '›', label.next);
  dialog.append(body, close);
  if (links.length > 1) media.append(prev, next);
  media.style.position = 'relative';

  const show = (i: number) => {
    index = (i + links.length) % links.length;
    const link = links[index]!;
    const network = link.getAttribute('data-network') ?? '';
    media.querySelector('img')?.remove();
    const src = link.getAttribute('data-image');
    const thumb = link.querySelector('img');
    // A picture still waiting for consent is not loaded here either.
    if (src && thumb && !thumb.hasAttribute('data-cx-src')) {
      const image = document.createElement('img');
      image.src = src;
      image.alt = thumb.alt;
      media.prepend(image);
    }
    side.replaceChildren();
    const caption = link.getAttribute('data-text') ?? '';
    if (caption) {
      const p = document.createElement('p');
      p.className = 'cx-sfeed-lightbox__caption';
      p.textContent = caption;
      side.append(p);
    }
    const info = [link.getAttribute('data-date'), link.getAttribute('data-info')]
      .filter(Boolean)
      .join(' · ');
    if (info) {
      const p = document.createElement('p');
      p.className = 'cx-sfeed-lightbox__info';
      p.textContent = info;
      side.append(p);
    }
    const original = document.createElement('a');
    original.href = link.href;
    original.target = '_blank';
    original.rel = 'noopener';
    original.textContent = `${label.open(network)} →`;
    side.append(original);
    dialog.setAttribute('aria-label', caption.slice(0, 80) || network);
  };
  const shut = () => dialog.close();

  close.addEventListener('click', shut);
  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) shut();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });
  let touchX: number | null = null;
  media.addEventListener('touchstart', (e) => (touchX = e.touches[0]?.clientX ?? null), {
    passive: true,
  });
  media.addEventListener('touchend', (e) => {
    const end = e.changedTouches[0]?.clientX;
    if (touchX !== null && end !== undefined && Math.abs(end - touchX) > 40)
      show(index + (end < touchX ? 1 : -1));
    touchX = null;
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    opener.focus();
  });
  show(index);
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
}

function setUpLightbox(feed: HTMLElement): void {
  if (!feed.hasAttribute('data-lightbox') || typeof HTMLDialogElement !== 'function') return;
  feed.addEventListener('click', (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a.cx-sfeed__link');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    const links = [
      ...feed.querySelectorAll<HTMLAnchorElement>('.cx-sfeed__item:not([hidden]) a.cx-sfeed__link'),
    ];
    openLightbox(links, Math.max(0, links.indexOf(link)), link);
  });
}

function start(): void {
  document.querySelectorAll<HTMLElement>('[data-cx-sfeed]').forEach((feed) => {
    setUpMore(feed);
    setUpCarousel(feed);
    setUpLightbox(feed);
  });
  showPictures();
  document.addEventListener('cleitext:consent', showPictures);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

// A module for TypeScript (the tests import it); the build makes it a plain script.
export {};
