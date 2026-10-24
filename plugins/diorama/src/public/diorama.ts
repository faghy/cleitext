/**
 * Diorama's runtime: a few kilobytes, no libraries. It shows the controls,
 * changes slides with Web Animations (layers enter with CSS animations when
 * their slide becomes active), plays autoplay with pause on hover, on focus
 * and with the pause button, and follows swipes and the keyboard while the
 * slider has the focus. With reduced motion nothing moves by itself and
 * slides change at once. Background videos play only on the active slide;
 * YouTube and Vimeo wait for the Privacy plugin's consent when it is there.
 * Other plugins (Diorama Pro) add transitions through `window.cleitextDiorama`.
 */

interface Config {
  autoplay: boolean;
  delay: number;
  pauseOnHover: boolean;
  loop: boolean;
  effect: string;
  duration: number;
  easing: string;
  labels: { pause: string; play: string };
}

type TransitionFn = (
  from: HTMLElement,
  to: HTMLElement,
  options: { duration: number; easing: string; direction: 1 | -1 },
) => Animation[];

interface DioramaGlobal {
  transitions: Record<string, TransitionFn>;
  sliders: Slider[];
  /** Called with each slider once it is ready, and after every change of slide. */
  listeners: ((slider: Slider, event: 'ready' | 'change') => void)[];
}

const w = window as unknown as {
  cleitextDiorama?: Partial<DioramaGlobal>;
  cleitextConsent?: unknown;
};
const registry: DioramaGlobal = {
  transitions: {},
  sliders: [],
  listeners: [],
  ...w.cleitextDiorama,
} as DioramaGlobal;
w.cleitextDiorama = registry;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

const NS = 'http://www.w3.org/2000/svg';
const ICON = { pause: 'M8.5 5.5v13 M15.5 5.5v13', play: 'M7.5 5v14l11-7z' };

/** The built-in transitions, as pairs of keyframes for the leaving and the coming slide. */
function transitionFrames(
  effect: string,
  direction: 1 | -1,
): { from: Keyframe[]; to: Keyframe[]; sequential?: boolean } {
  const d = direction;
  const slide = (axis: 'X' | 'Y', sign: number) => ({
    from: [{ transform: 'none' }, { transform: `translate${axis}(${-100 * sign * d}%)` }],
    to: [{ transform: `translate${axis}(${100 * sign * d}%)` }, { transform: 'none' }],
  });
  switch (effect) {
    case 'slide-left':
      return slide('X', 1);
    case 'slide-right':
      return slide('X', -1);
    case 'slide-up':
      return slide('Y', 1);
    case 'slide-down':
      return slide('Y', -1);
    case 'slide-over':
      return {
        from: [
          { transform: 'none', filter: 'brightness(1)' },
          { transform: 'scale(.94)', filter: 'brightness(.6)' },
        ],
        to: [{ transform: `translateX(${100 * d}%)` }, { transform: 'none' }],
      };
    case 'zoom':
      return {
        from: [{ opacity: 1 }, { opacity: 0 }],
        to: [
          { opacity: 0, transform: 'scale(1.12)' },
          { opacity: 1, transform: 'none' },
        ],
      };
    case 'crossfade':
      return { from: [{ opacity: 1 }, { opacity: 0 }], to: [{ opacity: 0 }, { opacity: 1 }] };
    default:
      return {
        from: [{ opacity: 1 }, { opacity: 0 }],
        to: [{ opacity: 0 }, { opacity: 1 }],
        sequential: true,
      };
  }
}

function svgIcon(path: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', path);
  svg.appendChild(p);
  return svg;
}

/** Whether the Privacy plugin decides about embeds on this page. */
const consentManaged = () => Boolean(document.getElementById('cx-consent') || w.cleitextConsent);

