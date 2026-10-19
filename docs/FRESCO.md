# Fresco and Fresco Pro

Fresco is Cleitext's visual page builder: you build a page by dragging sections and widgets onto it and styling them, while you see the page in your site's own design. **Fresco** is free and in the official catalog. **Fresco Pro** adds the Theme Builder, popups, forms, loops, dynamic content, more widgets and effects; it costs €67 per site with 12 months of updates.

A Fresco page is an ordinary Cleitext entry: revisions, translations, export, search, the AI assistants and the WordPress import keep working. Only the editor is different.

## Getting started

1. Install Fresco from **Plugins → Add New Plugin** and activate it.
2. Open a page and choose **Edit with Fresco**, or create a page and pick Fresco as its editor.
3. Drag a **Container** from the panel onto the page, then widgets into the container.
4. Select an element to change it in the panel: **Content**, **Style** and **Advanced** tabs.
5. **Publish** as usual: the page is saved with its revisions.

The toolbar at the top of the panel opens the **Elements**, the **Templates** library, the **Navigator** (the tree of the page), the **Page settings** and the **Site settings**. Undo and redo are there too (Ctrl+Z, Ctrl+Shift+Z).

**Page settings** set the page's layout (the theme's, **Full width** or **Canvas**, without the theme's header and footer), hide the theme's title, hide the featured image and give the page a background. A hidden featured image still shows in archives, loops and social previews; Full width and Canvas pages never show it. For a social preview without a featured image, use the **Social image** field of the SEO plugin.

The icons above the page switch between **desktop, tablet and mobile**: style values set on a device apply from that device down. Right-click an element for copy, paste, paste style, reset style, duplicate, save as template and delete.

## Layout

- **Container**: flex (row or column) or grid, boxed or full width, with background (color, gradient, image, a video from the media library playing muted behind the content), overlay, border, shadow, shape dividers and a link. Containers nest freely.
- Width, margin, padding, position and z-index of every element are in the **Advanced** tab, with entrance animations, CSS id and classes, and hiding per device.

## Widgets (Fresco)

Heading, Text, Image, Button, Video, Divider, Spacer, Icon, Icon box, Image box, Icon list, Counter, Progress bar, Testimonial, Tabs, Accordion, Toggle, Social icons, Alert, Star rating, HTML, Menu anchor, Google Maps, Text path, Image carousel, Image gallery (with lightbox), SoundCloud and Navigation menu.

Tabs, accordions and toggles hold containers, so anything can go inside them.

**Blocks of other plugins**: the **Plugins** group of the panel has the blocks of the other active plugins, such as Cleishop's product grid and cart link. Their settings are the ones of the block editor, the canvas shows them as the page will, and the Advanced tab works on them like on any widget.

**Switching editors.** **Edit with Fresco** turns block editor content into Fresco elements: text keeps its formatting, columns become containers in a row, and blocks without a widget stay as they are inside a plugin block element. Going back to the block editor, text becomes paragraphs, headings and lists again, rows of containers become columns, and widgets without a block of their own (icon boxes, icon lists, testimonials, counters, tabs and accordions) keep their titles and text. Styles and layout settings are not carried over; the earlier content stays in the revisions. To convert many pages at once, use the **Convert Editors** plugin (**Tools → Convert editors**).

## Site settings

The **Site settings** (the kit) apply to every Fresco page:

- **Global colors and fonts**: pick them in any color or font control; change them once to restyle the site.
- **Theme style**: headings, buttons, images and form fields.
- **Layout**: content width, gaps, breakpoints.
- **Page title selector**, so pages can hide the theme's title. Aurora, Canvas, Pulsar and Vitality leave the title out of the page by themselves, so it never shows twice.
- **Lightbox** settings.

## Atomic mode

Atomic elements (Flexbox, Grid, Div, Heading, Paragraph, Button, Image, SVG, Divider, YouTube, Video) are styled with **classes and variables** instead of per-element settings: create global classes, give them styles per device and state (hover, focus, active), and reuse them. Variables hold colors, fonts and sizes.

