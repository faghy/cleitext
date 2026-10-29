import {
  addressLines,
  COUNTRIES,
  countryName,
  IT_PROVINCES,
  type Address,
  type Invoice,
} from './address';
import type { CartLine } from './cart';
import { html, raw, type Html } from './html';
import type { BankAccount } from './payments';
import type { OrderItemRow, OrderRow } from './schema';
import type { Translate } from './strings';
import type { Totals } from './totals';

/** The shop's public pages as HTML, shown by Cleitext inside the active theme. */

/** Styles of the shop's pages and buy box: neutral, they take the theme's fonts and colours. */
export const SHOP_CSS = `
.shop-page,.shop-buy,.shop-cart-link{--shop-line:rgba(127,127,127,.3);--shop-soft:rgba(127,127,127,.08);--shop-accent-bg:var(--shop-accent,var(--cx-accent,#1f2937));--shop-accent-fg:var(--shop-on-accent,var(--cx-on-accent,#fff))}
.shop-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.shop-notice{padding:.75rem 1rem;border-radius:6px;background:var(--shop-soft);border-left:4px solid currentColor;margin:0 0 1.25rem}
.shop-notice--error{border-color:#b42318}
.shop-table{width:100%;border-collapse:collapse;margin:0 0 1.5rem}
.shop-table th,.shop-table td{padding:.6rem .5rem;border-bottom:1px solid var(--shop-line);text-align:left;vertical-align:middle}
.shop-table .num{text-align:right;white-space:nowrap}
.shop-table img{width:64px;height:64px;object-fit:cover;border-radius:4px;display:block}
.shop-table input[type=number]{width:5rem;font:inherit;padding:.4rem .5rem;border:1px solid var(--shop-line);border-radius:6px;background:transparent;color:inherit}
.shop-meta{display:block;font-size:.85em;opacity:.8}
.shop-totals{margin-left:auto;max-width:24rem}
.shop-totals th{font-weight:normal}
.shop-totals tr.shop-total th,.shop-totals tr.shop-total td{font-weight:bold;font-size:1.1em}
.shop-actions{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:space-between;align-items:center;margin:1rem 0}
.shop-button{display:inline-block;padding:.7rem 1.4rem;border:0;border-radius:6px;background:var(--shop-accent-bg,#1f2937);color:var(--shop-accent-fg,#fff);font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
.shop-button:hover{filter:brightness(1.15)}
.shop-button--secondary{background:transparent;color:inherit;border:1px solid var(--shop-line)}
.shop-link{background:none;border:0;padding:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer}
.shop-checkout{display:grid;gap:2rem}
@media(min-width:900px){.shop-checkout{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}}
.shop-fields{display:grid;gap:.9rem 1rem;grid-template-columns:repeat(2,minmax(0,1fr))}
.shop-field{display:flex;flex-direction:column;gap:.3rem;margin:0}
.shop-field--wide{grid-column:1/-1}
.shop-field label{font-weight:600;font-size:.95em}
.shop-field input,.shop-field select,.shop-field textarea{font:inherit;padding:.55rem .65rem;border:1px solid var(--shop-line);border-radius:6px;background:transparent;color:inherit;width:100%;box-sizing:border-box}
.shop-field select option{color:#111;background:#fff}
.shop-field [aria-invalid=true]{border-color:#b42318}
.shop-error{color:#b42318;font-size:.85em}
.shop-check{display:flex;gap:.5rem;align-items:flex-start;margin:.75rem 0}
.shop-box{border:1px solid var(--shop-line);border-radius:8px;padding:1.25rem;background:var(--shop-soft)}
.shop-box h2{margin-top:0;font-size:1.2em}
details.shop-more{margin:1rem 0}
details.shop-more summary{cursor:pointer;font-weight:600}
.shop-pay{border:1px solid var(--shop-line);border-radius:6px;padding:.75rem;margin:.5rem 0}
.shop-pay p{margin:.4rem 0 0 1.6rem;font-size:.9em}
.shop-fieldset{border:0;padding:0;margin:0 0 1rem}
.shop-inline{display:inline;margin-left:.5rem}
.shop-coupon-form{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 1.5rem}
.shop-coupon-form input{font:inherit;padding:.55rem .65rem;border:1px solid var(--shop-line);border-radius:6px;background:transparent;color:inherit}
.shop-received dl{display:grid;grid-template-columns:max-content 1fr;gap:.35rem 1rem}
.shop-received dt{font-weight:600}
.shop-addresses{display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.shop-buy{margin:1.5rem 0;padding:1.25rem;border:1px solid rgba(127,127,127,.3);border-radius:8px}
.shop-buy__price{font-size:1.5em;font-weight:700;margin:0 0 .5rem}
.shop-buy__price del{opacity:.6;font-weight:400;font-size:.75em}
.shop-buy__price ins{text-decoration:none}
.shop-badge{display:inline-block;font-size:.55em;vertical-align:middle;padding:.15rem .5rem;border-radius:999px;background:#b42318;color:#fff}
.shop-buy__stock{margin:0 0 1rem;font-weight:600}
.shop-stock--instock{color:#067647}.shop-stock--low,.shop-stock--onbackorder{color:#b54708}.shop-stock--outofstock{color:#b42318}
.shop-buy__form .shop-field{margin:0 0 .75rem;max-width:20rem}
.shop-buy__actions{display:flex;gap:.6rem;align-items:center;margin:0}
.shop-buy__actions input{width:5rem;font:inherit;padding:.6rem;border:1px solid rgba(127,127,127,.4);border-radius:6px;background:transparent;color:inherit}
.shop-stripe{margin:.75rem 0 0}.shop-stripe .shop-error:empty,.shop-express .shop-error:empty{display:none}
.shop-express{margin:0 0 1.5rem}.shop-express--cart{max-width:24rem;margin:1rem 0 0 auto}.shop-express--product{margin:.75rem 0 0;max-width:24rem}
.shop-express__or{display:flex;align-items:center;gap:.75rem;margin:1rem 0 0;font-size:.9em;opacity:.8}
.shop-express__or::before,.shop-express__or::after{content:"";flex:1;border-top:1px solid var(--shop-line)}
`;

