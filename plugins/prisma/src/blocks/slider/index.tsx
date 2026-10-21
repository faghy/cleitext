import type { BaseDevice as Device, Sheet } from '@cleitext/design';
import { useEffect, useRef, useState } from 'react';
import { background, gradient } from '../../lib/background';
import { blockClass } from '../../lib/css';
import {
  border,
  borderDefaults,
  boxShadow,
  clean,
  DEVICES,
  emit,
  numeric,
  px,
  type Declarations,
} from '../../lib/emit';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

const D = (device: Device) =>
  device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile';

function perDevice(base: string, desktop: unknown, tablet: unknown = '', mobile: unknown = '') {
  return { [`${base}Desktop`]: desktop, [`${base}Tablet`]: tablet, [`${base}Mobile`]: mobile };
}

/** Background attributes shared by the slider and its slides (Spectra's names and defaults). */
const BACKGROUND_DEFAULTS: Attrs = {
  backgroundType: 'none',
  ...perDevice('backgroundImage', ''),
  ...perDevice('backgroundPosition', { x: 0.5, y: 0.5 }),
  ...perDevice('backgroundSize', 'cover'),
  ...perDevice('backgroundRepeat', 'no-repeat'),
  ...perDevice('backgroundAttachment', 'scroll'),
  backgroundColor: '',
  backgroundOpacity: '',
  gradientValue: 'linear-gradient(90deg, rgba(6, 147, 227, 0.5) 0%, rgba(155, 81, 224, 0.5) 100%)',
  gradientColor1: '#06558a',
  gradientColor2: '#0063A1',
  gradientType: 'linear',
  gradientLocation1: 0,
  gradientLocationTablet1: '',
  gradientLocationMobile1: '',
  gradientLocation2: 100,
  gradientLocationTablet2: '',
  gradientLocationMobile2: '',
  gradientAngle: 0,
  gradientAngleTablet: '',
  gradientAngleMobile: '',
  selectGradient: 'basic',
  backgroundImageColor: '#FFFFFF75',
  ...perDevice('backgroundCustomSize', 100),
  backgroundCustomSizeType: '%',
  overlayType: 'none',
  customPosition: 'default',
  ...perDevice('xPosition', ''),
  xPositionType: 'px',
  xPositionTypeTablet: 'px',
  xPositionTypeMobile: 'px',
  ...perDevice('yPosition', ''),
  yPositionType: 'px',
  yPositionTypeTablet: 'px',
  yPositionTypeMobile: 'px',
};

/** Padding and margin of four sides by device (`topPaddingDesktop`…), with their units. */
function spacingDefaults(padding: [unknown, unknown, unknown]): Attrs {
  const out: Attrs = {};
  for (const side of ['top', 'bottom', 'left', 'right']) {
    Object.assign(out, perDevice(`${side}Padding`, ...padding));
    Object.assign(out, perDevice(`${side}Margin`, ''));
  }
  for (const s of ['', 'Tablet', 'Mobile']) {
    out[`paddingType${s}`] = 'px';
    out[`marginType${s}`] = 'px';
  }
  out.paddingLink = true;
  out.marginLink = true;
  return out;
}

/** A value of a device, else the larger device's ('' is unset). */
function fallback(a: Attrs, base: string, device: Device): unknown {
  const set = (v: unknown) => v !== '' && v !== undefined && v !== null;
  const desktop = a[`${base}Desktop`];
  const tablet = set(a[`${base}Tablet`]) ? a[`${base}Tablet`] : desktop;
  if (device === 'desktop') return desktop;
  if (device === 'tablet') return tablet;
  return set(a[`${base}Mobile`]) ? a[`${base}Mobile`] : tablet;
}

/** Padding and margin of a device, each falling back to the larger device; the unit is the device's own. */
function spacing(a: Attrs, device: Device): Declarations {
  const s = device === 'desktop' ? '' : D(device);
  const out: Declarations = {};
  for (const side of ['top', 'bottom', 'left', 'right']) {
    out[`padding-${side}`] = px(fallback(a, `${side}Padding`, device), a[`paddingType${s}`]);
  }
  for (const side of ['top', 'bottom', 'left', 'right']) {
    out[`margin-${side}`] = px(fallback(a, `${side}Margin`, device), a[`marginType${s}`]);
  }
  return out;
}

