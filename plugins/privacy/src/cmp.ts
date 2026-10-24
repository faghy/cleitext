import { gateHtml, SHARED_SCRIPT } from './banner';
import {
  CATEGORIES,
  iubendaOptions,
  type CmpConfig,
  type CmpProvider,
  type CookieRow,
  type PrivacyConfig,
} from './config';

/**
 * External consent managers (CMPs): iubenda, Cookiebot and CookieYes show
 * their own banner and keep their own consent record; this plugin keeps
 * holding scripts and embeds until consent, driven by the CMP's choice
 * through a small bridge script.
 *
 * Official documentation:
 * - iubenda Cookie Solution, advanced configuration (`_iub.csConfiguration`,
 *   callbacks, `_iub.cs.api`, purposes 1–5):
 *   https://www.iubenda.com/en/help/1205-how-to-configure-your-cookie-solution-advanced-guide
 * - iubenda policies, standard embedding (all plans) and direct text
 *   embedding (Advanced and Ultimate plans):
 *   https://www.iubenda.com/en/help/216 and
 *   https://www.iubenda.com/en/help/78-privacy-policy-direct-text-embedding-api/
 * - Cookiebot SDK (`uc.js`, `data-cbid`, `data-blockingmode`, `data-culture`,
 *   `data-consentmode`, `Cookiebot.consent`, `renew()`, `submitCustomConsent()`,
 *   the `CookiebotOn…` events): https://usercentrics.com/docs/web/cookiebot/cookiebot-sdk
 *   and https://www.cookiebot.com/en/developer/
 * - CookieYes: `getCkyConsent()`
 *   https://www.cookieyes.com/documentation/retrieving-consent-data-using-api-getckyconsent/,
 *   the `cookieyes_consent_update` event
 *   https://www.cookieyes.com/documentation/events-on-cookie-banner-interactions/,
 *   `performBannerAction()` https://www.cookieyes.com/documentation/consent-banner-action-api/
 *   and the `cky-banner-element` class that opens the banner
 *   https://www.cookieyes.com/documentation/change-cookie-consent-using-cookieyes/
 */

export const CMP_NAMES: Record<CmpProvider, string> = {
  iubenda: 'iubenda',
  cookiebot: 'Cookiebot',
  cookieyes: 'CookieYes',
};

/** The CMP's dashboard, linked from the admin. */
export const CMP_DASHBOARDS: Record<CmpProvider, string> = {
  iubenda: 'https://www.iubenda.com/en/dashboard',
  cookiebot: 'https://admin.cookiebot.com/',
  cookieyes: 'https://app.cookieyes.com/',
};

/** Origins the CMP loads from (documented; the public pages' CSP does not restrict scripts). */
export const CMP_ORIGINS: Record<CmpProvider, string[]> = {
  iubenda: ['https://cdn.iubenda.com', 'https://www.iubenda.com', 'https://cs.iubenda.com'],
  cookiebot: ['https://consent.cookiebot.com', 'https://consentcdn.cookiebot.com'],
  cookieyes: ['https://cdn-cookieyes.com', 'https://log.cookieyes.com'],
};

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** JSON safe inside a `<script>`. */
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/** The external CMP in use, or null for the built-in banner. */
export function activeCmp(cfg: PrivacyConfig): CmpProvider | null {
  return cfg.cmp.provider === 'none' ? null : cfg.cmp.provider;
}

/** The iubenda policy ID for a language: its own, the short language's, or the default one. */
export function iubendaPolicyId(cmp: CmpConfig, locale: string): string {
  const ids = cmp.iubenda.cookiePolicyIds;
  return ids[locale] || ids[locale.toLowerCase().slice(0, 2)] || cmp.iubenda.cookiePolicyId;
}

/**
 * The CMP's script, as early as possible in `<head>`. Each CMP asks to be the
 * first script of the page, after the Google Consent Mode defaults when the
 * site sets them itself.
 */
