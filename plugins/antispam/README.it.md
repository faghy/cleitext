# Antispam

Il plugin ufficiale di Cleitext che tiene lo spam fuori da commenti, registrazioni e moduli, con controlli che avvengono tutti sul tuo sito. È gratuito e non è nel pacchetto base: installalo da **Plugin → Aggiungi nuovo** (catalogo), oppure scarica `cleitext-plugin-antispam-<versione>.zip` dalla pagina delle Release e caricalo in **Plugin → Carica plugin**.

Funziona appena attivato, senza chiavi né account da nessuna parte: **niente viene inviato ad altri servizi**, e gli indirizzi IP dei visitatori non vengono mai salvati, se non come hash con sale che vengono dimenticati dopo qualche giorno.

## Cosa protegge

- i **commenti** (e le recensioni dei prodotti del negozio);
- le **registrazioni** (Crea un account);
- i moduli del plugin **Moduli**;
- i moduli di **Prisma** e **Fresco Pro** (i moduli di Fresco Pro con chiavi captcha proprie restano a quel captcha);
- i moduli di altri plugin che lo chiedono (spento di default: ad esempio la cassa di un negozio).

I moduli di accesso e delle password non vengono mai controllati: lo spam non passa da lì, e nessuno deve restare chiuso fuori.

## Come decide

Ogni messaggio riceve un **punteggio**. Questi controlli aggiungono punti:

| Controllo                                                                                                     | Punti                  |
| ------------------------------------------------------------------------------------------------------------- | ---------------------- |
| un campo nascosto, che le persone non vedono, è compilato (i bot compilano tutto)                             | sempre scartato        |
| il messaggio è arrivato **prima di 3 secondi** da quando il visitatore ha iniziato a compilare                | 6                      |
| il controllo del tempo è falsificato                                                                          | 6                      |
| più di **2 link** (modificabile)                                                                              | da 2 a 4               |
| tag di link da forum come `[url=…]`                                                                           | 4                      |
| una parola, un indirizzo web, un dominio, un'email o un IP **bloccati** (il tuo elenco)                       | 6                      |
| scritto per lo più in un **alfabeto che il sito non usa** (ad esempio cirillico o cinese su un sito italiano) | 4 (2 per poche parole) |
| il nome è un indirizzo web                                                                                    | 3                      |
| lo **stesso testo** è arrivato tre volte o più in un giorno                                                   | 3                      |
| il testo era già stato **segnato come spam**                                                                  | 5                      |
| il testo era già stato **segnato come non spam**                                                              | −3                     |
| l'indirizzo ha già inviato spam                                                                               | 2, o 4 dopo tre volte  |
| il dominio dell'email non ha un server di posta (facoltativo, spento di default)                              | 3                      |

Poi, con le soglie predefinite:

- **sotto 3**: il messaggio passa;
- **da 3 a 5, dubbio**: se il plugin **Captcha** è attivo, al visitatore viene chiesto di risolverlo (vedi sotto); altrimenti il messaggio aspetta nella coda dello spam;
- **da 6 a 9, spam**: aspetta nella **coda dello spam**, e il visitatore legge il solito ringraziamento. I moduli che non possono mettere da parte un messaggio (registrazione, Fresco Pro) lo rifiutano invece con un messaggio cortese;
- **10 o più** (e sempre il campo nascosto): scartato, mentre al mittente viene detto che è stato inviato.

**Senza JavaScript?** Il controllo del tempo richiede il piccolo script del plugin. Un visitatore senza JavaScript non viene mai rifiutato solo per questo: il suo messaggio è considerato dubbio solo se il plugin Captcha può chiedergli una conferma, altrimenti passa.

### Pagine in cache

Le pagine di solito arrivano da una cache, uguali per tutti, quindi un modulo non può portare con sé il momento in cui è stato aperto. I campi del plugin nei moduli sono uguali per ogni visitatore; il suo script (meno di 2 KB, nessun cookie) chiede al sito un gettone del tempo firmato (`GET /_antispam/token`, mai in cache) quando il visitatore inizia a compilare un modulo, o al più tardi quando lo invia. Il server sa così quando il visitatore ha iniziato: un invio prima del tempo minimo è un bot. Le persone non vengono mai rifiutate perché veloci: lo script trattiene il messaggio per il secondo o due che mancano. I gettoni sono firmati con una chiave del sito e scadono dopo un giorno.

