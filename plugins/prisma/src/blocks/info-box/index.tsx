import type { Device, Sheet } from '@cleitext/design';
import type { ReactNode } from 'react';
import { mediaUrl } from '../../lib/background';
import { blockClass } from '../../lib/css';
import {
  border,
  borderDefaults,
  DEVICES,
  emit,
  numeric,
  px,
  suffix,
  typography,
} from '../../lib/emit';
import { Icon } from '../../lib/icons';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { sideDefaults, sidesCss, typographyDefaults } from '../heading';

/** Margins of a text part: bottom = its space; top/left/right; units per device (Spectra's names). */
function partDefaults(p: string, space: number, top: unknown = ''): Attrs {
  const P = p === 'seperator' ? 'separator' : p;
  return {
    [`${p}Space`]: space,
    [`${p}TabletSpace`]: '',
    [`${p}MobileSpace`]: '',
    [`${P}TopMargin`]: top,
    [`${P}LeftMargin`]: '',
    [`${P}RightMargin`]: '',
    [`${P}MarginTopTablet`]: '',
    [`${P}MarginLeftTablet`]: '',
    [`${P}MarginRightTablet`]: '',
    [`${P}MarginTopMobile`]: '',
    [`${P}MarginLeftMobile`]: '',
    [`${P}MarginRightMobile`]: '',
    [`${p}SpaceUnit`]: 'px',
    [`${P}TabletMarginUnit`]: 'px',
    [`${P}MobileMarginUnit`]: 'px',
  };
}

function partMargins(a: Attrs, p: string, device: Device) {
  const P = p === 'seperator' ? 'separator' : p;
  if (device === 'desktop') {
    const unit = a[`${p}SpaceUnit`];
    return {
      'margin-bottom': px(a[`${p}Space`], unit),
      'margin-top': px(a[`${P}TopMargin`], unit),
      'margin-left': px(a[`${P}LeftMargin`], unit),
      'margin-right': px(a[`${P}RightMargin`], unit),
    };
  }
  const D = device === 'tablet' ? 'Tablet' : 'Mobile';
  const unit = a[`${P}${D}MarginUnit`];
  return {
    'margin-bottom': px(a[`${p}${D}Space`], unit),
    'margin-top': px(a[`${P}MarginTop${D}`], unit),
    'margin-left': px(a[`${P}MarginLeft${D}`], unit),
    'margin-right': px(a[`${P}MarginRight${D}`], unit),
  };
}

