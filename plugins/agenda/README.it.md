# Agenda

🇬🇧 [Read in English](./README.md)

Il plugin ufficiale di Cleitext per gli **appuntamenti online**: le sedute online di uno psicologo, i tagli di un parrucchiere, una lezione di yoga con otto posti. I clienti scelgono un orario tra quelli liberi e ricevono la conferma via email; tu trovi tutto nell'amministrazione. È gratuito e non è nel pacchetto base: installalo da **Plugin → Aggiungi nuovo** (catalogo), oppure carica `cleitext-plugin-agenda-<versione>.zip` da **Plugin → Carica plugin**. Serve Cleitext 0.80 o successivo (API dei plugin 1.51); dalla 0.81 usa da solo il fuso orario del sito.

La versione gratuita accetta **30 prenotazioni** per sito. **Agenda Pro** (un plugin a parte, a pagamento, in arrivo) ne accetta quante ne servono.

## Pronto in due minuti

Apri **Agenda** nel menu dell'amministrazione: una breve procedura guidata chiede cosa prenotano i clienti (nome e durata), quando (l'orario settimanale, per cominciare dal lunedì al venerdì 9–13 e 14–18), dove avvisarti delle prenotazioni (la tua email), poi crea e pubblica la pagina di prenotazione. Un'anteprima dal vivo mostra cosa vedranno i clienti mentre la configuri.

## Cosa vedono i clienti

Pochi passi, come su Calendly: **servizio → giorno → orario → dati → fatto**. Compaiono solo gli orari liberi; sul telefono ogni pulsante è alto almeno 44 pixel e il modulo è breve (nome, email, telefono se lo vuoi, le tue domande, il consenso). La conferma è subito sullo schermo, con **Aggiungi al calendario** (un file `.ics`) e **Google Calendar**, e nell'email, con il file del calendario allegato e un link per **annullare o spostare** l'appuntamento, senza account. Il giorno prima arriva un promemoria. I testi sono in italiano e in inglese.

Gli orari sono nel fuso del sito (ora legale compresa), con un pulsante per vederli nel fuso del visitatore, utile per le sedute online. Se nei giorni mostrati non c'è nulla di libero, un link porta al primo giorno libero.

## Funzioni

