import { CATEGORIES, textsFor, textsLang, type Category, type PrivacyConfig } from './config';

/**
 * The cookie banner of the public site, following the Italian Garante's
 * guidelines (2021): "Reject all" as visible as "Accept all", closing with
 * the X means no consent, nothing pre-checked, the choice can be changed at
 * any time (floating button, `#cookie-preferences` links, the block).
 */

export const CONSENT_PATH = '/_privacy/consent';

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const safeColor = (value: string) => (/^#[0-9a-f]{3,8}$/i.test(value) ? value : '#0f4c81');

/**
 * HTML pasted for a category, made inert until consent: scripts become
 * `type="text/plain"` and iframes lose their `src` (the script restores them).
 */
export function gateHtml(html: string, category: Category): string {
  return html
    .replace(/<script\b([^>]*)>/gi, (_match, attrs: string) => {
      const type = /\btype\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1];
      const rest = attrs.replace(/\btype\s*=\s*["'][^"']*["']/i, '');
      return `<script type="text/plain" data-cx-category="${category}"${
        type && type !== 'text/javascript' ? ` data-cx-type="${escape(type)}"` : ''
      }${rest}>`;
    })
    .replace(
      /<iframe\b([^>]*?)\ssrc\s*=\s*(["'])(.*?)\2([^>]*)>/gi,
      (_m, before, _q, src, after) =>
        `<iframe${before} data-cx-category="${category}" data-cx-src="${src}"${after}>`,
    );
}

/** The name shown for a host (Google Maps, YouTube…), or the host itself. */
export function embedName(host: string): { name: string; map: boolean } {
  const h = host.replace(/^www\./, '');
  if (/(^|\.)google\.[a-z.]+$/.test(h) || h === 'maps.google.com') {
    return { name: 'Google Maps', map: true };
  }
  if (/openstreetmap\.org$/.test(h)) return { name: 'OpenStreetMap', map: true };
  if (/(^|\.)(youtube(-nocookie)?\.com|youtu\.be)$/.test(h)) return { name: 'YouTube', map: false };
  if (/(^|\.)vimeo\.com$/.test(h)) return { name: 'Vimeo', map: false };
  if (/(^|\.)(facebook|instagram)\.com$/.test(h)) {
    return { name: h.includes('instagram') ? 'Instagram' : 'Facebook', map: false };
  }
  if (/(^|\.)tiktok\.com$/.test(h)) return { name: 'TikTok', map: false };
  if (/(^|\.)(twitter|x)\.com$/.test(h)) return { name: 'X', map: false };
  if (/(^|\.)dailymotion\.com$/.test(h)) return { name: 'Dailymotion', map: false };
  if (/(^|\.)spotify\.com$/.test(h)) return { name: 'Spotify', map: false };
  return { name: h, map: false };
}

/** A street map drawn here, faded behind the notice: no request to the map's site. */
const MAP_BACKGROUND = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320' viewBox='0 0 480 320'><rect width='480' height='320' fill='#ece9e1'/><path d='M0 230C90 205 150 262 240 236S390 186 480 206V252C400 232 340 280 250 272S100 246 0 268Z' fill='#aad3df'/><rect x='300' y='34' width='110' height='78' rx='8' fill='#cde6c0'/><rect x='40' y='150' width='70' height='50' rx='6' fill='#cde6c0'/><g fill='none' stroke='#fff' stroke-linecap='round'><path stroke-width='12' d='M0 128H480M150 0V320M0 44L480 176'/><path stroke-width='6' d='M310 0V320M0 88H480M44 320L236 0M390 140L480 320'/></g><path d='M0 186C140 164 330 140 480 104' fill='none' stroke='#f7d38a' stroke-width='9'/></svg>",
)}") center/cover`;

type EmbedTexts = ReturnType<typeof textsFor>['embed'] & { preferences: string };

/** Which category holds embeds, and its name in the notices. */
export interface EmbedGate {
  /** The category of embeds that name none (marketing by default). */
  category?: Category;
  /** The categories offered: an embed naming one of them (`data-cx-category`) waits for it. */
  offered?: readonly Category[];
  /** The category's name shown to visitors. */
  label?(category: Category): string;
}

const CATEGORY_NAMES: Record<Category, string> = {
  preferences: 'Preferences',
  statistics: 'Statistics',
  marketing: 'Marketing',
};

