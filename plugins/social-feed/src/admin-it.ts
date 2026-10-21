/** Italian texts of the settings page (and of the server's messages it shows). */
export const IT: Record<string, string> = {
  'The token does not expire.': 'Il token non scade.',
  'The token expires on {date}': 'Il token scade il {date}',
  'in {n} days': 'tra {n} giorni',
  'estimated, confirmed at the first refresh': 'stima, confermata al primo rinnovo',
  'Connected: {name}': 'Collegato: {name}',
  'pasted token': 'token incollato',
  'through the Facebook Page': 'tramite la Pagina Facebook',
  'Meta asks to sign in again by {date}.': 'Meta chiede di accedere di nuovo entro il {date}.',
  'Connect the account again.': 'Collega di nuovo l’account.',
  'Not connected.': 'Non collegato.',
  'Posts in the cache': 'Post in memoria',
  'Last refresh': 'Ultimo aggiornamento',
  'Last good refresh': 'Ultimo aggiornamento riuscito',
  'Next refresh': 'Prossimo aggiornamento',
  'Error: {message}': 'Errore: {message}',
  'Meta limits the requests: the site keeps showing the last posts and tries again later.':
    'Meta limita le richieste: il sito continua a mostrare gli ultimi post e riprova più tardi.',
  'The token no longer works: connect again.': 'Il token non funziona più: collega di nuovo.',
  'The app lacks a permission: check it in the Meta app and connect again.':
    'All’app manca un permesso: controllalo nell’app di Meta e collega di nuovo.',
  'Connect again': 'Collega di nuovo',
  'Connect with {network}': 'Collega con {network}',
  'Paste a token': 'Incolla un token',
  'Refresh now': 'Aggiorna ora',
  Disconnect: 'Scollega',
  'Instagram is read through the Facebook Page: connect Facebook, with the Instagram account linked to the Page.':
    'Instagram viene letto tramite la Pagina Facebook: collega Facebook, con l’account Instagram collegato alla Pagina.',
  'Instagram user access token (long-lived)':
    'Token di accesso utente di Instagram (di lunga durata)',
  'Facebook Page access token (or a user token)':
    'Token di accesso della Pagina Facebook (o un token utente)',
  'It is stored encrypted on the server and never shown again.':
    'Viene salvato cifrato sul server e non viene più mostrato.',
  'Connect with this token': 'Collega con questo token',
  'The sign-in was cancelled or refused: {reason}':
    'L’accesso è stato annullato o rifiutato: {reason}',
  'Connected.': 'Collegato.',
  'Saved.': 'Salvato.',
  'Social feed': 'Feed social',
  'The latest posts of your Instagram account and Facebook Page on the site, with the Social feed block. Connect them here with your own Meta app.':
    'Gli ultimi post del tuo account Instagram e della tua Pagina Facebook sul sito, con il blocco Feed social. Collegali qui con la tua app di Meta.',
  'Choose the Facebook Page': 'Scegli la Pagina Facebook',
  'Use this Page': 'Usa questa Pagina',
  'Refreshed.': 'Aggiornato.',
  'Disconnect {network}? Its posts leave the site.':
    'Scollegare {network}? I suoi post spariscono dal sito.',
  Channels: 'Canali',
  'Show Instagram posts': 'Mostra i post di Instagram',
  'Show Facebook Page posts': 'Mostra i post della Pagina Facebook',
  'Connect Instagram with': 'Collega Instagram con',
  'Instagram Login needs only an Instagram professional account. Through the Facebook Page, the account must be linked to the Page.':
    'Instagram Login richiede solo un account Instagram professionale. Tramite la Pagina Facebook, l’account deve essere collegato alla Pagina.',
  'Instagram Login (recommended)': 'Instagram Login (consigliato)',
  'The Facebook Page (Facebook Login)': 'La Pagina Facebook (Facebook Login)',
  'Posts fetched per channel': 'Post scaricati per canale',
  'From 6 to 50. The block chooses how many it shows.':
    'Da 6 a 50. Il blocco sceglie quanti mostrarne.',
  'Look for new posts every': 'Cerca nuovi post ogni',
  '{n} minutes': '{n} minuti',
  hour: 'ora',
  '{n} hours': '{n} ore',
  'Pictures and privacy': 'Immagini e privacy',
  Pictures: 'Immagini',
  'Copied to the site (recommended)': 'Copiate sul sito (consigliato)',
  'Loaded from Meta’s servers': 'Caricate dai server di Meta',
  'Visitors load nothing from Meta: no cookies, no consent needed, and pictures never break when Meta’s addresses expire. Up to 120 pictures are kept; those no post uses are deleted after a day.':
    'I visitatori non caricano nulla da Meta: niente cookie, nessun consenso necessario, e le immagini non si rompono quando gli indirizzi di Meta scadono. Si tengono fino a 120 immagini; quelle che nessun post usa vengono cancellate dopo un giorno.',
  'Meta receives the address of every visitor, and its picture addresses expire after some days. With the Privacy & GDPR plugin the pictures wait for consent.':
    'Meta riceve l’indirizzo di ogni visitatore, e i suoi indirizzi delle immagini scadono dopo alcuni giorni. Con il plugin Privacy & GDPR le immagini aspettano il consenso.',
  'Consent category': 'Categoria di consenso',
  Marketing: 'Marketing',
  Preferences: 'Preferenze',
  'Meta app': 'App di Meta',
  'Redirect address': 'Indirizzo di reindirizzamento',
  'Copy it into the Meta app, as the guide shows.':
    'Copialo nell’app di Meta, come mostra la guida.',
  Copy: 'Copia',
  'Meta accepts only https addresses: open the admin over https.':
    'Meta accetta solo indirizzi https: apri l’amministrazione in https.',
  'Instagram app ID': 'ID app Instagram',
  'Instagram → API setup with Instagram login → Business login settings.':
    'Instagram → Configurazione API con login di Instagram → Impostazioni del login aziendale.',
  'Instagram app secret': 'Chiave segreta app Instagram',
  'Saved: leave empty to keep it': 'Salvata: lascia vuoto per mantenerla',
  'Facebook App ID': 'ID app Facebook',
  'App settings → Basic.': 'Impostazioni app → Di base.',
  'Facebook App secret': 'Chiave segreta app Facebook',
  'Stored encrypted on the server and never shown again.':
    'Salvata cifrata sul server e non più mostrata.',
  'How to create the Meta app': 'Come creare l’app di Meta',
  Save: 'Salva',
  // Messages of the server.
  'Unknown channel.': 'Canale sconosciuto.',
  'Save the app ID and the app secret first.': 'Salva prima l’ID app e la chiave segreta.',
  'This sign-in is not the one started here, or it took too long. Try again.':
    'Questo accesso non è quello avviato qui, o ci ha messo troppo. Riprova.',
  'Meta sent no sign-in code.': 'Meta non ha inviato il codice di accesso.',
  'Choose a Page.': 'Scegli una Pagina.',
  'This does not look like an access token.': 'Questo non sembra un token di accesso.',
  'An app secret is 32 letters and digits (0–9, a–f).':
    'Una chiave segreta è fatta di 32 lettere e cifre (0–9, a–f).',
  'Connect Facebook again: the sign-in has expired.':
    'Collega di nuovo Facebook: l’accesso è scaduto.',
  'That Page is not among those of this account.':
    'Quella Pagina non è tra quelle di questo account.',
  'This Facebook account manages no Page this app may read. Choose the Page when Facebook asks, or check the app’s permissions.':
    'Questo account Facebook non gestisce Pagine che l’app può leggere. Scegli la Pagina quando Facebook lo chiede, o controlla i permessi dell’app.',
  'The access token is missing: connect the account again.':
    'Manca il token di accesso: collega di nuovo l’account.',
};
