/** Invoice numbers: prefix, padding, suffix, an optional yearly reset. Pure, tested on their own. */

export interface Numbering {
  prefix: string;
  suffix: string;
  /** Digits at least, with leading zeros (0: none). */
  padding: number;
  /** Numbers start again from 1 each year. */
  yearlyReset: boolean;
}

export const DEFAULT_NUMBERING: Numbering = {
  prefix: '',
  suffix: '',
  padding: 0,
  yearlyReset: false,
};

/** `{year}` in a prefix or suffix is the invoice's year (e.g. `FT-{year}/`). */
export function formatNumber(n: number, numbering: Numbering, date: Date): string {
  const year = String(date.getUTCFullYear());
  const digits = numbering.padding > 0 ? String(n).padStart(numbering.padding, '0') : String(n);
  return `${numbering.prefix.replaceAll('{year}', year)}${digits}${numbering.suffix.replaceAll('{year}', year)}`;
}

/** The counter a number is taken from: one per year with the yearly reset. */
export function counterOf(numbering: Numbering, date: Date): string {
  return numbering.yearlyReset ? `y${date.getUTCFullYear()}` : 'all';
}
