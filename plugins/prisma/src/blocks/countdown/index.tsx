import type { Device, Sheet } from '@cleitext/design';
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
  type Declarations,
} from '../../lib/emit';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { sideDefaults, sidesCss } from '../heading';
import { linkHref } from '../icon';

/** Typography of a part with a size unit by device (`digitFontSizeTypeTablet`). */
function fontDefaults(p: string, family: string, style: string, letterUnit: string): Attrs {
  const out: Attrs = {
    [`${p}LoadGoogleFonts`]: false,
    [`${p}FontFamily`]: family,
    [`${p}FontWeight`]: '',
    [`${p}FontStyle`]: style,
    [`${p}Transform`]: '',
    [`${p}Decoration`]: '',
    [`${p}LineHeightType`]: 'em',
    [`${p}LetterSpacingType`]: letterUnit,
  };
  for (const s of ['', 'Tablet', 'Mobile']) {
    out[`${p}FontSize${s}`] = '';
    out[`${p}FontSizeType${s}`] = 'px';
    out[`${p}LineHeight${s}`] = '';
    out[`${p}LetterSpacing${s}`] = '';
  }
  return out;
}

const DEFAULTS: Attrs = {
  timerType: 'date',
  timerEndAction: 'zero',
  redirectURL: '',
  endDateTime: '2023-01-01T00:00:00Z',
  displayEndDateTime: '2023-01-01T00:00:00Z',
  timeModified: false,
  // Evergreen timers: the same time from each visitor's first visit.
  evergreenDays: 0,
  evergreenHrs: 12,
  evergreenMinutes: 0,
  campaignID: '',
  resetDays: 30,
  showDays: true,
  showHours: true,
  showMinutes: true,
  showSeconds: true,
  showSeparator: true,
  separatorType: ':',
  ariaLiveType: 'off',
  showLabels: true,
  labelDays: 'DAYS',
  labelHours: 'HOURS',
  labelMinutes: 'MINUTES',
  labelSeconds: 'SECONDS',
  ...fontDefaults('digit', 'Default', 'normal', 'em'),
  digitColor: '',
  ...fontDefaults('label', 'Default', 'normal', 'em'),
  labelColor: '',
  separatorLoadGoogleFonts: false,
  separatorFontFamily: '',
  separatorFontWeight: '',
  separatorFontStyle: '',
  separatorColor: '',
  separatorFontSize: '',
  separatorFontSizeTablet: '',
  separatorFontSizeMobile: '',
  separatorFontSizeType: 'px',
  separatorFontSizeTypeTablet: 'px',
  separatorFontSizeTypeMobile: 'px',
  separatorLineHeight: '',
  separatorLineHeightTablet: '',
  separatorLineHeightMobile: '',
  separatorLineHeightType: 'em',
  separatorRightSpacing: 26,
  separatorRightSpacingTablet: 14,
  separatorRightSpacingMobile: 12,
  separatorTopSpacing: '',
  separatorTopSpacingTablet: '',
  separatorTopSpacingMobile: '',
  ...sideDefaults('block', 'Margin'),
  ...sideDefaults('block', 'Padding'),
  ...sideDefaults('box', 'Padding'),
  align: 'center',
  alignTablet: '',
  alignMobile: '',
  boxAlign: 'center',
  boxAlignTablet: 'center',
  boxAlignMobile: 'center',
  boxWidth: '',
  boxWidthTablet: '',
  boxWidthMobile: '',
  isSquareBox: true,
  boxSpacing: 38,
  boxSpacingTablet: 20,
  boxSpacingMobile: 18,
  internalBoxSpacing: '',
  internalBoxSpacingTablet: '',
  internalBoxSpacingMobile: '',
  boxFlex: 'column',
  boxFlexTablet: 'column',
  boxFlexMobile: 'column',
  labelVerticalAlignment: 'center',
  labelVerticalAlignmentTablet: '',
  labelVerticalAlignmentMobile: '',
  boxBgType: 'transparent',
  boxBgColor: '',
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
  ...borderDefaults('box'),
  boxBorderStyle: 'default',
};

export const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;
type Unit = (typeof UNITS)[number];
const SHOW: Record<Unit, string> = {
  days: 'showDays',
  hours: 'showHours',
  minutes: 'showMinutes',
  seconds: 'showSeconds',
};
const LABEL: Record<Unit, string> = {
  days: 'labelDays',
  hours: 'labelHours',
  minutes: 'labelMinutes',
  seconds: 'labelSeconds',
};

