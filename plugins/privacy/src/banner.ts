import { CATEGORIES, textsFor, type Category, type PrivacyConfig } from './config';

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

/** Google Consent Mode v2 defaults, before any Google tag: everything denied until chosen. */
export function consentModeScript(version: number): string {
  return `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}(function(){var g={ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'denied',personalization_storage:'denied',security_storage:'granted',wait_for_update:500};try{var m=document.cookie.match(/(?:^|; )cx_consent=([^;]*)/);var c=m&&JSON.parse(decodeURIComponent(m[1]));if(c&&c.v===${version}){var k=c.c||[];if(k.indexOf('statistics')>=0)g.analytics_storage='granted';if(k.indexOf('marketing')>=0){g.ad_storage='granted';g.ad_user_data='granted';g.ad_personalization='granted';}if(k.indexOf('preferences')>=0){g.functionality_storage='granted';g.personalization_storage='granted';}}}catch(e){}gtag('consent','default',g);})();</script>`;
}

export interface BannerLinks {
  privacy?: string;
  cookies?: string;
}

export function bannerHtml(config: PrivacyConfig, locale: string, links: BannerLinks): string {
  const t = textsFor(locale);
  const lang = locale.toLowerCase().startsWith('it') ? 'it' : 'en';
  const title = config.banner.title[locale] || config.banner.title[lang] || t.title;
  const message = config.banner.message[locale] || config.banner.message[lang] || t.message;
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

  return `<div id="cx-consent" class="cx-consent cx-consent--${config.banner.layout}" role="dialog" aria-labelledby="cx-consent-title" aria-describedby="cx-consent-text" hidden data-version="${config.version}" data-months="${Math.min(Math.max(config.banner.months, 1), 12)}" data-categories="${offered.join(',')}" data-consent-mode="${config.banner.consentMode ? '1' : '0'}" lang="${lang}">
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

const STYLE = `.cx-consent{position:fixed;z-index:2147483000;box-sizing:border-box;background:#fff;color:#1f2937;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 -4px 24px rgba(0,0,0,.15);padding:1.25rem 3rem 1.25rem 1.5rem}
.cx-consent[hidden],.cx-consent [hidden],.cx-consent-reopen[hidden]{display:none!important}
.cx-consent--bar{left:0;right:0;bottom:0}
.cx-consent--box{left:1rem;bottom:1rem;max-width:26rem;border-radius:.75rem;box-shadow:0 8px 32px rgba(0,0,0,.2)}
.cx-consent__title{margin:0 0 .35rem;font-size:1.1rem;line-height:1.3;color:inherit}
.cx-consent__text{margin:0 0 1rem;max-width:62rem}
.cx-consent a{color:COLOR;text-decoration:underline}
.cx-consent__choices{display:grid;gap:.6rem;margin:0 0 1rem}
.cx-consent--bar .cx-consent__choices{grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.cx-consent__choice{display:flex;gap:.5rem;align-items:flex-start;cursor:pointer}
.cx-consent__choice input{margin-top:.3rem;accent-color:COLOR}
.cx-consent__choice small{color:#4b5563}
.cx-consent__buttons{display:flex;flex-wrap:wrap;gap:.5rem}
.cx-consent__button{font:inherit;font-weight:600;padding:.6rem 1.1rem;border-radius:.4rem;border:2px solid COLOR;background:COLOR;color:#fff;cursor:pointer}
.cx-consent__button--plain{background:transparent;color:COLOR}
.cx-consent__button:focus-visible,.cx-consent__close:focus-visible,.cx-consent-reopen:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}
.cx-consent__close{position:absolute;top:.5rem;right:.6rem;width:2.25rem;height:2.25rem;border:0;background:transparent;color:#374151;font-size:1.6rem;line-height:1;cursor:pointer;border-radius:.4rem}
.cx-consent-reopen{position:fixed;z-index:2147482999;left:1rem;bottom:1rem;width:2.75rem;height:2.75rem;border-radius:50%;border:0;background:COLOR;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;justify-content:center}
@media (max-width:40rem){.cx-consent--box{left:.5rem;right:.5rem;bottom:.5rem;max-width:none}.cx-consent__button{flex:1 1 auto}}
@media print{.cx-consent,.cx-consent-reopen{display:none!important}}`;

/** Plain ES2017, no dependencies: runs on every page, before or without any framework. */
const SCRIPT = `(function(){
var root=document.getElementById('cx-consent');if(!root)return;
var V=+root.getAttribute('data-version'),M=+root.getAttribute('data-months')||6;
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
Array.prototype.forEach.call(document.querySelectorAll('script[type="text/plain"][data-cx-category]'),function(s){if(ok.indexOf(s.getAttribute('data-cx-category'))<0)return;var n=document.createElement('script');for(var i=0;i<s.attributes.length;i++){var a=s.attributes[i];if(a.name!=='type'&&a.name!=='data-cx-category'&&a.name!=='data-cx-type')n.setAttribute(a.name,a.value);}var t=s.getAttribute('data-cx-type');if(t)n.type=t;n.text=s.text;s.parentNode.replaceChild(n,s);});
Array.prototype.forEach.call(document.querySelectorAll('iframe[data-cx-src][data-cx-category]'),function(f){if(ok.indexOf(f.getAttribute('data-cx-category'))>=0&&!f.getAttribute('src'))f.setAttribute('src',f.getAttribute('data-cx-src'));});
if(CM&&typeof window.gtag==='function'){var has=function(k){return ok.indexOf(k)>=0?'granted':'denied';};window.gtag('consent','update',{analytics_storage:has('statistics'),ad_storage:has('marketing'),ad_user_data:has('marketing'),ad_personalization:has('marketing'),functionality_storage:has('preferences'),personalization_storage:has('preferences')});}
window.cleitextConsent.categories=ok.slice();
try{document.dispatchEvent(new CustomEvent('cleitext:consent',{detail:{categories:ok.slice()}}));}catch(e){}}
function boxes(){return root.querySelectorAll('input[name="cx-category"]');}
function customize(open){choices.hidden=!open;root.querySelector('[data-cx="save"]').hidden=!open;var b=root.querySelector('[data-cx="customize"]');if(b){b.hidden=open;b.setAttribute('aria-expanded',open?'true':'false');}}
function show(open){var c=read();Array.prototype.forEach.call(boxes(),function(b){b.checked=!!c&&c.c.indexOf(b.value)>=0;});customize(!!open);lastFocus=document.activeElement;root.hidden=false;if(reopen)reopen.hidden=true;var f=root.querySelector('[data-cx="reject"]:not(.cx-consent__close)');if(f)f.focus();}
function hide(){root.hidden=true;if(reopen)reopen.hidden=!read();if(lastFocus&&lastFocus.focus)lastFocus.focus();}
function done(cats){apply(write(cats));hide();}
window.cleitextConsent={categories:[],open:function(){show(true);},get:function(){var c=read();return c?c.c.slice():[];}};
root.addEventListener('click',function(e){var b=e.target.closest('[data-cx]');if(!b)return;var k=b.getAttribute('data-cx');
if(k==='accept')done(OFFERED.slice());else if(k==='reject')done([]);else if(k==='customize'){customize(true);var first=boxes()[0];if(first)first.focus();}
else if(k==='save')done(Array.prototype.filter.call(boxes(),function(x){return x.checked;}).map(function(x){return x.value;}));});
root.addEventListener('keydown',function(e){if(e.key==='Escape'){if(read())hide();else done([]);}});
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-cx-open],a[href$="#cookie-preferences"]');if(t){e.preventDefault();show(true);}});
var c=read();if(c){apply(c);if(reopen)reopen.hidden=false;}else{show(false);}
if(location.hash==='#cookie-preferences')show(true);
})();`;
