/**
 * Google Fonts kept on the site (like Elementor's "Load Google Fonts
 * Locally"): the stylesheet of a family is downloaded once by the server,
 * with its font files, and pages link to the site's copy. No visitor's
 * browser talks to Google, which in the EU needs consent (LG München,
 * 20 January 2022; the Italian Garante follows it).
 *
 * What can be checked without a server is shared with Prisma
 * (`@cleitext/design/fonts`): which addresses may be downloaded, the files
 * a stylesheet names, their types, the stylesheet rewritten to the site's
 * copies, and the families a page already loads (the theme's own fonts, and
 * Prisma's, are never added again). Here: Fresco's mode and route.
 */
import { fontsMode, rewriteCss as rewriteTo, type GoogleFontsMode } from '@cleitext/design/fonts';

export {
  BROWSER_AGENT,
  FONT_LIMITS,
  base64Head,
  base64Size,
  cssFileUrls,
  familiesToLoad,
  familyKey,
  fontLink,
  fontType,
  hashName,
  isGoogleCssUrl,
  isGoogleFileUrl,
  pageFamilies,
  servedFile,
  type FontType,
  type GoogleFontsMode,
} from '@cleitext/design/fonts';

/** The mode of a kit: kept on the site unless set otherwise (also for sites made before 2.8). */
export function googleFontsMode(kit: { googleFontsMode?: string }): GoogleFontsMode {
  return fontsMode(kit.googleFontsMode);
}

/** Where the site serves its copies: `/_fresco/gfonts/<name>`. */
export const FONTS_ROUTE = '/_fresco/gfonts';

/** The stylesheet with each Google file replaced by the site's copy (`names`: address → file name). */
export function rewriteCss(css: string, names: ReadonlyMap<string, string>): string | null {
  return rewriteTo(css, names, FONTS_ROUTE);
}
