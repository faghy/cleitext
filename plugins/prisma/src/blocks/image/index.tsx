import type { ReactNode } from 'react';
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
  typography,
} from '../../lib/emit';
import { maskUrl } from '../../lib/masks';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

/** Spacing of four sides, e.g. `imageTopMargin`, `imageTopMarginTablet`. */
function margins(a: Attrs, p: string, unitBase: string, device: 'desktop' | 'tablet' | 'mobile') {
  const s = suffix(device);
  const unit = a[`${unitBase}${s}`] ?? a[unitBase];
  return {
    'margin-top': px(a[`${p}TopMargin${s}`], unit),
    'margin-right': px(a[`${p}RightMargin${s}`], unit),
    'margin-bottom': px(a[`${p}BottomMargin${s}`], unit),
    'margin-left': px(a[`${p}LeftMargin${s}`], unit),
  };
}

const FLEX: Record<string, string> = { left: 'flex-start', right: 'flex-end', center: 'center' };

function marginDefaults(p: string): Attrs {
  const out: Attrs = {};
  for (const s of ['', 'Tablet', 'Mobile']) {
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) out[`${p}${side}Margin${s}`] = '';
    out[`${p}MarginUnit${s}`] = 'px';
  }
  out[`${p}MarginLink`] = true;
  return out;
}

function typographyDefaults(p: string, extra: Attrs = {}): Attrs {
  return {
    [`${p}FontFamily`]: 'Default',
    [`${p}FontWeight`]: '',
    [`${p}FontStyle`]: 'normal',
    [`${p}Transform`]: '',
    [`${p}Decoration`]: '',
    [`${p}FontSize`]: '',
    [`${p}FontSizeTablet`]: '',
    [`${p}FontSizeMobile`]: '',
    [`${p}FontSizeType`]: 'px',
    [`${p}FontSizeTypeTablet`]: 'px',
    [`${p}FontSizeTypeMobile`]: 'px',
    [`${p}LineHeight`]: '',
    [`${p}LineHeightTablet`]: '',
    [`${p}LineHeightMobile`]: '',
    [`${p}LineHeightType`]: 'em',
    [`${p}LetterSpacing`]: '',
    [`${p}LetterSpacingTablet`]: '',
    [`${p}LetterSpacingMobile`]: '',
    [`${p}LetterSpacingType`]: 'px',
    [`${p}LoadGoogleFonts`]: false,
    ...extra,
  };
}

const DEFAULTS: Attrs = {
  id: '',
  url: '',
  urlTablet: '',
  urlMobile: '',
  alt: '',
  title: '',
  imgRole: 'img',
  naturalWidth: '',
  naturalHeight: '',
  width: '',
  widthTablet: '',
  widthMobile: '',
  height: '',
  heightTablet: '',
  heightMobile: '',
  customHeightSetDesktop: false,
  customHeightSetTablet: false,
  customHeightSetMobile: false,
  objectFit: '',
  objectFitTablet: '',
  objectFitMobile: '',
  disableLazyLoad: false,
  align: '',
  alignTablet: '',
  alignMobile: '',
  layout: 'default',
  imageHoverEffect: 'static',
  enableCaption: false,
  caption: [],
  heading: [],
  headingTag: 'h2',
  headingId: '',
  overlayContentPosition: 'center center',
  href: '',
  linkTarget: '',
  rel: '',
  linkClass: '',
  ...marginDefaults('image'),
  ...borderDefaults('image'),
  useSeparateBoxShadows: true,
  imageBoxShadowColor: '#00000070',
  imageBoxShadowHOffset: 0,
  imageBoxShadowVOffset: 0,
  imageBoxShadowBlur: '',
  imageBoxShadowSpread: '',
  imageBoxShadowPosition: 'outset',
  imageBoxShadowColorHover: '',
  imageBoxShadowHOffsetHover: 0,
  imageBoxShadowVOffsetHover: 0,
  imageBoxShadowBlurHover: '',
  imageBoxShadowSpreadHover: '',
  imageBoxShadowPositionHover: 'outset',
  overlayBackground: '',
  overlayOpacity: 0.2,
  overlayHoverOpacity: 1,
  overlayPositionFromEdge: 15,
  overlayPositionFromEdgeUnit: 'px',
  ...borderDefaults('overlay'),
  headingShowOn: 'always',
  headingColor: '#fff',
  ...typographyDefaults('heading'),
  ...marginDefaults('heading'),
  captionShowOn: 'hover',
  captionAlign: 'center',
  captionColor: '',
  ...typographyDefaults('caption'),
  ...marginDefaults('caption'),
  seperatorStyle: 'none',
  seperatorPosition: 'after_title',
  seperatorShowOn: 'hover',
  seperatorColor: '#fff',
  seperatorWidth: 30,
  separatorWidthType: '%',
  seperatorThickness: 2,
  seperatorThicknessUnit: 'px',
  ...marginDefaults('seperator'),
  maskShape: 'none',
  maskCustomShape: { url: '', alt: 'mask shape' },
  maskSize: 'auto',
  maskPosition: 'center center',
  maskRepeat: 'no-repeat',
};

