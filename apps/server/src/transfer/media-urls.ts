/**
 * Addresses of the old site's media inside text (core 0.80): the HTML of
 * text and code elements (`src`, `srcset`, links), CSS `url()` and any other
 * string of an imported document. Each one found among the imported media
 * (or one of WordPress's resized copies) becomes the new address; those of
 * the old site that were not imported are collected for the report.
 */
import { mediaUrlKey } from '@cleitext/shared';

export interface MediaTarget {
  id: string;
  url: string;
}

/** Addresses in a text: absolute, protocol-relative, or a root path into `/wp-content/`. */
const ADDRESS = /(?:https?:)?\/\/[^\s"'<>()\\,]+|(?<![\w.\-/])\/wp-content\/[^\s"'<>()\\,]+/gi;

/** Files that are media (an address of the old site ending so is reported when missing). */
const MEDIA_FILE =
  /\.(?:jpe?g|png|gif|webp|avif|svg|bmp|ico|tiff?|heic|mp4|m4v|mov|webm|ogv|mp3|m4a|ogg|wav|pdf)$/i;

/**
 * The address of a media file without what WordPress adds to its copies
 * (shared with the CLI's `media:rename-imported`).
 */
export { mediaUrlKey };

/** An imported media file by an old address, or by the address of one of its copies. */
export function mediaByUrl(urls: Map<string, MediaTarget>, url: string): MediaTarget | undefined {
  return urls.get(url) ?? urls.get(mediaUrlKey(url));
}

/** The host of an address (without `www.`), or '' for a path. */
function hostOf(url: string): string {
  const m = /^(?:https?:)?\/\/([^/:?#]+)/i.exec(url);
  return m ? m[1]!.toLowerCase().replace(/^www\./, '') : '';
}

export interface MediaTextRewriter {
  /** The text with the old site's media addresses replaced (the same string when none was). */
  rewrite(text: string): string;
  /** Old-site media addresses that were not imported, since the last call (each once). */
  takeMissing(): string[];
}

/**
 * Rewrites media addresses in text. `origin` is the old site's address
 * (the export's `source.url`): only its addresses (and root paths into
 * `/wp-content/`) are matched by their path, so another site's file with
 * the same name is left alone; addresses imported as such always match.
 */
export function mediaTextRewriter(
  urls: Map<string, MediaTarget>,
  origin: string | undefined,
): MediaTextRewriter {
  const originHost = origin ? hostOf(origin) : '';
  let missing = new Set<string>();
  const fromOldSite = (url: string) => {
    const host = hostOf(url);
    return host ? host === originHost : url.startsWith('/wp-content/');
  };
  return {
    rewrite(text) {
      if (!text.includes('//') && !text.includes('/wp-content/')) return text;
      return text.replace(ADDRESS, (found) => {
        // A sentence's full stop is not part of the address.
        const url = found.replace(/[.;:!?]+$/, '');
        const rest = found.slice(url.length);
        const exact = urls.get(url);
        const target = exact ?? (fromOldSite(url) ? urls.get(mediaUrlKey(url)) : undefined);
        if (target) return target.url + rest;
        if (fromOldSite(url) && MEDIA_FILE.test(url.replace(/[?#].*$/, ''))) missing.add(url);
        return found;
      });
    },
    takeMissing() {
      const list = [...missing];
      missing = new Set();
      return list;
    },
  };
}