## Templates

**Templates** saves a section or a whole page to reuse it, and imports or exports `.fresco.json` files to move designs between sites.

## Coming from WordPress

The WordPress importer (**Import from WordPress** in the admin menu) turns a site built with Elementor (and Elementor Pro) into Fresco:

- **Pages** (and landing pages) become Fresco pages: sections, columns and containers, every common widget with its texts, links, images, global colors and fonts, typography, spacing, per-device values, hover colors, backgrounds (with overlays and videos), borders, shadows and entrance animations. Atomic elements keep their style variants and classes. The page settings come along: full width or canvas layout, hidden title, page background and custom CSS.
- **The kit** joins Fresco's **Site settings**: global colors and fonts (Google fonts are loaded), breakpoints, content width, space between widgets and the theme style (texts, headings, buttons, images, form fields, lightbox).
- **Pro widgets** become their Fresco Pro elements (form, slides, call to action, flip box, price table and list, countdown, animated headline, posts and loops, carousels, theme elements and more), and motion effects, sticky, custom CSS, custom attributes and dynamic tags their Fresco Pro settings.
- **Theme Builder templates** (header, footer, single, archive, popups, loop items, saved sections and global widgets) become Fresco Pro templates with their conditions; popups keep their trigger, frequency and layout. Custom code, custom fonts and the kit's custom CSS go to Fresco Pro's site settings.

Pro widgets, templates and Pro settings show with Fresco Pro: activate it before importing so that templates are imported too. The import report lists what had no counterpart or was approximated.

---

## Fresco Pro

Fresco Pro needs Fresco. It installs without a license as a demo; activating it needs the license key. After the 12 months it keeps working: the license is needed only for new versions.

### Theme Builder

**Theme Builder** (in the admin menu) makes templates for the parts of your theme:

| Template       | Replaces                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------ |
| Header, Footer | The theme's header and footer                                                              |
| Single         | The layout of entries; place a **Post content** element where the entry's own content goes |
| Archive        | Archives and search results; place an **Archive posts** element                            |
| Popup          | Opens over the page                                                                        |
| Section        | A part to reuse with the **Template** element                                              |
| Loop item      | One item of a Loop grid or carousel                                                        |

Each template has **conditions**: include or exclude the entire site, the home page, entries of a type, one entry, entries with a term, archives, a taxonomy, search results, the 404 page. When several templates match, the most specific wins; the Theme Builder warns about overlaps. Themes show templates where they mark their locations (Canvas, Pulsar, Vitality and Aurora do). Archive templates also apply to the listings of plugins: Cleishop's shop page is the archive of the `product` type, its categories and brands are archives of the `product-category` and `brand` taxonomies, and the **Archive posts** element shows their products with filters and pagination.

With the Multilingual plugin, translate a template like a page: on a page in a language, its version in that language is used; without one, the original.

**Theme widgets**: site logo, site title, tagline, post title, excerpt, post content, featured image, post info, archive title, archive posts, breadcrumbs, search form, author box, post navigation and sitemap.

### Popups

A popup template has its own settings in **Page settings → Template**: trigger (on load after a delay, on scroll, when an element is reached, after some clicks, after inactivity, on exit intent, from a link), how often (every time, once per session, every N days, once), after how many page views, on which devices, coming from which address, between which dates, position, size, overlay, close button and animation. Links to `#popup-<template id>` open it; `#popup-close` closes it.

### Dynamic content

The ⚡ button next to text, link and image controls fills them from the page: post title, excerpt, date, terms, URL, featured image, custom fields, archive title and description, site title and tagline, the current year, the author, contact links (email, phone, WhatsApp) and popup links. Use them in templates so one design shows every entry.

### Loops

- **Loop grid** and **Loop carousel** draw each entry with a **Loop item** template, so the card is designed like any other part.
- **Posts** and **Portfolio** have ready-made cards; Portfolio has a filter bar.
- **Taxonomy filter** narrows a loop to one term.

