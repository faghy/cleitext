/**
 * AvaTax REST v2: the requests Cleishop needs and what their answers mean.
 * Pure (the HTTP call is given), so the tests run against a fake Avalara and
 * never against the real one.
 *
 * - quotes: CreateTransaction of type SalesOrder (never saved by Avalara);
 * - orders: SalesInvoice committed, VoidTransaction, RefundTransaction (only
 *   when the shop turned «commit» on);
 * - ResolveAddress, Ping, the company and its nexus.
 */

export interface AvaSettings {
  environment: 'production' | 'sandbox';
  companyCode: string;
  origin: AvaAddress;
  /** Tax code of the shipping line (`FR`: freight). */
  shippingTaxCode: string;
  /** Tax code of products without their own (`P0000000`: tangible personal property). */
  defaultTaxCode: string;
}

export interface AvaAddress {
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface AvaCredentials {
  accountId: string;
  licenseKey: string;
}

/** An HTTP call: the plugin gives ctx.http.send, the tests a fake. */
export type Send = (request: {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}) => Promise<{ status: number; text: string }>;

export const BASE = {
  production: 'https://rest.avatax.com/api/v2',
  sandbox: 'https://sandbox-rest.avatax.com/api/v2',
} as const;

/** Avalara's answer was an error: its message, for the log and the admin. */
export class AvaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/** A client of one account and environment. */
export function client(
  send: Send,
  credentials: AvaCredentials,
  environment: AvaSettings['environment'],
  version: string,
) {
  const auth = Buffer.from(`${credentials.accountId}:${credentials.licenseKey}`).toString('base64');
  const call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
    const answer = await send({
      url: `${BASE[environment]}${path}`,
      method,
      headers: {
        authorization: `Basic ${auth}`,
        'content-type': 'application/json',
        accept: 'application/json',
        // Avalara asks every integration to say what it is.
        'x-avalara-client': `Cleitext Cleishop AvaTax; ${version}; REST; v2; cleitext`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      timeoutMs: 15_000,
    });
    let json: unknown;
    try {
      json = answer.text ? JSON.parse(answer.text) : null;
    } catch {
      json = null;
    }
    if (answer.status >= 400) {
      const error = (
        json as {
          error?: { code?: string; message?: string; details?: { message?: string }[] };
        } | null
      )?.error;
      throw new AvaError(
        error?.details?.[0]?.message || error?.message || `Avalara answered ${answer.status}.`,
        answer.status,
        error?.code ?? '',
      );
    }
    return json as T;
  };
  return {
    ping: () =>
      call<{ authenticated?: boolean; authenticatedAccountId?: number; version?: string }>(
        'GET',
        '/utilities/ping',
      ),
    company: async (code: string) => {
      const list = await call<{ value?: { id: number; companyCode: string; name: string }[] }>(
        'GET',
        `/companies?$filter=${encodeURIComponent(`companyCode eq '${code.replace(/'/g, "''")}'`)}`,
      );
      return list.value?.[0] ?? null;
    },
    nexus: async (companyId: number) =>
      (
        await call<{
          value?: { country: string; region: string; jurisName?: string; nexusTypeId?: string }[];
        }>('GET', `/companies/${companyId}/nexus`)
      ).value ?? [],
    create: (model: TransactionModel) =>
      call<TransactionResult>('POST', '/transactions/create', model),
    resolve: (address: AvaAddress) => call<ResolveResult>('POST', '/addresses/resolve', address),
    void: (companyCode: string, code: string) =>
      call<TransactionResult>(
        'POST',
        `/companies/${encodeURIComponent(companyCode)}/transactions/${encodeURIComponent(code)}/void`,
        { code: 'DocVoided' },
      ),
    refund: (companyCode: string, code: string, model: RefundModel) =>
      call<TransactionResult>(
        'POST',
        `/companies/${encodeURIComponent(companyCode)}/transactions/${encodeURIComponent(code)}/refund`,
        model,
      ),
  };
}
export type AvaClient = ReturnType<typeof client>;

export interface TransactionLine {
  number: string;
  quantity: number;
  /** The line's total, in the currency's units (dollars). */
  amount: number;
  taxCode: string;
  itemCode?: string;
  description?: string;
  taxIncluded?: boolean;
}

export interface TransactionModel {
  type: 'SalesOrder' | 'SalesInvoice' | 'ReturnInvoice';
  companyCode: string;
  date: string;
  customerCode: string;
  code?: string;
  commit?: boolean;
  currencyCode: string;
  addresses: { shipFrom: AvaAddress; shipTo: AvaAddress };
  lines: TransactionLine[];
  purchaseOrderNo?: string;
  email?: string;
}

