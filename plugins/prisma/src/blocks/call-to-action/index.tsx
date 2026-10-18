import type { Device, Sheet } from '@cleitext/design';
import type { ReactNode } from 'react';
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
  type Declarations,
} from '../../lib/emit';
import { Icon } from '../../lib/icons';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { typographyDefaults } from '../heading';

/** Four sides of a spacing (`overallBlockTopTabletPadding`, `secondCtaTopMobilePadding`…), as named on the pages it replaces. */
function sideKeys(p: string, kind: 'Padding' | 'Margin'): Attrs {
  const out: Attrs = {};
  for (const d of ['', 'Tablet', 'Mobile'])
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) out[`${p}${side}${d}${kind}`] = '';
  return {
    ...out,
    [`${p}${kind}Unit`]: 'px',
    [`${p}Tablet${kind}Unit`]: 'px',
    [`${p}Mobile${kind}Unit`]: 'px',
    [`${p}${kind}Link`]: false,
  };
}

const DEFAULTS: Attrs = {
  ctaTitle: [],
  description: [],
  ctaText: [{ text: 'Read More' }],
  secondCtaLabel: [{ text: 'Click Here' }],
  enableMultilineParagraph: false,
  inheritFromTheme: false,
  secInheritFromTheme: false,
  ctaButtonType: 'primary',
  secCtaButtonType: 'primary',
  textAlign: 'left',
  textAlignTablet: 'center',
  textAlignMobile: 'center',
  titleColor: '',
  descColor: '',
  ctaPosition: 'right',
  titleTag: 'h3',
  htmlTag: 'div',
  ...typographyDefaults('title', ''),
  ...typographyDefaults('desc', ''),
  ...typographyDefaults('cta', ''),
  ...typographyDefaults('secondCta', ''),
  secondCtaFontSize: 14,
  titleSpace: 10,
  titleSpaceTablet: '',
  titleSpaceMobile: '',
  titleSpaceType: 'px',
  descSpace: 10,
  descSpaceTablet: '',
  descSpaceMobile: '',
  descSpaceType: 'px',
  buttonAlign: '',
  ctaType: 'button',
  ctaLink: '#',
  ctaTarget: false,
  showIcon: true,
  ctaIcon: 'right-long',
  ctaIconPosition: 'after',
  ctaIconSpace: 10,
  ctaIconSpaceTablet: '',
  ctaIconSpaceMobile: '',
  ctaBtnLinkColor: '',
  ctaLinkHoverColor: '',
  ctaBgType: 'color',
  ctaBgHoverType: 'color',
  ctaBgColor: '',
  ctaBgHoverColor: '',
  ctaBtnVertPadding: '',
  ctaBtnHrPadding: '',
  ...Object.fromEntries(
    ['Top', 'Right', 'Bottom', 'Left'].flatMap((s) => [
      [`cta${s}Padding`, ''],
      [`cta${s}PaddingTablet`, ''],
      [`cta${s}PaddingMobile`, ''],
    ]),
  ),
  ctaPaddingUnit: 'px',
  tabletCTAPaddingUnit: 'px',
  mobileCTAPaddingUnit: 'px',
  ctaPaddingLink: false,
  ctaBorderColor: '',
  ctaBorderhoverColor: '',
  ctaBorderStyle: 'solid',
  ctaBorderWidth: '',
  ctaBorderRadius: '',
  ...borderDefaults('btn'),
  stack: 'tablet',
  stackBtn: 'none',
  gapBtn: 15,
  gapBtnTablet: '',
  gapBtnMobile: '',
  contentWidth: 70,
  contentWidthTablet: '',
  contentWidthMobile: '',
  contentWidthType: '%',
  btncontentWidth: 30,
  btncontentWidthTablet: '',
  btncontentWidthMobile: '',
  btncontentWidthType: '%',
  buttonRightSpace: 5,
  buttonRightSpaceTablet: '',
  buttonRightSpaceMobile: '',
  buttonRightSpaceType: 'px',
  enabledSecondCtaButton: false,
  secondCtaLink: '#',
  secondCtaTarget: false,
  showSecondIcon: true,
  secondCtaIcon: 'right-long',
  secondCtaIconPosition: 'after',
  secondCtaIconSpace: 10,
  secondCtaIconSpaceTablet: '',
  secondCtaIconSpaceMobile: '',
  secondCtaColor: '',
  secondCtaBackground: '',
  secondCtaHoverColor: '',
  secondCtaHoverBackground: '',
  secondCtaBgType: 'color',
  secondCtaBgHoverType: 'color',
  ...sideKeys('secondCta', 'Padding'),
  ...borderDefaults('secondCta'),
  ...sideKeys('overallBlock', 'Padding'),
  ...sideKeys('overallBlock', 'Margin'),
};

