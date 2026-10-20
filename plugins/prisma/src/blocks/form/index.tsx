import type { Device, Sheet } from '@cleitext/design';
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
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { FORM_FIELDS } from './fields';
import { plainText, safeRedirect, SUBMIT_PATH } from './schema';
import { formKey, makeToken } from './token';

export {
  FORM_FIELDS,
  formAccept,
  formCheckbox,
  formDate,
  formEmail,
  formHidden,
  formName,
  formPhone,
  formRadio,
  formSelect,
  formTextarea,
  formToggle,
  formUpload,
  formUrl,
} from './fields';

/**
 * Form: fields (inner blocks), a submit button and the messages shown
 * after sending. The message goes to the plugin's route (route.ts), which
 * reads the form's settings back from the saved page and sends the email.
 */

const DEFAULTS: Attrs = {
  formPaddingTop: 25,
  formPaddingRight: 25,
  formPaddingBottom: 25,
  formPaddingLeft: 25,
  formPaddingTopTab: 25,
  formPaddingRightTab: 25,
  formPaddingBottomTab: 25,
  formPaddingLeftTab: 25,
  formPaddingTopMob: 25,
  formPaddingRightMob: 25,
  formPaddingBottomMob: 25,
  formPaddingLeftMob: 25,
  formPaddingUnit: 'px',
  formPaddingUnitTab: 'px',
  formPaddingUnitMob: 'px',
  formPaddingLink: true,
  submitButtonText: [{ text: 'Submit' }],
  formLabel: 'Form',
  buttonAlign: 'left',
  buttonAlignTablet: '',
  buttonAlignMobile: '',
  confirmationType: 'message',
  confirmationMessage: 'The form has been submitted Successfully!',
  confirmationUrl: '',
  buttonSize: 'medium',
  submitColor: '',
  submitBgType: 'color',
  submitBgHoverType: 'color',
  submitColorHover: '',
  submitBgColor: '',
  submitBgColorHover: '',
  toggleSize: 15,
  toggleSizeTablet: '',
  toggleSizeMobile: '',
  toggleColor: '#ffffff',
  toggleActiveColor: '#017cba',
  toggleDotColor: '#1e1e1e',
  toggleDotActiveColor: '#ffffff',
  toggleWidthSize: 0,
  toggleWidthSizeTablet: '',
  toggleWidthSizeMobile: '',
  toggleHeightSize: 0,
  toggleHeightSizeTablet: 0,
  toggleHeightSizeMobile: 0,
  vPaddingSubmit: '',
  hPaddingSubmit: '',
  paddingBtnTop: '',
  paddingBtnRight: '',
  paddingBtnBottom: '',
  paddingBtnLeft: '',
  paddingspacingLink: false,
  sendAfterSubmitEmail: true,
  afterSubmitToEmail: '',
  afterSubmitBccEmail: '',
  afterSubmitCcEmail: '',
  afterSubmitEmailSubject: 'Form Submission',
  submitTextLoadGoogleFonts: false,
  submitTextFontFamily: 'Default',
  submitTextFontWeight: '',
  submitTextFontSize: 15,
  submitTextFontSizeType: 'px',
  submitTextFontSizeTablet: 15,
  submitTextFontSizeMobile: 15,
  submitTextLineHeight: '',
  submitTextLineHeightType: 'em',
  submitTextLineHeightTablet: '',
  submitTextLineHeightMobile: '',
  labelLoadGoogleFonts: false,
  labelFontFamily: 'Default',
  labelFontWeight: '',
  labelFontSize: 15,
  labelFontSizeType: 'px',
  labelFontSizeTablet: 15,
  labelFontSizeMobile: 15,
  labelLineHeight: '',
  labelLineHeightType: 'em',
  labelLineHeightTablet: '',
  labelLineHeightMobile: '',
  inputLoadGoogleFonts: false,
  inputFontFamily: 'Default',
  inputFontWeight: '',
  inputFontSize: '',
  inputFontSizeType: 'px',
  inputFontSizeTablet: '',
  inputFontSizeMobile: '',
  inputLineHeight: '',
  inputLineHeightType: 'em',
  inputLineHeightTablet: '',
  inputLineHeightMobile: '',
  labelColor: '',
  labelHoverColor: '',
  inputColor: '',
  bgColor: '',
  bgHoverColor: '',
  bgActiveColor: '',
  inputplaceholderColor: '',
  inputplaceholderHoverColor: '',
  inputplaceholderActiveColor: '',
  inputactiveColor: '',
  vPaddingField: 10,
  hPaddingField: 10,
  fieldGap: 20,
  fieldGapTablet: '',
  fieldGapMobile: '',
  formStyle: 'boxed',
  overallAlignment: 'left',
  overallAlignmentTablet: '',
  overallAlignmentMobile: '',
  labelAlignment: null,
  labelAlignmentTablet: '',
  labelAlignmentMobile: '',
  successMessageTextColor: '',
  successMessageBGColor: '',
  failedMessage:
    'There has been some error while submitting the form. Please verify all form fields again.',
  failedMessageTextColor: '',
  failedMessageBGColor: '',
  reCaptchaEnable: false,
  reCaptchaType: 'v2',
  reCaptchaSiteKeyV2: '',
  reCaptchaSecretKeyV2: '',
  reCaptchaSiteKeyV3: '',
  reCaptchaSecretKeyV3: '',
  hidereCaptchaBatch: false,
  paddingBtnTopTablet: '',
  paddingBtnRightTablet: '',
  paddingBtnBottomTablet: '',
  paddingBtnLeftTablet: '',
  paddingBtnTopMobile: '',
  paddingBtnRightMobile: '',
  paddingBtnBottomMobile: '',
  paddingBtnLeftMobile: '',
  paddingBtnUnit: 'px',
  mobilePaddingBtnUnit: 'px',
  tabletPaddingBtnUnit: 'px',
  submitTextTransform: '',
  submitTextDecoration: '',
  submitTextFontStyle: '',
  labelTransform: '',
  labelDecoration: '',
  labelFontStyle: '',
  inputTransform: '',
  inputDecoration: '',
  inputFontStyle: '',
  fieldGapType: 'px',
  paddingFieldTop: 12,
  paddingFieldRight: 12,
  paddingFieldBottom: 12,
  paddingFieldLeft: 12,
  paddingFieldTopTablet: '',
  paddingFieldRightTablet: '',
  paddingFieldBottomTablet: '',
  paddingFieldLeftTablet: '',
  paddingFieldTopMobile: '',
  paddingFieldRightMobile: '',
  paddingFieldBottomMobile: '',
  paddingFieldLeftMobile: '',
  paddingFieldUnit: 'px',
  paddingFieldUnitmobile: 'px',
  paddingFieldUnitTablet: 'px',
  paddingFieldLink: false,
  toggleSizeType: 'px',
  captchaMessage: 'Please fill up the above captcha.',
  labelGap: 10,
  labelGapTablet: '',
  labelGapMobile: '',
  labelGapUnit: 'px',
  displayLabels: true,
  submitTextLetterSpacing: '',
  submitTextLetterSpacingTablet: '',
  submitTextLetterSpacingMobile: '',
  submitTextLetterSpacingType: 'px',
  inputLetterSpacing: '',
  inputLetterSpacingTablet: '',
  inputLetterSpacingMobile: '',
  inputLetterSpacingType: 'px',
  labelLetterSpacing: '',
  labelLetterSpacingTablet: '',
  labelLetterSpacingMobile: '',
  labelLetterSpacingType: 'px',
  inputborderStyle: 'solid',
  inputborderWidth: 1,
  inputborderRadius: 3,
  inputborderColor: '#BDBDBD',
  inputborderHoverColor: '',
  successMessageborderStyle: 'solid',
  successMessageborderWidth: 2,
  successMessageborderRadius: 3,
  successMessageborderColor: 'green',
  successMessageborderHoverColor: '',
  submitborderStyle: '',
  submitborderWidth: '',
  submitborderRadius: 3,
  submitborderColor: '',
  submitborderHoverColor: '',
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
  gradientHValue: 'linear-gradient(90deg, rgba(6, 147, 227, 0.5) 0%, rgba(155, 81, 224, 0.5) 100%)',
  gradientHColor1: '#06558a',
  gradientHColor2: '#0170b9',
  gradientHType: 'linear',
  gradientHLocation1: 0,
  gradientHLocationTablet1: '',
  gradientHLocationMobile1: '',
  gradientHLocation2: 100,
  gradientHLocationTablet2: '',
  gradientHLocationMobile2: '',
  gradientHAngle: 0,
  gradientHAngleTablet: '',
  gradientHAngleMobile: '',
  selectHGradient: 'default',
  inheritFromTheme: false,
  submitButtonType: 'primary',
  ...borderDefaults('successMsg'),
  ...borderDefaults('errorMsg'),
  ...borderDefaults('field'),
  ...borderDefaults('checkBoxToggle'),
  ...borderDefaults('btn'),
};

