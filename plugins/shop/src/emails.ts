import type { PaymentInstructions } from './pages';
import type { PluginContext } from '@cleitext/plugin-sdk';
import { z } from 'zod';
import { addressLines } from './address';
import { escape } from './html';
import type { OrderDetail } from './order-admin';
import type { OrderItemRow } from './schema';
import { translator } from './strings';
import { localize, textsSchema } from './texts';

/**
 * The shop's emails (WooCommerce's set): to the shop when an order arrives,
 * is cancelled or fails; to the customer when it is received, processed,
 * completed, refunded, or gets a note. Subject, heading and introduction can
 * be changed in Shop → Emails (empty: the default, in the order's language).
 */

export const EMAIL_IDS = [
  'new_order',
  'cancelled_order',
  'failed_order',
  'customer_on_hold',
  'customer_processing',
  'customer_completed',
  'customer_refunded',
  'customer_note',
] as const;
export type EmailId = (typeof EMAIL_IDS)[number];

interface Texts {
  subject: string;
  heading: string;
  intro: string;
}

/** Recipient, title in the admin, and the default texts in English and Italian. */
export const EMAILS: Record<
  EmailId,
  { to: 'shop' | 'customer'; title: { en: string; it: string }; en: Texts; it: Texts }
> = {
  new_order: {
    to: 'shop',
    title: { en: 'New order', it: 'Nuovo ordine' },
    en: {
      subject: '[{site}] New order #{number}',
      heading: 'New order: #{number}',
      intro: 'You have received an order from {name}.',
    },
    it: {
      subject: '[{site}] Nuovo ordine #{number}',
      heading: 'Nuovo ordine: #{number}',
      intro: 'Hai ricevuto un ordine da {name}.',
    },
  },
  cancelled_order: {
    to: 'shop',
    title: { en: 'Cancelled order', it: 'Ordine annullato' },
    en: {
      subject: '[{site}] Order #{number} cancelled',
      heading: 'Order cancelled: #{number}',
      intro: 'The order #{number} from {name} was cancelled.',
    },
    it: {
      subject: '[{site}] Ordine #{number} annullato',
      heading: 'Ordine annullato: #{number}',
      intro: 'L’ordine #{number} di {name} è stato annullato.',
    },
  },
  failed_order: {
    to: 'shop',
    title: { en: 'Failed order', it: 'Ordine non riuscito' },
    en: {
      subject: '[{site}] Order #{number} failed',
      heading: 'Order failed: #{number}',
      intro: 'The payment of order #{number} from {name} failed.',
    },
    it: {
      subject: '[{site}] Ordine #{number} non riuscito',
      heading: 'Ordine non riuscito: #{number}',
      intro: 'Il pagamento dell’ordine #{number} di {name} non è riuscito.',
    },
  },
  customer_on_hold: {
    to: 'customer',
    title: { en: 'Order received', it: 'Ordine ricevuto' },
    en: {
      subject: 'Your {site} order has been received',
      heading: 'Thank you for your order',
      intro:
        'Hi {name}, we have received your order #{number}. It is on hold until we confirm the payment.',
    },
    it: {
      subject: 'Abbiamo ricevuto il tuo ordine su {site}',
      heading: 'Grazie per il tuo ordine',
      intro:
        'Ciao {name}, abbiamo ricevuto il tuo ordine #{number}. Resta in attesa finché non confermiamo il pagamento.',
    },
  },
  customer_processing: {
    to: 'customer',
    title: { en: 'Processing order', it: 'Ordine in lavorazione' },
    en: {
      subject: 'Your {site} order #{number} is being processed',
      heading: 'We are preparing your order',
      intro: 'Hi {name}, we received the payment of order #{number} and we are preparing it.',
    },
    it: {
      subject: 'Il tuo ordine #{number} su {site} è in lavorazione',
      heading: 'Stiamo preparando il tuo ordine',
      intro:
        'Ciao {name}, abbiamo ricevuto il pagamento dell’ordine #{number} e lo stiamo preparando.',
    },
  },
  customer_completed: {
    to: 'customer',
    title: { en: 'Completed order', it: 'Ordine completato' },
    en: {
      subject: 'Your {site} order #{number} is complete',
      heading: 'Your order is on its way',
      intro: 'Hi {name}, your order #{number} is complete. Thank you for shopping with us.',
    },
    it: {
      subject: 'Il tuo ordine #{number} su {site} è completato',
      heading: 'Il tuo ordine è in arrivo',
      intro:
        'Ciao {name}, il tuo ordine #{number} è completato. Grazie per aver acquistato da noi.',
    },
  },
  customer_refunded: {
    to: 'customer',
    title: { en: 'Refunded order', it: 'Ordine rimborsato' },
    en: {
      subject: 'Your {site} order #{number} has been refunded',
      heading: 'Refund of order #{number}',
      intro: 'Hi {name}, we refunded {amount} of your order #{number}.',
    },
    it: {
      subject: 'Il tuo ordine #{number} su {site} è stato rimborsato',
      heading: 'Rimborso dell’ordine #{number}',
      intro: 'Ciao {name}, ti abbiamo rimborsato {amount} dell’ordine #{number}.',
    },
  },
  customer_note: {
    to: 'customer',
    title: { en: 'Note to the customer', it: 'Nota al cliente' },
    en: {
      subject: 'A note about your {site} order #{number}',
      heading: 'A note about your order',
      intro: 'Hi {name}, there is a note about your order #{number}:',
    },
    it: {
      subject: 'Una nota sul tuo ordine #{number} su {site}',
      heading: 'Una nota sul tuo ordine',
      intro: 'Ciao {name}, c’è una nota sul tuo ordine #{number}:',
    },
  },
};

