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

### Fonts from Google

Pages that load **Google Fonts** (`fonts.googleapis.com`, `fonts.gstatic.com`) send the visitor's IP address to Google as soon as they open, before any consent: a German court fined a site for it (LG München, 20 January 2022) and the Italian Garante agrees. **Privacy → Cookie banner → Fonts from Google → Check the site** reads the home page and the latest pages and articles as a visitor (without cookies), with the site's own stylesheets they use (and those these import), and lists the pages that load Google Fonts and where from. Scripts held until consent and HTML comments are not counted. Only those pages are read: a font loaded by a script after the page opens is not seen. To fix what it finds, keep the fonts on the site: with **Fresco**, **Site settings → Global fonts → Google Fonts → Host on this site** (the default since Fresco 2.8); with **Prisma**, **Settings → Prisma → Google Fonts → Host on this site** (the default since Prisma 0.7; with both on a page, a family is linked once); with a theme or a plugin that links Google Fonts, its own setting for local fonts, or fonts uploaded and declared with `@font-face`.

### Scripts held until consent

In **Privacy → Cookie banner**, paste the code of analytics, ads or pixels into its category: it reaches the page inert (`<script type="text/plain">`, iframes without `src`) and runs only after the visitor accepts that category. In pages and themes, write scripts as `<script type="text/plain" data-cx-category="statistics">` and iframes with `data-cx-src="…" data-cx-category="marketing"` to get the same behavior. Videos, maps and posts of other sites in the pages (YouTube, also `youtube-nocookie.com`, Vimeo, embeds…) wait for the **Marketing** category when the banner offers it, with a notice in their place until then.

**Google Consent Mode v2**: when on, Google tags start with everything _denied_ and follow the choice (`statistics` → `analytics_storage`, `marketing` → `ad_storage`, `ad_user_data`, `ad_personalization`, `preferences` → `functionality_storage`, `personalization_storage`).

Scripts of the site can read the choice: `window.cleitextConsent.get()` returns the accepted categories, `window.cleitextConsent.open()` opens the banner, and the `cleitext:consent` event fires on every choice.

## Consent log

Every choice is recorded as proof (GDPR art. 7.1): a random id kept in the visitor's cookie `cx_consent`, the categories, the banner version, the IP without its last part and the browser. **Privacy → Consent log** shows the totals and the latest choices, and downloads them all as CSV. Records older than the retention period (24 months by default) are deleted.

## Policies

**Privacy → Policies** asks who the data controller is and what the site does (contact forms, accounts, newsletter, analytics, embedded content, hosting), then creates **Privacy policy** and **Cookie policy** drafts in each language of the site, made of ordinary blocks to edit in the editor. The cookie policy includes the **Cookie table** block, always in step with **Privacy → Cookies**, and the **Cookie preferences button**. Once published, the banner links to them, and the pages list marks them with a _Privacy policy_ or _Cookie policy_ tag.

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
