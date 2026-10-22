/**
 * Shape dividers of containers: shapes at the top or bottom edge, filled
 * with a color. Each is drawn for the top edge: the colored part hangs from
 * the top of the box (the bottom edge turns it upside down). The "negative"
 * variant fills the other side of the line. Some shapes have layers of
 * different opacity instead of one path.
 */

export interface Shape {
  label: string;
  path: string;
  negative?: string;
  /** Several paths with their opacity (drawn instead of `path`). */
  layers?: { d: string; opacity: number }[];
  /** Default `0 0 1000 100`. */
  viewBox?: string;
  /** `preserveAspectRatio`; default `none` (stretched to the width). */
  aspect?: string;
}

type Point = [number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;
const pt = (p: Point) => `${r1(p[0])},${r1(p[1])}`;

/** A line through the points, left to right, as path commands (after its `M`). */
const polyline = (points: Point[]) => points.map((p, i) => `${i ? 'L' : 'M'}${pt(p)}`).join('');

/** A smooth line through the points (Catmull-Rom as cubic Béziers), left to right. */
function smooth(points: Point[]): string {
  let d = `M${pt(points[0]!)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(i + 2, points.length - 1)]!;
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}

/**
 * The two fills of a line drawn from x = 0 to x = 1000: above it (the
 * shape) and below it down to `height` (its negative).
 */
function fills(line: string, height = 100) {
  return { path: `${line}V0H0Z`, negative: `${line}V${height}H0Z` };
}

/** A pseudo-random sequence (always the same), for irregular shapes. */
function wobble(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ---- The new shapes ----------------------------------------------------------------------

const mountains: Shape = {
  label: 'Mountains',
  path: '',
  layers: [
    {
      opacity: 0.33,
      d: `${smooth([
        [0, 62],
        [140, 74],
        [290, 44],
        [460, 88],
        [640, 22],
        [800, 70],
        [1000, 56],
      ])}V0H0Z`,
    },
    {
      opacity: 0.66,
      d: `${smooth([
        [0, 44],
        [170, 58],
        [350, 26],
        [520, 70],
        [700, 18],
        [860, 52],
        [1000, 38],
      ])}V0H0Z`,
    },
    {
      opacity: 1,
      d: `${smooth([
        [0, 26],
        [190, 40],
        [390, 12],
        [570, 46],
        [760, 10],
        [900, 34],
        [1000, 20],
      ])}V0H0Z`,
    },
  ],
};

/** Drips hanging from a band, rounded at the end, of different lengths. */
function dropsLine(): string {
  const random = wobble(7);
  let d = 'M0,10';
  let x = 0;
  while (x < 1000) {
    const gap = 14 + random() * 22;
    const width = 10 + random() * 14;
    const depth = 22 + random() * 72;
    const start = Math.min(x + gap, 1000);
    d += `L${r1(start)},10`;
    if (start + width >= 1000) break;
    d += `C${r1(start + 1)},${r1(depth * 0.55)} ${r1(start - 2)},${r1(depth)} ${r1(start + width / 2)},${r1(depth)}`;
    d += `C${r1(start + width + 2)},${r1(depth)} ${r1(start + width - 1)},${r1(depth * 0.55)} ${r1(start + width)},10`;
    x = start + width;
  }
  return `${d}L1000,10`;
}

/** Round puffs of different sizes along the edge. */
function cloudsLine(): string {
  const random = wobble(23);
  let d = 'M0,30';
  let x = 0;
  while (x < 1000) {
    const radius = Math.min(18 + random() * 34, (1000 - x) / 2);
    if (radius < 4) break;
    const base = 22 + random() * 18;
    d += `L${r1(x)},${r1(base)}A${r1(radius)},${r1(radius * 1.1)} 0 0 0 ${r1(x + radius * 2)},${r1(base)}`;
    x += radius * 2;
  }
  return `${d}L1000,30`;
}

/** Small even teeth. */
function zigzagLine(): string {
  const points: Point[] = [[0, 0.4]];
  for (let x = 0; x < 1000; x += 6.25) {
    points.push([x + 3.125, 3.2], [x + 6.25, 0.4]);
  }
  return polyline(points);
}

/** A sine-like ripple repeated along the edge. */
function ripplesLine(): string {
  let d = 'M0,2';
  for (let x = 0; x < 1000; x += 10) d += `Q${x + 2.5},3.9 ${x + 5},2T${x + 10},2`;
  return d;
}

const drops = fills(dropsLine());
const clouds = fills(cloudsLine());
const pyramids = fills(
  polyline([
    [0, 6],
    [270, 92],
    [540, 34],
    [690, 60],
    [850, 18],
    [1000, 6],
  ]),
);
const triangleAsym = fills(
  polyline([
    [0, 4],
    [690, 97],
    [1000, 4],
  ]),
);
const book = fills('M0,98C230,100 440,44 500,3C560,44 770,100 1000,98');
const split = fills('M0,3H476C490,3 500,9 500,19C500,9 510,3 524,3H1000', 20);
const arrow = fills('M0,0H486L500,14L514,0H1000', 14);
const zigzag = fills(zigzagLine(), 3.6);
const ripples = fills(ripplesLine(), 4);

export const SHAPES: Record<string, Shape> = {
  // The first five, as they always were.
  tilt: { label: 'Tilt', path: 'M0,6V0h1000v100L0,6z' },
  triangle: {
    label: 'Triangle',
    path: 'M500,98.9L0,6.1V0h1000v6.1L500,98.9z',
    negative: 'M500.2,94.7L0,0v100h1000V0L500.2,94.7z',
  },
  curve: {
    label: 'Curve',
    path: 'M1000,4.3V0H0v4.3C0.9,23.1,126.7,99.2,500,100S1000,22.7,1000,4.3z',
    negative: 'M500,97C126.7,96.3,0.8,19.8,0,0v100l1000,0V1C1000,19.4,873.3,97.8,500,97z',
  },
  'curve-asymmetrical': {
    label: 'Curve, asymmetrical',
    path: 'M0,0c0,0,0,6,0,6.7c0,18,240.2,93.6,615.2,92.6C989.8,98.5,1000,25,1000,6.7c0-0.7,0-6.7,0-6.7H0z',
    negative: 'M615.2,96.7C240.2,97.8,0,18.9,0,0v100h1000V0C1000,19.2,989.8,96,615.2,96.7z',
  },
  waves: {
    label: 'Waves',
    path: 'M421.9,6.5c22.6-2.5,51.5,0.4,75.5,5.3c23.6,4.9,70.9,23.5,100.5,35.7c75.8,32.2,133.7,44.5,192.6,49.7c23.6,2.1,48.7,3.5,103.4-2.5c54.7-6,106.2-25.6,106.2-25.6V0H0v30.3c0,0,72,32.6,158.4,30.5c39.2-0.7,92.8-6.7,134-22.4c21.2-8.1,52.2-18.2,79.7-24.2C399.3,7.9,411.6,7.5,421.9,6.5z',
  },
  mountains,
  drops: { label: 'Drops', ...drops, aspect: 'xMidYMax slice' },
  clouds: { label: 'Clouds', ...clouds, aspect: 'xMidYMax slice' },
  zigzag: { label: 'Zigzag', path: zigzag.path, viewBox: '0 0 1000 3.6' },
  pyramids: { label: 'Pyramids', ...pyramids },
  'triangle-asymmetrical': { label: 'Triangle, asymmetrical', ...triangleAsym },
  'opacity-tilt': {
    label: 'Tilt, layered',
    path: '',
    layers: [
      { opacity: 0.25, d: 'M0,2L1000,98V0H0Z' },
      { opacity: 0.5, d: 'M0,2L1000,66V0H0Z' },
      { opacity: 1, d: 'M0,2L1000,34V0H0Z' },
    ],
  },
  'opacity-fan': {
    label: 'Fan, layered',
    path: '',
    layers: [
      { opacity: 0.33, d: 'M0,96L500,18L1000,96V0H0Z' },
      { opacity: 0.33, d: 'M0,64L500,18L1000,64V0H0Z' },
      { opacity: 0.33, d: 'M0,34L500,18L1000,34V0H0Z' },
      { opacity: 1, d: 'M0,18H1000V0H0Z' },
    ],
  },
  'wave-brush': {
    label: 'Brush stroke',
    path: `${smooth([
      [0, 38],
      [70, 52],
      [140, 44],
      [220, 62],
      [300, 30],
      [380, 40],
      [470, 84],
      [560, 90],
      [640, 56],
      [710, 40],
      [790, 54],
      [870, 34],
      [940, 50],
      [1000, 30],
    ])}V0H0Z`,
  },
  'waves-pattern': {
    label: 'Ripples',
    path: ripples.path,
    viewBox: '0 0 1000 4',
    aspect: 'xMidYMin slice',
  },
  book: { label: 'Book', ...book },
  split: { label: 'Split', ...split, viewBox: '0 0 1000 20' },
  arrow: { label: 'Arrow', ...arrow, viewBox: '0 0 1000 14' },
};

export const SHAPE_OPTIONS = [
  { value: '', label: 'None' },
  ...Object.entries(SHAPES).map(([value, shape]) => ({ value, label: shape.label })),
];
