# turboSMTP

🇬🇧 [Read in English](./README.md)

Il plugin ufficiale di Cleitext per **[turboSMTP](https://www.serversmtp.com)**: tutte le email del sito partono tramite turboSMTP, così recupero password, ordini, prenotazioni e messaggi dei moduli arrivano nella posta in arrivo e non nello spam. È un'integrazione per il servizio turboSMTP fatta da Cleitext: non è realizzata né supportata da turboSMTP. Funziona come il plugin WordPress ufficiale di turboSMTP (4.9.8). È gratuito e non è nel pacchetto base: si installa da **Plugin → Aggiungi nuovo** (catalogo), oppure caricando `cleitext-plugin-turbosmtp-<versione>.zip` in **Plugin → Carica plugin**. Richiede Cleitext 0.93 o successivo (API dei plugin 1.60). Serve un account turboSMTP (c'è un piano gratuito).

## Configurazione

Apri **turboSMTP** nel menu dell'admin (dopo Impostazioni):

1. **Collega l'account**, in uno dei due modi:
   - **Chiavi API**: creale in turboSMTP → Impostazioni → Chiavi API e incolla Consumer Key e Consumer Secret;
   - **Email e password**: il plugin accede una volta, crea le chiavi API di questo sito (con il suo nome) ed esce. La password non viene conservata.
2. **Invio**: con l'**API di turboSMTP** (consigliata: veloce, e funziona anche dove le porte SMTP del server sono chiuse) oppure con i suoi **server SMTP**, europeo (`pro.eu.turbo-smtp.com`, dati nell'UE) o internazionale (`pro.turbo-smtp.com`), sulla porta 587, 465, 25 o 2525. L'SMTP richiede utente (di solito l'email dell'account) e password, che vengono verificati con turboSMTP prima di salvarli.
3. **Mittente**: indirizzo e nome per le email del sito. Vuoti, quelli del sito (Impostazioni → Email, oppure `no-reply@` il dominio del sito). Usa un indirizzo di un dominio verificato in turboSMTP. Un mittente scelto per una singola email, per esempio da un modulo di contatto, resta.
4. **Email di prova**: invia un messaggio tramite turboSMTP e mostra la risposta di turboSMTP se lo rifiuta.

Un interruttore spegne l'invio tramite turboSMTP senza scollegare l'account. **Scollega** cancella le chiavi e la password SMTP.

## Il sito non smette mai di inviare

Il plugin prende le email con l'aggancio `mail.deliver` del core (API dei plugin 1.60). Se turboSMTP non accetta un'email (un errore, una quota, il servizio irraggiungibile), il core la spedisce nel modo solito, con le impostazioni SMTP del sito o quelle del server, e la pagina del plugin mostra l'ultimo errore. Disattivando il plugin torna subito l'invio del sito.

## Statistiche

**turboSMTP → Statistiche** legge le statistiche di turboSMTP per un periodo (di base gli ultimi 30 giorni): email inviate, consegnate, aperte, cliccate e respinte con la loro percentuale, un grafico al giorno e l'elenco dei messaggi, filtrato per esito (anche in coda, disiscritti, segnalati come spam, scartati), una pagina alla volta, con l'errore di turboSMTP per ciascuno. Il resto è nella dashboard di turboSMTP.

## Privacy e sicurezza

- Il plugin chiede il permesso `mail:transport`: vede tutte le email del sito, compresi i link per reimpostare la password, quindi attivarlo chiede il consenso dell'amministratore.
- Le chiavi e la password SMTP sono conservate cifrate con i segreti del sito e non tornano mai al browser.
- Le email e i loro destinatari vanno a turboSMTP, che li tratta per conto del sito: va indicato nell'informativa sulla privacy. I server europei tengono i dati nell'UE.
- Solo gli amministratori possono gestirlo (capacità `manage_turbosmtp`).

## Sviluppo

```sh
pnpm --filter @cleitext/plugin-turbosmtp test
pnpm --filter @cleitext/plugin-turbosmtp build
```

`TURBOSMTP_TEST_ENDPOINT=http://127.0.0.1:<porta>` manda ogni richiesta a turboSMTP a un servizio finto locale (come `<base>/<host><percorso>`), solo per i test.

## Licenza

GPL-2.0-or-later. turboSMTP è un marchio del suo titolare.
