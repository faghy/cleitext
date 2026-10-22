/**
 * General and media widgets: Icon list, Counter, Progress bar, Testimonial,
 * Social icons, Alert, Audio, Image carousel, Image gallery, Star rating,
 * HTML, Menu anchor, Google Maps, Text path.
 */
import { uiText } from '../core/ui-text.js';
import type { ReactNode } from 'react';
import {
  advancedControls,
  ElementRoot,
  hoverAnimationControl,
  hoverClass,
  textStrokeControls,
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
import { FrImage, IMAGE_SIZES, isMedia, mediaIds } from '../core/media.js';
import type { Control, ElementDefinition, Settings } from '../core/model.js';
import { plainText } from '../core/sanitize.js';
import { attachmentCaption } from './basic.js';

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
    content.select('link_click', 'Apply link on', 'List', {
      options: [
        { value: '', label: 'Full width' },
        { value: 'inline', label: 'Inline' },
      ],
      noCss: true,
    }),
    style.switch('divider', 'Divider', 'List', { noCss: true }),
    style.select('divider_style', 'Divider style', 'List', {
      options: ['', 'solid', 'double', 'dotted', 'dashed'].map((v) => ({
        value: v,
        label: v ? v[0]!.toUpperCase() + v.slice(1) : 'Default',
      })),
      condition: { divider: true },
      selectors: { '{{el}} .fr-list--divider > li + li': 'border-top-style: {{value}}' },
    }),
    style.slider('divider_weight', 'Divider weight', 'List', {
      units: ['px'],
      max: 20,
      condition: { divider: true },
      selectors: { '{{el}} .fr-list--divider > li + li': 'border-top-width: {{value}}' },
    }),
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
    style.choose('icon_self_align', 'Horizontal alignment', 'Icon', {
      responsive: true,
      options: ALIGN.map((o) => ({
        ...o,
        value: o.value === 'left' ? 'flex-start' : o.value === 'right' ? 'flex-end' : 'center',
      })),
      selectors: { '{{el}} .fr-list__icon': 'justify-content: {{value}}; min-width: 1em' },
    }),
    style.choose('icon_self_vertical_align', 'Vertical alignment', 'Icon', {
      responsive: true,
      options: [
        { value: 'flex-start', label: 'Top', icon: 'M4 4h16 M9 8h6v6H9z' },
        { value: 'center', label: 'Middle', icon: 'M4 12h16 M9 9h6v6H9z' },
        { value: 'flex-end', label: 'Bottom', icon: 'M4 20h16 M9 10h6v6H9z' },
      ],
      selectors: { '{{el}} .fr-list__icon': 'align-self: {{value}}' },
    }),
    style.slider('icon_vertical_offset', 'Adjust vertical position', 'Icon', {
      responsive: true,
      units: ['px', 'em'],
      min: -15,
      max: 15,
      selectors: { '{{el}} .fr-list__icon': 'position: relative; top: {{value}}' },
    }),
    style.slider('icon_hover_transition', 'Transition duration (s)', 'Icon', {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: { '{{el}} .fr-list__icon': 'transition: color {{value}}' },
    }),
    ...textStyle('text_', 'Text', '{{el}} .fr-list__text', { hover: true }),
    groups.textShadow('text_shadow', 'Text shadow', 'Text', '{{el}} .fr-list__text'),
    style.slider('text_hover_transition', 'Transition duration (s)', 'Text', {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: { '{{el}} .fr-list__text': 'transition: color {{value}}' },
    }),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const list = items(settings, 'items');
    const classes = `fr-list fr-list--${settings.layout === 'inline' ? 'inline' : 'column'}${settings.divider === true ? ' fr-list--divider' : ''}${settings.link_click === 'inline' ? ' fr-list--link-inline' : ''}`;
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
    content.select('separator_char', 'Separator', 'Counter', {
      options: [
        { value: '', label: 'Default' },
        { value: ',', label: 'Comma' },
        { value: '.', label: 'Dot' },
        { value: ' ', label: 'Space' },
        { value: '_', label: 'Underline' },
        { value: "'", label: 'Apostrophe' },
      ],
      condition: { separator: true },
      noCss: true,
    }),
    content.text('title', 'Title', 'Counter', { default: 'Cool number' }),
    content.select('title_tag', 'Title HTML tag', 'Counter', {
      options: [{ value: '', label: 'Default' }, ...HEADING_TAGS],
      noCss: true,
    }),
    content.choose('title_position', 'Title position', 'Counter', {
      default: 'after',
      options: [
        { value: 'before', label: 'Before' },
        { value: 'after', label: 'After' },
        { value: 'start', label: 'Start' },
        { value: 'end', label: 'End' },
      ],
      noCss: true,
    }),
    style.choose('title_vertical_align', 'Vertical alignment', 'Title', {
      options: [
        { value: 'flex-start', label: 'Top', icon: 'M4 4h16 M9 8h6v6H9z' },
        { value: 'center', label: 'Middle', icon: 'M4 12h16 M9 9h6v6H9z' },
        { value: 'flex-end', label: 'Bottom', icon: 'M4 20h16 M9 10h6v6H9z' },
      ],
      condition: { title_position: ['start', 'end'] },
      selectors: { '{{el}}.fr-counter--side': 'align-items: {{value}}' },
    }),
    style.slider('title_gap', 'Spacing', 'Title', {
      responsive: true,
      units: ['px', 'em', 'rem'],
      max: 100,
      selectors: {
        '{{el}} .fr-counter__title': 'margin-top: {{value}}',
        '{{el}} .fr-counter__title:first-child': 'margin-top: 0; margin-bottom: {{value}}',
        '{{el}}.fr-counter--side': 'gap: {{value}}',
        '{{el}}.fr-counter--side .fr-counter__title': 'margin: 0',
      },
    }),
    style.slider('number_gap', 'Spacing', 'Number', {
      responsive: true,
      units: ['px', 'em', 'rem'],
      max: 100,
      help: 'Between the prefix, the number and the suffix.',
      selectors: { '{{el}} .fr-counter__number': 'gap: {{value}}' },
    }),
    style.choose('align', 'Alignment', 'Number', {
      responsive: true,
      options: ALIGN,
      selectors: { '{{el}}': 'text-align: {{value}}' },
    }),
    ...textStyle('number_', 'Number', '{{el}} .fr-counter__number'),
    ...textStrokeControls('number_stroke', 'Number', '{{el}} .fr-counter__number'),
    groups.textShadow('number_shadow', 'Text shadow', 'Number', '{{el}} .fr-counter__number'),
    ...textStyle('title_', 'Title', '{{el}} .fr-counter__title'),
    ...textStrokeControls('title_stroke', 'Title', '{{el}} .fr-counter__title'),
    groups.textShadow('title_shadow', 'Text shadow', 'Title', '{{el}} .fr-counter__title'),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const end = num(settings.end, 100);
    const start = num(settings.start, 0);
    // A separator of its own: the number in English, its commas replaced.
    const char =
      typeof settings.separator_char === 'string' && /^[,. _']$/.test(settings.separator_char)
        ? settings.separator_char
        : null;
    const format = (n: number) =>
      settings.separator === false
        ? String(n)
        : char
          ? new Intl.NumberFormat('en-US').format(n).replace(/,/g, char)
          : new Intl.NumberFormat(context.locale).format(n);
    const title = plainText(settings.title);
    const TitleTag = (
      HEADING_TAGS.some((t) => t.value === settings.title_tag) ? settings.title_tag : 'div'
    ) as 'div';
    const titleNode = title ? <TitleTag className="fr-counter__title">{title}</TitleTag> : null;
    const position = String(settings.title_position ?? 'after');
    const first = position === 'before' || position === 'start';
    const side = position === 'start' || position === 'end';
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={side ? 'fr-counter fr-counter--side' : 'fr-counter'}
        editing={context.editing}
        extra={{
          'data-fr-handler': 'counter',
          ...(char && settings.separator !== false ? { 'data-fr-separator-char': char } : {}),
        }}
      >
        {first && titleNode}
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
        {!first && titleNode}
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
    content.select('title_tag', 'Title HTML tag', 'Progress bar', {
      options: [{ value: '', label: 'Default' }, ...HEADING_TAGS],
      noCss: true,
    }),
    content.switch('show_title', 'Display title', 'Progress bar', { default: true, noCss: true }),
    content.select('progress_type', 'Type', 'Progress bar', {
      options: [
        { value: '', label: 'Default' },
        { value: 'info', label: 'Info' },
        { value: 'success', label: 'Success' },
        { value: 'warning', label: 'Warning' },
        { value: 'danger', label: 'Danger' },
      ],
      noCss: true,
    }),
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
    groups.typography(
      'inner_typography',
      'Inner text typography',
      'Bar',
      '{{el}} .fr-progress__inner',
    ),
    groups.textShadow('inner_shadow', 'Text shadow', 'Bar', '{{el}} .fr-progress__inner'),
    ...textStyle('title_', 'Title', '{{el}} .fr-progress__title'),
    groups.textShadow('title_shadow', 'Text shadow', 'Title', '{{el}} .fr-progress__title'),
    ...textStyle('percent_', 'Percentage', '{{el}} .fr-progress__percent'),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const value = Math.max(
      0,
      Math.min(100, num((settings.percent as { size?: unknown } | undefined)?.size, 50)),
    );
    const title = settings.show_title === false ? '' : plainText(settings.title);
    const TitleTag = (
      HEADING_TAGS.some((t) => t.value === settings.title_tag) ? settings.title_tag : 'span'
    ) as 'span';
    const type = ['info', 'success', 'warning', 'danger'].includes(settings.progress_type as string)
      ? ` fr-progress__fill--${String(settings.progress_type)}`
      : '';
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
            <TitleTag className="fr-progress__title">{title}</TitleTag>
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
          aria-label={plainText(settings.title) || undefined}
        >
          <div
            className={`fr-progress__fill${type}`}
            style={{ width: `${value}%` }}
            data-fr-percent={value}
          >
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
    groups.textShadow('content_shadow', 'Text shadow', 'Content', '{{el}} .fr-quote__content'),
    style.slider('image_size', 'Size', 'Image', {
      responsive: true,
      units: ['px'],
      max: 200,
      selectors: { '{{el}} .fr-quote__image img': 'width: {{value}}; height: {{value}}' },
    }),
    groups.border('image_border', 'Border', 'Image', '{{el}} .fr-quote__image img'),
    ...textStyle('name_', 'Name', '{{el}} .fr-quote__name'),
    groups.textShadow('name_shadow', 'Text shadow', 'Name', '{{el}} .fr-quote__name'),
    ...textStyle('job_', 'Title', '{{el}} .fr-quote__job'),
    groups.textShadow('job_shadow', 'Text shadow', 'Title', '{{el}} .fr-quote__job'),
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

/** A color for an inline style: hex or rgb() only. */
const safeHex = (value: unknown): string | undefined =>
  typeof value === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(value.trim())
    ? value.trim()
    : undefined;

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
        content.select('item_color', 'Color', 'Network', {
          options: [
            { value: '', label: 'Default' },
            { value: 'custom', label: 'Custom' },
          ],
        }),
        content.color('item_primary', 'Primary color', 'Network', {
          condition: { item_color: 'custom' },
        }),
        content.color('item_secondary', 'Secondary color', 'Network', {
          condition: { item_color: 'custom' },
        }),
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
    content.number('columns', 'Columns', 'Social icons', {
      responsive: true,
      min: 0,
      max: 12,
      help: '0: as many as fit on a line.',
      dictionary: { '0': '' },
      selectors: {
        '{{el}} .fr-social': 'display: inline-grid; grid-template-columns: repeat({{value}}, auto)',
      },
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
    style.slider('row_gap', 'Rows gap', 'Icon', {
      responsive: true,
      units: ['px', 'em'],
      max: 60,
      selectors: { '{{el}} .fr-social': 'row-gap: {{value}}' },
    }),
    groups.border('border', 'Border', 'Icon', '{{el}} .fr-social__link'),
    style.color('hover_border_color', 'Border color on hover', 'Icon', {
      selectors: { '{{el}} .fr-social__link:hover': 'border-color: {{value}}' },
    }),
    hoverAnimationControl('Icon'),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const shape = ['square', 'circle'].includes(settings.shape as string)
      ? String(settings.shape)
      : 'rounded';
    const official = settings.look !== 'custom';
    const hover = hoverClass(settings.hover_effect);
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
            // A network's own colors (set on the item) win over the official one.
            const own = entry.item_color === 'custom';
            const color = own ? safeHex(entry.item_primary) : official ? BRAND[name] : undefined;
            const iconColor = own ? safeHex(entry.item_secondary) : undefined;
            const body = <Icon value={entry.icon} />;
            const props = {
              className: `fr-social__link${hover}`,
              'aria-label': label,
              title: label,
              ...(color || iconColor
                ? {
                    style: {
                      ...(color ? { backgroundColor: color } : {}),
                      ...(iconColor ? { color: iconColor } : {}),
                    },
                  }
                : {}),
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
    content.icon('dismiss_icon', 'Close icon', 'Alert', { condition: { dismiss: true } }),
    style.color('background', 'Background', 'Alert', {
      selectors: { '{{el}} .fr-alert': 'background-color: {{value}}' },
    }),
    style.color('border_color', 'Border color', 'Alert', {
      selectors: { '{{el}} .fr-alert': 'border-color: {{value}}' },
    }),
    style.slider('border_left_width', 'Left border width', 'Alert', {
      responsive: true,
      units: ['px', 'em'],
      max: 50,
      selectors: { '{{el}} .fr-alert': 'border-left-width: {{value}}' },
    }),
    ...textStyle('title_', 'Title', '{{el}} .fr-alert__title'),
    groups.textShadow('title_shadow', 'Text shadow', 'Title', '{{el}} .fr-alert__title'),
    ...textStyle('description_', 'Description', '{{el}} .fr-alert__description'),
    groups.textShadow(
      'description_shadow',
      'Text shadow',
      'Description',
      '{{el}} .fr-alert__description',
    ),
    style.slider('dismiss_size', 'Size', 'Close button', {
      responsive: true,
      units: ['px', 'em'],
      max: 100,
      condition: { dismiss: true },
      selectors: { '{{el}} .fr-alert__close': 'font-size: {{value}}' },
    }),
    style.slider('dismiss_top', 'Vertical position', 'Close button', {
      responsive: true,
      units: ['px', '%', 'em'],
      min: -100,
      max: 100,
      condition: { dismiss: true },
      selectors: { '{{el}} .fr-alert__close': 'top: {{value}}' },
    }),
    style.slider('dismiss_right', 'Horizontal position', 'Close button', {
      responsive: true,
      units: ['px', '%', 'em'],
      min: -100,
      max: 100,
      condition: { dismiss: true },
      selectors: { '{{el}} .fr-alert__close': 'right: {{value}}' },
    }),
    style.color('dismiss_color', 'Color', 'Close button', {
      hover: true,
      condition: { dismiss: true },
      selectors: { '{{el}} .fr-alert__close': 'color: {{value}}' },
    }),
    style.slider('dismiss_transition', 'Transition duration (s)', 'Close button', {
      units: ['s'],
      max: 3,
      step: 0.1,
      condition: { dismiss: true },
      selectors: { '{{el}} .fr-alert__close': 'transition: color {{value}}' },
    }),
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
            <button
              type="button"
              className="fr-alert__close"
              aria-label={uiText(context.locale, 'Close')}
              data-fr-close=""
            >
              {settings.dismiss_icon ? <Icon value={settings.dismiss_icon} /> : '×'}
            </button>
          )}
        </div>
      </ElementRoot>
    );
  },
};