const DEFAULTS: Attrs = {
  prefixTitle: [],
  infoBoxTitle: [],
  headingDesc: [],
  ctaText: [{ text: 'Read More' }],
  showPrefix: false,
  showTitle: true,
  showDesc: true,
  showIcon: true,
  prefixHeadingTag: 'span',
  headingTag: 'h3',
  htmlTag: 'div',
  source_type: 'icon',
  icon: 'circle-check',
  iconimgPosition: 'above-title',
  sourceAlign: 'top',
  stack: 'tablet',
  iconImage: { url: '', alt: '' },
  imageAlt: '',
  imgTagWidth: 0,
  imgTagHeight: 0,
  seperatorStyle: 'none',
  seperatorPosition: 'after_title',
  ctaType: 'none',
  ctaLink: '',
  ctaTarget: false,
  showCtaIcon: true,
  ctaIcon: 'right-long',
  ctaIconPosition: 'after',
  headingAlign: 'center',
  headingAlignTablet: '',
  headingAlignMobile: '',
  headingColor: '',
  subHeadingColor: '',
  prefixColor: '',
  iconColor: '#333',
  iconHover: '',
  iconView: 'none',
  iconShape: 'Circle',
  iconBackgroundColor: '#6EC1E3',
  iconBackgroundHoverColor: '',
  iconBorderWidth: 3,
  seperatorColor: '#333',
  ctaLinkColor: '',
  ctaLinkHoverColor: '',
  ctaBtnLinkColor: '',
  ctaBgType: 'color',
  ctaBgHoverType: 'color',
  ctaBgColor: '',
  ctaBgHoverColor: '',
  ctaBorderStyle: 'solid',
  ctaBorderColor: '',
  ctaBorderWidth: 1,
  ctaBorderRadius: 0,
  ctaBorderhoverColor: '',
  ...borderDefaults('btn'),
  ...borderDefaults('infobox'),
  iconSize: 30,
  iconSizeTablet: '',
  iconSizeMobile: '',
  iconSizeType: 'px',
  imageWidth: '',
  imageWidthTablet: '',
  imageWidthMobile: '',
  imageWidthUnit: 'px',
  imageWidthUnitTablet: 'px',
  imageWidthUnitMobile: 'px',
  imageWidthType: true,
  iconimgBorderRadius: 0,
  iconimgBorderRadiusUnit: 'px',
  seperatorWidth: 30,
  seperatorWidthTablet: '',
  seperatorWidthMobile: '',
  separatorWidthType: '%',
  seperatorThickness: 2,
  thicknessUnit: 'px',
  ctaIconSpace: 5,
  ctaIconSpaceTablet: '',
  ctaIconSpaceMobile: '',
  ctaIconSpaceType: 'px',
  ...partDefaults('prefix', 10, 5),
  ...partDefaults('head', 10),
  ...partDefaults('subHead', 20),
  ...partDefaults('seperator', 0),
  iconTopMargin: '',
  iconRightMargin: '',
  iconBottomMargin: '',
  iconLeftMargin: '',
  iconMarginTopTablet: '',
  iconMarginRightTablet: '',
  iconMarginBottomTablet: '',
  iconMarginLeftTablet: '',
  iconMarginTopMobile: '',
  iconMarginRightMobile: '',
  iconMarginBottomMobile: '',
  iconMarginLeftMobile: '',
  iconMarginUnit: 'px',
  iconTabletMarginUnit: 'px',
  iconMobileMarginUnit: 'px',
  ...sideDefaults('block', 'Padding'),
  ...sideDefaults('block', 'Margin'),
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
  ...typographyDefaults('prefix', ''),
  ...typographyDefaults('head', ''),
  ...typographyDefaults('subHead', ''),
  ...typographyDefaults('cta', ''),
};

/** A number of a device, else the larger device's. */
function chain(a: Attrs, base: string, device: Device): unknown {
  const desktop = a[base];
  const tablet = numeric(a[`${base}Tablet`]) !== null ? a[`${base}Tablet`] : desktop;
  if (device === 'desktop') return desktop;
  if (device === 'tablet') return tablet;
  return numeric(a[`${base}Mobile`]) !== null ? a[`${base}Mobile`] : tablet;
}

function iconPadding(a: Attrs, device: Device) {
  if (device === 'desktop') {
    // Only whole numbers count (unset means no space), as the pages it replaces.
    const whole = (v: unknown) => (Number.isInteger(v) ? (v as number) : 0);
    return {
      'padding-top': px(whole(a.iconTopMargin), a.iconMarginUnit),
      'padding-right': px(whole(a.iconRightMargin), a.iconMarginUnit),
      'padding-bottom': px(whole(a.iconBottomMargin), a.iconMarginUnit),
      'padding-left': px(whole(a.iconLeftMargin), a.iconMarginUnit),
    };
  }
  const D = device === 'tablet' ? 'Tablet' : 'Mobile';
  const unit = a[`icon${D}MarginUnit`];
  return {
    'padding-top': px(a[`iconMarginTop${D}`], unit),
    'padding-right': px(a[`iconMarginRight${D}`], unit),
    'padding-bottom': px(a[`iconMarginBottom${D}`], unit),
    'padding-left': px(a[`iconMarginLeft${D}`], unit),
  };
}

