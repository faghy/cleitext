# Developing Cleitext themes

> 🇮🇹 [Leggi in italiano](./it/TEMI.md)

A theme decides how the public site looks. It is a set of **React components rendered on the server**: pages reach visitors as plain HTML, with no JavaScript unless the theme adds some. Aurora, the default theme, is in [`themes/aurora`](../themes/aurora); a smaller example is in [`examples/theme-plain`](../examples/theme-plain).

## 1. Folder layout

```
my-theme/
├─ theme.json        manifest
├─ src/index.tsx     the theme: defineTheme({ … }) as default export
└─ dist/index.js     built by `cleitext theme:build`
```

`theme.json`:

```json
{
  "slug": "my-theme",
  "name": "My theme",
  "version": "1.0.0",
  "description": "One line shown in Appearance → Themes.",
  "license": "GPL-2.0-or-later",
  "entry": "dist/index.js"
}
```

## 2. Build, install, activate

```bash
cleitext theme:build ./my-theme         # bundles src/index.tsx into dist/index.js
cleitext theme:install ./my-theme       # copies it into THEMES_PATH (--link for development)
cleitext theme:list
cleitext theme:uninstall my-theme       # only when no site uses it
```

Running servers load a new or updated theme at once, without a restart. Each site chooses its theme in **Appearance → Themes**, where super admins can also **Delete** an installed theme that no site uses (Aurora stays). **Live Preview** shows the site's own pages with an installed theme before activating it. React and `@cleitext/theme-sdk` come from the server: they are never bundled with the theme.

**Paid themes** (RF-CAT-03) add their license server to `theme.json`:

```json
"paid": {
  "licenseServer": "https://cleitext.com/api/v1/ext/store/v1",
  "purchaseUrl": "https://cleitext.com/store/my-theme"
}
```

Such a theme can be installed and tried with Live Preview without a license (the demo), but a site can activate it only after entering a license key for that site in **Appearance → Themes**. The key is checked once with the license server and kept encrypted; pages never ask the server, and the theme keeps working if the license is removed or its updates end. Updates from the catalog need a license whose updates include the new version (_Renew to update_ otherwise). The code stays GPL: the license buys downloads, updates and support.

**Plugins that come with the theme** (API 1.25): a theme may ship its own plugins, such as a page builder, built, inside its package under `plugins/<slug>/`, and name them in `theme.json`:

```json
"plugins": ["my-theme-builder"]
```

`theme:install` (and so Upload Theme and the catalog) installs them with the theme. A copy already installed in the same or a newer version is left as it is. When a site activates the theme, they are activated there too, and when it chooses another theme the ones the theme activated are deactivated, their data kept (a plugin the site used before the theme stays active). A plugin that cannot start does not stop the theme: **Appearance → Themes** says why.

## 3. The theme definition

```tsx
import {
  defineTheme,
  EntryContent,
  usePage,
  type LayoutProps,
  type TemplateProps,
} from '@cleitext/theme-sdk';

function Layout({ head, css, children }: LayoutProps) {
  const page = usePage();
  return (
    <html lang={page.locale}>
      <head>
        <title>{head.title}</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

function Index(props: TemplateProps) {
  if (props.kind === 'entry') return <EntryContent document={props.entry.document} />;
  return null;
}

export default defineTheme({
  slug: 'my-theme',
  name: 'My theme',
  version: '1.0.0',
  menuLocations: { primary: 'Main menu' },
  templates: { index: Index },
  Layout,
  css: 'body { font-family: system-ui }',
});
```

