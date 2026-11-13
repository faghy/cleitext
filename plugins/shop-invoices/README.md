# PDF Invoices

A Cleishop add-on (official plugin, free): an invoice in PDF for each order.

- **Automatic**: the invoice is created when an order becomes «Completed» (or the statuses you choose), and attached to Cleishop's emails to the customer.
- **Numbered without gaps**: prefix and suffix (`{year}` is the year, e.g. `FT-{year}/`), the digits, and numbers starting again from 1 every year if you want. Two orders at the same time never get the same number.
- **Your details**: logo, shop name, address, VAT number and a footer (e.g. the bank details). The customer's tax code, VAT number, SDI code and PEC are printed when the order has them.
- **In the order's language** (Italian or English), with each tax rate, discount, shipping and refunds; long orders go on more pages, numbered.
- **Downloads**: customers from their account and order page (a link with the order's private key); the shop from the order in the admin, with the **packing slip** (no prices).
- **A month in one PDF**, for the accountant: Plugins → PDF invoices.
- **From WooCommerce**: orders brought by WooCommerce Import keep the numbers and dates of «PDF Invoices & Packing Slips»; import them and the next invoice continues from the highest number.

Lightweight: the PDF is written by the plugin itself (standard Helvetica fonts, no external library).

Needs Cleitext 0.101 or later and Cleishop 1.14 or later (its extension points `shop.email-attachments` and `shop.order-documents`).
