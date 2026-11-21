import { useLayoutEffect, type RefObject } from 'react';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Set when the popover is taller than the window: it scrolls inside. */
  maxHeight?: number;
}

/**
 * Where a popover goes, in window coordinates: below its anchor, right edges
 * lined up (or left edges, when that would leave the window), above it when
 * there is no room below, and always inside the window, `margin` from its edges.
 */
export function placePopover(
  anchor: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
  gap = 6,
): Placement {
  const fit = (start: number, length: number, room: number) =>
    Math.max(margin, Math.min(start, room - length - margin));
  let left = anchor.right - size.width;
  if (left < margin) left = anchor.left;
  left = fit(left, size.width, viewport.width);

  const room = viewport.height - 2 * margin;
  if (size.height > room) return { left, top: margin, maxHeight: room };
  let top = anchor.bottom + gap;
  if (top + size.height > viewport.height - margin) {
    const above = anchor.top - gap - size.height;
    top = above >= margin ? above : fit(top, size.height, viewport.height);
  }
  return { left, top };
}

/**
 * Keeps the popover in `popover` on screen next to `anchor`: fixed to the
 * window, so neither the window edges nor a scrolling panel cut it off.
 */
export function useFloating(
  anchor: RefObject<HTMLElement | null>,
  popover: RefObject<HTMLElement | null>,
  /** Which popover is open, if any: a new value places the new one. */
  open: string | boolean | null,
) {
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = popover.current;
      const at = anchor.current;
      if (!el || !at) return;
      const view = el.ownerDocument.documentElement;
      el.style.maxHeight = '';
      const spot = placePopover(
        at.getBoundingClientRect(),
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: view.clientWidth, height: view.clientHeight },
      );
      Object.assign(el.style, {
        position: 'fixed',
        right: 'auto',
        bottom: 'auto',
        left: `${spot.left}px`,
        top: `${spot.top}px`,
        maxHeight: spot.maxHeight ? `${spot.maxHeight}px` : '',
        overflowY: spot.maxHeight ? 'auto' : '',
      });
      // A transformed ancestor would move a fixed box: correct by what it moved.
      const got = el.getBoundingClientRect();
      if (Math.abs(got.left - spot.left) > 0.5 || Math.abs(got.top - spot.top) > 0.5) {
        el.style.left = `${2 * spot.left - got.left}px`;
        el.style.top = `${2 * spot.top - got.top}px`;
      }
    };
    place();
    const win = popover.current?.ownerDocument.defaultView ?? window;
    const observer =
      typeof ResizeObserver !== 'undefined' && popover.current ? new ResizeObserver(place) : null;
    if (observer && popover.current) observer.observe(popover.current);
    win.addEventListener('resize', place);
    win.addEventListener('scroll', place, true);
    return () => {
      observer?.disconnect();
      win.removeEventListener('resize', place);
      win.removeEventListener('scroll', place, true);
    };
  }, [anchor, popover, open]);
}