### Con il plugin Captcha

Imposta **Impostazioni → Captcha → Quando chiederlo** su _Solo quando Antispam ha dei dubbi_: la maggior parte dei visitatori non vede mai un captcha. Quando Antispam dubita di un messaggio, il modulo lo rifiuta una volta e mostra il widget di Turnstile o reCAPTCHA; risolto quello, il messaggio passa. Lo spam evidente resta spam anche con il captcha risolto. Con _Sempre_, Captcha controlla ogni messaggio come prima, e un captcha risolto toglie i dubbi di Antispam.

## La coda dello spam

**Spam** nel menu dell'amministrazione elenca i commenti nella cartella dello spam e i messaggi dei moduli trattenuti come spam, con il motivo:

- **Non è spam** pubblica il commento o consegna il messaggio (salvato e inviato per email dal suo modulo, come se fosse appena arrivato), e insegna al filtro che il testo va bene;
- **Spam: elimina** lo elimina definitivamente e insegna al filtro che il testo è spam;
- la coda si svuota da sola dopo **15 giorni** (modificabile), commenti di spam compresi.

Compaiono anche i messaggi rifiutati come spam dai moduli che non possono trattenerli (registrazione, Fresco Pro), così puoi accorgerti di un errore; lì "Non è spam" istruisce soltanto il filtro. Anche segnare i commenti come spam o non spam in **Commenti** istruisce il filtro.

**Spam → Statistiche** mostra cosa è stato fermato in ciascuno degli ultimi 30 giorni, e perché.

## Impostazioni

**Impostazioni → Antispam**: i moduli da proteggere, se controllare chi ha effettuato l'accesso (di default no), il tempo minimo, i link ammessi, gli alfabeti (di default quelli delle lingue del sito), l'elenco dei blocchi e quello da non controllare mai (email, `@dominio`, indirizzi IP e intervalli), i controlli da usare, le tre soglie e i giorni per cui la coda conserva lo spam.

## Privacy

- Nessun servizio esterno: ogni controllo avviene sul tuo server.
- Gli indirizzi IP sono conservati solo come hash con sale (una chiave del sito), per riconoscere chi invia spam, e dimenticati insieme alla coda.
- I testi sono ricordati solo come impronte con sale, che non si possono rileggere.
- La coda conserva i messaggi giudicati spam (nomi, email, testo) per i giorni che scegli; l'esportazione e la cancellazione per indirizzo email del plugin Privacy li comprendono.
- Il controllo facoltativo del server di posta interroga il resolver DNS del tuo server sul dominio dell'email (che può essere un servizio esterno al sito): è spento di default.
- Lo script non imposta cookie e non salva nulla nel browser.

Per la tua privacy policy, ad esempio: _«Per proteggere il sito dallo spam, i messaggi inviati con i suoi moduli sono controllati automaticamente sul nostro server. I messaggi giudicati spam sono conservati fino a 15 giorni per permetterci di verificarli; l'indirizzo IP del visitatore è conservato per lo stesso tempo solo in forma non reversibile. Nessun dato viene comunicato a terzi per questa finalità.»_

## Per gli sviluppatori

Il plugin risponde ai filtri `form.challenge` e `form.verify` del core (permesso `forms:protect`, API dei plugin 1.38) con i verdetti di spam dell'API 1.45: `spam` per i moduli che possono trattenere i messaggi (`hold: true`, consegnati poi con l'azione `form.released`), `silent` per i bot e `challenge` per un plugin di captcha eseguito dopo. Legge e modera i commenti di spam con `ctx.comments` (permesso `comments`). Un plugin con moduli propri ottiene questi controlli chiedendo `ctx.forms.challenge` e `ctx.forms.verify` (interruttore "Moduli di altri plugin"); vedi la guida ai plugin, "Proteggere i moduli".

Permessi: `forms:protect`, `comments`, `settings:own` (impostazioni e chiave del sito), `routes:admin` (le pagine dell'amministrazione) e `routes:public` (il gettone del tempo).