export interface PageUrls {
  cart: string;
  checkout: string;
  /** A product's page. */
  product: (line: CartLine) => string;
  shop: string;
}

export interface Money {
  (cents: number): string;
  of(value: string | number): string;
}

export function moneyFormatter(locale: string, currency: string): Money {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const fn = ((cents: number) => format.format(cents / 100)) as Money;
  fn.of = (value) => format.format(Number(value));
  return fn;
}

function page(content: Html): string {
  return html`<style>
      ${raw(SHOP_CSS)}
    </style>
    <div class="shop-page">${content}</div>`.value;
}

export interface CouponView {
  code: string;
  /** Cents off, as prices are entered. */
  discount: number;
}

function totalsRows(
  totals: Totals,
  money: Money,
  t: Translate,
  includeTax: boolean,
  options: {
    /** What the shipping row says when it costs nothing; null: no row (nothing to ship). */
    shipping: Html | string | null;
    coupons: CouponView[];
    /** The cart's address for the coupons' remove buttons. */
    removeCoupon?: string;
  },
): Html {
  const shippingGross = totals.shippingNet + totals.shippingTax;
  return html` <tr>
      <th scope="row">${t('Subtotal')}</th>
      <td class="num">${money(includeTax ? totals.subtotalGross : totals.subtotalNet)}</td>
    </tr>
    ${options.coupons.map(
      (coupon) =>
        html`<tr class="shop-coupon">
          <th scope="row">
            ${t('Coupon: {code}', { code: coupon.code })}
            ${
              options.removeCoupon
                ? html`<form method="post" action="${options.removeCoupon}" class="shop-inline">
                    <input type="hidden" name="remove" value="${coupon.code}" />
                    <button class="shop-link" type="submit">
                      ${t('Remove')}<span class="shop-sr"> ${coupon.code}</span>
                    </button>
                  </form>`
                : ''
            }
          </th>
          <td class="num">−${money(coupon.discount)}</td>
        </tr>`,
    )}
    ${
      options.shipping === null
        ? ''
        : html`<tr>
            <th scope="row">${t('Shipping')}</th>
            <td class="num">
              ${shippingGross === 0 ? options.shipping : money(includeTax ? shippingGross : totals.shippingNet)}
            </td>
          </tr>`
    }
    ${totals.fees.map(
      (fee) =>
        html`<tr>
          <th scope="row">${fee.name}</th>
          <td class="num">${money(includeTax ? fee.net + fee.tax : fee.net)}</td>
        </tr>`,
    )}
    ${
      includeTax
        ? ''
        : totals.taxes.map(
            (tax) =>
              html`<tr>
                <th scope="row">${t('Tax ({rate}%)', { rate: tax.rate })}</th>
                <td class="num">${money(tax.amount)}</td>
              </tr>`,
          )
    }
    <tr class="shop-total">
      <th scope="row">${t('Total')}</th>
      <td class="num">${money(totals.total)}</td>
    </tr>
    ${
      includeTax
        ? totals.taxes.map(
            (tax) =>
              html`<tr>
                <th scope="row">
                  <small>${t('Taxes included ({rate}%)', { rate: tax.rate })}</small>
                </th>
                <td class="num"><small>${money(tax.amount)}</small></td>
              </tr>`,
          )
        : ''
    }`;
}

