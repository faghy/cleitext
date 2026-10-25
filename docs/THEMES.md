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
cleitext theme:uninstall my-theme       # only when no site uses it (nor a child theme)
cleitext theme:child my-theme my-child  # a child theme of it (§7)
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
| `pageTemplates`    | Page templates chosen in the editor's sidebar, `[{ name, label, types? }]` (default types: `['page']`); the entry's choice is `entry.template` and the template component `template-<name>` is tried first (§4, plugin API 1.47).                                |
| `optionsPages`     | Options pages of the theme, `[{ slug, title, parent?, icon?, position?, capability?, fields }]`: site-wide settings pages in the admin menu, read with `useOption` (§4, plugin API 1.48).                                                                        |
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

`entryFields` adds options to single pages (for example a sidebar or a transparent header per page). Editors set them in the Document tab of the block editor; they are saved with the entry in `document.editor.data` and the theme reads them from `entry.document.editor?.data`. `types` limits them to some entry types (`['page']`). Since plugin API 1.47 they are a field group of the theme (id `theme`) like the others, listed with the site's and the plugins' groups; nothing changes for the theme.

**Page templates** (plugin API 1.47), like WordPress's: `pageTemplates: [{ name: 'landing', label: { en: 'Landing page', it: 'Pagina di atterraggio' } }]` offers them in the editor's sidebar (**Template**) for `types` (default `['page']`). The entry's choice is `entry.template` (null for the default), and `template-<name>` is the first template component tried for it (`templates: { index, 'template-landing': Landing }`); without one, the usual ones are tried, so a theme may also just read `entry.template` (e.g. a class on the content). Field groups can show only on entries with a template (rule `template`), so a site owner adds the fields a landing page needs.

<a id="custom-fields"></a>**Custom fields** (plugin API 1.47). Entries keep their fields in `entry.fields`, as stored (media as ids). The readers give them formatted, computed on the server once per page, like ACF's `get_field`, `the_field` and `have_rows`:

```tsx
import { Field, Rows, useField } from '@cleitext/theme-sdk';

function Landing() {
  const photo = useField<{ url: string; alt: string; sizes: Record<string, { url: string }> }>(
    'photo',
  );
  return (
    <>
      <h2>
        <Field name="subtitle" fallback="Welcome" />
      </h2>
      {photo && <img src={photo.sizes.md?.url ?? photo.url} alt={photo.alt} />}
      <Rows name="team" empty={<p>No one yet.</p>}>
        {(row) => <h3>{String(row.name)}</h3>}
      </Rows>
    </>
  );
}
```

- `useField(name, { of, group, raw })`: by name (the type's fields, then each group's, first found) or `group.name`. `of: 'term'` reads the term of a category or tag archive, `of: 'author'` the person of an author archive (user fields), default the entry shown. `raw: true` gives the stored value.
- Formatted values: a media field is `{ id, url, alt, width, height, mime, sizes }` (sizes by name, e.g. `sizes.md.url`); list rows come formatted too, each with its stable `_id`; plugin field types give what their `format` says (an entry `{ id, type, title, url }`…); other values as stored.
- `<Field name>` shows a value: text and numbers as text (escaped), yes/no as ✓, a media field as an `<img>`, lists of texts joined with commas; `fallback` when empty, `className` on the element. `<Rows name>` gives each row of a list to its function, `empty` when there are none.
- They read `entry.fieldValues`, `term.fieldValues` and `author.fieldValues` of the props, which a template can also use directly; on older cores the readers fall back to the stored values.
- Since plugin API 1.48 `<Field>` also shows links, and related entries, terms and people, as links (several joined with commas), and a `richtext` field as formatted text with `html` (`<Field name="story" html />`, cleaned again). Relations give `{ id, type, title, url }` (entries), `{ id, taxonomy, name, slug, url }` (terms), `{ id, name, avatarUrl, url }` (people); a `link` field `{ url, label, target }`; a `file` field the media with its `filename`.

<a id="options-pages"></a>**Options pages** (plugin API 1.48): site-wide settings, like ACF's options pages (the phone number in the footer, the social profiles). A theme declares its own with `optionsPages` (they show in the admin menu, under `parent` when given, e.g. `/appearance`); site owners and plugins add others, and field groups attach to any of them with the rule `optionsPage`. Templates read the values of every page in the page's language, formatted like `useField`'s:

```tsx
import { Field, useOption } from '@cleitext/theme-sdk';

optionsPages: ([
  {
    slug: 'footer',
    title: { en: 'Footer', it: 'Piè di pagina' },
    parent: '/appearance',
    capability: 'edit_theme_settings',
    fields: [{ name: 'phone', type: 'text', label: 'Phone' }],
  },
],
  function Footer() {
    const phone = useOption<string>('phone', { page: 'footer' });
    return (
      <footer>
        {phone} <Field of="option" page="contacts" name="team.lead" />
      </footer>
    );
  });
```

