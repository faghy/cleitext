// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cmpBodyHtml, cmpHeadHtml, cmpPolicyHtml, iubendaPolicyId } from './cmp';
import {
  cmpProblems,
  cookieyesKey,
  DEFAULT_CONFIG,
  withDefaults,
  type CmpConfig,
  type PrivacyConfig,
} from './config';

type Win = Record<string, unknown> & typeof window;
const win = window as unknown as Win;

const CBID = '1a2b3c4d-1111-2222-3333-444455556666';

function settings(cmp: Partial<CmpConfig>, consentMode = false): PrivacyConfig {
  const cfg = withDefaults(null);
  return {
    ...cfg,
    banner: {
      ...cfg.banner,
      categories: ['preferences', 'statistics', 'marketing'],
      consentMode,
      scripts: { statistics: '<script>window.statsRan = 1</script>' },
    },
    cmp: {
      ...cfg.cmp,
      ...cmp,
      iubenda: { ...cfg.cmp.iubenda, siteId: '1234567', cookiePolicyId: '7654321', ...cmp.iubenda },
      cookiebot: { ...cfg.cmp.cookiebot, cbid: CBID, ...cmp.cookiebot },
      cookieyes: { key: 'abcdef0123456789abcdef01', ...cmp.cookieyes },
    },
  };
}

/** Runs the inline scripts of some HTML, in order (jsdom does not run them itself here). */
function run(html: string) {
  for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    new Function(code!)();
  }
}

/** A page with a held script, a held video and a preferences link, then the bridge. */
function page(cfg: PrivacyConfig, before?: () => void, ready?: () => void) {
  const provider = cfg.cmp.provider as Exclude<CmpConfig['provider'], 'none'>;
  run(cmpHeadHtml(cfg.cmp, 'en', cfg.banner.consentMode));
  before?.();
  const tail = cmpBodyHtml(cfg, provider, '1', cfg.banner.consentMode);
  document.body.innerHTML = `<iframe data-cx-category="marketing" data-cx-src="https://www.youtube-nocookie.com/embed/x"></iframe><a href="#cookie-preferences" id="prefs">Cookie preferences</a><button data-cx-open id="open">Open</button>${tail.replace(/<script>[\s\S]*<\/script>$/, '')}`;
  const events: string[][] = [];
  document.addEventListener('cleitext:consent', (e) =>
    events.push((e as CustomEvent<{ categories: string[] }>).detail.categories),
  );
  ready?.();
  run(tail.slice(tail.lastIndexOf('<script>')));
  return events;
}

const statsScript = () =>
  document.querySelector('script[data-cx-category="statistics"]')?.getAttribute('type') ?? 'run';
const video = () => document.querySelector('iframe')!.getAttribute('src');
const consent = () =>
  win.cleitextConsent as { get(): string[]; allow(k: string): void; open(): void };

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  for (const key of [
    '_iub',
    '__cxIub',
    'Cookiebot',
    'getCkyConsent',
    'performBannerAction',
    'revisitCkyConsent',
    'cleitextConsent',
    'gtag',
  ]) {
    delete win[key];
  }
  vi.restoreAllMocks();
});

