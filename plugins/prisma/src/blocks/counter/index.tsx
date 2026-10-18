import type { Device, Sheet } from '@cleitext/design';
import type { ReactNode } from 'react';
import { mediaUrl } from '../../lib/background';
import { blockClass } from '../../lib/css';
import {
  border,
  borderDefaults,
  clean,
  DEVICES,
  emit,
  numeric,
  px,
  suffix,
  type Declarations,
} from '../../lib/emit';
import { Icon } from '../../lib/icons';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { sideDefaults, sidesCss } from '../heading';
import { savedInner } from '../icon-list';

/** Typography of a part without units by device (`headingFontSize`, `headingFontSizeType`). */
function fontDefaults(p: string, family: string): Attrs {
  const out: Attrs = {
    [`${p}FontFamily`]: family,
    [`${p}FontWeight`]: '',
    [`${p}FontStyle`]: 'normal',
    [`${p}Transform`]: '',
    [`${p}Decoration`]: '',
    [`${p}FontSizeType`]: 'px',
    [`${p}LineHeightType`]: 'em',
    [`${p}LetterSpacingType`]: 'px',
    [`${p}LoadGoogleFonts`]: false,
  };
  for (const s of ['', 'Tablet', 'Mobile']) {
    out[`${p}FontSize${s}`] = '';
    out[`${p}LineHeight${s}`] = '';
    out[`${p}LetterSpacing${s}`] = '';
  }
  return out;
}

export function font(a: Attrs, p: string, device: Device): Declarations {
  const s = suffix(device);
  const sizes: Declarations = {
    'font-size': px(a[`${p}FontSize${s}`], a[`${p}FontSizeType`]),
    'line-height': px(a[`${p}LineHeight${s}`], a[`${p}LineHeightType`]),
    'letter-spacing': px(a[`${p}LetterSpacing${s}`], a[`${p}LetterSpacingType`]),
  };
  if (device !== 'desktop') return sizes;
  return {
    'font-family': a[`${p}FontFamily`],
    'font-style': a[`${p}FontStyle`],
    'text-decoration': a[`${p}Decoration`],
    'text-transform': a[`${p}Transform`],
    'font-weight': a[`${p}FontWeight`],
    ...sizes,
  };
}

const DEFAULTS: Attrs = {
  layout: 'number',
  align: 'center',
  alignTablet: '',
  alignMobile: '',
  startNumber: 0,
  endNumber: 80,
  totalNumber: 100,
  decimalPlaces: 0,
  numberPrefix: '',
  numberSuffix: '%',
  animationDuration: 1500,
  thousandSeparator: ',',
  heading: [{ text: 'Add Your Title Here…' }],
  headingTag: '',
  ...fontDefaults('heading', 'Default'),
  headingColor: '#4B4F58',
  ...sideDefaults('heading', 'Margin'),
  ...sideDefaults('block', 'Margin'),
  ...sideDefaults('block', 'Padding'),
  ...fontDefaults('number', ''),
  numberColor: '',
  ...sideDefaults('number', 'Margin'),
  prefixRightDistance: 0,
  prefixRightDistanceTablet: '',
  prefixRightDistanceMobile: '',
  suffixLeftDistance: 0,
  suffixLeftDistanceTablet: '',
  suffixLeftDistanceMobile: '',
  circleSize: 230,
  circleStokeSize: 8,
  circleForeground: '#007cba',
  circleBackground: '#eaeaea',
  barSize: '',
  barForeground: '#007cba',
  barBackground: '#eaeaea',
  barFlip: false,
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
  showIcon: true,
  sourceType: 'icon',
  icon: 'star',
  iconColor: '#4B4F58',
  iconBackgroundColor: '',
  iconHoverColor: '',
  iconBackgroundHoverColor: '',
  iconSize: 30,
  iconSizeTablet: '',
  iconSizeMobile: '',
  iconSizeType: 'px',
  iconSizeTypeTablet: 'px',
  iconSizeTypeMobile: 'px',
  iconImgPosition: 'top',
  iconImage: { url: '', alt: 'Counter placeholder img' },
  imageSize: 'thumbnail',
  imgTagWidth: '',
  imgTagHeight: '',
  imageWidthType: true,
  imageWidth: '',
  imageWidthTablet: '',
  imageWidthMobile: '',
  imageWidthUnit: 'px',
  imageWidthUnitTablet: 'px',
  imageWidthUnitMobile: 'px',
  ...sideDefaults('icon', 'Padding'),
  ...sideDefaults('icon', 'Margin'),
  ...borderDefaults('iconWrap'),
};

