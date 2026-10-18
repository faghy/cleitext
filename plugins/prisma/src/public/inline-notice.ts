/**
 * Inline notices of Prisma on the site: the close button hides the notice;
 * a remembered notice stays closed in this browser for the chosen days
 * (kept in localStorage, so pages stay cacheable: no cookie is set).
 */
interface Config {
  /** Set when the closing is remembered. */
  id?: string;
  days?: number;
}

const KEY = 'pr-notice-';
const DAY = 86_400_000;

/** Whether the notice was closed and the time to show it again has not come. */
function closed(id: string): boolean {
  try {
    const until = Number(window.localStorage.getItem(KEY + id));
    if (until > Date.now()) return true;
    if (until) window.localStorage.removeItem(KEY + id);
  } catch {
    // Storage blocked: the notice shows.
  }
  return false;
}

function remember(id: string, days: number): void {
  try {
    window.localStorage.setItem(KEY + id, String(Date.now() + Math.max(0, days) * DAY));
  } catch {
    // Storage blocked: closed for this page view only.
  }
}

function init() {
  for (const button of document.querySelectorAll<HTMLElement>('[data-pr-inline-notice]')) {
    const notice = button.closest<HTMLElement>('.pr-inline-notice');
    if (!notice) continue;
    let config: Config;
    try {
      config = JSON.parse(button.dataset.prInlineNotice ?? '{}') as Config;
    } catch {
      config = {};
    }
    const id = typeof config.id === 'string' && config.id ? config.id : '';
    if (id && !closed(id)) notice.classList.remove('pr-inline-notice--hidden');
    button.addEventListener('click', () => {
      if (id) remember(id, Number(config.days ?? 1));
      notice.classList.add('pr-inline-notice--hidden');
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export {};
