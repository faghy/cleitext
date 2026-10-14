/**
 * What the editor pasted in the Map block: a link copied from a map service,
 * the embed code of Google Maps, an address or coordinates. Nothing here
 * reaches the network: short links and addresses are resolved by the server
 * entry, then read again with `parseLocation`.
 */

export type Service = 'google' | 'openstreetmap' | 'bing' | 'apple' | 'umap';

export interface Place {
  /** Where the address or link came from (`text` for an address or coordinates). */
  source: Service | 'text';
  lat?: number;
  lng?: number;
  /** An address or the name of a place, when there are no coordinates (or as a label). */
  query?: string;
  /** Name of the place, when the link has one. */
  name?: string;
  zoom?: number;
  satellite?: boolean;
  /** A map that only exists as an embed: Google My Maps, Google's own embed code, uMap. */
  embed?: { service: 'google' | 'umap'; src: string };
  /** The link opened by "Open the map", for maps without a single place. */
  link?: string;
}

export type ParsedLocation =
  | { kind: 'place'; place: Place }
  /** A short link (maps.app.goo.gl…): the server follows its redirect, then parses again. */
  | { kind: 'short'; url: string }
  | { kind: 'empty' };

/** Short-link hosts whose redirect may be followed: fixed hosts, never the site's network. */
export const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'maps.apple', 'binged.it']);

const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export function parseLocation(input: string): ParsedLocation {
  const text = input.trim();
  if (!text) return { kind: 'empty' };

  // Google Maps → Share → Embed a map: the iframe code.
  const iframe = /<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i.exec(text);
  const address = decodeEntities(iframe ? iframe[2]! : text);

  const coords = COORDS.exec(address);
  if (coords) {
    const place = point(Number(coords[1]), Number(coords[2]));
    if (place) return { kind: 'place', place: { source: 'text', ...place } };
  }

  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { kind: 'place', place: { source: 'text', query: address.slice(0, 300) } };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'empty' };
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  if (SHORT_HOSTS.has(host) && (host !== 'goo.gl' || url.pathname.startsWith('/maps'))) {
    return { kind: 'short', url: url.href };
  }
  if (isGoogle(host)) return google(url);
  if (host === 'openstreetmap.org' || host === 'osm.org') return openStreetMap(url);
  if (host === 'bing.com') return bing(url);
  if (host === 'maps.apple.com') return apple(url);
  if (/^umap\.openstreetmap\.[a-z]{2,3}$/.test(host) && /\/map\//.test(url.pathname)) {
    return {
      kind: 'place',
      place: {
        source: 'umap',
        embed: { service: 'umap', src: `${url.origin}${url.pathname}${url.search}` },
        link: url.href,
      },
    };
  }
  // A link to anything else is not a place: shown as text, it would mislead.
  return { kind: 'empty' };
}

function isGoogle(host: string): boolean {
  return /^(maps\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);
}

function google(url: URL): ParsedLocation {
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // A malformed escape: the raw path still has the coordinates.
  }
  const q = url.searchParams;
  // Google My Maps, and the embed code of Google Maps: only shown as they are.
  if (path.startsWith('/maps/d/')) {
    const mid = q.get('mid');
    if (!mid || !/^[\w-]{5,100}$/.test(mid)) return { kind: 'empty' };
    return {
      kind: 'place',
      place: {
        source: 'google',
        embed: { service: 'google', src: `https://www.google.com/maps/d/embed?mid=${mid}` },
        link: `https://www.google.com/maps/d/viewer?mid=${mid}`,
      },
    };
  }
  if (path.startsWith('/maps/embed')) {
    return {
      kind: 'place',
      place: {
        source: 'google',
        embed: { service: 'google', src: `https://www.google.com${url.pathname}${url.search}` },
        ...embedPoint(q.get('pb')),
      },
    };
  }

  const place: Place = { source: 'google' };
  // `@lat,lng,15z` (map) or `@lat,lng,500m` (satellite, metres of view).
  const view = /@(-?\d+\.\d+),(-?\d+\.\d+)(?:,(\d+(?:\.\d+)?)([zm]))?/.exec(path);
  if (view) {
    Object.assign(place, point(Number(view[1]), Number(view[2])));
    if (view[3]) {
      place.zoom = view[4] === 'z' ? Math.round(Number(view[3])) : metresToZoom(Number(view[3]));
    }
  }
  // `!3d…!4d…`: the exact position of the place, better than the centre of the view.
  const pin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(path);
  if (pin) Object.assign(place, point(Number(pin[1]), Number(pin[2])));
  if (/!1e3\b/.test(path) || q.get('t') === 'k' || q.get('t') === 'h') place.satellite = true;

  const segments = path.split('/').filter(Boolean);
  const after = (word: string) => {
    const i = segments.indexOf(word);
    return i >= 0 && segments[i + 1] && !segments[i + 1]!.startsWith('@')
      ? segments[i + 1]!.replace(/\+/g, ' ')
      : undefined;
  };
  const name = after('place');
  if (name) place.name = name;
  const search = after('search');
  // Directions: the destination is the last stop.
  const stops = segments.indexOf('dir') >= 0 ? segments.slice(segments.indexOf('dir') + 1) : [];
  const destination = stops.filter((s) => !s.startsWith('@') && !s.startsWith('data=')).at(-1);

  const text =
    q.get('q') ??
    q.get('query') ??
    q.get('destination') ??
    q.get('daddr') ??
    search ??
    destination?.replace(/\+/g, ' ');
  const zoom = Number(q.get('z') ?? q.get('zoom'));
  if (zoom) place.zoom = zoom;
  const centre = q.get('ll') ?? q.get('center');
  if (text) {
    const asCoords = COORDS.exec(text.replace(/^loc:/, ''));
    if (asCoords && place.lat === undefined) {
      Object.assign(place, point(Number(asCoords[1]), Number(asCoords[2])));
    } else if (!asCoords) place.query = text.slice(0, 300);
  }
  if (centre && place.lat === undefined) {
    const c = COORDS.exec(centre);
    if (c) Object.assign(place, point(Number(c[1]), Number(c[2])));
  }
  if (!place.query && place.name) place.query = place.name;
  return hasPlace(place) ? { kind: 'place', place: clampZoom(place) } : { kind: 'empty' };
}

