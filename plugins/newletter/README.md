# NewLetter

🇮🇹 [Leggi in italiano](./README.it.md)

> **Every subscriber, a new letter.**

The official Cleitext plugin for **newsletter signups**. Pick the email-marketing service you already use, paste its API key, choose the list, and put a signup form on any page. The form is drawn by the site, in your theme's style; people are added to your list in the service, which keeps sending your newsletters. It is free and not in the base package: install it from **Plugins → Add New** (catalog), or upload `cleitext-plugin-newletter-<version>.zip` in **Plugins → Upload Plugin**. It needs Cleitext 0.80 or later (plugin API 1.51).

## Services

| Service                   | Lists             | Double opt-in                                                    | Tags                     |
| ------------------------- | ----------------- | ---------------------------------------------------------------- | ------------------------ |
| **Brevo** (ex Sendinblue) | contact lists     | Brevo's DOI: a template of the "Double opt-in" kind and the page | no (Brevo has none)      |
| **Mailchimp**             | audiences         | the member is added as `pending`; Mailchimp sends the email      | yes                      |
| **MailerLite**            | groups (optional) | the subscriber is added as `unconfirmed`                         | no (groups are the tags) |
| **Kit** (ConvertKit)      | forms (optional)  | a setting of each form in Kit                                    | yes (made when missing)  |
| **ActiveCampaign**        | lists             | not through the API: subscribed at once (the log says so)        | yes (made when missing)  |

