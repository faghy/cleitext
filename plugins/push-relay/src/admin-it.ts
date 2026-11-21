/** Italian texts of the Push Relay page (and of the server's messages it shows). */
export const IT: Record<string, string> = {
  'Sends the push notifications of the Cleitext app for every Cleitext site, through Firebase Cloud Messaging. Sites post them to the address below; the Firebase key stays here.':
    'Invia le notifiche push dell’app Cleitext per tutti i siti Cleitext, tramite Firebase Cloud Messaging. I siti le inviano all’indirizzo qui sotto; la chiave di Firebase resta qui.',
  'Firebase service account': 'Account di servizio Firebase',
  'Configured: project {project}, account {email}.':
    'Configurato: progetto {project}, account {email}.',
  'Not configured: the relay answers 503 until the key is set.':
    'Non configurato: il relay risponde 503 finché non imposti la chiave.',
  'Replace the key': 'Sostituisci la chiave',
  'JSON key of the service account': 'Chiave JSON dell’account di servizio',
  'Firebase console → Project settings → Service accounts → Generate new private key. It is stored encrypted and never shown again.':
    'Console di Firebase → Impostazioni progetto → Account di servizio → Genera nuova chiave privata. Viene salvata cifrata e non viene più mostrata.',
  'Key saved.': 'Chiave salvata.',
  'Save the key': 'Salva la chiave',
  'Remove the key? Notifications stop until a new one is set.':
    'Rimuovere la chiave? Le notifiche si fermano finché non ne imposti una nuova.',
  'Key removed.': 'Chiave rimossa.',
  'Remove the key': 'Rimuovi la chiave',
  Limits: 'Limiti',
  'Limit saved.': 'Limite salvato.',
  'Notifications per hour for each site': 'Notifiche all’ora per ogni sito',
  'Counted per phone, by the address the site gives. Default: 300.':
    'Contate per telefono, in base all’indirizzo che il sito dichiara. Predefinito: 300.',
  Save: 'Salva',
  'Address for the sites': 'Indirizzo per i siti',
  'Sites send there by default. A site can use another relay with CLEITEXT_PUSH_RELAY, or none with an empty value.':
    'I siti inviano lì per impostazione predefinita. Un sito può usare un altro relay con CLEITEXT_PUSH_RELAY, o nessuno con un valore vuoto.',
  'This is not a JSON file.': 'Questo non è un file JSON.',
  'This is not the JSON key of a service account.':
    'Questa non è la chiave JSON di un account di servizio.',
  'The project id is missing or not valid.': 'L’id del progetto manca o non è valido.',
  'The client email is missing or not valid.': 'L’email del client manca o non è valida.',
  'The private key is missing or not valid.': 'La chiave privata manca o non è valida.',
  'The limit must be a whole number from 1 to 1,000,000.':
    'Il limite deve essere un numero intero da 1 a 1.000.000.',
};
