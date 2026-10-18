/**
 * Content timelines of Prisma on the site: the connector line between the
 * first and the last marker fills while the page scrolls, and markers that
 * reach the middle of the window take their "focus" colors.
 */
import { updateTimeline } from '../blocks/content-timeline/timeline';

const timelines = () =>
  [...document.querySelectorAll<HTMLElement>('[data-pr-content-timeline]')]
    .map((line) => line.parentElement)
    .filter((t): t is HTMLElement => t !== null);

let frame = 0;
function update() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => timelines().forEach(updateTimeline));
}

function init() {
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  // Images and fonts change the items' heights after the first draw.
  window.addEventListener('load', update);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

export {};
