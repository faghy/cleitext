import type { BaseDevice as Device, Sheet } from '@cleitext/design';
import type { ReactNode } from 'react';
import { cssUrl, gradient, mediaUrl } from '../../lib/background';
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
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { typographyDefaults } from '../heading';

/**
 * Modal: a trigger (text, icon, image or button; or the page itself:
 * after a delay or when the visitor is about to leave; or any element with
 * a class or an id) that opens a popup holding inner blocks.
 */

const D = (device: Device) =>
  device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile';

function paddingDefaults(p: 'Modal' | 'Btn', values: [unknown, unknown, unknown, unknown]): Attrs {
  const out: Attrs = {
    [`padding${p}Unit`]: 'px',
    [`tabletPadding${p}Unit`]: 'px',
    [`mobilePadding${p}Unit`]: 'px',
  };
  ['Top', 'Right', 'Bottom', 'Left'].forEach((side, i) => {
    out[`padding${p}${side}`] = values[i];
    out[`padding${p}${side}Tablet`] = '';
    out[`padding${p}${side}Mobile`] = '';
  });
  return out;
}

const DEFAULTS: Attrs = {
  modalTrigger: 'button',
  triggerText: [{ text: 'Click Here' }],
  icon: 'up-right-from-square',
  closeIcon: 'xmark',
  iconImage: { url: '', alt: '' },
  imageSize: 'thumbnail',
  imgTagWidth: 0,
  imgTagHeight: 0,
  buttonText: [{ text: 'Click Here' }],
  buttonIcon: 'arrow-right',
  showBtnIcon: false,
  buttonType: 'primary',
  inheritFromTheme: false,
  buttonIconSpace: '5',
  buttonIconSpaceTablet: '',
  buttonIconSpaceMobile: '',
  buttonIconSpaceType: 'px',
  buttonIconPosition: 'after',
  modalAlign: 'left',
  modalAlignTablet: '',
  modalAlignMobile: '',
  modalWidth: 600,
  modalWidthTablet: '',
  modalWidthMobile: '',
  modalWidthType: 'px',
  modalWidthTypeTablet: '',
  modalWidthTypeMobile: '',
  modalHeight: 350,
  modalHeightTablet: '',
  modalHeightMobile: '',
  modalHeightType: 'px',
  modalHeightTypeTablet: '',
  modalHeightTypeMobile: '',
  modalBoxHeight: 'auto',
  maxHeight: '90',
  maxHeightTablet: '',
  maxHeightMobile: '',
  maxHeightType: 'vh',
  appearEffect: 'default',
  closeIconSize: 25,
  closeIconPosition: 'popup-top-right',
  closeIconColor: '',
  escPress: true,
  overlayClick: false,
  overlayColor: 'rgba(0,0,0,0.75)',
  modalSpacingLink: true,
  ...paddingDefaults('Modal', ['', '', '', '']),
  iconSize: 30,
  iconColor: '',
  textColor: '',
  ...typographyDefaults('text', ''),
  textFontSizeTypeTablet: '',
  textFontSizeTypeMobile: '',
  imageWidthType: true,
  imageWidth: '',
  imageWidthTablet: '',
  imageWidthMobile: '',
  imageWidthUnit: 'px',
  imageWidthUnitTablet: 'px',
  imageWidthUnitMobile: 'px',
  iconimgBorderRadius: '0',
  iconimgBorderRadiusUnit: 'px',
  btnSpacingLink: true,
  ...paddingDefaults('Btn', [14, 32, 14, 32]),
  ...typographyDefaults('btn', ''),
  btnFontSizeTypeTablet: '',
  btnFontSizeTypeMobile: '',
  btnLinkColor: '',
  btnBgColor: '',
  btnLinkHoverColor: '',
  btnBgHoverColor: '',
  modalTriggerBgType: 'color',
  modalTriggerBgHoverType: 'color',
  // The popup's background.
  backgroundType: 'none',
  backgroundImageDesktop: '',
  backgroundImageTablet: '',
  backgroundImageMobile: '',
  backgroundPositionDesktop: { x: 0.5, y: 0.5 },
  backgroundPositionTablet: '',
  backgroundPositionMobile: '',
  backgroundSizeDesktop: 'cover',
  backgroundSizeTablet: '',
  backgroundSizeMobile: '',
  backgroundRepeatDesktop: 'no-repeat',
  backgroundRepeatTablet: '',
  backgroundRepeatMobile: '',
  backgroundAttachmentDesktop: 'scroll',
  backgroundAttachmentTablet: '',
  backgroundAttachmentMobile: '',
  backgroundColor: '',
  backgroundOpacity: '',
  backgroundImageColor: '#FFFFFF75',
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
  backgroundCustomSizeDesktop: 100,
  backgroundCustomSizeTablet: '',
  backgroundCustomSizeMobile: '',
  backgroundCustomSizeType: '%',
  overlayType: 'none',
  customPosition: 'default',
  xPositionDesktop: '',
  xPositionTablet: '',
  xPositionMobile: '',
  xPositionType: 'px',
  xPositionTypeTablet: 'px',
  xPositionTypeMobile: 'px',
  yPositionDesktop: '',
  yPositionTablet: '',
  yPositionMobile: '',
  yPositionType: 'px',
  yPositionTypeTablet: 'px',
  yPositionTypeMobile: 'px',
  // Opening by itself, by class or id, and remembering it was seen.
  showAfterSeconds: false,
  noOfSecondsToShow: 3,
  exitIntent: false,
  triggerClass: '',
  triggerID: '',
  enableCookies: false,
  hideForDays: 1,
  setCookiesOn: 'close-action',
  ...borderDefaults('btn'),
  btnBorderTopLeftRadius: 3,
  btnBorderTopRightRadius: 3,
  btnBorderBottomLeftRadius: 3,
  btnBorderBottomRightRadius: 3,
  ...borderDefaults('content'),
  contentBorderTopLeftRadius: 3,
  contentBorderTopRightRadius: 3,
  contentBorderBottomLeftRadius: 3,
  contentBorderBottomRightRadius: 3,
};

