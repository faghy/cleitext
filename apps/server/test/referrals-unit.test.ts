/**
 * Referral links (plugin API 1.58), without a server: the checks of
 * conversions and captures, the address without the captured parameters,
 * the referral cookies, and the page's script in a small fake browser —
 * the cookie is written only with the visitor's consent to the category,
 * at once or when it comes, never without a consent banner.
 */
import { describe, expect, it } from 'vitest';
import {
  cleanCapture,
  cleanConversion,
  cleanReversal,
  referralCookies,
  referralScript,
  withoutReferralParams,
  type SiteCapture,
} from '../src/plugins/conversions.js';

const capture: SiteCapture = {
  plugin: 'tandem',
  param: 'ref',
  category: 'marketing',
  days: 30,
  model: 'last',
};

/** Runs the page's script in a fake browser; returns what it did. */
function runScript(
  href: string,
  options: {
    consent?: string[] | null;
    cookie?: string;
    captures?: SiteCapture[];
  } = {},
) {
  const cookies: string[] = [];
  const beacons: unknown[] = [];
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  let address = href;
  const location = {
    get href() {
      return address;
    },
    get pathname() {
      return new URL(address).pathname;
    },
    protocol: new URL(href).protocol,
  };
  const document = {
    readyState: 'complete',
    referrer: 'https://news.example/article',
    get cookie() {
      return options.cookie ?? '';
    },
    set cookie(value: string) {
      cookies.push(value);
    },
    addEventListener(name: string, fn: (e: unknown) => void) {
      (listeners[name] ??= []).push(fn);
    },
  };
  const window: Record<string, unknown> = {};
  if (options.consent) window.cleitextConsent = { get: () => options.consent!.slice() };
  const history = {
    state: null,
    replaceState(_s: unknown, _t: string, url: string) {
      address = new URL(url, address).href;
    },
  };
  const navigator = {
    sendBeacon(_url: string, blob: Blob) {
      beacons.push(blob);
      return true;
    },
  };
  const html = referralScript(options.captures ?? [capture]);
  const code = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  new Function('window', 'document', 'location', 'history', 'navigator', 'fetch', code)(
    window,
    document,
    location,
    history,
    navigator,
    () => {},
  );
  return {
    cookies,
    beacons,
    get address() {
      return address;
    },
    consent(categories: string[]) {
      for (const fn of listeners['cleitext:consent'] ?? []) fn({ detail: { categories } });
    },
  };
}

describe('the page script', () => {
  it('stores nothing without consent, and removes the parameter from the address', () => {
    const page = runScript('https://site.test/shop?ref=anna&color=red#top');
    expect(page.cookies).toEqual([]);
    expect(page.address).toBe('https://site.test/shop?color=red#top');
    expect(page.beacons).toHaveLength(1);
  });

  it('stores nothing when the consent is for other categories', () => {
    const page = runScript('https://site.test/?ref=anna', { consent: ['statistics'] });
    expect(page.cookies).toEqual([]);
  });

  it('stores the code at once with consent to the category', () => {
    const page = runScript('https://site.test/?ref=anna', { consent: ['marketing'] });
    expect(page.cookies).toHaveLength(1);
    expect(page.cookies[0]).toMatch(
      /^cx_ref_tandem=anna; Max-Age=2592000; Path=\/; SameSite=Lax; Secure$/,
    );
  });

  it('stores the code when the visitor accepts later on the page', () => {
    const page = runScript('http://site.test/?ref=anna', { consent: [] });
    expect(page.cookies).toEqual([]);
    page.consent(['statistics']);
    expect(page.cookies).toEqual([]);
    page.consent(['statistics', 'marketing']);
    expect(page.cookies).toHaveLength(1);
    expect(page.cookies[0]).not.toContain('Secure');
    page.consent(['marketing']);
    expect(page.cookies).toHaveLength(1);
  });

  it('keeps the first code with the first-click model', () => {
    const first = { ...capture, model: 'first' as const };
    const kept = runScript('https://site.test/?ref=bob', {
      consent: ['marketing'],
      cookie: 'a=1; cx_ref_tandem=anna',
      captures: [first],
    });
    expect(kept.cookies).toEqual([]);
    const replaced = runScript('https://site.test/?ref=bob', {
      consent: ['marketing'],
      cookie: 'cx_ref_tandem=anna',
    });
    expect(replaced.cookies[0]).toContain('cx_ref_tandem=bob');
  });

  it('ignores invalid codes and pages without the parameter', () => {
    const invalid = runScript('https://site.test/?ref=%3Cscript%3E', { consent: ['marketing'] });
    expect(invalid.cookies).toEqual([]);
    expect(invalid.beacons).toEqual([]);
    expect(invalid.address).toBe('https://site.test/');
    const none = runScript('https://site.test/?page=2', { consent: ['marketing'] });
    expect(none.address).toBe('https://site.test/?page=2');
    expect(none.beacons).toEqual([]);
  });

  it('cannot be closed by the configuration', () => {
    expect(referralScript([{ ...capture, plugin: 'x</script><b>' }])).not.toContain('</script><b>');
  });
});

