import type { Device, Sheet } from '@cleitext/design';
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
  suffix,
} from '../../lib/emit';
import { Icon } from '../../lib/icons';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

const D = (device: Device) => suffix(device);

/** Padding of four sides (`topPadding`, `topTabletPadding`, `topMobilePadding`) with units per device. */
function paddingDefaults(): Attrs {
  const out: Attrs = { paddingUnit: 'px', tabletPaddingUnit: 'px', mobilePaddingUnit: 'px' };
  for (const side of ['top', 'right', 'bottom', 'left']) {
    out[`${side}Padding`] = '';
    out[`${side}TabletPadding`] = '';
    out[`${side}MobilePadding`] = '';
  }
  return out;
}

function padding(a: Attrs, device: Device) {
  const unit = device === 'desktop' ? a.paddingUnit : a[`${device}PaddingUnit`];
  const key = (side: string) =>
    device === 'desktop' ? `${side}Padding` : `${side}${D(device)}Padding`;
  return {
    'padding-top': px(a[key('top')], unit),
    'padding-right': px(a[key('right')], unit),
    'padding-bottom': px(a[key('bottom')], unit),
    'padding-left': px(a[key('left')], unit),
  };
}

function marginDefaults(): Attrs {
  const out: Attrs = { marginType: 'px' };
  for (const side of ['top', 'right', 'bottom', 'left']) {
    for (const s of ['', 'Tablet', 'Mobile']) out[`${side}Margin${s}`] = '';
  }
  return out;
}

function margin(a: Attrs, device: Device) {
  const s = D(device);
  return {
    'margin-top': px(a[`topMargin${s}`], a.marginType),
    'margin-right': px(a[`rightMargin${s}`], a.marginType),
    'margin-bottom': px(a[`bottomMargin${s}`], a.marginType),
    'margin-left': px(a[`leftMargin${s}`], a.marginType),
  };
}

// ---- Buttons (the group) ---------------------------------------------------------------------

const GROUP_DEFAULTS: Attrs = {
  align: 'center',
  alignTablet: 'center',
  alignMobile: 'center',
  verticalAlignment: '',
  stack: 'none',
  gap: 10,
  gapTablet: '',
  gapMobile: '',
  inheritGap: false,
  flexWrap: false,
  buttonSize: 'default',
  buttonSizeTablet: 'default',
  buttonSizeMobile: 'default',
  fontFamily: 'Default',
  fontWeight: '',
  fontStyle: 'normal',
  fontTransform: '',
  fontDecoration: '',
  fontSize: '',
  fontSizeTablet: '',
  fontSizeMobile: '',
  fontSizeType: 'px',
  fontSizeTypeTablet: 'px',
  fontSizeTypeMobile: 'px',
  lineHeight: '',
  lineHeightTablet: '',
  lineHeightMobile: '',
  lineHeightType: 'px',
  fontLetterSpacing: '',
  fontLetterSpacingTablet: '',
  fontLetterSpacingMobile: '',
  fontLetterSpacingType: 'px',
  loadGoogleFonts: false,
  ...paddingDefaults(),
  ...marginDefaults(),
};

const V_ALIGN: Record<string, string> = { top: 'flex-start', center: 'center', bottom: 'flex-end' };

