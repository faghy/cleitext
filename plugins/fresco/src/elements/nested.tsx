/**
 * Nested widgets: Tabs, Accordion and Toggle. Their items are containers
 * (children), so any element can go inside; each child's `_title` is the
 * item's title, edited in the panel's Items list.
 */
import type { ReactNode } from 'react';
import {
  advancedControls,
  ElementRoot,
  hoverAnimationControl,
  hoverClass,
  textStrokeControls,
  UNITS,
} from '../core/common.js';
import { content, groups, HEADING_TAGS, style, textStyle } from '../core/controls.js';
import { Icon } from '../core/icons.js';
import type { Control, ElementDefinition, FrescoNode, NewNode } from '../core/model.js';
import { plainText } from '../core/sanitize.js';

const item = (title: string): NewNode => ({
  type: 'fresco/container',
  v: 1,
  attrs: { _title: title, content_width: 'full' },
  children: [],
});

/** Plain text of an item's elements (titles and texts), for the FAQ schema. */
function nodeText(node: FrescoNode | undefined): string {
  if (!node) return '';
  const own = ['title', 'content', 'text', 'description']
    .map((key) => node.attrs[key])
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.replace(/<[^>]*>/g, ' '));
  return [...own, ...(node.children ?? []).map(nodeText)].join(' ').replace(/\s+/g, ' ').trim();
}

const titleOf = (node: FrescoNode | undefined, index: number, word: string) =>
  plainText(node?.attrs._title) || `${word} ${index + 1}`;

/** Only containers go directly inside tabs and accordions. */
const onlyContainers = (type: string) => type === 'fresco/container';

// ---- Tabs -----------------------------------------------------------------------------

const TITLE = '{{el}} > .fr-tabs__nav > .fr-tabs__title';
const ACTIVE = '{{el}} > .fr-tabs__nav > .fr-tabs__title[aria-selected="true"]';
const HOVER = '{{el}} > .fr-tabs__nav > .fr-tabs__title:hover';

/** Where the titles go, as CSS variables of the tabs (fresco.css lays them out). */
const DIRECTIONS: Record<string, string> = {
  top: '--fr-tabs-flow: column; --fr-tabs-nav-flow: row; --fr-tabs-nav-flex: 0 1 auto; --fr-tabs-nav-bb: 1px; --fr-tabs-nav-bt: 0; --fr-tabs-line-y: -3px',
  bottom:
    '--fr-tabs-flow: column-reverse; --fr-tabs-nav-flow: row; --fr-tabs-nav-flex: 0 1 auto; --fr-tabs-nav-bb: 0; --fr-tabs-nav-bt: 1px; --fr-tabs-line-y: 3px',
  left: '--fr-tabs-flow: row; --fr-tabs-nav-flow: column; --fr-tabs-nav-flex: 0 0 25%; --fr-tabs-nav-bb: 0; --fr-tabs-nav-bt: 0; --fr-tabs-line-y: -3px',
  right:
    '--fr-tabs-flow: row-reverse; --fr-tabs-nav-flow: column; --fr-tabs-nav-flex: 0 0 25%; --fr-tabs-nav-bb: 0; --fr-tabs-nav-bt: 0; --fr-tabs-line-y: -3px',
};

