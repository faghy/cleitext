import type { Device, Sheet } from '@cleitext/design';
import { createElement, Fragment, type ReactNode } from 'react';
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
import type { Attrs } from '../../lib/types';
import { commentsText, longDate, trimWords, type PostItem, type PostsData } from './posts';

/**
 * What the post grid and the post carousel share (and the deprecated post
 * masonry, a grid laid out in columns): attributes, CSS and each post's markup.
 */

function typo(p: string, extra: Attrs = {}): Attrs {
  return {
    [`${p}FontSize`]: '',
    [`${p}FontSizeType`]: 'px',
    [`${p}FontSizeTablet`]: '',
    [`${p}FontSizeMobile`]: '',
    [`${p}FontFamily`]: '',
    [`${p}FontWeight`]: '',
    [`${p}FontStyle`]: '',
    [`${p}LineHeightType`]: 'em',
    [`${p}LineHeight`]: '',
    [`${p}LineHeightTablet`]: '',
    [`${p}LineHeightMobile`]: '',
    [`${p}LoadGoogleFonts`]: false,
    [`${p}Transform`]: '',
    [`${p}Decoration`]: '',
    [`${p}LetterSpacing`]: '',
    [`${p}LetterSpacingTablet`]: '',
    [`${p}LetterSpacingMobile`]: '',
    [`${p}LetterSpacingType`]: 'px',
    ...extra,
  };
}

/** The parts of a post, in Spectra's default order. */
export const PARTS = ['image', 'taxonomy', 'title', 'meta', 'excerpt', 'button'] as const;
export type Part = (typeof PARTS)[number];

/** Attributes of every post block (grid, carousel), with Spectra's defaults. */
export const POST_DEFAULTS: Attrs = {
  // Query.
  postType: 'article',
  taxonomyType: 'category',
  categories: '',
  postsToShow: 6,
  enableOffset: false,
  postsOffset: 0,
  order: 'desc',
  orderBy: 'date',
  excludeCurrentPost: false,
  /** Custom fields shown under the title: one per line, `key` or `key: Label`. */
  customFields: '',
  /** With the picture beside the text: on the left and on the right, one post after the other. */
  alternate: false,
  postDisplaytext: 'No post found!',
  columns: 3,
  tcolumns: 2,
  mcolumns: 1,
  equalHeight: true,
  layoutConfig: [...PARTS],
  // Image.
  displayPostImage: true,
  imgSize: 'large',
  imgPosition: 'top',
  linkBox: false,
  bgOverlayColor: '#000000',
  overlayOpacity: '50',
  // Content.
  displayPostTitle: true,
  titleTag: 'h4',
  displayPostAuthor: false,
  displayPostDate: true,
  displayPostComment: true,
  displayPostTaxonomy: false,
  displayPostTaxonomyAboveTitle: 'withMeta',
  taxStyle: 'default',
  taxDivider: ', ',
  hideTaxonomyIcon: true,
  displayPostExcerpt: true,
  displayPostContentRadio: 'excerpt',
  excerptLength: 15,
  // Read more.
  displayPostLink: true,
  newTab: false,
  ctaText: 'Read More',
  inheritFromTheme: true,
  inheritFromThemeBtn: false,
  buttonType: 'primary',
  // Layout.
  align: 'left',
  width: 'wide',
  bgType: 'color',
  bgColor: '#f6f6f6',
  rowGap: 20,
  rowGapTablet: '',
  rowGapMobile: '',
  rowGapUnit: 'px',
  columnGap: 20,
  columnGapTablet: '',
  columnGapMobile: '',
  columnGapUnit: 'px',
  contentPadding: 20,
  contentPaddingMobile: '',
  contentPaddingUnit: 'px',
  paddingTop: 20,
  paddingBottom: 20,
  paddingRight: 20,
  paddingLeft: 20,
  paddingTopTablet: '',
  paddingRightTablet: '',
  paddingBottomTablet: '',
  paddingLeftTablet: '',
  paddingUnit: 'px',
  mobilePaddingUnit: 'px',
  tabletPaddingUnit: 'px',
  spacingLink: '',
  // Colors and spacing of the parts.
  titleColor: '',
  metaColor: '',
  highlightedTextColor: '#fff',
  highlightedTextBgColor: '#3182ce',
  excerptColor: '',
  ctaColor: '',
  ctaBgType: 'color',
  ctaBgHType: 'color',
  ctaBgColor: '',
  ctaHColor: '',
  ctaBgHColor: '',
  btnVPadding: '',
  btnHPadding: '',
  paddingBtnTopTablet: '',
  paddingBtnRightTablet: '',
  paddingBtnBottomTablet: '',
  paddingBtnLeftTablet: '',
  paddingBtnTopMobile: '',
  paddingBtnRightMobile: '',
  paddingBtnBottomMobile: '',
  paddingBtnLeftMobile: '',
  paddingBtnUnit: 'px',
  mobilePaddingBtnUnit: 'px',
  tabletPaddingBtnUnit: 'px',
  spacingLinkPadding: '',
  ctaBottomSpace: 0,
  ctaBottomSpaceTablet: '',
  ctaBottomSpaceMobile: '',
  ctaBottomSpaceUnit: 'px',
  imageBottomSpace: 15,
  imageBottomSpaceTablet: '',
  imageBottomSpaceMobile: '',
  imageBottomSpaceUnit: 'px',
  taxonomyBottomSpace: '',
  taxonomyBottomSpaceTablet: '',
  taxonomyBottomSpaceMobile: '',
  taxonomyBottomSpaceUnit: 'px',
  titleBottomSpace: 15,
  titleBottomSpaceTablet: '',
  titleBottomSpaceMobile: '',
  titleBottomSpaceUnit: 'px',
  metaBottomSpace: 15,
  metaBottomSpaceTablet: '',
  metaBottomSpaceMobile: '',
  metaBottomSpaceUnit: 'px',
  excerptBottomSpace: 25,
  excerptBottomSpaceTablet: '',
  excerptBottomSpaceMobile: '',
  excerptBottomSpaceUnit: 'px',
  ...typo('title'),
  ...typo('meta'),
  ...typo('excerpt'),
  ...typo('cta'),
  // Shadow and borders.
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
  ...borderDefaults('btn'),
  ...borderDefaults('overall'),
  // Older single border of the button, before the border settings.
  borderWidth: '',
  borderStyle: 'none',
  borderColor: '',
  borderHColor: '',
  borderRadius: '',
};

