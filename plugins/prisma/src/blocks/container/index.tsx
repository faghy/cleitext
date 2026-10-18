import type { Device, Sheet } from '@cleitext/design';
import { background, mediaUrl, overlay, rgba } from '../../lib/background';
import { blockClass } from '../../lib/css';
import { border, borderDefaults, clean, DEVICES, emit, numeric, px, suffix } from '../../lib/emit';
import type { Globals } from '../../lib/globals';
import { ShapeSvg } from '../../lib/shapes';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { legacySpectra } from './legacy';

const D = (device: Device) =>
  device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile';

/** One column or row of a grid layout, as saved: `{ default, min, max, custom }`. */
const GRID_TRACK = [
  {
    default: 'custom',
    min: { unit: 'px', value: 10 },
    max: { unit: 'fr', value: 1 },
    custom: { unit: 'fr', value: 1 },
  },
];

function perDevice(
  base: string,
  desktop: unknown,
  tablet: unknown = '',
  mobile: unknown = '',
): Attrs {
  return { [`${base}Desktop`]: desktop, [`${base}Tablet`]: tablet, [`${base}Mobile`]: mobile };
}

/**
 * Defaults. Padding, gaps and the content width are left out: missing,
 * they are the site's (Settings → Prisma), as containers left at default.
 */