const tabsControls: Control[] = [
  content.heading('items', 'Tabs', 'Tabs', { type: 'children' } as Partial<Control>),
  // Pages made before the per-device Direction: shown only when they use it.
  content.choose('direction', 'Position of the titles', 'Tabs', {
    default: 'top',
    options: [
      { value: 'top', label: 'Above', icon: 'M4 4h16v4H4z M4 10h16v10H4z' },
      { value: 'left', label: 'Left', icon: 'M4 4h5v16H4z M11 4h9v16h-9z' },
      { value: 'right', label: 'Right', icon: 'M15 4h5v16h-5z M4 4h9v16H4z' },
    ],
    condition: { direction: ['left', 'right'] },
    noCss: true,
  }),
  content.choose('tabs_direction', 'Direction', 'Tabs', {
    responsive: true,
    options: [
      { value: 'top', label: 'Above', icon: 'M4 4h16v4H4z M4 10h16v10H4z' },
      { value: 'bottom', label: 'Below', icon: 'M4 16h16v4H4z M4 4h16v10H4z' },
      { value: 'left', label: 'Left', icon: 'M4 4h5v16H4z M11 4h9v16h-9z' },
      { value: 'right', label: 'Right', icon: 'M15 4h5v16h-5z M4 4h9v16H4z' },
    ],
    dictionary: DIRECTIONS,
    selectors: { '{{el}}.fr-tabs': '{{value}}' },
  }),
  content.slider('tabs_width', 'Titles width', 'Tabs', {
    responsive: true,
    units: ['%', 'px', 'em', 'rem', 'vw'],
    max: 1000,
    help: 'With the titles on the left or on the right.',
    selectors: { '{{el}}.fr-tabs > .fr-tabs__nav': 'flex-basis: {{value}}' },
  }),
  content.choose('justify', 'Justify titles', 'Tabs', {
    responsive: true,
    options: [
      { value: 'flex-start', label: 'Start', icon: 'M4 4v16 M8 9h4v6H8z' },
      { value: 'center', label: 'Center', icon: 'M12 4v16 M7 9h3v6H7z M14 9h3v6h-3z' },
      { value: 'flex-end', label: 'End', icon: 'M20 4v16 M12 9h4v6h-4z' },
      { value: 'stretch', label: 'Stretch', icon: 'M4 4v16 M20 4v16 M7 9h10v6H7z' },
    ],
    selectors: {
      '{{el}} > .fr-tabs__nav': 'justify-content: {{value}}',
      '{{el}} > .fr-tabs__nav > .fr-tabs__title': 'flex-grow: 0',
    },
    noCss: true,
  }),
  content.choose('title_align', 'Align title', 'Tabs', {
    responsive: true,
    options: [
      { value: 'start', label: 'Start', icon: 'M4 6h16 M4 12h10 M4 18h13' },
      { value: 'center', label: 'Center', icon: 'M4 6h16 M7 12h10 M5.5 18h13' },
      { value: 'end', label: 'End', icon: 'M4 6h16 M10 12h10 M7 18h13' },
    ],
    dictionary: {
      start: 'text-align: start; justify-content: flex-start',
      center: 'text-align: center; justify-content: center',
      end: 'text-align: end; justify-content: flex-end',
    },
    selectors: { [TITLE]: '{{value}}' },
  }),
  content.select('mobile', 'Breakpoint', 'Tabs', {
    default: 'accordion',
    // From which device down the tabs show as an accordion (Mobile by default).
    options: [
      { value: 'laptop', label: 'Accordion from Laptop' },
      { value: 'tablet_extra', label: 'Accordion from Tablet extra' },
      { value: 'tablet', label: 'Accordion from Tablet' },
      { value: 'mobile_extra', label: 'Accordion from Mobile extra' },
      { value: 'accordion', label: 'Accordion on Mobile' },
      { value: 'tabs', label: 'Keep tabs' },
    ],
    noCss: true,
  }),
  content.switch('horizontal_scroll', 'Horizontal scroll', 'Tabs', {
    help: 'Titles that do not fit stay on one line and scroll sideways.',
    noCss: true,
  }),
  content.choose('icon_position', 'Icon position', 'Tabs', {
    responsive: true,
    options: [
      { value: 'top', label: 'Above', icon: 'M9 3h6v6H9z M6 15h12' },
      { value: 'right', label: 'After', icon: 'M14 8h6v8h-6z M4 12h7' },
      { value: 'bottom', label: 'Below', icon: 'M9 15h6v6H9z M6 9h12' },
      { value: 'left', label: 'Before', icon: 'M4 8h6v8H4z M13 12h7' },
    ],
    dictionary: { top: 'column', right: 'row-reverse', bottom: 'column-reverse', left: 'row' },
    help: 'Each tab’s icon is set in its own settings (Tab icon).',
    selectors: { [TITLE]: 'flex-direction: {{value}}' },
  }),
  style.slider('title_gap', 'Space between titles', 'Titles', {
    responsive: true,
    units: ['px', 'em'],
    max: 60,
    selectors: { '{{el}} > .fr-tabs__nav': 'gap: {{value}}' },
  }),
  style.slider('nav_gap', 'Space before the content', 'Titles', {
    responsive: true,
    units: ['px', 'em'],
    max: 60,
    selectors: { '{{el}}': 'gap: {{value}}' },
  }),
  groups.typography(
    'title_typography',
    'Typography',
    'Titles',
    '{{el}} > .fr-tabs__nav > .fr-tabs__title',
  ),
  style.color('title_color', 'Text color', 'Titles', {
    hover: true,
    selectors: { '{{el}} > .fr-tabs__nav > .fr-tabs__title': 'color: {{value}}' },
  }),
  style.color('title_bg', 'Background', 'Titles', {
    hover: true,
    selectors: { '{{el}} > .fr-tabs__nav > .fr-tabs__title': 'background-color: {{value}}' },
  }),
  style.color('active_color', 'Active text color', 'Titles', {
    selectors: {
      '{{el}} > .fr-tabs__nav > .fr-tabs__title[aria-selected="true"]': 'color: {{value}}',
    },
  }),
  style.color('active_bg', 'Active background', 'Titles', {
    selectors: {
      '{{el}} > .fr-tabs__nav > .fr-tabs__title[aria-selected="true"]':
        'background-color: {{value}}',
    },
  }),
  style.color('active_line', 'Active underline', 'Titles', {
    selectors: {
      '{{el}} > .fr-tabs__nav > .fr-tabs__title[aria-selected="true"]':
        'box-shadow: inset 0 -3px 0 {{value}}',
    },
  }),
  style.box('title_padding', 'Padding', 'Titles', {
    responsive: true,
    units: UNITS.box,
    selectors: {
      '{{el}} > .fr-tabs__nav > .fr-tabs__title': 'padding: {{top}} {{right}} {{bottom}} {{left}}',
    },
  }),
  groups.border('title_border', 'Border', 'Titles', '{{el}} > .fr-tabs__nav > .fr-tabs__title'),
  groups.border('title_border_hover', 'Border on hover', 'Titles', HOVER),
  groups.border('title_border_active', 'Active border', 'Titles', ACTIVE),
  groups.shadow('title_box_shadow', 'Box shadow', 'Titles', TITLE),
  groups.shadow('title_box_shadow_hover', 'Box shadow on hover', 'Titles', HOVER),
  groups.shadow('title_box_shadow_active', 'Active box shadow', 'Titles', ACTIVE),
  groups.textShadow('title_text_shadow', 'Text shadow', 'Titles', TITLE),
  groups.textShadow('title_text_shadow_hover', 'Text shadow on hover', 'Titles', HOVER),
  groups.textShadow('title_text_shadow_active', 'Active text shadow', 'Titles', ACTIVE),
  ...textStrokeControls('title_stroke', 'Titles', TITLE),
  style.slider('title_hover_transition', 'Transition duration (s)', 'Titles', {
    units: ['s'],
    max: 3,
    step: 0.1,
    selectors: { [TITLE]: 'transition-duration: {{value}}' },
  }),
  hoverAnimationControl('Titles'),
  style.slider('icon_size', 'Size', 'Icon', {
    responsive: true,
    units: ['px', 'em', 'rem'],
    max: 100,
    selectors: { [`${TITLE} > .fr-tabs__icon`]: 'font-size: {{value}}' },
  }),
  style.slider('icon_spacing', 'Spacing', 'Icon', {
    responsive: true,
    units: ['px', 'em', 'rem'],
    max: 100,
    selectors: { [TITLE]: 'gap: {{value}}' },
  }),
  style.color('icon_color', 'Color', 'Icon', {
    selectors: { [`${TITLE} > .fr-tabs__icon`]: 'color: {{value}}' },
  }),
  style.color('icon_hover_color', 'Color on hover', 'Icon', {
    selectors: { [`${HOVER} > .fr-tabs__icon`]: 'color: {{value}}' },
  }),
  style.color('icon_active_color', 'Active color', 'Icon', {
    selectors: { [`${ACTIVE} > .fr-tabs__icon`]: 'color: {{value}}' },
  }),
  style.color('panel_bg', 'Background', 'Content', {
    selectors: { '{{el}} > .fr-tabs__panels': 'background-color: {{value}}' },
  }),
  style.box('panel_padding', 'Padding', 'Content', {
    responsive: true,
    units: UNITS.box,
    selectors: { '{{el}} > .fr-tabs__panels': 'padding: {{top}} {{right}} {{bottom}} {{left}}' },
  }),
  groups.border('panel_border', 'Border', 'Content', '{{el}} > .fr-tabs__panels'),
  groups.shadow('panel_shadow', 'Box shadow', 'Content', '{{el}} > .fr-tabs__panels'),
  ...advancedControls(),
];