/** The popup's own background on a device (an overlay is drawn over the image in the same layer). */
function contentBackground(a: Attrs, device: Device): Declarations {
  const d = D(device);
  const pick = (...values: unknown[]) => values.find((v) => mediaUrl(v)) ?? '';
  const image = cssUrl(
    device === 'desktop'
      ? a.backgroundImageDesktop
      : device === 'tablet'
        ? pick(a.backgroundImageTablet, a.backgroundImageDesktop)
        : pick(a.backgroundImageMobile, a.backgroundImageTablet, a.backgroundImageDesktop),
  );
  const color = clean(a.backgroundColor);
  switch (a.backgroundType) {
    case 'color':
      if (image && color)
        return { 'background-image': `linear-gradient(to right, ${color}, ${color}), ${image}` };
      return image ? {} : { 'background-color': color };
    case 'image': {
      const out: Declarations = { 'background-repeat': a[`backgroundRepeat${d}`] };
      if (a.customPosition === 'custom') {
        const x = px(
          a[`xPosition${d}`],
          device === 'desktop' ? a.xPositionType : a[`xPositionType${d}`],
        );
        const y = px(
          a[`yPosition${d}`],
          device === 'desktop' ? a.yPositionType : a[`yPositionType${d}`],
        );
        if (x && y) out['background-position'] = `calc(50% + ${x}) calc(50% + ${y})`;
      } else {
        const position = a[`backgroundPosition${d}`] as { x?: unknown; y?: unknown } | '';
        const x = position && typeof position === 'object' ? numeric(position.x) : null;
        const y = position && typeof position === 'object' ? numeric(position.y) : null;
        if (x !== null && y !== null)
          out['background-position'] =
            `${Math.round(x * 10000) / 100}% ${Math.round(y * 10000) / 100}%`;
      }
      const size = clean(a[`backgroundSize${d}`]);
      out['background-size'] =
        size === 'custom' ? px(a[`backgroundCustomSize${d}`], a.backgroundCustomSizeType) : size;
      out['background-attachment'] = a[`backgroundAttachment${d}`];
      const g = gradient(a, device);
      const tint = clean(a.backgroundImageColor);
      if (a.overlayType === 'gradient' && g) out['background-image'] = image ? `${g}, ${image}` : g;
      else if (a.overlayType === 'color' && tint) {
        if (image)
          out['background-image'] = `linear-gradient(to right, ${tint}, ${tint}), ${image}`;
        else out.background = tint;
      } else if (image) out['background-image'] = image;
      out['background-clip'] = 'padding-box';
      return out;
    }
    case 'gradient':
      return { background: gradient(a, device), 'background-clip': 'padding-box' };
    default:
      return {};
  }
}

