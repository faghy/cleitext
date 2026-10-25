/**
 * Spectra's class names and the ones Prisma renders for the same parts of
 * its blocks (Prisma 0.10.0, plugin API 1.53): CSS of a WordPress site
 * written for Spectra (Customize's Additional CSS, a child theme's rules,
 * e.g. `.custom-infobox .uagb-ifb-separator { background-image: … }`) keeps
 * working on the imported pages. Whole names only, each with one clear
 * counterpart; the core renames them in selectors only (`import.cssClasses`).
 */

const sizes = ['default', 'small', 'medium', 'large', 'extralarge'];
const positions = ['above-title', 'below-title', 'left', 'left-title', 'right', 'right-title'];

export const SPECTRA_CLASSES: Record<string, string> = {
  // Container
  'wp-block-uagb-container': 'pr-container',
  'uagb-is-root-container': 'pr-is-root',
  'uagb-container-inner-blocks-wrap': 'pr-container__inner',
  'uagb-container__shape': 'pr-container__shape',
  'uagb-container__shape-top': 'pr-container__shape-top',
  'uagb-container__shape-bottom': 'pr-container__shape-bottom',
  'uagb-container__shape-fill': 'pr-container__shape-fill',
  'uagb-container__shape-flip': 'pr-container__shape-flip',
  'uagb-container__shape-above-content': 'pr-container__shape-above',
  'uagb-container__invert': 'pr-container__invert',
  'uagb-container__video-wrap': 'pr-container__video',
  'uagb-layout-flex': 'pr-layout-flex',
  'uagb-layout-grid': 'pr-layout-grid',
  // Image
  'wp-block-uagb-image': 'pr-image',
  'wp-block-uagb-image__figure': 'pr-image__figure',
  ...Object.fromEntries(
    ['none', 'left', 'center', 'right'].map((a) => [
      `wp-block-uagb-image--align-${a}`,
      `pr-image--align-${a}`,
    ]),
  ),
  'wp-block-uagb-image--effect-static': 'pr-image--effect-static',
  'wp-block-uagb-image--effect-zoomin': 'pr-image--effect-zoomin',
  'wp-block-uagb-image--layout-default': 'pr-image--layout-default',
  'wp-block-uagb-image--layout-overlay': 'pr-image--layout-overlay',
  'wp-block-uagb-image--layout-overlay__inner': 'pr-image__overlay',
  'wp-block-uagb-image--layout-overlay__color-wrapper': 'pr-image__color',
  'wp-block-uagb-image--layout-overlay-link': 'pr-image__overlay-link',
  'uagb-image-heading': 'pr-image__heading',
  'uagb-image-caption': 'pr-image__caption',
  // Heading
  'wp-block-uagb-advanced-heading': 'pr-heading',
  'uagb-heading-text': 'pr-heading__text',
  'uagb-desc-text': 'pr-heading__desc',
  'uagb-separator': 'pr-heading__separator',
  // Info box
  'wp-block-uagb-info-box': 'pr-info-box',
  'wp-block-uagb-info-box--has-margin': 'pr-info-box--has-margin',
  'uagb-infobox-margin-wrapper': 'pr-info-box__margin',
  'uagb-ifb-content': 'pr-info-box__content',
  'uagb-ifb-title-wrap': 'pr-info-box__title-wrap',
  'uagb-ifb-title': 'pr-info-box__title',
  'uagb-ifb-title-prefix': 'pr-info-box__prefix',
  'uagb-ifb-desc': 'pr-info-box__desc',
  'uagb-ifb-separator': 'pr-info-box__separator',
  'uagb-ifb-image-content': 'pr-info-box__image',
  'uagb-ifb-icon-wrap': 'pr-info-box__icon',
  'uagb-ifb-left-title-image': 'pr-info-box__left-title',
  'uagb-ifb-right-title-image': 'pr-info-box__right-title',
  'uagb-ifb-button-wrapper': 'pr-info-box__cta-wrap',
  'uagb-infobox-cta-link': 'pr-info-box__cta',
  'uagb-infbox__link-to-all': 'pr-info-box__link-all',
  'uagb-infobox_cta-type-all': 'pr-info-box--cta-all',
  'uagb-infobox-left': 'pr-info-box--left',
  'uagb-infobox-right': 'pr-info-box--right',
  ...Object.fromEntries(positions.map((p) => [`uagb-infobox-icon-${p}`, `pr-info-box--icon-${p}`])),
  // Buttons
  'wp-block-uagb-buttons': 'pr-buttons',
  'uagb-buttons__wrap': 'pr-buttons__wrap',
  'wp-block-uagb-buttons-child': 'pr-button',
  'uagb-button__wrapper': 'pr-button__wrapper',
  'uagb-button__link': 'pr-button__link',
  'uagb-button__icon': 'pr-button__icon',
  ...Object.fromEntries(
    sizes.flatMap((size) => [
      [`uagb-btn__${size}-btn`, `pr-btn__${size}-btn`],
      [`uagb-btn-tablet__${size}-btn`, `pr-btn-tablet__${size}-btn`],
      [`uagb-btn-mobile__${size}-btn`, `pr-btn-mobile__${size}-btn`],
    ]),
  ),
  // Separator
  'wp-block-uagb-separator': 'pr-separator',
  'wp-block-uagb-separator__inner': 'pr-separator__inner',
  'wp-block-uagb-separator-element': 'pr-separator__element',
  'wp-block-uagb-separator--text': 'pr-separator--text',
  'uagb-separator-spacing-wrapper': 'pr-separator__spacing',
  // Icon list
  'wp-block-uagb-icon-list': 'pr-icon-list',
  'wp-block-uagb-icon-list-child': 'pr-icon-list-item',
  'uagb-icon-list__wrap': 'pr-icon-list__wrap',
  'uagb-icon-list__label': 'pr-icon-list__label',
  'uagb-icon-list__source-wrap': 'pr-icon-list__source-wrap',
  // Team
  'wp-block-uagb-team': 'pr-team',
  'uagb-team__content': 'pr-team__content',
  'uagb-team__title': 'pr-team__title',
  'uagb-team__prefix': 'pr-team__prefix',
  'uagb-team__desc': 'pr-team__desc',
  // Star rating
  'wp-block-uagb-star-rating': 'pr-star-rating',
};
