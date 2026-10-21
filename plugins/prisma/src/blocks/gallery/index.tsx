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
  typography,
} from '../../lib/emit';
import { Icon } from '../../lib/icons';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

/** One image of the gallery, as saved (`mediaGallery`). */
interface GalleryImage {
  id?: string | number;
  url?: string;
  alt?: string;
  caption?: string;
  sizes?: Record<string, { url?: string; width?: number; height?: number }>;
}

const DEV = (d: Device) => (d === 'desktop' ? 'Desk' : d === 'tablet' ? 'Tab' : 'Mob');
const SHORT = (d: Device) => (d === 'desktop' ? '' : d === 'tablet' ? 'Tab' : 'Mob');

function quad(p: string, extra: Attrs = {}): Attrs {
  const out: Attrs = { ...extra };
  for (const side of ['Top', 'Right', 'Bottom', 'Left'])
    for (const s of ['', 'Tab', 'Mob']) out[`${p}${side}${s}`] = '';
  return out;
}

const DEFAULTS: Attrs = {
  readyToRender: true,
  focusListObject: {},
  mediaGallery: [],
  mediaIDs: [],
  feedLayout: 'grid',
  imageDisplayCaption: true,
  galleryImageSize: 'large',
  galleryImageSizeTablet: 'large',
  galleryImageSizeMobile: 'medium',
  imageClickEvent: 'none',
  disableLazyLoad: false,
  lightboxDisplayCaptions: false,
  lightboxThumbnails: false,
  lightboxDisplayCount: false,
  lightboxCloseIcon: 'xmark',
  lightboxCaptionHeight: 50,
  lightboxIconSize: 24,
  lightboxEdgeDistance: 10,
  lightboxBackgroundEnableBlur: true,
  lightboxBackgroundBlurAmount: 5,
  lightboxBackgroundColor: 'rgba(0,0,0,0.75)',
  lightboxIconColor: 'rgba(255,255,255,1)',
  lightboxCaptionColor: 'rgba(255,255,255,1)',
  lightboxCaptionBackgroundColor: 'rgba(0,0,0,1)',
  captionVisibility: 'hover',
  captionDisplayType: 'overlay',
  imageCaptionAlignment: 'center center',
  imageCaptionAlignment01: 'center',
  imageCaptionAlignment02: 'center',
  imageDefaultCaption: 'No Caption',
  ...quad('captionPadding'),
  captionPaddingTop: 8,
  captionPaddingRight: 8,
  captionPaddingBottom: 8,
  captionPaddingLeft: 8,
  captionPaddingUnit: 'px',
  captionGap: 0,
  captionGapUnit: 'px',
  captionFontFamily: 'Default',
  captionFontWeight: '',
  captionFontStyle: 'normal',
  captionTransform: '',
  captionDecoration: 'none',
  captionFontSize: '',
  captionFontSizeType: 'px',
  captionLineHeight: '',
  captionLineHeightType: 'em',
  captionLoadGoogleFonts: false,
  captionColor: 'rgba(255,255,255,1)',
  captionColorHover: 'rgba(255,255,255,1)',
  captionBackgroundColor: 'rgba(0,0,0,0.75)',
  captionBackgroundColorHover: 'rgba(0,0,0,0.75)',
  captionSeparateColors: false,
  overlayColor: 'rgba(0,0,0,0)',
  overlayColorHover: 'rgba(0,0,0,0)',
  columnsDesk: 3,
  columnsTab: 3,
  columnsMob: 2,
  gridImageGap: 8,
  gridImageGapTab: '',
  gridImageGapMob: '',
  gridImageGapUnit: 'px',
  ...quad('feedMargin'),
  feedMarginUnit: 'px',
  carouselStartAt: 0,
  carouselSquares: false,
  carouselLoop: true,
  carouselAutoplay: true,
  carouselAutoplaySpeed: 2000,
  carouselPauseOnHover: true,
  carouselTransitionSpeed: 500,
  feedPagination: false,
  paginateLimit: 9,
  paginateUseArrows: true,
  paginateUseDots: true,
  paginateUseLoader: true,
  paginateButtonText: 'Load More Images',
  paginateArrowDistance: -24,
  paginateArrowDistanceUnit: 'px',
  paginateArrowSize: 24,
  paginateDotDistance: 8,
  paginateDotDistanceUnit: 'px',
  paginateColor: '',
  paginateColorHover: '',
  paginateButtonTextColor: '',
  paginateButtonTextColorHover: '',
  imageEnableZoom: true,
  imageZoomType: 'zoom-in',
  captionBackgroundEnableBlur: false,
  captionBackgroundBlurAmount: 0,
  captionBackgroundBlurAmountHover: 5,
  captionBackgroundEffect: 'none',
  captionBackgroundEffectHover: 'none',
  captionBackgroundEffectAmount: 100,
  captionBackgroundEffectAmountHover: 0,
  imageBoxShadowColor: '',
  imageBoxShadowColorHover: '',
  imageBoxShadowHOffset: 0,
  imageBoxShadowVOffset: 0,
  imageBoxShadowBlur: '',
  imageBoxShadowSpread: '',
  imageBoxShadowPosition: 'outset',
  imageBoxShadowHOffsetHover: 0,
  imageBoxShadowVOffsetHover: 0,
  imageBoxShadowBlurHover: '',
  imageBoxShadowSpreadHover: '',
  imageBoxShadowPositionHover: 'outset',
  ...borderDefaults('image'),
  ...borderDefaults('arrow'),
  arrowBorderStyle: 'none',
  ...borderDefaults('mainTitle'),
};

