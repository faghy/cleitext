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
import type { OrderItemRow, OrderRow } from './schema';
import type { Translate } from './strings';
import type { Totals } from './totals';

/** The shop's public pages as HTML, shown by Cleitext inside the active theme. */

/** Styles of the shop's pages and buy box: neutral, they take the theme's fonts and colours. */
export const SHOP_CSS = `
.shop-page{--shop-line:rgba(127,127,127,.3);--shop-soft:rgba(127,127,127,.08)}
.shop-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.shop-notice{padding:.75rem 1rem;border-radius:6px;background:var(--shop-soft);border-left:4px solid currentColor;margin:0 0 1.25rem}
.shop-notice--error{border-color:#b42318}
.shop-table{width:100%;border-collapse:collapse;margin:0 0 1.5rem}
.shop-table th,.shop-table td{padding:.6rem .5rem;border-bottom:1px solid var(--shop-line);text-align:left;vertical-align:middle}
.shop-table .num{text-align:right;white-space:nowrap}
.shop-table img{width:64px;height:64px;object-fit:cover;border-radius:4px;display:block}
.shop-table input[type=number]{width:5rem}
.shop-meta{display:block;font-size:.85em;opacity:.8}
.shop-totals{margin-left:auto;max-width:24rem}
.shop-totals th{font-weight:normal}
.shop-totals tr.shop-total th,.shop-totals tr.shop-total td{font-weight:bold;font-size:1.1em}
.shop-actions{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:space-between;align-items:center;margin:1rem 0}
.shop-button{display:inline-block;padding:.7rem 1.4rem;border:0;border-radius:6px;background:#1f2937;color:#fff;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
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

function totalsRows(
  totals: Totals,
  money: Money,
  t: Translate,
  includeTax: boolean,
  shippingLabel: Html | string,
): Html {
  const shippingGross = totals.shippingNet + totals.shippingTax;
  return html` <tr>
      <th scope="row">${t('Subtotal')}</th>
      <td class="num">${money(includeTax ? totals.subtotalGross : totals.subtotalNet)}</td>
    </tr>
    <tr>
      <th scope="row">${t('Shipping')}</th>
      <td class="num">
        ${shippingGross === 0 ? shippingLabel : money(includeTax ? shippingGross : totals.shippingNet)}
      </td>
    </tr>
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
    return Math.round((options.includeTax ? computed.gross : computed.net) / line.quantity);
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
                <td class="num">${money(options.includeTax ? computed.gross : computed.net)}</td>
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
      <table class="shop-table shop-totals">
        <tbody>
          ${totalsRows(totals, money, t, options.includeTax, t('Free'))}
        </tbody>
      </table>
      <p class="shop-actions" style="justify-content:flex-end">
        <a class="shop-button" href="${urls.checkout}">${t('Proceed to checkout')}</a>
      </p>`,
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
  terms: boolean;
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

export interface PaymentOption {
  id: string;
  title: string;
  description: string;
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
}): string {
  const { values, errors, t, money, locale } = options;
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
      ${prefix === 'billing' ? field('billing.phone', t('Phone'), address.phone, { type: 'tel', autocomplete: 'billing tel', required: options.phoneRequired }) : ''}`;

  const summary = html`<div class="shop-box">
    <h2>${t('Your order')}</h2>
    <table class="shop-table">
      <tbody>
        ${options.lines.map((line) => {
          const computed = options.totals.lines.find((l) => l.key === line.key)!;
          return html`<tr>
            <td>${lineName(line)} × ${line.quantity}</td>
            <td class="num">${money(options.includeTax ? computed.gross : computed.net)}</td>
          </tr>`;
        })}
        ${totalsRows(options.totals, money, t, options.includeTax, t('Free'))}
      </tbody>
    </table>
    <fieldset style="border:0;padding:0;margin:0">
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
    <p><button class="shop-button" type="submit" style="width:100%">${t('Place order')}</button></p>
  </div>`;

  return page(
    html` ${options.notice ? html`<p class="shop-notice shop-notice--error" role="alert">${options.notice}</p>` : ''}
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

export function receivedPage(options: {
  order: OrderRow;
  items: OrderItemRow[];
  t: Translate;
  locale: string;
  bank: {
    accountName: string;
    iban: string;
    bic: string;
    bankName: string;
    instructions: string;
  } | null;
}): string {
  const { order, items, t, locale } = options;
  const money = moneyFormatter(locale, order.currency);
  const date = new Date(order.createdAt).toLocaleDateString(locale, { dateStyle: 'long' });
  const gross = (item: OrderItemRow) => Number(item.total) + Number(item.tax);
  const includeTax = order.pricesIncludeTax;
  return page(
    html`<div class="shop-received">
      <p class="shop-notice" role="status">${t('Thank you: we received your order.')}</p>
      <dl>
        <dt>${t('Order number')}</dt>
        <dd>${order.number}</dd>
        <dt>${t('Date')}</dt>
        <dd>${date}</dd>
        <dt>${t('Email')}</dt>
        <dd>${order.email}</dd>
        <dt>${t('Total')}</dt>
        <dd>${money.of(order.total)}</dd>
        <dt>${t('Payment method')}</dt>
        <dd>${order.paymentTitle}</dd>
      </dl>
      ${
        options.bank
          ? html`<div class="shop-box" style="margin:1.5rem 0">
              <h2>${t('Pay by bank transfer to:')}</h2>
              <dl>
                ${
                  options.bank.accountName
                    ? html`<dt>${t('Account holder')}</dt>
                        <dd>${options.bank.accountName}</dd>`
                    : ''
                }
                ${
                  options.bank.bankName
                    ? html`<dt>${t('Bank')}</dt>
                        <dd>${options.bank.bankName}</dd>`
                    : ''
                }
                ${
                  options.bank.iban
                    ? html`<dt>IBAN</dt>
                        <dd><strong>${options.bank.iban}</strong></dd>`
                    : ''
                }
                ${
                  options.bank.bic
                    ? html`<dt>BIC / SWIFT</dt>
                        <dd>${options.bank.bic}</dd>`
                    : ''
                }
                <dt>${t('Reference')}</dt>
                <dd><strong>${t('Order {number}', { number: order.number })}</strong></dd>
              </dl>
              ${options.bank.instructions ? html`<p>${options.bank.instructions}</p>` : html`<p>${t('We ship your order when the payment arrives.')}</p>`}
            </div>`
          : ''
      }
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
                  <td class="num">${money.of(includeTax ? gross(item) : Number(item.total))}</td>
                </tr>`,
            )}
          <tr>
            <th scope="row">${t('Shipping')}</th>
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
