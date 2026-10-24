/** Basic widgets: Heading, Text, Image, Button, Spacer, Divider. */
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
  sizeControls,
  style,
  TEXT_ALIGN,
  textStyle,
} from '../core/controls.js';
import { Icon } from '../core/icons.js';
import { linkProps } from '../core/links.js';
import { FrImage, IMAGE_SIZES, mediaIds } from '../core/media.js';
import type { Control, ElementDefinition } from '../core/model.js';
import { plainText, sanitizeRich } from '../core/sanitize.js';

const textAlign = (selector: string) =>
  style.choose('align', 'Alignment', 'Text', {
    responsive: true,
    options: TEXT_ALIGN,
    selectors: { [selector]: 'text-align: {{value}}' },
  });

/** A title on several lines: line breaks become <br>. */
function Lines({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line}
        </span>
      ))}
    </>
  );
}

const HEADING_SIZES = [
  { value: '', label: 'Default' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xl', label: 'XL' },
  { value: 'xxl', label: 'XXL' },
];

export const heading: ElementDefinition = {
  type: 'fresco/heading',
  title: 'Heading',
  icon: 'M6 4v16 M18 4v16 M6 12h12',
  category: 'basic',
  keywords: ['title', 'text', 'h1', 'h2'],
  controls: [
    content.textarea('title', 'Title', 'Title', { default: 'Add your heading here' }),
    content.url('link', 'Link', 'Title'),
    content.select('size', 'Size', 'Title', { default: '', options: HEADING_SIZES, noCss: true }),
    content.select('tag', 'HTML tag', 'Title', {
      default: 'h2',
      options: HEADING_TAGS,
      noCss: true,
    }),
    textAlign('{{el}}'),
    ...textStyle('title_', 'Title', '{{el}} .fr-heading__title', { hover: true }),
    style.switch('title_theme_font', 'Theme font', 'Title', {
      help: 'Without a font of its own, the heading takes the theme’s font for its tag (h1–h6) instead of the primary global font, as imported Elementor headings did.',
      noCss: true,
    }),
    groups.textShadow('title_shadow', 'Text shadow', 'Title', '{{el}} .fr-heading__title'),
    ...textStrokeControls('title_stroke', 'Title', '{{el}} .fr-heading__title'),
    style.slider('title_hover_transition', 'Transition duration (s)', 'Title', {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: {
        '{{el}} .fr-heading__title, {{el}} .fr-heading__title a': 'transition: color {{value}}',
      },
    }),
    style.select('blend', 'Blend mode', 'Title', {
      options: [
        '',
        'multiply',
        'screen',
        'overlay',
        'darken',
        'lighten',
        'color-dodge',
        'difference',
        'exclusion',
        'luminosity',
      ].map((v) => ({ value: v, label: v || 'Normal' })),
      selectors: { '{{el}} .fr-heading__title': 'mix-blend-mode: {{value}}' },
    }),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const Tag = (HEADING_TAGS.some((t) => t.value === settings.tag) ? settings.tag : 'h2') as 'h2';
    const link = linkProps(settings.link);
    const text = <Lines text={plainText(settings.title)} />;
    const size =
      (HEADING_SIZES.some((s) => s.value === settings.size && s.value)
        ? ` fr-size-${String(settings.size)}`
        : '') + (settings.title_theme_font === true ? ' fr-heading__title--theme' : '');
    return (
      <ElementRoot node={node} settings={settings} name="fr-heading" editing={context.editing}>
        <Tag
          className={`fr-heading__title${size}`}
          data-fr-inline={context.editing ? 'title' : undefined}
        >
          {link ? <a {...link}>{text}</a> : text}
        </Tag>
      </ElementRoot>
    );
  },
};

const DROP_CAP = '{{el}} .fr-drop-cap > p:first-child::first-letter';

/** The look of the drop cap (Elementor's Drop Cap section). */
function dropCapControls(): Control[] {
  const on = { drop_cap: true };
  const framed = { drop_cap: true, drop_cap_view: ['stacked', 'framed'] };
  return [
    style.select('drop_cap_view', 'View', 'Drop cap', {
      options: [
        { value: '', label: 'Default' },
        { value: 'stacked', label: 'Stacked' },
        { value: 'framed', label: 'Framed' },
      ],
      condition: on,
      noCss: true,
    }),
    style.color('drop_cap_primary_color', 'Primary color', 'Drop cap', {
      condition: on,
      selectors: {
        '{{el}} .fr-drop-cap:not(.fr-drop-cap--stacked) > p:first-child::first-letter':
          'color: {{value}}',
        '{{el}} .fr-drop-cap--stacked > p:first-child::first-letter': 'background-color: {{value}}',
        '{{el}} .fr-drop-cap--framed > p:first-child::first-letter': 'border-color: {{value}}',
      },
    }),
    style.color('drop_cap_secondary_color', 'Secondary color', 'Drop cap', {
      condition: framed,
      selectors: {
        '{{el}} .fr-drop-cap--stacked > p:first-child::first-letter': 'color: {{value}}',
        '{{el}} .fr-drop-cap--framed > p:first-child::first-letter': 'background-color: {{value}}',
      },
    }),
    style.slider('drop_cap_size', 'Size', 'Drop cap', {
      units: ['px', 'em'],
      max: 30,
      condition: framed,
      selectors: { [DROP_CAP]: 'padding: {{value}}' },
    }),
    style.slider('drop_cap_space', 'Space', 'Drop cap', {
      units: ['px', 'em'],
      max: 50,
      condition: on,
      selectors: { [DROP_CAP]: 'margin-right: {{value}}' },
    }),
    style.slider('drop_cap_radius', 'Border radius', 'Drop cap', {
      units: ['%', 'px'],
      max: 200,
      condition: framed,
      selectors: { [DROP_CAP]: 'border-radius: {{value}}' },
    }),
    style.slider('drop_cap_border_width', 'Border width', 'Drop cap', {
      units: ['px'],
      max: 20,
      condition: { drop_cap: true, drop_cap_view: 'framed' },
      selectors: { [DROP_CAP]: 'border-width: {{value}}' },
    }),
    {
      ...groups.typography('drop_cap_typography', 'Typography', 'Drop cap', DROP_CAP),
      condition: on,
    },
    { ...groups.textShadow('drop_cap_shadow', 'Text shadow', 'Drop cap', DROP_CAP), condition: on },
  ];
}

export const text: ElementDefinition = {
  type: 'fresco/text',
  title: 'Text editor',
  icon: 'M4 6h16 M4 10h16 M4 14h16 M4 18h10',
  category: 'basic',
  keywords: ['paragraph', 'rich text', 'wysiwyg', 'content'],
  controls: [
    content.richtext('content', 'Text', 'Text', {
      default: '<p>Write your text here. Click to edit it, or change it in the panel.</p>',
    }),
    content.switch('drop_cap', 'Drop cap', 'Text', { noCss: true }),
    content.number('columns', 'Columns', 'Text', {
      responsive: true,
      min: 1,
      max: 6,
      selectors: { '{{el}} .fr-text__body': 'columns: {{value}}' },
    }),
    content.slider('column_gap', 'Column gap', 'Text', {
      responsive: true,
      units: UNITS.length,
      max: 100,
      selectors: { '{{el}} .fr-text__body': 'column-gap: {{value}}' },
    }),
    textAlign('{{el}}'),
    ...textStyle('', 'Text', '{{el}}'),
    style.color('link_color', 'Link color', 'Text', {
      hover: true,
      selectors: { '{{el}} a': 'color: {{value}}' },
    }),
    style.slider('paragraph_spacing', 'Paragraph spacing', 'Text', {
      responsive: true,
      units: ['px', 'em', 'rem'],
      max: 80,
      selectors: { '{{el}} .fr-text__body p': 'margin-block: 0 {{value}}' },
    }),
    groups.textShadow('text_shadow', 'Text shadow', 'Text', '{{el}}'),
    style.slider('link_hover_transition', 'Transition duration (s)', 'Text', {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: { '{{el}} a': 'transition: color {{value}}' },
    }),
    ...dropCapControls(),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const view =
      settings.drop_cap === true && ['stacked', 'framed'].includes(settings.drop_cap_view as string)
        ? ` fr-drop-cap--${String(settings.drop_cap_view)}`
        : '';
    return (
      <ElementRoot node={node} settings={settings} name="fr-text" editing={context.editing}>
        <div
          className={`fr-text__body${settings.drop_cap === true ? ' fr-drop-cap' : ''}${view}`}
          data-fr-inline={context.editing ? 'content' : undefined}
          dangerouslySetInnerHTML={{ __html: sanitizeRich(settings.content) }}
        />
      </ElementRoot>
    );
  },
};

export const image: ElementDefinition = {
  type: 'fresco/image',
  title: 'Image',
  icon: 'M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5 M15 9.5a1.5 1.5 0 1 0 0-.01',
  category: 'basic',
  keywords: ['photo', 'picture', 'img'],
  controls: [
    content.media('image', 'Image', 'Image', { accept: 'image', default: { id: null, url: '' } }),
    content.select('image_size', 'Image size', 'Image', {
      default: 'large',
      options: IMAGE_SIZES,
      noCss: true,
    }),
    content.choose('align', 'Alignment', 'Image', {
      responsive: true,
      options: ALIGN,
      selectors: { '{{el}}': 'text-align: {{value}}' },
    }),
    content.select('caption_source', 'Caption', 'Image', {
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'attachment', label: 'Attachment caption' },
        { value: 'alt', label: 'Image description' },
        { value: 'custom', label: 'Custom' },
      ],
      noCss: true,
    }),
    content.text('caption', 'Custom caption', 'Image', { condition: { caption_source: 'custom' } }),
    content.select('link_to', 'Link', 'Image', {
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'file', label: 'Media file (lightbox)' },
        { value: 'custom', label: 'Custom URL' },
      ],
      noCss: true,
    }),
    content.url('link', 'Link', 'Image', { condition: { link_to: 'custom' } }),
    ...sizeControls('', 'Image', '{{el}} img'),
    style.text('aspect_ratio', 'Aspect ratio', 'Image', {
      responsive: true,
      // Width / height, as CSS writes it (e.g. 4/3 or 820/580).
      pattern: '\\d{1,4}(\\.\\d{1,3})? ?/ ?\\d{1,4}(\\.\\d{1,3})?',
      help: 'Width / height, e.g. 4/3 or 820/580: the image is cut to it (with Object fit: Cover).',
      selectors: { '{{el}} img': 'aspect-ratio: {{value}}' },
    }),
    style.select('object_fit', 'Object fit', 'Image', {
      responsive: true,
      options: ['', 'cover', 'contain', 'fill'].map((v) => ({ value: v, label: v || 'Default' })),
      selectors: { '{{el}} img': 'object-fit: {{value}}' },
    }),
    objectPosition('object_position', 'Image', '{{el}} img', { object_fit: ['cover', 'contain'] }),
    style.slider('opacity', 'Opacity', 'Image', {
      hover: true,
      units: [''],
      min: 0,
      max: 1,
      step: 0.05,
      selectors: { '{{el}} img': 'opacity: {{size}}' },
    }),
    groups.filters('filters', 'CSS filters', 'Image', '{{el}} img'),
    groups.filters('filters_hover', 'CSS filters on hover', 'Image', '{{el}}:hover img'),
    style.slider('hover_transition', 'Transition duration (s)', 'Image', {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: { '{{el}} img': 'transition-duration: {{value}}' },
    }),
    groups.border('image_border', 'Border', 'Image', '{{el}} img'),
    groups.shadow('image_shadow', 'Box shadow', 'Image', '{{el}} img'),
    hoverAnimationControl('Image'),
    style.choose('caption_align', 'Alignment', 'Caption', {
      responsive: true,
      options: TEXT_ALIGN,
      selectors: { '{{el}} figcaption': 'text-align: {{value}}' },
    }),
    ...textStyle('caption_', 'Caption', '{{el}} figcaption'),
    style.color('caption_bg', 'Background color', 'Caption', {
      selectors: { '{{el}} figcaption': 'background-color: {{value}}' },
    }),
    groups.textShadow('caption_shadow', 'Text shadow', 'Caption', '{{el}} figcaption'),
    style.slider('caption_space', 'Spacing', 'Caption', {
      responsive: true,
      units: ['px', 'em', 'rem'],
      max: 100,
      selectors: { '{{el}} figcaption': 'margin-top: {{value}}' },
    }),
    ...advancedControls(),
  ],
  media: (settings) => mediaIds(settings.image),
  render({ node, settings, context }) {
    const media = settings.image as { id?: string; url?: string; alt?: string } | undefined;
    const item = media?.id ? context.media.get(media.id) : undefined;
    const caption =
      settings.caption_source === 'alt'
        ? (media?.alt ?? item?.alt ?? '')
        : settings.caption_source === 'attachment'
          ? attachmentCaption(media, item)
          : settings.caption_source === 'custom'
            ? plainText(settings.caption)
            : '';
    const hover = hoverClass(settings.hover_effect);
    const img = media?.url ? (
      <FrImage
        value={media}
        context={context}
        size={String(settings.image_size ?? 'large')}
        className={`fr-image__img${hover}`}
      />
    ) : context.editing ? (
      <span className="fr-placeholder fr-placeholder--image" />
    ) : null;
    const link =
      settings.link_to === 'custom'
        ? linkProps(settings.link)
        : settings.link_to === 'file' && (item?.url ?? media?.url)
          ? { href: item?.url ?? media!.url!, 'data-fr-lightbox': '' }
          : null;
    const body = link && img ? <a {...link}>{img}</a> : img;
    return (
      <ElementRoot node={node} settings={settings} name="fr-image" editing={context.editing}>
        {caption ? (
          <figure className="fr-image__figure">
            {body}
            <figcaption>{caption}</figcaption>
          </figure>
        ) : (
          body
        )}
      </ElementRoot>
    );
  },
};

