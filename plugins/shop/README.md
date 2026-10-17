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
  - CSV export and import, with the usual column names of e-commerce platforms.
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
  of a category or brand) and **Cart link** with the number of items.
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

**Reviews**: customers rate products from 1 to 5 stars and write a review
on the product page (no JavaScript). Reviews are comments of type `review`
for the core: the comment moderation, spam checks and notifications apply.
"Verified owner" marks customers who bought the product; reviews can be kept
to them, and the rating can be optional (Settings → Cleishop). Cleishop → Reviews
lists them for moderation. The average shows on the product page, in the
catalog and in the structured data.

**Languages**: with the Multilingual plugin, a product's translations share
its prices, codes, stock, shipping data, gallery, attributes and variations:
a change in one language reaches the others, and an order in any language
takes from the same stock. Titles, descriptions, categories, purchase notes,
variation descriptions and reviews stay in each language. Duplicating a
product copies its data without the codes. Attribute names and values are
shared, not translated.

**Privacy**: with the Privacy plugin, requests to export or erase a
customer's data include their orders and saved addresses. Erasing deletes the
saved addresses and carts and anonymizes orders that never became a sale;
sales are kept for tax and accounting records, without IP address and browser.

Requires Cleitext 0.30 or later. License: GPL-2.0-or-later.
