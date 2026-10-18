/**
 * Tabs of Prisma on the site: one panel shown at a time, chosen with a
 * click, the arrow keys, Home/End, or a link to the title (`#pr-tabs-…`).
 * Written for Prisma (no third-party library). Each tab list carries its
 * starting tab in `data-pr-tabs`.
 */

interface Tabs {
  root: HTMLElement;
  links: HTMLAnchorElement[];
  panels: HTMLElement[];
  select(index: number, focus?: boolean): void;
}

const all: Tabs[] = [];

function setup(list: HTMLElement): void {
  const root = list.parentElement;
  const body = root?.querySelector<HTMLElement>(':scope > .pr-tabs__body');
  if (!root || !body) return;
  const links = [...list.querySelectorAll<HTMLAnchorElement>(':scope > li > a.pr-tabs__link')];
  const panels = [...body.children].filter((el): el is HTMLElement =>
    el.classList.contains('pr-tab'),
  );
  if (links.length === 0) return;
  let start: number;
  try {
    start = Number((JSON.parse(list.dataset.prTabs ?? '{}') as { active?: unknown }).active) || 0;
  } catch {
    start = 0;
  }
  links.forEach((link, i) => {
    const panel = panels[i];
    if (!link.id) link.id = `pr-tabs-${all.length}-${i}`;
    if (!panel) return;
    panel.id ||= `${link.id}-panel`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('tabindex', '0');
    panel.setAttribute('aria-labelledby', link.id);
    link.setAttribute('aria-controls', panel.id);
  });
  const select = (index: number, focus = false) => {
    const current = Math.max(0, Math.min(index, links.length - 1));
    links.forEach((link, i) => {
      const on = i === current;
      link.parentElement?.classList.toggle('pr-tabs__tab--active', on);
      link.setAttribute('aria-selected', String(on));
      link.setAttribute('tabindex', on ? '0' : '-1');
      if (on && focus) link.focus();
    });
    panels.forEach((panel, i) => {
      const on = i === current;
      panel.classList.toggle('pr-tab--active', on);
      panel.setAttribute('aria-hidden', String(!on));
    });
  };
  links.forEach((link, i) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      select(i);
    });
    link.addEventListener('keydown', (event) => {
      const last = links.length - 1;
      const to =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? i === last
            ? 0
            : i + 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? i === 0
              ? last
              : i - 1
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? last
                : event.key === ' ' || event.key === 'Spacebar'
                  ? i
                  : null;
      if (to === null) return;
      event.preventDefault();
      select(to, true);
    });
  });
  select(start);
  root.classList.add('pr-tabs--ready');
  all.push({ root, links, panels, select });
}

/** A link to a tab's title (`#pr-tabs-<id>-<n>`) opens that tab and scrolls to it. */
function openFromHash(): void {
  const hash = decodeURIComponent(window.location.hash.slice(1));
  if (!/^pr-tabs-[\w-]+$/.test(hash)) return;
  for (const tabs of all) {
    const index = tabs.links.findIndex((link) => link.id === hash);
    if (index === -1) continue;
    tabs.select(index);
    tabs.links[index]!.closest('li')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
}

function init(): void {
  document.querySelectorAll<HTMLElement>('[data-pr-tabs]').forEach(setup);
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export {};