/** Radii of the popup (`contentBorder…Radius`), by device. */
function radii(a: Attrs, device: Device): Declarations {
  const s = suffix(device);
  const unit = a[`contentBorderRadiusUnit${s}`];
  return {
    'border-top-left-radius': px(a[`contentBorderTopLeftRadius${s}`], unit),
    'border-top-right-radius': px(a[`contentBorderTopRightRadius${s}`], unit),
    'border-bottom-left-radius': px(a[`contentBorderBottomLeftRadius${s}`], unit),
    'border-bottom-right-radius': px(a[`contentBorderBottomRightRadius${s}`], unit),
  };
}

const FLEX: Record<string, string> = { left: 'flex-start', right: 'flex-end' };

function css(a: Attrs, B: string, sheet: Sheet): void {
  const P = `${B}.pr-modal__popup`;
  const R = `${B}.pr-modal`;
  const BTN = `${B} .pr-modal__button-wrap .pr-modal__button.pr-modal__trigger`;
  const custom = a.modalBoxHeight === 'custom';
  // Space between the button's text and icon falls back to the larger device.
  const spaceTablet =
    numeric(a.buttonIconSpaceTablet) !== null ? a.buttonIconSpaceTablet : a.buttonIconSpace;
  const space: Record<Device, unknown> = {
    desktop: a.buttonIconSpace,
    tablet: spaceTablet,
    mobile: numeric(a.buttonIconSpaceMobile) !== null ? a.buttonIconSpaceMobile : spaceTablet,
  };
  for (const device of DEVICES) {
    const s = suffix(device);
    const desktop = device === 'desktop';
    const widthUnit = desktop ? a.modalWidthType : a[`modalWidthType${s}`] || a.modalWidthType;
    const heightUnit = desktop ? a.modalHeightType : a[`modalHeightType${s}`] || a.modalHeightType;
    emit(
      sheet,
      device,
      `${P} .pr-modal__wrap`,
      custom
        ? {
            width: px(a[`modalWidth${s}`], widthUnit),
            height: px(a[`modalHeight${s}`], heightUnit),
            'border-style': 'none',
            'border-color': 'none',
            ...radii(a, device),
            ...(desktop ? { 'z-index': '99999' } : {}),
          }
        : {
            height: 'auto',
            width: px(a[`modalWidth${s}`], widthUnit),
            'max-height': px(a[`maxHeight${s}`], a.maxHeightType),
            'border-style': 'none',
            'border-color': 'none',
            ...radii(a, device),
          },
    );
    const unit = desktop ? a.paddingModalUnit : a[`${device}PaddingModalUnit`];
    emit(sheet, device, `${B} .pr-modal__content`, {
      'padding-left': px(a[`paddingModalLeft${s}`], unit),
      'padding-right': px(a[`paddingModalRight${s}`], unit),
      'padding-top': px(a[`paddingModalTop${s}`], unit),
      'padding-bottom': px(a[`paddingModalBottom${s}`], unit),
      ...border(a, 'content', device),
      ...contentBackground(a, device),
    });
    emit(sheet, device, `${B} .pr-modal__text.pr-modal__trigger`, {
      ...(desktop ? { color: a.textColor } : {}),
      ...typography(a, 'text', device),
    });
    if (!a.inheritFromTheme) {
      const btnUnit = desktop ? a.paddingBtnUnit : a[`${device}PaddingBtnUnit`];
      emit(sheet, device, BTN, border(a, 'btn', device));
      emit(sheet, device, `${R} .pr-modal__button-wrap .pr-modal__button.pr-modal__trigger`, {
        'padding-left': px(a[`paddingBtnLeft${s}`], btnUnit),
        'padding-right': px(a[`paddingBtnRight${s}`], btnUnit),
        'padding-top': px(a[`paddingBtnTop${s}`], btnUnit),
        'padding-bottom': px(a[`paddingBtnBottom${s}`], btnUnit),
        ...(desktop
          ? {
              color: a.btnLinkColor,
              'background-color': a.modalTriggerBgType === 'color' ? a.btnBgColor : 'transparent',
            }
          : {}),
      });
      const iconSize = px(
        a[`btnFontSize${s}`],
        typeof a.btnFontSizeType === 'string' ? a.btnFontSizeType : '',
      );
      emit(sheet, device, `${BTN} svg`, {
        width: iconSize,
        height: iconSize,
        'line-height': iconSize,
        'font-size': iconSize,
        ...(desktop ? { fill: a.btnLinkColor } : {}),
      });
      emit(sheet, device, BTN, typography(a, 'btn', device));
    }
    if (a.modalTrigger === 'button') {
      emit(sheet, device, `${B} .pr-modal__button svg`, {
        [a.buttonIconPosition === 'after' ? 'margin-left' : 'margin-right']: px(
          space[device],
          a.buttonIconSpaceType,
        ),
      });
    }
    if (a.modalTrigger === 'image' && a.imageWidthType) {
      emit(sheet, device, `${B} img.pr-modal__trigger`, {
        width: px(a[`imageWidth${s}`], a[`imageWidthUnit${s}`]),
      });
    }
    // Alignment of the trigger.
    const align = a[`modalAlign${s}`];
    if (align !== 'full') {
      emit(sheet, device, R, { 'text-align': align });
      if (device !== 'tablet')
        emit(sheet, device, `${B} .wp-block-button__link`, { width: 'unset' });
      emit(sheet, device, `${B} .pr-modal__trigger`, {
        'justify-content': FLEX[String(align)] ?? 'center',
      });
    } else {
      emit(
        sheet,
        device,
        desktop ? `${B} .pr-modal__trigger` : `${B} .wp-block-button__link.pr-modal__trigger`,
        {
          width: '100%',
          'justify-content': 'center',
        },
      );
    }
  }
  emit(sheet, 'desktop', `${B} .pr-modal__content:hover`, {
    'border-color': a.contentBorderHColor,
  });
  const close = px(a.closeIconSize);
  emit(sheet, 'desktop', `${B} .pr-modal__close svg`, {
    width: close,
    height: close,
    'line-height': close,
    'font-size': close,
    fill: a.closeIconColor,
  });
  if (a.closeIconColor) {
    emit(sheet, 'desktop', `${B} .pr-modal__close:focus svg`, {
      filter: `drop-shadow(0 0 1px ${clean(a.closeIconColor)})`,
    });
  }
  emit(sheet, 'desktop', `${P}.is-active`, { background: a.overlayColor, 'z-index': '99999' });
  const icon = px(a.iconSize);
  emit(sheet, 'desktop', `${B} .pr-modal__trigger svg`, {
    width: icon,
    height: icon,
    'line-height': icon,
    'font-size': icon,
    fill: a.iconColor,
  });
  emit(sheet, 'desktop', `${R} img.pr-modal__trigger`, {
    'border-radius': px(a.iconimgBorderRadius, a.iconimgBorderRadiusUnit),
  });
  if (!a.inheritFromTheme) {
    for (const state of [':hover', ':focus']) {
      emit(sheet, 'desktop', `${BTN}${state}`, {
        color: a.btnLinkHoverColor || a.btnLinkColor,
        'background-color':
          a.modalTriggerBgHoverType === 'color' ? a.btnBgHoverColor : 'transparent',
        'border-color': a.btnBorderHColor,
      });
      emit(sheet, 'desktop', `${BTN}${state} svg`, { fill: a.btnLinkHoverColor });
    }
  }
  const corner =
    a.closeIconPosition === 'popup-top-right'
      ? 'right'
      : a.closeIconPosition === 'popup-top-left'
        ? 'left'
        : '';
  if (corner && close) {
    emit(sheet, 'desktop', `${P}.is-active .pr-modal__close`, {
      top: `-${close}`,
      [corner]: `-${close}`,
    });
  }
}

