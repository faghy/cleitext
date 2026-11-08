# Setax

A filter by type and place, for sites that list services or shops by area: “Washing machines in Albenga”, “Built-in fridges in Savona”.

- **The block “Filter by type and place”**: two selects, the types (the terms of a taxonomy of your pages, e.g. `elettrodomestici`) and the places (the **Place** field of the pages), a button, then the matching pages with their excerpt, or “No results found”. It works with every theme, in the block editor and in Fresco.
- **A page of its own for each choice**: the form opens a readable address, `/zone/?tipo=lavatrici&comune=albenga`, that search engines see as a page of its own: its title (“Washing machines in Albenga”), description, canonical address (one for each choice, whatever the order of the parameters), `ItemList` and `BreadcrumbList` structured data, the page's own heading (the theme's H1, since 1.1.0 with Cleitext 0.96.7), and a place in the XML sitemap. Choices without results, or that do not exist, are kept out of search (`noindex, follow`).
- **Each page with a place is a service** (since 1.1.0): a page with the Place field gets a schema.org `Service`: its type is the page's term (e.g. “Washing machines”), the town it serves is its place (`areaServed`, a `City`), and its provider is the business the SEO plugin describes (SEO 2.5.0, Settings → SEO → Site representation), when it does.
- **Links to every choice**: under the form, the types with the places that have results, as plain links, so that visitors and search engines find them all.
- **From WordPress**: the place of each page is read on import from its meta, an ACF field such as `comune` or any post meta (Settings → Setax). Taxonomies of the theme are imported by the WordPress Importer itself.

The names of the parameters (`tipo`, `comune`…), the labels, the headings with `{tipo}` and `{zona}`, the description for search engines (`{n}` is how many results) and the message without results are set in the block.

Needs Cleitext 0.96.5 (plugin API 1.63) for the titles and canonical addresses of the choices; on older versions the filter works and the choices are not indexed on their own.

## License

GPL-2.0-or-later. Copyright (C) 2026 Serafino Christian.
