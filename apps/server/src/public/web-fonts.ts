/**
 * Web fonts of the pages kept on the site (Settings → Privacy → Web fonts):
 * after the theme and the plugins rendered a page, its links to Google
 * Fonts and Bunny Fonts stylesheets (`<link rel="stylesheet">`, a style
 * preload, `@import` in a `<style>`) become links to the site's copies,
 * and its hints to those services (`preconnect`, `dns-prefetch`, font
 * preloads) are dropped: no visitor's browser reaches them. Each family
 * gets a link of its own naming it (`data-font-family`), and a family a
 * plugin already keeps on the site (Fresco, Prisma) is never linked again.
 *
 * Only the text is handled here; `WebFontsService` downloads the copies.
 */
import {
  FONT_FAMILY_ATTRIBUTE,
  familyKey,
  familyStylesheets,
  fontLink,
} from '@cleitext/design/fonts';

export type WebFontsMode = 'local' | 'provider' | 'theme';

/** Hosts of the font services whose addresses a page loses when its fonts are kept on the site. */
export const FONT_SERVICE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'fonts.bunny.net'];

/** Where the site serves its copies. */
export const WEB_FONTS_ROUTE = '/_fonts';

/** Gives the site's stylesheet of each service address that has a copy ready (address → href). */
export type ResolveFonts = (urls: string[]) => Promise<ReadonlyMap<string, string>>;

interface Sheet {
  family: string;
  url: string;
}

/** A piece of the text to replace: a link, an `@import`, or a hint to remove. */
interface Unit {
  start: number;
  end: number;
  kind: 'link' | 'import' | 'hint';
  sheets: Sheet[];
}

const decode = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

function attributeOf(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? undefined : decode(value);
}

/** Whether an address is on a font service (`//host`, http or https). */
function onFontService(href: string): boolean {
  try {
    const url = new URL(href.trim().replace(/^\/\//, 'https://'));
    return FONT_SERVICE_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

const IMPORT_RE = /@import\s+(?:url\(\s*(['"]?)([^'")\s]+)\1\s*\)|(['"])([^'"]+)\3)[^;]*;?/gi;

/** The font service links, imports and hints of a page (or of a stylesheet, `css`). */
function unitsOf(text: string, css: boolean): Unit[] {
  const units: Unit[] = [];
  const imports = (body: string, offset: number) => {
    for (const match of body.matchAll(IMPORT_RE)) {
      const href = decode(match[2] ?? match[4] ?? '');
      const sheets = familyStylesheets(href);
      // Imports of other stylesheets, a service's included (Material Icons), stay.
      if (sheets.length === 0) continue;
      const start = offset + match.index;
      units.push({ start, end: start + match[0].length, kind: 'import', sheets });
    }
  };
  if (css) {
    imports(text, 0);
    return units;
  }
  for (const match of text.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const href = attributeOf(tag, 'href');
    if (!href || !onFontService(href)) continue;
    const rel = (attributeOf(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const style =
      rel.includes('stylesheet') ||
      (rel.includes('preload') && attributeOf(tag, 'as')?.toLowerCase() === 'style');
    const sheets = style ? familyStylesheets(href) : [];
    const kind = sheets.length > 0 ? 'link' : 'hint';
    // A stylesheet of a service that is not one to copy (e.g. Material Icons) stays.
    if (kind === 'hint' && style) continue;
    units.push({ start: match.index, end: match.index + tag.length, kind, sheets });
  }
  for (const match of text.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/gi)) {
    imports(match[2]!, match.index + match[1]!.length);
  }
  return units.sort((a, b) => a.start - b.start);
}

/** The families of the site's copies a page links already (`data-font-family`). */
function hostedFamilies(html: string): Set<string> {
  const found = new Set<string>();
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const family = attributeOf(match[0], FONT_FAMILY_ATTRIBUTE);
    if (family) found.add(familyKey(family));
  }
  return found;
}

export interface RewriteOptions {
  /** `local`: links to the site's copies; `provider`: the services' links stay. */
  mode: Exclude<WebFontsMode, 'theme'>;
  /** The site's copies (called once, with every address the page needs; `local` only). */
  resolve: ResolveFonts;
  /** A stylesheet (the editor's) rather than a page: only its `@import`s are read. */
  css?: boolean;
}

export interface RewriteResult {
  text: string;
  /** Some family had no copy ready: it was left out, and the page should be made again later. */
  missing: boolean;
}

/**
 * The page (or stylesheet) with its fonts as the site wants them. In
 * `local` mode nothing names a font service any more: a family without a
 * copy ready is left out (the browser uses the next font of the CSS) and
 * `missing` says so. In `provider` mode only links to families the page
 * already loads from the site's copies are dropped.
 */
export async function rewriteWebFonts(
  text: string,
  options: RewriteOptions,
): Promise<RewriteResult> {
  const css = options.css === true;
  // Cheap test first: most pages have nothing to do.
  if (!FONT_SERVICE_HOSTS.some((host) => text.includes(host))) return { text, missing: false };
  const units = unitsOf(text, css);
  if (units.length === 0) return { text, missing: false };
  const hosted = css ? new Set<string>() : hostedFamilies(text);
  const local = options.mode === 'local';
  const wanted = [
    ...new Set(
      units.flatMap((unit) =>
        unit.sheets.filter((s) => !hosted.has(familyKey(s.family))).map((s) => s.url),
      ),
    ),
  ];
  const ready = local && wanted.length > 0 ? await options.resolve(wanted) : new Map();
  let missing = false;
  // Each address once (the same family with other weights is another address).
  const linked = new Set<string>();
  let out = '';
  let at = 0;
  for (const unit of units) {
    out += text.slice(at, unit.start);
    at = unit.end;
    const original = text.slice(unit.start, unit.end);
    if (unit.kind === 'hint') {
      if (!local) out += original;
      continue;
    }
    if (!local) {
      // Kept unless the site's copies already give every family of it.
      if (!unit.sheets.every((s) => hosted.has(familyKey(s.family)))) out += original;
      continue;
    }
    for (const sheet of unit.sheets) {
      if (hosted.has(familyKey(sheet.family)) || linked.has(sheet.url)) continue;
      const href = ready.get(sheet.url);
      if (!href) {
        missing = true;
        continue;
      }
      linked.add(sheet.url);
      out +=
        unit.kind === 'link'
          ? fontLink(href, sheet.family)
          : `@import url(${JSON.stringify(href)});`;
    }
  }
  out += text.slice(at);
  return { text: out, missing };
}
