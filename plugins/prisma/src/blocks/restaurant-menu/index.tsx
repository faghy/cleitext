import type { BaseDevice as Device, Sheet } from '@cleitext/design';
import { mediaUrl } from '../../lib/background';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, suffix, typography } from '../../lib/emit';
import { safeTag } from '../../lib/tags';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

/**
 * A price list (Spectra's "Price List", `restaurant-menu`): a grid of items
 * (`restaurant-menu-item`), each with a picture, a title, a description, a
 * price and a separator. The group decides the layout of all its items; the
 * items keep a copy of those settings, as Spectra does, to draw their markup.
 */

/** Settings of the group that its items copy (the editor keeps them in step). */
export const SHARED = [
  'imagePosition',
  'imageAlignment',
  'imageSize',
  'headingTag',
  'headingAlign',
  'stack',
  'imageWidth',
  'imgAlign',
  'showImage',
  'columns',
  'tcolumns',
  'mcolumns',
] as const;

function typo(p: string): Attrs {
  return {
    [`${p}FontFamily`]: '',
    [`${p}FontWeight`]: '',
    [`${p}FontStyle`]: '',
    [`${p}Transform`]: '',
    [`${p}Decoration`]: '',
    [`${p}FontSize`]: '',
    [`${p}FontSizeTablet`]: '',
    [`${p}FontSizeMobile`]: '',
    [`${p}FontSizeType`]: 'px',
    [`${p}LineHeight`]: 1,
    [`${p}LineHeightTablet`]: 1,
    [`${p}LineHeightMobile`]: 1,
    [`${p}LineHeightType`]: 'em',
    [`${p}LetterSpacing`]: '',
    [`${p}LetterSpacingTablet`]: '',
    [`${p}LetterSpacingMobile`]: '',
    [`${p}LetterSpacingType`]: 'px',
    [`${p}LoadGoogleFonts`]: false,
  };
}

const GROUP_DEFAULTS: Attrs = {
  classMigrate: false,
  childMigrate: true,
  menu_item_count: 4,
  headingAlign: 'left',
  descColor: '#333',
  priceColor: '#888888',
  titleColor: '#333',
  imagePosition: 'left',
  imageAlignment: 'top',
  imageSize: 'medium',
  headingTag: 'h4',
  showImage: true,
  ...typo('title'),
  ...typo('price'),
  ...typo('desc'),
  priceSpace: 5,
  descSpace: 15,
  titleSpace: 10,
  titleSpaceTablet: '',
  titleSpaceMobile: '',
  titleSpaceType: 'px',
  imgVrPadding: '',
  imgHrPadding: 10,
  imgTopPadding: 0,
  imgBottomPadding: 0,
  iconImage: '',
  imageWidth: 100,
  imageWidthTablet: '',
  imageWidthMobile: '',
  imageWidthType: 'px',
  columns: 2,
  tcolumns: 2,
  mcolumns: 1,
  rowGap: 10,
  rowGapTablet: '',
  rowGapMobile: '',
  rowGapType: 'px',
  columnGap: 10,
  columnGapTablet: '',
  columnGapMobile: '',
  columnGapType: 'px',
  contentHrPadding: '',
  contentVrPadding: '',
  contentPaddingTop: '',
  contentPaddingRight: '',
  contentPaddingBottom: '',
  contentPaddingLeft: '',
  contentPaddingTopTablet: '',
  contentPaddingRightTablet: '',
  contentPaddingBottomTablet: '',
  contentPaddingLeftTablet: '',
  contentPaddingTopMobile: '',
  contentPaddingRightMobile: '',
  contentPaddingBottomMobile: '',
  contentPaddingLeftMobile: '',
  contentPaddingUnit: 'px',
  contentTabletPaddingUnit: 'px',
  contentMobilePaddingUnit: 'px',
  contentSpacingLink: false,
  seperatorStyle: 'dashed',
  seperatorWidth: 100,
  seperatorWidthTablet: '',
  seperatorWidthMobile: '',
  seperatorWidthType: '%',
  seperatorThickness: 1,
  seperatorColor: '#b2b4b5',
  imgPaddingTop: '',
  imgPaddingRight: 10,
  imgPaddingBottom: '',
  imgPaddingLeft: 10,
  imgPaddingTopTablet: '',
  imgPaddingRightTablet: '',
  imgPaddingBottomTablet: 10,
  imgPaddingLeftTablet: '',
  imgPaddingTopMobile: '',
  imgPaddingRightMobile: '',
  imgPaddingBottomMobile: 10,
  imgPaddingLeftMobile: '',
  imgPaddingUnit: 'px',
  imgTabletPaddingUnit: 'px',
  imgMobilePaddingUnit: 'px',
  imgSpacingLink: false,
  imgAlign: 'side',
  stack: 'tablet',
};

