/**
 * When tokens are refreshed and feeds fetched again: pure rules on the
 * channel's state and the time, so the scheduled task stays simple.
 */
import type { ChannelError, ChannelState, TokenStatus } from './types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Instagram refreshes only tokens at least a day old. */
export const MIN_TOKEN_AGE = DAY;
/** Refreshed when it has less than this left (long-lived tokens last 60 days). */
export const REFRESH_BEFORE = 30 * DAY;
/** Between two failed refreshes. */
export const REFRESH_RETRY = 6 * HOUR;
/** Shown as "expiring" when it has less than this left. */
export const WARN_BEFORE = 7 * DAY;
/** A pasted token Meta has said nothing about yet: long-lived ones last 60 days. */
export const ASSUMED_LIFETIME = 60 * DAY;

const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** How the token looks to the admin. */
export function tokenStatus(state: ChannelState, now: Date): TokenStatus {
  if (!state.connected) return 'none';
  const expires = time(state.tokenExpiresAt);
  const dataAccess = time(state.dataAccessExpiresAt);
  const ends = [expires, dataAccess].filter((t): t is number => t !== null);
  if (ends.length === 0) return state.lastError?.kind === 'token' ? 'expired' : 'never';
  const first = Math.min(...ends);
  if (first <= now.getTime() || state.lastError?.kind === 'token') return 'expired';
  if (first - now.getTime() < WARN_BEFORE) return 'expiring';
  return 'ok';
}

/**
 * An Instagram token (Instagram Login, by sign-in or pasted) should be
 * refreshed now: connected, a day old or more, less than 30 days left (or
 * an expiry that is only a guess), not expired, and no failed attempt in
 * the last six hours.
 */
export function shouldRefreshInstagram(state: ChannelState, now: Date): boolean {
  if (!state.connected || (state.method !== 'oauth' && state.method !== 'manual')) return false;
  const at = now.getTime();
  const expires = time(state.tokenExpiresAt);
  if (expires !== null && expires <= at) return false;
  const issued = time(state.tokenRefreshedAt) ?? time(state.connectedAt);
  if (issued === null || at - issued < MIN_TOKEN_AGE) return false;
  const lastTry = time(state.lastRefreshAttempt);
  if (state.refreshFailures > 0 && lastTry !== null && at - lastTry < REFRESH_RETRY) return false;
  if (state.expiresEstimated) return true;
  return expires === null || expires - at < REFRESH_BEFORE;
}

/** The feed is due for a refresh. */
export function shouldFetch(state: ChannelState, now: Date, refreshMinutes: number): boolean {
  if (!state.connected) return false;
  const next = time(state.nextFetchAt);
  if (next !== null) return next <= now.getTime();
  const last = time(state.lastFetchAt);
  return last === null || now.getTime() - last >= refreshMinutes * 60 * 1000;
}

/**
 * When to try again after a fetch: the usual interval after a success; after
 * an error, longer and longer (rate limits and refused tokens wait most).
 */
export function nextFetch(
  now: Date,
  refreshMinutes: number,
  error: ChannelError | null,
  failures: number,
): string {
  const base = refreshMinutes * 60 * 1000;
  if (!error) return new Date(now.getTime() + base).toISOString();
  const step =
    error.kind === 'rate'
      ? HOUR
      : error.kind === 'token' || error.kind === 'permission'
        ? 6 * HOUR
        : 15 * 60 * 1000;
  const wait = Math.min(step * 2 ** Math.max(0, Math.min(failures - 1, 4)), DAY);
  return new Date(now.getTime() + Math.max(wait, Math.min(base, step))).toISOString();
}

/** Expiry assumed for a pasted Instagram token until its first refresh tells. */
export function assumedExpiry(now: Date): string {
  return new Date(now.getTime() + ASSUMED_LIFETIME).toISOString();
}