/** Where the visible part of a cropped image sits (`object-position`). */
export function objectPosition(
  name: string,
  section: string,
  selector: string,
  condition: Record<string, unknown>,
): Control {
  return style.select(name, 'Object position', section, {
    responsive: true,
    options: [
      { value: '', label: 'Default' },
      ...[
        'center center',
        'center left',
        'center right',
        'top center',
        'top left',
        'top right',
        'bottom center',
        'bottom left',
        'bottom right',
      ].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) })),
    ],
    condition,
    selectors: { [selector]: 'object-position: {{value}}' },
  });
}

/**
 * The caption of a media file: its own (when the library gives one), else its
 * description (alt text), as Elementor's "Attachment caption".
 */
export function attachmentCaption(
  media: { alt?: string; caption?: unknown } | undefined,
  item: { alt?: string; caption?: unknown } | undefined,
): string {
  const own = [item?.caption, media?.caption].find((c) => typeof c === 'string' && c.trim());
  return typeof own === 'string' ? plainText(own) : (media?.alt ?? item?.alt ?? '');
}

const BUTTON_SIZES = [
  { value: 'xs', label: 'Extra small' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
];

export const button: ElementDefinition = {
  type: 'fresco/button',
  title: 'Button',
  icon: 'M3 8h18v8H3z M8 12h8',
  category: 'basic',
  keywords: ['link', 'cta', 'call to action'],
  controls: [
    content.text('text', 'Text', 'Button', { default: 'Click here' }),
    content.url('link', 'Link', 'Button', { default: { url: '#' } }),
    content.choose('align', 'Alignment', 'Button', {
      responsive: true,
      options: [
        ...ALIGN,
        { value: 'justify', label: 'Justified', icon: 'M4 6h16 M4 12h16 M4 18h16' },
      ],
      noCss: true,
    }),
    content.select('button_type', 'Type', 'Button', {
      options: [
        { value: '', label: 'Default' },
        { value: 'info', label: 'Info' },
        { value: 'success', label: 'Success' },
        { value: 'warning', label: 'Warning' },
        { value: 'danger', label: 'Danger' },
      ],
      noCss: true,
    }),
    content.select('size', 'Size', 'Button', { default: 'sm', options: BUTTON_SIZES, noCss: true }),
    content.icon('icon', 'Icon', 'Button'),
    content.choose('icon_position', 'Icon position', 'Button', {
      default: 'before',
      options: [
        { value: 'before', label: 'Before' },
        { value: 'after', label: 'After' },
      ],
      noCss: true,
    }),
    content.slider('icon_spacing', 'Icon spacing', 'Button', {
      units: ['px', 'em', 'rem'],
      max: 50,
      selectors: { '{{el}} .fr-button__link': 'gap: {{value}}' },
    }),
    style.choose('content_align', 'Content alignment', 'Button', {
      responsive: true,
      options: [
        { value: 'flex-start', label: 'Start', icon: 'M4 6h16 M4 12h10 M4 18h13' },
        { value: 'center', label: 'Center', icon: 'M4 6h16 M7 12h10 M5.5 18h13' },
        { value: 'flex-end', label: 'End', icon: 'M4 6h16 M10 12h10 M7 18h13' },
        { value: 'space-between', label: 'Space between', icon: 'M4 6h16 M4 12h16 M4 18h16' },
      ],
      condition: { align: 'justify' },
      selectors: { '{{el}} .fr-button__link': 'justify-content: {{value}}' },
    }),
    content.text('button_id', 'Button ID', 'Button', {
      help: 'For tracking: letters, digits, dashes and underscores.',
      noCss: true,
    }),
    groups.typography('typography', 'Typography', 'Button', '{{el}} .fr-button__link'),
    groups.textShadow('text_shadow', 'Text shadow', 'Button', '{{el}} .fr-button__link'),
    style.color('text_color', 'Text color', 'Button', {
      hover: true,
      selectors: { '{{el}} .fr-button__link': 'color: {{value}}; fill: {{value}}' },
    }),
    style.color('background_color', 'Background color', 'Button', {
      hover: true,
      selectors: { '{{el}} .fr-button__link': 'background-color: {{value}}' },
    }),
    groups.background('button_background', 'Background', 'Button', '{{el}} .fr-button__link'),
    groups.background(
      'button_background_hover',
      'Background on hover',
      'Button',
      '{{el}} .fr-button__link:hover, {{el}} .fr-button__link:focus-visible',
    ),
    style.color('border_hover_color', 'Border color on hover', 'Button', {
      selectors: { '{{el}} .fr-button__link:hover': 'border-color: {{value}}' },
    }),
    groups.border('border', 'Border', 'Button', '{{el}} .fr-button__link'),
    groups.shadow('shadow', 'Box shadow', 'Button', '{{el}} .fr-button__link'),
    groups.shadow(
      'shadow_hover',
      'Box shadow on hover',
      'Button',
      '{{el}} .fr-button__link:hover, {{el}} .fr-button__link:focus-visible',
    ),
    style.slider('hover_transition', 'Transition duration (s)', 'Button', {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: { '{{el}} .fr-button__link': 'transition-duration: {{value}}' },
    }),
    style.box('padding', 'Padding', 'Button', {
      responsive: true,
      units: UNITS.box,
      selectors: { '{{el}} .fr-button__link': 'padding: {{top}} {{right}} {{bottom}} {{left}}' },
    }),
    hoverAnimationControl('Button'),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const link = linkProps(settings.link);
    const size = BUTTON_SIZES.some((s) => s.value === settings.size) ? String(settings.size) : 'sm';
    const icon = settings.icon ? <Icon value={settings.icon} className="fr-button__icon" /> : null;
    const align = (device: string, value: unknown) =>
      ['left', 'center', 'right', 'justify'].includes(value as string)
        ? ` fr-align${device}-${String(value)}`
        : '';
    const classes = `fr-button${align('', settings.align)}${OTHER_DEVICES.map((d) => align(`-${d}`, node.attrs[`align@${d}`])).join('')}`;
    const type = ['info', 'success', 'warning', 'danger'].includes(settings.button_type as string)
      ? ` fr-button--${String(settings.button_type)}`
      : '';
    const hover = `${hoverClass(settings.hover_effect)}${type}`;
    const id =
      typeof settings.button_id === 'string' && /^[A-Za-z][\w-]{0,63}$/.test(settings.button_id)
        ? settings.button_id
        : undefined;
    const inner = (
      <>
        {settings.icon_position !== 'after' && icon}
        <span className="fr-button__text" data-fr-inline={context.editing ? 'text' : undefined}>
          {plainText(settings.text)}
        </span>
        {settings.icon_position === 'after' && icon}
      </>
    );
    return (
      <ElementRoot node={node} settings={settings} name={classes} editing={context.editing}>
        {link ? (
          <a className={`fr-button__link fr-button--${size}${hover}`} id={id} {...link}>
            {inner}
          </a>
        ) : (
          <span className={`fr-button__link fr-button--${size}${hover}`} id={id}>
            {inner}
          </span>
        )}
      </ElementRoot>
    );
  },
};

export const spacer: ElementDefinition = {
  type: 'fresco/spacer',
  title: 'Spacer',
  icon: 'M12 4v16 M8 7l4-3 4 3 M8 17l4 3 4-3',
  category: 'basic',
  keywords: ['space', 'gap', 'empty'],
  controls: [
    content.slider('space', 'Space', 'Spacer', {
      responsive: true,
      default: { size: 50, unit: 'px' },
      units: ['px', 'vh', 'em'],
      max: 600,
      selectors: { '{{el}} .fr-spacer__inner': 'height: {{value}}' },
    }),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    return (
      <ElementRoot node={node} settings={settings} name="fr-spacer" editing={context.editing}>
        <div className="fr-spacer__inner" />
      </ElementRoot>
    );
  },
};

export const divider: ElementDefinition = {
  type: 'fresco/divider',
  title: 'Divider',
  icon: 'M4 12h16 M4 7h4 M16 17h4',
  category: 'basic',
  keywords: ['line', 'separator', 'hr'],
  controls: [
    content.select('style', 'Style', 'Divider', {
      default: 'solid',
      options: ['solid', 'double', 'dotted', 'dashed'].map((v) => ({
        value: v,
        label: v[0]!.toUpperCase() + v.slice(1),
      })),
      selectors: { '{{el}} .fr-divider__line': 'border-top-style: {{value}}' },
    }),
    content.slider('width', 'Width', 'Divider', {
      responsive: true,
      default: { size: 100, unit: '%' },
      units: ['%', 'px'],
      max: 1000,
      selectors: { '{{el}} .fr-divider__inner': 'width: {{value}}' },
    }),
    content.choose('align', 'Alignment', 'Divider', {
      responsive: true,
      options: ALIGN,
      noCss: true,
    }),
    content.select('element', 'Add element', 'Divider', {
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'text', label: 'Text' },
        { value: 'icon', label: 'Icon' },
      ],
      noCss: true,
    }),
    content.text('text', 'Text', 'Divider', { default: 'Divider', condition: { element: 'text' } }),
    content.icon('icon', 'Icon', 'Divider', {
      default: { set: 'solid', name: 'star' },
      condition: { element: 'icon' },
    }),
    content.choose('element_position', 'Position', 'Divider', {
      options: ALIGN,
      condition: { element: ['text', 'icon'] },
      noCss: true,
    }),
    style.color('color', 'Color', 'Divider', {
      selectors: { '{{el}} .fr-divider__line': 'border-top-color: {{value}}' },
    }),
    style.slider('weight', 'Weight', 'Divider', {
      default: { size: 1, unit: 'px' },
      units: ['px'],
      max: 20,
      selectors: { '{{el}} .fr-divider__line': 'border-top-width: {{value}}' },
    }),
    style.slider('gap', 'Gap', 'Divider', {
      responsive: true,
      default: { size: 15, unit: 'px' },
      units: ['px', 'em'],
      max: 100,
      selectors: { '{{el}}': 'padding-block: {{value}}' },
    }),
    ...textStyle('element_', 'Element', '{{el}} .fr-divider__element'),
    ...textStrokeControls('element_stroke', 'Element', '{{el}} .fr-divider__element'),
    style.slider('element_size', 'Icon size', 'Element', {
      responsive: true,
      units: ['px', 'em'],
      max: 100,
      condition: { element: 'icon' },
      selectors: { '{{el}} .fr-divider__element': 'font-size: {{value}}' },
    }),
    style.slider('element_spacing', 'Spacing', 'Element', {
      responsive: true,
      units: ['px', 'em'],
      max: 50,
      condition: { element: ['text', 'icon'] },
      selectors: { '{{el}} .fr-divider__inner': 'gap: {{value}}' },
    }),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const align = ['left', 'center', 'right'].includes(settings.align as string)
      ? String(settings.align)
      : 'center';
    const element =
      settings.element === 'text' ? (
        <span className="fr-divider__element">{plainText(settings.text)}</span>
      ) : settings.element === 'icon' ? (
        <span className="fr-divider__element">
          <Icon value={settings.icon} />
        </span>
      ) : null;
    // The text or icon at the start or end of the line (in the middle by default).
    const at = element && ['left', 'right'].includes(settings.element_position as string);
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={`fr-divider fr-divider--${align}`}
        editing={context.editing}
      >
        <div className="fr-divider__inner" role="separator">
          {!(at && settings.element_position === 'left') && <span className="fr-divider__line" />}
          {element}
          {element && !(at && settings.element_position === 'right') && (
            <span className="fr-divider__line" />
          )}
        </div>
      </ElementRoot>
    );
  },
};