- **Servizi**: nome, descrizione, durata, tempo libero prima e dopo (buffer), con quanto anticipo minimo e massimo si prenota, un prezzo indicativo (solo testo, online non si paga), prenotabile o nascosto, **posti per orario** (1 per gli appuntamenti individuali, di più per un gruppo), categoria, colore, domande tue, testi nelle altre lingue del sito (Multilingual).
- **Orario settimanale**: fasce orarie con un nuovo orario ogni tot minuti (es. 9–13 ogni 30'), oppure **orari di inizio fissi** (es. giovedì 13:00, 14:15, 15:30). **Chiusure** (ferie, giorni liberi) e **giorni con un altro orario**, per tutti i servizi o per uno.
- **Un calendario o tanti**: di base un appuntamento occupa lo stesso orario per tutti i servizi (una persona o una stanza); spegnilo per dare a ogni servizio il suo calendario.
- **Mai due prenotazioni sullo stesso posto**: ogni prenotazione si salva dentro una transazione del database che blocca i servizi del sito e ricontrolla il posto, così due visitatori che chiedono lo stesso orario nello stesso istante vengono serviti uno dopo l'altro: uno lo ottiene, l'altro viene avvisato e rivede gli orari liberi. I gruppi si riempiono fino ai loro posti.
- **Approvazione**: un servizio può chiederti di confermare ogni prenotazione; il cliente riceve "richiesta ricevuta", poi la conferma. Nel frattempo l'orario resta occupato.
- **Email** con le impostazioni di posta del sito: conferma con il file del calendario, richiesta ricevuta, spostamento, annullamento, promemoria (24 ore prima, o come preferisci) e un avviso a te. Ogni testo si può cambiare, per lingua.
- **Amministrazione**: gli appuntamenti come elenco (filtri, ricerca, in arrivo o passati) o come calendario (giorno, settimana, mese); un appuntamento si apre con i dettagli, i pulsanti per confermare, annullare o segnare il **mancato arrivo**, un nuovo orario e note private. **Nuovo appuntamento** ne prenota uno a mano. **Esportazione CSV**. Un riquadro nella Bacheca: oggi, i prossimi 7 giorni, cosa confermare.
- **Protezione dai bot**: il modulo chiede al Captcha o all'Antispam del sito (la protezione dei moduli del core), con un campo nascosto per i bot semplici.
- **Privacy**: tutto resta nel database del sito. I dati personali degli appuntamenti passati vengono cancellati dopo un certo numero di mesi (24 di base); l'appuntamento resta, senza di essi. Le richieste di esportare o cancellare i dati di una persona comprendono gli appuntamenti, e la privacy policy generata dal plugin **Privacy** riceve una sezione sulle prenotazioni.
- **Importazione da WordPress** (Agenda → Importa):
  - **Simply Schedule Appointments**: la sua esportazione (Settings → Import/Export) o un dump delle tabelle `wp_ssa_*`: tipi di appuntamento con orari, buffer e preavviso, giorni di chiusura, appuntamenti passati e futuri con i loro clienti.
  - **Booking Calendar (WPBC)**: un dump o i CSV di `wp_booking`, `wp_bookingdates` e `wp_bookingtypes`: risorse (come servizi nascosti da rivedere) e prenotazioni, a orario o a giornate intere.
  - Importando di nuovo, si aggiorna invece di aggiungere. Le prenotazioni importate non contano mai nel limite della versione gratuita.
  - In un'importazione da WordPress, gli shortcode `[ssa_booking type="…"]` e `[booking type=…]` diventano il blocco Prenotazione, collegato al servizio importato.

## Mostrare il calendario

- il blocco **Prenotazione (Agenda)** nell'editor a blocchi (anche dentro i contenitori di Prisma), con il servizio (o la scelta del visitatore) e il calendario mensile o settimanale;
- il widget **Booking** in Fresco;
- lo shortcode `[agenda]` (o `[agenda service="<id>"]`) da solo in un paragrafo.

Si adatta al tema e si personalizza con le variabili CSS, ad esempio in **Aspetto → CSS aggiuntivo**:

```css
.ag {
  --agenda-accent: #0f766e; /* pulsanti, giorni liberi */
  --agenda-accent-text: #fff;
  --agenda-radius: 6px;
  --agenda-font: inherit;
}
```

Ci sono anche `--agenda-text`, `--agenda-muted`, `--agenda-bg`, `--agenda-surface`, `--agenda-border`, `--agenda-gap`, `--agenda-danger`.

## Il limite della versione gratuita

Conta ogni prenotazione fatta dal sito o a mano nell'amministrazione, **anche quelle annullate e passate**; quelle importate no. L'amministrazione mostra "12 / 30 prenotazioni", con un avviso da 25. A 30 la pagina di prenotazione mostra i tuoi contatti (Impostazioni → I tuoi contatti) al posto del calendario, e ricevi un'email. Non si cancella nulla, e gli appuntamenti già prenotati continuano a funzionare: i clienti possono ancora annullarli o spostarli.

## Per gli sviluppatori

**Estendere Agenda (Agenda Pro).** Agenda mette un'API del server su `globalThis` sotto `Symbol.for('cleitext.agenda')` (vedi `src/pro.ts`), ricreata a ogni ricaricamento dei plugin. Un plugin che richiede Agenda la trova nel suo `setup`:

```ts
const agenda = (globalThis as any)[Symbol.for('cleitext.agenda')];
agenda.bookingLimit.push(async (siteId) => ((await licensed(siteId)) ? Infinity : null));
agenda.blocked.push(async ({ siteId, service, from, to }) =>
  busyTimesOfMyCalendar(siteId, from, to),
);
agenda.booked.push(async ({ siteId, appointment, service }) => addVideoLink(appointment));
agenda.changed.push(async ({ appointment, previous }) => syncCalendar(appointment, previous));
```

- `bookingLimit`: vince la risposta più grande (`null`: nessuna opinione; Agenda risponde 30).
- `blocked`: orari che nessuno può prenotare (gli impegni di un calendario esterno).
- `booked`, `changed`: dopo il salvataggio di una prenotazione, e dopo un cambio di stato o di orario. Agenda emette anche le azioni `agenda.booked` e `agenda.changed`.
- Le estensioni che falliscono vengono registrate nel log e saltate.

**Dati.** Tabelle `services`, `exceptions` e `appointments` nello schema `plg_agenda`, con Row Level Security. I servizi tengono le impostazioni in una colonna JSON (`data`), estensioni comprese; gli appuntamenti tengono `source` (`site`, `admin` o `import`) e non vengono mai cancellati.

**Rinominare il plugin.** Slug, nomi, blocco, capability, id del modulo, indirizzi pubblici e marcatore CSS vengono tutti da `src/config.ts`; il manifest (`cleitext.plugin.json`: `slug`, `name`, `capabilities`) deve coincidere (lo controlla un test). Per rinominare: cambia `src/config.ts` e il manifest, il `name` di `package.json`, la cartella, i nomi delle azioni `agenda.booked`/`agenda.changed` in `src/server.tsx` (la declaration merging di TypeScript vuole nomi letterali), `'agenda'` in `tools/release/index.mjs`, i testi italiani che dicono "Agenda" e questi README. Lo schema del database segue lo slug (`plg_<slug>`): una copia già installata, dopo il cambio, è un altro plugin.
