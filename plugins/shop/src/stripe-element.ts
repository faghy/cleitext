import { minorUnits } from './gateways';
import { html } from './html';
import type { Translate } from './strings';

/**
 * Stripe on the site's own pages: the Payment Element in the checkout (and
 * on the page to pay an order again) and the express buttons (Apple Pay,
 * Google Pay, Link) in the checkout, the cart and the product page. Card
 * data is typed in Stripe's frames (stripe.js from js.stripe.com) and never
 * reaches the site; the site only creates the PaymentIntent and confirms it
 * when Stripe says it is paid. The script is `public/stripe-pay.ts`.
 */

/** The script of the public folder that draws Stripe's elements. */
export const STRIPE_SCRIPT = 'stripe-pay.js';

/** Totals are in cents; Stripe wants the currency's smallest unit. */
export const minorOfCents = (cents: number, currency: string): number =>
  minorUnits(cents / 100, currency);

/** Stripe's languages for its elements; others follow the browser. */
export const stripeLocale = (locale: string): string => {
  const code = locale.slice(0, 2).toLowerCase();
  return ['it', 'en', 'fr', 'de', 'es', 'nl', 'pt', 'pl', 'sv', 'da', 'fi', 'nb'].includes(code)
    ? code
    : 'auto';
};

/** What the Payment Element needs on the page (no secret but the payment's own). */
export interface ElementConfig {
  key: string;
  locale: string;
  currency: string;
  /** In the currency's smallest unit. */
  amount: number;
  /** The order's PaymentIntent, on the page to pay an order again. */
  clientSecret?: string;
  /** Where Stripe sends the customer back (3-D Secure, some wallets). */
  returnUrl?: string;
}

const scriptTag = (src: string) => html`<script src="${src}" defer></script>`;

/** The Payment Element's place (under "Credit or debit card"), filled by the script. */
export function stripeElement(config: ElementConfig, script: string, t: Translate): string {
  return html`<div
      class="shop-stripe"
      data-shop-stripe="${JSON.stringify({
        ...config,
        texts: {
          failed: t('The payment was not completed: you can try again.'),
          error: t('The payment could not start: try again in a moment.'),
        },
      })}"
      hidden
    >
      <div class="shop-stripe__element"></div>
      <p class="shop-error" role="alert" data-shop-stripe-error></p>
    </div>
    ${scriptTag(script)}`.value;
}

/**
 * The express buttons' place: the script asks `url` for the keys and the
 * amount (`?place=…&product=…`), and shows them when the browser has a wallet.
 */
export function expressElement(
  options: { url: string; place: 'checkout' | 'cart' | 'product'; product?: string },
  script: string,
  t: Translate,
): string {
  return html`<div
      class="shop-express shop-express--${options.place}"
      data-shop-express="${JSON.stringify(options)}"
      hidden
    >
      <div class="shop-express__buttons"></div>
      <p class="shop-error" role="alert" data-shop-express-error></p>
      ${
        options.place === 'checkout'
          ? html`<p class="shop-express__or"><span>${t('Or pay below')}</span></p>`
          : ''
      }
    </div>
    ${scriptTag(script)}`.value;
}
