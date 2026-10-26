# Privacy & GDPR

> 🇮🇹 [Leggi in italiano](./it/PRIVACY.md)

The official Cleitext plugin for privacy compliance in the European Union: a cookie banner with consent by category, a log of the choices, privacy and cookie policy pages, and the requests of people to have their personal data exported or erased. It is not in the base package: download `cleitext-plugin-privacy-<version>.zip` from the Releases page and upload it in **Plugins → Upload Plugin**.

It follows the GDPR and, for Italy, the Garante's cookie guidelines of 10 June 2021. The policies it writes are a starting point: the site owner reviews them and is responsible for them.

## Cookie banner

- **Accept all** and **Reject all** with the same look; closing with the X continues without accepting; nothing is pre-checked; **Customize** lets visitors choose categories: _Preferences_, _Statistics_, _Marketing_ (the site chooses which ones it offers). The _Necessary_ cookies need no consent.
- With no optional category the site only uses technical cookies, and no banner is shown.
- The choice lasts 6 months (up to 12), then it is asked again; it is also asked again when the categories or the cookie list change, or with **Save and ask everyone again**.
- People change their choice from a small button in a corner of every page, from a menu item with the address `#cookie-preferences`, or from the **Cookie preferences button** block.
- Texts in English and Italian, or your own per language; bar or box; your color. Keyboard accessible.

### Services of other plugins

Services added by other plugins, such as **Analytics** (Matomo, Google Analytics, Tag Manager, Meta Pixel), bring their own rules: their category is offered in the banner, their cookies join the cookie table, Google Consent Mode turns on for Google services, and the privacy policy describes them. **Privacy → Cookie banner → Tracking services** shows them.

### Fonts from Google and Bunny

Pages that load **Google Fonts** (`fonts.googleapis.com`, `fonts.gstatic.com`) or **Bunny Fonts** (`fonts.bunny.net`) send the visitor's IP address to that service as soon as they open, before any consent: a German court fined a site for it (LG München, 20 January 2022) and the Italian Garante agrees. Bunny is in the EU and keeps no logs, but it is still a third party. **Privacy → Cookie banner → Fonts from Google and Bunny → Check the site** reads the home page and the latest pages and articles as a visitor (without cookies), with the site's own stylesheets they use (and those these import), and lists the pages that load those fonts and where from. Scripts held until consent and HTML comments are not counted. Only those pages are read: a font loaded by a script after the page opens is not seen.