// ---- CSS ---------------------------------------------------------------------------------------

const kept = (v: unknown) => v !== '' && v !== null && v !== undefined && v !== false;

/** `own` over `base`, where `own` has a value (Spectra merges typography under a rule's own). */
function merge(base: Declarations, own: Declarations): Declarations {
  const out = { ...base };
  for (const [k, v] of Object.entries(own)) if (kept(v) || !(k in out)) out[k] = v;
  return out;
}

/**
 * The desktop border of a part, completed with the older single values
 * (width, radius, color, style) where the part's own are unset; nothing
 * with the `default` style.
 */
function legacyBorder(
  a: Attrs,
  p: string,
  width: unknown,
  radius: unknown,
  color: unknown,
  style: unknown,
): Declarations {
  const cur = border(a, p, 'desktop');
  if (!('border-style' in cur)) return {};
  const w = px(numeric(width) ?? '');
  const r = px(numeric(radius) ?? '');
  const out: Declarations = {};
  for (const side of ['top', 'left', 'right', 'bottom'])
    out[`border-${side}-width`] = cur[`border-${side}-width`] || w;
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    out[`border-${corner}-radius`] = cur[`border-${corner}-radius`] || r;
  out['border-color'] = cur['border-color'] || color;
  out['border-style'] = cur['border-style'] || style;
  return out;
}

