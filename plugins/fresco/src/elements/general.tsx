/** General widgets: Icon, Video, Icon box, Image box. */
import { uiText } from '../core/ui-text.js';
import {
  advancedControls,
  ElementRoot,
  hoverAnimationControl,
  hoverClass,
  OTHER_DEVICES,
  textStrokeControls,
  UNITS,
} from '../core/common.js';
import {
  ALIGN,
  content,
  groups,
  HEADING_TAGS,
  style,
  TEXT_ALIGN,
  textStyle,
} from '../core/controls.js';
import { Icon } from '../core/icons.js';
import { linkProps } from '../core/links.js';
import { FrImage, IMAGE_SIZES, mediaIds } from '../core/media.js';
import type { ReactNode } from 'react';
import type { Control, ElementDefinition, Settings } from '../core/model.js';
import { plainText } from '../core/sanitize.js';
import { objectPosition } from './basic.js';

const VIEW_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'stacked', label: 'Stacked' },
  { value: 'framed', label: 'Framed' },
];

/** Icon look shared by Icon and Icon box. */
function iconStyle(prefix: string, section: string, selector: string): Control[] {
  return [
    style.color(`${prefix}primary_color`, 'Primary color', section, {
      hover: true,
      selectors: {
        [`${selector}`]: 'color: {{value}}',
        [`{{el}}.fr-view-stacked ${selector.replace('{{el}} ', '')}`]:
          'background-color: {{value}}',
        [`{{el}}.fr-view-framed ${selector.replace('{{el}} ', '')}`]: 'border-color: {{value}}',
      },
    }),
    style.color(`${prefix}secondary_color`, 'Secondary color', section, {
      hover: true,
      condition: { view: ['stacked', 'framed'] },
      selectors: {
        [`{{el}}.fr-view-stacked ${selector.replace('{{el}} ', '')}`]: 'color: {{value}}',
        [`{{el}}.fr-view-framed ${selector.replace('{{el}} ', '')}`]: 'background-color: {{value}}',
      },
    }),
    style.slider(`${prefix}size`, 'Size', section, {
      responsive: true,
      units: ['px', 'em', 'rem', 'vw'],
      max: 300,
      selectors: { [selector]: 'font-size: {{value}}' },
    }),
    style.slider(`${prefix}padding`, 'Padding', section, {
      responsive: true,
      units: ['px', 'em'],
      max: 100,
      condition: { view: ['stacked', 'framed'] },
      selectors: { [selector]: 'padding: {{value}}' },
    }),
    style.slider(`${prefix}rotate`, 'Rotate', section, {
      responsive: true,
      units: ['deg'],
      min: 0,
      max: 360,
      selectors: { [`${selector} svg`]: 'transform: rotate({{value}})' },
    }),
    style.switch(`${prefix}fit_to_size`, 'Fit to size', section, {
      help: 'Avoids gaps around SVG icons whose width and height differ.',
      dictionary: { true: 'width: auto' },
      selectors: { [`${selector} svg`]: '{{value}}' },
    }),
    style.slider(`${prefix}hover_transition`, 'Transition duration (s)', section, {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: {
        [selector]:
          'transition: color {{value}}, background-color {{value}}, border-color {{value}}',
      },
    }),
    style.slider(`${prefix}border_width`, 'Border width', section, {
      units: ['px'],
      max: 20,
      condition: { view: 'framed' },
      selectors: { [selector]: 'border-width: {{value}}' },
    }),
    style.box(`${prefix}radius`, 'Border radius', section, {
      responsive: true,
      units: ['px', '%'],
      condition: { view: ['stacked', 'framed'] },
      selectors: { [selector]: 'border-radius: {{top}} {{right}} {{bottom}} {{left}}' },
    }),
  ];
}

function viewClasses(settings: Settings): string {
  const view = ['stacked', 'framed'].includes(settings.view as string)
    ? String(settings.view)
    : 'default';
  const shape =
    settings.shape === 'square' || settings.shape === 'rounded' ? settings.shape : 'circle';
  return ` fr-view-${view}${view === 'default' ? '' : ` fr-shape-${shape}`}`;
}

