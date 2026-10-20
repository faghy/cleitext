/**
 * The maintenance page: a whole HTML document with its styles inline (no
 * fonts, scripts or other files), so it works with any theme and under the
 * public Content Security Policy.
 */

export type Mode = 'maintenance' | 'coming-soon';

/** Title and message written for one language; empty uses the default text. */
export interface PageTexts {
  title: string;
  message: string;
}

export interface MaintenanceConfig {
  mode: Mode;
  /** Texts by language code (`en`, `it`…). */
  texts: Record<string, PageTexts>;
  /** When the site is expected back (ISO 8601), or null. */
  returnAt: string | null;
  /** An address visitors can write to, or empty. */
  email: string;
  colors: { background: string; text: string; accent: string };
  /** The site's logo, else its icon, else its title, above the text. */
  showLogo: boolean;
}

export const DEFAULT_COLORS: MaintenanceConfig['colors'] = {
  background: '#f8fafc',
  text: '#0f172a',
  accent: '#0369a1',
};

export const DEFAULT_CONFIG: MaintenanceConfig = {
  mode: 'maintenance',
  texts: {},
  returnAt: null,
  email: '',
  colors: DEFAULT_COLORS,
  showLogo: true,
};

const HEX = /^#[0-9a-f]{6}$/i;
const EMAIL = /^[^\s@<>"'()[\]\\,;:]+@[^\s@<>"'()[\]\\,;:]+\.[^\s@<>"'()[\]\\,;:]+$/;
const LOCALE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i;

