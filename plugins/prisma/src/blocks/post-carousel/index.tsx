import type { Sheet } from '@cleitext/design';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px } from '../../lib/emit';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';
import { loadPosts, postsData, useEditorPosts, type PostsData } from '../post-grid/posts';
import { EmptyNote, PostArticle, POST_DEFAULTS, postCss, rootClasses } from '../post-grid/shared';

const DEFAULTS: Attrs = {
  ...POST_DEFAULTS,
  titleTag: 'h3',
  equalHeight: false,
  pauseOnHover: true,
  infiniteLoop: true,
  transitionSpeed: 500,
  arrowDots: 'arrows_dots',
  autoplay: true,
  autoplaySpeed: 2000,
  arrowSize: 24,
  arrowBorderSize: 0,
  arrowBorderRadius: 0,
  arrowColor: '#000',
  arrowDistance: '',
  arrowDistanceTablet: '',
  arrowDistanceMobile: '',
  dotsMarginTop: 20,
  dotsMarginTopTablet: '',
  dotsMarginTopMobile: '',
  dotsMarginTopUnit: 'px',
};

function css(a: Attrs, B: string, sheet: Sheet): void {
  postCss(a, B, sheet, 'carousel');
  // A background image with every post in view: posts side by side, without inner space.
  if (a.imgPosition === 'background' && numeric(a.columns) === numeric(a.postsToShow)) {
    emit(sheet, 'desktop', `${B}.pr-post-grid--image-background .pr-post-carousel__track`, {
      'flex-wrap': 'nowrap !important',
      gap: `${numeric(a.rowGap) ?? 0}px !important`,
    });
    emit(sheet, 'desktop', `${B} .pr-post`, {
      'padding-left': '0px !important',
      'padding-right': '0px !important',
    });
    emit(sheet, 'desktop', `${B} .pr-post__image`, {
      width: '100% !important',
      left: '0 !important',
    });
  }
  const size = px(a.arrowSize);
  emit(sheet, 'desktop', `${B} .pr-post-carousel__arrow`, {
    'border-color': a.arrowColor,
    'border-width': px(a.arrowBorderSize),
    'border-radius': px(a.arrowBorderRadius),
  });
  emit(sheet, 'desktop', `${B} .pr-post-carousel__arrow svg`, {
    fill: a.arrowColor,
    width: size,
    height: size,
  });
  emit(sheet, 'desktop', `${B} .pr-post-carousel__dot::before`, { color: a.arrowColor });
  if (a.arrowDots === 'dots')
    emit(sheet, 'desktop', `${B}.pr-post-grid--slider`, { padding: '0 0 35px 0' });
  for (const device of DEVICES) {
    const s = device === 'desktop' ? '' : device === 'tablet' ? 'Tablet' : 'Mobile';
    emit(sheet, device, `${B}.pr-post-grid--arrows-outside .pr-post-carousel__arrow--prev`, {
      left: px(a[`arrowDistance${s}`]),
    });
    emit(sheet, device, `${B}.pr-post-grid--arrows-outside .pr-post-carousel__arrow--next`, {
      right: px(a[`arrowDistance${s}`]),
    });
    const dots = px(a[`dotsMarginTop${s}`], a.dotsMarginTopUnit);
    if (dots)
      emit(sheet, device, `${B} .pr-post-carousel__dots`, { 'margin-top': `${dots} !important` });
  }
}

const Chevron = ({ left }: { left?: boolean }) => (
  <svg viewBox="0 0 256 512" aria-hidden="true">
    <path
      d={
        left
          ? 'M28 256 196 88l32 32-136 136 136 136-32 32z'
          : 'M228 256 60 424l-32-32 136-136L28 120l32-32z'
      }
    />
  </svg>
);

