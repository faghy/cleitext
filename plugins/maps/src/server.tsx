import { createHash } from 'node:crypto';
import {
  defineBlock,
  definePlugin,
  type PluginContext,
  type TrackerDeclaration,
} from '@cleitext/plugin-sdk';
import {
  directionsLink,
  mapFrame,
  openLinks,
  type GoogleView,
  type Layer,
  type MapFrame,
  type MapLink,
  type MapService,
} from './embed';
import { parseLocation, SHORT_HOSTS, type Place } from './links';

/**
 * Maps (official plugin, shipped on its own): the Map block shows a place
 * from a link of Google Maps, OpenStreetMap, Bing Maps, Apple Maps or uMap,
 * an address or coordinates, drawn by OpenStreetMap, Google Maps or Bing
 * Maps, with "Open in" and directions links. Maps that set cookies wait for
 * consent when the Privacy & GDPR plugin is active.
 */

type Category = 'preferences' | 'marketing';

interface Settings {
  service: MapService;
  googleKey: string;
  category: Category;
  height: number;
  zoom: number;
}

interface Attrs {
  location: string;
  service: 'auto' | MapService;
  layer: Layer;
  zoom: number;
  height: number;
  caption: string;
  title: string;
  links: boolean;
  googleView: GoogleView;
  from: string;
  travelMode: 'driving' | 'walking' | 'bicycling' | 'transit';
}

interface MapData {
  frame: MapFrame | null;
  place: Place | null;
  links: MapLink[];
  directions: string | null;
  height: number;
  /** The consent category the map waits for, or null when it loads at once. */
  consent: Category | null;
}

/** Services that set cookies: they wait for consent. */
const NEEDS_CONSENT = new Set(['google', 'bing']);

async function settingsOf(ctx: PluginContext, siteId: string): Promise<Settings> {
  const s = await ctx.settings.get(siteId);
  const service = ['openstreetmap', 'google', 'bing'].includes(String(s.service))
    ? (s.service as MapService)
    : 'openstreetmap';
  return {
    service,
    googleKey: typeof s.googleKey === 'string' ? s.googleKey.trim() : '',
    category: s.category === 'preferences' ? 'preferences' : 'marketing',
    height: clamp(Number(s.height) || 400, 150, 1200),
    zoom: clamp(Number(s.zoom) || 15, 1, 20),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(n), min), max);
}

function hash(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

// ---- Short links ---------------------------------------------------------------------

const resolved = new Map<string, { url: string | null; at: number }>();

/** Follows the redirects of a short link, only through the short-link hosts. */
async function expand(ctx: PluginContext, siteId: string, url: string): Promise<string | null> {
  const key = `link:${hash(url)}`;
  const known = resolved.get(url);
  if (known && (known.url || Date.now() - known.at < 60 * 60 * 1000)) return known.url;
  const stored = await ctx.storage.get<string>(siteId, key);
  if (stored) {
    resolved.set(url, { url: stored, at: Date.now() });
    return stored;
  }
  let current = url;
  let result: string | null = null;
  try {
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(3000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; Cleitext Maps)' },
      });
      const location = res.headers.get('location');
      if (!location) break;
      const next = new URL(location, current);
      // Google's cookie notice keeps the real address in `continue`.
      const cont = next.hostname.startsWith('consent.') ? next.searchParams.get('continue') : null;
      current = cont ?? next.href;
      if (!SHORT_HOSTS.has(new URL(current).hostname.replace(/^www\./, ''))) {
        result = current;
        break;
      }
    }
  } catch (error) {
    ctx.log.warn('A short map link could not be followed', { url, error: String(error) });
  }
  resolved.set(url, { url: result, at: Date.now() });
  if (result) await ctx.storage.set(siteId, key, result);
  return result;
}

// ---- Addresses (Nominatim) -----------------------------------------------------------

const geocoded = new Map<string, { at: number; point: { lat: number; lng: number } | null }>();
let lastLookup = 0;

/**
 * Coordinates of an address, from OpenStreetMap's Nominatim: at most one
 * request a second (its usage policy) and each address asked once per site.
 */
