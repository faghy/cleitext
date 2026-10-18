/**
 * Sliders of Prisma on the site: slide, fade or flip transitions, loop,
 * autoplay, arrows, dots and swipe. Written for Prisma (no third-party
 * library); every slider reads its settings from `data-pr-slider`.
 */
interface Config {
  effect: 'slide' | 'fade' | 'flip';
  speed: number;
  autoplay: number;
  pauseOn: 'hover' | 'click' | 'none';
  loop: boolean;
  arrows: boolean;
  dots: boolean;
}

function setup(viewport: HTMLElement) {
  let config: Config;
  try {
    config = JSON.parse(viewport.dataset.prSlider ?? '{}') as Config;
  } catch {
    return;
  }
  const slider = viewport.closest<HTMLElement>('.pr-slider');
  const track = viewport.querySelector<HTMLElement>('.pr-slider__track');
  if (!slider || !track) return;
  const slides = [...track.children].filter((c): c is HTMLElement =>
    c.classList.contains('pr-slide'),
  );
  const count = slides.length;
  if (count === 0) return;
  const effect = config.effect;
  slider.classList.add(`pr-slider--${effect}`);
  const speed = Math.max(0, config.speed);
  // Endless sliding: a copy of the last slide before the first and of the first after the last.
  const cloned = effect === 'slide' && config.loop && count > 1;
  if (cloned) {
    const copy = (s: HTMLElement) => {
      const c = s.cloneNode(true) as HTMLElement;
      c.setAttribute('aria-hidden', 'true');
      c.classList.add('pr-slide--copy');
      c.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
      c.removeAttribute('id');
      c.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]').forEach(
        (e) => e.setAttribute('tabindex', '-1'),
      );
      return c;
    };
    track.prepend(copy(slides[count - 1]!));
    track.append(copy(slides[0]!));
  }
  let index = 0;
  let timer = 0;
  let stopped = false;
  let hovering = false;

  const prev = slider.querySelector<HTMLButtonElement>('.pr-slider__arrow--prev');
  const next = slider.querySelector<HTMLButtonElement>('.pr-slider__arrow--next');
  const dotsBox = slider.querySelector<HTMLElement>('.pr-slider__dots');
  const dots: HTMLButtonElement[] = [];
  if (dotsBox && count > 1) {
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'pr-slider__dot';
      dot.setAttribute('aria-label', `Slide ${i + 1}`);
      dot.addEventListener('click', () => {
        interacted();
        go(i);
      });
      dotsBox.append(dot);
      dots.push(dot);
    }
  }

  const position = (i: number) => (cloned ? i + 1 : i);
  const moveTrack = (i: number, animate: boolean) => {
    track.style.transitionDuration = animate ? `${speed}ms` : '0ms';
    track.style.transform = `translate3d(${-100 * position(i)}%,0,0)`;
  };

  /** Slides stacked on the same place, for fade and flip. */
  const stack = (from: number, to: number, forward: boolean, animate: boolean) => {
    slides.forEach((s, i) => {
      const offset = `translate3d(${-100 * i}%,0,0)`;
      if (effect === 'fade') {
        s.style.transitionDuration = animate ? `${speed}ms` : '0ms';
        s.style.transform = offset;
        s.style.opacity = i === to ? '1' : '0';
      } else {
        const angle = i === to ? 0 : forward ? -180 : 180;
        if (animate && i === to && from !== to) {
          // The coming slide starts from the back side.
          s.style.transitionDuration = '0ms';
          s.style.transform = `${offset} rotateY(${forward ? 180 : -180}deg)`;
          void s.offsetWidth;
        }
        s.style.transitionDuration = animate && (i === to || i === from) ? `${speed}ms` : '0ms';
        s.style.transform = `${offset} rotateY(${angle}deg)`;
        s.style.zIndex = i === to ? '2' : i === from ? '1' : '0';
      }
    });
  };

  const mark = () => {
    slides.forEach((s, i) => {
      s.classList.toggle('is-active', i === index);
      s.setAttribute('aria-hidden', String(i !== index));
      s.inert = i !== index;
    });
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === index);
      d.setAttribute('aria-current', String(i === index));
    });
    if (!config.loop) {
      if (prev) prev.disabled = index === 0;
      if (next) next.disabled = index === count - 1;
    }
  };

  let moving = false;
  const go = (to: number, forward = to > index) => {
    if (count < 2) return;
    const from = index;
    let target = to;
    if (to < 0 || to >= count) {
      if (!config.loop) return;
      target = (to + count) % count;
    }
    if (target === from && to === target) return;
    index = target;
    if (effect === 'slide') {
      if (cloned && (to < 0 || to >= count)) {
        // Through the copy, then back to the real slide without animation.
        moving = true;
        track.style.transitionDuration = `${speed}ms`;
        track.style.transform = `translate3d(${-100 * (to < 0 ? 0 : count + 1)}%,0,0)`;
        window.setTimeout(() => {
          moveTrack(index, false);
          moving = false;
        }, speed + 20);
      } else moveTrack(index, true);
    } else stack(from, index, forward, true);
    mark();
    schedule();
  };

  const schedule = () => {
    window.clearTimeout(timer);
    if (!config.autoplay || stopped || count < 2) return;
    if (hovering && config.pauseOn === 'hover') return;
    timer = window.setTimeout(() => {
      // Without a loop, autoplay stops on the last slide.
      if (!config.loop && index === count - 1) return;
      go(index + 1, true);
    }, config.autoplay);
  };
  /** Autoplay ends at the first interaction when it pauses "on interaction". */
  const interacted = () => {
    if (config.pauseOn === 'click') stopped = true;
  };

  prev?.addEventListener('click', () => {
    interacted();
    if (!moving) go(index - 1, false);
  });
  next?.addEventListener('click', () => {
    interacted();
    if (!moving) go(index + 1, true);
  });
  if (count < 2) {
    prev?.setAttribute('hidden', '');
    next?.setAttribute('hidden', '');
  }
  slider.addEventListener('mouseenter', () => {
    hovering = true;
    if (config.pauseOn === 'hover') window.clearTimeout(timer);
  });
  slider.addEventListener('mouseleave', () => {
    hovering = false;
    schedule();
  });

  // Swipe with a finger or the mouse.
  let startX = 0;
  let startY = 0;
  let pointer: number | null = null;
  let dragged = false;
  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || count < 2) return;
    pointer = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    dragged = false;
  });
  viewport.addEventListener('pointermove', (e) => {
    if (pointer !== e.pointerId) return;
    if (
      !dragged &&
      Math.abs(e.clientX - startX) > 8 &&
      Math.abs(e.clientX - startX) > Math.abs(e.clientY - startY)
    ) {
      dragged = true;
      viewport.classList.add('is-dragging');
    }
  });
  const end = (e: PointerEvent) => {
    if (pointer !== e.pointerId) return;
    pointer = null;
    viewport.classList.remove('is-dragging');
    const dx = e.clientX - startX;
    if (dragged && Math.abs(dx) > 40 && !moving) {
      interacted();
      go(index + (dx < 0 ? 1 : -1), dx < 0);
    }
  };
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);
  // A swipe is not a click on a link inside the slide.
  viewport.addEventListener(
    'click',
    (e) => {
      if (dragged) {
        e.preventDefault();
        e.stopPropagation();
        dragged = false;
      }
    },
    true,
  );
  viewport.addEventListener('dragstart', (e) => {
    if (pointer !== null) e.preventDefault();
  });
  slider.addEventListener('keydown', (e) => {
    if ((e.target as Element).closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowLeft') {
      interacted();
      go(index - 1, false);
    } else if (e.key === 'ArrowRight') {
      interacted();
      go(index + 1, true);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.clearTimeout(timer);
    else schedule();
  });

  if (effect === 'slide') moveTrack(0, false);
  else stack(0, 0, true, false);
  mark();
  schedule();
}

function init() {
  document
    .querySelectorAll<HTMLElement>('[data-pr-slider]:not([data-pr-slider-ready])')
    .forEach((viewport) => {
      viewport.setAttribute('data-pr-slider-ready', '');
      setup(viewport);
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export {};
