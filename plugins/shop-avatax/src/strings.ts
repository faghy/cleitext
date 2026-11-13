/** The messages customers read at checkout, in English and Italian. */
const IT: Record<string, string> = {
  'Taxes cannot be worked out right now. Please try again later.':
    'Non è possibile calcolare le imposte in questo momento. Riprova più tardi.',
  'We could not find this shipping address: check the street, city and ZIP code.':
    'Non abbiamo trovato questo indirizzo di spedizione: controlla via, città e CAP.',
};

export function strings(locale: string): (text: string) => string {
  const it = (locale ?? '').startsWith('it');
  return (text) => (it ? (IT[text] ?? text) : text);
}
