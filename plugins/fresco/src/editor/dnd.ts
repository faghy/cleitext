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
  /** Into an empty container: `line` is the container's inside. */
  empty?: boolean;
}

export type Axis = 'row' | 'column';

function axisOf(inner: Element): Axis {
  const style = inner.ownerDocument.defaultView!.getComputedStyle(inner);
  if (style.display.includes('grid')) return 'row';
  // Only a flex box lays its children in a row (the page's own column never does).
  return style.display.includes('flex') && style.flexDirection.startsWith('row') ? 'row' : 'column';
}

/**
 * The elements inside a container. They live in the canvas's own window, so
 * `instanceof HTMLElement` (the admin's) would never match them.
 */
function childElements(inner: Element): HTMLElement[] {
  return [...inner.children].filter((child): child is HTMLElement =>
    child.hasAttribute('data-fr-id'),
  );
}

/** A box with room: wrappers shown with `display: contents` have none of their own. */
function boxOf(element: Element): DOMRect {
  let current: Element | null = element;
  while (current) {
    const r = current.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) return r;
    current = current.parentElement;
  }
  return element.getBoundingClientRect();
}

const THICK = 3;

/** The line before (or after) an element, across the axis of its parent. */
function lineAt(r: DOMRect, axis: Axis, after: boolean, scroll: { x: number; y: number }) {
  return axis === 'row'
    ? {
        x: (after ? r.right : r.left) + scroll.x - THICK / 2,
        y: r.top + scroll.y,
        width: THICK,
        height: r.height,
      }
    : {
        x: r.left + scroll.x,
        y: (after ? r.bottom : r.top) + scroll.y - THICK / 2,
        width: r.width,
        height: THICK,
      };
}

/** Index among siblings where a point falls, and the line before that index. */
export function slot(
  siblings: { getBoundingClientRect(): DOMRect }[],
  axis: Axis,
  x: number,
  y: number,
  scroll: { x: number; y: number },
): { index: number; line: DropTarget['line'] } | null {
  for (const [index, element] of siblings.entries()) {
    const r = element.getBoundingClientRect();
    const before =
      axis === 'row'
        ? y < r.top || (y <= r.bottom && x < r.left + r.width / 2)
        : y < r.top + r.height / 2;
    if (before) return { index, line: lineAt(r, axis, false, scroll) };
  }
  const last = siblings.at(-1)?.getBoundingClientRect();
  return last ? { index: siblings.length, line: lineAt(last, axis, true, scroll) } : null;
}

/** Where a drop at (x, y) of the canvas window goes, or null where it cannot. */
export function dropTarget(
  doc: Document,
  root: HTMLElement,
  blocks: FrescoNode[],
  x: number,
  y: number,
  dragging: string | null,
  /** Type of what is dragged, for containers that accept only some types. */
  type: string,
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
    const tree = root.querySelector('.fre-tree') ?? root;
    const s = slot(childElements(tree), 'column', x, y, scroll);
    if (s) return { place: { parent: null, index: s.index }, line: s.line };
    const r = boxOf(tree.querySelector('.fre-add') ?? tree);
    return {
      place: { parent: null, index: 0 },
      line: { x: r.left + scroll.x, y: r.top + scroll.y, width: r.width, height: THICK },
    };
  }
  const id = element.dataset.frId!;
  const node = find(blocks, id);
  if (!node) return null;
  const definition = getElement(node.type);
  const r = element.getBoundingClientRect();
  const place = placeOf(blocks, id);
  const parentAxis = element.parentElement ? axisOf(element.parentElement) : 'column';
  if (definition?.container && (!definition.accepts || definition.accepts(type))) {
    const inner = element.querySelector(':scope > .fr-container__in') ?? element;
    const siblings = childElements(inner);
    // Near the edges of a container with elements: next to it, not inside it.
    // An empty one takes the whole drop, as its "+" invites.
    const size = parentAxis === 'row' ? r.width : r.height;
    const edge = siblings.length ? Math.min(12, size / 4) : 0;
    const from = parentAxis === 'row' ? x - r.left : y - r.top;
    const to = parentAxis === 'row' ? r.right - x : r.bottom - y;
    if (place && (from < edge || to < edge)) {
      const after = to < edge;
      return {
        place: { parent: place.parent, index: place.index + (after ? 1 : 0) },
        line: lineAt(r, parentAxis, after, scroll),
      };
    }
    const s = slot(siblings, axisOf(inner), x, y, scroll);
    if (s) return { place: { parent: id, index: s.index }, line: s.line };
    const box = inner.getBoundingClientRect();
    return {
      place: { parent: id, index: 0 },
      line: { x: box.left + scroll.x, y: box.top + scroll.y, width: box.width, height: box.height },
      empty: true,
    };
  }
  if (!place) return null;
  const after = parentAxis === 'row' ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
  return {
    place: { parent: place.parent, index: place.index + (after ? 1 : 0) },
    line: lineAt(r, parentAxis, after, scroll),
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