function groupCss(a: Attrs, B: string, sheet: Sheet): void {
  const W = `${B}.pr-buttons .pr-buttons__wrap`;
  const stackFrom = String(a.stack);
  const order: Device[] = ['desktop', 'tablet', 'mobile'];
  for (const device of DEVICES) {
    const s = D(device);
    const stacked =
      stackFrom !== 'none' && order.indexOf(device) >= order.indexOf(stackFrom as Device);
    emit(sheet, device, W, {
      ...(stacked
        ? { 'flex-direction': 'column' }
        : device === 'desktop' && stackFrom === 'mobile'
          ? { 'flex-direction': 'row' }
          : {}),
      ...(a.inheritGap ? {} : { gap: px(device === 'desktop' ? a.gap : a[`gap${s}`]) }),
      ...(device === 'desktop' && a.flexWrap ? { 'flex-wrap': 'wrap' } : {}),
    });
    const align = String(a[`align${s}`] ?? '');
    const vAlign = V_ALIGN[String(a.verticalAlignment)] ?? '';
    if (align === 'full') {
      emit(sheet, device, W, { width: '100%', 'align-items': vAlign });
      emit(sheet, device, `${W} .wp-block-button`, { width: '100%' });
    } else {
      emit(sheet, device, W, {
        'justify-content': align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : align,
        'align-items': vAlign,
      });
      if (device !== 'desktop') emit(sheet, device, `${W} .wp-block-button`, { width: 'auto' });
    }
    // The buttons inside take the group's typography, padding and margin.
    const size = device === 'desktop' ? a.buttonSize : a[`buttonSize${s}`];
    emit(sheet, device, `${B} .pr-button__link`, {
      ...(device === 'desktop'
        ? {
            'font-family': a.fontFamily,
            'text-transform': a.fontTransform,
            'text-decoration': a.fontDecoration,
            'font-style': a.fontStyle,
            'font-weight': a.fontWeight,
          }
        : {}),
      'font-size': px(a[`fontSize${s}`], a[`fontSizeType${s}`] || a.fontSizeType),
      'line-height': px(a[`lineHeight${s}`], a.lineHeightType),
      'letter-spacing': px(a[`fontLetterSpacing${s}`], a.fontLetterSpacingType),
      ...(size === 'default' ? padding(a, device) : {}),
    });
    emit(sheet, device, `${B} .pr-button__wrapper`, margin(a, device));
  }
}

function GroupView({ attrs: a, id, root, inner }: ViewProps) {
  const size = (v: unknown) => String(v ?? 'default').replace(/\W/g, '');
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-buttons',
        'pr-buttons',
        `pr-btn__${size(a.buttonSize)}-btn`,
        `pr-btn-tablet__${size(a.buttonSizeTablet)}-btn`,
        `pr-btn-mobile__${size(a.buttonSizeMobile)}-btn`,
        blockClass(id),
      ].join(' '),
    },
    inner({ className: `pr-buttons__wrap${a.inheritGap ? ' is-layout-flex' : ''}` }),
  );
}

export const buttons: PrismaBlock = {
  name: 'buttons',
  title: 'Buttons',
  description: 'A row of buttons, aligned and spaced by device, stacked on smaller screens.',
  keywords: ['buttons', 'button', 'call to action', 'link'],
  container: true,
  allowedBlocks: ['prisma/button'],
  defaults: GROUP_DEFAULTS,
  css: groupCss,
  View: GroupView,
};

// ---- Button ----------------------------------------------------------------------------------

const BUTTON_DEFAULTS: Attrs = {
  label: [{ text: 'Click Here' }],
  link: '',
  opensInNewTab: false,
  noFollow: false,
  showIcon: false,
  icon: 'arrow-right',
  iconPosition: 'after',
  iconSpace: 8,
  iconSpaceTablet: '',
  iconSpaceMobile: '',
  iconSize: 15,
  iconSizeTablet: '',
  iconSizeMobile: '',
  iconColor: '',
  iconHColor: '',
  removeText: false,
  color: '',
  hColor: '',
  backgroundType: 'color',
  hoverbackgroundType: 'color',
  background: '',
  hBackground: '',
  gradientValue: '',
  selectGradient: 'basic',
  gradientType: 'linear',
  gradientColor1: '#06558a',
  gradientColor2: '#0063A1',
  gradientLocation1: 0,
  gradientLocation2: 100,
  gradientAngle: 0,
  hovergradientValue: '',
  hoverselectGradient: 'basic',
  hovergradientType: 'linear',
  hovergradientColor1: '#06558a',
  hovergradientColor2: '#0063A1',
  hovergradientLocation1: 0,
  hovergradientLocation2: 100,
  hovergradientAngle: 0,
  ...paddingDefaults(),
  ...marginDefaults(),
  fontFamily: '',
  fontWeight: '',
  fontStyle: '',
  transform: '',
  decoration: '',
  size: '',
  sizeTablet: '',
  sizeMobile: '',
  sizeType: 'px',
  lineHeight: '',
  lineHeightTablet: '',
  lineHeightMobile: '',
  lineHeightType: 'em',
  letterSpacing: '',
  letterSpacingTablet: '',
  letterSpacingMobile: '',
  letterSpacingType: 'px',
  loadGoogleFonts: false,
  ...borderDefaults('btn'),
  borderWidth: '',
  borderRadius: '',
  borderStyle: 'solid',
  borderColor: '#000',
  borderHColor: '',
  boxShadowColor: '#00000026',
  boxShadowHOffset: 0,
  boxShadowVOffset: 0,
  boxShadowBlur: '',
  boxShadowSpread: '',
  boxShadowPosition: 'outset',
  useSeparateBoxShadows: true,
  boxShadowColorHover: '',
  boxShadowHOffsetHover: 0,
  boxShadowVOffsetHover: 0,
  boxShadowBlurHover: '',
  boxShadowSpreadHover: '',
  boxShadowPositionHover: 'outset',
};