async function geocode(
  ctx: PluginContext,
  siteId: string,
  query: string,
  locale: string,
): Promise<{ lat: number; lng: number } | null> {
  const id = query.trim().toLowerCase();
  const key = `geo:${hash(id)}`;
  const known = geocoded.get(id);
  if (known && (known.point || Date.now() - known.at < 60 * 60 * 1000)) return known.point;
  const stored = await ctx.storage.get<{ lat: number; lng: number }>(siteId, key);
  if (stored) {
    geocoded.set(id, { at: Date.now(), point: stored });
    return stored;
  }
  let found: { lat: number; lng: number } | null = null;
  try {
    const wait = lastLookup + 1100 - Date.now();
    lastLookup = Date.now() + Math.max(wait, 0);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
      {
        signal: AbortSignal.timeout(3000),
        headers: {
          'user-agent': 'Cleitext Maps plugin (https://cleitext.com)',
          'accept-language': locale,
        },
      },
    );
    const rows = (await res.json()) as { lat?: string; lon?: string }[];
    const lat = Number(rows[0]?.lat);
    const lng = Number(rows[0]?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng) && rows[0]?.lat) found = { lat, lng };
  } catch (error) {
    ctx.log.warn('An address could not be found', { query, error: String(error) });
  }
  geocoded.set(id, { at: Date.now(), point: found });
  if (found) await ctx.storage.set(siteId, key, found);
  return found;
}

// ---- Privacy -------------------------------------------------------------------------

/** Services each site has shown, for the cookie banner and the policies. */
const used = new Map<string, Set<string>>();

async function usedServices(ctx: PluginContext, siteId: string): Promise<Set<string>> {
  let set = used.get(siteId);
  if (!set) {
    set = new Set((await ctx.storage.get<string[]>(siteId, 'services')) ?? []);
    used.set(siteId, set);
  }
  return set;
}

async function markUsed(ctx: PluginContext, siteId: string, service: string): Promise<void> {
  const set = await usedServices(ctx, siteId);
  if (set.has(service)) return;
  set.add(service);
  await ctx.storage.set(siteId, 'services', [...set]);
  // The cookie banner and the policies now include it.
  await ctx.cache.invalidate(siteId, ['site']);
}

function trackersOf(services: Set<string>, category: Category): TrackerDeclaration[] {
  const out: TrackerDeclaration[] = [];
  if (services.has('google')) {
    out.push({
      id: 'maps.google',
      name: 'Google Maps',
      provider: 'Google Ireland Ltd',
      category,
      requiresConsent: true,
      cookies: [
        {
          name: 'NID',
          duration: '6 months',
          purpose: {
            en: 'Set by Google when the map is shown: remembers preferences and may be used for advertising.',
            it: 'Impostato da Google quando si vede la mappa: ricorda le preferenze e può essere usato per la pubblicità.',
          },
        },
      ],
      purpose: {
        en: 'We show maps from Google Maps: Google receives the address of your device and may set cookies.',
        it: 'Mostriamo mappe di Google Maps: Google riceve l’indirizzo del tuo dispositivo e può impostare cookie.',
      },
      transfersOutsideEu: true,
      privacyPolicyUrl: 'https://policies.google.com/privacy',
    });
  }
  if (services.has('bing')) {
    out.push({
      id: 'maps.bing',
      name: 'Bing Maps',
      provider: 'Microsoft Ireland Operations Ltd',
      category,
      requiresConsent: true,
      cookies: [
        {
          name: 'MUID',
          duration: '13 months',
          purpose: {
            en: 'Set by Microsoft when the map is shown: identifies the browser across Microsoft sites.',
            it: 'Impostato da Microsoft quando si vede la mappa: riconosce il browser sui siti di Microsoft.',
          },
        },
      ],
      purpose: {
        en: 'We show maps from Bing Maps: Microsoft receives the address of your device and may set cookies.',
        it: 'Mostriamo mappe di Bing Maps: Microsoft riceve l’indirizzo del tuo dispositivo e può impostare cookie.',
      },
      transfersOutsideEu: true,
      privacyPolicyUrl: 'https://privacy.microsoft.com/privacystatement',
    });
  }
  if (services.has('openstreetmap') || services.has('umap')) {
    out.push({
      id: 'maps.openstreetmap',
      name: services.has('umap') ? 'OpenStreetMap, uMap' : 'OpenStreetMap',
      provider: 'OpenStreetMap Foundation',
      category: 'preferences',
      requiresConsent: false,
      cookies: [],
      purpose: {
        en: 'We show maps from OpenStreetMap: its servers receive the address of your device to send the map, without cookies.',
        it: 'Mostriamo mappe di OpenStreetMap: i suoi server ricevono l’indirizzo del tuo dispositivo per inviare la mappa, senza cookie.',
      },
      privacyPolicyUrl: 'https://osmfoundation.org/wiki/Privacy_Policy',
    });
  }
  return out;
}

// ---- Texts and styles ----------------------------------------------------------------

const NAMES: Record<string, string> = {
  google: 'Google Maps',
  bing: 'Bing Maps',
  openstreetmap: 'OpenStreetMap',
  umap: 'uMap',
  apple: 'Apple Maps',
};

