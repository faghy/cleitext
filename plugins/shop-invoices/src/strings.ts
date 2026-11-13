/** The texts of the documents, in English and Italian (the order's language). */
const IT: Record<string, string> = {
  Invoice: 'Fattura',
  'Packing slip': 'Documento di trasporto',
  'Invoice number': 'Numero fattura',
  'Invoice date': 'Data fattura',
  'Order number': 'Numero ordine',
  'Order date': 'Data ordine',
  'Payment method': 'Metodo di pagamento',
  'Shipping method': 'Metodo di spedizione',
  'Billing address': 'Indirizzo di fatturazione',
  'Ship to': 'Spedire a',
  Product: 'Prodotto',
  Quantity: 'Quantità',
  Price: 'Prezzo',
  Total: 'Totale',
  Subtotal: 'Subtotale',
  Discount: 'Sconto',
  Shipping: 'Spedizione',
  Fees: 'Commissioni',
  Tax: 'Imposte',
  'of which taxes': 'di cui imposte',
  Refunded: 'Rimborsato',
  Note: 'Nota',
  'Tax code': 'Codice fiscale',
  'VAT number': 'Partita IVA',
  'SDI code': 'Codice SDI',
  PEC: 'PEC',
  SKU: 'SKU',
  'Create the invoice': 'Crea la fattura',
  'Page {n} of {total}': 'Pagina {n} di {total}',
};

export type Translate = (text: string, values?: Record<string, string | number>) => string;

export function strings(locale: string): Translate {
  const it = (locale ?? '').startsWith('it');
  return (text, values) => {
    let out = (it ? IT[text] : undefined) ?? text;
    for (const [k, v] of Object.entries(values ?? {})) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
}
