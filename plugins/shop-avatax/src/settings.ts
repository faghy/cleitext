/** The settings of AvaTax for Cleishop, checked and completed with the defaults. Pure. */
import type { AvaAddress } from './avatax';

export interface Settings {
  /** AvaTax works out the taxes (with the account and key saved). */
  enabled: boolean;
  environment: 'production' | 'sandbox';
  companyCode: string;
  /** Where the goods leave from. */
  origin: AvaAddress;
  /** Countries whose taxes AvaTax works out (others keep the shop's rates). */
  countries: string[];
  /** Also in the cart (an estimate), not only at checkout. */
  calculateOnCart: boolean;
  shippingTaxCode: string;
  defaultTaxCode: string;
  /** US addresses are checked at checkout (ResolveAddress); `required` refuses those not found. */
  addressValidation: 'off' | 'required';
  /**
   * Paid orders are recorded in Avalara (SalesInvoice committed), voided when
   * cancelled, refunded when refunded. Off by default: turn it on when the
   * site goes live.
   */
  commit: boolean;
  /** Keeps the last calls (no payment data). */
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  environment: 'sandbox',
  companyCode: '',
  origin: { line1: '', line2: '', city: '', region: '', postalCode: '', country: 'US' },
  countries: ['US'],
  calculateOnCart: true,
  shippingTaxCode: 'FR',
  defaultTaxCode: 'P0000000',
  addressValidation: 'required',
  commit: false,
  debug: false,
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const code = (v: unknown, fallback: string) =>
  /^[A-Za-z0-9_.-]{1,25}$/.test(str(v, 25)) ? str(v, 25) : fallback;

export function cleanSettings(raw: unknown): Settings {
  const v = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>;
  const o = (v.origin ?? {}) as Record<string, unknown>;
  const countries = Array.isArray(v.countries)
    ? v.countries
        .map((c) => (typeof c === 'string' ? c.trim().toUpperCase() : ''))
        .filter((c) => /^[A-Z]{2}$/.test(c))
    : DEFAULT_SETTINGS.countries;
  return {
    enabled: v.enabled === true,
    environment: v.environment === 'production' ? 'production' : 'sandbox',
    companyCode: str(v.companyCode, 25),
    origin: {
      line1: str(o.line1, 100),
      line2: str(o.line2, 100),
      city: str(o.city, 50),
      region: str(o.region, 3).toUpperCase(),
      postalCode: str(o.postalCode, 11),
      country: (str(o.country, 2) || 'US').toUpperCase(),
    },
    countries: countries.length ? [...new Set(countries)] : DEFAULT_SETTINGS.countries,
    calculateOnCart: v.calculateOnCart !== false,
    shippingTaxCode: code(v.shippingTaxCode, DEFAULT_SETTINGS.shippingTaxCode),
    defaultTaxCode: code(v.defaultTaxCode, DEFAULT_SETTINGS.defaultTaxCode),
    addressValidation: v.addressValidation === 'off' ? 'off' : 'required',
    commit: v.commit === true,
    debug: v.debug === true,
  };
}
