import type { Device, Sheet } from '@cleitext/design';
import type { CxdBlock } from '@cleitext/plugin-sdk';
import { blockClass } from '../../lib/css';
import {
  border,
  borderDefaults,
  DEVICES,
  emit,
  numeric,
  px,
  suffix,
  typography,
  type Declarations,
} from '../../lib/emit';
import { Icon } from '../../lib/icons';
import type { Attrs, PrismaBlock, SpectraSource, ViewProps } from '../../lib/types';
import { typographyDefaults } from '../heading';

/**
 * Tabs: a list of titles (kept on the parent, `tabHeaders`) and one `tab`
 * child per title, shown one at a time. Ten layouts on desktop and tablet
 * (five horizontal, five vertical) and four stacked ones on phones.
 */

const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;

/** Margins and paddings of the titles and the body (`tabTitleTopMargin`, `tabBodyLeftPaddingTablet`…). */
function spacingDefaults(part: 'tabTitle' | 'tabBody'): Attrs {
  const out: Attrs = {};
  for (const kind of ['Margin', 'Padding'] as const) {
    for (const side of SIDES) {
      for (const s of ['', 'Tablet', 'Mobile']) out[`${part}${side}${kind}${s}`] = '';
    }
    out[`${part}${kind}Unit`] = 'px';
    out[`tablet${part}${kind}Unit`] = 'px';
    out[`mobile${part}${kind}Unit`] = 'px';
    out[`${part}${kind}Link`] = '';
  }
  // Older single values for both vertical and both horizontal sides.
  out[`${part}VertPadding`] = '';
  out[`${part}HrPadding`] = '';
  return out;
}

const TITLE_TYPOGRAPHY: Attrs = {
  ...typographyDefaults('title'),
  titleFontWeight: '500',
  titleFontStyle: '',
  titleLineHeightType: 'em',
  // Tablet and phone sizes take the desktop unit unless they have their own.
  titleFontSizeTypeTablet: '',
  titleFontSizeTypeMobile: '',
};

const DEFAULTS: Attrs = {
  tabHeaders: ['Tab 1', 'Tab 2', 'Tab 3'],
  tabAlign: 'left',
  tabActive: 0,
  tabActiveFrontend: 0,
  tabsStyleD: 'hstyle1',
  tabsStyleT: 'vstyle6',
  tabsStyleM: 'stack1',
  headerBgColor: '',
  headerTextColor: '',
  bodyBgColor: '',
  bodyTextColor: '',
  activeTabBgColor: '',
  activeTabTextColor: '',
  activeiconColor: '',
  ...spacingDefaults('tabTitle'),
  ...spacingDefaults('tabBody'),
  ...TITLE_TYPOGRAPHY,
  titleAlign: 'center',
  showIcon: false,
  icon: '',
  iconColor: '',
  iconSize: 16,
  iconSizeTablet: '',
  iconSizeMobile: '',
  iconPosition: 'left',
  iconSpacing: 10,
  iconSpacingTablet: '',
  iconSpacingMobile: '',
  borderWidth: 1,
  borderColor: '#e0e0e0',
  borderRadius: '',
  borderStyle: 'solid',
  ...borderDefaults('tab'),
};

/** Whether a value is set (Spectra's `isset` of a saved value). */
const set = (v: unknown) => v !== '' && v !== undefined && v !== null;

/**
 * The border of the titles and the body: the `tab` border, with the older
 * single width, radius, color and style filling what it leaves unset
 * (desktop only, as the pages it replaces).
 */
