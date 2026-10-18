/**
 * Testimonial carousels of Prisma on the site: one or more testimonials in
 * view (the columns of the device, from the `--pr-columns` CSS variable),
 * arrows, dots, autoplay, endless loop and swipe. Written for Prisma (no
 * third-party library); every carousel reads its settings from
 * `data-pr-testimonial`.
 */
export {};

interface Config {
  autoplay: number;
  infinite: boolean;
  pauseOnHover: boolean;
  speed: number;
  arrows: boolean;
  dots: boolean;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function carousel(box: HTMLElement, config: Config) {
  const viewport = box.querySelector<HTMLElement>('.pr-testimonial__viewport');
  const track = box.querySelector<HTMLElement>('.pr-testimonial__track');
  if (!viewport || !track) return;
  const slides = [...track.children].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && !el.dataset.clone,
  );
  const count = slides.length;
  if (count === 0) return;
  const prev = box.querySelector<HTMLButtonElement>('.pr-testimonial__arrow--prev');
  const next = box.querySelector<HTMLButtonElement>('.pr-testimonial__arrow--next');
  const speed = reducedMotion() ? 0 : config.speed;

  let perView = 1;
  /** First testimonial in view (0 … count-1 when looping, else 0 … count-perView). */
  let index = 0;
  /** Clones on each side when looping. */
  let cloned = 0;
  let moving = false;
  let paused = false;
  let forward = true;
  let dots: HTMLUListElement | null = null;
  let timer = 0;

  const columns = () => {
    const n = parseInt(getComputedStyle(box).getPropertyValue('--pr-columns'), 10);
    return Math.max(1, Number.isFinite(n) ? n : 1);
  };
  const sliding = () => count > perView;
  const maxIndex = () => (config.infinite ? count - 1 : Math.max(0, count - perView));

  const place = (position: number, animate: boolean) => {
    track.style.transition = animate && speed ? `transform ${speed}ms ease` : 'none';
    track.style.transform = `translate3d(${(-100 / perView) * position}%,0,0)`;
  };

  const update = () => {
    slides.forEach((slide, i) => {
      const shown = !sliding() || (i - index + count) % count < perView;
      slide.setAttribute('aria-hidden', String(!shown));
      slide.toggleAttribute('inert', !shown);
    });
    if (dots) {
      const active = config.infinite ? ((index % count) + count) % count : index;
      dots.querySelectorAll('button').forEach((dot, i) => {
        dot.classList.toggle('is-active', i === active);
        dot.setAttribute('aria-current', String(i === active));
      });
    }
    if (!config.infinite) {
      if (prev) prev.disabled = index <= 0;
      if (next) next.disabled = index >= maxIndex();
    }
  };

  /** Moves to a testimonial; when looping, past an end it slides on through the clones. */
  const go = (to: number) => {
    if (!sliding() || moving) return;
    if (!config.infinite) {
      index = Math.min(Math.max(to, 0), maxIndex());
      place(index, true);
      update();
      return;
    }
    const wrapped = ((to % count) + count) % count;
    if (wrapped === to || !speed) {
      index = wrapped;
      place(index + cloned, Boolean(speed));
      update();
      return;
    }
    moving = true;
    place(to + cloned, true);
    index = wrapped;
    update();
    window.setTimeout(() => {
      place(index + cloned, false);
      moving = false;
    }, speed);
  };

  const removeClones = () => {
    for (const clone of track.querySelectorAll('[data-clone]')) clone.remove();
    cloned = 0;
  };

  const addClones = () => {
    cloned = perView;
    const make = (slide: HTMLElement) => {
      const copy = slide.cloneNode(true) as HTMLElement;
      copy.dataset.clone = '1';
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('inert', '');
      return copy;
    };
    track.prepend(...slides.slice(count - cloned).map(make));
    track.append(...slides.slice(0, cloned).map(make));
  };

  const buildDots = () => {
    dots?.remove();
    dots = null;
    if (!config.dots || !sliding()) return;
    dots = document.createElement('ul');
    dots.className = 'pr-testimonial__dots';
    const total = config.infinite ? count : count - perView + 1;
    for (let i = 0; i < total; i++) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pr-testimonial__dot';
      b.setAttribute('aria-label', `Testimonial ${i + 1}`);
      b.addEventListener('click', () => go(i));
      li.append(b);
      dots.append(li);
    }
    box.append(dots);
  };

  /** Lays the carousel out for the columns of the current device. */
  const setup = () => {
    perView = columns();
    removeClones();
    if (config.infinite && sliding()) addClones();
    index = Math.min(index, maxIndex());
    for (const arrow of [prev, next]) if (arrow) arrow.hidden = !(config.arrows && sliding());
    buildDots();
    place(index + cloned, false);
    update();
  };

  prev?.addEventListener('click', () => go(index - 1));
  next?.addEventListener('click', () => go(index + 1));

  // Autoplay: one step at a time; without the loop it turns back at the ends.
  const tick = () => {
    if (paused || document.hidden || !sliding()) return;
    if (config.infinite) return go(index + 1);
    if (forward && index >= maxIndex()) forward = false;
    else if (!forward && index <= 0) forward = true;
    go(index + (forward ? 1 : -1));
  };
  if (config.autoplay) timer = window.setInterval(tick, Math.max(config.autoplay, speed + 50));
  if (config.pauseOnHover) {
    box.addEventListener('mouseenter', () => (paused = true));
    box.addEventListener('mouseleave', () => (paused = false));
  }
  box.addEventListener('focusin', () => (paused = true));
  box.addEventListener('focusout', () => (paused = false));

  // Swipe and keyboard.
  let startX: number | null = null;
  viewport.addEventListener('pointerdown', (e) => (startX = e.clientX));
  viewport.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(index - 1);
    else if (e.key === 'ArrowRight') go(index + 1);
  });

  let width = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    if (columns() !== perView) setup();
  });
  setup();
  box.classList.add('is-ready');
  void timer;
}

function init() {
  for (const box of document.querySelectorAll<HTMLElement>('[data-pr-testimonial]')) {
    if (box.dataset.prReady) continue;
    box.dataset.prReady = '1';
    let config: Config;
    try {
      config = JSON.parse(box.dataset.prTestimonial ?? '{}') as Config;
    } catch {
      continue;
    }
    carousel(box, config);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
