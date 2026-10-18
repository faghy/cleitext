import type { CxdBlock } from '@cleitext/plugin-sdk';
import { rgba } from '../../lib/background';
import { numeric } from '../../lib/emit';
import type { Attrs, SpectraImporter } from '../../lib/types';

/**
 * Spectra's deprecated layout blocks (Advanced Row, Advanced Columns and
 * their Column) become containers on WordPress import. Their attributes
 * are rewritten into the container's, so the page keeps its look: the row
 * is a flex row of child containers, each column's width a percentage.
 *
 * Saved attributes leave out their defaults, so each block's defaults are
 * added first. Parents fix up their children after these were converted:
 * the outermost block is the root, and the columns pass their gap,
 * stacking and vertical alignment down to their columns.
 */

const SECTION_DEFAULTS: Attrs = {
  topPadding: 20,
  bottomPadding: 20,
  leftPadding: 20,
  rightPadding: 20,
  topMargin: 0,
  bottomMargin: 0,
  leftMargin: 0,
  rightMargin: 0,
  contentWidth: 'boxed',
  width: 900,
  innerWidth: 1140,
  innerWidthType: 'px',
  themeWidth: false,
  align: 'center',
  tag: 'section',
  overlayType: 'color',
};

const COLUMNS_DEFAULTS: Attrs = {
  columns: 2,
  stack: 'mobile',
  columnGap: '10',
  topPadding: 20,
  bottomPadding: 20,
  leftPadding: 20,
  rightPadding: 20,
  topMargin: 0,
  bottomMargin: 0,
  contentWidth: 'theme',
  width: 900,
  widthType: 'px',
  tag: 'section',
  overlayType: 'color',
  topColor: '#333',
  bottomColor: '#333',
};

const COLUMN_DEFAULTS: Attrs = { overlayType: 'color' };

/** Attributes of the old blocks with no container equivalent of the same name. */
const LEGACY = new Set([
  ...Object.keys(SECTION_DEFAULTS),
  ...Object.keys(COLUMNS_DEFAULTS),
  'backgroundType',
  'backgroundImage',
  'backgroundPosition',
  'backgroundSize',
  'backgroundRepeat',
  'backgroundAttachment',
  'backgroundVideo',
  'backgroundVideoColor',
  'backgroundVideoOpacity',
  'backgroundOpacity',
  'backgroundColor',
  'backgroundImageColor',
  'gradientColor1',
  'gradientColor2',
  'gradientType',
  'gradientLocation1',
  'gradientLocation2',
  'gradientAngle',
  'gradientPosition',
  'gradientValue',
  'selectGradient',
  'gradientOverlayColor1',
  'gradientOverlayColor2',
  'gradientOverlayType',
  'gradientOverlayLocation1',
  'gradientOverlayLocation2',
  'gradientOverlayAngle',
  'gradientOverlayPosition',
  'borderStyle',
  'borderWidth',
  'borderRadius',
  'borderColor',
  'borderHoverColor',
  'vAlign',
  'reverseTablet',
  'reverseMobile',
  'colWidth',
  'colWidthTablet',
  'colWidthMobile',
  'alignTablet',
  'alignMobile',
  'minHeight',
  'minHeightType',
  'paddingLink',
  'marginLink',
  'desktopPaddingType',
  'tabletPaddingType',
  'mobilePaddingType',
  'desktopMarginType',
  'tabletMarginType',
  'mobileMarginType',
]);

const isLegacy = (key: string) =>
  LEGACY.has(key) ||
  /^(overall|columns|column)Border/.test(key) ||
  /^(top|bottom|left|right)(Padding|Margin)(Tablet|Mobile|Desktop)?$/.test(key) ||
  /^(top|bottom)(Type|Color|Height|HeightTablet|HeightMobile|Width|Flip|DividerOpacity|ContentAboveShape)$/.test(
    key,
  );

/** What the old block saved that the container reads as it is (anchor, classes, visibility…). */
function kept(a: Attrs): Attrs {
  return Object.fromEntries(Object.entries(a).filter(([key]) => !isLegacy(key)));
}

const set = (v: unknown) => v !== '' && v !== undefined && v !== null;

/** Only the values that are set. */
function only(values: Attrs): Attrs {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => set(v)));
}

/** Children laid out as in a block flow: stacked, full width, from the top, no gaps. */
const FLOW: Attrs = {
  directionDesktop: 'column',
  alignItemsDesktop: 'stretch',
  justifyContentDesktop: 'flex-start',
  wrapDesktop: 'nowrap',
  wrapTablet: 'nowrap',
  wrapMobile: 'nowrap',
  rowGapDesktop: 0,
  columnGapDesktop: 0,
};

