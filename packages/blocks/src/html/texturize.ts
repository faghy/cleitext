/**
 * WordPress's typography (wptexturize), for content brought in from
 * WordPress: what readers saw there was straight quotes turned into curly
 * ones, `--` and `---` into dashes, `...` into an ellipsis and `2x3` into
 * `2×3`. WordPress does it on every page view; an import does it once.
 *
 * As in WordPress, each run of text between tags is handled on its own, and
 * comments (block delimiters), attributes, shortcodes (`[gallery ids="1"]`)
 * and the content of code, pre, script, style, kbd, tt and textarea are left
 * as they are.
 */

const SKIP = new Set(['code', 'pre', 'script', 'style', 'kbd', 'tt', 'textarea', 'samp', 'var']);

const S = String.raw`(?:\s|&nbsp;|\u00a0)`;
const OPEN_S = '‘';
const CLOSE_S = '’';
const OPEN_D = '“';
const CLOSE_D = '”';
const PRIME = '′';
const DOUBLE_PRIME = '″';
const APOS = '’';

/** wptexturize for one run of text (no tags). */
export function texturizeText(text: string): string {
  if (!/['"\-.x`(]/.test(text)) return text;
  let t = text
    .replaceAll('...', '…')
    .replaceAll('``', OPEN_D)
    .replaceAll("''", CLOSE_D)
    .replace(/ \(tm\)/gi, ' ™');

  if (t.includes("'")) {
    // '99 and '99s: an apostrophe before a decade.
    t = t.replace(/'(?=\d\d(?:$|(?![%\d]|[.,]\d)))/g, APOS);
    // Quoted numbers like '0.42'.
    t = t.replace(new RegExp(String.raw`(?<=^|${S})'(\d[.,\d]*)'`, 'g'), `${OPEN_S}$1${CLOSE_S}`);
    // At the start, or after ( { [ < " - or a space: an opening quote.
    t = t.replace(new RegExp(String.raw`(?<=^|[([{"\-<]|${S})'`, 'g'), OPEN_S);
    // Inside a word: an apostrophe.
    t = t.replace(
      new RegExp(String.raw`(?<!${S})'(?!$|[.,:;!?"'(){}[\]\-]|&[lg]t;|${S})`, 'g'),
      APOS,
    );
  }
  if (t.includes('"')) {
    t = t.replace(new RegExp(String.raw`(?<=^|${S})"(\d[.,\d]*)"`, 'g'), `${OPEN_D}$1${CLOSE_D}`);
    t = t.replace(new RegExp(String.raw`(?<=^|[([{\-<]|${S})"(?!${S})`, 'g'), OPEN_D);
  }
  if (t.includes('-')) {
    t = t
      .replace(/---/g, '—')
      .replace(new RegExp(String.raw`(?<=^|${S})--(?=$|${S})`, 'g'), '—')
      .replace(/(?<!xn)--/g, '–')
      .replace(new RegExp(String.raw`(?<=^|${S})-(?=$|${S})`, 'g'), '–');
  }
  // What is left: primes after digits, closing quotes otherwise.
  t = t.replace(/(?<=\d)'/g, PRIME).replace(/'/g, CLOSE_S);
  t = t.replace(/(?<=\d)"/g, DOUBLE_PRIME).replace(/"/g, CLOSE_D);
  // 2x3 → 2×3.
  t = t.replace(/\b(\d[\d.,]*)x(\d[\d.,]*)\b/g, '$1×$2');
  return t;
}

const TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g;

/** wptexturize for HTML: only the text between tags changes. */
export function texturizeHtml(html: string): string {
  let out = '';
  const open: string[] = [];
  for (const match of html.matchAll(TOKEN)) {
    const [whole, rawTag] = match;
    if (whole.startsWith('<!--') || rawTag !== undefined) {
      if (rawTag) {
        const tag = rawTag.toLowerCase();
        if (SKIP.has(tag)) {
          if (whole.startsWith('</')) {
            const index = open.lastIndexOf(tag);
            if (index !== -1) open.splice(index);
          } else if (!whole.endsWith('/>')) {
            open.push(tag);
          }
        }
      }
      out += whole;
      continue;
    }
    out += open.length > 0 || whole === '<' ? whole : outsideShortcodes(whole);
  }
  return out;
}

/** Text with shortcodes kept as they are, as WordPress does. */
function outsideShortcodes(text: string): string {
  return text
    .split(/(\[\/?[a-z][\w-]*(?:[^[\]]*)\])/i)
    .map((part, i) => (i % 2 === 1 ? part : texturizeText(part)))
    .join('');
}
