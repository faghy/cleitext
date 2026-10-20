# Kross Booking

The official Cleitext plugin for the booking widget of [Kross Booking](https://www.krossbooking.com): availability and prices of your rooms, right in your pages. It is free and not in the base package: install it from **Plugins → Add New** (catalog), or download `cleitext-plugin-kross-booking-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

## Getting started

1. Open **Settings → Kross Booking** and fill in the **hotel ID** (the name of your hotel at Kross Booking, e.g. `pratonevoso`) and the **widget ID** (a number, e.g. `11`). You find both in the widget code Kross Booking gave you.
2. Add the **Kross Booking** block where the widget should appear. In Fresco, it is the **Kross Booking** tile in the **Plugins** group of the panel.
3. Publish. That's it.

In the editor the block shows a placeholder (“Kross Booking widget — room 0”): the widget itself appears on the page. If the IDs are not set yet, the placeholder says so.

## The block

- **Room ID**: `0` shows the search for every room; another number shows one room.
- **Language**: leave it empty and the widget speaks the language of the page, so each translation of a page (with the Multilingual plugin) gets the right one. Or write two letters, e.g. `en`.
- **Booking page address** (optional): where the widget sends visitors, e.g. `https://example.com/book` or `/book`.

## Refresh the widget

When Kross Booking changes your widget, visitors may still have the old one in their browser. **Settings → Kross Booking → Refresh the widget** gives it a new version, so every browser loads it again.

## Coming from WordPress

The WordPress importer turns the `[kross-booking id="…" lang="…" url="…"]` shortcodes of your pages into Kross Booking blocks, also inside Elementor widgets of pages that become Fresco pages. Activate this plugin before importing. The import report says how many were converted.

## How it works

The widget's files are added only to pages that show it. The plugin's small loader loads jQuery (a copy shipped with the plugin, used only if the page has none) and then the widget's stylesheet and script from `data.krossbooking.com`, in this order, because the widget needs jQuery. jQuery 3.7.1 is © OpenJS Foundation and contributors, MIT license (`public/jquery-LICENSE.txt`).

Plugin API 1.36: a block (`blocks`), the loader (`theme:hooks`), the settings page (`routes:admin`) and the `import.shortcode` filter.
