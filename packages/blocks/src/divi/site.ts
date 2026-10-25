/**
 * What a Divi site keeps outside its pages: the theme options (`et_divi`:
 * global colors, fonts, layout, buttons), the module presets and the Theme
 * Builder's conditions. They become Fresco's kit (global colors and fonts,
 * breakpoints, content width, the theme's text styles) and Fresco Pro's
 * template rules. Divi's option names are a data format: they appear here
 * only to be read.
 */
import type { DiviLayout, DiviPresets } from './convert.js';
import { color, font, globalColorId, length, str, type Settings } from './values.js';

const obj = (value: unknown): Settings =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Settings) : {};

/**
 * Divi's theme options from a file: the `et_divi` option itself (an object
 * of `divi_…` settings and the rest), a Theme Options export
 * (`{ context: 'epanel', data: { … } }`) or an object holding `et_divi`.
 * Null when it holds no Divi options.
 */
export function diviOptions(value: unknown): Settings | null {
  const looksLike = (o: Settings) =>
    Object.keys(o).some(
      (key) =>
        key.startsWith('divi_') ||
        key === 'et_global_colors' ||
        key === 'accent_color' ||
        key === 'content_width' ||
        key === 'builder_global_presets_ng',
    );
  const seen = new Set<unknown>();
  const visit = (o: unknown, depth: number): Settings | null => {
    if (depth > 4 || !o || typeof o !== 'object' || seen.has(o)) return null;
    seen.add(o);
    const record = obj(o);
    if (looksLike(record)) return record;
    for (const key of ['et_divi', 'data', 'options', 'et_divi_options']) {
      const found = visit(record[key], depth + 1);
      if (found) return found;
    }
    return null;
  };
  const found = visit(value, 0);
  if (!found) return null;
  // Divi 5 and late Divi 4 keep the global colors in `et_global_data` too.
  const data = obj((value as Settings | null)?.et_global_data ?? found.et_global_data);
  const colors = obj(data.global_colors);
  return Object.keys(colors).length
    ? { ...found, et_global_colors: { ...colors, ...obj(found.et_global_colors) } }
    : found;
}

/** Divi's own defaults for fonts and colors (the theme's style.css). */
const DEFAULT_FONT = 'Open Sans';
/** Heading sizes as shares of the h1 size (`body_header_size`, 30px by default). */
const HEADING_SCALE = [1, 0.86, 0.73, 0.6, 0.53, 0.47];

export interface DiviKit {
  /** A partial Fresco kit (the `fresco` plugin data's `kit`). */
  kit: Settings;
  /** What page conversions need. */
  layout: DiviLayout;
  /** The global colors' Fresco ids, by Divi id. */
  colors: Record<string, string>;
}

/**
 * Divi's theme options → Fresco's kit: the global colors (with Divi's
 * accent, text and heading colors as the four system colors), the heading
 * and body fonts, Divi's breakpoints, the content width and page layout,
 * and the theme style of texts and headings (sizes per device).
 */