const TRIGGERS = new Set([
  'button',
  'icon',
  'image',
  'text',
  'custom-class',
  'custom-id',
  'automatic',
]);
const CLOSE_POSITIONS = new Set([
  'popup-top-left',
  'popup-top-right',
  'window-top-left',
  'window-top-right',
]);

function View({ attrs: a, id, text, inner, root, editing }: ViewProps) {
  const trigger = TRIGGERS.has(String(a.modalTrigger)) ? String(a.modalTrigger) : 'button';
  const closeAt = CLOSE_POSITIONS.has(String(a.closeIconPosition))
    ? String(a.closeIconPosition)
    : 'popup-top-right';
  const effect =
    String(a.appearEffect ?? 'default')
      .replace(/^uagb-effect-/, '')
      .replace(/\W/g, '') || 'default';
  let opener: ReactNode = null;
  if (trigger === 'text') {
    opener = text('triggerText', {
      tagName: 'span',
      className: 'pr-modal__text pr-modal__trigger',
      placeholder: 'Click Here',
    });
  } else if (trigger === 'icon') {
    opener = (
      <div className="pr-modal__trigger" {...(editing ? {} : { 'aria-label': 'Open' })}>
        {a.icon ? <Icon name={a.icon} /> : null}
      </div>
    );
  } else if (trigger === 'image') {
    const src = mediaUrl(a.iconImage);
    const alt = (a.iconImage as { alt?: unknown } | undefined)?.alt;
    opener = src ? (
      <img
        src={src}
        alt={typeof alt === 'string' ? alt : ''}
        className="pr-modal__trigger"
        {...(numeric(a.imgTagWidth) ? { width: Number(a.imgTagWidth) } : {})}
        {...(numeric(a.imgTagHeight) ? { height: Number(a.imgTagHeight) } : {})}
        loading="lazy"
      />
    ) : editing ? (
      <p className="pr-modal__placeholder">Choose an image in the block settings.</p>
    ) : null;
  } else if (trigger === 'button') {
    const icon = a.showBtnIcon && a.buttonIcon ? <Icon name={a.buttonIcon} /> : null;
    const content = (
      <span className="pr-modal__button-content">
        {a.buttonIconPosition === 'before' && icon}
        {text('buttonText', {
          tagName: 'span',
          className: 'pr-modal__button-text',
          placeholder: 'Click Here',
        })}
        {a.buttonIconPosition !== 'before' && icon}
      </span>
    );
    const className = 'pr-modal__button wp-block-button__link pr-modal__trigger';
    opener = (
      <div className="pr-modal__button-wrap wp-block-button">
        {editing ? (
          <span className={className}>{content}</span>
        ) : (
          <a className={className} href="#" role="button">
            {content}
          </a>
        )}
      </div>
    );
  }
  const closeButton = (className: string) => (
    <button type="button" className={className} aria-label="Close">
      {a.closeIcon ? <Icon name={a.closeIcon} /> : null}
    </button>
  );
  const config = {
    trigger,
    esc: a.escPress !== false,
    overlay: Boolean(a.overlayClick),
    delay: a.showAfterSeconds ? Math.max(0, numeric(a.noOfSecondsToShow) ?? 0) : null,
    exitIntent: Boolean(a.exitIntent),
    selector:
      trigger === 'custom-class' && /^-?[A-Za-z_][\w-]*$/.test(String(a.triggerClass).trim())
        ? `.${String(a.triggerClass).trim()}`
        : trigger === 'custom-id' && /^[A-Za-z][\w-]*$/.test(String(a.triggerID).trim())
          ? `#${String(a.triggerID).trim()}`
          : '',
    cookie: a.enableCookies
      ? {
          days: Math.max(0, numeric(a.hideForDays) ?? 1),
          on: a.setCookiesOn === 'page-refresh' ? 'open' : 'close',
        }
      : null,
    id: blockClass(id).slice('pr-block-'.length),
  };
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-modal',
        'pr-modal',
        blockClass(id),
        editing ? 'pr-modal--editing' : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    <>
      {opener}
      <div
        className={[
          'pr-modal__popup',
          `pr-modal__popup--effect-${effect}`,
          blockClass(id),
          editing ? 'is-active pr-modal__popup--preview' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...(editing ? {} : { 'data-pr-modal': JSON.stringify(config), 'aria-hidden': 'true' })}
      >
        {closeAt.startsWith('window-') &&
          closeButton(`pr-modal__close pr-modal__close--${closeAt}`)}
        <div className="pr-modal__wrap" role="dialog" aria-modal="true">
          {inner({ className: 'pr-modal__content' })}
          {closeAt.startsWith('popup-') && closeButton('pr-modal__close')}
        </div>
      </div>
    </>,
  );
}

