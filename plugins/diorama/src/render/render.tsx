/**
 * A slider's markup, the same on the page (rendered by the server) and in
 * the editor's canvas (one slide, one device, no motion). Accessible by
 * default: carousel semantics, a pause button first in the tab order,
 * arrows and bullets as buttons with names, inactive slides hidden from
 * assistive technologies; layers keep the order they are read in.
 */
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { EASINGS, ICONS, NAV_ICONS } from '../model/presets';
import type { Device, Layer, Link, MediaRef, Slide, SliderData } from '../model/types';
import { BASE_CSS } from './base-css';
import { sliderCss } from './css';
import { stringsFor } from './strings';

/** A media file as blocks get it from Cleitext: the original and its resized variants. */
export interface RenderMedia {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  variants: { variant: string; format: string; url: string; width: number; height: number }[];
  focalPoint?: { x: number; y: number } | null;
}

export interface RenderInput {
  slider: SliderData;
  /** Scope of the slider's CSS (`.dio-s<scope>`). */
  scope: string;
  /** Unique on the page: the prefix of element ids. */
  uid: string;
  title: string;
  /** The slider's short name and id, on pages (Diorama 1.1; e.g. a popup opened by `#…-<alias>`). */
  alias?: string;
  sliderId?: string;
  locale: string;
  media: ReadonlyMap<string, RenderMedia>;
  /** Addresses of the site's entries that links point to, by id. */
  links?: Readonly<Record<string, string>>;
  /** `canvas`: the editor's, one slide on one device. */
  mode?: 'page' | 'canvas';
  device?: Device;
  slideIndex?: number;
  /** Also the shared CSS (an editor's preview has no page around it). */
  withBaseCss?: boolean;
  /** Canvas: play the layers' entrance effects (the editor's "Play"). */
  motion?: boolean;
  /**
   * What other plugins add to the markup (Diorama 1.1): classes and
   * attributes, more CSS, global layers, thumbnails (see `RenderDecorator`).
   */
  decorate?: RenderDecorator;
}

/** Classes and attributes another plugin adds to an element of the slider. */
export interface DecoratedElement {
  className?: string;
  attrs?: Record<string, string>;
}

/**
 * How another plugin (Diorama Pro) changes a slider's markup without drawing
 * it again (Diorama 1.1). Every part is optional; attributes are added after
 * Diorama's own, so they may replace them (e.g. `data-transition`).
 */
export interface RenderDecorator {
  /** The slider's root (`.dio`). */
  root?: DecoratedElement;
  /** Merged into the runtime's settings (`data-dio`), e.g. another `effect`. */
  config?: Record<string, unknown>;
  /** More CSS, after the slider's own. */
  css?: string;
  /** Inside the stage, after the slides (e.g. layers shown on every slide). */
  stage?: ReactNode;
  /** Inside the root, after the navigation (e.g. thumbnails or tabs). */
  after?: ReactNode;
  slide?: (slide: Slide, index: number) => DecoratedElement | undefined;
  /** `children` replaces the text of a heading, a text or a button (e.g. text split in letters). */
  layer?: (layer: Layer) => (DecoratedElement & { children?: ReactNode }) | undefined;
}

/** Several decorators as one: classes and CSS joined, attributes merged in order. */
export function mergeDecorators(
  list: (RenderDecorator | undefined | null)[],
): RenderDecorator | undefined {
  const all = list.filter((d): d is RenderDecorator => Boolean(d));
  if (all.length === 0) return undefined;
  if (all.length === 1) return all[0];
  const join = (parts: (DecoratedElement | undefined)[]): DecoratedElement | undefined => {
    const shown = parts.filter((p): p is DecoratedElement => Boolean(p));
    if (shown.length === 0) return undefined;
    return {
      className: shown
        .map((p) => p.className)
        .filter(Boolean)
        .join(' '),
      attrs: Object.assign({}, ...shown.map((p) => p.attrs ?? {})) as Record<string, string>,
    };
  };
  return {
    root: join(all.map((d) => d.root)),
    config: Object.assign({}, ...all.map((d) => d.config ?? {})) as Record<string, unknown>,
    css: all.map((d) => d.css ?? '').join(''),
    stage: all.some((d) => d.stage)
      ? all.map((d, i) => <Fragment key={i}>{d.stage}</Fragment>)
      : undefined,
    after: all.some((d) => d.after)
      ? all.map((d, i) => <Fragment key={i}>{d.after}</Fragment>)
      : undefined,
    slide: (slide, index) => join(all.map((d) => d.slide?.(slide, index))),
    layer: (layer) => {
      const parts = all.map((d) => d.layer?.(layer));
      const joined = join(parts);
      const children = parts.find((p) => p?.children !== undefined)?.children;
      return joined || children !== undefined ? { ...joined, children } : undefined;
    },
  };
}

