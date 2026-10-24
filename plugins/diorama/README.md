# Diorama

🇮🇹 [Leggi in italiano](./README.it.md)

The official Cleitext plugin for **sliders and hero sections**: quick to make, light on your pages, readable on phones and usable by everyone. It is free and not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-diorama-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**. It needs Cleitext 0.72 or later (plugin API 1.46).

The free version keeps **one slider per site**, with as many slides as you like and every feature below. **Diorama Pro** (a separate, paid plugin) gives as many sliders as you need, plus carousels, popups and more effects.

## What it does

- **Two ways in the same editor.**
  - **The fast path:** New slider → **From your pictures** → choose a few pictures → a title, a text and a button for each, if you like → done. Or start from one of **ten templates** (a hero with a call to action, a restaurant, a shop sale, testimonials, a portfolio, an event, a hotel, a studio, a gym, the latest posts), made only of colours, gradients, shapes and icons: put your own pictures in afterwards.
  - **The visual path:** layers placed on the slide by dragging them and resizing them on the canvas; a **device switch** (computer, tablet, phone); the **Content**, **Style** and **Motion** tabs of the selected layer; undo and redo; duplicate a slide or a layer; a live preview with the real slider.
  - The **Advanced** switch shows the finer timing (how long effects last) and their easing.