/**
 * The background drawn on the element itself, overlay included: an image
 * with a color or gradient overlay becomes layered background images, as
 * Spectra draws the slider and its slides.
 */
export function flatBackground(input: Attrs, device: Device): Declarations {
  // Without a "centralized" setting, custom positions are relative to the center.
  const a: Attrs = { ...input, centralizedPosition: input.centralizedPosition ?? true };
  const out = background(a, device);
  if (a.backgroundType !== 'image') return out;
  const image = typeof out['background-image'] === 'string' ? out['background-image'] : '';
  const g = gradient(a, device);
  const tint = clean(a.backgroundImageColor);
  if (a.overlayType === 'gradient' && g) {
    out['background-image'] = image ? `${g}, ${image}` : g;
  } else if (a.overlayType === 'color' && tint) {
    if (image) out['background-image'] = `linear-gradient(to right, ${tint}, ${tint}), ${image}`;
    else {
      delete out['background-image'];
      out.background = tint;
    }
  }
  return out;
}

const mediaIds = (a: Attrs) =>
  [a.backgroundImageDesktop, a.backgroundImageTablet, a.backgroundImageMobile]
    .map((m) => (m && typeof m === 'object' ? (m as { id?: unknown }).id : null))
    .filter((m): m is string => typeof m === 'string');

// ---- Slider ----------------------------------------------------------------------------------

