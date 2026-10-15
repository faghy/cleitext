/** Short builders for control definitions, so element files stay readable. */
import { UNITS } from './common.js';
import type { Control, ControlOption, GroupControl, Tab } from './model.js';

type Extra = Partial<Control>;

function make(type: Control['type'], tab: Tab) {
  return (name: string, label: string, section: string, extra: Extra = {}): Control => ({
    name,
    type,
    label,
    tab,
    section,
    ...extra,
  });
}

export const content = {
  text: make('text', 'content'),
  textarea: make('textarea', 'content'),
  richtext: make('richtext', 'content'),
  code: make('code', 'content'),
  number: make('number', 'content'),
  select: make('select', 'content'),
  choose: make('choose', 'content'),
  switch: make('switch', 'content'),
  slider: make('slider', 'content'),
  box: make('box', 'content'),
  media: make('media', 'content'),
  gallery: make('gallery', 'content'),
  url: make('url', 'content'),
  icon: make('icon', 'content'),
  date: make('date', 'content'),
  repeater: make('repeater', 'content'),
  heading: make('heading', 'content'),
  color: make('color', 'content'),
};

export const style = {
  text: make('text', 'style'),
  number: make('number', 'style'),
  select: make('select', 'style'),
  choose: make('choose', 'style'),
  switch: make('switch', 'style'),
  color: make('color', 'style'),
  slider: make('slider', 'style'),
  box: make('box', 'style'),
  heading: make('heading', 'style'),
  font: make('font', 'style'),
};

function group(type: GroupControl['type']) {
  return (
    name: string,
    label: string,
    section: string,
    selector: string,
    extra: Extra = {},
  ): Control => ({ name, type, label, tab: 'style', section, selector, ...extra }) as GroupControl;
}

export const groups = {
  typography: group('typography'),
  background: group('background'),
  border: group('border'),
  shadow: group('shadow'),
  textShadow: group('textShadow'),
  filters: group('filters'),
};

// ---- Common option lists -------------------------------------------------------------------

const ICON = {
  left: 'M4 6h16 M4 12h10 M4 18h13',
  center: 'M4 6h16 M7 12h10 M5.5 18h13',
  right: 'M4 6h16 M10 12h10 M7 18h13',
  justify: 'M4 6h16 M4 12h16 M4 18h16',
};

export const TEXT_ALIGN: ControlOption[] = [
  { value: 'left', label: 'Left', icon: ICON.left },
  { value: 'center', label: 'Center', icon: ICON.center },
  { value: 'right', label: 'Right', icon: ICON.right },
  { value: 'justify', label: 'Justified', icon: ICON.justify },
];

export const ALIGN: ControlOption[] = TEXT_ALIGN.slice(0, 3);

export const HEADING_TAGS: ControlOption[] = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div',
  'span',
  'p',
].map((tag) => ({ value: tag, label: tag.toUpperCase() }));

/** A text color with its typography, the most common style pair. */
export function textStyle(
  prefix: string,
  section: string,
  selector: string,
  extra: { hover?: boolean } = {},
): Control[] {
  return [
    style.color(`${prefix}color`, 'Color', section, {
      selectors: { [selector]: 'color: {{value}}' },
      ...(extra.hover ? { hover: true } : {}),
    }),
    groups.typography(`${prefix}typography`, 'Typography', section, selector),
  ];
}

/** Width, maximum width and height of a box, all per device. */
export function sizeControls(
  prefix: string,
  section: string,
  selector: string,
  tab: Tab = 'style',
): Control[] {
  const make2 = tab === 'style' ? style : content;
  return [
    make2.slider(`${prefix}width`, 'Width', section, {
      responsive: true,
      units: UNITS.length,
      max: 1600,
      selectors: { [selector]: 'width: {{value}}' },
    }),
    make2.slider(`${prefix}max_width`, 'Max width', section, {
      responsive: true,
      units: UNITS.length,
      max: 1600,
      selectors: { [selector]: 'max-width: {{value}}' },
    }),
    make2.slider(`${prefix}height`, 'Height', section, {
      responsive: true,
      units: UNITS.height,
      max: 1200,
      selectors: { [selector]: 'height: {{value}}' },
    }),
  ];
}
