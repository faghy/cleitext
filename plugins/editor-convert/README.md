# Convert Editors

The official Cleitext plugin to move pages and posts from one editor to another: from the block editor to a page builder such as Fresco or Vitality Builder, from one page builder to another, or back to the block editor. It is not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-editor-convert-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## How it works

Open **Tools → Convert editors**.

1. **Find the entries.** The list shows pages, posts and the other content types with blocks, with the editor that made each one. Filter by type, current editor and status, or search the titles.
2. **Choose them and the target editor.** Tick the entries, pick the editor to convert to (the block editor and every editor of the active plugins: Fresco, Vitality Builder, Classic Editor…), and how:
   - **Convert in place**: each entry gets the converted content as a new revision. The old content stays in **Revisions**, so it can be restored from the editor. A published entry keeps showing its old content until it is published again, from the editor or with the option **Publish again the converted entries that were published**.
   - **Copy as a new draft**: a copy of each entry (fields, summary, featured image and terms included) gets the converted content, with the editor's name after its title. The original is not touched.
3. **Preview.** For each entry: how many elements it has before and after, the blocks kept as they are inside a page builder, the Custom HTML blocks left, and the words of the original that may be missing in the result. Nothing is saved yet; untick what you want to leave out.
4. **Convert.** Each entry is read again, converted and saved through the content API, as if you had saved it in the editor. Entries someone else is editing at that moment are skipped.

Nothing is ever deleted.

## What is converted

The block editor is the common language: the editor that made a page turns it into blocks, and the target editor turns the blocks into its own elements. Between two page builders the page therefore goes through blocks, so it keeps texts, headings, lists, images, buttons, separators and columns, but not styles, animations or layout settings that have no block. What each editor keeps depends on that editor's converters; the preview shows what changes before you save.

Entries made with an editor whose plugin is not active cannot be read, and editors without converters (`fromBlocks` / `toBlocks` in their plugin) are not offered or are reported in the preview.

## For developers

Plugin API 1.26: the plugin reads the site's editors through `editors()` of the admin page props, and uses only the core content API (`/api/v1/entries`) with the user's own permissions. It has no server part and no permissions of its own. A plugin editor takes part by declaring `fromBlocks` and `toBlocks` in its `editors` definition (docs/PLUGINS.md, Editors).

## License

GPL-2.0-or-later.
