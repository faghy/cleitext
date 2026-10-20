# Store

The official Cleitext plugin that runs the **license server of paid themes and plugins** (RF-CAT-03). It is meant for the site that sells them, such as cleitext.com, and is not in the base package. Install it from **Plugins → Upload Plugin** with `cleitext-plugin-store-<version>.zip` from the Releases page.

## What the buyer gets

- A **license key** by email: 25 characters, for example `7KQ2M-XV9RT-4HZC8-PDA3W-NEJB5`. The last character is a check character, so Cleitext spots a mistyped key before asking the server.
- The key is valid for a number of **sites** (1, 5… or no limit) and includes **updates** for some months, 12 by default.
- On each site, **Appearance → Themes → Enter license key** (or **Plugins**, for a paid plugin) activates the key once, for that site. The theme or plugin can then be activated, and its updates come from the catalog.
- The **demo**: the theme can be installed without a license and tried with **Live Preview** on the site's own pages. It cannot be activated without a license.
- After the updates end, the theme keeps working. Only new versions ask for a **renewal**. A refunded order revokes the license: sites keep the theme, but they get no more downloads.

## How it works

- Cleitext sites call the plugin at `https://<shop>/api/v1/ext/store/v1/…`. This address goes in `paid.licenseServer` in the catalog and in the theme's `theme.json`. The calls are:
  - `activate`: activates a key for a site and returns an activation token;
  - `deactivate`: frees the site's seat;
  - `status`: refreshes what the license includes;
  - `download-token`: returns a download address valid for 5 minutes.
- These routes accept calls from other servers (plugin API 1.10, `webhook: true`) and limit how many requests come from one address.
- **Keys** are stored only as SHA-256, with their last 5 characters to find them. Activation tokens are stored as SHA-256 too. The full key is shown once, when the license is created, and emailed to the buyer.
- **Packages** stay in the releases of a private GitHub repository: tag `theme-<slug>-<version>`, asset `cleitext-theme-<slug>-<version>.zip`. The catalog build puts them there. A download address is signed (HMAC) for one theme, one version and one license. It is checked by the store, which then redirects to GitHub's own short-lived address.
- A version **published after** the end of the license's updates is refused with _renew to update_. The release date on GitHub decides.
- **Lemon Squeezy** (merchant of record: they handle EU VAT and invoices) calls `…/v1/webhooks/lemonsqueezy`. Its signature (`X-Signature`, HMAC-SHA256 of the body) is checked.
  - `order_created`: creates the license and emails the key. A retried webhook creates nothing new.
  - A renewal variant extends the updates of the license named in the checkout's custom data.
  - `order_refunded`: revokes the license.

## Setup

1. **Settings → Store**: the private repository (`owner/name`).
2. **Store → Setup**:
   - the GitHub token, a fine-grained token with _Contents: read_ on that repository;
   - the Lemon Squeezy signing secret.

   Both are kept encrypted.

3. **Products**: one per paid theme, with the theme's slug, the months of updates, whether the demo is offered, and the renewal checkout address.
4. **Lemon Squeezy variants**: the id of each variant, with what it sells: a new license for some sites, or a renewal.
5. In Lemon Squeezy, add a webhook to the address shown in **Setup**, with the events `order_created` and `order_refunded` and the same signing secret.
6. Point the renewal product's checkout at **Products → Renewal checkout**. The store adds `checkout[custom][license]=<id>` to it, so the renewal finds its license.

**Store** also makes licenses by hand (gifts, tests, sales elsewhere). It lists and searches licenses by email, last characters of the key or order, and can extend, revoke or restore them. It shows each license's sites and frees a seat, and lists the latest downloads, demos included.

## Installations

**Store → Installations** is the registry of what Cleitext sites run. Each visited site reports it about once a day to `…/api/v1/ext/store/v1/report`: the version of Cleitext, its theme and the plugins installed on its server, with their versions and whether they are active. It opens with a **summary**: the number of sites, servers and Cleitext versions, and a table of Cleitext, every theme and every plugin with the sites using it, those that only have it installed and the versions. The **Plugin** and **Theme** filters narrow everything to the sites where that plugin or theme is installed, and show its total: the sites it is installed on, in use on and the versions. Below, the same data in two ways:

- **By plugin and theme**: each version, with the sites that have it;
- **By site**: one card per site.

Reports from development and test addresses (`localhost`, `.test`, `.local`, private networks) are ignored. Sites can turn reporting off in **Settings → General**; a site not heard from for 180 days is deleted from the registry. **Forget** removes a site until its next report.

## Permissions

`routes:admin` (the license server, the webhook and the admin API), `settings:own` (settings and encrypted secrets) and `mail:send` (the keys). The capability `manage_store` goes to administrators.
