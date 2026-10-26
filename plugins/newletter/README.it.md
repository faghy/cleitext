# NewLetter

🇬🇧 [Read in English](./README.md)

> **Ogni iscritto, una nuova lettera.**

Il plugin ufficiale di Cleitext per le **iscrizioni alla newsletter**. Scegli il servizio di email marketing che usi già, incolla la sua chiave API, scegli la lista e metti un modulo di iscrizione in qualsiasi pagina. Il modulo lo disegna il sito, con lo stile del tuo tema; le persone finiscono nella tua lista sul servizio, che continua a spedire le tue newsletter. È gratuito e non è nel pacchetto base: installalo da **Plugin → Aggiungi nuovo** (catalogo), oppure carica `cleitext-plugin-newletter-<versione>.zip` in **Plugin → Carica plugin**. Richiede Cleitext 0.80 o successivo (API dei plugin 1.51).

## Servizi

| Servizio                  | Liste                | Double opt-in                                                   | Tag                        |
| ------------------------- | -------------------- | --------------------------------------------------------------- | -------------------------- |
| **Brevo** (ex Sendinblue) | liste di contatti    | il DOI di Brevo: un modello di tipo "Double opt-in" e la pagina | no (Brevo non li ha)       |
| **Mailchimp**             | audience             | il contatto entra come `pending`; Mailchimp manda l’email       | sì                         |
| **MailerLite**            | gruppi (facoltativi) | l’iscritto entra come `unconfirmed`                             | no (i gruppi fanno da tag) |
| **Kit** (ConvertKit)      | moduli (facoltativi) | un’impostazione di ogni modulo in Kit                           | sì (creati se mancano)     |
| **ActiveCampaign**        | liste                | non tramite API: iscritto subito (il registro lo dice)          | sì (creati se mancano)     |

Con ogni servizio parla il server, tramite la sua API REST pubblica ufficiale (mai il browser del visitatore). La chiave è conservata cifrata tra i segreti del sito e non torna mai al browser: l’amministrazione sa solo che c’è.

## Configurazione

Apri **NewLetter** nel menu dell’amministrazione:

1. **Collegamento**: scegli il servizio, incolla la chiave API (ActiveCampaign vuole anche l’indirizzo API del tuo account) e premi **Prova il collegamento**, poi **Salva il collegamento**.
2. **Liste**: spunta le liste a cui iscrivere le persone. Se vuoi, scegli quali campi del servizio tengono nome e cognome (vuoto: quelli soliti, `FIRSTNAME`/`LASTNAME`, `FNAME`/`LNAME`, `name`/`last_name`…) e i campi aggiuntivi dei moduli con "Tutti i campi" (un’etichetta per lingua, obbligatori o no).
3. **Impostazioni predefinite del modulo**: campi (solo email, nome, nome e cognome, tutti), in colonna o su una riga, double opt-in (attivo di serie; con Brevo servono l’ID del modello e la pagina di conferma), tag, l’indirizzo dell’informativa sulla privacy.
4. **Testi**: per ogni lingua del sito, il pulsante, i messaggi dopo l’iscrizione (con e senza double opt-in), "già iscritto", l’errore, il consenso e la casella "Iscrivimi". I testi vuoti usano quelli inclusi, in italiano e in inglese.

Finché non c’è un servizio collegato e una lista scelta, i moduli non mostrano nulla ai visitatori (nell’editor compare un avviso).

## Il modulo di iscrizione

- il blocco **Iscrizione alla newsletter** nell’editor a blocchi (anche nei contenitori di Prisma), con titolo, testo, campi, disposizione, testo del pulsante, messaggi, liste, tag e double opt-in;
- il widget **Newsletter** in Fresco, con la lista scelta dal tuo servizio;
- lo shortcode **`[newletter]`** da solo in un paragrafo, per esempio `[newletter fields="name" layout="inline" lists="7" button="Iscriviti"]`.

Il modulo:

