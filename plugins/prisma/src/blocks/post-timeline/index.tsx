import type { Sheet } from '@cleitext/design';
import { createElement } from 'react';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, typography } from '../../lib/emit';
import { Icon } from '../../lib/icons';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import {
  loadPosts,
  phpDate,
  postsData,
  termSlugs,
  trimWords,
  useEditorPosts,
  type PostsData,
} from '../post-grid/posts';

function typo(p: string, size: unknown = ''): Attrs {
  return {
    [`${p}FontSizeType`]: 'px',
    [`${p}FontSize`]: size,
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
  };
}

const DEFAULTS: Attrs = {
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
  // Content.
  displayPostDate: true,
  dateFormat: 'F j, Y',
  displayPostExcerpt: true,
  exerptLength: 15,
  displayPostAuthor: true,
  displayPostImage: true,
  imageSize: 'large',
  displayPostLink: true,
  readMoreText: 'Read More',
  linkTarget: false,
  headingTag: 'h3',
  inheritFromTheme: false,
  buttonType: 'primary',
  icon: 'calendar-days',
  // Layout.
  align: '',
  alignTablet: '',
  alignMobile: '',
  timelinAlignment: 'center',
  timelinAlignmentTablet: '',
  timelinAlignmentMobile: '',
  arrowlinAlignment: 'center',
  stack: 'tablet',
  // Colors.
  headingColor: '',
  subHeadingColor: '',
  separatorBg: '#eee',
  backgroundColor: '#eee',
  separatorColor: '#eee',
  separatorFillColor: '#0693e3',
  separatorBorder: '#eee',
  borderFocus: '#5cb85c',
  iconColor: '#333',
  iconFocus: '#fff',
  iconBgFocus: '#0693e3',
  dateColor: '#333',
  authorColor: '#333',
  ctaColor: '',
  ctaBackground: '',
  // Spacing and sizes.
  horizontalSpace: 10,
  horizontalSpaceTablet: '',
  horizontalSpaceMobile: '',
  horizontalSpaceUnit: 'px',
  horizontalSpaceUnitTablet: 'px',
  horizontalSpaceUnitMobile: 'px',
  verticalSpace: 15,
  verticalSpaceTablet: '',
  verticalSpaceMobile: '',
  verticalSpaceUnit: 'px',
  verticalSpaceUnitTablet: 'px',
  verticalSpaceUnitMobile: 'px',
  headSpace: 5,
  headSpaceTablet: '',
  headSpaceMobile: '',
  contentSpace: 15,
  authorSpace: 5,
  authorSpaceTablet: '',
  authorSpaceMobile: '',
  separatorwidth: 3,
  borderwidth: 0,
  connectorBgsize: 35,
  dateBottomspace: 5,
  dateBottomspaceTablet: '',
  dateBottomspaceMobile: '',
  borderRadius: 2,
  borderRadiusTablet: 0,
  borderRadiusMobile: 0,
  bgPadding: 20,
  contentPadding: 10,
  ctaBottomSpacing: 0,
  ctaBottomSpacingTablet: '',
  ctaBottomSpacingMobile: '',
  headTopSpacing: 0,
  headTopSpacingTablet: '',
  headTopSpacingMobile: '',
  iconSize: 15,
  topMarginTablet: '',
  rightMarginTablet: '',
  bottomMarginTablet: '',
  leftMarginTablet: '',
  topMarginMobile: '',
  rightMarginMobile: '',
  bottomMarginMobile: '',
  leftMarginMobile: '',
  marginUnit: 'px',
  mobileMarginUnit: 'px',
  tabletMarginUnit: 'px',
  marginLink: false,
  topPaddingTablet: '',
  rightPaddingTablet: '',
  bottomPaddingTablet: '',
  leftPaddingTablet: '',
  topPaddingMobile: '',
  rightPaddingMobile: '',
  bottomPaddingMobile: '',
  leftPaddingMobile: '',
  paddingUnit: 'px',
  mobilePaddingUnit: 'px',
  tabletPaddingUnit: 'px',
  paddingLink: false,
  // Typography (the date's older size first).
  dateFontsizeType: 'px',
  dateFontsize: 12,
  dateFontsizeTablet: '',
  dateFontsizeMobile: '',
  ...typo('date'),
  dateFontSizeType: '',
  ...typo('head'),
  ...typo('subHead'),
  ...typo('author', 11),
  ...typo('cta'),
};