function tabBorder(a: Attrs, device: Device): Declarations {
  const current = border(a, 'tab', device);
  if (device !== 'desktop' || !('border-style' in current)) return current;
  const width = numeric(a.borderWidth) !== null ? px(a.borderWidth) : '';
  const radius = numeric(a.borderRadius) !== null ? px(a.borderRadius) : '';
  const filled = (key: string, fallback: string) =>
    current[key] || current[key] === 0 ? current[key] : fallback;
  return {
    'border-top-width': filled('border-top-width', width),
    'border-left-width': filled('border-left-width', width),
    'border-right-width': filled('border-right-width', width),
    'border-bottom-width': filled('border-bottom-width', width),
    'border-top-left-radius': filled('border-top-left-radius', radius),
    'border-top-right-radius': filled('border-top-right-radius', radius),
    'border-bottom-left-radius': filled('border-bottom-left-radius', radius),
    'border-bottom-right-radius': filled('border-bottom-right-radius', radius),
    'border-color': current['border-color'] || a.borderColor,
    'border-style': current['border-style'] || a.borderStyle,
  };
}

/** Fixed values first, the border after: a border value replaces the fixed one in place. */
const merged = (fixed: Declarations, b: Declarations): Declarations => ({ ...fixed, ...b });

const NO_BORDER: Declarations = { 'border-width': '0px', 'border-style': 'none' };
const NO_SIDES: Declarations = {
  'border-top-width': '0px',
  'border-right-width': '0px',
  'border-left-width': '0px',
  'border-top': 0,
  'border-left': 0,
  'border-right': 0,
  outline: 0,
  'border-radius': 0,
};
const NONE_AT_ALL: Declarations = {
  'border-top-width': '0px',
  'border-right-width': '0px',
  'border-left-width': '0px',
  'border-bottom-width': '0px',
  'border-top': 0,
  'border-left': 0,
  'border-right': 0,
  'border-bottom': 0,
  outline: 0,
  'border-radius': 0,
};

/**
 * Where each layout draws the border on a device (`.pr-tabs--<style>-<device>`):
 * on the titles, the body, the list or the whole block, with some sides removed.
 */
function styleBorders(
  sheet: Sheet,
  device: Device,
  B: string,
  style: string,
  O: Declarations,
): void {
  const R = `${B}.pr-tabs--${style}-${device}`;
  const tab = '.pr-tabs__tab';
  const active = '.pr-tabs__tab--active';
  const rules: [string, Declarations][] = [];
  switch (style) {
    case 'hstyle1':
    case 'stack1':
      rules.push([`${R} > .pr-tabs__panel ${tab}`, O], [`${R} > .pr-tabs__body`, O]);
      break;
    case 'hstyle2':
      rules.push(
        [`${R} > .pr-tabs__panel ${tab}`, NO_BORDER],
        [`${R} ul.pr-tabs__panel`, merged(NO_SIDES, O)],
        [`${R} > .pr-tabs__body`, NO_BORDER],
      );
      break;
    case 'hstyle3':
    case 'stack2':
      rules.push(
        [
          `${R} ${tab}`,
          merged(
            { 'border-bottom-width': '0px', 'border-bottom': 0, outline: 0, 'border-radius': 0 },
            O,
          ),
        ],
        [`${R} > .pr-tabs__body`, O],
      );
      break;
    case 'hstyle4':
    case 'vstyle9':
    case 'stack3':
      rules.push(
        [`${R} ${tab}`, merged({ 'border-radius': '30px' }, O)],
        [`${R} > .pr-tabs__body`, O],
      );
      break;
    case 'hstyle5':
    case 'stack4':
      rules.push(
        [R, O],
        [`${R} ${tab}`, NONE_AT_ALL],
        [`${R} ${tab}${active}`, merged(NO_SIDES, O)],
      );
      break;
    case 'vstyle6':
      rules.push(
        device === 'desktop'
          ? [`${R} ${tab}`, O]
          : device === 'tablet'
            ? [`${R} > .pr-tabs__panel ${tab}`, O]
            : [`${R} ${tab}`, O],
        [device === 'tablet' ? `${R} > .pr-tabs__body` : `${R} .pr-tabs__body`, O],
      );
      break;
    case 'vstyle7':
      rules.push([`${R} ${tab}`, merged(NO_SIDES, O)], [`${R} > .pr-tabs__body`, NO_BORDER]);
      break;
    case 'vstyle8':
      rules.push(
        [
          `${R} ${tab}`,
          merged(
            { 'border-right-width': '0px', 'border-right': 0, outline: 0, 'border-radius': 0 },
            O,
          ),
        ],
        [`${R} > .pr-tabs__body`, O],
      );
      break;
    case 'vstyle10':
      rules.push(
        [R, O],
        [`${R} ul.pr-tabs__panel ${tab}`, NO_BORDER],
        [`${R} .pr-tabs__body`, NO_BORDER],
        [
          `${R} ul.pr-tabs__panel ${tab}${active}`,
          merged(
            {
              'border-top-width': '0px',
              'border-bottom-width': '0px',
              'border-left-width': '0px',
              'border-top': 0,
              'border-left': 0,
              'border-bottom': 0,
              outline: 0,
              'border-radius': 0,
            },
            O,
          ),
        ],
      );
      break;
  }
  for (const [selector, declarations] of rules) emit(sheet, device, selector, declarations);
}