/** Paddings and margins: `topPadding`, `topPaddingTablet`, `desktopPaddingType`… → container names. */
function spacing(a: Attrs, margins: Array<'top' | 'bottom' | 'left' | 'right'>): Attrs {
  const out: Attrs = {};
  for (const side of ['top', 'bottom', 'left', 'right']) {
    out[`${side}PaddingDesktop`] = a[`${side}Padding`];
    out[`${side}PaddingTablet`] = a[`${side}PaddingTablet`];
    out[`${side}PaddingMobile`] = a[`${side}PaddingMobile`];
  }
  for (const side of margins) {
    // Newer saves of the columns keep `…MarginDesktop`.
    out[`${side}MarginDesktop`] = a[`${side}MarginDesktop`] ?? a[`${side}Margin`];
    out[`${side}MarginTablet`] = a[`${side}MarginTablet`];
    out[`${side}MarginMobile`] = a[`${side}MarginMobile`];
  }
  return only({
    ...out,
    paddingType: a.desktopPaddingType,
    paddingTypeTablet: a.tabletPaddingType,
    paddingTypeMobile: a.mobilePaddingType,
    marginType: a.desktopMarginType,
    marginTypeTablet: a.tabletMarginType,
    marginTypeMobile: a.mobileMarginType,
  });
}

/** The border (`overallBorder…`, `columnsBorder…`), else the older single border attributes. */
function border(a: Attrs, p: string): Attrs {
  const out: Attrs = {};
  const style = set(a[`${p}BorderStyle`]) ? a[`${p}BorderStyle`] : (a.borderStyle ?? 'none');
  out.containerBorderStyle = style;
  const old = (value: unknown) => (numeric(value) !== null ? value : '');
  for (const s of ['', 'Tablet', 'Mobile']) {
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const v = a[`${p}Border${side}Width${s}`];
      out[`containerBorder${side}Width${s}`] =
        set(v) || s ? v : style !== 'none' ? old(a.borderWidth ?? 1) : '';
    }
    for (const corner of ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft']) {
      const v = a[`${p}Border${corner}Radius${s}`];
      out[`containerBorder${corner}Radius${s}`] = set(v) || s ? v : old(a.borderRadius);
    }
    out[`containerBorderRadiusUnit${s}`] = a[`${p}BorderRadiusUnit${s}`];
  }
  out.containerBorderColor = set(a[`${p}BorderColor`]) ? a[`${p}BorderColor`] : a.borderColor;
  out.containerBorderHColor = set(a[`${p}BorderHColor`])
    ? a[`${p}BorderHColor`]
    : a.borderHoverColor;
  return only(out);
}

/** `center-center`, `left top`… → `{ x, y }` fractions. */
export function position(value: unknown): { x: number; y: number } {
  const words = String(value ?? '').split(/[\s-]+/);
  const x = words.includes('left') ? 0 : words.includes('right') ? 1 : 0.5;
  const y = words.includes('top') ? 0 : words.includes('bottom') ? 1 : 0.5;
  return { x, y };
}

/**
 * The opacity of the old overlay layer (0–100), or null when it is opaque:
 * unset and 101 mean opaque; 0 does too, except on columns (`zero`).
 */
function opacity(a: Attrs, zero: boolean): number | null {
  const v = numeric(a.backgroundOpacity);
  if (v === null || v === 101 || (v === 0 && !zero)) return null;
  return v;
}

const hex = (color: unknown) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(color ?? ''));

/** The gradient: the saved one (`basic`), else built from two colors (`advanced`). */
function gradient(a: Attrs, prefix: 'gradient' | 'gradientOverlay'): Attrs {
  if (prefix === 'gradient' && a.selectGradient !== 'advanced' && set(a.gradientValue))
    return { selectGradient: 'basic', gradientValue: a.gradientValue };
  if (prefix === 'gradientOverlay' && set(a.gradientValue))
    return { selectGradient: 'basic', gradientValue: a.gradientValue };
  // Older saves have only the two colors.
  return {
    selectGradient: 'advanced',
    gradientType: a[`${prefix}Type`] === 'radial' ? 'radial' : 'linear',
    gradientColor1: a[`${prefix}Color1`] ?? '',
    gradientColor2: a[`${prefix}Color2`] ?? '',
    gradientLocation1: numeric(a[`${prefix}Location1`]) ?? 0,
    gradientLocation2: numeric(a[`${prefix}Location2`]) ?? 100,
    gradientAngle: numeric(a[`${prefix}Angle`]) ?? 0,
  };
}

