import type { BaseDevice as Device, Sheet } from '@cleitext/design';
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
  typography,
  type Declarations,
} from '../../lib/emit';
import { Icon } from '../../lib/icons';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { typographyDefaults } from '../heading';

const DEFAULTS: Attrs = {
  heading: [{ text: 'Subscribe Now' }],
  prefix: [{ text: 'Get access to Premium Features for FREE for a year!' }],
  showDescription: true,
  inheritFromTheme: false,
  buttonType: 'primary',
  align: 'center',
  textAlign: 'center',
  link: '#',
  linkTarget: false,
  titleSpace: 0,
  titleSpaceTablet: '',
  titleSpaceMobile: '',
  titleSpaceUnit: 'px',
  vPadding: '',
  hPadding: '',
  vPaddingTablet: '',
  hPaddingTablet: '',
  vPaddingMobile: '',
  hPaddingMobile: '',
  paddingType: 'px',
  ...Object.fromEntries(
    ['Top', 'Right', 'Bottom', 'Left'].flatMap((s) => [
      [`paddingBtn${s}`, ''],
      [`paddingBtn${s}Tablet`, ''],
      [`paddingBtn${s}Mobile`, ''],
    ]),
  ),
  paddingBtnUnit: 'px',
  tabletPaddingBtnUnit: 'px',
  mobilePaddingBtnUnit: 'px',
  spacingLink: false,
  backgroundType: 'color',
  backgroundColor: '',
  backgroundHoverColor: '',
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
  backgroundOpacity: '',
  backgroundHoverOpacity: '',
  titleColor: '',
  titleHoverColor: '',
  icon: 'up-right-from-square',
  iconColor: '',
  iconHoverColor: '',
  iconPosition: 'after',
  prefixColor: '',
  prefixHoverColor: '',
  iconSpace: 10,
  iconSpaceTablet: '',
  iconSpaceMobile: '',
  titleTag: 'span',
  ...typographyDefaults('title', ''),
  titleFontSize: 20,
  titleFontSizeTablet: 20,
  titleFontSizeMobile: 20,
  ...typographyDefaults('prefix', ''),
  prefixFontSize: 14,
  prefixFontSizeTablet: 14,
  prefixFontSizeMobile: 14,
  prefixLineHeight: 2,
  iconFontSize: 20,
  iconFontSizeType: 'px',
  iconFontSizeTablet: '',
  iconFontSizeMobile: '',
  borderStyle: 'solid',
  borderWidth: 1,
  borderRadius: '',
  borderColor: '',
  borderHoverColor: '',
  ...borderDefaults('btn'),
};