/** The CTA button's border, falling back to the older single values. */
function ctaBorder(a: Attrs, device: Device) {
  const out = border(a, 'btn', device);
  if (!out['border-style'] || out['border-style'] === 'default') {
    if (device !== 'desktop' || !a.ctaBorderStyle) return out;
    return {
      ...out,
      'border-style': a.ctaBorderStyle,
      'border-color': a.ctaBorderColor,
      'border-width': px(a.ctaBorderWidth),
      'border-radius': px(a.ctaBorderRadius),
    };
  }
  for (const side of ['top', 'right', 'bottom', 'left']) {
    if (!out[`border-${side}-width`]) out[`border-${side}-width`] = px(a.ctaBorderWidth);
  }
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    if (!out[`border-${corner}-radius`]) out[`border-${corner}-radius`] = px(a.ctaBorderRadius);
  }
  if (!out['border-color']) out['border-color'] = a.ctaBorderColor;
  return out;
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-info-box`;
  const pos = String(a.iconimgPosition);
  const hasMargin = hasMargins(a);
  for (const device of DEVICES) {
    const s = suffix(device);
    const icon = px(chain(a, 'iconSize', device), a.iconSizeType);
    const imageWidth = px(chain(a, 'imageWidth', device), a[`imageWidthUnit${s}`]);
    emit(sheet, device, `${B} .pr-info-box__shape`, {
      ...(device === 'desktop'
        ? {
            margin: 'auto',
            display: 'inline-flex',
            'align-items': 'center',
            'justify-content': 'center',
            'box-sizing': 'content-box',
          }
        : {}),
      width: icon,
      height: icon,
      'line-height': icon,
      ...iconPadding(a, device),
    });
    emit(sheet, device, `${R} .pr-info-box__icon svg`, {
      width: icon,
      height: icon,
      'line-height': icon,
      'font-size': icon,
      ...(device === 'desktop' ? { color: a.iconColor, fill: a.iconColor } : {}),
      'box-sizing': a.iconSizeType === '%' ? 'border-box' : 'content-box',
    });
    emit(sheet, device, `${R} .pr-info-box__icon > svg, ${R} img`, iconPadding(a, device));
    if (device === 'desktop') {
      emit(sheet, device, `${R} img, ${B} .pr-info-box__image img`, {
        'border-radius': px(a.iconimgBorderRadius, a.iconimgBorderRadiusUnit),
      });
    }
    // Texts.
    emit(sheet, device, `${B} .pr-info-box__prefix`, {
      ...(device === 'desktop' ? { color: a.prefixColor } : {}),
      ...partMargins(a, 'prefix', device),
      ...typography(a, 'prefix', device),
    });
    emit(sheet, device, `${B} .pr-info-box__title`, {
      ...(device === 'desktop' ? { color: a.headingColor } : {}),
      ...partMargins(a, 'head', device),
      ...typography(a, 'head', device),
    });
    emit(sheet, device, `${B} .pr-info-box__desc`, {
      ...(device === 'desktop' ? { color: a.subHeadingColor } : {}),
      ...partMargins(a, 'subHead', device),
      ...typography(a, 'subHead', device),
    });
    emit(sheet, device, `${B} .pr-info-box__separator`, {
      width: px(a[`seperatorWidth${s}`], a.separatorWidthType),
      ...(device === 'desktop'
        ? {
            'border-top-width': px(a.seperatorThickness, a.thicknessUnit),
            'border-top-color': a.seperatorColor,
            'border-top-style': a.seperatorStyle,
          }
        : {}),
      ...partMargins(a, 'seperator', device),
    });
    // The box.
    emit(sheet, device, R, border(a, 'infobox', device));
    if (pos === 'above-title' || pos === 'below-title') {
      emit(sheet, device, `${R}.pr-info-box--icon-${pos}`, { 'text-align': a[`headingAlign${s}`] });
    }
    const spacing = {
      ...sidesCss(a, 'block', 'Padding', device),
      ...(hasMargin ? sidesCss(a, 'block', 'Margin', device) : {}),
    };
    emit(sheet, device, hasMargin ? `${R} .pr-info-box__margin` : R, spacing);
    if (a.imageWidthType && imageWidth) {
      emit(
        sheet,
        device,
        `${R} .pr-info-box__image img, ${R} .pr-info-box__left-title img, ${R} .pr-info-box__right-title img`,
        {
          width: imageWidth,
          ...(a[`imageWidthUnit${s}`] === '%' ? { 'box-sizing': 'border-box' } : {}),
        },
      );
    }
    // The CTA.
    const ctaIcon = px(
      a[`ctaFontSize${s}`] || a.ctaFontSize,
      a[`ctaFontSizeType${s}`] || a.ctaFontSizeType,
    );
    if (a.ctaType === 'text' || a.ctaType === 'button') {
      emit(sheet, device, `${B} .pr-info-box__cta svg`, {
        'font-size': ctaIcon,
        height: ctaIcon,
        width: ctaIcon,
        'line-height': ctaIcon,
      });
      emit(sheet, device, `${B} .pr-info-box__cta`, typography(a, 'cta', device));
      const space = px(chain(a, 'ctaIconSpace', device), a.ctaIconSpaceType);
      emit(
        sheet,
        device,
        `${R} .pr-info-box__cta > svg`,
        a.ctaIconPosition === 'before' ? { 'margin-right': space } : { 'margin-left': space },
      );
    }
    if (a.ctaType === 'button') {
      const BTN = `${R} .pr-info-box__cta-wrap .pr-info-box__cta.pr-info-box__cta--button`;
      emit(sheet, device, BTN, {
        ...(device === 'desktop'
          ? {
              color: a.ctaBtnLinkColor,
              'background-color': a.ctaBgType === 'color' ? a.ctaBgColor : 'transparent',
            }
          : {}),
        'padding-top': px(
          a[`paddingBtnTop${s}`],
          device === 'desktop' ? a.paddingBtnUnit : a[`${device}PaddingBtnUnit`],
        ),
        'padding-right': px(
          a[`paddingBtnRight${s}`],
          device === 'desktop' ? a.paddingBtnUnit : a[`${device}PaddingBtnUnit`],
        ),
        'padding-bottom': px(
          a[`paddingBtnBottom${s}`],
          device === 'desktop' ? a.paddingBtnUnit : a[`${device}PaddingBtnUnit`],
        ),
        'padding-left': px(
          a[`paddingBtnLeft${s}`],
          device === 'desktop' ? a.paddingBtnUnit : a[`${device}PaddingBtnUnit`],
        ),
        ...ctaBorder(a, device),
      });
      if (device === 'desktop') {
        emit(sheet, device, `${B} .pr-info-box__cta svg`, { fill: a.ctaBtnLinkColor });
        emit(sheet, device, `${BTN}:hover, ${BTN}:focus`, {
          color: a.ctaLinkHoverColor,
          'background-color': a.ctaBgHoverType === 'color' ? a.ctaBgHoverColor : 'transparent',
          'border-color': a.btnBorderHColor || a.ctaBorderhoverColor,
        });
        emit(sheet, device, `${B} .pr-info-box__cta:hover > svg`, { fill: a.ctaLinkHoverColor });
      }
    }
    if (a.ctaType === 'text' && device === 'desktop') {
      emit(sheet, device, `${B} .pr-info-box__cta`, {
        'text-decoration': a.ctaDecoration,
        color: a.ctaLinkColor,
      });
      emit(sheet, device, `${B} .pr-info-box__cta svg`, { fill: a.ctaLinkColor });
      emit(sheet, device, `${B} .pr-info-box__cta:hover, ${B} .pr-info-box__cta:focus`, {
        color: a.ctaLinkHoverColor,
      });
      emit(sheet, device, `${B} .pr-info-box__cta:hover svg, ${B} .pr-info-box__cta:focus svg`, {
        fill: a.ctaLinkHoverColor,
      });
    }
    // Side layouts that do not stack.
    if ((pos === 'left' || pos === 'right') && device !== 'desktop') {
      if (a.stack === 'none') emit(sheet, device, `${B} .pr-info-box__margin`, { display: 'flex' });
      if (a.stack === 'mobile')
        emit(sheet, device, `${B} .pr-info-box__margin`, {
          display: device === 'tablet' ? 'flex' : 'block',
        });
    }
  }
  // Hover colors.
  emit(
    sheet,
    'desktop',
    `${B} .pr-info-box__icon svg:hover, ${B} .pr-info-box__link-all:hover ~ .pr-info-box__content svg, ${B} .pr-info-box__link-all:focus ~ .pr-info-box__content svg`,
    {
      fill: a.iconHover,
      color: a.iconHover,
    },
  );
  emit(sheet, 'desktop', `${R}:hover`, { 'border-color': a.infoboxBorderHColor });
  if (a.iconView === 'Stacked') {
    emit(sheet, 'desktop', `${B} .pr-info-box__shape`, {
      'background-color': a.iconBackgroundColor,
      ...(a.iconShape === 'Circle' ? { 'border-radius': '50%' } : {}),
    });
    emit(sheet, 'desktop', `${B} .pr-info-box__shape:hover`, {
      'background-color': a.iconBackgroundHoverColor
        ? `${String(a.iconBackgroundHoverColor)} !important`
        : '',
    });
  }
  if (a.iconView === 'Framed') {
    emit(sheet, 'desktop', `${B} .pr-info-box__shape`, {
      border: `${px(a.iconBorderWidth)} solid ${String(a.iconBackgroundColor)}`,
      ...(a.iconShape === 'Circle' ? { 'border-radius': '50%' } : {}),
    });
    if (a.iconBackgroundHoverColor) {
      emit(sheet, 'desktop', `${B} .pr-info-box__shape:hover`, {
        border: `${px(a.iconBorderWidth)} solid ${String(a.iconBackgroundHoverColor)}`,
      });
    }
  }
}

/** Whether a margin is set on any device (the box then gets an inner wrapper). */
function hasMargins(a: Attrs): boolean {
  return ['Top', 'Right', 'Bottom', 'Left'].some((side) =>
    ['', 'Tablet', 'Mobile'].some((s) => numeric(a[`block${side}Margin${s}`]) !== null),
  );
}

function safeHref(value: unknown): string {
  return typeof value === 'string' && /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(value.trim())
    ? value.trim()
    : '';
}

function View({ attrs: a, id, text, root, editing }: ViewProps) {
  const pos = String(a.iconimgPosition ?? 'above-title');
  const has = (name: string) =>
    editing || (Array.isArray(a[name]) && (a[name] as unknown[]).length > 0);
  const separator =
    a.seperatorStyle && a.seperatorStyle !== 'none' ? (
      <div className="pr-info-box__separator" />
    ) : null;
  // Where the separator goes.
  let at = String(a.seperatorPosition ?? 'after_title');
  let iconSep: 'before' | 'after' | null = null;
  if (at === 'after_icon') {
    if (pos === 'above-title' || pos === 'below-title') iconSep = 'after';
    else at = 'after_title';
  }
  if (!iconSep && pos === 'below-title' && at === 'after_title') iconSep = 'before';
  const slot = (name: string) => (!iconSep && at === name ? separator : null);

  const image = mediaUrl(a.iconImage);
  const iconPiece = a.showIcon ? (
    a.source_type !== 'image' ? (
      a.icon ? (
        <div className="pr-info-box__icon">
          {a.iconView === 'Stacked' || a.iconView === 'Framed' ? (
            <div
              className={`pr-info-box__shape pr-info-box__shape--${a.iconShape === 'Circle' ? 'circle' : 'square'}`}
            >
              <Icon name={a.icon} />
            </div>
          ) : (
            <Icon name={a.icon} />
          )}
        </div>
      ) : null
    ) : image ? (
      <div className="pr-info-box__image">
        <img
          src={image}
          alt={String(a.imageAlt ?? '')}
          {...(a.imageWidthType && numeric(a.imageWidth)
            ? { width: Number(a.imageWidth) }
            : numeric(a.imgTagWidth)
              ? { width: Number(a.imgTagWidth) }
              : {})}
          {...(numeric(a.imgTagHeight) ? { height: Number(a.imgTagHeight) } : {})}
          loading="lazy"
          decoding="async"
        />
      </div>
    ) : null
  ) : null;
  const icon = (
    <>
      {iconSep === 'before' && separator}
      {iconPiece}
      {iconSep === 'after' && separator}
    </>
  );
  const titleWrap = (
    <div className="pr-info-box__title-wrap">
      {a.showPrefix && has('prefixTitle')
        ? text('prefixTitle', {
            tagName: safeTag(a.prefixHeadingTag, 'span'),
            className: 'pr-info-box__prefix',
            placeholder: 'Prefix',
          })
        : null}
      {slot('after_prefix')}
      {a.showTitle !== false && has('infoBoxTitle')
        ? text('infoBoxTitle', {
            tagName: safeTag(a.headingTag, 'h3'),
            className: 'pr-info-box__title',
            placeholder: 'Title',
          })
        : null}
    </div>
  );
  const href = safeHref(a.ctaLink);
  const target = a.ctaTarget ? '_blank' : undefined;
  const ctaIcon = a.showCtaIcon && a.ctaIcon ? <Icon name={a.ctaIcon} /> : null;
  const cta =
    a.ctaType === 'text' || a.ctaType === 'button' ? (
      <div className="pr-info-box__cta-wrap wp-block-button">
        {createLink(
          editing,
          href || '#',
          target,
          `pr-info-box__cta${a.ctaType === 'button' ? ' pr-info-box__cta--button wp-block-button__link' : ''}`,
          <>
            {a.ctaIconPosition === 'before' && ctaIcon}
            {text('ctaText', {
              tagName: 'span',
              className: 'pr-info-box__cta-text',
              placeholder: 'Read More',
            })}
            {a.ctaIconPosition !== 'before' && ctaIcon}
          </>,
        )}
      </div>
    ) : null;
  const tail = (
    <>
      {slot('after_title')}
      {a.showDesc !== false && has('headingDesc')
        ? text('headingDesc', {
            tagName: 'p',
            className: 'pr-info-box__desc',
            placeholder: 'Description',
          })
        : null}
      {slot('after_desc')}
      {cta}
    </>
  );
  let layout: ReactNode;
  switch (pos) {
    case 'below-title':
      layout = (
        <div className="pr-info-box__content">
          {titleWrap}
          {icon}
          {tail}
        </div>
      );
      break;
    case 'left-title':
      layout = (
        <div className="pr-info-box__content">
          <div className="pr-info-box__left-title">
            {icon}
            {titleWrap}
          </div>
          {tail}
        </div>
      );
      break;
    case 'right-title':
      layout = (
        <div className="pr-info-box__content">
          <div className="pr-info-box__right-title">
            {titleWrap}
            {icon}
          </div>
          {tail}
        </div>
      );
      break;
    case 'left':
      layout = (
        <>
          {icon}
          <div className="pr-info-box__content">
            {titleWrap}
            {tail}
          </div>
        </>
      );
      break;
    case 'right':
      layout = (
        <>
          <div className="pr-info-box__content">
            {titleWrap}
            {tail}
          </div>
          {icon}
        </>
      );
      break;
    default:
      layout = (
        <div className="pr-info-box__content">
          {icon}
          {titleWrap}
          {tail}
        </div>
      );
  }
  const all =
    a.ctaType === 'all' && !editing ? (
      <a
        href={href}
        className="pr-info-box__link-all"
        {...(target ? { target } : {})}
        aria-label="Info box link"
        rel="noopener noreferrer"
      />
    ) : null;
  const hasMargin = hasMargins(a);
  const stack = String(a.stack ?? 'tablet');
  const className = [
    'wp-block-prisma-info-box',
    'pr-info-box',
    blockClass(id),
    a.ctaType === 'all' ? 'pr-info-box--cta-all' : '',
    `pr-info-box--icon-${pos.replace(/[^\w-]/g, '')}`,
    pos === 'left' || pos === 'left-title' ? 'pr-info-box--left' : '',
    pos === 'right' || pos === 'right-title' ? 'pr-info-box--right' : '',
    (pos === 'left' || pos === 'right') && stack !== 'none'
      ? `pr-info-box--stacked-${stack.replace(/\W/g, '')}`
      : '',
    `pr-info-box--valign-${String(a.sourceAlign ?? 'top').replace(/\W/g, '')}`,
    hasMargin ? 'pr-info-box--has-margin' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return root(
    safeTag(a.htmlTag, 'div'),
    { className },
    hasMargin ? (
      <div className="pr-info-box__margin">
        {all}
        {layout}
      </div>
    ) : (
      <>
        {all}
        {layout}
      </>
    ),
  );
}

function createLink(
  editing: boolean,
  href: string,
  target: string | undefined,
  className: string,
  children: ReactNode,
) {
  return editing ? (
    <span className={className}>{children}</span>
  ) : (
    <a href={href} className={className} {...(target ? { target } : {})} rel="noopener noreferrer">
      {children}
    </a>
  );
}

export const infoBox: PrismaBlock = {
  name: 'info-box',
  title: 'Info Box',
  description: 'An icon or image with a prefix, a title, a description and a call to action.',
  keywords: ['info box', 'icon box', 'feature', 'card', 'call to action'],
  richAttributes: ['prefixTitle', 'infoBoxTitle', 'headingDesc', 'ctaText'],
  defaults: DEFAULTS,
  css,
  View,
  media: (a) => {
    const id = (a.iconImage as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' ? [id] : [];
  },
};
