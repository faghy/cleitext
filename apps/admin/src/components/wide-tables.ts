import { useEffect, type RefObject } from 'react';

/** Below Tailwind's md breakpoint, as in index.css. */
export const PHONE_QUERY = '(max-width: 47.99rem)';

/** The attribute index.css looks for: a table wider than its box, scrolled on its own. */
export const WIDE_ATTRIBUTE = 'data-wide';

/**
 * Whether a table needs its own horizontal scroll: wider than the box it is in,
 * or reaching past the right edge of the content (when the boxes around it grew
 * with it); once scrolling, while its content is wider than itself.
 */
export function tableIsWide(table: {
  /** Already marked as wide (scrolling in its own box). */
  marked: boolean;
  scrollWidth: number;
  clientWidth: number;
  offsetWidth: number;
  /** Inner width of the table's parent. */
  room: number;
  /** Right edge of the table and of the content area, in viewport pixels. */
  right: number;
  limit: number;
}): boolean {
  if (table.marked) return table.scrollWidth > table.clientWidth + 1;
  return table.offsetWidth > table.room + 1 || table.right > table.limit + 1;
}

/**
 * On phones, marks the tables inside `root` that do not fit, so that they scroll
 * sideways in their own box instead of widening the page; the others keep their
 * layout. Covers the tables of plugin pages too, which the admin does not draw.
 * Tables laid out for phones (`data-mobile`) are left alone.
 */
export function useWideTables(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = root.current;
    if (!element || typeof window.matchMedia !== 'function') return;
    const phone = window.matchMedia(PHONE_QUERY);
    let frame = 0;
    const check = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      const limit = box.right - (parseFloat(getComputedStyle(element).paddingRight) || 0);
      for (const table of element.querySelectorAll('table')) {
        if (table.hasAttribute('data-mobile') || table.closest('[contenteditable]')) continue;
        const wide =
          phone.matches &&
          tableIsWide({
            marked: table.hasAttribute(WIDE_ATTRIBUTE),
            scrollWidth: table.scrollWidth,
            clientWidth: table.clientWidth,
            offsetWidth: table.offsetWidth,
            room: table.parentElement?.clientWidth ?? Infinity,
            right: table.getBoundingClientRect().right,
            limit,
          });
        if (wide !== table.hasAttribute(WIDE_ATTRIBUTE))
          table.toggleAttribute(WIDE_ATTRIBUTE, wide);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    const mutations = new MutationObserver(schedule);
    mutations.observe(element, { childList: true, subtree: true, characterData: true });
    const sizes = new ResizeObserver(schedule);
    sizes.observe(element);
    phone.addEventListener('change', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      sizes.disconnect();
      phone.removeEventListener('change', schedule);
    };
  }, [root]);
}