describe('checks', () => {
  it('normalizes conversions and refuses invalid ones', () => {
    const event = cleanConversion('shop', {
      kind: 'order',
      id: ' 42 ',
      amount: '10.5',
      currency: 'eur',
      customer: { email: 'A@B.it', userId: 'not-a-uuid' },
      referrals: { tandem: 'anna', 'Bad Slug': 'x', other: 'no spaces' },
      at: '2026-10-01T10:00:00Z',
    });
    expect(event).toEqual({
      source: 'shop',
      kind: 'order',
      id: '42',
      amount: '10.5',
      currency: 'EUR',
      customer: { email: 'a@b.it', userId: null },
      items: [],
      at: '2026-10-01T10:00:00.000Z',
      referrals: { tandem: 'anna' },
    });
    const lead = cleanConversion('forms', {
      kind: 'lead',
      id: 'm1',
      amount: '0',
      currency: '',
      customer: { email: 'x@y.it' },
    });
    expect(lead.currency).toBe('');
    for (const bad of [
      { kind: 'gift' },
      { amount: '-1' },
      { amount: '1e3' },
      { currency: 'EURO' },
      { amount: '5', currency: '' },
      { customer: { email: 'nobody' } },
      { id: '' },
    ])
      expect(() =>
        cleanConversion('shop', {
          kind: 'order',
          id: 'o',
          amount: '1',
          currency: 'EUR',
          customer: { email: 'a@b.it' },
          ...bad,
        } as never),
      ).toThrow(TypeError);
  });

  it('checks reversals', () => {
    expect(cleanReversal('shop', { id: 'o', amount: '5.00', reason: 'cancel' })).toMatchObject({
      source: 'shop',
      id: 'o',
      amount: '5.00',
      reason: 'cancel',
    });
    expect(cleanReversal('shop', { id: 'o' })).not.toHaveProperty('amount');
    expect(() => cleanReversal('shop', { id: 'o', amount: '0' })).toThrow(TypeError);
  });

  it('checks captures', () => {
    expect(cleanCapture('p', { param: 'ref', category: 'marketing', days: 900 })).toMatchObject({
      days: 365,
      model: 'last',
    });
    expect(cleanCapture('p', { param: 'page', category: 'marketing', days: 3 })).toBeNull();
    expect(cleanCapture('p', { param: 'ref', category: 'necessary', days: 3 })).toBeNull();
    expect(cleanCapture('p', null)).toBeNull();
  });

  it('removes only the captured parameters', () => {
    expect(withoutReferralParams('/a?ref=x', ['ref'])).toBe('/a');
    expect(withoutReferralParams('/a?b=1&ref=x&c=2', ['ref'])).toBe('/a?b=1&c=2');
    expect(withoutReferralParams('/a?reference=x', ['ref'])).toBe('/a?reference=x');
    expect(withoutReferralParams('/a?b=1', ['ref'])).toBe('/a?b=1');
    expect(withoutReferralParams('/a?r%65f=x', ['ref'])).toBe('/a');
    expect(withoutReferralParams('/a?ref=x', [])).toBe('/a?ref=x');
  });

  it('reads referral cookies', () => {
    expect(
      referralCookies({
        cx_ref_tandem: 'anna',
        cx_ref_my_plugin: 'b%2Dc',
        cx_ref_x: 'bad value',
        session: 'secret',
      }),
    ).toEqual({ tandem: 'anna', 'my-plugin': 'b-c' });
  });
});
