/** Settings of the Analytics plugin, shared by the server and the admin. */

export interface AnalyticsConfig {
  matomo: {
    enabled: boolean;
    /** Address of the Matomo installation, e.g. https://stats.example.com/ */
    url: string;
    siteId: string;
    /**
     * `anonymous`: no cookies, for aggregate statistics only, which the
     * Garante allows without consent; `consent`: with cookies, after consent.
     */
    mode: 'anonymous' | 'consent';
  };
  ga4: { enabled: boolean; measurementId: string };
  gtm: { enabled: boolean; containerId: string; category: 'statistics' | 'marketing' };
  metaPixel: { enabled: boolean; pixelId: string };
  searchConsole: { enabled: boolean; token: string };
  bing: { enabled: boolean; token: string };
}

export const DEFAULT_CONFIG: AnalyticsConfig = {
  matomo: { enabled: false, url: '', siteId: '1', mode: 'anonymous' },
  ga4: { enabled: false, measurementId: '' },
  gtm: { enabled: false, containerId: '', category: 'statistics' },
  metaPixel: { enabled: false, pixelId: '' },
  searchConsole: { enabled: false, token: '' },
  bing: { enabled: false, token: '' },
};

export function withDefaults(saved: Partial<AnalyticsConfig> | null): AnalyticsConfig {
  const value = saved ?? {};
  return {
    matomo: { ...DEFAULT_CONFIG.matomo, ...value.matomo },
    ga4: { ...DEFAULT_CONFIG.ga4, ...value.ga4 },
    gtm: { ...DEFAULT_CONFIG.gtm, ...value.gtm },
    metaPixel: { ...DEFAULT_CONFIG.metaPixel, ...value.metaPixel },
    searchConsole: { ...DEFAULT_CONFIG.searchConsole, ...value.searchConsole },
    bing: { ...DEFAULT_CONFIG.bing, ...value.bing },
  };
}

export const PATTERNS = {
  ga4: /^G-[A-Z0-9]{4,20}$/,
  gtm: /^GTM-[A-Z0-9]{4,20}$/,
  pixel: /^\d{6,20}$/,
  matomoSite: /^\d{1,9}$/,
  token: /^[A-Za-z0-9_.-]{8,128}$/,
};

/** A verification code, also when the whole `<meta …>` tag was pasted. */
export function verificationToken(value: string): string {
  const fromTag = /content\s*=\s*["']([^"']+)["']/i.exec(value)?.[1];
  return (fromTag ?? value).trim();
}

/** The Matomo address with a final slash, or '' when not a valid http(s) address. */
export function matomoBase(value: string): string {
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || /["'<>\s\\]/.test(url.href)) return '';
    url.search = '';
    url.hash = '';
    return url.href.replace(/(matomo\.php|matomo\.js|index\.php)$/, '').replace(/\/?$/, '/');
  } catch {
    return '';
  }
}