class Slider {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  readonly slides: HTMLElement[];
  readonly config: Config;
  index = 0;
  private busy = false;
  private queued: number | null = null;
  private timer = 0;
  private started = 0;
  private remaining = 0;
  private progress: Animation | null = null;
  private userPaused = false;
  private hover = false;
  private focus = false;
  private offscreen = false;
  private pauseButton: HTMLButtonElement | null;
  private bullets: HTMLButtonElement[];
  private prev: HTMLButtonElement | null;
  private next: HTMLButtonElement | null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.config = JSON.parse(root.getAttribute('data-dio') ?? '{}') as Config;
    this.stage = root.querySelector<HTMLElement>('.dio__stage')!;
    this.slides = [...this.stage.querySelectorAll<HTMLElement>(':scope > .dio__slide')];
    this.pauseButton = root.querySelector<HTMLButtonElement>('[data-dio-pause]');
    this.bullets = [...root.querySelectorAll<HTMLButtonElement>('[data-dio-go]')];
    this.prev = root.querySelector<HTMLButtonElement>('[data-dio-prev]');
    this.next = root.querySelector<HTMLButtonElement>('[data-dio-next]');
    this.userPaused = reduced.matches;
    this.setUp();
  }

  private get multi() {
    return this.slides.length > 1;
  }

  private setUp() {
    const { root } = this;
    root.querySelectorAll<HTMLElement>('[hidden]').forEach((el) => {
      if (el.matches('.dio__arrow, .dio__bullets, .dio__pause, .dio__progress')) el.hidden = false;
    });
    this.prev?.addEventListener('click', () => this.step(-1, true));
    this.next?.addEventListener('click', () => this.step(1, true));
    this.bullets.forEach((b, i) => b.addEventListener('click', () => this.go(i, true)));
    this.pauseButton?.addEventListener('click', () => {
      this.userPaused = !this.userPaused;
      this.update();
    });
    if (this.multi) {
      root.addEventListener('keydown', (e) => this.onKey(e));
      this.setUpSwipe();
      if (this.config.pauseOnHover) {
        root.addEventListener('mouseenter', () => {
          this.hover = true;
          this.update();
        });
        root.addEventListener('mouseleave', () => {
          this.hover = false;
          this.update();
        });
      }
      root.addEventListener('focusin', () => {
        this.focus = true;
        this.update();
      });
      root.addEventListener('focusout', (e) => {
        if (root.contains(e.relatedTarget as Node | null)) return;
        this.focus = false;
        this.update();
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
          this.offscreen = !entries[0]!.isIntersecting;
          this.update();
        }).observe(root);
      }
      document.addEventListener('visibilitychange', () => this.update());
      reduced.addEventListener?.('change', () => {
        if (reduced.matches) this.userPaused = true;
        this.update();
      });
    }
    root.querySelectorAll<HTMLAnchorElement>('a[data-dio-scroll]').forEach((a) =>
      a.addEventListener('click', (e) => {
        const target = document.querySelector(a.getAttribute('href') ?? '');
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
      }),
    );
    this.media(this.slides[0]!, true);
    this.syncArrows();
    this.remaining = this.durationOf(0);
    this.update();
    for (const listener of registry.listeners) listener(this, 'ready');
  }

  /** Milliseconds a slide stays. */
  private durationOf(index: number): number {
    return Number(this.slides[index]?.getAttribute('data-duration')) || this.config.delay || 6000;
  }

  private get running(): boolean {
    return (
      this.config.autoplay &&
      this.multi &&
      !this.userPaused &&
      !this.hover &&
      !this.focus &&
      !this.offscreen &&
      !document.hidden &&
      !reduced.matches
    );
  }

  /** Starts or pauses the clock of autoplay, and shows its state. */
  private update() {
    const running = this.running;
    window.clearTimeout(this.timer);
    if (running && !this.busy) {
      this.started = performance.now();
      this.timer = window.setTimeout(() => this.advance(), this.remaining);
      if (this.progress) this.progress.play();
      else this.startProgress();
    } else if (this.started) {
      this.remaining = Math.max(0, this.remaining - (performance.now() - this.started));
      this.started = 0;
      this.progress?.pause();
    }
    this.stage.setAttribute('aria-live', running ? 'off' : 'polite');
    if (this.pauseButton) {
      const playing = this.config.autoplay && !this.userPaused;
      // The icon changes only with the state: replacing it under a pressed mouse loses the click.
      if (this.pauseButton.getAttribute('data-playing') !== String(playing)) {
        this.pauseButton.setAttribute('data-playing', String(playing));
        this.pauseButton.setAttribute(
          'aria-label',
          playing ? this.config.labels.pause : this.config.labels.play,
        );
        this.pauseButton.replaceChildren(svgIcon(playing ? ICON.pause : ICON.play));
        if (!playing) this.pauseButton.firstElementChild!.setAttribute('class', 'dio-play');
      }
    }
  }

  private startProgress() {
    const bar = this.root.querySelector<HTMLElement>('.dio__progress span');
    if (!bar || !bar.animate) return;
    const total = this.durationOf(this.index);
    this.progress = bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: total,
      fill: 'forwards',
    });
    this.progress.currentTime = total - this.remaining;
  }

  private resetClock() {
    window.clearTimeout(this.timer);
    this.started = 0;
    this.progress?.cancel();
    this.progress = null;
    this.remaining = this.durationOf(this.index);
  }

  private advance() {
    this.started = 0;
    if (!this.config.loop && this.index === this.slides.length - 1) {
      this.userPaused = true;
      this.update();
      return;
    }
    this.step(1, false);
  }

  step(by: 1 | -1, user: boolean) {
    let target = this.index + by;
    if (target < 0 || target >= this.slides.length) {
      if (!this.config.loop && user) return;
      target = (target + this.slides.length) % this.slides.length;
    }
    void this.go(target, user, by);
  }

  async go(target: number, user = false, direction?: 1 | -1) {
    if (target === this.index || target < 0 || target >= this.slides.length) return;
    if (this.busy) {
      this.queued = target;
      return;
    }
    this.busy = true;
    const from = this.slides[this.index]!;
    const to = this.slides[target]!;
    const dir: 1 | -1 = direction ?? (target > this.index ? 1 : -1);
    window.clearTimeout(this.timer);
    this.progress?.cancel();
    this.progress = null;
    this.started = 0;
    this.index = target;
    this.syncBullets();
    this.syncArrows();
    this.media(to, true);
    await this.animate(from, to, dir);
    this.media(from, false);
    this.busy = false;
    this.remaining = this.durationOf(this.index);
    for (const listener of registry.listeners) listener(this, 'change');
    if (this.queued !== null) {
      const next = this.queued;
      this.queued = null;
      void this.go(next, user);
      return;
    }
    this.update();
    void user;
  }

  private async animate(from: HTMLElement, to: HTMLElement, dir: 1 | -1) {
    const instant = reduced.matches || !to.animate;
    const effect = to.getAttribute('data-transition') || this.config.effect;
    const duration = instant ? 0 : this.config.duration;
    // Exit effects of the leaving slide's layers, before it goes.
    const leaving = instant ? [] : [...from.querySelectorAll<HTMLElement>('.dio-l[data-out]')];
    if (leaving.length > 0) {
      from.classList.add('is-out');
      const longest = Math.min(
        1500,
        Math.max(
          ...leaving.map((el) => {
            const s = getComputedStyle(el);
            return parseFloat(s.animationDuration) * 1000 + parseFloat(s.animationDelay) * 1000;
          }),
        ),
      );
      await new Promise((resolve) => window.setTimeout(resolve, longest || 0));
    }
    to.classList.add('is-in');
    to.removeAttribute('aria-hidden');
    to.inert = false;
    const custom = registry.transitions[effect];
    const options = { duration, easing: this.config.easing, direction: dir };
    const f = transitionFrames(effect, dir);
    const sequential = duration > 0 && !custom && Boolean(f.sequential);
    let animations: Animation[] = [];
    if (duration > 0 && custom) {
      try {
        animations = custom(from, to, options);
      } catch {
        animations = [];
      }
    } else if (duration > 0) {
      const part = sequential ? duration / 2 : duration;
      animations = [
        from.animate(f.from, { duration: part, easing: this.config.easing, fill: 'forwards' }),
        to.animate(f.to, {
          duration: part,
          delay: sequential ? part : 0,
          easing: this.config.easing,
          fill: 'backwards',
        }),
      ];
    }
    // Layers enter when their slide shows: half way through a fade.
    if (sequential) window.setTimeout(() => to.classList.add('is-active'), duration / 2);
    else to.classList.add('is-active');
    await Promise.all(animations.map((a) => a.finished.catch(() => undefined)));
    to.classList.add('is-active');
    to.classList.remove('is-in');
    from.classList.remove('is-active', 'is-out');
    for (const a of animations) a.cancel();
    from.setAttribute('aria-hidden', 'true');
    from.inert = true;
  }

  private syncBullets() {
    this.bullets.forEach((b, i) => {
      if (i === this.index) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }

  private syncArrows() {
    if (this.config.loop) return;
    if (this.prev) this.prev.disabled = this.index === 0;
    if (this.next) this.next.disabled = this.index === this.slides.length - 1;
  }

  /** Videos of a slide: playing while it is shown (never with reduced motion). */
  private media(slide: HTMLElement, active: boolean) {
    slide.querySelectorAll<HTMLVideoElement>('video[data-dio-video]').forEach((video) => {
      if (active && !reduced.matches) {
        video.muted = true;
        void video.play().catch(() => undefined);
      } else video.pause();
    });
    if (!active || reduced.matches || consentManaged()) return;
    slide
      .querySelectorAll<HTMLIFrameElement>('iframe[data-dio-embed][data-cx-src]')
      .forEach((frame) => {
        frame.src = frame.getAttribute('data-cx-src')!;
        frame.removeAttribute('data-cx-src');
      });
  }

  private onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === 'ArrowLeft') this.step(-1, true);
    else if (e.key === 'ArrowRight') this.step(1, true);
    else if (e.key === 'Home') void this.go(0, true);
    else if (e.key === 'End') void this.go(this.slides.length - 1, true);
    else return;
    e.preventDefault();
  }

  private setUpSwipe() {
    let x = 0;
    let y = 0;
    let id: number | null = null;
    let moved = false;
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      id = e.pointerId;
      x = e.clientX;
      y = e.clientY;
      moved = false;
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (id === e.pointerId && Math.abs(e.clientX - x) > 10) moved = true;
    });
    const end = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      id = null;
      const dx = e.clientX - x;
      const dy = e.clientY - y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) this.step(dx < 0 ? 1 : -1, true);
    };
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', () => (id = null));
    // A drag is not a click on a link of the slide.
    this.stage.addEventListener(
      'click',
      (e) => {
        if (moved) {
          e.preventDefault();
          e.stopPropagation();
          moved = false;
        }
      },
      true,
    );
    this.stage.addEventListener('dragstart', (e) => e.preventDefault());
  }
}

function scrollbarWidth() {
  const width = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty('--dio-sbw', `${Math.max(0, width)}px`);
}

function start() {
  scrollbarWidth();
  window.addEventListener('resize', scrollbarWidth, { passive: true });
  document.querySelectorAll<HTMLElement>('[data-dio]').forEach((root) => {
    if (root.hasAttribute('data-dio-ready')) return;
    root.setAttribute('data-dio-ready', '');
    try {
      registry.sliders.push(new Slider(root));
    } catch (error) {
      console.error('Diorama: a slider could not start', error);
    }
  });
}

// Deferred scripts of other plugins (Diorama Pro's transitions) run before DOMContentLoaded.
if (document.readyState === 'complete') start();
else document.addEventListener('DOMContentLoaded', start);
export {};