`useOption(name, { page, group })` is `useField(name, { of: 'option', page })`; `usePage().options` has every page's values by slug. Values of translatable fields follow the page's language (the default language's until translated).

**Bound blocks** (plugin API 1.48). In the block editor, paragraphs, headings, list items, buttons and images can be bound to a field (**Bind to field** in the block's settings), and the **Field** and **Field rows** blocks show fields and repeat blocks for each row of a list or each related entry ([PLUGINS.md, Block bindings](PLUGINS.md#block-bindings)). The server resolves them before rendering, so `EntryContent`, areas and the theme builder's locations show the values; themes may style `.wp-block-cleitext-field` (with `__label`, `is-<kind>`, `is-empty`), `.wp-block-cleitext-field-rows` (`is-layout-grid`) and `.wp-block-cleitext-field-row`.

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
- Content width: set `--cx-container-width` on `:root` to the width of your content container (e.g. `--cx-container-width: 1200px`). Blocks that follow the theme's width use it, such as Prisma's full-width containers without a width of their own (1140px when the theme does not set it).
- Output is escaped by React; use `dangerouslySetInnerHTML` only for your own CSS or JSON.
- Keep pages accessible (landmarks, skip link, labels, contrast) and light: Aurora scores at least 95 in every Lighthouse category.
- **Every theme must work as a parent** (core 0.79, SPECIFICATIONS "Theme requirements"): a site owner may make a child theme of any theme (§7). So a theme never writes its own slug where the slug of the site's theme belongs (in addresses, `data-` attributes read by its scripts, storage keys), reads its settings with `useThemeSettings()` (never from a namespace of its own), and ships what it needs inside its bundle or reads it with `useThemeSettings()`/`usePage()`: a child keeps the parent's code and settings under its own slug. Test it once with `cleitext theme:child <your-theme> <your-theme>-child --install` and the child activated: the site must look the same.

## 7. Child themes

A **child theme** (core 0.79, plugin API 1.50) is built on another theme, its **parent**, as in WordPress: it inherits everything from the parent and holds only what the site owner changes. Updating the parent never touches the child, so those changes are never lost. Every Cleitext theme can be a parent.

### Creating one

- **From the admin.** In **Appearance → Themes**, **Create child theme** under a theme (super admins, as for Upload Theme) asks for a name and a slug, and can activate it at once: the parent's Customize choices are copied, so the site looks the same. The new theme has a `theme.json`, an empty `style.css` and a README on how to override templates.
- **From the CLI.** `cleitext theme:child <parent> <slug> [--name <name>]` writes the folder `./<slug>` to edit; with `--install` it goes straight into `THEMES_PATH`.
- **By hand.** A folder with a `theme.json` naming the parent:

```json
{
  "slug": "zenit-child",
  "name": "Zenit Child",
  "version": "1.0.0",
  "parent": "zenit",
  "parentVersion": "^1.0.0"
}
```

`parent` is the slug of the parent; `parentVersion` (optional) is a semver range of the parent versions the child works with. A child without code needs no `entry` and no build: its `style.css` is enough.

### What a child inherits and overrides

The site sees one theme under the child's slug and name, made from both:

| Part                                                                                                      | Rule                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Layout, templates (`template-<name>` too), components, fonts, scripts, translations                       | The parent's, unless the child gives a template (or a `Layout`) of the same name.                                  |
| CSS                                                                                                       | The parent's page as it is, then the child's `css` and `style.css` (see "CSS order").                              |
| `editorCss`                                                                                               | The parent's, then the child's `editorCss` and `editor.css`.                                                       |
| Settings (`settings`)                                                                                     | The parent's; a child field with the same name replaces it, others are added. `settingsDefaults` changes defaults. |
| Sections, presets, menu locations, menu item options, areas, area defaults, page templates, options pages | The parent's plus the child's (same id or name: the child's).                                                      |
| `entryFields`                                                                                             | The parent's fields plus the child's.                                                                              |
| `relatedEntries`, `listTerms`, `adjacentEntries`, `comments`, `importSettings`                            | The child's when given.                                                                                            |
| `aiGuide`                                                                                                 | The parent's, then the child's.                                                                                    |
| Plugins that come with the parent (`plugins`)                                                             | They come with the child too; a child may name more.                                                               |
| Files read by plugins (`ctx.themes.readFile`, e.g. `campus-json/*.json`)                                  | The child's file, else the parent's with the same path.                                                            |
| Plugins extending the parent (`ctx.themes.extend('<parent>')`)                                            | They extend the child too.                                                                                         |

Block areas, menus, options pages' values and per-page options are kept by the site, not by the theme: the child shows the same ones.

### Overriding and wrapping templates

A child with code has `src/index.tsx`, built with `cleitext theme:build` like any theme (React, the SDK and the parent's code come from the server: the child bundle has only its own code). Its default export is `defineChildTheme({ … })`:

```tsx
import {
  defineChildTheme,
  ParentTemplate,
  useParentTemplate,
  useParentLayout,
  type LayoutProps,
  type TemplateProps,
} from '@cleitext/theme-sdk';

/** Replaces the parent's `entry-page`. */
function Page(props: TemplateProps) {
  if (props.kind !== 'entry') return null;
  return <main className="my-page">{props.entry.title}</main>;
}

/** Wraps the template the parent would use for this page. */
function Index(props: TemplateProps) {
  return (
    <>
      <div className="notice">Summer sale!</div>
      <ParentTemplate {...props} />
    </>
  );
}

/** Wraps a parent template by name. */
function Search(props: TemplateProps) {
  const Parent = useParentTemplate('search');
  return <section className="my-search">{Parent && <Parent {...props} />}</section>;
}

/** A Layout around the parent's. */
function Layout(props: LayoutProps) {
  const Parent = useParentLayout()!;
  return <Parent {...props} />;
}

export default defineChildTheme({
  templates: { 'entry-page': Page, index: Index, search: Search },
  Layout,
  css: '.notice { background: gold; }',
  settings: [{ name: 'ribbon', type: 'text', label: 'Ribbon text' }],
  settingsDefaults: { accent: '#7c3aed' },
});
```

- A child template replaces the parent's **of the same name** only. The hierarchy is unchanged: with a child `index` only, an entry page still uses the parent's `entry` when the parent has one, as in WordPress.
- `<ParentTemplate {...props} />` renders the template the parent would use for this page (`name` picks one); `useParentTemplate(name)` gives it as a component (null outside a child theme); `useParentLayout()` the parent's Layout.
- The default export may also be a function of the parent's definition: `defineChildTheme((parent) => ({ templates: { index: (p) => <Wrap><parent.templates.index {...p} /></Wrap> } }))`.

### CSS order

In the `<head>` of every page:

1. the parent's own CSS, where its Layout prints it (with its settings' CSS);
2. the plugins' stylesheets;
3. the child's CSS (`css`, then `style.css`), in `<style id="cx-child-theme-css">`;
4. the blocks' CSS;
5. the site's **Additional CSS** (§8), last.

`style.css` and `editor.css` are read from the child's folder only, at most 512 KB each.

### Settings

The child keeps its Customize values under its own slug. Until it saves its own, it shows the parent's saved values, and its **first activation** on a site copies them, so switching from the parent to its child changes nothing on the pages. After that the two keep separate values (switching back to the parent shows the parent's).

### Installing, updating, deleting

- A child needs its parent installed, in a version in `parentVersion`: `theme:install` (and so Upload Theme) refuses it otherwise and says what is missing. The catalog installs the parent first when it has it.
- One level only: a parent cannot be a child, a child cannot have children, and a theme cannot be its own parent.
- Updating the parent never changes the child's folder. An update outside the `parentVersion` of an installed child is refused (`theme:install --force` takes it anyway); a catalog update that breaks a child goes back to the version before.
- The parent cannot be deleted while a child is installed: delete the child first.
- `theme:rollback` works for both, each on its own folder.
- A child that cannot load (parent missing, wrong version) is listed in **Appearance → Themes** with the reason.

### Downloading and uploading back

**Download** under a child theme (super admins) gives its folder as a zip, without `node_modules` and links. Edit it locally (`cleitext theme:build` when it has code) and upload it back with **Upload Theme**: a higher `version` is an update, the previous one is kept for rollback. An uploaded child runs on the server like any uploaded theme, so the same rules apply: only super admins, only when the server allows installing from the admin and unsigned packages.

### Paid parents

A child of a paid theme (such as Vitality) is not paid itself and never replaces the parent's license: a site can activate it only with a license of the **parent** for that site (it can be tried with Live Preview, as the parent's demo). The catalog keeps updating the parent with its license as usual. Only child themes can be downloaded, never the parent.

### A complete example

```
my-zenit/
├─ theme.json      { "slug": "my-zenit", "name": "My Zenit", "version": "1.0.0", "parent": "zenit", "parentVersion": "^1.0.0" }
├─ style.css       .site-title { letter-spacing: .05em; }
├─ editor.css      .editor-styles-wrapper h2 { color: #7c3aed; }
├─ README.md
└─ src/index.tsx   export default defineChildTheme({ templates: { 404: NotFound }, settingsDefaults: { … } })
```

```bash
cleitext theme:build ./my-zenit && cleitext theme:install ./my-zenit
```

## 8. Additional CSS

**Appearance → Customize → Additional CSS** (core 0.79) is in every theme's Customize, like WordPress's. It has two boxes:

- **CSS for every theme**: kept by the site, so it survives theme updates and theme switches;
- **CSS for &lt;theme&gt; only**: printed only while that theme is active.

The preview shows the CSS while it is written; **Publish** saves it with the theme's options. It is printed last in `<head>` (`<style id="cx-additional-css">`), after the theme's CSS, a child theme's and the blocks'. Each box holds up to 100,000 characters and cannot contain `<style`, `</style` or `<script` (it could close the element); whatever is stored is escaped again when printed. It is kept in the site's settings (namespace `additional-css`, keys `site` and `theme:<slug>`), so backups have it, and site exports (`cleitext export`) carry it to the new site (`site.additionalCss` of the transfer document).

Themes do not need their own "Custom CSS" option any more. Zenit's moved here with core 0.79: its value became the site's Additional CSS (for every theme where Zenit was the site's theme, for Zenit only elsewhere), and Zenit 1.0.5 no longer has the option.
