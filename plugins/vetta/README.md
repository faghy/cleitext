# Vetta SEO

The complete SEO plugin of Cleitext, free (GPL-3.0-or-later). Install it from **Plugins → Add New** (catalog), or upload `cleitext-plugin-vetta-<version>.zip` from the Releases page. It replaces the lighter **SEO** plugin: the two cannot be active together, and Vetta reads the SEO plugin's fields (search title, description, keyphrase, noindex, canonical, social image) on pages that have no Vetta values yet.

Needs Cleitext 0.35 (plugin API 1.24).

## In the editor

Every content type gets a **Vetta SEO** section in the editor's sidebar, on a light blue background so it stands apart from Cleitext's own settings. It opens and closes with one click (the choice is remembered), and its header shows the SEO score even while closed. Inside, in this order: keywords (the first is the main one, up to five), search title and description (with variables), then the analysis right under them, then **Advanced** (noindex, nofollow, noarchive, noimageindex, nosnippet, canonical address, the name in the breadcrumbs, the structured data type and pillar content) and **Social networks** (the title, description and image used when the page is shared), each closed until opened and showing how many of its settings are set. The stored fields keep their names (`fields.vetta.*`), so nothing changes for existing pages, the REST API or assistants.

The analysis follows the page as it is written: a Google preview, a score out of 100 for the main keyword (and one for each other keyword), and a checklist in four groups: basic SEO (keyword in the title, description, address, beginning and content; length), more checks (subheadings, image texts, keyword density, address length, links to the site and to other sites, keyword already used by another page), title readability (keyword at the beginning, a striking word, a number) and content readability (table of contents, short paragraphs, images and videos). Lower in the sidebar, the small **SEO analysis** section shows the score with a link that opens the Vetta SEO section.

## Categories, tags and other taxonomies

Since 1.3.0 the edit screen of every term (categories, tags and the taxonomies of plugins and imports) has its own **Vetta SEO** section: keywords, search title and description, under **Advanced** noindex, nofollow and the canonical address, under **Social networks** the title, description and image when shared (field group `vetta-term`). On the term's archive they come before the taxonomy's templates (**Categories and tags** in the settings), and the term's own noindex and nofollow before the taxonomy's robots; a term out of search leaves the sitemap. Variables such as `%term%`, `%term_description%`, `%focuskw%` and `%page%` work. Quick checks give a score out of 100 for the main keyword in the title (near its start) and in the description and for their lengths: a term has no content to analyse like a page. A WordPress import brings Rank Math's SEO of categories and tags over (title, description, focus keyword, robots, canonical, social title, description and image); Yoast SEO keeps its term values in an option that WordPress exports do not include.

The archive looks the term up among the first 500 terms of its taxonomy in that language (the plugin API finds terms by taxonomy, not by address).

## Breadcrumbs

The links of the **Breadcrumbs** block carry the whole title of their page as a tooltip (`title`), also when the crumb shows a shorter name.

## Settings (Vetta SEO in the admin menu)

- **Modules**: content analysis, structured data, social cards, sitemap, breadcrumbs, local business, image texts, links to other sites, llms.txt, robots.txt editor, pages not found, IndexNow.
- **General**: title separator, capitals, default robots, the longest previews, what stays out of search (search results, page 2 and next, authors).
- **Home and other pages**, **Content types**, **Categories and tags**: title and description templates with variables (`%title% %sep% %sitename% %excerpt% %category% %categories% %tags% %date% %name% %page% %currentyear% %focuskw% %customfield(group.name)%`; the `%%title%%` form works too), robots per type and taxonomy, structured data type, and whether the type goes in the sitemap, llms.txt and IndexNow.
- `%page%` says "Page 2 of 22" ("Pagina 2 di 22") since 1.1.0 with core 0.88 (plugin API 1.57; "Page 2" on older cores); titles imported from WordPress keep their straight quotes and hyphens in the search and social titles.
- **Social networks**: default image, X card and account, Facebook page and app.
- **Organization and local business**: name, logo, profiles, and for a business its kind, address, opening hours, price range, coordinates, legal name and VAT number, all in the schema.org graph.
- **Webmaster tools**: Google, Bing, Yandex, Baidu, Pinterest and Norton verification (paste the code or the whole tag), and verification files served at the site root (e.g. `google….html`, `BingSiteAuth.xml`), which survive updates.
- **Breadcrumbs**: separator, home, prefix; the **Breadcrumbs** block shows them, with a BreadcrumbList in the structured data.
- **Sitemap**, **Links and images**, **llms.txt and robots.txt**, **Pages not found** (with the log, cleared by hand or by a limit) and **IndexNow** (the key is made for you; pages are sent when published, or by hand, with a log).

The content analysis follows the weights of Rank Math SEO (GPL-3.0); the power word lists come from it too.
