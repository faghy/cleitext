# Tandem

_Partners who pedal with you._ Tandem is the same word in Italian, English, German, French and Spanish: you and your affiliates move forward together.

🇮🇹 [Leggi in italiano](./README.it.md)

> **The people who love your site bring you customers.**

The official Cleitext plugin for **your own affiliate program**: people who like your site sign up as affiliates, get a personal link and earn a commission on the sales, bookings or contacts they bring. It is free and not in the base package: install it from **Plugins → Add New** (catalog), or upload `cleitext-plugin-tandem-<version>.zip` in **Plugins → Upload Plugin**. It needs Cleitext 0.89 or later (plugin API 1.58).

## How it works

1. A member of the site applies: from the **Affiliate application** block on a page, or from **Become an affiliate** in their account (`/account/affiliate`). They accept the program terms and may choose their code and give their payment details (PayPal or IBAN).
2. You approve the application (or every application is approved at once, a setting). The affiliate gets an email with their code.
3. In their **affiliate area** (`/account/affiliate`) the affiliate finds their link, `https://your-site/?ref=<code>`, with a copy button, the visits and conversions it brought, the earnings (waiting, to be paid, paid), the payments received and their payment details.
4. A visitor arrives through the link. If they accept the cookies of the chosen category (Marketing by default), the code is kept for 30 days (a setting). When they buy, book or write within that time, the conversion is credited to the affiliate.
5. The commission waits for the refund window (30 days by default), then it is approved. Refunds and cancellations take it back.
6. In **Tandem → Payouts** you see what each affiliate is owed, pay it by PayPal or bank transfer, export it as CSV and mark it as paid: the affiliate gets an email.

## Sources

The free version counts the conversions of **one source**, chosen in the settings:

| Source                | Conversion                                                              | Amount                    |
| --------------------- | ----------------------------------------------------------------------- | ------------------------- |
| **Cleishop** (orders) | an order paid (processing or completed), from 1.10.0                    | the products (net)        |
| **Agenda** (bookings) | a booking confirmed, from 1.2.0; Agenda takes no payments               | 0: use a fixed commission |
| **Store** (licenses)  | a license sold through Lemon Squeezy, or by hand with its price (1.4.0) | the price                 |
| **Forms** (contacts)  | a message sent, from 1.7.0                                              | 0: use a fixed commission |

Conversions that affiliates bring from other sources are not counted: the admin shows how many there were, with the invitation to **Tandem Pro** (every source together, rules per product, recurring commissions, coupons, materials, PayPal payouts).

For Store sales through Lemon Squeezy the visitor's cookie is not on the checkout: pass the code to the checkout as custom data, `checkout[custom][ref_tandem]=<code>`.

## Commissions

- **Percent** of the sale (10% by default): of a Cleishop order's products, without shipping and taxes; of the amount for the other sources. Or a **fixed amount** per conversion, also for contacts and bookings, which have no amount.
- Each affiliate can have their own rate (Affiliates → Edit).
- **Statuses**: waiting → approved (after the refund window) → paid; cancelled when all is refunded before it is paid.
- **Refunds**: a partial refund shrinks the commission in proportion; a refund of a commission already paid becomes a negative adjustment, taken off the next payout.
- **Self-referrals** do not count: an affiliate's own orders (same account or same email).
- **First or last click**: when a visitor used two links, the last one wins (a setting).

## Settings

Tandem → Settings: the source, the approval (by hand or at once), the commission (percent or fixed, currency), the refund window, the payout threshold, the program terms page, the link's parameter (`ref`), the cookie duration, first or last click, the consent category, the emails (each can be turned off) and who receives the applications (empty: the site's administrators).

## Blocks

- **Affiliate application**: the form, with the program terms. Visitors who are not signed in are asked to sign in or create an account first (the site must allow sign-ups: Settings, Membership, "Anyone can register").
- **Affiliate area link**: "Affiliate area: sign in" for visitors, "Your affiliate area" for affiliates.
- **Become an affiliate**: a box inviting visitors to join, with the commission.

## Privacy

- Link tracking follows the visitor's consent: the core sets the cookie `cx_ref_tandem` only after they accept the chosen category in the **Privacy & GDPR** banner (the banner must offer that category). Without consent, or without a banner, nothing is stored and the conversion is not credited. Pages stay cached: the parameter is removed by the page's script, never by the server.
- **Visits** are counted per day and per affiliate: no address, no identifier of the visitor.
- **Data kept**: of affiliates, name, email (of their account), code, website and how they promote, payment details (PayPal email, IBAN), when they accepted the terms, their commissions and payouts; of customers, the email and the label of the conversion credited to an affiliate. Privacy & GDPR exports them, and erases them on request (payouts stay as accounting records, without the payment details). The plugin declares its cookie, so it appears in the cookie policy.
- Activating the plugin asks the administrator's consent: it reads the members' confirmed email addresses (`users:read`), for the emails and the self-referral check.

## Renaming the plugin

The names are in `src/config.ts` and `cleitext.plugin.json` (a test checks that they match): the slug gives the database schema, the blocks, the capability, the cookie and the cache tag.

## Development and tests

```sh
npx pnpm --filter @cleitext/plugin-tandem test   # rules, money, CSV, settings, texts
npx pnpm --filter @cleitext/server exec vitest run test/tandem.test.ts   # with Cleishop and Forms
```
