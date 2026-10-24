/**
 * Google Fonts kept on the site (like Elementor's "Load Google Fonts
 * Locally"), shared by Fresco and Prisma: the stylesheet of a family is
 * downloaded once by the server, with its font files, and pages link to the
 * site's copy. No visitor's browser talks to Google, which in the EU needs
 * consent (LG München, 20 January 2022; the Italian Garante follows it).
 *
 * This module has what can be checked without a server, the same in every
 * plugin: which addresses may be downloaded, the files a stylesheet names,
 * their types, the stylesheet rewritten to a plugin's copies, and the
 * families a page already loads (the theme's own fonts, and those another
 * plugin added, are never added again). Each plugin serves its copies at
 * its own route (`/_fresco/gfonts`, `/_prisma/gfonts`).
 */

/** How pages get their Google Fonts: copies kept on the site, from Google, or none. */
export type GoogleFontsMode = 'local' | 'google' | 'none';

/** A saved mode: kept on the site unless set otherwise (also for sites made before the setting). */
export function fontsMode(value: unknown): GoogleFontsMode {
  return value === 'google' || value === 'none' ? value : 'local';
}

/**
 * The browser Google is asked as: with it the stylesheet names WOFF2 files,
 * split by alphabet (`unicode-range`), so visitors download only what a
 * page shows. Other agents are given whole TrueType files.
 */
export const BROWSER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** Limits of one family's copy. */
export const FONT_LIMITS = {
  /** The stylesheet (Google's are a few KB). */
  cssBytes: 200_000,
  /** Files a stylesheet may name (a family with every style and alphabet has about 60). */
  files: 80,
  /** One font file. */
  fileBytes: 2 * 1024 * 1024,
  /** All the files of a family together. */
  totalBytes: 12 * 1024 * 1024,
} as const;

/** A Google Fonts stylesheet address: https, fonts.googleapis.com, `/css2` or `/css`. */
export function isGoogleCssUrl(value: string): boolean {
  const url = parse(value);
  return (
    !!url &&
    url.protocol === 'https:' &&
    url.hostname === 'fonts.googleapis.com' &&
    !url.port &&
    !url.username &&
    (url.pathname === '/css2' || url.pathname === '/css')
  );
}

/** A Google font file address: https, fonts.gstatic.com, under `/s/` or `/l/`. */
export function isGoogleFileUrl(value: string): boolean {
  const url = parse(value);
  return (
    !!url &&
    url.protocol === 'https:' &&
    url.hostname === 'fonts.gstatic.com' &&
    !url.port &&
    !url.username &&
    /^\/[sl]\/[\w./-]+$/.test(url.pathname) &&
    !url.pathname.includes('..')
  );
}

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const URL_RE = /url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g;

/**
 * The font files a Google stylesheet names, each once; null when the
 * stylesheet is not one to copy: too large, with `@import`, or naming a
 * file anywhere else than fonts.gstatic.com.
 */
export function cssFileUrls(css: string): string[] | null {
  if (css.length > FONT_LIMITS.cssBytes || /@import|<\/?[a-z]/i.test(css)) return null;
  if (!/@font-face/.test(css)) return null;
  const found = new Set<string>();
  for (const match of css.matchAll(URL_RE)) {
    if (!isGoogleFileUrl(match[2]!)) return null;
    found.add(match[2]!);
  }
  if (found.size === 0 || found.size > FONT_LIMITS.files) return null;
  return [...found];
}

/**
 * The stylesheet with each Google file replaced by the site's copy
 * (`names`: address → file name), served under `route`.
 */
export function rewriteCss(
  css: string,
  names: ReadonlyMap<string, string>,
  route: string,
): string | null {
  let missing = false;
  const out = css.replace(URL_RE, (_all, _quote: string, url: string) => {
    const name = names.get(url);
    if (!name) missing = true;
    return `url(${route}/${name ?? ''})`;
  });
  return missing ? null : out;
}

export interface FontType {
  ext: 'woff2' | 'woff' | 'ttf' | 'otf';
  mime: string;
}

const TYPES: Record<FontType['ext'], string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

