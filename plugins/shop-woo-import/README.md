# WooCommerce Import

A Cleishop add-on (official plugin, free): moves a WooCommerce shop's **customers** and **orders** into Cleishop.

1. **Export from WordPress.** Download the script from **Tools → Import from WooCommerce** (it is also in `exporter/cleitext-woo-export.php`) and run it with WP-CLI in the WordPress folder: `wp eval-file cleitext-woo-export.php > woocommerce-export.json`. It reads through WooCommerce's own functions, so it works with the classic tables and with HPOS, and changes nothing.
2. **Choose the export** on the same page: it is read in the browser and sent in batches.
3. **Customers**: those with a paid order, those with an order, or all; optionally only confirmed emails. Accounts are created **without a password** (each customer chooses one with «Forgot your password?»), as site members, in their language; their billing and shipping addresses fill Cleishop's checkout. Site staff (administrators, shop managers) are left out.
4. **Orders**: each with the number customers know (`_order_number` of sequential-number plugins), status, lines (linked to the Cleishop product with the same SKU), taxes, coupons, fees, shipping, notes and refunds, payment method and transaction id; data such as PayPal ids, AvaTax and invoice numbers are kept with the order. Failed orders (often card tests by bots) can be left out.

The export also holds the lists of YITH WooCommerce Wishlist, for the Wishlist add-on.

No email is sent, no stock moves, no payment service is called. Importing again adds only what is new.

**Link the lines again** (1.2, with Cleishop 1.15): for orders already imported, lines without a product are linked to the products found now (by SKU, else by slug), e.g. after importing more products. Totals, stock and emails do not change. Products, categories and pages come with the WordPress Importer: import them first.

Needs Cleitext 0.100 or later and Cleishop 1.13 or later (its `shop` service, plugin API 1.73).
