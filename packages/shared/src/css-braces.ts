/**
 * Braces of a style sheet (core 0.82). A browser closes the blocks a style
 * sheet leaves open at its end, so CSS with an unclosed `@media … {` works
 * where it is printed alone (as WordPress prints its Additional CSS) and
 * swallows whatever is printed after it in the same `<style>`. These helpers
 * find such braces, ignoring those inside comments and strings, and make the
 * CSS safe to put before other CSS.
 */

export interface CssBraceScan {
  /** `{` left open, outermost first: where it is, and where its rule starts. */
  open: { at: number; start: number }[];
  /** `}` with no `{` before them. */
  stray: number[];
  /** Where a comment that never ends starts, or -1. */
  comment: number;
  /** The quote of a string still open at the end, or ''. */
  quote: string;
}

/** Where the braces of `css` do not match. */
export function scanCssBraces(css: string): CssBraceScan {
  const open: CssBraceScan['open'] = [];
  const stray: number[] = [];
  // Where the current rule starts: after the last `{`, `}` or `;`.
  let start = 0;
  let i = 0;
  while (i < css.length) {
    const c = css[i]!;
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) return { open, stray, comment: i, quote: '' };
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      // A string ends at its quote, or at a line break (as browsers read it).
      let j = i + 1;
      while (j < css.length && css[j] !== c && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1;
      if (j >= css.length) return { open, stray, comment: -1, quote: c };
      i = j + 1;
      continue;
    }
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '{') {
      open.push({ at: i, start });
      start = i + 1;
    } else if (c === '}') {
      if (open.length) open.pop();
      else stray.push(i);
      start = i + 1;
    } else if (c === ';') {
      start = i + 1;
    }
    i += 1;
  }
  return { open, stray, comment: -1, quote: '' };
}

/** Why the braces of some CSS do not match, or null when they do. */
export function cssBraceProblem(css: string): string | null {
  const scan = scanCssBraces(css);
  if (scan.stray.length) return 'The CSS has a } with no { before it.';
  if (scan.comment !== -1) return 'The CSS has a comment that is never closed with */.';
  if (scan.quote) return 'The CSS has a string that is never closed.';
  if (scan.open.length) return 'The CSS has a { that is never closed.';
  return null;
}

export interface BalancedCss {
  css: string;
  /** Blocks closed at the end (they had rules or declarations). */
  closed: number;
  /** Empty blocks left open at the end, removed with their selector or at-rule. */
  dropped: number;
  /** `}` with no `{`, removed. */
  stray: number;
  /** A comment never closed, or a string, was ended. */
  ended: boolean;
}

/**
 * CSS whose braces match, as a browser reads it alone: an empty block left
 * open at the end (`@media (max-width: 580px){`) is removed, one with content
 * is closed, a `}` with no `{` is removed, and a comment or a string still
 * open at the end is ended.
 */
export function balanceCss(css: string): BalancedCss {
  const scan = scanCssBraces(css);
  let out = css;
  let ended = false;
  if (scan.comment !== -1) {
    out = `${out}*/`;
    ended = true;
  } else if (scan.quote) {
    out = `${out}${scan.quote}`;
    ended = true;
  }
  let dropped = 0;
  const open = [...scan.open];
  // Empty blocks at the end go, innermost first (their parent may then be empty too).
  while (open.length) {
    const last = open[open.length - 1]!;
    const rest = out.slice(last.at + 1).replace(/\/\*[\s\S]*?(\*\/|$)/g, '');
    if (rest.trim() !== '') break;
    out = out.slice(0, last.start).trimEnd();
    open.pop();
    dropped += 1;
  }
  // Stray `}` (all before the cut: nothing after an open `{` is stray).
  const stray = scan.stray.filter((at) => at < out.length);
  for (const at of [...stray].reverse()) out = out.slice(0, at) + out.slice(at + 1);
  if (open.length) out = `${out.trimEnd()}\n${'}'.repeat(open.length)}`;
  return {
    css: out,
    closed: open.length,
    dropped,
    stray: stray.length,
    ended,
  };
}