/** A background gradient: the preset, or built from two colors (`hover` prefix for hover). */
function gradient(a: Attrs, p: '' | 'hover'): string {
  if (a[`${p}selectGradient`] !== 'advanced') return clean(a[`${p}gradientValue`]);
  const c1 = clean(a[`${p}gradientColor1`]);
  const c2 = clean(a[`${p}gradientColor2`]);
  const l1 = numeric(a[`${p}gradientLocation1`]) ?? 0;
  const l2 = numeric(a[`${p}gradientLocation2`]) ?? 100;
  return a[`${p}gradientType`] === 'radial'
    ? `radial-gradient(at center center, ${c1} ${l1}%, ${c2} ${l2}%)`
    : `linear-gradient(${numeric(a[`${p}gradientAngle`]) ?? 0}deg, ${c1} ${l1}%, ${c2} ${l2}%)`;
}

/** The button's border, filled from the older single values where unset. */
function buttonBorder(a: Attrs, device: Device) {
  const out = border(a, 'btn', device);
  if (device !== 'desktop' || out['border-style'] === 'default') return out;
  const style = out['border-style'] || a.borderStyle;
  if (!style) return {};
  const legacyWidth = px(a.borderWidth);
  const legacyRadius = px(a.borderRadius);
  for (const side of ['top', 'right', 'bottom', 'left']) {
    if (!out[`border-${side}-width`] && style !== 'none') out[`border-${side}-width`] = legacyWidth;
  }
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    if (!out[`border-${corner}-radius`]) out[`border-${corner}-radius`] = legacyRadius;
  }
  return { ...out, 'border-style': style, 'border-color': out['border-color'] || a.borderColor };
}