function View({ attrs: a, id, root, editing, data }: ViewProps) {
  const fetched = useEditorPosts(a, editing, {
    size: a.imgSize,
    full: a.displayPostContentRadio === 'full_post',
  });
  const posts: PostsData | undefined = editing ? fetched : postsData(data);
  const list = posts?.posts ?? [];
  const cols = Math.max(1, Math.round(numeric(a.columns) ?? 3));
  const arrows = a.arrowDots === 'arrows' || a.arrowDots === 'arrows_dots';
  const dots = a.arrowDots === 'dots' || a.arrowDots === 'arrows_dots';
  const config = {
    autoplay: a.autoplay ? Math.max(300, numeric(a.autoplaySpeed) ?? 2000) : 0,
    speed: Math.max(0, numeric(a.transitionSpeed) ?? 500),
    loop: Boolean(a.infiniteLoop),
    pauseOnHover: Boolean(a.pauseOnHover),
    arrows,
    dots,
  };
  const className = [
    'wp-block-prisma-post-carousel',
    ...rootClasses(a, 'carousel'),
    'pr-post-grid--arrows-outside',
    list.length > cols ? 'pr-post-grid--slider' : '',
    a.equalHeight ? 'pr-post-grid--equal-height' : '',
    blockClass(id),
  ]
    .filter(Boolean)
    .join(' ');
  return root(
    'div',
    {
      className,
      ...(editing ? {} : { 'data-pr-post-carousel': JSON.stringify(config) }),
    } as { className: string },
    list.length === 0 ? (
      posts || editing ? (
        <EmptyNote loading={!posts} text={a.postDisplaytext} />
      ) : null
    ) : (
      <>
        <div className="pr-post-carousel__viewport">
          <div className="pr-post-carousel__track">
            {list.map((post) => (
              <PostArticle key={post.id} post={post} a={a} kind="carousel" locale={posts!.locale} />
            ))}
          </div>
        </div>
        {arrows && list.length > cols ? (
          <>
            <button
              type="button"
              className="pr-post-carousel__arrow pr-post-carousel__arrow--prev"
              aria-label="Previous"
            >
              <Chevron left />
            </button>
            <button
              type="button"
              className="pr-post-carousel__arrow pr-post-carousel__arrow--next"
              aria-label="Next"
            >
              <Chevron />
            </button>
          </>
        ) : null}
        {dots && list.length > cols ? (
          <ul className="pr-post-carousel__dots">
            {Array.from({ length: list.length - cols + 1 }, (_, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={`pr-post-carousel__dot${i === 0 ? ' is-active' : ''}`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </>
    ),
  );
}

export const postCarousel: PrismaBlock = {
  name: 'post-carousel',
  title: 'Post Carousel',
  description: 'Your posts in a sliding carousel, with arrows, dots and autoplay.',
  keywords: ['post', 'carousel', 'slider', 'blog', 'articles'],
  defaults: DEFAULTS,
  css,
  View,
  script: { file: 'post-carousel.js', marker: 'data-pr-post-carousel' },
  load: (a, context, ctx) =>
    loadPosts(a, context, ctx, {
      size: a.imgSize,
      full: a.displayPostContentRadio === 'full_post',
      comments: Boolean(a.displayPostComment),
    }),
  spectra: {
    'uagb/post-carousel': (a, src) => {
      const attrs: Attrs = { ...a };
      if (a.postType === 'post') attrs.postType = 'article';
      if (a.taxonomyType === 'post_tag') attrs.taxonomyType = 'tag';
      if (Array.isArray(a.layoutConfig)) {
        attrs.layoutConfig = a.layoutConfig
          .map((p) => (Array.isArray(p) ? p[0] : p))
          .filter((p): p is string => typeof p === 'string')
          .map((p) => p.replace(/^uagb\/post-/, ''));
      }
      if (typeof a.categories === 'number' || /^\d+(,\d+)*$/.test(String(a.categories ?? '')))
        delete attrs.categories;
      delete attrs.blockName;
      delete attrs.post_type;
      return [src.block('post-carousel', attrs)];
    },
  },
};
