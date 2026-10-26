/** Checks of what affiliates write: email addresses, IBANs, web addresses. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An IBAN without spaces, uppercase, with a valid check (ISO 13616, mod 97); null when invalid. */
export function cleanIban(value: string): string | null {
  const iban = value.replace(/[\s-]+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return null;
  const moved = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let rest = 0;
  for (const digit of moved) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1 ? iban : null;
}

/** A web address the affiliate gave (https added when missing); '' when it is not one. */
export function cleanWebsite(value: string): string {
  const text = value.trim().slice(0, 300);
  if (!text) return '';
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return /^https?:$/.test(url.protocol) && url.hostname.includes('.') ? url.href : '';
  } catch {
    return '';
  }
}

/** Text from a form: a string, trimmed, at most `max` characters, without control characters. */
export function field(value: unknown, max: number): string {
  return typeof value === 'string'
    ? [...value]
        .filter((c) => {
          const code = c.charCodeAt(0);
          // Tabs and line breaks stay; other control characters go.
          return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
        })
        .join('')
        .trim()
        .slice(0, max)
    : '';
}
