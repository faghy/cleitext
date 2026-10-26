/** What visitors read, in English and Italian (other languages fall back to English). */

const EN = {
  email: 'Email',
  firstName: 'Name',
  lastName: 'Surname',
  button: 'Subscribe',
  sending: 'Sending…',
  success: 'Thank you! You are subscribed.',
  pending: 'Almost done: check your inbox and click the link to confirm.',
  already: 'You are already subscribed. Thank you!',
  error: 'The subscription did not go through. Please try again later.',
  invalid: 'Check the fields marked and try again.',
  invalidEmail: 'Enter a valid email address.',
  required: 'Fill in this field.',
  consentRequired: 'Tick the box to agree.',
  check: 'The spam check did not pass: please try again.',
  busy: 'Too many attempts: try again in a few minutes.',
  consent: 'I agree to receive the newsletter by email, as described in the {privacy}.',
  consentPlain: 'I agree to receive the newsletter by email. I can unsubscribe at any time.',
  privacy: 'privacy policy',
  optIn: 'Subscribe me to the newsletter',
  requiredMark: 'required',
  notConnected: 'The newsletter is not connected yet: the form shows here once it is.',
};

export type Strings = typeof EN;

const IT: Strings = {
  email: 'Email',
  firstName: 'Nome',
  lastName: 'Cognome',
  button: 'Iscriviti',
  sending: 'Invio…',
  success: 'Grazie! Ti sei iscritto.',
  pending: 'Manca poco: controlla la posta e clicca il link per confermare.',
  already: 'Sei già iscritto. Grazie!',
  error: 'L’iscrizione non è andata a buon fine. Riprova più tardi.',
  invalid: 'Controlla i campi segnalati e riprova.',
  invalidEmail: 'Scrivi un indirizzo email valido.',
  required: 'Compila questo campo.',
  consentRequired: 'Spunta la casella per acconsentire.',
  check: 'Il controllo anti-spam non è riuscito: riprova.',
  busy: 'Troppi tentativi: riprova tra qualche minuto.',
  consent: 'Acconsento a ricevere la newsletter via email, come descritto nella {privacy}.',
  consentPlain: 'Acconsento a ricevere la newsletter via email. Posso cancellarmi quando voglio.',
  privacy: 'informativa sulla privacy',
  optIn: 'Iscrivimi alla newsletter',
  requiredMark: 'obbligatorio',
  notConnected: 'La newsletter non è ancora collegata: il modulo comparirà qui appena lo sarà.',
};

export function stringsFor(locale: string): Strings {
  return locale.toLowerCase().startsWith('it') ? IT : EN;
}

/** The texts the owner can change per language (Settings → Form). */
export const EDITABLE = [
  'button',
  'success',
  'pending',
  'already',
  'error',
  'consent',
  'optIn',
] as const;
export type EditableText = (typeof EDITABLE)[number];