const TEXTS = {
  en: {
    map: 'Map',
    consent: (name: string) =>
      `This map is shown by ${name}, which may set cookies. Accept them to see it here.`,
    accept: 'Cookie preferences',
    open: (name: string) => `Open in ${name}`,
    openMap: 'Open the map',
    directions: 'Directions',
  },
  it: {
    map: 'Mappa',
    consent: (name: string) =>
      `Questa mappa è fornita da ${name}, che può impostare cookie. Accettali per vederla qui.`,
    accept: 'Preferenze cookie',
    open: (name: string) => `Apri in ${name}`,
    openMap: 'Apri la mappa',
    directions: 'Indicazioni stradali',
  },
};

const STYLE = `.cx-map{margin:1.5rem 0}
.cx-map__frame{position:relative;width:100%;border-radius:12px;overflow:hidden;background:#e5e7eb}
.cx-map__frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.cx-map__frame iframe:not([src]){visibility:hidden}
.cx-map__consent{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;padding:1.5rem;text-align:center;color:#1f2937;font-size:.95rem;line-height:1.5;background:repeating-linear-gradient(45deg,#eef2f7 0 14px,#e5eaf1 14px 28px)}
.cx-map__consent p{margin:0;max-width:32rem}
.cx-map__consent a{font-weight:600}
.cx-map figcaption{margin-top:.5rem;font-size:.9rem;color:#6b7280}
.cx-map__links{display:flex;flex-wrap:wrap;gap:.4rem 1rem;margin:.6rem 0 0;padding:0;list-style:none;font-size:.9rem}`;

/**
 * Without the Privacy & GDPR plugin nobody gives consent: the maps load at
 * once. With it, its banner script loads them after consent.
 */
const FALLBACK = `addEventListener('DOMContentLoaded',function(){if(window.cleitextConsent)return;document.querySelectorAll('.cx-map iframe[data-cx-src]').forEach(function(f){f.src=f.getAttribute('data-cx-src')})})`;

// ---- Plugin --------------------------------------------------------------------------

