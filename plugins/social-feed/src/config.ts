/**
 * Settings as stored or sent by the admin, made safe and complete, and the
 * checks on the addresses of the sign-in. No I/O here.
 */
import { DEFAULT_CONFIG, EMPTY_STATE, type ChannelState, type FeedConfig } from './types';

export const ADMIN_PAGE_PATH = '/cl-admin/ext/social-feed';

const APP_ID_RE = /^\d{5,25}$/;

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const appId = (value: unknown): string =>
  typeof value === 'string' && APP_ID_RE.test(value.trim()) ? value.trim() : '';

export function normalizeConfig(input: unknown): FeedConfig {
  const raw = record(input);
  const ig = record(raw.instagram);
  const fb = record(raw.facebook);
  return {
    instagram: {
      enabled: typeof ig.enabled === 'boolean' ? ig.enabled : DEFAULT_CONFIG.instagram.enabled,
      appId: appId(ig.appId),
      via: ig.via === 'facebook' ? 'facebook' : 'instagram',
    },
    facebook: {
      enabled: typeof fb.enabled === 'boolean' ? fb.enabled : DEFAULT_CONFIG.facebook.enabled,
      appId: appId(fb.appId),
    },
    count: clamp(raw.count, 6, 50, DEFAULT_CONFIG.count),
    refreshMinutes: clamp(raw.refreshMinutes, 30, 1440, DEFAULT_CONFIG.refreshMinutes),
    media: raw.media === 'hotlink' ? 'hotlink' : 'local',
    consentCategory: raw.consentCategory === 'preferences' ? 'preferences' : 'marketing',
  };
}

/** A stored state, completed with the defaults (older versions may lack fields). */
export function normalizeState(input: unknown): ChannelState {
  const raw = record(input);
  return { ...EMPTY_STATE, ...(raw as Partial<ChannelState>) };
}

/**
 * The address Meta sends the person back to: this site's admin page, over
 * https (http only on the local machine), without query or fragment. Meta
 * compares it with the one set in the app, character by character.
 */
export function validRedirectUri(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  if (url.search || url.hash || url.username || url.password) return null;
  if (url.pathname.replace(/\/$/, '') !== ADMIN_PAGE_PATH) return null;
  return value;
}

/** A pasted token: one line of the characters Meta uses. */
export function cleanToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return /^[A-Za-z0-9._|%-]{20,1000}$/.test(token) ? token : null;
}

/** An app secret as Meta shows it: 32 hexadecimal characters. */
export function cleanSecret(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const secret = value.trim();
  return /^[a-f0-9]{32}$/i.test(secret) ? secret : null;
}
