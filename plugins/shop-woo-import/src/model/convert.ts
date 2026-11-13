/**
 * From the export of exporter/cleitext-woo-export.php to what Cleishop's
 * `shop` service takes. Pure functions, tested on their own.
 */

export interface WooAddress {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  postcode?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
}

export interface WooCustomer {
  id: number;
  email: string;
  username?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  roles?: string[];
  locale?: string;
  emailVerified?: boolean;
  payingCustomer?: boolean;
  orders?: number;
  paidOrders?: number;
  /** Failed orders among `orders` (often card tests by bots); exports before 1.1 lack it. */
  failedOrders?: number;
  newsletter?: boolean;
  billing?: WooAddress;
  shipping?: WooAddress;
}

export interface WooItem {
  type: 'line_item' | 'shipping' | 'fee';
  name: string;
  quantity?: number;
  total?: string;
  tax?: string;
  subtotal?: string;
  subtotalTax?: string;
  productId?: number;
  sku?: string;
  productSlug?: string;
  attributes?: { name: string; value: string }[];
}

export interface WooOrder {
  id: number;
  number?: string;
  status: string;
  currency: string;
  pricesIncludeTax?: boolean;
  createdAt: string;
  paidAt?: string | null;
  completedAt?: string | null;
  customerId?: number;
  email?: string;
  billing?: WooAddress;
  shipping?: WooAddress;
  paymentMethod?: string;
  paymentTitle?: string;
  transactionId?: string;
  customerNote?: string;
  language?: string;
  totals: Record<string, string>;
  items: WooItem[];
  taxes?: { label?: string; rate?: number; amount?: string }[];
  coupons?: { code: string; discount: string }[];
  notes?: { content: string; customer?: boolean; author?: string; date?: string | null }[];
  refunds?: { amount: string; reason?: string; date?: string | null }[];
  meta?: Record<string, unknown>;
}

export interface WooExport {
  format: 'cleitext-woo-export';
  version: number;
  site?: string;
  currency?: string;
  customers: WooCustomer[];
  orders: WooOrder[];
}

/** Whether a parsed file is an export of the script. */
export function isWooExport(value: unknown): value is WooExport {
  const v = value as Partial<WooExport> | null;
  return (
    Boolean(v) &&
    v!.format === 'cleitext-woo-export' &&
    Array.isArray(v!.customers) &&
    Array.isArray(v!.orders)
  );
}

export interface Address {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  postcode: string;
  province: string;
  country: string;
  phone: string;
}

/** A WooCommerce address as Cleishop's; null when it is empty. */
export function toAddress(a: WooAddress | undefined): Address | null {
  if (!a) return null;
  const out: Address = {
    firstName: a.first_name ?? '',
    lastName: a.last_name ?? '',
    company: a.company ?? '',
    address1: a.address_1 ?? '',
    address2: a.address_2 ?? '',
    city: a.city ?? '',
    postcode: a.postcode ?? '',
    province: a.state ?? '',
    country: a.country ?? '',
    phone: a.phone ?? '',
  };
  return Object.values(out).some((v) => v.trim() !== '') ? out : null;
}

/** WooCommerce statuses as Cleishop's; drafts and others are not imported. */
export const STATUSES: Record<string, string> = {
  pending: 'pending',
  'on-hold': 'on-hold',
  processing: 'processing',
  completed: 'completed',
  cancelled: 'cancelled',
  refunded: 'refunded',
  failed: 'failed',
};

export type CustomerChoice = 'paid' | 'orders' | 'all';

/** The customers to import: all, those with orders, or those with a paid order. */
export function pickCustomers(
  customers: WooCustomer[],
  options: { which: CustomerChoice; verifiedOnly: boolean; skipFailed?: boolean },
): WooCustomer[] {
  return customers.filter((c) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email ?? '')) return false;
    if (options.verifiedOnly && !c.emailVerified) return false;
    // Site staff are not shop customers.
    if ((c.roles ?? []).some((r) => r === 'administrator' || r === 'shop_manager')) return false;
    if (options.which === 'paid') return (c.paidOrders ?? 0) > 0 || Boolean(c.payingCustomer);
    // Failed orders do not make a customer when they are left out (bots' card tests).
    const orders = (c.orders ?? 0) - (options.skipFailed !== false ? (c.failedOrders ?? 0) : 0);
    if (options.which === 'orders') return orders > 0;
    return true;
  });
}

