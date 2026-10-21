/** Basic widgets: Heading, Text, Image, Button, Spacer, Divider. */
import { advancedControls, ElementRoot, OTHER_DEVICES, UNITS } from '../core/common.js';
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
import type { ElementDefinition } from '../core/model.js';
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
    groups.textShadow('title_shadow', 'Text shadow', 'Title', '{{el}} .fr-heading__title'),
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
    const size = HEADING_SIZES.some((s) => s.value === settings.size && s.value)
      ? ` fr-size-${String(settings.size)}`
      : '';
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
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    return (
      <ElementRoot node={node} settings={settings} name="fr-text" editing={context.editing}>
        <div
          className={`fr-text__body${settings.drop_cap === true ? ' fr-drop-cap' : ''}`}
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
    style.select('object_fit', 'Object fit', 'Image', {
      responsive: true,
      options: ['', 'cover', 'contain', 'fill'].map((v) => ({ value: v, label: v || 'Default' })),
      selectors: { '{{el}} img': 'object-fit: {{value}}' },
    }),
    style.slider('opacity', 'Opacity', 'Image', {
      hover: true,
      units: [''],
      min: 0,
      max: 1,
      step: 0.05,
      selectors: { '{{el}} img': 'opacity: {{size}}' },
    }),
    groups.filters('filters', 'CSS filters', 'Image', '{{el}} img'),
    groups.border('image_border', 'Border', 'Image', '{{el}} img'),
    groups.shadow('image_shadow', 'Box shadow', 'Image', '{{el}} img'),
    style.select('hover_effect', 'Hover animation', 'Image', {
      options: [
        { value: '', label: 'None' },
        { value: 'grow', label: 'Grow' },
        { value: 'shrink', label: 'Shrink' },
        { value: 'float', label: 'Float' },
        { value: 'rotate', label: 'Rotate' },
      ],
      noCss: true,
    }),
    ...textStyle('caption_', 'Caption', '{{el}} figcaption'),
    ...advancedControls(),
  ],
  media: (settings) => mediaIds(settings.image),
  render({ node, settings, context }) {
    const media = settings.image as { id?: string; url?: string; alt?: string } | undefined;
    const item = media?.id ? context.media.get(media.id) : undefined;
    const caption =
      settings.caption_source === 'alt'
        ? (media?.alt ?? item?.alt ?? '')
        : settings.caption_source === 'custom'
          ? plainText(settings.caption)
          : '';
    const hover = ['grow', 'shrink', 'float', 'rotate'].includes(settings.hover_effect as string)
      ? ` fr-hover-${String(settings.hover_effect)}`
      : '';
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
      units: ['px', 'em'],
      max: 50,
      selectors: { '{{el}} .fr-button__link': 'gap: {{value}}' },
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
    style.color('border_hover_color', 'Border color on hover', 'Button', {
      selectors: { '{{el}} .fr-button__link:hover': 'border-color: {{value}}' },
    }),
    groups.border('border', 'Border', 'Button', '{{el}} .fr-button__link'),
    groups.shadow('shadow', 'Box shadow', 'Button', '{{el}} .fr-button__link'),
    style.box('padding', 'Padding', 'Button', {
      responsive: true,
      units: UNITS.box,
      selectors: { '{{el}} .fr-button__link': 'padding: {{top}} {{right}} {{bottom}} {{left}}' },
    }),
    style.select('hover_effect', 'Hover animation', 'Button', {
      options: [
        { value: '', label: 'None' },
        { value: 'grow', label: 'Grow' },
        { value: 'shrink', label: 'Shrink' },
        { value: 'float', label: 'Float' },
        { value: 'pulse', label: 'Pulse' },
      ],
      noCss: true,
    }),
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
    const hover = ['grow', 'shrink', 'float', 'pulse'].includes(settings.hover_effect as string)
      ? ` fr-hover-${String(settings.hover_effect)}`
      : '';
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
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={`fr-divider fr-divider--${align}`}
        editing={context.editing}
      >
        <div className="fr-divider__inner" role="separator">
          <span className="fr-divider__line" />
          {element}
          {element && <span className="fr-divider__line" />}
        </div>
      </ElementRoot>
    );
  },
};
