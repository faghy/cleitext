import type { CxdBlock } from '@cleitext/plugin-sdk';
import type { BaseDevice as Device, Sheet } from '@cleitext/design';
import { mediaUrl } from '../../lib/background';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, suffix, type Declarations } from '../../lib/emit';
import { Icon } from '../../lib/icons';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { sideDefaults, sidesCss } from '../heading';
import { linkHref } from '../icon';

/**
 * The inner HTML of the first element whose class list has `className`,
 * nested elements of the same tag included (rich text keeps its markup).
 */
export function savedInner(html: string, className: string): string | null {
  const open = new RegExp(
    `<([a-z][a-z0-9]*)\\b[^>]*\\bclass="(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"[^>]*>`,
    'i',
  ).exec(html);
  if (!open) return null;
  const tag = open[1]!.toLowerCase();
  const start = open.index + open[0].length;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index).trim();
  }
  return html.slice(start).trim();
}

const D = (device: Device) => suffix(device);
const isNum = (v: unknown) => numeric(v) !== null;

// ---- Icon list (the group) ------------------------------------------------------------------

const LIST_DEFAULTS: Attrs = {
  align: 'left',
  alignTablet: '',
  alignMobile: '',
  icon_count: 3,
  parentIcon: 'circle-arrow-right',
  gap: 10,
  gapTablet: '',
  gapMobile: '',
  gapType: 'px',
  inner_gap: 15,
  innerGapTablet: '',
  innerGapMobile: '',
  innerGapType: 'px',
  size: 16,
  sizeType: 'px',
  sizeTablet: '',
  sizeMobile: '',
  bgSize: 0,
  bgSizeType: 'px',
  bgSizeTablet: '',
  bgSizeMobile: '',
  border: 0,
  borderTablet: '',
  borderMobile: '',
  borderType: 'px',
  borderRadius: 0,
  borderRadiusTablet: '',
  borderRadiusMobile: '',
  borderRadiusType: 'px',
  fontSize: '',
  fontSizeType: 'px',
  fontSizeTablet: '',
  fontSizeMobile: '',
  lineHeight: '',
  lineHeightType: 'em',
  lineHeightTablet: '',
  lineHeightMobile: '',
  fontFamily: '',
  fontWeight: '',
  fontStyle: '',
  fontTransform: '',
  fontDecoration: '',
  loadGoogleFonts: false,
  labelLetterSpacing: '',
  labelLetterSpacingTablet: '',
  labelLetterSpacingMobile: '',
  labelLetterSpacingType: 'px',
  icon_layout: 'vertical',
  iconLayoutTablet: '',
  iconLayoutMobile: '',
  hideLabel: false,
  iconPosition: 'middle',
  iconPositionTablet: '',
  iconPositionMobile: '',
  iconPlacement: 'before',
  iconColor: '',
  iconHoverColor: '',
  iconBgColor: '',
  iconBgHoverColor: '',
  iconBorderColor: '',
  iconBorderHoverColor: '',
  labelColor: '',
  labelHoverColor: '',
  ...sideDefaults('block', 'Margin'),
  ...sideDefaults('block', 'Padding'),
  blockMarginLink: false,
};

const FLEX: Record<string, string> = { left: 'flex-start', right: 'flex-end', center: 'center' };

/** A value of a device, else the larger device's (numbers only). */
function chain(a: Attrs, base: string, device: Device): unknown {
  const tablet = isNum(a[`${base}Tablet`]) ? a[`${base}Tablet`] : a[base];
  if (device === 'desktop') return a[base];
  if (device === 'tablet') return tablet;
  return isNum(a[`${base}Mobile`]) ? a[`${base}Mobile`] : tablet;
}

/** A device's choice, else the larger device's (empty strings unset). */
function choice(a: Attrs, desktop: string, tablet: string, mobile: string, device: Device) {
  const t = a[tablet] || a[desktop];
  if (device === 'desktop') return a[desktop];
  if (device === 'tablet') return t;
  return a[mobile] || t;
}

/** `16` + `em` → `16em`; anything not a number writes nothing (the blocks replaced wrote junk). */
const raw = (value: unknown, unit: unknown) => px(value, unit);

