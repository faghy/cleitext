/**
 * Fonts of layers (Diorama 1.2). A layer's `fontFamily` is one of
 * Diorama's stacks (`inherit`: the theme's font for text), `heading` (the
 * theme's font for the layer's kind of heading), or a family's name: one
 * of the site's fonts or a Google font. Google fonts a slider uses are
 * asked for with an ordinary Google Fonts link on the page, which Cleitext
 * (0.71 and later) turns into the site's own copy, once per family; a
 * family the page already loads (the theme's, Fresco's) is never asked
 * for again.
 */
import { googleFonts } from '@cleitext/shared/google-fonts';
import { FONT_STACKS } from './presets';
import type { FontFamily, FontPreset, Layer, SliderData } from './types';

export const FONT_PRESETS: readonly FontPreset[] = ['inherit', 'sans', 'serif', 'display', 'mono'];

/** The theme's font for the layer's kind of heading (h1–h4; text otherwise). */
export const THEME_HEADING = 'heading';

/** A family's name as a layer keeps it: letters, digits, spaces, `.`, `_` and `-`. */
const FAMILY = /^[A-Za-z0-9](?:[A-Za-z0-9 ._-]{0,62}[A-Za-z0-9])?$/;

export const isPreset = (value: unknown): value is FontPreset =>
  typeof value === 'string' && (FONT_PRESETS as readonly string[]).includes(value);

/** A valid `fontFamily`, or null: a preset, `heading`, or a family's name. */
export function cleanFamily(value: unknown): FontFamily | null {
  if (typeof value !== 'string') return null;
  if (isPreset(value) || value === THEME_HEADING) return value;
  const name = value.trim().replace(/\s+/g, ' ');
  return FAMILY.test(name) ? name : null;
}

/** The family's name when `value` names one (not a preset or the theme's heading font). */
export function namedFamily(value: FontFamily): string | null {
  return isPreset(value) || value === THEME_HEADING ? null : value;
}

const GENERIC = {
  'sans-serif': 'sans-serif',
  serif: 'serif',
  display: 'sans-serif',
  handwriting: 'cursive',
  monospace: 'monospace',
} as const;

/** The CSS of a family: `"Rubik",sans-serif` (the generic family of Google's category). */
export function familyStack(name: string): string {
  const category = googleFonts().get(name)?.category ?? 'sans-serif';
  return `"${name}",${GENERIC[category]}`;
}

/** The CSS `font-family` of a value, or null for `heading` (the theme's rules apply). */
export function fontCss(value: FontFamily): string | null {
  if (value === THEME_HEADING) return null;
  if (isPreset(value)) return FONT_STACKS[value];
  return familyStack(value);
}

/** Whether Google serves a family (exact name, as in the Google Fonts list). */
export const isGoogleFont = (name: string): boolean => googleFonts().has(name);

/**
 * The Google fonts a slider uses, with their weights (each layer and device),
 * sorted: weights the family does not have are left out, and a family
 * without any of them asks for its first.
 */
export function sliderGoogleFonts(slider: SliderData): Map<string, number[]> {
  const found = new Map<string, Set<number>>();
  const add = (family: unknown, weight: unknown) => {
    if (typeof family !== 'string') return;
    const name = namedFamily(family);
    if (!name || !isGoogleFont(name)) return;
    const set = found.get(name) ?? new Set<number>();
    if (typeof weight === 'number') set.add(Math.round(weight / 100) * 100);
    found.set(name, set);
  };
  const walk = (layers: Layer[]) => {
    for (const layer of layers) {
      if (layer.type !== 'image' && layer.type !== 'shape' && layer.type !== 'icon') {
        const devices = [layer.style.base, layer.style.tablet ?? {}, layer.style.mobile ?? {}];
        let family: unknown = layer.style.base.fontFamily;
        let weight: unknown = layer.style.base.fontWeight;
        for (const style of devices) {
          family = style.fontFamily ?? family;
          weight = style.fontWeight ?? weight;
          add(family, weight);
        }
      }
      walk(layer.children);
    }
  };
  for (const slide of slider.slides) walk(slide.layers);
  const out = new Map<string, number[]>();
  for (const [name, set] of [...found].sort(([a], [b]) => a.localeCompare(b))) {
    const has = googleFonts()
      .get(name)!
      .weights.map((w) => Number(w));
    const weights = [...set].filter((w) => has.includes(w)).sort((a, b) => a - b);
    out.set(name, weights.length > 0 ? weights : [has.includes(400) ? 400 : has[0]!]);
  }
  return out;
}

/** The Google Fonts stylesheet of some families and their weights, or null. */
export function googleFontsHref(fonts: ReadonlyMap<string, readonly number[]>): string | null {
  const parts = [...fonts]
    .filter(([name]) => FAMILY.test(name))
    .slice(0, 24)
    .map(
      ([name, weights]) =>
        `family=${encodeURIComponent(name).replace(/%20/g, '+')}${weights.length ? `:wght@${weights.join(';')}` : ''}`,
    );
  return parts.length > 0
    ? `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`
    : null;
}

