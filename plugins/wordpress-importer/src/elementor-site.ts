/**
 * What an Elementor site keeps outside its pages: the kit (global colors and
 * fonts, layout, theme style), the Theme Builder's templates with their
 * conditions, popups with their triggers, custom code and custom fonts.
 * They become Fresco's kit, Fresco Pro's templates (`fresco_template`
 * entries) and Fresco Pro's site settings.
 */
import { atomicClasses, atomicVariables } from './elementor-atomic.js';
import type { ElementorKitInfo } from './elementor.js';
import {
  asSettings,
  box,
  colorOf,
  cssLength,
  lineSize,
  list,
  num,
  size,
  str,
  yes,
  type Notes,
  type Settings,
  type SizeValue,
} from './elementor-values.js';

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

/** A font id as Fresco's kit keeps it. */
const fontId = (id: string) =>
  id
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 40);

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
  // Global fonts.
  const withLine: string[] = [];
  const fonts = [...list(settings.system_typography), ...list(settings.custom_typography)]
    .map((t) => {
      const id = fontId(str(t._id));
      const family = str(t.typography_font_family);
      if (family) notes.font(family);
      const fontSize = size(t.typography_font_size, notes);
      const line = lineSize(t.typography_line_height, notes);
      if (line) withLine.push(id);
      const weight = str(t.typography_font_weight);
      return {
        id,
        title: str(t.title) || id,
        family,
        weight: /^([1-9]00|normal|bold)$/.test(weight) ? weight : '400',
        ...(fontSize ? { size: fontSize } : {}),
        ...(line ? { line } : {}),
        ...(/^[a-z]+$/.test(str(t.typography_text_transform))
          ? { transform: str(t.typography_text_transform) }
          : {}),
        ...(/^[a-z]+$/.test(str(t.typography_font_style))
          ? { style: str(t.typography_font_style) }
          : {}),
      };
    })
    .filter((f) => f.id);
  if (fonts.length) kit.fonts = fonts;
  info.fontsWithLine = withLine;
  // Breakpoints: max widths (recent kits), or the old min widths (tablet = lg - 1).
  const tablet =
    num(settings.viewport_tablet) ??
    (num(settings.viewport_lg) !== null ? num(settings.viewport_lg)! - 1 : null);
  const mobile =
    num(settings.viewport_mobile) ??
    (num(settings.viewport_md) !== null ? num(settings.viewport_md)! - 1 : null);
  if (tablet !== null || mobile !== null) {
    kit.breakpoints = { tablet: Math.round(tablet ?? 1024), mobile: Math.round(mobile ?? 767) };
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
    const global = /globals\/typography\?id=([\w-]+)/.exec(
      str(globals[`${prefix}_typography_typography`]),
    )?.[1];
    if (global) out.font = fontId(global);
    else if (settings[`${prefix}_typography_typography`] === 'custom') {
      const family = str(settings[`${prefix}_typography_font_family`]);
      if (family) {
        out.family = family;
        notes.font(family);
      }
      const s = size(settings[`${prefix}_typography_font_size`], notes);
      if (s) out.size = s;
      const weight = str(settings[`${prefix}_typography_font_weight`]);
      if (/^[1-9]00$/.test(weight)) out.weight = weight;
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
  const buttonFont = /globals\/typography\?id=([\w-]+)/.exec(
    str(globals.button_typography_typography),
  )?.[1];
  if (buttonFont) button.font = fontId(buttonFont);
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
  if (settings.active_breakpoints && Array.isArray(settings.active_breakpoints)) {
    const others = (settings.active_breakpoints as unknown[])
      .map(str)
      .filter((b) => !['viewport_mobile', 'viewport_tablet'].includes(b));
    if (others.length)
      notes.note('extra breakpoints of the kit (laptop, widescreen…) were not imported');
  }
  return { kit, info, css: str(settings.custom_css).trim() };
}

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
      .filter((d) => ['desktop', 'tablet', 'mobile'].includes(d));
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