/**
 * The background. The old blocks paint their color or gradient on a layer
 * with an opacity: a hex color takes it as rgba; otherwise the layer
 * becomes the container's overlay (over an image background with no image).
 */
function backgroundOf(a: Attrs, zero: boolean): Attrs {
  const op = opacity(a, zero);
  const layer = (overlay: Attrs): Attrs => ({
    backgroundType: 'image',
    backgroundImageDesktop: '',
    ...overlay,
    overlayOpacity: (op ?? 100) / 100,
  });
  switch (a.backgroundType) {
    case 'color':
      if (op === null || hex(a.backgroundColor))
        return {
          backgroundType: 'color',
          backgroundColor: op === null ? (a.backgroundColor ?? '') : rgba(a.backgroundColor, op),
          overlayType: 'none',
        };
      return layer({ overlayType: 'color', backgroundImageColor: a.backgroundColor });
    case 'gradient': {
      const g = gradient(a, 'gradient');
      if (op === null) return { backgroundType: 'gradient', ...g, overlayType: 'none' };
      if (g.selectGradient === 'advanced' && hex(g.gradientColor1) && hex(g.gradientColor2))
        return {
          backgroundType: 'gradient',
          ...g,
          gradientColor1: rgba(g.gradientColor1, op),
          gradientColor2: rgba(g.gradientColor2, op),
          overlayType: 'none',
        };
      return layer({ overlayType: 'gradient', ...g });
    }
    case 'image': {
      const fixed = a.backgroundAttachment === 'fixed';
      const image: Attrs = {
        backgroundType: 'image',
        backgroundImageDesktop: a.backgroundImage ?? '',
        backgroundPositionDesktop: position(a.backgroundPosition ?? 'center-center'),
        backgroundSizeDesktop: a.backgroundSize ?? 'cover',
        backgroundRepeatDesktop: a.backgroundRepeat ?? 'no-repeat',
        backgroundAttachmentDesktop: a.backgroundAttachment ?? 'scroll',
        // Fixed images scroll on tablets and phones, as before.
        ...(fixed
          ? { backgroundAttachmentTablet: 'scroll', backgroundAttachmentMobile: 'scroll' }
          : {}),
      };
      if (a.overlayType === 'gradient') {
        const g = gradient(a, 'gradientOverlay');
        const empty = g.selectGradient === 'advanced' && !g.gradientColor1 && !g.gradientColor2;
        return {
          ...image,
          ...(empty ? { overlayType: 'none' } : { overlayType: 'gradient', ...g }),
          overlayOpacity: g.selectGradient === 'basic' ? 1 : (op ?? 100) / 100,
        };
      }
      return set(a.backgroundImageColor)
        ? {
            ...image,
            overlayType: 'color',
            backgroundImageColor: a.backgroundImageColor,
            overlayOpacity: (op ?? 100) / 100,
          }
        : { ...image, overlayType: 'none' };
    }
    case 'video':
      return {
        backgroundType: 'video',
        backgroundVideo: a.backgroundVideo ?? '',
        ...(a.overlayType === 'gradient' && set(a.gradientValue)
          ? { overlayType: 'gradient', selectGradient: 'basic', gradientValue: a.gradientValue }
          : set(a.backgroundVideoColor)
            ? { overlayType: 'color', backgroundVideoColor: a.backgroundVideoColor }
            : { overlayType: 'none', backgroundVideoColor: '' }),
      };
    default:
      return { backgroundType: 'none', overlayType: 'none' };
  }
}

/** The box shadow: same names; no color by default. */
function shadow(a: Attrs): Attrs {
  return {
    boxShadowColor: a.boxShadowColor ?? '',
    ...only({
      boxShadowHOffset: a.boxShadowHOffset,
      boxShadowVOffset: a.boxShadowVOffset,
      boxShadowBlur: a.boxShadowBlur,
      boxShadowSpread: a.boxShadowSpread,
      boxShadowPosition: a.boxShadowPosition,
    }),
  };
}