export function cmpHeadHtml(cmp: CmpConfig, locale: string, consentMode: boolean): string {
  const short = locale.toLowerCase().slice(0, 2);
  // The CMP sets Consent Mode, unless this plugin does it.
  const cmpConsentMode = consentMode && cmp.consentMode === 'cmp';
  if (cmp.provider === 'iubenda') {
    const i = cmp.iubenda;
    const configuration: Record<string, unknown> = {
      // Purposes one by one, so the categories can be told apart.
      perPurposeConsent: true,
      ...iubendaOptions(i.options),
      siteId: Number(i.siteId),
      cookiePolicyId: Number(iubendaPolicyId(cmp, locale)),
      lang: i.lang || short,
    };
    if (consentMode) configuration.googleConsentMode = cmpConsentMode;
    // The callbacks tell the bridge (at the end of the page) that the choice is known or changed.
    // Callbacks cannot come from the extra options (JSON has no functions): these are ours.
    const callbacks =
      '{onPreferenceExpressedOrNotNeeded:function(p){window.__cxIub={done:1,p:p};n();},onPreferenceExpressed:function(){n();},onConsentGiven:function(){n();},onConsentRejected:function(){n();}}';
    return `<script>(function(){function n(){try{document.dispatchEvent(new CustomEvent('cleitext:cmp'));}catch(e){}}var c=${json(configuration)};c.callback=${callbacks};var _iub=window._iub=window._iub||[];_iub.csConfiguration=c;})();</script><script src="https://cdn.iubenda.com/cs/iubenda_cs.js" charset="UTF-8" async></script>`;
  }
  if (cmp.provider === 'cookiebot') {
    const c = cmp.cookiebot;
    return `<script id="Cookiebot" src="https://consent.cookiebot.com/uc.js" data-cbid="${escape(c.cbid)}"${
      c.blocking === 'auto' ? ' data-blockingmode="auto"' : ''
    } data-culture="${escape(short.toUpperCase())}"${
      consentMode && !cmpConsentMode ? ' data-consentmode="disabled"' : ''
    }></script>`;
  }
  if (cmp.provider === 'cookieyes') {
    return `<script id="cookieyes" src="https://cdn-cookieyes.com/client_data/${escape(cmp.cookieyes.key)}/script.js"></script>`;
  }
  return '';
}

/**
 * The end of the page with an external CMP: the marker other plugins look
 * for (`#cx-consent`, without a banner), the scripts held by category, and
 * the bridge that releases them once the CMP's choice is known.
 */
export function cmpBodyHtml(
  cfg: PrivacyConfig,
  provider: CmpProvider,
  version: string,
  consentMode: boolean,
): string {
  const offered = CATEGORIES.filter((c) => cfg.banner.categories.includes(c));
  const gated = offered
    .map((category) => {
      const html = cfg.banner.scripts[category];
      return html ? gateHtml(html, category) : '';
    })
    .join('');
  // Privacy sends the updates only when it set the defaults.
  const updates = consentMode && cfg.cmp.consentMode === 'privacy';
  // CookieYes opens its banner from elements with this class, found when it starts.
  const opener =
    provider === 'cookieyes'
      ? '<button type="button" class="cky-banner-element" data-cx-cmp-open hidden></button>'
      : '';
  return `<div id="cx-consent" hidden data-cmp="${provider}" data-version="${escape(version)}" data-categories="${offered.join(',')}" data-consent-mode="${updates ? '1' : '0'}"></div>${opener}
${gated}
<script>${BRIDGE}</script>`;
}

/** The consent cookie the CMP sets, for the cookie table. */
export function cmpCookie(cmp: CmpConfig, locale: string, purpose: string): CookieRow | null {
  const it = locale.toLowerCase().startsWith('it');
  const months = it ? '12 mesi' : '12 months';
  if (cmp.provider === 'iubenda') {
    return {
      name: `_iub_cs-${iubendaPolicyId(cmp, locale)}`,
      provider: 'iubenda',
      category: 'necessary',
      purpose,
      duration: months,
    };
  }
  if (cmp.provider === 'cookiebot') {
    return {
      name: 'CookieConsent',
      provider: 'Cookiebot (Usercentrics)',
      category: 'necessary',
      purpose,
      duration: months,
    };
  }
  if (cmp.provider === 'cookieyes') {
    return {
      name: 'cookieyes-consent',
      provider: 'CookieYes',
      category: 'necessary',
      purpose,
      duration: months,
    };
  }
  return null;
}

