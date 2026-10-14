/**
 * Texts of the chat window, ported from Joinchat 6.4.2 by Creame
 * (Joinchat_Formatter, Joinchat_Util; GPL-2.0-or-later): WhatsApp-style
 * formatting, links, buttons, images, random texts, notes and variables.
 */

/** Values of {SITE}, {TITLE}, {URL}, {HREF} and {HOME} on the page being shown. */
export interface Variables {
  site: string;
  title: string;
  url: string;
  home: string;
}

type Context = 'raw' | 'html';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** WhatsApp number: digits only, without leading zeros (Joinchat_Util::clean_whatsapp). */
export function cleanPhone(number: unknown): string {
  let clean = (typeof number === 'string' ? number : '').replace(/^0+|\D/g, '').replace(/^0+/, '');
  // Argentina: a 9 after the country code, without the 15 prefix.
  clean = clean.replace(/^54([0-8])/, '549$1').replace(/^(54\d{5})15(\d{6})/, '$1$2');
  // Mexico: a 1 after the country code.
  clean = clean.replace(/^52([02-9])/, '521$1');
  return clean;
}

export function replaceVariables(text: string, vars: Variables, context: Context): string {
  const values: Record<string, string> = {
    SITE: vars.site,
    TITLE: vars.title,
    URL: vars.url,
    HREF: vars.url,
    HOME: vars.home,
  };
  return text.replace(/\{([A-Z]+)\}/g, (match, name: string) => {
    const value = values[name];
    if (value === undefined) return match;
    return context === 'html' ? escapeHtml(value) : value;
  });
}

/** `{}` in an override: an empty value on purpose. */
export function override(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  return value.trim() === '{}' ? '' : value;
}

/** Theme color as Joinchat's CSS variables: hue, saturation, lightness, text black or white. */
export function colorVars(hex: string, whiteText: boolean): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim()) ?? [
    '',
    '25',
    'd3',
    '66',
  ];
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((x) => parseInt(x, 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return `--ch:${Math.round(h * 360)};--cs:${Math.round(s * 100)}%;--cl:${Math.round(l * 100)}%;--bw:${whiteText ? 1 : 0}`;
}

// ---- Rich text of the chat window ---------------------------------------------------

/** Variables kept apart while formatting, so their names are never formatted. */
const KEEP = /\{([A-Z]+)\}/g;
const RESTORE = /&lcub;([A-Z]+)&rcub;/g;

function safeUrl(href: string): string | null {
  const url = href.trim();
  if (/^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(url)) return url;
  return null;
}

export function formattedMessage(text: string, vars: Variables): string {
  if (!text.trim()) return '';
  const restore = (s: string, context: Context) =>
    replaceVariables(s.replace(RESTORE, '{$1}'), vars, context);

  const link = (href: string, label: string | undefined, className?: string) => {
    const target = safeUrl(restore(decode(href), 'raw'));
    const shown = label
      ? restore(label, 'html')
      : escapeHtml((target ?? href).replace(/^https?:\/\//, ''));
    if (!target) return shown;
    let external: boolean;
    try {
      external = new URL(target, vars.home).host !== new URL(vars.home).host;
    } catch {
      external = false;
    }
    return `<a href="${escapeHtml(target)}"${className ? ` class="${className}"` : ''}${
      external ? ' rel="external nofollow noopener noreferrer" target="_blank"' : ''
    }>${shown}</a>`;
  };
  const image = (src: string, width: string | undefined, alt: string | undefined) => {
    const url = safeUrl(restore(decode(src), 'raw'));
    if (!url) return '';
    const w = width ? ` width="${Number(width)}"` : '';
    if (/\.(webm|mp4)(\?|$)/i.test(url)) {
      return `<video src="${escapeHtml(url)}"${w} autoplay loop muted playsinline></video>`;
    }
    return `<img src="${escapeHtml(url)}" alt="${alt ? restore(alt, 'html') : ''}"${w} loading="lazy">`;
  };

  // Line by line, as in Joinchat: escaped first, then formatted.
  const rules: [RegExp, string | ((...groups: string[]) => string)][] = [
    [KEEP, '&lcub;$1&rcub;'],
    [/(^|\W)\*\*(.+?)\*\*(\W|$)/g, '$1*$2*$3'],
    [/(^|\W)__(.+?)__(\W|$)/g, '$1*$2*$3'],
    [/(^|\W)_(.+?)_(\W|$)/g, '$1<em>$2</em>$3'],
    [/(^|\W)\*(.+?)\*(\W|$)/g, '$1<strong>$2</strong>$3'],
    [/(^|\W)~(.+?)~(\W|$)/g, '$1<del>$2</del>$3'],
    [/(^|\W)`(.+?)`(\W|$)/g, '$1<code>$2</code>$3'],
    [/^-{3,}$/g, '<hr>'],
    [/!\[(.*?)\]\(([^) ]*)(?: (\d+))?\)/g, (_m, alt, src, w) => image(src!, w, alt)],
    [/\[([^[\]]+)?\]\(([^)]+)\)/g, (_m, label, href) => link(href!, label)],
    [/\{IMG ([^ }]+)(?: (\d+))?(?: ([^}]+))?\}/g, (_m, src, w, alt) => image(src!, w, alt)],
    [/\{LINK ([^ }]+)(?: ([^}]+))?\}/g, (_m, href, label) => link(href!, label)],
    [/\{BTN ([^ }]+)(?: ([^}]+))?\}/g, (_m, href, label) => link(href!, label, 'joinchat__btn')],
    [
      /\{RAND ([^}]+)\}/g,
      (_m, options) =>
        `<jc-rand>${options!
          .replace(RESTORE, '{$1}')
          .split('||')
          .map((o) => `<jc-opt>${replaceVariables(o.trim(), vars, 'html')}</jc-opt>`)
          .join('')}</jc-rand>`,
    ],
    [RESTORE, '{$1}'],
  ];
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      let out = escapeHtml(line);
      for (const [pattern, replacement] of rules) {
        out =
          typeof replacement === 'string'
            ? out.replace(pattern, replacement)
            : out.replace(pattern, replacement as (...args: string[]) => string);
      }
      return out;
    });

  let formatted = replaceVariables(lines.join('<br>'), vars, 'html');
  // Notes (outside the bubbles): lines of ">>>".
  formatted = formatted
    .replace(/^(?:&gt;){3,}<br>/, '>>>')
    .replace(/<br>(?:&gt;){3,}<br>/g, '<br>===<br>>>>')
    .replace(/^={3,}<br>/, '');

  return formatted
    .split(/<br>={3,}<br>/)
    .map((message) => {
      let className = '';
      let body = message;
      if (body.startsWith('>>>')) {
        className = ' joinchat__bubble--note';
        body = body.slice(3);
      } else if (body.replace(/<[^>]*>/g, '').trim() === '') {
        className = ' joinchat__bubble--media';
      }
      return `<div class="joinchat__bubble${className}">${body}</div>`;
    })
    .join('\n')
    .replace(/ src="/g, ' data-src="'); // loaded when the window opens
}

/** HTML-escaped text back to what was written, for addresses. */
function decode(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** JSON for a single-quoted HTML attribute. */
export function attrJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/'/g, '\\u0027')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}
