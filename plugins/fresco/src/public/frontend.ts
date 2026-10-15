/**
 * Fresco on the page: entrance animations, videos behind an image overlay,
 * the image lightbox, and the handlers of interactive widgets (tabs,
 * accordions, counters…), registered by name.
 */

type Handler = (element: HTMLElement) => void;

const handlers: Record<string, Handler> = {};

/** Registers the handler of a widget (`data-fr-handler="name"`). Fresco Pro adds its own. */
function register(name: string, handler: Handler): void {
  handlers[name] = handler;
  for (const element of document.querySelectorAll<HTMLElement>(`[data-fr-handler~="${name}"]`)) {
    run(element, name);
  }
}

function run(element: HTMLElement, name: string): void {
  const done = (element.dataset.frReady ?? '').split(' ');
  if (done.includes(name) || !handlers[name]) return;
  element.dataset.frReady = [...done, name].filter(Boolean).join(' ');
  try {
    handlers[name](element);
  } catch (error) {
    console.error(`Fresco: ${name} failed`, error);
  }
}

function start(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-fr-handler]')) {
    for (const name of (element.dataset.frHandler ?? '').split(/\s+/)) if (name) run(element, name);
  }
}

// ---- Entrance animations ------------------------------------------------------------

function animations(): void {
  const items = document.querySelectorAll<HTMLElement>('[data-fr-anim]');
  if (items.length === 0) return;
  const show = (element: HTMLElement) => {
    const delay = Number(element.dataset.frDelay ?? 0);
    const go = () => element.classList.add('fr-anim-in');
    if (delay > 0) setTimeout(go, delay);
    else go();
  };
  if (!('IntersectionObserver' in window)) {
    items.forEach(show);
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        show(entry.target as HTMLElement);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  items.forEach((item) => observer.observe(item));
}

// ---- Videos behind an image -----------------------------------------------------------

function videos(): void {
  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-fr-video]');
    if (!button) return;
    const src = button.dataset.frVideo ?? '';
    if (!/^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com)\//.test(src)) return;
    const frame = document.createElement('iframe');
    frame.src = src.includes('?') ? `${src}&autoplay=1` : `${src}?autoplay=1`;
    frame.title = button.getAttribute('aria-label') ?? 'Video';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    button.replaceWith(frame);
  });
}

// ---- Lightbox ---------------------------------------------------------------------------

function lightbox(): void {
  let dialog: HTMLDialogElement | null = null;
  let group: HTMLAnchorElement[] = [];
  let index = 0;
  const image = () => dialog!.querySelector('img')!;
  const show = (i: number) => {
    index = (i + group.length) % group.length;
    const link = group[index]!;
    image().src = link.href;
    image().alt = link.querySelector('img')?.alt ?? '';
    const caption = dialog!.querySelector('figcaption')!;
    caption.textContent = link.dataset.frCaption ?? '';
    dialog!
      .querySelectorAll<HTMLElement>('.fr-lb__nav')
      .forEach((b) => (b.hidden = group.length < 2));
  };
  const build = () => {
    dialog = document.createElement('dialog');
    dialog.className = 'fr-lb';
    dialog.innerHTML =
      '<figure><img alt=""><figcaption></figcaption></figure>' +
      '<button type="button" class="fr-lb__close" aria-label="Close">×</button>' +
      '<button type="button" class="fr-lb__nav fr-lb__prev" aria-label="Previous">‹</button>' +
      '<button type="button" class="fr-lb__nav fr-lb__next" aria-label="Next">›</button>';
    dialog.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.fr-lb__prev')) show(index - 1);
      else if (target.closest('.fr-lb__next')) show(index + 1);
      else if (target === dialog || target.closest('.fr-lb__close')) dialog!.close();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') show(index - 1);
      if (event.key === 'ArrowRight') show(index + 1);
    });
    document.body.append(dialog);
  };
  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
      'a[data-fr-lightbox]',
    );
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    if (!dialog) build();
    const name = link.dataset.frLightbox;
    group = name
      ? [
          ...document.querySelectorAll<HTMLAnchorElement>(
            `a[data-fr-lightbox="${CSS.escape(name)}"]`,
          ),
        ]
      : [link];
    show(group.indexOf(link));
    dialog!.showModal();
  });
}

// ---- Start --------------------------------------------------------------------------------

document.documentElement.classList.add('fr-js');
(window as unknown as { fresco: unknown }).fresco = { register, start };

const ready = () => {
  animations();
  videos();
  lightbox();
  start();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
else ready();
