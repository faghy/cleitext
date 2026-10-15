/**
 * Drag and drop between the panel and the canvas (an iframe), with pointer
 * events: listening on both windows, positions are turned into canvas
 * coordinates, and the element under the pointer decides where the drop goes.
 */
import { getElement } from '../core/registry.js';
import type { FrescoNode } from '../core/model.js';
import { find, placeOf, type Place } from './tree.js';

export interface DropTarget {
  place: Place;
  /** The line showing where it goes, in the canvas document's coordinates. */
  line: { x: number; y: number; width: number; height: number };
}

type Axis = 'row' | 'column';

function axisOf(inner: Element): Axis {
  const style = inner.ownerDocument.defaultView!.getComputedStyle(inner);
  if (style.display.includes('grid')) return 'row';
  return style.flexDirection.startsWith('row') ? 'row' : 'column';
}

function childElements(inner: Element): HTMLElement[] {
  return [...inner.children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.hasAttribute('data-fr-id'),
  );
}

/** Index among siblings where a point falls, and the line before that index. */
function slot(
  siblings: HTMLElement[],
  axis: Axis,
  x: number,
  y: number,
  scroll: { x: number; y: number },
  fallback: DOMRect,
): { index: number; line: DropTarget['line'] } {
  const thick = 3;
  for (const [index, element] of siblings.entries()) {
    const r = element.getBoundingClientRect();
    const before =
      axis === 'row'
        ? y < r.top || (y <= r.bottom && x < r.left + r.width / 2)
        : y < r.top + r.height / 2;
    if (before) {
      return {
        index,
        line:
          axis === 'row'
            ? { x: r.left + scroll.x - thick, y: r.top + scroll.y, width: thick, height: r.height }
            : { x: r.left + scroll.x, y: r.top + scroll.y - thick, width: r.width, height: thick },
      };
    }
  }
  const last = siblings.at(-1)?.getBoundingClientRect();
  if (!last) {
    return {
      index: 0,
      line: {
        x: fallback.left + scroll.x,
        y: fallback.top + scroll.y + fallback.height / 2,
        width: fallback.width,
        height: thick,
      },
    };
  }
  return {
    index: siblings.length,
    line:
      axis === 'row'
        ? { x: last.right + scroll.x, y: last.top + scroll.y, width: thick, height: last.height }
        : { x: last.left + scroll.x, y: last.bottom + scroll.y, width: last.width, height: thick },
  };
}

/** Where a drop at (x, y) of the canvas window goes, or null where it cannot. */
export function dropTarget(
  doc: Document,
  root: HTMLElement,
  blocks: FrescoNode[],
  x: number,
  y: number,
  dragging: string | null,
): DropTarget | null {
  const win = doc.defaultView!;
  const scroll = { x: win.scrollX, y: win.scrollY };
  const hit = doc.elementFromPoint(x, y);
  if (dragging) {
    const draggedEl = root.querySelector(`[data-fr-id="${CSS.escape(dragging)}"]`);
    if (draggedEl && hit && draggedEl.contains(hit)) return null;
  }
  const element = hit?.closest<HTMLElement>('[data-fr-id]');
  if (!element || !root.contains(element)) {
    // Outside every element: at the top level, by height.
    const top = childElements(root.querySelector('.fre-tree') ?? root);
    const s = slot(top, 'column', x, y, scroll, root.getBoundingClientRect());
    return { place: { parent: null, index: s.index }, line: s.line };
  }
  const id = element.dataset.frId!;
  const node = find(blocks, id);
  if (!node) return null;
  const definition = getElement(node.type);
  const r = element.getBoundingClientRect();
  if (definition?.container) {
    const edge = Math.min(12, r.height / 4);
    const place = placeOf(blocks, id);
    // Near the top or bottom edge: next to the container, not inside it.
    if (place && (y - r.top < edge || r.bottom - y < edge)) {
      const after = r.bottom - y < edge;
      return {
        place: { parent: place.parent, index: place.index + (after ? 1 : 0) },
        line: {
          x: r.left + scroll.x,
          y: (after ? r.bottom : r.top) + scroll.y - 1.5,
          width: r.width,
          height: 3,
        },
      };
    }
    const inner = element.querySelector(':scope > .fr-container__in') ?? element;
    const s = slot(
      childElements(inner),
      axisOf(inner),
      x,
      y,
      scroll,
      inner.getBoundingClientRect(),
    );
    return { place: { parent: id, index: s.index }, line: s.line };
  }
  const place = placeOf(blocks, id);
  if (!place) return null;
  const parentInner = element.parentElement;
  const axis = parentInner ? axisOf(parentInner) : 'column';
  const after = axis === 'row' ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
  return {
    place: { parent: place.parent, index: place.index + (after ? 1 : 0) },
    line:
      axis === 'row'
        ? {
            x: (after ? r.right : r.left) + scroll.x - 1.5,
            y: r.top + scroll.y,
            width: 3,
            height: r.height,
          }
        : {
            x: r.left + scroll.x,
            y: (after ? r.bottom : r.top) + scroll.y - 1.5,
            width: r.width,
            height: 3,
          },
  };
}