export interface TransactionResult {
  code?: string;
  status?: string;
  totalTax?: number;
  lines?: { lineNumber: string; tax?: number; taxCalculated?: number; details?: unknown[] }[];
  summary?: {
    country?: string;
    region?: string;
    jurisType?: string;
    jurisName?: string;
    taxName?: string;
    rate?: number;
    tax?: number;
    taxCalculated?: number;
  }[];
}

export interface RefundModel {
  refundTransactionCode: string;
  refundDate: string;
  refundType: 'Full' | 'Percentage';
  refundPercentage?: number;
  referenceCode?: string;
}

export interface ResolveResult {
  validatedAddresses?: (AvaAddress & { latitude?: number; longitude?: number })[];
  messages?: { severity?: string; summary?: string; details?: string; refersTo?: string }[];
  resolutionQuality?: string;
}

// ---- Quotes ---------------------------------------------------------------------------------

/** What Cleishop asks (`shop.taxes`, Cleishop 1.16), amounts in cents. */
export interface QuoteRequest {
  stage: 'cart' | 'checkout';
  currency: string;
  pricesIncludeTax: boolean;
  address: {
    line1: string;
    line2: string;
    city: string;
    region: string;
    postcode: string;
    country: string;
  };
  customer: { email: string; userId: string | null } | null;
  lines: {
    key: string;
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    amount: number;
    taxable: boolean;
    taxClass: string;
  }[];
  shipping: { amount: number; method: string } | null;
  fees: { name: string; amount: number }[];
}

export interface QuoteAnswer {
  lines: Record<string, number>;
  shipping: number;
  fees: number[];
  summary: { label: string; rate: number; amount: number }[];
}

const dollars = (cents: number) => Math.round(cents) / 100;
const cents = (value: number | undefined) => Math.round((Number(value) || 0) * 100);
const today = (date = new Date()) => date.toISOString().slice(0, 10);

export function shipTo(address: QuoteRequest['address']): AvaAddress {
  return {
    line1: address.line1.trim(),
    ...(address.line2.trim() ? { line2: address.line2.trim() } : {}),
    city: address.city.trim(),
    region: address.region.trim(),
    postalCode: address.postcode.trim(),
    country: address.country.trim() || 'US',
  };
}

/** The SalesOrder of a cart or a checkout: estimated, never saved by Avalara. */
export function quoteModel(
  request: QuoteRequest,
  settings: AvaSettings,
  now = new Date(),
): TransactionModel {
  const lines: TransactionLine[] = request.lines.map((line, i) => ({
    number: String(i + 1),
    quantity: line.quantity,
    amount: dollars(line.amount),
    // Not taxable in the shop: Avalara's "non-taxable" code.
    taxCode: line.taxable ? settings.defaultTaxCode : 'NT',
    ...(line.sku ? { itemCode: line.sku.slice(0, 50) } : {}),
    description: line.name.slice(0, 255),
    ...(request.pricesIncludeTax ? { taxIncluded: true } : {}),
  }));
  if (request.shipping) {
    lines.push({
      number: 'shipping',
      quantity: 1,
      amount: dollars(request.shipping.amount),
      taxCode: settings.shippingTaxCode,
      description: request.shipping.method.slice(0, 255),
      ...(request.pricesIncludeTax ? { taxIncluded: true } : {}),
    });
  }
  request.fees.forEach((fee, i) =>
    lines.push({
      number: `fee-${i + 1}`,
      quantity: 1,
      amount: dollars(fee.amount),
      taxCode: settings.defaultTaxCode,
      description: fee.name.slice(0, 255),
      ...(request.pricesIncludeTax ? { taxIncluded: true } : {}),
    }),
  );
  return {
    type: 'SalesOrder',
    companyCode: settings.companyCode,
    date: today(now),
    customerCode: (request.customer?.email || 'guest').slice(0, 50),
    currencyCode: request.currency,
    addresses: { shipFrom: settings.origin, shipTo: shipTo(request.address) },
    lines,
  };
}

/** Avalara's answer as Cleishop's taxes: per line, shipping, fees, by jurisdiction. */
export function answerOf(request: QuoteRequest, result: TransactionResult): QuoteAnswer {
  const byNumber = new Map(
    (result.lines ?? []).map((l) => [String(l.lineNumber), cents(l.tax ?? l.taxCalculated)]),
  );
  const lines: Record<string, number> = {};
  request.lines.forEach((line, i) => {
    lines[line.key] = byNumber.get(String(i + 1)) ?? 0;
  });
  return {
    lines,
    shipping: request.shipping ? (byNumber.get('shipping') ?? 0) : 0,
    fees: request.fees.map((_, i) => byNumber.get(`fee-${i + 1}`) ?? 0),
    summary: summaryOf(result),
  };
}