| Property           | What it does                                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Layout`           | The page around every template: `<html>`, `<head>` (render `head.tags` with `<HeadTags>`), header, footer.                                                                                                                                                       |
| `templates`        | Components by name; `index` is required. More specific names win (`entry-page`, `archive-category`…, see ARCHITECTURE §12.2).                                                                                                                                    |
| `css`              | Stylesheet inlined in every page. Keep it small.                                                                                                                                                                                                                 |
| `menuLocations`    | Places for menus, assigned in Appearance → Menus; read them with `usePage().menus`.                                                                                                                                                                              |
| `settings`         | Fields shown in Appearance → Customize (§4).                                                                                                                                                                                                                     |
| `areas`            | Areas made of blocks (§5).                                                                                                                                                                                                                                       |
| `settingsSections` | Tabs of Appearance → Customize: `[{ id, label, description?, parent?, tabs? }]`; a field goes in one with `section` (§4).                                                                                                                                        |
| `presets`          | Ready-made styles: `[{ id, label, values }]`, applied in Customize before publishing (§4).                                                                                                                                                                       |
| `entryFields`      | Per-page options, `{ types?, fields }`, shown in the editor's Document tab (§4).                                                                                                                                                                                 |
| `menuItemFields`   | Options of each menu item, `[{ field, levels? }]`, shown in Appearance → Menus and read from `MenuItemView.data` (§4, plugin API 1.34).                                                                                                                          |
| `relatedEntries`   | How many related entries to show under an entry (at most 12): `entry.related` has them, same categories first, then same tags (core 0.37).                                                                                                                       |
| `listTerms`        | `true`: lists (blog, archives, search) give each entry's categories and tags in `entries[].terms` (core 0.46).                                                                                                                                                   |
| `adjacentEntries`  | `true`: entries get the previous and next ones of the same type in `entry.adjacent` (`prev`, `next`), for "Previous / Next" links (core 0.46).                                                                                                                   |
| `importSettings`   | `(data) => values \| null`: turns settings exported from another system (a file imported in Customize → ⋯ → Import: parsed JSON, or the file's text when it is not JSON) into this theme's setting values; values that fail validation are left out (core 0.46). |
| `editorCss`        | CSS for the block editor, so that content looks like the site while writing. A string, or a function of the settings.                                                                                                                                            |
| `comments`         | `'auto'` (default): comments, likes and sharing follow `<EntryContent>` on entries that have them. `'manual'`: the theme places them itself.                                                                                                                     |

Templates receive the page as props (`kind`: `entry`, `archive`, `search`, `404`, `maintenance`) and read the rest with `usePage()`: site, language, languages, menus, media, URLs. The Layout finds the same props in `usePage().view`, to change body classes or sidebars by kind of page. They never query the database.

Wrap the parts a theme builder may replace in `<Location>`: `header`, `footer`, `single` (the content of an entry page; pass `entry`) and `archive` (archives and search results). Without a plugin filling them, the theme's own markup shows:

```tsx
<Location name="header"><header className="site-header">…</header></Location>
<Location name="single" entry={entry}><article>…</article></Location>
```

Hook points (plugin API 1.33) are named `hook:<name>`, with your theme's prefix (`hook:mytheme_header_before`, letters, digits, `_` and `-`). Without children they render nothing until a plugin fills them through `render.locations`, so add them freely where a plugin may want to insert content (before and after the header, the content, the comments, the footer…). A filled location is wrapped in `<div class="cx-location cx-location-hook-<name>">`:

```tsx
<Location name="hook:mytheme_header_before" />
```

Render an entry's content with `<EntryContent document={…} />`. Inside a visual editor (a plugin's page builder) it renders an empty `[data-cx-editor-canvas]` element instead, which the editor fills, so the page is edited in the theme's own layout. When the editor hides the title (`entry.document.editor?.data?.hideTitle === true`, as Fresco's page setting does), leave out the entry's title header, so the page has a single `h1`. Leave out the featured image above the content when it asks (`hideFeatured === true`) and on its `full` and `canvas` layouts (`layout`): the page is designed in the editor.

### Comments, likes, accounts and authors

Blogging works as in WordPress without theme code: with `comments: 'auto'` (the default) the author box (when the author wrote a bio), the like and share buttons and the comments with their form follow `<EntryContent>` on entries whose type has comments, and the account pages (`/account`, `/account/login`, `/account/register`…) render inside the theme's layout. The markup uses `cx-` classes with a small default stylesheet, added only to pages that use it; restyle them in the theme's CSS.

To place them yourself, set `comments: 'manual'` and use the components:

| Component                  | What it shows                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `<EntryCommunity />`       | Everything below, in the default order.                                                   |
| `<Comments />`             | The comments (threads, pages, notices) and the form; "comments are closed" when they are. |
| `<EntryActions />`         | Like button and share links.                                                              |
| `<AuthorBox />`            | Picture, name, bio and links of the entry's author; `variant="page"` on author archives.  |
| `<CommentText text={…} />` | A comment or bio as paragraphs with links.                                                |

They read the entry from `usePage()`; pass `entry` to show another. `usePage()` also gives `viewer` (the signed-in visitor, null on cached pages) and `urls` (`login`, `register`, `account`, `logout`). `entry.author` has `displayName`, `url` (the author archive), `bio`, `website` and `avatarUrl`.

Author archives (`/author/<slug>`) are archives with `props.author`; the templates `author-<slug>` and `author` are tried before `archive`. They list the person's published posts, and exist only for people who have some.

## 4. Settings

```tsx
settings: [
  { name: 'logo', type: 'media', label: { en: 'Logo', it: 'Logo' } },
  { name: 'headline', type: 'text', label: 'Headline', maxLength: 120 },
  { name: 'showSearch', type: 'boolean', label: 'Show the search box', default: false },
],
```

Fields use the same types as custom fields ([PLUGINS.md §14](PLUGINS.md#14-reference-field-types)). Administrators change them in **Appearance → Customize** with a live preview; values are checked against the schema. Read them with `useThemeSettings()`; media fields hold an id, and the media is preloaded in `usePage().media`.

**The site icon is required** (RF-THM-12). Every theme built for Cleitext has a media setting named exactly `favicon`, and writes it in the head of every page (empty: the theme's own icon or the Cleitext mark). The core answers `/favicon.ico` with it, for browsers, bookmarks and feed readers that ask there.

```tsx
settings: [
  { name: 'favicon', type: 'media', label: { en: 'Site icon (favicon)', it: 'Icona del sito (favicon)' } },
],
// In Layout:
const favicon = settings.favicon ? page.media.get(settings.favicon) : undefined;
<link rel="icon" href={favicon?.url ?? ICON} />
{favicon && <link rel="apple-touch-icon" href={favicon.url} />}
```

With many settings, group them like a theme panel:

```tsx
settingsSections: [
  { id: 'header', label: 'Header' },
  { id: 'colors', label: 'Colors', description: 'The colors of each area of the site.' },
],
settings: [
  { name: 'headerLayout', type: 'choice', section: 'header', label: 'Layout', display: 'buttons',
    options: [{ value: 'left', label: 'Logo left' }, { value: 'center', label: 'Centered' }], default: 'left' },
  { name: 'sticky', type: 'boolean', section: 'header', label: 'Sticky header', default: true },
  { name: 'shrink', type: 'boolean', section: 'header', label: 'Shrink on scroll', showIf: { field: 'sticky', equals: true } },
  { name: 'accent', type: 'color', section: 'colors', group: 'Main area', label: 'Accent', default: '#0f766e' },
],
presets: [{ id: 'dark', label: 'Dark', values: { accent: '#38bdf8' } }],
```

Customize shows one tab per section (fields without one go in "Other"), a search box across all options, the ready-made styles, export and import as JSON, and "Reset this section". A section with `tabs: [{ id: 'general', label: 'General' }, { id: 'design', label: 'Design' }]` shows them above its fields; a field goes in one with `tab` (the first, without). Nothing reaches the site until **Publish**. The preview can be shown at desktop, tablet and mobile width.

### Header and footer builders

A `zones` field is a drag-and-drop builder: rows split into zones where elements are placed, with a layout for desktop and one for tablet/mobile. In Customize it opens under the preview while its section, or the section of one of its rows or elements, is open.

```tsx
settingsSections: [
  { id: 'header', label: 'Header builder' },
  { id: 'header-logo', label: 'Site identity', parent: 'header' },
  { id: 'header-main', label: 'Main row', parent: 'header' },
],
settings: [
  { name: 'headerLayout', type: 'zones', section: 'header', label: 'Header',
    devices: ['desktop', 'mobile'],
    rows: [
      { name: 'main', label: 'Main row', section: 'header-main', zones: [
        { name: 'left' }, { name: 'left-center', whenUsed: 'center' }, { name: 'center' },
        { name: 'right-center', whenUsed: 'center' }, { name: 'right' }] },
      { name: 'offcanvas', label: 'Off-canvas', devices: ['mobile'], stacked: true, zones: [{ name: 'main' }] },
    ],
    items: [
      { name: 'logo', label: 'Logo', section: 'header-logo' },
      { name: 'menu', label: 'Menu' },
      { name: 'toggle', label: 'Menu toggle', devices: ['mobile'] },
    ],
    default: { desktop: { main: { left: ['logo'], right: ['menu'] } },
               mobile: { main: { left: ['logo'], right: ['toggle'] }, offcanvas: { main: ['menu'] } } } },
],
```

- A click on an element, or on a row's gear, opens its `section`. Sections with a `parent` are listed under it, only while it or a sibling is open.
- `whenUsed` hides a zone until another one (or itself) holds elements, and `devices` keeps a zone to some devices. `columnsField` names a number field that says how many zones of the row are used (the columns of a footer row). `devices` and `rows` limit where a row or an element can go. `stacked` lays the zones of a row in a column.
- Each element is used at most once per device; the value is `{ desktop: { row: { zone: ['logo'] } }, mobile: {…} }`, checked against the definition. Read it with `zoneItems(value, device, row, zone)` from `@cleitext/theme-sdk`.
- Put `data-customize="<section>"` on the parts of the page an element or a row renders: in the preview a pencil on them opens that section. Links in the preview change the page shown.

Plugins may add settings, sections, builder elements, ready-made styles and areas to a theme ([PLUGINS.md, Extending a theme's options](PLUGINS.md#extending-a-themes-options-plugin-api-132)): while such a plugin is active on the site, `useThemeSettings()` also holds the values of its fields, checked and with defaults like the theme's own. Read them by name, and expect them to be missing when the plugin is not active.

`entryFields` adds options to single pages (for example a sidebar or a transparent header per page). Editors set them in the Document tab of the block editor; they are saved with the entry in `document.editor.data` and the theme reads them from `entry.document.editor?.data`. `types` limits them to some entry types (`['page']`).

`menuItemFields` (plugin API 1.34) adds options to each menu item, for example a mega menu's columns or an icon. Each entry is `{ field, levels? }`: `field` is a field definition, `levels` is `'top'` (first-level items only), `'nested'` (sub-items only) or `'all'` (default). In **Appearance → Menus** the ⚙ button of an item opens its "Theme options"; the values are checked like settings (unknown keys are dropped, invalid values refused) and stored with the item. The theme reads them in `usePage().menus[location][i].data`, with the defaults applied, only for the options that apply at the item's level:

```tsx
menuItemFields: [
  { field: { name: 'mega', type: 'boolean', label: 'Mega menu', default: false }, levels: 'top' },
  { field: { name: 'columns', type: 'number', label: 'Columns', min: 1, max: 6, default: 3 }, levels: 'top' },
  { field: { name: 'icon', type: 'text', label: 'Icon', maxLength: 40 } },
],
// In the header: item.data?.mega ? <MegaMenu columns={item.data.columns as number} … /> : …
```

Plugins extending the theme may add more (`menuItemFields` of `ctx.themes.extend`). Values of options no longer declared (another theme, or a plugin deactivated) stay stored with the item, and come back with the option, but never reach the theme.

`editorCss` may be a function, `(settings) => string`, so the editor follows the colors and fonts chosen in Customize.

## 5. Block areas

```tsx
areas: { footer: 'Footer' },
// in the Layout:
<BlockArea name="footer" />
```

Each area is a document written with the block editor in **Appearance → Areas**, one per language. `<BlockArea>` renders nothing while the area is empty.

`areaDefaults: { 'header-cart': { schema: 1, blocks: [...] } }` gives an area its content until someone edits it: blocks of any plugin, which show only when that plugin is active (for example the shop's cart link in a header area).

## 6. Rules

- No database access, no network calls: everything comes through props and `usePage()`.
- Web fonts: link Google Fonts or Bunny Fonts stylesheets as usual (`<link rel="stylesheet">` or `@import` in a `<style>`, also in `editorCss`). With **Settings → General → Privacy → Web fonts** on its default, the core turns them into copies kept on the site (`/_fonts/…`) and removes `preconnect` hints to those services, so visitors' browsers never reach them ([Privacy](./PRIVACY.md#web-fonts-kept-on-the-site)). An `@import` inside a separate `.css` file is not seen: put it in the page or in `editorCss`.
- Output is escaped by React; use `dangerouslySetInnerHTML` only for your own CSS or JSON.
- Keep pages accessible (landmarks, skip link, labels, contrast) and light: Aurora scores at least 95 in every Lighthouse category.