const isSet = (v: unknown) => v !== '' && v !== undefined && v !== null;

/** A number of a device, else the larger device's. */
function cascadeNumber(a: Attrs, base: string, device: Device): unknown {
  const d = a[base];
  const t = numeric(a[`${base}Tablet`]) !== null ? a[`${base}Tablet`] : d;
  if (device === 'desktop') return d;
  if (device === 'tablet') return t;
  return numeric(a[`${base}Mobile`]) !== null ? a[`${base}Mobile`] : t;
}

const GRID: Record<number, string> = {
  1: 'auto',
  2: 'auto auto',
  3: 'auto auto auto',
  4: 'auto auto auto auto',
};

function groupCss(a: Attrs, B: string, sheet: Sheet): void {
  const I = `${B} .pr-restaurant-menu-item`;
  const C = `${I} .pr-restaurant-menu-item__content`;
  const columnsKey = { desktop: 'columns', tablet: 'tcolumns', mobile: 'mcolumns' } as const;
  for (const device of DEVICES) {
    const s = suffix(device);
    const desktop = device === 'desktop';
    emit(sheet, device, `${B}.pr-restaurant-menu`, {
      'column-gap': px(cascadeNumber(a, 'columnGap', device), a.columnGapType),
      'row-gap': px(cascadeNumber(a, 'rowGap', device), a.rowGapType),
      'grid-template-columns': GRID[numeric(a[columnsKey[device]]) ?? 0] ?? '',
    });
    const imgUnit = desktop ? a.imgPaddingUnit : a[`img${s}PaddingUnit`];
    const imgPad = (side: string, legacy: unknown) =>
      desktop
        ? isSet(a[`imgPadding${side}`])
          ? a[`imgPadding${side}`]
          : legacy
        : a[`imgPadding${side}${s}`];
    const width = px(cascadeNumber(a, 'imageWidth', device), a.imageWidthType);
    emit(sheet, device, `${I} img`, {
      'padding-left': px(imgPad('Left', a.imgHrPadding), imgUnit),
      'padding-right': px(imgPad('Right', a.imgHrPadding), imgUnit),
      'padding-top': px(imgPad('Top', a.imgVrPadding), imgUnit),
      'padding-bottom': px(imgPad('Bottom', a.imgVrPadding), imgUnit),
      width,
      'max-width': width,
    });
    const unit = desktop ? a.contentPaddingUnit : a[`content${s}PaddingUnit`];
    const pad = (side: string, legacy: unknown) =>
      desktop
        ? isSet(a[`contentPadding${side}`])
          ? a[`contentPadding${side}`]
          : legacy
        : a[`contentPadding${side}${s}`];
    emit(sheet, device, `${B} .pr-restaurant-menu-item__content`, {
      'padding-left': px(pad('Left', a.contentHrPadding), unit),
      'padding-right': px(pad('Right', a.contentHrPadding), unit),
      'padding-top': px(pad('Top', a.contentVrPadding), unit),
      'padding-bottom': px(pad('Bottom', a.contentVrPadding), unit),
    });
    emit(sheet, device, `${B} .pr-restaurant-menu-item__details .pr-restaurant-menu-item__title`, {
      ...(desktop ? { color: a.titleColor } : {}),
      'margin-bottom': px(a[`titleSpace${s}`], a.titleSpaceType),
    });
    emit(sheet, device, `${B} .pr-restaurant-menu-item__title`, typography(a, 'title', device));
    emit(sheet, device, `${B} .pr-restaurant-menu-item__price`, {
      ...typography(a, 'price', device),
      ...(desktop ? { color: a.priceColor } : {}),
    });
    emit(sheet, device, `${B} .pr-restaurant-menu-item__desc`, {
      ...typography(a, 'desc', device),
      ...(desktop ? { color: a.descColor, 'margin-bottom': px(a.descSpace) } : {}),
    });
    if (a.seperatorStyle !== 'none') {
      emit(sheet, device, `${I} .pr-restaurant-menu-item__separator`, {
        ...(desktop
          ? {
              'border-top-color': a.seperatorColor,
              'border-top-style': a.seperatorStyle,
              'border-top-width': px(a.seperatorThickness),
            }
          : {}),
        width: px(a[`seperatorWidth${s}`], a.seperatorWidthType),
      });
    }
  }
  if (a.imgAlign === 'side') {
    emit(sheet, 'desktop', C, {
      'align-items': a.imageAlignment === 'top' ? 'flex-start' : 'center',
      display: 'inline-flex',
    });
    // Stacked on smaller screens: the picture above (left) or below (right) the text.
    const stacked =
      a.imagePosition === 'left'
        ? { display: 'block', 'text-align': 'left' }
        : { display: 'flex', 'flex-direction': 'column-reverse', 'align-items': 'flex-end' };
    if (a.stack === 'tablet') {
      emit(sheet, 'tablet', C, stacked);
      emit(sheet, 'mobile', C, stacked);
    } else if (a.stack === 'mobile') {
      emit(sheet, 'mobile', C, stacked);
    }
    if (a.imagePosition === 'left') {
      emit(sheet, 'desktop', `${B} .pr-restaurant-menu-item__details`, { 'text-align': 'left' });
    } else if (a.imagePosition === 'right') {
      emit(sheet, 'desktop', `${B} .pr-restaurant-menu-item__details`, { 'text-align': 'right' });
      emit(sheet, 'desktop', `${I} .pr-restaurant-menu-item__separator`, { 'margin-left': 'auto' });
    }
  }
  if (a.imgAlign === 'top') {
    emit(sheet, 'desktop', I, { 'text-align': a.headingAlign, display: 'block' });
    emit(sheet, 'desktop', C, { 'text-align': a.headingAlign, display: 'inline-flex' });
    if (a.headingAlign === 'center') {
      // As Spectra: this weaker rule loses to the one above, the content stays inline.
      emit(sheet, 'desktop', `${B} .pr-restaurant-menu-item__content`, { display: 'block' });
      emit(sheet, 'desktop', `${I} .pr-restaurant-menu-item__separator`, { margin: '0 auto' });
    } else if (a.headingAlign === 'right') {
      emit(sheet, 'desktop', `${I} .pr-restaurant-menu-item__separator`, { 'margin-left': 'auto' });
    }
  }
}

