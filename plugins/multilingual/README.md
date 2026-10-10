# Multilingual

The official Cleitext plugin for sites in more than one language. Without it a site has one language, and the core does no multilingual work at all.

## What it adds

- **Languages** (sidebar): add languages, choose their address prefix (`/en`, `/de-ch`…), order them, make one the default, remove unused ones; the site title and tagline in each language.
- **Translations** in the editor sidebar: the language of the entry, its versions in the other languages, and _Add translation_, which copies the entry into a draft in that language. A translation whose original changed since it was last saved shows _needs update_.
- **Translations** columns in the lists of posts, pages and other types, and of categories, tags and other taxonomies: open a translation, or start one.
- **Translations** overview (sidebar): the entries of a type in the default language and their versions in each language, with what is missing or needs an update.
- On the public site, through the core: language addresses, `hreflang` links (pages, archives, sitemaps), the theme's language switcher, the front, posts and error pages of each language, search and feeds per language.

**Automatic translation** (optional): save a DeepL API key in **Languages** (stored encrypted). New translations can then be translated automatically — title, excerpt, the text of the blocks (bold, italics and links are kept), readable attributes such as alt texts, and text fields set to _Translated_ — and a translation that needs an update can be translated again from its original. The texts are sent to DeepL only when you ask for a translation.

**Content not translated yet** (option in **Languages**): the home page, the posts page, search and feeds of a language can also list the posts not translated into it yet, in the default language and at their own address, as WPML's "display as translated" does.

Custom fields follow their `translation` setting (Content structure): _Translated_ (copied, then edited in each language), _Same as the original_ (kept in step when the original is saved) or _Left empty_.

## Install

```bash
bin/cleitext plugin:install plugins/multilingual
```

Then activate it on the site (Plugins). Languages and translations from before Cleitext 0.6, and those of an imported site, are taken over when it is activated.

Deactivating it brings the site back to its default language; nothing is deleted, and activating it again restores the other languages.

## A domain per language

A language can live on its own domain (e.g. `example.de`) instead of an address prefix:

1. add the domain to the site as a secondary domain (Sites, or `bin/cleitext site:domain:add --site <slug> --domain example.de`), with its DNS record and certificate;
2. in **Languages**, choose **Domain** on that language and enter it.

Its pages are then served on that domain, and links between languages (switcher, `hreflang`, sitemaps) point to the right domain. The admin stays on the primary domain. A domain that is not one of the site's is ignored, and the language keeps its prefix.
