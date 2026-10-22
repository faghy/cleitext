import {
  advancedControls,
  ElementRoot,
  hoverBorderControls,
  transitionControl,
  UNITS,
} from '../core/common.js';
import { content, groups, style } from '../core/controls.js';
import { linkProps } from '../core/links.js';
import { isMedia, mediaUrl } from '../core/media.js';
import type { Control, ElementDefinition, RenderContext, Settings } from '../core/model.js';
import { videoEmbed } from './general.js';
import { SHAPE_OPTIONS, SHAPES } from './shapes.js';

const IN = '{{el}} > .fr-container__in';

const DIRECTION = [
  { value: 'row', label: 'Row', icon: 'M4 12h14 M14 8l4 4-4 4' },
  { value: 'column', label: 'Column', icon: 'M12 4v14 M8 14l4 4 4-4' },
  { value: 'row-reverse', label: 'Row, reversed', icon: 'M20 12H6 M10 8l-4 4 4 4' },
  { value: 'column-reverse', label: 'Column, reversed', icon: 'M12 20V6 M8 10l4-4 4 4' },
];

const JUSTIFY = [
  { value: 'flex-start', label: 'Start', icon: 'M4 4v16 M8 8h4v8H8z M14 8h4v8h-4z' },
  { value: 'center', label: 'Center', icon: 'M12 4v16 M5 8h4v8H5z M15 8h4v8h-4z' },
  { value: 'flex-end', label: 'End', icon: 'M20 4v16 M6 8h4v8H6z M12 8h4v8h-4z' },
  {
    value: 'space-between',
    label: 'Space between',
    icon: 'M4 4v16 M20 4v16 M6 8h4v8H6z M14 8h4v8h-4z',
  },
  {
    value: 'space-around',
    label: 'Space around',
    icon: 'M4 4v16 M20 4v16 M7 8h3v8H7z M14 8h3v8h-3z',
  },
  {
    value: 'space-evenly',
    label: 'Space evenly',
    icon: 'M4 4v16 M20 4v16 M8 8h2v8H8z M14 8h2v8h-2z',
  },
];

const ALIGN_ITEMS = [
  { value: 'flex-start', label: 'Start', icon: 'M4 4h16 M7 7h4v10H7z M13 7h4v6h-4z' },
  { value: 'center', label: 'Center', icon: 'M4 12h16 M7 6h4v12H7z M13 9h4v6h-4z' },
  { value: 'flex-end', label: 'End', icon: 'M4 20h16 M7 7h4v10H7z M13 11h4v6h-4z' },
  { value: 'stretch', label: 'Stretch', icon: 'M4 4h16 M4 20h16 M7 7h4v10H7z M13 7h4v10h-4z' },
];

const ALIGN_CONTENT = [
  { value: 'flex-start', label: 'Start', icon: 'M4 4h16 M7 7h10v4H7z M7 13h10v4H7z' },
  { value: 'center', label: 'Center', icon: 'M7 6h10v4H7z M7 14h10v4H7z M4 12h16' },
  { value: 'flex-end', label: 'End', icon: 'M4 20h16 M7 7h10v4H7z M7 13h10v4H7z' },
  {
    value: 'space-between',
    label: 'Space between',
    icon: 'M4 4h16 M4 20h16 M7 6h10v4H7z M7 14h10v4H7z',
  },
  {
    value: 'space-around',
    label: 'Space around',
    icon: 'M4 4h16 M4 20h16 M7 7h10v3H7z M7 14h10v3H7z',
  },
  {
    value: 'space-evenly',
    label: 'Space evenly',
    icon: 'M4 4h16 M4 20h16 M7 8h10v2H7z M7 14h10v2H7z',
  },
  { value: 'stretch', label: 'Stretch', icon: 'M4 4h16 M4 20h16 M7 6h10v5H7z M7 13h10v5H7z' },
];

