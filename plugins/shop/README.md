# Cleishop

Cleishop is the official Cleitext plugin for selling from your site (slug `shop`). It takes the product
management of Cleito, built for shop managers who update hundreds of
products, with the catalog features shops expect.

**The catalog**:

- Products are Cleitext entries of type `product` (blocks for the description,
  revisions, translations, SEO, search), at `/product/<slug>`. Their commercial
  data lives in the plugin's tables.
- Product categories (a tree, with an image) and brands (logo, website) are
  taxonomies, with archives at `/product-category/<slug>` and `/brand/<slug>`.
- **Cleishop → Products**:
  - filters that stack: category with its subcategories, then the brands present
    there with their counts, status, stock, condition, on sale;
  - rows coloured by status;
  - price and stock changed by clicking on them;
  - a quick look (images, prices, stock);
  - duplicate, trash and publish on many products at once;
  - CSV export and import, with the usual column names of e-commerce platforms; the pictures of an import are downloaded from their addresses (first one the product picture, then the gallery).
- **The product form**, on one page or step by step (Settings → Cleishop):
  - category and brand;
  - description;
  - three prices (cost, list price, selling price) with the margin, computed
    from the supplier's price by the pricing rules;
  - sale price with dates;
  - stock;
  - images (several at once, dragged to reorder, captions);
  - shipping;
  - attributes and variations;
  - visibility, up-sells and cross-sells.
- **Attributes** (colour, size…) shared by products, and **pricing rules**
  (bands of cost with their markup, a surcharge, the discount from the list
  price, rounding).

**Buying**:

- a buy box on product pages (price, availability, variation, quantity);
- the cart at `/cart`, in a cookie;
- the checkout at `/checkout`:
  - addresses with Italian provinces and postcodes;
  - invoice details (codice fiscale, partita IVA, SDI or PEC);
  - terms and the right of withdrawal;
  - bank transfer;
- the order, with its stock taken safely, and its page with the bank details.

**Orders** (Cleishop → Orders and Shop emails):

- orders by status, found by number, email or name;
- the order with its products, addresses, invoice details and history;
- status changes that give the stock back or take it again;
- notes, private or emailed to the customer;
- full or partial refunds that put products back in stock;
- printing, and sending emails again;
- the emails shops send, HTML and text:
  - to the shop: new, cancelled and failed orders;
  - to the customer: order received with the bank details, processing, completed, refunded, notes.

  Their texts can be changed, with a preview.

**Shipping, taxes and coupons**:

- **Cleishop → Shipping**: zones of countries, provinces and postcodes (`20*`,
  `00118...00199`), the first matching one from the top, and "Everywhere
  else"; each with its methods:
  - flat rate, with a formula (`3 + 1.5 * [qty]`) and costs per shipping class;
  - free shipping, over an amount, with a coupon, either or both;
  - local pickup, with where and when;
  - by weight, in bands (the last one open or not).

  Without any method, orders ship for free. A tester shows the rates of an
  address.

- **Cleishop → Taxes**: rates by class (standard, reduced, second reduced,
  super-reduced, zero), country and province, the Italian ones in one click.
  The shipping address chooses them; with prices entered with taxes, what
  customers pay stays the same.
- **Cleishop → Coupons**: a percentage, an amount off the cart or off each item,
  free shipping; minimum and maximum spend, products and categories (and
  exclusions), sale items, emails, expiry, uses in all and per customer,
  individual use. The discount is spread over the lines, before taxes.
- At checkout: the shipping methods of the address, cash on delivery with its
  surcharge (Settings → Cleishop), and the totals with discounts and taxes, in the
  order, its page and its emails.

**The storefront**:

- `/shop` and the archives `/product-category/<slug>` (with its subcategories)
  and `/brand/<slug>`: a grid of products with filters (brand, attributes,
  price, on sale, in stock), sorting and pages, all without JavaScript.
  Cached for visitors and refreshed when products change; filtered pages are
  kept out of search engines.
- Product pages: breadcrumbs, the gallery, related products (the up-sells,
  or best sellers of the category) and structured data (Product, Offer,
  BreadcrumbList).