function css(a: Attrs, B: string, sheet: Parameters<PrismaBlock['css']>[2]): void {
  const overlay = `${B}.pr-image--layout-overlay`;
  const inner = `${B} .pr-image__overlay`;
  const shadow = boxShadow(
    a.imageBoxShadowHOffset,
    a.imageBoxShadowVOffset,
    a.imageBoxShadowBlur,
    a.imageBoxShadowSpread,
    a.imageBoxShadowColor,
    a.imageBoxShadowPosition,
  );
  const shadowHover = boxShadow(
    a.imageBoxShadowHOffsetHover,
    a.imageBoxShadowVOffsetHover,
    a.imageBoxShadowBlurHover,
    a.imageBoxShadowSpreadHover,
    a.imageBoxShadowColorHover,
    a.imageBoxShadowPositionHover,
    a.imageBoxShadowColor,
  );
  for (const device of DEVICES) {
    const s = suffix(device);
    const align = String(a[device === 'desktop' ? 'align' : `align${s}`] ?? '');
    emit(sheet, device, `${B}.pr-image`, {
      ...margins(a, 'image', 'imageMarginUnit', device),
      'text-align': ['left', 'right', 'center'].includes(align) ? align : '',
      'justify-content': FLEX[align],
      'align-self': FLEX[align],
    });
    emit(sheet, device, `${B} .pr-image__figure`, { 'align-items': FLEX[align] });
    emit(sheet, device, `${B} .pr-image__figure img`, {
      ...(device === 'desktop' ? { 'box-shadow': shadow } : {}),
      ...border(a, 'image', device),
    });
    // Width and height: the device's, else the larger device's.
    const width =
      device === 'desktop'
        ? a.width
        : device === 'tablet'
          ? a.widthTablet || a.width
          : a.widthMobile || a.widthTablet || a.width;
    const customHeight = Boolean(a[`customHeightSet${device === 'desktop' ? 'Desktop' : s}`]);
    const height =
      device === 'desktop'
        ? a.height
        : device === 'tablet'
          ? a.heightTablet || a.height
          : a.heightMobile || a.heightTablet || a.height;
    emit(sheet, device, `${B} .pr-image__figure img`, {
      'object-fit': a[`objectFit${s}`],
      width: px(width),
      height: customHeight ? px(height) : 'auto',
      // WordPress gives lazy images `sizes="auto"`, so browsers size them by their width and
      // height attributes, not by the file: an automatic height keeps the block's proportions.
      // Those are the computer's box when it has its own height: tablets and phones without
      // one show the whole picture in its own proportions, as Spectra's `height: auto` does.
      'aspect-ratio':
        device === 'desktop'
          ? attributeRatio(a)
          : !customHeight && a.customHeightSetDesktop
            ? fileRatio(a)
            : '',
    });
    emit(sheet, device, `${B} .pr-image__figure figcaption`, {
      ...(device === 'desktop' ? { color: a.captionColor } : {}),
      ...margins(a, 'caption', 'captionMarginUnit', device),
      ...(device === 'desktop' && a.layout !== 'overlay' ? { 'align-self': a.captionAlign } : {}),
      ...typography(a, 'caption', device),
    });
    if (device === 'desktop')
      emit(sheet, device, `${B} .pr-image__figure figcaption a`, { color: a.captionColor });
    emit(sheet, device, `${overlay} .pr-image__color`, border(a, 'image', device));
    emit(sheet, device, inner, {
      ...border(a, 'overlay', device),
      ...(device === 'desktop'
        ? {
            left: px(a.overlayPositionFromEdge, a.overlayPositionFromEdgeUnit),
            right: px(a.overlayPositionFromEdge, a.overlayPositionFromEdgeUnit),
            top: px(a.overlayPositionFromEdge, a.overlayPositionFromEdgeUnit),
            bottom: px(a.overlayPositionFromEdge, a.overlayPositionFromEdgeUnit),
          }
        : {}),
    });
    emit(sheet, device, `${inner} .pr-image__heading`, {
      ...(device === 'desktop'
        ? { color: a.headingColor, opacity: a.headingShowOn === 'always' ? 1 : 0 }
        : {}),
      ...margins(a, 'heading', 'headingMarginUnit', device),
      ...typography(a, 'heading', device),
    });
    emit(sheet, device, `${inner} .pr-image__separator`, {
      ...(device === 'desktop'
        ? {
            width: px(a.seperatorWidth, a.separatorWidthType),
            'border-top-width': px(a.seperatorThickness, a.seperatorThicknessUnit),
            'border-top-color': a.seperatorColor,
            'border-top-style': a.seperatorStyle,
            opacity: a.seperatorShowOn === 'always' ? 1 : 0,
          }
        : {}),
      ...margins(a, 'seperator', 'seperatorMarginUnit', device),
    });
  }
  // Desktop only: colors, hover states, overlay and mask.
  emit(sheet, 'desktop', `${B} .pr-image__figure img:hover`, {
    'border-color': a.imageBorderHColor,
  });
  emit(sheet, 'desktop', `${inner} .pr-image__heading a`, { color: a.headingColor });
  emit(sheet, 'desktop', `${inner} .pr-image__caption`, {
    opacity: a.captionShowOn === 'always' ? 1 : 0,
  });
  emit(sheet, 'desktop', `${overlay} .pr-image__color`, {
    background: a.overlayBackground,
    opacity: a.overlayOpacity,
  });
  emit(sheet, 'desktop', `${overlay} .pr-image__figure:hover .pr-image__overlay`, {
    'border-color': a.overlayBorderHColor,
  });
  emit(sheet, 'desktop', `${overlay} .pr-image__figure:hover .pr-image__color`, {
    opacity: a.overlayHoverOpacity,
    'border-color': a.imageBorderHColor,
  });
  for (const [part, setting] of [
    ['heading', a.headingShowOn],
    ['caption', a.captionShowOn],
    ['separator', a.seperatorShowOn],
  ] as const) {
    if (setting === 'hover') {
      emit(sheet, 'desktop', `${B} .pr-image__figure:hover .pr-image__overlay .pr-image__${part}`, {
        opacity: 1,
      });
    }
  }
  if (a.useSeparateBoxShadows) {
    emit(sheet, 'desktop', `${B} .pr-image__figure:hover img`, { 'box-shadow': shadowHover });
  }
  const shape = String(a.maskShape ?? 'none');
  const custom = (a.maskCustomShape as { url?: unknown } | undefined)?.url;
  const mask =
    shape === 'custom'
      ? typeof custom === 'string' && /^(https?:\/\/|\/)[^\s"'()\\]*$/.test(custom)
        ? `url("${custom}")`
        : null
      : shape !== 'none'
        ? maskUrl(shape)
        : null;
  if (mask) {
    emit(sheet, 'desktop', `${B} .pr-image__figure img, ${B} .pr-image__color`, {
      'mask-image': mask,
      '-webkit-mask-image': mask,
      'mask-size': a.maskSize,
      '-webkit-mask-size': a.maskSize,
      'mask-repeat': a.maskRepeat,
      '-webkit-mask-repeat': a.maskRepeat,
      'mask-position': a.maskPosition,
      '-webkit-mask-position': a.maskPosition,
    });
  }
}

/** A web address fit for `src`/`href`, or ''. */
function safeUrl(value: unknown): string {
  return typeof value === 'string' && /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(value.trim())
    ? value.trim()
    : '';
}

/** `width / height` of the image's attributes, for lazy images (see `css`). */
function attributeRatio(a: Attrs): string {
  if (a.disableLazyLoad) return '';
  const w = numeric(a.width || a.naturalWidth);
  const h = numeric(a.height || a.naturalHeight);
  return w && h ? `${w} / ${h}` : '';
}

/**
 * The picture's own proportions (`auto`, with its natural size until it loads), for devices
 * that do not keep the computer's box.
 */
function fileRatio(a: Attrs): string {
  const w = numeric(a.naturalWidth);
  const h = numeric(a.naturalHeight);
  return w && h ? `auto ${w} / ${h}` : 'auto';
}

function View({ attrs: a, id, text, editing, root }: ViewProps) {
  const align = String(a.align || 'none');
  const url = safeUrl(a.url);
  const presentation = a.imgRole === 'presentation';
  const width = a.width || a.naturalWidth;
  const height = a.height || a.naturalHeight;
  const tablet = safeUrl(a.urlTablet);
  const mobile = safeUrl(a.urlMobile);
  const img = url ? (
    <img
      src={url}
      alt={presentation ? '' : String(a.alt ?? '')}
      {...(a.id ? { className: `pr-image-${String(a.id).replace(/[^\w-]/g, '')}` } : {})}
      {...(typeof width === 'number' || /^\d+$/.test(String(width))
        ? { width: Number(width) }
        : {})}
      {...(typeof height === 'number' || /^\d+$/.test(String(height))
        ? { height: Number(height) }
        : {})}
      {...(a.title && !presentation ? { title: String(a.title) } : {})}
      {...(a.disableLazyLoad ? {} : { loading: 'lazy' as const })}
      decoding="async"
      {...(presentation ? { role: 'presentation' } : {})}
    />
  ) : editing ? (
    <span className="pr-image__placeholder">Select an image in the block settings</span>
  ) : null;
  // Other images on tablets and phones, when set.
  const picture =
    img && url && (tablet || mobile) ? (
      <picture>
        {mobile && <source media="(max-width: 767px)" srcSet={mobile} />}
        {tablet && <source media="(max-width: 976px)" srcSet={tablet} />}
        {img}
      </picture>
    ) : (
      img
    );
  const href = safeUrl(a.href);
  const link = (children: ReactNode, className?: string) =>
    href && !editing ? (
      <a
        className={className ?? (String(a.linkClass ?? '') || undefined)}
        href={href}
        {...(a.linkTarget === '_blank' ? { target: '_blank' } : {})}
        rel={String(a.rel ?? '').trim() || 'noopener'}
      >
        {children}
      </a>
    ) : (
      children
    );
  const overlay = a.layout === 'overlay';
  const separator =
    a.seperatorStyle && a.seperatorStyle !== 'none' ? (
      <div className="pr-image__separator" />
    ) : null;
  const position = String(a.overlayContentPosition ?? 'center center').replace(' ', '-');
  const hasText = (name: string) =>
    editing || (Array.isArray(a[name]) && (a[name] as unknown[]).length > 0);
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-image',
        'pr-image',
        blockClass(id),
        ['left', 'right', 'center', 'wide', 'full'].includes(align) ? `align${align}` : '',
        `pr-image--layout-${overlay ? 'overlay' : 'default'}`,
        `pr-image--effect-${String(a.imageHoverEffect ?? 'static').replace(/[^\w-]/g, '')}`,
        `pr-image--align-${align.replace(/[^\w-]/g, '')}`,
      ]
        .filter(Boolean)
        .join(' '),
    },
    <figure className="pr-image__figure">
      {link(picture)}
      {!overlay &&
        Boolean(a.enableCaption) &&
        hasText('caption') &&
        text('caption', {
          tagName: 'figcaption',
          className: 'pr-image__caption',
          placeholder: 'Caption',
        })}
      {overlay && (
        <>
          <div className="pr-image__color" />
          <div className={`pr-image__overlay ${position.replace(/[^\w-]/g, '')}`}>
            {href &&
              !editing &&
              link(null, `pr-image__overlay-link ${String(a.linkClass ?? '')}`.trim())}
            {a.seperatorPosition === 'before_title' && separator}
            {hasText('heading') &&
              text('heading', {
                tagName: safeTag(a.headingTag, 'h2'),
                className: 'pr-image__heading',
                placeholder: 'Heading',
              })}
            {a.seperatorPosition === 'after_title' && separator}
            {hasText('caption') &&
              text('caption', {
                tagName: 'figcaption',
                className: 'pr-image__caption',
                placeholder: 'Description',
              })}
            {a.seperatorPosition === 'after_sub_title' && separator}
          </div>
        </>
      )}
    </figure>,
  );
}

export const image: PrismaBlock = {
  name: 'image',
  title: 'Image',
  description:
    'An image with a mask shape, hover effects, an overlay with a heading, and a caption.',
  keywords: ['image', 'photo', 'mask', 'overlay'],
  richAttributes: ['caption', 'heading'],
  defaults: DEFAULTS,
  css,
  View,
};