const ALIGNMENTS = ['left', 'right', 'center'];
const alignmentOf = (v: unknown, fallback: string) =>
  ALIGNMENTS.includes(String(v)) ? String(v) : fallback;

/** The timeline's side for each device (tablet ← desktop, phone ← tablet). */
export function alignments(a: Attrs) {
  const desktop = alignmentOf(a.timelinAlignment, 'center');
  const tablet = alignmentOf(a.timelinAlignmentTablet, desktop);
  return { desktop, tablet, mobile: alignmentOf(a.timelinAlignmentMobile, tablet) };
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const S = `${B}.pr-post-timeline`;
  const n = (v: unknown, fallback: number) => numeric(v) ?? fallback;
  const connector = n(a.connectorBgsize, 35);
  const pick = (v: unknown, fallback: unknown) => (v === undefined || v === null ? fallback : v);
  const hs = a.horizontalSpace;
  const dateSize = a.dateFontSize !== '' ? a.dateFontSize : a.dateFontsize;
  const dateUnit = a.dateFontSizeType !== '' ? a.dateFontSizeType : a.dateFontsizeType;
  const align = (v: unknown) => (typeof v === 'string' ? v : '');
  // Desktop.
  emit(sheet, 'desktop', `${S} .pr-post-timeline__heading`, {
    'margin-top': px(n(a.headTopSpacing, 0)),
    'margin-bottom': px(n(a.headSpace, 5)),
    'text-align': align(a.align),
  });
  emit(
    sheet,
    'desktop',
    [
      `${S} .pr-post-timeline__cta`,
      `${S} .pr-post-timeline__image`,
      `${S} .pr-post-timeline__day`,
      `${S} .pr-post-timeline__heading a`,
    ].join(', '),
    { 'text-align': align(a.align) },
  );
  emit(sheet, 'desktop', `${S} .pr-post-timeline__heading a`, { color: a.headingColor });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__desc`, {
    'text-align': align(a.align),
    color: a.subHeadingColor,
  });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__author`, {
    color: a.authorColor,
    'text-align': align(a.align),
  });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__author-icon`, {
    color: a.authorColor,
    'font-size': px(a.authorFontSize, a.authorFontSizeType),
    'font-weight': a.authorFontWeight,
    'line-height': px(a.authorLineHeight, a.authorLineHeightType),
  });
  emit(sheet, 'desktop', `${S}.pr-post-timeline--cta .pr-post-timeline__desc`, {
    'margin-bottom': px(a.contentSpace),
    'margin-top': px(a.authorSpace),
  });
  emit(
    sheet,
    'desktop',
    `${S} .pr-post-timeline__author + .pr-post-timeline__desc, ${S} .pr-post-timeline__author ~ .pr-post-timeline__cta`,
    {
      'margin-top': px(a.authorSpace),
    },
  );
  // The card's color, for the arrow pointing to the connector.
  emit(sheet, 'desktop', S, { '--pr-post-timeline-card': a.backgroundColor });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__line-inner`, {
    'background-color': a.separatorFillColor,
  });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__line`, {
    'background-color': a.separatorColor,
    width: px(n(a.separatorwidth, 3)),
  });
  emit(sheet, 'desktop', `${S}.pr-post-timeline--right .pr-post-timeline__line`, {
    'inset-inline-end': `calc( ${connector}px / 2 )`,
  });
  emit(sheet, 'desktop', `${S}.pr-post-timeline--left .pr-post-timeline__line`, {
    'inset-inline-start': `calc( ${connector}px / 2 )`,
  });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__marker`, {
    'background-color': a.separatorBg,
    'min-height': px(connector),
    'min-width': px(connector),
    'line-height': px(connector),
    border: `${n(a.borderwidth, 0)}px solid ${String(a.separatorBorder ?? '')}`,
  });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__arrow`, { height: px(connector) });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__date--inner`, {
    'margin-bottom': px(n(a.dateBottomspace, 5)),
    color: a.dateColor,
    'text-align': align(a.align),
  });
  emit(sheet, 'desktop', `${S}.pr-post-timeline--left .pr-post-timeline__day`, {
    'margin-left': px(hs, a.marginUnit),
  });
  emit(sheet, 'desktop', `${S}.pr-post-timeline--right .pr-post-timeline__day`, {
    'margin-right': px(hs, a.marginUnit),
  });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__date--outer`, {
    color: a.dateColor,
    'font-size': px(dateSize, dateUnit),
  });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__card`, {
    'background-color': a.backgroundColor,
    'border-radius': px(n(a.borderRadius, 2)),
  });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__content`, {
    'padding-left': px(pick(a.leftPadding, a.bgPadding), a.paddingUnit),
    'padding-right': px(pick(a.rightPadding, a.bgPadding), a.paddingUnit),
    'padding-top': px(pick(a.topPadding, a.bgPadding), a.paddingUnit),
    'padding-bottom': px(pick(a.bottomPadding, a.bgPadding), a.paddingUnit),
    'text-align': align(a.align),
  });
  const icon = px(n(a.iconSize, 15));
  emit(sheet, 'desktop', `${S} .pr-post-timeline__icon svg`, {
    color: a.iconColor,
    'font-size': icon,
    width: icon,
    height: icon,
    fill: a.iconColor,
  });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__marker.is-in-view svg`, {
    fill: a.iconFocus,
    color: a.iconFocus,
  });
  emit(sheet, 'desktop', `${S} .pr-post-timeline__marker.is-in-view`, {
    background: a.iconBgFocus,
    'border-color': a.borderFocus,
  });
  if (!a.inheritFromTheme) {
    emit(sheet, 'desktop', `${S} .pr-post-timeline__link`, {
      color: a.ctaColor,
      'background-color': a.ctaBackground,
    });
  }
  // By device.
  for (const device of DEVICES) {
    const d = device === 'desktop';
    const s = d ? '' : device === 'tablet' ? 'Tablet' : 'Mobile';
    emit(sheet, device, `${S}.pr-post-timeline--center .pr-post-timeline__marker`, {
      'margin-left': d ? px(hs, a.horizontalSpaceUnit) : 0,
      'margin-right': d ? px(hs, a.horizontalSpaceUnit) : 0,
    });
    emit(sheet, device, `${S} .pr-post-timeline__item:not(:last-child)`, {
      'margin-bottom': px(a[`verticalSpace${s}`], a[`verticalSpaceUnit${s}`]),
    });
    emit(sheet, device, `${S} .pr-post-timeline__cta`, {
      'margin-bottom': px(a[`ctaBottomSpacing${s}`]),
      ...(d ? {} : { 'text-align': align(a[`align${s}`]) }),
    });
    if (!d) {
      emit(sheet, device, `${S} .pr-post-timeline__heading`, {
        'margin-top': px(a[`headTopSpacing${s}`]),
        'margin-bottom': px(a[`headSpace${s}`]),
        'text-align': align(a[`align${s}`]),
      });
      emit(
        sheet,
        device,
        `${S}.pr-post-timeline--cta .pr-post-timeline__desc, ${S} .pr-post-timeline__author ~ .pr-post-timeline__cta`,
        {
          'margin-top': px(a[`authorSpace${s}`]),
        },
      );
      emit(sheet, device, `${S} .pr-post-timeline__date--inner`, {
        'margin-bottom': px(a[`dateBottomspace${s}`]),
      });
      emit(
        sheet,
        device,
        [
          `${S} .pr-post-timeline__day`,
          `${S} .pr-post-timeline__date--inner`,
          `${S} .pr-post-timeline__image`,
          `${S} .pr-post-timeline__author`,
          `${S} .pr-post-timeline__heading a`,
          `${S} .pr-post-timeline__desc`,
        ].join(', '),
        { 'text-align': align(a[`align${s}`]) },
      );
      const unit = a[`${device}MarginUnit`];
      emit(sheet, device, `${S}.pr-post-timeline--center .pr-post-timeline__day`, {
        'margin-left': px(a[`leftMargin${s}`], unit),
        'margin-right': px(a[`rightMargin${s}`], unit),
        'margin-top': px(a[`topMargin${s}`], unit),
        'margin-bottom': px(a[`bottomMargin${s}`], unit),
      });
      const padUnit = a[`${device}PaddingUnit`];
      emit(sheet, device, `${S} .pr-post-timeline__content`, {
        'padding-left': px(a[`leftPadding${s}`], padUnit),
        'padding-right': px(a[`rightPadding${s}`], padUnit),
        'padding-top': px(a[`topPadding${s}`], padUnit),
        'padding-bottom': px(a[`bottomPadding${s}`], padUnit),
        'border-radius': px(a[`borderRadius${s}`]),
        'text-align': align(a[`align${s}`]),
      });
      emit(sheet, device, `${S} .pr-post-timeline__author-icon`, {
        'font-size': px(a[`authorFontSize${s}`], a.authorFontSizeType),
        'line-height': px(a[`authorLineHeight${s}`], a.authorLineHeightType),
      });
    }
    emit(
      sheet,
      device,
      `${S} .pr-post-timeline__date--inner, ${S} .pr-post-timeline__date--outer`,
      typography(a, 'date', device),
    );
    emit(sheet, device, `${S} .pr-post-timeline__desc`, typography(a, 'subHead', device));
    emit(sheet, device, `${S} .pr-post-timeline__author`, typography(a, 'author', device));
    emit(sheet, device, `${S} .pr-post-timeline__heading a`, typography(a, 'head', device));
    if (!a.inheritFromTheme)
      emit(sheet, device, `${S} .pr-post-timeline__link`, typography(a, 'cta', device));
  }
}

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p'];

