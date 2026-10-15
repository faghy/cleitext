/**
 * Atomic elements: content settings only; their look comes from style
 * variants and global classes (Style tab). Light defaults, so they start
 * close to plain HTML.
 */
import { ElementRoot } from '../core/common.js';
import { content, HEADING_TAGS } from '../core/controls.js';
import { linkProps } from '../core/links.js';
import { FrImage, IMAGE_SIZES, isMedia, mediaIds } from '../core/media.js';
import type { Control, ElementDefinition } from '../core/model.js';
import { plainText, sanitizeRich } from '../core/sanitize.js';
import { videoEmbed } from './general.js';

/** Settings every atomic element has: its HTML id and extra attributes. */
const attributes: Control[] = [
  content.text('_css_id', 'ID', 'Attributes', {
    help: 'Letters, digits, dashes and underscores.',
    noCss: true,
  }),
  content.text('_css_classes', 'Extra CSS classes', 'Attributes', { noCss: true }),
];

const box = (
  type: string,
  title: string,
  icon: string,
  display: 'block' | 'flex' | 'grid',
): ElementDefinition => ({
  type: `fresco/a-${type}`,
  title,
  icon,
  category: 'atomic',
  keywords: ['atomic', 'div', 'box', type],
  container: true,
  atomic: true,
  controls: [
    content.select('tag', 'HTML tag', 'Box', {
      default: 'div',
      options: ['div', 'section', 'header', 'footer', 'main', 'article', 'aside', 'nav'].map(
        (t) => ({ value: t, label: t }),
      ),
      noCss: true,
    }),
    content.url('link', 'Link (the whole box)', 'Box'),
    ...attributes,
  ],
  create: () => ({
    type: `fresco/a-${type}`,
    v: 1,
    attrs: {},
    children: [],
  }),
  render({ node, settings, children, context }) {
    const tags = ['div', 'section', 'header', 'footer', 'main', 'article', 'aside', 'nav'] as const;
    const tag = tags.includes(settings.tag as never)
      ? (settings.tag as (typeof tags)[number])
      : 'div';
    const link = linkProps(settings.link);
    const empty = !node.children?.length;
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={`fr-a fr-a-box fr-a-${display}`}
        editing={context.editing}
        tag={link ? 'a' : tag}
        extra={link ? { href: link.href, target: link.target, rel: link.rel } : undefined}
      >
        {children}
        {empty && context.editing ? <div className="fr-empty" data-fr-empty="" /> : null}
      </ElementRoot>
    );
  },
});

export const aDiv = box('div', 'Div block', 'M4 5h16v14H4z', 'block');
export const aFlexbox = box('flexbox', 'Flexbox', 'M4 5h16v14H4z M10 5v14 M15 5v14', 'flex');
export const aGrid = box('grid', 'Grid', 'M4 4h16v16H4z M4 12h16 M12 4v16', 'grid');

export const aHeading: ElementDefinition = {
  type: 'fresco/a-heading',
  title: 'Heading',
  icon: 'M6 4v16 M18 4v16 M6 12h12',
  category: 'atomic',
  keywords: ['atomic', 'title'],
  atomic: true,
  controls: [
    content.textarea('title', 'Title', 'Content', { default: 'This is a title' }),
    content.select('tag', 'Tag', 'Content', { default: 'h2', options: HEADING_TAGS, noCss: true }),
    content.url('link', 'Link', 'Content'),
    ...attributes,
  ],
  render({ node, settings, context }) {
    const tag = (HEADING_TAGS.some((t) => t.value === settings.tag) ? settings.tag : 'h2') as 'h2';
    const link = linkProps(settings.link);
    const text = plainText(settings.title);
    // The heading is the element itself, so its style applies to it directly.
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-a fr-a-heading"
        editing={context.editing}
        tag={tag}
        extra={{ 'data-fr-inline': context.editing ? 'title' : undefined }}
      >
        {link ? <a {...link}>{text}</a> : text}
      </ElementRoot>
    );
  },
};

export const aParagraph: ElementDefinition = {
  type: 'fresco/a-paragraph',
  title: 'Paragraph',
  icon: 'M4 6h16 M4 10h16 M4 14h12',
  category: 'atomic',
  keywords: ['atomic', 'text'],
  atomic: true,
  controls: [
    content.richtext('content', 'Text', 'Content', { default: '<p>Type your paragraph here.</p>' }),
    ...attributes,
  ],
  render({ node, settings, context }) {
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-a fr-a-paragraph"
        editing={context.editing}
      >
        <div
          data-fr-inline={context.editing ? 'content' : undefined}
          dangerouslySetInnerHTML={{ __html: sanitizeRich(settings.content) }}
        />
      </ElementRoot>
    );
  },
};

export const aButton: ElementDefinition = {
  type: 'fresco/a-button',
  title: 'Button',
  icon: 'M3 8h18v8H3z',
  category: 'atomic',
  keywords: ['atomic', 'link', 'cta'],
  atomic: true,
  controls: [
    content.text('text', 'Text', 'Content', { default: 'Click here' }),
    content.url('link', 'Link', 'Content', { default: { url: '#' } }),
    ...attributes,
  ],
  render({ node, settings, context }) {
    const link = linkProps(settings.link);
    const text = (
      <span data-fr-inline={context.editing ? 'text' : undefined}>{plainText(settings.text)}</span>
    );
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-a fr-a-button"
        editing={context.editing}
        tag={link ? 'a' : 'div'}
        extra={link ? { href: link.href, target: link.target, rel: link.rel } : undefined}
      >
        {text}
      </ElementRoot>
    );
  },
};

