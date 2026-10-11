import { definePlugin, type PluginContext, type TrackerDeclaration } from '@cleitext/plugin-sdk';
import {
  matomoBase,
  PATTERNS,
  verificationToken,
  withDefaults,
  type AnalyticsConfig,
} from './config';

/**
 * Analytics (official plugin, shipped on its own): Matomo, Google Analytics 4,
 * Google Tag Manager, Meta Pixel, and the verification of Google Search
 * Console and Bing Webmaster Tools. Each service declares its privacy rules;
 * Privacy & GDPR applies them (consent category, cookies, policy, Consent
 * Mode). Services that need consent are only loaded through its banner.
 */

const CACHE_TAGS = ['analytics', 'privacy'];

async function config(ctx: PluginContext, siteId: string): Promise<AnalyticsConfig> {
  return withDefaults(await ctx.storage.get<Partial<AnalyticsConfig>>(siteId, 'config'));
}

/** What each active service does, for the privacy plugin. */
export function trackersOf(cfg: AnalyticsConfig): TrackerDeclaration[] {
  const trackers: TrackerDeclaration[] = [];
  const matomo = matomoBase(cfg.matomo.url);
  if (cfg.matomo.enabled && matomo && PATTERNS.matomoSite.test(cfg.matomo.siteId)) {
    const anonymous = cfg.matomo.mode === 'anonymous';
    trackers.push({
      id: 'analytics.matomo',
      name: 'Matomo',
      provider: new URL(matomo).host,
      category: 'statistics',
      requiresConsent: !anonymous,
      cookies: anonymous
        ? []
        : [
            {
              name: '_pk_id.*',
              duration: '13 months',
              purpose: {
                en: 'Recognizes returning visitors for statistics.',
                it: 'Riconosce i visitatori che tornano, per le statistiche.',
              },
            },
            {
              name: '_pk_ses.*',
              duration: '30 minutes',
              purpose: {
                en: 'Groups the pages of one visit.',
                it: 'Raggruppa le pagine di una visita.',
              },
            },
          ],
      purpose: {
        en: 'We use Matomo to measure how the site is used: pages visited, time spent, the device and the site of origin.',
        it: 'Usiamo Matomo per misurare come viene usato il sito: pagine visitate, tempo di permanenza, dispositivo e sito di provenienza.',
      },
      privacyPolicyUrl: 'https://matomo.org/privacy-policy/',
    });
  }
  if (cfg.ga4.enabled && PATTERNS.ga4.test(cfg.ga4.measurementId)) {
    trackers.push({
      id: 'analytics.ga4',
      name: 'Google Analytics 4',
      provider: 'Google Ireland Ltd',
      category: 'statistics',
      requiresConsent: true,
      cookies: [
        {
          name: '_ga',
          duration: '2 years',
          purpose: { en: 'Distinguishes visitors.', it: 'Distingue i visitatori.' },
        },
        {
          name: `_ga_${cfg.ga4.measurementId.slice(2)}`,
          duration: '2 years',
          purpose: { en: 'Keeps the state of the visit.', it: 'Mantiene lo stato della visita.' },
        },
      ],
      purpose: {
        en: 'We use Google Analytics 4 to measure how the site is used, in aggregate; IP addresses are not stored by Google Analytics 4.',
        it: 'Usiamo Google Analytics 4 per misurare in forma aggregata come viene usato il sito; Google Analytics 4 non conserva gli indirizzi IP.',
      },
      transfersOutsideEu: true,
      privacyPolicyUrl: 'https://policies.google.com/privacy',
      googleConsentMode: true,
    });
  }
  if (cfg.gtm.enabled && PATTERNS.gtm.test(cfg.gtm.containerId)) {
    trackers.push({
      id: 'analytics.gtm',
      name: 'Google Tag Manager',
      provider: 'Google Ireland Ltd',
      category: cfg.gtm.category,
      requiresConsent: true,
      cookies: [],
      purpose: {
        en: 'We use Google Tag Manager to load the measurement and marketing tags configured in our container; their cookies are listed in the cookie policy.',
        it: 'Usiamo Google Tag Manager per caricare i tag di misurazione e marketing configurati nel nostro contenitore; i loro cookie sono elencati nella cookie policy.',
      },
      transfersOutsideEu: true,
      privacyPolicyUrl: 'https://policies.google.com/privacy',
      googleConsentMode: true,
    });
  }
  if (cfg.metaPixel.enabled && PATTERNS.pixel.test(cfg.metaPixel.pixelId)) {
    trackers.push({
      id: 'analytics.meta',
      name: 'Meta Pixel',
      provider: 'Meta Platforms Ireland Ltd',
      category: 'marketing',
      requiresConsent: true,
      cookies: [
        {
          name: '_fbp',
          duration: '3 months',
          purpose: {
            en: 'Measures and targets ads on Facebook and Instagram.',
            it: 'Misura e indirizza la pubblicità su Facebook e Instagram.',
          },
        },
        {
          name: 'fr',
          duration: '3 months',
          purpose: {
            en: 'Shows relevant ads on Meta services.',
            it: 'Mostra pubblicità pertinente sui servizi di Meta.',
          },
        },
      ],
      purpose: {
        en: 'We use the Meta Pixel to measure the results of our ads on Facebook and Instagram and to show them to people who visited the site.',
        it: 'Usiamo il Meta Pixel per misurare i risultati delle nostre inserzioni su Facebook e Instagram e mostrarle a chi ha visitato il sito.',
      },
      transfersOutsideEu: true,
      privacyPolicyUrl: 'https://www.facebook.com/privacy/policy/',
    });
  }
  return trackers;
}