Each service is spoken to through its official public REST API, by the server (never by the visitor's browser). The key is stored encrypted with the site's secrets and is never sent back to the browser: the admin only knows that there is one.

## Set up

Open **NewLetter** in the admin's menu:

1. **Connection**: choose the service, paste the API key (ActiveCampaign also wants your account's API address) and press **Test connection**, then **Save connection**.
2. **Lists**: tick the lists people subscribe to. Optionally choose which of the service's fields hold the name and the surname (empty: the usual ones, `FIRSTNAME`/`LASTNAME`, `FNAME`/`LNAME`, `name`/`last_name`…), and extra fields for forms with "All fields" (a label per language, required or not).
3. **Form defaults**: fields (email only, name, name and surname, all), stacked or on one line, double opt-in (on by default; Brevo then needs the template id and the confirmation page), tags, the address of the privacy policy.
4. **Texts**: per language of the site, the button, the messages after subscribing (with and without double opt-in), "already subscribed", the error, the consent and the "Subscribe me" box. Empty texts use the built-in English and Italian ones.

Until a service is connected and a list chosen, forms show nothing to visitors (the editor shows a note instead).

## The signup form

- the **Newsletter signup** block in the block editor (also inside Prisma's containers), with heading, text, fields, layout, button text, messages, lists, tags and double opt-in;
- the **Newsletter** widget in Fresco, with the list chosen from your service;
- the shortcode **`[newletter]`** alone in a paragraph, e.g. `[newletter fields="name" layout="inline" lists="7" button="Join"]`.

The form:

- always asks the email, and a **consent** box that is never ticked in advance, with the link to your privacy policy;
- works **without JavaScript** (a normal form post, then back to the page with the message) and, with JavaScript, answers in place, reads the outcome out to screen readers, and marks and focuses wrong fields;
- is checked by the site's bot protection (**Captcha** or **Antispam**, the core's form hook) with a hidden field for simple bots and a limit of attempts per visitor and per address; a signup held as spam is subscribed if it is released as not spam;
- cannot be turned to other lists: what a form does (lists, tags, double opt-in, fields) is signed when the page is drawn;
- takes its colours, fonts and fields from the theme; a few CSS variables adjust the rest: `--cx-nl-gap`, `--cx-nl-max-width`, `--cx-nl-accent`, `--cx-nl-error`, `--cx-nl-small`.

## "Subscribe me" in other forms

With NewLetter connected, an unticked **Subscribe me to the newsletter** box (opt-in only) appears in:

- the contact forms of **Forms** (1.6.0 or later): subscribed when the message is delivered;
- the checkout of **Cleishop** (1.9.0 or later): subscribed with the billing name when the order is placed;
- the booking form of **Agenda** (1.1.0 or later): subscribed when the booking is made.

Each one can be turned off in the settings, and these subscribers can go to lists and tags of their own. The box's text is the consent recorded.

**For developers**: the box goes through a small registry on `globalThis[Symbol.for('cleitext.newsletter.optIn')]` (`version: 1`), see [`src/optin.ts`](./src/optin.ts). A plugin asks `checkbox({ siteId, locale, source })` when it draws its form (null: show nothing) and calls `subscribe({ siteId, source, email, name | firstName/lastName, locale, ip })` when the form is accepted with the box (field `cx_newsletter`, value `1`) ticked. `subscribe` never throws and works in the background. Without NewLetter the registry is missing and the forms are as before.

## Consent and the log

Every subscription is recorded in **NewLetter → Subscriptions**: date, where it came from (the signup form, a contact form, the checkout, a booking), the lists, the outcome (subscribed, waiting for confirmation, already subscribed, held as spam, error, with the service's message) and the **consent**: date and time, the text accepted and a fingerprint of the IP address. The log keeps **no email address or IP address in clear**: a hint (`m•••@e•••.com`) and keyed fingerprints (HMAC with a secret of the site), enough to find a person's lines for a GDPR request but not to read them. Lines are deleted after a number of days (180 by default; 0 keeps them).

Requests to export or erase a person's data (Privacy plugin) include their lines of the log; the contact itself is in the email service, where it must be removed too (the erasure says so). The **Privacy** plugin's generated privacy policy (1.7.0 or later) gets a **Newsletter** section naming your service, the legal basis (consent), double opt-in and how long the consent record is kept.

## Trackers of the services

NewLetter adds **no script of the services** to the pages: no tracking pixel, no Brevo `sdk-loader.js`, no Mailchimp site script. If you want one of them (e.g. Brevo's web tracking, or Mailchimp's popup), add it through the **Privacy** plugin so it waits for consent: paste it in **Privacy → Cookie banner** under the **Marketing** category, or write it in a page or theme as `<script type="text/plain" data-cx-category="marketing" src="…">`. It then runs only after the visitor accepts Marketing, and its cookies should be listed in the cookie policy.

## Import from WordPress

With the **WordPress Importer** (1.30.0 or later), these become the Newsletter signup block, and the import report lists them:

- **Mailchimp for WP**: `[mc4wp_form id="…"]` and its block, with the form's audiences (read from the `mc4wp-form` post of the export), fields and button text;
- **Mailchimp embedded forms** (`…list-manage.com/subscribe/post?u=…&id=…` in an HTML block), with the audience id;
- **Brevo embedded forms** (`sibforms.com`, as an iframe or the HTML code) and Brevo's plugin shortcode `[sibwp_form]`;
- **MailerLite**, **Kit** and **ActiveCampaign** embedded forms, with their groups, forms or lists;
- **The Newsletter Plugin**: `[newsletter_form]` and `[newsletter]` (with its `[newsletter_field]`s);
- **MailPoet**: `[mailpoet_form id="…"]` and its block.

Lists carried over are used only when they belong to the service you connect (Mailchimp audiences with Mailchimp, and so on); otherwise the form uses your default lists. The Newsletter Plugin's and MailPoet's lists live inside WordPress and cannot be moved: export those subscribers from WordPress and import them in your service.

## Limits

- One service per site.
- Brevo has no tags and its double opt-in needs a DOI template; ActiveCampaign cannot send its confirmation through the API; with Kit, double opt-in is the setting of the Kit form you choose.
- MailerLite's account name is not given by its API: the admin shows "MailerLite".
- Subscriptions are sent while the visitor waits (a few seconds at most); the "Subscribe me" boxes of other plugins are sent in the background.
- The per-visitor limit of attempts is kept by each server process.

## Renaming the plugin

The slug, the names, the claim, the table prefix, the block, the capability, the form id, the public address, the shortcode, the CSS marker and the test variable all come from [`src/config.ts`](./src/config.ts); the manifest (`cleitext.plugin.json`: `slug`, `name`, `capabilities`) and the package name must match it, and the migration's table names must start with `TABLE_PREFIX` (a test checks all of these). To rename: change `src/config.ts`, the manifest, `package.json`, the folder, the migration (before the first release only: installed migrations cannot change), `'newletter'` in `tools/release/index.mjs`, the e2e spec (`apps/admin/e2e/newletter.spec.ts`), the texts that say "NewLetter" in the admin, the Italian texts and these READMEs. The opt-in registry (`cleitext.newsletter.optIn`, field `cx_newsletter`) does not follow the name, so Forms, Cleishop and Agenda need no change. The database schema follows the slug (`plg_<slug>`): an installed copy is a different plugin after a rename.

## Development and tests

```bash
pnpm --filter @cleitext/plugin-newletter test          # adapters, form, consent, registry, import, the plugin on a fake core
pnpm --filter @cleitext/plugin-newletter test:coverage
pnpm --filter @cleitext/plugin-newletter typecheck
```

The adapters are tested against a fake HTTP client for every service (success, already subscribed, invalid key, double opt-in, errors). The end-to-end test (`apps/admin/e2e/newletter.spec.ts`) never talks to a real account: start the server with **`NEWLETTER_TEST_ENDPOINT=http://127.0.0.1:4799`** and every request meant for a service goes to that local address instead (`<endpoint>/<service host><path>`; only `http` on `127.0.0.1` or `localhost` is accepted), where the spec runs a fake Brevo. Without the variable the spec is skipped. Never set it in production.