The query chooses the content type, terms, order and how many; pagination can be numbers, previous and next, or a Load more button. Pages and filters are part of the address, so they work without JavaScript. With more than one loop on a page, give each a **Query ID**.

### Forms

The **Form** widget has text, email, textarea, phone, URL, number, date, time, select, radio, checkbox, acceptance, password, hidden and HTML fields, columns, and **steps** with a progress bar.

After sending, a form can: save the message (**Form submissions**, with CSV export), send an email and a second email (e.g. to the visitor), redirect, call a webhook, add the person to **Mailchimp, ActiveCampaign, Kit, MailerLite, GetResponse or Brevo**, notify **Slack** or **Discord**, open or close a popup. Merge tags such as `[all-fields]`, `[email]`, `[form-name]` and `[page-url]` fill emails and addresses.

Spam protection: a hidden field always, plus **Cloudflare Turnstile** or **reCAPTCHA** v2/v3. API keys go in **Form integrations**: they stay on the server, encrypted, and never appear in pages or exported templates. Messages are part of the site's privacy tools (export and erasure by email address).

The **Login** widget signs visitors in on the site itself, two-factor codes included, and shows who is signed in.

### Pro widgets

Animated headline, Price table, Price list, Flip box, Call to action, Countdown (to a date, or per visitor), Blockquote, Table of contents, Share buttons, Code highlight, Hotspot, Progress tracker, Slides, Media carousel, Testimonial carousel, Reviews, Video playlist, Lottie, Facebook embeds (loaded after consent), Floating buttons, Link in bio, PayPal and Stripe buttons, Mega menu, Off-canvas (open with a link to `#offcanvas-<name>`), Nested carousel, Template, Form and Login.

**Global widgets**: right-click an element → **Save as global widget**. It becomes a section template shown by a Template element: change the template and every copy changes.

### Effects and advanced settings

Every element gets, in its **Advanced** tab:

- **Motion effects** on scroll (vertical and horizontal movement, transparency, blur, rotation, scale) and with the mouse (follow, 3D tilt). They respect the visitor's "reduce motion" setting.
- **Sticky** at the top or bottom of the window, or inside its container.
- **Custom CSS**, where `selector` is the element itself.
- **Custom attributes** (`name|value`, one per line; event handlers are not allowed).
- **Display conditions**: signed in or not, between dates, days of the week, hours, an address parameter, content types.

Pages get **custom CSS** and **scroll snap** in their page settings.

### Site features

**Custom code** (administrators) holds:

- **Site CSS**, on every page.
- **Code** for `<head>`, the start or the end of `<body>`, with the same conditions as templates: analytics, pixels, verification tags.
- **Custom fonts**, uploaded as `.woff2`, `.woff`, `.ttf` or `.otf`, then offered in every font picker.
- **Custom icons**, uploaded as SVG files (cleaned of scripts), then offered in the icon picker; they take the text color.
- **Page transitions** between the site's pages, with a preloader.

### Roles

Fresco Pro adds capabilities you can give to roles in the **Roles** card of **Users**:

| Capability                        | Default roles                              | Without it                            |
| --------------------------------- | ------------------------------------------ | ------------------------------------- |
| Edit pages with Fresco            | Administrator, editor, author, contributor | Fresco pages can only be looked at    |
| Change layout and style in Fresco | Administrator, editor                      | Content only: texts, images and links |
| Manage theme templates            | Administrator                              | No Theme Builder                      |
| View form submissions             | Administrator, editor                      | No Form submissions                   |
| Set up form integrations          | Administrator                              | No Form integrations                  |
| Add custom code and site CSS      | Administrator                              | No Custom code                        |

## Licenses

Fresco is GPL-3.0-or-later. Fresco Pro is GPL-3.0-or-later too, sold with access to downloads and updates. Icons come from Font Awesome Free (CC BY 4.0); Lottie animations play with lottie-web (MIT).
