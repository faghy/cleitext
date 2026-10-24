# Fresco and Fresco Pro

Fresco is Cleitext's visual page builder: you build a page by dragging sections and widgets onto it and styling them, while you see the page in your site's own design. **Fresco** is free and in the official catalog. **Fresco Pro** adds the Theme Builder, popups, forms, loops, dynamic content, more widgets and effects; it costs €67 per site with 12 months of updates.

A Fresco page is an ordinary Cleitext entry: revisions, translations, export, search, the AI assistants and the WordPress import keep working. Only the editor is different.

## Getting started

1. Install Fresco from **Plugins → Add New Plugin** and activate it.
2. Open a page and choose **Edit with Fresco**, or create a page and pick Fresco as its editor. On the site, while signed in, the toolbar at the top of a Fresco page has **Edit with Fresco** too.
3. Drag a **Container** from the panel onto the page, then widgets into the container.
4. Select an element to change it in the panel: **Content**, **Style** and **Advanced** tabs.
5. **Publish** as usual: the page is saved with its revisions.

The toolbar at the top of the panel opens the **Elements**, the **Templates** library, the **Structure** (the tree of the page), the **Page settings** and the **Site settings**. Undo and redo are there too (Ctrl+Z, Ctrl+Shift+Z); Ctrl+S saves, from the canvas too.

- **Panel**: drag its right edge to make it wider or narrower; double-click the edge to reset it.
- **Structure**: a window you move by its header; drop it on the right edge and it docks there, beside the canvas, with a width you set by dragging its left edge.
- **Finder** (Ctrl+E, or its button): one search box for the elements of the page, the widgets to add, the site's other pages and posts (to open them in Fresco) and the editor's commands. Shift+? lists the keyboard shortcuts.
- **Several elements**: Ctrl-click (Cmd-click on a Mac) selects more than one, to delete, duplicate or copy them together.
- **Repeaters** (list items, social icons, slides…): drag an item by its handle to reorder it.

**Page settings** have three tabs. **Settings**: title, status, featured image, the page's layout (the theme's, **Full width** or **Canvas**, without the theme's header and footer), hiding the theme's title and the featured image. **Style**: the page background (color, gradient or image) and the padding around the content. **Advanced**: custom CSS and scroll snap, with Fresco Pro. A hidden featured image still shows in archives, loops and social previews; Full width and Canvas pages never show it. For a social preview without a featured image, use the **Social image** field of the SEO plugin.

**Colors**: the swatch opens a picker with hue and **opacity**, the browser's **eyedropper** (where the browser has one) and a hex or rgba value; the globe beside it picks one of the **global colors**. **Fonts**: the font picker searches the whole **Google Fonts** list, with the popular ones and the system fonts first; only the fonts a page uses are loaded on it.

The icons above the page switch between **devices**: desktop, tablet and mobile, plus the breakpoints turned on in **Site settings → Layout** (**widescreen**, **laptop**, **tablet extra**, **mobile extra**: up to six). Style values set on a device apply from that device down (widescreen: from its width up). Right-click an element for copy, paste, paste style, reset style, duplicate, save as template and delete; right-click the empty canvas for **Copy all**, which copies the whole page to paste it on another one.

## Layout

- **Container**: flex (row or column) or grid, boxed or full width, with background (color, gradient, image, a video from the media library playing muted behind the content), overlay, border, shadow, shape dividers and a link. Containers nest freely.
- Width, margin, padding, position and z-index of every element are in the **Advanced** tab, with entrance animations, CSS id and classes, and hiding per device.

## Widgets (Fresco)

Heading, Text, Image, Button, Video, Divider, Spacer, Icon, Icon box, Image box, Icon list, Counter, Progress bar, Testimonial, Tabs, Accordion, Toggle, Social icons, Alert, Star rating, HTML, Menu anchor, Google Maps, Text path, Image carousel, Image gallery (with lightbox), SoundCloud, Navigation menu, Floating buttons (WhatsApp, phone, SMS, email, Telegram, Messenger and more, shown together, from one button or as a chat box) and Link in bio (with an optional cover picture).

**Images from the desktop**: drag image files from your computer onto the page in the editor. They go to the media library and become Image elements where you drop them; drop one on an Image element to replace its picture.

Tabs, accordions and toggles hold containers, so anything can go inside them.

