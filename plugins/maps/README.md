# Maps

The official Cleitext plugin for maps. It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-maps-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## The Map block

Add the **Map** block anywhere in a page, a post or a pattern, and fill in **Place** with one of:

- a link from **Google Maps**: a place, a search, a route (its destination), the short `maps.app.goo.gl` links, **My Maps** maps, or the embed code of _Share → Embed a map_;
- a link from **OpenStreetMap**, **Bing Maps**, **Apple Maps** or **uMap** (maps with many markers, made on umap.openstreetmap.fr);
- an address (_Piazza del Duomo, Milano_) or coordinates (_45.4642, 9.19_).

**Show with** chooses the service that draws the map: _Automatic_ uses the service of the link, and the site's default for addresses, coordinates and Apple Maps links (Apple Maps has no map that can be embedded in a page: its links open the place in the app). Then the view (map, satellite, cycling, public transport, humanitarian), the zoom, the height, a description for screen readers and a caption. Under the map, **Directions** and **Open in Google Maps / Apple Maps / OpenStreetMap** links let visitors use their own app.

With a **Google Maps API key** (Maps Embed API, in **Settings → Maps**), Google maps can also show **Street View** or a **route** from a starting point, on foot, by car, bicycle or public transport. The key is visible in the pages: restrict it to the address of the site in Google Cloud.

## Privacy

- **OpenStreetMap** and **uMap** maps set no cookies: they are shown at once.
- **Google Maps** and **Bing Maps** may set cookies. With the **Privacy & GDPR** plugin active they wait for the visitor's consent (category _Marketing_, or _Preferences_ in Settings → Maps) and show a notice with a link to the cookie preferences meanwhile; the services in use are added to the cookie banner, the cookie table and the policies. Without it, they are shown at once.
- Addresses are looked up once on OpenStreetMap's Nominatim, from the server, and remembered.

## Settings

**Settings → Maps**: default service, Google Maps API key, consent category, default height and zoom.

Plugin API 1.4: a block (`blocks`), settings and storage (`settings:own`), services declared to the privacy plugin with `ctx.privacy.declareTrackers`.