/** Built-in texts by language; other languages use English. */
const STRINGS = {
  en: {
    maintenance: { title: 'Site under maintenance', message: 'We’ll be back soon.' },
    'coming-soon': { title: 'Coming soon', message: 'We’re getting something new ready for you.' },
    back: 'Back on {date}',
    contact: 'Get in touch:',
    madeWith: 'Made with Cleitext',
  },
  it: {
    maintenance: { title: 'Sito in manutenzione', message: 'Torniamo presto.' },
    'coming-soon': {
      title: 'Prossimamente',
      message: 'Stiamo preparando qualcosa di nuovo per te.',
    },
    back: 'Di nuovo online il {date}',
    contact: 'Per contattarci:',
    madeWith: 'Realizzato con Cleitext',
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

export function stringsFor(locale: string): Strings {
  return locale.toLowerCase().startsWith('it') ? STRINGS.it : STRINGS.en;
}

/** The built-in title and message of a mode in a language. */
export function defaultTexts(mode: Mode, locale: string): PageTexts {
  return { ...stringsFor(locale)[mode] };
}

/** Stored values, made safe: anything unknown or invalid becomes the default. */
export function normalizeConfig(value: unknown): MaintenanceConfig {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const colors = (v.colors && typeof v.colors === 'object' ? v.colors : {}) as Record<
    string,
    unknown
  >;
  const color = (key: keyof MaintenanceConfig['colors']) =>
    typeof colors[key] === 'string' && HEX.test(colors[key])
      ? colors[key].toLowerCase()
      : DEFAULT_COLORS[key];
  const texts: Record<string, PageTexts> = {};
  if (v.texts && typeof v.texts === 'object') {
    for (const [locale, entry] of Object.entries(v.texts as Record<string, unknown>)) {
      if (!LOCALE.test(locale) || !entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const title = typeof e.title === 'string' ? e.title.trim().slice(0, 200) : '';
      const message = typeof e.message === 'string' ? e.message.trim().slice(0, 2000) : '';
      if (title || message) texts[locale] = { title, message };
    }
  }
  const returnAt =
    typeof v.returnAt === 'string' && v.returnAt && !Number.isNaN(Date.parse(v.returnAt))
      ? new Date(v.returnAt).toISOString()
      : null;
  const email = typeof v.email === 'string' ? v.email.trim() : '';
  return {
    mode: v.mode === 'coming-soon' ? 'coming-soon' : 'maintenance',
    texts,
    returnAt,
    email: email.length <= 254 && EMAIL.test(email) ? email : '',
    colors: { background: color('background'), text: color('text'), accent: color('accent') },
    showLogo: typeof v.showLogo === 'boolean' ? v.showLogo : true,
  };
}

/** Seconds until the return date when it is in the future (for `Retry-After`). */
export function secondsUntil(returnAt: string | null, now = Date.now()): number | undefined {
  if (!returnAt) return undefined;
  const seconds = Math.ceil((Date.parse(returnAt) - now) / 1000);
  return seconds > 0 ? seconds : undefined;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The return date in the visitor's language and the site's time zone. */
export function formatDate(iso: string, locale: string, timeZone: string): string {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: 'short' };
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
  } catch {
    // An unknown language or time zone: English, UTC.
    return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(date);
  }
}

/** The Cleitext mark (apps/admin/public/brand/logo-mark.svg), decorative. */
const CLEITEXT_MARK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="20" height="20" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="15" fill="#0369a1"/><path d="M38.5 22.5 A13.5 13.5 0 1 0 38.5 41.5" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><rect x="43" y="19" width="5" height="26" rx="2.5" fill="#7dd3fc"/></svg>';

export interface PageInput {
  config: MaintenanceConfig;
  locale: string;
  defaultLocale: string;
  site: { title: string; timezone: string; logoUrl?: string; iconUrl?: string };
  /** For tests: the current time. */
  now?: number;
}

/** The texts shown in a language: the ones written for it, else the built-in ones. */
export function textsFor(
  config: MaintenanceConfig,
  locale: string,
  defaultLocale: string,
): PageTexts {
  const builtIn = defaultTexts(config.mode, locale);
  // Languages without built-in texts fall back on those written for the default language.
  const known = /^(en|it)\b/i.test(locale);
  const fallback = known ? builtIn : { ...builtIn, ...pick(config.texts[defaultLocale]) };
  const own = config.texts[locale];
  return {
    title: own?.title || fallback.title,
    message: own?.message || fallback.message,
  };
}

function pick(texts: PageTexts | undefined): Partial<PageTexts> {
  const out: Partial<PageTexts> = {};
  if (texts?.title) out.title = texts.title;
  if (texts?.message) out.message = texts.message;
  return out;
}

/** Only addresses the page may load: http(s), or the site's own paths. */
function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** The whole document. */
export function renderPage(input: PageInput): string {
  const { config, site } = input;
  const locale = LOCALE.test(input.locale) ? input.locale : 'en';
  const t = stringsFor(locale);
  const texts = textsFor(config, locale, input.defaultLocale);
  const { background, text, accent } = config.colors;
  const now = input.now ?? Date.now();

  let brand = '';
  if (config.showLogo) {
    const image = safeUrl(site.logoUrl) ?? safeUrl(site.iconUrl);
    brand = image
      ? `<img class="brand-image${safeUrl(site.logoUrl) ? '' : ' brand-icon'}" src="${escapeHtml(image)}" alt="${escapeHtml(site.title)}">`
      : `<span class="brand-name">${escapeHtml(site.title)}</span>`;
    brand = `<div class="brand">${brand}</div>`;
  }
  const message = escapeHtml(texts.message)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join('<br>');
  const back =
    config.returnAt && Date.parse(config.returnAt) > now
      ? `<p class="when">${escapeHtml(t.back).replace(
          '{date}',
          `<time datetime="${escapeHtml(config.returnAt)}">${escapeHtml(formatDate(config.returnAt, locale, site.timezone))}</time>`,
        )}</p>`
      : '';
  const contact = config.email
    ? `<p class="contact">${escapeHtml(t.contact)} <a href="mailto:${escapeHtml(encodeURI(config.email))}">${escapeHtml(config.email)}</a></p>`
    : '';
  const icon = safeUrl(site.iconUrl);
  const pageTitle = site.title ? `${texts.title} – ${site.title}` : texts.title;

  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(pageTitle)}</title>
${icon ? `<link rel="icon" href="${escapeHtml(icon)}">\n` : ''}<style>
:root{--bg:${background};--fg:${text};--accent:${accent}}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font:400 1.0625rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-text-size-adjust:100%}
main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:3rem 1.25rem;width:100%;max-width:40rem;margin:0 auto}
.brand{margin-bottom:2rem}
.brand-image{display:block;max-width:min(16rem,70vw);max-height:6rem;width:auto;height:auto}
.brand-icon{max-height:4rem}
.brand-name{font-size:1.25rem;font-weight:600;letter-spacing:.01em}
.bar{width:3rem;height:.25rem;border-radius:1rem;background:var(--accent);margin:0 auto 1.5rem}
h1{font-size:clamp(1.75rem,5vw,2.75rem);line-height:1.2;margin:0 0 1rem;font-weight:700}
p{margin:0 0 1rem}
.message{font-size:1.125rem;opacity:.9}
.when{font-weight:600;color:var(--accent)}
a{color:var(--accent);text-underline-offset:.15em}
a:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:2px}
footer{padding:1.5rem 1rem;text-align:center;font-size:.875rem}
footer a{display:inline-flex;align-items:center;gap:.5rem;color:inherit;opacity:.75;text-decoration:none}
footer a:hover,footer a:focus-visible{opacity:1;text-decoration:underline}
footer svg{flex:none}
</style>
</head>
<body>
<main>
${brand}<div class="bar" aria-hidden="true"></div>
<h1>${escapeHtml(texts.title)}</h1>
<p class="message">${message}</p>
${back}${contact}</main>
<footer><a href="https://cleitext.com" rel="noopener">${CLEITEXT_MARK}<span>${escapeHtml(t.madeWith)}</span></a></footer>
</body>
</html>
`;
}