const DEFAULTS: Attrs = {
  htmlTag: 'div',
  htmlTagLink: { url: '', opensInNewTab: false, noFollow: false },
  isBlockRootParent: false,
  layout: '',
  contentWidth: 'alignfull',
  innerContentWidth: 'alignwide',
  innerContentCustomWidthTablet: 1024,
  innerContentCustomWidthMobile: 767,
  innerContentCustomWidthType: 'px',
  innerContentCustomWidthTypeTablet: 'px',
  innerContentCustomWidthTypeMobile: 'px',
  ...perDevice('width', 100, '', 100),
  widthType: '%',
  widthTypeTablet: '%',
  widthTypeMobile: '%',
  ...perDevice('minHeight', ''),
  minHeightType: 'px',
  minHeightTypeTablet: 'px',
  minHeightTypeMobile: 'px',
  ...perDevice('direction', 'column'),
  ...perDevice('alignItems', 'center'),
  ...perDevice('justifyContent', 'center'),
  ...perDevice('wrap', 'nowrap', '', 'wrap'),
  ...perDevice('alignContent', ''),
  ...perDevice('childrenWidth', ''),
  ...perDevice('gridColumn', GRID_TRACK, GRID_TRACK, GRID_TRACK),
  ...perDevice('gridRow', GRID_TRACK, GRID_TRACK, GRID_TRACK),
  ...perDevice('gridAlignItems', 'stretch', 'stretch', 'stretch'),
  ...perDevice('gridJustifyItems', 'stretch', 'stretch', 'stretch'),
  ...perDevice('gridAlignContent', 'stretch', 'stretch', 'stretch'),
  ...perDevice('gridJustifyContent', 'stretch', 'stretch', 'stretch'),
  topPaddingTablet: '',
  bottomPaddingTablet: '',
  leftPaddingTablet: '',
  rightPaddingTablet: '',
  topPaddingMobile: '',
  bottomPaddingMobile: '',
  leftPaddingMobile: '',
  rightPaddingMobile: '',
  paddingType: 'px',
  paddingTypeTablet: 'px',
  paddingTypeMobile: 'px',
  paddingLink: true,
  ...Object.fromEntries(
    ['top', 'bottom', 'left', 'right'].flatMap((s) =>
      ['Desktop', 'Tablet', 'Mobile'].map((d) => [`${s}Margin${d}`, '']),
    ),
  ),
  marginType: 'px',
  marginTypeTablet: 'px',
  marginTypeMobile: 'px',
  marginLink: true,
  rowGapTablet: '',
  rowGapMobile: '',
  columnGapTablet: '',
  columnGapMobile: '',
  rowGapType: 'px',
  rowGapTypeTablet: 'px',
  rowGapTypeMobile: 'px',
  columnGapType: 'px',
  columnGapTypeTablet: 'px',
  columnGapTypeMobile: 'px',
  backgroundType: 'none',
  backgroundColor: '',
  ...perDevice('backgroundImage', ''),
  ...perDevice('backgroundPosition', { x: 0.5, y: 0.5 }),
  ...perDevice('backgroundSize', 'cover'),
  ...perDevice('backgroundCustomSize', 100),
  backgroundCustomSizeType: '%',
  ...perDevice('backgroundRepeat', 'no-repeat'),
  ...perDevice('backgroundAttachment', 'scroll'),
  customPosition: 'default',
  centralizedPosition: false,
  ...perDevice('xPosition', ''),
  ...perDevice('yPosition', ''),
  xPositionType: 'px',
  yPositionType: 'px',
  gradientValue: 'linear-gradient(90deg, rgba(6, 147, 227, 0.5) 0%, rgba(155, 81, 224, 0.5) 100%)',
  selectGradient: 'basic',
  gradientType: 'linear',
  gradientColor1: '#06558a',
  gradientColor2: '#0063A1',
  gradientLocation1: 0,
  gradientLocationTablet1: '',
  gradientLocationMobile1: '',
  gradientLocation2: 100,
  gradientLocationTablet2: '',
  gradientLocationMobile2: '',
  gradientAngle: 0,
  gradientAngleTablet: '',
  gradientAngleMobile: '',
  backgroundImageColor: '#FFFFFF75',
  backgroundVideo: '',
  backgroundVideoColor: '#FFFFFF75',
  backgroundVideoFallbackImage: '',
  overlayType: 'none',
  overlayOpacity: 1,
  overlayBlendMode: 'normal',
  ...perDevice('backgroundOverlayImage', ''),
  ...perDevice('backgroundPositionOverlay', { x: 0.5, y: 0.5 }),
  ...perDevice('backgroundSizeOverlay', 'cover'),
  ...perDevice('backgroundRepeatOverlay', 'no-repeat'),
  ...perDevice('backgroundAttachmentOverlay', 'scroll'),
  ...perDevice('backgroundCustomSizeOverlay', 100),
  backgroundCustomOverlaySizeType: '%',
  customOverlayPosition: 'default',
  ...perDevice('xPositionOverlay', ''),
  ...perDevice('yPositionOverlay', ''),
  xPositionOverlayType: 'px',
  yPositionOverlayType: 'px',
  topType: 'none',
  topColor: '#333',
  topHeight: '',
  topHeightTablet: '',
  topHeightMobile: '',
  topWidth: 100,
  topFlip: false,
  topInvert: false,
  topContentAboveShape: false,
  bottomType: 'none',
  bottomColor: '#333',
  bottomHeight: '',
  bottomHeightTablet: '',
  bottomHeightMobile: '',
  bottomWidth: 100,
  bottomFlip: false,
  bottomInvert: true,
  bottomContentAboveShape: false,
  ...borderDefaults('container'),
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
  textColor: '',
  linkColor: '',
  linkHoverColor: '',
  overflow: 'visible',
  ...perDevice('order', 'initial', 'initial', 'initial'),
  ...perDevice('customOrder', ''),
  zIndex: '',
  zIndexTablet: '',
  zIndexMobile: '',
};

/** A value of a device, else the larger device's (paddings, margins). */
function fallback(a: Attrs, base: string, device: Device): unknown {
  const set = (v: unknown) => v !== '' && v !== undefined && v !== null;
  const desktop = a[`${base}Desktop`];
  const tablet = set(a[`${base}Tablet`]) ? a[`${base}Tablet`] : desktop;
  if (device === 'desktop') return desktop;
  if (device === 'tablet') return tablet;
  return set(a[`${base}Mobile`]) ? a[`${base}Mobile`] : tablet;
}

/** The container's box shadow (always written; invisible with the defaults). */
function shadow(a: Attrs, hover: boolean): string {
  const h = hover ? 'Hover' : '';
  const parts = [
    a[`boxShadowHOffset${h}`],
    a[`boxShadowVOffset${h}`],
    a[`boxShadowBlur${h}`],
    a[`boxShadowSpread${h}`],
  ]
    .map((v) => px(v))
    .filter(Boolean);
  const color = clean(a[`boxShadowColor${h}`]);
  if (!color || parts.length === 0) return '';
  return `${parts.join(' ')} ${color}${a[`boxShadowPosition${h}`] === 'inset' ? ' inset' : ''}`;
}

