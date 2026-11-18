/**
 * The `shop-invoices` service (1.1): what other plugins ask PDF Invoices,
 * e.g. an electronic-invoice add-on that must use the same number and date
 * as the PDF of the same order, never a second numbering of its own.
 *
 * - `invoice(siteId, orderId)`: the order's invoice, created with the next
 *   number when it has none (the same as the PDF shows), or null when the
 *   order does not exist.
 * - `findInvoice(siteId, orderId)`: the invoice when there is one, without
 *   creating it.
 * - `seller(siteId)`: the shop's details as the PDFs print them, and the
 *   order statuses that create the invoice.
 */
import type { InvoiceRow } from './store';
import type { Settings } from './settings';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An invoice as other plugins see it: its number, as printed, and its date (ISO 8601). */
export interface InvoiceNumber {
  orderId: string;
  number: number;
  formatted: string;
  date: string;
  /** Kept from the shop the order was imported from. */
  imported: boolean;
}

export interface SellerDetails {
  shopName: string;
  address: string;
  taxId: string;
  createOn: string[];
}

export interface InvoicesServiceDeps {
  exists(siteId: string, orderId: string): Promise<boolean>;
  ensure(siteId: string, orderId: string): Promise<InvoiceRow>;
  find(siteId: string, orderId: string): Promise<InvoiceRow | null>;
  settings(siteId: string): Promise<Settings>;
}

const view = (row: InvoiceRow): InvoiceNumber => ({
  orderId: row.orderId,
  number: row.number,
  formatted: row.formatted,
  date: new Date(row.date).toISOString(),
  imported: row.imported,
});

export function invoicesService(deps: InvoicesServiceDeps) {
  return {
    async invoice(siteId: string, orderId: string): Promise<InvoiceNumber | null> {
      if (!UUID_RE.test(String(orderId))) return null;
      const found = await deps.find(siteId, orderId);
      if (found) return view(found);
      if (!(await deps.exists(siteId, orderId))) return null;
      return view(await deps.ensure(siteId, orderId));
    },
    async findInvoice(siteId: string, orderId: string): Promise<InvoiceNumber | null> {
      if (!UUID_RE.test(String(orderId))) return null;
      const found = await deps.find(siteId, orderId);
      return found ? view(found) : null;
    },
    async seller(siteId: string): Promise<SellerDetails> {
      const s = await deps.settings(siteId);
      return {
        shopName: s.shopName,
        address: s.address,
        taxId: s.taxId,
        createOn: [...s.createOn],
      };
    },
  };
}