/** The layout of the parts, as saved (`['image', …]`, or Spectra's `[['uagb/post-image'], …]`). */
export function partsOf(value: unknown): Part[] {
  if (!Array.isArray(value)) return [...PARTS];
  const out: Part[] = [];
  for (const item of value) {
    const raw = Array.isArray(item) ? item[0] : item;
    const name = typeof raw === 'string' ? raw.replace(/^uagb\/post-/, '') : '';
    if ((PARTS as readonly string[]).includes(name) && !out.includes(name as Part))
      out.push(name as Part);
  }
  return out;
}

// ---- CSS -------------------------------------------------------------------------------

/** A value, or the fallback when it was never set (`undefined`/`null`). */
const pick = (value: unknown, fallback: unknown) =>
  value === undefined || value === null ? fallback : value;
/** PHP's `(int)` of a value. */
const int = (value: unknown) => Math.trunc(numeric(value) ?? 0);
/** A number, else the block's default. */
const num = (value: unknown, fallback: number) => numeric(value) ?? fallback;

/** Spectra's box shadow: nothing without a color, or when all sizes are 0. */
export function shadow(a: Attrs, hover: boolean): string {
  const h = hover ? 'Hover' : '';
  const color = clean(a[`boxShadowColor${h}`]) || (hover ? clean(a.boxShadowColor) : '');
  if (!color) return '';
  const sizes = ['HOffset', 'VOffset', 'Blur', 'Spread'].map(
    (k) => numeric(a[`boxShadow${k}${h}`]) ?? 0,
  );
  if (sizes.every((s) => s === 0)) return '';
  const [x, y, blur, spread] = sizes.map((s) => (s === 0 ? '0' : `${s}px`));
  return `${x} ${y} ${blur}${sizes[3] ? ` ${spread}` : ''} ${color}${a[`boxShadowPosition${h}`] === 'inset' ? ' inset' : ''}`;
}