/** A hex color as `rgb()`/`rgba()` with an opacity (0–1, or 1–100 as a percentage); other colors as they are. */
export function hexToRgba(color: unknown, opacity?: unknown): string {
  const value = clean(color);
  if (!value) return '';
  const hex = value.replace(/^#/, '');
  const full =
    hex.length === 3 && /^[0-9a-f]{3}$/i.test(hex)
      ? hex.replace(/./g, (c) => c + c)
      : /^[0-9a-f]{6}$/i.test(hex)
        ? hex
        : '';
  if (!full) return value;
  const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(',');
  const n = numeric(opacity);
  if (n === null) return `rgb(${rgb})`;
  return `rgba(${rgb},${Math.abs(n) >= 1 ? n / 100 : n})`;
}

/** The first value that is a number (an unset side falls back to the older single setting). */
const firstNumber = (...values: unknown[]): unknown =>
  values.find((v) => numeric(v) !== null) ?? '';

/** A border with the older single settings filling the sides left unset. */
function withLegacyBorder(current: Declarations, a: Attrs): Declarations {
  if (!('border-style' in current) || current['border-style'] === 'default') return {};
  const w = px(a.borderWidth);
  const r = px(a.borderRadius);
  const pick = (key: string, fallback: string) => (current[key] ? current[key] : fallback);
  return {
    'border-top-width': pick('border-top-width', w),
    'border-left-width': pick('border-left-width', w),
    'border-right-width': pick('border-right-width', w),
    'border-bottom-width': pick('border-bottom-width', w),
    'border-top-left-radius': pick('border-top-left-radius', r),
    'border-top-right-radius': pick('border-top-right-radius', r),
    'border-bottom-left-radius': pick('border-bottom-left-radius', r),
    'border-bottom-right-radius': pick('border-bottom-right-radius', r),
    'border-color': current['border-color'] || a.borderColor,
    'border-style': current['border-style'] || a.borderStyle,
  };
}

/** The gradient of a device; stops and angle fall back to the larger device. */
function gradient(a: Attrs, device: Device): string {
  const chain = (base: string, n = '') => {
    const d = a[`${base}${n}`];
    const t = numeric(a[`${base}Tablet${n}`]) !== null ? a[`${base}Tablet${n}`] : d;
    const v = device === 'desktop' ? d : device === 'tablet' ? t : a[`${base}Mobile${n}`];
    return device === 'mobile' && numeric(v) === null ? t : v;
  };
  const stop = (n: 1 | 2) => {
    const v = chain('gradientLocation', String(n));
    return `${hexToRgba(a[`gradientColor${n}`], a.backgroundOpacity)} ${numeric(v) ?? ''}%`;
  };
  if (a.gradientType !== 'linear')
    return `radial-gradient( at center center, ${stop(1)}, ${stop(2)})`;
  // The angle of a smaller device does not fall back: unset, the larger device's gradient stays.
  const angle = device === 'desktop' ? a.gradientAngle : a[`gradientAngle${suffix(device)}`];
  return numeric(angle) === null
    ? ''
    : `linear-gradient(${numeric(angle)}deg, ${stop(1)}, ${stop(2)})`;
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-marketing-button`;
  const LINK = `${B} .pr-marketing-button__link`;
  const PLAIN = `${R}.wp-block-button:not(.is-style-outline) a.wp-block-button__link:not(.has-background)`;
  const iconColor = a.iconColor === '' ? a.titleColor : a.iconColor;
  const iconHover = a.iconHoverColor === '' ? a.titleHoverColor : a.iconHoverColor;

  for (const device of DEVICES) {
    const s = suffix(device);
    const desktop = device === 'desktop';
    emit(sheet, device, `${B} .pr-marketing-button__prefix`, {
      'margin-top': px(a[`titleSpace${s}`], desktop ? a.titleSpaceUnit : 'px'),
    });
    const space = px(a[`iconSpace${s}`]);
    // On tablets the pages it replaces swap the two sides.
    const swap = device === 'tablet';
    emit(sheet, device, `${B}.pr-marketing-button--icon-after .pr-marketing-button__link svg`, {
      [swap ? 'margin-right' : 'margin-left']: space,
    });
    emit(sheet, device, `${B}.pr-marketing-button--icon-before .pr-marketing-button__link svg`, {
      [swap ? 'margin-left' : 'margin-right']: space,
    });
    // The tablet size never reached the icon on the pages it replaces.
    if (device !== 'tablet') {
      emit(sheet, device, `${B} svg`, {
        width: px(a[`iconFontSize${s}`], a.iconFontSizeType),
        height: px(a[`iconFontSize${s}`], a.iconFontSizeType),
      });
    }
    if (desktop) {
      emit(sheet, device, `${LINK} svg`, { fill: iconColor });
      emit(sheet, device, `${LINK}:hover svg, ${LINK}:focus svg`, { fill: iconHover });
    }
    if (a.inheritFromTheme) continue;

    // Background.
    if (desktop && a.backgroundType === 'transparent') {
      emit(sheet, device, LINK, { background: 'transparent' });
      emit(sheet, device, PLAIN, { background: 'transparent' });
    }
    if (desktop && a.backgroundType === 'color') {
      const bg = hexToRgba(a.backgroundColor, a.backgroundOpacity);
      const hover = hexToRgba(a.backgroundHoverColor, a.backgroundHoverOpacity);
      const HOVER = `${R}.wp-block-button:not(.is-style-outline) .wp-block-button__link.pr-marketing-button__link`;
      emit(sheet, device, `${R}.wp-block-button .wp-block-button__link.pr-marketing-button__link`, {
        background: bg,
      });
      emit(sheet, device, PLAIN, { 'background-color': bg });
      emit(sheet, device, `${HOVER}:hover`, {
        background: hover,
        'border-color': hexToRgba(a.btnBorderHColor),
      });
      emit(sheet, device, `${HOVER}:focus`, { background: hover });
      emit(sheet, device, LINK, { background: bg });
    }
    if (a.backgroundType === 'gradient') {
      const image = gradient(a, device);
      emit(sheet, device, LINK, {
        ...(desktop ? { 'background-color': 'transparent' } : {}),
        'background-image': image,
      });
      emit(sheet, device, PLAIN, {
        ...(desktop ? { 'background-color': 'transparent' } : {}),
        'background-image': image,
      });
    }

    // Texts, padding and border.
    const unit = desktop ? a.paddingBtnUnit : a[`${device}PaddingBtnUnit`];
    const padding = {
      'padding-left': px(firstNumber(a[`paddingBtnLeft${s}`], a[`hPadding${s}`]), unit),
      'padding-right': px(firstNumber(a[`paddingBtnRight${s}`], a[`hPadding${s}`]), unit),
      'padding-top': px(firstNumber(a[`paddingBtnTop${s}`], a[`vPadding${s}`]), unit),
      'padding-bottom': px(firstNumber(a[`paddingBtnBottom${s}`], a[`vPadding${s}`]), unit),
    };
    if (desktop) {
      emit(sheet, device, `${B} p.pr-marketing-button__prefix`, { color: a.prefixColor });
      emit(
        sheet,
        device,
        `${LINK}:hover p.pr-marketing-button__prefix, ${LINK}:focus p.pr-marketing-button__prefix`,
        { color: a.prefixHoverColor },
      );
      emit(sheet, device, `${LINK}.wp-block-button__link`, {
        ...padding,
        ...withLegacyBorder(border(a, 'btn', device), a),
      });
      emit(sheet, device, `${LINK}:hover, ${LINK}:focus`, {
        'border-color': a.btnBorderHColor || a.borderHoverColor,
      });
      emit(sheet, device, `${LINK} .pr-marketing-button__title`, { color: a.titleColor });
      emit(
        sheet,
        device,
        `${LINK}:hover .pr-marketing-button__title, ${LINK}:focus .pr-marketing-button__title`,
        { color: a.titleHoverColor },
      );
    } else {
      emit(
        sheet,
        device,
        device === 'tablet'
          ? `${LINK}.wp-block-button__link`
          : `${R}.wp-block-button .pr-marketing-button__link`,
        { ...padding, ...border(a, 'btn', device) },
      );
    }
    emit(sheet, device, `${B} .pr-marketing-button__title`, typography(a, 'title', device));
    emit(sheet, device, `${B} .pr-marketing-button__prefix`, typography(a, 'prefix', device));
  }
}

function safeHref(value: unknown): string {
  return typeof value === 'string' && /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(value.trim())
    ? value.trim()
    : '#';
}

function View({ attrs: a, id, text, root, editing }: ViewProps) {
  const word = (v: unknown, fallback: string) =>
    typeof v === 'string' && /^[\w-]+$/.test(v) ? v : fallback;
  const position = word(a.iconPosition, 'after');
  const icon = a.icon ? <Icon name={a.icon} /> : null;
  const title = text('heading', {
    tagName: safeTag(a.titleTag, 'span'),
    className: 'pr-marketing-button__title',
    placeholder: 'Add text…',
  });
  const content = (
    <>
      {position === 'before' && (
        <>
          {icon}
          {title}
        </>
      )}
      {position === 'after' && (
        <>
          {title}
          {icon}
        </>
      )}
      {a.showDescription &&
        text('prefix', {
          tagName: 'p',
          className: 'pr-marketing-button__prefix',
          placeholder: 'Add description…',
        })}
    </>
  );
  const linkClass = 'pr-marketing-button__link wp-block-button__link';
  const className = [
    'wp-block-prisma-marketing-button',
    'pr-marketing-button',
    `pr-marketing-button--align-${word(a.align, 'center')}`,
    `pr-marketing-button--text-${word(a.textAlign, 'center')}`,
    `pr-marketing-button--icon-${position}`,
    blockClass(id),
    'wp-block-button',
  ].join(' ');
  return root(
    'div',
    { className },
    editing ? (
      <div className={linkClass}>{content}</div>
    ) : (
      <a
        href={safeHref(a.link)}
        className={linkClass}
        target={a.linkTarget ? '_blank' : ''}
        rel="noopener noreferrer"
      >
        {content}
      </a>
    ),
  );
}

export const marketingButton: PrismaBlock = {
  name: 'marketing-button',
  title: 'Marketing Button',
  description: 'A button with a heading, a line of description and an icon.',
  keywords: ['marketing button', 'button', 'call to action', 'cta'],
  richAttributes: ['heading', 'prefix'],
  defaults: DEFAULTS,
  css,
  View,
  spectra: {
    'uagb/marketing-button': (a, src) => [
      src.block('marketing-button', {
        ...a,
        // The texts are only in the saved HTML: an empty one stays empty.
        heading: src.innerAny('uagb-marketing-btn__title'),
        prefix: src.inner('p', 'uagb-marketing-btn__prefix'),
      }),
    ],
  },
};