/** Shape dividers of the columns: the top one hangs as drawn, the bottom one turned over. */
function shapes(a: Attrs): Attrs {
  const out: Attrs = {};
  for (const side of ['top', 'bottom'] as const) {
    if (!set(a[`${side}Type`]) || a[`${side}Type`] === 'none') continue;
    Object.assign(
      out,
      only({
        [`${side}Type`]: a[`${side}Type`],
        [`${side}Color`]: a[`${side}Color`] || '#333',
        [`${side}Height`]: a[`${side}Height`],
        [`${side}HeightTablet`]: a[`${side}HeightTablet`],
        [`${side}HeightMobile`]: a[`${side}HeightMobile`],
        [`${side}Width`]: a[`${side}Width`],
        [`${side}DividerOpacity`]: a[`${side}DividerOpacity`],
      }),
      {
        [`${side}Flip`]: Boolean(a[`${side}Flip`]),
        [`${side}Invert`]: side === 'bottom',
        // Here the flag brings the shape in front; the container's keeps the content in front.
        [`${side}ContentAboveShape`]: !a[`${side}ContentAboveShape`],
      },
    );
  }
  return out;
}

/** Nested blocks are not roots: only the outermost one is. */
function nested(children: CxdBlock[]): CxdBlock[] {
  return children.map((child) =>
    child.type === 'prisma/container' && child.attrs?.isBlockRootParent
      ? { ...child, attrs: { ...child.attrs, isBlockRootParent: false } }
      : child,
  );
}

/** The width of a root that is neither full nor wide: as wide as the content area. */
const CONTENT_AREA: Attrs = {
  contentWidth: 'default',
  widthDesktop: 100,
  widthTablet: 100,
  widthMobile: 100,
  widthType: '%',
  widthTypeTablet: '%',
  widthTypeMobile: '%',
};

/** The same inner width on all devices (the container's own tablet and phone defaults differ). */
function innerWidth(width: unknown, unit: unknown): Attrs {
  if (numeric(width) === null) {
    // The site's content width, as the theme's.
    return { innerContentCustomWidthTablet: '', innerContentCustomWidthMobile: '' };
  }
  return {
    innerContentCustomWidthDesktop: numeric(width),
    innerContentCustomWidthTablet: numeric(width),
    innerContentCustomWidthMobile: numeric(width),
    innerContentCustomWidthType: unit,
    innerContentCustomWidthTypeTablet: unit,
    innerContentCustomWidthTypeMobile: unit,
  };
}

function section(attrs: Attrs): Attrs {
  const a = { ...SECTION_DEFAULTS, ...attrs };
  const full = a.contentWidth === 'full_width';
  const wideAlign = a.align === 'wide' || a.align === 'full';
  let width: Attrs;
  let margins: Array<'top' | 'bottom' | 'left' | 'right'> = ['top', 'bottom'];
  if (!full) {
    width = wideAlign
      ? CONTENT_AREA
      : {
          contentWidth: 'default',
          widthDesktop: numeric(a.width) ?? 900,
          widthTablet: numeric(a.width) ?? 900,
          widthMobile: numeric(a.width) ?? 900,
          widthType: 'px',
          widthTypeTablet: 'px',
          widthTypeMobile: 'px',
        };
    // Boxed rows are centered; aligned left or right, they keep that side's margin.
    if (a.align === 'left') margins = [...margins, 'left'];
    if (a.align === 'right') margins = [...margins, 'right'];
  } else if (a.align === 'full') {
    width = {
      contentWidth: 'alignfull',
      innerContentWidth: 'alignwide',
      ...innerWidth(a.themeWidth ? '' : a.innerWidth, a.innerWidthType),
    };
  } else if (a.align === 'wide') {
    width = { contentWidth: 'alignwide' };
  } else {
    width = CONTENT_AREA;
    margins = ['top', 'bottom', 'left', 'right'];
  }
  return {
    ...kept(a),
    isBlockRootParent: true,
    htmlTag: a.tag,
    ...FLOW,
    ...width,
    ...spacing(a, margins),
    ...backgroundOf(a, false),
    ...border(a, 'overall'),
    ...shadow(a),
    ...only({
      minHeightDesktop: a.minHeight,
      minHeightType: a.minHeightType,
    }),
  };
}

/** Spectra's named gaps of early versions, else a number of pixels. */
const GAPS: Record<string, number> = {
  nogap: 0,
  default: 10,
  narrow: 5,
  extended: 15,
  wide: 20,
  wider: 30,
};