/** The first value that is a number (an unset side falls back to the older single setting). */
const firstNumber = (...values: unknown[]): unknown =>
  values.find((v) => numeric(v) !== null) ?? '';

/** `flex-start`/`flex-end`/`center` of a text alignment. */
const flexAlign = (align: unknown) =>
  align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';

/**
 * A border with the older single settings (`ctaBorderWidth`…) filling the
 * sides left unset, as the pages it replaces do.
 */
function withLegacyBorder(
  current: Declarations,
  width: unknown,
  radius: unknown,
  color: unknown,
  style: unknown,
): Declarations {
  if (!('border-style' in current) || current['border-style'] === 'default') return {};
  const w = px(width);
  const r = px(radius);
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
    'border-color': current['border-color'] || color,
    'border-style': current['border-style'] || style,
  };
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-call-to-action`;
  const BTN = `${R} a.pr-call-to-action__button`;
  const SECOND = `${R} a.pr-call-to-action__second`;
  const WRAP = `${B} .pr-call-to-action__wrap`;
  const BUTTONS = `${B} .pr-call-to-action__buttons`;
  const button = a.ctaType === 'button';
  const linked = a.ctaType === 'text' || button;
  const second = button && Boolean(a.enabledSecondCtaButton);
  const valign = a.buttonAlign === 'top' ? 'flex-start' : 'center';
  const btnWidth = (device: Device) => {
    if (device === 'desktop') return a.btncontentWidth;
    const own = a[`btncontentWidth${suffix(device)}`];
    // Phones fall back to the desktop width, not the tablet's.
    return numeric(own) !== null ? own : a.btncontentWidth;
  };
  const iconMargin = (position: unknown) =>
    position === 'before' ? 'margin-right' : 'margin-left';

  for (const device of DEVICES) {
    const s = suffix(device);
    const desktop = device === 'desktop';
    emit(sheet, device, `${R} .pr-call-to-action__title`, {
      ...(desktop ? { color: a.titleColor } : {}),
      'margin-bottom': px(a[`titleSpace${s}`], a.titleSpaceType),
    });
    emit(sheet, device, `${R} .pr-call-to-action__desc`, {
      ...(desktop ? { color: a.descColor } : {}),
      'margin-bottom': px(a[`descSpace${s}`], a.descSpaceType),
    });

    // Icons of the buttons.
    const svgSize = px(a[`ctaFontSize${s}`], a[`ctaFontSizeType${s}`]);
    const secondSize = px(a[`secondCtaFontSize${s}`], a[`secondCtaFontSizeType${s}`]);
    if (!desktop) {
      const size = (v: string) => ({ 'font-size': v, width: v, height: v, 'line-height': v });
      emit(sheet, device, `${BTN} svg`, size(svgSize));
      emit(sheet, device, `${SECOND} svg`, size(secondSize));
    }
    emit(sheet, device, `${BTN} > svg`, {
      [iconMargin(a.ctaIconPosition)]: px(a[`ctaIconSpace${s}`]),
      ...(desktop
        ? {
            'font-size': svgSize,
            width: svgSize,
            height: svgSize,
            'line-height': svgSize,
            fill: a.ctaBtnLinkColor,
          }
        : {}),
    });
    emit(sheet, device, `${SECOND} > svg`, {
      [iconMargin(a.secondCtaIconPosition)]: px(a[`secondCtaIconSpace${s}`]),
      ...(desktop
        ? {
            'font-size': secondSize,
            width: secondSize,
            height: secondSize,
            'line-height': secondSize,
            fill: a.secondCtaColor,
          }
        : {}),
    });
    if (desktop) {
      emit(sheet, device, `${BTN}:hover > svg, ${BTN}:focus > svg`, {
        fill: a.ctaLinkHoverColor,
      });
      emit(sheet, device, `${SECOND}:hover > svg, ${SECOND}:focus > svg`, {
        fill: a.secondCtaHoverColor,
      });
      if (a.ctaType === 'text') {
        emit(sheet, device, BTN, { color: a.ctaBtnLinkColor });
        emit(sheet, device, `${BTN}:hover, ${BTN}:focus`, { color: a.ctaLinkHoverColor });
      }
    }

    // The text column and the whole box.
    if (desktop) {
      emit(
        sheet,
        device,
        WRAP,
        linked
          ? { width: px(a.contentWidth, a.contentWidthType), 'text-align': a.textAlign }
          : { width: '100%' },
      );
      emit(sheet, device, R, {
        'text-align': a.textAlign,
        'padding-top': px(a.overallBlockTopPadding, a.overallBlockPaddingUnit),
        'padding-bottom': px(a.overallBlockBottomPadding, a.overallBlockPaddingUnit),
        'padding-left': px(a.overallBlockLeftPadding, a.overallBlockPaddingUnit),
        'padding-right': px(a.overallBlockRightPadding, a.overallBlockPaddingUnit),
        'margin-top': px(a.overallBlockTopMargin, a.overallBlockMarginUnit),
        'margin-bottom': px(a.overallBlockBottomMargin, a.overallBlockMarginUnit),
        'margin-left': px(a.overallBlockLeftMargin, a.overallBlockMarginUnit),
        'margin-right': px(a.overallBlockRightMargin, a.overallBlockMarginUnit),
      });
      if (a.ctaPosition === 'right' && linked) {
        emit(sheet, device, R, { display: 'flex', 'justify-content': 'space-between' });
        emit(sheet, device, BTN, {
          'align-self': valign,
          height: 'fit-content',
          'margin-left': 'auto',
        });
      }
    } else {
      emit(sheet, device, WRAP, {
        width: px(a[`contentWidth${s}`], a.contentWidthType),
        'text-align': a[`textAlign${s}`],
      });
    }

    // Stacking of the text and the buttons.
    const stackedHere =
      a.stack === 'desktop' ||
      (a.stack === 'tablet' && !desktop) ||
      (a.stack === 'mobile' && device === 'mobile');
    if (['desktop', 'tablet', 'mobile', 'none'].includes(String(a.stack))) {
      const own = (kind: 'Padding' | 'Margin') => {
        const unit = a[`overallBlock${s}${kind}Unit`];
        const p = kind.toLowerCase();
        return {
          [`${p}-top`]: px(a[`overallBlockTop${s}${kind}`], unit),
          [`${p}-bottom`]: px(a[`overallBlockBottom${s}${kind}`], unit),
          [`${p}-left`]: px(a[`overallBlockLeft${s}${kind}`], unit),
          [`${p}-right`]: px(a[`overallBlockRight${s}${kind}`], unit),
        };
      };
      emit(
        sheet,
        device,
        R,
        stackedHere
          ? {
              'flex-direction': 'column',
              'align-items': flexAlign(a[`textAlign${s}`]),
              ...(desktop ? {} : { ...own('Padding'), ...own('Margin') }),
            }
          : { 'flex-direction': 'row', 'align-items': valign },
      );
      if (a.stack === 'none' && device !== 'mobile') {
        emit(sheet, device, `${R} .pr-call-to-action__buttons`, {
          'margin-left': px(a[`buttonRightSpace${s}`], a.buttonRightSpaceType),
        });
      }
    }

    // Two buttons side by side or in a column.
    const btnStacked =
      a.stackBtn === 'desktop' ||
      (a.stackBtn === 'tablet' && !desktop) ||
      (a.stackBtn === 'mobile' && device === 'mobile');
    if (['desktop', 'tablet', 'mobile', 'none'].includes(String(a.stackBtn))) {
      emit(
        sheet,
        device,
        BUTTONS,
        btnStacked
          ? {
              ...(desktop || a.stackBtn !== 'desktop' ? { 'flex-direction': 'column' } : {}),
              'row-gap': px(a[`gapBtn${s}`]),
            }
          : {
              'column-gap': px(a[`gapBtn${s}`]),
              ...(a.stackBtn === 'none' && device === 'mobile'
                ? { 'justify-content': 'center' }
                : {}),
            },
      );
    }
    if (second) {
      emit(sheet, device, `${B}.wp-block-button .pr-call-to-action__buttons`, {
        width: px(btnWidth(device), a.btncontentWidthType),
      });
    }

    // The second button.
    if (!a.secInheritFromTheme) {
      const SB = `${R}.wp-block-button a.pr-call-to-action__second`;
      const P = (side: string) =>
        px(a[`secondCta${side}${s}Padding`], a[`secondCta${s}PaddingUnit`]);
      emit(sheet, device, SB, {
        ...(desktop
          ? {
              color: a.secondCtaColor,
              'background-color':
                a.secondCtaBgType === 'color' ? a.secondCtaBackground : 'transparent',
            }
          : {}),
        'padding-top': P('Top'),
        'padding-bottom': P('Bottom'),
        'padding-left': P('Left'),
        'padding-right': P('Right'),
        ...(desktop
          ? { 'align-self': valign, height: 'fit-content', ...border(a, 'secondCta', device) }
          : {}),
      });
      if (desktop) {
        const hoverBg =
          a.secondCtaBgHoverType === 'color'
            ? a.secondCtaHoverBackground
              ? `${String(a.secondCtaHoverBackground)}!important`
              : ''
            : 'transparent';
        emit(sheet, device, `${SB}:hover, ${SB}:focus`, {
          color: a.secondCtaHoverColor,
          'background-color': hoverBg,
          'border-color': a.secondCtaBorderHColor,
        });
      }
      const typo = typography(a, 'secondCta', device);
      if (desktop) {
        // The pages it replaces always reset these two on the second button.
        typo['text-transform'] = a.secondCtaTransform || 'normal';
        typo['text-decoration'] = a.secondCtaDecoration || 'none';
      }
      emit(sheet, device, SECOND, typo);
    }

    // The main button.
    if (!a.inheritFromTheme && button) {
      const MAIN = `${R}.wp-block-button .pr-call-to-action__buttons a.pr-call-to-action__button.wp-block-button__link`;
      const unit = desktop ? a.ctaPaddingUnit : a[`${device}CTAPaddingUnit`];
      const padding = desktop
        ? {
            'padding-top': px(firstNumber(a.ctaTopPadding, a.ctaBtnVertPadding), unit),
            'padding-bottom': px(firstNumber(a.ctaBottomPadding, a.ctaBtnVertPadding), unit),
            'padding-left': px(firstNumber(a.ctaLeftPadding, a.ctaBtnHrPadding), unit),
            'padding-right': px(firstNumber(a.ctaRightPadding, a.ctaBtnHrPadding), unit),
          }
        : {
            'padding-top': px(a[`ctaTopPadding${s}`], unit),
            'padding-bottom': px(a[`ctaBottomPadding${s}`], unit),
            'padding-left': px(a[`ctaLeftPadding${s}`], unit),
            'padding-right': px(a[`ctaRightPadding${s}`], unit),
          };
      const edge = desktop
        ? withLegacyBorder(
            border(a, 'btn', device),
            a.ctaBorderWidth,
            a.ctaBorderRadius,
            a.ctaBorderColor,
            a.ctaBorderStyle,
          )
        : border(a, 'btn', device);
      if (!desktop) emit(sheet, device, BTN, edge);
      emit(sheet, device, MAIN, {
        ...(desktop
          ? {
              color: a.ctaBtnLinkColor,
              'background-color': a.ctaBgType === 'color' ? a.ctaBgColor : 'transparent',
            }
          : {}),
        ...padding,
        ...edge,
      });
      if (desktop) {
        emit(sheet, device, `${MAIN}:hover, ${MAIN}:focus`, {
          color: a.ctaLinkHoverColor,
          'background-color': a.ctaBgHoverType === 'color' ? a.ctaBgHoverColor : 'transparent',
          'border-color': a.btnBorderHColor || a.ctaBorderhoverColor,
        });
      }
    }
    if (!a.inheritFromTheme) emit(sheet, device, BTN, typography(a, 'cta', device));

    // Texts.
    emit(sheet, device, `${B} .pr-call-to-action__title`, typography(a, 'title', device));
    emit(
      sheet,
      device,
      a.enableMultilineParagraph
        ? `${B} .pr-call-to-action__desc p`
        : `${B} .pr-call-to-action__desc`,
      typography(a, 'desc', device),
    );
  }
}

function safeHref(value: unknown): string {
  return typeof value === 'string' && /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(value.trim())
    ? value.trim()
    : '#';
}

function View({ attrs: a, id, text, inner, root, editing }: ViewProps) {
  const has = (name: string) =>
    editing || (Array.isArray(a[name]) && (a[name] as unknown[]).length > 0);
  const button = a.ctaType === 'button';
  const link = (
    href: string,
    blank: boolean,
    className: string,
    icon: ReactNode,
    before: boolean,
    label: ReactNode,
  ) => {
    const content = (
      <>
        {before && icon}
        {label}
        {!before && icon}
      </>
    );
    return editing ? (
      <span className={className}>{content}</span>
    ) : (
      <a
        href={href}
        className={className}
        target={blank ? '_blank' : '_self'}
        rel="noopener noreferrer"
      >
        {content}
      </a>
    );
  };
  const main =
    a.ctaType === 'text' || button
      ? link(
          safeHref(a.ctaLink),
          Boolean(a.ctaTarget),
          `pr-call-to-action__button${button ? ' wp-block-button__link' : ''}`,
          a.showIcon && a.ctaIcon ? <Icon name={a.ctaIcon} /> : null,
          a.ctaIconPosition === 'before',
          text('ctaText', { tagName: 'span', placeholder: 'Read More' }),
        )
      : null;
  const second =
    button && a.enabledSecondCtaButton
      ? link(
          safeHref(a.secondCtaLink),
          Boolean(a.secondCtaTarget),
          'pr-call-to-action__second wp-block-button__link',
          a.showSecondIcon && a.secondCtaIcon ? <Icon name={a.secondCtaIcon} /> : null,
          a.secondCtaIconPosition === 'before',
          text('secondCtaLabel', { tagName: 'span', placeholder: 'Click Here' }),
        )
      : null;
  const content = (
    <>
      <div className="pr-call-to-action__wrap">
        {has('ctaTitle') &&
          text('ctaTitle', {
            tagName: safeTag(a.titleTag, 'h3'),
            className: 'pr-call-to-action__title',
            placeholder: 'Write a heading',
          })}
        {a.enableMultilineParagraph
          ? inner({ className: 'pr-call-to-action__desc' })
          : has('description') &&
            text('description', {
              tagName: 'p',
              className: 'pr-call-to-action__desc',
              placeholder: 'Write a description',
            })}
      </div>
      <div className="pr-call-to-action__buttons">
        {main}
        {second}
      </div>
    </>
  );
  const className = [
    'wp-block-prisma-call-to-action',
    'pr-call-to-action',
    blockClass(id),
    button ? 'wp-block-button' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return root(
    safeTag(a.htmlTag, 'div'),
    { className },
    <>
      {a.ctaType === 'all' && !editing && (
        <a
          href={safeHref(a.ctaLink)}
          className="pr-call-to-action__link-all"
          target={a.ctaTarget ? '_blank' : ''}
          rel="noopener noreferrer"
          aria-label="Call to action link"
        />
      )}
      {content}
    </>,
  );
}

/** A button label as saved: tags other than line breaks removed. */
const label = (value: unknown) =>
  typeof value === 'string' ? value.replace(/<(?!br\s*\/?)[^>]+>/g, '') : value;

export const callToAction: PrismaBlock = {
  name: 'call-to-action',
  title: 'Call To Action',
  description: 'A heading and a description with one or two buttons, or the whole box as a link.',
  keywords: ['call to action', 'cta', 'button', 'banner'],
  container: true,
  allowedBlocks: ['core/paragraph'],
  richAttributes: ['ctaTitle', 'description', 'ctaText', 'secondCtaLabel'],
  defaults: DEFAULTS,
  css,
  View,
  spectra: {
    'uagb/call-to-action': (a, src) => [
      src.block(
        'call-to-action',
        {
          ...a,
          // Title and description are only in the saved HTML: an empty one was left out.
          ctaTitle: src.innerAny('uagb-cta__title'),
          ...(a.enableMultilineParagraph ? {} : { description: src.inner('p', 'uagb-cta__desc') }),
          ...(typeof a.ctaText === 'string' ? { ctaText: label(a.ctaText) } : {}),
          ...(typeof a.secondCtaLabel === 'string'
            ? { secondCtaLabel: label(a.secondCtaLabel) }
            : {}),
        },
        src.children,
      ),
    ],
  },
};