/** A tab's title: its text, with its icons when the item has some (`_icon`, `_icon_active`). */
function tabTitle(child: FrescoNode | undefined, i: number): ReactNode {
  const text = titleOf(child, i, 'Tab');
  const icon = child?.attrs._icon;
  if (!icon) return text;
  const active = child?.attrs._icon_active;
  return (
    <>
      <span className="fr-tabs__icon" aria-hidden="true">
        <Icon value={icon} />
      </span>
      {active ? (
        <span className="fr-tabs__icon fr-tabs__icon--active" aria-hidden="true">
          <Icon value={active} />
        </span>
      ) : null}
      <span className="fr-tabs__text">{text}</span>
    </>
  );
}

/** Classes of a title with icons. */
const iconClasses = (child: FrescoNode | undefined) =>
  child?.attrs._icon
    ? ` fr-tabs__title--icon${child.attrs._icon_active ? ' fr-tabs__title--active-icon' : ''}`
    : '';

export const tabs: ElementDefinition = {
  type: 'fresco/tabs',
  title: 'Tabs',
  icon: 'M3 8h18v12H3z M3 8V5h6v3 M9 5h6v3',
  category: 'general',
  keywords: ['tabs', 'switch', 'panels'],
  container: true,
  accepts: onlyContainers,
  itemsLabel: 'Tab',
  controls: tabsControls,
  handler: 'tabs',
  create: () => ({
    type: 'fresco/tabs',
    v: 1,
    attrs: {},
    children: [item('Tab 1'), item('Tab 2'), item('Tab 3')],
  }),
  render({ node, settings, items, context }) {
    const kids = node.children ?? [];
    const active = Math.min(context.ui?.active(node.id) ?? 0, Math.max(0, kids.length - 1));
    // The per-device Direction (CSS variables), else the old one.
    const own = ['top', 'bottom', 'left', 'right'].includes(settings.tabs_direction as string)
      ? String(settings.tabs_direction)
      : null;
    const direction =
      own ??
      (['left', 'right'].includes(settings.direction as string)
        ? String(settings.direction)
        : 'top');
    const scroll = settings.horizontal_scroll === true ? ' fr-tabs--scroll' : '';
    const hover = hoverClass(settings.hover_effect);
    const justify = ['center', 'flex-end', 'stretch'].includes(settings.justify as string)
      ? ` fr-tabs--${String(settings.justify)}`
      : '';
    const accordion =
      settings.mobile === 'tabs'
        ? ''
        : ['laptop', 'tablet_extra', 'tablet', 'mobile_extra'].includes(settings.mobile as string)
          ? ` fr-tabs--accordion fr-tabs--accordion-${String(settings.mobile)}`
          : ' fr-tabs--accordion';
    const base = `fr-t-${node.id}`;
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={`fr-tabs fr-tabs--${direction}${justify}${accordion}${scroll}`}
        editing={context.editing}
        extra={{ 'data-fr-handler': 'tabs' }}
      >
        <div className="fr-tabs__nav" role="tablist">
          {kids.map((child, i) => (
            <button
              key={child.id}
              type="button"
              role="tab"
              id={`${base}-t${i}`}
              className={`fr-tabs__title${iconClasses(child)}${hover}`}
              aria-selected={i === active}
              aria-controls={`${base}-p${i}`}
              tabIndex={i === active ? 0 : -1}
              data-fr-tab={i}
            >
              {tabTitle(child, i)}
            </button>
          ))}
        </div>
        <div className="fr-tabs__panels">
          {(items ?? []).map((itemNode, i) => (
            <div
              key={kids[i]?.id ?? i}
              className="fr-tabs__panel"
              role="tabpanel"
              id={`${base}-p${i}`}
              aria-labelledby={`${base}-t${i}`}
              hidden={i !== active}
            >
              {/* On narrow screens the titles move above their panel (accordion). */}
              <button
                type="button"
                className={`fr-tabs__mobile-title${iconClasses(kids[i])}`}
                data-fr-tab={i}
                aria-expanded={i === active}
              >
                {tabTitle(kids[i], i)}
              </button>
              {itemNode}
            </div>
          ))}
        </div>
      </ElementRoot>
    );
  },
};

