/**
 * Icons from Font Awesome Free (CC BY 4.0), drawn inline as SVG. The data
 * (public/icons.json) is loaded once: bundled on the server, fetched by the
 * editor.
 */
import type { IconValue } from './model.js';

export type IconData = Record<string, Record<string, [number, number, string]>>;

let data: IconData | null = null;

export function setIconData(value: IconData): void {
  data = value;
}

export function iconDataLoaded(): boolean {
  return data !== null;
}

export function isIcon(value: unknown): value is IconValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as IconValue).set === 'string' &&
    typeof (value as IconValue).name === 'string'
  );
}

export function iconShape(value: unknown): [number, number, string] | null {
  if (!isIcon(value) || !data) return null;
  return data[value.set]?.[value.name] ?? null;
}

/** All icons of the sets, for the picker: `[set, name]`. */
export function iconNames(): [string, string][] {
  if (!data) return [];
  return Object.entries(data).flatMap(([set, icons]) =>
    typeof icons === 'object'
      ? Object.keys(icons).map((name) => [set, name] as [string, string])
      : [],
  );
}

/** Addresses custom icons may use: the site's own files, or https. */
const ICON_URL = /^(\/[\w./-]+|https:\/\/[^\s"'()<>\\]+)\.svg$/;

export function Icon({ value, className }: { value: unknown; className?: string }) {
  if (isIcon(value) && typeof value.url === 'string' && ICON_URL.test(value.url)) {
    const mask = `url("${value.url}") center / contain no-repeat`;
    return (
      <span
        className={className ? `fr-icon fr-icon--mask ${className}` : 'fr-icon fr-icon--mask'}
        style={{ WebkitMask: mask, mask }}
        aria-hidden="true"
      />
    );
  }
  const shape = iconShape(value);
  if (!shape) return null;
  const [width, height, path] = shape;
  return (
    <svg
      className={className ? `fr-icon ${className}` : 'fr-icon'}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" d={path} />
    </svg>
  );
}