/** The type of a font file, from its first bytes; null when it is not a font. */
export function fontType(bytes: Uint8Array): FontType | null {
  const tag = String.fromCharCode(...bytes.slice(0, 4));
  if (tag === 'wOF2') return { ext: 'woff2', mime: TYPES.woff2 };
  if (tag === 'wOFF') return { ext: 'woff', mime: TYPES.woff };
  if (tag === 'OTTO') return { ext: 'otf', mime: TYPES.otf };
  if (tag === '\x00\x01\x00\x00' || tag === 'true') return { ext: 'ttf', mime: TYPES.ttf };
  return null;
}

/** The first bytes of a base64 text (enough for `fontType`). */
export function base64Head(base64: string, bytes = 12): Uint8Array {
  const chunk = base64.slice(0, Math.ceil(bytes / 3) * 4);
  try {
    return Uint8Array.from(atob(chunk), (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

/** The size of what a base64 text holds. */
export function base64Size(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** A file the site serves: `<32 hex>.css` or a font; null otherwise. */
export function servedFile(file: string): { name: string; mime: string } | null {
  const match = /^[a-f0-9]{32}\.(css|woff2|woff|ttf|otf)$/.exec(file);
  if (!match) return null;
  const ext = match[1] as FontType['ext'] | 'css';
  return { name: file, mime: ext === 'css' ? 'text/css; charset=utf-8' : TYPES[ext] };
}

/** SHA-256 of a text, as 32 hex characters (names of the copies). */
export async function hashName(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---- Links to the copies ---------------------------------------------------------------

/**
 * The attribute naming the family of a link to a site's copy: another
 * plugin reading the page knows the family is loaded already (the file
 * names are hashes).
 */
export const FONT_FAMILY_ATTRIBUTE = 'data-font-family';

const attribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The `<link>` of a family's copy on the site. */
export function fontLink(href: string, family: string): string {
  return `<link rel="stylesheet" href="${attribute(href)}" ${FONT_FAMILY_ATTRIBUTE}="${attribute(family)}">`;
}

// ---- Families a page already loads ---------------------------------------------------

/** A family name compared loosely: `Open Sans`, `open-sans` and `"open sans"` are one. */
export const familyKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

const decode = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** The families a font service stylesheet asks for (Google Fonts, Bunny Fonts). */
function serviceFamilies(href: string): string[] {
  const url = parse(decode(href).replace(/^\/\//, 'https://'));
  if (!url) return [];
  if (!['fonts.googleapis.com', 'fonts.bunny.net'].includes(url.hostname)) return [];
  if (!/^\/css2?$/.test(url.pathname)) return [];
  return url.searchParams
    .getAll('family')
    .flatMap((value) => value.split('|'))
    .map((family) => family.split(':')[0]!.trim())
    .filter(Boolean);
}

function attributeOf(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

/**
 * The families a page loads by itself, before a plugin adds its fonts:
 * those of the stylesheets of Google Fonts and Bunny Fonts it links or
 * imports, those of the copies another plugin linked (`fontLink`), and
 * those of the `@font-face` rules in its `<style>` elements (themes write
 * their CSS there, fonts kept on the site included). Keys as `familyKey`.
 * Fonts declared only in a linked stylesheet file are not seen.
 */
export function pageFamilies(html: string): Set<string> {
  const found = new Set<string>();
  const head = html.slice(0, 2_000_000);
  for (const tag of head.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(tag[0])) continue;
    const named = attributeOf(tag[0], FONT_FAMILY_ATTRIBUTE);
    if (named) found.add(familyKey(decode(named)));
    const value = attributeOf(tag[0], 'href');
    if (value) for (const family of serviceFamilies(value)) found.add(familyKey(family));
  }
  for (const style of head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = style[1]!;
    for (const im of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
      for (const family of serviceFamilies(im[1]!)) found.add(familyKey(family));
    }
    for (const face of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
      const name = /font-family\s*:\s*(["']?)([^;"'}]+)\1/i.exec(face[1]!)?.[2];
      if (name) found.add(familyKey(name));
    }
  }
  return found;
}

/** The families a plugin should load on a page: those the page does not load already. */
export function familiesToLoad(families: readonly string[], html: string): string[] {
  const loaded = pageFamilies(html);
  return families.filter((family) => !loaded.has(familyKey(family)));
}