/** The page of the site the editor reads the site's fonts from (a public route). */
export const FONTS_PATH = '/_diorama/fonts';

/** The attribute marking the link of a slider's Google fonts on a page. */
export const FONTS_ATTRIBUTE = 'data-dio-fonts';

/** `Rubik:400;700|Oswald:700`: the families and weights of a link, for the page's filter. */
export function fontsMarker(fonts: ReadonlyMap<string, readonly number[]>): string {
  return [...fonts].map(([name, weights]) => `${name}:${weights.join(';')}`).join('|');
}

/** Families and weights written as `fontsMarker` (several lists merged), Google fonts only. */
export function parseFonts(lists: Iterable<string>): Map<string, number[]> {
  const merged = new Map<string, Set<number>>();
  for (const list of lists) {
    for (const item of list.split('|').slice(0, 48)) {
      const [name, weights = ''] = item.split(':');
      if (!name || !FAMILY.test(name) || !isGoogleFont(name)) continue;
      const set = merged.get(name) ?? new Set<number>();
      for (const w of weights.split(';')) if (/^[1-9]00$/.test(w)) set.add(Number(w));
      merged.set(name, set);
    }
  }
  return new Map(
    [...merged]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 24)
      .map(([name, set]) => [name, [...set].sort((a, b) => a - b)]),
  );
}

/** The families and weights of every slider's link on a page, merged. */
export function markedFonts(html: string): Map<string, number[]> {
  return parseFonts([...html.matchAll(/data-dio-fonts="([^"]*)"/g)].map((m) => decode(m[1]!)));
}

// ---- The site's fonts, as a page of the site shows them (the editor) ------------------

export interface PageFonts {
  /** The families the page loads: links of the services and of the site's copies, `@font-face`. */
  families: string[];
  /** The site's copies of families (`<link data-font-family>` on the same site). */
  links: { family: string; href: string }[];
  /** The `@font-face` rules of the page's styles (fonts the theme keeps itself). */
  faces: string;
}

const decode = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

function attributeOf(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decode(value);
}

/** Families of a Google or Bunny Fonts stylesheet (Bunny's slugs become names: `open-sans`). */
function serviceFamilies(href: string): string[] {
  let url: URL;
  try {
    url = new URL(href.replace(/^\/\//, 'https://'));
  } catch {
    return [];
  }
  if (!['fonts.googleapis.com', 'fonts.bunny.net'].includes(url.hostname)) return [];
  return url.searchParams
    .getAll('family')
    .flatMap((value) => value.split('|'))
    .map((spec) => spec.split(':')[0]!.trim().replace(/\+/g, ' '))
    .filter(Boolean);
}

/** A family's name as people write it: `open-sans` and `open sans` become `Open Sans` when Google has it. */
export function familyName(raw: string): string {
  const name = raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[-+]/g, ' ')
    .replace(/\s+/g, ' ');
  const key = name.toLowerCase();
  for (const family of googleFonts().keys()) if (family.toLowerCase() === key) return family;
  return raw.trim().replace(/^["']|["']$/g, '');
}

/** The fonts a page of the site loads (the theme's, the plugins', the copies Cleitext keeps). */
export function pageFonts(html: string, origin?: string): PageFonts {
  const families: string[] = [];
  const add = (name: string) => {
    const clean = cleanFamily(familyName(name));
    if (clean && !isPreset(clean) && clean !== THEME_HEADING && !families.includes(clean))
      families.push(clean);
  };
  const links: PageFonts['links'] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue;
    const href = attributeOf(tag, 'href') ?? '';
    const family = attributeOf(tag, 'data-font-family');
    if (family) {
      add(family);
      const local = href.startsWith('/') && !href.startsWith('//');
      const same = origin ? href.startsWith(`${origin}/`) : false;
      if (local || same) links.push({ family: familyName(family), href });
    }
    for (const name of serviceFamilies(href)) add(name);
  }
  const faces: string[] = [];
  for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = style[1]!;
    for (const im of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
      for (const name of serviceFamilies(im[1]!)) add(name);
    }
    for (const face of css.matchAll(/@font-face\s*\{[^}]*\}/gi)) {
      const name = /font-family\s*:\s*(["']?)([^;"'}]+)\1/i.exec(face[0])?.[2];
      if (!name) continue;
      add(name);
      faces.push(face[0]);
    }
  }
  return { families, links, faces: faces.join('\n') };
}

/** Families named in a theme's settings: typography values and fields about fonts. */
export function settingsFamilies(values: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(values ?? {})) {
    let raw: unknown = null;
    if (value && typeof value === 'object' && 'family' in value) raw = value.family;
    else if (
      typeof value === 'string' &&
      /font|family/i.test(key) &&
      !/weight|size|style|transform|height|spacing|source|color|variant/i.test(key)
    )
      raw = value;
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const name = cleanFamily(familyName(raw));
    if (name && namedFamily(name) && !out.includes(name)) out.push(name);
  }
  return out;
}