const GRID_CONTENT = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
  { value: 'space-between', label: 'Space between' },
  { value: 'space-around', label: 'Space around' },
  { value: 'space-evenly', label: 'Space evenly' },
  { value: 'stretch', label: 'Stretch' },
];

/** A grid template: sizes, `auto`, `repeat()`, `minmax()`, `fit-content()` and line names. */
const TRACKS =
  '((\\[[a-z][a-z0-9-]*\\]|-?\\d+(\\.\\d+)?(fr|px|%|em|rem|vw|vh)|auto|min-content|max-content|auto-fill|auto-fit|\\d+(?!\\d)|repeat\\(|minmax\\(|fit-content\\(|\\)|,)\\s?)+';

/** CSS blend modes (`mix-blend-mode`). */
export const BLEND_MODES = [
  '',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'saturation',
  'color',
  'difference',
  'exclusion',
  'hue',
  'luminosity',
].map((v) => ({
  value: v,
  label: v ? v[0]!.toUpperCase() + v.slice(1).replace('-', ' ') : 'Normal',
}));

const TAGS = [
  'div',
  'section',
  'header',
  'footer',
  'main',
  'article',
  'aside',
  'nav',
  'a',
] as const;

const controls: Control[] = [
  content.select('container_type', 'Container layout', 'Container', {
    default: 'flex',
    options: [
      { value: 'flex', label: 'Flexbox' },
      { value: 'grid', label: 'Grid' },
    ],
    noCss: true,
  }),
  content.select('content_width', 'Content width', 'Container', {
    default: 'boxed',
    options: [
      { value: 'boxed', label: 'Boxed' },
      { value: 'full', label: 'Full width' },
    ],
    noCss: true,
  }),
  content.slider('boxed_width', 'Boxed width', 'Container', {
    responsive: true,
    units: UNITS.length,
    max: 1600,
    help: 'Empty: the width set in Site settings.',
    condition: { content_width: 'boxed' },
    selectors: { [IN]: 'max-width: {{value}}' },
  }),
  content.slider('width', 'Width', 'Container', {
    responsive: true,
    units: UNITS.length,
    max: 1600,
    selectors: {
      // The width is the basis in a row (shrinking for the gap, as in other builders); in a column it stays a width.
      '{{el}}': 'width: {{value}}; flex: 0 1 auto',
    },
  }),
  content.slider('min_height', 'Minimum height', 'Container', {
    responsive: true,
    units: [...UNITS.height, 'vw'],
    max: 1440,
    selectors: { [IN]: 'min-height: {{value}}', '{{el}}': 'min-height: {{value}}' },
  }),
  content.choose('flex_direction', 'Direction', 'Items', {
    responsive: true,
    default: 'column',
    options: DIRECTION,
    condition: { container_type: 'flex' },
    selectors: { [IN]: 'flex-direction: {{value}}' },
  }),
  content.choose('justify_content', 'Justify content', 'Items', {
    responsive: true,
    options: JUSTIFY,
    condition: { container_type: 'flex' },
    selectors: { [IN]: 'justify-content: {{value}}' },
  }),
  content.choose('align_items', 'Align items', 'Items', {
    responsive: true,
    options: ALIGN_ITEMS,
    condition: { container_type: 'flex' },
    selectors: { [IN]: 'align-items: {{value}}' },
  }),
  content.select('flex_wrap', 'Wrap', 'Items', {
    responsive: true,
    options: [
      { value: 'nowrap', label: 'No wrap' },
      { value: 'wrap', label: 'Wrap' },
    ],
    condition: { container_type: 'flex' },
    selectors: { [IN]: 'flex-wrap: {{value}}' },
  }),
  content.choose('align_content', 'Align content', 'Items', {
    responsive: true,
    options: ALIGN_CONTENT,
    help: 'How the lines share the height when items wrap.',
    condition: { container_type: 'flex', flex_wrap: 'wrap' },
    selectors: { [IN]: 'align-content: {{value}}' },
  }),
  content.number('grid_columns', 'Columns', 'Items', {
    responsive: true,
    default: 3,
    min: 1,
    max: 12,
    condition: { container_type: 'grid' },
    selectors: { [IN]: 'grid-template-columns: repeat({{value}}, minmax(0, 1fr))' },
  }),
  content.text('grid_columns_custom', 'Custom columns', 'Items', {
    responsive: true,
    placeholder: '1fr 2fr',
    help: 'Instead of the number: sizes in fr, px, % or auto, e.g. 1fr 2fr, 200px auto, repeat(auto-fill, minmax(200px, 1fr)).',
    pattern: TRACKS,
    condition: { container_type: 'grid' },
    selectors: { [IN]: 'grid-template-columns: {{value}}' },
  }),
  content.number('grid_rows', 'Rows', 'Items', {
    responsive: true,
    min: 1,
    max: 12,
    condition: { container_type: 'grid' },
    selectors: { [IN]: 'grid-template-rows: repeat({{value}}, auto)' },
  }),
  content.text('grid_rows_custom', 'Custom rows', 'Items', {
    responsive: true,
    placeholder: 'auto 1fr',
    help: 'Instead of the number: sizes in fr, px, % or auto, e.g. 100px 1fr.',
    pattern: TRACKS,
    condition: { container_type: 'grid' },
    selectors: { [IN]: 'grid-template-rows: {{value}}' },
  }),
  content.select('grid_flow', 'Auto flow', 'Items', {
    responsive: true,
    options: [
      { value: 'row', label: 'Row' },
      { value: 'column', label: 'Column' },
      { value: 'row dense', label: 'Row, dense' },
      { value: 'column dense', label: 'Column, dense' },
    ],
    condition: { container_type: 'grid' },
    selectors: { [IN]: 'grid-auto-flow: {{value}}' },
  }),
  content.select('grid_justify_items', 'Justify items', 'Items', {
    responsive: true,
    options: ['start', 'center', 'end', 'stretch'].map((v) => ({
      value: v,
      label: v[0]!.toUpperCase() + v.slice(1),
    })),
    condition: { container_type: 'grid' },
    selectors: { [IN]: 'justify-items: {{value}}' },
  }),
  content.select('grid_align_items', 'Align items', 'Items', {
    responsive: true,
    options: ['start', 'center', 'end', 'stretch'].map((v) => ({
      value: v,
      label: v[0]!.toUpperCase() + v.slice(1),
    })),
    condition: { container_type: 'grid' },
    selectors: { [IN]: 'align-items: {{value}}' },
  }),
  content.select('grid_justify_content', 'Justify content', 'Items', {
    responsive: true,
    options: GRID_CONTENT,
    help: 'Where the columns go when they are narrower than the container.',
    condition: { container_type: 'grid' },
    selectors: { [IN]: 'justify-content: {{value}}' },
  }),
  content.select('grid_align_content', 'Align content', 'Items', {
    responsive: true,
    options: GRID_CONTENT,
    help: 'Where the rows go when they are shorter than the container.',
    condition: { container_type: 'grid' },
    selectors: { [IN]: 'align-content: {{value}}' },
  }),
  content.slider('gap', 'Gap', 'Items', {
    responsive: true,
    units: ['px', '%', 'em', 'rem'],
    max: 200,
    help: 'Empty: the gap set in Site settings.',
    selectors: { [IN]: 'gap: {{value}}' },
  }),
  content.slider('row_gap', 'Row gap', 'Items', {
    responsive: true,
    units: ['px', '%', 'em', 'rem'],
    max: 200,
    help: 'Empty: the gap above.',
    selectors: { [IN]: 'row-gap: {{value}}' },
  }),
  content.slider('column_gap', 'Column gap', 'Items', {
    responsive: true,
    units: ['px', '%', 'em', 'rem'],
    max: 200,
    help: 'Empty: the gap above.',
    selectors: { [IN]: 'column-gap: {{value}}' },
  }),
  // Items of Tabs (containers with a title): the icons next to the tab's title.
  content.icon('_icon', 'Tab icon', 'Tab', { condition: { '_title!': [undefined, ''] } }),
  content.icon('_icon_active', 'Active tab icon', 'Tab', {
    condition: { '_title!': [undefined, ''], '_icon!': [undefined, null, ''] },
  }),
  content.select('html_tag', 'HTML tag', 'Additional options', {
    default: 'div',
    options: TAGS.map((tag) => ({ value: tag, label: tag === 'a' ? 'a (link)' : tag })),
    noCss: true,
  }),
  content.url('link', 'Link', 'Additional options', { condition: { html_tag: 'a' } }),
  content.select('overflow', 'Overflow', 'Additional options', {
    options: [
      { value: '', label: 'Default' },
      { value: 'hidden', label: 'Hidden' },
      { value: 'auto', label: 'Auto' },
    ],
    selectors: { '{{el}}': 'overflow: {{value}}' },
  }),
  groups.background('background', 'Background', 'Background', '{{el}}'),
  groups.background('background_hover', 'Background on hover', 'Background', '{{el}}:hover'),
  transitionControl('background_hover_transition', 'Background', '--fr-bg-transition', 'style'),
  {
    name: 'background_video',
    type: 'media',
    label: 'Video (MP4, WebM, YouTube or Vimeo link)',
    tab: 'style',
    section: 'Background video',
    accept: 'video',
    noCss: true,
    help: 'Plays muted, in a loop, behind the content. The background image shows while it loads, and instead of it on phones and for visitors who prefer less motion.',
  },
  {
    name: 'background_video_mobile',
    type: 'switch',
    label: 'Play on phones too',
    tab: 'style',
    section: 'Background video',
    noCss: true,
  },
  ...slideshowControls(),
  // The overlay, as Elementor's: a background (color, image or gradient), its
  // opacity, CSS filters and blend mode, and the same on hover.
  groups.background('overlay_bg', 'Overlay', 'Background overlay', '{{el}}::before'),
  // Pages made before the overlay group had a color of its own: shown only when set.
  style.color('overlay_color', 'Overlay color', 'Background overlay', {
    condition: { 'overlay_color!': [undefined, ''] },
    selectors: {
      '{{el}}::before':
        "content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0; background-color: {{value}}",
    },
  }),
  style.slider('overlay_opacity', 'Overlay opacity', 'Background overlay', {
    units: [''],
    min: 0,
    max: 1,
    step: 0.05,
    selectors: { '{{el}}::before': 'opacity: {{size}}' },
  }),
  groups.filters('overlay_filters', 'CSS filters', 'Background overlay', '{{el}}::before'),
  style.select('overlay_blend', 'Blend mode', 'Background overlay', {
    options: BLEND_MODES,
    selectors: { '{{el}}::before': 'mix-blend-mode: {{value}}' },
  }),
  groups.background(
    'overlay_hover_bg',
    'Overlay on hover',
    'Background overlay',
    '{{el}}:hover::before',
  ),
  style.slider('overlay_hover_opacity', 'Overlay opacity on hover', 'Background overlay', {
    units: [''],
    min: 0,
    max: 1,
    step: 0.05,
    selectors: { '{{el}}:hover::before': 'opacity: {{size}}' },
  }),
  groups.filters(
    'overlay_hover_filters',
    'CSS filters on hover',
    'Background overlay',
    '{{el}}:hover::before',
  ),
  style.slider('overlay_hover_transition', 'Transition duration (s)', 'Background overlay', {
    units: ['s'],
    min: 0,
    max: 3,
    step: 0.1,
    selectors: {
      '{{el}}::before':
        'transition: background {{value}}, opacity {{value}}, filter {{value}}, border-radius {{value}}',
    },
  }),
  groups.border('border', 'Border', 'Border', '{{el}}'),
  groups.shadow('shadow', 'Box shadow', 'Border', '{{el}}'),
  ...hoverBorderControls('', 'style', 'Border'),
  ...(['top', 'bottom'] as const).flatMap((edge) => {
    const section = edge === 'top' ? 'Shape divider (top)' : 'Shape divider (bottom)';
    const at = `{{el}} > .fr-shape--${edge}`;
    return [
      style.select(`shape_${edge}`, 'Shape', section, { options: SHAPE_OPTIONS, noCss: true }),
      style.color(`shape_${edge}_color`, 'Color', section, {
        selectors: { [`${at} .fr-shape__fill`]: 'fill: {{value}}' },
      }),
      style.slider(`shape_${edge}_width`, 'Width', section, {
        responsive: true,
        units: ['%'],
        min: 100,
        max: 300,
        selectors: { [`${at} svg`]: 'width: calc({{size}}% + 1.3px)' },
      }),
      style.slider(`shape_${edge}_height`, 'Height', section, {
        responsive: true,
        units: ['px'],
        max: 500,
        selectors: { [`${at} svg`]: 'height: {{value}}' },
      }),
      style.switch(`shape_${edge}_flip`, 'Flip', section, { noCss: true }),
      style.switch(`shape_${edge}_negative`, 'Invert', section, { noCss: true }),
      style.switch(`shape_${edge}_front`, 'In front of the content', section, { noCss: true }),
    ];
  }),
  ...advancedControls({ container: true }),
];