export function diviKit(options: Settings | null, fonts: (family: string) => void): DiviKit {
  const o = options ?? {};
  const value = (key: string) => str(o[key]).trim();
  const num = (key: string, fallback: number) => {
    const n = Number.parseFloat(value(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const accent = color(value('accent_color')) ?? '#2ea3f2';
  const text = color(value('font_color')) ?? '#666666';
  const heading = color(value('header_color')) ?? '#666666';
  const link = color(value('link_color')) ?? accent;
  const secondary = color(value('secondary_accent_color')) ?? accent;
  const colors: { id: string; title: string; value: string }[] = [
    { id: 'primary', title: 'Headings', value: heading },
    { id: 'secondary', title: 'Secondary accent', value: secondary },
    { id: 'text', title: 'Text', value: text },
    { id: 'accent', title: 'Accent', value: accent },
  ];
  const ids: Record<string, string> = {};
  let n = 0;
  for (const [gcid, entry] of Object.entries(obj(o.et_global_colors))) {
    const e = obj(entry);
    const hex = color(e.color);
    if (!hex || hex.startsWith('var(') || str(e.active) === 'no') continue;
    const id = globalColorId(gcid);
    if (!/^gcid-[a-z0-9]+$/.test(id) || colors.some((c) => c.id === id)) continue;
    ids[gcid] = id;
    n++;
    colors.push({ id, title: str(e.label).trim() || `Global color ${n}`, value: hex });
  }
  const family = (key: string) => {
    const name = value(key);
    return !name || name === 'none' ? DEFAULT_FONT : name;
  };
  const headingFamily = family('heading_font');
  const bodyFamily = family('body_font');
  fonts(headingFamily);
  fonts(bodyFamily);
  const headingStyle = value('body_header_style');
  const headingWeight = headingStyle.includes('bold') ? '700' : '500';
  const kitFonts = [
    { id: 'primary', title: 'Headings', family: headingFamily, weight: headingWeight },
    { id: 'secondary', title: 'Secondary', family: bodyFamily, weight: '400' },
    { id: 'text', title: 'Body', family: bodyFamily, weight: '400' },
    { id: 'accent', title: 'Accent', family: bodyFamily, weight: '500' },
  ];
  const bodySize = num('body_font_size', 14);
  const bodyLine = num('body_font_height', 1.7);
  const headerSize = num('body_header_size', 30);
  const headerLine = num('body_header_height', 1);
  const headerSpacing = Number.parseFloat(value('body_header_spacing')) || 0;
  const tabletBody = num('tablet_body_font_size', bodySize);
  const phoneBody = num('phone_body_font_size', tabletBody);
  const tabletHeader = num('tablet_header_font_size', headerSize);
  const phoneHeader = num('phone_header_font_size', tabletHeader);
  const px = (size: number) => ({ size: Math.round(size), unit: 'px' });
  const texts: Settings = {
    body: {
      family: bodyFamily,
      size: px(bodySize),
      line: { size: bodyLine, unit: 'em' },
      color: 'var(--fr-c-text)',
      ...(tabletBody !== bodySize || phoneBody !== bodySize
        ? { devices: { tablet: { size: px(tabletBody) }, mobile: { size: px(phoneBody) } } }
        : {}),
    },
  };
  HEADING_SCALE.forEach((scale, i) => {
    texts[`h${i + 1}`] = {
      family: headingFamily,
      weight: headingWeight,
      size: px(headerSize * scale),
      line: { size: headerLine, unit: 'em' },
      ...(headerSpacing ? { letter: { size: headerSpacing, unit: 'px' } } : {}),
      ...(headingStyle.includes('uppercase') ? { transform: 'uppercase' } : {}),
      ...(headingStyle.includes('italic') ? { style: 'italic' } : {}),
      color: 'var(--fr-c-primary)',
      ...(tabletHeader !== headerSize || phoneHeader !== headerSize
        ? {
            devices: {
              tablet: { size: px(tabletHeader * scale) },
              mobile: { size: px(phoneHeader * scale) },
            },
          }
        : {}),
    };
  });
  const contentWidth = num('content_width', 1080);
  const kit: Settings = {
    colors,
    fonts: kitFonts,
    breakpoints: { tablet: 980, mobile: 767 },
    containerWidth: { size: contentWidth, unit: 'px' },
    style: { text: 'var(--fr-c-text)', link, background: '#ffffff' },
    theme: { texts },
    layout: { pageLayout: 'full' },
  };
  // Buttons without their own style (Divi's Customizer → Buttons).
  const button: NonNullable<DiviLayout['button']> = {};
  const buttonSize = length(value('all_buttons_font_size'));
  if (buttonSize) button.size = buttonSize;
  const buttonColor = color(value('all_buttons_text_color'));
  if (buttonColor) button.color = buttonColor;
  const buttonBg = color(value('all_buttons_bg_color'));
  if (buttonBg) button.background = buttonBg;
  const buttonBorder = length(value('all_buttons_border_width'));
  if (buttonBorder) button.borderWidth = buttonBorder;
  const buttonBorderColor = color(value('all_buttons_border_color'));
  if (buttonBorderColor) button.borderColor = buttonBorderColor;
  const buttonRadius = length(value('all_buttons_border_radius'));
  if (buttonRadius) button.radius = buttonRadius;
  const buttonSpacing = length(value('all_buttons_spacing'));
  if (buttonSpacing?.size) button.spacing = buttonSpacing;
  const buttonFont = value('all_buttons_font');
  if (buttonFont && buttonFont !== 'none') button.font = font(buttonFont);
  const layout: DiviLayout = {
    contentWidth,
    gutter: Math.min(4, Math.max(1, Math.round(num('gutter_width', 3)))),
    sectionPadding: num('section_padding', 4),
    rowPadding: num('row_padding', 2),
    accent,
    ...(Object.keys(button).length && options ? { button } : {}),
  };
  return { kit, layout, colors: ids };
}

/**
 * Divi's module presets (`builder_global_presets_ng`, or the presets of a
 * layout export) by module, as the conversion reads them.
 */
export function diviPresets(value: unknown): DiviPresets {
  const source = obj(obj(value).builder_global_presets_ng ?? obj(value).presets ?? value);
  const out: DiviPresets = {};
  for (const [module, entry] of Object.entries(source)) {
    if (!module.startsWith('et_pb_')) continue;
    const e = obj(entry);
    const presets: Record<string, { settings: Record<string, string> }> = {};
    for (const [id, preset] of Object.entries(obj(e.presets))) {
      const settings: Record<string, string> = {};
      for (const [key, v] of Object.entries(obj(obj(preset).settings))) {
        if (typeof v === 'string' || typeof v === 'number') settings[key] = String(v);
      }
      presets[id] = { settings };
    }
    out[module] = { ...(str(e.default) ? { default: str(e.default) } : {}), presets };
  }
  return out;
}

// ---- Theme Builder ------------------------------------------------------------------------------

export interface DiviRule {
  mode: 'include' | 'exclude';
  rule: string | { $entry: string; prefix: string };
}

export interface DiviConditionContext {
  note(text: string): void;
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
 * The places of a Theme Builder template (`_et_use_on`, `_et_exclude_from`:
 * `singular:post_type:page:all`, `archive:taxonomy:category:term:id:5`,
 * `homepage`…) → Fresco Pro's rules. The default template applies everywhere.
 */
export function diviConditions(
  useOn: string[],
  excludeFrom: string[],
  isDefault: boolean,
  ctx: DiviConditionContext,
): DiviRule[] {
  const rules: DiviRule[] = [];
  if (isDefault) rules.push({ mode: 'include', rule: 'all' });
  for (const [mode, list] of [
    ['include', isDefault ? [] : useOn],
    ['exclude', excludeFrom],
  ] as const) {
    for (const condition of list) {
      const rule = diviRule(condition, ctx);
      if (rule) rules.push({ mode, rule });
      else ctx.note(`the template condition "${condition}" has no counterpart and was left out`);
    }
  }
  return rules;
}

function diviRule(condition: string, ctx: DiviConditionContext): DiviRule['rule'] | null {
  const parts = condition.split(':');
  const type = (wp: string) =>
    wp === 'post' ? 'article' : wp === 'page' ? 'page' : ctx.typeSlug(wp);
  const id = (at: number) => {
    const n = Number(parts[at]);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  switch (parts[0]) {
    case 'homepage':
    case 'frontpage':
      return 'front';
    case '404':
      return '404';
    case 'search':
      return 'search';
    case 'singular': {
      if (parts[1] === 'post_type') {
        const own = type(parts[2] ?? '');
        if (!own) return null;
        if (parts[3] === 'all') return `type:${own}`;
        if (parts[3] === 'id' && id(4)) {
          const ref = ctx.entryRef(id(4)!);
          return ref ? { $entry: ref, prefix: 'entry:' } : null;
        }
        return null;
      }
      if (parts[1] === 'taxonomy' && parts[3] === 'term' && parts[4] === 'id' && id(5)) {
        const term = ctx.term(parts[2] ?? '', id(5)!);
        return term ? `in-term:${term.taxonomy}:${term.slug}` : null;
      }
      return parts.length === 1 ? 'singular' : null;
    }
    case 'archive': {
      if (parts[1] === 'all' || parts.length === 1) return 'archive';
      if (parts[1] === 'post_type') {
        const own = type(parts[2] ?? '');
        return own ? `archive-type:${own}` : null;
      }
      if (parts[1] === 'taxonomy') {
        if (parts[3] === 'all') {
          const own = ctx.taxonomySlug(parts[2] ?? '');
          return own ? `taxonomy:${own}` : null;
        }
        if (parts[3] === 'term' && parts[4] === 'id' && id(5)) {
          const term = ctx.term(parts[2] ?? '', id(5)!);
          return term ? `term:${term.taxonomy}:${term.slug}` : null;
        }
      }
      return null;
    }
    default:
      return null;
  }
}
