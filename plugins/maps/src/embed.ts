import type { Place } from './links';

/** The services that can draw the map in the page (Apple Maps has no embeddable map). */
export type MapService = 'openstreetmap' | 'google' | 'bing';
export type Layer = 'standard' | 'satellite' | 'cycle' | 'transport' | 'humanitarian';
export type GoogleView = 'place' | 'streetview' | 'directions';

export interface MapOptions {
  service: MapService;
  zoom: number;
  height: number;
  layer: Layer;
  locale: string;
  /** Maps Embed API key: street view, directions and the satellite view of a place. */
  googleKey?: string;
  googleView?: GoogleView;
  /** Starting point of the route (Google, with the key). */
  from?: string;
  travelMode?: 'driving' | 'walking' | 'bicycling' | 'transit';
}

export interface MapFrame {
  service: MapService | 'umap';
  src: string;
}

/**
 * The address of the map to show, or null when it cannot be drawn (e.g. an
 * address that could not be found, for a service that needs coordinates).
 */
export function mapFrame(place: Place, options: MapOptions): MapFrame | null {
  // A map that exists only as an embed is shown as it is, by its own service.
  if (place.embed) return { service: place.embed.service, src: place.embed.src };
  const zoom = place.zoom ?? options.zoom;
  const satellite = options.layer === 'satellite' || (place.satellite ?? false);
  const coords = place.lat !== undefined ? `${place.lat},${place.lng}` : undefined;
  const what = coords ?? place.query;
  const lang = options.locale.slice(0, 2);

  if (options.service === 'google') {
    if (!what) return null;
    const key = options.googleKey;
    if (key) {
      const base = 'https://www.google.com/maps/embed/v1';
      const k = encodeURIComponent(key);
      if (options.googleView === 'streetview' && coords) {
        return {
          service: 'google',
          src: `${base}/streetview?key=${k}&location=${coords}&language=${lang}`,
        };
      }
      if (options.googleView === 'directions' && options.from?.trim()) {
        const mode = options.travelMode ?? 'driving';
        return {
          service: 'google',
          src: `${base}/directions?key=${k}&origin=${q(options.from.trim())}&destination=${q(place.query ?? what)}&mode=${mode}&language=${lang}`,
        };
      }
      return {
        service: 'google',
        src: `${base}/place?key=${k}&q=${q(place.query ?? what)}${coords ? `&center=${coords}` : ''}&zoom=${zoom}&maptype=${satellite ? 'satellite' : 'roadmap'}&language=${lang}`,
      };
    }
    return {
      service: 'google',
      src: `https://maps.google.com/maps?q=${q(what)}&z=${zoom}&t=${satellite ? 'k' : 'm'}&hl=${lang}&output=embed`,
    };
  }

  if (place.lat === undefined || place.lng === undefined) return null;

  if (options.service === 'bing') {
    return {
      service: 'bing',
      src: `https://www.bing.com/maps/embed?h=${options.height}&w=1000&cp=${place.lat}~${place.lng}&lvl=${zoom}&typ=d&sty=${satellite ? 'a' : 'r'}&src=SHELL&FORM=MBEDV8`,
    };
  }

  // OpenStreetMap: a box around the place, sized for a map about 1000 px wide.
  const lngSpan = (360 / 2 ** zoom) * (1000 / 256);
  const latSpan = lngSpan * Math.cos((place.lat * Math.PI) / 180) * (options.height / 1000);
  const bbox = [
    place.lng - lngSpan / 2,
    place.lat - latSpan / 2,
    place.lng + lngSpan / 2,
    place.lat + latSpan / 2,
  ]
    .map((n) => n.toFixed(6))
    .join(',');
  const layer = OSM_LAYERS[options.layer] ?? 'mapnik';
  return {
    service: 'openstreetmap',
    src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=${layer}&marker=${place.lat},${place.lng}`,
  };
}

const OSM_LAYERS: Partial<Record<Layer, string>> = {
  standard: 'mapnik',
  cycle: 'cyclosm',
  transport: 'transportmap',
  humanitarian: 'hot',
};

export interface MapLink {
  service: 'google' | 'apple' | 'openstreetmap' | 'map';
  href: string;
}

/** "Open in…" links, for visitors who want the map in their own app. */
export function openLinks(place: Place): MapLink[] {
  const coords = place.lat !== undefined ? `${place.lat},${place.lng}` : undefined;
  const what = coords ?? place.query;
  if (!what) return place.link ? [{ service: 'map', href: place.link }] : [];
  const label = place.name ?? place.query;
  const links: MapLink[] = [
    {
      service: 'google',
      href: `https://www.google.com/maps/search/?api=1&query=${q(label && coords ? `${label} ${coords}` : what)}`,
    },
    {
      service: 'apple',
      href: coords
        ? `https://maps.apple.com/?ll=${coords}${label ? `&q=${q(label)}` : ''}`
        : `https://maps.apple.com/?q=${q(what)}`,
    },
  ];
  if (coords) {
    links.push({
      service: 'openstreetmap',
      href: `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=${place.zoom ?? 16}/${place.lat}/${place.lng}`,
    });
  }
  return links;
}

/** Directions to the place: Google Maps, which also opens the app on phones. */
export function directionsLink(place: Place): string | null {
  const coords = place.lat !== undefined ? `${place.lat},${place.lng}` : undefined;
  const what = coords ?? place.query;
  return what ? `https://www.google.com/maps/dir/?api=1&destination=${q(what)}` : null;
}

function q(text: string): string {
  return encodeURIComponent(text).replace(/%20/g, '+').replace(/%2C/g, ',');
}