const STYLE_KEY: Record<Device, string> = {
  desktop: 'tabsStyleD',
  tablet: 'tabsStyleT',
  mobile: 'tabsStyleM',
};

/** The class part of a layout name (`hstyle1`, `vstyle6`, `stack2`). */
const styleName = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^(hstyle[1-5]|vstyle([6-9]|10)|stack[1-4])$/.test(v) ? v : fallback;

function sides(a: Attrs, part: string, kind: 'Margin' | 'Padding', device: Device): Declarations {
  const s = suffix(device);
  const unit = device === 'desktop' ? a[`${part}${kind}Unit`] : a[`${device}${part}${kind}Unit`];
  const prop = kind.toLowerCase();
  const out: Declarations = {};
  for (const side of SIDES) {
    let value = a[`${part}${side}${kind}${s}`];
    // On desktop, an unset padding takes the older vertical or horizontal one.
    if (device === 'desktop' && kind === 'Padding' && !set(value))
      value = a[`${part}${side === 'Top' || side === 'Bottom' ? 'Vert' : 'Hr'}Padding`];
    out[`${prop}-${side.toLowerCase()}`] = px(value, unit);
  }
  return out;
}

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-tabs`;
  const iconMargin: Record<string, string> = {
    left: 'margin-right',
    right: 'margin-left',
    bottom: 'margin-top',
    top: 'margin-bottom',
  };
  for (const device of DEVICES) {
    const s = suffix(device);
    const O = tabBorder(a, device);
    if (device === 'desktop') {
      emit(sheet, device, `${B} .pr-tabs__panel .pr-tabs__tab`, {
        background: a.headerBgColor,
        'text-align': a.titleAlign,
        ...O,
      });
      emit(sheet, device, `${B} .pr-tabs__panel .pr-tabs__tab .pr-tabs__link`, {
        'justify-content': a.titleAlign,
      });
    }
    emit(sheet, device, `${R} ul.pr-tabs__panel li.pr-tabs__tab a`, {
      ...sides(a, 'tabTitle', 'Padding', device),
      ...(device === 'desktop' ? { color: a.headerTextColor } : {}),
    });
    emit(
      sheet,
      device,
      `${R} ul.pr-tabs__panel li.pr-tabs__tab`,
      sides(a, 'tabTitle', 'Margin', device),
    );
    emit(sheet, device, `${R} .pr-tabs__body`, {
      ...(device === 'desktop' ? { background: a.bodyBgColor } : {}),
      ...sides(a, 'tabBody', 'Padding', device),
      ...sides(a, 'tabBody', 'Margin', device),
    });
    const iconSize = px(a[`iconSize${s}`]);
    emit(sheet, device, `${B} .pr-tabs__icon svg`, {
      height: iconSize,
      width: iconSize,
      ...(device === 'desktop' ? { fill: a.iconColor } : {}),
    });
    for (const [position, property] of Object.entries(iconMargin)) {
      emit(sheet, device, `${B} .pr-tabs__link--icon-${position} > .pr-tabs__icon`, {
        [property]: px(a[`iconSpacing${s}`]),
      });
    }
    emit(sheet, device, `${B} .pr-tabs__panel .pr-tabs__tab a`, typography(a, 'title', device));
    const fallback = DEFAULTS[STYLE_KEY[device]] as string;
    styleBorders(sheet, device, B, styleName(a[STYLE_KEY[device]], fallback), O);
  }
  emit(sheet, 'desktop', `${R} .pr-tabs__panel .pr-tabs__tab:hover`, {
    'border-color': a.tabBorderHColor,
  });
  emit(sheet, 'desktop', `${B} .pr-tabs__panel .pr-tabs__tab.pr-tabs__tab--active`, {
    background: a.activeTabBgColor,
  });
  emit(sheet, 'desktop', `${R} ul.pr-tabs__panel li.pr-tabs__tab.pr-tabs__tab--active a`, {
    color: a.activeTabTextColor,
  });
  emit(
    sheet,
    'desktop',
    `${B} .pr-tabs__panel .pr-tabs__tab.pr-tabs__tab--active .pr-tabs__icon svg`,
    {
      fill: a.activeiconColor,
    },
  );
  emit(sheet, 'desktop', `${R} .pr-tabs__body:hover`, { 'border-color': a.tabBorderHColor });
  emit(sheet, 'desktop', `${B} .pr-tabs__body p`, { color: a.bodyTextColor });
  emit(
    sheet,
    'desktop',
    `${B} ul.pr-tabs__panel`,
    a.tabAlign === 'left'
      ? { 'margin-right': 'auto', 'margin-left': 0 }
      : a.tabAlign === 'right'
        ? { 'margin-left': 'auto', 'margin-right': 0 }
        : { margin: 'auto' },
  );
  // The open tab before the script runs, and the one shown in the editor.
  const front = activeIndex(a.tabActiveFrontend, headers(a).length);
  emit(
    sheet,
    'desktop',
    `${R}:not(.pr-tabs--ready):not(.pr-tabs--editing) > .pr-tabs__body > .pr-tab--${front}`,
    {
      display: 'block',
    },
  );
  emit(
    sheet,
    'desktop',
    `${R}.pr-tabs--editing > .pr-tabs__body > .pr-tab--${activeIndex(a.tabActive, headers(a).length)}`,
    {
      display: 'block',
    },
  );
}

/** The tab titles, as plain text. */
export function headers(a: Attrs): string[] {
  return Array.isArray(a.tabHeaders) ? a.tabHeaders.map((h) => plainText(h)) : [];
}

/** A whole number between 0 and the last tab. */
function activeIndex(value: unknown, count: number): number {
  const n = Math.trunc(numeric(value) ?? 0);
  return Math.max(0, Math.min(n, Math.max(0, count - 1)));
}

/** Text of a title kept as HTML (older content) or as text. */
function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#8217;/g, '’')
    .trim();
}

const ICON_POSITIONS = new Set(['left', 'right', 'top', 'bottom']);

function View({ attrs: a, id, root, inner, editing }: ViewProps) {
  const titles = headers(a);
  const active = activeIndex(editing ? a.tabActive : a.tabActiveFrontend, titles.length);
  const position = ICON_POSITIONS.has(String(a.iconPosition)) ? String(a.iconPosition) : 'left';
  const align = ['left', 'center', 'right'].includes(String(a.tabAlign))
    ? String(a.tabAlign)
    : 'left';
  const icon =
    a.showIcon && a.icon ? (
      <span className="pr-tabs__icon">
        <Icon name={a.icon} />
      </span>
    ) : null;
  const key = blockClass(id).slice('pr-block-'.length);
  return root(
    'div',
    {
      className: [
        'wp-block-prisma-tabs',
        'pr-tabs',
        blockClass(id),
        `pr-tabs--${styleName(a.tabsStyleD, 'hstyle1')}-desktop`,
        `pr-tabs--${styleName(a.tabsStyleT, 'vstyle6')}-tablet`,
        `pr-tabs--${styleName(a.tabsStyleM, 'stack1')}-mobile`,
        editing ? 'pr-tabs--editing' : '',
      ]
        .filter(Boolean)
        .join(' '),
    },
    <>
      <ul
        className={`pr-tabs__panel pr-tabs__panel--align-${align}`}
        role="tablist"
        {...(editing ? {} : { 'data-pr-tabs': JSON.stringify({ active }) })}
      >
        {titles.map((title, i) => (
          <li
            key={i}
            className={`pr-tabs__tab${i === active ? ' pr-tabs__tab--active' : ''}`}
            role="none"
          >
            <a
              {...(editing ? {} : { href: `#pr-tabs-${key}-${i}`, id: `pr-tabs-${key}-${i}` })}
              className={`pr-tabs__link pr-tabs__link--icon-${position}`}
              role="tab"
              aria-selected={i === active}
              tabIndex={i === active ? 0 : -1}
            >
              {(position === 'left' || position === 'top') && icon}
              <div className="pr-tabs__title">{title}</div>
              {(position === 'right' || position === 'bottom') && icon}
            </a>
          </li>
        ))}
      </ul>
      {inner({ className: 'pr-tabs__body' })}
    </>,
  );
}

