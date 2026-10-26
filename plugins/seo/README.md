# SEO

The official Cleitext SEO plugin, in the spirit of Yoast SEO. It ships with Cleitext.

## XML sitemaps for Search Console

Cleitext writes the sitemaps; this plugin decides what goes in them. Submit **`https://<your site>/sitemap.xml`** in Google Search Console (**Sitemaps → Add a new sitemap**); Bing Webmaster Tools can import the site from there. `robots.txt` already points to it. The **SEO** page of the admin shows the address, the steps, the list of sitemaps, and **how the site is verified**: it looks for a Google TXT record in the DNS of the site and of its parent domains (a _Domain_ property, nothing to paste — as for `pulsar.faghy.it` verified on `faghy.it`) and for a verification tag on the home page (a _URL prefix_ property, the tag goes in Analytics → Search engines).

- `/sitemap.xml` is the index, with the date of the latest change of each sitemap. `/sitemap_index.xml` and `/wp-sitemap.xml` (the addresses of Yoast SEO and WordPress) redirect to it, for sites moved from WordPress.
- There is one sitemap per content type and language (`/sitemap-page-en.xml`, `/sitemap-article-it.xml`…), split every 1000 addresses (`…-2.xml`). Taxonomy archives get their own sitemaps (`/sitemap-tax-category-en.xml`), listing only the terms that have content.
- Each address comes with its date and its images (the featured image and those in the blocks), plus its versions in the other languages (hreflang) when the site is multilingual.
- **Left out of the sitemaps:**
  - pages set to _Hide from search engines_;
  - pages whose _Canonical address_ points elsewhere;
  - content types and taxonomies turned off in **SEO → Search appearance**;
  - the 404 page, private content, and empty archives.
- Sitemaps are sent with `X-Robots-Tag: noindex, follow`, as Yoast SEO does, and a stylesheet (`/sitemap.xsl`) makes them readable in a browser.

## Per page

The editor gets these fields:

- **Search title** and **Search description**.
- **Focus keyphrase**: what the SEO analysis checks the text against.
- **Social image**: shown when the page is shared (otherwise the featured image), with a large card on X.
- **Hide from search engines**: adds a noindex and takes the page out of the sitemap.
- **Canonical address**: for content copied from elsewhere.

Since 2.4.0 the later pages of archives say which they are, as Yoast SEO's `%%page%%`: "Blog – Page 2 of 22 – Site" ("Pagina 2 di 22" in Italian; `%%page%%` in the templates and in imported titles, the page count from core 0.88, plugin API 1.57). Titles imported from WordPress keep their straight quotes and hyphens in the search and social titles, while the page shows WordPress's typography.

Indexed pages get `index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1`, so Google can show large image previews.

## SEO analysis in the editor

The **SEO analysis** section of the editor sidebar shows a **Google preview** of the result and two traffic lights, as Yoast SEO does:

- **SEO**:
  - the keyphrase in the SEO title, in the first paragraph, in the address, in the description, in the subheadings and in an image's alternative text;
  - how often it appears (0.5–3%);
  - the lengths of the keyphrase, title (up to about 60 characters) and description (120–156);
  - the text length (300 words or more);
  - links to other pages of the site and to other sites;
  - alternative texts of images.
- **Readability**:
  - sentences over 20 words (at most 25%);
  - paragraphs over 150 words;
  - a subheading at least every 300 words;
  - transition words (at least 30% of the sentences);
  - reading ease, with Flesch in English and Flesch-Vacca in Italian.

The analysis follows each save.

## Breadcrumbs

The **Breadcrumbs** block shows _Home › Parent page › This page_. Every page also gets the same trail as a schema.org **BreadcrumbList**, which Google shows in results instead of the address.

## Addresses that change

When a published page changes its address or its parent, Cleitext redirects the old address (301), its subpages' too, and updates older redirects so there are no chains. Yoast SEO only does this in its paid version.

## Site settings

- **Titles**: a template per content type, with `%%title%%`, `%%sep%%`, `%%sitename%%`, `%%excerpt%%`, `%%category%%`, `%%currentyear%%` (default `%%title%% %%sep%% %%sitename%%`).

- **SEO page:**
  - which content types and taxonomy archives appear in search results;
  - whether images are listed in the sitemaps;
  - who the site represents (organization or person, with name, logo and social profiles).
- **Settings → SEO:** the title separator, the default description and the X account.

## Structured data

Every page gets one schema.org graph, linked by `@id`:

- **WebSite**, with a search action for the sitelinks search box;
- **Organization** or **Person**, with logo and social profiles;
- **WebPage**, with its primary image and its **BreadcrumbList**;
- **Article** for posts, with author, publisher and categories.
