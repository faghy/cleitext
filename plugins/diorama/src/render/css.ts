/**
 * The CSS of one slider: its size, navigation colours, and the position,
 * style and motion of each layer on each device. On the page, tablets and
 * phones get media queries with only what changes; in the editor's canvas
 * one device is drawn without them.
 */
import { BREAKPOINT, DESIGN_WIDTH, EASINGS, FONT_STACKS, ANCHOR_SHIFT } from '../model/presets';
import { layerPos, layerStyle, layerVisible, sizeFor } from '../model/resolve';
import type { Device, Layer, SliderData } from '../model/types';

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

/** A font size that shrinks with the slide (never below 75 %) on narrower boxes. */
export function fluidSize(size: number, device: Device): string {
  const fluid = (size / DESIGN_WIDTH[device]) * 100;
  const min = Math.max(10, size * 0.75);
  if (min >= size) return px(size);
  return `clamp(${px(min)},${Math.round(fluid * 1000) / 1000}cqw,${px(size)})`;
}

const ALIGN_ITEMS = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

/** The declarations of a layer on a device (position only for layers placed on the slide). */
export function layerDeclarations(
  layer: Layer,
  device: Device,
  autoMobile: boolean,
  placed: boolean,
): string {
  if (!layerVisible(layer, device)) return 'display:none';
  const s = layerStyle(layer, device, autoMobile);
  const out: string[] = [];
  if (placed) {
    const p = layerPos(layer, device, autoMobile);
    const [ax, ay] = ANCHOR_SHIFT[p.anchor];
    out.push(`left:${pct(p.x)}`, `top:${pct(p.y)}`, `translate:${ax}% ${ay}%`);
    out.push(p.w > 0 ? `width:${pct(p.w)}` : 'width:max-content', 'max-width:100%');
    if (p.h > 0 && layer.type !== 'heading' && layer.type !== 'text' && layer.type !== 'button')
      out.push(
        `height:${layer.type === 'shape' && layer.content.shape === 'line' ? px(Math.max(1, s.borderWidth || 3)) : pct(p.h)}`,
      );
  }
  if (layer.type === 'shape') {
    out.push(`background:${s.background}`);
    if (layer.content.shape === 'line') out.push(`height:${px(Math.max(1, s.borderWidth || 3))}`);
  } else if (layer.type !== 'image') {
    if (s.background !== 'transparent') out.push(`background:${s.background}`);
  }
  if (layer.type !== 'image' && layer.type !== 'shape') {
    out.push(`color:${s.color}`);
    out.push(`font-size:${fluidSize(s.fontSize, device)}`);
    if (s.fontFamily !== 'inherit') out.push(`font-family:${FONT_STACKS[s.fontFamily]}`);
    out.push(`font-weight:${s.fontWeight}`, `line-height:${s.lineHeight}`);
    if (s.letterSpacing) out.push(`letter-spacing:${s.letterSpacing}em`);
    if (s.uppercase) out.push('text-transform:uppercase');
    if (s.italic) out.push('font-style:italic');
  }
  if (layer.type === 'box') {
    out.push(
      `text-align:${s.textAlign}`,
      `align-items:${ALIGN_ITEMS[s.textAlign]}`,
      `gap:${px(s.gap)}`,
    );
  } else if (placed && (layer.type === 'heading' || layer.type === 'text')) {
    out.push(`text-align:${s.textAlign}`);
  }
  if (s.paddingX || s.paddingY) out.push(`padding:${px(s.paddingY)} ${px(s.paddingX)}`);
  if (s.radius && layer.type !== 'icon') out.push(`border-radius:${px(s.radius)}`);
  if (s.borderWidth && !(layer.type === 'shape' && layer.content.shape === 'line'))
    out.push(`border:${px(s.borderWidth)} solid ${s.borderColor}`);
  if (s.shadow)
    out.push(
      layer.type === 'heading' || layer.type === 'text' || layer.type === 'icon'
        ? 'text-shadow:0 2px 14px rgba(0,0,0,.45)'
        : 'box-shadow:0 14px 40px rgba(0,0,0,.3)',
    );
  if (s.opacity < 1) out.push(`opacity:${s.opacity}`);
  if (layer.type === 'image') {
    const p = layerPos(layer, device, autoMobile);
    if (!placed || p.h === 0) out.push('height:auto');
  }
  return out.join(';');
}