// ---- Background slideshow ------------------------------------------------------------------

function slideshowControls(): Control[] {
  const make = (control: Omit<Control, 'tab' | 'section'>): Control => ({
    tab: 'style',
    section: 'Background slideshow',
    noCss: true,
    ...control,
  });
  return [
    make({ name: 'background_slideshow_gallery', type: 'gallery', label: 'Images' }),
    make({
      name: 'background_slideshow_loop',
      type: 'select',
      label: 'Infinite loop',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    }),
    make({
      name: 'background_slideshow_slide_duration',
      type: 'number',
      label: 'Duration (ms)',
      min: 500,
      max: 60000,
      step: 100,
      placeholder: '5000',
    }),
    make({
      name: 'background_slideshow_slide_transition',
      type: 'select',
      label: 'Transition',
      options: [
        { value: 'fade', label: 'Fade' },
        { value: 'slide_right', label: 'Slide right' },
        { value: 'slide_left', label: 'Slide left' },
        { value: 'slide_up', label: 'Slide up' },
        { value: 'slide_down', label: 'Slide down' },
      ],
    }),
    make({
      name: 'background_slideshow_transition_duration',
      type: 'number',
      label: 'Transition duration (ms)',
      min: 0,
      max: 10000,
      step: 100,
      placeholder: '500',
    }),
    make({
      name: 'background_slideshow_background_size',
      type: 'select',
      label: 'Size',
      options: [
        { value: 'cover', label: 'Cover' },
        { value: 'contain', label: 'Contain' },
        { value: 'auto', label: 'Auto' },
      ],
    }),
    make({
      name: 'background_slideshow_background_position',
      type: 'select',
      label: 'Position',
      options: [
        'center center',
        'center left',
        'center right',
        'top center',
        'top left',
        'top right',
        'bottom center',
        'bottom left',
        'bottom right',
      ].map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })),
    }),
    make({ name: 'background_slideshow_ken_burns', type: 'switch', label: 'Ken Burns effect' }),
    make({
      name: 'background_slideshow_ken_burns_zoom_direction',
      type: 'select',
      label: 'Direction',
      options: [
        { value: 'in', label: 'In' },
        { value: 'out', label: 'Out' },
      ],
      condition: { background_slideshow_ken_burns: true },
    }),
    make({
      name: 'background_slideshow_lazyload',
      type: 'switch',
      label: 'Lazy load',
      help: 'Each image loads when it is about to show.',
    }),
  ];
}