const n = (v: unknown, fallback = 0) => numeric(v) ?? fallback;
const int = (v: number) => Math.trunc(v);

/** A gradient from the preset or the two colors, as Spectra's background helper writes it. */
function gradient(
  select: unknown,
  value: unknown,
  type: unknown,
  c1: unknown,
  c2: unknown,
  l1: unknown,
  l2: unknown,
  angle: unknown,
): string {
  if (select === 'basic') return String(value ?? '');
  if (select !== 'advanced') return '';
  if (type === 'linear') return `linear-gradient(${angle}deg, ${c1} ${l1}%, ${c2} ${l2}%)`;
  if (type === 'radial') return `radial-gradient( at center center, ${c1} ${l1}%, ${c2} ${l2}%)`;
  return '';
}

function formCss(a: Attrs, B: string, sheet: Sheet): void {
  const F = `${B} .pr-form__form`;
  const boxed = a.formStyle === 'boxed';
  const underlined = a.formStyle === 'underlined';
  const D = (d: Device, desktop: string, tablet: string, mobile: string) =>
    d === 'desktop' ? desktop : d === 'tablet' ? tablet : mobile;

  // Older single border values fill the parts' own (inputs and switches share the input's).
  const fieldBorder = legacyBorder(
    a,
    'field',
    a.inputborderWidth,
    a.inputborderRadius,
    a.inputborderColor,
    a.inputborderStyle,
  );
  const toggleBorder = legacyBorder(
    a,
    'checkBoxToggle',
    a.inputborderWidth,
    a.inputborderRadius,
    a.inputborderColor,
    a.inputborderStyle,
  );
  // Spectra reads the messages' older values under names that are never saved: none apply.
  const successBorder = legacyBorder(a, 'successMsg', '', '', '', '');
  const failedBorder = legacyBorder(a, 'errorMsg', '', '', '', '');
  const btnBorder = legacyBorder(
    a,
    'btn',
    a.submitborderWidth,
    a.submitborderRadius,
    a.submitborderColor,
    a.submitborderStyle,
  );

  const toggleW: Record<Device, number> = {
    desktop: n(a.toggleWidthSize),
    tablet: 0,
    mobile: 0,
  };
  toggleW.tablet = numeric(a.toggleWidthSizeTablet) ?? toggleW.desktop;
  toggleW.mobile = numeric(a.toggleWidthSizeMobile) ?? toggleW.tablet;
  const toggleSize: Record<Device, unknown> = {
    desktop: a.toggleSize,
    tablet: numeric(a.toggleSizeTablet) ?? a.toggleSize,
    mobile: 0,
  };
  toggleSize.mobile = numeric(a.toggleSizeMobile) ?? toggleSize.tablet;

  // The toggle's border by device: tablet and mobile fall back to the larger device's.
  const toggleBorders: Record<Device, Declarations> = {
    desktop: toggleBorder,
    tablet: {},
    mobile: {},
  };
  for (const d of ['tablet', 'mobile'] as const) {
    const own = border(a, 'checkBoxToggle', d);
    const prev = toggleBorders[d === 'tablet' ? 'desktop' : 'tablet'];
    const out: Declarations = {};
    for (const k of [
      'border-top-width',
      'border-left-width',
      'border-right-width',
      'border-bottom-width',
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-right-radius',
      'border-bottom-left-radius',
    ])
      out[k] = own[k] || prev[k] || '';
    toggleBorders[d] = out;
  }

  const btnPad = (side: string, legacy: unknown) => {
    const own = a[`paddingBtn${side}`];
    return kept(own) ? own : legacy;
  };
  const fieldPad = (side: string, legacy: unknown) => {
    const own = a[`paddingField${side}`];
    return kept(own) ? own : legacy;
  };
  const padTop = fieldPad('Top', a.vPaddingField);
  const padBottom = fieldPad('Bottom', a.vPaddingField);
  const padLeft = fieldPad('Left', a.hPaddingField);
  const padRight = fieldPad('Right', a.hPaddingField);

  for (const d of DEVICES) {
    const s = suffix(d);
    const desktop = d === 'desktop';
    const fs = D(d, '', 'Tab', 'Mob');
    const formUnit = a[`formPaddingUnit${fs}`];
    emit(sheet, d, `${B}.pr-form`, {
      'padding-top': px(a[`formPaddingTop${fs}`], formUnit),
      'padding-right': px(a[`formPaddingRight${fs}`], formUnit),
      'padding-bottom': px(a[`formPaddingBottom${fs}`], formUnit),
      'padding-left': px(a[`formPaddingLeft${fs}`], formUnit),
    });
    const align = a[`overallAlignment${s}`];
    emit(sheet, d, `${F} textarea`, { 'text-align': align });
    emit(sheet, d, `${B} .pr-form__input`, { 'text-align': align });
    emit(sheet, d, `${B} .pr-form__label`, {
      ...(desktop ? { display: a.displayLabels ? 'block' : 'none' } : {}),
      'text-align': desktop
        ? a.labelAlignment === null || a.labelAlignment === undefined
          ? a.overallAlignment
          : a.labelAlignment
        : a[`labelAlignment${s}`],
    });
    emit(sheet, d, `${F} .pr-form__field`, {
      'margin-bottom': px(a[`fieldGap${s}`], a.fieldGapType),
    });
    emit(
      sheet,
      d,
      `${F} .pr-form__label`,
      merge(typography(a, 'label', d), {
        ...(desktop
          ? { color: a.labelColor, 'font-size': px(a.labelFontSize, a.labelFontSizeType) }
          : {}),
        'margin-bottom': px(a[`labelGap${s}`], a.labelGapUnit),
      }),
    );
    emit(sheet, d, `${B} .pr-form__success`, {
      ...(desktop
        ? { 'background-color': a.successMessageBGColor, color: a.successMessageTextColor }
        : {}),
      ...(desktop ? successBorder : border(a, 'successMsg', d)),
    });
    emit(sheet, d, `${B} .pr-form__failed`, {
      ...(desktop
        ? { 'background-color': a.failedMessageBGColor, color: a.failedMessageTextColor }
        : {}),
      ...(desktop ? failedBorder : border(a, 'errorMsg', d)),
    });

    // The phone's country menu: the arrow sits in the input's right padding.
    if (desktop) {
      emit(sheet, d, `${B} .pr-form-phone__country`, {
        'background-position': `top 50% right ${px(a.paddingFieldRight, a.paddingFieldUnit)}`,
        color: a.inputplaceholderColor,
      });
    } else {
      const unit = d === 'tablet' ? a.paddingFieldUnitTablet : a.paddingFieldUnitmobile;
      const right = a[`paddingFieldRight${s}`];
      emit(sheet, d, `${B} .pr-form-phone__country`, {
        'background-position': `top 50% right ${px(right || (d === 'tablet' ? 12 : 6), unit)}`,
        'padding-right': px(int(n(right)) + 30, unit),
      });
    }

    const buttonAlign = a[`buttonAlign${s}`];
    emit(
      sheet,
      d,
      `${F} .pr-form__submit-wrap`,
      buttonAlign === 'full' ? { display: 'grid' } : { 'text-align': buttonAlign },
    );

    const w = 20 + toggleW[d];
    emit(sheet, d, `${B} .pr-form__slider.is-round`, { 'border-radius': `${w}px !important` });
  }

  // Hover, focus and placeholder colors.
  emit(sheet, 'desktop', `${B} .pr-form__success:hover`, {
    'border-color': a.successMsgBorderHColor,
  });
  emit(sheet, 'desktop', `${B} .pr-form__failed:hover`, { 'border-color': a.errorMsgBorderHColor });
  emit(sheet, 'desktop', `${F} .pr-form__input:focus`, {
    outline: 'none !important',
    'border-color': a.fieldBorderHColor || a.inputborderHoverColor,
    'background-color': kept(a.bgActiveColor) ? `${a.bgActiveColor} !important` : '',
  });
  emit(sheet, 'desktop', `${F} .pr-form__input:focus::placeholder`, {
    color: kept(a.inputplaceholderActiveColor) ? `${a.inputplaceholderActiveColor} !important` : '',
  });
  emit(sheet, 'desktop', `${B} .pr-form__field:hover .pr-form__label`, {
    color: a.labelHoverColor,
  });
  // Spectra gives the fields the button's hover border color here: kept for the same look.
  emit(sheet, 'desktop', `${B} .pr-form__field:hover .pr-form__input`, {
    'background-color': a.bgHoverColor,
    'border-color': a.btnBorderHColor || a.submitborderHoverColor,
  });
  emit(sheet, 'desktop', `${B} .pr-form__field:hover .pr-form__input::placeholder`, {
    color: a.inputplaceholderHoverColor,
  });
  emit(sheet, 'desktop', `${B} .pr-form__field:hover .pr-form-phone__country`, {
    color: a.inputplaceholderHoverColor,
  });

  // Checkboxes, radios, the acceptance box and the switch.
  const CHECK = `${B} .pr-form-checkbox input[type=checkbox]`;
  const RADIO = `${B} .pr-form-radio input[type=radio]`;
  const ACCEPT = `${B} .pr-form-accept input[type=checkbox]`;
  const size = px(a.toggleSize, a.toggleSizeType);
  for (const box of [CHECK, RADIO, ACCEPT]) {
    emit(sheet, 'desktop', `${box} + label:before`, {
      'background-color': a.toggleColor,
      width: size,
      height: size,
    });
  }
  for (const part of ['checkbox', 'radio', 'accept'])
    emit(sheet, 'desktop', `${B} .pr-form-${part} > label`, { color: a.inputColor });
  emit(sheet, 'desktop', `${B} .pr-form__slider`, { 'background-color': a.toggleColor });

  const FC = `${F} .pr-form-checkbox input[type=checkbox] + label:before`;
  const FR = `${F} .pr-form-radio input[type=radio] + label:before`;
  const FA = `${F} .pr-form-accept input[type=checkbox] + label:before`;
  const FS = `${F} .pr-form__slider`;
  const FI = `${F} .pr-form__input`;
  if (boxed) {
    for (const sel of [FC, FR, FS, FA]) emit(sheet, 'desktop', sel, toggleBorder);
    for (const part of ['checkbox', 'radio', 'accept'])
      emit(sheet, 'desktop', `${F} .pr-form-${part} > input`, { color: a.inputColor });
    emit(sheet, 'desktop', FI, {
      'background-color': a.bgColor,
      color: a.inputColor,
      ...fieldBorder,
    });
    emit(sheet, 'desktop', `${FI}.pr-form-phone__country`, {
      'padding-top': px(n(padTop) - 1, a.paddingFieldUnit),
      'padding-bottom': px(n(padBottom) - 1, a.paddingFieldUnit),
      'padding-left': px(padLeft, a.paddingFieldUnit),
      'padding-right': px(padRight, a.paddingFieldUnit),
    });
    emit(sheet, 'desktop', `${B} .pr-form__input:hover`, {
      'border-color': a.fieldBorderHColor || a.inputborderHoverColor,
    });
    emit(sheet, 'desktop', `${B} .pr-form__input::placeholder`, { color: a.inputplaceholderColor });
    for (const d of ['tablet', 'mobile'] as const) {
      const toggle = border(a, 'checkBoxToggle', d);
      for (const sel of [FC, FR, FS, FA]) emit(sheet, d, sel, toggle);
      emit(sheet, d, FI, border(a, 'field', d));
    }
  }

  // Input padding and typography (underlined inputs get their line here).
  const padding: Declarations = {
    'padding-top': px(padTop, a.paddingFieldUnit),
    'padding-bottom': px(padBottom, a.paddingFieldUnit),
    'padding-left': px(padLeft, a.paddingFieldUnit),
    'padding-right': px(padRight, a.paddingFieldUnit),
  };
  if (underlined) {
    const line = (p: string) =>
      `${px(a[`${p}BorderBottomWidth`])} ${a[`${p}BorderStyle`] ?? ''} ${a[`${p}BorderColor`] ?? ''}`;
    for (const sel of [FA, FC, FS, FR])
      emit(sheet, 'desktop', sel, { 'border-bottom': line('checkBoxToggle') });
    emit(
      sheet,
      'desktop',
      FI,
      merge(typography(a, 'input', 'desktop'), {
        'border-top': 0,
        'border-left': 0,
        'border-right': 0,
        outline: 0,
        'border-radius': 0,
        background: 'transparent',
        'border-bottom': line('field'),
        color: a.inputColor,
        ...padding,
        ...fieldBorder,
      }),
    );
    emit(sheet, 'desktop', `${B}.pr-form .pr-form__form .pr-form__input`, {
      'border-top-width': 0,
      'border-right-width': 0,
      'border-left-width': 0,
      'border-bottom-width': px(a.fieldBorderBottomWidth),
    });
    emit(sheet, 'desktop', `${B} .pr-form__input:hover`, {
      'border-color': a.fieldBorderHColor || a.inputborderHoverColor,
    });
    emit(sheet, 'desktop', `${B} .pr-form__input::placeholder`, { color: a.inputplaceholderColor });
  } else {
    emit(sheet, 'desktop', FI, merge(typography(a, 'input', 'desktop'), padding));
  }
  for (const d of ['tablet', 'mobile'] as const) {
    const s = suffix(d);
    const unit = d === 'tablet' ? a.paddingFieldUnitTablet : a.paddingFieldUnitmobile;
    const pad: Declarations = {
      'padding-top': px(a[`paddingFieldTop${s}`], unit),
      'padding-bottom': px(a[`paddingFieldBottom${s}`], unit),
      'padding-left': px(a[`paddingFieldLeft${s}`], unit),
      'padding-right': px(a[`paddingFieldRight${s}`], unit),
    };
    emit(sheet, d, FI, merge(typography(a, 'input', d), pad));
    emit(sheet, d, `${FI}.pr-form-phone__country`, pad);
  }
  for (const d of DEVICES)
    emit(sheet, d, `${F} .pr-form__input::placeholder`, typography(a, 'input', d));

  // The switch: its size follows the dot (20px + the toggle size), plus the border.
  for (const d of DEVICES) {
    const w = 20 + toggleW[d];
    const tb = toggleBorders[d];
    const width = (k: string) => String(tb[k] || '0px');
    emit(sheet, d, `${F} .pr-form__switch`, {
      height: `calc(${width('border-top-width')} + ${width('border-bottom-width')} + ${int(w + w / 3)}px)`,
      width: `calc(${width('border-left-width')} + ${width('border-right-width')} + ${int(w * 2.5 + w / 3)}px)`,
    });
    const radius = [
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-right-radius',
      'border-bottom-left-radius',
    ].map((k) => String(tb[k] || ''));
    emit(sheet, d, `${F} .pr-form__slider:before`, {
      height: d === 'desktop' ? `${w}px` : `calc(20px + ${toggleW[d]}px)`,
      width: d === 'desktop' ? `${w}px` : `calc(20px + ${toggleW[d]}px)`,
      top: `${int(w / 6)}px`,
      bottom: `${int(w / 6)}px`,
      left: `${int(w / 6)}px`,
      ...(d === 'desktop' ? { 'background-color': a.toggleDotColor } : {}),
      'border-radius': radius.some(Boolean) ? radius.map((r) => r || '0').join(' ') : '',
    });
    emit(sheet, d, `${B} .pr-form__switch input:checked + .pr-form__slider:before`, {
      transform: `translateX(${int(w * 2.5 - w)}px)`,
      ...(d === 'desktop' ? { 'background-color': a.toggleDotActiveColor } : {}),
    });
    const sz = toggleSize[d];
    if (d !== 'desktop') {
      const own = px(a[`toggleSize${suffix(d)}`], a.toggleSizeType);
      for (const box of [CHECK, RADIO, ACCEPT])
        emit(sheet, d, `${box} + label:before`, { width: own, height: own });
    }
    const checkedFont = `calc(${sz}${a.toggleSizeType} / 1.2)`;
    emit(sheet, d, `${CHECK}:checked + label:before`, {
      ...(d === 'desktop'
        ? {
            color: a.toggleDotActiveColor,
            'background-color': a.toggleActiveColor,
            'border-color': a.checkBoxToggleBorderHColor,
          }
        : {}),
      'font-size': checkedFont,
    });
    emit(sheet, d, `${RADIO}:checked + label:before`, {
      ...(d === 'desktop'
        ? {
            'background-color': a.toggleDotActiveColor,
            'border-color': a.checkBoxToggleBorderHColor,
            'box-shadow': `inset 0 0 0 4px ${a.toggleActiveColor}`,
          }
        : {}),
      'font-size': `calc(${sz}px / 1.2)`,
    });
    emit(sheet, d, `${ACCEPT}:checked + label:before`, {
      ...(d === 'desktop'
        ? {
            color: a.toggleDotActiveColor,
            'background-color': a.toggleActiveColor,
            'border-color': a.checkBoxToggleBorderHColor,
          }
        : {}),
      'font-size': checkedFont,
    });
  }
  emit(sheet, 'desktop', `${B} .pr-form__switch input:checked + .pr-form__slider`, {
    'background-color': a.toggleActiveColor,
    'border-color': a.checkBoxToggleBorderHColor || a.inputborderHoverColor,
  });

  // The submit button, unless it takes the theme's buttons.
  if (a.inheritFromTheme) return;
  const LINK = `${F} .pr-form__submit-wrap.wp-block-button:not(.is-style-outline) .pr-form__submit.wp-block-button__link`;
  const BTN = `${F} .pr-form__submit`;
  const BG = `${F} .wp-block-button:not(.is-style-outline) .pr-form__submit.wp-block-button__link`;
  const btn: Declarations = {
    'font-size': px(a.submitTextFontSize, a.submitTextFontSizeType),
    color: a.submitColor,
    'padding-top': px(btnPad('Top', a.vPaddingSubmit), a.paddingBtnUnit),
    'padding-bottom': px(btnPad('Bottom', a.vPaddingSubmit), a.paddingBtnUnit),
    'padding-left': px(btnPad('Left', a.hPaddingSubmit), a.paddingBtnUnit),
    'padding-right': px(btnPad('Right', a.hPaddingSubmit), a.paddingBtnUnit),
    ...btnBorder,
  };
  const btnHoverBorder = a.btnBorderHColor || a.submitborderHoverColor;
  emit(sheet, 'desktop', LINK, btn);
  emit(sheet, 'desktop', BTN, merge(typography(a, 'submitText', 'desktop'), btn));
  for (const sel of [`${LINK}:hover`, `${BTN}:hover`])
    emit(sheet, 'desktop', sel, { color: a.submitColorHover, 'border-color': btnHoverBorder });
  for (const sel of [`${LINK}:focus`, `${BTN}:focus`])
    emit(sheet, 'desktop', sel, {
      color: a.submitColorHover,
      'background-color': a.submitBgHoverType === 'color' ? a.submitBgColorHover : 'transparent',
      'border-color': btnHoverBorder,
    });
  const SIZE = `.pr-form__submit-wrap .pr-form__submit`;
  emit(sheet, 'desktop', `${B}.pr-form--full-btn ${SIZE}`, { width: '100%', padding: '10px 15px' });
  const SIZES: Record<string, string> = {
    small: '5px 10px',
    medium: '12px 24px',
    large: '20px 30px',
    extralarge: '30px 65px',
  };
  for (const [name, value] of Object.entries(SIZES))
    emit(sheet, 'desktop', `${B}.pr-form--${name}-btn ${SIZE}`, { padding: value });

  // Background: none, a color or a gradient (by device), normal and on hover.
  if (a.submitBgType === 'transparent') emit(sheet, 'desktop', BG, { background: 'transparent' });
  else if (a.submitBgType === 'color') emit(sheet, 'desktop', BG, { background: a.submitBgColor });
  else if (a.submitBgType === 'gradient') {
    const loc = (base: 'gradientLocation' | 'gradientAngle', i: string) => {
      const desktop = a[`${base}${i}`];
      const tablet = numeric(a[`${base}Tablet${i}`]) ?? desktop;
      return { desktop, tablet, mobile: numeric(a[`${base}Mobile${i}`]) ?? tablet };
    };
    const l1 = loc('gradientLocation', '1');
    const l2 = loc('gradientLocation', '2');
    const angle = loc('gradientAngle', '');
    for (const d of DEVICES)
      emit(sheet, d, BG, {
        background: gradient(
          a.selectGradient,
          a.gradientValue,
          a.gradientType,
          a.gradientColor1,
          a.gradientColor2,
          l1[d],
          l2[d],
          angle[d],
        ),
        'background-clip': 'padding-box',
      });
  }
  if (a.submitBgHoverType === 'transparent')
    emit(sheet, 'desktop', `${BG}:hover`, { background: 'transparent' });
  else if (a.submitBgHoverType === 'color')
    emit(sheet, 'desktop', `${BG}:hover`, { background: a.submitBgColorHover });
  else if (a.submitBgHoverType === 'gradient') {
    // Hover values fall back when unset or zero, as Spectra's do.
    const loc = (base: 'gradientHLocation' | 'gradientHAngle', i: string) => {
      const desktop = a[`${base}${i}`];
      const tablet = a[`${base}Tablet${i}`] || desktop;
      return { desktop, tablet, mobile: a[`${base}Mobile${i}`] || tablet };
    };
    const l1 = loc('gradientHLocation', '1');
    const l2 = loc('gradientHLocation', '2');
    const angle = loc('gradientHAngle', '');
    for (const d of DEVICES)
      emit(sheet, d, `${F} .pr-form__submit-wrap .pr-form__submit.wp-block-button__link:hover`, {
        background: gradient(
          a.selectHGradient,
          a.gradientHValue,
          a.gradientHType,
          a.gradientHColor1,
          a.gradientHColor2,
          l1[d],
          l2[d],
          angle[d],
        ),
        'background-clip': 'padding-box',
      });
  }
  for (const d of ['tablet', 'mobile'] as const) {
    const s = suffix(d);
    const unit = a[`${d}PaddingBtnUnit`];
    const bb = border(a, 'btn', d);
    emit(
      sheet,
      d,
      BTN,
      merge(typography(a, 'submitText', d), {
        'padding-top': px(a[`paddingBtnTop${s}`], unit),
        'padding-bottom': px(a[`paddingBtnBottom${s}`], unit),
        'padding-left': px(a[`paddingBtnLeft${s}`], unit),
        'padding-right': px(a[`paddingBtnRight${s}`], unit),
        ...bb,
      }),
    );
    emit(sheet, d, LINK, bb);
  }
}

