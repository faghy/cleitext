/**
 * Tables of contents of Prisma on the site: the list is built from the
 * headings of the page's content (each heading gets an anchor), with
 * smooth scrolling, a collapsible table and collapsible sub-lists, and an
 * optional button back to the top. Every table reads its settings from
 * `data-pr-table-of-contents`.
 */
import { collectHeadings, renderList } from '../blocks/table-of-contents/build';

interface Config {
  mapping: boolean[];
  smooth: boolean;
  offset: number;
  toTop: boolean;
  collapsible: boolean;
  list: boolean;
  depth: number;
  listCollapsed: boolean;
}

/** The part of the page holding the content: the article's text, else the main area, else the page. */
function contentRoot(from: Element): ParentNode {
  return (
    from.closest('.entry-content, .wp-block-post-content') ??
    from.closest('main, [role="main"]') ??
    document.querySelector('main, [role="main"]') ??
    document.body
  );
}

/** Where a heading's anchor is, from the top of the page. */
const top = (element: Element) => element.getBoundingClientRect().top + window.scrollY;

function scrollTo(id: string, config: Config) {
  const target = document.getElementById(id);
  if (!target) return;
  if (config.smooth) window.scrollTo({ top: top(target) - config.offset, behavior: 'smooth' });
  else window.scrollTo({ top: top(target), behavior: 'auto' });
}

/** Height animation of the list when the table is opened or closed. */
function slide(target: HTMLElement, open: boolean, done: () => void, duration = 500) {
  const s = target.style;
  const height = target.offsetHeight;
  Object.assign(s, {
    overflow: 'hidden',
    boxSizing: 'border-box',
    height: open ? '0px' : `${height}px`,
  });
  void target.offsetHeight;
  Object.assign(s, { transition: `height ${duration}ms`, height: open ? `${height}px` : '0px' });
  window.setTimeout(() => {
    for (const p of ['height', 'overflow', 'transition', 'box-sizing']) s.removeProperty(p);
    done();
  }, duration);
}

function collapsibleList(wrap: HTMLElement, config: Config) {
  for (const ul of wrap.querySelectorAll<HTMLElement>('ul.pr-toc__list'))
    ul.classList.add('is-animated');
  const toggle = (button: HTMLElement, open: boolean, animate = true) => {
    const ul = button.parentElement?.querySelector<HTMLElement>(':scope > ul.pr-toc__list');
    button.setAttribute('aria-expanded', String(open));
    if (!ul) return;
    if (open) {
      ul.classList.remove('is-hidden', 'is-closed');
      requestAnimationFrame(() => {
        ul.style.maxHeight = `${ul.scrollHeight}px`;
        // Open, the list follows its content again (sub-lists opening inside it).
        window.setTimeout(() => {
          ul.style.removeProperty('max-height');
          ul.style.removeProperty('overflow');
        }, 300);
      });
    } else {
      ul.style.overflow = 'hidden';
      ul.style.maxHeight = `${ul.scrollHeight}px`;
      void ul.offsetHeight;
      ul.style.maxHeight = '0px';
      ul.classList.add('is-closed');
      // Hidden once closed, so that screen readers skip it.
      window.setTimeout(() => ul.classList.add('is-hidden'), animate ? 300 : 0);
    }
  };
  for (const button of wrap.querySelectorAll<HTMLElement>('.pr-toc__toggle')) {
    const flip = () => toggle(button, button.getAttribute('aria-expanded') !== 'true');
    button.addEventListener('click', flip);
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        flip();
      }
    });
    if (config.listCollapsed) toggle(button, false, false);
  }
}

let scrollButton: HTMLButtonElement | null = null;
function scrollTopButton() {
  if (scrollButton) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pr-toc__scroll-top';
  button.setAttribute('aria-label', 'Back to top');
  button.innerHTML =
    '<svg viewBox="0 0 26 16" aria-hidden="true"><path d="M.5 3 13 15.5 25.5 3 23 .5l-10 10-10-10z"/></svg>';
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.append(button);
  scrollButton = button;
  const show = () => button.classList.toggle('is-visible', window.scrollY > 300);
  document.addEventListener('scroll', show, { passive: true });
  show();
}

function setup(wrap: HTMLElement) {
  let config: Config;
  try {
    config = JSON.parse(wrap.dataset.prTableOfContents ?? '{}') as Config;
  } catch {
    return;
  }
  const block = wrap.closest<HTMLElement>('.pr-toc') ?? wrap;
  const listWrap = wrap.querySelector<HTMLElement>('.pr-toc__list-wrap');
  const placeholder = wrap.querySelector<HTMLElement>('.pr-toc__placeholder');
  const root = contentRoot(block);
  // Over the whole page, the site's header, footer and sidebars are left out.
  const found = collectHeadings(
    root,
    config.mapping,
    (h) =>
      h.closest('.pr-toc') !== null ||
      (root === document.body && h.closest('header, footer, nav, aside') !== null),
  );
  if (!listWrap || found.length === 0) {
    listWrap?.remove();
    placeholder?.removeAttribute('hidden');
    return;
  }
  placeholder?.remove();
  // Each heading gets an anchor at its start (a heading's own id is left as it is).
  for (const { heading, element } of found) {
    if (document.getElementById(heading.id)) continue;
    const anchor = document.createElement('span');
    anchor.id = heading.id;
    anchor.className = 'pr-toc__anchor';
    element.prepend(anchor);
  }
  // The site usually builds the list already (with the headings' anchors).
  if (!listWrap.querySelector('.pr-toc__list')) {
    listWrap.innerHTML = renderList(
      found.map((f) => f.heading),
      { collapsible: config.list, depth: config.depth },
    );
  }
  listWrap.addEventListener('click', (e) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>('a.pr-toc__link');
    const id = link?.getAttribute('href')?.slice(1);
    if (!link || !id) return;
    e.preventDefault();
    scrollTo(decodeURIComponent(id), config);
    history.replaceState(null, '', `#${id}`);
  });
  if (config.list) collapsibleList(listWrap, config);

  if (config.collapsible) {
    const title = wrap.querySelector<HTMLElement>('.pr-toc__title');
    if (title) {
      title.setAttribute('role', 'button');
      title.tabIndex = 0;
      title.setAttribute('aria-expanded', String(!block.classList.contains('pr-toc--collapsed')));
      let busy = false;
      const flip = () => {
        if (busy) return;
        busy = true;
        const opening = block.classList.contains('pr-toc--collapsed');
        if (opening) {
          block.classList.remove('pr-toc--collapsed');
          slide(listWrap, true, () => (busy = false));
        } else
          slide(listWrap, false, () => {
            block.classList.add('pr-toc--collapsed');
            busy = false;
          });
        title.setAttribute('aria-expanded', String(opening));
      };
      title.addEventListener('click', (e) => {
        // Editing the title's text is not possible here: any click toggles.
        if ((e.target as Element).closest('a')) return;
        flip();
      });
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          flip();
        }
      });
    }
  }
  if (config.toTop) scrollTopButton();

  // A link to one of the headings, opened from elsewhere.
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash && found.some((f) => f.heading.id === hash)) scrollTo(hash, config);
}

function init() {
  document
    .querySelectorAll<HTMLElement>('[data-pr-table-of-contents]:not([data-pr-toc-ready])')
    .forEach((wrap) => {
      wrap.setAttribute('data-pr-toc-ready', '');
      setup(wrap);
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export {};
