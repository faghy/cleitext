/**
 * The invoice and the packing slip of an order, drawn on A4 or Letter pages: the
 * shop's logo and details, the addresses, the lines, the totals with the
 * taxes, the Italian tax details when the order has them.
 */
import { strings, type Translate } from '../strings';
import { type PdfDocument, textWidth, wrap } from './writer';

export interface Address {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  postcode?: string;
  province?: string;
  country?: string;
  phone?: string;
}

/** What the documents need of a Cleishop order (its `shop` service's `order`). */
export interface OrderData {
  order: {
    number: number;
    createdAt: string | Date;
    currency: string;
    locale: string;
    email: string;
    billing: Address;
    shipping: Address;
    invoice?: { taxCode?: string; vatNumber?: string; sdiCode?: string; pec?: string } | null;
    paymentTitle?: string;
    shippingMethod?: string;
    subtotal: string;
    discountTotal: string;
    shippingTotal: string;
    shippingTax: string;
    feeTotal: string;
    taxTotal: string;
    total: string;
    taxes: { rate: number; amount: string; label?: string }[];
    customerNote?: string;
  };
  items: {
    kind: string;
    name: string;
    sku?: string;
    quantity: number;
    total: string;
    tax: string;
    attributes?: { name: string; value: string }[];
  }[];
  refunded?: string;
}

export interface ShopIdentity {
  name: string;
  /** One line each: street, city, phone, email, website… */
  address: string;
  /** Under the address, e.g. the VAT number. */
  taxId?: string;
  /** At the bottom of every page. */
  footer?: string;
  /** PNG or JPEG bytes. */
  logo?: Buffer | null;
}

const M = 40;
/** The right margin and the bottom of the text area, for the document's paper. */
const R = (doc: PdfDocument) => doc.width - M;
const B = (doc: PdfDocument) => doc.height - 70;

function addressLines(a: Address, country = true): string[] {
  const name = [a.firstName, a.lastName].filter(Boolean).join(' ');
  const city = [a.postcode, a.city, a.province].filter(Boolean).join(' ');
  return [name, a.company, a.address1, a.address2, city, country ? a.country : '', a.phone].filter(
    (l): l is string => Boolean(l && l.trim()),
  );
}

function money(locale: string, currency: string) {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'EUR' });
  return (value: string | number) => format.format(Number(value) || 0);
}

function dateOf(value: string | Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(value),
  );
}

/** The shop's logo and details, the title, the two columns. Returns where the lines start. */
function header(
  doc: PdfDocument,
  t: Translate,
  shop: ShopIdentity,
  title: string,
  left: string[],
  leftTitle: string,
  right: [string, string][],
): number {
  let y = M;
  if (shop.logo) {
    try {
      doc.image(shop.logo, M, y, 170, 60);
    } catch {
      // A picture this writer cannot read: the name instead.
      doc.text(M, y, shop.name, { size: 16, bold: true });
    }
  } else {
    doc.text(M, y, shop.name, { size: 16, bold: true });
  }
  let ry = y;
  doc.text(R(doc), ry, shop.name, { size: 10, bold: true, align: 'right' });
  ry += 13;
  for (const line of [...shop.address.split(/\r?\n/), shop.taxId ?? ''].filter((l) => l.trim())) {
    doc.text(R(doc), ry, line.trim(), { size: 9, align: 'right', gray: 0.3 });
    ry += 12;
  }
  y = Math.max(ry, M + 64) + 18;
  doc.text(M, y, title, { size: 20, bold: true });
  y += 34;
  // Left: the address; right: numbers and dates.
  let ly = y;
  doc.text(M, ly, leftTitle, { size: 9, bold: true, gray: 0.35 });
  ly += 14;
  for (const line of left) {
    doc.text(M, ly, line, { size: 10 });
    ly += 13;
  }
  let dy = y;
  for (const [label, value] of right) {
    doc.text(330, dy, label, { size: 9, gray: 0.35 });
    doc.text(R(doc), dy, value, { size: 10, align: 'right' });
    dy += 14;
  }
  return Math.max(ly, dy) + 18;
}