To fix what it finds, keep the fonts on the site. Cleitext does it by itself for every theme and plugin (see [Web fonts kept on the site](#web-fonts-kept-on-the-site) below): what the check still lists comes from a stylesheet file of a theme or plugin (shown under the page), to be fixed there, or from a site where the setting was changed. **Fresco** (**Site settings → Global fonts → Google Fonts → Host on this site**, the default since Fresco 2.8) and **Prisma** (**Settings → Prisma → Google Fonts → Host on this site**, the default since Prisma 0.7) keep their own fonts the same way; with several of them on a page, a family is linked once.

### Web fonts kept on the site

This is part of Cleitext itself, with or without the Privacy plugin. **Settings → General → Privacy → Web fonts from Google Fonts and Bunny Fonts**:

- **Host them on this site** (the default, also for existing sites): after the theme and the plugins render a page, the core replaces each link to a Google Fonts or Bunny Fonts stylesheet (`<link rel="stylesheet">`, a style preload, `@import` in a `<style>`) with links to copies kept by the site, one per family (`/_fonts/<hash>.css`, with its `data-font-family`), and removes the `preconnect`, `dns-prefetch` and font preloads to those services. The server downloads each family once (only `fonts.googleapis.com`, `fonts.gstatic.com` and `fonts.bunny.net`, over https, with size limits and timeouts; WOFF2 files only), keeps it in the site's database and serves it with a one-year cache. Until a family's copy is ready (a page waits for it at most 2.5 seconds; a failed download is retried later, from 10 minutes up to 6 hours apart) the page goes without that family, never with the service's link, and cached pages are made again once the copy is ready. The block editor gets the theme's fonts from the same copies.
- **Load them from Google or Bunny Fonts**: the links stay; only those to families Fresco or Prisma already keep on the site for the page are dropped.
- **Leave the pages as the theme wrote them**: the core does not touch the pages.

Fonts declared only inside a theme's or plugin's stylesheet file (an `@import` or `@font-face` in a `.css` file), or loaded by a script, are not seen: the check above lists them. Icon fonts of the services (`fonts.googleapis.com/icon`, Material Icons) are left as they are.

### Scripts held until consent

In **Privacy → Cookie banner**, paste the code of analytics, ads or pixels into its category: it reaches the page inert (`<script type="text/plain">`, iframes without `src`) and runs only after the visitor accepts that category. In pages and themes, write scripts as `<script type="text/plain" data-cx-category="statistics">` and iframes with `data-cx-src="…" data-cx-category="marketing"` to get the same behavior. Videos, maps and posts of other sites in the pages (YouTube, also `youtube-nocookie.com`, Vimeo, TikTok, Instagram, Facebook, X, embeds…) wait for the **Marketing** category when the banner offers it (or the one chosen in **Category of embedded content**, since 1.8.0; an iframe with its own offered `data-cx-category` waits for that one), with a notice in their place until then, naming the provider and the category. Scripts of embeds marked `<script data-cx-embed="Provider">` (a social post's script kept by the WordPress importer) are held as well, with the notice before them; its **Accept and show** releases them without reloading the page.

**Google Consent Mode v2**: when on, Google tags start with everything _denied_ and follow the choice (`statistics` → `analytics_storage`, `marketing` → `ad_storage`, `ad_user_data`, `ad_personalization`, `preferences` → `functionality_storage`, `personalization_storage`).

Scripts of the site can read the choice: `window.cleitextConsent.get()` returns the accepted categories, `window.cleitextConsent.open()` opens the banner, and the `cleitext:consent` event fires on every choice.

## Consent managers: iubenda, Cookiebot, CookieYes

Sites that already use an external consent manager (CMP) choose it in **Privacy → Cookie banner → Consent manager**; **Privacy (built-in banner)** stays the default, and nothing is loaded from a CMP until one is chosen. Each choice links to the CMP's dashboard and says where to find its IDs, which are checked as they are typed:

- **iubenda** (Cookie Solution): the site ID and the cookie policy ID (numbers, in Cookie Solution → Embed). iubenda has one policy per language: on a multilingual site give the ID of each language. The banner speaks the language of the page, or a fixed one; more `_iub.csConfiguration` options can be added as JSON (`siteId`, `cookiePolicyId`, `lang` and the callbacks are set by the plugin; `perPurposeConsent` is on).
- **Cookiebot** (Usercentrics): the domain group ID (cbid), and the blocking mode. **Manual** (the default) leaves the holding of scripts and embeds to this plugin; **automatic** makes Cookiebot rewrite the page's scripts by itself, which may clash with the scripts held here: use it only for something that is not held otherwise. The banner language follows the page (`data-culture`).
- **CookieYes**: the site key, taken from the installation code or the script address (`https://cdn-cookieyes.com/client_data/<key>/script.js`) when pasted. Turn on its language detection for the banner in the page's language.

With a consent manager, the built-in banner, its corner button and the `cx_consent` cookie are off, and the CMP's official script is the first one in `<head>`, after the Google Consent Mode defaults when this plugin sets them. Everything held keeps waiting for consent: scripts pasted by category, `type="text/plain" data-cx-category` scripts, `data-cx-src` iframes and the videos, maps and posts of other sites. A small script follows the CMP's choice, when the page opens and whenever it changes, and releases them by category:

| Category here | iubenda (purposes)           | Cookiebot                       | CookieYes                  |
| ------------- | ---------------------------- | ------------------------------- | -------------------------- |
| Preferences   | 2 Interactions, 3 Experience | `Cookiebot.consent.preferences` | `functional`               |
| Statistics    | 4 Measurement                | `Cookiebot.consent.statistics`  | `analytics`, `performance` |
| Marketing     | 5 Marketing                  | `Cookiebot.consent.marketing`   | `advertisement`            |

The choice is read from `_iub.cs.api.getPreferences()` (on `onPreferenceExpressedOrNotNeeded` and the other callbacks; when iubenda says no consent is needed, everything is released), from `Cookiebot.consent` (on `CookiebotOnConsentReady`, `CookiebotOnAccept`, `CookiebotOnDecline`) and from `getCkyConsent()` and the `cookieyes_consent_update` event. When a category whose scripts already ran is withdrawn, the page loads again, so they stop.

The **Cookie preferences** button of a held embed, menu items with `#cookie-preferences`, the **Cookie preferences button** block and `[data-cx-open]` elements open the CMP's preferences (`_iub.cs.api.openPreferences()`, `Cookiebot.renew()`, CookieYes's banner). **Accept and show** gives consent to Marketing through the CMP (`_iub.cs.api.setPreferences()`, `Cookiebot.submitCustomConsent()`, CookieYes's `performBannerAction('accept_partial')` with its switches) and opens the CMP when that is not possible. Other scripts keep using `window.cleitextConsent.get()`, `window.cleitextConsent.open()` and the `cleitext:consent` event; `window.cleitextConsent.allow('marketing')` asks the CMP for a category.

**Google Consent Mode**, when on (or turned on by Analytics), is set by the consent manager by default: iubenda gets `googleConsentMode: true`; keep Consent Mode on in Cookiebot (the default); turn on _Support Google Consent Mode (GCM)_ in CookieYes. The plugin then emits no defaults of its own, so they are never sent twice. Choose **This plugin** instead to have the plugin set the defaults (all denied) before the CMP and send the updates: iubenda's `googleConsentMode` and Cookiebot's Consent Mode (`data-consentmode="disabled"`) are turned off for you, and in CookieYes switch GCM off yourself.

**Consent log**: the CMP records every consent as proof and keeps it in its dashboard, so this plugin's log is not written (`/_privacy/consent` answers 404); the records written before stay. The cookie table lists the CMP's consent cookie (`_iub_cs-<id>`, `CookieConsent`, `cookieyes-consent`) instead of `cx_consent`.

**Policies**: with iubenda, **Show iubenda's privacy and cookie policy in the policy pages** makes **Privacy → Policies** create pages with the **Policy of the consent manager** block, which shows iubenda's policy in the page's language with its official embed: a link opening it (all plans) or its text in the page (`iub-body-embed`, Advanced and Ultimate plans); the **Cookie table** block shows iubenda's cookie policy. With Cookiebot, **Show Cookiebot's cookie declaration** makes the **Cookie table** block show the declaration of the cookies Cookiebot found (`cd.js`); the privacy policy stays the one written here. With CookieYes the policies written here stay.

**Content Security Policy**: Cleitext's public pages send a policy that only forbids plugins, `<base>` hijacking and framing by other sites, so the CMPs' scripts and frames need nothing. A stricter policy added by a proxy must allow their origins: `cdn.iubenda.com`, `www.iubenda.com`, `cs.iubenda.com`; `consent.cookiebot.com`, `consentcdn.cookiebot.com`; `cdn-cookieyes.com`, `log.cookieyes.com`.

The **Fonts from Google and Bunny** check and the other checks work the same with a consent manager.

## Consent log

Every choice is recorded as proof (GDPR art. 7.1): a random id kept in the visitor's cookie `cx_consent`, the categories, the banner version, the IP without its last part and the browser. **Privacy → Consent log** shows the totals and the latest choices, and downloads them all as CSV. Records older than the retention period (24 months by default) are deleted. With an external consent manager the log is kept by it (see above).

## Policies

**Privacy → Policies** asks who the data controller is and what the site does (contact forms, accounts, newsletter, analytics, embedded content, hosting), then creates **Privacy policy** and **Cookie policy** drafts in each language of the site, made of ordinary blocks to edit in the editor. The cookie policy includes the **Cookie table** block, always in step with **Privacy → Cookies**, and the **Cookie preferences button**. Once published, the banner links to them, and the pages list marks them with a _Privacy policy_ or _Cookie policy_ tag.

Other plugins that keep personal data can add a section to the generated **privacy policy** (Privacy 1.7): they put a provider in the map on `globalThis` under `Symbol.for('cleitext.privacy.policySections')`, by their slug, which answers `{ title, text }[]` for a site and a language (`async ({ siteId, locale }) => …`, nothing on sites where they are not active). The official **Agenda** plugin describes its appointments this way, with its retention period.

The **Forms** plugin's contact form has a _Privacy policy address_: when set, a short notice with the link is shown under the form. A form with fields of its own (Forms 1.3.0) can also ask for a **consent**: a required checkbox whose label may link to the policy.

## Requests about personal data

When someone asks for their data (GDPR art. 15 and 20) or to have it erased (art. 17), check who they are, then enter their email in **Privacy → Data requests**:

- **Export** downloads a JSON file with what the site keeps about them: the account of a member of the site (profile, sessions, tokens, activity), their comments and likes, and the data of every plugin that registered an exporter, such as Forms messages.
- **Erase** anonymizes their comments as WordPress does (the text stays, without name, email, website and IP address), removes their likes and runs the erasers of the plugins (e.g. Forms messages are deleted). User accounts are kept: delete them from **Users** if needed.

Every request is logged with its date and who handled it; erasures keep only a masked address.

## Install

```bash
bin/cleitext plugin:install plugins/privacy
```

or upload the zip in **Plugins → Upload Plugin**, then activate it on the site. Settings, records and requests are kept when it is deactivated. It needs Cleitext 0.13 or later (plugin API 1.4).
