import { describe, expect, it } from 'vitest';
import { nextFetch, shouldFetch, shouldRefreshInstagram, tokenStatus } from './tokens';
import { EMPTY_STATE, type ChannelState } from './types';

const DAY = 86_400_000;
const NOW = new Date('2026-10-01T10:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

const connected = (changes: Partial<ChannelState> = {}): ChannelState => ({
  ...EMPTY_STATE,
  connected: true,
  method: 'oauth',
  account: { id: '1', name: 'x' },
  connectedAt: ago(40),
  tokenRefreshedAt: ago(40),
  tokenExpiresAt: ahead(20),
  ...changes,
});

describe('refreshing the Instagram token', () => {
  it('waits while more than 30 days are left', () => {
    expect(
      shouldRefreshInstagram(
        connected({ tokenExpiresAt: ahead(45), tokenRefreshedAt: ago(15) }),
        NOW,
      ),
    ).toBe(false);
  });

  it('refreshes with less than 30 days left', () => {
    expect(shouldRefreshInstagram(connected(), NOW)).toBe(true);
  });

  it('never refreshes a token less than a day old', () => {
    expect(
      shouldRefreshInstagram(
        connected({ tokenRefreshedAt: new Date(NOW.getTime() - 3_600_000).toISOString() }),
        NOW,
      ),
    ).toBe(false);
  });

  it('refreshes a pasted token of unknown age once it may', () => {
    expect(
      shouldRefreshInstagram(
        connected({
          method: 'manual',
          expiresEstimated: true,
          tokenExpiresAt: ahead(59),
          tokenRefreshedAt: ago(1.01),
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it('cannot refresh an expired token, a Page token, or a disconnected account', () => {
    expect(shouldRefreshInstagram(connected({ tokenExpiresAt: ago(1) }), NOW)).toBe(false);
    expect(shouldRefreshInstagram(connected({ method: 'page' }), NOW)).toBe(false);
    expect(shouldRefreshInstagram({ ...EMPTY_STATE }, NOW)).toBe(false);
  });

  it('waits six hours after a failed attempt', () => {
    const failed = connected({ refreshFailures: 1, lastRefreshAttempt: ago(0.1) });
    expect(shouldRefreshInstagram(failed, NOW)).toBe(false);
    expect(shouldRefreshInstagram({ ...failed, lastRefreshAttempt: ago(0.3) }, NOW)).toBe(true);
  });
});

describe('token status', () => {
  it('tells ok, expiring, expired and never', () => {
    expect(tokenStatus(EMPTY_STATE, NOW)).toBe('none');
    expect(tokenStatus(connected({ tokenExpiresAt: ahead(20) }), NOW)).toBe('ok');
    expect(tokenStatus(connected({ tokenExpiresAt: ahead(3) }), NOW)).toBe('expiring');
    expect(tokenStatus(connected({ tokenExpiresAt: ago(1) }), NOW)).toBe('expired');
    expect(tokenStatus(connected({ tokenExpiresAt: null }), NOW)).toBe('never');
    // A Page token without expiry, but whose data access ends soon.
    expect(
      tokenStatus(connected({ tokenExpiresAt: null, dataAccessExpiresAt: ahead(2) }), NOW),
    ).toBe('expiring');
    // Meta refused the token: whatever the date says.
    expect(tokenStatus(connected({ lastError: { kind: 'token', message: '', at: '' } }), NOW)).toBe(
      'expired',
    );
  });
});

describe('fetching', () => {
  it('fetches a new account at once, then every interval', () => {
    expect(shouldFetch(connected(), NOW, 60)).toBe(true);
    expect(shouldFetch(connected({ lastFetchAt: ago(1 / 48) }), NOW, 60)).toBe(false);
    expect(shouldFetch(connected({ lastFetchAt: ago(1 / 20) }), NOW, 60)).toBe(true);
    expect(shouldFetch(connected({ nextFetchAt: ahead(1) }), NOW, 60)).toBe(false);
    expect(shouldFetch({ ...EMPTY_STATE }, NOW, 60)).toBe(false);
  });

  it('waits longer after errors, most for rate limits and tokens, at most a day', () => {
    const at = (iso: string) => (Date.parse(iso) - NOW.getTime()) / 60_000;
    expect(at(nextFetch(NOW, 60, null, 0))).toBe(60);
    const rate = { kind: 'rate' as const, message: '', at: '' };
    expect(at(nextFetch(NOW, 60, rate, 1))).toBe(60);
    expect(at(nextFetch(NOW, 60, rate, 3))).toBe(240);
    expect(at(nextFetch(NOW, 60, { ...rate, kind: 'network' }, 1))).toBe(15);
    expect(at(nextFetch(NOW, 60, { ...rate, kind: 'token' }, 10))).toBe(24 * 60);
  });
});