/** The order on a device (`custom` → the number; `initial` → the larger device's). */
function order(a: Attrs, device: Device): unknown {
  const keyword = (d: string) => a[`order${d}`];
  const resolve = (d: string, larger: unknown): unknown =>
    keyword(d) !== 'initial' && keyword(d) !== '' && keyword(d) !== undefined ? keyword(d) : larger;
  const desktop = keyword('Desktop');
  const tablet = resolve('Tablet', desktop);
  const value =
    device === 'desktop' ? desktop : device === 'tablet' ? tablet : resolve('Mobile', tablet);
  if (value !== 'custom') return value;
  const custom = fallback(a, 'customOrder', device);
  return numeric(custom) === null ? '' : custom;
}

/** Grid tracks: `{ default: custom|minmax|auto }` items. */
function tracks(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map(
      (t: {
        default?: string;
        min?: { value?: unknown; unit?: unknown };
        max?: { value?: unknown; unit?: unknown };
        custom?: { value?: unknown; unit?: unknown };
      }) => {
        if (t.default === 'custom') {
          const v = px(t.custom?.value, t.custom?.unit);
          return v ? `minmax(1px, ${v})` : '';
        }
        if (t.default === 'minmax') {
          const min = px(t.min?.value, t.min?.unit);
          const max = px(t.max?.value, t.max?.unit);
          return min && max ? `minmax(${min}, ${max})` : '';
        }
        return t.default === 'auto' ? 'auto' : '';
      },
    )
    .filter(Boolean)
    .join(' ');
}

function flex(a: Attrs, device: Device) {
  return {
    'flex-direction': a[`direction${D(device)}`],
    'align-items': a[`alignItems${D(device)}`],
    'justify-content': a[`justifyContent${D(device)}`],
    'flex-wrap': a[`wrap${D(device)}`],
    'align-content': a[`alignContent${D(device)}`],
  };
}

function gaps(a: Attrs, g: Globals, device: Device) {
  const row = device === 'desktop' ? (a.rowGapDesktop ?? g.elementsGap) : a[`rowGap${D(device)}`];
  const column =
    device === 'desktop' ? (a.columnGapDesktop ?? g.elementsGap) : a[`columnGap${D(device)}`];
  return {
    'row-gap': px(row, device === 'desktop' ? a.rowGapType : a[`rowGapType${D(device)}`]),
    'column-gap': px(
      column,
      device === 'desktop' ? a.columnGapType : a[`columnGapType${D(device)}`],
    ),
  };
}