function listCss(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-icon-list`;
  const ITEM = `${R} .pr-icon-list-item`;
  const SOURCE = `${ITEM} .pr-icon-list__source-wrap`;
  const LABEL = `${ITEM} .pr-icon-list__label`;
  const decoration = a.fontDecoration ? `${String(a.fontDecoration)}!important` : '';
  for (const device of DEVICES) {
    const s = D(device);
    const size = px(chain(a, 'size', device), a.sizeType);
    const align = String(choice(a, 'align', 'alignTablet', 'alignMobile', device) ?? '');
    const alignment = FLEX[align] ?? 'center';
    const layout = choice(a, 'icon_layout', 'iconLayoutTablet', 'iconLayoutMobile', device);
    const position = String(
      choice(a, 'iconPosition', 'iconPositionTablet', 'iconPositionMobile', device),
    );
    const borderWidth = chain(a, 'border', device);
    emit(sheet, device, `${R} .pr-icon-list__source-image`, { width: size });
    emit(sheet, device, `${SOURCE} svg`, {
      width: size,
      height: size,
      'font-size': size,
      ...(device === 'desktop' ? { color: a.iconColor, fill: a.iconColor } : {}),
    });
    emit(sheet, device, SOURCE, {
      ...(device === 'desktop'
        ? { background: a.iconBgColor, 'border-color': a.iconBorderColor }
        : {}),
      padding: px(chain(a, 'bgSize', device), device === 'desktop' ? a.bgSizeType : 'px'),
      'border-radius': px(a[`borderRadius${s}`], device === 'desktop' ? 'px' : a.borderRadiusType),
      'border-style': (numeric(borderWidth) ?? 0) > 0 ? 'solid' : '',
      'border-width': px(borderWidth, a.borderType),
      'align-self': position === 'top' ? 'flex-start' : 'center',
    });
    emit(sheet, device, LABEL, {
      ...(device === 'desktop'
        ? {
            'font-family': a.fontFamily,
            'text-transform': a.fontTransform,
            'text-decoration': decoration,
            'font-style': a.fontStyle,
            'font-weight': a.fontWeight,
            color: a.labelColor,
          }
        : {}),
      'font-size': px(a[`fontSize${s}`], a.fontSizeType),
      'line-height': raw(a[`lineHeight${s}`], a.lineHeightType),
      'letter-spacing': px(a[`labelLetterSpacing${s}`], a.labelLetterSpacingType),
    });
    const vertical = layout === 'vertical';
    emit(sheet, device, `${R} .pr-icon-list__wrap`, {
      display: 'flex',
      'flex-direction': vertical ? 'column' : 'row',
      'justify-content': vertical ? 'center' : alignment,
      'align-items': vertical ? alignment : 'center',
      ...sidesCss(a, 'block', 'Margin', device),
      ...sidesCss(a, 'block', 'Padding', device),
    });
    emit(sheet, device, `${R} .pr-icon-list__label`, { 'text-align': a[`align${s}`] });
    const gap = chain(a, 'gap', device);
    if (layout === 'horizontal') {
      const half = numeric(gap) === null ? '' : (numeric(gap) as number) / 2;
      emit(sheet, device, ITEM, {
        'margin-left': px(half, a.gapType),
        'margin-right': px(half, a.gapType),
        display: 'inline-flex',
      });
      emit(sheet, device, `${ITEM}:first-child`, { 'margin-left': 0 });
      if (device === 'desktop') emit(sheet, device, `${ITEM}:last-child`, { 'margin-right': 0 });
    } else if (vertical) {
      emit(sheet, device, ITEM, {
        'margin-left': 0,
        'margin-right': 0,
        'margin-bottom': px(gap, a.gapType),
      });
    }
    // Space between the icon and the label.
    if (a.align === 'right' && a.hideLabel) {
      emit(sheet, device, `${R} .pr-icon-list__source-wrap`, { 'margin-right': '0px' });
    } else if (!a.hideLabel && (a.iconPlacement === 'before' || a.iconPlacement === 'after')) {
      const inner = px(device === 'desktop' ? a.inner_gap : a[`innerGap${s}`], a.innerGapType);
      emit(sheet, device, `${R} .pr-icon-list__source-wrap`, {
        [a.iconPlacement === 'after' ? 'margin-left' : 'margin-right']: inner,
      });
    }
  }
  // The items take the label's font (centered lists only center them).
  const itemFont: Declarations =
    a.align === 'center'
      ? { 'text-align': 'center' }
      : {
          'font-family': a.fontFamily,
          'text-transform': a.fontTransform,
          'text-decoration': decoration,
          'font-style': a.fontStyle,
          'font-weight': a.fontWeight,
          'font-size': px(a.fontSize, a.fontSizeType),
          'line-height': raw(a.lineHeight, a.lineHeightType),
        };
  emit(sheet, 'desktop', ITEM, itemFont);
  if (!a.hideLabel && a.iconPlacement === 'after') {
    emit(sheet, 'desktop', ITEM, { 'flex-direction': 'row-reverse' });
  }
  emit(sheet, 'desktop', `${ITEM}:hover .pr-icon-list__source-wrap svg`, {
    color: a.iconHoverColor,
    fill: a.iconHoverColor,
  });
  emit(sheet, 'desktop', `${ITEM}:hover .pr-icon-list__label`, { color: a.labelHoverColor });
  emit(sheet, 'desktop', `${ITEM}:hover .pr-icon-list__source-wrap`, {
    background: a.iconBgHoverColor,
    'border-color': a.iconBorderHoverColor,
  });
}

function ListView({ attrs: a, id, root, inner }: ViewProps) {
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-icon-list',
        'pr-icon-list',
        blockClass(id),
        a.hideLabel ? 'pr-icon-list--no-label' : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    inner({ className: 'pr-icon-list__wrap' }),
  );
}

/** Items of the oldest lists, kept in the list's `icons` attribute. */
function legacyItems(a: Attrs, block: (n: string, a: Attrs) => CxdBlock): CxdBlock[] {
  const icons = Array.isArray(a.icons) ? (a.icons as Attrs[]) : [];
  const count = numeric(a.icon_count) ?? icons.length;
  return icons.slice(0, count).map((item) =>
    block('icon-list-item', {
      label: typeof item.label === 'string' ? item.label : '',
      image_icon: item.image_icon === 'image' ? 'image' : 'icon',
      icon: item.icon ?? '',
      ...(item.image && typeof item.image === 'object' ? { image: item.image } : {}),
      ...Object.fromEntries(
        [
          'icon_color',
          'icon_hover_color',
          'icon_bg_color',
          'icon_bg_hover_color',
          'icon_border_color',
          'icon_border_hover_color',
          'label_color',
          'label_hover_color',
        ]
          .filter((k) => typeof item[k] === 'string' && item[k])
          .map((k) => [k, item[k]]),
      ),
      link: typeof item.link === 'string' ? item.link : '#',
      target: Boolean(item.target),
      // The old lists linked every item unless links were turned off.
      disableLink: !a.disableLink,
      hideLabel: Boolean(a.hideLabel),
    }),
  );
}

export const iconList: PrismaBlock = {
  name: 'icon-list',
  title: 'Icon List',
  description: 'A list of items with icons or images, stacked or in a row.',
  keywords: ['icon list', 'list', 'features', 'bullets', 'icons'],
  container: true,
  allowedBlocks: ['prisma/icon-list-item'],
  defaults: LIST_DEFAULTS,
  css: listCss,
  View: ListView,
  spectra: {
    'uagb/icon-list': (a, src) => {
      const children = src.children.length ? src.children : legacyItems(a, src.block);
      const attrs = { ...a };
      // Kept by the oldest lists only, now in their items.
      delete attrs.icons;
      delete attrs.disableLink;
      return [src.block('icon-list', attrs, children)];
    },
  },
};

// ---- Icon list item -------------------------------------------------------------------------

const ITEM_DEFAULTS: Attrs = {
  label: [{ text: 'List item' }],
  image_icon: 'icon',
  hideLabel: false,
  icon: '',
  image: '',
  imageSizeChild: '',
  imgTagHeight: '',
  fromParentIcon: 'circle-arrow-right',
  icon_color: '',
  icon_hover_color: '',
  icon_bg_color: '',
  icon_bg_hover_color: '',
  icon_border_color: '',
  icon_border_hover_color: '',
  label_color: '',
  label_hover_color: '',
  link: '#',
  target: false,
  // Spectra's name: true means the item is a link.
  disableLink: false,
  ...sideDefaults('child', 'Margin'),
  ...sideDefaults('child', 'Padding'),
  childMarginLink: false,
};

const important = (v: unknown) => (typeof v === 'string' && v ? `${v} !important` : '');

function itemCss(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-icon-list-item`;
  emit(sheet, 'desktop', `${R} .pr-icon-list__source-wrap svg`, {
    fill: important(a.icon_color),
    color: important(a.icon_color),
  });
  emit(sheet, 'desktop', `${R}:hover .pr-icon-list__source-wrap svg`, {
    fill: important(a.icon_hover_color),
    color: important(a.icon_hover_color),
  });
  emit(sheet, 'desktop', `${R} .pr-icon-list__label`, { color: important(a.label_color) });
  emit(sheet, 'desktop', `${R}:hover .pr-icon-list__label`, {
    color: important(a.label_hover_color),
  });
  emit(sheet, 'desktop', `${R} .pr-icon-list__source-wrap`, {
    background: important(a.icon_bg_color),
    'border-color': important(a.icon_border_color),
  });
  emit(sheet, 'desktop', `${R}:hover .pr-icon-list__source-wrap`, {
    background: important(a.icon_bg_hover_color),
    'border-color': important(a.icon_border_hover_color),
  });
  // Doubled class: stronger than the list's spacing of its items.
  for (const device of DEVICES) {
    emit(sheet, device, `${R}.pr-icon-list-item.pr-icon-list-item`, {
      ...sidesCss(a, 'child', 'Margin', device),
      ...sidesCss(a, 'child', 'Padding', device),
    });
  }
}

