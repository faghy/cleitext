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

Running servers load a new or updated theme at once, without a restart. Each site chooses its theme in **Appearance → Themes**. React and `@cleitext/theme-sdk` come from the server: they are never bundled with the theme.

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

| Property        | What it does                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Layout`        | The page around every template: `<html>`, `<head>` (render `head.tags` with `<HeadTags>`), header, footer.                    |
| `templates`     | Components by name; `index` is required. More specific names win (`entry-page`, `archive-category`…, see ARCHITECTURE §12.2). |
| `css`           | Stylesheet inlined in every page. Keep it small.                                                                              |
| `menuLocations` | Places for menus, assigned in Appearance → Menus; read them with `usePage().menus`.                                           |
| `settings`      | Fields shown in Appearance → Customize (§4).                                                                                  |
| `areas`         | Areas made of blocks (§5).                                                                                                    |
| `editorCss`     | CSS for the block editor, so that content looks like the site while writing.                                                  |

Templates receive the page as props (`kind`: `entry`, `archive`, `search`, `404`, `maintenance`) and read the rest with `usePage()`: site, language, languages, menus, media, URLs. They never query the database.

## 4. Settings

```tsx
settings: [
  { name: 'logo', type: 'media', label: { en: 'Logo', it: 'Logo' } },
  { name: 'headline', type: 'text', label: 'Headline', maxLength: 120 },
  { name: 'showSearch', type: 'boolean', label: 'Show the search box', default: false },
],
```

Fields use the same types as custom fields ([PLUGINS.md §14](PLUGINS.md#14-reference-field-types)). Administrators change them in **Appearance → Customize** with a live preview; values are checked against the schema. Read them with `useThemeSettings()`; media fields hold an id, and the media is preloaded in `usePage().media`.

## 5. Block areas

```tsx
areas: { footer: 'Footer' },
// in the Layout:
<BlockArea name="footer" />
```

Each area is a document written with the block editor in **Appearance → Areas**, one per language. `<BlockArea>` renders nothing while the area is empty.

## 6. Rules

- No database access, no network calls: everything comes through props and `usePage()`.
- Output is escaped by React; use `dangerouslySetInnerHTML` only for your own CSS or JSON.
- Keep pages accessible (landmarks, skip link, labels, contrast) and light: Aurora scores at least 95 in every Lighthouse category.
