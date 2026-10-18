/**
 * Shape dividers of containers, drawn for Prisma. Each hangs from the top
 * edge (filled at y=0); bottom dividers are turned over by the `invert`
 * class. Proportions follow the shapes they replace, so imported sizes fit.
 */
interface Shape {
  viewBox: string;
  /** `none` stretches it to the divider's box; slices keep its proportions. */
  aspect: string;
  /** Paths with their opacity (1 when not given). */
  paths: [string, number?][];
}

const SHAPES: Record<string, Shape> = {
  tilt: { viewBox: '0 0 1000 100', aspect: 'none', paths: [['M0 0h1000v100L0 4z']] },
  mountains: {
    viewBox: '0 0 1000 100',
    aspect: 'none',
    paths: [
      [
        'M0 0h1000v60c-60-22-110 20-180 6S700 18 640 40s-120 10-190-14-140 24-210 14S120 22 60 44C38 52 18 50 0 46z',
        0.33,
      ],
      [
        'M0 0h1000v44c-70 30-130-18-200 4s-110 34-180 10-130-20-200 6-140 10-200-14S90 34 0 52z',
        0.66,
      ],
      ['M0 0h1000v24c-80 28-150-12-220 10S650 54 580 30 450 6 380 30s-140 20-210-4S60 22 0 30z'],
    ],
  },
  wave_brush: {
    viewBox: '0 0 283.5 27.8',
    aspect: 'none',
    paths: [
      [
        'M0 0h283.5v9.6c-18 4.6-33 1.4-48 6.4-14 4.6-27 9.4-44 6.6-15-2.4-27-9.2-43-8.4-17 .8-30 9.8-47 10-15 .2-27-7-42-8.6-18-2-31 6.2-48 5.6C6 20.8 2 19 0 17.6z',
      ],
      ['M52 22.6c3-1 6.6-.6 8.4 1.2-3 .9-6.2.6-8.4-1.2z'],
      ['M121 25.4c2.4-1.2 5.6-1 7.6.4-2.6 1-5.2.8-7.6-.4z'],
      ['M196 24.6c2.6-.8 5.2-.4 6.8 1-2.4.8-4.8.6-6.8-1z'],
      ['M243 18.2c2-.8 4.4-.6 5.8.6-2 .8-4 .6-5.8-.6z'],
    ],
  },
  waves: {
    viewBox: '0 0 1000 100',
    aspect: 'none',
    paths: [
      [
        'M0 0h1000v46c-58 22-104 52-170 50-88-3-128-68-226-78-96-10-138 40-232 44C258 66 182 28 104 24 60 22 26 30 0 40z',
      ],
    ],
  },
  wave_pattern: {
    viewBox: '0 0 1047.1 3.7',
    aspect: 'xMidYMin slice',
    paths: [
      [
        `M0 0h1047.1v1.6${Array.from({ length: 48 }, () => 'c-5.4 2.8-16.4 2.8-21.8 0').join('')}V0z`,
      ],
    ],
  },
  triangle: { viewBox: '0 0 1000 100', aspect: 'none', paths: [['M0 0h1000v2L500 98 0 2z']] },
  drops: {
    viewBox: '0 0 283.5 27.8',
    aspect: 'xMidYMax slice',
    paths: [
      [
        'M0 0h283.5v8.8c-6 0-7 6.4-12 6.4s-4.6-6.4-10.4-6.4c-5.6 0-5.8 12.6-12.2 12.6s-6.6-12.6-12.4-12.6c-5.4 0-6 4.8-11 4.8s-5.6-4.8-11.4-4.8c-6 0-6 14.6-12.6 14.6S205 8.8 199 8.8c-5.4 0-5.4 6-10.8 6s-5.2-6-11-6c-6 0-6.4 10-12.6 10s-6.4-10-12.4-10c-5.6 0-5.4 4.4-10.8 4.4s-5.6-4.4-11.2-4.4c-6.2 0-6.6 16.8-13.4 16.8s-6.8-16.8-13-16.8c-5.6 0-5.6 7.2-11.2 7.2S87.8 8.8 82.4 8.8c-6 0-6.4 11.6-12.8 11.6S63 8.8 57 8.8c-5.4 0-5.8 5.2-11 5.2S40.6 8.8 35 8.8c-6 0-6.4 13.4-12.8 13.4S16 8.8 10.2 8.8C4.6 8.8 4.4 12 0 12z',
      ],
    ],
  },
  clouds: {
    viewBox: '0 0 283.5 27.8',
    aspect: 'xMidYMax slice',
    paths: [
      [
        'M0 0h283.5v15.4c-3.6-3.8-9.4-4.6-13.8-1.6-2-6.6-9.6-9.8-15.8-6.4-3.6-5-10.8-6-15.4-2-4.2-5.2-12.2-5.8-17-1.2-4.8-4.4-12.6-4-16.8 1-4.8-3.6-11.8-2.8-15.4 2-5.6-3.2-12.8-.8-15.2 5.2-4.6-2.2-10.2-.6-12.6 3.8-4.8-4.6-12.8-4.2-17 .8-4.4-4.4-11.8-4.2-15.8.6-5-3-11.6-1.2-14.2 4-4.6-3.6-11.4-2.6-14.8 2.2-5-2.6-11.2-.4-13.4 4.8-4.4-2.4-10-.8-12.4 3.6-4.6-3-10.8-1.6-13.6 3-4.4-2.2-9.8-.6-12 3.8-4.2-2.6-9.6-1.6-12.6 2.4-3.4-1.4-7.4-.8-10.2 1.4z',
      ],
    ],
  },
  zigzag: {
    viewBox: '0 0 1800 5.8',
    aspect: 'none',
    paths: [[`M0 0h1800v.2${Array.from({ length: 90 }, () => 'l-10 5.6-10-5.6').join('')}z`]],
  },
  pyramids: {
    viewBox: '0 0 1000 100',
    aspect: 'none',
    paths: [['M0 0h1000v2l-90 26-80-24-80 50-68-40-60 20-88-12-198 90L156 18 0 4z']],
  },
  triangle_asymmetrical: {
    viewBox: '0 0 1000 100',
    aspect: 'none',
    paths: [['M0 0h1000v2L740 98 0 2z']],
  },
  tilt_opacity: {
    viewBox: '0 0 2600 131.1',
    aspect: 'none',
    paths: [['M0 0h2600L0 26z'], ['M0 0h2600v66L0 4z', 0.5], ['M0 0h2600L0 131.1z', 0.25]],
  },
  fan_opacity: {
    viewBox: '0 0 283.5 19.6',
    aspect: 'none',
    paths: [
      ['M0 0h283.5v19.4L141.75 2 0 19.4z', 0.33],
      ['M0 0h283.5v13L141.75 2 0 13z', 0.33],
      ['M0 0h283.5v7L141.75 2 0 7z', 0.33],
      ['M0 0h283.5v3.2L141.75 1.2 0 3.2z'],
    ],
  },
  curve: { viewBox: '0 0 1000 100', aspect: 'none', paths: [['M0 0h1000v2Q500 196 0 2z']] },
  curve_asymmetrical: {
    viewBox: '0 0 1000 100',
    aspect: 'none',
    paths: [['M0 0h1000v2Q640 196 0 2z']],
  },
  curve_reverse: {
    viewBox: '0 0 937.5 120',
    aspect: 'none',
    paths: [['M0 0h937.5v120Q468.75-112 0 120z']],
  },
  curve_asym_reverse: {
    viewBox: '0 0 937.5 120',
    aspect: 'none',
    paths: [['M0 0h937.5v120Q580-112 0 120z']],
  },
  arrow: { viewBox: '0 0 700 10', aspect: 'none', paths: [['M0 0h700v.6H360L350 10 340 .6H0z']] },
  arrow_split: {
    viewBox: '0 0 1000 20',
    aspect: 'none',
    paths: [['M0 0h1000v10H530c-16 0-22 4-30 10-8-6-14-10-30-10H0z']],
  },
  book: {
    viewBox: '0 0 1000 100',
    aspect: 'none',
    paths: [['M0 0h1000v98c-180 0-380-6-500-94C380 92 180 98 0 98z']],
  },
};

export const SHAPE_TYPES = Object.keys(SHAPES);

/** The divider's SVG, or null for `none` or an unknown type. */
export function ShapeSvg({ type }: { type: string }) {
  const shape = SHAPES[type];
  if (!shape) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={shape.viewBox}
      preserveAspectRatio={shape.aspect}
      aria-hidden="true"
      focusable="false"
    >
      {shape.paths.map(([d, opacity], i) => (
        <path
          key={i}
          className="pr-container__shape-fill"
          d={d}
          {...(opacity ? { opacity } : {})}
        />
      ))}
    </svg>
  );
}
