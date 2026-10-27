/**
 * Money in cents (integers), as the database keeps it: conversions come as
 * decimal strings (`'49.90'`), commissions are computed and summed in
 * cents, and shown back as decimals.
 */

/** `'49.90'` → 4990; rounds to the cent; invalid → 0. */
export function toCents(value: string | number): number {
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** 4990 → `'49.90'`, -150 → `'-1.50'`. */
export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** An amount for people, e.g. `€ 49,90` in Italian. */
export function formatMoney(cents: number, currency: string, locale: string): string {
  if (!currency) return fromCents(cents);
  try {
    return new Intl.NumberFormat(locale || 'en', { style: 'currency', currency }).format(
      cents / 100,
    );
  } catch {
    return `${fromCents(cents)} ${currency}`;
  }
}