function css(input: Attrs, B: string, sheet: Sheet, g: Globals): void {
  // Left at default, padding and content width are the site's.
  const a: Attrs = {
    ...input,
    topPaddingDesktop: input.topPaddingDesktop ?? g.containerPadding,
    bottomPaddingDesktop: input.bottomPaddingDesktop ?? g.containerPadding,
    leftPaddingDesktop: input.leftPaddingDesktop ?? g.containerPadding,
    rightPaddingDesktop: input.rightPaddingDesktop ?? g.containerPadding,
    innerContentCustomWidthDesktop: input.innerContentCustomWidthDesktop ?? g.contentWidth,
  };
  const root = Boolean(a.isBlockRootParent);
  const isGrid = a.layout === 'grid';
  const hasWrap = a.contentWidth === 'alignfull' && a.innerContentWidth === 'alignwide';
  const flexOnSelf = !(root && hasWrap);
  const isVideo = a.backgroundType === 'video';
  const boxed = root && a.contentWidth === 'default';
  const self = `${B}.pr-container`;
  const wrap = `.pr-container.pr-is-root.alignfull${B} > .pr-container__inner`;

  // Colors and links.
  emit(sheet, 'desktop', `${self}, ${self} *`, { color: a.textColor });
  emit(sheet, 'desktop', `${B} a`, { color: a.linkColor });
  emit(sheet, 'desktop', `${B} a:hover`, { color: a.linkHoverColor });

  for (const device of DEVICES) {
    const s = suffix(device);
    // Shape dividers.
    for (const side of ['top', 'bottom'] as const) {
      if (a[`${side}Type`] === 'none') continue;
      emit(sheet, device, `${B} .pr-container__shape-${side} svg`, {
        height: px(a[`${side}Height${s}`]),
        ...(device === 'desktop' && numeric(a[`${side}Width`]) !== null
          ? { width: `calc(${numeric(a[`${side}Width`])}% + 1.3px)` }
          : {}),
      });
      if (device === 'desktop') {
        emit(sheet, device, `${B} .pr-container__shape-${side} .pr-container__shape-fill`, {
          fill: rgba(a[`${side}Color`], a[`${side}DividerOpacity`] ?? 100),
        });
      }
    }
    // Width of nested containers.
    emit(sheet, device, `.pr-container.pr-is-root ${B}`, {
      'max-width': px(
        a[`width${D(device)}`],
        device === 'desktop' ? a.widthType : a[`widthType${s}`],
      ),
      width: '100%',
    });
    // The boxed content of a full-width root.
    if (hasWrap) {
      const inner = fallback(a, 'innerContentCustomWidth', device);
      const width = px(
        inner,
        device === 'desktop' ? a.innerContentCustomWidthType : a[`innerContentCustomWidthType${s}`],
      );
      emit(sheet, device, wrap, {
        '--inner-content-custom-width': width ? `min(100%, ${width})` : '',
        'max-width': 'var(--inner-content-custom-width)',
        width: '100%',
        ...(isGrid ? {} : { ...flex(a, device), ...gaps(a, g, device) }),
      });
    }
    // Grid layout.
    if (isGrid) {
      emit(
        sheet,
        device,
        root && hasWrap ? `${B}.pr-layout-grid > .pr-container__inner` : `${B}.pr-layout-grid`,
        {
          ...gaps(a, g, device),
          'grid-template-columns': tracks(a[`gridColumn${D(device)}`]),
          'grid-template-rows': tracks(a[`gridRow${D(device)}`]),
          'align-items': a[`gridAlignItems${D(device)}`],
          'justify-items': a[`gridJustifyItems${D(device)}`],
          'align-content': a[`gridAlignContent${D(device)}`],
          'justify-content': a[`gridJustifyContent${D(device)}`],
        },
      );
    }
    // The container itself.
    const unit = device === 'desktop' ? a.paddingType : a[`paddingType${s}`];
    const mUnit = device === 'desktop' ? a.marginType : a[`marginType${s}`];
    const spacing = {
      'min-height': px(
        a[`minHeight${D(device)}`],
        device === 'desktop' ? a.minHeightType : a[`minHeightType${s}`],
      ),
      ...(device === 'desktop' ? { 'box-shadow': shadow(a, false) } : {}),
      'padding-top': px(fallback(a, 'topPadding', device), unit),
      'padding-bottom': px(fallback(a, 'bottomPadding', device), unit),
      'padding-left': px(fallback(a, 'leftPadding', device), unit),
      'padding-right': px(fallback(a, 'rightPadding', device), unit),
      'margin-top': important(px(fallback(a, 'topMargin', device), mUnit)),
      'margin-bottom': important(px(fallback(a, 'bottomMargin', device), mUnit)),
      'margin-left': px(fallback(a, 'leftMargin', device), mUnit),
      'margin-right': px(fallback(a, 'rightMargin', device), mUnit),
    };
    const boxedWidth = boxed
      ? {
          'max-width': important(
            px(a[`width${D(device)}`], device === 'desktop' ? a.widthType : a[`widthType${s}`]),
          ),
          ...(a[`leftMargin${D(device)}`] !== ''
            ? { 'margin-left': important(px(a[`leftMargin${D(device)}`], mUnit)) }
            : {}),
          ...(a[`rightMargin${D(device)}`] !== ''
            ? { 'margin-right': important(px(a[`rightMargin${D(device)}`], mUnit)) }
            : {}),
        }
      : {};
    if (isVideo) {
      const borderCss = border(a, 'container', device);
      emit(sheet, device, `${B} .pr-container__video`, {
        ...(device === 'desktop' ? background(a, device) : {}),
        ...borderCss,
        ...(device === 'desktop' && !borderCss['border-color']
          ? { 'border-color': 'inherit' }
          : {}),
      });
      emit(sheet, device, self, { ...flex(a, device), ...(isGrid ? {} : gaps(a, g, device)) });
      emit(sheet, device, `${self}${B}`, {
        ...spacing,
        ...gaps(a, g, device),
        ...(device === 'desktop' ? { overflow: a.overflow } : {}),
        ...boxedWidth,
      });
      if (device === 'desktop')
        emit(sheet, device, `${B} > div:not(.pr-container__video):not(.pr-container__shape)`, {
          position: 'relative',
        });
    } else {
      const borderCss = border(a, 'container', device);
      emit(sheet, device, self, {
        ...spacing,
        ...(device === 'desktop' ? { overflow: a.overflow } : {}),
        order: order(a, device),
        ...borderCss,
        ...(device === 'desktop' && !borderCss['border-color']
          ? { 'border-color': 'inherit' }
          : {}),
        ...background(a, device),
        ...(flexOnSelf && !isGrid ? flex(a, device) : {}),
        ...(isGrid ? {} : gaps(a, g, device)),
        ...boxedWidth,
      });
    }
    // The overlay over the background.
    const over = overlay(a, device);
    if (a.overlayType !== 'none' && Object.values(over).some((v) => v !== '' && v !== undefined)) {
      // The overlay covers the border too: its width on this device, else the larger device's.
      const w = (side: string) => {
        const base = `containerBorder${side}Width`;
        const desktop = numeric(a[base]);
        const tablet = numeric(a[`${base}Tablet`]) ?? desktop;
        const value =
          device === 'desktop'
            ? desktop
            : device === 'tablet'
              ? tablet
              : (numeric(a[`${base}Mobile`]) ?? tablet);
        return value ?? 0;
      };
      const [t, l, r, b] = [w('Top'), w('Left'), w('Right'), w('Bottom')];
      emit(sheet, device, `${B}::before`, {
        ...(device === 'desktop'
          ? { content: '""', position: 'absolute', 'pointer-events': 'none' }
          : {}),
        top: `-${t}px`,
        left: `-${l}px`,
        width: `calc(100% + ${l + r}px)`,
        height: `calc(100% + ${t + b}px)`,
        ...border(a, 'container', device),
        ...over,
      });
    }
    // Width of the children (rows: auto, or full).
    const direction = a[`direction${D(device)}`];
    const childWidth = a[`childrenWidth${D(device)}`];
    if (direction && (device === 'desktop' ? childWidth === 'auto' : childWidth)) {
      emit(
        sheet,
        device,
        `${self} > :not(.pr-container__inner):not(.pr-container__shape):not(.pr-container__video):not(.pr-container__link), ${self} > .pr-container__inner > *`,
        {
          width: childWidth === 'auto' ? 'auto !important' : '100%',
        },
      );
    }
  }
  // Hover states and z-index.
  if (!isVideo) {
    emit(sheet, 'desktop', `${self}${B}:hover`, { 'border-color': a.containerBorderHColor });
  } else {
    emit(sheet, 'desktop', `${self}:hover .pr-container__video`, {
      'border-color': a.containerBorderHColor,
    });
  }
  if (numeric(a.boxShadowBlurHover) !== null || clean(a.boxShadowColorHover)) {
    emit(sheet, 'desktop', `${B}:hover`, {
      'box-shadow': shadow(
        { ...a, boxShadowColorHover: a.boxShadowColorHover || a.boxShadowColor },
        true,
      ),
    });
  }
  if (a.overlayType !== 'none')
    emit(sheet, 'desktop', `${B}:hover::before`, { 'border-color': a.containerBorderHColor });
  emit(sheet, 'desktop', `${self}.pr-z-index`, {
    '--z-index-desktop': numeric(a.zIndex) ?? '',
    '--z-index-tablet': numeric(a.zIndexTablet) ?? numeric(a.zIndex) ?? '',
    '--z-index-mobile':
      numeric(a.zIndexMobile) ?? numeric(a.zIndexTablet) ?? numeric(a.zIndex) ?? '',
  });
  if (mediaUrl(a.backgroundVideoFallbackImage)) {
    emit(sheet, 'desktop', `${B} .pr-container__video video`, {
      background: `url("${mediaUrl(a.backgroundVideoFallbackImage)}") 50% 50%`,
      'background-size': 'cover',
    });
  }
}