export const modal: PrismaBlock = {
  name: 'modal',
  title: 'Modal',
  description: 'A popup with any content, opened by a button, text, icon or image, or by itself.',
  keywords: ['modal', 'popup', 'lightbox', 'dialog'],
  container: true,
  richAttributes: ['triggerText', 'buttonText'],
  defaults: DEFAULTS,
  css,
  View,
  media: (a) => {
    const ids = [
      a.iconImage,
      a.backgroundImageDesktop,
      a.backgroundImageTablet,
      a.backgroundImageMobile,
    ]
      .map((m) => (m && typeof m === 'object' ? (m as { id?: unknown }).id : undefined))
      .filter((v): v is string => typeof v === 'string');
    return ids;
  },
  script: { file: 'modal.js', marker: 'data-pr-modal' },
  spectra: {
    'uagb/modal': (a, src) => {
      const attrs: Attrs = { ...a };
      const triggerText = src.inner('span', 'uagb-modal-text');
      const buttonText = src.inner('span', 'uagb-inline-editing');
      if (triggerText) attrs.triggerText = triggerText;
      if (buttonText) attrs.buttonText = buttonText;
      if (typeof a.appearEffect === 'string')
        attrs.appearEffect = a.appearEffect.replace(/^uagb-effect-/, '') || 'default';
      return [src.block('modal', attrs, src.children)];
    },
  },
};
