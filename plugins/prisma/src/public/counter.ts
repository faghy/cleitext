/**
 * Counters of Prisma on the site: the page shows the final number (and a
 * full bar or circle), so it is right without this script; here each
 * counter goes back to its start and counts up once, when three quarters
 * of it come into view. Settings come from `data-pr-counter`.
 */
interface Config {
  layout: 'number' | 'bars' | 'circle';
  start: number;
  end: number;
  total: number;
  decimals: number;
  duration: number;
  separator: string;
  size: number;
  stroke: number;
}

function format(value: number, decimals: number, separator: string): string {
  const places = Math.min(Math.max(Math.trunc(decimals), 0), 10);
  const fixed = Math.abs(value).toFixed(places);
  const [whole = '0', fraction] = fixed.split('.');
  const grouped = separator ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator) : whole;
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  return `${sign}${grouped}${fraction ? `.${fraction}` : ''}`;
}

const share = (value: number, total: number) =>
  total > 0 ? Math.min(Math.max((value / total) * 100, 0), 100) : 100;

function setup(counter: HTMLElement, config: Config, reduce: boolean) {
  const value = counter.querySelector<HTMLElement>('.pr-counter__value');
  const bar = counter.querySelector<HTMLElement>('.pr-counter__bar .pr-counter__number');
  const progress = counter.querySelector<SVGCircleElement>('.pr-counter__progress');
  if (!value || reduce) return null;
  const { start, end, total, decimals, separator } = config;
  const duration = Math.max(Number(config.duration) || 0, 1);
  const circumference = Math.PI * (config.size - config.stroke);
  const offset = (n: number) => ((100 - share(n, total)) / 100) * circumference;
  const startWidth = start < total ? Math.ceil(share(start, total)) : 100;
  const endWidth = end <= total ? Math.ceil(share(end, total)) : 100;
  // Back to the start until it is seen.
  value.textContent = format(start, decimals, separator);
  if (config.layout === 'bars' && bar) bar.style.width = `${startWidth}%`;
  if (config.layout === 'circle' && progress)
    progress.style.strokeDashoffset = `${offset(start)}px`;
  return () => {
    const begin = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - begin) / duration, 1);
      value.textContent = format(start + (end - start) * t, decimals, separator);
      if (t < 1) requestAnimationFrame(step);
      else value.textContent = format(end, decimals, separator);
    };
    requestAnimationFrame(step);
    const timing: KeyframeAnimationOptions = { duration, fill: 'forwards' };
    if (config.layout === 'bars' && bar) {
      bar.animate([{ width: `${startWidth}%` }, { width: `${endWidth}%` }], timing);
      bar.style.width = `${endWidth}%`;
    }
    if (config.layout === 'circle' && progress) {
      progress.animate(
        [{ strokeDashoffset: `${offset(start)}px` }, { strokeDashoffset: `${offset(end)}px` }],
        timing,
      );
      progress.style.strokeDashoffset = `${offset(end)}px`;
    }
  };
}

function init() {
  const counters = document.querySelectorAll<HTMLElement>('[data-pr-counter]');
  if (!counters.length || !('IntersectionObserver' in window)) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const starts = new Map<Element, () => void>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        starts.get(entry.target)?.();
      }
    },
    { threshold: 0.75 },
  );
  for (const counter of counters) {
    let config: Config;
    try {
      config = JSON.parse(counter.dataset.prCounter ?? '{}') as Config;
    } catch {
      continue;
    }
    const start = setup(counter, config, reduce);
    if (!start) continue;
    starts.set(counter, start);
    observer.observe(counter);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export {};
