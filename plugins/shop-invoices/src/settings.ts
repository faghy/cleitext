/** The settings of PDF invoices, checked and completed with the defaults. Pure. */
import { DEFAULT_NUMBERING, type Numbering } from './numbering';

export const ORDER_STATUSES = ['pending', 'on-hold', 'processing', 'completed'] as const;
export const EMAILS = [
  'customer_processing',
  'customer_completed',
  'customer_on_hold',
  'customer_refunded',
  'new_order',
] as const;

export interface Settings {
  shopName: string;
  /** One line each. */
  address: string;
  taxId: string;
  footer: string;
  /** A data URL (PNG or JPEG), up to MAX_LOGO bytes. */
  logo: string;
  numbering: Numbering;
  /** The statuses that create the invoice of an order. */
  createOn: string[];
  /** The Cleishop emails the invoice is attached to (created then if needed). */
  attachTo: string[];
  /** Customers download their invoice from their account and the order page. */
  customerDownload: boolean;
  packingSlip: boolean;
  /** Paper size of the PDFs. */
  paper: 'A4' | 'Letter' | 'Legal';
}

export const MAX_LOGO = 400_000;

export const DEFAULT_SETTINGS: Settings = {
  shopName: '',
  address: '',
  taxId: '',
  footer: '',
  logo: '',
  numbering: DEFAULT_NUMBERING,
  createOn: ['processing', 'completed'],
  attachTo: ['customer_processing', 'customer_completed'],
  customerDownload: true,
  packingSlip: true,
  paper: 'A4',
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function cleanSettings(raw: unknown): Settings {
  const v = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>;
  const n = (v.numbering ?? {}) as Partial<Record<keyof Numbering, unknown>>;
  const logo = str(v.logo, MAX_LOGO * 1.4);
  const list = (value: unknown, allowed: readonly string[], fallback: string[]) =>
    Array.isArray(value)
      ? value.filter((x): x is string => allowed.includes(x as string))
      : fallback;
  return {
    shopName: str(v.shopName, 200),
    address: str(v.address, 1000),
    taxId: str(v.taxId, 200),
    footer: str(v.footer, 500),
    logo: /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logo) ? logo : '',
    numbering: {
      prefix: str(n.prefix, 40),
      suffix: str(n.suffix, 40),
      padding: Math.min(10, Math.max(0, Math.trunc(Number(n.padding) || 0))),
      yearlyReset: n.yearlyReset === true,
    },
    createOn: list(v.createOn, ORDER_STATUSES, DEFAULT_SETTINGS.createOn),
    attachTo: list(v.attachTo, EMAILS, DEFAULT_SETTINGS.attachTo),
    customerDownload: v.customerDownload !== false,
    packingSlip: v.packingSlip !== false,
    paper: v.paper === 'Letter' || v.paper === 'Legal' ? v.paper : 'A4',
  };
}

/** The logo's bytes, or null. */
export function logoBytes(settings: Settings): Buffer | null {
  const match = /^data:image\/(?:png|jpeg);base64,(.+)$/.exec(settings.logo);
  return match ? Buffer.from(match[1]!, 'base64') : null;
}

/**
 * The invoice number of an order imported from WooCommerce with «PDF
 * Invoices & Packing Slips» (its `_wcpdf_*` data), or null.
 */
export function wooInvoice(
  meta: Record<string, unknown>,
): { number: number; formatted: string; date: Date } | null {
  const data = (meta._wcpdf_invoice_number_data ?? {}) as Record<string, unknown>;
  const number = Number(meta._wcpdf_invoice_number ?? data.number);
  if (!Number.isInteger(number) || number <= 0) return null;
  const formatted =
    typeof data.formatted_number === 'string' && data.formatted_number.trim()
      ? data.formatted_number.trim()
      : String(number);
  const raw = meta._wcpdf_invoice_date;
  const seconds = Number(raw);
  const date =
    Number.isFinite(seconds) && seconds > 0
      ? new Date(seconds * 1000)
      : typeof raw === 'string' && !Number.isNaN(Date.parse(raw))
        ? new Date(raw)
        : null;
  if (!date) return null;
  return { number, formatted: formatted.slice(0, 100), date };
}
