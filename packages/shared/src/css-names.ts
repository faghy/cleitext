/**
 * Class and id names of imported CSS renamed for the active theme (core
 * 0.82): a theme whose markup uses another theme's classes with its own
 * prefix (`importCssPrefixes`, e.g. `{ 'old-': 'new-' }`) gets CSS written
 * for that theme (WordPress's Additional CSS, a child theme's rules) with
 * its names. Only class (`.old-x`) and id (`#old-x`) selectors change:
 * declarations, strings, `url()` and comments stay as they are.
 */

export interface RenamedCss {
  css: string;
  /** How many class and id names were renamed. */
  renamed: number;
}

const NAME_START = /[A-Za-z0-9_-]/;

/** Renames `.prefix…` and `#prefix…` in one selector list (no strings or comments in it). */
function renameSelectors(
  text: string,
  prefixes: [string, string][],
): { text: string; renamed: number } {
  let renamed = 0;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    out += ch;
    if (ch !== '.' && ch !== '#') continue;
    const rest = text.slice(i + 1);
    const match = prefixes.find(([from]) => rest.startsWith(from));
    if (!match) continue;
    out += match[1];
    i += match[0].length;
    renamed++;
  }
  return { text: out, renamed };
}

/**
 * CSS with the selectors' class and id names renamed by prefix (`{ from:
 * to }`, longest first). Text inside `{ … }` declarations, strings, comments
 * and `url(…)` is copied as it is.
 */
export function renameCssSelectors(css: string, prefixes: Record<string, string>): RenamedCss {
  const pairs = Object.entries(prefixes)
    .filter(([from, to]) => from && NAME_START.test(from[0]!) && typeof to === 'string')
    .sort((a, b) => b[0].length - a[0].length);
  if (pairs.length === 0 || !css) return { css, renamed: 0 };
  let out = '';
  let renamed = 0;
  // Text since the last `{`, `}` or `;`: a prelude when a `{` ends it, a declaration otherwise.
  // Strings, comments and url() are kept apart (`kept` marks them so they are never renamed).
  let pending: { text: string; kept: boolean }[] = [];
  const flush = (prelude: boolean) => {
    for (const part of pending) {
      if (prelude && !part.kept) {
        const r = renameSelectors(part.text, pairs);
        out += r.text;
        renamed += r.renamed;
      } else out += part.text;
    }
    pending = [];
  };
  const push = (text: string, kept: boolean) => {
    const last = pending[pending.length - 1];
    if (last && last.kept === kept && !kept) last.text += text;
    else pending.push({ text, kept });
  };
  let i = 0;
  while (i < css.length) {
    const ch = css[i]!;
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? css.length : end + 2;
      push(css.slice(i, stop), true);
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== ch) j += css[j] === '\\' ? 2 : 1;
      push(css.slice(i, j + 1), true);
      i = j + 1;
      continue;
    }
    if (/^url\(/i.test(css.slice(i, i + 4))) {
      const end = css.indexOf(')', i);
      const stop = end === -1 ? css.length : end + 1;
      push(css.slice(i, stop), true);
      i = stop;
      continue;
    }
    if (ch === '{') {
      flush(true);
      out += ch;
    } else if (ch === '}' || ch === ';') {
      flush(false);
      out += ch;
    } else {
      push(ch, false);
    }
    i++;
  }
  flush(false);
  return { css: out, renamed };
}