/** Plain text of rich text, for the link's name. */
function plainText(value: unknown): string {
  return Array.isArray(value)
    ? (value as { text?: unknown }[])
        .map((n) => (typeof n.text === 'string' ? n.text : ''))
        .join('')
    : '';
}

function ItemView({ attrs: a, id, root, text, editing }: ViewProps) {
  let source = null;
  if (a.image_icon === 'icon') {
    const name = a.icon || a.fromParentIcon;
    if (name) source = <Icon name={name} />;
  } else if (a.image_icon === 'image') {
    const url = mediaUrl(a.image);
    const image = a.image as { alt?: unknown } | '';
    if (url)
      source = (
        <img
          className="pr-icon-list__source-image"
          src={url}
          {...(isNum(a.imageSizeChild) ? { width: Number(a.imageSizeChild) } : {})}
          {...(isNum(a.imgTagHeight) ? { height: Number(a.imgTagHeight) } : {})}
          loading="lazy"
          alt={image && typeof image.alt === 'string' ? image.alt : ''}
        />
      );
  }
  const href = a.disableLink ? linkHref(a.link) || '/' : '';
  const hasLabel = editing || (Array.isArray(a.label) && a.label.length > 0);
  return root(
    'div',
    { className: `wp-block-prisma-icon-list-item pr-icon-list-item ${blockClass(id)}` },
    <>
      {href && !editing ? (
        // The link covers the whole item.
        <a
          href={href}
          {...(a.target ? { target: '_blank' } : {})}
          rel="noopener noreferrer"
          aria-label={plainText(a.label)}
        >
          {' '}
        </a>
      ) : null}
      {source ? <span className="pr-icon-list__source-wrap">{source}</span> : null}
      {!a.hideLabel && hasLabel
        ? text('label', {
            tagName: 'span',
            className: 'pr-icon-list__label',
            placeholder: 'Label name',
          })
        : null}
    </>,
  );
}

export const iconListItem: PrismaBlock = {
  name: 'icon-list-item',
  title: 'List Item',
  description: 'An item of an icon list: an icon or an image, a label and a link.',
  keywords: ['list item', 'icon'],
  parent: ['icon-list'],
  richAttributes: ['label'],
  defaults: ITEM_DEFAULTS,
  css: itemCss,
  View: ItemView,
  media: (a) => {
    const id = (a.image as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' ? [id] : [];
  },
  spectra: {
    'uagb/icon-list-child': (a, src) => {
      const label = savedInner(src.html, 'uagb-icon-list__label');
      return [src.block('icon-list-item', { ...a, label: label ?? '' })];
    },
  },
};