export const icon: ElementDefinition = {
  type: 'fresco/icon',
  title: 'Icon',
  icon: 'M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.8z',
  category: 'basic',
  keywords: ['symbol', 'star'],
  controls: [
    content.icon('icon', 'Icon', 'Icon', { default: { set: 'solid', name: 'star' } }),
    content.select('view', 'View', 'Icon', {
      default: 'default',
      options: VIEW_OPTIONS,
      noCss: true,
    }),
    content.select('shape', 'Shape', 'Icon', {
      default: 'circle',
      options: [
        { value: 'circle', label: 'Circle' },
        { value: 'rounded', label: 'Rounded' },
        { value: 'square', label: 'Square' },
      ],
      condition: { view: ['stacked', 'framed'] },
      noCss: true,
    }),
    content.url('link', 'Link', 'Icon'),
    content.choose('align', 'Alignment', 'Icon', {
      responsive: true,
      options: ALIGN,
      selectors: { '{{el}}': 'text-align: {{value}}' },
    }),
    ...iconStyle('', 'Icon', '{{el}} .fr-icon-wrap'),
    hoverAnimationControl('Icon'),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const link = linkProps(settings.link);
    const glyph = <Icon value={settings.icon} />;
    const wrap = `fr-icon-wrap${hoverClass(settings.hover_effect)}`;
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={`fr-icon-widget${viewClasses(settings)}`}
        editing={context.editing}
      >
        {link ? (
          <a className={wrap} {...link}>
            {glyph}
          </a>
        ) : (
          <span className={wrap}>{glyph}</span>
        )}
      </ElementRoot>
    );
  },
};

// ---- Video ---------------------------------------------------------------------------------

/** Options of a video player that go into its address. */
export interface EmbedOptions {
  autoplay?: boolean;
  mute?: boolean;
  loop?: boolean;
  controls?: boolean;
  start?: number;
  /** Seconds where it stops (YouTube, Dailymotion). */
  end?: number;
  /** YouTube: false plays from youtube.com instead of youtube-nocookie.com. */
  privacy?: boolean;
  /** YouTube: suggested videos from any channel at the end (not only the video's own). */
  related?: boolean;
  /** Vimeo: hide the title, the portrait or the byline. */
  title?: boolean;
  portrait?: boolean;
  byline?: boolean;
  /** Vimeo and Dailymotion: the color of the controls (hex, without `#`). */
  color?: string;
  /** Dailymotion: hide the logo. */
  logo?: boolean;
}

/** The embed address of a YouTube, Vimeo or Dailymotion link, or null. */
export function videoEmbed(source: string, url: string, options: EmbedOptions): string | null {
  const params = new URLSearchParams();
  if (source === 'youtube') {
    const id =
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(
        url,
      )?.[1];
    if (!id) return null;
    if (options.autoplay) params.set('autoplay', '1');
    if (options.mute) params.set('mute', '1');
    if (options.loop) {
      params.set('loop', '1');
      params.set('playlist', id);
    }
    if (options.controls === false) params.set('controls', '0');
    if (options.start) params.set('start', String(Math.floor(options.start)));
    if (options.end) params.set('end', String(Math.floor(options.end)));
    params.set('rel', options.related ? '1' : '0');
    const query = params.toString();
    const host = options.privacy === false ? 'www.youtube.com' : 'www.youtube-nocookie.com';
    return `https://${host}/embed/${id}${query ? `?${query}` : ''}`;
  }
  if (source === 'vimeo') {
    const id = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url)?.[1];
    if (!id) return null;
    if (options.autoplay) params.set('autoplay', '1');
    if (options.mute) params.set('muted', '1');
    if (options.loop) params.set('loop', '1');
    params.set('dnt', '1');
    if (options.title === false) params.set('title', '0');
    if (options.portrait === false) params.set('portrait', '0');
    if (options.byline === false) params.set('byline', '0');
    if (options.color) params.set('color', options.color);
    return `https://player.vimeo.com/video/${id}?${params.toString()}${options.start ? `#t=${Math.floor(options.start)}s` : ''}`;
  }
  if (source === 'dailymotion') {
    const id = /(?:dailymotion\.com\/(?:embed\/)?video\/|dai\.ly\/)([a-zA-Z0-9]+)/.exec(url)?.[1];
    if (!id) return null;
    if (options.autoplay) params.set('autoplay', '1');
    if (options.mute) params.set('mute', '1');
    if (options.loop) params.set('loop', '1');
    if (options.controls === false) params.set('controls', '0');
    if (options.start) params.set('start', String(Math.floor(options.start)));
    if (options.end) params.set('end', String(Math.floor(options.end)));
    if (options.logo === false) params.set('ui-logo', '0');
    if (options.color) params.set('ui-highlight', options.color);
    const query = params.toString();
    return `https://www.dailymotion.com/embed/video/${id}${query ? `?${query}` : ''}`;
  }
  return null;
}