/** A script that runs at once, or waits in the page for the consent to its category. */
function script(code: string, category: string | null, src?: string): string {
  const gate = category ? ` type="text/plain" data-cx-category="${category}"` : '';
  return src ? `<script${gate} async src="${src}"></script>` : `<script${gate}>${code}</script>`;
}

/** The tags of the active services for a page. */
export function headTags(cfg: AnalyticsConfig, consentBanner: boolean): string {
  const tags: string[] = [];
  if (cfg.searchConsole.enabled) {
    const token = verificationToken(cfg.searchConsole.token);
    if (PATTERNS.token.test(token))
      tags.push(`<meta name="google-site-verification" content="${token}">`);
  }
  if (cfg.bing.enabled) {
    const token = verificationToken(cfg.bing.token);
    if (PATTERNS.token.test(token)) tags.push(`<meta name="msvalidate.01" content="${token}">`);
  }
  for (const tracker of trackersOf(cfg)) {
    // Without the banner there is no way to ask: services that need consent stay off.
    if (tracker.requiresConsent && !consentBanner) continue;
    const category = tracker.requiresConsent ? tracker.category : null;
    if (tracker.id === 'analytics.matomo') {
      const base = JSON.stringify(matomoBase(cfg.matomo.url));
      const site = JSON.stringify(cfg.matomo.siteId);
      tags.push(
        script(
          `var _paq=window._paq=window._paq||[];${
            cfg.matomo.mode === 'anonymous' ? "_paq.push(['disableCookies']);" : ''
          }_paq.push(['trackPageView']);_paq.push(['enableLinkTracking']);(function(){var u=${base};_paq.push(['setTrackerUrl',u+'matomo.php']);_paq.push(['setSiteId',${site}]);var d=document,g=d.createElement('script'),s=d.getElementsByTagName('script')[0];g.async=true;g.src=u+'matomo.js';s.parentNode.insertBefore(g,s);})();`,
          category,
        ),
      );
    } else if (tracker.id === 'analytics.ga4') {
      const id = cfg.ga4.measurementId;
      tags.push(
        script('', category, `https://www.googletagmanager.com/gtag/js?id=${id}`),
        script(
          `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`,
          category,
        ),
      );
    } else if (tracker.id === 'analytics.gtm') {
      const id = cfg.gtm.containerId;
      tags.push(
        script(
          `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`,
          category,
        ),
      );
    } else if (tracker.id === 'analytics.meta') {
      const id = cfg.metaPixel.pixelId;
      tags.push(
        script(
          `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');`,
          category,
        ),
      );
    }
  }
  return tags.join('');
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const bool = (value: unknown) => value === true;

function cleanConfig(input: unknown): AnalyticsConfig {
  const body = withDefaults((input ?? {}) as Partial<AnalyticsConfig>);
  return {
    matomo: {
      enabled: bool(body.matomo.enabled),
      url: matomoBase(text(body.matomo.url, 300)),
      siteId: text(body.matomo.siteId, 9),
      mode: body.matomo.mode === 'consent' ? 'consent' : 'anonymous',
    },
    ga4: {
      enabled: bool(body.ga4.enabled),
      measurementId: text(body.ga4.measurementId, 30).toUpperCase(),
    },
    gtm: {
      enabled: bool(body.gtm.enabled),
      containerId: text(body.gtm.containerId, 30).toUpperCase(),
      category: body.gtm.category === 'marketing' ? 'marketing' : 'statistics',
    },
    metaPixel: { enabled: bool(body.metaPixel.enabled), pixelId: text(body.metaPixel.pixelId, 20) },
    searchConsole: {
      enabled: bool(body.searchConsole.enabled),
      token: verificationToken(text(body.searchConsole.token, 300)),
    },
    bing: {
      enabled: bool(body.bing.enabled),
      token: verificationToken(text(body.bing.token, 300)),
    },
  };
}

/** What is wrong with the settings of the active services, for the admin. */
function problems(cfg: AnalyticsConfig): string[] {
  const list: string[] = [];
  if (
    cfg.matomo.enabled &&
    (!matomoBase(cfg.matomo.url) || !PATTERNS.matomoSite.test(cfg.matomo.siteId))
  )
    list.push('matomo');
  if (cfg.ga4.enabled && !PATTERNS.ga4.test(cfg.ga4.measurementId)) list.push('ga4');
  if (cfg.gtm.enabled && !PATTERNS.gtm.test(cfg.gtm.containerId)) list.push('gtm');
  if (cfg.metaPixel.enabled && !PATTERNS.pixel.test(cfg.metaPixel.pixelId)) list.push('metaPixel');
  if (cfg.searchConsole.enabled && !PATTERNS.token.test(cfg.searchConsole.token))
    list.push('searchConsole');
  if (cfg.bing.enabled && !PATTERNS.token.test(cfg.bing.token)) list.push('bing');
  return list;
}

export default definePlugin({
  setup(ctx) {
    ctx.access.defineCapability('manage_analytics', {
      label: { en: 'Manage analytics', it: 'Gestire le statistiche' },
      roles: ['administrator'],
    });

    ctx.privacy.declareTrackers(async (siteId) => trackersOf(await config(ctx, siteId)));

    // After Privacy & GDPR (priority 10), which adds the banner and the Consent Mode defaults.
    ctx.hooks.filter(
      'render.html',
      async (html, context) => {
        context.tag('analytics');
        const cfg = await config(ctx, context.siteId);
        const tags = headTags(cfg, html.includes('id="cx-consent"'));
        if (!tags) return html;
        const end = html.search(/<\/head>/i);
        return end >= 0 ? `${html.slice(0, end)}${tags}${html.slice(end)}` : html;
      },
      { priority: 20 },
    );

    ctx.routes.api({
      method: 'GET',
      path: '/config',
      capability: 'manage_analytics',
      async handler(request) {
        const cfg = await config(ctx, request.siteId);
        return { body: { config: cfg, problems: problems(cfg) } };
      },
    });

    ctx.routes.api({
      method: 'PUT',
      path: '/config',
      capability: 'manage_analytics',
      async handler(request) {
        const cfg = cleanConfig(request.body);
        await ctx.storage.set(request.siteId, 'config', cfg);
        await ctx.cache.invalidate(request.siteId, CACHE_TAGS);
        return { body: { config: cfg, problems: problems(cfg) } };
      },
    });
  },
});
