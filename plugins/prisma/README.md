# Prisma

The official Cleitext plugin for design blocks. It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-prisma-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

Its blocks are edited in the block editor with a live preview. The settings are in the sidebar, in the **General**, **Style** and **Advanced** tabs. Values that change by device (sizes, spacing, columns) follow the desktop, tablet and mobile switcher at the top of the editor. The blocks are in the **Prisma** group of the inserter.

## The blocks

**Layout and basics.** Container (rows, columns or grids with backgrounds, overlays and shape dividers), Heading, Image (with masks), Image Gallery (grid, masonry, carousel, tiles, lightbox), Info Box, Buttons, Icon, Icon List, Separator.

**Content.** Call to Action, Marketing Button, Blockquote (with a share link), Counter (number, bar or circle), Countdown (to a date, or per visitor), Star Rating, Inline Notice (can be closed), Tabs, FAQ (accordion or grid, with FAQ structured data), Modal (opened by text, icon, image, button or automatically), Slider, Content Timeline, Table of Contents.

**People and business.** Testimonials (columns or carousel), Team, Social Share, Price List, Review (with review structured data), How-To (with HowTo structured data), Google Map, Lottie animation.

**Posts.** Post Grid (also as masonry), Post Carousel, Post Timeline and Taxonomy List, from the site's posts and categories, or from any content type (paintings, portfolio, real estate, events…): its custom fields can be shown under the title with their labels, entries can follow the manual order, and with the picture beside the text the sides can alternate. Buttons, page links and empty messages follow the page's language.

**Forms.** A form with name, email, phone, URL, text, select, radio, checkbox, toggle, date, hidden, upload and consent fields. Messages are sent by email to the addresses of the form, with a honeypot, a time check, a rate limit and optional reCAPTCHA v2/v3 against spam. With the free **Captcha** plugin, forms can use the site's captcha instead (Cloudflare Turnstile or reCAPTCHA, keys set once in Settings → Captcha): choose **Site captcha** in the form's reCAPTCHA panel; forms without reCAPTCHA keys of their own use it too, when the Captcha plugin protects page builder forms.

Every block can also have an **entrance animation**, be **hidden on desktop, tablet or mobile**, and use **Google Fonts**.

**Settings → Prisma** holds the site's defaults:

- the content width of boxed containers;
- the padding of containers;
- the gap between elements;
- CSS variables, such as a color palette the blocks can use with `var(--name)`;
- **Google Fonts**: where pages get the Google fonts chosen in the blocks (see below);
- the address that receives the forms' messages when a form names none, and the reCAPTCHA keys.

## Google Fonts and privacy

**Settings → Prisma → Google Fonts** (since Prisma 0.7):

- **Host on this site** (the default, also for sites made before): the first time a page needs a family, the server downloads its stylesheet and font files from Google once (only `fonts.googleapis.com` and `fonts.gstatic.com`, over https, with size limits and timeouts) and keeps them in Prisma's own table. Pages link the site's copy (`/_prisma/gfonts/<name>.css`, its files beside it, cached for a year): **no visitor's browser talks to Google**, so no consent is needed for fonts (LG München, 20 January 2022; the Italian Garante agrees). A page waits up to 2.5 seconds for a new family; when the download takes longer or fails, the page shows the fallback font, never Google's link, the failure is written to the log and the download is tried again later (10 minutes, then longer). When a copy becomes ready, the cached pages that went without it are refreshed.
- **Load from Google**: pages link `fonts.googleapis.com`, as before 0.7. Visitors' IP addresses reach Google: in the EU this needs their consent.
- **Don't load**: Prisma adds no Google font; the theme or your own CSS provides them.

Whatever the choice, Prisma never adds a family the page already loads: one the theme links from Google Fonts or Bunny Fonts, or declares with `@font-face` in a `<style>` of the page, or one **Fresco** already added on the same page (each plugin keeps its own copies, but a family is linked once). Families are compared by name, not by weight.

The block editor follows the same choice: with **Host on this site** the canvas uses the site's copies (a family picked for the first time shows after a few seconds, while the server copies it), with **Load from Google** it loads them from Google, with **Don't load** none. The **Privacy & GDPR** plugin can check the pages: **Privacy → Cookie banner → Fonts from Google**.

## WordPress

The WordPress importer turns the Spectra blocks into these blocks, keeping their settings, including the older Section, Columns and Column layouts (as containers). Activate this plugin **before** importing. WordPress covers become containers with their background picture and overlay; the additional CSS classes of the blocks and WordPress's hiding by device (desktop, tablet, phone, with WordPress's breakpoints) are kept.

Plugin API 1.44: blocks with their own editor (`blocks`), the stylesheets and scripts of the site (`theme:hooks`), its own settings (`settings:own`), posts and media (`content:read`), comment counts (`comments`), the form's address and the fonts kept on the site (`routes:public`), the editor's fonts (`routes:admin`), its emails (`mail:send`), the reCAPTCHA check and the download of Google fonts (`network`).
