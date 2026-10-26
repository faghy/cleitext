# Passaparola

🇬🇧 [Read in English](./README.md)

> **Chi ama il tuo sito ti porta clienti.**

Il plugin ufficiale di Cleitext per **il tuo programma di affiliazione**: chi apprezza il tuo sito si iscrive come affiliato, riceve un link personale e guadagna una commissione sulle vendite, le prenotazioni o i contatti che porta. È gratuito e non è nel pacchetto base: installalo da **Plugin → Aggiungi nuovo** (catalogo), oppure carica `cleitext-plugin-passaparola-<versione>.zip` in **Plugin → Carica plugin**. Richiede Cleitext 0.89 o successivo (API dei plugin 1.58).

## Come funziona

1. Un membro del sito fa richiesta: dal blocco **Richiesta di affiliazione** in una pagina, oppure da **Diventa affiliato** nel suo account (`/account/affiliate`). Accetta le condizioni del programma e può scegliere il suo codice e indicare i dati per i pagamenti (PayPal o IBAN).
2. Tu approvi la richiesta (oppure ogni richiesta viene approvata subito, è un'impostazione). L'affiliato riceve un'email con il suo codice.
3. Nella sua **area affiliato** (`/account/affiliate`) l'affiliato trova il suo link, `https://il-tuo-sito/?ref=<codice>`, con il pulsante per copiarlo, le visite e le conversioni che ha portato, i guadagni (in attesa, da pagare, pagati), i pagamenti ricevuti e i suoi dati per i pagamenti.
4. Un visitatore arriva dal link. Se accetta i cookie della categoria scelta (Marketing per default), il codice viene ricordato per 30 giorni (un'impostazione). Se in quel periodo acquista, prenota o scrive, la conversione viene attribuita all'affiliato.
5. La commissione attende il periodo per i rimborsi (30 giorni per default), poi viene approvata. Rimborsi e annullamenti la tolgono.
6. In **Passaparola → Pagamenti** vedi quanto spetta a ogni affiliato, lo paghi con PayPal o con un bonifico, lo esporti in CSV e lo segni come pagato: l'affiliato riceve un'email.

## Fonti

La versione gratuita conta le conversioni di **una fonte**, scelta nelle impostazioni:

| Fonte                     | Conversione                                                               | Importo                      |
| ------------------------- | ------------------------------------------------------------------------- | ---------------------------- |
| **Cleishop** (ordini)     | un ordine pagato (in lavorazione o completato), dalla 1.10.0              | i prodotti (netti)           |
| **Agenda** (prenotazioni) | una prenotazione confermata, dalla 1.2.0; Agenda non incassa pagamenti    | 0: usa una commissione fissa |
| **Store** (licenze)       | una licenza venduta con Lemon Squeezy, o a mano con il suo prezzo (1.4.0) | il prezzo                    |
| **Forms** (contatti)      | un messaggio inviato, dalla 1.7.0                                         | 0: usa una commissione fissa |

Le conversioni che gli affiliati portano da altre fonti non vengono contate: l'amministrazione mostra quante sono state, con l'invito a **Passaparola Pro** (tutte le fonti insieme, regole per prodotto, commissioni ricorrenti, coupon, materiali, pagamenti PayPal).

Per le vendite dello Store con Lemon Squeezy il cookie del visitatore non arriva al checkout: passa il codice al checkout come dato personalizzato, `checkout[custom][ref_passaparola]=<codice>`.

## Commissioni

- **Percentuale** della vendita (10% per default): dei prodotti di un ordine di Cleishop, senza spedizione e tasse; dell'importo per le altre fonti. Oppure un **importo fisso** per conversione, anche per contatti e prenotazioni, che non hanno un importo.
- Ogni affiliato può avere una commissione personale (Affiliati → Modifica).
- **Stati**: in attesa → approvata (dopo il periodo per i rimborsi) → pagata; annullata quando tutto viene rimborsato prima del pagamento.
- **Rimborsi**: un rimborso parziale riduce la commissione in proporzione; il rimborso di una commissione già pagata diventa una rettifica negativa, tolta dal pagamento successivo.
- **Auto-referral**: gli ordini dell'affiliato stesso non contano (stesso account o stessa email).
- **Primo o ultimo clic**: quando un visitatore ha usato due link, vince l'ultimo (un'impostazione).

## Impostazioni

Passaparola → Impostazioni: la fonte, l'approvazione (a mano o subito), la commissione (percentuale o fissa, valuta), il periodo per i rimborsi, la soglia di pagamento, la pagina delle condizioni del programma, il parametro del link (`ref`), la durata del cookie, primo o ultimo clic, la categoria di consenso, le email (ognuna si può spegnere) e chi riceve le richieste (vuoto: gli amministratori del sito).

## Blocchi

- **Richiesta di affiliazione**: il modulo, con le condizioni del programma. A chi non ha fatto l'accesso chiede prima di accedere o di creare un account (il sito deve permettere le iscrizioni: Impostazioni, Iscrizione, "Chiunque può registrarsi").
- **Link all'area affiliato**: "Area affiliato: accedi" per i visitatori, "La tua area affiliato" per gli affiliati.
- **Diventa affiliato**: un riquadro che invita i visitatori a entrare nel programma, con la commissione.

## Privacy

- Il tracciamento dei link segue il consenso del visitatore: il core imposta il cookie `cx_ref_passaparola` solo dopo che ha accettato la categoria scelta nel banner di **Privacy & GDPR** (il banner deve proporre quella categoria). Senza consenso, o senza banner, non viene salvato nulla e la conversione non viene attribuita. Le pagine restano in cache: il parametro viene tolto dallo script della pagina, mai dal server.
- Le **visite** sono contate per giorno e per affiliato: nessun indirizzo, nessun identificativo del visitatore.
- **Dati conservati**: degli affiliati, nome, email (del loro account), codice, sito e modo in cui ci promuovono, dati per i pagamenti (email PayPal, IBAN), quando hanno accettato le condizioni, le commissioni e i pagamenti; dei clienti, l'email e la descrizione della conversione attribuita a un affiliato. Privacy & GDPR li esporta e li cancella su richiesta (i pagamenti restano come registrazioni contabili, senza i dati di pagamento). Il plugin dichiara il suo cookie, che quindi compare nella cookie policy.
- L'attivazione del plugin chiede il consenso dell'amministratore: legge le email confermate dei membri (`users:read`), per le email e il controllo degli auto-referral.

## Rinominare il plugin

I nomi sono in `src/config.ts` e in `cleitext.plugin.json` (un test controlla che coincidano): dallo slug derivano lo schema del database, i blocchi, la capacità, il cookie e il tag di cache.

## Sviluppo e test

```sh
npx pnpm --filter @cleitext/plugin-passaparola test   # regole, importi, CSV, impostazioni, testi
npx pnpm --filter @cleitext/server exec vitest run test/passaparola.test.ts   # con Cleishop e Forms
```