// ---- Audio -----------------------------------------------------------------------------------------

const SC_OPTIONS = [
  'buying',
  'liking',
  'download',
  'show_artwork',
  'sharing',
  'show_comments',
  'show_playcount',
  'show_user',
];

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
    ...(
      [
        ['buying', 'Buy button'],
        ['liking', 'Like button'],
        ['download', 'Download button'],
        ['show_artwork', 'Artwork'],
        ['sharing', 'Share button'],
        ['show_comments', 'Comments'],
        ['show_playcount', 'Play counts'],
        ['show_user', 'Username'],
      ] as const
    ).map(([name, label]) =>
      content.switch(`sc_${name}`, label, 'Audio', { default: true, noCss: true }),
    ),
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
    const params = new URLSearchParams({
      url,
      visual: settings.visual === false ? 'false' : 'true',
      auto_play: settings.autoplay === true ? 'true' : 'false',
      color,
    });
    // The player's options: only those switched off are written.
    for (const key of SC_OPTIONS) {
      if (settings[`sc_${key}`] === false) params.set(key, 'false');
    }
    const src = `https://w.soundcloud.com/player/?${params.toString()}`;
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

const NO_FADE = { 'effect!': 'fade' };

/** Captions under images (carousel and gallery): their alignment, colors and spacing. */
function captionControls(section: string, selector: string, condition: Record<string, unknown>) {
  return [
    style.choose('caption_align', 'Alignment', section, {
      responsive: true,
      options: TEXT_ALIGN,
      condition,
      selectors: { [selector]: 'text-align: {{value}}' },
    }),
    style.color('caption_color', 'Text color', section, {
      condition,
      selectors: { [selector]: 'color: {{value}}' },
    }),
    { ...groups.typography('caption_typography', 'Typography', section, selector), condition },
    { ...groups.textShadow('caption_shadow', 'Text shadow', section, selector), condition },
    style.slider('caption_space', 'Spacing', section, {
      responsive: true,
      units: ['px', 'em', 'rem'],
      max: 100,
      condition,
      selectors: { [selector]: 'margin-top: {{value}}' },
    }),
  ];
}

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
      condition: NO_FADE,
      selectors: { '{{el}} .fr-carousel__track': '--fr-per-view: {{value}}' },
    }),
    content.number('per_scroll', 'Slides to scroll', 'Carousel', {
      responsive: true,
      min: 1,
      max: 10,
      condition: NO_FADE,
      selectors: { '{{el}} .fr-carousel__track': '--fr-per-scroll: {{value}}' },
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
    content.select('pagination', 'Pagination', 'Carousel', {
      options: [
        { value: '', label: 'Dots' },
        { value: 'fraction', label: 'Fraction' },
        { value: 'progressbar', label: 'Progress bar' },
      ],
      condition: { navigation: ['both', 'dots'] },
      noCss: true,
    }),
    content.icon('prev_icon', 'Previous arrow icon', 'Carousel', {
      condition: { navigation: ['both', 'arrows'] },
    }),
    content.icon('next_icon', 'Next arrow icon', 'Carousel', {
      condition: { navigation: ['both', 'arrows'] },
    }),
    content.select('link_to', 'Link', 'Carousel', {
      default: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'file', label: 'Media file (lightbox)' },
        { value: 'custom', label: 'Custom URL' },
      ],
      noCss: true,
    }),
    content.url('link', 'Link', 'Carousel', { condition: { link_to: 'custom' } }),
    content.select('caption_type', 'Caption', 'Carousel', {
      options: [
        { value: '', label: 'None' },
        { value: 'attachment', label: 'Attachment caption' },
        { value: 'alt', label: 'Image description' },
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
    content.switch('pause_interaction', 'Pause on interaction', 'Carousel', {
      help: 'Autoplay stops once the visitor uses the arrows, the dots or swipes.',
      condition: { autoplay: true },
      noCss: true,
    }),
    content.select('effect', 'Effect', 'Carousel', {
      options: [
        { value: '', label: 'Slide' },
        { value: 'fade', label: 'Fade' },
      ],
      help: 'Fade shows one image at a time.',
      noCss: true,
    }),
    content.number('speed', 'Animation speed (ms)', 'Carousel', {
      min: 100,
      max: 5000,
      step: 50,
      placeholder: '500',
      selectors: { '{{el}} .fr-carousel': '--fr-carousel-speed: {{value}}ms' },
    }),
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
      hover: true,
      selectors: { '{{el}} .fr-carousel__arrow': 'color: {{value}}' },
    }),
    style.select('arrows_position', 'Arrows position', 'Navigation', {
      options: [
        { value: '', label: 'Inside' },
        { value: 'outside', label: 'Outside' },
      ],
      noCss: true,
    }),
    style.slider('arrows_size', 'Arrows size', 'Navigation', {
      responsive: true,
      units: ['px', 'em'],
      min: 10,
      max: 100,
      selectors: { '{{el}} .fr-carousel__arrow': 'font-size: {{value}}' },
    }),
    style.color('arrows_bg', 'Arrows background', 'Navigation', {
      hover: true,
      selectors: { '{{el}} .fr-carousel__arrow': 'background-color: {{value}}' },
    }),
    style.slider('arrows_box', 'Arrows box size', 'Navigation', {
      units: ['px', 'em'],
      min: 0,
      max: 120,
      selectors: { '{{el}} .fr-carousel__arrow': 'width: {{value}}; height: {{value}}' },
    }),
    style.slider('arrows_offset', 'Arrows distance from the edge', 'Navigation', {
      responsive: true,
      units: ['px', '%', 'em'],
      min: -100,
      max: 100,
      selectors: {
        '{{el}} .fr-carousel__prev': 'left: {{value}}',
        '{{el}} .fr-carousel__next': 'right: {{value}}',
      },
    }),
    style.color('dot_color', 'Dot color', 'Navigation', {
      selectors: { '{{el}} .fr-carousel__dot': 'background-color: {{value}}' },
    }),
    style.color('dot_active', 'Active dot color', 'Navigation', {
      selectors: { '{{el}} .fr-carousel__dot[aria-current="true"]': 'background-color: {{value}}' },
    }),
    style.select('dots_position', 'Dots position', 'Navigation', {
      options: [
        { value: '', label: 'Outside' },
        { value: 'inside', label: 'Inside' },
      ],
      noCss: true,
    }),
    style.slider('dots_size', 'Dots size', 'Navigation', {
      responsive: true,
      units: ['px'],
      min: 2,
      max: 40,
      selectors: { '{{el}} .fr-carousel__dot': 'width: {{value}}; height: {{value}}' },
    }),
    style.slider('dots_gap', 'Space between dots', 'Navigation', {
      responsive: true,
      units: ['px'],
      max: 40,
      selectors: { '{{el}} .fr-carousel__dots': 'gap: {{value}}' },
    }),
    style.color('pagination_color', 'Fraction and progress color', 'Navigation', {
      condition: { pagination: ['fraction', 'progressbar'] },
      selectors: {
        '{{el}} .fr-carousel__fraction': 'color: {{value}}',
        '{{el}} .fr-carousel__progress > span': 'background-color: {{value}}',
      },
    }),
    ...captionControls('Caption', '{{el}} .fr-carousel__caption', {
      'caption_type!': [undefined, ''],
    }),
    ...advancedControls(),
  ],
  media: (settings) => mediaIds(settings.images),
  render({ node, settings, context }) {
    const images = (Array.isArray(settings.images) ? settings.images : []).filter(isMedia);
    const nav = String(settings.navigation ?? 'both');
    const lightbox = settings.link_to === 'file';
    const custom = settings.link_to === 'custom' ? linkProps(settings.link) : null;
    const fade = settings.effect === 'fade';
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
    const speed = num(settings.speed, 0);
    const pagination =
      settings.pagination === 'fraction' || settings.pagination === 'progressbar'
        ? settings.pagination
        : 'bullets';
    const classes = [
      'fr-carousel',
      fade ? 'fr-carousel--fade' : '',
      settings.arrows_position === 'outside' ? 'fr-carousel--arrows-outside' : '',
      settings.dots_position === 'inside' ? 'fr-carousel--dots-inside' : '',
    ]
      .filter(Boolean)
      .join(' ');
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
          'data-fr-pause-interaction': settings.pause_interaction === true ? '' : undefined,
          'data-fr-effect': fade ? 'fade' : undefined,
          'data-fr-speed': speed > 0 ? String(Math.min(Math.round(speed), 5000)) : undefined,
        }}
      >
        <div
          className={classes}
          role="region"
          aria-roledescription="carousel"
          aria-label={uiText(context.locale, 'Images')}
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
              const item = image.id ? context.media.get(image.id) : undefined;
              const href = image.id ? (item?.url ?? image.url) : image.url;
              const caption =
                settings.caption_type === 'attachment'
                  ? attachmentCaption(image, item)
                  : settings.caption_type === 'alt'
                    ? (image.alt ?? item?.alt ?? '')
                    : '';
              return (
                <div
                  key={`${image.id ?? image.url}-${i}`}
                  className={`fr-carousel__slide${fade && i === 0 ? ' is-active' : ''}`}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} / ${images.length}`}
                >
                  {lightbox ? (
                    <a
                      href={href}
                      data-fr-lightbox={`c-${node.id}`}
                      {...(caption ? { 'data-fr-caption': caption } : {})}
                    >
                      {img}
                    </a>
                  ) : custom ? (
                    <a {...custom}>{img}</a>
                  ) : (
                    img
                  )}
                  {caption ? <div className="fr-carousel__caption">{caption}</div> : null}
                </div>
              );
            })}
          </div>
          {(nav === 'both' || nav === 'arrows') && (
            <>
              <button
                type="button"
                className="fr-carousel__arrow fr-carousel__prev"
                aria-label={uiText(context.locale, 'Previous')}
                data-fr-prev=""
              >
                {settings.prev_icon ? <Icon value={settings.prev_icon} /> : '‹'}
              </button>
              <button
                type="button"
                className="fr-carousel__arrow fr-carousel__next"
                aria-label={uiText(context.locale, 'Next')}
                data-fr-next=""
              >
                {settings.next_icon ? <Icon value={settings.next_icon} /> : '›'}
              </button>
            </>
          )}
          {(nav === 'both' || nav === 'dots') &&
            (pagination === 'fraction' ? (
              <div className="fr-carousel__fraction" data-fr-fraction="" aria-hidden="true" />
            ) : pagination === 'progressbar' ? (
              <div className="fr-carousel__progress" data-fr-progress="" aria-hidden="true">
                <span />
              </div>
            ) : (
              <div className="fr-carousel__dots" data-fr-dots="" />
            ))}
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
    content.select('caption_source', 'Caption source', 'Gallery', {
      options: [
        { value: '', label: 'Image description' },
        { value: 'attachment', label: 'Attachment caption' },
      ],
      condition: { captions: true },
      noCss: true,
    }),
    content.switch('random', 'Random order', 'Gallery', {
      help: 'The images are shuffled each time the page is shown.',
      noCss: true,
    }),
    style.slider('gap', 'Gap', 'Images', {
      responsive: true,
      units: ['px'],
      max: 60,
      selectors: { '{{el}} .fr-gallery': 'gap: {{value}}' },
    }),
    groups.border('image_border', 'Border', 'Images', '{{el}} .fr-gallery img'),
    groups.filters('filters', 'CSS filters', 'Images', '{{el}} .fr-gallery img'),
    groups.filters(
      'filters_hover',
      'CSS filters on hover',
      'Images',
      '{{el}} .fr-gallery a:hover img, {{el}} .fr-gallery__item:hover img',
    ),
    ...captionControls('Caption', '{{el}} .fr-gallery__item figcaption', { captions: true }),
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
        extra={settings.random === true ? { 'data-fr-handler': 'shuffle' } : undefined}
      >
        {images.length === 0 && context.editing ? <span className="fr-placeholder" /> : null}
        <div className="fr-gallery">
          {images.map((image, i) => {
            const item = image.id ? context.media.get(image.id) : undefined;
            const caption =
              settings.captions !== true
                ? ''
                : settings.caption_source === 'attachment'
                  ? attachmentCaption(image, item)
                  : (image.alt ?? item?.alt ?? '');
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
      options: Array.from({ length: 10 }, (_, i) => ({
        value: String(i + 1),
        label: `0–${i + 1}`,
      })),
      noCss: true,
    }),
    content.number('rating', 'Rating', 'Rating', {
      default: 4.5,
      min: 0,
      max: 10,
      step: 0.1,
      noCss: true,
    }),
    content.select('star_style', 'Icon', 'Rating', {
      options: [
        { value: '', label: 'Icon' },
        { value: 'unicode', label: 'Unicode' },
      ],
      noCss: true,
    }),
    content.icon('icon', 'Icon', 'Rating', {
      default: { set: 'solid', name: 'star' },
      condition: { 'star_style!': 'unicode' },
    }),
    content.select('unmarked_style', 'Unmarked style', 'Rating', {
      options: [
        { value: '', label: 'Solid' },
        { value: 'outline', label: 'Outline' },
      ],
      noCss: true,
    }),
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
    groups.textShadow('title_shadow', 'Text shadow', 'Title', '{{el}} .fr-rating__title'),
    style.slider('title_gap', 'Spacing', 'Title', {
      responsive: true,
      units: ['px', 'em'],
      max: 50,
      selectors: { '{{el}} .fr-rating__title': 'margin-right: {{value}}' },
    }),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const scale = Math.max(1, Math.min(10, Math.round(num(settings.scale, 5))));
    const unicode = settings.star_style === 'unicode';
    const outline = settings.unmarked_style === 'outline';
    const glyph = (empty: boolean) =>
      unicode ? (
        <span className="fr-star__char">{empty && outline ? '☆' : '★'}</span>
      ) : (
        <Icon value={settings.icon} />
      );
    const rating = Math.max(0, Math.min(scale, num(settings.rating, 4.5)));
    const title = plainText(settings.title);
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={`fr-rating${outline && !unicode ? ' fr-rating--outline' : ''}`}
        editing={context.editing}
      >
        {title && <span className="fr-rating__title">{title}</span>}
        <span className="fr-stars" role="img" aria-label={`Rated ${rating} out of ${scale}`}>
          {Array.from({ length: scale }, (_, i) => {
            const fill = Math.max(0, Math.min(1, rating - i));
            return (
              <span key={i} className="fr-star" aria-hidden="true">
                {glyph(true)}
                {fill > 0 && (
                  <span className="fr-star__fill" style={{ width: `${Math.round(fill * 100)}%` }}>
                    {glyph(false)}
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
    groups.filters('filters_hover', 'CSS filters on hover', 'Map', '{{el}}:hover iframe'),
    style.slider('hover_transition', 'Transition duration (s)', 'Map', {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: { '{{el}} iframe': 'transition: filter {{value}}' },
    }),
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
  // Half circles growing by 10 at each turn, from the center out.
  spiral:
    'M250,150 a10,10 0 0,1 20,0 a20,20 0 0,1 -40,0 a30,30 0 0,1 60,0 a40,40 0 0,1 -80,0 a50,50 0 0,1 100,0 a60,60 0 0,1 -120,0 a70,70 0 0,1 140,0 a80,80 0 0,1 -160,0 a90,90 0 0,1 180,0 a100,100 0 0,1 -200,0 a110,110 0 0,1 220,0 a120,120 0 0,1 -240,0',
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
      options: [
        ...Object.keys(PATHS).map((p) => ({
          value: p,
          label: p[0]!.toUpperCase() + p.slice(1),
        })),
        { value: 'custom', label: 'Custom' },
      ],
      noCss: true,
    }),
    content.media('custom_path', 'SVG', 'Text path', {
      accept: 'svg',
      help: 'An SVG file: its first path carries the text (on the page; the editor shows a wave).',
      condition: { path: 'custom' },
    }),
    content.select('text_direction', 'Text direction', 'Text path', {
      options: [
        { value: '', label: 'Default' },
        { value: 'rtl', label: 'Right to left' },
        { value: 'ltr', label: 'Left to right' },
      ],
      noCss: true,
    }),
    content.switch('show_path', 'Show path', 'Text path', {
      dictionary: { true: 'stroke: currentColor' },
      selectors: { '{{el}} .fr-text-path__line': '{{value}}' },
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
    content.slider('rotation', 'Rotate', 'Text path', {
      responsive: true,
      units: ['deg'],
      min: 0,
      max: 360,
      selectors: { '{{el}} svg': 'transform: rotate({{value}})' },
    }),
    ...textStyle('', 'Text', '{{el}} text', { hover: true }),
    ...textStrokeControls('text_stroke', 'Text', '{{el}} text'),
    style.slider('word_spacing', 'Word spacing', 'Text', {
      responsive: true,
      units: ['px', 'em'],
      min: -20,
      max: 50,
      selectors: { '{{el}} text': 'word-spacing: {{value}}' },
    }),
    style.slider('text_transition', 'Transition duration (s)', 'Text', {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: { '{{el}} text': 'transition: fill {{value}}, color {{value}}' },
    }),
    style.color('stroke', 'Path color', 'Path', {
      hover: true,
      selectors: { '{{el}} .fr-text-path__line': 'stroke: {{value}}' },
    }),
    style.color('path_fill', 'Path fill', 'Path', {
      selectors: { '{{el}} .fr-text-path__line': 'fill: {{value}}' },
    }),
    style.slider('stroke_width', 'Path width', 'Path', {
      units: ['px'],
      max: 20,
      selectors: { '{{el}} .fr-text-path__line': 'stroke-width: {{value}}' },
    }),
    style.slider('stroke_transition', 'Transition duration (s)', 'Path', {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: { '{{el}} .fr-text-path__line': 'transition: stroke {{value}}, fill {{value}}' },
    }),
    hoverAnimationControl('Text'),
    ...advancedControls(),
  ],
  media: (settings) => mediaIds(settings.custom_path),
  render({ node, settings, context }) {
    const shape = PATHS[String(settings.path)] ?? PATHS.wave!;
    // A path from an SVG file: the front-end script reads it.
    const svgUrl =
      settings.path === 'custom' &&
      isMedia(settings.custom_path) &&
      /^(https?:\/\/|\/(?!\/))[^\s"'<>]*\.svg(\?[^\s"'<>]*)?$/i.test(settings.custom_path.url)
        ? settings.custom_path.url
        : null;
    const direction =
      settings.text_direction === 'rtl' || settings.text_direction === 'ltr'
        ? settings.text_direction
        : undefined;
    const id = `fr-tp-${node.id.replace(/[^A-Za-z0-9_-]/g, '')}`;
    const offset = num((settings.offset as { size?: unknown } | undefined)?.size, 0);
    const link = linkProps(settings.link);
    const text: ReactNode = (
      <textPath href={`#${id}`} startOffset={`${offset}%`}>
        {plainText(settings.text)}
      </textPath>
    );
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-text-path"
        editing={context.editing}
        extra={svgUrl ? { 'data-fr-handler': 'text-path', 'data-fr-path': svgUrl } : undefined}
      >
        <svg
          viewBox="0 0 500 300"
          className={`fr-text-path__svg${hoverClass(settings.hover_effect)}`}
          role="img"
          aria-label={plainText(settings.text)}
        >
          <path id={id} d={shape} className="fr-text-path__line" fill="none" />
          <text {...(direction ? { direction } : {})}>
            {link ? <a href={link.href}>{text}</a> : text}
          </text>
        </svg>
      </ElementRoot>
    );
  },
};
