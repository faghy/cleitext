/**
 * Products as CSV: the columns of WooCommerce's product export (so that a
 * WooCommerce catalog can be brought in) plus the shop's own (cost, list
 * price, condition). No dependencies: the admin imports in the browser.
 */

/** RFC 4180 fields: quoted when they hold a comma, a quote or a line break. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined) return '';
    let text = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
    // Spreadsheets run cells starting with these as formulas.
    if (/^[=+\-@\t\r]/.test(text) && !/^-?\d/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Rows of a CSV text (comma or semicolon, as spreadsheets in Italy save it). */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const separator =
    (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === separator) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Our name of each column; aliases are WooCommerce's headers and Italian ones. */
export const COLUMNS = {
  id: ['ID'],
  kind: ['Type', 'Tipo'],
  sku: ['SKU', 'Codice'],
  gtin: ['GTIN, UPC, EAN, or ISBN', 'GTIN', 'EAN'],
  title: ['Name', 'Nome'],
  published: ['Published', 'Pubblicato'],
  featured: ['Is featured?', 'In evidenza'],
  visibility: ['Visibility in catalog'],
  excerpt: ['Short description', 'Descrizione breve'],
  description: ['Description', 'Descrizione'],
  saleFrom: ['Date sale price starts'],
  saleTo: ['Date sale price ends'],
  taxStatus: ['Tax status'],
  taxClass: ['Tax class'],
  inStock: ['In stock?', 'Disponibile'],
  stock: ['Stock', 'Magazzino', 'Quantità'],
  lowStock: ['Low stock amount'],
  backorders: ['Backorders allowed?'],
  soldIndividually: ['Sold individually?'],
  weight: ['Weight', 'Peso'],
  length: ['Length', 'Lunghezza'],
  width: ['Width', 'Larghezza'],
  height: ['Height', 'Altezza'],
  salePrice: ['Sale price', 'Prezzo in offerta'],
  regularPrice: ['Regular price', 'Prezzo', 'Prezzo di vendita'],
  cost: ['Cost', 'Costo', 'Cost of goods'],
  listPrice: ['List price', 'Prezzo di listino', 'Listino'],
  condition: ['Condition', 'Condizione'],
  categories: ['Categories', 'Categorie'],
  brand: ['Brands', 'Brand', 'Marchio', 'Marca'],
  shippingClass: ['Shipping class'],
  images: ['Images', 'Immagini'],
  purchaseNote: ['Purchase note'],
} as const;
export type Column = keyof typeof COLUMNS;

/** The header written by the export, in this order. */
export const EXPORT_COLUMNS: { column: Column; header: string }[] = [
  ['id', 'ID'],
  ['kind', 'Type'],
  ['sku', 'SKU'],
  ['gtin', 'GTIN, UPC, EAN, or ISBN'],
  ['title', 'Name'],
  ['published', 'Published'],
  ['featured', 'Is featured?'],
  ['visibility', 'Visibility in catalog'],
  ['saleFrom', 'Date sale price starts'],
  ['saleTo', 'Date sale price ends'],
  ['taxStatus', 'Tax status'],
  ['taxClass', 'Tax class'],
  ['inStock', 'In stock?'],
  ['stock', 'Stock'],
  ['lowStock', 'Low stock amount'],
  ['backorders', 'Backorders allowed?'],
  ['soldIndividually', 'Sold individually?'],
  ['weight', 'Weight'],
  ['length', 'Length'],
  ['width', 'Width'],
  ['height', 'Height'],
  ['salePrice', 'Sale price'],
  ['regularPrice', 'Regular price'],
  ['cost', 'Cost'],
  ['listPrice', 'List price'],
  ['condition', 'Condition'],
  ['categories', 'Categories'],
  ['brand', 'Brands'],
  ['shippingClass', 'Shipping class'],
  ['images', 'Images'],
  ['purchaseNote', 'Purchase note'],
].map(([column, header]) => ({ column: column as Column, header: header! }));

/** Which column each header is ("Weight (kg)" is Weight), or undefined. */
export function columnOf(header: string): Column | undefined {
  const clean = header
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .toLowerCase();
  for (const [column, names] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
    if (column === clean.toLowerCase() || names.some((n) => n.toLowerCase() === clean))
      return column;
  }
  return undefined;
}

/** "Electronics > Phones, Garden" → [["Electronics", "Phones"], ["Garden"]]. */
export function categoryPaths(value: string): string[][] {
  return value
    .split(/(?<!\\),/)
    .map((path) =>
      path
        .split('>')
        .map((name) => name.trim().replace(/\\,/g, ','))
        .filter(Boolean),
    )
    .filter((path) => path.length > 0);
}

/** "1", "yes", "sì", "true" → true; "0", "no", "" → false; anything else, undefined. */
export function yesNo(value: string): boolean | undefined {
  const text = value.trim().toLowerCase();
  if (['1', 'yes', 'y', 'true', 'sì', 'si', 'x'].includes(text)) return true;
  if (['0', 'no', 'n', 'false', '', '-1'].includes(text)) return false;
  return undefined;
}

/** WooCommerce's "Backorders allowed?": 1, 0 or notify. */
export function backordersOf(value: string): 'no' | 'notify' | 'yes' | undefined {
  const text = value.trim().toLowerCase();
  if (text === 'notify') return 'notify';
  const flag = yesNo(text);
  return flag === undefined ? undefined : flag ? 'yes' : 'no';
}