export const emailSettingsSchema = z.partialRecord(
  z.enum(EMAIL_IDS),
  z.object({
    enabled: z.boolean().default(true),
    subject: z.string().trim().max(200).default(''),
    heading: z.string().trim().max(200).default(''),
    intro: z.string().trim().max(2000).default(''),
    /** Subject, heading and introduction in other languages: `{ it: { subject } }`. */
    translations: textsSchema,
  }),
);
export type EmailSettings = z.output<typeof emailSettingsSchema>;
export const EMAILS_STORAGE = 'emails';

export interface EmailContext {
  siteName: string;
  /** e.g. https://example.com */
  origin: string;
  /** Prefix of the order's language in addresses: '' or `/it`. */
  prefix: string;
  /** How to pay: bank details while a transfer is awaited, the method's instructions. */
  payment: PaymentInstructions | null;
  /** The note (customer_note) or the refunded amount (customer_refunded). */
  note?: string;
  amount?: string;
  /** Address of the order in the admin, for the shop's emails. */
  adminUrl: string;
}

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k]! : m));

/** The message of an email for an order, in its language, as HTML and text. */
export function renderEmail(
  id: EmailId,
  detail: OrderDetail,
  context: EmailContext,
  custom: EmailSettings[EmailId] | undefined,
): { subject: string; html: string; text: string } {
  const { order, items } = detail;
  const locale = order.locale;
  const t = translator(locale);
  const defaults = locale.startsWith('it') ? EMAILS[id].it : EMAILS[id].en;
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: order.currency });
  const amount = (value: string | number) => money.format(Number(value));
  const name = `${order.billing.firstName} ${order.billing.lastName}`.trim() || order.email;
  const values = {
    site: context.siteName,
    number: String(order.number),
    name,
    amount: context.amount ? amount(context.amount) : '',
  };
  // The order's language: its own texts, then the shop's, then the defaults in that language.
  const own = localize(
    { subject: custom?.subject ?? '', heading: custom?.heading ?? '', intro: custom?.intro ?? '' },
    custom?.translations,
    locale,
  );
  const subject = fill(own.subject || defaults.subject, values);
  const heading = fill(own.heading || defaults.heading, values);
  const intro = fill(own.intro || defaults.intro, values);
  const shopEmail = EMAILS[id].to === 'shop';
  const includeTax = order.pricesIncludeTax;
  const gross = (item: OrderItemRow) => Number(item.total) + (includeTax ? Number(item.tax) : 0);
  /** A line as listed, before its discount (orders before coupons have the same amounts). */
  const listed = (item: OrderItemRow) =>
    item.subtotal === item.total
      ? gross(item)
      : Number(item.subtotal) + (includeTax ? Number(item.subtotalTax) : 0);
  const date = new Date(order.createdAt).toLocaleDateString(locale, { dateStyle: 'long' });
  const products = items.filter((i) => i.kind === 'product');
  const shipping = Number(order.shippingTotal) + (includeTax ? Number(order.shippingTax) : 0);
  const orderUrl = `${context.origin}${context.prefix}/order-received/${order.number}?key=${order.key}`;
  const link = shopEmail ? context.adminUrl : orderUrl;
  const linkLabel = shopEmail ? t('Open the order') : t('View your order');

  // ---- HTML (inline styles: email clients ignore stylesheets) ----------------------
  const cell =
    'padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top';
  const num = `${cell};text-align:right;white-space:nowrap`;
  const rows = products
    .map((item) => {
      const attrs = item.attributes.map((a) => `${escape(a.name)}: ${escape(a.value)}`).join(' · ');
      return `<tr><td style="${cell}">${escape(item.name)}${attrs ? `<br><small style="color:#6b7280">${attrs}</small>` : ''}${item.sku ? `<br><small style="color:#6b7280">${escape(item.sku)}</small>` : ''}</td><td style="${num}">× ${item.quantity}</td><td style="${num}">${escape(amount(listed(item)))}</td></tr>`;
    })
    .join('');
  const totals: [string, string][] = [
    ...order.coupons.map((coupon): [string, string] => [
      t('Coupon: {code}', { code: coupon.code }),
      `−${amount(coupon.discount)}`,
    ]),
    [
      order.shippingMethod ? `${t('Shipping')} (${order.shippingMethod})` : t('Shipping'),
      shipping === 0 ? t('Free') : amount(shipping),
    ],
    ...items
      .filter((i) => i.kind === 'fee')
      .map((fee): [string, string] => [fee.name, amount(gross(fee))]),
    ...(includeTax
      ? []
      : order.taxes.map((tax): [string, string] => [
          t('Tax ({rate}%)', { rate: tax.rate }),
          amount(tax.amount),
        ])),
    [t('Total'), amount(order.total)],
    ...(includeTax
      ? order.taxes.map((tax): [string, string] => [
          t('Taxes included ({rate}%)', { rate: tax.rate }),
          amount(tax.amount),
        ])
      : []),
    [t('Payment method'), order.paymentTitle],
  ];
  const totalRows = totals
    .map(
      ([label, value]) =>
        `<tr><th colspan="2" style="${cell};font-weight:${label === t('Total') ? '700' : '400'}">${escape(label)}</th><td style="${num};font-weight:${label === t('Total') ? '700' : '400'}">${escape(value)}</td></tr>`,
    )
    .join('');
  const address = (lines: string[]) => lines.map(escape).join('<br>');
  const invoice = order.invoice
    ? ([
        order.invoice.taxCode && `${t('Tax code (codice fiscale)')}: ${order.invoice.taxCode}`,
        order.invoice.vatNumber && `${t('VAT number (partita IVA)')}: ${order.invoice.vatNumber}`,
        order.invoice.sdi && `${t('Recipient code (SDI)')}: ${order.invoice.sdi}`,
        order.invoice.pec && `${t('PEC')}: ${order.invoice.pec}`,
      ].filter(Boolean) as string[])
    : [];
  const box = (inner: string) =>
    `<div style="margin:20px 0;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb">${inner}</div>`;
  const pay = context.payment && !shopEmail ? context.payment : null;
  const accounts = (pay?.accounts ?? []).filter((a) => a.iban || a.accountName);
  const accountLines = accounts.map(
    (a) =>
      [
        a.accountName && `${t('Account holder')}: ${a.accountName}`,
        a.bankName && `${t('Bank')}: ${a.bankName}`,
        a.iban && `IBAN: ${a.iban}`,
        a.bic && `BIC / SWIFT: ${a.bic}`,
      ].filter(Boolean) as string[],
  );
  const reference = `${t('Reference')}: ${t('Order {number}', { number: order.number })}`;
  const bank =
    pay && (accounts.length || pay.instructions)
      ? box(
          (accounts.length
            ? `<p style="margin:0 0 8px;font-weight:700">${escape(t('Pay by bank transfer to:'))}</p>` +
              accountLines
                .map(
                  (lines) =>
                    `<div style="margin:0 0 8px">${lines.map((l) => `<div>${escape(l)}</div>`).join('')}</div>`,
                )
                .join('') +
              `<div>${escape(reference)}</div>`
            : '') +
            (pay.instructions
              ? `<p style="margin:${accounts.length ? '8px' : '0'} 0 0">${escape(pay.instructions)}</p>`
              : ''),
        )
      : '';
  const noteBox = context.note ? box(escape(context.note).replace(/\n/g, '<br>')) : '';
  const html = `<!doctype html><html lang="${escape(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<div style="max-width:600px;margin:0 auto;padding:24px 12px">
<div style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
<div style="background:#111827;color:#fff;padding:18px 24px;font-size:18px;font-weight:700">${escape(context.siteName)}</div>
<div style="padding:24px">
<h1 style="margin:0 0 12px;font-size:22px">${escape(heading)}</h1>
<p style="margin:0 0 12px;line-height:1.5">${escape(intro).replace(/\n/g, '<br>')}</p>
${noteBox}${bank}
<h2 style="font-size:16px;margin:24px 0 8px">${escape(t('Order {number}', { number: order.number }))} · ${escape(date)}</h2>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">${rows}${totalRows}</table>
${order.customerNote ? box(`<strong>${escape(t('Customer note'))}</strong><br>${escape(order.customerNote)}`) : ''}
<table role="presentation" style="width:100%;margin-top:20px;font-size:14px"><tr>
<td style="vertical-align:top;padding-right:10px"><strong>${escape(t('Billing address'))}</strong><br>${address(addressLines(order.billing, locale))}<br>${escape(order.billing.phone)}<br>${escape(order.email)}${invoice.length ? `<br>${invoice.map(escape).join('<br>')}` : ''}</td>
<td style="vertical-align:top"><strong>${escape(t('Shipping address'))}</strong><br>${address(addressLines(order.shipping, locale))}</td>
</tr></table>
<p style="margin:24px 0 0"><a href="${escape(link)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">${escape(linkLabel)}</a></p>
</div></div>
<p style="text-align:center;color:#6b7280;font-size:12px;margin:16px 0 0">${escape(context.siteName)} · <a href="${escape(context.origin)}" style="color:#6b7280">${escape(context.origin.replace(/^https?:\/\//, ''))}</a></p>
</div></body></html>`;

  // ---- Text --------------------------------------------------------------------------
  const lines = [
    heading,
    '',
    intro,
    ...(context.note ? ['', context.note] : []),
    ...(accounts.length
      ? ['', t('Pay by bank transfer to:'), ...accountLines.flatMap((l) => [...l, '']), reference]
      : []),
    ...(pay?.instructions ? ['', pay.instructions] : []),
    '',
    `${t('Order {number}', { number: order.number })} · ${date}`,
    ...products.map(
      (item) =>
        `- ${item.name}${item.attributes.length ? ` (${item.attributes.map((a) => `${a.name}: ${a.value}`).join(', ')})` : ''} × ${item.quantity}: ${amount(listed(item))}`,
    ),
    ...totals.map(([label, value]) => `${label}: ${value}`),
    '',
    `${t('Billing address')}:`,
    ...addressLines(order.billing, locale),
    order.email,
    '',
    `${t('Shipping address')}:`,
    ...addressLines(order.shipping, locale),
    '',
    `${linkLabel}: ${link}`,
  ];
  return { subject, html, text: lines.join('\n') };
}