const lineName = (line: CartLine) =>
  html`${line.title}${line.attributes.length ? html`<span class="shop-meta">${line.attributes.map((a) => `${a.name}: ${a.value}`).join(' · ')}</span>` : ''}${line.sku ? html`<span class="shop-meta">${line.sku}</span>` : ''}`;

export function cartPage(options: {
  lines: CartLine[];
  totals: Totals;
  t: Translate;
  money: Money;
  urls: PageUrls;
  includeTax: boolean;
  notices: { kind: 'ok' | 'error'; text: string }[];
  coupons: CouponView[];
  needsShipping: boolean;
  /** The express buttons (Apple Pay, Google Pay, Link), when the shop shows them here. */
  express?: string;
}): string {
  const { lines, totals, t, money, urls } = options;
  const notices = options.notices.map(
    (n) =>
      html`<p
        class="shop-notice${n.kind === 'error' ? ' shop-notice--error' : ''}"
        role="${n.kind === 'error' ? 'alert' : 'status'}"
      >
        ${n.text}
      </p>`,
  );
  if (lines.length === 0) {
    return page(
      html`${notices}
        <p>${t('Your cart is empty.')}</p>
        <p>
          <a class="shop-button shop-button--secondary" href="${urls.shop}"
            >${t('Continue shopping')}</a
          >
        </p>`,
    );
  }
  const unit = (line: CartLine) => {
    const computed = totals.lines.find((l) => l.key === line.key)!;
    return Math.round(
      (options.includeTax ? computed.subtotalGross : computed.subtotalNet) / line.quantity,
    );
  };
  return page(
    html`${notices}
      <form method="post" action="${urls.cart}/update">
        <table class="shop-table">
          <thead>
            <tr>
              <th scope="col"><span class="shop-sr">${t('Product')}</span></th>
              <th scope="col">${t('Product')}</th>
              <th scope="col" class="num">${t('Price')}</th>
              <th scope="col">${t('Quantity')}</th>
              <th scope="col" class="num">${t('Total')}</th>
              <th scope="col"><span class="shop-sr">${t('Remove')}</span></th>
            </tr>
          </thead>
          <tbody>
            ${lines.map((line) => {
              const computed = totals.lines.find((l) => l.key === line.key)!;
              return html`<tr>
                <td>
                  ${line.imageUrl ? html`<img src="${line.imageUrl}" alt="" loading="lazy" />` : ''}
                </td>
                <td><a href="${urls.product(line)}">${lineName(line)}</a></td>
                <td class="num">${money(unit(line))}</td>
                <td>
                  ${line.soldIndividually ? html`1<input type="hidden" name="qty_${line.key}" value="1" />` : html`<label class="shop-sr" for="qty-${line.key}">${t('Quantity')}</label><input id="qty-${line.key}" type="number" name="qty_${line.key}" value="${line.quantity}" min="0" max="9999" inputmode="numeric" />`}
                </td>
                <td class="num">
                  ${money(options.includeTax ? computed.subtotalGross : computed.subtotalNet)}
                </td>
                <td>
                  <button class="shop-link" type="submit" name="remove" value="${line.key}">
                    ${t('Remove')}<span class="shop-sr"> ${line.title}</span>
                  </button>
                </td>
              </tr>`;
            })}
          </tbody>
        </table>
        <div class="shop-actions">
          <a href="${urls.shop}">${t('Continue shopping')}</a>
          <button class="shop-button shop-button--secondary" type="submit">
            ${t('Update cart')}
          </button>
        </div>
      </form>
      <form method="post" action="${urls.cart}/coupon" class="shop-coupon-form">
        <label class="shop-sr" for="shop-coupon">${t('Coupon code')}</label>
        <input
          id="shop-coupon"
          name="code"
          type="text"
          maxlength="60"
          placeholder="${t('Coupon code')}"
          autocomplete="off"
        />
        <button class="shop-button shop-button--secondary" type="submit">
          ${t('Apply coupon')}
        </button>
      </form>
      <table class="shop-table shop-totals">
        <tbody>
          ${totalsRows(totals, money, t, options.includeTax, {
            shipping: options.needsShipping ? t('Calculated at checkout') : null,
            coupons: options.coupons,
            removeCoupon: `${urls.cart}/coupon`,
          })}
        </tbody>
      </table>
      <p class="shop-actions" style="justify-content:flex-end">
        <a class="shop-button" href="${urls.checkout}">${t('Proceed to checkout')}</a>
      </p>
      ${options.express ? raw(options.express) : ''}`,
  );
}