**Blocks of other plugins**: the **Plugins** group of the panel has the blocks of the other active plugins, such as Cleishop's product grid and cart link. Their settings are the ones of the block editor, the canvas shows them as the page will, and the Advanced tab works on them like on any widget. A plugin that also gives its block as an element of its own, with Fresco's `registerElement` and the block's type (Diorama's **Slider**, in **Media**), is offered once, as that element (Fresco 2.8.2).

**Switching editors.** **Edit with Fresco** turns block editor content into Fresco elements: text keeps its formatting, columns become containers in a row, and blocks without a widget stay as they are inside a plugin block element. Going back to the block editor, text becomes paragraphs, headings and lists again, rows of containers become columns, and widgets without a block of their own (icon boxes, icon lists, testimonials, counters, tabs and accordions) keep their titles and text. Styles and layout settings are not carried over; the earlier content stays in the revisions. To convert many pages at once, use the **Convert Editors** plugin (**Tools → Convert editors**). To leave Fresco keeping the layout (full-width sections, columns with their widths, colors and padding), use the **Layout Import** plugin (**Tools → Layout import → Fresco pages of this site**): it reports what has no block.

## Site settings

The **Site settings** (the kit) apply to every Fresco page:

- **Global colors and fonts**: pick them in any color or font control; change them once to restyle the site.
- **Theme style**: headings, buttons, images and form fields.
- **Layout**: content width, gaps, breakpoints (the extra ones are off until you turn them on; pages made before look the same).
- **Page title selector**, so pages can hide the theme's title. Aurora, Canvas, Pulsar and Vitality leave the title out of the page by themselves, so it never shows twice.
- **Lightbox** settings.

### Google Fonts and privacy

**Site settings → Global fonts → Google Fonts** says where pages get the Google fonts of the kit and of the elements (since Fresco 2.8):

- **Host on this site** (the default, also for sites made before): the first time a page needs a family, the server downloads its stylesheet and font files from Google once (only `fonts.googleapis.com` and `fonts.gstatic.com`, over https, with size limits and timeouts, as a modern browser so the files are WOFF2 split by alphabet) and keeps them in Fresco's own table. Pages link the site's copy (`/_fresco/gfonts/<name>.css`, its files beside it, cached for a year): **no visitor's browser talks to Google**, so no consent is needed for fonts (LG München, 20 January 2022; the Italian Garante agrees). A page waits up to 2.5 seconds for a new family; when the download takes longer or fails, the page shows the fallback font, never Google's link, the failure is written to the log and the download is tried again later (10 minutes, then longer; **Tools → Regenerate CSS** tries again at once). When a copy becomes ready, the cached pages that went without it are refreshed.
- **Load from Google**: pages link `fonts.googleapis.com`, as before 2.8. Visitors' IP addresses reach Google: in the EU this needs their consent. Since Cleitext 0.71 the core keeps every Google Fonts link of a page on the site by default (**Settings → General → Privacy → Web fonts**, [Privacy](./PRIVACY.md#web-fonts-kept-on-the-site)): for pages to really load from Google, choose **Load them from Google or Bunny Fonts** there too.
- **Don't load**: Fresco adds no Google font at all; the theme or your own CSS provides them (e.g. with `@font-face` rules of fonts kept on the site).