/** The two-letter language of a WordPress locale (`it_IT` → `it`). */
export function languageOf(locale: string | undefined, fallback = 'en'): string {
  const code = (locale ?? '').toLowerCase().split(/[_-]/)[0] ?? '';
  return /^[a-z]{2,3}$/.test(code) ? code : fallback;
}

/** The number customers know (the `_order_number` of sequential-number plugins), else the id. */
export function numberOf(order: WooOrder): number {
  for (const value of [order.meta?._order_number, order.number, order.id]) {
    const n = Number(String(value ?? '').replace(/[^\d]/g, ''));
    if (Number.isInteger(n) && n > 0) return n;
  }
  return order.id;
}

/** An order of the export as the `shop` service's `importOrder` takes it; null to leave out. */
export function toImportedOrder(
  order: WooOrder,
  links: {
    customerUserId: string | null;
    productIdBySku: Map<string, string>;
    /** Products without a SKU, by their slug. */
    productIdBySlug?: Map<string, string>;
    defaultLocale: string;
  },
) {
  const status = STATUSES[order.status];
  if (!status) return null;
  const items = order.items.map((item) => ({
    kind:
      item.type === 'shipping'
        ? ('shipping' as const)
        : item.type === 'fee'
          ? ('fee' as const)
          : ('product' as const),
    name: item.name,
    sku: item.sku ?? '',
    productId:
      item.type !== 'line_item'
        ? null
        : ((item.sku ? links.productIdBySku.get(item.sku) : undefined) ??
          (item.productSlug ? links.productIdBySlug?.get(item.productSlug) : undefined) ??
          null),
    quantity: item.quantity ?? 1,
    subtotal: item.subtotal ?? item.total ?? '0',
    subtotalTax: item.subtotalTax ?? item.tax ?? '0',
    total: item.total ?? '0',
    tax: item.tax ?? '0',
    attributes: item.attributes ?? [],
  }));
  const fees = order.items
    .filter((i) => i.type === 'fee')
    .reduce((sum, i) => sum + Number(i.total ?? 0), 0);
  return {
    ref: `wc:${order.id}`,
    number: numberOf(order),
    status,
    currency: order.currency,
    locale: languageOf(order.language, links.defaultLocale),
    pricesIncludeTax: Boolean(order.pricesIncludeTax),
    email: order.email || order.billing?.email || '',
    customerUserId: links.customerUserId,
    billing: toAddress(order.billing) ?? undefined,
    shipping: toAddress(order.shipping) ?? undefined,
    paymentMethod: order.paymentMethod ?? '',
    paymentTitle: order.paymentTitle ?? '',
    transactionId: order.transactionId ?? '',
    shippingMethod: order.items.find((i) => i.type === 'shipping')?.name ?? '',
    customerNote: order.customerNote ?? '',
    coupons: (order.coupons ?? []).map((c) => ({ code: c.code, discount: c.discount })),
    taxes: (order.taxes ?? []).map((t) => ({
      rate: Number(t.rate) || 0,
      amount: t.amount ?? '0',
      label: t.label ?? '',
    })),
    totals: {
      subtotal: order.totals.subtotal ?? '0',
      discount: order.totals.discount ?? '0',
      shipping: order.totals.shipping ?? '0',
      shippingTax: order.totals.shippingTax ?? '0',
      fees: fees.toFixed(2),
      tax: order.totals.tax ?? '0',
      total: order.totals.total ?? '0',
    },
    items,
    notes: (order.notes ?? []).map((n) => ({
      note: n.content,
      customer: Boolean(n.customer),
      author: n.author || 'WooCommerce',
      ...(n.date ? { createdAt: n.date } : {}),
    })),
    refunds: (order.refunds ?? []).map((r) => ({
      amount: r.amount,
      reason: r.reason ?? '',
      ...(r.date ? { createdAt: r.date } : {}),
    })),
    createdAt: order.createdAt,
    paidAt: order.paidAt ?? null,
    completedAt: order.completedAt ?? null,
    meta: { ...(order.meta ?? {}), woocommerceId: order.id },
  };
}
