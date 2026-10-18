import type { Sheet } from '@cleitext/design';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, px } from '../../lib/emit';
import type { Attrs, PrismaBlock, SpectraImporter, ViewProps } from '../../lib/types';
import { loadPosts, postsData, useEditorPosts, type PostsData } from './posts';
import { EmptyNote, Pagination, PostArticle, POST_DEFAULTS, postCss, rootClasses } from './shared';

const DEFAULTS: Attrs = {
  ...POST_DEFAULTS,
  // Masonry: Spectra's deprecated post masonry, imported as a grid laid out in columns.
  post_type: 'grid',
  imageRatio: 'inherit',
  imgEqualheight: false,
  equalHeightInlineButtons: false,
  postPagination: false,
  pageLimit: 10,
  paginationType: 'ajax',
  paginationBgActiveColor: '#e4e4e4',
  paginationActiveColor: '#333333',
  paginationBgColor: '#e4e4e4',
  paginationColor: '#777777',
  paginationMarkup: '',
  paginationLayout: 'filled',
  paginationBorderActiveColor: '',
  paginationBorderColor: '#333',
  paginationBorderRadius: '',
  paginationBorderSize: 1,
  paginationSpacing: 20,
  paginationSpacingUnit: 'px',
  paginationAlignment: 'left',
  paginationPrevText: '« Previous',
  paginationNextText: 'Next »',
  isLeftToRightLayout: false,
  wrapperTopPadding: '',
  wrapperRightPadding: 20,
  wrapperLeftPadding: 20,
  wrapperBottomPadding: '',
  wrapperTopPaddingTablet: '',
  wrapperRightPaddingTablet: '',
  wrapperLeftPaddingTablet: '',
  wrapperBottomPaddingTablet: '',
  wrapperTopPaddingMobile: '',
  wrapperRightPaddingMobile: '',
  wrapperLeftPaddingMobile: '',
  wrapperBottomPaddingMobile: '',
  wrapperPaddingUnit: 'px',
  wrapperPaddingUnitTablet: 'px',
  wrapperPaddingUnitMobile: 'px',
  wrapperPaddingLink: false,
  wrapperAlign: 'row',
  wrapperAlignPosition: 'center',
};

const layoutOf = (a: Attrs) => (a.post_type === 'masonry' ? 'masonry' : 'grid');

function css(a: Attrs, B: string, sheet: Sheet): void {
  postCss(a, B, sheet, 'grid');
  const R = `${B}.wp-block-prisma-post-grid`;
  // Pagination.
  const align = ['left', 'center', 'right'].includes(String(a.paginationAlignment))
    ? String(a.paginationAlignment)
    : 'left';
  emit(sheet, 'desktop', `${B} .pr-post-grid__pagination`, {
    'margin-top': px(a.paginationSpacing, a.paginationSpacingUnit),
    'justify-content': align,
    [`margin-${align}`]: '10px',
  });
  const current = `${B} .pr-post-grid__pagination .pr-post-grid__page--current`;
  const links = `${B} .pr-post-grid__pagination a`;
  if (a.paginationLayout === 'filled') {
    emit(sheet, 'desktop', current, {
      'background-color': a.paginationBgActiveColor,
      color: a.paginationActiveColor,
    });
    emit(sheet, 'desktop', links, {
      'background-color': a.paginationBgColor,
      color: a.paginationColor,
    });
  } else {
    const outline = (color: unknown, text: unknown) => ({
      'border-style': 'solid',
      'background-color': 'transparent',
      'border-width': px(a.paginationBorderSize),
      'border-color': color,
      'border-radius': px(a.paginationBorderRadius),
      color: text,
    });
    emit(
      sheet,
      'desktop',
      current,
      outline(a.paginationBorderActiveColor, a.paginationActiveColor),
    );
    emit(sheet, 'desktop', links, outline(a.paginationBorderColor, a.paginationColor));
  }
  // Read more buttons in one line at the bottom of the posts.
  const top = a.imgPosition !== 'background';
  const last = `${B}.pr-post-grid--inline-buttons .pr-post .pr-post__text:${top ? 'last-child' : 'nth-last-child(2)'}`;
  const side = (s: string, fallback: unknown) => a[`padding${s}`] ?? fallback;
  emit(sheet, 'desktop', last, {
    left: px(side('Left', a.contentPadding), a.contentPaddingUnit),
    right: px(side('Right', a.contentPadding), a.contentPaddingUnit),
  });
  // As Spectra: on phones the tablet's values.
  emit(sheet, 'mobile', last, {
    left: px(side('LeftTablet', a.contentPadding), a.tabletPaddingUnit),
    right: px(side('RightTablet', a.contentPadding), a.tabletPaddingUnit),
  });
  // Image on the side of the text.
  const ltr = Boolean(a.isLeftToRightLayout);
  if (ltr) {
    emit(sheet, 'desktop', R, { display: 'flex', 'flex-direction': 'column' });
    emit(sheet, 'desktop', `${R} .pr-post`, {
      display: 'flex',
      'flex-direction': a.wrapperAlign === 'row-reverse' ? 'row-reverse' : 'row',
      width: '100%',
    });
    emit(sheet, 'desktop', `${R} .pr-post__image`, { flex: 'none', width: top ? '35%' : '100%' });
    emit(sheet, 'tablet', `${R} .pr-post__image`, { width: top ? '45%' : '100%' });
    emit(sheet, 'mobile', `${R} .pr-post__image`, { width: top ? 'unset' : '100%' });
    emit(sheet, 'mobile', R, { display: 'grid' });
    emit(sheet, 'mobile', `${R} .pr-post`, { display: 'inline-block' });
  }
  for (const device of DEVICES) {
    const s = device === 'desktop' ? '' : device === 'tablet' ? 'Tablet' : 'Mobile';
    const unit = a[`wrapperPaddingUnit${s}`];
    emit(sheet, device, `${R} .pr-post__content`, {
      'padding-top': px(a[`wrapperTopPadding${s}`], unit),
      'padding-right': px(a[`wrapperRightPadding${s}`], unit),
      'padding-bottom': px(a[`wrapperBottomPadding${s}`], unit),
      'padding-left': px(a[`wrapperLeftPadding${s}`], unit),
      ...(device === 'desktop'
        ? {
            width: '100%',
            display: 'flex',
            'flex-direction': 'column',
            'justify-content': a.wrapperAlignPosition,
          }
        : device === 'mobile'
          ? { width: 'unset' }
          : {}),
    });
  }
}

