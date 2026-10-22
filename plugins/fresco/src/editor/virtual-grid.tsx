/**
 * A grid of many same-sized cells (icons, media) that draws only the rows in
 * view. Its rows have a fixed height, so the grid never squeezes them to fit
 * the dialog, whatever the number of cells.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface GridWindow {
  columns: number;
  /** Width of one column, px. */
  cell: number;
  rowHeight: number;
  /** Cells drawn: [start, end). */
  start: number;
  end: number;
  /** Space above the first row drawn, px. */
  offset: number;
  /** Height of all the rows, px. */
  total: number;
}

/** Which cells a grid shows at a scroll position. */
export function gridWindow(input: {
  /** Inner width and height of the scrolling box, px (padding excluded). */
  width: number;
  height: number;
  scrollTop: number;
  count: number;
  minCell: number;
  gap: number;
  /** A number, or the height for a column width (square thumbnails). */
  rowHeight: number | ((cell: number) => number);
  /** Rows drawn beyond the view, above and below. */
  overscan?: number;
}): GridWindow {
  const { width, height, scrollTop, count, minCell, gap } = input;
  const overscan = input.overscan ?? 3;
  const columns = Math.max(1, Math.floor((Math.max(width, minCell) + gap) / (minCell + gap)));
  const cell = Math.max(0, (width - gap * (columns - 1)) / columns);
  const rowHeight = Math.max(
    1,
    Math.round(typeof input.rowHeight === 'function' ? input.rowHeight(cell) : input.rowHeight),
  );
  const rows = Math.ceil(count / columns);
  const step = rowHeight + gap;
  const total = rows > 0 ? rows * step - gap : 0;
  const first = Math.max(0, Math.floor(scrollTop / step) - overscan);
  // Before the box is measured, a first screenful.
  const visible = Math.ceil((height || 600) / step) + 1;
  const last = Math.min(rows, first + visible + overscan * 2);
  return {
    columns,
    cell,
    rowHeight,
    start: first * columns,
    end: Math.min(count, last * columns),
    offset: first * step,
    total,
  };
}

export function VirtualGrid<T>({
  items,
  minCell,
  rowHeight,
  gap = 10,
  className,
  render,
}: {
  items: readonly T[];
  minCell: number;
  rowHeight: number | ((cell: number) => number);
  gap?: number;
  className?: string;
  render: (item: T, index: number) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      setSize({ width: element.clientWidth - padX, height: element.clientHeight - padY });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // A new list (a search) starts from the top.
  useLayoutEffect(() => {
    if (box.current) box.current.scrollTop = 0;
    setScrollTop(0);
  }, [items]);
  const view = gridWindow({
    width: size.width,
    height: size.height,
    scrollTop,
    count: items.length,
    minCell,
    gap,
    rowHeight,
  });
  return (
    <div
      ref={box}
      className={`fre-vgrid${className ? ` ${className}` : ''}`}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ position: 'relative', height: view.total }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: view.offset,
            display: 'grid',
            gridTemplateColumns: `repeat(${view.columns}, minmax(0, 1fr))`,
            gridAutoRows: `${view.rowHeight}px`,
            gap,
          }}
        >
          {items.slice(view.start, view.end).map((item, i) => render(item, view.start + i))}
        </div>
      </div>
    </div>
  );
}
