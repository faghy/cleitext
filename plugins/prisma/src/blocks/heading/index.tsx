import type { Sheet } from '@cleitext/design';
import { blockClass } from '../../lib/css';
import {
  border,
  borderDefaults,
  clean,
  DEVICES,
  emit,
  px,
  suffix,
  typography,
} from '../../lib/emit';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

/** Typography attributes of a part (`head`, `subHead`, `highLight`). */
export function typographyDefaults(p: string, family = 'Default'): Attrs {
  const out: Attrs = {
    [`${p}FontFamily`]: family,
    [`${p}FontWeight`]: '',
    [`${p}FontStyle`]: '',
    [`${p}Transform`]: '',
    [`${p}Decoration`]: '',
    [`${p}LineHeightType`]: 'em',
    [`${p}LetterSpacingType`]: 'px',
    [`${p}LoadGoogleFonts`]: false,
  };
  for (const s of ['', 'Tablet', 'Mobile']) {
    out[`${p}FontSize${s}`] = '';
    out[`${p}FontSizeType${s}`] = 'px';
    out[`${p}LineHeight${s}`] = '';
    out[`${p}LetterSpacing${s}`] = '';
  }
  return out;
}

/** Four sides of a part (`blockTopPadding`, `blockTopPaddingTablet`…) with their unit. */
export function sideDefaults(p: string, kind: 'Padding' | 'Margin'): Attrs {
  const out: Attrs = { [`${p}${kind}Link`]: true };
  for (const s of ['', 'Tablet', 'Mobile']) {
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) out[`${p}${side}${kind}${s}`] = '';
    out[`${p}${kind}Unit${s}`] = 'px';
  }
  return out;
}

/** `padding-top`… of a part on a device (`blockTopPadding[Tablet|Mobile]`, unit `blockPaddingUnit…`). */
export function sidesCss(
  a: Attrs,
  p: string,
  kind: 'Padding' | 'Margin',
  device: 'desktop' | 'tablet' | 'mobile',
) {
  const s = suffix(device);
  const unit = a[`${p}${kind}Unit${s}`];
  const prop = kind.toLowerCase();
  return {
    [`${prop}-top`]: px(a[`${p}Top${kind}${s}`], unit),
    [`${prop}-right`]: px(a[`${p}Right${kind}${s}`], unit),
    [`${prop}-bottom`]: px(a[`${p}Bottom${kind}${s}`], unit),
    [`${prop}-left`]: px(a[`${p}Left${kind}${s}`], unit),
  };
}