const cols = (v: unknown, fallback: number) =>
  Math.min(Math.max(Math.round(numeric(v) ?? fallback), 1), 4);

function GroupView({ attrs: a, id, root }: ViewProps) {
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-restaurant-menu',
        'pr-restaurant-menu',
        blockClass(id),
        `pr-restaurant-menu--desktop-${cols(a.columns, 2)}`,
        `pr-restaurant-menu--tablet-${cols(a.tcolumns, 2)}`,
        `pr-restaurant-menu--mobile-${cols(a.mcolumns, 1)}`,
      ].join(' '),
    },
    null,
    true,
  );
}

export const restaurantMenu: PrismaBlock = {
  name: 'restaurant-menu',
  title: 'Price List',
  description: 'A list of products or dishes with pictures, descriptions and prices.',
  keywords: ['price list', 'menu', 'restaurant', 'prices', 'pricing'],
  container: true,
  allowedBlocks: ['prisma/restaurant-menu-item'],
  defaults: GROUP_DEFAULTS,
  css: groupCss,
  View: GroupView,
  spectra: {
    'uagb/restaurant-menu': (a, src) => [
      src.block('restaurant-menu', { ...a, childMigrate: true }, src.children),
    ],
  },
};

// ---- Price list item ---------------------------------------------------------------------

