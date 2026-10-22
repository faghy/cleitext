/**
 * Fresco on the page: entrance animations, videos behind an image overlay,
 * the image lightbox, and the handlers of interactive widgets (tabs,
 * accordions, counters…), registered by name.
 */

import { uiText } from '../core/ui-text.js';

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

/** The device in use, as the kit's stylesheet says (`--fr-device`). */
function currentDevice(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--fr-device').trim();
  return /^[a-z_]{3,20}$/.test(value) ? value : 'desktop';
}

/** Smaller devices from the widest: each inherits from the larger ones, then desktop. */
const MAX_WIDTH_DEVICES = ['laptop', 'tablet_extra', 'tablet', 'mobile_extra', 'mobile'];

/**
 * The entrance animation of an element on a device: its own
 * (`data-fr-anim-<device>`), else the nearest larger device's, else desktop's.
 */
function animationFor(element: HTMLElement, device: string): string {
  const index = MAX_WIDTH_DEVICES.indexOf(device);
  const chain =
    device === 'widescreen'
      ? ['widescreen']
      : index >= 0
        ? MAX_WIDTH_DEVICES.slice(0, index + 1).reverse()
        : [];
  for (const name of chain) {
    const value = element.getAttribute(`data-fr-anim-${name}`);
    if (value !== null) return value;
  }
  return element.dataset.frAnim ?? '';
}

function animations(): void {
  const device = currentDevice();
  const items = [...document.querySelectorAll<HTMLElement>('[data-fr-anim]')].filter((element) => {
    const name = animationFor(element, device);
    if (name && name !== 'none') {
      element.dataset.frAnim = name;
      return true;
    }
    // No animation on this device: shown as it is.
    element.classList.remove('fr-anim');
    element.removeAttribute('data-fr-anim');
    return false;
  });
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

/** Background videos from YouTube or Vimeo: their 16:9 frame covers the container. */
function backgroundEmbeds(): void {
  const boxes = document.querySelectorAll<HTMLElement>('[data-fr-video-bg]');
  if (boxes.length === 0) return;
  const fit = () => {
    for (const box of boxes) {
      const frame = box.querySelector('iframe');
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (!frame || !width || !height) continue;
      const wide = width / height > 16 / 9;
      frame.style.width = `${Math.ceil(wide ? width : (height * 16) / 9)}px`;
      frame.style.height = `${Math.ceil(wide ? (width * 9) / 16 : height)}px`;
    }
  };
  fit();
  window.addEventListener('resize', fit);
  // The frame shows once the video plays: until then (and if it never does,
  // e.g. autoplay blocked) the background image stays visible, not a black box.
  const frames = [...boxes]
    .map((box) => box.querySelector('iframe'))
    .filter(Boolean) as HTMLIFrameElement[];
  for (const frame of frames) {
    if (!/youtube/.test(frame.src)) {
      frame.addEventListener('load', () => frame.classList.add('is-playing'));
      continue;
    }
    frame.addEventListener('load', () => {
      frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: frame.src }), '*');
    });
  }
  window.addEventListener('message', (event) => {
    if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(event.origin)) return;
    let data: { event?: string; info?: unknown } | null;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    const info = data?.info as { playerState?: number } | number | undefined;
    const playing =
      (data?.event === 'onStateChange' && info === 1) ||
      (data?.event === 'infoDelivery' && typeof info === 'object' && info?.playerState === 1);
    if (!playing) return;
    for (const frame of frames) {
      if (frame.contentWindow === event.source) frame.classList.add('is-playing');
    }
  });
}