Whatever the choice, Fresco never adds a family the page already loads by itself: one the theme links from Google Fonts or Bunny Fonts (`<link rel="stylesheet">` or `@import`), or declares with `@font-face` in a `<style>` of the page (themes write their CSS there; Fresco Pro's custom fonts too), or one **Prisma** already added from its own copies (each link names its family). A family declared only inside a linked stylesheet file is not seen: if your theme does that, choose **Don't load**. Families are compared by name, not by weight: a weight the theme lacks is drawn by the browser.

The editor's canvas follows the same choice: with **Host on this site** it uses the site's copies too (a family picked for the first time shows after a few seconds, while the server copies it), with **Load from Google** it loads them from Google, with **Don't load** none. The **Privacy & GDPR** plugin can check the pages: **Privacy → Cookie banner → Fonts from Google**.

## Atomic mode

Atomic elements (Flexbox, Grid, Div, Heading, Paragraph, Button, Image, SVG, Divider, YouTube, Video) are styled with **classes and variables** instead of per-element settings: create global classes, give them styles per device and state (hover, focus, active), and reuse them. Variables hold colors, fonts and sizes.

## Templates

**Templates** saves a section or a whole page to reuse it, and imports or exports `.fresco.json` files to move designs between sites. Search them by name, preview them at the width of a desktop, a tablet or a phone before inserting them, rename and delete them, in the editor (Ctrl/⌘+Shift+L) or in **Fresco → Templates**.

**Import** also takes **Elementor template files**: the `.json` files Elementor exports from **Templates → Export**, or that template sites distribute (not kit `.zip` files). They are converted as the WordPress importer converts Elementor pages; the title is kept, and a template of type page becomes a page, any other type a section. Images stay at their original address (nothing is downloaded): a notice says how many, so you can upload them to the media library and replace them. Widgets with no Fresco counterpart keep only their text, and elements this site does not have (Fresco Pro's, without Fresco Pro) are left out; a notice gives their count. Global colors and fonts refer to this site's.

## Fresco's menu

Besides the overview and **Templates**, the **Fresco** menu of the admin has (for administrators):

- **Site settings**: opens the editor on its Site settings panel, also before any page is made with Fresco (a draft page is made for it).
- **Tools**: **Regenerate CSS** (when a page looks wrong after an update), **Replace URL** (after moving the site to a new address or to HTTPS: counts the old address in every Fresco page and template, then replaces it; earlier revisions stay) and the versions of Cleitext, Fresco and Fresco Pro.
- **Element manager**: every element of the editor with how much the site uses it (counted when you ask). Switch off those you do not need: they leave the editor's panel, and pages that have them keep showing them.
- **Safe mode** (in **Tools**, or in the editor's Fresco menu): opens a page in the editor with other plugins' blocks and the styles of the theme and of other plugins switched off. If a problem goes away there, one of them causes it. A bar over the canvas leaves Safe mode.
- **System info**: versions, server, site, active theme and plugins, with a button that copies them for a support request.

## AI assistants

**Chriss**, the Cleitext assistant, and the assistants connected over MCP know which pages are made with Fresco and keep them Fresco pages ([MCP](MCP.md)). They read Fresco's guide (its elements and settings, devices, hover, the site's global colors and fonts) and write containers and widgets directly; blocks or HTML they send for a Fresco page are converted by Fresco. What they write is checked: unknown elements and widgets outside containers are refused, and rich text is cleaned. **Ask Chriss** in the entry editor opens the chat about that page.

## Coming from WordPress

The WordPress importer (**Import from WordPress** in the admin menu) turns a site built with Elementor (and Elementor Pro) into Fresco:

- **Pages** (and landing pages) become Fresco pages: sections, columns and containers, every common widget with its texts, links, images, global colors and fonts, typography, spacing, per-device values, hover colors, backgrounds (with overlays and videos), borders, shadows and entrance animations. Atomic elements keep their style variants and classes. The page settings come along: full width or canvas layout, hidden title, page background and custom CSS.
- **The kit** joins Fresco's **Site settings**: global colors and fonts (Google fonts are loaded, kept on the site by default), breakpoints, content width, space between widgets and the theme style (texts, headings, buttons, images, form fields, lightbox).
- **Pro widgets** become their Fresco Pro elements (form, slides, call to action, flip box, price table and list, countdown, animated headline, posts and loops, carousels, theme elements and more), and motion effects, sticky, custom CSS, custom attributes and dynamic tags their Fresco Pro settings.
- **Theme Builder templates** (header, footer, single, archive, popups, loop items, saved sections and global widgets) become Fresco Pro templates with their conditions; popups keep their trigger, frequency and layout. Custom code, custom fonts and the kit's custom CSS go to Fresco Pro's site settings.

Shortcodes of other plugins standing alone in a shortcode, text or HTML widget become those plugins' blocks when an active plugin converts them (e.g. Kross Booking's `[kross-booking]`), inside a plugin block element; the others stay text.

Pro widgets, templates and Pro settings show with Fresco Pro: activate it before importing so that templates are imported too. The import report lists what had no counterpart or was approximated.

---

## Fresco Pro

Fresco Pro needs Fresco. It installs without a license as a demo; activating it needs the license key. After the 12 months it keeps working: the license is needed only for new versions.

### Theme Builder

**Theme Builder** (under **Fresco → Templates**) makes templates for the parts of your theme:

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

**Templates → Popups** lists the popup templates and makes new ones. A popup template has its own settings in **Page settings → Template**: trigger (on load after a delay, on scroll, when an element is reached, after some clicks, after inactivity, on exit intent, from a link), how often (every time, once per session, every N days, once), after how many page views, on which devices, coming from which address, between which dates, position, size, overlay, close button and animation. Links to `#popup-<template id>` open it; `#popup-close` closes it.

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

Spam protection: a hidden field always, plus **Cloudflare Turnstile** or **reCAPTCHA** v2/v3. API keys go in **Form integrations**: they stay on the server, encrypted, and never appear in pages or exported templates. Messages are part of the site's privacy tools (export and erasure by email address). With the free **Captcha** plugin, a form can use the **site captcha** instead (keys set once in Settings → Captcha); forms without keys of their own, and those with only the hidden field, use it too when the Captcha plugin protects page builder forms.

The **Login** widget signs visitors in on the site itself, two-factor codes included, and shows who is signed in.

### Pro widgets

Animated headline, Price table, Price list, Flip box, Call to action, Countdown (to a date, or per visitor), Blockquote, Table of contents, Share buttons, Code highlight, Hotspot, Progress tracker, Slides, Media carousel, Testimonial carousel, Reviews, Video playlist, Lottie, Facebook embeds (loaded after consent), PayPal and Stripe buttons, Mega menu, Off-canvas (open with a link to `#offcanvas-<name>`), Nested carousel, Template, Form and Login.

**Global widgets**: right-click an element → **Save as global widget**. It becomes a section template shown by a Template element: change the template and every copy changes.

### Effects and advanced settings

Every element gets, in its **Advanced** tab:

- **Motion effects** on scroll (vertical and horizontal movement, transparency, blur, rotation, scale) and with the mouse (follow, 3D tilt). They respect the visitor's "reduce motion" setting.
- **Sticky** at the top or bottom of the window, or inside its container.
- **Custom CSS**, where `selector` is the element itself.
- **Custom attributes** (`name|value`, one per line; event handlers are not allowed).
- **Display conditions**: signed in or not, between dates, days of the week, hours, an address parameter, content types.

Pages get **custom CSS** and **scroll snap** in the **Advanced** tab of their page settings.

### Site features

**Custom code** (administrators) holds:

- **Site CSS**, on every page.
- **Code** for `<head>`, the start or the end of `<body>`, with the same conditions as templates: analytics, pixels, verification tags.
- **Page transitions** between the site's pages, with a preloader.

**Fonts & icons** (administrators) holds:

- **Custom fonts**, uploaded as `.woff2`, `.woff`, `.ttf` or `.otf`, then offered in every font picker.
- **Custom icons**, uploaded as SVG files (cleaned of scripts), then offered in the icon picker; they take the text color.

**License** (under Fresco, for who activates plugins) shows the license of Fresco Pro on the site, as **Plugins** does: enter the key, check it, renew or remove it.

### Roles

Fresco Pro adds capabilities you can give to roles in the **Roles** card of **Users**:

| Capability                        | Default roles                              | Without it                            |
| --------------------------------- | ------------------------------------------ | ------------------------------------- |
| Edit pages with Fresco            | Administrator, editor, author, contributor | Fresco pages can only be looked at    |
| Change layout and style in Fresco | Administrator, editor                      | Content only: texts, images and links |
| Manage theme templates            | Administrator                              | No Theme Builder                      |
| View form submissions             | Administrator, editor                      | No Form submissions                   |
| Set up form integrations          | Administrator                              | No Form integrations                  |
| Add custom code and site CSS      | Administrator                              | No Custom code, no Fonts & icons      |

## Extending the editor (for plugin authors)

Other plugins extend Fresco through `extensions()`, a set of lists kept on `globalThis` and reached from Fresco's API (`globalThis[Symbol.for('cleitext.fresco')].extensions()`, once Fresco has loaded: plugins that load first queue a callback under `Symbol.for('cleitext.fresco.queue')`). A plugin pushes into the lists from its admin entry; the server lists (`controls`, `css`, `visible`, `resolve`…) are emptied and set up again whenever plugins reload. A failing extension never breaks the editor or the page: its error is logged and it is left out.

Since Fresco 2.5 the editor has four more hooks. Each one gets the **editor context**, one per open editor:

```ts
interface EditorContext {
  entry: { id: string; type: string; locale: string }; // the entry being edited
  readOnly(): boolean;
  selected(): string | null; // the selected element's id
  select(id: string | null): void; // as a click in the canvas
  node(id: string): FrescoNode | null;
  canvas(): Document | null; // the page in the canvas (null while it loads)
  reveal(id: string): void; // scrolls the canvas to an element
  refresh(): void; // draws badges, overlays and menu items again
  notify(text: string, kind?: 'info' | 'success' | 'error'): void;
}
```

Labels are in English: the editor translates them with the admin's translations, so a plugin adds its own Italian strings as usual. Icons are SVG paths on a 24×24 grid, drawn with the current color.

**`topbarItems`**: buttons in the editor's top bar, before the Finder (or in the toolbar of the editor shown inside the admin's bar), with a badge.

