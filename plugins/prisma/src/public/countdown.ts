/**
 * Countdowns of Prisma on the site: the page shows the time left when it
 * was made; here it ticks every second. Evergreen timers keep each
 * visitor's end in the browser (per campaign, for `reset` days). At the end
 * the timer stays at zero, hides, shows its message or goes to a page.
 * Settings come from `data-pr-countdown`.
 */
interface Config {
  type: 'date' | 'evergreen';
  end: string;
  evergreen: [number, number, number];
  campaign: string;
  reset: number;
  show: [boolean, boolean, boolean];
  action: 'zero' | 'hide' | 'redirect' | 'content';
  redirect: string;
}

const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;

/**
 * The visitor's end of an evergreen timer, kept from the first visit in the
 * browser's storage (not a cookie: pages stay cacheable), until `reset` days.
 */
function evergreenEnd(config: Config): number {
  const name = `pr-countdown-${config.campaign}`;
  try {
    const saved = JSON.parse(localStorage.getItem(name) ?? 'null') as {
      end: number;
      until: number;
    } | null;
    if (saved && saved.end > 0 && saved.until > Date.now()) return saved.end;
  } catch {
    // No storage (private window): a new end on each visit.
  }
  const [days, hours, minutes] = config.evergreen.map((n) => Math.floor(Number(n) || 0));
  const end = Date.now() + ((days! * 24 + hours!) * 60 + minutes!) * 60000;
  try {
    localStorage.setItem(
      name,
      JSON.stringify({ end, until: Date.now() + config.reset * 86400000 }),
    );
  } catch {
    // Not kept.
  }
  return end;
}

function start(timer: HTMLElement, config: Config) {
  const end = config.type === 'evergreen' ? evergreenEnd(config) : Date.parse(config.end);
  if (!Number.isFinite(end)) return;
  const [showDays, showHours, showMinutes] = config.show;
  const cells = UNITS.map((unit) =>
    timer.querySelector<HTMLElement>(`.pr-countdown__time--${unit}`),
  );
  let interval = 0;
  const tick = () => {
    const diff = end - Date.now();
    const over = diff < 0;
    const days = Math.floor(diff / 86400000);
    let hours = Math.floor(diff / 3600000) % 24;
    let minutes = Math.floor(diff / 60000) % 60;
    let seconds = Math.floor(diff / 1000) % 60;
    // A hidden unit adds to the next one shown.
    if (!showDays) hours += days * 24;
    if (!showHours) minutes += hours * 60;
    if (!showMinutes) seconds += minutes * 60;
    const values = over ? [0, 0, 0, 0] : [days, hours, minutes, seconds];
    cells.forEach((cell, i) => {
      if (cell && cell.textContent !== String(values[i])) cell.textContent = String(values[i]);
    });
    if (!over) return;
    clearInterval(interval);
    timer.classList.add('pr-countdown--ended');
    if (config.action === 'redirect' && config.redirect) window.location.assign(config.redirect);
  };
  tick();
  if (!timer.classList.contains('pr-countdown--ended')) interval = window.setInterval(tick, 1000);
}

function init() {
  for (const timer of document.querySelectorAll<HTMLElement>('[data-pr-countdown]')) {
    try {
      start(timer, JSON.parse(timer.dataset.prCountdown ?? '{}') as Config);
    } catch {
      // A timer with broken settings keeps the time the page shows.
    }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export {};