function motionDeclarations(layer: Layer): string {
  const out: string[] = [];
  const { in: enter, out: exit } = layer.motion;
  if (enter.preset !== 'none') {
    out.push(
      `--dio-in:dio-in-${enter.preset}`,
      `--dio-in-dur:${enter.duration}ms`,
      `--dio-in-delay:${enter.delay}ms`,
      `--dio-in-ease:${EASINGS[enter.easing].css}`,
    );
  }
  if (exit && exit.preset !== 'none') {
    out.push(
      `--dio-out:dio-out-${exit.preset}`,
      `--dio-out-dur:${exit.duration}ms`,
      `--dio-out-delay:${exit.delay}ms`,
      `--dio-out-ease:${EASINGS[exit.easing].css}`,
    );
  }
  return out.join(';');
}

export interface CssOptions {
  /** Only this device, without media queries (the editor's canvas). */
  device?: Device;
}

/** The scope of a slider's rules: `.dio-s<key>`. */
export const scopeOf = (key: string) => `.dio-s${key}`;

/** The CSS of one slider. */
export function sliderCss(slider: SliderData, key: string, options: CssOptions = {}): string {
  const scope = scopeOf(key);
  const devices: Device[] = options.device ? [options.device] : ['desktop', 'tablet', 'mobile'];
  const rules: Record<Device, string[]> = { desktop: [], tablet: [], mobile: [] };
  const last = new Map<string, string>();
  const put = (device: Device, selector: string, body: string) => {
    if (!body) return;
    if (!options.device && last.get(selector) === body) return;
    last.set(selector, body);
    rules[device].push(`${selector}{${body}}`);
  };

  const motion = (device: Device, selector: string, layer: Layer) => {
    const body = motionDeclarations(layer);
    if (body) rules[device].push(`${selector}{${body}}`);
  };

  const nav = slider.navigation;
  for (const device of devices) {
    const size = sizeFor(slider.size, device);
    const box: string[] = [`--dio-h:${px(size.height)}`, `--dio-off:${px(size.offset)}`];
    if (device === devices[0]) {
      box.push(`--dio-nav:${nav.color}`, `--dio-nav-size:${px(nav.size)}`);
      if (slider.layout === 'auto' && slider.maxWidth > 0)
        box.push(`max-width:${px(slider.maxWidth)}`);
    }
    if (options.device && slider.layout === 'fullscreen') {
      // The canvas has no window to fill: a typical one of the device.
      const screen = { desktop: 760, tablet: 960, mobile: 720 }[device];
      box.push(`--dio-h:${px(Math.max(320, screen - size.offset))}`);
    }
    put(device, scope, box.join(';'));
    for (const slide of slider.slides) {
      for (const layer of slide.layers) {
        const selector = `${scope} .dio-l${layer.id}`;
        put(device, selector, layerDeclarations(layer, device, slider.autoMobile, true));
        if (device === devices[0]) motion(device, selector, layer);
        if (
          layer.type === 'image' &&
          layer.content.media &&
          layerPos(layer, device, slider.autoMobile).h === 0
        )
          put(device, `${selector} img`, 'height:auto');
        for (const child of layer.children) {
          const childSelector = `${scope} .dio-l${child.id}`;
          put(device, childSelector, layerDeclarations(child, device, slider.autoMobile, false));
          if (device === devices[0]) motion(device, childSelector, child);
        }
      }
    }
  }
  if (options.device) return rules[options.device].join('');
  return [
    rules.desktop.join(''),
    rules.tablet.length
      ? `@media (max-width:${BREAKPOINT.tablet}px){${rules.tablet.join('')}}`
      : '',
    rules.mobile.length
      ? `@media (max-width:${BREAKPOINT.mobile}px){${rules.mobile.join('')}}`
      : '',
  ].join('');
}