- chiede sempre l’email e una casella di **consenso** mai spuntata in anticipo, con il link alla tua informativa;
- funziona **senza JavaScript** (un normale invio, poi di nuovo sulla pagina con il messaggio) e, con JavaScript, risponde sul posto, legge l’esito ai lettori di schermo, segnala e mette a fuoco i campi sbagliati;
- passa dalla protezione anti-bot del sito (**Captcha** o **Antispam**, l’aggancio del core per i moduli), con un campo nascosto per i bot semplici e un limite di tentativi per visitatore e per indirizzo; un’iscrizione trattenuta come spam viene fatta se la si libera come non spam;
- non può essere dirottato su altre liste: quello che fa un modulo (liste, tag, double opt-in, campi) è firmato quando la pagina viene disegnata;
- prende colori, caratteri e campi dal tema; qualche variabile CSS regola il resto: `--cx-nl-gap`, `--cx-nl-max-width`, `--cx-nl-accent`, `--cx-nl-error`, `--cx-nl-small`.

## "Iscrivimi" negli altri moduli

Con NewLetter collegato, una casella **Iscrivimi alla newsletter** non spuntata (solo su scelta di chi compila) compare:

- nei moduli di contatto di **Forms** (1.6.0 o successivo): iscritto quando il messaggio viene consegnato;
- alla cassa di **Cleishop** (1.9.0 o successivo): iscritto con il nome di fatturazione quando l’ordine è fatto;
- nel modulo di prenotazione di **Agenda** (1.1.0 o successivo): iscritto quando la prenotazione è fatta.

Ognuna si può spegnere nelle impostazioni, e questi iscritti possono andare in liste e tag a parte. Il testo della casella è il consenso registrato.

**Per chi sviluppa**: la casella passa da un piccolo registro su `globalThis[Symbol.for('cleitext.newsletter.optIn')]` (`version: 1`), vedi [`src/optin.ts`](./src/optin.ts). Un plugin chiede `checkbox({ siteId, locale, source })` quando disegna il suo modulo (null: non mostrare nulla) e chiama `subscribe({ siteId, source, email, name | firstName/lastName, locale, ip })` quando il modulo è accettato con la casella (campo `cx_newsletter`, valore `1`) spuntata. `subscribe` non lancia mai errori e lavora in sottofondo. Senza NewLetter il registro non c’è e i moduli restano come prima.

## Consenso e registro

Ogni iscrizione finisce in **NewLetter → Iscrizioni**: data, da dove arriva (il modulo di iscrizione, un modulo di contatto, la cassa, una prenotazione), le liste, l’esito (iscritto, in attesa di conferma, già iscritto, trattenuta come spam, errore, con il messaggio del servizio) e il **consenso**: data e ora, il testo accettato e un’impronta dell’indirizzo IP. Il registro **non contiene indirizzi email né IP in chiaro**: un indizio (`m•••@e•••.com`) e impronte con chiave (HMAC con un segreto del sito), che bastano a trovare le righe di una persona per una richiesta GDPR ma non a leggerle. Le righe sono cancellate dopo un numero di giorni (180 di serie; 0 le conserva).

Le richieste di esportare o cancellare i dati di una persona (plugin Privacy) comprendono le sue righe del registro; il contatto vero e proprio sta nel servizio di email, dove va tolto anche lì (la cancellazione lo ricorda). L’informativa generata dal plugin **Privacy** (1.7.0 o successivo) ha una sezione **Newsletter** con il nome del tuo servizio, la base giuridica (il consenso), il double opt-in e per quanto tempo si conserva la registrazione del consenso.

## Tracciamenti dei servizi

NewLetter **non aggiunge script dei servizi** alle pagine: nessun pixel, niente `sdk-loader.js` di Brevo, nessuno script di sito di Mailchimp. Se ne vuoi uno (per esempio il tracciamento web di Brevo o il popup di Mailchimp), aggiungilo tramite il plugin **Privacy** così aspetta il consenso: incollalo in **Privacy → Banner dei cookie** nella categoria **Marketing**, oppure scrivilo in una pagina o nel tema come `<script type="text/plain" data-cx-category="marketing" src="…">`. Parte solo dopo che il visitatore accetta Marketing, e i suoi cookie vanno elencati nella cookie policy.

## Importazione da WordPress