/** A number setting, else its default (as the counting script reads it). */
function number(a: Attrs, key: string): number {
  return numeric(a[key]) ?? (DEFAULTS[key] as number);
}

/** A number of a device, else the larger device's. */
function chain(a: Attrs, base: string, device: Device): unknown {
  const tablet = numeric(a[`${base}Tablet`]) !== null ? a[`${base}Tablet`] : a[base];
  if (device === 'desktop') return a[base];
  if (device === 'tablet') return tablet;
  return numeric(a[`${base}Mobile`]) !== null ? a[`${base}Mobile`] : tablet;
}

/** The circle's geometry: center, radius and the length of its stroke. */
function circle(a: Attrs) {
  const size = number(a, 'circleSize');
  const stroke = number(a, 'circleStokeSize');
  const pos = size / 2;
  const radius = pos - stroke / 2;
  return { size, pos, radius, dash: Math.round(2 * Math.PI * radius * 100) / 100 };
}

/** Share of the total, in percent (0–100). */
const share = (value: number, total: number) =>
  total > 0 ? Math.min(Math.max((value / total) * 100, 0), 100) : 100;

/** The shadow of the bar, written as the pages it replaces wrote it. */
function barShadow(a: Attrs, hover: '' | 'Hover'): string {
  const position =
    a[`boxShadowPosition${hover}`] === 'outset' ? '' : a[`boxShadowPosition${hover}`];
  return [
    px(a[`boxShadowHOffset${hover}`]),
    px(a[`boxShadowVOffset${hover}`]),
    px(a[`boxShadowBlur${hover}`]),
    px(a[`boxShadowSpread${hover}`]),
    clean(a[`boxShadowColor${hover}`]),
    clean(position),
  ]
    .filter(Boolean)
    .join(' ');
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-counter`;
  const bars = a.layout === 'bars';
  const sideIcon =
    a.layout === 'number' &&
    (a.iconImgPosition === 'left-number' || a.iconImgPosition === 'right-number');
  for (const device of DEVICES) {
    const s = suffix(device);
    const desktop = device === 'desktop';
    const spacing = {
      ...sidesCss(a, 'icon', 'Padding', device),
      ...sidesCss(a, 'icon', 'Margin', device),
    };
    const wrapBorder = border(a, 'iconWrap', device);
    emit(sheet, device, R, {
      'text-align': a[`align${s}`],
      ...sidesCss(a, 'block', 'Margin', device),
      ...sidesCss(a, 'block', 'Padding', device),
    });
    emit(sheet, device, `${R} .pr-counter__image-wrap`, spacing);
    emit(sheet, device, `${R} .pr-counter__image-wrap img`, wrapBorder);
    emit(sheet, device, `${R} .pr-counter__icon`, {
      ...(desktop ? { 'background-color': a.iconBackgroundColor } : {}),
      ...spacing,
      ...wrapBorder,
    });
    const iconSize = px(chain(a, 'iconSize', device), a[`iconSizeType${s}`]);
    emit(sheet, device, `${R} .pr-counter__icon svg`, {
      ...(desktop ? { fill: a.iconColor } : {}),
      width: iconSize,
      height: iconSize,
    });
    emit(sheet, device, `${R} .pr-counter__title`, {
      ...font(a, 'heading', device),
      ...(desktop ? { color: a.headingColor } : {}),
      ...sidesCss(a, 'heading', 'Margin', device),
    });
    const numberMargins = sidesCss(a, 'number', 'Margin', device);
    emit(sheet, device, `${R} .pr-counter__number`, {
      ...font(a, 'number', device),
      ...(desktop ? { color: a.numberColor } : {}),
      // In a bar the margins pad the number instead.
      ...(bars
        ? {
            'margin-top': 'unset',
            'margin-right': 'unset',
            'margin-bottom': 'unset',
            'margin-left': 'unset',
            ...(a.endNumber === 0 ? { 'padding-left': 'unset', 'padding-right': 'unset' } : {}),
          }
        : numberMargins),
    });
    emit(sheet, device, `${R} .pr-counter__number .pr-counter__prefix`, {
      'margin-right': px(chain(a, 'prefixRightDistance', device)),
    });
    emit(sheet, device, `${R} .pr-counter__number .pr-counter__suffix`, {
      'margin-left': px(chain(a, 'suffixLeftDistance', device)),
    });
    emit(sheet, device, `${B}.pr-counter--bars .pr-counter__bar .pr-counter__number`, {
      ...(desktop ? { height: px(a.barSize), background: a.barForeground } : {}),
      'padding-top': numberMargins['margin-top'],
      'padding-right': numberMargins['margin-right'],
      'padding-bottom': numberMargins['margin-bottom'],
      'padding-left': numberMargins['margin-left'],
    });
    if (a.imageWidthType) {
      emit(sheet, device, `${B} .pr-counter__image-wrap .pr-counter__image`, {
        width: px(chain(a, 'imageWidth', device), a[`imageWidthUnit${s}`]),
      });
    }
    if (sideIcon) {
      emit(sheet, device, `${B} .pr-counter__number`, {
        ...(desktop ? { display: 'flex', 'align-items': 'center' } : {}),
        'justify-content': a[`align${s}`],
      });
    }
  }
  emit(sheet, 'desktop', `${R}:hover .pr-counter__image-wrap img`, {
    'border-color': a.iconWrapBorderHColor,
  });
  emit(sheet, 'desktop', `${R}:hover .pr-counter__icon`, {
    'background-color': a.iconBackgroundHoverColor,
    'border-color': a.iconWrapBorderHColor,
  });
  emit(sheet, 'desktop', `${R}:hover .pr-counter__icon svg`, { fill: a.iconHoverColor });
  // The circle: drawn full up to the end number (the script starts it from the start number).
  const c = circle(a);
  const C = `${B}.pr-counter--circle .pr-counter__circle`;
  emit(sheet, 'desktop', C, { 'max-width': px(c.size) });
  emit(sheet, 'desktop', `${C} svg circle`, {
    'stroke-width': px(a.circleStokeSize),
    stroke: a.circleBackground,
    r: px(c.radius),
    cx: px(c.pos),
    cy: px(c.pos),
  });
  const end = share(number(a, 'endNumber'), number(a, 'totalNumber'));
  emit(sheet, 'desktop', `${C} svg .pr-counter__progress`, {
    stroke: a.circleForeground,
    'stroke-dasharray': px(c.dash),
    'stroke-dashoffset': px(Math.round(((100 - end) / 100) * c.dash * 100) / 100),
  });
  emit(sheet, 'desktop', `${B}.pr-counter--bars`, {
    'flex-direction': a.barFlip ? 'column-reverse' : 'column',
  });
  emit(sheet, 'desktop', `${B}.pr-counter--bars .pr-counter__bar`, { background: a.barBackground });
  if (bars) {
    emit(sheet, 'desktop', `${R} .pr-counter__bar`, { 'box-shadow': barShadow(a, '') });
    if (numeric(a.boxShadowBlurHover) !== null || a.boxShadowColorHover !== '') {
      emit(sheet, 'desktop', `${R}:hover .pr-counter__bar`, {
        'box-shadow': barShadow(a, 'Hover'),
      });
    }
  }
}

/** A number as the counter shows it: fixed decimals, thousands grouped. */
export function formatCount(value: number, decimals: number, separator: string): string {
  const places = Math.min(Math.max(Math.trunc(decimals), 0), 10);
  const [whole = '0', fraction] = Math.abs(value).toFixed(places).split('.');
  const grouped = separator ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator) : whole;
  return `${value < 0 && Number(Math.abs(value).toFixed(places)) !== 0 ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
}

function View({ attrs: a, id, text, root }: ViewProps) {
  const layout = a.layout === 'circle' || a.layout === 'bars' ? a.layout : 'number';
  const position = String(a.iconImgPosition ?? 'top');
  const image = mediaUrl(a.iconImage);
  const showIcon =
    Boolean(a.showIcon) &&
    ((a.sourceType === 'icon' && Boolean(a.icon)) || (a.sourceType === 'image' && Boolean(image)));
  let iconPiece: ReactNode = null;
  if (showIcon && a.sourceType === 'icon') {
    iconPiece = (
      <span className="pr-counter__icon">
        <Icon name={a.icon} />
      </span>
    );
  } else if (showIcon) {
    const alt = (a.iconImage as { alt?: unknown } | null)?.alt;
    const width = a.imageWidthType && numeric(a.imageWidth) ? a.imageWidth : a.imgTagWidth;
    iconPiece = (
      <span className="pr-counter__image-wrap">
        <img
          className="pr-counter__image"
          src={image}
          alt={typeof alt === 'string' ? alt : ''}
          {...(numeric(width) ? { width: Number(width) } : {})}
          {...(numeric(a.imgTagHeight) ? { height: Number(a.imgTagHeight) } : {})}
          loading="lazy"
        />
      </span>
    );
  }
  const at = (where: string) => (layout === 'number' && position === where ? iconPiece : null);
  const start = number(a, 'startNumber');
  const end = number(a, 'endNumber');
  const total = number(a, 'totalNumber');
  const decimals = number(a, 'decimalPlaces');
  const separator = typeof a.thousandSeparator === 'string' ? a.thousandSeparator : ',';
  const title = text('heading', { tagName: 'div', className: 'pr-counter__title' });
  const prefix = String(a.numberPrefix ?? '');
  const after = String(a.numberSuffix ?? '');
  const numberPart = (
    <>
      {at('top')}
      <div
        className="pr-counter__number"
        // The bar is drawn up to the end number; the script grows it from the start number.
        {...(layout === 'bars' ? { style: { width: `${Math.ceil(share(end, total))}%` } } : {})}
      >
        {at('left-number')}
        {prefix ? <span className="pr-counter__prefix">{prefix}</span> : null}
        <span className="pr-counter__value">{formatCount(end, decimals, separator)}</span>
        {after ? <span className="pr-counter__suffix">{after}</span> : null}
        {at('right-number')}
      </div>
      {layout === 'number' && title}
      {at('bottom')}
    </>
  );
  const c = circle(a);
  let content: ReactNode;
  if (layout === 'bars') {
    content = (
      <>
        <div className="pr-counter__bar">{numberPart}</div>
        {title}
      </>
    );
  } else if (layout === 'circle') {
    content = (
      <div className="pr-counter__circle">
        <div className="pr-counter__circle-content">
          {position === 'top' && iconPiece}
          {numberPart}
          {title}
          {position === 'bottom' && iconPiece}
        </div>
        <svg
          preserveAspectRatio="xMinYMin meet"
          viewBox={`0 0 ${c.size} ${c.size}`}
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle className="pr-counter__track" cx={c.pos} cy={c.pos} r={c.radius} />
          <circle className="pr-counter__progress" cx={c.pos} cy={c.pos} r={c.radius} />
        </svg>
      </div>
    );
  } else {
    content = numberPart;
  }
  const config = {
    layout,
    start,
    end,
    total,
    decimals,
    duration: number(a, 'animationDuration'),
    separator,
    size: c.size,
    stroke: number(a, 'circleStokeSize'),
  };
  return root(
    'div',
    {
      className: `wp-block-prisma-counter pr-counter pr-counter--${layout} ${blockClass(id)}`,
      'data-pr-counter': JSON.stringify(config),
    } as { className: string },
    content,
  );
}

export const counter: PrismaBlock = {
  name: 'counter',
  title: 'Counter',
  description: 'A number that counts up when it comes into view: plain, in a bar or a circle.',
  keywords: ['counter', 'number', 'statistics', 'progress', 'bar', 'circle'],
  richAttributes: ['heading'],
  defaults: DEFAULTS,
  css,
  View,
  script: { file: 'counter.js', marker: 'data-pr-counter' },
  media: (a) => {
    const id = (a.iconImage as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' ? [id] : [];
  },
  spectra: {
    'uagb/counter': (a, src) => {
      const title = savedInner(src.html, 'wp-block-uagb-counter__title');
      return [
        src.block('counter', {
          ...a,
          ...(title !== null ? { heading: title } : {}),
        }),
      ];
    },
  },
};
