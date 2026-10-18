/**
 * Lottie animations of Prisma on the site. The player is lottie-web (MIT),
 * loaded once from a pinned CDN address, only on pages with an animation and
 * only when one comes near the screen. Every animation reads its settings
 * from `data-pr-lottie`.
 */
interface LottieConfig {
  src: string;
  loop: boolean;
  speed: number;
  reverse: boolean;
  playOn: 'none' | 'hover' | 'click' | 'scroll';
}

interface LottieAnimation {
  play(): void;
  stop(): void;
  pause(): void;
  setSpeed(speed: number): void;
  setDirection(direction: 1 | -1): void;
  addEventListener(name: string, callback: () => void): void;
}

interface LottiePlayer {
  loadAnimation(options: {
    container: Element;
    renderer: 'svg';
    loop: boolean;
    autoplay: boolean;
    path: string;
    rendererSettings?: { preserveAspectRatio?: string; className?: string };
  }): LottieAnimation;
}

/** The player, served next to this script (lottie-player.js, built from lottie-web). */
const LOTTIE_PLAYER_SRC = (() => {
  const own = (document.currentScript as HTMLScriptElement | null)?.src ?? '';
  return own ? own.replace(/lottie\.js(\?.*)?$/, 'lottie-player.js$1') : '';
})();

let lottieLoading: Promise<LottiePlayer> | null = null;

function loadLottiePlayer(): Promise<LottiePlayer> {
  const ready = (window as unknown as { lottie?: LottiePlayer }).lottie;
  if (ready) return Promise.resolve(ready);
  lottieLoading ??= new Promise<LottiePlayer>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LOTTIE_PLAYER_SRC;
    script.async = true;
    script.onload = () => {
      const player = (window as unknown as { lottie?: LottiePlayer }).lottie;
      if (player) resolve(player);
      else reject(new Error('Lottie player not available'));
    };
    script.onerror = () => {
      lottieLoading = null;
      reject(new Error('Lottie player not loaded'));
    };
    document.head.appendChild(script);
  });
  return lottieLoading;
}

const prefersStill = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function startLottie(element: HTMLElement, config: LottieConfig, player: LottiePlayer) {
  // Without motion, nothing plays by itself: only on hover or click.
  const still = prefersStill() && (config.playOn === 'none' || config.playOn === 'scroll');
  const animation = player.loadAnimation({
    container: element,
    renderer: 'svg',
    loop: config.loop,
    autoplay: config.playOn === 'none' && !still,
    path: config.src,
    rendererSettings: { preserveAspectRatio: 'xMidYMid', className: 'pr-lottie__svg' },
  });
  animation.setSpeed(config.speed);
  animation.setDirection(config.reverse ? -1 : 1);
  if (config.playOn === 'hover') {
    element.addEventListener('mouseenter', () => animation.play());
    element.addEventListener('mouseleave', () => animation.stop());
  } else if (config.playOn === 'click') {
    element.dataset.prLottiePlay = 'click';
    element.addEventListener('click', () => {
      animation.stop();
      animation.play();
    });
  } else if (config.playOn === 'scroll' && !still) {
    // From the start each time it comes into view.
    new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          animation.stop();
          animation.play();
        } else animation.pause();
      }
    }).observe(element);
  }
}

function initLottie() {
  const elements = [...document.querySelectorAll<HTMLElement>('[data-pr-lottie]')];
  if (elements.length === 0) return;
  const configs = new Map<Element, LottieConfig>();
  for (const element of elements) {
    try {
      const config = JSON.parse(element.dataset.prLottie ?? '{}') as LottieConfig;
      if (typeof config.src === 'string' && /^(https?:\/\/|\/)/.test(config.src))
        configs.set(element, config);
    } catch {
      // Not ours, or broken: left alone.
    }
  }
  const run = (element: Element) => {
    const config = configs.get(element);
    if (!config) return;
    configs.delete(element);
    loadLottiePlayer()
      .then((player) => startLottie(element as HTMLElement, config, player))
      .catch(() => undefined);
  };
  if (!('IntersectionObserver' in window)) {
    for (const element of [...configs.keys()]) run(element);
    return;
  }
  // Loaded when about to be seen.
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        run(entry.target);
      }
    },
    { rootMargin: '200px 0px' },
  );
  for (const element of configs.keys()) observer.observe(element);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLottie);
else initLottie();

export {};