export interface CheckoutValues {
  email: string;
  billing: Address;
  shipping: Address;
  differentShipping: boolean;
  wantsInvoice: boolean;
  invoice: Invoice;
  note: string;
  payment: string;
  /** The shipping rate chosen. */
  rate: string;
  terms: boolean;
  /** "Subscribe me to the newsletter" ticked (the NewLetter plugin's opt-in). */
  newsletter?: boolean;
}

export const emptyAddress = (country = 'IT'): Address => ({
  firstName: '',
  lastName: '',
  company: '',
  address1: '',
  address2: '',
  city: '',
  postcode: '',
  province: '',
  country,
  phone: '',
});

export interface RateOption {
  id: string;
  title: string;
  /** Cents as shown (with or without taxes, like the prices). */
  cost: number;
  note?: string;
}

export interface PaymentOption {
  id: string;
  title: string;
  description: string;
}

/** Fields of the checkout's forms (and of the account's addresses), with their errors. */
export function formParts({
  t,
  errors,
  locale,
  phoneRequired,
}: {
  t: Translate;
  errors: Record<string, string>;
  locale: string;
  phoneRequired: boolean;
}) {
  const countries = [...COUNTRIES]
    .map((code) => ({ code, name: countryName(code, locale) }))
    .sort((a, b) =>
      a.code === 'IT' ? -1 : b.code === 'IT' ? 1 : a.name.localeCompare(b.name, locale),
    );
  const field = (
    name: string,
    label: string,
    value: string,
    attrs: {
      type?: string;
      autocomplete?: string;
      wide?: boolean;
      required?: boolean;
      list?: string;
      inputmode?: string;
    } = {},
  ) => {
    const id = `shop-${name.replace(/[^a-z0-9]+/gi, '-')}`;
    const error = errors[name];
    return html`<p class="shop-field${attrs.wide ? ' shop-field--wide' : ''}">
      <label for="${id}"
        >${label}${attrs.required ? html` <abbr title="${t('Required')}">*</abbr>` : ''}</label
      >
      <input
        id="${id}"
        name="${name}"
        type="${attrs.type ?? 'text'}"
        value="${value}"
        ${attrs.autocomplete ? raw(` autocomplete="${attrs.autocomplete}"`) : ''}${attrs.list ? raw(` list="${attrs.list}"`) : ''}${attrs.inputmode ? raw(` inputmode="${attrs.inputmode}"`) : ''}${attrs.required ? raw(' required') : ''}${error ? raw(` aria-invalid="true" aria-describedby="${id}-error"`) : ''}
      />
      ${error ? html`<span class="shop-error" id="${id}-error">${t(error)}</span>` : ''}
    </p>`;
  };
  const addressFields = (prefix: 'billing' | 'shipping', address: Address, autocomplete: string) =>
    html` ${field(`${prefix}.firstName`, t('First name'), address.firstName, { autocomplete: `${autocomplete} given-name`, required: true })}
      ${field(`${prefix}.lastName`, t('Last name'), address.lastName, { autocomplete: `${autocomplete} family-name`, required: true })}
      ${field(`${prefix}.company`, t('Company (optional)'), address.company, { autocomplete: `${autocomplete} organization`, wide: true })}
      <p class="shop-field shop-field--wide">
        <label for="shop-${prefix}-country"
          >${t('Country')} <abbr title="${t('Required')}">*</abbr></label
        >
        <select
          id="shop-${prefix}-country"
          name="${prefix}.country"
          autocomplete="${autocomplete} country"
          required
        >
          ${countries.map((c) => html`<option value="${c.code}" ${c.code === address.country ? raw(' selected') : ''}>${c.name}</option>`)}
        </select>
        ${errors[`${prefix}.country`] ? html`<span class="shop-error">${t(errors[`${prefix}.country`]!)}</span>` : ''}
      </p>
      ${field(`${prefix}.address1`, t('Address'), address.address1, { autocomplete: `${autocomplete} address-line1`, wide: true, required: true })}
      ${field(`${prefix}.address2`, t('Apartment, suite… (optional)'), address.address2, { autocomplete: `${autocomplete} address-line2`, wide: true })}
      ${field(`${prefix}.postcode`, t('Postcode'), address.postcode, { autocomplete: `${autocomplete} postal-code`, required: true, inputmode: 'numeric' })}
      ${field(`${prefix}.city`, t('City'), address.city, { autocomplete: `${autocomplete} address-level2`, required: true })}
      ${field(`${prefix}.province`, t('Province / state'), address.province, { autocomplete: `${autocomplete} address-level1`, list: 'shop-provinces' })}
      ${prefix === 'billing' ? field('billing.phone', t('Phone'), address.phone, { type: 'tel', autocomplete: 'billing tel', required: phoneRequired }) : ''}`;

  return { field, addressFields };
}

