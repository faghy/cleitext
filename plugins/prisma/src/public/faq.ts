/**
 * FAQ accordions of Prisma on the site: a question opens or closes its
 * answer with a slide (click, Enter or Space); with "toggle" on, opening
 * one closes the others. Written for Prisma (no third-party library). The
 * settings are the classes of the FAQ block.
 */

const DURATION = 500;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const timers = new WeakMap<HTMLElement, number>();

function finish(el: HTMLElement, after: () => void): void {
  window.clearTimeout(timers.get(el));
  timers.set(
    el,
    window.setTimeout(
      () => {
        after();
        for (const p of ['height', 'overflow', 'transition-property', 'transition-duration'])
          el.style.removeProperty(p);
      },
      reduced() ? 0 : DURATION,
    ),
  );
}

function slideUp(el: HTMLElement): void {
  el.style.overflow = 'hidden';
  el.style.height = `${el.offsetHeight}px`;
  void el.offsetHeight;
  el.style.transitionProperty = 'height, padding';
  el.style.transitionDuration = `${reduced() ? 0 : DURATION}ms`;
  el.style.height = '0px';
  el.style.paddingTop = '0px';
  el.style.paddingBottom = '0px';
  finish(el, () => {
    el.style.display = 'none';
    el.style.removeProperty('padding-top');
    el.style.removeProperty('padding-bottom');
  });
}

function slideDown(el: HTMLElement): void {
  el.style.removeProperty('padding-top');
  el.style.removeProperty('padding-bottom');
  el.style.display = 'block';
  const height = el.offsetHeight;
  el.style.overflow = 'hidden';
  el.style.height = '0px';
  void el.offsetHeight;
  el.style.transitionProperty = 'height, padding';
  el.style.transitionDuration = `${reduced() ? 0 : DURATION}ms`;
  el.style.height = `${height}px`;
  finish(el, () => {});
}

let count = 0;

function setup(faq: HTMLElement): void {
  const items = [...faq.children].filter((el): el is HTMLElement =>
    el.classList.contains('pr-faq-item'),
  );
  const parts = items
    .map((item) => ({
      item,
      question: item.querySelector<HTMLElement>(':scope > .pr-faq-item__question'),
      answer: item.querySelector<HTMLElement>(':scope > .pr-faq-item__content'),
    }))
    .filter((p): p is { item: HTMLElement; question: HTMLElement; answer: HTMLElement } =>
      Boolean(p.question && p.answer),
    );
  const set = (p: (typeof parts)[number], open: boolean, animate: boolean) => {
    p.item.classList.toggle('pr-faq-item--active', open);
    p.question.setAttribute('aria-expanded', String(open));
    if (!animate) p.answer.style.display = open ? 'block' : 'none';
    else if (open) slideDown(p.answer);
    else slideUp(p.answer);
  };
  parts.forEach((p) => {
    p.answer.id ||= `pr-faq-answer-${++count}`;
    p.question.setAttribute('aria-controls', p.answer.id);
  });
  // Starting state: the item the address points to, else the first one, or all.
  const hash = decodeURIComponent(window.location.hash.slice(1));
  const target = /^[\w-]+$/.test(hash) ? document.getElementById(hash) : null;
  const linked = target
    ? parts.find((p) => p.item === target || p.item.contains(target))
    : undefined;
  const allOpen = faq.classList.contains('pr-faq--inactive-other-false');
  parts.forEach((p, i) =>
    set(
      p,
      allOpen ||
        p === linked ||
        (!linked && i === 0 && faq.classList.contains('pr-faq--expand-first-true')),
      false,
    ),
  );
  const toggle = (p: (typeof parts)[number]) => {
    const open = !p.item.classList.contains('pr-faq-item--active');
    set(p, open, true);
    if (open && faq.classList.contains('pr-faq--toggle')) {
      for (const other of parts)
        if (other !== p && other.item.classList.contains('pr-faq-item--active'))
          set(other, false, true);
    }
  };
  parts.forEach((p) => {
    p.question.addEventListener('click', (event) => {
      // Links inside the question still work.
      if ((event.target as Element).closest('a')) return;
      toggle(p);
    });
    p.question.addEventListener('keydown', (event) => {
      if (event.target !== p.question) return;
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        toggle(p);
      }
    });
  });
}

function init(): void {
  const blocks = new Set<HTMLElement>();
  document.querySelectorAll<HTMLElement>('[data-pr-faq]').forEach((question) => {
    const faq = question.closest<HTMLElement>('.pr-faq.pr-faq--layout-accordion');
    if (faq) blocks.add(faq);
  });
  blocks.forEach(setup);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export {};
