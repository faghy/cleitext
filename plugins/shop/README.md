# Shop

Official Cleitext plugin for selling from your site. It takes the product
management of Cleito, built for shop managers who update hundreds of
products, and the catalog features of WooCommerce.

**Milestone 1, the catalog** (this version):

- Products are Cleitext entries of type `product` (blocks for the description,
  revisions, translations, SEO, search), at `/product/<slug>`. Their commercial
  data lives in the plugin's tables.
- Product categories (a tree, with an image) and brands (logo, website) are
  taxonomies, with archives at `/product-category/<slug>` and `/brand/<slug>`.
- **Shop → Products**:
  - filters that stack: category with its subcategories, then the brands present
    there with their counts, status, stock, condition, on sale;
  - rows coloured by status;
  - price and stock changed by clicking on them;
  - a quick look (images, prices, stock);
  - duplicate, trash and publish on many products at once;
  - CSV export and import, with WooCommerce's columns.
- **The product form**, on one page or step by step (Settings → Shop):
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

**Milestone 2, buying**:

- a buy box on product pages (price, availability, variation, quantity);
- the cart at `/cart`, in a cookie;
- the checkout at `/checkout`:
  - addresses with Italian provinces and postcodes;
  - invoice details (codice fiscale, partita IVA, SDI or PEC);
  - terms and the right of withdrawal;
  - bank transfer;
- the order, with its stock taken safely, and its page with the bank details.

**Milestone 3, orders** (Shop → Orders and Shop emails):

- orders by status, found by number, email or name;
- the order with its products, addresses, invoice details and history;
- status changes that give the stock back or take it again;
- notes, private or emailed to the customer;
- full or partial refunds that put products back in stock;
- printing, and sending emails again;
- WooCommerce's emails, HTML and text:
  - to the shop: new, cancelled and failed orders;
  - to the customer: order received with the bank details, processing, completed, refunded, notes.

  Their texts can be changed, with a preview.

**Milestone 4, shipping, taxes and coupons**:

- **Shop → Shipping**: zones of countries, provinces and postcodes (`20*`,
  `00118...00199`), the first matching one from the top, and "Everywhere
  else"; each with its methods:
  - flat rate, with a formula (`3 + 1.5 * [qty]`) and costs per shipping class;
  - free shipping, over an amount, with a coupon, either or both;
  - local pickup, with where and when;
  - by weight, in bands (the last one open or not).

  Without any method, orders ship for free. A tester shows the rates of an
  address.

- **Shop → Taxes**: rates by class (standard, reduced, second reduced,
  super-reduced, zero), country and province, the Italian ones in one click.
  The shipping address chooses them; with prices entered with taxes, what
  customers pay stays the same.
- **Shop → Coupons**: a percentage, an amount off the cart or off each item,
  free shipping; minimum and maximum spend, products and categories (and
  exclusions), sale items, emails, expiry, uses in all and per customer,
  individual use. The discount is spread over the lines, before taxes.
- At checkout: the shipping methods of the address, cash on delivery with its
  surcharge (Settings → Shop), and the totals with discounts and taxes, in the
  order, its page and its emails.

**Milestone 5, the storefront**:

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

Next: Stripe and PayPal, reviews.

License: GPL-2.0-or-later.
