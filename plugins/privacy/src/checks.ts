/**
 * Checks of the public site, run from the admin: which pages make visitors'
 * browsers load Google Fonts (fonts.googleapis.com, fonts.gstatic.com) as
 * soon as they open, before any consent. Since the LG München ruling of
 * 20 January 2022 (followed by the Italian Garante) that sends the visitor's
 * IP address to Google without a legal basis. The pages are read as a
 * visitor (no cookies), with the stylesheets of the site they link.
 */

/** The font services whose addresses are looked for. */
export const GOOGLE_FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'] as const;

export interface FontFinding {
  /** The page where it was found. */
  page: string;
  /** The page itself, or the site's stylesheet that loads it. */
  source: string;
  host: (typeof GOOGLE_FONT_HOSTS)[number];
}

/**
 * The HTML that loads things on its own: without comments and without the
 * scripts the cookie banner keeps inert until consent (`type="text/plain"`).
 */
export function activeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*\btype\s*=\s*["']?text\/plain[^>]*>[\s\S]*?<\/script>/gi, '');
}

/** The Google font hosts a page or a stylesheet names, each once. */
export function googleFontHosts(text: string): FontFinding['host'][] {
  return GOOGLE_FONT_HOSTS.filter((host) =>
    new RegExp(`(?:https?:)?//${host.replace(/\./g, '\\.')}[/"'\\s)]`, 'i').test(text),
  );
}

/** The site's own stylesheets a page links or imports (at most `limit`), as absolute addresses. */
export function siteStylesheets(html: string, pageUrl: string, limit = 12): string[] {
  const origin = new URL(pageUrl).origin;
  const found = new Set<string>();
  const add = (href: string) => {
    try {
      const url = new URL(href.replace(/&amp;/g, '&'), pageUrl);
      if (url.origin === origin) found.add(url.href);
    } catch {
      // Not an address.
    }
  };
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(tag[0])) continue;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag[0]);
    const value = href?.[1] ?? href?.[2] ?? href?.[3];
    if (value) add(value);
  }
  for (const im of html.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) add(im[1]!);
  return [...found].slice(0, limit);
}

/**
 * Looks for Google Fonts on some pages of the site and in the site's
 * stylesheets they use (and those these import). `read` gets a text as a
 * visitor would, or null.
 */
export async function scanGoogleFonts(
  pages: readonly string[],
  read: (url: string) => Promise<string | null>,
): Promise<FontFinding[]> {
  const findings: FontFinding[] = [];
  const sheets = new Map<string, Promise<string | null>>();
  const readSheet = (url: string) => {
    if (!sheets.has(url)) sheets.set(url, read(url));
    return sheets.get(url)!;
  };
  for (const page of pages) {
    const html = await read(page);
    if (html === null) continue;
    const active = activeHtml(html);
    for (const host of googleFontHosts(active)) findings.push({ page, source: page, host });
    const queue = siteStylesheets(active, page).map((url) => ({ url, depth: 0 }));
    const seen = new Set<string>();
    while (queue.length) {
      const { url, depth } = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      const css = await readSheet(url);
      if (css === null) continue;
      for (const host of googleFontHosts(css)) findings.push({ page, source: url, host });
      if (depth < 1)
        for (const next of siteStylesheets(css, url)) queue.push({ url: next, depth: 1 });
    }
  }
  return findings;
}