/** `!important` on a value, nothing on no value. */
const important = (value: string) => (value ? `${value} !important` : '');

const TAGS = new Set([
  'div',
  'header',
  'footer',
  'main',
  'article',
  'section',
  'aside',
  'nav',
  'a',
]);

function View({ attrs: a, id, root, inner, editing }: ViewProps) {
  const isRoot = Boolean(a.isBlockRootParent);
  const hasWrap = isRoot && a.contentWidth === 'alignfull' && a.innerContentWidth === 'alignwide';
  const tag = TAGS.has(String(a.htmlTag)) ? String(a.htmlTag) : 'div';
  const link = a.htmlTagLink as
    { url?: unknown; opensInNewTab?: boolean; noFollow?: boolean } | undefined;
  const href =
    typeof link?.url === 'string' && /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(link.url)
      ? link.url
      : '';
  const shape = (side: 'top' | 'bottom') =>
    a[`${side}Type`] && a[`${side}Type`] !== 'none' ? (
      <div
        className={[
          'pr-container__shape',
          `pr-container__shape-${side}`,
          a[`${side}Flip`] ? 'pr-container__shape-flip' : '',
          a[`${side}ContentAboveShape`] ? '' : 'pr-container__shape-above',
          a[`${side}Invert`] ? 'pr-container__invert' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <ShapeSvg type={String(a[`${side}Type`])} />
      </div>
    ) : null;
  const video = mediaUrl(a.backgroundVideo);
  const zIndex = [a.zIndex, a.zIndexTablet, a.zIndexMobile].some((z) => numeric(z));
  const className = [
    'wp-block-prisma-container',
    'pr-container',
    a.layout === 'flex' || a.layout === 'grid' ? `pr-layout-${String(a.layout)}` : '',
    zIndex ? 'pr-z-index' : '',
    blockClass(id),
    isRoot
      ? `${['alignfull', 'alignwide', 'default'].includes(String(a.contentWidth)) ? String(a.contentWidth) : 'alignfull'} pr-is-root`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  return root(
    tag === 'a' ? 'div' : tag,
    { className },
    <>
      {a.backgroundType === 'video' && (
        <div className="pr-container__video">
          {video && (
            <video autoPlay loop muted playsInline>
              <source src={video} type="video/mp4" />
            </video>
          )}
        </div>
      )}
      {shape('top')}
      {shape('bottom')}
      {hasWrap && inner({ className: 'pr-container__inner' })}
      {tag === 'a' && href && !editing && (
        <a
          className="pr-container__link"
          href={href}
          {...(link?.opensInNewTab ? { target: '_blank' } : {})}
          rel={link?.noFollow ? 'nofollow noopener' : 'noopener'}
          aria-label="Link"
        >
          {' '}
        </a>
      )}
    </>,
    !hasWrap,
  );
}

export const container: PrismaBlock = {
  name: 'container',
  title: 'Container',
  description:
    'Lay out blocks in a row, a column or a grid, with backgrounds, overlays and shape dividers.',
  keywords: ['container', 'section', 'row', 'column', 'grid', 'flex', 'layout'],
  container: true,
  defaults: DEFAULTS,
  css,
  View,
  media: (a) =>
    [
      a.backgroundImageDesktop,
      a.backgroundImageTablet,
      a.backgroundImageMobile,
      a.backgroundOverlayImageDesktop,
    ]
      .map((m) => (m && typeof m === 'object' ? (m as { id?: unknown }).id : null))
      .filter((m): m is string => typeof m === 'string'),
  spectra: legacySpectra,
};
