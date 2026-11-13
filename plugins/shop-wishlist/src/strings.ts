/** The texts of the public pages, in English and Italian. */
const IT: Record<string, string> = {
  Wishlist: 'Lista desideri',
  'A wishlist': 'Una lista desideri',
  'Your wishlist is empty.': 'La tua lista desideri è vuota.',
  'Save products with the heart on their page or card.':
    'Salva i prodotti con il cuore nella loro pagina o scheda.',
  'This list is empty.': 'Questa lista è vuota.',
  'This list does not exist.': 'Questa lista non esiste.',
  'Back to the shop': 'Torna al negozio',
  Remove: 'Rimuovi',
  'Share your list': 'Condividi la tua lista',
  'Copy the link': 'Copia il link',
  'My wishlist': 'La mia lista desideri',
  '{n} products': '{n} prodotti',
  '1 product': '1 prodotto',
};

export type Translate = (text: string, values?: Record<string, string | number>) => string;

export function strings(locale: string): Translate {
  const it = locale?.startsWith('it');
  return (text, values) => {
    let out = (it ? IT[text] : undefined) ?? text;
    for (const [k, v] of Object.entries(values ?? {})) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
}