export function checkoutPage(options: {
  values: CheckoutValues;
  errors: Record<string, string>;
  lines: CartLine[];
  totals: Totals;
  t: Translate;
  money: Money;
  urls: PageUrls;
  locale: string;
  includeTax: boolean;
  payments: PaymentOption[];
  termsUrl: string;
  phoneRequired: boolean;
  notice?: string;
  coupons: CouponView[];
  needsShipping: boolean;
  shippingSetUp: boolean;
  rates: RateOption[];
  /** The rate in the totals. */
  rate: string | null;
  /** Visitors not signed in: where to sign in and come back. */
  loginUrl?: string;
  /** The site's bot protection (`ctx.forms.challenge`, plugin API 1.38). */
  challenge?: string;
  /** The NewLetter plugin's opt-in box, when it offers one: unchecked unless ticked before. */
  newsletter?: { name: string; label: string } | null;
  /** Stripe on the page: the Payment Element under the card, the express buttons on top. */
  stripe?: { element: string; express: string };
}): string {
  const { values, errors, t, money, locale } = options;
  const { field, addressFields } = formParts({
    t,
    errors,
    locale,
    phoneRequired: options.phoneRequired,
  });

  const summary = html`<div class="shop-box">
    <h2>${t('Your order')}</h2>
    <table class="shop-table">
      <tbody>
        ${options.lines.map((line) => {
          const computed = options.totals.lines.find((l) => l.key === line.key)!;
          return html`<tr>
            <td>${lineName(line)} × ${line.quantity}</td>
            <td class="num">
              ${money(options.includeTax ? computed.subtotalGross : computed.subtotalNet)}
            </td>
          </tr>`;
        })}
        ${totalsRows(options.totals, money, t, options.includeTax, {
          shipping: options.needsShipping ? t('Free') : null,
          coupons: options.coupons,
        })}
      </tbody>
    </table>
    ${
      options.shippingSetUp
        ? html`<fieldset class="shop-fieldset">
            <legend><strong>${t('Shipping')}</strong></legend>
            ${
              options.rates.length
                ? options.rates.map(
                    (rate) =>
                      html`<div class="shop-pay">
                        <label class="shop-check" style="margin:0"
                          ><input
                            type="radio"
                            name="rate"
                            value="${rate.id}"
                            ${rate.id === options.rate ? raw(' checked') : ''}
                            required
                          />
                          <span
                            >${rate.title}:
                            <strong>${rate.cost === 0 ? t('Free') : money(rate.cost)}</strong></span
                          ></label
                        >${rate.note ? html`<p>${rate.note}</p>` : ''}
                      </div>`,
                  )
                : html`<p class="shop-error">
                    ${t('We do not ship to this address: check it, or write to us.')}
                  </p>`
            }
            ${errors.rate ? html`<span class="shop-error">${t(errors.rate)}</span>` : ''}
            <p>
              <button
                class="shop-button shop-button--secondary"
                type="submit"
                name="refresh"
                value="1"
              >
                ${t('Update shipping and totals')}
              </button>
            </p>
          </fieldset>`
        : ''
    }
    <fieldset class="shop-fieldset">
      <legend><strong>${t('Payment')}</strong></legend>
      ${options.payments.map(
        (p) =>
          html`<div class="shop-pay">
            <label class="shop-check" style="margin:0"
              ><input
                type="radio"
                name="payment"
                value="${p.id}"
                ${values.payment === p.id || options.payments.length === 1 ? raw(' checked') : ''}
                required
              />
              ${p.title}</label
            >${p.description ? html`<p>${p.description}</p>` : ''}
            ${p.id === 'stripe' && options.stripe?.element ? raw(options.stripe.element) : ''}
          </div>`,
      )}
      ${errors.payment ? html`<span class="shop-error">${t(errors.payment)}</span>` : ''}
    </fieldset>
    <p class="shop-meta">
      ${t('You can withdraw from the purchase within 14 days of receiving the goods.')}
    </p>
    ${
      options.termsUrl
        ? html`<label class="shop-check"
              ><input
                type="checkbox"
                name="terms"
                value="1"
                ${values.terms ? raw(' checked') : ''}
                required${errors.terms ? raw(' aria-invalid="true"') : ''}
              />
              <span
                >${raw(t('I have read and accept the {terms}.', { terms: html`<a href="${options.termsUrl}" target="_blank" rel="noopener">${t('terms and conditions')}</a>`.value }))}</span
              ></label
            >
            ${errors.terms ? html`<span class="shop-error">${t(errors.terms)}</span>` : ''}`
        : ''
    }
    ${
      options.newsletter
        ? html`<label class="shop-check"
            ><input
              type="checkbox"
              name="${options.newsletter.name}"
              value="1"
              ${values.newsletter ? raw(' checked') : ''}
            />
            <span>${options.newsletter.label}</span></label
          >`
        : ''
    }
    ${options.challenge ? raw(`<div class="shop-challenge">${options.challenge}</div>`) : ''}
    <p><button class="shop-button" type="submit" style="width:100%">${t('Place order')}</button></p>
  </div>`;

  return page(
    html` ${options.notice ? html`<p class="shop-notice shop-notice--error" role="alert">${options.notice}</p>` : ''}
      ${options.loginUrl ? html`<p class="shop-notice">${t('Returning customer?')} <a href="${options.loginUrl}">${t('Sign in')}</a></p>` : ''}
      ${options.stripe?.express ? raw(options.stripe.express) : ''}
      <form method="post" action="${options.urls.checkout}" novalidate>
        <datalist id="shop-provinces">
          ${Object.entries(IT_PROVINCES).map(([code, name]) => html`<option value="${code}">${name}</option>`)}
        </datalist>
        <div class="shop-checkout">
          <div>
            <h2>${t('Billing details')}</h2>
            <div class="shop-fields">
              ${field('email', t('Email'), values.email, { type: 'email', autocomplete: 'email', wide: true, required: true })}
              ${addressFields('billing', values.billing, 'billing')}
            </div>
            <details class="shop-more" ${values.wantsInvoice ? raw(' open') : ''}>
              <summary>${t('I need an invoice')}</summary>
              <input type="hidden" name="wantsInvoice" value="1" />
              <div class="shop-fields" style="margin-top:.75rem">
                ${field('invoice.taxCode', t('Tax code (codice fiscale)'), values.invoice.taxCode)}
                ${field('invoice.vatNumber', t('VAT number (partita IVA)'), values.invoice.vatNumber)}
                ${field('invoice.sdi', t('Recipient code (SDI)'), values.invoice.sdi)}
                ${field('invoice.pec', t('PEC'), values.invoice.pec, { type: 'email' })}
              </div>
            </details>
            <details class="shop-more" ${values.differentShipping ? raw(' open') : ''}>
              <summary>${t('Ship to a different address')}</summary>
              <label class="shop-check"
                ><input
                  type="checkbox"
                  name="differentShipping"
                  value="1"
                  ${values.differentShipping ? raw(' checked') : ''}
                />
                ${t('Ship to a different address')}</label
              >
              <div class="shop-fields">
                ${addressFields('shipping', values.shipping, 'shipping')}
              </div>
            </details>
            <p class="shop-field shop-field--wide">
              <label for="shop-note">${t('Notes about your order (optional)')}</label>
              <textarea id="shop-note" name="note" rows="3" maxlength="2000">
${values.note}</textarea>
            </p>
          </div>
          <div>${summary}</div>
        </div>
      </form>`,
  );
}