const pick = (value: unknown, allowed: readonly string[], fallback: string) =>
  typeof value === 'string' && allowed.includes(value) ? value : fallback;

const ms = (value: unknown, fallback: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(Math.round(value), max)
    : fallback;

/** The images of a background slideshow, one shown at a time (frontend.js moves them). */
function slideshow(settings: Settings, context: RenderContext) {
  const gallery = settings.background_slideshow_gallery;
  const urls = (Array.isArray(gallery) ? gallery : [])
    .map((item) => mediaUrl(item, context))
    .filter((url): url is string => Boolean(url));
  if (urls.length === 0) return null;
  const transition = pick(
    settings.background_slideshow_slide_transition,
    ['fade', 'slide_right', 'slide_left', 'slide_up', 'slide_down'],
    'fade',
  );
  const ken =
    settings.background_slideshow_ken_burns === true
      ? settings.background_slideshow_ken_burns_zoom_direction === 'out'
        ? 'out'
        : 'in'
      : null;
  const duration = Math.max(ms(settings.background_slideshow_slide_duration, 5000, 60000), 500);
  const speed = ms(settings.background_slideshow_transition_duration, 500, 10000);
  const lazy = settings.background_slideshow_lazyload === true && !context.editing;
  const style = {
    '--fr-ss-duration': `${duration}ms`,
    '--fr-ss-transition': `${speed}ms`,
    '--fr-ss-size': pick(
      settings.background_slideshow_background_size,
      ['cover', 'contain', 'auto'],
      'cover',
    ),
    '--fr-ss-position': pick(
      settings.background_slideshow_background_position,
      [
        'center center',
        'center left',
        'center right',
        'top center',
        'top left',
        'top right',
        'bottom center',
        'bottom left',
        'bottom right',
      ],
      'center center',
    ),
  } as Record<string, string>;
  return (
    <div
      className={`fr-bg-slideshow fr-bg-slideshow--${transition}${ken ? ` fr-bg-slideshow--ken-${ken}` : ''}`}
      style={style}
      aria-hidden="true"
      data-fr-handler="bg-slideshow"
      data-fr-duration={String(duration)}
      data-fr-speed={String(speed)}
      {...(settings.background_slideshow_loop === 'no' ? { 'data-fr-loop': 'no' } : {})}
    >
      {urls.map((url, i) => (
        <div key={i} className={`fr-bg-slide${i === 0 ? ' is-active' : ''}`}>
          <div
            className="fr-bg-slide__img"
            {...(lazy ? { 'data-fr-bg': url } : { style: { backgroundImage: `url("${url}")` } })}
          />
        </div>
      ))}
    </div>
  );
}

/** A shape divider at an edge of a container (none when no shape is chosen). */
function shapeDivider(settings: Record<string, unknown>, edge: 'top' | 'bottom') {
  const shape = SHAPES[String(settings[`shape_${edge}`] ?? '')];
  if (!shape) return null;
  const negative = settings[`shape_${edge}_negative`] === true && Boolean(shape.negative);
  const classes = [
    'fr-shape',
    `fr-shape--${edge}`,
    negative ? 'fr-shape--negative' : '',
    settings[`shape_${edge}_flip`] === true ? 'fr-shape--flip' : '',
    settings[`shape_${edge}_front`] === true ? 'fr-shape--front' : '',
  ];
  return (
    <div className={classes.filter(Boolean).join(' ')} aria-hidden="true">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={shape.viewBox ?? '0 0 1000 100'}
        preserveAspectRatio={shape.aspect ?? 'none'}
      >
        {shape.layers && !negative ? (
          shape.layers.map((layer, i) => (
            <path key={i} className="fr-shape__fill" opacity={layer.opacity} d={layer.d} />
          ))
        ) : (
          <path className="fr-shape__fill" d={negative ? shape.negative : shape.path} />
        )}
      </svg>
    </div>
  );
}

export const container: ElementDefinition = {
  type: 'fresco/container',
  title: 'Container',
  icon: 'M4 5h16v14H4z M4 9h16',
  category: 'layout',
  keywords: ['section', 'row', 'column', 'flex', 'grid', 'layout'],
  container: true,
  controls,
  render({ node, settings, children, context }) {
    const grid = settings.container_type === 'grid';
    const boxed = settings.content_width !== 'full';
    const tag = TAGS.includes(settings.html_tag as never)
      ? (settings.html_tag as (typeof TAGS)[number])
      : 'div';
    const link = tag === 'a' ? linkProps(settings.link) : null;
    const name = `fr-container fr-container--${grid ? 'grid' : 'flex'} fr-container--${boxed ? 'boxed' : 'full'}`;
    const empty = !node.children || node.children.length === 0;
    const video = (settings.background_video as { url?: string } | undefined)?.url;
    const videoUrl =
      video &&
      !/(youtube\.com|youtu\.be|vimeo\.com)\//.test(video) &&
      /^(https?:\/\/|\/(?!\/))[^\s"'<>]*$/.test(video)
        ? video
        : null;
    const overlay = ['overlay_bg_type', 'overlay_hover_bg_type'].some(
      (key) => settings[key] === 'classic' || settings[key] === 'gradient',
    );
    // YouTube and Vimeo play in a frame, muted and looping, cut to cover the container.
    const embed =
      video && /^https:\/\//.test(video)
        ? (videoEmbed(/vimeo\.com/.test(video) ? 'vimeo' : 'youtube', video, {
            autoplay: true,
            mute: true,
            loop: true,
            controls: false,
          })
            ?.replace(/^(https:\/\/player\.vimeo\.com\/[^#]*)/, '$1&background=1')
            // YouTube tells the page when it plays (frontend.js shows the frame then).
            .replace(/^(https:\/\/www\.youtube-nocookie\.com\/[^#]*)/, '$1&enablejsapi=1') ?? null)
        : null;
    const mobileClass = settings.background_video_mobile === true ? '' : ' fr-bg-video--wide';
    const slides = slideshow(settings, context);
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={`${name}${videoUrl || embed ? ' fr-has-video' : ''}${overlay ? ' fr-has-overlay' : ''}${slides ? ' fr-has-slideshow' : ''}`}
        editing={context.editing}
        tag={tag === 'a' && !link ? 'div' : tag}
        extra={link ? { href: link.href, target: link.target, rel: link.rel } : undefined}
      >
        {slides}
        {videoUrl && (
          <video
            className={`fr-bg-video${mobileClass}`}
            src={videoUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            tabIndex={-1}
          />
        )}
        {embed && (
          <div
            className={`fr-bg-video fr-bg-embed${mobileClass}`}
            aria-hidden="true"
            data-fr-video-bg=""
          >
            <iframe src={embed} title="" tabIndex={-1} allow="autoplay; encrypted-media" />
          </div>
        )}
        {shapeDivider(settings, 'top')}
        {shapeDivider(settings, 'bottom')}
        <div className="fr-container__in">
          {children}
          {empty && context.editing ? <div className="fr-empty" data-fr-empty="" /> : null}
        </div>
      </ElementRoot>
    );
  },
  media: (settings) => {
    const ids: string[] = [];
    for (const key of [
      'background_image',
      'background_hover_image',
      'overlay_bg_image',
      'overlay_hover_bg_image',
    ]) {
      const value = settings[key] as { id?: string } | undefined;
      if (value?.id) ids.push(value.id);
    }
    const gallery = settings.background_slideshow_gallery;
    if (Array.isArray(gallery)) {
      for (const item of gallery) if (isMedia(item) && item.id) ids.push(item.id);
    }
    return ids;
  },
};