const ITEM_DEFAULTS: Attrs = {
  title: [{ text: 'Menu Item' }],
  description: [{ text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' }],
  price: [{ text: '$9' }],
  image: '',
  imagePosition: 'left',
  imageAlignment: 'top',
  imageSize: 'medium',
  headingTag: 'h4',
  columns: 2,
  tcolumns: 2,
  mcolumns: 1,
  headingAlign: 'left',
  stack: 'tablet',
  imageWidth: 100,
  imgAlign: 'side',
  showImage: true,
  imgTagHeight: 0,
  imgTagWidth: 0,
};

/** The address of the item's picture at the chosen size, else the original. */
function imageOf(a: Attrs): string {
  const image = a.image as { sizes?: Record<string, { url?: unknown }> } | '' | null;
  if (image && typeof image === 'object') {
    const sized = mediaUrl(image.sizes?.[String(a.imageSize)]?.url);
    if (sized) return sized;
  }
  return mediaUrl(a.image);
}

function ItemView({ attrs: a, id, root, text }: ViewProps) {
  const src = imageOf(a);
  const alt =
    a.image && typeof a.image === 'object' && typeof (a.image as { alt?: unknown }).alt === 'string'
      ? String((a.image as { alt: string }).alt)
      : '';
  const width = numeric(a.imageWidth);
  const height = numeric(a.imgTagHeight);
  const image =
    a.showImage !== false && src ? (
      <img
        className="pr-restaurant-menu-item__image"
        src={src}
        alt={alt}
        {...(width ? { width } : {})}
        {...(height ? { height } : {})}
        loading="lazy"
      />
    ) : null;
  const title = text('title', {
    tagName: safeTag(a.headingTag, 'h4'),
    className: 'pr-restaurant-menu-item__title',
    placeholder: 'Write a title',
  });
  const desc = text('description', {
    tagName: 'div',
    className: 'pr-restaurant-menu-item__desc',
    placeholder: 'Write a description',
  });
  const price = text('price', {
    tagName: 'span',
    className: 'pr-restaurant-menu-item__price',
    placeholder: 'Price',
  });
  const align = String(a.headingAlign);
  const position = String(a.imagePosition);
  const separator = <div className="pr-restaurant-menu-item__separator" />;
  return root(
    'div',
    { className: `wp-block-prisma-restaurant-menu-item pr-restaurant-menu-item ${blockClass(id)}` },
    a.imgAlign === 'top' ? (
      <>
        {image}
        <div className="pr-restaurant-menu-item__content">
          {align === 'right' && price}
          <div className="pr-restaurant-menu-item__details">
            {title}
            {desc}
            {align === 'center' && price}
          </div>
          {align === 'left' && price}
        </div>
        {separator}
      </>
    ) : (
      <>
        <div className="pr-restaurant-menu-item__content">
          {position === 'left' && image}
          {position === 'right' && price}
          <div className="pr-restaurant-menu-item__details">
            {title}
            {desc}
          </div>
          {position === 'left' && price}
          {position === 'right' && image}
        </div>
        {separator}
      </>
    ),
  );
}

export const restaurantMenuItem: PrismaBlock = {
  name: 'restaurant-menu-item',
  title: 'Price List Item',
  description: 'A product of the price list: picture, title, description and price.',
  keywords: ['price', 'menu', 'item', 'product'],
  parent: ['restaurant-menu'],
  richAttributes: ['title', 'description', 'price'],
  defaults: ITEM_DEFAULTS,
  css: () => {},
  View: ItemView,
  media: (a) =>
    a.image && typeof a.image === 'object' && typeof (a.image as { id?: unknown }).id === 'string'
      ? [String((a.image as { id: string }).id)]
      : [],
  spectra: {
    'uagb/restaurant-menu-child': (a, src) => {
      const title = src.innerAny('uagb-rm__title');
      const description = src.innerAny('uagb-rm__desc');
      const price = src.inner('span', 'uagb-rm__price');
      // The picture as shown (at the chosen size); the saved object may lack its sizes.
      const found = /<img\b[^>]*\ssrc="([^"]*)"/i.exec(src.html)?.[1];
      // Spectra's own placeholder picture stays behind.
      const shown = found && !/uag-placeholder/.test(found) ? found : undefined;
      const image =
        a.image && typeof a.image === 'object'
          ? { ...(a.image as object), ...(shown ? { url: shown } : {}) }
          : shown
            ? { url: shown }
            : '';
      return [
        src.block('restaurant-menu-item', {
          ...a,
          title: title || (typeof a.title === 'string' ? a.title : ''),
          description: description || (typeof a.description === 'string' ? a.description : ''),
          price: price || (typeof a.price === 'string' ? a.price : ''),
          image,
        }),
      ];
    },
  },
};