/** Adds a decorator's class and attributes to an element's props. */
function decorated<T extends Record<string, unknown>>(
  props: T,
  extra: DecoratedElement | undefined,
): T {
  if (!extra) return props;
  const out: Record<string, unknown> = { ...props, ...(extra.attrs ?? {}) };
  if (extra.className) out.className = `${String(props.className ?? '')} ${extra.className}`.trim();
  return out as T;
}

/** What the runtime reads from `data-dio`. */
export interface RuntimeConfig {
  autoplay: boolean;
  delay: number;
  pauseOnHover: boolean;
  loop: boolean;
  effect: string;
  duration: number;
  easing: string;
  labels: { pause: string; play: string; slideOf: string };
}

function lines(value: string): ReactNode {
  const parts = value.split('\n');
  return parts.map((part, i) => (i === 0 ? part : [<br key={i} />, part]));
}

/** The address of a link, or null when it leads nowhere. */
export function hrefOf(
  link: Link,
  uid: string,
  links?: Readonly<Record<string, string>>,
): string | null {
  switch (link.kind) {
    case 'url':
    case 'post':
      return link.value || null;
    case 'page':
      return (link.entryId && links?.[link.entryId]) || link.value || null;
    case 'phone':
      return link.value ? `tel:${link.value}` : null;
    case 'email':
      return link.value ? `mailto:${link.value}` : null;
    case 'scroll':
      return link.value || `#${uid}-after`;
    default:
      return null;
  }
}