/** The centre written in a Google embed's `pb` parameter (`!2dLNG!3dLAT`), for the buttons. */
function embedPoint(pb: string | null): Partial<Place> {
  const m = pb && /!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/.exec(pb);
  return (m && point(Number(m[2]), Number(m[1]))) || {};
}

function openStreetMap(url: URL): ParsedLocation {
  const q = url.searchParams;
  const place: Place = { source: 'openstreetmap' };
  // #map=15/45.4642/9.1900
  const hash = /map=(\d{1,2})\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(url.hash);
  if (hash) {
    Object.assign(place, point(Number(hash[2]), Number(hash[3])));
    place.zoom = Number(hash[1]);
  }
  const mlat = q.get('mlat');
  const mlon = q.get('mlon');
  if (mlat && mlon) Object.assign(place, point(Number(mlat), Number(mlon)));
  // export/embed.html?bbox=W,S,E,N&marker=lat,lng
  const marker = q.get('marker');
  const bbox = q.get('bbox')?.split(',').map(Number);
  if (marker) {
    const m = COORDS.exec(marker);
    if (m) Object.assign(place, point(Number(m[1]), Number(m[2])));
  } else if (bbox?.length === 4 && bbox.every(Number.isFinite) && place.lat === undefined) {
    Object.assign(place, point((bbox[1]! + bbox[3]!) / 2, (bbox[0]! + bbox[2]!) / 2));
  }
  if (bbox?.length === 4 && !place.zoom) {
    place.zoom = metresToZoom(Math.abs(bbox[2]! - bbox[0]!) * 111_000 * 0.7);
  }
  const query = q.get('query') ?? q.get('q');
  if (query) place.query = query.slice(0, 300);
  return hasPlace(place) ? { kind: 'place', place: clampZoom(place) } : { kind: 'empty' };
}

function bing(url: URL): ParsedLocation {
  if (!url.pathname.startsWith('/maps')) return { kind: 'empty' };
  const q = url.searchParams;
  const place: Place = { source: 'bing' };
  const cp = q.get('cp');
  const c = cp && /^(-?\d+(?:\.\d+)?)~(-?\d+(?:\.\d+)?)$/.exec(cp);
  if (c) Object.assign(place, point(Number(c[1]), Number(c[2])));
  const lvl = Number(q.get('lvl'));
  if (lvl) place.zoom = Math.round(lvl);
  const style = q.get('style') ?? q.get('sty');
  if (style === 'a' || style === 'h') place.satellite = true;
  const query = q.get('q') ?? q.get('where1') ?? q.get('where');
  if (query) place.query = query.slice(0, 300);
  return hasPlace(place) ? { kind: 'place', place: clampZoom(place) } : { kind: 'empty' };
}

function apple(url: URL): ParsedLocation {
  const q = url.searchParams;
  const place: Place = { source: 'apple' };
  // Old links: ?ll=lat,lng&q=Name; new ones: /place?coordinate=lat,lng&name=Name.
  const at = q.get('coordinate') ?? q.get('ll') ?? q.get('sll') ?? q.get('center');
  const c = at && COORDS.exec(at);
  if (c) Object.assign(place, point(Number(c[1]), Number(c[2])));
  const name = q.get('name') ?? q.get('q') ?? q.get('query');
  const address = q.get('address') ?? q.get('daddr');
  if (name) place.name = name.slice(0, 200);
  if (address || name) place.query = (address ?? name)!.slice(0, 300);
  const z = Number(q.get('z') ?? q.get('zoom'));
  if (z) place.zoom = Math.round(z);
  const t = q.get('t') ?? q.get('map');
  if (t === 'k' || t === 'h' || t === 'satellite' || t === 'hybrid') place.satellite = true;
  return hasPlace(place) ? { kind: 'place', place: clampZoom(place) } : { kind: 'empty' };
}

function point(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: round(lat), lng: round(lng) };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Zoom level that shows about this many metres across a map. */
export function metresToZoom(metres: number): number {
  if (!(metres > 0)) return 15;
  return Math.round(Math.log2(40_075_000 / metres) + 0.3);
}

function clampZoom(place: Place): Place {
  if (place.zoom !== undefined) place.zoom = Math.min(Math.max(Math.round(place.zoom), 1), 20);
  return place;
}

function hasPlace(place: Place): boolean {
  return place.lat !== undefined || Boolean(place.query) || Boolean(place.embed);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
