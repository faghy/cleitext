import type { BaseDevice as Device, Sheet } from '@cleitext/design';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, suffix, typography, type Declarations } from '../../lib/emit';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

function spacingDefaults(kind: 'Padding' | 'Margin'): Attrs {
  const out: Attrs = { [`block${kind}Link`]: '' };
  for (const s of ['', 'Tablet', 'Mobile']) {
    for (const side of ['Top', 'Right', 'Left', 'Bottom']) out[`block${side}${kind}${s}`] = '';
    out[`block${kind}Unit${s}`] = 'px';
  }
  return out;
}

const DEFAULTS: Attrs = {
  title: [],
  displayTitle: true,
  range: '5',
  rating: 4,
  size: 18,
  sizeTablet: 18,
  sizeMobile: 18,
  align: 'left',
  alignTablet: '',
  alignMobile: '',
  layout: 'inline',
  layoutTablet: 'inline',
  layoutMobile: 'inline',
  starPosition: 'after',
  starPositionTablet: 'after',
  starPositionMobile: 'after',
  gap: 2,
  gapTablet: '',
  gapMobile: '',
  unmarkedColor: '#ccd6df',
  color: '#f0ad4e',
  titleColor: '',
  titleGap: 10,
  titleGapTablet: 10,
  titleGapMobile: 10,
  loadGoogleFonts: false,
  fontFamily: 'Default',
  fontWeight: '',
  fontStyle: '',
  fontTransform: '',
  fontDecoration: '',
  fontSizeType: 'px',
  fontSize: '',
  fontSizeTablet: '',
  fontSizeMobile: '',
  lineHeightType: 'em',
  lineHeight: '',
  lineHeightTablet: '',
  lineHeightMobile: '',
  letterSpacing: '',
  letterSpacingTablet: '',
  letterSpacingMobile: '',
  letterSpacingType: 'px',
  ...spacingDefaults('Padding'),
  ...spacingDefaults('Margin'),
};

/** The flex value of an alignment (`full` spreads the stars). */
function flexAlign(align: unknown): string {
  return align === 'right'
    ? 'flex-end'
    : align === 'center'
      ? 'center'
      : align === 'full'
        ? 'space-between'
        : 'flex-start';
}

/** The same alignment once the row is reversed (title after the stars). */
function reversed(align: string): string {
  return align === 'flex-end'
    ? 'flex-start'
    : align === 'center' || align === 'space-between'
      ? align
      : 'flex-end';
}

/** The title's typography, from the block's unprefixed names (`fontFamily`, `fontTransform`…). */
function titleTypography(a: Attrs, device: Device): Declarations {
  const t: Attrs = {};
  for (const [key, v] of Object.entries(a)) {
    if (/^(font|lineHeight|letterSpacing)/.test(key)) {
      t[`t${key[0]!.toUpperCase()}${key.slice(1)}`] = v;
    }
  }
  t.tTransform = a.fontTransform;
  t.tDecoration = a.fontDecoration;
  return typography(t, 't', device);
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-star-rating`;
  const rating = numeric(a.rating) ?? 0;
  for (const device of DEVICES) {
    const s = suffix(device);
    // Desktop's alignment counts only on desktop; the others fall back to the start.
    const align = flexAlign(a[`align${s}`]);
    const stacked = a[`layout${s}`] === 'stack';
    const position = a[`starPosition${s}`];
    const wrapper: Declarations = {};
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const p = side.toLowerCase();
      wrapper[`margin-${p}`] = px(a[`block${side}Margin${s}`], a[`blockMarginUnit${s}`]);
      wrapper[`padding-${p}`] = px(a[`block${side}Padding${s}`], a[`blockPaddingUnit${s}`]);
    }
    // Which side of the title faces the stars.
    let gapSide = 'margin-right';
    if (stacked && position === 'before') {
      gapSide = 'margin-top';
      emit(sheet, device, R, {
        'flex-direction': 'column-reverse',
        'align-items': align,
        ...wrapper,
      });
    } else if (stacked && position === 'after') {
      gapSide = 'margin-bottom';
      emit(sheet, device, R, { 'flex-direction': 'column', 'align-items': align, ...wrapper });
    } else if ((device === 'desktop' ? a.layout === 'inline' : !stacked) && position === 'before') {
      gapSide = 'margin-left';
      emit(sheet, device, R, {
        'flex-direction': 'row-reverse',
        'justify-content': reversed(align),
        ...wrapper,
      });
    } else if ((device === 'desktop' ? a.layout === 'inline' : !stacked) && position === 'after') {
      emit(sheet, device, R, { 'flex-direction': 'row', 'justify-content': align, ...wrapper });
    }
    emit(sheet, device, `${B} .pr-star-rating__stars`, {
      'font-size': px(a[`size${s}`]),
    });
    emit(sheet, device, `${B} .pr-star-rating__stars > span`, {
      'margin-right': px(a[`gap${s}`]),
      ...(device === 'desktop' ? { color: a.unmarkedColor } : {}),
    });
    emit(sheet, device, `${B} .pr-star-rating__title`, {
      ...titleTypography(a, device),
      ...(device === 'desktop' ? { color: a.titleColor } : {}),
      ...(device !== 'desktop' && !stacked ? { 'margin-bottom': 0 } : {}),
      [gapSide]: px(a[`titleGap${s}`]),
    });
  }
  // The marked stars, the last one filled in part.
  const full = Math.floor(rating);
  if (full > 0) {
    emit(sheet, 'desktop', `${B} .pr-star-rating__star:nth-child(-n+${full})`, { color: a.color });
  }
  const part = Math.round((rating - full) * 1e6) / 1e4;
  if (part > 0) {
    const nth = `${B} .pr-star-rating__star:nth-child(${Math.ceil(rating)})`;
    emit(sheet, 'desktop', `${nth}::before`, {
      color: a.color,
      width: `${part}%`,
      position: 'absolute',
      content: "'★'",
      overflow: 'hidden',
    });
    emit(sheet, 'desktop', nth, { position: 'relative' });
  }
}

function View({ attrs: a, id, text, root, editing }: ViewProps) {
  const range = Math.max(1, Math.min(10, Math.round(numeric(a.range) ?? 5)));
  const hasTitle = editing || (Array.isArray(a.title) && a.title.length > 0);
  return root(
    'div',
    { className: ['wp-block-prisma-star-rating', 'pr-star-rating', blockClass(id)].join(' ') },
    <>
      {a.displayTitle !== false && hasTitle
        ? text('title', { tagName: 'p', className: 'pr-star-rating__title', placeholder: 'Title' })
        : null}
      <div className="pr-star-rating__stars" title={`${numeric(a.rating) ?? 0}/${range}`}>
        {Array.from({ length: range }, (_, i) => (
          <span key={i} className="pr-star-rating__star">
            ★
          </span>
        ))}
      </div>
    </>,
  );
}

export const starRating: PrismaBlock = {
  name: 'star-rating',
  title: 'Star Ratings',
  description: 'A rating out of five or ten stars, partly filled, with an optional title.',
  keywords: ['rating', 'star rating', 'review', 'stars'],
  richAttributes: ['title'],
  defaults: DEFAULTS,
  css,
  View,
  spectra: {
    'uagb/star-rating': (a, src) => {
      const title = src.inner('p', 'uag-star-rating__title');
      return [
        src.block('star-rating', {
          ...a,
          ...(title ? { title } : {}),
        }),
      ];
    },
  },
};