describe('settings of the consent managers', () => {
  it('checks the IDs of the chosen consent manager only', () => {
    expect(cmpProblems(DEFAULT_CONFIG.cmp)).toEqual([]);
    expect(cmpProblems(settings({ provider: 'iubenda' }).cmp)).toEqual([]);
    expect(
      cmpProblems(
        settings({
          provider: 'iubenda',
          iubenda: {
            ...DEFAULT_CONFIG.cmp.iubenda,
            siteId: 'abc',
            cookiePolicyId: '7654321',
            cookiePolicyIds: { it: 'x1' },
            lang: 'italiano',
            options: '[1]',
          },
        }).cmp,
      ),
    ).toEqual(['iubenda.siteId', 'iubenda.cookiePolicyIds', 'iubenda.lang', 'iubenda.options']);
    expect(
      cmpProblems(
        settings({ provider: 'cookiebot', cookiebot: { cbid: 'nope', blocking: 'manual' } }).cmp,
      ),
    ).toEqual(['cookiebot.cbid']);
    expect(cmpProblems(settings({ provider: 'cookieyes', cookieyes: { key: 'x' } }).cmp)).toEqual([
      'cookieyes.key',
    ]);
  });

  it('takes the CookieYes key from its script', () => {
    expect(
      cookieyesKey(
        '<script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/abcdef0123456789abcdef01/script.js"></script>',
      ),
    ).toBe('abcdef0123456789abcdef01');
    expect(cookieyesKey(' abcdef0123456789 ')).toBe('abcdef0123456789');
  });

  it('uses the policy of each language with iubenda', () => {
    const cfg = settings({
      provider: 'iubenda',
      policies: true,
      iubenda: {
        ...DEFAULT_CONFIG.cmp.iubenda,
        siteId: '1234567',
        cookiePolicyId: '7654321',
        cookiePolicyIds: { it: '1111111' },
      },
    });
    expect(iubendaPolicyId(cfg.cmp, 'it')).toBe('1111111');
    expect(iubendaPolicyId(cfg.cmp, 'en')).toBe('7654321');
    expect(cmpPolicyHtml(cfg.cmp, 'cookies', 'it')).toContain(
      'href="https://www.iubenda.com/privacy-policy/1111111/cookie-policy" class="iubenda-white iubenda-noiframe iubenda-embed"',
    );
    expect(cmpPolicyHtml(cfg.cmp, 'privacy', 'en')).toContain('https://cdn.iubenda.com/iubenda.js');
    run(cmpHeadHtml(cfg.cmp, 'it', false));
    const conf = (win._iub as { csConfiguration: Record<string, unknown> }).csConfiguration;
    expect(conf).toMatchObject({
      siteId: 1234567,
      cookiePolicyId: 1111111,
      lang: 'it',
      perPurposeConsent: true,
    });
    expect(conf).not.toHaveProperty('googleConsentMode');
  });

  it('shows the cookie declaration of Cookiebot', () => {
    const cfg = settings({ provider: 'cookiebot', policies: true });
    expect(cmpPolicyHtml(cfg.cmp, 'cookies', 'it')).toBe(
      `<script id="CookieDeclaration" src="https://consent.cookiebot.com/${CBID}/cd.js" data-culture="IT" async></script>`,
    );
    expect(cmpPolicyHtml(cfg.cmp, 'privacy', 'it')).toBe('');
    expect(cmpPolicyHtml({ ...cfg.cmp, policies: false }, 'cookies', 'it')).toBe('');
  });
});

describe('iubenda bridge', () => {
  interface IubApi {
    prefs: { purposes?: Record<string, boolean>; consent?: boolean } | null;
    isPreferenceExpressed(): boolean;
    getPreferences(): IubApi['prefs'];
    openPreferences: () => void;
    setPreferences: (p: IubApi['prefs']) => void;
  }
  function mock(prefs: IubApi['prefs'] = null): IubApi {
    const api: IubApi = {
      prefs,
      isPreferenceExpressed() {
        return !!this.prefs;
      },
      getPreferences() {
        return this.prefs;
      },
      openPreferences: vi.fn(),
      setPreferences: vi.fn(function (this: IubApi, p: IubApi['prefs']) {
        this.prefs = p;
      }),
    };
    const iub = win._iub as unknown as { cs?: { api: IubApi } };
    iub.cs = { api };
    return api;
  }
  const callbacks = () =>
    (
      win._iub as unknown as {
        csConfiguration: { callback: Record<string, (p?: unknown) => void> };
      }
    ).csConfiguration.callback;

  it('holds everything until a choice, then maps the purposes', () => {
    let api!: IubApi;
    const events = page(settings({ provider: 'iubenda' }), () => {
      api = mock();
    });
    expect(consent().get()).toEqual([]);
    expect(statsScript()).toBe('text/plain');
    expect(video()).toBeNull();

    // 2 interactions and 3 experience → preferences, 4 measurement → statistics, 5 marketing.
    api.prefs = { purposes: { 1: true, 2: false, 3: true, 4: true, 5: false } };
    callbacks().onPreferenceExpressedOrNotNeeded!(api.prefs);
    expect(consent().get()).toEqual(['preferences', 'statistics']);
    expect(statsScript()).toBe('run');
    expect(video()).toBeNull();
    expect(events.at(-1)).toEqual(['preferences', 'statistics']);
  });

  it('applies a choice made on an earlier page at once', () => {
    page(settings({ provider: 'iubenda' }), () => {
      mock({ purposes: { 1: true, 4: false, 5: true } });
    });
    expect(consent().get()).toEqual(['marketing']);
    expect(video()).toBe('https://www.youtube-nocookie.com/embed/x');
    expect(statsScript()).toBe('text/plain');
  });

  it('releases everything when no consent is needed', () => {
    page(settings({ provider: 'iubenda' }), () => {
      mock();
    });
    callbacks().onPreferenceExpressedOrNotNeeded!();
    expect(consent().get()).toEqual(['preferences', 'statistics', 'marketing']);
  });

  it('follows a withdrawal', () => {
    let api!: IubApi;
    page(settings({ provider: 'iubenda' }), () => {
      api = mock({ purposes: { 4: true } });
    });
    expect(consent().get()).toEqual(['statistics']);
    api.prefs = { purposes: { 4: false } };
    callbacks().onPreferenceExpressed!(api.prefs);
    expect(consent().get()).toEqual([]);
  });

  it('opens its preferences and grants marketing through its API', () => {
    let api!: IubApi;
    page(settings({ provider: 'iubenda' }), () => {
      api = mock({ purposes: { 4: true } });
    });
    document.getElementById('open')!.click();
    document.getElementById('prefs')!.click();
    expect(api.openPreferences).toHaveBeenCalledTimes(2);
    consent().allow('marketing');
    expect(api.setPreferences).toHaveBeenCalledWith({ purposes: { 4: true, 5: true } }, true);
  });
});

