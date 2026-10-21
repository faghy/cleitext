import type { BaseDevice as Device, Sheet } from '@cleitext/design';
import { blockClass } from '../../lib/css';
import {
  border,
  borderDefaults,
  boxShadow,
  DEVICES,
  emit,
  numeric,
  px,
  suffix,
} from '../../lib/emit';
import { iconShape } from '../../lib/icons';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

/** `iconTopPadding`, `iconTopTabletPadding`, `iconTopMobilePadding` (the device between side and kind). */
function iconSides(kind: 'Padding' | 'Margin', fallback: unknown): Attrs {
  const out: Attrs = {
    [`icon${kind}Unit`]: 'px',
    [`iconTablet${kind}Unit`]: 'px',
    [`iconMobile${kind}Unit`]: 'px',
    [`icon${kind}Link`]: false,
  };
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    out[`icon${side}${kind}`] = fallback;
    out[`icon${side}Tablet${kind}`] = '';
    out[`icon${side}Mobile${kind}`] = '';
  }
  return out;
}

const DEFAULTS: Attrs = {
  icon: 'circle-check',
  iconSize: 40,
  iconSizeTablet: '',
  iconSizeMobile: '',
  iconSizeUnit: 'px',
  align: 'center',
  alignTablet: '',
  alignMobile: '',
  rotation: 0,
  rotationUnit: 'deg',
  link: '',
  target: false,
  // Spectra's name: true means the icon is a link.
  disableLink: false,
  iconAccessabilityMode: 'svg',
  iconAccessabilityDesc: '',
  iconView: 'none',
  iconBorderWidth: 3,
  iconColor: '#333',
  iconBorderColor: '',
  iconBackgroundColorType: 'classic',
  iconBackgroundColor: '',
  iconBackgroundGradientColor:
    'linear-gradient(90deg, rgb(155, 81, 224) 0%, rgb(6, 147, 227) 100%)',
  iconHoverColor: '',
  iconHoverBorderColor: '',
  iconHoverBackgroundColorType: 'classic',
  iconHoverBackgroundColor: '',
  iconHoverBackgroundGradientColor:
    'linear-gradient(90deg, rgb(155, 81, 224) 0%, rgb(6, 147, 227) 100%)',
  ...iconSides('Padding', 5),
  ...iconSides('Margin', ''),
  iconShadowColor: '#00000070',
  iconShadowHOffset: 0,
  iconShadowVOffset: 0,
  iconShadowBlur: 0,
  useSeparateBoxShadows: true,
  iconBoxShadowColor: '#00000070',
  iconBoxShadowHOffset: 0,
  iconBoxShadowVOffset: 0,
  iconBoxShadowBlur: '',
  iconBoxShadowSpread: '',
  iconBoxShadowPosition: 'outset',
  iconBoxShadowColorHover: '',
  iconBoxShadowHOffsetHover: 0,
  iconBoxShadowVOffsetHover: 0,
  iconBoxShadowBlurHover: '',
  iconBoxShadowSpreadHover: '',
  iconBoxShadowPositionHover: 'outset',
  ...borderDefaults('icon'),
  iconBorderStyle: 'default',
};

const D = (device: Device) => suffix(device);

function sides(a: Attrs, kind: 'Padding' | 'Margin', device: Device) {
  const s = D(device);
  const unit = a[`icon${s}${kind}Unit`];
  const prop = kind.toLowerCase();
  const out: Record<string, string> = {};
  for (const side of ['Top', 'Right', 'Bottom', 'Left'])
    out[`${prop}-${side.toLowerCase()}`] = px(a[`icon${side}${s}${kind}`], unit);
  return out;
}

