# Multilingual

The official Cleitext plugin for sites in more than one language. Without it a site has one language, and the core does no multilingual work at all.

## What it adds

- **Languages** (sidebar): add languages, choose their address prefix (`/en`, `/de-ch`…), order them, make one the default, remove unused ones; the site title and tagline in each language.
- **Translations** in the editor sidebar: the language of the entry, its versions in the other languages, and _Add translation_, which copies the entry into a draft in that language. A translation whose original changed since it was last saved shows _needs update_.
- **Translations** columns in the lists of posts, pages and other types, and of categories, tags and other taxonomies: open a translation, or start one.
- **Translations** overview (sidebar): the entries of a type in the default language and their versions in each language, with what is missing or needs an update.
- On the public site, through the core: language addresses, `hreflang` links (pages, archives, sitemaps), the front, posts and error pages of each language, search and feeds per language.
- **Language switcher** (since 1.6.0, needs Cleitext 0.83), one for every theme, as WPML and Polylang give it; see below.

**Automatic translation** (optional): save a DeepL API key in **Languages** (stored encrypted). New translations can then be translated automatically — title, excerpt, the text of the blocks (bold, italics and links are kept), readable attributes such as alt texts, and text fields set to _Translated_ — and a translation that needs an update can be translated again from its original. The texts are sent to DeepL only when you ask for a translation.

**Content not translated yet** (option in **Languages**): the home page, the posts page, search and feeds of a language can also list the posts not translated into it yet, in the default language and at their own address, as WPML's "display as translated" does.

Custom fields follow their `translation` setting (Content structure): _Translated_ (copied, then edited in each language), _Same as the original_ (kept in step when the original is saved) or _Left empty_.

## Language switcher

Since 1.6.0 the plugin draws the language switcher itself, the same accessible one everywhere: a `nav` with a label, `lang` and `hreflang` on each link, the page's language marked, full names for screen readers when codes are shown. Each language links to this page's translation, or to its home page when the page has none.

**Languages → Language switcher** sets it once for the whole site:

- **Look**: a dropdown (it works without JavaScript), the languages side by side or one under the other; names in their own language (_Deutsch_), in the page's language (_German_) or as codes (_DE_); flags (small drawings, not emoji, which Windows shows as letters); the page's language listed or not; languages without a translation linked to their home page or hidden.
- **Themes**: themes that place the switcher (Aurora, Zenit, Canvas, Pulsar, Vitality) show this one in their header and footer, in the look they suggest for that place, or with these settings everywhere.
- **Menus**: the languages as menu items in a menu location of the theme (at its start or end; the page's language with the others under it, or one item per language), or exactly where you want them: a custom link with the address `#language-switcher` in Appearance → Menus (the page has buttons to add it to each menu). The link may carry its own choices: `#language-switcher?style=inline&names=code&current=hide&untranslated=hide`. Menu items have no flags.
- **Bottom of the page**: an automatic switcher below the footer of every page, or floating in a corner. Off by default.

The **Language switcher** block puts it in any page, pattern, block area, Fresco page (as a widget) or Prisma container, with its own choices or the site's. `[language_switcher]` alone in a paragraph shows it too (`style="list"`, `names="code"`, `flags="no"`, `current="hide"`, `untranslated="hide"`).

Imported WordPress sites: with the plugin active during the import, WPML's switcher shortcodes (`[wpml_language_selector_widget]`, `[wpml_language_selector_footer]`, `[wpml_language_switcher]`), Polylang's (`[polylang_langswitcher]`), their blocks and their legacy widgets become the block, with their options; the WordPress Importer turns Polylang's switcher in menus (`#pll_switcher`) into the switcher link.

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
