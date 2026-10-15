/**
 * General and media widgets: Icon list, Counter, Progress bar, Testimonial,
 * Social icons, Alert, Audio, Image carousel, Image gallery, Star rating,
 * HTML, Menu anchor, Google Maps, Text path.
 */
import type { ReactNode } from 'react';
import { advancedControls, ElementRoot } from '../core/common.js';
import { ALIGN, content, groups, style, textStyle } from '../core/controls.js';
import { Icon } from '../core/icons.js';
import { linkProps } from '../core/links.js';
import { FrImage, IMAGE_SIZES, isMedia, mediaIds } from '../core/media.js';
import type { Control, ElementDefinition, Settings } from '../core/model.js';
import { plainText } from '../core/sanitize.js';

const items = (settings: Settings, name: string): Settings[] =>
  Array.isArray(settings[name]) ? (settings[name] as Settings[]) : [];

const num = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// ---- Icon list ------------------------------------------------------------------------------

export const iconList: ElementDefinition = {
  type: 'fresco/icon-list',
  title: 'Icon list',
  icon: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  category: 'general',
  keywords: ['list', 'bullets', 'features'],
  controls: [
    content.repeater('items', 'Items', 'List', {
      itemTitle: 'text',
      default: [
        { _id: 'a', text: 'List item', icon: { set: 'solid', name: 'check' } },
        { _id: 'b', text: 'List item', icon: { set: 'solid', name: 'check' } },
        { _id: 'c', text: 'List item', icon: { set: 'solid', name: 'check' } },
      ],
      fields: [
        content.text('text', 'Text', 'Item', { default: 'List item' }),
        content.icon('icon', 'Icon', 'Item', { default: { set: 'solid', name: 'check' } }),
        content.url('link', 'Link', 'Item'),
      ],
    }),
    content.choose('layout', 'Layout', 'List', {
      default: 'column',
      options: [
        { value: 'column', label: 'Default', icon: 'M4 6h16 M4 12h16 M4 18h16' },
        { value: 'inline', label: 'Inline', icon: 'M4 12h4 M10 12h4 M16 12h4' },
      ],
      noCss: true,
    }),
    style.slider('space', 'Space between', 'List', {
      responsive: true,
      units: ['px', 'em'],
      max: 60,
      selectors: { '{{el}} .fr-list': 'gap: {{value}}' },
    }),
    style.choose('align', 'Alignment', 'List', {
      responsive: true,
      options: ALIGN.map((o) => ({
        ...o,
        value: o.value === 'left' ? 'flex-start' : o.value === 'right' ? 'flex-end' : 'center',
      })),
      selectors: {
        '{{el}} .fr-list': 'justify-content: {{value}}',
        '{{el}} .fr-list--column': 'align-items: {{value}}',
      },
    }),
    style.switch('divider', 'Divider', 'List', { noCss: true }),
    style.color('divider_color', 'Divider color', 'List', {
      condition: { divider: true },
      selectors: { '{{el}} .fr-list--divider > li + li': 'border-color: {{value}}' },
    }),
    style.color('icon_color', 'Color', 'Icon', {
      hover: true,
      selectors: { '{{el}} .fr-list__icon': 'color: {{value}}' },
    }),
    style.slider('icon_size', 'Size', 'Icon', {
      responsive: true,
      units: ['px', 'em'],
      max: 80,
      selectors: { '{{el}} .fr-list__icon': 'font-size: {{value}}' },
    }),
    style.slider('icon_gap', 'Space after the icon', 'Icon', {
      units: ['px', 'em'],
      max: 40,
      selectors: { '{{el}} .fr-list__item': 'gap: {{value}}' },
    }),
    ...textStyle('text_', 'Text', '{{el}} .fr-list__text', { hover: true }),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const list = items(settings, 'items');
    const classes = `fr-list fr-list--${settings.layout === 'inline' ? 'inline' : 'column'}${settings.divider === true ? ' fr-list--divider' : ''}`;
    return (
      <ElementRoot node={node} settings={settings} name="fr-icon-list" editing={context.editing}>
        <ul className={classes}>
          {list.map((entry, i) => {
            const link = linkProps(entry.link);
            const body = (
              <>
                {entry.icon ? (
                  <span className="fr-list__icon">
                    <Icon value={entry.icon} />
                  </span>
                ) : null}
                <span className="fr-list__text">{plainText(entry.text)}</span>
              </>
            );
            return (
              <li key={String(entry._id ?? i)} className="fr-list__item">
                {link ? (
                  <a className="fr-list__item" {...link}>
                    {body}
                  </a>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      </ElementRoot>
    );
  },
};

// ---- Counter --------------------------------------------------------------------------------

export const counter: ElementDefinition = {
  type: 'fresco/counter',
  title: 'Counter',
  icon: 'M4 18V6 M8 6h3v12 M14 9a2.5 2.5 0 1 1 5 0c0 3-5 4-5 9h5',
  category: 'general',
  keywords: ['number', 'stats', 'count up'],
  handler: 'counter',
  controls: [
    content.number('start', 'Starting number', 'Counter', { default: 0 }),
    content.number('end', 'Ending number', 'Counter', { default: 100 }),
    content.text('prefix', 'Prefix', 'Counter'),
    content.text('suffix', 'Suffix', 'Counter'),
    content.number('duration', 'Duration (ms)', 'Counter', {
      default: 2000,
      min: 0,
      max: 20000,
      step: 100,
      noCss: true,
    }),
    content.switch('separator', 'Thousands separator', 'Counter', { default: true, noCss: true }),
    content.text('title', 'Title', 'Counter', { default: 'Cool number' }),
    content.choose('title_position', 'Title position', 'Counter', {
      default: 'after',
      options: [
        { value: 'before', label: 'Before' },
        { value: 'after', label: 'After' },
      ],
      noCss: true,
    }),
    style.choose('align', 'Alignment', 'Number', {
      responsive: true,
      options: ALIGN,
      selectors: { '{{el}}': 'text-align: {{value}}' },
    }),
    ...textStyle('number_', 'Number', '{{el}} .fr-counter__number'),
    ...textStyle('title_', 'Title', '{{el}} .fr-counter__title'),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const end = num(settings.end, 100);
    const start = num(settings.start, 0);
    const format = (n: number) =>
      settings.separator === false ? String(n) : new Intl.NumberFormat(context.locale).format(n);
    const title = plainText(settings.title);
    const titleNode = title ? <div className="fr-counter__title">{title}</div> : null;
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-counter"
        editing={context.editing}
        extra={{ 'data-fr-handler': 'counter' }}
      >
        {settings.title_position === 'before' && titleNode}
        <div className="fr-counter__number">
          <span className="fr-counter__prefix">{plainText(settings.prefix)}</span>
          <span
            className="fr-counter__value"
            data-fr-from={start}
            data-fr-to={end}
            data-fr-duration={num(settings.duration, 2000)}
            data-fr-separator={settings.separator === false ? '' : context.locale}
          >
            {format(end)}
          </span>
          <span className="fr-counter__suffix">{plainText(settings.suffix)}</span>
        </div>
        {settings.title_position !== 'before' && titleNode}
      </ElementRoot>
    );
  },
};

// ---- Progress bar ------------------------------------------------------------------------------

export const progress: ElementDefinition = {
  type: 'fresco/progress',
  title: 'Progress bar',
  icon: 'M3 10h18v4H3z M3 10h11v4H3z',
  category: 'general',
  keywords: ['skill', 'bar', 'percent'],
  handler: 'progress',
  controls: [
    content.text('title', 'Title', 'Progress bar', { default: 'My skill' }),
    content.slider('percent', 'Percentage', 'Progress bar', {
      default: { size: 50, unit: '%' },
      units: ['%'],
      max: 100,
      noCss: true,
    }),
    content.switch('show_percent', 'Show the percentage', 'Progress bar', {
      default: true,
      noCss: true,
    }),
    content.text('inner', 'Inner text', 'Progress bar', { placeholder: 'e.g. Web designer' }),
    style.color('bar_color', 'Bar color', 'Bar', {
      selectors: { '{{el}} .fr-progress__fill': 'background-color: {{value}}' },
    }),
    style.color('track_color', 'Track color', 'Bar', {
      selectors: { '{{el}} .fr-progress__track': 'background-color: {{value}}' },
    }),
    style.slider('height', 'Height', 'Bar', {
      units: ['px'],
      max: 80,
      selectors: { '{{el}} .fr-progress__track': 'height: {{value}}' },
    }),
    style.slider('radius', 'Radius', 'Bar', {
      units: ['px', '%'],
      max: 40,
      selectors: {
        '{{el}} .fr-progress__track, {{el}} .fr-progress__fill': 'border-radius: {{value}}',
      },
    }),
    style.color('inner_color', 'Inner text color', 'Bar', {
      selectors: { '{{el}} .fr-progress__inner': 'color: {{value}}' },
    }),
    ...textStyle('title_', 'Title', '{{el}} .fr-progress__title'),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const value = Math.max(
      0,
      Math.min(100, num((settings.percent as { size?: unknown } | undefined)?.size, 50)),
    );
    const title = plainText(settings.title);
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-progress"
        editing={context.editing}
        extra={{ 'data-fr-handler': 'progress' }}
      >
        {title && (
          <div className="fr-progress__head">
            <span className="fr-progress__title">{title}</span>
            {settings.show_percent !== false && (
              <span className="fr-progress__percent">{value}%</span>
            )}
          </div>
        )}
        <div
          className="fr-progress__track"
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={title || undefined}
        >
          <div className="fr-progress__fill" style={{ width: `${value}%` }} data-fr-percent={value}>
            {plainText(settings.inner) && (
              <span className="fr-progress__inner">{plainText(settings.inner)}</span>
            )}
          </div>
        </div>
      </ElementRoot>
    );
  },
};

// ---- Testimonial -------------------------------------------------------------------------------

export const testimonial: ElementDefinition = {
  type: 'fresco/testimonial',
  title: 'Testimonial',
  icon: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
  category: 'general',
  keywords: ['quote', 'review', 'customer'],
  controls: [
    content.textarea('content', 'Content', 'Testimonial', {
      default: 'A short sentence from a happy customer, about what changed for them.',
    }),
    content.media('image', 'Image', 'Testimonial', { accept: 'image' }),
    content.text('name', 'Name', 'Testimonial', { default: 'Jane Doe' }),
    content.text('job', 'Title', 'Testimonial', { default: 'Designer' }),
    content.url('link', 'Link', 'Testimonial'),
    content.choose('image_position', 'Image position', 'Testimonial', {
      default: 'aside',
      options: [
        { value: 'aside', label: 'Aside' },
        { value: 'top', label: 'Top' },
      ],
      noCss: true,
    }),
    content.choose('align', 'Alignment', 'Testimonial', {
      responsive: true,
      default: 'center',
      options: ALIGN,
      selectors: { '{{el}}': 'text-align: {{value}}' },
    }),
    ...textStyle('content_', 'Content', '{{el}} .fr-quote__content'),
    style.slider('image_size', 'Size', 'Image', {
      units: ['px'],
      max: 200,
      selectors: { '{{el}} .fr-quote__image img': 'width: {{value}}; height: {{value}}' },
    }),
    groups.border('image_border', 'Border', 'Image', '{{el}} .fr-quote__image img'),
    ...textStyle('name_', 'Name', '{{el}} .fr-quote__name'),
    ...textStyle('job_', 'Title', '{{el}} .fr-quote__job'),
    ...advancedControls(),
  ],
  media: (settings) => mediaIds(settings.image),
  render({ node, settings, context }) {
    const link = linkProps(settings.link);
    const name = plainText(settings.name);
    const image =
      isMedia(settings.image) && settings.image.url ? (
        <div className="fr-quote__image">
          <FrImage value={settings.image} context={context} size="thumb" alt={name} />
        </div>
      ) : null;
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={`fr-testimonial fr-quote--${settings.image_position === 'top' ? 'top' : 'aside'}`}
        editing={context.editing}
      >
        <figure className="fr-quote">
          {settings.image_position === 'top' && image}
          <blockquote className="fr-quote__content">{plainText(settings.content)}</blockquote>
          <figcaption className="fr-quote__meta">
            {settings.image_position !== 'top' && image}
            <span className="fr-quote__who">
              <cite className="fr-quote__name">{link ? <a {...link}>{name}</a> : name}</cite>
              {plainText(settings.job) && (
                <span className="fr-quote__job">{plainText(settings.job)}</span>
              )}
            </span>
          </figcaption>
        </figure>
      </ElementRoot>
    );
  },
};

// ---- Social icons ------------------------------------------------------------------------------

/** Official colors of common networks, for the "Official color" look. */
const BRAND: Record<string, string> = {
  facebook: '#1877f2',
  'facebook-f': '#1877f2',
  instagram: '#e4405f',
  'x-twitter': '#000000',
  twitter: '#1da1f2',
  linkedin: '#0a66c2',
  'linkedin-in': '#0a66c2',
  youtube: '#ff0000',
  tiktok: '#000000',
  pinterest: '#bd081c',
  'pinterest-p': '#bd081c',
  whatsapp: '#25d366',
  telegram: '#26a5e4',
  github: '#181717',
  vimeo: '#1ab7ea',
  'vimeo-v': '#1ab7ea',
  threads: '#000000',
  bluesky: '#1185fe',
  mastodon: '#6364ff',
  reddit: '#ff4500',
  spotify: '#1db954',
  dribbble: '#ea4c89',
  behance: '#1769ff',
  discord: '#5865f2',
};

export const socialIcons: ElementDefinition = {
  type: 'fresco/social-icons',
  title: 'Social icons',
  icon: 'M6 12a2 2 0 1 0 0-.01 M18 6a2 2 0 1 0 0-.01 M18 18a2 2 0 1 0 0-.01 M8 11l8-4 M8 13l8 4',
  category: 'general',
  keywords: ['social', 'facebook', 'instagram', 'share'],
  controls: [
    content.repeater('items', 'Networks', 'Social icons', {
      itemTitle: 'label',
      default: [
        {
          _id: 'f',
          icon: { set: 'brands', name: 'facebook-f' },
          link: { url: 'https://facebook.com' },
          label: 'Facebook',
        },
        {
          _id: 'i',
          icon: { set: 'brands', name: 'instagram' },
          link: { url: 'https://instagram.com' },
          label: 'Instagram',
        },
        {
          _id: 'l',
          icon: { set: 'brands', name: 'linkedin-in' },
          link: { url: 'https://linkedin.com' },
          label: 'LinkedIn',
        },
      ],
      fields: [
        content.icon('icon', 'Icon', 'Network', { default: { set: 'brands', name: 'facebook-f' } }),
        content.url('link', 'Link', 'Network'),
        content.text('label', 'Name', 'Network', { help: 'Read by screen readers.' }),
      ],
    }),
    content.select('shape', 'Shape', 'Social icons', {
      default: 'rounded',
      options: [
        { value: 'rounded', label: 'Rounded' },
        { value: 'square', label: 'Square' },
        { value: 'circle', label: 'Circle' },
      ],
      noCss: true,
    }),
    content.choose('align', 'Alignment', 'Social icons', {
      responsive: true,
      default: 'center',
      options: ALIGN,
      selectors: { '{{el}}': 'text-align: {{value}}' },
    }),
    style.select('look', 'Color', 'Icon', {
      default: 'official',
      options: [
        { value: 'official', label: 'Official color' },
        { value: 'custom', label: 'Custom' },
      ],
      noCss: true,
    }),
    style.color('primary', 'Background', 'Icon', {
      hover: true,
      condition: { look: 'custom' },
      selectors: { '{{el}} .fr-social__link': 'background-color: {{value}}' },
    }),
    style.color('secondary', 'Icon color', 'Icon', {
      hover: true,
      condition: { look: 'custom' },
      selectors: { '{{el}} .fr-social__link': 'color: {{value}}' },
    }),
    style.slider('size', 'Size', 'Icon', {
      responsive: true,
      units: ['px', 'em'],
      max: 100,
      selectors: { '{{el}} .fr-social__link': 'font-size: {{value}}' },
    }),
    style.slider('padding', 'Padding', 'Icon', {
      units: ['px', 'em'],
      max: 40,
      step: 0.1,
      selectors: { '{{el}} .fr-social__link': 'padding: {{value}}' },
    }),
    style.slider('spacing', 'Spacing', 'Icon', {
      responsive: true,
      units: ['px'],
      max: 60,
      selectors: { '{{el}} .fr-social': 'gap: {{value}}' },
    }),
    groups.border('border', 'Border', 'Icon', '{{el}} .fr-social__link'),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const shape = ['square', 'circle'].includes(settings.shape as string)
      ? String(settings.shape)
      : 'rounded';
    const official = settings.look !== 'custom';
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={`fr-social-icons fr-shape-${shape}`}
        editing={context.editing}
      >
        <div className="fr-social">
          {items(settings, 'items').map((entry, i) => {
            const link = linkProps(entry.link);
            const name = (entry.icon as { name?: string } | undefined)?.name ?? '';
            const label = plainText(entry.label) || name.replace(/-.*/, '');
            const color = official ? BRAND[name] : undefined;
            const body = <Icon value={entry.icon} />;
            const props = {
              className: 'fr-social__link',
              'aria-label': label,
              title: label,
              ...(color ? { style: { backgroundColor: color } } : {}),
            };
            return link ? (
              <a
                key={String(entry._id ?? i)}
                {...props}
                {...link}
                rel={[link.rel, 'noopener'].filter(Boolean).join(' ')}
                target={link.target ?? '_blank'}
              >
                {body}
              </a>
            ) : (
              <span key={String(entry._id ?? i)} {...props}>
                {body}
              </span>
            );
          })}
        </div>
      </ElementRoot>
    );
  },
};

// ---- Alert ---------------------------------------------------------------------------------------

export const alert: ElementDefinition = {
  type: 'fresco/alert',
  title: 'Alert',
  icon: 'M12 3l9 16H3z M12 10v4 M12 17h.01',
  category: 'general',
  keywords: ['notice', 'message', 'warning'],
  handler: 'alert',
  controls: [
    content.select('kind', 'Type', 'Alert', {
      default: 'info',
      options: [
        { value: 'info', label: 'Info' },
        { value: 'success', label: 'Success' },
        { value: 'warning', label: 'Warning' },
        { value: 'danger', label: 'Danger' },
      ],
      noCss: true,
    }),
    content.text('title', 'Title', 'Alert', { default: 'This is an alert' }),
    content.textarea('description', 'Description', 'Alert', {
      default: 'Explain what happened and what to do next.',
    }),
    content.switch('dismiss', 'Close button', 'Alert', { default: true, noCss: true }),
    style.color('background', 'Background', 'Alert', {
      selectors: { '{{el}} .fr-alert': 'background-color: {{value}}' },
    }),
    style.color('border_color', 'Border color', 'Alert', {
      selectors: { '{{el}} .fr-alert': 'border-color: {{value}}' },
    }),
    ...textStyle('title_', 'Title', '{{el}} .fr-alert__title'),
    ...textStyle('description_', 'Description', '{{el}} .fr-alert__description'),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const kind = ['success', 'warning', 'danger'].includes(settings.kind as string)
      ? String(settings.kind)
      : 'info';
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-alert-widget"
        editing={context.editing}
        extra={{ 'data-fr-handler': 'alert' }}
      >
        <div
          className={`fr-alert fr-alert--${kind}`}
          role={kind === 'danger' || kind === 'warning' ? 'alert' : 'status'}
        >
          {plainText(settings.title) && (
            <strong className="fr-alert__title">{plainText(settings.title)}</strong>
          )}
          {plainText(settings.description) && (
            <p className="fr-alert__description">{plainText(settings.description)}</p>
          )}
          {settings.dismiss !== false && (
            <button type="button" className="fr-alert__close" aria-label="Close" data-fr-close="">
              ×
            </button>
          )}
        </div>
      </ElementRoot>
    );
  },
};

// ---- Audio -----------------------------------------------------------------------------------------

export const audio: ElementDefinition = {
  type: 'fresco/audio',
  title: 'SoundCloud',
  icon: 'M3 14v3 M6 11v6 M9 9v8 M12 8v9 M15 6a5 5 0 0 1 5 5 3 3 0 0 1-1 6h-4z',
  category: 'media',
  keywords: ['audio', 'music', 'podcast', 'soundcloud'],
  controls: [
    content.text('url', 'Link', 'Audio', {
      default: 'https://soundcloud.com/',
      placeholder: 'https://soundcloud.com/…',
    }),
    content.switch('visual', 'Visual player', 'Audio', { default: true, noCss: true }),
    content.switch('autoplay', 'Autoplay', 'Audio', { noCss: true }),
    content.color('color', 'Controls color', 'Audio', { noCss: true }),
    style.slider('height', 'Height', 'Audio', {
      units: ['px'],
      max: 600,
      default: { size: 300, unit: 'px' },
      selectors: { '{{el}} iframe': 'height: {{value}}' },
    }),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const url = String(settings.url ?? '');
    const ok = /^https:\/\/(www\.|m\.)?soundcloud\.com\/[\w-]+\/[\w-]+/.test(url);
    const color =
      typeof settings.color === 'string' && /^#[0-9a-f]{6}$/i.test(settings.color)
        ? settings.color.slice(1)
        : 'c2410c';
    const src = `https://w.soundcloud.com/player/?${new URLSearchParams({
      url,
      visual: settings.visual === false ? 'false' : 'true',
      auto_play: settings.autoplay === true ? 'true' : 'false',
      color,
    }).toString()}`;
    return (
      <ElementRoot node={node} settings={settings} name="fr-audio" editing={context.editing}>
        {ok ? (
          <iframe
            src={src}
            title="SoundCloud"
            loading="lazy"
            allow="autoplay"
            style={{ width: '100%', border: 0 }}
          />
        ) : context.editing ? (
          <span className="fr-placeholder" />
        ) : null}
      </ElementRoot>
    );
  },
};

// ---- Image carousel and gallery -------------------------------------------------------------------

const galleryControl = (name: string): Control =>
  content.gallery(name, 'Images', 'Images', { default: [] });

export const imageCarousel: ElementDefinition = {
  type: 'fresco/image-carousel',
  title: 'Image carousel',
  icon: 'M7 6h10v12H7z M3 8v8 M21 8v8',
  category: 'media',
  keywords: ['slider', 'carousel', 'gallery', 'slideshow'],
  handler: 'carousel',
  controls: [
    galleryControl('images'),
    content.select('image_size', 'Image size', 'Images', {
      default: 'large',
      options: IMAGE_SIZES,
      noCss: true,
    }),
    content.number('per_view', 'Slides to show', 'Carousel', {
      responsive: true,
      default: 3,
      min: 1,
      max: 10,
      selectors: { '{{el}} .fr-carousel__track': '--fr-per-view: {{value}}' },
    }),
    content.select('navigation', 'Navigation', 'Carousel', {
      default: 'both',
      options: [
        { value: 'both', label: 'Arrows and dots' },
        { value: 'arrows', label: 'Arrows' },
        { value: 'dots', label: 'Dots' },
        { value: 'none', label: 'None' },
      ],
      noCss: true,
    }),
    content.select('link_to', 'Link', 'Carousel', {
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'file', label: 'Media file (lightbox)' },
      ],
      noCss: true,
    }),
    content.switch('autoplay', 'Autoplay', 'Carousel', { default: true, noCss: true }),
    content.number('interval', 'Autoplay speed (ms)', 'Carousel', {
      default: 5000,
      min: 1000,
      max: 30000,
      step: 500,
      noCss: true,
    }),
    content.switch('loop', 'Infinite loop', 'Carousel', { default: true, noCss: true }),
    content.switch('pause', 'Pause on hover', 'Carousel', { default: true, noCss: true }),
    style.slider('gap', 'Space between', 'Images', {
      responsive: true,
      units: ['px'],
      max: 80,
      selectors: { '{{el}} .fr-carousel__track': '--fr-gap: {{value}}' },
    }),
    style.select('fit', 'Image fit', 'Images', {
      options: ['', 'cover', 'contain'].map((v) => ({ value: v, label: v || 'Default' })),
      selectors: { '{{el}} .fr-carousel__slide img': 'object-fit: {{value}}' },
    }),
    style.slider('height', 'Height', 'Images', {
      responsive: true,
      units: ['px', 'vh'],
      max: 1000,
      selectors: { '{{el}} .fr-carousel__slide img': 'height: {{value}}' },
    }),
    groups.border('image_border', 'Border', 'Images', '{{el}} .fr-carousel__slide img'),
    style.color('arrow_color', 'Arrow color', 'Navigation', {
      selectors: { '{{el}} .fr-carousel__arrow': 'color: {{value}}' },
    }),
    style.color('dot_color', 'Dot color', 'Navigation', {
      selectors: { '{{el}} .fr-carousel__dot': 'background-color: {{value}}' },
    }),
    style.color('dot_active', 'Active dot color', 'Navigation', {
      selectors: { '{{el}} .fr-carousel__dot[aria-current="true"]': 'background-color: {{value}}' },
    }),
    ...advancedControls(),
  ],
  media: (settings) => mediaIds(settings.images),
  render({ node, settings, context }) {
    const images = (Array.isArray(settings.images) ? settings.images : []).filter(isMedia);
    const nav = String(settings.navigation ?? 'both');
    const lightbox = settings.link_to === 'file';
    if (images.length === 0) {
      return (
        <ElementRoot
          node={node}
          settings={settings}
          name="fr-image-carousel"
          editing={context.editing}
        >
          {context.editing ? <span className="fr-placeholder" /> : null}
        </ElementRoot>
      );
    }
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-image-carousel"
        editing={context.editing}
        extra={{
          'data-fr-handler': 'carousel',
          'data-fr-autoplay':
            settings.autoplay === false ? undefined : String(num(settings.interval, 5000)),
          'data-fr-loop': settings.loop === false ? undefined : '',
          'data-fr-pause': settings.pause === false ? undefined : '',
        }}
      >
        <div
          className="fr-carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label="Images"
        >
          <div className="fr-carousel__track" tabIndex={0}>
            {images.map((image, i) => {
              const img = (
                <FrImage
                  value={image}
                  context={context}
                  size={String(settings.image_size ?? 'large')}
                  sizes="(max-width: 767px) 100vw, 33vw"
                />
              );
              const href = image.id ? (context.media.get(image.id)?.url ?? image.url) : image.url;
              return (
                <div
                  key={`${image.id ?? image.url}-${i}`}
                  className="fr-carousel__slide"
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} / ${images.length}`}
                >
                  {lightbox ? (
                    <a href={href} data-fr-lightbox={`c-${node.id}`}>
                      {img}
                    </a>
                  ) : (
                    img
                  )}
                </div>
              );
            })}
          </div>
          {(nav === 'both' || nav === 'arrows') && (
            <>
              <button
                type="button"
                className="fr-carousel__arrow fr-carousel__prev"
                aria-label="Previous"
                data-fr-prev=""
              >
                ‹
              </button>
              <button
                type="button"
                className="fr-carousel__arrow fr-carousel__next"
                aria-label="Next"
                data-fr-next=""
              >
                ›
              </button>
            </>
          )}
          {(nav === 'both' || nav === 'dots') && (
            <div className="fr-carousel__dots" data-fr-dots="" />
          )}
        </div>
      </ElementRoot>
    );
  },
};

export const gallery: ElementDefinition = {
  type: 'fresco/gallery',
  title: 'Image gallery',
  icon: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  category: 'media',
  keywords: ['gallery', 'grid', 'photos'],
  controls: [
    galleryControl('images'),
    content.select('image_size', 'Image size', 'Images', {
      default: 'medium',
      options: IMAGE_SIZES,
      noCss: true,
    }),
    content.number('columns', 'Columns', 'Gallery', {
      responsive: true,
      default: 4,
      min: 1,
      max: 10,
      selectors: {
        '{{el}} .fr-gallery': 'grid-template-columns: repeat({{value}}, minmax(0, 1fr))',
      },
    }),
    content.select('ratio', 'Crop', 'Gallery', {
      default: '1/1',
      options: [
        { value: '', label: 'Original' },
        { value: '1/1', label: 'Square' },
        { value: '4/3', label: '4:3' },
        { value: '3/2', label: '3:2' },
        { value: '16/9', label: '16:9' },
        { value: '3/4', label: 'Portrait 3:4' },
      ],
      selectors: { '{{el}} .fr-gallery img': 'aspect-ratio: {{value}}; object-fit: cover' },
    }),
    content.select('link_to', 'Link', 'Gallery', {
      default: 'file',
      options: [
        { value: 'file', label: 'Media file (lightbox)' },
        { value: 'none', label: 'None' },
      ],
      noCss: true,
    }),
    content.switch('captions', 'Captions', 'Gallery', { noCss: true }),
    style.slider('gap', 'Gap', 'Images', {
      responsive: true,
      units: ['px'],
      max: 60,
      selectors: { '{{el}} .fr-gallery': 'gap: {{value}}' },
    }),
    groups.border('image_border', 'Border', 'Images', '{{el}} .fr-gallery img'),
    groups.filters('filters', 'CSS filters', 'Images', '{{el}} .fr-gallery img'),
    ...advancedControls(),
  ],
  media: (settings) => mediaIds(settings.images),
  render({ node, settings, context }) {
    const images = (Array.isArray(settings.images) ? settings.images : []).filter(isMedia);
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-gallery-widget"
        editing={context.editing}
      >
        {images.length === 0 && context.editing ? <span className="fr-placeholder" /> : null}
        <div className="fr-gallery">
          {images.map((image, i) => {
            const item = image.id ? context.media.get(image.id) : undefined;
            const caption = settings.captions === true ? (image.alt ?? item?.alt ?? '') : '';
            const img = (
              <FrImage
                value={image}
                context={context}
                size={String(settings.image_size ?? 'medium')}
                sizes="(max-width: 767px) 50vw, 25vw"
              />
            );
            const body =
              settings.link_to !== 'none' ? (
                <a
                  href={item?.url ?? image.url}
                  data-fr-lightbox={`g-${node.id}`}
                  data-fr-caption={caption || undefined}
                >
                  {img}
                </a>
              ) : (
                img
              );
            return (
              <figure key={`${image.id ?? image.url}-${i}`} className="fr-gallery__item">
                {body}
                {caption && <figcaption>{caption}</figcaption>}
              </figure>
            );
          })}
        </div>
      </ElementRoot>
    );
  },
};

// ---- Star rating -------------------------------------------------------------------------------------

export const starRating: ElementDefinition = {
  type: 'fresco/star-rating',
  title: 'Star rating',
  icon: 'M12 4l2.2 4.6 5 .7-3.6 3.5.9 5L12 15.5l-4.5 2.3.9-5-3.6-3.5 5-.7z',
  category: 'general',
  keywords: ['rating', 'stars', 'review'],
  controls: [
    content.select('scale', 'Scale', 'Rating', {
      default: '5',
      options: [
        { value: '5', label: '0–5' },
        { value: '10', label: '0–10' },
      ],
      noCss: true,
    }),
    content.number('rating', 'Rating', 'Rating', {
      default: 4.5,
      min: 0,
      max: 10,
      step: 0.1,
      noCss: true,
    }),
    content.icon('icon', 'Icon', 'Rating', { default: { set: 'solid', name: 'star' } }),
    content.text('title', 'Title', 'Rating'),
    content.choose('align', 'Alignment', 'Rating', {
      responsive: true,
      options: ALIGN,
      selectors: { '{{el}}': 'text-align: {{value}}' },
    }),
    style.slider('size', 'Size', 'Stars', {
      responsive: true,
      units: ['px', 'em'],
      max: 80,
      selectors: { '{{el}} .fr-stars': 'font-size: {{value}}' },
    }),
    style.slider('spacing', 'Spacing', 'Stars', {
      units: ['px'],
      max: 40,
      selectors: { '{{el}} .fr-stars': 'gap: {{value}}' },
    }),
    style.color('color', 'Color', 'Stars', {
      selectors: { '{{el}} .fr-star__fill': 'color: {{value}}' },
    }),
    style.color('empty', 'Empty color', 'Stars', {
      selectors: { '{{el}} .fr-star': 'color: {{value}}' },
    }),
    ...textStyle('title_', 'Title', '{{el}} .fr-rating__title'),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const scale = settings.scale === '10' ? 10 : 5;
    const rating = Math.max(0, Math.min(scale, num(settings.rating, 4.5)));
    const title = plainText(settings.title);
    return (
      <ElementRoot node={node} settings={settings} name="fr-rating" editing={context.editing}>
        {title && <span className="fr-rating__title">{title}</span>}
        <span className="fr-stars" role="img" aria-label={`Rated ${rating} out of ${scale}`}>
          {Array.from({ length: scale }, (_, i) => {
            const fill = Math.max(0, Math.min(1, rating - i));
            return (
              <span key={i} className="fr-star" aria-hidden="true">
                <Icon value={settings.icon} />
                {fill > 0 && (
                  <span className="fr-star__fill" style={{ width: `${Math.round(fill * 100)}%` }}>
                    <Icon value={settings.icon} />
                  </span>
                )}
              </span>
            );
          })}
        </span>
      </ElementRoot>
    );
  },
};

// ---- HTML, menu anchor -------------------------------------------------------------------------------

export const html: ElementDefinition = {
  type: 'fresco/html',
  title: 'HTML',
  icon: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16',
  category: 'general',
  keywords: ['code', 'embed', 'custom'],
  html: ['code'],
  controls: [
    content.code('code', 'HTML code', 'HTML', {
      placeholder: '<p>Your HTML</p>',
      help: 'Scripts and some tags are removed when the author cannot publish unfiltered HTML.',
    }),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const code = typeof settings.code === 'string' ? settings.code : '';
    return (
      <ElementRoot node={node} settings={settings} name="fr-html" editing={context.editing}>
        {context.editing && /<script/i.test(code) ? (
          <div className="fr-placeholder fr-html__note">
            HTML with scripts: they run on the page, not in the editor.
          </div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: code }} />
        )}
      </ElementRoot>
    );
  },
};

export const menuAnchor: ElementDefinition = {
  type: 'fresco/menu-anchor',
  title: 'Menu anchor',
  icon: 'M12 3v18 M12 7a2 2 0 1 0 0-.01 M5 14a7 7 0 0 0 14 0',
  category: 'general',
  keywords: ['anchor', 'one page', 'scroll'],
  controls: [
    content.text('anchor', 'The ID of the anchor', 'Anchor', {
      help: 'Link to it with #id, e.g. in a menu: #contact. Letters, digits and dashes.',
    }),
  ],
  render({ node, settings, context }) {
    const anchor =
      typeof settings.anchor === 'string' && /^[A-Za-z][\w-]{0,63}$/.test(settings.anchor)
        ? settings.anchor
        : undefined;
    return (
      <div
        className={`fr-e fr-e-${node.id.replace(/[^A-Za-z0-9_-]/g, '')} fr-anchor`}
        id={anchor}
        data-fr-id={context.editing ? node.id : undefined}
      >
        {context.editing && <span className="fr-anchor__label">#{anchor ?? 'anchor'}</span>}
      </div>
    );
  },
};

// ---- Google Maps --------------------------------------------------------------------------------------

export const googleMaps: ElementDefinition = {
  type: 'fresco/google-maps',
  title: 'Google Maps',
  icon: 'M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z M12 9a2 2 0 1 0 0-.01',
  category: 'general',
  keywords: ['map', 'location', 'address'],
  controls: [
    content.text('address', 'Location', 'Map', { default: 'Colosseo, Roma' }),
    content.number('zoom', 'Zoom', 'Map', { default: 14, min: 1, max: 20, noCss: true }),
    content.slider('height', 'Height', 'Map', {
      responsive: true,
      default: { size: 300, unit: 'px' },
      units: ['px', 'vh'],
      max: 1200,
      selectors: { '{{el}} iframe': 'height: {{value}}' },
    }),
    groups.filters('filters', 'CSS filters', 'Map', '{{el}} iframe'),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const address = plainText(settings.address).trim();
    const zoom = Math.max(1, Math.min(20, Math.round(num(settings.zoom, 14))));
    const src = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&t=m&z=${zoom}&output=embed&iwloc=near`;
    return (
      <ElementRoot node={node} settings={settings} name="fr-map" editing={context.editing}>
        {address ? (
          <iframe
            src={src}
            title={address}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            style={{ width: '100%', border: 0 }}
          />
        ) : null}
      </ElementRoot>
    );
  },
};

// ---- Text path ------------------------------------------------------------------------------------------

const PATHS: Record<string, string> = {
  wave: 'M0,120 C100,40 150,40 250,120 S400,200 500,120',
  arc: 'M20,220 A230,230 0 0,1 480,220',
  circle: 'M250,40 a210,210 0 1,1 -0.1,0 z',
  line: 'M0,150 L500,150',
  oval: 'M250,60 a230,150 0 1,1 -0.1,0 z',
};

export const textPath: ElementDefinition = {
  type: 'fresco/text-path',
  title: 'Text path',
  icon: 'M3 16c4-8 8-8 12 0s4 0 6-2',
  category: 'general',
  keywords: ['curved text', 'circle text', 'svg'],
  controls: [
    content.text('text', 'Text', 'Text path', { default: 'Add your curvy text here' }),
    content.select('path', 'Path', 'Text path', {
      default: 'wave',
      options: Object.keys(PATHS).map((p) => ({
        value: p,
        label: p[0]!.toUpperCase() + p.slice(1),
      })),
      noCss: true,
    }),
    content.url('link', 'Link', 'Text path'),
    content.slider('width', 'Size', 'Text path', {
      responsive: true,
      default: { size: 500, unit: 'px' },
      units: ['px', '%'],
      max: 1200,
      selectors: { '{{el}} svg': 'width: {{value}}' },
    }),
    content.slider('offset', 'Start point', 'Text path', {
      default: { size: 0, unit: '%' },
      units: ['%'],
      max: 100,
      noCss: true,
    }),
    content.choose('align', 'Alignment', 'Text path', {
      responsive: true,
      options: ALIGN,
      selectors: { '{{el}}': 'text-align: {{value}}' },
    }),
    ...textStyle('', 'Text', '{{el}} text'),
    style.color('stroke', 'Path color', 'Path', {
      selectors: { '{{el}} .fr-text-path__line': 'stroke: {{value}}' },
    }),
    style.slider('stroke_width', 'Path width', 'Path', {
      units: ['px'],
      max: 20,
      selectors: { '{{el}} .fr-text-path__line': 'stroke-width: {{value}}' },
    }),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const shape = PATHS[String(settings.path)] ?? PATHS.wave!;
    const id = `fr-tp-${node.id.replace(/[^A-Za-z0-9_-]/g, '')}`;
    const offset = num((settings.offset as { size?: unknown } | undefined)?.size, 0);
    const link = linkProps(settings.link);
    const text: ReactNode = (
      <textPath href={`#${id}`} startOffset={`${offset}%`}>
        {plainText(settings.text)}
      </textPath>
    );
    return (
      <ElementRoot node={node} settings={settings} name="fr-text-path" editing={context.editing}>
        <svg
          viewBox="0 0 500 300"
          className="fr-text-path__svg"
          role="img"
          aria-label={plainText(settings.text)}
        >
          <path id={id} d={shape} className="fr-text-path__line" fill="none" />
          <text>{link ? <a href={link.href}>{text}</a> : text}</text>
        </svg>
      </ElementRoot>
    );
  },
};