/** The lines' table, page after page; returns where it ends. */
function lines(
  doc: PdfDocument,
  t: Translate,
  data: OrderData,
  y: number,
  withPrices: boolean,
  fmt: (v: string | number) => string,
): number {
  const head = (top: number) => {
    doc.box(M, top, R(doc) - M, 20, 0.93);
    doc.text(M + 6, top + 5, t('Product'), { size: 9, bold: true });
    doc.text(withPrices ? 390 : R(doc) - 6, top + 5, t('Quantity'), {
      size: 9,
      bold: true,
      align: 'right',
    });
    if (withPrices) {
      doc.text(470, top + 5, t('Price'), { size: 9, bold: true, align: 'right' });
      doc.text(R(doc) - 6, top + 5, t('Total'), { size: 9, bold: true, align: 'right' });
    }
    return top + 28;
  };
  y = head(y);
  for (const item of data.items.filter((i) => i.kind === 'product')) {
    const nameWidth = (withPrices ? 330 : 440) - M;
    const nameLines = wrap(item.name, nameWidth, 10);
    const extra = [
      item.sku ? `${t('SKU')}: ${item.sku}` : '',
      ...(item.attributes ?? []).map((a) => `${a.name}: ${a.value}`),
    ].filter(Boolean);
    const height = nameLines.length * 13 + extra.length * 11 + 8;
    if (y + height > B(doc)) {
      doc.addPage();
      y = head(M);
    }
    let ly = y;
    for (const line of nameLines) {
      doc.text(M + 6, ly, line, { size: 10 });
      ly += 13;
    }
    for (const line of extra) {
      doc.text(M + 6, ly, line, { size: 8, gray: 0.4 });
      ly += 11;
    }
    doc.text(withPrices ? 390 : R(doc) - 6, y, String(item.quantity), { size: 10, align: 'right' });
    if (withPrices) {
      const unit = (Number(item.total) / Math.max(1, item.quantity)).toFixed(2);
      doc.text(470, y, fmt(unit), { size: 10, align: 'right' });
      doc.text(R(doc) - 6, y, fmt(item.total), { size: 10, align: 'right' });
    }
    y = ly + 4;
    doc.line(M, y, R(doc), y, { gray: 0.88 });
    y += 8;
  }
  return y;
}

/** The totals, right-aligned, with each tax rate. */
function totals(
  doc: PdfDocument,
  t: Translate,
  data: OrderData,
  y: number,
  fmt: (v: string | number) => string,
): number {
  const o = data.order;
  const rows: [string, string, boolean?][] = [[t('Subtotal'), fmt(o.subtotal)]];
  if (Number(o.discountTotal) > 0) rows.push([t('Discount'), `-${fmt(o.discountTotal)}`]);
  if (Number(o.shippingTotal) > 0 || o.shippingMethod)
    rows.push([
      `${t('Shipping')}${o.shippingMethod ? ` (${o.shippingMethod})` : ''}`,
      fmt(o.shippingTotal),
    ]);
  if (Number(o.feeTotal) > 0) rows.push([t('Fees'), fmt(o.feeTotal)]);
  for (const tax of o.taxes) {
    if (Number(tax.amount) === 0) continue;
    // The tax's own name when the order has it (e.g. an imported jurisdiction).
    rows.push([
      tax.label || `${t('Tax')}${tax.rate ? ` ${Number(tax.rate)}%` : ''}`,
      fmt(tax.amount),
    ]);
  }
  if (!o.taxes.length && Number(o.taxTotal) > 0) rows.push([t('Tax'), fmt(o.taxTotal)]);
  rows.push([t('Total'), fmt(o.total), true]);
  if (data.refunded && Number(data.refunded) > 0)
    rows.push([t('Refunded'), `-${fmt(data.refunded)}`]);
  if (y + rows.length * 16 + 10 > B(doc)) {
    doc.addPage();
    y = M;
  }
  for (const [label, value, strong] of rows) {
    if (strong) {
      doc.line(330, y - 4, R(doc), y - 4, { gray: 0.6, width: 0.8 });
    }
    doc.text(470, y, label, { size: strong ? 11 : 10, bold: Boolean(strong), align: 'right' });
    doc.text(R(doc) - 6, y, value, {
      size: strong ? 11 : 10,
      bold: Boolean(strong),
      align: 'right',
    });
    y += strong ? 20 : 16;
  }
  return y;
}