export interface PaymentInstructions {
  method: string;
  instructions: string;
  /** Bank transfers: where to send the money. */
  accounts: BankAccount[];
}

/** Bank details and instructions of an order's way to pay. */
export function paymentBox(
  t: Translate,
  number: number,
  payment: PaymentInstructions,
): Html | string {
  const accounts = payment.accounts.filter((a) => a.iban || a.accountName);
  if (!accounts.length && !payment.instructions && payment.method !== 'bacs') return '';
  return html`<div class="shop-box" style="margin:1.5rem 0">
    ${
      accounts.length
        ? html`<h2>${t('Pay by bank transfer to:')}</h2>
            ${accounts.map(
              (a) =>
                html`<dl>
                  ${
                    a.accountName
                      ? html`<dt>${t('Account holder')}</dt>
                          <dd>${a.accountName}</dd>`
                      : ''
                  }
                  ${
                    a.bankName
                      ? html`<dt>${t('Bank')}</dt>
                          <dd>${a.bankName}</dd>`
                      : ''
                  }
                  ${
                    a.iban
                      ? html`<dt>IBAN</dt>
                          <dd><strong>${a.iban}</strong></dd>`
                      : ''
                  }
                  ${
                    a.bic
                      ? html`<dt>BIC / SWIFT</dt>
                          <dd>${a.bic}</dd>`
                      : ''
                  }
                </dl>`,
            )}
            <dl>
              <dt>${t('Reference')}</dt>
              <dd><strong>${t('Order {number}', { number })}</strong></dd>
            </dl>`
        : ''
    }
    ${
      payment.instructions
        ? html`<p>${payment.instructions}</p>`
        : payment.method === 'bacs'
          ? html`<p>${t('We ship your order when the payment arrives.')}</p>`
          : ''
    }
  </div>`;
}