function View({ attrs: a, id, root, editing, data }: ViewProps) {
  const fetched = useEditorPosts(a, editing, { size: a.imageSize });
  const posts: PostsData | undefined = editing ? fetched : postsData(data);
  const list = posts?.posts ?? [];
  const sides = alignments(a);
  const side = sides.desktop;
  const arrow = ['top', 'bottom', 'center'].includes(String(a.arrowlinAlignment))
    ? String(a.arrowlinAlignment)
    : 'center';
  const target = a.linkTarget ? '_blank' : '_self';
  const tag = HEADING_TAGS.includes(String(a.headingTag)) ? String(a.headingTag) : 'h3';
  const locale = posts?.locale ?? 'en';
  const className = [
    'wp-block-prisma-post-timeline',
    'pr-post-timeline',
    `pr-post-timeline--${side}`,
    `pr-post-timeline--arrow-${arrow}`,
    a.displayPostLink ? 'pr-post-timeline--cta' : '',
    blockClass(id),
  ]
    .filter(Boolean)
    .join(' ');
  const outline = Boolean(a.inheritFromTheme) && a.buttonType === 'secondary';
  return root(
    'div',
    {
      className,
      ...(editing ? {} : { 'data-pr-post-timeline': JSON.stringify(sides) }),
    } as { className: string },
    <>
      {list.length === 0 ? (
        posts || editing ? (
          <p className="pr-post-timeline__empty">{posts ? 'No posts found' : 'Loading posts…'}</p>
        ) : null
      ) : (
        list.map((post, i) => {
          const right = side === 'right' || (side === 'center' && i % 2 === 0);
          const date = a.displayPostDate ? phpDate(post.date, a.dateFormat, locale) : '';
          return (
            <article
              key={post.id}
              className={`pr-post-timeline__item pr-post-timeline__item--${right ? 'right' : 'left'}`}
            >
              <div className="pr-post-timeline__marker">
                <span className="pr-post-timeline__icon">
                  <Icon name={a.icon} />
                </span>
              </div>
              <div
                className={`pr-post-timeline__day pr-post-timeline__day--${right ? 'right' : 'left'} pr-post-timeline__card`}
              >
                <div className="pr-post-timeline__content">
                  <time
                    className="pr-post-timeline__date pr-post-timeline__date--inner"
                    dateTime={post.date ?? undefined}
                  >
                    {date}
                  </time>
                  {a.displayPostImage && post.image ? (
                    <a
                      className="pr-post-timeline__image"
                      href={post.url}
                      target={target}
                      rel="noopener noreferrer"
                    >
                      <img
                        src={post.image.src}
                        alt={post.image.alt}
                        {...(post.image.width
                          ? { width: post.image.width, height: post.image.height }
                          : {})}
                        {...(post.image.srcSet
                          ? {
                              srcSet: post.image.srcSet,
                              sizes: '(max-width: 1024px) 100vw, 1024px',
                            }
                          : {})}
                        loading="lazy"
                        decoding="async"
                      />
                    </a>
                  ) : null}
                  {createElement(
                    tag,
                    { className: 'pr-post-timeline__heading' },
                    <a href={post.url} target={target} rel="noopener noreferrer">
                      {post.title}
                    </a>,
                  )}
                  {a.displayPostAuthor && post.author ? (
                    <>
                      <span className="pr-post-timeline__author-icon">
                        <Icon name="user" />
                      </span>
                      <a className="pr-post-timeline__author" href={post.author.url ?? undefined}>
                        {post.author.name}
                      </a>
                    </>
                  ) : null}
                  {a.displayPostExcerpt ? (
                    <div className="pr-post-timeline__desc">
                      {trimWords(post.excerpt, a.exerptLength)}
                    </div>
                  ) : null}
                  {a.displayPostLink ? (
                    <div
                      className={`pr-post-timeline__cta wp-block-button${outline ? ' is-style-outline' : ''}`}
                    >
                      <a
                        className="pr-post-timeline__link wp-block-button__link"
                        href={post.url}
                        target={target}
                        rel="noopener noreferrer"
                      >
                        {String(a.readMoreText ?? '')}
                      </a>
                    </div>
                  ) : null}
                  <div className="pr-post-timeline__arrow" />
                </div>
              </div>
              {side === 'center' ? (
                <time
                  className="pr-post-timeline__date pr-post-timeline__date--outer"
                  dateTime={post.date ?? undefined}
                >
                  {date}
                </time>
              ) : null}
            </article>
          );
        })
      )}
      <div className="pr-post-timeline__line">
        <div className="pr-post-timeline__line-inner" />
      </div>
    </>,
  );
}

export const postTimeline: PrismaBlock = {
  name: 'post-timeline',
  title: 'Post Timeline',
  description: 'Your posts along a timeline, alternating on both sides of a connector.',
  keywords: ['post', 'timeline', 'blog', 'history', 'articles'],
  defaults: DEFAULTS,
  css,
  View,
  script: { file: 'post-timeline.js', marker: 'data-pr-post-timeline' },
  load: (a, context, ctx) => loadPosts(a, context, ctx, { size: a.imageSize }),
  spectra: {
    'uagb/post-timeline': (a, src) => {
      const attrs: Attrs = { ...a };
      if (a.postType === 'post') attrs.postType = 'article';
      if (a.taxonomyType === 'post_tag') attrs.taxonomyType = 'tag';
      if (termSlugs(a.categories).length === 0) delete attrs.categories;
      delete attrs.blockName;
      delete attrs.postLayout;
      delete attrs.columns;
      return [src.block('post-timeline', attrs)];
    },
  },
};
