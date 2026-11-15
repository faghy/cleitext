/**
 * Settings as stored or sent by the admin, made safe and complete. No I/O here.
 */
import type { DisbigleConfig } from './types';

export const SLUG = 'disbigle';
export const ADMIN_PAGE_PATH = '/cl-admin/ext/disbigle';
export const DEFAULT_INSTANCE = 'https://app.disbigle.com';
/** What the plugin asks the server for: reading the account, writing posts. */
export const SCOPES = 'read write:statuses';
/** The editor's option, stored under `fields.disbigle.announce`. */
export const FIELD_GROUP = SLUG;

export const DEFAULT_CONFIG: DisbigleConfig = {
  instance: DEFAULT_INSTANCE,
  announce: true,
  comments: true,
  remoteAvatars: false,
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * The address of a server: https and a public host name (`ctx.http` reaches
 * nothing else), without path, query or credentials. `app.disbigle.com`
 * alone gets `https://`.
 */
export function normalizeInstance(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (!text || text.length > 200) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
  return url.origin;
}

export function normalizeConfig(input: unknown, fallback = DEFAULT_CONFIG): DisbigleConfig {
  const raw = record(input);
  const bool = (key: keyof DisbigleConfig) =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : (fallback[key] as boolean);
  return {
    instance: normalizeInstance(raw.instance) ?? fallback.instance,
    announce: bool('announce'),
    comments: bool('comments'),
    remoteAvatars: bool('remoteAvatars'),
  };
}

/** The host of an address, lowercase; '' when it is not one. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** An https (or http) address, else null. */
export function webUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
