/**
 * CSV for spreadsheets: comma-separated, quoted when needed, with a BOM so
 * Excel reads accents, and cells that a spreadsheet would run as a formula
 * (`=`, `+`, `-`, `@`) prefixed with an apostrophe.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Byte order mark: spreadsheets then read the file as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

export function toCsv(header: string[], rows: unknown[][]): string {
  return `${BOM}${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