describe('Cookiebot bridge', () => {
  interface Cb {
    consent: { necessary: boolean; preferences: boolean; statistics: boolean; marketing: boolean };
    renew: () => void;
    submitCustomConsent: (p: boolean, s: boolean, m: boolean) => void;
  }
  function mock(): Cb {
    const cb: Cb = {
      consent: { necessary: true, preferences: false, statistics: false, marketing: false },
      renew: vi.fn(),
      submitCustomConsent: vi.fn((p: boolean, s: boolean, m: boolean) => {
        cb.consent = { necessary: true, preferences: p, statistics: s, marketing: m };
        window.dispatchEvent(new Event('CookiebotOnAccept'));
      }),
    };
    win.Cookiebot = cb;
    return cb;
  }

  it('follows the consent events, also a decline', () => {
    const cb = mock();
    const events = page(settings({ provider: 'cookiebot' }));
    expect(consent().get()).toEqual([]);
    cb.consent = { necessary: true, preferences: false, statistics: true, marketing: true };
    window.dispatchEvent(new Event('CookiebotOnConsentReady'));
    expect(consent().get()).toEqual(['statistics', 'marketing']);
    expect(statsScript()).toBe('run');
    expect(video()).toBe('https://www.youtube-nocookie.com/embed/x');
    cb.consent = { necessary: true, preferences: false, statistics: false, marketing: false };
    window.dispatchEvent(new Event('CookiebotOnDecline'));
    expect(consent().get()).toEqual([]);
    expect(events.at(-1)).toEqual([]);
  });

  it('opens its dialog and grants marketing keeping the rest', () => {
    const cb = mock();
    cb.consent.statistics = true;
    page(settings({ provider: 'cookiebot' }));
    document.getElementById('prefs')!.click();
    expect(cb.renew).toHaveBeenCalledOnce();
    consent().allow('marketing');
    expect(cb.submitCustomConsent).toHaveBeenCalledWith(false, true, true);
    expect(consent().get()).toEqual(['statistics', 'marketing']);
  });

  it('answers the buttons of the notice of a held embed', () => {
    const cb = mock();
    page(settings({ provider: 'cookiebot' }), undefined, () => {
      // jsdom does not draw srcdoc: the notice is written in the frame instead.
      const frame = document.querySelector('iframe')!;
      frame.setAttribute('srcdoc', '…');
      frame.contentDocument!.body.innerHTML =
        '<button data-cx-allow="marketing">Accept and show</button><button data-cx-open>Cookie preferences</button>';
    });
    const notice = document.querySelector('iframe')!.contentDocument!;
    (notice.querySelector('[data-cx-open]') as HTMLElement).click();
    expect(cb.renew).toHaveBeenCalledOnce();
    (notice.querySelector('[data-cx-allow]') as HTMLElement).click();
    expect(cb.submitCustomConsent).toHaveBeenCalledWith(false, false, true);
    expect(video()).toBe('https://www.youtube-nocookie.com/embed/x');
  });

  it('sends Consent Mode updates only when this plugin sets the defaults', () => {
    const cb = mock();
    const gtag = vi.fn();
    win.gtag = gtag;
    page(settings({ provider: 'cookiebot', consentMode: 'privacy' }, true));
    cb.consent.statistics = true;
    window.dispatchEvent(new Event('CookiebotOnAccept'));
    expect(gtag).toHaveBeenLastCalledWith(
      'consent',
      'update',
      expect.objectContaining({
        analytics_storage: 'granted',
        ad_storage: 'denied',
      }),
    );
    expect(
      cmpHeadHtml(settings({ provider: 'cookiebot', consentMode: 'privacy' }).cmp, 'en', true),
    ).toContain('data-consentmode="disabled"');
    expect(cmpHeadHtml(settings({ provider: 'cookiebot' }).cmp, 'en', true)).not.toContain(
      'data-consentmode',
    );
  });

  it('leaves Consent Mode to Cookiebot by default', () => {
    const cb = mock();
    const gtag = vi.fn();
    win.gtag = gtag;
    page(settings({ provider: 'cookiebot' }, true));
    cb.consent.statistics = true;
    window.dispatchEvent(new Event('CookiebotOnAccept'));
    expect(consent().get()).toEqual(['statistics']);
    expect(gtag).not.toHaveBeenCalled();
  });
});

