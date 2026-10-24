/**
 * What an Elementor site keeps outside its pages: the kit (global colors and
 * fonts, layout, theme style), the Theme Builder's templates with their
 * conditions, popups with their triggers, custom code and custom fonts.
 * They become Fresco's kit, Fresco Pro's templates (`fresco_template`
 * entries) and Fresco Pro's site settings.
 */
import {
  atomicClasses,
  atomicVariables,
  type ElementorKitInfo,
  asSettings,
  DEVICE_NAMES,
  box,
  colorOf,
  cssLength,
  globalId,
  globalRef,
  lineSize,
  list,
  num,
  size,
  str,
  yes,
  type Notes,
  type Settings,
  type SizeValue,
} from '@cleitext/blocks/elementor';

// ---- Kit ----------------------------------------------------------------------------------

/** Fonts every system has: not loaded from Google Fonts. */
const SYSTEM_FONTS = new Set([
  'arial',
  'helvetica',
  'georgia',
  'times new roman',
  'times',
  'verdana',
  'trebuchet ms',
  'tahoma',
  'courier new',
  'courier',
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'inherit',
  'impact',
  'palatino',
  'garamond',
  'lucida grande',
  'segoe ui',
]);

/** Fresco's own title selector (kept when the kit adds the old theme's). */
const FRESCO_TITLE_SELECTOR =
  'h1.entry-title, .entry-title, .page-title, .entry-header h1, main h1:first-of-type';

export interface KitResult {
  /** A partial Fresco kit (for the `fresco` plugin data). */
  kit: Settings;
  /** What the conversion of pages needs. */
  info: ElementorKitInfo;
  /** Site CSS of the kit (Fresco Pro). */
  css: string;
}

/** A color or font id as Fresco's kit keeps it (`primary_hover` → `primary-hover`). */
const fontId = globalId;

/** Elementor's device suffixes → the devices of Fresco's kit (desktop has none). */
const KIT_DEVICES: [string, string][] = [
  ['_widescreen', 'widescreen'],
  ['_laptop', 'laptop'],
  ['_tablet_extra', 'tablet_extra'],
  ['_tablet', 'tablet'],
  ['_mobile_extra', 'mobile_extra'],
  ['_mobile', 'mobile'],
];

const keywordOf = (value: unknown) => (/^[a-z-]{1,30}$/.test(str(value)) ? str(value) : undefined);

/**
 * An Elementor typography (`<prefix>_font_family`, `_font_size`…, per
 * device) → the values of a Fresco kit font or text style: family, weight,
 * size, line height, letter and word spacing, transform, style, decoration,
 * and the sizes and spacing of the other devices.
 */
function kitTypography(t: Settings, prefix: string, notes: Notes): Settings {
  const out: Settings = {};
  const put = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  };
  put('family', str(t[`${prefix}_font_family`]).trim() || undefined);
  const weight = str(t[`${prefix}_font_weight`]);
  put('weight', /^([1-9]00|normal|bold)$/.test(weight) ? weight : undefined);
  put('size', size(t[`${prefix}_font_size`], notes));
  put('line', lineSize(t[`${prefix}_line_height`], notes));
  put('letter', size(t[`${prefix}_letter_spacing`], notes));
  put('word', size(t[`${prefix}_word_spacing`], notes));
  put('transform', keywordOf(t[`${prefix}_text_transform`]));
  put('style', keywordOf(t[`${prefix}_font_style`]));
  put('decoration', keywordOf(t[`${prefix}_text_decoration`]));
  const devices: Settings = {};
  for (const [suffix, device] of KIT_DEVICES) {
    const d: Settings = {};
    const deviceSize = size(t[`${prefix}_font_size${suffix}`], notes);
    if (deviceSize) d.size = deviceSize;
    const line = lineSize(t[`${prefix}_line_height${suffix}`], notes);
    if (line) d.line = line;
    const letter = size(t[`${prefix}_letter_spacing${suffix}`], notes);
    if (letter) d.letter = letter;
    const word = size(t[`${prefix}_word_spacing${suffix}`], notes);
    if (word) d.word = word;
    if (Object.keys(d).length) devices[device] = d;
  }
  if (Object.keys(devices).length) out.devices = devices;
  return out;
}

