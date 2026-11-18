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

### Internal and external installations

Since 1.6.0 each installation is **internal** (on our own servers and domains) or **external** (every other one). **Settings → Store → Internal domains and servers** holds the list, one pattern per line:

- `*.2clic.it`: every name under 2clic.it (server1.2clic.it, a staging subdomain…), not 2clic.it itself;
- `sitoup.it`: that name only;
- `203.0.113.7` or `203.0.113.0/24`: the address (or network) of a server.

The default list is `*.2clic.it`, `2clic.it`, `*.sitoup.it`, `sitoup.it`, `*.dnsbazar.com`, `dnsbazar.com`; lines starting with `#` are comments. An installation is internal when:

1. its site's host matches a name of the list;
2. or the **server** it reports from matches: Cleitext's report names no server, so the store keeps the address the report comes from and its reverse DNS name (e.g. `server1.2clic.it`, when the server's PTR record says so), and matches the name against the names of the list and the address against the addresses;
3. or another site of the same Cleitext **installation** (same install id: one server) is internal by 1 or 2.

A site can also be **marked internal or external by hand** in its card (**By site**); the mark stays across reports until **Back to the list** (or **Forget**). The overview counts internal and external sites, the **Installations** filter (All / Internal / External) narrows everything, and each site has its badge. In **Store → Licenses**, each license shows whether its sites are internal or external, and **Sites** shows it for each activation (by the registry, or by the site's host when it has not reported). The admin API takes `GET …/admin/installs?scope=internal|external` and `PUT …/admin/installs/internal` with `{ origin, internal: true | false | null }`.

## Linking a license to a Cleishop order

A license made by hand (sold and billed outside the shop) can be linked afterwards to its **Cleishop order**, so the order is on record in the shop **without a new key, without an email and without an invoice**. In **Store → Licenses**, a license made by hand has **Link to a Cleishop order**:

- **Make the order in Cleishop from this license** (recommended): the store imports the order through Cleishop's `shop` service, as the WooCommerce import does: status _completed_, the license's email, the billing name, company, VAT number and tax code given, the total (the license's price when empty) and the tax in it, the date (the license's when empty), a note naming the license. An imported order sends **no email**, moves **no stock**, takes **no payment** and fires **no status change**, so PDF Invoices makes **no invoice** for it. Making it again finds the same order (one per license).
- Or give an **existing order**: its number (`123`, `#123`) or the address of its page (`…/orders?order=<id>`). By id, or by number for an imported order, it is linked at once. A number of an order that is not imported waits (_waiting for Cleishop order 123_) and is linked when that order next changes status, if its email is the license's (or its agency's); otherwise the link is refused and the order is handled as usual. A waiting link can be cancelled; it is dropped after 60 days.

Linking gives the license the order's line (`source` cleishop, `orderRef` `<orderId>:<itemId>`, the same reference a license sold by Cleishop has) and marks that line as handled. When the order is then paid or completed (again), the store finds its license and makes no other, sends no key. If the order is **refunded or cancelled**, the linked license is **revoked**, as any license sold by the shop. Only licenses made by hand can be linked; an order that already made its license is refused (revoke one of the two). The license keeps a record of the link (and of its earlier source).

The admin API: `POST …/admin/licenses/<id>/cleishop-order` with `{ "order": "123" }` or `{ "create": { "firstName", "lastName", "company", "vatNumber", "taxCode", "country", "total", "tax", "date", "number" } }`; `DELETE …/admin/order-links/<id>` cancels a waiting link.

**Recommended procedure** for an order to enter after the license:

1. Do not place the order through the checkout, nor change an order to _processing_ or _completed_ from Cleishop **before** linking it: that sells a license and emails a key (and PDF Invoices makes an invoice on those statuses).
2. In **Store → Licenses**, find the license, **Link to a Cleishop order** → **Make the order in Cleishop from this license**, give the customer's data and the amount, **Make and link the order**.
3. Check it in **Cleishop → Orders** (completed, with the store's note). Its documents show **Create the invoice**: do not click it, the invoice was made by hand. PDF Invoices has no setting to skip one order: an order changing to one of its statuses later gets an invoice.

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

## In italiano (1.6.0)

**Installazioni interne ed esterne.** Le installazioni sui nostri server e domini sono _interne_, tutte le altre _esterne_. L'elenco è in **Impostazioni → Store → Domini e server interni**, uno per riga: `*.2clic.it` (tutti i nomi sotto 2clic.it), `sitoup.it` (solo quel nome), `203.0.113.7` o `203.0.113.0/24` (l'indirizzo di un server). Di serie: `*.2clic.it`, `2clic.it`, `*.sitoup.it`, `sitoup.it`, `*.dnsbazar.com`, `dnsbazar.com`. Un'installazione è interna se il nome del sito corrisponde, se corrisponde il server da cui arriva il resoconto (Cleitext non manda il nome del server: lo store tiene l'indirizzo da cui arriva il resoconto e il suo nome DNS inverso, es. `server1.2clic.it`), o se un altro sito della stessa installazione di Cleitext (stesso install id) è interno. Ogni sito si può anche **segnare a mano** come interno o esterno. **Store → Installazioni** conta interne ed esterne, ha il filtro _Tutte / Interne / Esterne_ e un'etichetta su ogni sito; le licenze mostrano se i loro siti sono interni o esterni.

**Collegare una licenza a un ordine Cleishop.** Per una licenza fatta a mano (venduta e fatturata fuori dal negozio), **Store → Licenze → Collega a un ordine Cleishop**:

- **Crea l'ordine in Cleishop da questa licenza** (consigliato): lo store importa l'ordine in Cleishop come _completato_, con email della licenza, nome, azienda, partita IVA, codice fiscale, totale (vuoto: il prezzo della licenza), IVA e data (vuota: quella della licenza). Un ordine importato **non manda email**, non muove il magazzino, non incassa e non cambia stato, quindi PDF Invoices **non fa la fattura**. Ripetere l'operazione ritrova lo stesso ordine.
- Oppure un **ordine esistente**: il numero (`123`) o l'indirizzo della sua pagina (`…/orders?order=<id>`). Con l'id, o con il numero di un ordine importato, il collegamento è immediato; il numero di un ordine non importato resta _in attesa_ e si collega al prossimo cambio di stato dell'ordine, se la sua email è quella della licenza (o dell'agenzia).

Dopo il collegamento la licenza prende la riga dell'ordine: quando l'ordine viene pagato o completato lo store trova la licenza e **non ne crea un'altra, né manda la chiave**. Se l'ordine viene rimborsato o annullato la licenza viene revocata. Non va fatto l'ordine dalla cassa né messo _in lavorazione_ o _completato_ prima del collegamento (creerebbe una licenza e una fattura); nella pagina dell'ordine non cliccare **Crea la fattura**. PDF Invoices non ha un modo per escludere un singolo ordine.

## Permissions

`routes:admin` (the license server, the webhook and the admin API), `routes:public` (public downloads and the customer portal), `settings:own` (settings and encrypted secrets) and `mail:send` (the keys and the portal's sign-in links). The capability `manage_store` goes to administrators.