function linkProps(link: Link, uid: string, links?: Readonly<Record<string, string>>) {
  const href = hrefOf(link, uid, links);
  if (!href) return null;
  return {
    href,
    ...(link.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
    ...(link.kind === 'scroll' ? { 'data-dio-scroll': '' } : {}),
  };
}

function srcSet(media: RenderMedia, format: string): string {
  return media.variants
    .filter((v) => v.format === format)
    .sort((a, b) => a.width - b.width)
    .map((v) => `${v.url} ${v.width}w`)
    .join(', ');
}

function Picture({
  refItem,
  media,
  alt,
  sizes,
  eager,
  className,
  style,
}: {
  refItem: MediaRef;
  media: RenderMedia | undefined;
  alt: string;
  sizes: string;
  eager: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const img = (
    <img
      className={className}
      src={media?.url ?? refItem.url}
      alt={alt}
      width={media?.width ?? undefined}
      height={media?.height ?? undefined}
      loading={eager ? 'eager' : 'lazy'}
      decoding={eager ? undefined : 'async'}
      fetchPriority={eager ? 'high' : undefined}
      style={style}
      draggable={false}
    />
  );
  if (!media || media.variants.length === 0) return img;
  const avif = srcSet(media, 'avif');
  const webp = srcSet(media, 'webp');
  if (!avif && !webp) return img;
  return (
    <picture>
      {avif && <source type="image/avif" srcSet={avif} sizes={sizes} />}
      {webp && <source type="image/webp" srcSet={webp} sizes={sizes} />}
      {img}
    </picture>
  );
}

/** The id of a YouTube video from its address. */
export function youtubeId(url: string): string | null {
  const m =
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i.exec(
      url,
    );
  return m ? m[1]! : null;
}

/** The id of a Vimeo video from its address. */
export function vimeoId(url: string): string | null {
  const m = /vimeo\.com\/(?:video\/)?(\d{5,12})/i.exec(url);
  return m ? m[1]! : null;
}

/** The privacy-friendly embed address of a background video, or null. */
export function embedSrc(source: 'youtube' | 'vimeo', url: string): string | null {
  if (source === 'youtube') {
    const id = youtubeId(url);
    return id
      ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&rel=0&disablekb=1&modestbranding=1`
      : null;
  }
  const id = vimeoId(url);
  return id
    ? `https://player.vimeo.com/video/${id}?background=1&autoplay=1&muted=1&loop=1&dnt=1`
    : null;
}

function gradientCss(slide: Slide): string {
  const g = slide.background.gradient;
  return g.type === 'radial'
    ? `radial-gradient(circle at 50% 40%,${g.from},${g.to})`
    : `linear-gradient(${g.angle}deg,${g.from},${g.to})`;
}

function Background({ slide, input, eager }: { slide: Slide; input: RenderInput; eager: boolean }) {
  const bg = slide.background;
  const t = stringsFor(input.locale);
  const canvas = input.mode === 'canvas';
  const media = bg.image?.id ? input.media.get(bg.image.id) : undefined;
  const focal =
    bg.focal ??
    (media?.focalPoint ? { x: media.focalPoint.x * 100, y: media.focalPoint.y * 100 } : null);
  const position = focal ? `${Math.round(focal.x)}% ${Math.round(focal.y)}%` : '50% 50%';
  const sizes =
    input.slider.layout === 'auto' && input.slider.maxWidth > 0
      ? `(max-width: ${input.slider.maxWidth}px) 100vw, ${input.slider.maxWidth}px`
      : '100vw';
  const alt = bg.decorative ? '' : bg.alt || media?.alt || '';
  const picture = bg.image ? (
    <Picture
      refItem={bg.image}
      media={media}
      alt={alt}
      sizes={sizes}
      eager={eager}
      className="dio__bg"
      style={{ objectPosition: position }}
    />
  ) : null;
  let content: ReactNode = null;
  const fill: CSSProperties = {};
  if (bg.kind === 'color') fill.background = bg.color;
  else if (bg.kind === 'gradient') fill.background = gradientCss(slide);
  else if (bg.kind === 'image') {
    fill.background = bg.color;
    content = picture;
  } else if (bg.kind === 'video') {
    fill.background = bg.color;
    const poster = bg.image ? (media?.url ?? bg.image.url) : undefined;
    if (bg.video.source === 'mp4') {
      const file = bg.video.media?.url || bg.video.url;
      content = (
        <>
          {picture}
          {file && !canvas && (
            <video
              className="dio__video"
              data-dio-video=""
              loop
              playsInline
              muted
              preload="none"
              poster={poster}
              aria-hidden="true"
              tabIndex={-1}
            >
              <source src={file} type="video/mp4" />
            </video>
          )}
        </>
      );
    } else {
      const src = embedSrc(bg.video.source, bg.video.url);
      content = (
        <>
          {picture}
          {src && !canvas && (
            <iframe
              className="dio__video dio__video--embed"
              data-dio-embed=""
              data-cx-src={src}
              data-cx-category="marketing"
              title={t.video}
              aria-hidden="true"
              tabIndex={-1}
              allow="autoplay; encrypted-media; picture-in-picture"
              loading="lazy"
            />
          )}
        </>
      );
    }
  }
  const kb = slide.kenBurns !== 'none' && bg.kind !== 'video' && bg.kind !== 'color';
  const duration = slide.duration || input.slider.autoplay.delay;
  return (
    <div
      className={`dio__media${kb ? ` dio-kb--${slide.kenBurns}` : ''}`}
      style={{
        ...fill,
        ...(kb
          ? {
              transformOrigin: position,
              ['--dio-kb' as string]: `${Math.round(duration + input.slider.transition.duration + 1500)}ms`,
            }
          : {}),
      }}
    >
      {content}
    </div>
  );
}

function iconSvg(name: string, className?: string) {
  const icon = ICONS[name] ?? ICONS.star!;
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={icon.path} />
    </svg>
  );
}

export function LayerView({
  layer,
  input,
  first,
  inBox,
}: {
  layer: Layer;
  input: RenderInput;
  first: boolean;
  inBox: boolean;
}) {
  const canvas = input.mode === 'canvas';
  const classes = [
    `dio-l`,
    `dio-l${layer.id}`,
    layer.type === 'button' ? 'dio-btn' : `dio-${layer.type}`,
  ];
  if (layer.motion.hover !== 'none' && layer.type === 'button')
    classes.push(`dio-h-${layer.motion.hover}`);
  const attrs: Record<string, string> = {};
  if (layer.motion.in.preset !== 'none') attrs['data-in'] = '';
  if (layer.motion.out && layer.motion.out.preset !== 'none') attrs['data-out'] = '';
  if (canvas) attrs['data-dio-layer'] = layer.id;
  const extra = canvas ? undefined : input.decorate?.layer?.(layer);
  if (extra?.className) classes.push(extra.className);
  Object.assign(attrs, extra?.attrs ?? {});
  const c = layer.content;
  const text = extra?.children !== undefined ? extra.children : lines(c.text);
  switch (layer.type) {
    case 'heading':
    case 'text': {
      const Tag = c.tag;
      return (
        <Tag className={classes.join(' ')} {...attrs}>
          {text}
        </Tag>
      );
    }
    case 'button': {
      const link = canvas ? null : linkProps(c.link, input.uid, input.links);
      const inner = (
        <>
          <span>{text}</span>
          {layer.motion.hover === 'shift' && (
            <svg
              className="dio-btn__arrow"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d={ICONS['arrow-right']!.path} />
            </svg>
          )}
        </>
      );
      return link ? (
        <a className={classes.join(' ')} {...attrs} {...link}>
          {inner}
        </a>
      ) : (
        <span className={classes.join(' ')} {...attrs}>
          {inner}
        </span>
      );
    }
    case 'image': {
      if (!c.media) {
        classes.push('dio-image--empty');
        return (
          <div className={classes.join(' ')} {...attrs} aria-hidden="true">
            {canvas ? 'Image' : null}
          </div>
        );
      }
      const media = c.media.id ? input.media.get(c.media.id) : undefined;
      const link = canvas ? null : linkProps(c.link, input.uid, input.links);
      const picture = (
        <Picture
          refItem={c.media}
          media={media}
          alt={c.alt || media?.alt || ''}
          sizes={inBox ? '(max-width: 767px) 90vw, 40vw' : '(max-width: 767px) 90vw, 50vw'}
          eager={first}
        />
      );
      return link ? (
        <a className={classes.join(' ')} {...attrs} {...link}>
          {picture}
        </a>
      ) : (
        <div className={classes.join(' ')} {...attrs}>
          {picture}
        </div>
      );
    }
    case 'icon': {
      const label = c.alt.trim();
      return (
        <span
          className={classes.join(' ')}
          {...attrs}
          {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' })}
        >
          {iconSvg(c.icon)}
        </span>
      );
    }
    case 'shape':
      classes.push(`dio-shape--${c.shape}`);
      return <div className={classes.join(' ')} {...attrs} aria-hidden="true" />;
    case 'box':
      return (
        <div className={classes.join(' ')} {...attrs}>
          {layer.children.map((child) => (
            <LayerView key={child.id} layer={child} input={input} first={first} inBox />
          ))}
        </div>
      );
  }
}

export function SlideView({
  slide,
  index,
  total,
  active,
  input,
}: {
  slide: Slide;
  index: number;
  total: number;
  active: boolean;
  input: RenderInput;
}) {
  const t = stringsFor(input.locale);
  const hero = input.slider.type === 'hero' || total === 1;
  const canvas = input.mode === 'canvas';
  const link = canvas ? null : linkProps(slide.link, input.uid, input.links);
  const props: Record<string, unknown> = {
    className: `dio__slide${active ? ' is-active' : ''}`,
    'data-index': index,
  };
  if (!hero) {
    props.role = 'group';
    props['aria-roledescription'] = t.slide;
    props['aria-label'] = slide.name
      ? `${t.slideOf(index + 1, total)}: ${slide.name}`
      : t.slideOf(index + 1, total);
    if (!active) {
      props['aria-hidden'] = 'true';
      props.inert = true;
    }
  }
  if (slide.transition) props['data-transition'] = slide.transition;
  if (slide.duration) props['data-duration'] = slide.duration;
  const overlay = slide.overlay.opacity > 0;
  const extra = canvas ? undefined : input.decorate?.slide?.(slide, index);
  return (
    <div {...decorated(props, extra)}>
      <Background slide={slide} input={input} eager={index === 0} />
      {overlay && (
        <div
          className="dio__overlay"
          style={{ background: slide.overlay.color, opacity: slide.overlay.opacity }}
        />
      )}
      {link && (
        <a className="dio__link" {...link} aria-label={slide.name || t.open} tabIndex={-1} />
      )}
      <div className="dio__layers">
        {slide.layers.map((layer) => (
          <LayerView key={layer.id} layer={layer} input={input} first={index === 0} inBox={false} />
        ))}
      </div>
    </div>
  );
}

function navIcon(path: string, className?: string) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
}

/** The slides a slider shows: visible ones, the first only for a hero. */
export function shownSlides(slider: SliderData): Slide[] {
  const visible = slider.slides.filter((s) => !s.hidden);
  return slider.type === 'hero' ? visible.slice(0, 1) : visible;
}

export function SliderView(input: RenderInput) {
  const { slider } = input;
  const t = stringsFor(input.locale);
  const canvas = input.mode === 'canvas';
  const slides = canvas ? slider.slides : shownSlides(slider);
  if (slides.length === 0) return null;
  const activeIndex = canvas ? Math.min(Math.max(input.slideIndex ?? 0, 0), slides.length - 1) : 0;
  const multi = !canvas
    ? slides.length > 1
    : slider.type !== 'hero' && shownSlides(slider).length > 1;
  const carousel = slider.type !== 'hero' && multi;
  const nav = slider.navigation;
  const autoplay = carousel && slider.autoplay.enabled;
  const classes = [
    'dio',
    `dio--${slider.type}`,
    `dio--${slider.layout}`,
    `dio-nav--${nav.style}`,
    `dio-s${input.scope}`,
  ];
  if (nav.hideArrowsOnMobile) classes.push('dio--arrows-desk');
  if (canvas) classes.push('dio--canvas');
  if (canvas && !input.motion) classes.push('dio--static');
  const config: RuntimeConfig = {
    autoplay,
    delay: slider.autoplay.delay,
    pauseOnHover: slider.autoplay.pauseOnHover,
    loop: slider.autoplay.loop,
    effect: slider.transition.effect,
    duration: slider.transition.duration,
    easing: EASINGS[slider.transition.easing].css,
    labels: { pause: t.pause, play: t.play, slideOf: t.slideOf(0, 0) },
  };
  const decorate = canvas ? undefined : input.decorate;
  if (decorate?.config) Object.assign(config, decorate.config);
  const css = `${input.withBaseCss ? BASE_CSS : ''}${sliderCss(slider, input.scope, canvas ? { device: input.device ?? 'desktop' } : {})}${decorate?.css ?? ''}`;
  const stageId = `${input.uid}-slides`;
  // Controls wait for the script: without it the first slide shows alone.
  const hidden = canvas ? {} : { hidden: true };
  const controlProps = canvas
    ? { tabIndex: -1, 'aria-hidden': 'true' as const }
    : { 'aria-controls': stageId };
  const rootProps: Record<string, unknown> = carousel
    ? { 'aria-roledescription': t.carousel, 'aria-label': input.title }
    : {};
  const Root = carousel ? 'section' : 'div';
  return (
    <>
      <Root
        {...decorated(
          {
            id: input.uid,
            className: classes.join(' '),
            ...rootProps,
            ...(canvas ? {} : { 'data-dio': JSON.stringify(config) }),
          },
          decorate?.root,
        )}
      >
        <style>{css}</style>
        {autoplay && (
          <button
            type="button"
            className="dio__pause"
            {...hidden}
            {...controlProps}
            aria-label={t.pause}
            data-dio-pause=""
          >
            {navIcon(NAV_ICONS.pause, 'dio-pause')}
          </button>
        )}
        <div
          className="dio__stage"
          id={stageId}
          {...(carousel ? { 'aria-live': autoplay ? 'off' : 'polite' } : {})}
        >
          {(canvas ? [slides[activeIndex]!] : slides).map((slide) => {
            const index = slides.indexOf(slide);
            return (
              <SlideView
                key={slide.id}
                slide={slide}
                index={index}
                total={slides.length}
                active={index === activeIndex}
                input={input}
              />
            );
          })}
          {decorate?.stage}
        </div>
        {carousel &&
          nav.arrows &&
          !(canvas && input.device === 'mobile' && nav.hideArrowsOnMobile) && (
            <>
              <button
                type="button"
                className="dio__arrow dio__arrow--prev"
                {...hidden}
                {...controlProps}
                aria-label={t.previous}
                data-dio-prev=""
              >
                {navIcon(NAV_ICONS.prev)}
              </button>
              <button
                type="button"
                className="dio__arrow dio__arrow--next"
                {...hidden}
                {...controlProps}
                aria-label={t.next}
                data-dio-next=""
              >
                {navIcon(NAV_ICONS.next)}
              </button>
            </>
          )}
        {carousel && nav.bullets && (
          <div className="dio__bullets" {...hidden} role="group" aria-label={t.slides}>
            {(canvas ? shownSlides(slider) : slides).map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                className="dio__bullet"
                {...controlProps}
                aria-label={t.goTo(i + 1)}
                aria-current={i === (canvas ? 0 : activeIndex) ? 'true' : undefined}
                data-dio-go={i}
              />
            ))}
          </div>
        )}
        {carousel && nav.progress && autoplay && (
          <div className="dio__progress" {...hidden} aria-hidden="true">
            <span />
          </div>
        )}
        {decorate?.after}
      </Root>
      {!canvas && <span id={`${input.uid}-after`} className="dio-after" />}
    </>
  );
}
