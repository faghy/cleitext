# Shortcode Embeds

> 🇮🇹 [Leggi in italiano](./README.it.md)

A Cleitext plugin for sites that come from WordPress with video and podcast shortcodes. When the site is imported with the **WordPress Importer**, it turns:

- `[fve]https://…[/fve]` (the shortcode of the "Facebook Video Embed" plugin, used for YouTube and Facebook videos alike) into Cleitext's **Embed** block with that address: the core draws the player (YouTube without cookies, Facebook's video plugin);
- `[spreaker type=player resource="episode_id=…" …]` (the "Spreaker Shortcode" plugin) into the **Spreaker player** block, with the same episode, show or playlist, height, theme and player options.

A shortcode is converted when it stands alone (its own line or paragraph, a Shortcode block, an Elementor shortcode or text widget), as the importer gives it to plugins. A `[fve]` whose content is not the address of a known video site, and a `[spreaker]` without a valid `resource`, are left as the importer keeps unknown shortcodes, and named in the import report.

The **Spreaker player** block can also be added by hand, in the block editor (**Embeds**) and in Fresco (**Plugins**): give `episode_id=…`, `show_id=…` or `playlist_id=…` as in Spreaker's share code.

## Privacy

The players are iframes of other sites (youtube-nocookie.com, facebook.com, widget.spreaker.com). With the **Privacy & GDPR** plugin active they wait for the visitor's consent to the category of embedded content (Marketing by default), with a notice in their place; nothing is requested from those sites before.

## Install

Upload `cleitext-plugin-shortcode-embeds-<version>.zip` in **Plugins → Upload Plugin**, or on the server `bin/cleitext plugin:install <folder>`, and activate it **before** importing the WordPress export. It needs plugin API 1.36 (Cleitext 0.60 or later). Permissions: `blocks` (the Spreaker block) and `theme:hooks` (the `import.shortcode` filter).

## Development

```bash
pnpm --filter @cleitext/plugin-shortcode-embeds test
pnpm --filter @cleitext/plugin-shortcode-embeds build
```

## License

GPL-3.0-or-later © Faghy. Spreaker is a trademark of Spreaker Inc., YouTube of Google LLC, Facebook of Meta Platforms, Inc.: this plugin is not made or endorsed by them.