const RATIOS = ['16/9', '4/3', '3/2', '1/1', '9/16', '21/9'];

const SAFE_URL = /^(https?:\/\/|\/(?!\/))[^\s"'<>]*$/;

const hex = (value: unknown) =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : undefined;

const HAS_POSTER = { 'poster!': [undefined, null, ''] };

export const video: ElementDefinition = {
  type: 'fresco/video',
  title: 'Video',
  icon: 'M4 6h12v12H4z M16 10l4-2.5v9L16 14',
  category: 'basic',
  keywords: ['youtube', 'vimeo', 'dailymotion', 'film', 'embed'],
  controls: [
    content.select('source', 'Source', 'Video', {
      default: 'youtube',
      options: [
        { value: 'youtube', label: 'YouTube' },
        { value: 'vimeo', label: 'Vimeo' },
        { value: 'dailymotion', label: 'Dailymotion' },
        { value: 'hosted', label: 'Self hosted' },
      ],
      noCss: true,
    }),
    content.text('url', 'Link', 'Video', {
      default: 'https://www.youtube.com/watch?v=XHOmBV4js_E',
      placeholder: 'https://www.youtube.com/watch?v=…',
      condition: { source: ['youtube', 'vimeo', 'dailymotion'] },
    }),
    content.switch('external', 'External URL', 'Video', {
      condition: { source: 'hosted' },
      noCss: true,
    }),
    content.media('file', 'Video file', 'Video', {
      accept: 'video',
      condition: { source: 'hosted', 'external!': true },
    }),
    content.text('external_url', 'Video address', 'Video', {
      placeholder: 'https://example.com/video.mp4',
      condition: { source: 'hosted', external: true },
    }),
    content.number('start', 'Start time (seconds)', 'Video', { min: 0, noCss: true }),
    content.number('end', 'End time (seconds)', 'Video', {
      min: 0,
      noCss: true,
      condition: { source: ['youtube', 'dailymotion', 'hosted'] },
    }),
    content.switch('autoplay', 'Autoplay', 'Video', { noCss: true }),
    content.switch('mute', 'Mute', 'Video', { noCss: true }),
    content.switch('loop', 'Loop', 'Video', { noCss: true }),
    content.switch('controls', 'Player controls', 'Video', { default: true, noCss: true }),
    content.switch('privacy', 'Privacy mode', 'Video', {
      default: true,
      help: 'Plays from youtube-nocookie.com: YouTube keeps no cookies until the video plays.',
      condition: { source: 'youtube' },
      noCss: true,
    }),
    content.select('rel', 'Suggested videos', 'Video', {
      options: [
        { value: '', label: 'From the same channel' },
        { value: 'yes', label: 'Any video' },
      ],
      condition: { source: 'youtube' },
      noCss: true,
    }),
    content.switch('vimeo_title', 'Intro title', 'Video', {
      default: true,
      condition: { source: 'vimeo' },
      noCss: true,
    }),
    content.switch('vimeo_portrait', 'Intro portrait', 'Video', {
      default: true,
      condition: { source: 'vimeo' },
      noCss: true,
    }),
    content.switch('vimeo_byline', 'Intro byline', 'Video', {
      default: true,
      condition: { source: 'vimeo' },
      noCss: true,
    }),
    content.switch('logo', 'Logo', 'Video', {
      default: true,
      condition: { source: 'dailymotion' },
      noCss: true,
    }),
    content.color('player_color', 'Controls color', 'Video', {
      condition: { source: ['vimeo', 'dailymotion'] },
      noCss: true,
    }),
    content.switch('download', 'Download button', 'Video', {
      default: true,
      condition: { source: 'hosted' },
      noCss: true,
    }),
    content.select('preload', 'Preload', 'Video', {
      default: 'metadata',
      options: [
        { value: 'metadata', label: 'Metadata' },
        { value: 'auto', label: 'Auto' },
        { value: 'none', label: 'None' },
      ],
      condition: { source: 'hosted' },
      noCss: true,
    }),
    content.media('poster', 'Image overlay', 'Video', {
      accept: 'image',
      help: 'Shown until the visitor plays the video; nothing is loaded from the video site before.',
    }),
    content.switch('show_play_icon', 'Play icon', 'Video', {
      default: true,
      condition: HAS_POSTER,
      noCss: true,
    }),
    content.icon('play_icon', 'Icon', 'Video', {
      condition: { ...HAS_POSTER, show_play_icon: true },
    }),
    content.switch('lightbox', 'Lightbox', 'Video', {
      help: 'The video opens over the page when the image is clicked.',
      condition: HAS_POSTER,
      noCss: true,
    }),
    style.select('ratio', 'Aspect ratio', 'Video', {
      default: '16/9',
      options: RATIOS.map((r) => ({ value: r, label: r.replace('/', ':') })),
      selectors: { '{{el}} .fr-video__frame': 'aspect-ratio: {{value}}' },
      noCss: true,
    }),
    groups.filters('filters', 'CSS filters', 'Video', '{{el}} .fr-video__frame'),
    style.color('play_icon_color', 'Color', 'Play icon', {
      condition: HAS_POSTER,
      selectors: { '{{el}} .fr-video__play--icon': 'color: {{value}}' },
    }),
    style.slider('play_icon_size', 'Size', 'Play icon', {
      responsive: true,
      units: ['px', 'em'],
      min: 10,
      max: 300,
      condition: HAS_POSTER,
      selectors: { '{{el}} .fr-video__play--icon': 'font-size: {{value}}' },
    }),
    {
      ...groups.textShadow(
        'play_icon_shadow',
        'Text shadow',
        'Play icon',
        '{{el}} .fr-video__play--icon',
      ),
      condition: HAS_POSTER,
    },
    style.color('lightbox_color', 'Background color', 'Lightbox', {
      condition: { ...HAS_POSTER, lightbox: true },
      selectors: { '{{el}}': '--fr-video-lb-bg: {{value}}' },
    }),
    style.slider('lightbox_width', 'Content width', 'Lightbox', {
      units: ['%'],
      min: 30,
      max: 100,
      condition: { ...HAS_POSTER, lightbox: true },
      selectors: { '{{el}}': '--fr-video-lb-width: {{value}}' },
    }),
    ...advancedControls(),
  ],
  media: (settings) => mediaIds(settings.file, settings.poster),
  handler: 'video',
  render({ node, settings, context }) {
    const ratio = RATIOS.includes(settings.ratio as string) ? String(settings.ratio) : '16/9';
    const options: EmbedOptions = {
      autoplay: settings.autoplay === true,
      mute: settings.mute === true,
      loop: settings.loop === true,
      controls: settings.controls !== false,
      start: Number(settings.start) || 0,
      end: Math.max(0, Number(settings.end) || 0),
      privacy: settings.privacy !== false,
      related: settings.rel === 'yes',
      title: settings.vimeo_title !== false,
      portrait: settings.vimeo_portrait !== false,
      byline: settings.vimeo_byline !== false,
      logo: settings.logo !== false,
      ...(hex(settings.player_color) ? { color: hex(settings.player_color) } : {}),
    };
    const poster = settings.poster as { url?: string } | undefined;
    const source = String(settings.source ?? 'youtube');
    const lightbox = settings.lightbox === true && Boolean(poster?.url);
    // The image over the video, with its play icon: the player loads when clicked.
    const overlay = (src: string, kind?: 'file') => (
      <button
        type="button"
        className="fr-video__overlay"
        data-fr-video={src}
        {...(kind ? { 'data-fr-video-kind': kind } : {})}
        {...(lightbox ? { 'data-fr-video-lightbox': '' } : {})}
        aria-label={uiText(context.locale, 'Play video')}
      >
        <FrImage value={poster} context={context} size="large" />
        {settings.show_play_icon === false ? null : settings.play_icon ? (
          <span className="fr-video__play fr-video__play--icon" aria-hidden="true">
            <Icon value={settings.play_icon} />
          </span>
        ) : (
          <span className="fr-video__play" aria-hidden="true" />
        )}
      </button>
    );
    let player = null;
    if (source === 'hosted') {
      const file = settings.file as { url?: string } | undefined;
      const address =
        settings.external === true && typeof settings.external_url === 'string'
          ? settings.external_url.trim()
          : file?.url;
      const url = address && SAFE_URL.test(address) ? address : null;
      // A start and an end: a media fragment (`#t=10,20`).
      const src = url && options.end ? `${url}#t=${options.start ?? 0},${options.end}` : url;
      player = src ? (
        lightbox ? (
          overlay(src, 'file')
        ) : (
          <video
            src={src}
            controls={options.controls}
            autoPlay={options.autoplay}
            muted={options.mute || options.autoplay}
            loop={options.loop}
            playsInline
            preload={
              ['auto', 'none'].includes(settings.preload as string)
                ? String(settings.preload)
                : 'metadata'
            }
            {...(settings.download === false ? { controlsList: 'nodownload' } : {})}
            {...(poster?.url ? { poster: poster.url } : {})}
          />
        )
      ) : null;
    } else {
      const embed = videoEmbed(source, String(settings.url ?? ''), options);
      if (embed) {
        // With an image overlay, the player loads only when clicked (front-end script).
        player = poster?.url ? (
          overlay(embed)
        ) : (
          <iframe
            src={context.editing ? embed.replace('autoplay=1', 'autoplay=0') : embed}
            title="Video"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        );
      }
    }
    return (
      <ElementRoot node={node} settings={settings} name="fr-video" editing={context.editing}>
        <div className="fr-video__frame" style={{ aspectRatio: ratio }}>
          {player ??
            (context.editing ? <span className="fr-placeholder fr-placeholder--video" /> : null)}
        </div>
      </ElementRoot>
    );
  },
};

// ---- Icon box and Image box -------------------------------------------------------------

function boxControls(kind: 'icon' | 'image'): Control[] {
  return [
    kind === 'icon'
      ? content.icon('icon', 'Icon', 'Content', { default: { set: 'solid', name: 'star' } })
      : content.media('image', 'Image', 'Content', {
          accept: 'image',
          default: { id: null, url: '' },
        }),
    ...(kind === 'image'
      ? [
          content.select('image_size', 'Image size', 'Content', {
            default: 'medium',
            options: IMAGE_SIZES,
            noCss: true,
          }),
        ]
      : [
          content.select('view', 'View', 'Content', {
            default: 'default',
            options: VIEW_OPTIONS,
            noCss: true,
          }),
          content.select('shape', 'Shape', 'Content', {
            default: 'circle',
            options: [
              { value: 'circle', label: 'Circle' },
              { value: 'rounded', label: 'Rounded' },
              { value: 'square', label: 'Square' },
            ],
            condition: { view: ['stacked', 'framed'] },
            noCss: true,
          }),
        ]),
    content.text('title', 'Title', 'Content', { default: 'This is the heading' }),
    content.textarea('description', 'Description', 'Content', {
      default: 'Tell visitors what this is about, in a sentence or two.',
    }),
    content.url('link', 'Link', 'Content'),
    content.choose('position', 'Position', 'Content', {
      responsive: true,
      default: 'top',
      options: [
        { value: 'left', label: 'Left', icon: 'M4 8h6v8H4z M13 9h7 M13 14h5' },
        { value: 'top', label: 'Top', icon: 'M9 3h6v6H9z M6 13h12 M8 17h8' },
        { value: 'right', label: 'Right', icon: 'M14 8h6v8h-6z M4 9h7 M6 14h5' },
        { value: 'bottom', label: 'Bottom', icon: 'M9 15h6v6H9z M6 5h12 M8 9h8' },
      ],
      noCss: true,
    }),
    content.select('title_tag', 'Title HTML tag', 'Content', {
      default: 'h3',
      options: HEADING_TAGS,
      noCss: true,
    }),
    ...(kind === 'icon'
      ? iconStyle('icon_', 'Icon', '{{el}} .fr-box__icon')
      : [
          style.slider('image_width', 'Width', 'Image', {
            responsive: true,
            units: ['%', 'px'],
            max: 600,
            selectors: { '{{el}} .fr-box__media': 'width: {{value}}' },
          }),
          style.slider('image_height', 'Height', 'Image', {
            responsive: true,
            units: UNITS.height,
            max: 1000,
            selectors: { '{{el}} .fr-box__media img': 'height: {{value}}' },
          }),
          style.select('image_object_fit', 'Object fit', 'Image', {
            responsive: true,
            options: ['', 'cover', 'contain', 'fill'].map((v) => ({
              value: v,
              label: v || 'Default',
            })),
            selectors: { '{{el}} .fr-box__media img': 'object-fit: {{value}}' },
          }),
          objectPosition('image_object_position', 'Image', '{{el}} .fr-box__media img', {
            image_object_fit: ['cover', 'contain'],
          }),
          groups.border('image_border', 'Border', 'Image', '{{el}} .fr-box__media img'),
          groups.shadow('image_shadow', 'Box shadow', 'Image', '{{el}} .fr-box__media img'),
          style.slider('image_opacity', 'Opacity', 'Image', {
            hover: true,
            units: [''],
            min: 0,
            max: 1,
            step: 0.05,
            selectors: { '{{el}} .fr-box__media img': 'opacity: {{size}}' },
          }),
          groups.filters('image_filters', 'CSS filters', 'Image', '{{el}} .fr-box__media img'),
          groups.filters(
            'image_filters_hover',
            'CSS filters on hover',
            'Image',
            '{{el}}:hover .fr-box__media img',
          ),
          style.slider('image_hover_transition', 'Transition duration (s)', 'Image', {
            units: ['s'],
            max: 3,
            step: 0.1,
            selectors: { '{{el}} .fr-box__media img': 'transition-duration: {{value}}' },
          }),
        ]),
    hoverAnimationControl(kind === 'icon' ? 'Icon' : 'Image'),
    style.slider('media_spacing', 'Spacing', kind === 'icon' ? 'Icon' : 'Image', {
      responsive: true,
      units: ['px', 'em'],
      max: 100,
      selectors: { '{{el}} .fr-box': 'gap: {{value}}' },
    }),
    style.choose('align', 'Alignment', 'Content', {
      responsive: true,
      options: TEXT_ALIGN,
      selectors: { '{{el}} .fr-box': 'text-align: {{value}}' },
    }),
    style.choose('vertical_align', 'Vertical alignment', 'Content', {
      options: [
        { value: 'flex-start', label: 'Top' },
        { value: 'center', label: 'Middle' },
        { value: 'flex-end', label: 'Bottom' },
      ],
      condition: { position: ['left', 'right'] },
      selectors: { '{{el}} .fr-box': 'align-items: {{value}}' },
    }),
    style.slider('title_spacing', 'Title spacing', 'Content', {
      responsive: true,
      units: ['px', 'em'],
      max: 100,
      selectors: { '{{el}} .fr-box__title': 'margin-bottom: {{value}}' },
    }),
    ...textStyle('title_', 'Title', '{{el}} .fr-box__title', { hover: true }),
    ...textStrokeControls('title_stroke', 'Title', '{{el}} .fr-box__title'),
    groups.textShadow('title_shadow', 'Text shadow', 'Title', '{{el}} .fr-box__title'),
    style.slider('title_hover_transition', 'Transition duration (s)', 'Title', {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: { '{{el}} .fr-box__title': 'transition: color {{value}}' },
    }),
    ...textStyle('description_', 'Description', '{{el}} .fr-box__description'),
    groups.textShadow(
      'description_shadow',
      'Text shadow',
      'Description',
      '{{el}} .fr-box__description',
    ),
    ...advancedControls(),
  ];
}

function Box({
  kind,
  media,
  settings,
  nodeAttrs,
}: {
  kind: 'icon' | 'image';
  media: ReactNode;
  settings: Settings;
  nodeAttrs: Settings;
}) {
  const link = linkProps(settings.link);
  const Title = (
    HEADING_TAGS.some((t) => t.value === settings.title_tag) ? settings.title_tag : 'h3'
  ) as 'h3';
  const position = (value: unknown) =>
    ['left', 'right', 'top', 'bottom'].includes(value as string) ? String(value) : null;
  const classes = [
    'fr-box',
    `fr-box--${position(settings.position) ?? 'top'}`,
    ...OTHER_DEVICES.map(
      (d) =>
        position(nodeAttrs[`position@${d}`]) &&
        `fr-box--${d}-${position(nodeAttrs[`position@${d}`])}`,
    ),
  ]
    .filter(Boolean)
    .join(' ');
  const title = plainText(settings.title);
  return (
    <div className={classes}>
      {media && (
        <div className={kind === 'icon' ? 'fr-box__media fr-box__icon-wrap' : 'fr-box__media'}>
          {link ? (
            <a {...link} tabIndex={-1} aria-hidden="true">
              {media}
            </a>
          ) : (
            media
          )}
        </div>
      )}
      <div className="fr-box__content">
        {title && (
          <Title className="fr-box__title">{link ? <a {...link}>{title}</a> : title}</Title>
        )}
        {plainText(settings.description) && (
          <p className="fr-box__description">{plainText(settings.description)}</p>
        )}
      </div>
    </div>
  );
}

export const iconBox: ElementDefinition = {
  type: 'fresco/icon-box',
  title: 'Icon box',
  icon: 'M9 3h6v6H9z M6 13h12 M8 17h8',
  category: 'general',
  keywords: ['feature', 'service', 'card'],
  controls: boxControls('icon'),
  render({ node, settings, context }) {
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={`fr-icon-box${viewClasses(settings)}`}
        editing={context.editing}
      >
        <Box
          kind="icon"
          settings={settings}
          nodeAttrs={node.attrs}
          media={
            settings.icon ? (
              <span className={`fr-box__icon${hoverClass(settings.hover_effect)}`}>
                <Icon value={settings.icon} />
              </span>
            ) : null
          }
        />
      </ElementRoot>
    );
  },
};

export const imageBox: ElementDefinition = {
  type: 'fresco/image-box',
  title: 'Image box',
  icon: 'M8 3h8v7H8z M8 8l2-2 2 2 2-1 2 3 M6 14h12 M8 18h8',
  category: 'general',
  keywords: ['feature', 'card', 'team'],
  controls: boxControls('image'),
  media: (settings) => mediaIds(settings.image),
  render({ node, settings, context }) {
    const image = settings.image as { url?: string } | undefined;
    const hover = hoverClass(settings.hover_effect).trim();
    const media = image?.url ? (
      <FrImage
        value={image}
        context={context}
        size={String(settings.image_size ?? 'medium')}
        {...(hover ? { className: hover } : {})}
      />
    ) : context.editing ? (
      <span className="fr-placeholder fr-placeholder--image" />
    ) : null;
    return (
      <ElementRoot node={node} settings={settings} name="fr-image-box" editing={context.editing}>
        <Box kind="image" settings={settings} nodeAttrs={node.attrs} media={media} />
      </ElementRoot>
    );
  },
};
