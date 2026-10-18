# Catalog showcase

The official Cleitext plugin that shows the [Cleitext catalog](https://github.com/faghy/cleitext-catalog) on a site — the plugin and theme directory of cleitext.com is made with it. It is not in the base package: install it from **Plugins → Add New**.

Add the **Catalog** block to a page and choose what it shows: plugins, themes, or both. Each item gets its icon or screenshot, version, author, description in the language of the page, tags, how to install it from the admin, and **Download** and **Details** buttons. With **Page of each item** (e.g. `/plugins/{slug}`) the whole box opens the item's own page on the site, and **Details** goes there too; **Different page names** maps catalog slugs to other page names (`shop=cleishop`). The list follows the catalog by itself: the index is read at most once an hour, its Ed25519 signature is checked, and pages showing it are refreshed when it changes.

**Settings → Catalog showcase** can point it to another catalog; by default it uses the official one (or the server's `CATALOG_URL` and `CATALOG_PUBLIC_KEY`).

Needs Cleitext 0.14 or later (plugin API 1.4).
