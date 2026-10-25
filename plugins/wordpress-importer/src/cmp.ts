/**
 * Leftovers of cookie banners (consent managers) in imported content (since
 * 1.28.0): CookieYes, Complianz and Cookiebot put their "Cookie settings"
 * links, `<style>` rules and declaration scripts in pages and HTML blocks.
 * The Privacy plugin replaces those banners, so they go: their CSS rules are
 * removed, their declaration scripts too, and their "Cookie settings" links
 * become links to `#cookie-preferences`, which open the Privacy plugin's
 * preferences (or the consent manager chosen there). Only these managers'
 * own class names, ids and scripts are touched.
 */

/** Selectors of the managers' own elements. */
const SELECTOR =
  /(?:[.#](?:cky-|cookieyes|cmplz-|cmplz_|CybotCookiebot|Cookiebot|CookieDeclaration|cookie-law-info|wt-cli-|cliSettings|cliModal))/;
/** Quick test before any work. */
const MARKER =
  /cky-|cookieyes|cmplz|Cookiebot|CookieDeclaration|cookie-law-info|cli-plugin|wt-cli|cliSettings/i;

/** Classes of the managers' "Cookie settings" links and buttons. */
const SETTINGS_CLASSES = [
  'cky-banner-element',
  'cky-btn-revisit',
  'cmplz-show-banner',
  'cmplz-manage-consent',
  'cli_settings_button',
  'cli-plugin-button',
  'wt-cli-manage-consent-link',
];

export interface CmpReport {
  /** CSS rules of the managers removed. */
  rules: number;
  /** Their links turned into `#cookie-preferences` ones. */
  links: number;
  /** Their scripts removed (Cookiebot's declaration…). */
  scripts: number;
  /** The managers seen. */
  managers: Set<string>;
}

export const emptyCmpReport = (): CmpReport => ({
  rules: 0,
  links: 0,
  scripts: 0,
  managers: new Set(),
});

function manager(text: string): string {
  if (/cky-|cookieyes|cookie-law-info|cli_|cliSettings|cliModal|wt-cli/i.test(text))
    return 'CookieYes';
  if (/cmplz/i.test(text)) return 'Complianz';
  return 'Cookiebot';
}

/** A selector list without the managers' selectors (empty when all were theirs). */
function keepSelectors(selectors: string): string {
  return selectors
    .split(',')
    .filter((s) => !SELECTOR.test(s))
    .join(',')
    .trim();
}

/**
 * CSS without the managers' rules: rules whose selectors are all theirs go,
 * their selectors leave mixed lists, and @media blocks left empty go.
 */
export function stripCmpCss(css: string, report: CmpReport): string {
  if (!MARKER.test(css)) return css;
  let out = '';
  let at = 0;
  while (at < css.length) {
    const open = css.indexOf('{', at);
    if (open === -1) {
      out += css.slice(at);
      break;
    }
    // The block's end, braces matched (strings and comments are rare in such rules).
    let depth = 1;
    let end = open + 1;
    while (end < css.length && depth > 0) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}') depth--;
      end++;
    }
    const head = css.slice(at, open);
    const body = css.slice(open + 1, end - 1);
    const prelude = head.trim();
    if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
      const inner = stripCmpCss(body, report);
      if (inner.trim()) out += `${head}{${inner}}`;
    } else if (prelude.startsWith('@')) {
      out += css.slice(at, end);
    } else if (SELECTOR.test(prelude)) {
      report.managers.add(manager(prelude));
      const kept = keepSelectors(prelude);
      if (kept) {
        out += `${head.slice(0, head.length - head.trimStart().length)}${kept}{${body}}`;
      }
      report.rules++;
    } else {
      out += css.slice(at, end);
    }
    at = end;
  }
  return out;
}

/** HTML without the managers' leftovers. */
export function stripCmpHtml(html: string, report: CmpReport): string {
  if (!MARKER.test(html)) return html;
  let out = html.replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (whole, attrs: string, css: string) => {
      if (/id=["'](?:cky|cookieyes|cmplz|CookieConsent|cookie-law-info)/i.test(attrs)) {
        report.managers.add(manager(attrs));
        report.rules++;
        return '';
      }
      const kept = stripCmpCss(css, report);
      if (kept === css) return whole;
      return kept.trim() ? `<style${attrs}>${kept}</style>` : '';
    },
  );
  // Cookiebot's declaration and banner scripts, CookieYes's and Complianz's.
  out = out.replace(
    /<script\b[^>]*(?:consent\.cookiebot\.com|id=["']CookieDeclaration|id=["']Cookiebot|cdn-cookieyes\.com|cookieyes|complianz)[^>]*>[\s\S]*?<\/script>/gi,
    (whole) => {
      report.managers.add(manager(whole));
      report.scripts++;
      return '';
    },
  );
  // "Cookie settings" links and buttons: links that open the Privacy plugin's preferences.
  out = out.replace(
    /<(a|button|span)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (whole, tag: string, attrs: string, inner: string) => {
      const classes = /\bclass=["']([^"']*)["']/i.exec(attrs)?.[1]?.split(/\s+/) ?? [];
      const cookiebot = /href=["']javascript:\s*Cookiebot\.(?:renew|show)\(\)/i.test(attrs);
      if (!cookiebot && !classes.some((c) => SETTINGS_CLASSES.includes(c))) return whole;
      report.managers.add(cookiebot ? 'Cookiebot' : manager(classes.join(' ')));
      report.links++;
      return `<a href="#cookie-preferences">${inner}</a>`;
    },
  );
  return out;
}

/** Every string of a block's attributes, cleaned (deeply). */
function cleanValue(value: unknown, report: CmpReport): unknown {
  if (typeof value === 'string') return stripCmpHtml(value, report);
  if (Array.isArray(value)) return value.map((v) => cleanValue(v, report));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cleanValue(v, report)]),
    );
  }
  return value;
}

interface BlockLike {
  type: string;
  attrs: Record<string, unknown>;
  children?: BlockLike[] | undefined;
}

/**
 * Blocks without the managers' leftovers; HTML blocks left empty go.
 * Returns the blocks as they were when there was nothing to clean.
 */
export function stripCmpBlocks<T extends BlockLike>(blocks: T[], report: CmpReport): T[] {
  if (!MARKER.test(JSON.stringify(blocks))) return blocks;
  const out: T[] = [];
  for (const block of blocks) {
    const attrs = cleanValue(block.attrs, report) as Record<string, unknown>;
    const children = block.children ? stripCmpBlocks(block.children as T[], report) : undefined;
    const html = /\/html$/.test(block.type);
    if (
      html &&
      JSON.stringify(attrs) !== JSON.stringify(block.attrs) &&
      Object.values(attrs).every((v) => typeof v !== 'string' || !v.trim())
    ) {
      continue;
    }
    out.push({ ...block, attrs, ...(children ? { children } : {}) });
  }
  return out;
}

/** The report's line, or null when nothing was found. */
export function cmpWarning(report: CmpReport): string | null {
  if (!report.rules && !report.links && !report.scripts) return null;
  const parts = [
    report.rules ? `${report.rules} CSS rule(s) or style block(s) removed` : '',
    report.scripts ? `${report.scripts} script(s) removed` : '',
    report.links
      ? `${report.links} "Cookie settings" link(s) now open the Privacy plugin's preferences (#cookie-preferences)`
      : '',
  ].filter(Boolean);
  return `Leftovers of the cookie banner (${[...report.managers].join(', ')}), replaced by the Privacy plugin: ${parts.join(', ')}.`;
}