// ---- Accordion and Toggle -------------------------------------------------------------------

function accordionControls(multiple: boolean): Control[] {
  return [
    content.heading('items', 'Items', 'Items', { type: 'children' } as Partial<Control>),
    content.select('open', 'Open at first', 'Items', {
      default: multiple ? 'none' : 'first',
      options: [
        { value: 'first', label: 'The first item' },
        { value: 'none', label: 'None' },
        { value: 'all', label: 'All' },
      ],
      noCss: true,
    }),
    content.switch('multiple', 'Several open at once', 'Items', { default: multiple, noCss: true }),
    content.select('title_tag', 'Title HTML tag', 'Items', {
      default: 'div',
      options: HEADING_TAGS,
      noCss: true,
    }),
    content.icon('icon', 'Icon', 'Items', { default: { set: 'solid', name: 'plus' } }),
    content.icon('icon_open', 'Icon when open', 'Items', {
      default: { set: 'solid', name: 'minus' },
    }),
    content.choose('icon_position', 'Icon position', 'Items', {
      default: 'end',
      options: [
        { value: 'start', label: 'Start' },
        { value: 'end', label: 'End' },
      ],
      noCss: true,
    }),
    content.choose('title_align', 'Item position', 'Items', {
      responsive: true,
      options: [
        { value: 'start', label: 'Start', icon: 'M4 4v16 M8 9h8v6H8z' },
        { value: 'center', label: 'Center', icon: 'M12 4v16 M7 9h10v6H7z' },
        { value: 'end', label: 'End', icon: 'M20 4v16 M8 9h8v6H8z' },
        { value: 'stretch', label: 'Stretch', icon: 'M4 4v16 M20 4v16 M7 9h10v6H7z' },
      ],
      dictionary: {
        start: 'justify-content: flex-start; --fr-acc-grow: 0',
        center: 'justify-content: center; --fr-acc-grow: 0',
        end: 'justify-content: flex-end; --fr-acc-grow: 0',
        stretch: 'justify-content: space-between; --fr-acc-grow: 1',
      },
      selectors: { '{{el}} .fr-acc__title': '{{value}}' },
    }),
    content.number('animation_duration', 'Animation duration (ms)', 'Items', {
      min: 0,
      max: 3000,
      step: 50,
      help: 'How long an item takes to open and close (in browsers that can animate it).',
      selectors: { '{{el}} .fr-acc__item': '--fr-acc-duration: {{value}}ms' },
    }),
    content.switch('faq', 'FAQ schema', 'Items', {
      help: 'Tells search engines that the items are questions and answers.',
      noCss: true,
    }),
    style.slider('item_gap', 'Space between items', 'Items', {
      responsive: true,
      units: ['px', 'em'],
      max: 60,
      selectors: { '{{el}} > .fr-acc': 'gap: {{value}}' },
    }),
    groups.border('item_border', 'Border', 'Items', '{{el}} .fr-acc__item'),
    ...textStyle('title_', 'Title', '{{el}} .fr-acc__title', { hover: true }),
    groups.textShadow('title_text_shadow', 'Text shadow', 'Title', '{{el}} .fr-acc__title'),
    groups.textShadow(
      'title_open_text_shadow',
      'Text shadow when open',
      'Title',
      '{{el}} .fr-acc__item[open] > .fr-acc__title',
    ),
    ...textStrokeControls('title_stroke', 'Title', '{{el}} .fr-acc__title'),
    groups.border('title_border', 'Border', 'Title', '{{el}} .fr-acc__title'),
    groups.border('title_border_hover', 'Border on hover', 'Title', '{{el}} .fr-acc__title:hover'),
    groups.border(
      'title_border_open',
      'Border when open',
      'Title',
      '{{el}} .fr-acc__item[open] > .fr-acc__title',
    ),
    style.slider('title_hover_transition', 'Transition duration (s)', 'Title', {
      units: ['s'],
      max: 3,
      step: 0.1,
      selectors: {
        '{{el}} .fr-acc__title':
          'transition: color {{value}}, background-color {{value}}, border-color {{value}}',
      },
    }),
    style.color('title_bg', 'Background', 'Title', {
      hover: true,
      selectors: { '{{el}} .fr-acc__title': 'background-color: {{value}}' },
    }),
    style.color('title_open_color', 'Text color when open', 'Title', {
      selectors: { '{{el}} .fr-acc__item[open] > .fr-acc__title': 'color: {{value}}' },
    }),
    style.color('title_open_bg', 'Background when open', 'Title', {
      selectors: { '{{el}} .fr-acc__item[open] > .fr-acc__title': 'background-color: {{value}}' },
    }),
    style.box('title_padding', 'Padding', 'Title', {
      responsive: true,
      units: UNITS.box,
      selectors: { '{{el}} .fr-acc__title': 'padding: {{top}} {{right}} {{bottom}} {{left}}' },
    }),
    style.color('icon_color', 'Icon color', 'Title', {
      selectors: { '{{el}} .fr-acc__icon': 'color: {{value}}' },
    }),
    style.slider('icon_size', 'Icon size', 'Title', {
      units: ['px', 'em'],
      max: 60,
      selectors: { '{{el}} .fr-acc__icon': 'font-size: {{value}}' },
    }),
    style.color('icon_hover_color', 'Icon color on hover', 'Title', {
      selectors: { '{{el}} .fr-acc__title:hover .fr-acc__icon': 'color: {{value}}' },
    }),
    style.color('icon_open_color', 'Icon color when open', 'Title', {
      selectors: {
        '{{el}} .fr-acc__item[open] > .fr-acc__title .fr-acc__icon': 'color: {{value}}',
      },
    }),
    style.slider('icon_spacing', 'Icon spacing', 'Title', {
      responsive: true,
      units: ['px', 'em', 'rem'],
      max: 100,
      selectors: { '{{el}} .fr-acc__title': 'gap: {{value}}' },
    }),
    style.color('content_bg', 'Background', 'Content', {
      selectors: { '{{el}} .fr-acc__body': 'background-color: {{value}}' },
    }),
    style.box('content_padding', 'Padding', 'Content', {
      responsive: true,
      units: UNITS.box,
      selectors: { '{{el}} .fr-acc__body': 'padding: {{top}} {{right}} {{bottom}} {{left}}' },
    }),
    groups.border('content_border', 'Border', 'Content', '{{el}} .fr-acc__body'),
    ...advancedControls(),
  ];
}