```ts
interface TopbarItem {
  id: string;
  label: string;
  icon: string;
  shortcut?: string; // shown in the title, e.g. 'Shift+C'
  badge?: (editor) => number | string | null | undefined; // 0, '' or null: no badge; over 99: '99+'
  active?: (editor) => boolean; // shown pressed
  when?: (editor) => boolean; // shown only when true
  onClick(editor): void;
}
```

The badge and the state are read again when the page changes and when the plugin calls `editor.refresh()` (e.g. after loading its data).

**`shortcuts`**: keyboard shortcuts, in the canvas and in the editor alike, listed in the **Keyboard shortcuts** window (Shift+?) under their `group` (**Plugins** by default).

```ts
interface EditorShortcut {
  id: string;
  keys: string; // 'Shift+C', 'Ctrl+Alt+N', 'Escape', 'F2'…; Ctrl is ⌘ on a Mac
  label: string;
  group?: string;
  whileTyping?: boolean; // also in fields and texts edited in place (false by default)
  run(editor, event: KeyboardEvent): void | boolean; // false: the key goes on
}
```

Every modifier must match (`Shift+C` does not run on Ctrl+Shift+C). Fresco's own shortcuts come first: a plugin cannot take Ctrl+Z, Ctrl+S and the others. When `run` acts, the key is kept from the browser.

