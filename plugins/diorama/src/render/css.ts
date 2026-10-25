/**
 * The CSS of one slider: its size, navigation colours, and the position,
 * style and motion of each layer on each device. On the page, tablets and
 * phones get media queries with only what changes; in the editor's canvas
 * one device is drawn without them.
 */
import { fontCss, THEME_HEADING } from '../model/fonts';
import { BREAKPOINT, DESIGN_WIDTH, EASINGS, ANCHOR_SHIFT } from '../model/presets';
import { layerPos, layerStyle, layerVisible, sizeFor } from '../model/resolve';
import type { Device, Layer, LayerStyle, SliderData, TextWrap } from '../model/types';

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

/** What `textWrap` writes; `auto` writes nothing (the shared CSS: balanced, "pretty" texts). */
const WRAP_CSS: Record<Exclude<TextWrap, 'auto'>, string> = {
  balance: 'text-wrap:balance',
  pretty: 'text-wrap:pretty',
  normal: 'text-wrap:wrap',
  nowrap: 'white-space:nowrap',
};

/** The device whose rules also apply on this one (media queries add up), or null on desktop. */
const LARGER: Record<Device, Device | null> = {
  desktop: null,
  tablet: 'desktop',
  mobile: 'tablet',
};

/** Whether a layer takes the theme's font for its kind of heading (class `dio-fh`, Diorama 1.2). */
export const themeHeadingFont = (layer: Layer): boolean =>
  layer.style.base.fontFamily === THEME_HEADING &&
  layer.type !== 'image' &&
  layer.type !== 'shape' &&
  layer.type !== 'icon';

/**
 * Text outline, line breaking and a button's size (Diorama 1.2), written
 * only when set: a smaller device that drops what a larger one set writes
 * it back, as media queries add up.
 */
function textExtras(
  layer: Layer,
  s: LayerStyle,
  larger: LayerStyle | null,
  placed: boolean,
): string[] {
  const out: string[] = [];
  const textual = layer.type === 'heading' || layer.type === 'text' || layer.type === 'button';
  if (!textual) return out;
  const stroke = (v: LayerStyle) => (v.outline ? Math.max(1, v.strokeWidth) : v.strokeWidth);
  if (stroke(s) > 0) out.push(`-webkit-text-stroke:${px(stroke(s))} ${s.strokeColor}`);
  else if (larger && stroke(larger) > 0) out.push('-webkit-text-stroke:0 transparent');
  if (s.outline) out.push('-webkit-text-fill-color:transparent');
  else if (larger?.outline) out.push('-webkit-text-fill-color:currentcolor');
  if (s.textWrap !== 'auto') {
    if (larger?.textWrap === 'nowrap' && s.textWrap !== 'nowrap') out.push('white-space:normal');
    out.push(WRAP_CSS[s.textWrap]);
  } else if (larger && larger.textWrap !== 'auto') {
    if (larger.textWrap === 'nowrap') out.push('white-space:normal');
    out.push(layer.type === 'text' ? WRAP_CSS.pretty : WRAP_CSS.balance);
  }
  if (layer.type === 'button') {
    if (s.minHeight > 0) out.push(`min-height:${px(s.minHeight)}`);
    else if (larger && larger.minHeight > 0) out.push('min-height:0');
    if (s.widthMode === 'fixed') out.push(`width:${px(s.fixedWidth)}`, 'max-width:100%');
    else if (s.widthMode === 'full') out.push('width:100%');
    else if (larger && larger.widthMode !== 'auto' && !placed) out.push('width:auto');
    // Lines typed in a button follow its alignment (centred by default).
    if (layer.content.text.includes('\n')) out.push(`text-align:${s.textAlign}`);
  }
  return out;
}

/** Letters cast the shadow of headings, texts and icons; the box, of the other layers. */
const shadowProperty = (layer: Layer) =>
  layer.type === 'heading' || layer.type === 'text' || layer.type === 'icon'
    ? 'text-shadow'
    : 'box-shadow';

/**
 * A layer's shadow: Diorama's soft one, or the offsets, blur and colour set
 * by hand (Diorama 1.3, e.g. Slider Revolution's `0 10px 10px #000`).
 */
export function shadowDeclaration(layer: Layer, s: LayerStyle): string {
  if (!s.shadow) return '';
  const property = shadowProperty(layer);
  if (s.shadowMode === 'custom')
    return `${property}:${px(s.shadowX)} ${px(s.shadowY)} ${px(s.shadowBlur)} ${s.shadowColor}`;
  return property === 'text-shadow'
    ? 'text-shadow:0 2px 14px rgba(0,0,0,.45)'
    : 'box-shadow:0 14px 40px rgba(0,0,0,.3)';
}

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
    // `--dio-tx`/`--dio-ty` (Diorama 1.1): offsets other plugins add (parallax, loops).
    out.push(
      `left:${pct(p.x)}`,
      `top:${pct(p.y)}`,
      `translate:calc(${ax}% + var(--dio-tx,0px)) calc(${ay}% + var(--dio-ty,0px))`,
    );
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
    const family = fontCss(s.fontFamily);
    if (s.fontFamily === THEME_HEADING || family === null) {
      // The theme's font for its kind of heading follows the desktop's choice (the class).
      if (!themeHeadingFont(layer)) {
        if (layer.style.base.fontFamily !== 'inherit') out.push('font-family:inherit');
      }
    } else if (s.fontFamily !== 'inherit') out.push(`font-family:${family}`);
    else if (device !== 'desktop' && themeHeadingFont(layer)) out.push('font-family:inherit');
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
  const shadow = shadowDeclaration(layer, s);
  if (shadow) out.push(shadow);
  else if (device !== 'desktop') {
    // A smaller device without the larger one's shadow takes it off (media queries add up).
    const larger = LARGER[device];
    if (larger && shadowDeclaration(layer, layerStyle(layer, larger, autoMobile)))
      out.push(`${shadowProperty(layer)}:none`);
  }
  if (s.opacity < 1) out.push(`opacity:${s.opacity}`);
  if (layer.type === 'image') {
    const p = layerPos(layer, device, autoMobile);
    if (!placed || p.h === 0) out.push('height:auto');
  }
  const larger = LARGER[device];
  out.push(...textExtras(layer, s, larger ? layerStyle(layer, larger, autoMobile) : null, placed));
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
      if (nav.arrowOffset !== null) box.push(`--dio-arrow-x:${px(nav.arrowOffset)}`);
      if (slider.layout === 'auto' && slider.maxWidth > 0)
        box.push(`max-width:${px(slider.maxWidth)}`);
    }
    if (options.device && slider.layout === 'fullscreen') {
      // The canvas has no window to fill: a typical one of the device.
      const screen = { desktop: 760, tablet: 960, mobile: 720 }[device];
      box.push(`--dio-h:${px(Math.max(320, screen - size.offset))}`);
    }
    put(device, scope, box.join(';'));
    if (device === devices[0]) {
      // The arrows' own backgrounds (Diorama 1.3), after the style's.
      if (nav.arrowBackground)
        put(device, `${scope} .dio__arrow`, `background:${nav.arrowBackground}`);
      if (nav.arrowHoverBackground)
        put(
          device,
          `${scope} .dio__arrow:not([disabled]):hover`,
          `background:${nav.arrowHoverBackground}`,
        );
    }
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