const DEFAULTS: Attrs = {
  headingTitle: [],
  headingDesc: [],
  headingId: '',
  headingTitleToggle: true,
  headingDescToggle: false,
  headingTag: 'h2',
  headingWrapper: 'div',
  headingDescPosition: 'below-heading',
  seperatorStyle: 'none',
  seperatorPosition: 'below-heading',
  headingAlign: '',
  headingAlignTablet: '',
  headingAlignMobile: '',
  headingColorType: 'classic',
  headingColor: '',
  headingGradientColor: 'linear-gradient(90deg, rgb(155, 81, 224) 0%, rgb(6, 147, 227) 100%)',
  subHeadingColor: '',
  linkColor: '',
  linkHColor: '',
  blockBackgroundType: 'classic',
  blockBackground: '',
  blockGradientBackground: 'linear-gradient(90deg, rgb(6, 147, 227) 0%, rgb(155, 81, 224) 100%)',
  separatorColor: '#0170b9',
  separatorHeight: 2,
  separatorHeightType: 'px',
  separatorWidth: 12,
  separatorWidthTablet: '',
  separatorWidthMobile: '',
  separatorWidthType: '%',
  separatorSpace: 15,
  separatorSpaceTablet: '',
  separatorSpaceMobile: '',
  separatorSpaceType: 'px',
  headSpace: 15,
  headSpaceTablet: '',
  headSpaceMobile: '',
  headSpaceType: 'px',
  subHeadSpace: 15,
  subHeadSpaceTablet: '',
  subHeadSpaceMobile: '',
  subHeadSpaceType: 'px',
  ...sideDefaults('block', 'Padding'),
  ...sideDefaults('block', 'Margin'),
  ...typographyDefaults('head', ''),
  ...typographyDefaults('subHead', ''),
  headShadowColor: '',
  headShadowHOffset: 0,
  headShadowVOffset: 0,
  headShadowBlur: 10,
  highLightColor: '#fff',
  highLightBackground: '#007cba',
  ...typographyDefaults('highLight'),
  highLightFontStyle: 'normal',
  ...sideDefaults('highLight', 'Padding'),
  ...borderDefaults('highLight'),
};

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-heading`;
  const gradient = a.headingColorType === 'gradient';
  const shadow = clean(a.headShadowColor)
    ? `${px(a.headShadowHOffset)} ${px(a.headShadowVOffset)} ${px(a.headShadowBlur)} ${clean(a.headShadowColor)}`
    : '';
  const separator = a.seperatorStyle !== 'none' && a.seperatorStyle !== '';
  const headSpaced = Boolean(a.headingDescToggle) || separator;
  emit(sheet, 'desktop', `${R} .pr-heading__text`, {
    color: a.headingColor,
    ...(gradient
      ? {
          background: a.headingGradientColor,
          '-webkit-background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
          filter: shadow ? `drop-shadow(${shadow})` : '',
        }
      : { 'text-shadow': shadow }),
  });
  emit(sheet, 'desktop', `${R} a`, {
    color: a.linkColor,
    ...(gradient ? { '-webkit-text-fill-color': a.linkColor } : {}),
  });
  emit(sheet, 'desktop', `${R} a:hover`, {
    color: a.linkHColor,
    ...(gradient ? { '-webkit-text-fill-color': a.linkHColor } : {}),
  });
  emit(sheet, 'desktop', `${R} .pr-heading__desc`, { color: a.subHeadingColor });
  emit(sheet, 'desktop', `${R} mark:not(.has-inline-color)`, {
    background: a.highLightBackground,
    color: a.highLightColor,
    '-webkit-text-fill-color': a.highLightColor,
  });
  emit(sheet, 'desktop', `${R} mark:not(.has-inline-color):hover`, {
    'border-color': a.highLightBorderHColor,
  });
  for (const selection of ['::-moz-selection', '::selection']) {
    emit(sheet, 'desktop', `${R} mark:not(.has-inline-color)${selection}`, {
      color: a.highLightColor,
      background: a.highLightBackground,
      '-webkit-text-fill-color': a.highLightColor,
    });
  }
  for (const device of DEVICES) {
    const s = suffix(device);
    emit(sheet, device, R, {
      ...(device === 'desktop'
        ? {
            background:
              a.blockBackgroundType === 'gradient' ? a.blockGradientBackground : a.blockBackground,
          }
        : {}),
      'text-align': a[`headingAlign${s}`],
      ...sidesCss(a, 'block', 'Margin', device),
      ...sidesCss(a, 'block', 'Padding', device),
    });
    // Sizes on desktop always in pixels.
    emit(sheet, device, `${R} .pr-heading__desc`, {
      'margin-bottom': px(a[`subHeadSpace${s}`], device === 'desktop' ? 'px' : a.subHeadSpaceType),
      ...typography(a, 'subHead', device),
    });
    emit(sheet, device, `${R} .pr-heading__text`, {
      ...typography(a, 'head', device),
      ...(headSpaced
        ? { 'margin-bottom': px(a[`headSpace${s}`], device === 'desktop' ? 'px' : a.headSpaceType) }
        : {}),
    });
    emit(sheet, device, `${R} mark:not(.has-inline-color)`, {
      ...sidesCss(a, 'highLight', 'Padding', device),
      ...border(a, 'highLight', device),
      ...typography(a, 'highLight', device),
    });
    if (separator) {
      emit(sheet, device, `${R} .pr-heading__separator`, {
        ...(device === 'desktop'
          ? {
              'border-top-style': a.seperatorStyle,
              'border-top-width': px(a.separatorHeight, a.separatorHeightType),
              'border-color': a.separatorColor,
            }
          : {}),
        width: px(a[`separatorWidth${s}`], a.separatorWidthType),
        'margin-bottom': px(a[`separatorSpace${s}`], a.separatorSpaceType),
      });
    }
  }
}

function View({ attrs: a, id, text, root, editing }: ViewProps) {
  const has = (name: string) =>
    editing || (Array.isArray(a[name]) && (a[name] as unknown[]).length > 0);
  const separator =
    a.seperatorStyle !== 'none' && a.seperatorStyle !== '' ? (
      <div className="pr-heading__separator" />
    ) : null;
  const at = (position: string) => (a.seperatorPosition === position ? separator : null);
  const title = has('headingTitle') ? (
    <>
      {at('above-heading')}
      {text('headingTitle', {
        tagName: safeTag(a.headingTag, 'h2'),
        className: 'pr-heading__text',
        placeholder: 'Write a heading',
      })}
      {at('below-heading')}
    </>
  ) : null;
  const desc = has('headingDesc') ? (
    <>
      {at('above-sub-heading')}
      {text('headingDesc', {
        tagName: 'p',
        className: 'pr-heading__desc',
        placeholder: 'Write a description',
      })}
      {at('below-sub-heading')}
    </>
  ) : null;
  return root(
    a.headingWrapper === 'header' ? 'header' : 'div',
    { className: `wp-block-prisma-heading pr-heading ${blockClass(id)}` },
    <>
      {a.headingDescToggle && a.headingDescPosition === 'above-heading' && desc}
      {a.headingTitleToggle !== false && title}
      {a.headingDescToggle && a.headingDescPosition !== 'above-heading' && desc}
      {a.headingTitleToggle === false && !a.headingDescToggle && separator}
    </>,
  );
}

export const heading: PrismaBlock = {
  name: 'heading',
  title: 'Heading',
  description: 'A heading with a description, a separator and highlighted words.',
  keywords: ['heading', 'title', 'subtitle', 'separator', 'highlight'],
  richAttributes: ['headingTitle', 'headingDesc'],
  defaults: DEFAULTS,
  css,
  View,
};