// ---- Markup ------------------------------------------------------------------------------------

/** What the site gives the form: the page it is on, its time token and the reCAPTCHA keys. */
export interface FormData {
  entry: string | null;
  token: string;
  siteKeyV2: string;
  siteKeyV3: string;
}

const isFormData = (d: unknown): d is FormData =>
  Boolean(d) && typeof d === 'object' && 'token' in (d as object);

function FormView({ attrs: a, id, root, inner, text, editing, data }: ViewProps) {
  const size = String(a.buttonSize ?? 'medium').replace(/\W/g, '');
  const site = isFormData(data) ? data : null;
  const captcha = Boolean(a.reCaptchaEnable);
  const version = a.reCaptchaType === 'v3' ? 'v3' : 'v2';
  const siteKey = site ? (version === 'v3' ? site.siteKeyV3 : site.siteKeyV2) : '';
  const config = {
    id,
    confirmationType: a.confirmationType === 'url' ? 'url' : 'message',
    confirmationUrl: safeRedirect(a.confirmationUrl),
    ...(captcha && siteKey
      ? {
          captcha: {
            version,
            siteKey,
            hideBadge: Boolean(a.hidereCaptchaBatch),
            message: String(a.captchaMessage ?? ''),
          },
        }
      : {}),
  };
  const buttonText = text('submitButtonText', {
    tagName: 'div',
    className: 'pr-form__submit-text',
    placeholder: 'Submit',
  });
  const fields = (
    <>
      {inner({ className: 'pr-form__fields' })}
      <div className="pr-form__hidden-data">
        <input type="hidden" name="_pr_form" defaultValue={id} />
        <input type="hidden" name="_pr_entry" defaultValue={site?.entry ?? ''} />
        <input type="hidden" name="_pr_token" defaultValue={site?.token ?? ''} />
        {captcha && <input type="hidden" name="_pr_captcha" defaultValue="" />}
      </div>
      {/* Left empty by people, filled by bots. */}
      <div className="pr-form__hp" aria-hidden="true">
        <input type="text" name="_pr_website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      {captcha && version === 'v2' && <div className="pr-form__captcha pr-form__field" />}
      <div className="pr-form__captcha-error" role="alert" />
      <div className="pr-form__submit-wrap wp-block-button">
        <button
          type={editing ? 'button' : 'submit'}
          className="pr-form__submit wp-block-button__link"
        >
          {buttonText}
        </button>
      </div>
    </>
  );
  return root(
    'div',
    { className: `wp-block-prisma-form pr-form pr-form--${size}-btn ${blockClass(id)}` },
    <>
      {editing ? (
        <div className="pr-form__form">{fields}</div>
      ) : (
        <form
          className="pr-form__form"
          method="post"
          action={SUBMIT_PATH}
          autoComplete="on"
          name={`pr-form-${id}`}
          data-pr-form={JSON.stringify(config)}
        >
          {fields}
        </form>
      )}
      <div
        className="pr-form__success pr-form__message--hide"
        id={`pr-form-${id}-sent`}
        role="status"
      >
        <span>{String(a.confirmationMessage ?? '')}</span>
      </div>
      <div
        className="pr-form__failed pr-form__message--hide"
        id={`pr-form-${id}-error`}
        role="alert"
      >
        <span>{String(a.failedMessage ?? '')}</span>
      </div>
    </>,
  );
}

