# Vetta SEO

The complete SEO plugin of Cleitext, free (GPL-3.0-or-later). Install it from **Plugins → Add New** (catalog), or upload `cleitext-plugin-vetta-<version>.zip` from the Releases page. It replaces the lighter **SEO** plugin: the two cannot be active together, and Vetta reads the SEO plugin's fields (search title, description, keyphrase, noindex, canonical, social image) on pages that have no Vetta values yet.

Needs Cleitext 0.35 (plugin API 1.24).

## In the editor

Every content type gets an **SEO** section: keywords (the first is the main one, up to five), search title and description (with variables), and under **Advanced** noindex, nofollow, noarchive, noimageindex, nosnippet, canonical address, the name in the breadcrumbs, the structured data type and pillar content; under **Social networks** the title, description and image used when the page is shared.

The **SEO analysis** section follows the page as it is written: a Google preview, a score out of 100 for the main keyword (and one for each other keyword), and a checklist in four groups: basic SEO (keyword in the title, description, address, beginning and content; length), more checks (subheadings, image texts, keyword density, address length, links to the site and to other sites, keyword already used by another page), title readability (keyword at the beginning, a striking word, a number) and content readability (table of contents, short paragraphs, images and videos).

## Settings (Vetta SEO in the admin menu)

- **Modules**: content analysis, structured data, social cards, sitemap, breadcrumbs, local business, image texts, links to other sites, llms.txt, robots.txt editor, pages not found, IndexNow.
- **General**: title separator, capitals, default robots, the longest previews, what stays out of search (search results, page 2 and next, authors).
- **Home and other pages**, **Content types**, **Categories and tags**: title and description templates with variables (`%title% %sep% %sitename% %excerpt% %category% %categories% %tags% %date% %name% %page% %currentyear% %focuskw% %customfield(group.name)%`; the `%%title%%` form works too), robots per type and taxonomy, structured data type, and whether the type goes in the sitemap, llms.txt and IndexNow.
- **Social networks**: default image, X card and account, Facebook page and app.
- **Organization and local business**: name, logo, profiles, and for a business its kind, address, opening hours, price range, coordinates, legal name and VAT number, all in the schema.org graph.
- **Webmaster tools**: Google, Bing, Yandex, Baidu, Pinterest and Norton verification (paste the code or the whole tag).
- **Breadcrumbs**: separator, home, prefix; the **Breadcrumbs** block shows them, with a BreadcrumbList in the structured data.
- **Sitemap**, **Links and images**, **llms.txt and robots.txt**, **Pages not found** (with the log, cleared by hand or by a limit) and **IndexNow** (the key is made for you; pages are sent when published, or by hand, with a log).

The content analysis follows the weights of Rank Math SEO (GPL-3.0); the power word lists come from it too.
