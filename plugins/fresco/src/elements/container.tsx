import { advancedControls, ElementRoot, UNITS } from '../core/common.js';
import { content, groups, style } from '../core/controls.js';
import { linkProps } from '../core/links.js';
import type { Control, ElementDefinition } from '../core/model.js';

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
      // The width is the basis in a row; in a column (e.g. stacked on mobile) it stays a width.
      '{{el}}': 'width: {{value}}; flex: 0 0 auto',
    },
  }),
  content.slider('min_height', 'Minimum height', 'Container', {
    responsive: true,
    units: UNITS.height,
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
  content.number('grid_columns', 'Columns', 'Items', {
    responsive: true,
    default: 3,
    min: 1,
    max: 12,
    condition: { container_type: 'grid' },
    selectors: { [IN]: 'grid-template-columns: repeat({{value}}, minmax(0, 1fr))' },
  }),
  content.number('grid_rows', 'Rows', 'Items', {
    responsive: true,
    min: 1,
    max: 12,
    condition: { container_type: 'grid' },
    selectors: { [IN]: 'grid-template-rows: repeat({{value}}, auto)' },
  }),
  content.select('grid_flow', 'Auto flow', 'Items', {
    responsive: true,
    options: [
      { value: 'row', label: 'Row' },
      { value: 'column', label: 'Column' },
      { value: 'row dense', label: 'Row, dense' },
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
  content.slider('gap', 'Gap', 'Items', {
    responsive: true,
    units: ['px', '%', 'em', 'rem'],
    max: 200,
    help: 'Empty: the gap set in Site settings.',
    selectors: { [IN]: 'gap: {{value}}' },
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
    ],
    selectors: { '{{el}}': 'overflow: {{value}}' },
  }),
  groups.background('background', 'Background', 'Background', '{{el}}'),
  groups.background('background_hover', 'Background on hover', 'Background', '{{el}}:hover'),
  style.color('overlay_color', 'Overlay color', 'Background overlay', {
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
  groups.border('border', 'Border', 'Border', '{{el}}'),
  groups.shadow('shadow', 'Box shadow', 'Border', '{{el}}'),
  ...advancedControls({ container: true }),
];

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
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={name}
        editing={context.editing}
        tag={tag === 'a' && !link ? 'div' : tag}
        extra={link ? { href: link.href, target: link.target, rel: link.rel } : undefined}
      >
        <div className="fr-container__in">
          {children}
          {empty && context.editing ? <div className="fr-empty" data-fr-empty="" /> : null}
        </div>
      </ElementRoot>
    );
  },
  media: (settings) => {
    const ids: string[] = [];
    for (const key of ['background_image', 'background_hover_image']) {
      const value = settings[key] as { id?: string } | undefined;
      if (value?.id) ids.push(value.id);
    }
    return ids;
  },
};