/** Spectra's typography switches for Google fonts, under the names of Prisma's controls. */
const FONT_SWITCHES: Record<string, string> = {
  labelloadGoogleFonts: 'labelLoadGoogleFonts',
  inputloadGoogleFonts: 'inputLoadGoogleFonts',
  submitTextloadGoogleFonts: 'submitTextLoadGoogleFonts',
};

export const form: PrismaBlock = {
  name: 'form',
  title: 'Form',
  description:
    'A form of fields that sends its messages by email, with spam protection and a message or a redirect after sending.',
  keywords: ['form', 'contact', 'email', 'fields'],
  container: true,
  allowedBlocks: FORM_FIELDS.map((f) => `prisma/${f.name}`),
  richAttributes: ['submitButtonText'],
  defaults: DEFAULTS,
  localized: (lang) =>
    lang === 'it'
      ? {
          submitButtonText: [{ text: 'Invia' }],
          confirmationMessage: 'Grazie, il messaggio è stato inviato.',
          failedMessage:
            "Si è verificato un errore nell'invio del modulo. Controlla i campi e riprova.",
          captchaMessage: 'Completa il controllo qui sopra.',
          afterSubmitEmailSubject: 'Nuovo messaggio dal sito',
        }
      : {},
  css: formCss,
  View: FormView,
  script: { file: 'form.js', marker: 'data-pr-form' },
  async load(attrs, context, ctx): Promise<FormData> {
    const entry = context.entry?.id ?? null;
    const settings = await ctx.settings.get(context.siteId).catch(() => ({}) as Attrs);
    const key = (name: string, legacy: unknown) =>
      String((settings as Attrs)[name] || legacy || '').trim();
    let token = '';
    try {
      token = entry ? await makeToken(await formKey(ctx, context.siteId), entry) : '';
    } catch {
      // Without a token the server refuses the message as too quick: logged there.
    }
    return {
      entry,
      token,
      siteKeyV2: key('recaptchaSiteKeyV2', attrs.reCaptchaSiteKeyV2),
      siteKeyV3: key('recaptchaSiteKeyV3', attrs.reCaptchaSiteKeyV3),
    };
  },
  spectra: {
    'uagb/forms': (a, src) => {
      const out: Attrs = {};
      for (const [k, v] of Object.entries(a)) out[FONT_SWITCHES[k] ?? k] = v;
      const button = src.innerAny('uagb-forms-main-submit-button-text');
      if (button) out.submitButtonText = button;
      if (typeof a.blockId === 'string') {
        const sent = plainText(src.innerAny(`uagb-forms-success-message-${a.blockId}`));
        const failed = plainText(src.innerAny(`uagb-forms-failed-message-${a.blockId}`));
        if (sent && a.confirmationMessage === undefined) out.confirmationMessage = sent;
        if (failed && a.failedMessage === undefined) out.failedMessage = failed;
      }
      return [src.block('form', out, src.children)];
    },
  },
};