function columns(attrs: Attrs, children: CxdBlock[]): { attrs: Attrs; children: CxdBlock[] } {
  const a = { ...COLUMNS_DEFAULTS, ...attrs };
  const count = Math.min(6, Math.max(1, Math.round(numeric(a.columns) ?? 2)));
  const stackTablet = a.stack === 'tablet';
  const stackMobile = stackTablet || a.stack === 'mobile';
  const reverseTablet = Boolean(a.reverseTablet);
  const reverseMobile = Boolean(a.reverseMobile) || reverseTablet;
  const gap = GAPS[String(a.columnGap)] ?? numeric(a.columnGap) ?? 10;
  const direction = (stacked: boolean, reverse: boolean) =>
    `${stacked ? 'column' : 'row'}${reverse ? '-reverse' : ''}`;

  let width: Attrs;
  if (a.align === 'full') {
    width =
      a.contentWidth === 'fullwidth'
        ? { contentWidth: 'alignfull', innerContentWidth: 'alignfull' }
        : {
            contentWidth: 'alignfull',
            innerContentWidth: 'alignwide',
            ...innerWidth(a.contentWidth === 'custom' ? a.width : '', a.widthType),
          };
  } else if (a.align === 'wide') {
    width = { contentWidth: 'alignwide' };
  } else {
    width = CONTENT_AREA;
  }

  // Columns sit side by side at their width; spare room is shared around them (their margins are auto).
  const row: Attrs = {
    ...kept(a),
    isBlockRootParent: true,
    htmlTag: a.tag,
    directionDesktop: 'row',
    directionTablet: direction(stackTablet, reverseTablet),
    directionMobile: direction(stackMobile, reverseMobile),
    alignItemsDesktop: 'stretch',
    justifyContentDesktop: 'space-around',
    ...(stackTablet ? { justifyContentTablet: 'flex-start' } : {}),
    ...(stackMobile ? { justifyContentMobile: 'flex-start' } : {}),
    wrapDesktop: 'nowrap',
    wrapTablet: 'nowrap',
    wrapMobile: 'nowrap',
    rowGapDesktop: 0,
    columnGapDesktop: 0,
    ...width,
    ...spacing(a, ['top', 'bottom', 'left', 'right']),
    ...backgroundOf(a, false),
    ...border(a, 'columns'),
    ...shadow(a),
    ...shapes(a),
  };

  const share = Math.round((100 / count) * 100) / 100;
  const vAlign =
    a.vAlign === 'center' || a.vAlign === 'middle'
      ? 'center'
      : a.vAlign === 'bottom'
        ? 'flex-end'
        : 'flex-start';
  const fit = (c: Attrs): Attrs => {
    const desktop = c.widthDesktop ?? share;
    const tablet = set(c.widthTablet) ? c.widthTablet : '';
    const mobile = set(c.widthMobile) ? c.widthMobile : set(tablet) ? tablet : desktop;
    // The gap is each column's padding on the sides the column leaves unset.
    const padding = Object.fromEntries(
      ['top', 'bottom', 'left', 'right'].map((s) => [
        `${s}PaddingDesktop`,
        c[`${s}PaddingDesktop`] ?? gap,
      ]),
    );
    return {
      ...c,
      isBlockRootParent: false,
      widthDesktop: desktop,
      widthTablet: stackTablet ? 100 : tablet,
      widthMobile: stackMobile ? 100 : mobile,
      ...padding,
      justifyContentDesktop: vAlign,
    };
  };
  return {
    attrs: row,
    children: children.map((child) =>
      child.type === 'prisma/container' ? { ...child, attrs: fit(child.attrs ?? {}) } : child,
    ),
  };
}

function column(attrs: Attrs): Attrs {
  const a = { ...COLUMN_DEFAULTS, ...attrs };
  // Widths are written only when set: the columns fill in their share.
  const width = (v: unknown) => (numeric(v) !== null && numeric(v) !== 0 ? numeric(v) : undefined);
  return {
    ...kept(a),
    isBlockRootParent: false,
    htmlTag: 'div',
    ...FLOW,
    ...only({
      widthDesktop: width(a.colWidth),
      widthTablet: width(a.colWidthTablet),
      widthMobile: width(a.colWidthMobile),
    }),
    widthType: '%',
    widthTypeTablet: '%',
    widthTypeMobile: '%',
    ...spacing(a, ['top', 'bottom', 'left', 'right']),
    ...backgroundOf(a, true),
    ...border(a, 'column'),
  };
}

export const legacySpectra: Record<string, SpectraImporter> = {
  'uagb/section': (a, src) => [src.block('container', section(a), nested(src.children))],
  'uagb/columns': (a, src) => {
    const out = columns(a, nested(src.children));
    return [src.block('container', out.attrs, out.children)];
  },
  'uagb/column': (a, src) => [src.block('container', column(a), nested(src.children))],
};
