/** General widgets: Icon, Video, Icon box, Image box. */
import { advancedControls, ElementRoot } from '../core/common.js';
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
      units: ['deg'],
      min: 0,
      max: 360,
      selectors: { [`${selector} svg`]: 'transform: rotate({{value}})' },
    }),
    style.slider(`${prefix}border_width`, 'Border width', section, {
      units: ['px'],
      max: 20,
      condition: { view: 'framed' },
      selectors: { [selector]: 'border-width: {{value}}' },
    }),
    style.box(`${prefix}radius`, 'Border radius', section, {
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
  const shape = settings.shape === 'square' ? 'square' : 'circle';
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
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const link = linkProps(settings.link);
    const glyph = <Icon value={settings.icon} />;
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={`fr-icon-widget${viewClasses(settings)}`}
        editing={context.editing}
      >
        {link ? (
          <a className="fr-icon-wrap" {...link}>
            {glyph}
          </a>
        ) : (
          <span className="fr-icon-wrap">{glyph}</span>
        )}
      </ElementRoot>
    );
  },
};

// ---- Video ---------------------------------------------------------------------------------

/** The embed address of a YouTube or Vimeo link, or null. */
export function videoEmbed(
  source: string,
  url: string,
  options: {
    autoplay?: boolean;
    mute?: boolean;
    loop?: boolean;
    controls?: boolean;
    start?: number;
  },
): string | null {
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
    params.set('rel', '0');
    const query = params.toString();
    return `https://www.youtube-nocookie.com/embed/${id}${query ? `?${query}` : ''}`;
  }
  if (source === 'vimeo') {
    const id = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url)?.[1];
    if (!id) return null;
    if (options.autoplay) params.set('autoplay', '1');
    if (options.mute) params.set('muted', '1');
    if (options.loop) params.set('loop', '1');
    params.set('dnt', '1');
    return `https://player.vimeo.com/video/${id}?${params.toString()}${options.start ? `#t=${Math.floor(options.start)}s` : ''}`;
  }
  return null;
}

const RATIOS = ['16/9', '4/3', '3/2', '1/1', '9/16', '21/9'];

export const video: ElementDefinition = {
  type: 'fresco/video',
  title: 'Video',
  icon: 'M4 6h12v12H4z M16 10l4-2.5v9L16 14',
  category: 'basic',
  keywords: ['youtube', 'vimeo', 'film', 'embed'],
  controls: [
    content.select('source', 'Source', 'Video', {
      default: 'youtube',
      options: [
        { value: 'youtube', label: 'YouTube' },
        { value: 'vimeo', label: 'Vimeo' },
        { value: 'hosted', label: 'Media library' },
      ],
      noCss: true,
    }),
    content.text('url', 'Link', 'Video', {
      default: 'https://www.youtube.com/watch?v=XHOmBV4js_E',
      placeholder: 'https://www.youtube.com/watch?v=…',
      condition: { source: ['youtube', 'vimeo'] },
    }),
    content.media('file', 'Video file', 'Video', {
      accept: 'video',
      condition: { source: 'hosted' },
    }),
    content.number('start', 'Start time (seconds)', 'Video', { min: 0, noCss: true }),
    content.switch('autoplay', 'Autoplay', 'Video', { noCss: true }),
    content.switch('mute', 'Mute', 'Video', { noCss: true }),
    content.switch('loop', 'Loop', 'Video', { noCss: true }),
    content.switch('controls', 'Player controls', 'Video', { default: true, noCss: true }),
    content.media('poster', 'Image overlay', 'Video', {
      accept: 'image',
      help: 'Shown until the visitor plays the video; nothing is loaded from the video site before.',
    }),
    style.select('ratio', 'Aspect ratio', 'Video', {
      default: '16/9',
      options: RATIOS.map((r) => ({ value: r, label: r.replace('/', ':') })),
      selectors: { '{{el}} .fr-video__frame': 'aspect-ratio: {{value}}' },
      noCss: true,
    }),
    groups.filters('filters', 'CSS filters', 'Video', '{{el}} .fr-video__frame'),
    ...advancedControls(),
  ],
  media: (settings) => mediaIds(settings.file, settings.poster),
  handler: 'video',
  render({ node, settings, context }) {
    const ratio = RATIOS.includes(settings.ratio as string) ? String(settings.ratio) : '16/9';
    const options = {
      autoplay: settings.autoplay === true,
      mute: settings.mute === true,
      loop: settings.loop === true,
      controls: settings.controls !== false,
      start: Number(settings.start) || 0,
    };
    const poster = settings.poster as { url?: string } | undefined;
    const source = String(settings.source ?? 'youtube');
    let player = null;
    if (source === 'hosted') {
      const file = settings.file as { url?: string } | undefined;
      const url =
        file?.url && /^(https?:\/\/|\/(?!\/))[^\s"'<>]*$/.test(file.url) ? file.url : null;
      player = url ? (
        <video
          src={url}
          controls={options.controls}
          autoPlay={options.autoplay}
          muted={options.mute || options.autoplay}
          loop={options.loop}
          playsInline
          preload="metadata"
          {...(poster?.url ? { poster: poster.url } : {})}
        />
      ) : null;
    } else {
      const embed = videoEmbed(source, String(settings.url ?? ''), options);
      if (embed) {
        // With an image overlay, the player loads only when clicked (front-end script).
        player = poster?.url ? (
          <button
            type="button"
            className="fr-video__overlay"
            data-fr-video={embed}
            aria-label="Play video"
          >
            <FrImage value={poster} context={context} size="large" />
            <span className="fr-video__play" aria-hidden="true" />
          </button>
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
          groups.border('image_border', 'Border', 'Image', '{{el}} .fr-box__media img'),
          groups.filters('image_filters', 'CSS filters', 'Image', '{{el}} .fr-box__media img'),
        ]),
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
    ...textStyle('description_', 'Description', '{{el}} .fr-box__description'),
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
    ['left', 'right', 'top'].includes(value as string) ? String(value) : null;
  const classes = [
    'fr-box',
    `fr-box--${position(settings.position) ?? 'top'}`,
    position(nodeAttrs['position@tablet']) &&
      `fr-box--tablet-${position(nodeAttrs['position@tablet'])}`,
    position(nodeAttrs['position@mobile']) &&
      `fr-box--mobile-${position(nodeAttrs['position@mobile'])}`,
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
              <span className="fr-box__icon">
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
    const media = image?.url ? (
      <FrImage value={image} context={context} size={String(settings.image_size ?? 'medium')} />
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
