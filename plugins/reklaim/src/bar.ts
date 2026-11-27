/**
 * Reklaim's settings as stored, the bar of a page and what the script gets.
 * No I/O here: the server reads the settings and asks Pro, this decides.
 */
import type { Bar, ProAnswer } from './pro';

/** One text of the bar, for a language (empty: any language). */
export interface Texts {
  locale: string;
  text: string;
  button: string;
  link: string;
}

export interface Settings {
  enabled: boolean;
  texts: Texts[];
  anchor: string;
  scroll: number;
  max_width: number;
  background: string;
  color: string;
  button_background: string;
  button_color: string;
  hide_paths: string;
  ga_event: string;
  tracking: boolean;
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const str = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;
const num = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
const color = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.trim())
    ? value.trim()
    : fallback;

/** An address for the button: on the site (`/…`, `#…`), `http(s):`, `mailto:` or `tel:`; anything else is dropped. */
export const safeLink = (value: unknown) => {
  const link = str(value).slice(0, 500);
  return /^(\/|#|https?:\/\/|mailto:|tel:)/i.test(link) && !/^\/\//.test(link) ? link : '';
};

/** An element id as typed: without `#`, letters, digits, `-`, `_`, `:` and `.` only. */
export const cleanAnchor = (value: unknown) =>
  str(value)
    .replace(/^#/, '')
    .replace(/[^\w:.-]/g, '')
    .slice(0, 80);

export function settingsOf(s: Record<string, unknown>): Settings {
  const texts = Array.isArray(s.texts) ? (s.texts as Record<string, unknown>[]) : [];
  return {
    enabled: bool(s.enabled, true),
    texts: texts
      .filter((t) => t && typeof t === 'object')
      .map((t) => ({
        locale: str(t.locale).toLowerCase(),
        text: str(t.text).slice(0, 120),
        button: str(t.button).slice(0, 60),
        link: safeLink(t.link),
      }))
      .filter((t) => t.button),
    anchor: cleanAnchor(s.anchor),
    scroll: num(s.scroll, 500, 0, 10000),
    max_width: num(s.max_width, 768, 0, 4000),
    background: color(s.background, '#1f2937'),
    color: color(s.color, '#ffffff'),
    button_background: color(s.button_background, '#2563eb'),
    button_color: color(s.button_color, '#ffffff'),
    hide_paths: str(s.hide_paths),
    ga_event: str(s.ga_event, 'generate_lead') || 'generate_lead',
    tracking: bool(s.tracking, true),
  };
}

/**
 * The texts for a language: the same language (`it-IT`, or just `it`), else
 * the ones for any language (no language set), else the first.
 */
export function textsFor(texts: readonly Texts[], locale: string): Texts | null {
  const wanted = locale.toLowerCase();
  const lang = wanted.split(/[-_]/)[0] ?? wanted;
  return (
    texts.find((t) => t.locale === wanted) ??
    texts.find((t) => t.locale && (t.locale === lang || t.locale.split(/[-_]/)[0] === lang)) ??
    texts.find((t) => !t.locale) ??
    texts[0] ??
    null
  );
}

/**
 * Whether a path is one of the lines typed (one per line): `/contact` is that
 * page (with or without the last `/`), `/blog/*` that page and all below it.
 */
export function pathMatches(path: string, lines: string): boolean {
  const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
  const here = clean(path.split(/[?#]/)[0] ?? path);
  return lines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => {
      if (line.endsWith('*')) {
        const base = clean(line.slice(0, -1));
        return here === base || here.startsWith(base.endsWith('/') ? base : `${base}/`);
      }
      return clean(line) === here;
    });
}

/** What the script gets: bars in order of preference, and how to show them. */
export interface ScriptConfig {
  bars: Bar[];
  scroll: number;
  /** Shown only on screens narrower than this (pixels); 0: on every screen. */
  maxWidth: number;
  position: 'bottom' | 'top';
  gaEvent: string;
  track: string | null;
}

export function scriptConfig(
  s: Settings,
  locale: string,
  pro: Required<ProAnswer>,
  trackUrl: string,
): ScriptConfig | null {
  const own = textsFor(s.texts, locale);
  const bars: Bar[] = pro.bars
    .map((b) => ({ ...b, anchor: cleanAnchor(b.anchor), link: safeLink(b.link) }))
    .filter((b) => b.button && (b.anchor || b.link));
  if (own && (s.anchor || own.link))
    bars.push({
      id: 'default',
      anchor: s.anchor,
      text: own.text,
      button: own.button,
      link: own.link,
    });
  if (!bars.length) return null;
  return {
    bars,
    scroll: s.scroll,
    maxWidth: pro.desktop ? 0 : s.max_width,
    position: pro.position,
    gaEvent: s.ga_event === 'off' ? '' : s.ga_event,
    track: s.tracking ? trackUrl : null,
  };
}

/** The CSS custom properties of the bar's colors. */
export function colorVars(s: Settings): string {
  return `--rk-bg:${s.background};--rk-fg:${s.color};--rk-btn:${s.button_background};--rk-btn-fg:${s.button_color}`;
}

/** JSON safe inside a `<script>` element. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