- Blocks: **Products** (latest, featured, on sale, best sellers or top rated,
  of a category or brand), **Cart link** with the number of items and
  **Product search** (the site's search among products only); the last two
  fit a theme's header area, such as Canvas's **Header (right side)**.
- Blocks **Cart** and **Checkout**: the visitor's cart and the checkout, as
  on `/cart` and `/checkout`, inside any page made with the block editor or
  a page builder such as Fresco. Pages stay cached: the block fills itself
  with the visitor's cart; in the cart, quantities, removals and coupons
  change it in place. Without JavaScript it links the cart or checkout page.
- In the visitor's account: their orders and their details, and the
  addresses that fill in the checkout. A signed-in customer finds their cart
  on another device.

**Payments** (Cleishop → Payments): the ways to pay switched
on, ordered and set up one by one, each with its title, description and
instructions for the order page and the emails:

- direct bank transfer, with one or more bank accounts (the order number is
  the reference; the order waits on hold);
- cash on delivery, with its surcharge, only with some shipping methods if
  you like, and for virtual products or not.

- Stripe (cards, Apple Pay, Google Pay… on Stripe's Checkout page) and
  PayPal: the customer pays on the provider's pages, so card data never
  reaches the site. The order waits as pending and becomes processing when
  the provider confirms, when the customer comes back or through the signed
  webhook. Unpaid orders are cancelled after a while (60 minutes by default)
  and their stock goes back. Refunds from the order give the money back
  through the provider. The secret keys are stored encrypted and never shown
  again.
- Stripe on the site (Cleishop 1.12.0): with the publishable key, customers
  type their card in Stripe's Payment Element right in the checkout (a
  PaymentIntent per order; 3-D Secure comes back to the site), and the Apple
  Pay, Google Pay and Link buttons show at the top of the checkout, in the
  cart and on the product page ("buy now"). The wallet gives the address:
  the shop answers with its own shipping zones, methods and taxes, and places
  the order with the wallet's name, email and addresses. Card data stays in
  Stripe's frames. "Stripe's page" keeps the redirect to Stripe Checkout, and
  without the publishable key (or without JavaScript) customers pay there.
  A button registers the site's domain with Stripe for Apple Pay and serves
  `/.well-known/apple-developer-merchantid-domain-association`. Stripe's
  webhook needs the events `payment_intent.succeeded` and
  `payment_intent.payment_failed` as well.

**How the shop is going** (Cleishop 1.11):

- **Cleishop** opens on the store's overview: revenue and orders of today,
  this week and this month against the period before, the revenue of the last
  30 days, orders to fulfil, products low on stock or sold out, reviews to
  approve and a "Get started" list (first product, payments, shipping, taxes,
  a test email). The products list is at **Cleishop → Products**; its old
  addresses (`/ext/shop?product=…`) still open it.
- **Cleishop → Analytics**: overview, revenue (gross sales, returns, coupons,
  net sales, taxes, shipping, total), orders, products, variations,
  categories, coupons, taxes and stock. Each report has a date range (today,
  last week, month to date, last quarter… or chosen days), the comparison with
  the period before or the same days a year earlier, the change of each
  number, a chart by day, week or month and a table sorted by any column, to
  download as CSV. Orders count when processing, on hold or completed (and
  refunded ones, which their refunds bring back to zero), on the day they
  were paid; pending, failed and cancelled ones never count. A refund counts
  on its own day and is split as its order was (products, taxes, shipping).
  Days are those of the site's time zone (Settings → General).
- **Cleishop → Customers**: people with an account and guests, one row per
  email: last order, number of orders, total spend, average order, country,
  city and sign-up date; search, filters, sorting and CSV. A row opens the
  customer's orders.

**Reviews**: customers rate products from 1 to 5 stars and write a review
on the product page (no JavaScript). Reviews are comments of type `review`
for the core: the comment moderation, spam checks and notifications apply. With the free **Captcha** plugin, the review form and (when you turn it on there) the checkout also get the site's captcha.

With the **NewLetter** plugin active and connected to an email-marketing service, the checkout can offer an unchecked **Subscribe me to the newsletter** box (opt-in only, Cleishop 1.9.0): the customer is subscribed with their email and billing name once the order is placed, only when they tick it.
"Verified owner" marks customers who bought the product; reviews can be kept
to them, and the rating can be optional (Settings → Cleishop). Cleishop → Reviews
lists them for moderation. The average shows on the product page, in the
catalog and in the structured data.

**Languages**: with the Multilingual plugin, a product's translations share
its prices, codes, stock, shipping data, gallery, attributes and variations:
a change in one language reaches the others, and an order in any language
takes from the same stock. Titles, descriptions, categories, purchase notes,
variation descriptions and reviews stay in each language. Duplicating a
product copies its data without the codes.

The texts written in the admin have their translations too, under
"Translations": attribute names and values (shared and a product's own),
shipping methods, tax names, the title, description and instructions of the
ways to pay, and the emails' subject, heading and introduction. Customers
see them in their language; an empty translation shows the text itself, or
the default text in their language.

**Privacy**: with the Privacy plugin, requests to export or erase a
customer's data include their orders and saved addresses. Erasing deletes the
saved addresses and carts and anonymizes orders that never became a sale;
sales are kept for tax and accounting records, without IP address and browser.

**Add-to-cart links** (Cleishop 1.8): a link can put a product in the
visitor's cart, as WooCommerce's `?add-to-cart=` links do, e.g. in a
newsletter, a button or a page imported from WooCommerce:

- `/cart/add?product=<id>&quantity=2` adds the product and opens the cart;
  `&to=product` goes back to the product's page instead. Behind the language
  prefix too (`/it/cart/add?…`). `<id>` is the product's entry id.
- `/cart?add-to-cart=<id>&quantity=2` is read the same way (WooCommerce's
  form, with Cleishop's ids).

A link that changes something can be opened from any site, so it does as
little as it can:

- **Simple products only.** A product with options (variations) goes to its
  page, where the visitor chooses them; nothing is added.
- **At most 10 pieces per link**, with the cart's rules: stock (a product out
  of stock is not added, a larger quantity is lowered to the stock), products
  sold one at a time, published products only.
- **A few links per visitor**: 30 every 10 minutes for each address; then
  "Too many requests" (429).
- **Only a page the visitor opens.** Browsers say what a request is for: a
  picture, a script or a background request from another site, a prefetch,
  a `HEAD`, a search engine or a link preview only get the redirect, and
  nothing is added.
- **Never cached, never indexed** (`Cache-Control: private, no-store`,
  `X-Robots-Tag: noindex, nofollow`), and the only thing that changes is the
  visitor's own cart: no coupons, no checkout, no account. The redirect goes
  to the site's own cart or product page, never to an address in the link.

**For developers** (Cleishop 1.7): the visitor's cart for scripts and page
builders, behind the language prefix too (`/it/cart/data`); never cached.

- `GET /cart/data` (`?html=1` adds the cart page's markup as `html`):
  `{ items: [{ key, productId, variationId, title, attributes, sku, quantity,
soldIndividually, price, regularPrice, onSale, total, image, url,
formatted: { price, total } }], count, currency, pricesIncludeTax,
coupons: [{ code, discount, formatted }], totals: { subtotal, discount,
shipping, fees, tax, total, formatted }, notices, cartUrl, checkoutUrl }`.
  Amounts are numbers in the currency (12.5 is €12.50); `shipping` is null
  until the checkout.
- `POST /cart/item` with `{ key, quantity }` (JSON or a form; 0 removes the
  item) and `POST /cart/item/remove` with `{ key }`: the cart page's rules
  (stock, products sold one at a time, at most 9999), from the site's own
  pages only (the same-origin check of every public form). They answer with
  the cart as above; 404 when the item is not in the cart, 400 for a
  quantity that is not a number.
- `GET /checkout/data`: `{ empty, html, cartUrl, checkoutUrl }`, the
  checkout's markup (the cart's when it is empty). Its form posts to
  `/checkout` as usual.
- `GET /cart/count`: `{ count, label }`.
- Scripts that change the cart (a page builder's mini cart removing an
  item) dispatch `cleishop:cart-changed` on `document` (Cleishop 1.8): the
  `shop/cart` blocks on the page read the cart again.

Other plugins find these addresses, and the names of the blocks, in
Cleishop's read-only API on `globalThis[Symbol.for('cleitext.shop')]`:
`cartUrls(prefix)` and `blocks` (`shop/cart`, `shop/checkout`), beside
`product(siteId, entryId, locale)` and `tags(entryId)`. Since 1.8,
`cartAddUrl(prefix, productId, { quantity, to })` builds an add-to-cart link
('' for an id that is not a product's) and `events.cartChanged` names the
event above.

Requires Cleitext 0.30 or later. License: GPL-2.0-or-later.
