/**
 * Modals of Prisma on the site: opened by their trigger (or by elements
 * with a class or an id, after a delay, or when the visitor is about to
 * leave), closed by the close button, Escape or a click on the overlay.
 * While open, the focus stays inside. Written for Prisma (no third-party
 * library); every popup reads its settings from `data-pr-modal`.
 */
interface Config {
  trigger: string;
  esc: boolean;
  overlay: boolean;
  delay: number | null;
  exitIntent: boolean;
  selector: string;
  cookie: { days: number; on: 'open' | 'close' } | null;
  id: string;
}

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

const open: HTMLElement[] = [];

const cookieName = (id: string) => `pr-modal-${id}`;
const seen = (id: string) =>
  document.cookie.split('; ').some((c) => c.startsWith(`${cookieName(id)}=`));
function remember(config: Config): void {
  if (!config.cookie) return;
  const age = Math.round(config.cookie.days * 86400);
  document.cookie = `${cookieName(config.id)}=1; max-age=${age}; path=/; SameSite=Lax`;
}

function setup(popup: HTMLElement): void {
  let config: Config;
  try {
    config = JSON.parse(popup.dataset.prModal ?? '') as Config;
  } catch {
    return;
  }
  const root = popup.parentElement;
  const wrap = popup.querySelector<HTMLElement>('.pr-modal__wrap');
  if (!wrap) return;
  const own = root?.querySelector<HTMLElement>(
    ':scope > .pr-modal__trigger, :scope > .pr-modal__button-wrap .pr-modal__trigger',
  );
  const triggers: HTMLElement[] = own ? [own] : [];
  if (config.selector) {
    try {
      triggers.push(...document.querySelectorAll<HTMLElement>(config.selector));
    } catch {
      // A selector the browser refuses opens nothing.
    }
  }
  // Out of any transformed or clipped parent, the popup covers the window.
  document.body.appendChild(popup);
  wrap.setAttribute('tabindex', '-1');
  let returnTo: HTMLElement | null = null;

  const show = () => {
    if (popup.classList.contains('is-active')) return;
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    popup.classList.add('is-active');
    popup.removeAttribute('aria-hidden');
    open.push(popup);
    document.body.classList.add('pr-modal-open');
    const first = [...wrap.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
      (el) => !el.classList.contains('pr-modal__close'),
    );
    (first ?? wrap).focus({ preventScroll: true });
    if (config.cookie?.on === 'open') remember(config);
  };
  const hide = () => {
    if (!popup.classList.contains('is-active')) return;
    popup.classList.remove('is-active');
    popup.setAttribute('aria-hidden', 'true');
    open.splice(open.indexOf(popup), 1);
    if (open.length === 0) document.body.classList.remove('pr-modal-open');
    if (config.cookie?.on === 'close') remember(config);
    returnTo?.focus({ preventScroll: true });
  };

  for (const trigger of triggers) {
    if (!(trigger instanceof HTMLAnchorElement || trigger instanceof HTMLButtonElement)) {
      trigger.setAttribute('role', 'button');
      if (!trigger.hasAttribute('tabindex')) trigger.setAttribute('tabindex', '0');
    }
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.style.cursor = 'pointer';
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      show();
    });
    trigger.addEventListener('keydown', (event) => {
      if (trigger instanceof HTMLAnchorElement && event.key === 'Enter') return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        show();
      }
    });
  }
  popup
    .querySelectorAll('.pr-modal__close')
    .forEach((button) => button.addEventListener('click', hide));
  popup.addEventListener('click', (event) => {
    if (config.overlay && !wrap.contains(event.target as Node)) hide();
  });
  document.addEventListener('keydown', (event) => {
    // One Escape closes only the popup on top.
    if (event.key !== 'Escape' || event.defaultPrevented || open[open.length - 1] !== popup) return;
    if (!config.esc) return;
    event.preventDefault();
    hide();
  });
  popup.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    // The focus goes round inside the popup.
    const items = [...popup.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (items.length === 0) {
      event.preventDefault();
      wrap.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === wrap)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (config.trigger !== 'automatic' || (config.cookie && seen(config.id))) return;
  // Opens by itself once per visit of the page.
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    show();
  };
  if (config.exitIntent) {
    const leave = (event: MouseEvent) => {
      if (!event.relatedTarget && event.clientY <= 0) {
        document.removeEventListener('mouseout', leave);
        once();
      }
    };
    document.addEventListener('mouseout', leave);
  }
  if (config.delay !== null || !config.exitIntent) {
    window.setTimeout(once, (config.delay ?? 0) * 1000);
  }
}

function init(): void {
  document.querySelectorAll<HTMLElement>('[data-pr-modal]').forEach(setup);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export {};
