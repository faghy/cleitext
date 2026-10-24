/**
 * Per-device values: what a device shows is the desktop value, then the
 * tablet's overrides, then the phone's. Phones also get an automatic layout
 * for texts and buttons when the slider asks for it (`autoMobile`) and the
 * value was not set by hand: content wide enough to read, centred, and
 * font sizes scaled down with a readable minimum.
 */
import type { Device, Layer, LayerPos, LayerStyle, PerDevice, SizeValues } from './types';

/** The value of a device, its larger devices' overrides included. */
export function valueFor<T extends object>(value: PerDevice<T>, device: Device): T {
  if (device === 'desktop') return value.base;
  if (device === 'tablet') return { ...value.base, ...value.tablet };
  return { ...value.base, ...value.tablet, ...value.mobile };
}

/** Whether a key was set by hand on this device. */
export function isOverridden<T extends object>(
  value: PerDevice<T>,
  device: Device,
  key: keyof T,
): boolean {
  if (device === 'desktop') return true;
  return value[device] !== undefined && key in value[device]!;
}

/** Sets a key for a device: on desktop the base, elsewhere an override. */
export function setFor<T extends object, K extends keyof T>(
  value: PerDevice<T>,
  device: Device,
  key: K,
  next: T[K],
): PerDevice<T> {
  if (device === 'desktop') return { ...value, base: { ...value.base, [key]: next } };
  return { ...value, [device]: { ...value[device], [key]: next } };
}

/** Removes a device's override, so it follows the larger device again. */
export function resetFor<T extends object>(
  value: PerDevice<T>,
  device: Exclude<Device, 'desktop'>,
  key?: keyof T,
): PerDevice<T> {
  const out = { ...value };
  if (!key) {
    delete out[device];
    return out;
  }
  const rest: Partial<T> = { ...value[device] };
  delete rest[key];
  if (Object.keys(rest).length === 0) delete out[device];
  else out[device] = rest;
  return out;
}

export function sizeFor(size: PerDevice<SizeValues>, device: Device): SizeValues {
  return valueFor(size, device);
}

/** The smallest font size the automatic layout keeps on phones and tablets. */
const MIN_FONT: Partial<Record<Layer['type'], number>> = {
  heading: 26,
  text: 16,
  button: 16,
};
const SCALE: Record<Device, number> = { desktop: 1, tablet: 0.85, mobile: 0.62 };

const TEXTUAL = new Set<Layer['type']>(['heading', 'text', 'button', 'box']);

/** A layer's position on a device, with the phone's automatic layout. */
export function layerPos(layer: Layer, device: Device, autoMobile: boolean): LayerPos {
  const value = valueFor(layer.pos, device);
  if (device !== 'mobile' || !autoMobile || !TEXTUAL.has(layer.type)) return value;
  if (layer.pos.mobile && Object.keys(layer.pos.mobile).length > 0) return value;
  // Narrow text becomes wide and centred; its height follows the text.
  if (value.w >= 84 && value.w > 0) return value;
  const vertical = value.anchor.startsWith('t') ? 't' : value.anchor.startsWith('b') ? 'b' : '';
  const anchor = (vertical || 'c') as LayerPos['anchor'];
  return { ...value, w: 88, x: 50, anchor, h: 0 };
}

/** A layer's style on a device, with the automatic font sizes of smaller devices. */
export function layerStyle(layer: Layer, device: Device, autoMobile: boolean): LayerStyle {
  const value = valueFor(layer.style, device);
  if (device === 'desktop' || !autoMobile) return value;
  const out = { ...value };
  const own = layer.style[device];
  const tabletOwn = layer.style.tablet;
  if (
    !(own && 'fontSize' in own) &&
    !(device === 'mobile' && tabletOwn && 'fontSize' in tabletOwn)
  ) {
    const min = MIN_FONT[layer.type];
    const scaled = Math.round(layer.style.base.fontSize * SCALE[device]);
    out.fontSize = min ? Math.max(Math.min(min, layer.style.base.fontSize), scaled) : scaled;
  }
  if (device === 'mobile' && layer.type === 'box' && !(own && 'textAlign' in own)) {
    const pos = layerPos(layer, device, autoMobile);
    if (pos.x === 50) out.textAlign = 'center';
  }
  if (device === 'mobile' && layer.type === 'button' && !(own && 'paddingX' in own)) {
    out.paddingX = Math.min(value.paddingX, 22);
  }
  // One line set on larger screens would run off a phone: it wraps there unless set by hand.
  if (device === 'mobile' && value.textWrap === 'nowrap' && !(own && 'textWrap' in own)) {
    out.textWrap = 'auto';
  }
  return out;
}

/** Whether a layer shows on a device. */
export function layerVisible(layer: Layer, device: Device): boolean {
  return !layer.hide[device];
}
