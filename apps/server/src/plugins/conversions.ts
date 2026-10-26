import type {
  ConversionEvent,
  ConversionInput,
  ConversionReversal,
  ConversionReversalInput,
  ReferralCapture,
} from '@cleitext/plugin-sdk';

/**
 * Paid conversions and referral links (plugin API 1.58): the checks of what
 * plugins announce and capture, the referral cookies and the small script
 * public pages carry. Pure functions; the plugin host and the public
 * service use them.
 */

const KINDS = ['order', 'booking', 'license', 'lead'] as const;
const DECIMAL_RE = /^-?\d{1,12}(\.\d{1,6})?$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A referral code: letters, digits, `-` and `_`. */
export const REFERRAL_CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** A query parameter a plugin may capture. */
const PARAM_RE = /^[a-z][a-z0-9_-]{0,31}$/i;
const SLUG_RE = /^[a-z][a-z0-9-]{1,39}$/;
/** Referral cookies: `cx_ref_<plugin slug>`. */
export const REFERRAL_COOKIE_PREFIX = 'cx_ref_';
/** Where the pages' script reports a visit through a referral link. */
export const REFERRAL_VISIT_PATH = '/_cx/referral';
/** Parameters never captured: the core's and common ones. */
const RESERVED_PARAMS = new Set([
  'page',
  'p',
  's',
  'q',
  'preview',
  'frame',
  'token',
  'redirect',
  'error',
  'lang',
  'key',
]);

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** A decimal amount, as plugins give it (string or number), normalized; null when invalid. */
export function decimalAmount(value: unknown): string | null {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!DECIMAL_RE.test(trimmed)) return null;
  // `1.50` stays as written, `-0` is 0.
  return Number(trimmed) === 0 ? '0' : trimmed;
}

function isoDate(value: unknown, now: Date): string {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return now.toISOString();
}

/** Referral codes by plugin slug, the valid ones only. */
export function cleanReferrals(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [slug, code] of Object.entries(value).slice(0, 20)) {
    if (SLUG_RE.test(slug) && typeof code === 'string' && REFERRAL_CODE_RE.test(code))
      result[slug] = code;
  }
  return result;
}

/** A conversion announced by `source`, checked; throws a TypeError saying what is wrong. */
export function cleanConversion(
  source: string,
  input: ConversionInput,
  now = new Date(),
): ConversionEvent {
  if (!input || typeof input !== 'object') throw new TypeError('A conversion is an object.');
  if (!(KINDS as readonly string[]).includes(input.kind))
    throw new TypeError(`Unknown conversion kind: ${String(input.kind)}`);
  const id = text(input.id, 200);
  if (!id) throw new TypeError('A conversion needs the id of what was converted.');
  const amount = decimalAmount(input.amount);
  if (amount === null || amount.startsWith('-'))
    throw new TypeError('The amount is a decimal string such as "49.90", 0 or more.');
  const currency = text(input.currency, 10).toUpperCase();
  if (currency ? !CURRENCY_RE.test(currency) : amount !== '0')
    throw new TypeError('The currency is an ISO 4217 code, e.g. EUR.');
  const email = text(input.customer?.email, 320).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new TypeError('The customer needs a valid email address.');
  const userId =
    typeof input.customer?.userId === 'string' && UUID_RE.test(input.customer.userId)
      ? input.customer.userId.toLowerCase()
      : null;
  const items = (Array.isArray(input.items) ? input.items : []).slice(0, 200).flatMap((item) => {
    const itemAmount = decimalAmount(item?.amount);
    const itemId = text(item?.id, 200);
    return itemAmount === null || !itemId
      ? []
      : [{ id: itemId, name: text(item?.name, 300), amount: itemAmount }];
  });
  const label = text(input.label, 200);
  return {
    source,
    kind: input.kind,
    id,
    amount,
    currency,
    customer: { email, userId },
    items,
    ...(label ? { label } : {}),
    at: isoDate(input.at, now),
    referrals: cleanReferrals(input.referrals),
  };
}

/** A refund or cancellation announced by `source`, checked. */
export function cleanReversal(
  source: string,
  input: ConversionReversalInput,
  now = new Date(),
): ConversionReversal {
  if (!input || typeof input !== 'object') throw new TypeError('A reversal is an object.');
  const id = text(input.id, 200);
  if (!id) throw new TypeError('A reversal needs the id given to conversions.paid.');
  let amount: string | undefined;
  if (input.amount !== undefined && input.amount !== null) {
    const value = decimalAmount(input.amount);
    if (value === null || value.startsWith('-') || value === '0')
      throw new TypeError('The amount taken back is a decimal string above 0.');
    amount = value;
  }
  return {
    source,
    id,
    ...(amount ? { amount } : {}),
    reason: input.reason === 'cancel' ? 'cancel' : 'refund',
    at: isoDate(input.at, now),
  };
}

/** A capture as the core uses it: the plugin's slug with its checked settings. */
export interface SiteCapture {
  plugin: string;
  param: string;
  category: ReferralCapture['category'];
  days: number;
  model: 'first' | 'last';
}

/** A plugin's answer to `ctx.referrals.capture`, checked; null when it captures nothing. */
export function cleanCapture(plugin: string, value: unknown): SiteCapture | null {
  if (!value || typeof value !== 'object') return null;
  const capture = value as Partial<ReferralCapture>;
  const param = text(capture.param, 32);
  if (!PARAM_RE.test(param) || RESERVED_PARAMS.has(param.toLowerCase())) return null;
  if (!['preferences', 'statistics', 'marketing'].includes(capture.category as string)) return null;
  const days = Math.round(Number(capture.days));
  return {
    plugin,
    param,
    category: capture.category!,
    days: Number.isFinite(days) ? Math.min(Math.max(days, 1), 365) : 30,
    model: capture.model === 'first' ? 'first' : 'last',
  };
}