export const aImage: ElementDefinition = {
  type: 'fresco/a-image',
  title: 'Image',
  icon: 'M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5',
  category: 'atomic',
  keywords: ['atomic', 'photo'],
  atomic: true,
  controls: [
    content.media('image', 'Image', 'Content', { accept: 'image', default: { id: null, url: '' } }),
    content.select('image_size', 'Size', 'Content', {
      default: 'large',
      options: IMAGE_SIZES,
      noCss: true,
    }),
    content.text('alt', 'Alternative text', 'Content', {
      help: 'Empty: the one from the media library.',
    }),
    content.url('link', 'Link', 'Content'),
    ...attributes,
  ],
  media: (settings) => mediaIds(settings.image),
  render({ node, settings, context }) {
    const link = linkProps(settings.link);
    const image =
      isMedia(settings.image) && settings.image.url ? (
        <FrImage
          value={settings.image}
          context={context}
          size={String(settings.image_size ?? 'large')}
          className="fr-a-image__img"
          {...(plainText(settings.alt) ? { alt: plainText(settings.alt) } : {})}
        />
      ) : context.editing ? (
        <span className="fr-placeholder" />
      ) : null;
    return (
      <ElementRoot node={node} settings={settings} name="fr-a fr-a-image" editing={context.editing}>
        {link && image ? <a {...link}>{image}</a> : image}
      </ElementRoot>
    );
  },
};

export const aSvg: ElementDefinition = {
  type: 'fresco/a-svg',
  title: 'SVG',
  icon: 'M5 19L19 5 M5 5h6 M13 19h6',
  category: 'atomic',
  keywords: ['atomic', 'vector', 'logo'],
  atomic: true,
  controls: [
    content.media('svg', 'SVG file', 'Content', { accept: 'svg' }),
    content.url('link', 'Link', 'Content'),
    ...attributes,
  ],
  media: (settings) => mediaIds(settings.svg),
  render({ node, settings, context }) {
    const link = linkProps(settings.link);
    const file = settings.svg as { url?: string } | undefined;
    const img =
      file?.url && /^(https?:\/\/|\/(?!\/))[^\s"'<>]*$/.test(file.url) ? (
        <img src={file.url} alt="" className="fr-a-svg__img" />
      ) : context.editing ? (
        <span className="fr-placeholder" />
      ) : null;
    return (
      <ElementRoot node={node} settings={settings} name="fr-a fr-a-svg" editing={context.editing}>
        {link && img ? <a {...link}>{img}</a> : img}
      </ElementRoot>
    );
  },
};

export const aDivider: ElementDefinition = {
  type: 'fresco/a-divider',
  title: 'Divider',
  icon: 'M4 12h16',
  category: 'atomic',
  keywords: ['atomic', 'line', 'hr'],
  atomic: true,
  controls: [...attributes],
  render({ node, settings, context }) {
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-a fr-a-divider"
        editing={context.editing}
      >
        <hr />
      </ElementRoot>
    );
  },
};

export const aYoutube: ElementDefinition = {
  type: 'fresco/a-youtube',
  title: 'YouTube',
  icon: 'M4 7h16v10H4z M10 9.5l4 2.5-4 2.5z',
  category: 'atomic',
  keywords: ['atomic', 'video'],
  atomic: true,
  controls: [
    content.text('url', 'Link', 'Content', {
      default: 'https://www.youtube.com/watch?v=XHOmBV4js_E',
    }),
    content.switch('autoplay', 'Autoplay', 'Content', { noCss: true }),
    content.switch('mute', 'Mute', 'Content', { noCss: true }),
    content.switch('loop', 'Loop', 'Content', { noCss: true }),
    ...attributes,
  ],
  render({ node, settings, context }) {
    const embed = videoEmbed('youtube', String(settings.url ?? ''), {
      autoplay: settings.autoplay === true && !context.editing,
      mute: settings.mute === true,
      loop: settings.loop === true,
    });
    return (
      <ElementRoot node={node} settings={settings} name="fr-a fr-a-video" editing={context.editing}>
        {embed ? (
          <iframe
            src={embed}
            title="Video"
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : null}
      </ElementRoot>
    );
  },
};

export const aVideo: ElementDefinition = {
  type: 'fresco/a-video',
  title: 'Video',
  icon: 'M4 6h12v12H4z M16 10l4-2.5v9L16 14',
  category: 'atomic',
  keywords: ['atomic', 'video', 'mp4'],
  atomic: true,
  controls: [
    content.media('file', 'Video file', 'Content', { accept: 'video' }),
    content.switch('autoplay', 'Autoplay', 'Content', { noCss: true }),
    content.switch('mute', 'Mute', 'Content', { noCss: true }),
    content.switch('loop', 'Loop', 'Content', { noCss: true }),
    content.switch('controls', 'Controls', 'Content', { default: true, noCss: true }),
    ...attributes,
  ],
  media: (settings) => mediaIds(settings.file),
  render({ node, settings, context }) {
    const file = settings.file as { url?: string } | undefined;
    const url = file?.url && /^(https?:\/\/|\/(?!\/))[^\s"'<>]*$/.test(file.url) ? file.url : null;
    return (
      <ElementRoot node={node} settings={settings} name="fr-a fr-a-video" editing={context.editing}>
        {url ? (
          <video
            src={url}
            autoPlay={settings.autoplay === true && !context.editing}
            muted={settings.mute === true || settings.autoplay === true}
            loop={settings.loop === true}
            controls={settings.controls !== false}
            playsInline
          />
        ) : context.editing ? (
          <span className="fr-placeholder" />
        ) : null}
      </ElementRoot>
    );
  },
};

export const ATOMIC_ELEMENTS = [
  aDiv,
  aFlexbox,
  aGrid,
  aHeading,
  aParagraph,
  aButton,
  aImage,
  aSvg,
  aDivider,
  aYoutube,
  aVideo,
];