/** The player of a video behind an image: a frame (YouTube, Vimeo, Dailymotion) or a video file. */
function videoPlayer(button: HTMLElement): HTMLElement | null {
  const src = button.dataset.frVideo ?? '';
  if (button.dataset.frVideoKind === 'file') {
    if (!/^(https?:\/\/|\/(?!\/))[^\s"'<>]*$/.test(src)) return null;
    const player = document.createElement('video');
    player.src = src;
    player.controls = true;
    player.autoplay = true;
    player.playsInline = true;
    return player;
  }
  if (
    !/^https:\/\/(www\.youtube-nocookie\.com|www\.youtube\.com|player\.vimeo\.com|www\.dailymotion\.com)\//.test(
      src,
    )
  ) {
    return null;
  }
  const frame = document.createElement('iframe');
  const [address, hash] = src.split('#');
  const play = address!.includes('?') ? `${address}&autoplay=1` : `${address}?autoplay=1`;
  frame.src = hash ? `${play}#${hash}` : play;
  frame.title = button.getAttribute('aria-label') ?? 'Video';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  return frame;
}

/** A video in a lightbox over the page (the colors and width come from the element's settings). */
function videoLightbox(button: HTMLElement, player: HTMLElement): void {
  const root = button.closest<HTMLElement>('.fr-video') ?? button;
  const style = getComputedStyle(root);
  const dialog = document.createElement('dialog');
  dialog.className = 'fr-lb fr-lb--video';
  const background = style.getPropertyValue('--fr-video-lb-bg').trim();
  const width = style.getPropertyValue('--fr-video-lb-width').trim();
  if (background) dialog.style.setProperty('--fr-lb-bg', background);
  if (width) dialog.style.setProperty('--fr-lb-video-width', width);
  const frame = document.createElement('div');
  frame.className = 'fr-lb__video';
  frame.style.aspectRatio = getComputedStyle(button.parentElement ?? button).aspectRatio;
  frame.append(player);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'fr-lb__close';
  close.setAttribute('aria-label', uiText(document.documentElement.lang, 'Close'));
  close.textContent = '×';
  dialog.append(frame, close);
  dialog.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target === dialog || target.closest('.fr-lb__close')) dialog.close();
  });
  // Closing stops the video.
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function videos(): void {
  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-fr-video]');
    if (!button) return;
    const player = videoPlayer(button);
    if (!player) return;
    if (button.hasAttribute('data-fr-video-lightbox')) videoLightbox(button, player);
    else button.replaceWith(player);
  });
}

// ---- Lightbox ---------------------------------------------------------------------------