/** Whether the CMP can show its own policy (`privacy`) or cookie declaration (`cookies`). */
export function cmpHasPolicy(cmp: CmpConfig, kind: 'privacy' | 'cookies'): boolean {
  if (!cmp.policies) return false;
  if (cmp.provider === 'iubenda') return true;
  return cmp.provider === 'cookiebot' && kind === 'cookies';
}

/**
 * The CMP's policy in a page: iubenda's privacy or cookie policy (standard
 * embed, or the text in the page with `iub-body-embed`), or Cookiebot's
 * cookie declaration (`cd.js`, drawn where the script is).
 */
export function cmpPolicyHtml(cmp: CmpConfig, kind: 'privacy' | 'cookies', locale: string): string {
  if (!cmpHasPolicy(cmp, kind)) return '';
  const short = locale.toLowerCase().slice(0, 2);
  if (cmp.provider === 'iubenda') {
    const id = iubendaPolicyId(cmp, locale);
    const url = `https://www.iubenda.com/privacy-policy/${id}${kind === 'cookies' ? '/cookie-policy' : ''}`;
    const title = kind === 'cookies' ? 'Cookie Policy' : 'Privacy Policy';
    const classes = `iubenda-white iubenda-noiframe iubenda-embed${cmp.iubenda.embed === 'text' ? ' iub-body-embed' : ''}`;
    // iubenda's loader: iubenda.js once the page has loaded.
    return `<a href="${url}" class="${classes}" title="${title}">${title}</a><script>(function(w,d){var l=function(){if(d.getElementById('cx-iubenda-js'))return;var s=d.createElement('script'),t=d.getElementsByTagName('script')[0];s.id='cx-iubenda-js';s.src='https://cdn.iubenda.com/iubenda.js';t.parentNode.insertBefore(s,t);};if(d.readyState==='complete')l();else w.addEventListener('load',l,false);})(window,document);</script>`;
  }
  return `<script id="CookieDeclaration" src="https://consent.cookiebot.com/${escape(cmp.cookiebot.cbid)}/cd.js" data-culture="${escape(short.toUpperCase())}" async></script>`;
}

/**
 * The bridge: reads the CMP's choice when the page opens and whenever it
 * changes, maps it to the plugin's categories and runs the same release as
 * the built-in banner; keeps `window.cleitextConsent` and the
 * `cleitext:consent` event; opens the CMP's preferences from the
 * `[data-cx-open]` elements, the `#cookie-preferences` links and the
 * notices of held embeds, whose "Accept and show" grants marketing through
 * the CMP's API when it has one (also `window.cleitextConsent.allow(category)`). When a category whose scripts already ran
 * is withdrawn, the page is loaded again, so they stop.
 * Plain ES2017, no dependencies.
 */