/** An order's status as customers read it. */
export function statusLabel(t: Translate, status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    pending: 'Pending payment',
    processing: 'Processing',
    'on-hold': 'On hold',
    completed: 'Completed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
    failed: 'Failed',
  };
  return t(labels[status] ?? status);
}

export function receivedPage(options: {
  order: OrderRow;
  items: OrderItemRow[];
  t: Translate;
  locale: string;
  /** In the account: no thanks, the status instead, and a way back. */
  account?: { back: string };
  /** Online payments not confirmed yet: where to pay. */
  unpaid?: { payUrl: string };
  /** What the customer does to pay: bank accounts while a transfer is awaited, instructions. */
  payment: PaymentInstructions | null;
}): string {
  const { order, items, t, locale } = options;
  const money = moneyFormatter(locale, order.currency);
  const date = new Date(order.createdAt).toLocaleDateString(locale, { dateStyle: 'long' });
  const gross = (item: OrderItemRow) => Number(item.total) + Number(item.tax);
  const listed = (item: OrderItemRow) =>
    item.subtotal === item.total
      ? includeTax
        ? gross(item)
        : Number(item.total)
      : Number(item.subtotal) + (includeTax ? Number(item.subtotalTax) : 0);
  const includeTax = order.pricesIncludeTax;
  return page(
    html`<div class="shop-received">
      ${
        options.account
          ? html`<p><a href="${options.account.back}">← ${t('Your orders')}</a></p>`
          : html`<p class="shop-notice" role="status">
              ${t('Thank you: we received your order.')}
            </p>`
      }
      ${
        options.unpaid
          ? html`<div class="shop-notice shop-notice--error" role="alert">
              <p style="margin:0 0 .5rem">
                ${t('Your payment has not been confirmed yet. If you did not complete it, you can pay now.')}
              </p>
              <a class="shop-button" href="${options.unpaid.payUrl}">${t('Pay now')}</a>
            </div>`
          : ''
      }
      <dl>
        <dt>${t('Order number')}</dt>
        <dd>${order.number}</dd>
        <dt>${t('Date')}</dt>
        <dd>${date}</dd>
        ${
          options.account
            ? html`<dt>${t('Status')}</dt>
                <dd>${statusLabel(t, order.status)}</dd>`
            : ''
        }
        <dt>${t('Email')}</dt>
        <dd>${order.email}</dd>
        <dt>${t('Total')}</dt>
        <dd>${money.of(order.total)}</dd>
        <dt>${t('Payment method')}</dt>
        <dd>${order.paymentTitle}</dd>
      </dl>
      ${options.payment ? paymentBox(t, order.number, options.payment) : ''}
      <h2>${t('Your order')}</h2>
      <table class="shop-table">
        <tbody>
          ${items
            .filter((i) => i.kind === 'product')
            .map(
              (item) =>
                html`<tr>
                  <td>
                    ${item.name}${item.attributes.length ? html`<span class="shop-meta">${item.attributes.map((a) => `${a.name}: ${a.value}`).join(' · ')}</span>` : ''}
                    × ${item.quantity}
                  </td>
                  <td class="num">${money.of(listed(item))}</td>
                </tr>`,
            )}
          ${order.coupons.map(
            (coupon) =>
              html`<tr>
                <th scope="row">${t('Coupon: {code}', { code: coupon.code })}</th>
                <td class="num">−${money.of(coupon.discount)}</td>
              </tr>`,
          )}
          <tr>
            <th scope="row">
              ${t('Shipping')}${order.shippingMethod ? html`<span class="shop-meta">${order.shippingMethod}</span>` : ''}
            </th>
            <td class="num">
              ${Number(order.shippingTotal) + Number(order.shippingTax) === 0 ? t('Free') : money.of(Number(order.shippingTotal) + (includeTax ? Number(order.shippingTax) : 0))}
            </td>
          </tr>
          ${items
            .filter((i) => i.kind === 'fee')
            .map(
              (fee) =>
                html`<tr>
                  <th scope="row">${fee.name}</th>
                  <td class="num">${money.of(includeTax ? gross(fee) : Number(fee.total))}</td>
                </tr>`,
            )}
          ${
            includeTax
              ? ''
              : order.taxes.map(
                  (tax) =>
                    html`<tr>
                      <th scope="row">${t('Tax ({rate}%)', { rate: tax.rate })}</th>
                      <td class="num">${money.of(tax.amount)}</td>
                    </tr>`,
                )
          }
          <tr class="shop-total">
            <th scope="row">${t('Total')}</th>
            <td class="num">${money.of(order.total)}</td>
          </tr>
          ${
            includeTax
              ? order.taxes.map(
                  (tax) =>
                    html`<tr>
                      <th scope="row">
                        <small>${t('Taxes included ({rate}%)', { rate: tax.rate })}</small>
                      </th>
                      <td class="num"><small>${money.of(tax.amount)}</small></td>
                    </tr>`,
                )
              : ''
          }
        </tbody>
      </table>
      <div class="shop-addresses">
        <div>
          <h3>${t('Billing address')}</h3>
          <p>
            ${addressLines(order.billing, locale).map((l) => html`${l}<br />`)}${order.billing.phone}
          </p>
        </div>
        <div>
          <h3>${t('Shipping address')}</h3>
          <p>${addressLines(order.shipping, locale).map((l) => html`${l}<br />`)}</p>
        </div>
      </div>
    </div>`,
  );
}