/** Whether a family should be loaded from Google Fonts. */
export const isWebFont = (family: string, custom: ReadonlySet<string>): boolean =>
  Boolean(family) &&
  !SYSTEM_FONTS.has(family.toLowerCase()) &&
  !custom.has(family.toLowerCase()) &&
  /^[A-Za-z0-9][\w ]{0,59}$/.test(family);

/** One side of a box as a size (Fresco's theme style has single values). */
const side = (value: unknown): SizeValue | undefined => {
  const b = box(value);
  if (!b) return undefined;
  const n = [b.top, b.right, b.bottom, b.left].find((s) => s !== '');
  return typeof n === 'number' ? { size: n, unit: b.unit } : undefined;
};

/** Elementor's kit settings (`_elementor_page_settings` of the kit) → Fresco's kit. */
export function kitToFresco(
  settings: Settings,
  extra: { classes?: unknown; variables?: unknown },
  notes: Notes & { font(family: string): void },
): KitResult {
  const kit: Settings = {};
  const info: ElementorKitInfo = {};
  // Global colors: the four system ones keep their ids (Fresco has the same).
  const colors = [...list(settings.system_colors), ...list(settings.custom_colors)]
    .map((c) => ({
      id: fontId(str(c._id)),
      title: str(c.title) || str(c._id),
      value: str(c.color),
    }))
    .filter((c) => c.id && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(c.value));
  if (colors.length) kit.colors = colors;
  // Global fonts, with what each one sets (a global font on an element gives those values).
  const withLine: string[] = [];
  const parts: Record<string, string[]> = {};
  const fonts = [...list(settings.system_typography), ...list(settings.custom_typography)]
    .map((t) => {
      const id = fontId(str(t._id));
      const { family, weight, ...rest } = kitTypography(t, 'typography', notes);
      if (family) notes.font(str(family));
      if (rest.line) withLine.push(id);
      // What Elementor gives from it: its values on desktop.
      parts[id] = [
        ...(family ? ['family'] : []),
        ...(weight ? ['weight'] : []),
        ...Object.keys(rest).filter((key) => key !== 'devices'),
      ];
      return {
        id,
        title: str(t.title) || id,
        family: str(family),
        weight: str(weight) || '400',
        ...rest,
      };
    })
    .filter((f) => f.id);
  if (fonts.length) kit.fonts = fonts;
  info.fontsWithLine = withLine;
  info.fonts = Object.fromEntries(fonts.map((f) => [f.id, parts[f.id]!]));
  // Breakpoints: max widths (recent kits), or the old min widths (tablet = lg - 1).
  const tablet =
    num(settings.viewport_tablet) ??
    (num(settings.viewport_lg) !== null ? num(settings.viewport_lg)! - 1 : null);
  const mobile =
    num(settings.viewport_mobile) ??
    (num(settings.viewport_md) !== null ? num(settings.viewport_md)! - 1 : null);
  // The extra devices, when the kit has them on (Elementor's defaults when it has no value).
  const active = Array.isArray(settings.active_breakpoints)
    ? (settings.active_breakpoints as unknown[]).map(str)
    : [];
  const optional: Settings = {};
  for (const [name, fallback] of EXTRA_BREAKPOINTS) {
    if (active.includes(`viewport_${name}`))
      optional[name] = Math.round(num(settings[`viewport_${name}`]) ?? fallback);
  }
  if (tablet !== null || mobile !== null || Object.keys(optional).length) {
    kit.breakpoints = {
      tablet: Math.round(tablet ?? 1024),
      mobile: Math.round(mobile ?? 767),
      ...optional,
    };
  }
  const width = size(settings.container_width, notes);
  if (width) kit.containerWidth = width;
  const gap = asSettings(settings.space_between_widgets);
  const gapSize = num(gap.column) ?? num(gap.size);
  if (gapSize !== null)
    kit.gap = { size: gapSize, unit: str(gap.unit) === 'custom' ? 'px' : str(gap.unit) || 'px' };
  const padding = box(settings.container_padding, notes);
  if (padding) info.containerPadding = padding;
  // Page background and the colors of texts and links.
  const style: Settings = {};
  if (str(settings.body_background_background) === 'classic') {
    const bg = colorOf(settings, 'body_background_color');
    if (bg) style.background = bg;
  }
  const text = colorOf(settings, 'body_color');
  if (text) style.text = text;
  const linkColor = colorOf(settings, 'link_normal_color');
  if (linkColor) style.link = linkColor;
  const linkHover = colorOf(settings, 'link_hover_color');
  if (linkHover) style.linkHover = linkHover;
  if (Object.keys(style).length) kit.style = style;
  // Theme style: texts, buttons, images, form fields, lightbox.
  const globals = asSettings(settings.__globals__);
  const textStyle = (prefix: string): Settings | undefined => {
    const out: Settings = {};
    const global = globalRef(globals[`${prefix}_typography_typography`], 'typography');
    if (global) {
      // As in Elementor, the global font gives all its values.
      out.font = global;
      out.fontAll = true;
    } else if (settings[`${prefix}_typography_typography`] === 'custom') {
      Object.assign(out, kitTypography(settings, `${prefix}_typography`, notes));
      if (out.family) notes.font(str(out.family));
    }
    const c = colorOf(settings, `${prefix}_color`);
    if (c) out.color = c;
    return Object.keys(out).length ? out : undefined;
  };
  const texts: Settings = {};
  for (const key of ['body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    const t = textStyle(key);
    if (t) texts[key] = t;
  }
  const theme: Settings = {};
  if (Object.keys(texts).length) theme.texts = texts;
  const button: Settings = {};
  const buttonFont = globalRef(globals.button_typography_typography, 'typography');
  if (buttonFont) {
    button.font = buttonFont;
    button.fontAll = true;
  }
  const put = (target: Settings, key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') target[key] = value;
  };
  put(button, 'color', colorOf(settings, 'button_text_color'));
  put(button, 'background', colorOf(settings, 'button_background_color'));
  put(button, 'hoverColor', colorOf(settings, 'button_hover_text_color'));
  put(button, 'hoverBackground', colorOf(settings, 'button_hover_background_color'));
  if (str(settings.button_border_border) && settings.button_border_border !== 'none') {
    put(button, 'borderColor', colorOf(settings, 'button_border_color'));
    put(button, 'borderWidth', side(settings.button_border_width));
  }
  put(button, 'radius', side(settings.button_border_radius));
  const buttonPadding = box(settings.button_padding, notes);
  if (buttonPadding) {
    if (buttonPadding.top !== '')
      button.paddingY = { size: buttonPadding.top, unit: buttonPadding.unit };
    if (buttonPadding.right !== '')
      button.paddingX = { size: buttonPadding.right, unit: buttonPadding.unit };
  }
  if (Object.keys(button).length) theme.button = button;
  const image: Settings = {};
  put(image, 'radius', side(settings.image_border_radius));
  if (str(settings.image_border_border) && settings.image_border_border !== 'none') {
    put(image, 'borderColor', colorOf(settings, 'image_border_color'));
    put(image, 'borderWidth', side(settings.image_border_width));
  }
  put(image, 'opacity', num(asSettings(settings.image_opacity).size) ?? undefined);
  put(image, 'hoverOpacity', num(asSettings(settings.image_hover_opacity).size) ?? undefined);
  if (Object.keys(image).length) theme.image = image;
  const field: Settings = {};
  put(field, 'color', colorOf(settings, 'form_field_text_color'));
  put(field, 'background', colorOf(settings, 'form_field_background_color'));
  put(field, 'borderColor', colorOf(settings, 'form_field_border_color'));
  put(field, 'focusBorderColor', colorOf(settings, 'form_field_focus_border_color'));
  put(field, 'borderWidth', side(settings.form_field_border_width));
  put(field, 'radius', side(settings.form_field_border_radius));
  if (Object.keys(field).length) theme.field = field;
  const lightbox: Settings = {};
  put(lightbox, 'background', colorOf(settings, 'lightbox_color'));
  put(lightbox, 'uiColor', colorOf(settings, 'lightbox_ui_color'));
  if (Object.keys(lightbox).length) theme.lightbox = lightbox;
  if (Object.keys(theme).length) kit.theme = theme;
  // The old theme's page title selector, next to Fresco's own.
  const selector = str(settings.page_title_selector).trim();
  if (
    selector &&
    selector !== 'h1.entry-title' &&
    /^[\w\s.#,>:()*+~[\]="'-]{1,200}$/.test(selector)
  ) {
    kit.titleSelector = `${FRESCO_TITLE_SELECTOR}, ${selector}`;
  }
  // Atomic styling: global classes and variables.
  const classes = atomicClasses(extra.classes);
  if (classes.length) kit.classes = classes;
  const variables = atomicVariables(extra.variables);
  if (variables.length) kit.variables = variables;
  return { kit, info, css: str(settings.custom_css).trim() };
}

// ---- The theme's headings -------------------------------------------------------------------

export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export type HeadingFonts = Partial<Record<HeadingTag, { family?: string; weight?: string }>>;

const HEADING_TAGS: HeadingTag[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/** A font family as CSS writes it (`"Rubik", sans-serif`) → its first family, when plain. */
function cssFamily(value: string): string | undefined {
  const first = value
    .replace(/!important/i, '')
    .split(',')[0]
    ?.trim()
    .replace(/^["']|["']$/g, '');
  return first &&
    /^[A-Za-z0-9][\w -]{0,59}$/.test(first) &&
    !/^(inherit|initial|unset)$/i.test(first)
    ? first
    : undefined;
}

const cssWeight = (value: string): string | undefined => {
  const v = value
    .replace(/!important/i, '')
    .trim()
    .toLowerCase();
  return /^([1-9]00|normal|bold)$/.test(v)
    ? v === 'bold'
      ? '700'
      : v === 'normal'
        ? '400'
        : v
    : undefined;
};

/** The top-level rules of a style sheet (not those inside @media and the like). */
function topRules(css: string): { selector: string; body: string }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: { selector: string; body: string }[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    const selector = text.slice(start, open).trim();
    if (!selector.startsWith('@')) rules.push({ selector, body: text.slice(open + 1, j - 1) });
    start = i = j;
  }
  return rules;
}

/**
 * The fonts of the theme's headings, as far as the export tells them: the
 * site's global styles (`wp_global_styles`: headings, then h1–h6) and its
 * additional CSS (rules for `h1`…`h6`, `body h2`…), the later winning. Only
 * plain families (no presets or variables) and weights.
 */
export function themeHeadingFonts(css: string, globalStyles: unknown): HeadingFonts {
  const out: HeadingFonts = {};
  const set = (tag: HeadingTag, family: string | undefined, weight: string | undefined) => {
    if (!family && !weight) return;
    out[tag] = { ...out[tag], ...(family ? { family } : {}), ...(weight ? { weight } : {}) };
  };
  const elements = asSettings(asSettings(asSettings(globalStyles).styles).elements);
  const typo = (key: string) => asSettings(asSettings(elements[key]).typography);
  const heading = typo('heading');
  for (const tag of HEADING_TAGS) {
    for (const t of [heading, typo(tag)]) {
      set(tag, cssFamily(str(t.fontFamily)), cssWeight(str(t.fontWeight)));
    }
  }
  for (const { selector, body } of topRules(css)) {
    const tags = selector
      .split(',')
      .map((part) => /^(?:(?:html|body)\s+)*h([1-6])$/i.exec(part.trim())?.[1])
      .filter(Boolean)
      .map((n) => `h${n}` as HeadingTag);
    if (!tags.length) continue;
    const decl = (name: string) =>
      new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(body)?.[1] ?? '';
    const family = cssFamily(decl('font-family'));
    const weight = cssWeight(decl('font-weight'));
    for (const tag of tags) set(tag, family, weight);
  }
  return out;
}

/**
 * The theme's heading fonts into the kit's theme style, for the headings
 * whose style does not set its own (a global font, a family, a weight).
 * Imported headings without a font of their own show them, as they did.
 */
export function withHeadingFonts(
  kit: Settings,
  fonts: HeadingFonts,
  font: (family: string) => void,
): Settings {
  const tags = HEADING_TAGS.filter((tag) => fonts[tag]);
  if (!tags.length) return kit;
  const theme = asSettings(kit.theme);
  const texts = { ...asSettings(theme.texts) };
  for (const tag of tags) {
    const current = asSettings(texts[tag]);
    if (current.font) continue;
    const { family, weight } = fonts[tag]!;
    const next: Settings = { ...current };
    if (family && !current.family) {
      next.family = family;
      font(family);
    }
    if (weight && !current.weight) next.weight = weight;
    texts[tag] = next;
  }
  return { ...kit, theme: { ...theme, texts } };
}

/** The optional breakpoints of an Elementor kit, with Elementor's default values. */
const EXTRA_BREAKPOINTS: [string, number][] = [
  ['mobile_extra', 880],
  ['tablet_extra', 1200],
  ['laptop', 1366],
  ['widescreen', 2400],
];

// ---- Templates -----------------------------------------------------------------------------

export type TemplateKind =
  'header' | 'footer' | 'single' | 'archive' | 'popup' | 'section' | 'loop-item';

/** Elementor template types → Fresco Pro template kinds (null: not a template to import). */
export function templateKind(type: string): TemplateKind | null {
  switch (type) {
    case 'header':
    case 'footer':
    case 'popup':
    case 'loop-item':
      return type;
    case 'single':
    case 'single-post':
    case 'single-page':
      return 'single';
    case 'archive':
    case 'search-results':
      return 'archive';
    case 'section':
    case 'container':
    case 'widget':
    case 'page':
    case 'landing-page':
    case 'error-404':
      return 'section';
    default:
      return null;
  }
}

export interface Rule {
  mode: 'include' | 'exclude';
  rule: string | { $entry: string; prefix: string };
}

export interface ConditionContext extends Notes {
  /** WordPress post id → entry ref, when imported. */
  entryRef(post: number): string | undefined;
  /** A term by WordPress taxonomy and id → Cleitext taxonomy and slug. */
  term(taxonomy: string, id: number): { taxonomy: string; slug: string } | undefined;
  /** A WordPress taxonomy → Cleitext's. */
  taxonomySlug(taxonomy: string): string | undefined;
  /** A WordPress post type → Cleitext's. */
  typeSlug(type: string): string | undefined;
}

/**
 * Elementor's conditions (`include/singular/page/12`, `exclude/archive/category/5`…)
 * → Fresco Pro's rules (`entry:<id>`, `term:category:news`…). Entries are
 * entry references, resolved by the import.
 */
export function convertConditions(value: unknown, ctx: ConditionContext): Rule[] {
  const rules: Rule[] = [];
  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value)
      : [];
  for (const item of items) {
    const parts = str(item).split('/');
    const mode = parts[0] === 'exclude' ? 'exclude' : 'include';
    const [, group, sub, id] = parts;
    const rule = convertRule(group ?? '', sub ?? '', id ?? '', ctx);
    if (rule) rules.push({ mode, rule });
    else if (group)
      ctx.note(
        `the template condition "${parts.slice(1).join('/')}" has no counterpart and was left out`,
      );
  }
  return rules;
}

function convertRule(
  group: string,
  sub: string,
  id: string,
  ctx: ConditionContext,
): Rule['rule'] | null {
  const n = num(id);
  const type = (wp: string) =>
    wp === 'post' ? 'article' : wp === 'page' ? 'page' : ctx.typeSlug(wp);
  if (group === 'general') return 'all';
  if (group === 'singular') {
    if (!sub) return 'singular';
    if (sub === 'front_page') return 'front';
    if (sub === 'not_found404') return '404';
    const inTerm = /^in_(.+?)(_children)?$/.exec(sub);
    if (inTerm) {
      const term = n !== null ? ctx.term(inTerm[1]!, n) : undefined;
      return term ? `in-term:${term.taxonomy}:${term.slug}` : null;
    }
    if (['child_of', 'any_child_of', 'by_author'].includes(sub) || sub.endsWith('_by_author'))
      return null;
    if (n !== null) {
      const ref = ctx.entryRef(n);
      return ref ? { $entry: ref, prefix: 'entry:' } : null;
    }
    const own = type(sub);
    return own ? `type:${own}` : null;
  }
  if (group === 'archive') {
    if (!sub) return 'archive';
    if (sub === 'search') return 'search';
    if (sub === 'author' || sub === 'date') return null;
    if (sub.endsWith('_archive')) {
      const own = type(sub.slice(0, -'_archive'.length));
      return own ? `archive-type:${own}` : null;
    }
    const taxonomy = /^(?:child_of_|any_child_of_)?(.+)$/.exec(sub)![1]!;
    if (n !== null) {
      const term = ctx.term(taxonomy, n);
      return term ? `term:${term.taxonomy}:${term.slug}` : null;
    }
    const own = ctx.taxonomySlug(taxonomy);
    return own ? `taxonomy:${own}` : null;
  }
  if (group === 'search') return 'search';
  return null;
}

// ---- Popups ----------------------------------------------------------------------------------

const POPUP_ANIMATIONS: Record<string, string> = {
  fadeIn: 'fade',
  zoomIn: 'zoom',
  slideInUp: 'slide-up',
  slideInDown: 'slide-down',
  fadeInUp: 'slide-up',
  fadeInDown: 'slide-down',
  none: 'none',
};

/** A popup's layout (its page settings) and display settings → Fresco Pro's popup settings. */
export function popupSettings(page: Settings, display: Settings, notes: Notes): Settings {
  const out: Settings = {};
  const triggers = asSettings(display.triggers);
  const timing = asSettings(display.timing);
  const chosen: string[] = [];
  if (yes(triggers.page_load)) {
    chosen.push('load');
    out.trigger = 'load';
    out.delay = num(triggers.page_load_delay) ?? 0;
  }
  if (yes(triggers.scrolling)) {
    chosen.push('scroll');
    out.trigger ??= 'scroll';
    if (out.trigger === 'scroll') out.scroll = num(triggers.scrolling_offset) ?? 50;
  }
  if (yes(triggers.scrolling_to)) {
    chosen.push('element');
    out.trigger ??= 'element';
    if (out.trigger === 'element') out.selector = str(triggers.scrolling_to_selector);
  }
  if (yes(triggers.click)) {
    chosen.push('clicks');
    out.trigger ??= 'clicks';
    if (out.trigger === 'clicks') out.clicks = num(triggers.click_times) ?? 1;
  }
  if (yes(triggers.inactivity)) {
    chosen.push('inactivity');
    out.trigger ??= 'inactivity';
    if (out.trigger === 'inactivity') out.inactivity = num(triggers.inactivity_time) ?? 30;
  }
  if (yes(triggers.exit_intent)) {
    chosen.push('exit');
    out.trigger ??= 'exit';
  }
  // No trigger: opened by its links only.
  out.trigger ??= 'link';
  if (chosen.length > 1) notes.note('popups with several triggers keep the first one');
  // How often.
  if (yes(timing.times)) {
    const period = str(timing.times_period);
    if (period === 'session') out.frequency = 'session';
    else if (period === 'day' || period === 'week' || period === 'month') {
      out.frequency = 'days';
      out.days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    } else out.frequency = 'once';
    if ((num(timing.times_times) ?? 1) > 1)
      notes.note('popups shown up to several times are shown once per period');
  } else out.frequency = 'always';
  if (yes(timing.page_views)) out.views = num(timing.page_views_views) ?? 3;
  if (yes(timing.devices) && Array.isArray(timing.devices_devices)) {
    out.devices = (timing.devices_devices as unknown[])
      .map(str)
      .filter((d) => DEVICE_NAMES.includes(d));
    // A list naming the extra devices is complete; otherwise Fresco Pro
    // shows the popup on them where the base devices it names cover them.
    if ((out.devices as string[]).some((d) => !['desktop', 'tablet', 'mobile'].includes(d)))
      out.allDevices = true;
  }
  if (yes(timing.url) && timing.url_action !== 'hide' && str(timing.url_url))
    out.referrer = str(timing.url_url);
  if (yes(timing.schedule)) {
    const at = (v: unknown) =>
      /^\d{4}-\d{2}-\d{2}/.test(str(v))
        ? new Date(`${str(v).replace(' ', 'T')}`).toISOString()
        : undefined;
    const from = at(timing.schedule_start_date);
    const until = at(timing.schedule_end_date);
    if (from) out.from = from;
    if (until) out.until = until;
  }
  for (const key of ['sessions', 'sources', 'logged_in', 'browsers']) {
    if (yes(timing[key])) notes.note(`popup rules on "${key.replace('_', ' ')}" were left out`);
  }
  // Layout.
  const width = size(page.width);
  if (width && width.unit === 'px') out.width = width.size;
  else if (width) out.width = Math.round((width.size / 100) * 1140);
  const h = str(page.horizontal_position) || 'center';
  const v = str(page.vertical_position) || 'center';
  out.position =
    v === 'bottom' && h === 'left'
      ? 'bottom-left'
      : v === 'bottom' && h === 'right'
        ? 'bottom-right'
        : v === 'bottom'
          ? 'bottom'
          : v === 'top'
            ? 'top'
            : h === 'left'
              ? 'left'
              : h === 'right'
                ? 'right'
                : 'center';
  out.overlay = page.overlay !== '' && page.overlay !== 'no';
  const overlayColor = colorOf(page, 'overlay_background_color');
  if (overlayColor && !overlayColor.startsWith('var(')) out.overlayColor = overlayColor;
  out.closeButton = page.close_button !== '' && page.close_button !== 'no';
  out.closeOnOverlay = !yes(page.prevent_close_on_background_click);
  out.closeOnEsc = !yes(page.prevent_close_on_esc_key);
  out.preventScroll = yes(page.prevent_scroll);
  out.animation =
    POPUP_ANIMATIONS[str(page.entrance_animation)] ??
    (str(page.entrance_animation) ? 'zoom' : 'fade');
  if (num(page.close_automatically)) out.autoClose = num(page.close_automatically);
  if (num(page.close_button_delay)) out.closeDelay = num(page.close_button_delay);
  return out;
}

// ---- Custom code and fonts -------------------------------------------------------------------

export interface SnippetInput {
  title: string;
  code: string;
  location: string;
  published: boolean;
  conditions: Rule[];
}

/** Elementor's custom code → a Fresco Pro snippet. */
export function snippet(input: SnippetInput, index: number): Settings {
  const location =
    input.location === 'elementor_body_start'
      ? 'body_start'
      : input.location === 'elementor_body_end'
        ? 'body_end'
        : 'head';
  return {
    id: `elementor-${index + 1}`,
    name: input.title || `Custom code ${index + 1}`,
    location,
    code: input.code,
    enabled: input.published,
    conditions: input.conditions.length ? input.conditions : [{ mode: 'include', rule: 'all' }],
  };
}

/** Elementor's custom font (its files by weight and style) → a Fresco Pro font. */
export function customFont(
  family: string,
  files: unknown,
  mediaRef: (attachment: number) => string | undefined,
): Settings | null {
  const out: Settings[] = [];
  for (const variant of list(files)) {
    const weight = /^[1-9]00$/.test(str(variant.font_weight)) ? str(variant.font_weight) : '400';
    const style = variant.font_style === 'italic' ? 'italic' : 'normal';
    for (const format of ['woff2', 'woff', 'ttf']) {
      const file = asSettings(variant[format]);
      const url = str(file.url);
      if (!url) continue;
      const ref = num(file.id) !== null ? mediaRef(num(file.id)!) : undefined;
      out.push({ id: ref ?? null, url, weight, style });
      break;
    }
  }
  if (!family || out.length === 0) return null;
  return { family, fallback: 'sans-serif', files: out };
}

/** Elementor's page settings → Fresco's page settings (layout, hidden title, background, CSS). */
export function pageSettings(
  template: string,
  settings: Settings,
  hello: boolean,
  stretched: boolean,
): Settings {
  const data: Settings = {};
  const layout =
    str(settings.template) && str(settings.template) !== 'default'
      ? str(settings.template)
      : template;
  if (layout === 'elementor_canvas') data.layout = 'canvas';
  else if (
    layout === 'elementor_header_footer' ||
    (hello && (!layout || layout === 'default')) ||
    stretched
  ) {
    data.layout = 'full';
  }
  if (yes(settings.hide_title)) data.hideTitle = true;
  if (str(settings.background_background) === 'classic') {
    const bg = colorOf(settings, 'background_color');
    if (bg) data.background = bg;
  }
  if (str(settings.custom_css).trim()) data.customCss = str(settings.custom_css).trim();
  return data;
}

export { cssLength };