function font(a: Attrs, p: string, device: Device, transform: boolean): Declarations {
  const s = suffix(device);
  const sizes: Declarations = {
    'font-size': px(a[`${p}FontSize${s}`], a[`${p}FontSizeType${s}`]),
    'line-height': px(a[`${p}LineHeight${s}`], a[`${p}LineHeightType`]),
    'letter-spacing': px(a[`${p}LetterSpacing${s}`], a[`${p}LetterSpacingType`]),
  };
  if (device !== 'desktop') return sizes;
  return {
    'font-family': a[`${p}FontFamily`],
    'font-style': a[`${p}FontStyle`],
    'text-decoration': a[`${p}Decoration`],
    ...(transform ? { 'text-transform': a[`${p}Transform`] } : {}),
    'font-weight': a[`${p}FontWeight`],
    ...sizes,
    color: a[`${p}Color`],
  };
}

/** The separator as CSS `content`: a few characters, quoted. */
function content(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const text = value
    .slice(0, 5)
    .replace(/[\\'"\n\r]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);
  return `'${text}'`;
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-countdown`;
  const BOX = `${R} .pr-countdown__box`;
  const sep = `${R} .pr-countdown__box:not(:last-child) .pr-countdown__time::after`;
  const { showHours, showMinutes, showSeconds } = a;
  for (const device of DEVICES) {
    const s = suffix(device);
    const desktop = device === 'desktop';
    const flex = a[`boxFlex${s}`];
    const boxAlign = a[`boxAlign${s}`];
    const width = px(a[`boxWidth${s}`]);
    emit(sheet, device, R, {
      'justify-content': a[`align${s}`],
      ...sidesCss(a, 'block', 'Margin', device),
      ...sidesCss(a, 'block', 'Padding', device),
    });
    emit(sheet, device, BOX, {
      ...(desktop ? { 'aspect-ratio': a.isSquareBox ? 1 : 'auto' } : {}),
      width,
      height: a.isSquareBox ? width : 'auto',
      'flex-direction': flex,
      'justify-content': flex !== 'column' ? boxAlign : 'center',
      'align-items': flex !== 'row' ? boxAlign : 'center',
      ...(desktop
        ? {
            'background-color': a.boxBgType !== 'transparent' ? a.boxBgColor : 'transparent',
          }
        : {}),
      ...sidesCss(a, 'box', 'Padding', device),
      'row-gap': px(a[`internalBoxSpacing${s}`]),
      'column-gap': px(a[`internalBoxSpacing${s}`]),
      ...(desktop
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
      ...border(a, 'box', device),
    });
    // Space after each box, none after the last one shown.
    const space = px(a[`boxSpacing${s}`]);
    emit(sheet, device, `${BOX}.pr-countdown__box--minutes:not(:last-child)`, {
      'margin-right': showSeconds ? space : 'unset',
    });
    emit(sheet, device, `${BOX}.pr-countdown__box--hours:not(:last-child)`, {
      'margin-right': showSeconds || showMinutes ? space : 'unset',
    });
    emit(sheet, device, `${BOX}.pr-countdown__box--days:not(:last-child)`, {
      'margin-right': showSeconds || showMinutes || showHours ? space : 'unset',
    });
    emit(sheet, device, `${R} .pr-countdown__time`, font(a, 'digit', device, false));
    emit(sheet, device, `${R} div.pr-countdown__label`, {
      'align-self': !a.isSquareBox && flex === 'row' ? a[`labelVerticalAlignment${s}`] : 'unset',
      ...font(a, 'label', device, true),
    });
    if (a.showSeparator === true) {
      const right = a[`separatorRightSpacing${s}`];
      emit(sheet, device, sep, {
        ...(desktop
          ? {
              content: content(a.separatorType),
              'font-family': a.separatorFontFamily,
              'font-style': a.separatorFontStyle,
              'font-weight': a.separatorFontWeight,
            }
          : {}),
        'font-size': px(a[`separatorFontSize${s}`], a[`separatorFontSizeType${s}`]),
        'line-height': px(a[`separatorLineHeight${s}`], a.separatorLineHeightType),
        ...(desktop ? { color: a.separatorColor } : {}),
        right: Number.isInteger(right) ? px(-(right as number)) : '',
        top: px(a[`separatorTopSpacing${s}`]),
      });
    }
  }
  for (const unit of UNITS) {
    if (!a[SHOW[unit]])
      emit(sheet, 'desktop', `${R} .pr-countdown__box--${unit}`, { display: 'none' });
  }
  emit(sheet, 'desktop', `${R}:hover .pr-countdown__box`, {
    'border-color': a.boxBorderHColor,
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
  if (a.showSeparator === true) {
    // No separator after the last unit shown.
    const after = (unit: Unit) =>
      `${BOX}.pr-countdown__box--${unit}:not(:last-child) .pr-countdown__time.pr-countdown__time--${unit}::after`;
    if (!showSeconds) emit(sheet, 'desktop', after('minutes'), { display: 'none' });
    if (!showMinutes && !showSeconds) emit(sheet, 'desktop', after('hours'), { display: 'none' });
    if (!showHours && !showMinutes && !showSeconds)
      emit(sheet, 'desktop', after('days'), { display: 'none' });
  }
}

/** The end of the timer: a fixed date, or the evergreen span from now. */
export function endTime(a: Attrs, now: number): number {
  if (a.timerType === 'evergreen') {
    const n = (v: unknown) => Math.floor(numeric(v) ?? 0);
    return (
      now + ((n(a.evergreenDays) * 24 + n(a.evergreenHrs)) * 60 + n(a.evergreenMinutes)) * 60000
    );
  }
  const time = Date.parse(String(a.endDateTime ?? ''));
  return Number.isFinite(time) ? time : now;
}

/** Days, hours, minutes and seconds left; a hidden unit adds to the next one shown. */
export function remaining(a: Attrs, end: number, now: number): Record<Unit, number> {
  const diff = end - now;
  if (diff < 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const days = Math.floor(diff / 86400000);
  let hours = Math.floor(diff / 3600000) % 24;
  let minutes = Math.floor(diff / 60000) % 60;
  let seconds = Math.floor(diff / 1000) % 60;
  if (!a.showDays) hours += days * 24;
  if (!a.showHours) minutes += hours * 60;
  if (!a.showMinutes) seconds += minutes * 60;
  return { days, hours, minutes, seconds };
}

/** Where to go when the time is up (a link object or an address). */
function redirect(value: unknown): string {
  const url =
    value && typeof value === 'object' ? (value as { url?: unknown }).url : (value as unknown);
  return linkHref(url);
}

function View({ attrs: a, id, root, inner, editing }: ViewProps) {
  const now = Date.now();
  const end = endTime(a, now);
  const left = remaining(a, end, now);
  const action = ['hide', 'redirect', 'content'].includes(String(a.timerEndAction))
    ? String(a.timerEndAction)
    : 'zero';
  const ended = !editing && a.timerType !== 'evergreen' && end <= now;
  const live = ['polite', 'assertive'].includes(String(a.ariaLiveType))
    ? String(a.ariaLiveType)
    : 'off';
  const config = {
    type: a.timerType === 'evergreen' ? 'evergreen' : 'date',
    end: new Date(end).toISOString(),
    evergreen: [a.evergreenDays, a.evergreenHrs, a.evergreenMinutes].map((v) => numeric(v) ?? 0),
    campaign: String(a.campaignID || a.blockId || id).replace(/[^\w-]/g, ''),
    reset: numeric(a.resetDays) && (numeric(a.resetDays) as number) > 0 ? numeric(a.resetDays) : 30,
    show: [a.showDays, a.showHours, a.showMinutes].map(Boolean),
    action,
    redirect: action === 'redirect' ? redirect(a.redirectURL) : '',
  };
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-countdown',
        'pr-countdown',
        blockClass(id),
        `pr-countdown--end-${action}`,
        ended ? 'pr-countdown--ended' : '',
        editing ? 'pr-countdown--editing' : '',
      ]
        .filter(Boolean)
        .join(' '),
      ...(editing ? {} : { 'data-pr-countdown': JSON.stringify(config) }),
    } as { className: string },
    <>
      {UNITS.map((unit) => (
        <div key={unit} className={`pr-countdown__box pr-countdown__box--${unit}`}>
          <div
            role="timer"
            aria-live={live as 'off'}
            className={`pr-countdown__time pr-countdown__time--${unit}`}
          >
            {left[unit]}
          </div>
          {a.showLabels ? (
            <div className="pr-countdown__label">{String(a[LABEL[unit]] ?? '')}</div>
          ) : null}
        </div>
      ))}
      {action === 'content' ? inner({ className: 'pr-countdown__content' }) : null}
    </>,
  );
}

export const countdown: PrismaBlock = {
  name: 'countdown',
  title: 'Countdown',
  description: 'A timer to a date, or the same span for every visitor, with an action at the end.',
  keywords: ['countdown', 'timer', 'sale', 'offer', 'evergreen'],
  container: true,
  defaults: DEFAULTS,
  css,
  View,
  script: { file: 'countdown.js', marker: 'data-pr-countdown' },
  spectra: {
    'uagb/countdown': (a, src) => [src.block('countdown', { ...a }, src.children)],
  },
};
