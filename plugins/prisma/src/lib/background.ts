import type { BaseDevice as Device } from '@cleitext/design';
import { clean, numeric, px, type Declarations } from './emit';
import type { Attrs } from './types';

/**
 * Backgrounds of containers (`backgroundType`: none, color, gradient, image,
 * video) and their overlay (`overlayType`: none, color, gradient, image).
 * Repeat, position, size and attachment are per device (`…Desktop`,
 * `…Tablet`, `…Mobile`, empty on the smaller ones by default so the
 * desktop values cascade); the image and the gradient stops fall back to
 * the larger device.
 */

const D = (device: Device) =>
  device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile';

/** The address of a media value (`{ url }` or a plain address), safe for `url()`. */
export function mediaUrl(value: unknown): string {
  const url =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object'
        ? ((value as { url?: unknown }).url ?? (value as { src?: unknown }).src)
        : '';
  return typeof url === 'string' && /^(https?:\/\/|\/)[^\s"'()\\<>]*$/.test(url) ? url : '';
}

/** `url("…")` of an image, or ''. */
export const cssUrl = (value: unknown): string => {
  const url = mediaUrl(value);
  return url ? `url("${url}")` : '';
};

/** The first set value of a fallback chain (`''`, null, undefined are unset). */
function first(...values: unknown[]): unknown {
  return values.find((v) => v !== '' && v !== undefined && v !== null) ?? '';
}

/** The image of a device: its own, else the larger device's. */
function imageOf(a: Attrs, base: string, device: Device): unknown {
  return device === 'desktop'
    ? a[`${base}Desktop`]
    : device === 'tablet'
      ? first(mediaUrl(a[`${base}Tablet`]), a[`${base}Desktop`])
      : first(mediaUrl(a[`${base}Mobile`]), mediaUrl(a[`${base}Tablet`]), a[`${base}Desktop`]);
}

/** A number of a device, else the larger device's (gradient stops and angle). */
function numberOf(a: Attrs, base: string, device: Device): unknown {
  const desktop = a[base];
  const tablet = numeric(a[`${base}Tablet`]) !== null ? a[`${base}Tablet`] : desktop;
  if (device === 'desktop') return desktop;
  if (device === 'tablet') return tablet;
  return numeric(a[`${base}Mobile`]) !== null ? a[`${base}Mobile`] : tablet;
}

/** Gradient stops are written like `gradientLocation1`, `gradientLocationTablet1`. */
function stop(a: Attrs, prefix: string, n: 1 | 2, device: Device): unknown {
  const desktop = a[`${prefix}Location${n}`];
  const t = a[`${prefix}LocationTablet${n}`];
  const m = a[`${prefix}LocationMobile${n}`];
  const tablet = numeric(t) !== null ? t : desktop;
  if (device === 'desktop') return desktop;
  if (device === 'tablet') return tablet;
  return numeric(m) !== null ? m : tablet;
}

/** The gradient: the preset string (`basic`), or built from two colors (`advanced`). */
export function gradient(a: Attrs, device: Device): string {
  if (a.selectGradient === 'basic') return clean(a.gradientValue);
  if (a.selectGradient !== 'advanced') return '';
  const c1 = clean(a.gradientColor1);
  const c2 = clean(a.gradientColor2);
  const l1 = numeric(stop(a, 'gradient', 1, device)) ?? 0;
  const l2 = numeric(stop(a, 'gradient', 2, device)) ?? 100;
  if (a.gradientType === 'radial')
    return `radial-gradient(at center center, ${c1} ${l1}%, ${c2} ${l2}%)`;
  const angle = numeric(numberOf(a, 'gradientAngle', device)) ?? 0;
  return `linear-gradient(${angle}deg, ${c1} ${l1}%, ${c2} ${l2}%)`;
}

/** `{x, y}` fractions → `61% 55%`; custom positions with their units. */
function position(a: Attrs, device: Device, overlay: boolean): string {
  const o = overlay ? 'Overlay' : '';
  const custom = a[overlay ? 'customOverlayPosition' : 'customPosition'] === 'custom';
  if (!custom) {
    const value = a[`backgroundPosition${o}${D(device)}`] as
      { x?: unknown; y?: unknown } | '' | undefined;
    if (!value || typeof value !== 'object') return '';
    const x = numeric(value.x);
    const y = numeric(value.y);
    return x === null || y === null
      ? ''
      : `${Math.round(x * 10000) / 100}% ${Math.round(y * 10000) / 100}%`;
  }
  const x = px(a[`xPosition${o}${D(device)}`], a[`xPosition${o}Type`]);
  const y = px(a[`yPosition${o}${D(device)}`], a[`yPosition${o}Type`]);
  if (!x || !y) return '';
  return !overlay && a.centralizedPosition ? `calc(50% + ${x}) calc(50% + ${y})` : `${x} ${y}`;
}

function size(a: Attrs, device: Device, overlay: boolean): string {
  const o = overlay ? 'Overlay' : '';
  const value = clean(a[`backgroundSize${o}${D(device)}`]);
  if (value !== 'custom') return value;
  return px(
    a[`backgroundCustomSize${o}${D(device)}`],
    a[overlay ? 'backgroundCustomOverlaySizeType' : 'backgroundCustomSizeType'],
  );
}

/** The element's own background on a device (any overlay is drawn apart). */
export function background(a: Attrs, device: Device): Declarations {
  const type = a.backgroundType;
  const color = clean(a.backgroundColor);
  const image = cssUrl(imageOf(a, 'backgroundImage', device));
  switch (type) {
    case 'color':
      return image && color
        ? { 'background-image': `linear-gradient(to right, ${color}, ${color}), ${image}` }
        : { 'background-color': color };
    case 'image':
      return {
        'background-repeat': a[`backgroundRepeat${D(device)}`],
        'background-position': position(a, device, false),
        'background-size': size(a, device, false),
        'background-attachment': a[`backgroundAttachment${D(device)}`],
        'background-image': image,
        'background-clip': 'padding-box',
      };
    case 'gradient':
      return { background: gradient(a, device), 'background-clip': 'padding-box' };
    case 'video':
      if (!mediaUrl(a.backgroundVideo)) return {};
      if (a.overlayType === 'color') return { background: a.backgroundVideoColor };
      if (a.overlayType === 'gradient') return { 'background-image': gradient(a, device) };
      return {};
    case '':
    case undefined:
      return { 'background-color': color };
    default:
      return {};
  }
}

/** The overlay over the background (`::before`), or {} when there is none to draw. */
export function overlay(a: Attrs, device: Device): Declarations {
  if (a.overlayType === 'image') {
    const image = cssUrl(imageOf(a, 'backgroundOverlayImage', device));
    return {
      'background-repeat': a[`backgroundRepeatOverlay${D(device)}`],
      'background-position': position(a, device, true),
      'background-size': size(a, device, true),
      'background-attachment': a[`backgroundAttachmentOverlay${D(device)}`],
      'mix-blend-mode': a.overlayBlendMode,
      'background-image': image,
      'background-clip': 'padding-box',
      opacity: a.overlayOpacity,
    };
  }
  if (a.backgroundType !== 'image') return {};
  if (a.overlayType === 'gradient')
    return { 'background-image': gradient(a, device), opacity: a.overlayOpacity };
  if (a.overlayType === 'color')
    return { background: a.backgroundImageColor, opacity: a.overlayOpacity };
  return {};
}

/** `#abc`/`#aabbcc` with an opacity (0–1, or 1–100) → `rgba(…)`; anything else as it is. */
export function rgba(color: unknown, opacity: unknown = 100): string {
  const value = clean(color);
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!hex) return value;
  const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
  let o = numeric(opacity) ?? 100;
  if (o >= 1) o /= 100;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${o})`;
}
