/**
 * Entrance animations of Prisma blocks: an element with `data-pr-animation`
 * starts in its "before" state (animations.css) and animates when it comes
 * into view (120px into the screen), once unless `data-pr-animation-repeat`.
 */
(() => {
  const items = document.querySelectorAll<HTMLElement>('[data-pr-animation]');
  if (!items.length) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    for (const item of items) item.classList.add('pr-animated');
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          el.classList.add('pr-animated');
          if (!el.hasAttribute('data-pr-animation-repeat')) observer.unobserve(el);
        } else if (el.hasAttribute('data-pr-animation-repeat')) {
          el.classList.remove('pr-animated');
        }
      }
    },
    { rootMargin: '0px 0px -120px 0px' },
  );
  for (const item of items) {
    item.classList.add('pr-animation-ready');
    observer.observe(item);
  }
})();

// A module: its functions stay its own.
export {};