export const BRIDGE = `(function(){
${SHARED_SCRIPT}
var root=document.getElementById('cx-consent');if(!root||!root.getAttribute('data-cmp'))return;
var CMP=root.getAttribute('data-cmp'),CM=root.getAttribute('data-consent-mode')==='1';
var ALL=['preferences','statistics','marketing'];
var cats=[],released={},known=false;
function has(o,k){return !!(o&&o[k]);}
var A={
iubenda:{
api:function(){return window._iub&&window._iub.cs&&window._iub.cs.api;},
read:function(){var a=this.api();if(!a||typeof a.getPreferences!=='function')return null;
var done=a.isPreferenceExpressed&&a.isPreferenceExpressed();
if(!done){var cb=window.__cxIub;return cb&&cb.done&&!cb.p?ALL.slice():null;}
var p=a.getPreferences()||{},u=p.purposes;
if(u){var o=[];if(has(u,2)||has(u,3))o.push('preferences');if(has(u,4))o.push('statistics');if(has(u,5))o.push('marketing');return o;}
return p.consent===true?ALL.slice():[];},
open:function(){this.api().openPreferences();},
grant:function(k){var a=this.api();if(typeof a.setPreferences!=='function')return false;var P={preferences:[2,3],statistics:[4],marketing:[5]}[k];if(!P)return false;
var p=a.getPreferences()||{},u={},i;for(i in p.purposes||{})u[i]=p.purposes[i];for(i=0;i<P.length;i++)u[P[i]]=true;a.setPreferences({purposes:u},true);return true;},
listen:function(sync){document.addEventListener('cleitext:cmp',function(){sync();});}
},
cookiebot:{
api:function(){var c=window.Cookiebot;return c&&c.consent?c:null;},
read:function(){var c=this.api();if(!c)return null;var o=[];if(c.consent.preferences)o.push('preferences');if(c.consent.statistics)o.push('statistics');if(c.consent.marketing)o.push('marketing');return o;},
open:function(){this.api().renew();},
grant:function(k){var c=this.api();if(typeof c.submitCustomConsent!=='function')return false;var n=c.consent;c.submitCustomConsent(k==='preferences'||!!n.preferences,k==='statistics'||!!n.statistics,k==='marketing'||!!n.marketing);return true;},
listen:function(sync){['CookiebotOnConsentReady','CookiebotOnAccept','CookiebotOnDecline'].forEach(function(e){window.addEventListener(e,function(){sync();});});}
},
cookieyes:{
M:{functional:'preferences',analytics:'statistics',performance:'statistics',advertisement:'marketing'},
api:function(){return typeof window.getCkyConsent==='function'?window.getCkyConsent:null;},
map:function(list){var o=[],M=this.M;list.forEach(function(x){var k=M[x];if(k&&o.indexOf(k)<0)o.push(k);});return ALL.filter(function(k){return o.indexOf(k)>=0;});},
read:function(detail){if(detail&&detail.accepted)return this.map(detail.accepted);var g=this.api();if(!g)return null;var c=g()||{},k=c.categories;if(!k)return null;return this.map(Object.keys(k).filter(function(x){return k[x];}));},
open:function(){if(typeof window.revisitCkyConsent==='function')window.revisitCkyConsent();else{var b=document.querySelector('.cky-banner-element');if(b)b.click();}},
grant:function(k){var g=this.api();if(!g||typeof window.performBannerAction!=='function')return false;var c=(g()||{}).categories||{},M=this.M,ok=true;
Object.keys(M).forEach(function(x){var s=document.getElementById('ckySwitch'+x);if(s)s.checked=M[x]===k||!!c[x];else if(M[x]===k)ok=false;});
if(!ok)return false;window.performBannerAction('accept_partial');return true;},
listen:function(sync){document.addEventListener('cookieyes_consent_update',function(e){sync(e&&e.detail);});document.addEventListener('cookieyes_banner_loaded',function(){sync();});}
}
}[CMP];
if(!A)return;
function same(a,b){return a.slice().sort().join()===b.slice().sort().join();}
function apply(ok){var gone=cats.filter(function(k){return ok.indexOf(k)<0&&released[k];});
cats=ok.slice();window.cleitextConsent.categories=ok.slice();
release(ok,function(k){released[k]=true;});
if(CM)consentUpdate(ok);
try{document.dispatchEvent(new CustomEvent('cleitext:consent',{detail:{categories:ok.slice()}}));}catch(e){}
if(gone.length)location.reload();}
function sync(detail){if(!root.isConnected)return;var ok;try{ok=A.read(detail);}catch(e){ok=null;}if(!ok)return;if(known&&same(ok,cats))return;known=true;apply(ok);}
function ready(fn){var n=0;(function t(){if(A.api())fn();else if(n++<75)setTimeout(t,200);})();}
function open(){ready(function(){try{A.open();}catch(e){}});}
function allow(k){ready(function(){var done=false;try{done=A.grant(k);}catch(e){}if(done)setTimeout(sync,0);else open();});}
window.cleitextConsent={categories:[],cmp:CMP,open:open,allow:allow,get:function(){return cats.slice();}};
A.listen(sync);
wireAll(allow,open);
document.addEventListener('click',function(e){if(!root.isConnected)return;var t=e.target.closest&&e.target.closest('[data-cx-open],a[href$="#cookie-preferences"]');if(t){e.preventDefault();open();}});
sync();ready(function(){sync();});
if(location.hash==='#cookie-preferences')open();
})();`;
