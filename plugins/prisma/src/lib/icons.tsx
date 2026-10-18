/**
 * Icons from Font Awesome Free (CC BY 4.0) by name, as Spectra saves them
 * (`circle-check`, `right-long`), drawn as inline SVG. The data is bundled
 * on the server and fetched once by the editor.
 */
export type IconData = Record<string, Record<string, [number, number, string]> | string>;

let data: IconData | null = null;
const listeners = new Set<() => void>();

export function setIconData(value: IconData): void {
  data = value;
  for (const listener of listeners) listener();
}

export function iconsLoaded(): boolean {
  return data !== null;
}

/** Re-render when the icons arrive (editor). */
export function onIconData(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Names of Font Awesome 5 kept by older content. */
const RENAMED: Record<string, string> = {
  'check-circle': 'circle-check',
  'long-arrow-alt-right': 'right-long',
  'long-arrow-alt-left': 'left-long',
  'arrow-circle-right': 'circle-arrow-right',
  'map-marker-alt': 'location-dot',
  'phone-alt': 'phone',
  'envelope-open-text': 'envelope-open-text',
  'external-link-alt': 'up-right-from-square',
  times: 'xmark',
  'times-circle': 'circle-xmark',
};

/** The shape of an icon: brands first, then solid, then regular. */
export function iconShape(name: unknown): [number, number, string] | null {
  if (typeof name !== 'string' || !data) return null;
  const clean = name.replace(/^(fa[sbr]?\s+)?(fa-)?/, '').trim();
  const key = RENAMED[clean] ?? clean;
  for (const set of ['brands', 'solid', 'regular']) {
    const icons = data[set];
    if (icons && typeof icons === 'object' && icons[key]) return icons[key]!;
  }
  return null;
}

/** All icon names, for the picker. */
export function iconNames(): string[] {
  if (!data) return [];
  const names = new Set<string>();
  for (const set of ['solid', 'brands', 'regular']) {
    const icons = data[set];
    if (icons && typeof icons === 'object') for (const n of Object.keys(icons)) names.add(n);
  }
  return [...names];
}

export function Icon({ name, className }: { name: unknown; className?: string }) {
  const shape = iconShape(name);
  if (!shape) return null;
  const [width, height, path] = shape;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      {...(className ? { className } : {})}
    >
      <path d={path} />
    </svg>
  );
}