- **Kinds and sizes.** A **slider** or a **hero** (one scene). In the page's content (with a widest size), **full width**, or **full screen** with room for a fixed header. The height is set per device.
- **Backgrounds.** A picture of the media library with the point that stays in view (click on it), a colour, a gradient, or a video: an MP4 of the library, or YouTube and Vimeo in their privacy-friendly players. A shade over the background, and a slow **Ken Burns** movement (zoom in, zoom out, pan).
- **Layers.** Heading (H1–H4 or text), text, button (to a page of the site, an address, a phone call, an email or a section of the page), image, icon (24 icons), shape (rectangle, circle, blob, line), and the **content box**: a heading, a text and buttons one under the other, placed with nine ready positions.
- **Every device.** Position, size and style have a value for the computer and, only where you change them, for tablets and phones (a dot marks what differs, with a reset). Any layer can be hidden on a device. On phones, texts and buttons get a **readable layout by themselves**: wide, centred, with smaller but never tiny type, until you place them by hand.
- **Fonts and text** (Diorama 1.2).
  - **Fonts:** the theme's font for texts (the default) or for headings, the **site's own fonts** (those the theme declares or loads, Fresco's global fonts, those Cleitext keeps on the site), or any **Google font**, found with a search. A Google font is asked for with an ordinary link, which Cleitext turns into the site's own copy (Settings → Privacy → Web fonts): visitors never reach Google, and a family the page already loads is not added again. The editor's canvas and the preview show the real fonts.
  - **Outline of the letters** (width and colour, per device) for headings, texts and buttons, and **outlined letters** (only the outline, no fill) with one switch.
  - **Line breaks:** balanced lines (what headings always had), even lines at the end, as the browser breaks them, or one line (on phones it wraps anyway unless you choose one line there too). Shift+Enter in a text, and in a button's text, starts a new line, kept as it is.
  - **Button size:** a height with the text in the middle (the space inside still applies), and a width as its text, fixed, or full.
- **Motion.** 15 entrance and exit effects with their delay (and duration and easing in Advanced), hover effects for buttons, and slide transitions: fade, crossfade, slide in four directions, slide over, zoom.
- **Navigation.** Arrows, dots and a progress bar in six styles, with their colour and size; swipe and drag; the keyboard's arrows, Home and End while the slider has the focus; autoplay that pauses under the mouse and on focus, with a **pause button** always there while it plays.
- **The latest blog posts** as slides: the first slide is the model, with the tags `{{title}}`, `{{excerpt}}`, `{{date}}`, `{{category}}` and `{{author}}`, links to "the post of the slide" and its featured image as background. By category, with the number of posts and the excerpt's length.

## Accessible and fast by default

- Carousel semantics (`aria-roledescription`, slides named "2 of 5"), hidden slides out of the reading order (`aria-hidden`, `inert`), named buttons, the live region off while slides play by themselves, alternative texts from the media library (or your own, or none for decoration), one main heading where you choose it.
- **Reduced motion** is respected: with the visitor's "reduce motion" setting nothing moves by itself, no effect or Ken Burns plays, videos do not start, and slides still change, at once.
- A small runtime of its own (about 9 KB, no jQuery or animation library) using CSS animations and Web Animations, added **only to pages with a slider**.
- Responsive pictures (`srcset` and `sizes` from the media library's AVIF and WebP copies); the first one loads at once with high priority, the others lazily.
- The height is reserved in CSS for every device, so the page never jumps while it loads. Fonts shrink with the slider's width (container queries) and never below three quarters.
- YouTube and Vimeo backgrounds wait for marketing consent when the **Privacy & GDPR** plugin is active (they are declared to it), and load at once otherwise; the picture shows until then.

## How to use it

1. Activate Diorama in **Plugins**, then open **Diorama** in the admin's menu.
2. **New slider** → from your pictures, from a template, or blank.
3. Show it on a page:
   - the **Slider (Diorama)** block in the block editor (it shows the slider, with a link to edit it);
   - the **Slider** widget in Fresco (in **Media**);
   - the shortcode `[diorama alias="home"]` (or `id="…"`) alone in a paragraph, anywhere blocks go: WordPress pages imported with it get the block;
   - in a theme, the same block in a block area or a template.

Sliders are kept in the plugin's table, so they are in Cleitext's **backups**, and `cleitext export` / `import` move them with the site (plugin API 1.46): pictures and the pages buttons lead to are remapped to the new site's. A second slider is refused only when it is made: what you have keeps working and stays editable.

## For developers: extending Diorama (Diorama Pro)

Diorama keeps its extension points on `globalThis`, like Fresco, so a separate plugin (Diorama Pro, requiring `diorama`) can lift the limit and add features without a new release of Diorama. A failing extension is logged and left out.

**Server** — `globalThis[Symbol.for('cleitext.diorama')]` (`src/pro.ts`), set up again on every reload of the plugins:

| List           | What it does                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sliderLimit`  | Functions `(siteId) => number \| null`: the largest answer is how many sliders a site may have (Diorama answers 1; Pro with a valid license, `Infinity`). |
| `sources`      | Content sources besides "made here" and the latest posts (`{ id, load(slider, context) }`, filling the template slide like posts).                        |
| `beforeRender` | `(slider, { siteId, locale }) => slider`: change a slider before it is drawn (scheduled slides, slides by language…).                                     |
| `renderers`    | `(input) => ReactNode \| undefined`: draw a slider instead of Diorama (carousel, popup…); the first answer wins.                                          |
| `media`        | `(slider) => string[]`: media ids in the plugin's own data, preloaded with their responsive copies.                                                       |
| `upgradeUrl`   | The page shown by the invitation to Pro.                                                                                                                  |

Every slider, slide and layer has an `ext` object that Diorama keeps as it is (up to 32 KB): Pro stores its own settings there.

Since Diorama 1.1 the server API also has:

- `decorators`: `(input) => RenderDecorator | undefined`, asked before `renderers`; their answers are merged into `input.decorate`. A decorator adds classes and attributes to the slider's root, its slides and its layers (attributes come after Diorama's, so `data-transition` may name another transition), settings merged into the runtime's `data-dio` (e.g. `effect`), more CSS, markup inside the stage after the slides (layers shown on every slide) and after the navigation (thumbnails, tabs), and the text of a heading, a text or a button (e.g. split in letters). The editor's canvas draws no decorations.
- `sliders`: `list(siteId)` and `get(siteId, idOrAlias)`, read only (e.g. popups placed on every page).
- `lib`: Diorama's own drawing (`SliderView`, `SlideView`, `LayerView`, `sliderCss`, `BASE_CSS`, `stringsFor`, breakpoints…), so an extension reuses it without bundling it.
- Renderers get the slider's `alias` and `sliderId` too.
- Layers placed on the slide add `--dio-tx` and `--dio-ty` (lengths, `0px` by default) to their position: offsets an extension may animate (parallax, loops).

**Admin** — `globalThis[Symbol.for('cleitext.diorama.admin')]` (`src/studio/pro.ts`): `sliderPanels` (more sections of the Slider settings, with the slider, the device and an `onChange`), `templates` (more ready-made sliders in the gallery), `canCreate` and `invitation` (the text of the invitation). Since 1.1: `layerPanels` (sections of a layer's tab, Motion by default, with an `onChange` of the layer), `slidePanels` (sections of the Slide settings), `canvasPanels` (panels under the canvas, optionally only with the Advanced switch on, e.g. a timeline), `preview` (`decorators`, `renderers`, `scripts` and `styles` for the Preview's frame, as on pages) and `lib` (Diorama's components, its editor's controls and model helpers, set when Diorama's admin loads). Templates of extensions are created from their data.

**Browser** — `window.cleitextDiorama`: `transitions[name] = (from, to, { duration, easing, direction }) => Animation[]` adds a slide transition (used when a slide's or the slider's effect has that name), and `listeners` are called with each slider on `'ready'` and `'change'`. Scripts enqueued by another plugin after Diorama's run before the sliders start. Since 1.1: buttons with `data-dio-go="<n>"` anywhere in the slider's root (thumbnails, tabs) go to slide `n` and get `aria-current`; a slider has `setPaused(boolean)` and `paused`; `scan()` starts sliders added to the page later.

Since Diorama 1.2 a layer's `fontFamily` is also `heading` (the theme's font for the layer's tag: the layer gets the class `dio-fh` and no family of its own) or a family's name (`Rubik`); `src/model/fonts.ts` has the helpers. The block adds a Google Fonts `<link data-dio-fonts>` after a slider that uses Google fonts (whatever draws it, Pro's renderers included), and a `render.html` filter replaces these links with one link in the head, without the families the page loads already, which Cleitext then keeps on the site. The editor reads the site's fonts from `GET /_diorama/fonts?f=Rubik:400;700` (a page of the site in its theme, for people with `manage_diorama`, with probes of its fonts for headings and texts), the theme's settings and Fresco's kit. New style values (`strokeWidth`, `strokeColor`, `outline`, `textWrap`, `minHeight`, `widthMode`, `fixedWidth`) write no CSS at their defaults, so sliders made before look the same.

**Data model** — `src/model/types.ts`. Values that differ by device are `{ base, tablet?, mobile? }`, storing only the overrides; media are `{ id, url }` objects; normalization (`src/model/normalize.ts`) bounds every value and drops what it does not know.

**Endpoints** (`/api/v1/ext/diorama`, capability `manage_diorama`, given to administrators and editors): `GET/POST /sliders`, `GET/PUT/DELETE /sliders/:id`, `POST /sliders/:id/duplicate`, `GET /templates`, `GET /posts-sample`; `GET /options` (the sliders, for pickers; `edit_entries`). A refused new slider answers `409` with `code: 'limit'`.

**Tests** — `pnpm --filter @cleitext/plugin-diorama test` (model, per-device values, markup and CSS, fonts, outlines, line breaks and button sizes, accessibility, reduced motion, the runtime in jsdom, shortcodes, export data), the server's `apps/server/test/diorama.test.ts` (a Google font kept on the site, with no address of Google on the page) and the end-to-end `apps/admin/e2e/diorama.spec.ts`.
