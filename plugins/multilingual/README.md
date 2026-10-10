# Multilingual

The official Cleitext plugin for sites in more than one language. Without it a site has one language, and the core does no multilingual work at all.

## What it adds

- **Languages** (sidebar): add languages, choose their address prefix (`/en`, `/de-ch`…), order them, make one the default, remove unused ones; the site title and tagline in each language.
- **Translations** in the editor sidebar: the language of the entry, its versions in the other languages, and _Add translation_, which copies the entry into a draft in that language. A translation whose original changed since it was last saved shows _needs update_.
- **Translations** columns in the lists of posts, pages and other types, and of categories, tags and other taxonomies: open a translation, or start one.
- **Translations** overview (sidebar): the entries of a type in the default language and their versions in each language, with what is missing or needs an update.
- On the public site, through the core: language addresses, `hreflang` links (pages, archives, sitemaps), the theme's language switcher, the front, posts and error pages of each language, search and feeds per language.

Custom fields follow their `translation` setting (Content structure): _Translated_ (copied, then edited in each language), _Same as the original_ (kept in step when the original is saved) or _Left empty_.

## Install

```bash
bin/cleitext plugin:install plugins/multilingual
```

Then activate it on the site (Plugins). Languages and translations from before Cleitext 0.6, and those of an imported site, are taken over when it is activated.

Deactivating it brings the site back to its default language; nothing is deleted, and activating it again restores the other languages.

## Planned

Machine translation, showing the default language when a page is not translated, a domain per language.