**`canvasOverlays`**: React layers drawn over the canvas, inside its page, given the boxes of the elements they ask for.

```ts
interface CanvasOverlay {
  id: string;
  elements(editor): string[]; // the element ids it needs the boxes of
  component: ComponentType<{
    editor: EditorContext;
    boxes: Record<string, { x: number; y: number; width: number; height: number }>;
    doc: Document; // the canvas page
  }>;
}
```

Boxes are in the page's coordinates and follow layout, scrolling and resizing, so an overlay places its parts with `position: absolute` and these numbers. Elements not on the page have no box. The layers are marked `data-fre-ui`: a click on them never selects or drags an element. They take pointer events only where the overlay's own parts do; a layer that throws is left out. Overlays style themselves (inline styles, or a `<style>` they render: the canvas is a separate document).

**`contextMenuItems`**: items of an element's right-click menu, in a group of their own before **Delete**.

```ts
interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string; // shown at the end of the item
  danger?: boolean;
  when?: (node: FrescoNode, editor) => boolean; // shown only for some elements
  disabled?: (node: FrescoNode, editor) => boolean;
  run(node: FrescoNode, editor): void | Promise<void>; // a rejected promise is shown as an error
}
```

`menuActions` (label, `when`, `run(node, { replace })`) keep working as before, in the group of **Save as template**.

An example, a "Notes" button with a count, Shift+C, pins on the elements and "Add note" in the menu:

```tsx
onFresco((fresco) => {
  const ext = fresco.extensions();
  ext.topbarItems.push({
    id: 'my-notes',
    label: 'Notes',
    icon: 'M4 4h16v12H8l-4 4z',
    shortcut: 'Shift+C',
    badge: () => openNotes.length,
    onClick: (editor) => togglePanel(editor),
  });
  ext.shortcuts.push({
    id: 'my-notes/mode',
    keys: 'Shift+C',
    label: 'Notes mode',
    run: (editor) => toggleMode(editor),
  });
  ext.canvasOverlays.push({
    id: 'my-notes/pins',
    elements: () => openNotes.map((note) => note.elementId),
    component: ({ boxes }) => (
      <>
        {openNotes.map((note) =>
          boxes[note.elementId] ? (
            <button
              key={note.id}
              style={{
                position: 'absolute',
                left: boxes[note.elementId].x + 18,
                top: boxes[note.elementId].y + 6,
              }}
            >
              {note.number}
            </button>
          ) : null,
        )}
      </>
    ),
  });
  ext.contextMenuItems.push({
    id: 'my-notes/add',
    label: 'Add note',
    run: (node, editor) => startNote(editor, node.id),
  });
});
```

## Licenses

Fresco is GPL-3.0-or-later. Fresco Pro is GPL-3.0-or-later too, sold with access to downloads and updates. Icons come from Font Awesome Free (CC BY 4.0); Lottie animations play with lottie-web (MIT).