/** Which email a change of status sends, if any (WooCommerce's rules). */
export function emailsForStatus(from: string, to: string): EmailId[] {
  const result: EmailId[] = [];
  if (to === 'processing' && ['pending', 'on-hold', 'failed'].includes(from))
    result.push('customer_processing');
  if (to === 'on-hold' && ['pending', 'failed', 'cancelled'].includes(from))
    result.push('customer_on_hold');
  if (to === 'completed') result.push('customer_completed');
  if (to === 'cancelled' && ['processing', 'on-hold', 'pending'].includes(from))
    result.push('cancelled_order');
  if (to === 'failed' && ['pending', 'on-hold'].includes(from)) result.push('failed_order');
  return result;
}

/** Sends an email of an order, unless turned off; returns whether it was sent. */
export async function sendOrderEmail(
  ctx: PluginContext,
  siteId: string,
  id: EmailId,
  detail: OrderDetail,
  context: EmailContext,
  recipients: { shop: string[] },
): Promise<boolean> {
  const stored = emailSettingsSchema.safeParse(
    (await ctx.storage.get(siteId, EMAILS_STORAGE)) ?? {},
  );
  const custom = stored.success ? stored.data[id] : undefined;
  if (custom && custom.enabled === false) return false;
  const to = EMAILS[id].to === 'shop' ? recipients.shop : [detail.order.email];
  if (to.length === 0) return false;
  const message = renderEmail(id, detail, context, custom);
  for (const address of to) {
    await ctx.mail.send({
      to: address,
      subject: message.subject,
      text: message.text,
      html: message.html,
      siteId,
      ...(EMAILS[id].to === 'shop' ? { replyTo: detail.order.email } : {}),
    });
  }
  return true;
}
