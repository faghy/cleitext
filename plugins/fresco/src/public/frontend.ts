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

// ---- Widgets ----------------------------------------------------------------------------

/** Runs once when the element comes into view. */
function whenVisible(element: Element, run: () => void): void {
  if (!('IntersectionObserver' in window)) return run();
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      observer.disconnect();
      run();
    }
  });
  observer.observe(element);
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

register('tabs', (root) => {
  const titles = [
    ...root.querySelectorAll<HTMLElement>(':scope > .fr-tabs__nav > .fr-tabs__title'),
  ];
  const panels = [
    ...root.querySelectorAll<HTMLElement>(':scope > .fr-tabs__panels > .fr-tabs__panel'),
  ];
  const show = (index: number, focus = false) => {
    titles.forEach((t, i) => {
      t.setAttribute('aria-selected', String(i === index));
      t.tabIndex = i === index ? 0 : -1;
    });
    panels.forEach((p, i) => {
      p.hidden = i !== index;
      p.querySelector('.fr-tabs__mobile-title')?.setAttribute('aria-expanded', String(i === index));
    });
    if (focus) titles[index]?.focus();
  };
  root.addEventListener('click', (event) => {
    const tab = (event.target as Element).closest<HTMLElement>('[data-fr-tab]');
    if (!tab || tab.closest('.fr-tabs') !== root) return;
    show(Number(tab.dataset.frTab));
  });
  root.querySelector(':scope > .fr-tabs__nav')?.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    const current = titles.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const next =
      key === 'ArrowRight' || key === 'ArrowDown'
        ? (current + 1) % titles.length
        : key === 'ArrowLeft' || key === 'ArrowUp'
          ? (current - 1 + titles.length) % titles.length
          : key === 'Home'
            ? 0
            : key === 'End'
              ? titles.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    show(next, true);
  });
  // A link to #id of an element inside a tab opens that tab.
  const fromHash = () => {
    const target =
      location.hash.length > 1
        ? document.getElementById(decodeURIComponent(location.hash.slice(1)))
        : null;
    const index = target ? panels.findIndex((p) => p.contains(target)) : -1;
    if (index >= 0) show(index);
  };
  fromHash();
  addEventListener('hashchange', fromHash);
});

register('counter', (root) => {
  const value = root.querySelector<HTMLElement>('.fr-counter__value');
  if (!value) return;
  const from = Number(value.dataset.frFrom ?? 0);
  const to = Number(value.dataset.frTo ?? 0);
  const duration = Number(value.dataset.frDuration ?? 2000);
  const locale = value.dataset.frSeparator;
  const decimals = (String(to).split('.')[1] ?? '').length;
  const format = (n: number) =>
    locale
      ? new Intl.NumberFormat(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(n)
      : n.toFixed(decimals);
  if (reduced() || duration <= 0) return;
  value.textContent = format(from);
  whenVisible(root, () => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      value.textContent = format(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
});

register('progress', (root) => {
  const fill = root.querySelector<HTMLElement>('.fr-progress__fill');
  if (fill) whenVisible(root, () => fill.classList.add('is-in'));
});

register('alert', (root) => {
  root.querySelector('[data-fr-close]')?.addEventListener('click', () => {
    root.hidden = true;
  });
});

register('carousel', (root) => {
  const track = root.querySelector<HTMLElement>('.fr-carousel__track');
  if (!track) return;
  const slides = [...track.children] as HTMLElement[];
  const dots = root.querySelector<HTMLElement>('[data-fr-dots]');
  const loop = root.hasAttribute('data-fr-loop');
  const perView = () =>
    Math.max(1, Math.round(track.clientWidth / (slides[0]?.clientWidth || track.clientWidth)));
  const pages = () => Math.max(1, slides.length - perView() + 1);
  const index = () =>
    Math.round(
      track.scrollLeft /
        ((slides[0]?.offsetWidth ?? 1) + parseFloat(getComputedStyle(track).columnGap || '0')),
    );
  const go = (i: number) => {
    const count = pages();
    const target = loop ? (i + count) % count : Math.max(0, Math.min(count - 1, i));
    track.scrollTo({
      left: slides[target]?.offsetLeft ?? 0,
      behavior: reduced() ? 'auto' : 'smooth',
    });
  };
  const drawDots = () => {
    if (!dots) return;
    const count = pages();
    if (dots.childElementCount !== count) {
      dots.replaceChildren(
        ...Array.from({ length: count }, (_, i) => {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'fr-carousel__dot';
          dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
          dot.addEventListener('click', () => go(i));
          return dot;
        }),
      );
    }
    const current = Math.min(index(), count - 1);
    [...dots.children].forEach((dot, i) => dot.setAttribute('aria-current', String(i === current)));
  };
  root.querySelector('[data-fr-prev]')?.addEventListener('click', () => go(index() - 1));
  root.querySelector('[data-fr-next]')?.addEventListener('click', () => go(index() + 1));
  track.addEventListener('scroll', () => requestAnimationFrame(drawDots), { passive: true });
  addEventListener('resize', drawDots);
  drawDots();
  const interval = Number(root.dataset.frAutoplay);
  if (interval > 0 && !reduced()) {
    let paused = false;
    if (root.hasAttribute('data-fr-pause')) {
      root.addEventListener('pointerenter', () => (paused = true));
      root.addEventListener('pointerleave', () => (paused = false));
      root.addEventListener('focusin', () => (paused = true));
      root.addEventListener('focusout', () => (paused = false));
    }
    setInterval(() => {
      if (!paused && !document.hidden) go(index() + 1);
    }, interval);
  }
});

register('menu', (root) => {
  const toggle = root.querySelector<HTMLElement>('[data-fr-toggle]');
  toggle?.addEventListener('click', () => {
    const open = root.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-fr-expand]');
    if (!button) return;
    const item = button.closest('.fr-menu__item');
    const open = item?.classList.toggle('is-open') ?? false;
    button.setAttribute('aria-expanded', String(open));
  });
  root.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key !== 'Escape') return;
    root.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
  });
});

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