function View({ attrs: a, id, root, editing, data }: ViewProps) {
  const fetched = useEditorPosts(a, editing, {
    size: a.imgSize,
    full: a.displayPostContentRadio === 'full_post',
  });
  const posts: PostsData | undefined = editing ? fetched : postsData(data);
  const layout = layoutOf(a);
  const list = posts?.posts ?? [];
  const className = [
    'wp-block-prisma-post-grid',
    ...rootClasses(a, layout),
    layout === 'grid' && a.equalHeight ? 'pr-post-grid--equal-height' : '',
    layout === 'grid' && a.equalHeightInlineButtons ? 'pr-post-grid--inline-buttons' : '',
    blockClass(id),
  ]
    .filter(Boolean)
    .join(' ');
  return root(
    'div',
    { className },
    <>
      {list.map((post) => (
        <PostArticle key={post.id} post={post} a={a} kind={layout} locale={posts!.locale} />
      ))}
      {list.length === 0 && (posts || editing) ? (
        <EmptyNote loading={!posts} text={a.postDisplaytext} />
      ) : null}
      {a.postPagination && posts ? (
        <div className="pr-post-grid__pagination">
          <Pagination data={posts} a={a} />
        </div>
      ) : null}
    </>,
  );
}

/** Spectra's post grid, and its older post masonry. */
const fromSpectra =
  (masonry: boolean): SpectraImporter =>
  (a, src) => {
    const attrs: Attrs = { ...a };
    if (masonry) {
      attrs.post_type = 'masonry';
      // The masonry's own defaults where they differ from the grid's.
      attrs.titleTag ??= 'h3';
      // Loading more posts becomes page links.
      if (a.paginationType === 'infinite') attrs.postPagination = true;
      delete attrs.paginationType;
    } else {
      delete attrs.post_type;
    }
    if (a.postType === 'post') attrs.postType = 'article';
    if (a.taxonomyType === 'post_tag') attrs.taxonomyType = 'tag';
    if (Array.isArray(a.layoutConfig)) {
      attrs.layoutConfig = a.layoutConfig
        .map((p) => (Array.isArray(p) ? p[0] : p))
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.replace(/^uagb\/post-/, ''));
    }
    // WordPress term ids cannot point to the imported terms.
    if (typeof a.categories === 'number' || /^\d+(,\d+)*$/.test(String(a.categories ?? '')))
      delete attrs.categories;
    delete attrs.blockName;
    delete attrs.imgEqualHeight;
    return [src.block('post-grid', attrs)];
  };

/** Spectra's inner placeholders of the post blocks: nothing on the site. */
const dropped: SpectraImporter = () => [];

export const postGrid: PrismaBlock = {
  name: 'post-grid',
  title: 'Post Grid',
  description: 'Your posts in a grid: image, title, meta, excerpt and a read more link.',
  keywords: ['post', 'grid', 'blog', 'articles', 'masonry', 'latest posts'],
  defaults: DEFAULTS,
  css,
  View,
  load: (a, context, ctx) =>
    loadPosts(a, context, ctx, {
      paged: Boolean(a.postPagination),
      size: a.imgSize,
      full: a.displayPostContentRadio === 'full_post',
      comments: Boolean(a.displayPostComment),
    }),
  spectra: {
    'uagb/post-grid': fromSpectra(false),
    'uagb/post-masonry': fromSpectra(true),
    'uagb/post-image': dropped,
    'uagb/post-title': dropped,
    'uagb/post-meta': dropped,
    'uagb/post-excerpt': dropped,
    'uagb/post-taxonomy': dropped,
    'uagb/post-button': dropped,
  },
};
