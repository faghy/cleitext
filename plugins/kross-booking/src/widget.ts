import { randomBytes, randomInt } from 'node:crypto';
import type { CxdBlock } from '@cleitext/plugin-sdk';

/** The block's type. */
export const BLOCK_TYPE = 'kross-booking/widget';

/** The widget's settings for a site (Settings → Kross Booking). */
export interface KrossConfig {
  /** The hotel's id at Kross Booking, e.g. `pratonevoso`; empty when not set. */
  hotelId: string;
  /** The widget's number, e.g. 11; null when not set. */
  widgetId: number | null;
  /** The widget's cache version (`?cache=`): a new one makes browsers load it again. */
  version: number;
}

/** The block's attributes. */
export interface WidgetAttrs {
  /** The room's id at Kross Booking; `0` for every room. */
  room?: string;
  /** Two-letter language of the widget; empty for the page's language. */
  lang?: string;
  /** Address of the booking page the widget sends to, when not Kross Booking's own. */
  url?: string;
}

/** The version the WordPress plugin started with. */
export const DEFAULT_VERSION = 6;

const HOTEL_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ROOM_RE = /^[A-Za-z0-9_-]{1,40}$/;
const LANG_RE = /^[A-Za-z]{2}$/;
const MAX_NUMBER = 999_999_999;

export function validHotelId(value: unknown): value is string {
  return typeof value === 'string' && HOTEL_RE.test(value);
}

/** A positive whole number (as a number or digits), or null. */
export function positiveInt(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value)
        : NaN;
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_NUMBER ? n : null;
}

/** The stored settings, with anything invalid left out. */
export function configOf(stored: unknown): KrossConfig {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  return {
    hotelId: validHotelId(s.hotelId) ? s.hotelId : '',
    widgetId: positiveInt(s.widgetId),
    version: positiveInt(s.version) ?? DEFAULT_VERSION,
  };
}

export function isConfigured(config: KrossConfig): boolean {
  return config.hotelId !== '' && config.widgetId !== null;
}

/** Problems of settings sent by the admin, by field; empty when they are valid. */
export function validateConfig(input: unknown): {
  config: KrossConfig | null;
  errors: Record<string, string>;
} {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const hotelId = typeof body.hotelId === 'string' ? body.hotelId.trim() : '';
  if (!validHotelId(hotelId)) {
    errors.hotelId = 'Use letters, digits, dashes and underscores (at most 64), e.g. pratonevoso.';
  }
  const widgetId = positiveInt(body.widgetId);
  if (widgetId === null) errors.widgetId = 'Use a whole number greater than 0, e.g. 11.';
  const version =
    body.version === undefined || body.version === null || body.version === ''
      ? DEFAULT_VERSION
      : positiveInt(body.version);
  if (version === null) errors.version = 'Use a whole number greater than 0.';
  return Object.keys(errors).length > 0
    ? { config: null, errors }
    : { config: { hotelId, widgetId, version: version! }, errors };
}

/** A new cache version, different from the current one: browsers load the widget again. */
export function newVersion(current: number): number {
  let next = current;
  while (next === current) next = randomInt(1_000_000, MAX_NUMBER);
  return next;
}

/** An address the widget may send to: http(s), or relative to the site. */
export function safeUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (!url || url.length > 500 || /[\s<>"'`\\]/.test(url)) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return /^https?:\/\/[^/]/i.test(url) ? url : '';
  // Relative addresses; `//host` would leave the site.
  return url.startsWith('//') ? '' : url;
}

/** The attributes as the widget gets them: room, two-letter language and address. */
export function widgetAttrs(
  attrs: WidgetAttrs,
  pageLocale: string,
): { room: string; lang: string; url: string } {
  const room =
    typeof attrs.room === 'string' && ROOM_RE.test(attrs.room.trim()) ? attrs.room.trim() : '0';
  const own = typeof attrs.lang === 'string' ? attrs.lang.trim() : '';
  const lang = (LANG_RE.test(own) ? own : pageLocale.slice(0, 2)).toLowerCase();
  return { room, lang: LANG_RE.test(lang) ? lang : 'en', url: safeUrl(attrs.url) };
}

/**
 * The attributes of the container, in the order of the WordPress shortcode
 * (the Kross widget reads them), then the widget's files for the loader.
 */
export function containerAttributes(
  attrs: WidgetAttrs,
  pageLocale: string,
  config: KrossConfig,
): Record<string, string> {
  const { room, lang, url } = widgetAttrs(attrs, pageLocale);
  return {
    'data-lang': lang,
    'data-hotel-id': config.hotelId,
    'data-id-room': room,
    ...(url ? { 'data-url': url } : {}),
    className: 'kross-container',
    // For the plugin's loader: the widget's files.
    ...(isConfigured(config)
      ? { 'data-cx-widget': String(config.widgetId), 'data-cx-version': String(config.version) }
      : {}),
  };
}

/**
 * The block for a `[kross-booking id="…" lang="…" url="…"]` shortcode of a
 * WordPress page (its attributes are all optional).
 */
export function blockFromShortcode(attrs: Record<string, string>): CxdBlock {
  const room = (attrs.id ?? '').trim();
  const lang = (attrs.lang ?? '').trim();
  const url = safeUrl(attrs.url);
  return {
    id: `b_${randomBytes(8).toString('hex')}`,
    type: BLOCK_TYPE,
    v: 1,
    attrs: {
      room: ROOM_RE.test(room) ? room : '0',
      ...(LANG_RE.test(lang) ? { lang: lang.toLowerCase() } : {}),
      ...(url ? { url } : {}),
    },
  };
}
