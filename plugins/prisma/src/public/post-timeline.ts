/**
 * Prisma post timeline: the side of the cards for the device's width, the
 * connector between the first and the last marker, filled while scrolling,
 * and the markers lit once they pass the middle of the window.
 */

type Side = 'left' | 'right' | 'center';
interface Sides {
  desktop: Side;
  tablet: Side;
  mobile: Side;
}

const SIDES: Side[] = ['left', 'right', 'center'];
const P = 'pr-post-timeline';

function sideFor(sides: Sides): Side {
  const width = window.innerWidth;
  const side = width <= 767 ? sides.mobile : width <= 976 ? sides.tablet : sides.desktop;
  return SIDES.includes(side) ? side : 'center';
}

/** The classes of the timeline and its posts for a side (center: alternating). */
function applySide(root: HTMLElement, side: Side): void {
  for (const s of SIDES) root.classList.toggle(`${P}--${s}`, s === side);
  root.querySelectorAll<HTMLElement>(`.${P}__item`).forEach((item, i) => {
    const right = side === 'right' || (side === 'center' && i % 2 === 0);
    item.classList.toggle(`${P}__item--right`, right);
    item.classList.toggle(`${P}__item--left`, !right);
    const day = item.querySelector(`.${P}__day`);
    day?.classList.toggle(`${P}__day--right`, right);
    day?.classList.toggle(`${P}__day--left`, !right);
  });
}

/** Center of an element, from the top of the timeline. */
function centerIn(root: HTMLElement, el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  return r.top + r.height / 2 - root.getBoundingClientRect().top;
}

function update(root: HTMLElement, sides: Sides): void {
  applySide(root, sideFor(sides));
  const line = root.querySelector<HTMLElement>(`.${P}__line`);
  const inner = root.querySelector<HTMLElement>(`.${P}__line-inner`);
  const markers = Array.from(root.querySelectorAll<HTMLElement>(`.${P}__marker`));
  if (!line || !inner || markers.length === 0) return;
  const top = centerIn(root, markers[0]!);
  const bottom = root.getBoundingClientRect().height - centerIn(root, markers.at(-1)!);
  line.style.top = `${top}px`;
  line.style.bottom = `${Math.max(0, bottom)}px`;
  // Filled down to the middle of the window.
  const half = window.innerHeight / 2;
  const lineRect = line.getBoundingClientRect();
  inner.style.height = `${Math.min(Math.max(half - lineRect.top, 0), lineRect.height)}px`;
  for (const marker of markers) {
    marker.classList.toggle('is-in-view', marker.getBoundingClientRect().top < half);
  }
}

function initPostTimelines(): void {
  const timelines = Array.from(document.querySelectorAll<HTMLElement>('[data-pr-post-timeline]'))
    .map((root) => {
      try {
        return { root, sides: JSON.parse(root.dataset.prPostTimeline ?? '') as Sides };
      } catch {
        return null;
      }
    })
    .filter((t): t is { root: HTMLElement; sides: Sides } => t !== null);
  if (timelines.length === 0) return;
  let frame = 0;
  const all = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      for (const t of timelines) update(t.root, t.sides);
    });
  };
  window.addEventListener('scroll', all, { passive: true });
  window.addEventListener('resize', all);
  window.addEventListener('load', all);
  all();
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', initPostTimelines);
else initPostTimelines();

export {};
