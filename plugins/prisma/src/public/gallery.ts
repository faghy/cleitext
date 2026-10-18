/**
 * Image galleries of Prisma on the site: carousel, masonry, tiles, pages,
 * lightbox. Written for Prisma (no third-party library); every gallery
 * reads its settings from `data-pr-gallery`.
 */
interface Config {
  layout: 'grid' | 'masonry' | 'carousel' | 'tiled';
  click: 'none' | 'lightbox' | 'image' | 'url';
  columns: [number, number, number];
  loop: boolean;
  autoplay: number;
  pauseOnHover: boolean;
  speed: number;
  start: number;
  arrows: boolean;
  dots: boolean;
  paged: boolean;
  pages: number;
  loader: boolean;
}

const columnsNow = (columns: Config['columns']) =>
  window.innerWidth <= 767 ? columns[2] : window.innerWidth <= 1024 ? columns[1] : columns[0];

const chevron = (left: boolean) =>
  `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${left ? 'M13.5 3 6.5 10l7 7 1.4-1.4L9.3 10l5.6-5.6z' : 'M6.5 3l7 7-7 7-1.4-1.4L10.7 10 5.1 4.4z'}"/></svg>`;

// ---- Carousel ---------------------------------------------------------------------------

function carousel(gallery: HTMLElement, config: Config) {
  const viewport = gallery.querySelector<HTMLElement>('.pr-gallery__viewport')!;
  const track = gallery.querySelector<HTMLElement>('.pr-gallery__track')!;
  const items = [...track.children] as HTMLElement[];
  const count = items.length;
  if (count === 0) return;
  let index = Math.min(Math.max(config.start, 0), count - 1);
  let timer = 0;
  let paused = false;
  const perView = () => Math.max(1, Math.min(columnsNow(config.columns), count));
  const maxIndex = () => Math.max(0, count - perView());
  const dots = document.createElement('ul');
  dots.className = 'pr-gallery__dots';
  const render = (animate = true) => {
    const n = perView();
    for (const item of items) item.style.width = `${100 / n}%`;
    index = Math.min(Math.max(index, 0), maxIndex());
    track.style.transition = animate ? `transform ${config.speed}ms ease` : 'none';
    track.style.transform = `translate3d(${(-100 / n) * index}%,0,0)`;
    items.forEach((item, i) =>
      item.setAttribute('aria-hidden', String(i < index || i >= index + n)),
    );
    dots
      .querySelectorAll('button')
      .forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  };
  /** The next or previous position; past an end, the other end when looping. */
  const go = (to: number) => {
    const max = maxIndex();
    index = to > max ? (config.loop ? 0 : max) : to < 0 ? (config.loop ? max : 0) : to;
    render();
  };
  if (config.arrows && count > perView()) {
    for (const [dir, left] of [
      ['prev', true],
      ['next', false],
    ] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pr-gallery__arrow pr-gallery__arrow--${dir}`;
      b.setAttribute('aria-label', left ? 'Previous' : 'Next');
      b.innerHTML = chevron(left);
      b.addEventListener('click', () => go(index + (left ? -1 : 1)));
      gallery.append(b);
    }
  }
  if (config.dots && count > perView()) {
    for (let i = 0; i <= maxIndex(); i++) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pr-gallery__dot';
      b.setAttribute('aria-label', `Slide ${i + 1}`);
      b.addEventListener('click', () => go(i));
      li.append(b);
      dots.append(li);
    }
    gallery.after(dots);
  }
  // Swipe.
  let startX = 0;
  viewport.addEventListener('pointerdown', (e) => (startX = e.clientX));
  viewport.addEventListener('pointerup', (e) => {
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
  });
  const tick = () => {
    if (!paused && !document.hidden) go(index + 1);
  };
  if (config.autoplay) timer = window.setInterval(tick, config.autoplay);
  if (config.pauseOnHover) {
    gallery.addEventListener('mouseenter', () => (paused = true));
    gallery.addEventListener('mouseleave', () => (paused = false));
  }
  gallery.addEventListener('focusin', () => (paused = true));
  gallery.addEventListener('focusout', () => (paused = false));
  window.addEventListener('resize', () => render(false));
  render(false);
  gallery.closest<HTMLElement>('.pr-gallery-block')?.classList.add('is-ready');
  void timer;
}

// ---- Masonry ----------------------------------------------------------------------------

function masonry(gallery: HTMLElement, config: Config) {
  const layout = () => {
    const items = [...gallery.querySelectorAll<HTMLElement>('.pr-gallery__item:not([hidden])')];
    const n = Math.max(1, columnsNow(config.columns));
    const gap = parseFloat(getComputedStyle(gallery).getPropertyValue('--pr-gap')) || 0;
    const width = (gallery.clientWidth - gap * (n - 1)) / n;
    const heights = new Array<number>(n).fill(0);
    for (const item of items) {
      item.style.width = `${width}px`;
      // The shortest column takes the next image.
      const col = heights.indexOf(Math.min(...heights));
      item.style.transform = `translate(${col * (width + gap)}px, ${heights[col]}px)`;
      heights[col]! += item.offsetHeight + gap;
    }
    gallery.style.height = `${Math.max(0, Math.max(...heights) - gap)}px`;
  };
  gallery.classList.add('is-positioned');
  layout();
  for (const img of gallery.querySelectorAll('img')) img.addEventListener('load', layout);
  window.addEventListener('resize', layout);
  gallery.closest<HTMLElement>('.pr-gallery-block')?.classList.add('is-ready');
  if (!config.paged) return;
  // Later pages: by button, or as the gallery is scrolled (loader).
  let page = 1;
  const block = gallery.closest<HTMLElement>('.pr-gallery-block')!;
  const more = block.querySelector<HTMLButtonElement>('.pr-gallery__more');
  const loader = block.querySelector<HTMLElement>('.pr-gallery__loader');
  const next = () => {
    if (page >= config.pages) return;
    page++;
    for (const item of gallery.querySelectorAll<HTMLElement>(
      `.pr-gallery__item[data-page="${page}"]`,
    ))
      item.classList.remove('pr-gallery__item--later');
    layout();
    if (page >= config.pages) {
      more?.closest<HTMLElement>('.pr-gallery__pager')?.remove();
      loader?.closest<HTMLElement>('.pr-gallery__pager')?.remove();
    }
  };
  more?.addEventListener('click', next);
  if (loader) {
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) next();
      if (page >= config.pages) watch.disconnect();
    });
    watch.observe(loader);
  }
}

// ---- Tiles ------------------------------------------------------------------------------

function tiled(gallery: HTMLElement) {
  const sizer = gallery.querySelector<HTMLElement>('.pr-gallery__sizer');
  const size = () => {
    if (sizer) gallery.style.gridAutoRows = `${sizer.getBoundingClientRect().width}px`;
  };
  size();
  window.addEventListener('resize', size);
  for (const item of gallery.querySelectorAll<HTMLElement>('.pr-gallery__item')) {
    if (item.classList.contains('pr-gallery__item--focus')) continue;
    const img = item.querySelector('img');
    if (!img) continue;
    const shape = () => {
      if (img.naturalWidth >= 1.5 * img.naturalHeight) item.classList.add('pr-gallery__item--wide');
      else if (img.naturalHeight >= 1.5 * img.naturalWidth)
        item.classList.add('pr-gallery__item--tall');
    };
    if (img.complete && img.naturalWidth) shape();
    else img.addEventListener('load', shape, { once: true });
  }
  if (sizer) sizer.style.visibility = 'hidden';
}

// ---- Pages of a grid -----------------------------------------------------------------------

function pagedGrid(gallery: HTMLElement, config: Config) {
  const block = gallery.closest<HTMLElement>('.pr-gallery-block')!;
  const pager = block.querySelector<HTMLElement>('.pr-gallery__pager');
  if (!pager) return;
  let page = 1;
  const show = (to: number) => {
    page = Math.min(Math.max(to, 1), config.pages);
    for (const item of gallery.querySelectorAll<HTMLElement>('.pr-gallery__item')) {
      item.classList.toggle('pr-gallery__item--later', item.dataset.page !== String(page));
    }
    pager
      .querySelectorAll<HTMLButtonElement>('.pr-gallery__dot')
      .forEach((dot, i) => dot.classList.toggle('is-active', i + 1 === page));
    const [prev, next] = pager.querySelectorAll<HTMLButtonElement>('.pr-gallery__arrow--pager');
    if (prev) prev.disabled = page === 1;
    if (next) next.disabled = page === config.pages;
  };
  pager.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('button');
    if (!target) return;
    if (target.dataset.goTo) show(Number(target.dataset.goTo));
    else if (target.dataset.direction) show(page + (target.dataset.direction === 'next' ? 1 : -1));
  });
}

// ---- Clicks and lightbox -------------------------------------------------------------------

function lightbox(block: HTMLElement, gallery: HTMLElement) {
  const box = block.nextElementSibling as HTMLElement | null;
  if (!box?.classList.contains('pr-lightbox')) return;
  const slides = [...box.querySelectorAll<HTMLElement>('.pr-lightbox__slide')];
  const thumbs = [...box.querySelectorAll<HTMLElement>('.pr-lightbox__thumb')];
  const page = box.querySelector('.pr-lightbox__page');
  let current = 0;
  let opener: HTMLElement | null = null;
  const show = (i: number) => {
    current = (i + slides.length) % slides.length;
    slides.forEach((slide, n) => {
      slide.hidden = n !== current;
      const img = slide.querySelector<HTMLImageElement>('img');
      // Images load when shown, and the next one ahead.
      if (img && !img.src && (n === current || n === (current + 1) % slides.length))
        img.src = img.dataset.src ?? '';
    });
    thumbs.forEach((t, n) => t.classList.toggle('is-active', n === current));
    thumbs[current]?.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (page) page.textContent = String(current + 1);
  };
  const close = () => {
    box.classList.remove('is-open');
    document.body.style.overflow = '';
    window.setTimeout(() => (box.hidden = true), 250);
    opener?.focus();
  };
  const open = (i: number, from: HTMLElement) => {
    opener = from;
    box.hidden = false;
    show(i);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => box.classList.add('is-open'));
    box.focus();
  };
  box.querySelector('.pr-lightbox__close')?.addEventListener('click', close);
  box.querySelector('.pr-lightbox__nav--prev')?.addEventListener('click', () => show(current - 1));
  box.querySelector('.pr-lightbox__nav--next')?.addEventListener('click', () => show(current + 1));
  for (const thumb of thumbs)
    thumb.addEventListener('click', () => show(Number(thumb.dataset.index)));
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(current - 1);
    else if (e.key === 'ArrowRight') show(current + 1);
    else if (e.key === 'Tab') {
      // Focus stays inside.
      const focusable = [...box.querySelectorAll<HTMLElement>('button')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
  let startX = 0;
  box.addEventListener('pointerdown', (e) => (startX = e.clientX));
  box.addEventListener('pointerup', (e) => {
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 40) show(current + (dx < 0 ? 1 : -1));
  });
  for (const item of gallery.querySelectorAll<HTMLElement>('.pr-gallery__item')) {
    item.style.cursor = 'pointer';
    const go = () => open(Number(item.dataset.index), item);
    item.addEventListener('click', go);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  }
}

function openImages(gallery: HTMLElement) {
  for (const item of gallery.querySelectorAll<HTMLElement>('.pr-gallery__item[data-href]')) {
    item.style.cursor = 'pointer';
    const go = () => window.open(item.dataset.href, '_blank', 'noopener');
    item.addEventListener('click', go);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  }
}

function init() {
  for (const gallery of document.querySelectorAll<HTMLElement>('[data-pr-gallery]')) {
    let config: Config;
    try {
      config = JSON.parse(gallery.dataset.prGallery ?? '{}') as Config;
    } catch {
      continue;
    }
    const block = gallery.closest<HTMLElement>('.pr-gallery-block');
    if (config.layout === 'carousel') carousel(gallery, config);
    else if (config.layout === 'masonry') masonry(gallery, config);
    else if (config.layout === 'tiled') tiled(gallery);
    if (config.layout === 'grid' && config.paged) pagedGrid(gallery, config);
    if (config.click === 'lightbox' && block) lightbox(block, gallery);
    if (config.click === 'image') openImages(gallery);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