export interface DragSession {
  /** A new element (from the panel) or an element moved. */
  source:
    { kind: 'new'; type: string; label: string } | { kind: 'move'; id: string; label: string };
}

/**
 * Follows the pointer from a pointerdown until the drop. `onMove` gets canvas
 * coordinates (or null outside the canvas), `onDrop` is called on release.
 */
export function trackPointer(
  start: PointerEvent | React.PointerEvent,
  frame: HTMLIFrameElement,
  handlers: {
    onStart: () => void;
    onMove: (canvas: { x: number; y: number } | null, screen: { x: number; y: number }) => void;
    onDrop: (canvas: { x: number; y: number } | null) => void;
    onCancel: () => void;
  },
): void {
  const frameWindow = frame.contentWindow!;
  const fromFrame = start.view === frameWindow;
  const startX = start.clientX;
  const startY = start.clientY;
  let started = false;
  let last: { x: number; y: number } | null = null;

  const toCanvas = (
    event: PointerEvent,
  ): { canvas: { x: number; y: number } | null; screen: { x: number; y: number } } => {
    const rect = frame.getBoundingClientRect();
    if (event.view === frameWindow) {
      return {
        canvas: { x: event.clientX, y: event.clientY },
        screen: { x: event.clientX + rect.left, y: event.clientY + rect.top },
      };
    }
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    return {
      canvas: inside ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null,
      screen: { x: event.clientX, y: event.clientY },
    };
  };
  const move = (event: PointerEvent) => {
    const { canvas, screen } = toCanvas(event);
    if (!started) {
      const sx =
        fromFrame && event.view !== frameWindow
          ? screen.x - frame.getBoundingClientRect().left
          : event.clientX;
      const sy =
        fromFrame && event.view !== frameWindow
          ? screen.y - frame.getBoundingClientRect().top
          : event.clientY;
      if (Math.hypot(sx - startX, sy - startY) < 5) return;
      started = true;
      handlers.onStart();
    }
    last = canvas;
    handlers.onMove(canvas, screen);
  };
  const end = (event: PointerEvent) => {
    cleanup();
    if (!started) return;
    const { canvas } = toCanvas(event);
    handlers.onDrop(canvas ?? last);
  };
  const key = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    cleanup();
    if (started) handlers.onCancel();
  };
  const cleanup = () => {
    for (const win of [window, frameWindow]) {
      win.removeEventListener('pointermove', move);
      win.removeEventListener('pointerup', end);
      win.removeEventListener('keydown', key);
    }
  };
  for (const win of [window, frameWindow]) {
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', end);
    win.addEventListener('keydown', key);
  }
}