/**
 * The address without the captured parameters: the page cache's key and
 * the query the page is rendered with. Unchanged (the same string) when it
 * has none of them.
 */
export function withoutReferralParams(url: string, params: readonly string[]): string {
  const at = url.indexOf('?');
  if (at === -1 || params.length === 0) return url;
  const hash = url.indexOf('#', at);
  const query = url.slice(at + 1, hash === -1 ? undefined : hash);
  const names = new Set(params);
  const kept = query.split('&').filter((pair) => {
    if (!pair) return false;
    const name = pair.split('=')[0]!;
    let decoded = name;
    try {
      decoded = decodeURIComponent(name.replace(/\+/g, ' '));
    } catch {
      // Kept as written.
    }
    return !names.has(decoded);
  });
  if (kept.length === query.split('&').filter(Boolean).length) return url;
  return `${url.slice(0, at)}${kept.length ? `?${kept.join('&')}` : ''}`;
}

/** The referral codes in a request's cookies, by plugin slug. */
export function referralCookies(
  cookies: Record<string, string | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(cookies)) {
    if (!name.startsWith(REFERRAL_COOKIE_PREFIX) || typeof value !== 'string') continue;
    const slug = name.slice(REFERRAL_COOKIE_PREFIX.length).replace(/_/g, '-');
    let code: string;
    try {
      code = decodeURIComponent(value);
    } catch {
      continue;
    }
    if (SLUG_RE.test(slug) && REFERRAL_CODE_RE.test(code)) result[slug] = code;
  }
  return result;
}

/** The cookie name of a plugin's referral code (dashes become underscores). */
export function referralCookieName(slug: string): string {
  return `${REFERRAL_COOKIE_PREFIX}${slug.replace(/-/g, '_')}`;
}

/**
 * The script public pages carry when plugins capture referral links. The
 * same for every visitor (pages stay cached): it reads the parameter in the
 * browser, removes it from the address bar, reports the visit and keeps the
 * code in a first-party cookie only once the visitor consented to the
 * category (`window.cleitextConsent` and the `cleitext:consent` event of
 * Privacy & GDPR). Without a consent banner nothing is stored.
 */
export function referralScript(captures: readonly SiteCapture[]): string {
  const config = captures.map((c) => ({
    s: c.plugin,
    n: referralCookieName(c.plugin),
    q: c.param,
    c: c.category,
    d: c.days,
    f: c.model === 'first' ? 1 : 0,
  }));
  // `<` escaped: the JSON cannot close the script.
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<script data-cx-referrals>(function(C){try{var u=new URL(location.href),hits=[];C.forEach(function(r){var v=u.searchParams.get(r.q);if(v===null)return;u.searchParams.delete(r.q);if(${REFERRAL_CODE_RE.toString()}.test(v))hits.push([r,v]);});if(u.href===location.href)return;try{history.replaceState(history.state,'',u.pathname+u.search+u.hash);}catch(e){}
var ref=null;try{ref=document.referrer?new URL(document.referrer).host:null;}catch(e){}
hits.forEach(function(h){var r=h[0],v=h[1],done=false;
function has(){return document.cookie.split('; ').some(function(c){return c.indexOf(r.n+'=')===0;});}
function store(){if(done)return true;done=true;if(r.f&&has())return true;document.cookie=r.n+'='+encodeURIComponent(v)+'; Max-Age='+(r.d*86400)+'; Path=/; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');return true;}
function ok(list){return!!list&&list.indexOf(r.c)>=0;}
function now(){var c=window.cleitextConsent;return!!(c&&typeof c.get==='function'&&ok(c.get()));}
function send(stored){try{var b=JSON.stringify({plugin:r.s,code:v,path:location.pathname,referrer:ref,stored:stored});if(!(navigator.sendBeacon&&navigator.sendBeacon('${REFERRAL_VISIT_PATH}',new Blob([b],{type:'application/json'}))))fetch('${REFERRAL_VISIT_PATH}',{method:'POST',headers:{'content-type':'application/json'},body:b,keepalive:true,credentials:'same-origin'});}catch(e){}}
function start(){var stored=now()&&store();send(stored);if(!stored)document.addEventListener('cleitext:consent',function(e){if(ok(e.detail&&e.detail.categories))store();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();});}catch(e){}})(${json});</script>`;
}

/** A `referral.visit` sent by a page, checked against the site's captures; null when invalid. */
export function cleanVisit(
  body: unknown,
  captures: readonly SiteCapture[],
): { plugin: string; code: string; path: string; referrer: string | null; stored: boolean } | null {
  if (!body || typeof body !== 'object') return null;
  const input = body as Record<string, unknown>;
  const plugin = text(input.plugin, 40);
  if (!captures.some((c) => c.plugin === plugin)) return null;
  const code = text(input.code, 64);
  if (!REFERRAL_CODE_RE.test(code)) return null;
  const path = text(input.path, 500);
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const referrer = text(input.referrer, 255);
  return {
    plugin,
    code,
    path,
    referrer: /^[a-z0-9.-]+(:\d{1,5})?$/i.test(referrer) ? referrer.toLowerCase() : null,
    stored: input.stored === true,
  };
}