function buttonCss(a: Attrs, scope: string, sheet: Sheet): void {
  const B = `.pr-buttons ${scope}`;
  const L = `${B} .pr-button__link`;
  const shadow = boxShadow(
    a.boxShadowHOffset,
    a.boxShadowVOffset,
    a.boxShadowBlur,
    a.boxShadowSpread,
    a.boxShadowColor,
    a.boxShadowPosition,
  );
  const shadowHover = boxShadow(
    a.boxShadowHOffsetHover,
    a.boxShadowVOffsetHover,
    a.boxShadowBlurHover,
    a.boxShadowSpreadHover,
    a.boxShadowColorHover,
    a.boxShadowPositionHover,
    a.boxShadowColor,
  );
  const background =
    a.backgroundType === 'transparent'
      ? 'transparent'
      : a.backgroundType === 'gradient'
        ? gradient(a, '')
        : a.background;
  const hoverBackground =
    a.hoverbackgroundType === 'transparent'
      ? 'transparent'
      : a.hoverbackgroundType === 'gradient'
        ? gradient(a, 'hover')
        : a.hBackground;
  for (const device of DEVICES) {
    const s = D(device);
    emit(sheet, device, L, {
      ...(device === 'desktop'
        ? {
            background,
            ...(a.backgroundType === 'gradient' ? { 'background-clip': 'padding-box' } : {}),
            'font-family': a.fontFamily,
            'font-weight': a.fontWeight,
            'font-style': a.fontStyle,
            'text-transform': a.transform,
            'text-decoration': a.decoration,
            color: a.color,
            'box-shadow': shadow,
          }
        : {}),
      'font-size': px(a[`size${s}`], a.sizeType),
      'line-height': px(a[`lineHeight${s}`], a.lineHeightType),
      'letter-spacing': px(a[`letterSpacing${s}`], a.letterSpacingType),
      ...padding(a, device),
      ...margin(a, device),
      ...buttonBorder(a, device),
    });
    const iconSize = px(numeric(a[`iconSize${s}`]) ?? (device === 'desktop' ? 15 : ''));
    emit(sheet, device, `${L} .pr-button__icon > svg`, {
      width: iconSize,
      height: iconSize,
      fill: device === 'desktop' ? a.iconColor || a.color : a.iconColor,
    });
    if (!a.removeText) {
      const space = px(numeric(a[`iconSpace${s}`]) ?? (device === 'desktop' ? 8 : ''));
      emit(sheet, device, `${L} .pr-button__icon--after`, { 'margin-left': space });
      emit(sheet, device, `${L} .pr-button__icon--before`, { 'margin-right': space });
    }
  }
  emit(sheet, 'desktop', `${L}:hover, ${L}:focus`, {
    background: hoverBackground,
    color: a.hColor,
    'border-color': a.btnBorderHColor || a.borderHColor,
  });
  emit(sheet, 'desktop', `${L}:hover .pr-button__icon > svg, ${L}:focus .pr-button__icon > svg`, {
    fill: a.iconHColor || a.hColor,
  });
  if (a.useSeparateBoxShadows) emit(sheet, 'desktop', `${L}:hover`, { 'box-shadow': shadowHover });
}

function ButtonView({ attrs: a, id, text, root, editing }: ViewProps) {
  const href =
    typeof a.link === 'string' && /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(a.link.trim())
      ? a.link.trim()
      : '#';
  const icon = (position: 'before' | 'after') =>
    a.showIcon &&
    a.icon &&
    (a.iconPosition === position || (position === 'after' && a.iconPosition !== 'before')) ? (
      <span className={`pr-button__icon pr-button__icon--${position}`}>
        <Icon name={a.icon} />
      </span>
    ) : null;
  const label = Array.isArray(a.label)
    ? (a.label as { text?: string }[]).map((n) => n.text ?? '').join('')
    : '';
  const content = (
    <>
      {icon('before')}
      {!a.removeText &&
        text('label', { tagName: 'span', className: 'pr-button__text', placeholder: 'Add text…' })}
      {icon('after')}
    </>
  );
  return root(
    'div',
    { className: `wp-block-prisma-button pr-button ${blockClass(id)} wp-block-button` },
    <div className="pr-button__wrapper">
      {editing ? (
        <span className="pr-button__link wp-block-button__link">{content}</span>
      ) : (
        <a
          className="pr-button__link wp-block-button__link"
          href={href}
          rel={a.noFollow ? 'nofollow noopener' : 'noopener'}
          {...(a.opensInNewTab ? { target: '_blank' } : {})}
          {...(a.removeText ? { 'aria-label': label } : {})}
        >
          {content}
        </a>
      )}
    </div>,
  );
}

export const button: PrismaBlock = {
  name: 'button',
  title: 'Button',
  description: 'A button with an icon, colors, border and shadow, normal and on hover.',
  keywords: ['button', 'link', 'call to action'],
  parent: ['buttons'],
  richAttributes: ['label'],
  defaults: BUTTON_DEFAULTS,
  css: buttonCss,
  View: ButtonView,
};