/** The notice inside a held iframe: a card over a faded map or a dark frame. */
function embedDoc(
  src: string,
  host: string,
  texts: EmbedTexts,
  color: string,
  category: Category,
  label: string,
): string {
  const { name, map } = embedName(host);
  const pin =
    '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="COLOR" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>';
  const play =
    '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="COLOR"/><path fill="#fff" d="M10 7.5v9l7-4.5z"/></svg>';
  const style = `html,body{margin:0;height:100%}body{font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2937;display:flex;align-items:center;justify-content:center;overflow:auto;background:${map ? MAP_BACKGROUND : 'linear-gradient(135deg,#1f2937,#4b5563)'}}body::before{content:"";position:fixed;inset:0;background:${map ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.25)'}}.cx-card{position:relative;box-sizing:border-box;max-width:25rem;margin:1rem;padding:1.25rem 1.4rem;background:#fff;border-radius:.75rem;box-shadow:0 10px 30px rgba(0,0,0,.18);text-align:center}h2{margin:.35rem 0 .3rem;font-size:1.05rem}p{margin:0 0 1rem;font-size:.9rem;color:#4b5563}.cx-row{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center}button{font:inherit;font-size:.9rem;font-weight:600;padding:.55rem 1rem;border-radius:.5rem;cursor:pointer;border:2px solid COLOR}.cx-primary{background:COLOR;color:#fff}.cx-plain{background:#fff;color:COLOR}a{display:inline-block;margin-top:.8rem;font-size:.85rem;color:#374151}button:focus-visible,a:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}`;
  const body = `<div class="cx-card" role="group" aria-label="${escape(texts.title(name))}">${map ? pin : play}<h2>${escape(texts.title(name))}</h2><p>${escape(map ? texts.map(name, label) : texts.other(name, label))}</p><div class="cx-row"><button type="button" class="cx-primary" data-cx-allow="${category}">${escape(texts.accept)}</button><button type="button" class="cx-plain" data-cx-open>${escape(texts.preferences)}</button></div><a href="${escape(src)}" target="_blank" rel="noopener noreferrer">${escape(texts.open(name))} ↗</a></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${style.replaceAll('COLOR', color)}</style></head><body>${body.replaceAll('COLOR', color)}</body></html>`;
}

/**
 * The notice in place of an embed made of a provider's script (a social
 * post's `<blockquote>` with its script): in the page, before the held script.
 */
function scriptNotice(
  name: string,
  texts: EmbedTexts,
  color: string,
  category: Category,
  label: string,
): string {
  const button = `font:inherit;font-size:.9em;font-weight:600;margin:.2em;padding:.5em 1em;border-radius:.5em;cursor:pointer;border:2px solid ${color}`;
  return `<div class="cx-embed-notice" data-cx-notice="${category}" role="group" aria-label="${escape(texts.title(name))}" style="box-sizing:border-box;max-width:32rem;margin:1em 0;padding:1.1em 1.25em;border-radius:.75em;background:linear-gradient(135deg,#1f2937,#4b5563);color:#fff;font:15px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-align:center"><strong style="display:block;margin-bottom:.3em;font-size:1.05em">${escape(texts.title(name))}</strong><span style="display:block;margin-bottom:.8em;font-size:.9em">${escape(texts.other(name, label))}</span><button type="button" data-cx-allow="${category}" style="${button};background:${color};color:#fff">${escape(texts.accept)}</button><button type="button" data-cx-open style="${button};background:#fff;color:${color}">${escape(texts.preferences)}</button></div>`;
}

const isCategory = (value: string | undefined): value is Category =>
  (CATEGORIES as readonly string[]).includes(value ?? '');

/**
 * Iframes of other sites in the page (videos, maps, posts), held until
 * consent to the embeds' category (marketing by default), with a notice
 * inside them until then: what it is, the category, "Accept and show", the
 * cookie preferences, and a link to see it on its own site. An iframe naming
 * an offered category (`data-cx-category`) waits for that one. Those already
 * held (plugins' own, `data-cx-src`) stay as they are. Scripts of embeds
 * (`<script data-cx-embed="Provider">`, a social post's script kept by an
 * import) are held too, with the notice before them.
 */
