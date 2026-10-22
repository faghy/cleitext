/**
 * Mask shapes of the Advanced tab: simple shapes drawn here (polygons,
 * ellipses, a flower, a blob…), written into the CSS as SVG data addresses.
 */

type Point = [number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A regular polygon of `sides` sides around (50, 50), the first vertex at `start` degrees. */
function polygon(sides: number, start: number): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = ((start + (360 / sides) * i) * Math.PI) / 180;
    return [50 + 50 * Math.cos(angle), 50 + 50 * Math.sin(angle)] as Point;
  });
}

/** An SVG of a polygon, its view box fitted to the points. */
function polygonSvg(points: Point[], extra = ''): string {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const box = `${r1(x0)} ${r1(y0)} ${r1(Math.max(...xs) - x0)} ${r1(Math.max(...ys) - y0)}`;
  return svg(
    box,
    `<polygon points='${points.map((p) => p.map(r1).join(',')).join(' ')}'${extra}/>`,
  );
}

/** A closed curve through the points (Catmull-Rom turned into cubic Béziers). */
export function smoothClosed(points: Point[]): string {
  const n = points.length;
  let d = `M${points[0]!.map(r1).join(',')}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1.map(r1).join(',')} ${c2.map(r1).join(',')} ${p2.map(r1).join(',')}`;
  }
  return `${d}Z`;
}

/** Points around (50, 50) at the given distances, evenly spread. */
function around(radii: number[], start = -90): Point[] {
  return radii.map((r, i) => {
    const angle = ((start + (360 / radii.length) * i) * Math.PI) / 180;
    return [50 + r * Math.cos(angle), 50 + r * Math.sin(angle)] as Point;
  });
}

const svg = (viewBox: string, body: string) =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'>${body}</svg>`;

const flower = svg(
  '0 0 100 100',
  `<circle cx='50' cy='50' r='30'/>${Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return `<circle cx='${r1(50 + 30 * Math.cos(a))}' cy='${r1(50 + 30 * Math.sin(a))}' r='19'/>`;
  }).join('')}`,
);

/** The SVG of each mask shape. */
const SVGS: Record<string, string> = {
  circle: svg('0 0 100 100', "<circle cx='50' cy='50' r='50'/>"),
  'oval-vertical': svg('0 0 70 100', "<ellipse cx='35' cy='50' rx='35' ry='50'/>"),
  'oval-horizontal': svg('0 0 100 70', "<ellipse cx='50' cy='35' rx='50' ry='35'/>"),
  'pill-vertical': svg('0 0 50 100', "<rect width='50' height='100' rx='25'/>"),
  'pill-horizontal': svg('0 0 100 50', "<rect width='100' height='50' rx='25'/>"),
  triangle: polygonSvg([
    [50, 0],
    [100, 86.6],
    [0, 86.6],
  ]),
  diamond: polygonSvg([
    [50, 0],
    [100, 50],
    [50, 100],
    [0, 50],
  ]),
  pentagon: polygonSvg(polygon(5, -90)),
  'hexagon-vertical': polygonSvg(polygon(6, -90)),
  'hexagon-horizontal': polygonSvg(polygon(6, 0)),
  heptagon: polygonSvg(polygon(7, -90)),
  octagon: polygonSvg(polygon(8, 22.5)),
  'parallelogram-right': polygonSvg([
    [25, 0],
    [100, 0],
    [75, 70],
    [0, 70],
  ]),
  'parallelogram-left': polygonSvg([
    [0, 0],
    [75, 0],
    [100, 70],
    [25, 70],
  ]),
  'trapezoid-up': polygonSvg([
    [22, 0],
    [78, 0],
    [100, 70],
    [0, 70],
  ]),
  'trapezoid-down': polygonSvg([
    [0, 0],
    [100, 0],
    [78, 70],
    [22, 70],
  ]),
  flower,
  sketch: svg(
    '0 0 100 100',
    `<path d='${smoothClosed([
      [6, 9],
      [38, 3],
      [71, 6],
      [96, 4],
      [93, 35],
      [97, 68],
      [94, 96],
      [61, 93],
      [30, 97],
      [3, 95],
      [7, 62],
      [2, 33],
    ])}'/>`,
  ),
  // A hexagon with rounded corners (drawn with a thick round-joined outline).
  hexagon: polygonSvg(
    polygon(6, -90).map(([x, y]) => [50 + (x - 50) * 0.86, 50 + (y - 50) * 0.86] as Point),
    " stroke='#000' stroke-width='14' stroke-linejoin='round'",
  ).replace(/viewBox='[^']*'/, "viewBox='0 0 100 100'"),
  blob: svg('0 0 100 100', `<path d='${smoothClosed(around([48, 41, 47, 44, 49, 39, 46, 43]))}'/>`),
};

export const MASK_SHAPES: { value: string; label: string }[] = [
  { value: 'circle', label: 'Circle' },
  { value: 'oval-vertical', label: 'Oval, vertical' },
  { value: 'oval-horizontal', label: 'Oval, horizontal' },
  { value: 'pill-vertical', label: 'Pill, vertical' },
  { value: 'pill-horizontal', label: 'Pill, horizontal' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'hexagon-vertical', label: 'Hexagon, vertical' },
  { value: 'hexagon-horizontal', label: 'Hexagon, horizontal' },
  { value: 'heptagon', label: 'Heptagon' },
  { value: 'octagon', label: 'Octagon' },
  { value: 'parallelogram-right', label: 'Parallelogram, right' },
  { value: 'parallelogram-left', label: 'Parallelogram, left' },
  { value: 'trapezoid-up', label: 'Trapezoid, up' },
  { value: 'trapezoid-down', label: 'Trapezoid, down' },
  { value: 'flower', label: 'Flower' },
  { value: 'sketch', label: 'Sketch' },
  { value: 'hexagon', label: 'Hexagon, rounded' },
  { value: 'blob', label: 'Blob' },
  { value: 'custom', label: 'Custom image' },
];

/** `url("data:…")` of each shape, for the mask control's dictionary (`custom`: the image control). */
export const MASK_URLS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(SVGS).map(([name, body]) => [
      name,
      `url("data:image/svg+xml,${encodeURIComponent(body)}")`,
    ]),
  ),
  custom: '',
};
