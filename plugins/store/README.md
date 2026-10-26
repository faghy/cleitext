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
- **Keys** are found by their SHA-256, with their last 5 characters to find them in the admin. Activation tokens are stored as SHA-256 too. The full key is shown once in the admin, when the license is created, and emailed to the buyer. Since 1.4.0 it is also kept encrypted (AES-256-GCM, with a secret of the store kept encrypted by Cleitext), so the customer portal can show it again; licenses made before 1.4.0 show only their last characters there.
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

**Products** can also be **bundles** and have a list price; see [Agency licenses](#agency-licenses-bundles).

**Store** also makes licenses by hand (gifts, tests, sales elsewhere). It lists and searches licenses by email, last characters of the key or order, and can extend, revoke or restore them. It shows each license's sites and frees a seat, and lists the latest downloads, demos included.

## Agency licenses (bundles)

A **bundle** is a product whose licenses are valid for other products: one key for several themes and plugins, with one number of sites and one renewal.

- In **Products**, tick _Bundle_ and choose what it covers: **every paid product** (now and later; products ticked _Free_, such as the Toolkit for Plesk, and other bundles are never covered) or a list of products. Bundles never cover bundles.
- Sell it like any product: a Lemon Squeezy variant pointing at the bundle, or a license by hand. The months of updates and the renewal checkout are the bundle's.
- On each site the key is entered for each product, as usual (**Appearance → Themes** or **Plugins**). The site sends the key, the product's slug and its address; the store accepts the key for every product the bundle covers.
- **Seats are sites**: a site using three products of the bundle takes one seat. Each product still gets its own activation, and the seat is free when the site has deactivated all of them (or when it is freed in the admin or the portal).
- Downloads and updates of every covered product follow the bundle's updates.
- Existing licenses do not change. Nothing changes on the sites either: the protocol is the same, so every version of Cleitext that takes license keys accepts bundle keys.

## Customer portal

Customers and agencies find their licenses at **`https://<shop>/my-licenses`** (also behind a language prefix, such as `/it/my-licenses`, in English and Italian). There is no password or account:

1. They give the email address of their licenses. If licenses are linked to it, as the buyer's or as the managing agency's, the store emails a sign-in link. The page answers the same for any address, so nobody learns who has licenses. Requests are limited per IP address and per email address.
2. The link works once, for 20 minutes. Opening it shows a **Continue** button, so mail scanners that follow links do not use it up. Continuing signs in this browser for 7 days (cookie `store_portal`, HTTP-only; the session is stored as SHA-256 and deleted by **Sign out**).
3. They see each license: the product or bundle and what it covers, the key masked with **Show key**, the sites in use and allowed, the end of the updates with **Renew**, the sites using it (products, last contact) with **Free this seat**, and links to **download the latest version** of each product they may install (the highest version released before their updates end). Invoices stay with Lemon Squeezy, which emails them; the page links to the buyer's orders.

The portal pages are not cached (`cache-control: private, no-store`); a proxy cache in front of the shop must pass `/my-licenses` and requests with the `store_portal` cookie.

## Agencies and partners

- A license has a **customer** (`email`, the end client) and, optionally, an **agency** that manages it (`owner_email`). The agency manages it in the portal (key, freeing seats, downloads); the customer sees it, with its sites and downloads, but cannot show the key or free seats. Without an agency the customer manages it. **Customer and agency** in the license list changes them.
- **Store → Partners** keeps agencies and resellers: name, email (their portal account), **discount** on list prices, a **checkout code** and the **Lemon Squeezy discount code**. It shows, for each partner, its licenses (managed or bought), the sites in use and the amounts recorded. This is record keeping: no payment is processed here.
- **Licenses by hand** for a partner (as agency, or as customer) record the list price (the product's, unless given), the partner's discount and the discounted price.
- **Lemon Squeezy**: create a discount code for each partner in Lemon Squeezy (it applies the discount and handles VAT and invoices) and note it in the partner. Partner checkout links carry `checkout[custom][partner]=<code>` (the partner's checkout code): the license of such an order is managed by the partner, and the store records the order's subtotal, discount and price.

## Installations

**Store → Installations** is the registry of what Cleitext sites run. Each visited site reports it about once a day to `…/api/v1/ext/store/v1/report`: the version of Cleitext, its theme and the plugins installed on its server, with their versions and whether they are active. It opens with a **summary**: the number of sites, servers and Cleitext versions, and a table of Cleitext, every theme and every plugin with the sites using it, those that only have it installed and the versions. The **Plugin** and **Theme** filters narrow everything to the sites where that plugin or theme is installed, and show its total: the sites it is installed on, in use on and the versions. Below, the same data in two ways:

- **By plugin and theme**: each version, with the sites that have it;
- **By site**: one card per site.

Reports from development and test addresses (`localhost`, `.test`, `.local`, private networks) are ignored. Sites can turn reporting off in **Settings → General**; a site not heard from for 180 days is deleted from the registry. **Forget** removes a site until its next report.

## Public downloads

**Store → Public downloads** publishes free files of a product, such as the Cleitext Toolkit for Plesk. Choose the product, give the version (`0.6.0-1`) and upload the `.zip`.

- Anyone can download it at `https://<shop>/downloads/<product>/<file>.zip`. The store counts the downloads; nothing about the visitor is kept.
- `https://<shop>/downloads/<product>/latest.json` describes the **highest** version, not the last upload: `slug`, `name`, `version`, `file`, `url`, `size`, `sha256`, `publishedAt`. The Toolkit reads it to offer its own updates.
- A published version never changes: uploading the same version or file name again is refused. Delete it first.
- Only zip archives are accepted, with names of `a-z`, `0-9`, `.`, `-` and `_`. The SHA-256 is computed by the store and shown in the list.

## Server reports (Plesk Toolkit)

The Cleitext Toolkit for Plesk can send anonymous statistics, if its administrator turns them on (they are off by default). Once a day it calls `…/api/v1/ext/store/v1/server-report` with:

- the product (`cleitext-toolkit`) and its version;
- the panel and its version (`plesk`, `18.0.81`);
- the number of Cleitext installations the Toolkit manages;
- `server`, a SHA-256 hash of a random id made for this purpose. It cannot be linked to a license or a host name.

Nothing else is kept: no domain, address or IP. Turning the statistics off sends `{ product, server, forget: true }`, which deletes the server's row. Rows not heard from for 180 days are deleted. Reports are limited per address and checked field by field; the product must exist in **Products**.

**Store → Installations** shows them in **Plesk servers (Cleitext Toolkit)**: the number of servers and installations, by Toolkit version and by Plesk version.

## Permissions

`routes:admin` (the license server, the webhook and the admin API), `routes:public` (public downloads and the customer portal), `settings:own` (settings and encrypted secrets) and `mail:send` (the keys and the portal's sign-in links). The capability `manage_store` goes to administrators.