export function gateEmbeds(
  html: string,
  texts: EmbedTexts,
  color = '#0f4c81',
  gate: EmbedGate = {},
): string {
  const start = html.search(/<body\b/i);
  if (start < 0) return html;
  const fallback = gate.category ?? 'marketing';
  const offered = gate.offered ?? CATEGORIES;
  const label = (c: Category) => gate.label?.(c) ?? CATEGORY_NAMES[c];
  const tint = safeColor(color);
  const categoryOf = (attrs: string): Category => {
    const own = /\sdata-cx-category\s*=\s*["']([a-z]+)["']/i.exec(attrs)?.[1];
    return isCategory(own) && offered.includes(own) ? own : fallback;
  };
  const body = html
    .slice(start)
    .replace(
      /<iframe\b([^>]*?)\ssrc\s*=\s*(["'])((?:https?:)?\/\/[^"']+)\2([^>]*)>/gi,
      (match, before: string, _q, src: string, after: string) => {
        if (/\bsrcdoc\s*=/i.test(before + after)) return match;
        let host: string;
        try {
          host = new URL(src, 'https://x.invalid').hostname;
        } catch {
          return match;
        }
        const category = categoryOf(before + after);
        const strip = (attrs: string) =>
          attrs.replace(/\sdata-cx-category\s*=\s*["'][^"']*["']/gi, '');
        const doc = embedDoc(src, host, texts, tint, category, label(category));
        return `<iframe${strip(before)} data-cx-category="${category}" data-cx-src="${src}" srcdoc="${escape(doc)}"${strip(after)}>`;
      },
    )
    .replace(
      /<script\b([^>]*\sdata-cx-embed\s*=\s*["']([^"']{1,60})["'][^>]*)>/gi,
      (match, attrs: string, name: string) => {
        if (/\stype\s*=\s*["']text\/plain["']/i.test(attrs)) return match;
        const category = categoryOf(attrs);
        const rest = attrs
          .replace(/\stype\s*=\s*["'][^"']*["']/i, '')
          .replace(/\sdata-cx-category\s*=\s*["'][^"']*["']/gi, '');
        return `${scriptNotice(name, texts, tint, category, label(category))}<script type="text/plain" data-cx-category="${category}"${rest}>`;
      },
    );
  return html.slice(0, start) + body;
}

/**
 * Google Consent Mode v2 defaults, before any Google tag: everything denied
 * until chosen. With `fromCookie`, a choice already made in the built-in
 * banner is the default (with an external CMP the bridge updates instead).
 */
export function consentModeScript(version: string, fromCookie = true): string {
  const saved = fromCookie
    ? `try{var m=document.cookie.match(/(?:^|; )cx_consent=([^;]*)/);var c=m&&JSON.parse(decodeURIComponent(m[1]));if(c&&c.v===${JSON.stringify(version)}){var k=c.c||[];if(k.indexOf('statistics')>=0)g.analytics_storage='granted';if(k.indexOf('marketing')>=0){g.ad_storage='granted';g.ad_user_data='granted';g.ad_personalization='granted';}if(k.indexOf('preferences')>=0){g.functionality_storage='granted';g.personalization_storage='granted';}}}catch(e){}`
    : '';
  return `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}(function(){var g={ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'denied',personalization_storage:'denied',security_storage:'granted',wait_for_update:500};${saved}gtag('consent','default',g);})();</script>`;
}

export interface BannerLinks {
  privacy?: string;
  cookies?: string;
}

export function bannerHtml(
  config: PrivacyConfig,
  locale: string,
  links: BannerLinks,
  version: string,
): string {
  const t = textsFor(locale);
  const lang = textsLang(locale);
  const short = locale.toLowerCase().slice(0, 2);
  const title =
    config.banner.title[locale] ||
    config.banner.title[short] ||
    config.banner.title[lang] ||
    t.title;
  const message =
    config.banner.message[locale] ||
    config.banner.message[short] ||
    config.banner.message[lang] ||
    t.message;
  const offered = CATEGORIES.filter((c) => config.banner.categories.includes(c));
  const help: Record<Category, [string, string]> = {
    preferences: [t.preferencesLabel, t.preferencesHelp],
    statistics: [t.statistics, t.statisticsHelp],
    marketing: [t.marketing, t.marketingHelp],
  };
  const color = safeColor(config.banner.color);
  const policyLinks = [
    links.privacy ? `<a href="${escape(links.privacy)}">${escape(t.privacyPolicy)}</a>` : '',
    links.cookies ? `<a href="${escape(links.cookies)}">${escape(t.cookiePolicy)}</a>` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const gated = offered
    .map((category) => {
      const html = config.banner.scripts[category];
      return html ? gateHtml(html, category) : '';
    })
    .join('');

  return `<div id="cx-consent" class="cx-consent cx-consent--${config.banner.layout}" role="dialog" aria-labelledby="cx-consent-title" aria-describedby="cx-consent-text" hidden data-version="${escape(version)}" data-months="${Math.min(Math.max(config.banner.months, 1), 12)}" data-categories="${offered.join(',')}" data-consent-mode="${config.banner.consentMode ? '1' : '0'}" lang="${lang}">
<button type="button" class="cx-consent__close" data-cx="reject" aria-label="${escape(t.close)}" title="${escape(t.close)}">×</button>
<h2 id="cx-consent-title" class="cx-consent__title">${escape(title)}</h2>
<p id="cx-consent-text" class="cx-consent__text">${escape(message)}${policyLinks ? ` ${policyLinks}` : ''}</p>
<div class="cx-consent__choices" hidden>
<label class="cx-consent__choice"><input type="checkbox" checked disabled> <span><strong>${escape(t.necessary)}</strong> · ${escape(t.alwaysOn)}<br><small>${escape(t.necessaryHelp)}</small></span></label>
${offered
  .map(
    (c) =>
      `<label class="cx-consent__choice"><input type="checkbox" name="cx-category" value="${c}"> <span><strong>${escape(help[c][0])}</strong><br><small>${escape(help[c][1])}</small></span></label>`,
  )
  .join('\n')}
</div>
<div class="cx-consent__buttons">
<button type="button" class="cx-consent__button" data-cx="reject">${escape(t.reject)}</button>
${offered.length > 0 ? `<button type="button" class="cx-consent__button cx-consent__button--plain" data-cx="customize" aria-expanded="false">${escape(t.customize)}</button>` : ''}
<button type="button" class="cx-consent__button cx-consent__button--plain" data-cx="save" hidden>${escape(t.save)}</button>
<button type="button" class="cx-consent__button" data-cx="accept">${escape(t.accept)}</button>
</div>
</div>
${config.banner.floatingButton ? `<button type="button" class="cx-consent-reopen" data-cx-open hidden aria-label="${escape(t.preferences)}" title="${escape(t.preferences)}"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5Zm-4.5 9a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm3 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm-6-9a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg></button>` : ''}
${gated}
<style>${STYLE.replaceAll('COLOR', color)}</style>
<script>${SCRIPT.replace('CONSENT_PATH', CONSENT_PATH)}</script>`;
}

/**
 * The banner's controls are kept apart from the theme's global `button`
 * styles (padding, line-height, colours on hover and focus…): each one first
 * goes back to the browser's own look (`all: revert`), then gets this
 * plugin's values, under selectors that outweigh the usual theme rules
 * (`button`, `.button`, `body button:hover`, `.ast-button:focus`…) in every
 * state, without `!important`. The root class is doubled for the banner and
 * tripled for the floating button, which lives outside it.
 */
const ROOT = '.cx-consent.cx-consent';
const REOPEN = '.cx-consent-reopen.cx-consent-reopen.cx-consent-reopen';
const RESET =
  'all:revert;box-sizing:border-box;margin:0;font:inherit;text-transform:none;letter-spacing:normal;word-spacing:normal;text-align:center;text-indent:0;text-shadow:none;text-decoration:none;white-space:normal;box-shadow:none;min-width:0;min-height:0;max-width:none;max-height:none;opacity:1;filter:none;transform:none;transition:none;cursor:pointer;-webkit-appearance:none;appearance:none';

const STYLE = `.cx-consent{position:fixed;z-index:2147483000;box-sizing:border-box;background:#fff;color:#1f2937;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 -4px 24px rgba(0,0,0,.15);padding:1.25rem 3rem 1.25rem 1.5rem}
.cx-consent[hidden],.cx-consent [hidden],.cx-consent-reopen[hidden]{display:none!important}
.cx-consent--bar{left:0;right:0;bottom:0}
.cx-consent--box{left:1rem;bottom:1rem;max-width:26rem;border-radius:.75rem;box-shadow:0 8px 32px rgba(0,0,0,.2)}
.cx-consent__title{margin:0 0 .35rem;font-size:1.1rem;line-height:1.3;color:inherit}
.cx-consent__text{margin:0 0 1rem;max-width:62rem}
${ROOT} a,${ROOT} a:hover,${ROOT} a:focus{color:COLOR;text-decoration:underline}
.cx-consent__choices{display:grid;gap:.6rem;margin:0 0 1rem}
.cx-consent--bar .cx-consent__choices{grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.cx-consent__choice{display:flex;gap:.5rem;align-items:flex-start;cursor:pointer}
.cx-consent__choice input{margin-top:.3rem;accent-color:COLOR}
.cx-consent__choice small{color:#4b5563}
.cx-consent__buttons{display:flex;flex-wrap:wrap;gap:.5rem}
${ROOT} .cx-consent__button{${RESET};display:inline-block;width:auto;height:auto;font-weight:600;line-height:1.5;padding:.6rem 1.1rem;border-radius:.4rem;border:2px solid COLOR;background:COLOR;color:#fff}
${ROOT} .cx-consent__button--plain{background:transparent;color:COLOR}
${ROOT} .cx-consent__close{${RESET};position:absolute;top:.5rem;right:.6rem;display:block;width:2.25rem;height:2.25rem;padding:0;border:0;border-radius:.4rem;background:transparent;color:#374151;font-size:1.6rem;font-weight:400;line-height:1}
${REOPEN}{${RESET};position:fixed;z-index:2147482999;left:1rem;bottom:1rem;display:flex;align-items:center;justify-content:center;width:2.75rem;height:2.75rem;padding:0;border:0;border-radius:50%;background:COLOR;color:#fff;line-height:1;box-shadow:0 2px 10px rgba(0,0,0,.25)}
${REOPEN} svg{all:revert;display:block;flex:none;width:22px;height:22px;max-width:none;max-height:none;margin:0}
${REOPEN} svg path{fill:currentColor}
${ROOT} .cx-consent__button:focus-visible,${ROOT} .cx-consent__close:focus-visible,${REOPEN}:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}
@media (max-width:40rem){.cx-consent--box{left:.5rem;right:.5rem;bottom:.5rem;max-width:none}${ROOT} .cx-consent__button{flex:1 1 auto}}
@media print{.cx-consent,.cx-consent-reopen{display:none!important}}`;

/**
 * Shared by the built-in banner and the bridge of the external consent
 * managers: `release` runs the held scripts and loads the held iframes of the
 * accepted categories and removes their notices (`mark` hears each category released), `consentUpdate`
 * sends the choice to Google Consent Mode, `wire` makes the buttons of an
 * embed's notice answer (`allow(category)`, `open()`), also the notices in the page.
 */
export const SHARED_SCRIPT = `function release(ok,mark){
Array.prototype.forEach.call(document.querySelectorAll('script[type="text/plain"][data-cx-category]'),function(s){var k=s.getAttribute('data-cx-category');if(ok.indexOf(k)<0)return;if(mark)mark(k);var n=document.createElement('script');for(var i=0;i<s.attributes.length;i++){var a=s.attributes[i];if(a.name!=='type'&&a.name!=='data-cx-category'&&a.name!=='data-cx-type')n.setAttribute(a.name,a.value);}var t=s.getAttribute('data-cx-type');if(t)n.type=t;n.text=s.text;s.parentNode.replaceChild(n,s);});
Array.prototype.forEach.call(document.querySelectorAll('iframe[data-cx-src][data-cx-category]'),function(f){var k=f.getAttribute('data-cx-category');if(ok.indexOf(k)>=0&&!f.getAttribute('src')){if(mark)mark(k);var n=f.cloneNode(false);n.removeAttribute('srcdoc');n.removeAttribute('loading');n.setAttribute('src',f.getAttribute('data-cx-src'));f.parentNode.replaceChild(n,f);}});
Array.prototype.forEach.call(document.querySelectorAll('[data-cx-notice]'),function(n){if(ok.indexOf(n.getAttribute('data-cx-notice'))>=0&&n.parentNode)n.parentNode.removeChild(n);});}
function consentUpdate(ok){if(typeof window.gtag==='function'){var has=function(k){return ok.indexOf(k)>=0?'granted':'denied';};window.gtag('consent','update',{analytics_storage:has('statistics'),ad_storage:has('marketing'),ad_user_data:has('marketing'),ad_personalization:has('marketing'),functionality_storage:has('preferences'),personalization_storage:has('preferences')});}}
function wire(f,allow,open){try{var d=f.contentDocument;if(!d||!d.body||d.body.getAttribute('data-cx-wired'))return;d.body.setAttribute('data-cx-wired','1');d.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-cx-allow],[data-cx-open]');if(!b)return;e.preventDefault();if(b.hasAttribute('data-cx-allow'))allow(b.getAttribute('data-cx-allow'));else open();});}catch(x){}}
function wireAll(allow,open){Array.prototype.forEach.call(document.querySelectorAll('iframe[data-cx-src][srcdoc]'),function(f){f.addEventListener('load',function(){wire(f,allow,open);});wire(f,allow,open);});
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-cx-notice] [data-cx-allow]');if(!b)return;e.preventDefault();allow(b.getAttribute('data-cx-allow'));});}`;

/** Plain ES2017, no dependencies: runs on every page, before or without any framework. */
const SCRIPT = `(function(){
${SHARED_SCRIPT}
var root=document.getElementById('cx-consent');if(!root)return;
var V=root.getAttribute('data-version'),M=+root.getAttribute('data-months')||6;
var OFFERED=(root.getAttribute('data-categories')||'').split(',').filter(Boolean);
var CM=root.getAttribute('data-consent-mode')==='1';
var reopen=document.querySelector('.cx-consent-reopen');
var choices=root.querySelector('.cx-consent__choices');
var lastFocus=null;
function read(){try{var m=document.cookie.match(/(?:^|; )cx_consent=([^;]*)/);if(!m)return null;var c=JSON.parse(decodeURIComponent(m[1]));return c&&c.v===V?c:null;}catch(e){return null;}}
function id(){var a=new Uint8Array(12);(window.crypto||window.msCrypto).getRandomValues(a);return Array.prototype.map.call(a,function(b){return('0'+b.toString(16)).slice(-2);}).join('');}
function write(cats){var prev=read();var c={v:V,id:(prev&&prev.id)||id(),c:cats,t:Date.now()};
document.cookie='cx_consent='+encodeURIComponent(JSON.stringify(c))+'; Path=/; Max-Age='+(M*2592000)+'; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
try{fetch('CONSENT_PATH',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:c.id,categories:cats,version:V}),keepalive:true,credentials:'same-origin'});}catch(e){}
return c;}
function apply(c){var ok=c?c.c:[];
release(ok);
if(CM)consentUpdate(ok);
window.cleitextConsent.categories=ok.slice();
try{document.dispatchEvent(new CustomEvent('cleitext:consent',{detail:{categories:ok.slice()}}));}catch(e){}}
function boxes(){return root.querySelectorAll('input[name="cx-category"]');}
function customize(open){choices.hidden=!open;root.querySelector('[data-cx="save"]').hidden=!open;var b=root.querySelector('[data-cx="customize"]');if(b){b.hidden=open;b.setAttribute('aria-expanded',open?'true':'false');}}
function show(open){var c=read();Array.prototype.forEach.call(boxes(),function(b){b.checked=!!c&&c.c.indexOf(b.value)>=0;});customize(!!open);lastFocus=document.activeElement;root.hidden=false;if(reopen)reopen.hidden=true;var f=root.querySelector('[data-cx="reject"]:not(.cx-consent__close)');if(f)f.focus();}
function hide(){root.hidden=true;if(reopen)reopen.hidden=!read();if(lastFocus&&lastFocus.focus)lastFocus.focus();}
function done(cats){apply(write(cats));hide();}
window.cleitextConsent={categories:[],open:function(){show(true);},get:function(){var c=read();return c?c.c.slice():[];}};
function allow(k){var c=read();var cats=c?c.c.slice():[];if(cats.indexOf(k)<0)cats.push(k);done(cats);}
wireAll(allow,function(){show(true);});
root.addEventListener('click',function(e){var b=e.target.closest('[data-cx]');if(!b)return;var k=b.getAttribute('data-cx');
if(k==='accept')done(OFFERED.slice());else if(k==='reject')done([]);else if(k==='customize'){customize(true);var first=boxes()[0];if(first)first.focus();}
else if(k==='save')done(Array.prototype.filter.call(boxes(),function(x){return x.checked;}).map(function(x){return x.value;}));});
root.addEventListener('keydown',function(e){if(e.key==='Escape'){if(read())hide();else done([]);}});
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-cx-open],a[href$="#cookie-preferences"]');if(t){e.preventDefault();show(true);}});
var c=read();if(c){apply(c);if(reopen)reopen.hidden=false;}else{show(false);}
if(location.hash==='#cookie-preferences')show(true);
})();`;