/** The summary by jurisdiction: «NY STATE TAX», «NEW YORK CITY TAX»… */
export function summaryOf(result: TransactionResult): QuoteAnswer['summary'] {
  return (result.summary ?? [])
    .map((s) => ({
      label: (s.taxName || [s.jurisName, s.jurisType].filter(Boolean).join(' ') || 'Tax').slice(
        0,
        100,
      ),
      rate: Math.round((Number(s.rate) || 0) * 100_000) / 1000,
      amount: cents(s.tax ?? s.taxCalculated),
    }))
    .filter((s) => s.amount !== 0);
}

/** Whether ResolveAddress found the address (no error messages, a validated address). */
export function addressProblem(result: ResolveResult): string | null {
  const errors = (result.messages ?? []).filter(
    (m) => (m.severity ?? '').toLowerCase() === 'error',
  );
  if (errors.length)
    return (
      errors
        .map((m) => m.summary || m.details || '')
        .filter(Boolean)
        .join(' ') || 'Address not found.'
    );
  if (!result.validatedAddresses?.length) return 'Address not found.';
  return null;
}

// ---- Orders (only with «commit» on) ----------------------------------------------------------

/** What the plugin needs of a Cleishop order (its `shop` service's `order`). */
export interface OrderInput {
  number: number;
  createdAt: string | Date;
  currency: string;
  email: string;
  customerId?: string | null;
  pricesIncludeTax: boolean;
  shipping: {
    address1: string;
    address2: string;
    city: string;
    province: string;
    postcode: string;
    country: string;
  };
  billing: {
    address1: string;
    address2: string;
    city: string;
    province: string;
    postcode: string;
    country: string;
  };
  shippingTotal: string;
  shippingMethod: string;
  items: { kind: string; name: string; sku: string; quantity: number; total: string }[];
}

/** The SalesInvoice of a paid order, committed: Avalara records it for the returns. */
export function invoiceModel(order: OrderInput, settings: AvaSettings): TransactionModel {
  const to = order.shipping.address1 || order.shipping.postcode ? order.shipping : order.billing;
  const lines: TransactionLine[] = [];
  let n = 0;
  for (const item of order.items) {
    if (item.kind === 'shipping') continue;
    n++;
    lines.push({
      number: item.kind === 'fee' ? `fee-${n}` : String(n),
      quantity: item.quantity,
      amount: Number(item.total) || 0,
      taxCode: settings.defaultTaxCode,
      ...(item.sku ? { itemCode: item.sku.slice(0, 50) } : {}),
      description: item.name.slice(0, 255),
    });
  }
  if (Number(order.shippingTotal) > 0) {
    lines.push({
      number: 'shipping',
      quantity: 1,
      amount: Number(order.shippingTotal),
      taxCode: settings.shippingTaxCode,
      description: (order.shippingMethod || 'Shipping').slice(0, 255),
    });
  }
  return {
    type: 'SalesInvoice',
    companyCode: settings.companyCode,
    date: today(new Date(order.createdAt)),
    customerCode: (order.email || 'guest').slice(0, 50),
    code: String(order.number),
    commit: true,
    currencyCode: order.currency,
    email: order.email,
    addresses: {
      shipFrom: settings.origin,
      shipTo: {
        line1: to.address1,
        ...(to.address2 ? { line2: to.address2 } : {}),
        city: to.city,
        region: to.province,
        postalCode: to.postcode,
        country: to.country || 'US',
      },
    },
    lines,
  };
}

/** A refund: the whole order, or the part refunded as a percentage. */
export function refundModel(
  code: string,
  refundId: string,
  amount: number,
  total: number,
  now = new Date(),
): RefundModel {
  const full = total <= 0 || amount >= total - 0.005;
  return {
    refundTransactionCode: `${code}-R${refundId.slice(0, 8)}`,
    refundDate: today(now),
    refundType: full ? 'Full' : 'Percentage',
    ...(full ? {} : { refundPercentage: Math.round((amount / total) * 10_000) / 100 }),
    referenceCode: code,
  };
}

/** A key of a quote, to answer the same cart again without asking Avalara. */
export function quoteKey(model: TransactionModel): string {
  return JSON.stringify({ ...model, date: '' });
}
