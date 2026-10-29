import { useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * A small SVG chart for the shop's reports: the range as a line (or bars)
 * and the period it is compared with as a dashed grey line, one axis, a
 * crosshair with the values under the pointer. Colours are the admin's
 * palette variables, so it follows the dark theme.
 */

export interface ChartSeries {
  label: string;
  /** One value per interval; the compared series is matched by position. */
  points: { date: string; value: number }[];
}

/** The drawing's width before the box is measured; then the box's own, so text keeps its size. */
const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 56 };

/** 1, 2, 2.5 or 5 times a power of ten: the step of the axis. */
function niceStep(max: number, ticks: number): number {
  const raw = max / ticks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}

export function Chart({
  current,
  previous,
  kind = 'line',
  format,
  dateLabel,
  title,
}: {
  current: ChartSeries;
  previous?: ChartSeries | null;
  kind?: 'line' | 'bar';
  format: (value: number) => string;
  /** A short label of an interval's first day, for the axis and the tooltip. */
  dateLabel: (date: string) => string;
  title: string;
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(WIDTH);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const measured = Math.round(entry?.contentRect.width ?? 0);
      if (measured > 0) setWidth(measured);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const count = current.points.length;
  const values = [
    ...current.points.map((p) => p.value),
    ...(previous?.points.map((p) => p.value) ?? []),
  ];
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const step = niceStep(Math.max(max - min, 1e-9) || 1, 4) || 1;
  const top = max > 0 ? Math.ceil(max / step) * step : step;
  const bottom = min < 0 ? Math.floor(min / step) * step : 0;
  const ticks = useMemo(() => {
    const list: number[] = [];
    // Nothing in the range: one line at zero, not a scale of tiny steps.
    if (max === 0 && min === 0) return [0];
    for (let v = bottom; v <= top + step / 2 && list.length < 12; v += step) list.push(v);
    return list;
  }, [bottom, top, step, max, min]);

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = plotW / Math.max(count, 1);
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + plotH - ((v - bottom) / (top - bottom || 1)) * plotH;
  const path = (series: ChartSeries) =>
    series.points
      .slice(0, count)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ');
  // About eight dates on the axis, whatever the number of intervals.
  const every = Math.max(1, Math.ceil(count / 8));

  const pointAt = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || count === 0) return null;
    const at = ((clientX - box.left) / box.width) * width;
    return Math.min(count - 1, Math.max(0, Math.floor((at - PAD.left) / band)));
  };

  const barW = Math.max(2, Math.min(28, band - 4) / (previous ? 2 : 1) - (previous ? 1 : 0));
  const bar = (value: number, i: number, offset: number, fill: string, key: string) => {
    const y0 = y(0);
    const y1 = y(value);
    const h = Math.abs(y0 - y1);
    const r = Math.min(4, barW / 2, h);
    const left = x(i) + offset - barW / 2;
    const up = value >= 0;
    // Rounded at the end away from the baseline.
    const d = up
      ? `M${left},${y0} V${y1 + r} Q${left},${y1} ${left + r},${y1} H${left + barW - r} Q${left + barW},${y1} ${left + barW},${y1 + r} V${y0} Z`
      : `M${left},${y0} V${y1 - r} Q${left},${y1} ${left + r},${y1} H${left + barW - r} Q${left + barW},${y1} ${left + barW},${y1 - r} V${y0} Z`;
    return <path key={key} d={d} fill={fill} />;
  };

  const shown = hover ?? null;
  return (
    <figure className="sh-chart" aria-labelledby={`${id}-title`}>
      <div className="sh-row sh-between">
        <figcaption id={`${id}-title`} className="sh-chart-title">
          {title}
        </figcaption>
        <div className="sh-row sh-small sh-muted" aria-hidden="true">
          <span className="sh-legend">
            <i className="sh-legend-now" />
            {current.label}
          </span>
          {previous && (
            <span className="sh-legend">
              <i className="sh-legend-before" />
              {previous.label}
            </span>
          )}
        </div>
      </div>
      <div className="sh-chart-box" ref={boxRef}>
        <svg
          ref={svg}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={title}
          onPointerMove={(e) => setHover(pointAt(e.clientX))}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--sh-line)"
                strokeWidth={v === 0 ? 1.5 : 1}
              />
              <text
                x={PAD.left - 8}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--sh-muted)"
                fontSize="11"
              >
                {format(v)}
              </text>
            </g>
          ))}
          {current.points.map((p, i) =>
            i % every === 0 ? (
              <text
                key={p.date}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor="middle"
                fill="var(--sh-muted)"
                fontSize="11"
              >
                {dateLabel(p.date)}
              </text>
            ) : null,
          )}
          {shown !== null && (
            <rect
              x={PAD.left + band * shown}
              y={PAD.top}
              width={band}
              height={plotH}
              fill="var(--color-slate-100)"
              opacity={kind === 'bar' ? 0.8 : 0}
            />
          )}
          {kind === 'bar' ? (
            <g>
              {previous?.points
                .slice(0, count)
                .map((p, i) => bar(p.value, i, -barW / 2 - 1, 'var(--color-slate-500)', `b${i}`))}
              {current.points.map((p, i) =>
                bar(p.value, i, previous ? barW / 2 + 1 : 0, 'var(--color-sky-600)', `c${i}`),
              )}
            </g>
          ) : (
            <g fill="none" strokeLinejoin="round" strokeLinecap="round">
              {previous && (
                <path
                  d={path(previous)}
                  stroke="var(--color-slate-500)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
              )}
              <path d={path(current)} stroke="var(--color-sky-600)" strokeWidth={2} />
              {count === 1 && (
                <circle
                  cx={x(0)}
                  cy={y(current.points[0]!.value)}
                  r={4}
                  fill="var(--color-sky-600)"
                />
              )}
            </g>
          )}
          {shown !== null && kind === 'line' && (
            <g>
              <line
                x1={x(shown)}
                x2={x(shown)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--color-slate-400)"
                strokeWidth={1}
              />
              {previous?.points[shown] && (
                <circle
                  cx={x(shown)}
                  cy={y(previous.points[shown]!.value)}
                  r={4}
                  fill="var(--color-slate-500)"
                  stroke="var(--sh-card)"
                  strokeWidth={2}
                />
              )}
              <circle
                cx={x(shown)}
                cy={y(current.points[shown]!.value)}
                r={4.5}
                fill="var(--color-sky-600)"
                stroke="var(--sh-card)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
        {shown !== null && current.points[shown] && (
          <div
            className="sh-tooltip"
            role="status"
            style={{
              left: `${(x(shown) / width) * 100}%`,
              transform: `translateX(${x(shown) > width * 0.6 ? 'calc(-100% - 12px)' : '12px'})`,
            }}
          >
            <div>
              <i className="sh-legend-now" /> {dateLabel(current.points[shown]!.date)}:{' '}
              <strong>{format(current.points[shown]!.value)}</strong>
            </div>
            {previous?.points[shown] && (
              <div className="sh-muted">
                <i className="sh-legend-before" /> {dateLabel(previous.points[shown]!.date)}:{' '}
                <strong>{format(previous.points[shown]!.value)}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}