const FLEX: Record<string, string> = {
  top: 'flex-start',
  left: 'flex-start',
  bottom: 'flex-end',
  right: 'flex-end',
  center: 'center',
};

/** The gallery's images, safe to draw. */
export function images(a: Attrs): GalleryImage[] {
  return Array.isArray(a.mediaGallery)
    ? (a.mediaGallery as GalleryImage[]).filter(
        (m) => m && typeof m === 'object' && typeof m.url === 'string',
      )
    : [];
}

const safe = (url: unknown) =>
  typeof url === 'string' && /^(https?:\/\/|\/(?!\/))[^\s"'<>]*$/.test(url) ? url : '';

/** The address of an image at a size (`large`, `medium`…), else the original. */
function sized(image: GalleryImage, size: unknown): string {
  return safe(image.sizes?.[String(size)]?.url) || safe(image.url);
}

function shadow(a: Attrs, hover: boolean): string {
  const h = hover ? 'Hover' : '';
  const color = clean(a[`imageBoxShadowColor${h}`]) || (hover ? clean(a.imageBoxShadowColor) : '');
  const parts = [
    a[`imageBoxShadowHOffset${h}`],
    a[`imageBoxShadowVOffset${h}`],
    a[`imageBoxShadowBlur${h}`],
    a[`imageBoxShadowSpread${h}`],
  ]
    .map((v) => px(v) || '0')
    .join(' ');
  if (!color) return '';
  return `${parts} ${color}${a[`imageBoxShadowPosition${h}`] === 'inset' ? ' inset' : ''}`;
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const layout = String(a.feedLayout);
  const G = `${B} .pr-gallery`;
  const dc = clean(a.paginateColor) || '#007cba';
  const dd = numeric(a.paginateDotDistance) ?? 0;
  const gap = (device: Device) => {
    const g = numeric(a.gridImageGap) ?? 0;
    const t = numeric(a.gridImageGapTab) ?? g;
    return device === 'desktop' ? g : device === 'tablet' ? t : (numeric(a.gridImageGapMob) ?? t);
  };
  const [vertical, horizontal] = String(a.imageCaptionAlignment ?? 'center center').split(' ');
  for (const device of DEVICES) {
    const s = SHORT(device);
    const g = gap(device);
    const unit = a.gridImageGapUnit;
    emit(sheet, device, `${B}.pr-gallery-block`, {
      'padding-top': px(a[`feedMarginTop${s}`], a[`feedMarginUnit${s}`] ?? a.feedMarginUnit),
      'padding-right': px(a[`feedMarginRight${s}`], a[`feedMarginUnit${s}`] ?? a.feedMarginUnit),
      'padding-bottom': px(a[`feedMarginBottom${s}`], a[`feedMarginUnit${s}`] ?? a.feedMarginUnit),
      'padding-left': px(a[`feedMarginLeft${s}`], a[`feedMarginUnit${s}`] ?? a.feedMarginUnit),
    });
    emit(sheet, device, `${G}--grid, ${G}--tiled`, { gap: px(g, unit) });
    emit(sheet, device, `${G}--masonry`, { '--pr-gap': px(g, unit) });
    // As Spectra: half the gap on each side on desktop, the whole gap on tablets and phones.
    const side = device === 'desktop' ? g / 2 : g;
    emit(sheet, device, `${G}--carousel .pr-gallery__item`, {
      padding: `0 ${px(side, unit) || '0'}`,
    });
    emit(sheet, device, `${G}--carousel .pr-gallery__viewport`, {
      margin: `0 ${px(-side, unit) || '0'}`,
    });
    emit(sheet, device, `${B} .pr-gallery__media`, border(a, 'image', device));
    emit(sheet, device, `${B} .pr-gallery__caption`, typography(a, 'caption', device));
    emit(
      sheet,
      device,
      `${B} .pr-gallery__caption--bar-inside, ${B} .pr-gallery__caption--bar-outside`,
      border(a, 'mainTitle', device),
    );
    if (layout === 'carousel')
      emit(sheet, device, `${B} .pr-gallery__arrow`, border(a, 'arrow', device));
  }
  // Desktop only from here.
  emit(sheet, 'desktop', `${B} .pr-gallery__media`, { 'box-shadow': shadow(a, false) });
  emit(
    sheet,
    'desktop',
    `${B} .pr-gallery__item:hover .pr-gallery__media, ${B} .pr-gallery__item:focus-visible .pr-gallery__media`,
    {
      'box-shadow': shadow(a, true),
      'border-color': a.imageBorderHColor,
    },
  );
  const blur = (n: unknown) =>
    a.captionBackgroundEnableBlur ? `blur(${numeric(n) ?? 0}px)` : 'none';
  emit(sheet, 'desktop', `${B} .pr-gallery__blurrer`, {
    'backdrop-filter': blur(a.captionBackgroundBlurAmount),
    '-webkit-backdrop-filter': blur(a.captionBackgroundBlurAmount),
  });
  emit(sheet, 'desktop', `${B} .pr-gallery__item:hover .pr-gallery__blurrer`, {
    'backdrop-filter': blur(a.captionBackgroundBlurAmountHover),
    '-webkit-backdrop-filter': blur(a.captionBackgroundBlurAmountHover),
  });
  const effect = (type: unknown, amount: unknown) =>
    type === 'grayscale' || type === 'sepia' ? `${String(type)}(${numeric(amount) ?? 0}%)` : 'none';
  emit(sheet, 'desktop', `${B} .pr-gallery__img`, {
    filter: effect(a.captionBackgroundEffect, a.captionBackgroundEffectAmount),
    ...(a.imageEnableZoom
      ? {
          transform:
            a.imageZoomType === 'zoom-out' ? 'scale3d(1.1,1.1,1.1)' : 'scale3d(1.005,1.005,1.005)',
        }
      : {}),
  });
  emit(
    sheet,
    'desktop',
    `${B} .pr-gallery__item:hover .pr-gallery__img, ${B} .pr-gallery__item:focus-visible .pr-gallery__img`,
    {
      filter: effect(a.captionBackgroundEffectHover, a.captionBackgroundEffectAmountHover),
      ...(a.imageEnableZoom
        ? {
            transform:
              a.imageZoomType === 'zoom-out'
                ? 'scale3d(1.005,1.005,1.005)'
                : 'scale3d(1.1,1.1,1.1)',
          }
        : {}),
    },
  );
  const captions = Boolean(a.imageDisplayCaption);
  const hoverOnly = a.captionVisibility === 'hover';
  const anti = a.captionVisibility === 'antiHover';
  emit(sheet, 'desktop', `${B} .pr-gallery__overlay--overlay`, {
    background: captions ? (hoverOnly ? 'transparent' : a.captionBackgroundColor) : a.overlayColor,
  });
  emit(
    sheet,
    'desktop',
    `${B} .pr-gallery__item:hover .pr-gallery__overlay--overlay, ${B} .pr-gallery__item:focus-visible .pr-gallery__overlay--overlay`,
    {
      background: captions
        ? anti
          ? 'transparent'
          : a.captionVisibility === 'always' && a.captionSeparateColors
            ? a.captionBackgroundColorHover
            : a.captionBackgroundColor
        : a.overlayColorHover,
    },
  );
  emit(
    sheet,
    'desktop',
    `${B} .pr-gallery__overlay--bar-inside, ${B} .pr-gallery__caption--overlay`,
    {
      'align-items': FLEX[vertical ?? 'center'],
      'justify-content': FLEX[horizontal ?? 'center'],
    },
  );
  emit(sheet, 'desktop', `${B} .pr-gallery__caption, ${B} .pr-gallery__caption a`, {
    color: hoverOnly ? 'transparent' : a.captionColor,
    'text-align': horizontal,
    'padding-top': px(a.captionPaddingTop, a.captionPaddingUnit),
    'padding-right': px(a.captionPaddingRight, a.captionPaddingUnit),
    'padding-bottom': px(a.captionPaddingBottom, a.captionPaddingUnit),
    'padding-left': px(a.captionPaddingLeft, a.captionPaddingUnit),
  });
  emit(
    sheet,
    'desktop',
    `${B} .pr-gallery__item:hover .pr-gallery__caption, ${B} .pr-gallery__item:focus-visible .pr-gallery__caption`,
    {
      color: anti
        ? 'transparent'
        : a.captionVisibility === 'always' && a.captionSeparateColors
          ? a.captionColorHover
          : a.captionColor,
    },
  );
  emit(sheet, 'desktop', `${B} .pr-gallery__caption--bar-inside`, {
    background: hoverOnly ? 'transparent' : a.captionBackgroundColor,
    'border-color': hoverOnly ? 'transparent' : a.mainTitleBorderColor,
  });
  emit(sheet, 'desktop', `${B} .pr-gallery__item:hover .pr-gallery__caption--bar-inside`, {
    background: anti ? 'transparent' : a.captionBackgroundColor,
    'border-color': anti ? 'transparent' : a.mainTitleBorderHColor,
  });
  emit(sheet, 'desktop', `${B} .pr-gallery__caption--bar-outside`, {
    background: a.captionBackgroundColor,
  });
  if (captions && a.captionDisplayType === 'bar-outside') {
    emit(sheet, 'desktop', `${B} .pr-gallery__outside`, {
      [a.imageCaptionAlignment01 === 'top' ? 'margin-bottom' : 'margin-top']: px(
        a.captionGap,
        a.captionGapUnit,
      ),
    });
  }
  if (layout === 'carousel' && a.carouselSquares) {
    emit(sheet, 'desktop', `${B} .pr-gallery--carousel .pr-gallery__media`, {
      'aspect-ratio': '1',
    });
    emit(sheet, 'desktop', `${B} .pr-gallery--carousel .pr-gallery__img`, {
      width: '100%',
      height: '100%',
      'object-fit': 'cover',
    });
  }
  // Arrows, dots, pager and load more.
  emit(sheet, 'desktop', `${B} .pr-gallery__arrow svg`, {
    fill: dc,
    width: px(a.paginateArrowSize),
    height: px(a.paginateArrowSize),
  });
  emit(sheet, 'desktop', `${B} .pr-gallery__arrow:hover svg`, { fill: a.paginateColorHover });
  emit(sheet, 'desktop', `${B} .pr-gallery__arrow--prev`, {
    left: px(a.paginateArrowDistance, a.paginateArrowDistanceUnit),
  });
  emit(sheet, 'desktop', `${B} .pr-gallery__arrow--next`, {
    right: px(a.paginateArrowDistance, a.paginateArrowDistanceUnit),
  });
  emit(sheet, 'desktop', `${B} .pr-gallery__dots`, {
    'margin-top': px(dd, a.paginateDotDistanceUnit),
  });
  emit(sheet, 'desktop', `${B} .pr-gallery__dots--carousel`, {
    'margin-top': 0,
    top: px(dd, a.paginateDotDistanceUnit),
  });
  emit(sheet, 'desktop', `${B} .pr-gallery__dot::before`, { color: dc });
  emit(sheet, 'desktop', `${B} .pr-gallery__dot:hover::before`, { color: a.paginateColorHover });
  emit(sheet, 'desktop', `${B} .pr-gallery__more`, {
    'margin-top': px(dd, a.paginateDotDistanceUnit),
    color: a.paginateButtonTextColor,
    'background-color': a.paginateColor,
  });
  emit(sheet, 'desktop', `${B} .pr-gallery__more:hover`, {
    color: a.paginateButtonTextColorHover,
    'background-color': a.paginateColorHover,
  });
  // The lightbox, next to the gallery.
  const L = `${B} + .pr-lightbox`;
  emit(sheet, 'desktop', L, {
    'background-color': a.lightboxBackgroundColor,
    'backdrop-filter': a.lightboxBackgroundEnableBlur
      ? `blur(${numeric(a.lightboxBackgroundBlurAmount) ?? 0}px)`
      : '',
  });
  emit(sheet, 'desktop', `${L} .pr-lightbox__caption`, {
    color: a.lightboxCaptionColor,
    background: `linear-gradient(transparent, ${clean(a.lightboxCaptionBackgroundColor)})`,
    'min-height': px(a.lightboxCaptionHeight),
  });
  emit(sheet, 'desktop', `${L} .pr-lightbox__count`, {
    top: px(a.lightboxEdgeDistance),
    left: px(a.lightboxEdgeDistance),
    color: a.lightboxIconColor,
    'font-size':
      numeric(a.lightboxIconSize) !== null ? `${(numeric(a.lightboxIconSize)! * 3) / 4}px` : '',
  });
  emit(sheet, 'desktop', `${L} .pr-lightbox__close`, {
    top: px(a.lightboxEdgeDistance),
    right: px(a.lightboxEdgeDistance),
  });
  emit(sheet, 'desktop', `${L} .pr-lightbox__close svg, ${L} .pr-lightbox__nav svg`, {
    width: px(a.lightboxIconSize),
    height: px(a.lightboxIconSize),
    fill: a.lightboxIconColor,
  });
  emit(sheet, 'desktop', `${L} .pr-lightbox__nav--prev`, { left: px(a.lightboxEdgeDistance) });
  emit(sheet, 'desktop', `${L} .pr-lightbox__nav--next`, { right: px(a.lightboxEdgeDistance) });
}

/** Chevrons drawn for Prisma. */
const Chevron = ({ left }: { left?: boolean }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d={
        left
          ? 'M13.5 3 6.5 10l7 7 1.4-1.4L9.3 10l5.6-5.6z'
          : 'M6.5 3l7 7-7 7-1.4-1.4L10.7 10 5.1 4.4z'
      }
    />
  </svg>
);

function View({ attrs: a, id, root, editing }: ViewProps) {
  const list = images(a);
  const layout = ['grid', 'masonry', 'carousel', 'tiled'].includes(String(a.feedLayout))
    ? String(a.feedLayout)
    : 'grid';
  const captions = Boolean(a.imageDisplayCaption);
  const type = ['overlay', 'bar-inside', 'bar-outside'].includes(String(a.captionDisplayType))
    ? String(a.captionDisplayType)
    : 'overlay';
  const outside = captions && type === 'bar-outside';
  const above = String(a.imageCaptionAlignment ?? '').startsWith('top');
  const cols = (d: Device) =>
    Math.min(Math.max(Math.round(numeric(a[`columns${DEV(d)}`]) ?? 1), 1), 8);
  const focus = (
    a.focusListObject && typeof a.focusListObject === 'object' ? a.focusListObject : {}
  ) as Record<string, unknown>;
  const paged = Boolean(a.feedPagination) && (layout === 'grid' || layout === 'masonry');
  const limit = Math.max(1, Math.round(numeric(a.paginateLimit) ?? 9));
  const pages = paged ? Math.max(1, Math.ceil(list.length / limit)) : 1;
  const caption = (m: GalleryImage) => {
    const text =
      typeof m.caption === 'string' && m.caption.trim()
        ? m.caption
        : String(a.imageDefaultCaption ?? '');
    // Captions are the site's own text: tags dropped.
    return text.replace(/<[^>]*>/g, '');
  };
  const items = list.map((m, i) => {
    const capText = caption(m);
    const bar = (
      <div className="pr-gallery__outside">
        <div className="pr-gallery__caption pr-gallery__caption--bar-outside">{capText}</div>
      </div>
    );
    return (
      <div
        key={`${String(m.id ?? i)}-${i}`}
        className={[
          'pr-gallery__item',
          layout === 'tiled' && focus[String(m.id)] ? 'pr-gallery__item--focus' : '',
          paged && i >= limit ? 'pr-gallery__item--later' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-index={i}
        data-page={paged ? Math.floor(i / limit) + 1 : undefined}
        tabIndex={layout === 'carousel' || a.imageClickEvent === 'none' ? undefined : 0}
        {...(a.imageClickEvent === 'image' ? { 'data-href': safe(m.url) } : {})}
      >
        {outside && above && bar}
        <div className={`pr-gallery__media pr-gallery__media--${layout}`}>
          <picture>
            <source media="(min-width: 1024px)" srcSet={sized(m, a.galleryImageSize)} />
            <source media="(min-width: 768px)" srcSet={sized(m, a.galleryImageSizeTablet)} />
            <img
              className="pr-gallery__img"
              src={sized(m, a.galleryImageSizeMobile)}
              alt={typeof m.alt === 'string' ? m.alt : ''}
              {...(a.disableLazyLoad || editing ? {} : { loading: 'lazy' as const })}
              decoding="async"
            />
          </picture>
          <div className="pr-gallery__blurrer" />
          {captions && type !== 'bar-outside' ? (
            <div className={`pr-gallery__overlay pr-gallery__overlay--${type}`}>
              <div className={`pr-gallery__caption pr-gallery__caption--${type}`}>{capText}</div>
            </div>
          ) : !captions ? (
            <div className="pr-gallery__overlay pr-gallery__overlay--overlay" />
          ) : null}
        </div>
        {outside && !above && bar}
      </div>
    );
  });
  const config = {
    layout,
    click: String(a.imageClickEvent ?? 'none'),
    columns: [cols('desktop'), cols('tablet'), cols('mobile')],
    loop: a.carouselLoop !== false,
    autoplay: a.carouselAutoplay ? Math.max(500, numeric(a.carouselAutoplaySpeed) ?? 2000) : 0,
    pauseOnHover: a.carouselPauseOnHover !== false,
    speed: numeric(a.carouselTransitionSpeed) ?? 500,
    start: numeric(a.carouselStartAt) ?? 0,
    arrows: a.paginateUseArrows !== false,
    dots: a.paginateUseDots !== false,
    paged,
    pages,
    loader: a.paginateUseLoader !== false,
  };
  const lightbox = a.imageClickEvent === 'lightbox' && !editing && list.length > 0;
  return (
    <>
      {root(
        'div',
        { className: `wp-block-prisma-gallery pr-gallery-block ${blockClass(id)}` },
        list.length === 0 ? (
          editing ? (
            <p className="pr-gallery__empty">Add images in the block settings.</p>
          ) : null
        ) : (
          <>
            <div
              className={`pr-gallery pr-gallery--${layout} pr-gallery--col-${cols('desktop')} pr-gallery--col-tab-${cols('tablet')} pr-gallery--col-mob-${cols('mobile')}`}
              data-pr-gallery={JSON.stringify(config)}
            >
              {layout === 'carousel' ? (
                <div className="pr-gallery__viewport">
                  <div className="pr-gallery__track">{items}</div>
                </div>
              ) : (
                items
              )}
              {layout === 'tiled' && <div className="pr-gallery__sizer" />}
            </div>
            {paged && layout === 'grid' && pages > 1 && (
              <div className="pr-gallery__pager">
                <button
                  type="button"
                  className="pr-gallery__arrow pr-gallery__arrow--pager"
                  data-direction="prev"
                  aria-label="Previous page"
                  disabled
                >
                  <Chevron left />
                </button>
                <ul className="pr-gallery__dots">
                  {Array.from({ length: pages }, (_, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className={`pr-gallery__dot${i === 0 ? ' is-active' : ''}`}
                        data-go-to={i + 1}
                        aria-label={`Page ${i + 1}`}
                      />
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="pr-gallery__arrow pr-gallery__arrow--pager"
                  data-direction="next"
                  aria-label="Next page"
                >
                  <Chevron />
                </button>
              </div>
            )}
            {paged && layout === 'masonry' && pages > 1 && (
              <div className="pr-gallery__pager wp-block-button">
                {a.paginateUseLoader !== false ? (
                  <div className="pr-gallery__loader" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                ) : (
                  <button type="button" className="pr-gallery__more wp-block-button__link">
                    {String(a.paginateButtonText ?? 'Load More Images')}
                  </button>
                )}
              </div>
            )}
          </>
        ),
      )}
      {lightbox && (
        <div
          className="pr-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Images"
          tabIndex={-1}
          hidden
        >
          <div className="pr-lightbox__stage">
            {list.map((m, i) => (
              <figure key={i} className="pr-lightbox__slide" data-index={i} hidden>
                <img data-src={safe(m.url)} alt={typeof m.alt === 'string' ? m.alt : ''} />
                {a.lightboxDisplayCaptions ? (
                  <figcaption className="pr-lightbox__caption">{caption(m)}</figcaption>
                ) : null}
              </figure>
            ))}
          </div>
          <button
            type="button"
            className="pr-lightbox__nav pr-lightbox__nav--prev"
            aria-label="Previous"
          >
            <Chevron left />
          </button>
          <button
            type="button"
            className="pr-lightbox__nav pr-lightbox__nav--next"
            aria-label="Next"
          >
            <Chevron />
          </button>
          {a.lightboxThumbnails ? (
            <div className="pr-lightbox__thumbs">
              {list.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  className="pr-lightbox__thumb"
                  data-index={i}
                  aria-label={`Image ${i + 1}`}
                >
                  <img src={sized(m, 'thumbnail')} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
          {a.lightboxDisplayCount ? (
            <div className="pr-lightbox__count">
              <span className="pr-lightbox__page">1</span>/<span>{list.length}</span>
            </div>
          ) : null}
          {a.lightboxCloseIcon ? (
            <button type="button" className="pr-lightbox__close" aria-label="Close">
              <Icon name={a.lightboxCloseIcon} />
            </button>
          ) : null}
        </div>
      )}
    </>
  );
}

export const gallery: PrismaBlock = {
  name: 'gallery',
  title: 'Image Gallery',
  description: 'Images in a grid, a masonry, a carousel or tiles, with captions and a lightbox.',
  script: { file: 'gallery.js', marker: 'data-pr-gallery' },
  keywords: ['gallery', 'images', 'carousel', 'slider', 'masonry', 'lightbox'],
  defaults: DEFAULTS,
  css,
  View,
  media: (a) =>
    images(a)
      .map((m) => (typeof m.id === 'string' ? m.id : null))
      .filter((m): m is string => m !== null),
};