/** An option of the lightbox from Site settings (`--fr-lb-<name>` on the page's root). */
function lightboxOption(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--fr-lb-${name}`).trim();
}

const IMAGE_FILE = /\.(jpe?g|png|gif|webp|avif|svg)(\?[^#]*)?$/i;

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
    // Site settings → Lightbox: the caption, the image's alternative text, or nothing.
    const source = lightboxOption('caption');
    caption.textContent =
      source === 'none'
        ? ''
        : source === 'alt'
          ? (link.querySelector('img')?.alt ?? '')
          : (link.dataset.frCaption ?? '');
    dialog!
      .querySelectorAll<HTMLElement>('.fr-lb__nav')
      .forEach((b) => (b.hidden = group.length < 2));
    const counter = dialog!.querySelector<HTMLElement>('.fr-lb__counter');
    if (counter) counter.textContent = group.length > 1 ? `${index + 1} / ${group.length}` : '';
    const download = dialog!.querySelector<HTMLAnchorElement>('.fr-lb__download');
    if (download) download.href = link.href;
    dialog!.querySelector('figure')?.classList.remove('is-zoomed');
  };
  const icon = (path: string) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  const build = () => {
    dialog = document.createElement('dialog');
    dialog.className = 'fr-lb';
    // The labels in the page's language.
    const lang = document.documentElement.lang;
    // The counter and the toolbar only when Site settings switch them on.
    const on = (name: string) => lightboxOption(name) === '1';
    const tools = [
      on('zoom') &&
        `<button type="button" class="fr-lb__tool fr-lb__zoom" aria-label="${uiText(lang, 'Zoom')}">${icon('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3 M11 8v6 M8 11h6')}</button>`,
      on('fullscreen') &&
        `<button type="button" class="fr-lb__tool fr-lb__full" aria-label="${uiText(lang, 'Fullscreen')}">${icon('M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5')}</button>`,
      on('download') &&
        `<a class="fr-lb__tool fr-lb__download" download aria-label="${uiText(lang, 'Download')}">${icon('M12 4v12 M7 11l5 5 5-5 M5 20h14')}</a>`,
    ].filter(Boolean);
    dialog.innerHTML =
      '<figure><img alt=""><figcaption></figcaption></figure>' +
      (on('counter') ? '<span class="fr-lb__counter"></span>' : '') +
      (tools.length ? `<div class="fr-lb__tools">${tools.join('')}</div>` : '') +
      `<button type="button" class="fr-lb__close" aria-label="${uiText(lang, 'Close')}">×</button>` +
      `<button type="button" class="fr-lb__nav fr-lb__prev" aria-label="${uiText(lang, 'Previous')}">‹</button>` +
      `<button type="button" class="fr-lb__nav fr-lb__next" aria-label="${uiText(lang, 'Next')}">›</button>`;
    dialog.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.fr-lb__prev')) show(index - 1);
      else if (target.closest('.fr-lb__next')) show(index + 1);
      else if (target.closest('.fr-lb__zoom') || target.closest('figure.is-zoomed'))
        dialog!.querySelector('figure')?.classList.toggle('is-zoomed');
      else if (target.closest('.fr-lb__full')) {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void dialog!.requestFullscreen?.();
      } else if (target === dialog || target.closest('.fr-lb__close')) dialog!.close();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') show(index - 1);
      if (event.key === 'ArrowRight') show(index + 1);
    });
    dialog.addEventListener('close', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
    });
    document.body.append(dialog);
  };
  document.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target as Element | null;
    let link = target?.closest<HTMLAnchorElement>('a[data-fr-lightbox]') ?? null;
    let images: HTMLAnchorElement[] | null = null;
    // Site settings → Lightbox: links of Fresco elements to an image file open here too.
    if (!link) {
      const plain = target?.closest<HTMLAnchorElement>('.fr-e a[href]');
      if (
        !plain ||
        plain.hasAttribute('download') ||
        !IMAGE_FILE.test(new URL(plain.href, location.href).pathname) ||
        lightboxOption('images') !== '1'
      )
        return;
      link = plain;
      const owner = plain.closest('.fr-e');
      images = [...(owner?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])].filter(
        (a) => !a.dataset.frLightbox && IMAGE_FILE.test(new URL(a.href, location.href).pathname),
      );
    }
    event.preventDefault();
    if (!dialog) build();
    const name = link.dataset.frLightbox;
    group =
      images ??
      (name
        ? [
            ...document.querySelectorAll<HTMLAnchorElement>(
              `a[data-fr-lightbox="${CSS.escape(name)}"]`,
            ),
          ]
        : [link]);
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
  // A separator of its own: the number in English, its commas replaced.
  const char = root.dataset.frSeparatorChar;
  const decimals = (String(to).split('.')[1] ?? '').length;
  const format = (n: number) =>
    locale
      ? new Intl.NumberFormat(char ? 'en-US' : locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
          .format(n)
          .replace(/,/g, char ?? ',')
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
  const fraction = root.querySelector<HTMLElement>('[data-fr-fraction]');
  const progress = root.querySelector<HTMLElement>('[data-fr-progress] > span');
  const loop = root.hasAttribute('data-fr-loop');
  const fade = root.dataset.frEffect === 'fade';
  const speed = Number(root.dataset.frSpeed) || 0;
  let autoplay = true;
  // Fade: one slide at a time, the current one marked.
  let shown = 0;
  const perView = () =>
    fade
      ? 1
      : Math.max(1, Math.round(track.clientWidth / (slides[0]?.clientWidth || track.clientWidth)));
  /** Slides to scroll (`--fr-per-scroll`, per device), 1 by default. */
  const step = () =>
    fade
      ? 1
      : Math.max(
          1,
          Math.round(Number(getComputedStyle(track).getPropertyValue('--fr-per-scroll')) || 1),
        );
  const pages = () => (fade ? slides.length : Math.max(1, slides.length - perView() + 1));
  const index = () =>
    fade
      ? shown
      : Math.round(
          track.scrollLeft /
            ((slides[0]?.offsetWidth ?? 1) + parseFloat(getComputedStyle(track).columnGap || '0')),
        );
  /** Scrolls the track in `speed` ms (the browser's smooth scroll has its own speed). */
  const glide = (left: number) => {
    const from = track.scrollLeft;
    const started = performance.now();
    const snap = track.style.scrollSnapType;
    track.style.scrollSnapType = 'none';
    track.style.scrollBehavior = 'auto';
    const frame = (now: number) => {
      const t = Math.min(1, (now - started) / speed);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      track.scrollLeft = from + (left - from) * eased;
      if (t < 1) requestAnimationFrame(frame);
      else {
        track.style.scrollSnapType = snap;
        track.style.scrollBehavior = '';
      }
    };
    requestAnimationFrame(frame);
  };
  const go = (i: number) => {
    const count = pages();
    let target = loop ? (i + count) % count : Math.max(0, Math.min(count - 1, i));
    // Several at a time: the last page before going back to the first.
    if (loop && step() > 1 && i >= count && index() < count - 1) target = count - 1;
    if (loop && step() > 1 && i < 0 && index() > 0) target = 0;
    if (fade) {
      shown = target;
      slides.forEach((slide, n) => slide.classList.toggle('is-active', n === target));
      drawDots();
      return;
    }
    const left = slides[target]?.offsetLeft ?? 0;
    if (speed > 0 && !reduced()) glide(left);
    else track.scrollTo({ left, behavior: reduced() ? 'auto' : 'smooth' });
  };
  const drawDots = () => {
    const count = pages();
    const current = Math.min(index(), count - 1);
    if (fraction) fraction.textContent = `${current + 1} / ${count}`;
    if (progress) progress.style.width = `${((current + 1) / count) * 100}%`;
    if (!dots) return;
    const n = step();
    const bullets = n > 1 ? Math.ceil((count - 1) / n) + 1 : count;
    if (dots.childElementCount !== bullets) {
      dots.replaceChildren(
        ...Array.from({ length: bullets }, (_, i) => {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'fr-carousel__dot';
          dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
          dot.addEventListener('click', () => {
            interacted();
            go(Math.min(i * n, count - 1));
          });
          return dot;
        }),
      );
    }
    const active = n > 1 ? (current >= count - 1 ? bullets - 1 : Math.round(current / n)) : current;
    [...dots.children].forEach((dot, i) => dot.setAttribute('aria-current', String(i === active)));
  };
  // "Pause on interaction": autoplay stops once the visitor moves the carousel.
  const interacted = () => {
    if (root.hasAttribute('data-fr-pause-interaction')) autoplay = false;
  };
  root.querySelector('[data-fr-prev]')?.addEventListener('click', () => {
    interacted();
    go(index() - step());
  });
  root.querySelector('[data-fr-next]')?.addEventListener('click', () => {
    interacted();
    go(index() + step());
  });
  track.addEventListener('pointerdown', interacted, { passive: true });
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
      if (autoplay && !paused && !document.hidden) go(index() + step());
    }, interval);
  }
});

/** Galleries in random order: their images shuffled on each visit. */
register('shuffle', (root) => {
  const grid = root.querySelector<HTMLElement>('.fr-gallery');
  if (!grid) return;
  const items = [...grid.children];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  grid.append(...items);
});

/** Text paths drawn on an SVG file's first path. */
register('text-path', (root) => {
  const url = root.dataset.frPath ?? '';
  const path = root.querySelector<SVGPathElement>('.fr-text-path__line');
  const svg = root.querySelector<SVGSVGElement>('svg');
  if (!path || !svg || !/^(https?:\/\/|\/(?!\/))[^\s"'<>]*$/.test(url)) return;
  fetch(url)
    .then((response) => (response.ok ? response.text() : ''))
    .then((text) => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const source = doc.querySelector('path');
      const d = source?.getAttribute('d');
      if (!d) return;
      path.setAttribute('d', d);
      const box = doc.documentElement.getAttribute('viewBox');
      if (box && /^[\d.\s,-]+$/.test(box)) svg.setAttribute('viewBox', box);
    })
    .catch(() => undefined);
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

/**
 * Floating buttons: shown after their delay, fixed to the window (out of any
 * transformed parent), and the button opening the others or the chat box.
 */
register('floating-buttons', (root) => {
  const box = root.querySelector<HTMLElement>('.fr-fab');
  if (!box) return;
  const delay = Number(root.dataset.frFabDelay) || 0;
  if (delay > 0) setTimeout(() => (box.hidden = false), Math.min(delay, 120) * 1000);
  document.body.append(root);
  const toggle = box.querySelector<HTMLButtonElement>('.fr-fab__toggle');
  const panel = document.getElementById(toggle?.getAttribute('aria-controls') ?? '');
  const set = (open: boolean) => {
    toggle?.setAttribute('aria-expanded', String(open));
    if (panel) panel.hidden = !open;
  };
  toggle?.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  box.querySelector('[data-fr-fab-close]')?.addEventListener('click', () => {
    set(false);
    toggle?.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') {
      set(false);
      toggle.focus();
    }
  });
});

/** Background slideshows of containers: one image at a time, with an optional Ken Burns zoom. */
register('bg-slideshow', (root) => {
  const slides = [...root.children] as HTMLElement[];
  const load = (slide: HTMLElement | undefined) => {
    const image = slide?.firstElementChild as HTMLElement | null | undefined;
    const url = image?.dataset.frBg;
    if (!image || !url) return;
    image.style.backgroundImage = `url("${url.replace(/["\\]/g, '')}")`;
    delete image.dataset.frBg;
  };
  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    load(slides[0]);
    load(slides[1]);
    if (slides.length < 2) return;
    const duration = Math.max(Number(root.dataset.frDuration) || 5000, 500);
    const speed = Number(root.dataset.frSpeed) || 0;
    const loop = root.dataset.frLoop !== 'no';
    let index = 0;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const next = index + 1 < slides.length ? index + 1 : loop ? 0 : -1;
      if (next < 0) {
        clearInterval(timer);
        return;
      }
      const leaving = slides[index]!;
      leaving.classList.remove('is-active');
      leaving.classList.add('is-prev');
      slides[next]!.classList.add('is-active');
      setTimeout(() => leaving.classList.remove('is-prev'), speed + 50);
      load(slides[(next + 1) % slides.length]);
      index = next;
    }, duration);
  };
  // Lazy slideshows start (and load their images) when they come into view.
  if (root.querySelector('[data-fr-bg]') && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      begin();
    });
    observer.observe(root);
  } else begin();
});

// ---- Start --------------------------------------------------------------------------------

document.documentElement.classList.add('fr-js');
(window as unknown as { fresco: unknown }).fresco = { register, start };

const ready = () => {
  animations();
  videos();
  backgroundEmbeds();
  lightbox();
  start();
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
else ready();