const ARROW_BORDER = borderDefaults('slider-arrow');
for (const corner of ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'])
  ARROW_BORDER[`slider-arrowBorder${corner}Radius`] = 50;

const SLIDER_DEFAULTS: Attrs = {
  pauseOn: 'hover',
  infiniteLoop: true,
  transitionSpeed: 800,
  transitionEffect: 'slide',
  autoplay: true,
  verticalMode: false,
  autoplaySpeed: 3000,
  displayArrows: true,
  displayDots: true,
  ...BACKGROUND_DEFAULTS,
  ...spacingDefaults([10, '', '']),
  useSeparateBoxShadows: true,
  boxShadowColor: '#00000070',
  boxShadowHOffset: 0,
  boxShadowVOffset: 0,
  boxShadowBlur: '',
  boxShadowSpread: '',
  boxShadowPosition: 'outset',
  boxShadowColorHover: '',
  boxShadowHOffsetHover: 0,
  boxShadowVOffsetHover: 0,
  boxShadowBlurHover: '',
  boxShadowSpreadHover: '',
  boxShadowPositionHover: 'outset',
  arrowSize: 16,
  arrowSizeTablet: '',
  arrowSizeMobile: '',
  arrowDistance: -20,
  arrowDistanceTablet: '',
  arrowDistanceMobile: '',
  arrowPadding: 15,
  arrowPaddingTablet: '',
  arrowPaddingMobile: '',
  arrowColor: '#333333',
  arrowBgColor: '',
  verticalAlign: 'center',
  dotsMarginTop: 20,
  dotsMarginTopTablet: '',
  dotsMarginTopMobile: '',
  minHeight: 350,
  minHeightTablet: '',
  minHeightMobile: '',
  zIndex: '',
  zIndexTablet: '',
  zIndexMobile: '',
  ...borderDefaults('slider'),
  ...ARROW_BORDER,
};

/** A number of a device, else the larger device's (arrow size, padding and distance). */
function sized(a: Attrs, base: string, device: Device): number {
  const desktop = numeric(a[base]) ?? 0;
  const tablet = numeric(a[`${base}Tablet`]) ?? desktop;
  if (device === 'desktop') return desktop;
  if (device === 'tablet') return tablet;
  return numeric(a[`${base}Mobile`]) ?? tablet;
}

function sliderCss(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-slider`;
  for (const device of DEVICES) {
    const s = device === 'desktop' ? '' : D(device);
    const borderCss = border(a, 'slider', device);
    emit(sheet, device, R, {
      ...(device === 'desktop'
        ? {
            'box-shadow': boxShadow(
              a.boxShadowHOffset,
              a.boxShadowVOffset,
              a.boxShadowBlur,
              a.boxShadowSpread,
              a.boxShadowColor,
              a.boxShadowPosition,
            ),
          }
        : {}),
      ...spacing(a, device),
      ...borderCss,
      ...(device === 'desktop' ? { 'border-color': borderCss['border-color'] || '#4B4F58' } : {}),
      ...flatBackground(a, device),
    });
    const size = sized(a, 'arrowSize', device);
    const box = `${sized(a, 'arrowPadding', device) * 2 + size}px`;
    emit(sheet, device, `${R} .pr-slider__arrow`, {
      ...border(a, 'slider-arrow', device),
      ...(device === 'desktop' ? { color: a.arrowColor, 'background-color': a.arrowBgColor } : {}),
      width: box,
      height: box,
      'line-height': box,
    });
    emit(sheet, device, `${R} .pr-slider__arrow svg`, {
      width: `${size}px`,
      height: `${size}px`,
    });
    const distance = px(sized(a, 'arrowDistance', device));
    emit(sheet, device, `${R} .pr-slider__arrow--prev`, { left: distance });
    emit(sheet, device, `${R} .pr-slider__arrow--next`, { right: distance });
    emit(sheet, device, `${R} .pr-slider__track`, {
      ...(device === 'desktop' ? { 'align-items': a.verticalAlign } : {}),
      'min-height': px(a[`minHeight${s}`]),
    });
    emit(sheet, device, `${R} .pr-slider__dots`, { bottom: px(a[`dotsMarginTop${s}`]) });
  }
  emit(sheet, 'desktop', `${R}:hover`, {
    'border-color': a.sliderBorderHColor,
    ...(a.useSeparateBoxShadows
      ? {
          'box-shadow': boxShadow(
            a.boxShadowHOffsetHover,
            a.boxShadowVOffsetHover,
            a.boxShadowBlurHover,
            a.boxShadowSpreadHover,
            a.boxShadowColorHover,
            a.boxShadowPositionHover,
            a.boxShadowColor,
          ),
        }
      : {}),
  });
  emit(sheet, 'desktop', `${R} .pr-slider__arrow:hover`, {
    'border-color': a['slider-arrowBorderHColor'],
  });
  emit(sheet, 'desktop', `${R} .pr-slider__dot`, { 'background-color': a.arrowColor });
  emit(sheet, 'desktop', `${R}.pr-z-index`, {
    '--z-index-desktop': numeric(a.zIndex) ?? '',
    '--z-index-tablet': numeric(a.zIndexTablet) ?? numeric(a.zIndex) ?? '',
    '--z-index-mobile':
      numeric(a.zIndexMobile) ?? numeric(a.zIndexTablet) ?? numeric(a.zIndex) ?? '',
  });
}

/** A chevron drawn for Prisma, pointing left or right. */
export const Chevron = ({ left }: { left?: boolean }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      d={
        left
          ? 'M11.3 1.3 4.6 8l6.7 6.7-1 1L2.6 8l7.7-7.7z'
          : 'M4.7 1.3 11.4 8l-6.7 6.7 1 1L13.4 8 5.7.3z'
      }
      fill="currentColor"
    />
  </svg>
);

/** The front-end settings of a slider (read by slider.js). */
export function sliderConfig(a: Attrs) {
  return {
    effect: ['slide', 'fade', 'flip'].includes(String(a.transitionEffect))
      ? String(a.transitionEffect)
      : 'slide',
    speed: Math.max(0, numeric(a.transitionSpeed) ?? 800),
    autoplay: a.autoplay ? Math.max(100, numeric(a.autoplaySpeed) ?? 3000) : 0,
    pauseOn: ['hover', 'click', 'none'].includes(String(a.pauseOn)) ? String(a.pauseOn) : 'hover',
    loop: a.infiniteLoop !== false,
    arrows: Boolean(a.displayArrows),
    dots: Boolean(a.displayDots),
  };
}

function SliderView({ attrs: a, id, root, inner, editing }: ViewProps) {
  // In the editor the slides are shown one at a time, moved by the arrows and dots (no autoplay).
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = viewport.current;
    if (!editing || !el) return;
    const slides = () =>
      [...(el.querySelector('.pr-slider__track')?.children ?? [])].filter((c) =>
        c.classList.contains('pr-slide'),
      );
    const update = () => setCount(slides().length);
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { childList: true, subtree: true });
    // Editing something inside a slide brings that slide into view.
    const focus = (event: Event) => {
      const slide = (event.target as Element | null)?.closest?.('.pr-slide');
      const index = slide ? slides().indexOf(slide) : -1;
      if (index >= 0) setCurrent(index);
    };
    el.addEventListener('focusin', focus);
    return () => {
      observer.disconnect();
      el.removeEventListener('focusin', focus);
    };
  }, [editing]);
  const shown = count > 0 ? Math.min(current, count - 1) : 0;
  const go = (to: number) => setCurrent(count > 0 ? (to + count) % count : 0);
  const zIndex = [a.zIndex, a.zIndexTablet, a.zIndexMobile].some((z) => numeric(z) !== null);
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-slider',
        'pr-slider',
        editing ? 'pr-slider--editing' : '',
        zIndex ? 'pr-z-index' : '',
        blockClass(id),
      ]
        .filter(Boolean)
        .join(' '),
      ...(editing ? { style: { '--pr-slider-index': String(shown) } } : {}),
    },
    <>
      <div
        className="pr-slider__viewport"
        ref={viewport}
        {...(editing ? {} : { 'data-pr-slider': JSON.stringify(sliderConfig(a)) })}
      >
        {inner({ className: 'pr-slider__track' })}
      </div>
      {a.displayDots ? (
        <div className="pr-slider__dots">
          {editing &&
            Array.from({ length: count }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`pr-slider__dot${i === shown ? ' is-active' : ''}`}
                aria-label={`Slide ${i + 1}`}
                onClick={() => setCurrent(i)}
              />
            ))}
        </div>
      ) : null}
      {a.displayArrows ? (
        <>
          <button
            type="button"
            className="pr-slider__arrow pr-slider__arrow--prev"
            aria-label="Previous slide"
            {...(editing ? { onClick: () => go(shown - 1) } : {})}
          >
            <Chevron left />
          </button>
          <button
            type="button"
            className="pr-slider__arrow pr-slider__arrow--next"
            aria-label="Next slide"
            {...(editing ? { onClick: () => go(shown + 1) } : {})}
          >
            <Chevron />
          </button>
        </>
      ) : null}
    </>,
  );
}

export const slider: PrismaBlock = {
  name: 'slider',
  title: 'Slider',
  description:
    'Slides of any blocks, with backgrounds, a slide, fade or flip transition, autoplay, arrows and dots.',
  keywords: ['slider', 'carousel', 'slides', 'slideshow'],
  container: true,
  allowedBlocks: ['prisma/slide'],
  script: { file: 'slider.js', marker: 'data-pr-slider' },
  defaults: SLIDER_DEFAULTS,
  css: sliderCss,
  View: SliderView,
  media: mediaIds,
  spectra: {
    'uagb/slider': (a, src) => [src.block('slider', a, src.children)],
  },
};

// ---- Slide -----------------------------------------------------------------------------------

const SLIDE_DEFAULTS: Attrs = {
  ...BACKGROUND_DEFAULTS,
  ...spacingDefaults([20, 20, 20]),
};

function slideCss(a: Attrs, B: string, sheet: Sheet): void {
  for (const device of DEVICES) {
    emit(sheet, device, `${B} > .pr-slide__content`, {
      ...spacing(a, device),
      ...flatBackground(a, device),
    });
  }
}

function SlideView({ id, root, inner }: ViewProps) {
  return root(
    'div',
    { className: `wp-block-prisma-slide pr-slide ${blockClass(id)}` },
    inner({ className: 'pr-slide__content' }),
  );
}

export const slide: PrismaBlock = {
  name: 'slide',
  title: 'Slide',
  description: 'One slide of a slider: any blocks over a background.',
  keywords: ['slide', 'slider'],
  container: true,
  parent: ['slider'],
  defaults: SLIDE_DEFAULTS,
  css: slideCss,
  View: SlideView,
  media: mediaIds,
  spectra: {
    'uagb/slider-child': (a, src) => [src.block('slide', a, src.children)],
  },
};
