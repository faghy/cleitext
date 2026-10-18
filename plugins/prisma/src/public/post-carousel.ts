/**
 * Prisma post carousel: slides the posts one at a time, with arrows, dots,
 * autoplay (paused on hover and in background tabs) and swipes.
 */

interface CarouselConfig {
  autoplay: number;
  speed: number;
  loop: boolean;
  pauseOnHover: boolean;
  arrows: boolean;
  dots: boolean;
}

function setupCarousel(root: HTMLElement): void {
  let config: CarouselConfig;
  try {
    config = JSON.parse(root.dataset.prPostCarousel ?? '{}') as CarouselConfig;
  } catch {
    return;
  }
  const viewport = root.querySelector<HTMLElement>('.pr-post-carousel__viewport');
  const track = root.querySelector<HTMLElement>('.pr-post-carousel__track');
  if (!viewport || !track) return;
  const slides = Array.from(track.children) as HTMLElement[];
  if (slides.length === 0) return;
  const prev = root.querySelector<HTMLButtonElement>('.pr-post-carousel__arrow--prev');
  const next = root.querySelector<HTMLButtonElement>('.pr-post-carousel__arrow--next');
  let dotList = root.querySelector<HTMLUListElement>('.pr-post-carousel__dots');
  let index = 0;
  let timer = 0;
  let hovered = false;

  track.style.transition = `transform ${config.speed}ms ease`;

  /** Posts in view at the current width. */
  const visible = () => {
    const width = slides[0]!.getBoundingClientRect().width;
    return width > 0 ? Math.max(1, Math.round(viewport.clientWidth / width)) : 1;
  };
  const last = () => Math.max(0, slides.length - visible());

  const draw = () => {
    const width = slides[0]!.getBoundingClientRect().width;
    track.style.transform = `translate3d(${-index * width}px, 0, 0)`;
    const max = last();
    if (prev) prev.hidden = max === 0;
    if (next) next.hidden = max === 0;
    if (dotList) {
      const dots = Array.from(dotList.querySelectorAll('button'));
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
    }
    slides.forEach((slide, i) => {
      const shown = i >= index && i < index + visible();
      slide.toggleAttribute('inert', !shown);
      slide.setAttribute('aria-hidden', shown ? 'false' : 'true');
    });
  };

  /** One dot for each first post that can be in view. */
  const buildDots = () => {
    if (!config.dots) return;
    const count = last() + 1;
    if (!dotList) {
      dotList = document.createElement('ul');
      dotList.className = 'pr-post-carousel__dots';
      root.append(dotList);
    }
    dotList.hidden = count <= 1;
    if (dotList.children.length === count) return;
    dotList.replaceChildren(
      ...Array.from({ length: count }, (_, i) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pr-post-carousel__dot';
        button.setAttribute('aria-label', `Go to slide ${i + 1}`);
        button.addEventListener('click', () => go(i, true));
        li.append(button);
        return li;
      }),
    );
  };

  const go = (to: number, user = false) => {
    const max = last();
    index = to > max ? (config.loop ? 0 : max) : to < 0 ? (config.loop ? max : 0) : to;
    draw();
    if (user) restart();
  };

  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = 0;
  };
  const restart = () => {
    stop();
    if (config.autoplay > 0 && !(config.pauseOnHover && hovered) && !document.hidden) {
      timer = window.setInterval(() => {
        if (!config.loop && index >= last()) return stop();
        go(index + 1);
      }, config.autoplay);
    }
  };

  prev?.addEventListener('click', () => go(index - 1, true));
  next?.addEventListener('click', () => go(index + 1, true));
  // Dots drawn by the server for the desktop columns.
  dotList
    ?.querySelectorAll('button')
    .forEach((button, i) => button.addEventListener('click', () => go(i, true)));
  root.addEventListener('mouseenter', () => {
    hovered = true;
    if (config.pauseOnHover) stop();
  });
  root.addEventListener('mouseleave', () => {
    hovered = false;
    restart();
  });
  document.addEventListener('visibilitychange', restart);

  // Swipes.
  let startX: number | null = null;
  viewport.addEventListener('pointerdown', (event) => {
    startX = event.clientX;
  });
  viewport.addEventListener('pointerup', (event) => {
    if (startX === null) return;
    const dx = event.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1), true);
  });

  let resizing = 0;
  window.addEventListener('resize', () => {
    window.cancelAnimationFrame(resizing);
    resizing = window.requestAnimationFrame(() => {
      buildDots();
      go(Math.min(index, last()));
    });
  });

  buildDots();
  draw();
  restart();
  root.classList.add('is-ready');
}

function initPostCarousels(): void {
  document.querySelectorAll<HTMLElement>('[data-pr-post-carousel]').forEach(setupCarousel);
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', initPostCarousels);
else initPostCarousels();

export {};