function note(doc: PdfDocument, t: Translate, text: string | undefined, y: number): number {
  if (!text?.trim()) return y;
  const body = wrap(text, R(doc) - M, 9);
  if (y + 20 + body.length * 12 > B(doc)) {
    doc.addPage();
    y = M;
  }
  doc.text(M, y + 8, t('Note'), { size: 9, bold: true, gray: 0.35 });
  y += 22;
  for (const line of body) {
    doc.text(M, y, line, { size: 9 });
    y += 12;
  }
  return y;
}

/** The footer and page numbers, drawn last on every page. */
function footers(doc: PdfDocument, t: Translate, shop: ShopIdentity, pages: number, from: number) {
  for (let p = 0; p < pages; p++) {
    doc.goTo(from + p);
    if (shop.footer) {
      const line = wrap(shop.footer, R(doc) - M, 8)[0] ?? '';
      doc.text(doc.width / 2, doc.height - 42, line, { size: 8, align: 'center', gray: 0.4 });
    }
    if (pages > 1) {
      doc.text(R(doc), doc.height - 30, t('Page {n} of {total}', { n: p + 1, total: pages }), {
        size: 8,
        align: 'right',
        gray: 0.5,
      });
    }
  }
}

/** Draws an invoice into a document (a new page first when it has some already). */
export function drawInvoice(
  doc: PdfDocument,
  data: OrderData,
  shop: ShopIdentity,
  invoice: { number: string; date: Date },
): void {
  const o = data.order;
  const t = strings(o.locale);
  const fmt = money(o.locale, o.currency);
  const from = doc.startDocument();
  const tax = o.invoice;
  const left = [
    ...addressLines(o.billing),
    o.email,
    ...(tax?.taxCode ? [`${t('Tax code')}: ${tax.taxCode}`] : []),
    ...(tax?.vatNumber ? [`${t('VAT number')}: ${tax.vatNumber}`] : []),
    ...(tax?.sdiCode ? [`${t('SDI code')}: ${tax.sdiCode}`] : []),
    ...(tax?.pec ? [`${t('PEC')}: ${tax.pec}`] : []),
  ];
  const right: [string, string][] = [
    [t('Invoice number'), invoice.number],
    [t('Invoice date'), dateOf(invoice.date, o.locale)],
    [t('Order number'), String(o.number)],
    [t('Order date'), dateOf(o.createdAt, o.locale)],
    ...(o.paymentTitle ? ([[t('Payment method'), o.paymentTitle]] as [string, string][]) : []),
  ];
  let y = header(doc, t, shop, t('Invoice'), left, t('Billing address'), right);
  y = lines(doc, t, data, y, true, fmt);
  y = totals(doc, t, data, y + 6, fmt);
  note(doc, t, o.customerNote, y);
  footers(doc, t, shop, doc.pageCount - from, from);
}

/** Draws a packing slip: the shipping address and the lines, without prices. */
export function drawPackingSlip(doc: PdfDocument, data: OrderData, shop: ShopIdentity): void {
  const o = data.order;
  const t = strings(o.locale);
  const fmt = money(o.locale, o.currency);
  const from = doc.startDocument();
  const ship = addressLines(o.shipping).length ? o.shipping : o.billing;
  const right: [string, string][] = [
    [t('Order number'), String(o.number)],
    [t('Order date'), dateOf(o.createdAt, o.locale)],
    ...(o.shippingMethod ? ([[t('Shipping method'), o.shippingMethod]] as [string, string][]) : []),
  ];
  let y = header(
    doc,
    t,
    shop,
    t('Packing slip'),
    [...addressLines(ship), o.email],
    t('Ship to'),
    right,
  );
  y = lines(doc, t, data, y, false, fmt);
  note(doc, t, o.customerNote, y + 6);
  footers(doc, t, shop, doc.pageCount - from, from);
}

// Kept for the width checks of long totals.
export const _width = textWidth;