function accordion(type: string, title: string, multiple: boolean): ElementDefinition {
  return {
    type,
    title,
    icon: multiple
      ? 'M4 5h16v4H4z M4 11h16v4H4z M4 17h16v2H4z'
      : 'M4 4h16v5H4z M4 11h16v9H4z M17 6.5h.01',
    category: 'general',
    keywords: ['accordion', 'toggle', 'faq', 'collapse'],
    container: true,
    accepts: onlyContainers,
    itemsLabel: 'Item',
    controls: accordionControls(multiple),
    handler: 'accordion',
    create: () => ({
      type,
      v: 1,
      attrs: {},
      children: [item('Item 1'), item('Item 2'), item('Item 3')],
    }),
    render({ node, settings, items, context }) {
      const kids = node.children ?? [];
      const Tag = (
        HEADING_TAGS.some((t) => t.value === settings.title_tag) ? settings.title_tag : 'div'
      ) as 'div';
      const open = String(settings.open ?? 'first');
      const active = context.editing
        ? (context.ui?.active(node.id) ?? (open === 'none' ? -1 : 0))
        : -1;
      const icon = (value: unknown, cls: string): ReactNode =>
        value ? (
          <span className={`fr-acc__icon ${cls}`} aria-hidden="true">
            <Icon value={value} />
          </span>
        ) : null;
      const start = settings.icon_position === 'start';
      const faq =
        settings.faq === true && !context.editing ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: kids.map((child, i) => ({
                  '@type': 'Question',
                  name: titleOf(child, i, 'Item'),
                  acceptedAnswer: { '@type': 'Answer', text: nodeText(child) },
                })),
              }).replace(/</g, '\\u003c'),
            }}
          />
        ) : null;
      return (
        <ElementRoot
          node={node}
          settings={settings}
          name={`fr-accordion${Number(settings.animation_duration) > 0 ? ' fr-acc--animated' : ''}`}
          editing={context.editing}
        >
          <div className="fr-acc">
            {(items ?? []).map((itemNode, i) => {
              const isOpen = context.editing
                ? i === active || open === 'all'
                : open === 'all' || (open === 'first' && i === 0);
              return (
                <details
                  key={kids[i]?.id ?? i}
                  className="fr-acc__item"
                  open={isOpen}
                  {...(settings.multiple === true ? {} : { name: `fr-acc-${node.id}` })}
                >
                  <summary className="fr-acc__title" data-fr-tab={i}>
                    {start && icon(settings.icon, 'fr-acc__icon--closed')}
                    {start && icon(settings.icon_open, 'fr-acc__icon--open')}
                    <Tag className="fr-acc__label">{titleOf(kids[i], i, 'Item')}</Tag>
                    {!start && icon(settings.icon, 'fr-acc__icon--closed')}
                    {!start && icon(settings.icon_open, 'fr-acc__icon--open')}
                  </summary>
                  <div className="fr-acc__body">{itemNode}</div>
                </details>
              );
            })}
          </div>
          {faq}
        </ElementRoot>
      );
    },
  };
}

export const accordionWidget = accordion('fresco/accordion', 'Accordion', false);
export const toggleWidget = accordion('fresco/toggle', 'Toggle', true);
