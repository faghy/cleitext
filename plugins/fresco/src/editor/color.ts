/**
 * Colors of the color control: read from `#rgb`, `#rrggbb`, `#rrggbbaa` and
 * `rgb()`/`rgba()`, edited as hue, saturation, value and alpha, and written
 * back as `#rrggbb` (opaque) or `rgba(r, g, b, a)`.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0 to 1. */
  a: number;
}

export interface Hsva {
  /** 0 to 360. */
  h: number;
  /** 0 to 1. */
  s: number;
  /** 0 to 1. */
  v: number;
  /** 0 to 1. */
  a: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A color value the control can edit, or null (global colors, names, empty). */
export function parseColor(value: string): Rgba | null {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? round(n(6) / 255, 2) : 1 };
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(v)?.[1];
  if (rgb) {
    const parts = rgb
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((part) => (part.endsWith('%') ? Number(part.slice(0, -1)) / 100 : Number(part)));
    if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) return null;
    const [r, g, b, a = 1] = parts as [number, number, number, number?];
    return {
      r: clamp(Math.round(r), 0, 255),
      g: clamp(Math.round(g), 0, 255),
      b: clamp(Math.round(b), 0, 255),
      a: clamp(a, 0, 1),
    };
  }
  return null;
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

const hex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

/** `#rrggbb` when opaque, else `rgba(r, g, b, a)`. */
export function formatColor({ r, g, b, a }: Rgba): string {
  if (a >= 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${round(clamp(a, 0, 1), 2)})`;
}

/** The opaque part as `#rrggbb`. */
export function toHex({ r, g, b }: Rgba): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

export function rgbaToHsva({ r, g, b, a }: Rgba): Hsva {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max, a };
}

export function hsvaToRgba({ h, s, v, a }: Hsva): Rgba {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a,
  };
}