/** Spectra's tab titles: the attribute (HTML), else the saved list. */
function importHeaders(a: Attrs, src: SpectraSource): string[] {
  const fromText = (html: string) =>
    src
      .rich(html)
      .map((n) => ('children' in n ? n.children.map((c) => c.text).join('') : n.text))
      .join('')
      .trim();
  if (Array.isArray(a.tabHeaders)) return a.tabHeaders.map((h) => fromText(String(h ?? '')));
  const found: string[] = [];
  const list = /<ul\b[^>]*class="[^"]*\buagb-tabs__panel\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i.exec(
    src.html,
  );
  for (const link of (list?.[1] ?? '').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    // The title is the link's text block, beside the icon.
    const content = (link[1] ?? '').replace(
      /<span\b[^>]*class="[^"]*\buagb-tabs__icon\b[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
      '',
    );
    const title = /<(div|span|p)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(content);
    found.push(fromText(title?.[2] ?? content));
  }
  return found.length ? found : (DEFAULTS.tabHeaders as string[]);
}

/** Each child panel numbered by its place (the titles follow the same order). */
function numbered(children: CxdBlock[]): CxdBlock[] {
  return children.map((child, i) =>
    child.type === 'prisma/tab' ? { ...child, attrs: { ...child.attrs, id: i } } : child,
  );
}

