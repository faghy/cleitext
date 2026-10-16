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

Next: cart and checkout, orders and emails, shipping, taxes and coupons,
the storefront, Stripe and PayPal.

License: GPL-2.0-or-later.
