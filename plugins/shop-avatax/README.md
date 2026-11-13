# AvaTax

A Cleishop add-on (official plugin, free): US sales taxes worked out by **Avalara AvaTax**, as _WooCommerce AvaTax_ does.

- **In the cart and at checkout**: the taxes of the products, the shipping (tax code `FR`) and the fees, for the address, by jurisdiction (state, county, city, special districts) on the receipt, the order, its emails and its PDF invoice. In the cart an estimate from the ZIP code; other countries keep the shop's rates.
- **Addresses checked** at checkout (ResolveAddress): a US address Avalara cannot find is refused with a clear message.
- **Never without taxes**: if Avalara does not answer, the cart says the taxes are missing and the checkout stops; no order is placed with taxes at zero by mistake.
- **Recording orders (commit)**, off by default: when you turn it on (at the go-live), each paid order becomes a committed _SalesInvoice_ in Avalara for your returns, a cancelled one is voided, refunds are recorded (all, or the part refunded). Quotes are _SalesOrders_, which Avalara does not keep. Orders imported from the old shop are never recorded again.
- **Settings**: Plugins → AvaTax. Account number and license key (kept encrypted, never shown again), sandbox or production, company code, where the goods leave from, product and shipping tax codes, countries. «Test the connection» shows the company and its nexus.
- **Log** of the calls, off by default: operation, time, result, the ZIP code or the order number; no names, no addresses, no payment data.

Needs Cleitext 0.101 or later and Cleishop 1.16 or later (its `shop.taxes` service).