/** Whether a margin is set on any device (the icon then gets a wrapper that carries it). */
function hasMargin(a: Attrs): boolean {
  return ['Top', 'Right', 'Bottom', 'Left'].some((side) =>
    ['', 'Tablet', 'Mobile'].some((s) => numeric(a[`icon${side}${s}Margin`]) !== null),
  );
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-icon`;
  const W = `${R} .pr-icon__wrap`;
  // Focus inside the wrapper (its link) shows the hover state too.
  const focus = `${R} .pr-icon__wrap:has(:focus-visible)`;
  const background =
    a.iconBackgroundColorType === 'classic' ? a.iconBackgroundColor : a.iconBackgroundGradientColor;
  const hoverBackground =
    a.iconHoverBackgroundColorType === 'classic'
      ? a.iconHoverBackgroundColor
      : a.iconHoverBackgroundGradientColor;
  const drop = boxShadow(
    a.iconShadowHOffset,
    a.iconShadowVOffset,
    a.iconShadowBlur,
    undefined,
    a.iconShadowColor,
    undefined,
  );
  const rotation = px(a.rotation, a.rotationUnit || 'deg');
  for (const device of DEVICES) {
    const s = D(device);
    const size = px(a[`iconSize${s}`], a.iconSizeUnit);
    emit(sheet, device, R, { 'text-align': a[`align${s}`] });
    emit(sheet, device, `${R} svg`, {
      width: size,
      height: size,
      ...(device === 'desktop'
        ? {
            transform: rotation ? `rotate(${rotation})` : '',
            'box-sizing': 'content-box',
            fill: a.iconColor,
            filter: drop ? `drop-shadow(${drop})` : '',
          }
        : {}),
    });
    emit(sheet, device, W, {
      display: 'inline-flex',
      ...(device === 'desktop'
        ? {
            background,
            'border-color': a.iconBorderColor,
            'box-shadow': boxShadow(
              a.iconBoxShadowHOffset,
              a.iconBoxShadowVOffset,
              a.iconBoxShadowBlur,
              a.iconBoxShadowSpread,
              a.iconBoxShadowColor,
              a.iconBoxShadowPosition,
            ),
          }
        : {}),
      ...sides(a, 'Padding', device),
      ...border(a, 'icon', device),
    });
    emit(sheet, device, `${R}.pr-icon--has-margin .pr-icon__margin`, sides(a, 'Margin', device));
  }
  emit(sheet, 'desktop', `${W} a`, { display: 'contents' });
  emit(sheet, 'desktop', `${W}:hover svg, ${focus} svg`, { fill: a.iconHoverColor });
  emit(sheet, 'desktop', `${W}:hover, ${focus}`, {
    'border-color': a.iconBorderHColor,
    background: hoverBackground,
    ...(a.useSeparateBoxShadows
      ? {
          'box-shadow': boxShadow(
            a.iconBoxShadowHOffsetHover,
            a.iconBoxShadowVOffsetHover,
            a.iconBoxShadowBlurHover,
            a.iconBoxShadowSpreadHover,
            a.iconBoxShadowColorHover,
            a.iconBoxShadowPositionHover,
            a.iconBoxShadowColor,
          ),
        }
      : {}),
  });
}

/** A link address: web, relative, anchors, mail and phone; a bare domain gets `http://`. */
export function linkHref(value: unknown): string {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (!url) return '';
  if (/^(https?:\/\/|\/|#|mailto:|tel:|\?)/i.test(url)) return url;
  // Any other scheme (javascript:, data:…) is refused.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '';
  return `http://${url}`;
}

/** The icon as SVG, with the accessibility mode chosen (an image, a graphic or decoration). */
function IconSvg({ name, mode, label }: { name: unknown; mode: unknown; label: string }) {
  const shape = iconShape(name);
  if (!shape) return null;
  const [width, height, path] = shape;
  const decorative = mode === 'presentation';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      {...(mode === 'image' ? { role: 'img' } : mode === 'svg' ? { role: 'graphics-symbol' } : {})}
      aria-hidden={decorative ? 'true' : 'false'}
      {...(!decorative ? { 'aria-label': label } : {})}
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

function View({ attrs: a, id, root, editing }: ViewProps) {
  const decorative = a.iconAccessabilityMode === 'presentation';
  const desc = String(a.iconAccessabilityDesc ?? '');
  const href = a.disableLink ? linkHref(a.link) : '';
  const svg = <IconSvg name={a.icon} mode={a.iconAccessabilityMode} label={desc} />;
  const wrap = (
    <span
      className="pr-icon__wrap"
      {...(!decorative ? { 'aria-label': desc || String(a.icon ?? '') } : {})}
    >
      {href && !editing ? (
        <a href={href} rel="noopener noreferrer" {...(a.target ? { target: '_blank' } : {})}>
          {svg}
        </a>
      ) : (
        svg
      )}
    </span>
  );
  const margin = hasMargin(a);
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-icon',
        'pr-icon',
        blockClass(id),
        margin ? 'pr-icon--has-margin' : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    margin ? <div className="pr-icon__margin">{wrap}</div> : wrap,
  );
}

export const icon: PrismaBlock = {
  name: 'icon',
  title: 'Icon',
  description: 'An icon, with a link, rotation, background, border and shadows.',
  keywords: ['icon', 'svg', 'symbol', 'font awesome'],
  defaults: DEFAULTS,
  css,
  View,
  spectra: {
    // A dynamic block: everything is in its attributes.
    'uagb/icon': (a, src) => [src.block('icon', { ...a })],
  },
};