/** The button's border, with the older single border as fallback. */
function buttonBorder(a: Attrs, device: Device) {
  const css = border(a, 'btn', device);
  if (device !== 'desktop' || a.btnBorderStyle === 'default') return css;
  const width = px(a.borderWidth);
  const radius = px(a.borderRadius);
  for (const side of ['top', 'left', 'right', 'bottom']) {
    if (!css[`border-${side}-width`] && width) css[`border-${side}-width`] = width;
  }
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    if (!css[`border-${corner}-radius`] && radius) css[`border-${corner}-radius`] = radius;
  }
  css['border-color'] = css['border-color'] || a.borderColor;
  css['border-style'] = css['border-style'] || a.borderStyle;
  return css;
}

const SFX = (d: Device) => (d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile');

/**
 * The CSS of the posts (Spectra's shared post selectors), per device: the
 * grid pads each post, the other layouts space the posts and pad the texts.
 */
export function postCss(a: Attrs, B: string, sheet: Sheet, kind: 'grid' | 'carousel'): void {
  const G = `${B}.pr-post-grid--grid`;
  const N = `${B}:not(.pr-post-grid--grid)`;
  const ltr = kind === 'grid' && Boolean(a.isLeftToRightLayout);
  const rowGap = num(a.rowGap, 20);
  const columnGap = num(a.columnGap, 20);
  for (const device of DEVICES) {
    const s = SFX(device);
    const d = device === 'desktop';
    const padUnit = d
      ? a.contentPaddingUnit
      : device === 'tablet'
        ? a.tabletPaddingUnit
        : a.mobilePaddingUnit;
    const content = device === 'mobile' ? a.contentPaddingMobile : a.contentPadding;
    const pt = pick(a[`paddingTop${s}`], content);
    const pr = pick(a[`paddingRight${s}`], content);
    const pb = pick(a[`paddingBottom${s}`], content);
    const pl = pick(a[`paddingLeft${s}`], content);
    const rg = d ? rowGap : (numeric(a[`rowGap${s}`]) ?? rowGap);
    const cg = d ? columnGap : (numeric(a[`columnGap${s}`]) ?? columnGap);
    const cols = d ? a.columns : device === 'tablet' ? a.tcolumns : a.mcolumns;
    emit(sheet, device, `${B}.wp-block-prisma-post-grid.pr-post-grid--grid`, {
      'grid-template-columns': `repeat(${Math.max(1, int(cols) || 1)} , minmax(0, 1fr))`,
    });
    emit(sheet, device, `${G} .pr-post`, {
      'padding-top': px(pt, padUnit),
      'padding-bottom': px(pb, padUnit),
      'padding-left': px(pl, padUnit),
      'padding-right': px(pr, padUnit),
      ...(d ? { 'box-shadow': shadow(a, false) } : {}),
      ...border(a, 'overall', device),
    });
    if (!ltr) {
      emit(sheet, device, `${G} .pr-post .pr-post__image:first-child`, {
        'margin-left': px(-int(pl), padUnit),
        'margin-right': px(-int(pr), padUnit),
        'margin-top': px(-int(pt), padUnit),
      });
    }
    emit(sheet, device, `${G}`, {
      'row-gap': px(rg, a.rowGapUnit),
      'column-gap': px(cg, a.columnGapUnit),
    });
    // The other layouts: the row gap between columns (Spectra's naming), the column gap below.
    emit(sheet, device, `${N} .pr-post`, {
      'padding-right': px(Math.trunc(rg / 2), a.rowGapUnit),
      'padding-left': px(Math.trunc(rg / 2), a.rowGapUnit),
      'margin-bottom': px(cg, a.columnGapUnit),
    });
    emit(sheet, device, `${B}:not(.wp-block-prisma-post-carousel):not(.pr-post-grid--grid)`, {
      'margin-right': px(-Math.trunc(rg) / 2, a.rowGapUnit),
      'margin-left': px(-Math.trunc(rg) / 2, a.rowGapUnit),
    });
    emit(sheet, device, `${N} .pr-post ${d ? '> ' : ''}.pr-post__text:last-child`, {
      'margin-bottom': px(pb, padUnit),
    });
    emit(sheet, device, `${N} .pr-post ${d ? '> ' : ''}.pr-post__text:first-child`, {
      'margin-top': px(pt, padUnit),
    });
    emit(
      sheet,
      device,
      `${N}.pr-post-grid--image-background .pr-post .pr-post__text:nth-last-child(2)`,
      {
        'margin-bottom': px(pb, padUnit),
      },
    );
    emit(sheet, device, `${N} .pr-post ${d ? '> ' : ''}.pr-post__text`, {
      'margin-left': px(pl, padUnit),
      'margin-right': px(pr, padUnit),
    });
    // The image behind a post of the other layouts covers its box, not the gap.
    emit(sheet, device, `${N}.pr-post-grid--image-background .pr-post`, {
      '--pr-post-gap': px(Math.trunc(rg / 2), a.rowGapUnit),
    });
    // Spaces below the parts.
    const space = (name: string, fallback: number | null) =>
      px(d && fallback !== null ? num(a[name], fallback) : a[`${name}${s}`], a[`${name}Unit`]);
    const P = d ? `${B}` : `${B} .pr-post`;
    emit(sheet, device, `${P} .pr-post__cta`, { 'padding-bottom': space('ctaBottomSpace', 0) });
    emit(sheet, device, `${P} .pr-post__image`, {
      'padding-bottom': space('imageBottomSpace', 15),
    });
    emit(sheet, device, `${P} .pr-post__title`, {
      'padding-bottom': space('titleBottomSpace', 15),
    });
    emit(sheet, device, `${P} .pr-post__meta`, { 'padding-bottom': space('metaBottomSpace', 15) });
    emit(sheet, device, `${P} .pr-post__excerpt`, {
      'padding-bottom': space('excerptBottomSpace', 25),
    });
    if (a.displayPostTaxonomyAboveTitle === 'aboveTitle') {
      const tax = px(a[`taxonomyBottomSpace${s}`], a.taxonomyBottomSpaceUnit);
      emit(sheet, device, `${B} span.pr-post__taxonomy`, { 'padding-bottom': tax });
      emit(sheet, device, `${B} .pr-post span.pr-post__taxonomy--highlighted`, {
        'margin-bottom': tax,
      });
    }
    // Typography of the parts.
    emit(
      sheet,
      device,
      `${B} .pr-post__text.pr-post__title, ${B} .pr-post__text.pr-post__title a`,
      typography(a, 'title', device),
    );
    emit(
      sheet,
      device,
      [
        `${B} .pr-post__meta > span`,
        `${B} .pr-post__meta time`,
        `${B} .pr-post__meta .pr-post__author`,
        `${B} .pr-post__meta .pr-post__author a`,
        `${B} span.pr-post__taxonomy`,
        `${B} .pr-post .pr-post__taxonomy--highlighted`,
        ...(kind === 'carousel' ? [`${B} .pr-post__taxonomy`] : []),
      ].join(', '),
      typography(a, 'meta', device),
    );
    emit(sheet, device, `${B} .pr-post__text.pr-post__excerpt`, typography(a, 'excerpt', device));
    if (!a.inheritFromThemeBtn) {
      emit(
        sheet,
        device,
        `${B} .pr-post__text.pr-post__cta, ${B} .pr-post__text.pr-post__cta a`,
        typography(a, 'cta', device),
      );
      const link = `${B}.pr-post-grid .wp-block-button.pr-post__cta .wp-block-button__link`;
      emit(sheet, device, link, buttonBorder(a, device));
      if (d) {
        emit(sheet, device, link, {
          color: a.ctaColor,
          background: a.ctaBgType === 'color' ? a.ctaBgColor : 'transparent',
        });
        emit(sheet, device, `${B}.pr-post-grid .pr-post .wp-block-button.pr-post__cta a`, {
          color: a.ctaColor,
          'padding-top': px(pick(a.paddingBtnTop, a.btnVPadding), a.paddingBtnUnit),
          'padding-bottom': px(pick(a.paddingBtnBottom, a.btnVPadding), a.paddingBtnUnit),
          'padding-left': px(pick(a.paddingBtnLeft, a.btnHPadding), a.paddingBtnUnit),
          'padding-right': px(pick(a.paddingBtnRight, a.btnHPadding), a.paddingBtnUnit),
        });
      } else if (device === 'tablet') {
        // As Spectra: the button's tablet padding, none of its own on phones.
        emit(sheet, device, `${B} .pr-post__cta a`, {
          'padding-top': px(pick(a.paddingBtnTopTablet, a.btnVPadding), a.tabletPaddingBtnUnit),
          'padding-bottom': px(
            pick(a.paddingBtnBottomTablet, a.btnVPadding),
            a.tabletPaddingBtnUnit,
          ),
          'padding-left': px(pick(a.paddingBtnLeftTablet, a.btnHPadding), a.tabletPaddingBtnUnit),
          'padding-right': px(pick(a.paddingBtnRightTablet, a.btnHPadding), a.tabletPaddingBtnUnit),
        });
      }
    }
  }
  // Desktop only from here.
  if (a.useSeparateBoxShadows)
    emit(sheet, 'desktop', `${G} .pr-post:hover`, { 'box-shadow': shadow(a, true) });
  emit(sheet, 'desktop', `${B} .pr-post`, { background: a.bgColor, 'text-align': a.align });
  emit(sheet, 'desktop', `${B} .pr-post:hover`, { 'border-color': a.overallBorderHColor });
  emit(sheet, 'desktop', `${B} .pr-post__image::before`, {
    'background-color': a.bgOverlayColor,
    opacity: num(a.overlayOpacity, 50) / 100,
  });
  emit(
    sheet,
    'desktop',
    `${B} .pr-post__text.pr-post__title, ${B} .pr-post__text.pr-post__title a`,
    {
      color: a.titleColor,
    },
  );
  emit(
    sheet,
    'desktop',
    `${B} .pr-post__text.pr-post__meta, ${B} .pr-post__meta .pr-post__author, ${B} .pr-post__meta .pr-post__author a, ${B} .pr-post .pr-post__taxonomy, ${B} .pr-post .pr-post__taxonomy a`,
    { color: a.metaColor },
  );
  emit(
    sheet,
    'desktop',
    `${B} .pr-post .pr-post__taxonomy--highlighted, ${B} .pr-post .pr-post__taxonomy--highlighted a`,
    {
      color: a.highlightedTextColor,
    },
  );
  emit(sheet, 'desktop', `${B} .pr-post .pr-post__taxonomy--highlighted`, {
    background: a.highlightedTextBgColor,
  });
  emit(sheet, 'desktop', `${B} .pr-post__text.pr-post__excerpt`, { color: a.excerptColor });
  if (!a.inheritFromThemeBtn) {
    const hover = a.ctaBgHType === 'color' ? a.ctaBgHColor : 'transparent';
    emit(
      sheet,
      'desktop',
      `${B}.pr-post-grid .wp-block-button.pr-post__cta:hover .wp-block-button__link`,
      {
        'border-color': a.btnBorderHColor,
        color: a.ctaHColor,
        background: hover,
      },
    );
    emit(sheet, 'desktop', `${B} .pr-post__text.pr-post__cta:hover a.pr-post__link`, {
      color: a.ctaHColor,
      'border-color': a.btnBorderHColor,
    });
    emit(sheet, 'desktop', `${B} .pr-post__text.pr-post__cta a.pr-post__link:focus`, {
      color: a.ctaHColor,
      background: hover,
      'border-color': a.btnBorderHColor,
    });
  }
}

// ---- Markup ----------------------------------------------------------------------------

const TITLE_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p'];
const RATIOS = ['inherit', '1-1', '2-3', '9-16', '1-2'];

/** The root classes of a post block. */
export function rootClasses(a: Attrs, kind: string): string[] {
  const cols = (v: unknown) => Math.min(Math.max(int(v) || 1, 1), 8);
  return [
    'pr-post-grid',
    `pr-post-grid--image-${a.imgPosition === 'background' ? 'background' : 'top'}`,
    a.displayPostImage ? 'pr-post-grid--image-on' : 'pr-post-grid--image-off',
    `pr-post-grid--${kind}`,
    `pr-post-grid--cols-${cols(a.columns)}`,
    `pr-post-grid--cols-tab-${cols(a.tcolumns)}`,
    `pr-post-grid--cols-mob-${cols(a.mcolumns)}`,
  ];
}

const link = (a: Attrs, url: string) => ({
  href: url,
  target: a.newTab ? '_blank' : '_self',
  rel: 'bookmark noopener noreferrer',
});

function Taxonomy({ post, a }: { post: PostItem; a: Attrs }) {
  if (!a.displayPostTaxonomy || post.terms.length === 0) return null;
  const above = a.displayPostTaxonomyAboveTitle === 'aboveTitle';
  const highlighted = above && a.taxStyle === 'highlighted';
  const icon = a.hideTaxonomyIcon === true ? <Icon name="tag" className="pr-post__icon" /> : null;
  if (highlighted) {
    return (
      <div className="pr-post__text">
        {post.terms.map((t, i) => (
          <span key={i} className="pr-post__taxonomy pr-post__taxonomy--highlighted">
            {icon}
            <a href={t.url}>{t.name}</a>
          </span>
        ))}
      </div>
    );
  }
  const divider = above ? `${String(a.taxDivider ?? ', ')}\u00a0` : ',\u00a0';
  return (
    <div className="pr-post__text">
      <span className={`pr-post__taxonomy${above ? ' pr-post__taxonomy--default' : ''}`}>
        {icon}
        {post.terms.map((t, i) => (
          <span key={i} className="pr-post__term">
            {i > 0 ? divider : null}
            <a href={t.url}>{t.name}</a>
          </span>
        ))}
      </span>
    </div>
  );
}

function Meta({ post, a, locale }: { post: PostItem; a: Attrs; locale: string }) {
  const icons = a.hideTaxonomyIcon === true;
  return (
    <div className="pr-post__text pr-post__meta">
      {a.displayPostAuthor && post.author ? (
        <span className="pr-post__author">
          {icons ? <Icon name="user" className="pr-post__icon" /> : null}
          {post.author.url ? (
            <a href={post.author.url} rel="author">
              {post.author.name}
            </a>
          ) : (
            post.author.name
          )}
        </span>
      ) : null}
      {a.displayPostDate && post.date ? (
        <time dateTime={post.date} className="pr-post__date">
          {icons ? <Icon name="calendar" className="pr-post__icon" /> : null}
          {longDate(post.date, locale)}
        </time>
      ) : null}
      {a.displayPostComment && post.comments !== null ? (
        <span className="pr-post__comments">
          {icons ? <Icon name="comment" className="pr-post__icon" /> : null}
          {commentsText(post.comments, locale)}
        </span>
      ) : null}
      {a.displayPostTaxonomyAboveTitle !== 'aboveTitle' ? <Taxonomy post={post} a={a} /> : null}
    </div>
  );
}

function part(name: Part, post: PostItem, a: Attrs, kind: string, locale: string): ReactNode {
  switch (name) {
    case 'image': {
      const background = a.imgPosition === 'background';
      if (!a.displayPostImage || (!post.image && !background)) return null;
      const ratio = RATIOS.includes(String(a.imageRatio)) ? String(a.imageRatio) : 'inherit';
      return (
        <div key="image" className="pr-post__image">
          {post.image ? (
            <a
              {...link(a, post.url)}
              {...(kind === 'grid' && !background
                ? { className: `pr-post__ratio pr-post__ratio--${ratio}` }
                : {})}
            >
              <img
                src={post.image.src}
                alt={post.image.alt}
                {...(post.image.width
                  ? { width: post.image.width, height: post.image.height }
                  : {})}
                {...(post.image.srcSet
                  ? { srcSet: post.image.srcSet, sizes: '(max-width: 1024px) 100vw, 1024px' }
                  : {})}
                loading="lazy"
                decoding="async"
              />
            </a>
          ) : null}
        </div>
      );
    }
    case 'taxonomy':
      return a.displayPostTaxonomyAboveTitle === 'aboveTitle' ? (
        <Taxonomy key="taxonomy" post={post} a={a} />
      ) : null;
    case 'title': {
      if (!a.displayPostTitle) return null;
      const tag = TITLE_TAGS.includes(String(a.titleTag)) ? String(a.titleTag) : 'h4';
      const title = createElement(
        tag,
        { key: 'title', className: 'pr-post__title pr-post__text' },
        <a {...link(a, post.url)}>{post.title}</a>,
      );
      // The custom fields chosen for the block, right under the title.
      return post.fields?.length ? (
        <Fragment key="title">
          {title}
          <dl className="pr-post__text pr-post__fields">
            {post.fields.map((f, i) => (
              <div key={i} className="pr-post__field">
                {f.label ? <dt>{f.label}</dt> : null}
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </Fragment>
      ) : (
        title
      );
    }
    case 'meta':
      return <Meta key="meta" post={post} a={a} locale={locale} />;
    case 'excerpt': {
      if (!a.displayPostExcerpt) return null;
      const full = a.displayPostContentRadio === 'full_post';
      return (
        <div key="excerpt" className="pr-post__text pr-post__excerpt">
          {full && post.content.length
            ? post.content.map((p, i) => <p key={i}>{p}</p>)
            : trimWords(post.excerpt, a.excerptLength)}
        </div>
      );
    }
    case 'button': {
      if (!a.displayPostLink) return null;
      const outline = Boolean(a.inheritFromThemeBtn) && a.buttonType === 'secondary';
      return (
        <div
          key="button"
          className={`pr-post__text pr-post__cta wp-block-button${outline ? ' is-style-outline' : ''}`}
        >
          <a className="wp-block-button__link pr-post__link" {...link(a, post.url)}>
            {String(a.ctaText ?? '') || 'Read More'}
          </a>
        </div>
      );
    }
  }
}

/** One post, its parts in the chosen order. */
export function PostArticle({
  post,
  a,
  kind,
  locale,
  index = 0,
}: {
  post: PostItem;
  a: Attrs;
  kind: string;
  locale: string;
  /** Its place in the list: every other post is mirrored with `alternate`. */
  index?: number;
}) {
  const order = partsOf(a.layoutConfig);
  let body: ReactNode;
  if (kind === 'grid' && a.isLeftToRightLayout) {
    body = (
      <>
        {order.filter((p) => p === 'image').map((p) => part(p, post, a, kind, locale))}
        <div className="pr-post__content">
          {order.filter((p) => p !== 'image').map((p) => part(p, post, a, kind, locale))}
        </div>
      </>
    );
  } else {
    // A background image comes last: the first part gets the top space.
    const background = a.imgPosition === 'background';
    body = [
      ...order
        .filter((p) => !(background && p === 'image'))
        .map((p) => part(p, post, a, kind, locale)),
      background && order.includes('image') ? part('image', post, a, kind, locale) : null,
    ];
  }
  return (
    <article
      className={`pr-post${a.alternate && a.isLeftToRightLayout && index % 2 === 1 ? ' pr-post--reverse' : ''}`}
    >
      {body}
      {a.linkBox ? (
        <a className="pr-post__box-link" {...link(a, post.url)} aria-label={post.title} />
      ) : null}
    </article>
  );
}

/** Page links as WordPress's `paginate_links` (4 at the ends, 4 around the current one). */
export function Pagination({ data, a }: { data: PostsData; a: Attrs }) {
  const { page, pages, param } = data;
  if (pages <= 1) return null;
  const href = (n: number) => `?${param}=${n}`;
  const items: ReactNode[] = [];
  if (page > 1)
    items.push(
      <a key="prev" className="pr-post-grid__page pr-post-grid__page--prev" href={href(page - 1)}>
        {String(a.paginationPrevText ?? '« Previous')}
      </a>,
    );
  let dots = false;
  for (let n = 1; n <= pages; n++) {
    if (n === page) {
      items.push(
        <span
          key={n}
          aria-current="page"
          className="pr-post-grid__page pr-post-grid__page--current"
        >
          {n}
        </span>,
      );
      dots = true;
    } else if (n <= 4 || n > pages - 4 || Math.abs(n - page) <= 4) {
      items.push(
        <a key={n} className="pr-post-grid__page" href={href(n)}>
          {n}
        </a>,
      );
      dots = true;
    } else if (dots) {
      items.push(
        <span key={`dots${n}`} className="pr-post-grid__page pr-post-grid__page--dots">
          …
        </span>,
      );
      dots = false;
    }
  }
  if (page < pages)
    items.push(
      <a key="next" className="pr-post-grid__page pr-post-grid__page--next" href={href(page + 1)}>
        {String(a.paginationNextText ?? 'Next »')}
      </a>,
    );
  return <>{items}</>;
}

/** What the editor shows while the posts load or when there are none. */
export function EmptyNote({ loading, text }: { loading: boolean; text: unknown }) {
  return <p className="pr-post-grid__empty">{loading ? 'Loading posts…' : String(text ?? '')}</p>;
}