export default definePlugin({
  setup(ctx) {
    ctx.settings.define(
      [
        {
          name: 'service',
          type: 'select',
          label: { en: 'Map service', it: 'Servizio di mappe' },
          help: {
            en: 'Draws addresses, coordinates and Apple Maps links in maps set to "Automatic".',
            it: 'Disegna indirizzi, coordinate e link di Apple Maps nelle mappe impostate su "Automatico".',
          },
          options: [
            { value: 'openstreetmap', label: 'OpenStreetMap' },
            { value: 'google', label: 'Google Maps' },
            { value: 'bing', label: 'Bing Maps' },
          ],
          default: 'openstreetmap',
        },
        {
          name: 'googleKey',
          type: 'text',
          label: {
            en: 'Google Maps API key (optional)',
            it: 'Chiave API di Google Maps (facoltativa)',
          },
          help: {
            en: 'Maps Embed API key (Google Cloud): adds Street View, routes and satellite places. It is visible in pages: restrict it to this site.',
            it: 'Chiave Maps Embed API (Google Cloud): aggiunge Street View, percorsi e luoghi in satellite. È visibile nelle pagine: limitala a questo sito.',
          },
          maxLength: 100,
        },
        {
          name: 'category',
          type: 'select',
          label: {
            en: 'Consent for Google and Bing maps',
            it: 'Consenso per le mappe di Google e Bing',
          },
          help: {
            en: 'With the Privacy & GDPR plugin, these maps wait until visitors accept this category.',
            it: 'Con il plugin Privacy & GDPR, queste mappe aspettano che il visitatore accetti questa categoria.',
          },
          options: [
            { value: 'marketing', label: { en: 'Marketing', it: 'Marketing' } },
            { value: 'preferences', label: { en: 'Preferences', it: 'Preferenze' } },
          ],
          default: 'marketing',
        },
        {
          name: 'height',
          type: 'number',
          label: { en: 'Default height (pixels)', it: 'Altezza predefinita (pixel)' },
          min: 150,
          max: 1200,
          default: 400,
        },
        {
          name: 'zoom',
          type: 'number',
          label: { en: 'Default zoom', it: 'Zoom predefinito' },
          help: {
            en: 'From 1 (the world) to 20 (a building), when the link has none.',
            it: 'Da 1 (il mondo) a 20 (un edificio), quando il link non lo indica.',
          },
          min: 1,
          max: 20,
          default: 15,
        },
      ],
      { title: { en: 'Maps', it: 'Mappe' } },
    );

    ctx.privacy.declareTrackers(async (siteId) => {
      const cfg = await settingsOf(ctx, siteId);
      const services = new Set(await usedServices(ctx, siteId));
      return trackersOf(services, cfg.category);
    });

    ctx.blocks.register(
      defineBlock<Attrs, MapData>({
        type: 'maps/map',
        title: { en: 'Map', it: 'Mappa' },
        description: {
          en: 'A map from a link of Google Maps, OpenStreetMap, Bing, Apple Maps or uMap, an address or coordinates.',
          it: 'Una mappa da un link di Google Maps, OpenStreetMap, Bing, Apple Maps o uMap, un indirizzo o delle coordinate.',
        },
        icon: 'location-alt',
        category: 'embed',
        attributes: [
          {
            name: 'location',
            type: 'text',
            multiline: true,
            maxLength: 4000,
            label: { en: 'Place', it: 'Luogo' },
            help: {
              en: 'A link from Google Maps (also My Maps or embed code), OpenStreetMap, Bing, Apple Maps or uMap; an address; or coordinates like 45.4642, 9.19.',
              it: 'Un link di Google Maps (anche My Maps o codice di incorporamento), OpenStreetMap, Bing, Apple Maps o uMap; un indirizzo; o coordinate come 45.4642, 9.19.',
            },
          },
          {
            name: 'service',
            type: 'select',
            label: { en: 'Show with', it: 'Mostra con' },
            options: [
              {
                value: 'auto',
                label: {
                  en: 'Automatic (the service of the link)',
                  it: 'Automatico (il servizio del link)',
                },
              },
              { value: 'openstreetmap', label: 'OpenStreetMap' },
              { value: 'google', label: 'Google Maps' },
              { value: 'bing', label: 'Bing Maps' },
            ],
            default: 'auto',
          },
          {
            name: 'layer',
            type: 'select',
            label: { en: 'View', it: 'Vista' },
            options: [
              { value: 'standard', label: { en: 'Map', it: 'Mappa' } },
              {
                value: 'satellite',
                label: { en: 'Satellite (Google, Bing)', it: 'Satellite (Google, Bing)' },
              },
              {
                value: 'cycle',
                label: { en: 'Cycling (OpenStreetMap)', it: 'Ciclabile (OpenStreetMap)' },
              },
              {
                value: 'transport',
                label: {
                  en: 'Public transport (OpenStreetMap)',
                  it: 'Trasporti pubblici (OpenStreetMap)',
                },
              },
              {
                value: 'humanitarian',
                label: { en: 'Humanitarian (OpenStreetMap)', it: 'Umanitaria (OpenStreetMap)' },
              },
            ],
            default: 'standard',
          },
          {
            name: 'zoom',
            type: 'number',
            label: { en: 'Zoom (0: from the link)', it: 'Zoom (0: dal link)' },
            min: 0,
            max: 20,
            default: 0,
          },
          {
            name: 'height',
            type: 'number',
            label: {
              en: 'Height in pixels (0: the default)',
              it: 'Altezza in pixel (0: quella predefinita)',
            },
            min: 0,
            max: 1200,
            default: 0,
          },
          {
            name: 'title',
            type: 'text',
            maxLength: 200,
            label: {
              en: 'Description for screen readers',
              it: 'Descrizione per i lettori di schermo',
            },
            help: {
              en: 'e.g. "Map of our shop in Milan".',
              it: 'Es. "Mappa del nostro negozio a Milano".',
            },
          },
          {
            name: 'caption',
            type: 'text',
            maxLength: 300,
            label: { en: 'Caption', it: 'Didascalia' },
            help: {
              en: 'Shown under the map, e.g. the address.',
              it: 'Mostrata sotto la mappa, es. l’indirizzo.',
            },
          },
          {
            name: 'links',
            type: 'boolean',
            label: {
              en: 'Directions and "Open in" Google Maps, Apple Maps, OpenStreetMap',
              it: 'Indicazioni e "Apri in" Google Maps, Apple Maps, OpenStreetMap',
            },
            default: true,
          },
          {
            name: 'googleView',
            type: 'select',
            label: { en: 'Google Maps with the API key', it: 'Google Maps con la chiave API' },
            help: {
              en: 'Needs the API key in Settings → Maps.',
              it: 'Serve la chiave API in Impostazioni → Mappe.',
            },
            options: [
              { value: 'place', label: { en: 'The place', it: 'Il luogo' } },
              { value: 'streetview', label: 'Street View' },
              {
                value: 'directions',
                label: {
                  en: 'Route from a starting point',
                  it: 'Percorso da un punto di partenza',
                },
              },
            ],
            default: 'place',
          },
          {
            name: 'from',
            type: 'text',
            maxLength: 300,
            label: { en: 'Starting point of the route', it: 'Punto di partenza del percorso' },
            help: { en: 'e.g. "Milano Centrale".', it: 'Es. "Milano Centrale".' },
          },
          {
            name: 'travelMode',
            type: 'select',
            label: { en: 'Travel by', it: 'Mezzo' },
            options: [
              { value: 'driving', label: { en: 'Car', it: 'Auto' } },
              { value: 'walking', label: { en: 'On foot', it: 'A piedi' } },
              { value: 'bicycling', label: { en: 'Bicycle', it: 'Bicicletta' } },
              { value: 'transit', label: { en: 'Public transport', it: 'Mezzi pubblici' } },
            ],
            default: 'driving',
          },
        ],
        async load(attrs, context) {
          const { siteId } = context;
          const cfg = await settingsOf(ctx, siteId);
          let parsed = parseLocation(attrs.location ?? '');
          if (parsed.kind === 'short') {
            const target = await expand(ctx, siteId, parsed.url);
            parsed = target ? parseLocation(target) : { kind: 'empty' };
          }
          const empty: MapData = {
            frame: null,
            place: null,
            links: [],
            directions: null,
            height: cfg.height,
            consent: null,
          };
          if (parsed.kind !== 'place') return empty;
          const place = parsed.place;

          const service: MapService =
            attrs.service && attrs.service !== 'auto'
              ? attrs.service
              : place.source === 'google' ||
                  place.source === 'openstreetmap' ||
                  place.source === 'bing'
                ? place.source
                : cfg.service;
          const height = attrs.height ? clamp(attrs.height, 150, 1200) : cfg.height;
          // OpenStreetMap and Bing draw coordinates only: an address is looked up first.
          if (place.lat === undefined && place.query && !place.embed && service !== 'google') {
            const found = await geocode(ctx, siteId, place.query, context.locale);
            if (found) Object.assign(place, found);
          }
          const frame = mapFrame(place, {
            service,
            zoom: attrs.zoom ? clamp(attrs.zoom, 1, 20) : cfg.zoom,
            height,
            layer: attrs.layer ?? 'standard',
            locale: context.locale,
            googleKey: cfg.googleKey || undefined,
            googleView: attrs.googleView,
            from: attrs.from,
            travelMode: attrs.travelMode,
          });
          if (frame) await markUsed(ctx, siteId, frame.service);
          return {
            frame,
            place,
            links: attrs.links === false ? [] : openLinks(place),
            directions: attrs.links === false ? null : directionsLink(place),
            height,
            consent: frame && NEEDS_CONSENT.has(frame.service) ? cfg.category : null,
          };
        },
        render({ attrs, data, context }) {
          const t = context.locale.toLowerCase().startsWith('it') ? TEXTS.it : TEXTS.en;
          if (!data || (!data.frame && data.links.length === 0)) return null;
          const frame = data.frame;
          const name = frame ? NAMES[frame.service]! : '';
          const title =
            attrs.title?.trim() || `${t.map}${data.place?.name ? `: ${data.place.name}` : ''}`;
          return (
            <>
              <style>{STYLE}</style>
              <figure className="cx-map">
                {frame && (
                  <div className="cx-map__frame" style={{ height: `${data.height}px` }}>
                    {data.consent && (
                      <div className="cx-map__consent">
                        <p>{t.consent(name)}</p>
                        <a href="#cookie-preferences" data-cx-open="">
                          {t.accept}
                        </a>
                      </div>
                    )}
                    <iframe
                      title={title}
                      loading="lazy"
                      allowFullScreen
                      {...(data.consent
                        ? { 'data-cx-src': frame.src, 'data-cx-category': data.consent }
                        : { src: frame.src })}
                    />
                  </div>
                )}
                {attrs.caption?.trim() && <figcaption>{attrs.caption.trim()}</figcaption>}
                {(data.links.length > 0 || data.directions) && (
                  <ul className="cx-map__links">
                    {data.directions && (
                      <li>
                        <a href={data.directions} target="_blank" rel="noopener">
                          {t.directions}
                        </a>
                      </li>
                    )}
                    {data.links.map((link) => (
                      <li key={link.service}>
                        <a href={link.href} target="_blank" rel="noopener">
                          {link.service === 'map' ? t.openMap : t.open(NAMES[link.service]!)}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </figure>
              {data.consent && <script dangerouslySetInnerHTML={{ __html: FALLBACK }} />}
            </>
          );
        },
      }),
    );
  },
});
