import type { Device } from '@cleitext/design';

export type Attrs = Record<string, unknown>;

/** What every control needs: the block's attributes and how to change them. */
export interface Bind {
  attributes: Attrs;
  setAttributes: (attrs: Attrs) => void;
  /** Defaults, to show a value when the block keeps none. */
  defaults: Attrs;
}

/** An attribute's value, its default when unset. */
export function value(bind: Bind, key: string): unknown {
  return key in bind.attributes ? bind.attributes[key] : bind.defaults[key];
}

/** Attribute names by device. */
export type DeviceKeys = (device: Device) => string;

/** `base` + `Desktop`/`Tablet`/`Mobile` (Spectra's own naming). */
export const suffixed =
  (base: string): DeviceKeys =>
  (device) =>
    `${base}${device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile'}`;

/** `base` on desktop, `base` + `Tablet`/`Mobile` on the others. */
export const plain =
  (base: string): DeviceKeys =>
  (device) =>
    device === 'desktop' ? base : `${base}${device === 'tablet' ? 'Tablet' : 'Mobile'}`;