describe('CookieYes bridge', () => {
  function mock(categories: Record<string, boolean> = {}) {
    const state = {
      categories: {
        necessary: true,
        functional: false,
        analytics: false,
        performance: false,
        advertisement: false,
        ...categories,
      } as Record<string, boolean>,
    };
    win.getCkyConsent = () => ({ isUserActionCompleted: true, categories: state.categories });
    win.revisitCkyConsent = vi.fn();
    win.performBannerAction = vi.fn();
    return state;
  }
  const update = (accepted: string[], rejected: string[]) =>
    document.dispatchEvent(
      new CustomEvent('cookieyes_consent_update', { detail: { accepted, rejected } }),
    );

  it('maps functional, analytics, performance and advertisement', () => {
    mock({ performance: true });
    const events = page(settings({ provider: 'cookieyes' }));
    expect(consent().get()).toEqual(['statistics']);
    update(['necessary', 'functional', 'advertisement'], ['analytics', 'performance', 'other']);
    expect(consent().get()).toEqual(['preferences', 'marketing']);
    expect(video()).toBe('https://www.youtube-nocookie.com/embed/x');
    update(['necessary'], ['functional', 'analytics', 'performance', 'advertisement']);
    expect(consent().get()).toEqual([]);
    expect(events.at(-1)).toEqual([]);
  });

  it('opens its banner, and grants marketing with its switches', () => {
    mock({ analytics: true });
    page(settings({ provider: 'cookieyes' }));
    expect(document.querySelector('.cky-banner-element')).not.toBeNull();
    document.getElementById('open')!.click();
    expect(win.revisitCkyConsent).toHaveBeenCalledOnce();
    // Without the preference center's switches, the banner opens.
    consent().allow('marketing');
    expect(win.performBannerAction).not.toHaveBeenCalled();
    expect(win.revisitCkyConsent).toHaveBeenCalledTimes(2);
    document.body.insertAdjacentHTML(
      'beforeend',
      ['functional', 'analytics', 'performance', 'advertisement']
        .map((k) => `<input type="checkbox" id="ckySwitch${k}">`)
        .join(''),
    );
    consent().allow('marketing');
    expect(win.performBannerAction).toHaveBeenCalledWith('accept_partial');
    const checked = (k: string) =>
      (document.getElementById(`ckySwitch${k}`) as HTMLInputElement).checked;
    expect([checked('functional'), checked('analytics'), checked('advertisement')]).toEqual([
      false,
      true,
      true,
    ]);
  });
});
