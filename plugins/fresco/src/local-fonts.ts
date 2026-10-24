/**
 * Google Fonts kept on the site, on the server: the first time a page needs
 * a family, its stylesheet and font files are downloaded once from Google
 * (fonts.googleapis.com and fonts.gstatic.com only, with limits and
 * timeouts), kept in Fresco's own table and served by the site with a long
 * cache. Until a family's copy is ready (or when its download failed: it is
 * tried again later) pages get no link for it, never Google's.
 *
 * The code is shared with Prisma (`@cleitext/design/font-copies`); Fresco
 * has its own table, storage and route, and asks Google for the styles of
 * its kits.
 */
import type { PluginContext } from '@cleitext/plugin-sdk';
import {
  copyFamily as copyTo,
  LocalFonts as SharedLocalFonts,
  registerFontRoute as registerRoute,
  type FontStore,
  type HttpSend,
  type LocalFontsOptions as SharedOptions,
} from '@cleitext/design/font-copies';
import { FONTS_ROUTE } from './core/font-host.js';
import { googleCssUrl } from './core/kit.js';

export {
  databaseFonts,
  retryDelay,
  type FontStore,
  type HttpSend,
} from '@cleitext/design/font-copies';

/**
 * Downloads one family's stylesheet (the Google address of that family) and
 * its files, keeps them and returns the name of the site's stylesheet.
 * Throws, keeping nothing usable, when anything is not as expected.
 */
export function copyFamily(
  http: HttpSend,
  store: FontStore,
  siteId: string,
  url: string,
): Promise<string> {
  return copyTo(http, store, siteId, url, FONTS_ROUTE);
}

export type LocalFontsOptions = Omit<SharedOptions, 'route' | 'cssUrl' | 'label'>;

/** Fresco's copies: at `/_fresco/gfonts`, each family with the styles of the kits. */
export class LocalFonts extends SharedLocalFonts {
  constructor(options: LocalFontsOptions) {
    super({
      ...options,
      route: FONTS_ROUTE,
      cssUrl: (family) => googleCssUrl([family]),
      label: 'Fresco',
    });
  }
}

/** The site's copies at `/_fresco/gfonts/<name>`, cached for a year (names change with content). */
export function registerFontRoute(ctx: PluginContext, store: FontStore): void {
  registerRoute(ctx, store, FONTS_ROUTE);
}
