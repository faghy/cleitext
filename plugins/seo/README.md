# SEO

The official Cleitext SEO plugin, in the spirit of Yoast SEO. It ships with Cleitext.

## XML sitemaps for Search Console

Cleitext writes the sitemaps; this plugin decides what goes in them. Submit **`https://<your site>/sitemap.xml`** in Google Search Console (**Sitemaps → Add a new sitemap**) and in Bing Webmaster Tools; `robots.txt` already points to it. The **SEO** page of the admin shows the address, the steps and the list of sitemaps.

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
- **Hide from search engines**: adds a noindex and takes the page out of the sitemap.
- **Canonical address**: for content copied from elsewhere.

Indexed pages get `index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1`, so Google can show large image previews.

## Site settings

- **SEO page:**
  - which content types and taxonomy archives appear in search results;
  - whether images are listed in the sitemaps;
  - who the site represents (organization or person, with name, logo and social profiles).
- **Settings → SEO:** the title separator, the default description and the X account.

## Structured data

Every page gets one schema.org graph, linked by `@id`:

- **WebSite**, with a search action for the sitelinks search box;
- **Organization** or **Person**, with logo and social profiles;
- **WebPage**, with its primary image;
- **Article** for posts, with author, publisher and categories.