Con il **WordPress Importer** (1.30.0 o successivo) questi diventano il blocco Iscrizione alla newsletter, e il resoconto dell’importazione li elenca:

- **Mailchimp for WP**: `[mc4wp_form id="…"]` e il suo blocco, con le audience del modulo (lette dal post `mc4wp-form` dell’esportazione), i campi e il testo del pulsante;
- **moduli incorporati di Mailchimp** (`…list-manage.com/subscribe/post?u=…&id=…` in un blocco HTML), con l’id dell’audience;
- **moduli incorporati di Brevo** (`sibforms.com`, come iframe o codice HTML) e lo shortcode del plugin di Brevo `[sibwp_form]`;
- moduli incorporati di **MailerLite**, **Kit** e **ActiveCampaign**, con i loro gruppi, moduli o liste;
- **The Newsletter Plugin**: `[newsletter_form]` e `[newsletter]` (con i suoi `[newsletter_field]`);
- **MailPoet**: `[mailpoet_form id="…"]` e il suo blocco.

Le liste importate si usano solo se appartengono al servizio che colleghi (le audience di Mailchimp con Mailchimp, e così via); altrimenti il modulo usa le tue liste predefinite. Le liste di The Newsletter Plugin e di MailPoet stanno dentro WordPress e non si possono spostare: esporta quegli iscritti da WordPress e importali nel tuo servizio.

## Limiti

- Un servizio per sito.
- Brevo non ha i tag e il suo double opt-in vuole un modello DOI; ActiveCampaign non può mandare la sua conferma tramite API; con Kit il double opt-in è l’impostazione del modulo Kit che scegli.
- L’API di MailerLite non dà il nome dell’account: l’amministrazione mostra "MailerLite".
- Le iscrizioni partono mentre il visitatore aspetta (pochi secondi al massimo); le caselle "Iscrivimi" degli altri plugin partono in sottofondo.
- Il limite di tentativi per visitatore è tenuto da ogni processo del server.

## Rinominare il plugin

Slug, nomi, motto, prefisso delle tabelle, blocco, capacità, id del modulo, indirizzo pubblico, shortcode, marcatore CSS e variabile dei test vengono tutti da [`src/config.ts`](./src/config.ts); il manifesto (`cleitext.plugin.json`: `slug`, `name`, `capabilities`) e il nome del pacchetto devono corrispondere, e i nomi delle tabelle della migrazione devono iniziare con `TABLE_PREFIX` (un test controlla tutto). Per rinominare: cambia `src/config.ts`, il manifesto, `package.json`, la cartella, la migrazione (solo prima del primo rilascio: le migrazioni installate non si possono cambiare), `'newletter'` in `tools/release/index.mjs`, lo spec e2e (`apps/admin/e2e/newletter.spec.ts`), i testi che dicono "NewLetter" nell’amministrazione, i testi italiani e questi README. Il registro delle caselle (`cleitext.newsletter.optIn`, campo `cx_newsletter`) non segue il nome, quindi Forms, Cleishop e Agenda non cambiano. Lo schema del database segue lo slug (`plg_<slug>`): una copia installata, dopo il cambio di nome, è un altro plugin.

## Sviluppo e test

```bash
pnpm --filter @cleitext/plugin-newletter test          # adattatori, modulo, consenso, registro, importazione, il plugin su un core finto
pnpm --filter @cleitext/plugin-newletter test:coverage
pnpm --filter @cleitext/plugin-newletter typecheck
```

Gli adattatori sono provati con un client HTTP finto per ogni servizio (riuscita, già iscritto, chiave non valida, double opt-in, errori). Il test end-to-end (`apps/admin/e2e/newletter.spec.ts`) non parla mai con un account vero: avvia il server con **`NEWLETTER_TEST_ENDPOINT=http://127.0.0.1:4799`** e ogni richiesta destinata a un servizio va invece a quell’indirizzo locale (`<endpoint>/<host del servizio><percorso>`; si accetta solo `http` su `127.0.0.1` o `localhost`), dove lo spec fa girare un Brevo finto. Senza la variabile lo spec viene saltato. Non impostarla mai in produzione.