export const tabs: PrismaBlock = {
  name: 'tabs',
  title: 'Tabs',
  description: 'Content under tabs: horizontal, vertical or stacked titles, with icons.',
  keywords: ['tabs', 'tab', 'panels', 'toggle'],
  container: true,
  allowedBlocks: ['prisma/tab'],
  defaults: DEFAULTS,
  css,
  View,
  script: { file: 'tabs.js', marker: 'data-pr-tabs' },
  spectra: {
    'uagb/tabs': (a, src) => {
      const tabHeaders = importHeaders(a, src);
      return [src.block('tabs', { ...a, tabHeaders }, numbered(src.children))];
    },
  },
};

// ---- Tab (one panel) -----------------------------------------------------------------------

/** Attributes of every block (visibility, animation) kept on import; the rest is the parent's. */
const KEPT =
  /^(blockId|id|anchor|className|hide(Desktop|Tablet|Mobile)|animation\w*|responsiveConditions)$/;

function TabView({ attrs: a, id, root }: ViewProps) {
  const n = Math.max(0, Math.trunc(numeric(a.id) ?? 0));
  return root(
    'div',
    { className: `wp-block-prisma-tab pr-tab pr-tab--${n} ${blockClass(id)}` },
    null,
    true,
  );
}

export const tab: PrismaBlock = {
  name: 'tab',
  title: 'Tab',
  description: 'The content of one tab.',
  keywords: ['tab', 'panel'],
  container: true,
  parent: ['tabs'],
  defaults: { id: 0 },
  css: () => {},
  View: TabView,
  spectra: {
    'uagb/tabs-child': (a, src) => [
      src.block(
        'tab',
        Object.fromEntries(Object.entries(a).filter(([k]) => KEPT.test(k))),
        src.children,
      ),
    ],
  },
};
