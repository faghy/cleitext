# Moduli

Il plugin ufficiale di Cleitext per i moduli di contatto. È incluso in Cleitext: attivalo in **Plugin**.

## Cosa fa

Il blocco **Modulo di contatto** funziona senza JavaScript. Ogni messaggio resta in **Messaggi** nell'amministrazione e, se imposti un indirizzo in **Impostazioni → Moduli**, ti arriva per email, con il Rispondi a impostato sull'indirizzo del visitatore, così ti basta rispondere.

Di serie il modulo chiede nome, email e messaggio (e il telefono, se vuoi). Dalla versione 1.3.0 puoi invece costruire il tuo modulo, come faresti con Contact Form 7:

- **Campi tuoi**, nell'ordine che vuoi: testo, email, telefono, numero, data, testo lungo, menu a tendina, caselle di spunta, scelta singola e **consenso** (una casella obbligatoria, ad esempio "Accetto la [privacy policy](/privacy-policy)").
- Ogni campo ha un'**etichetta**, un **testo segnaposto**, l'interruttore **obbligatorio** e una **larghezza su desktop**: intera, 1/2, 1/3, 1/4 o 1/6. Sui tablet i campi occupano metà o un terzo della riga; sui telefoni stanno uno sotto l'altro. Una classe CSS aggiuntiva è a disposizione del tuo tema.
- Numeri e date possono avere un **minimo e un massimo** (le date come `2027-07-10`).
- Le opzioni di menu, caselle e scelte singole vanno una per riga, come `valore|etichetta` o solo il testo.
- Il **consenso e il pulsante sulla stessa riga**, se ti piace.
- L'**oggetto dell'email** lo decidi tu: `{form}` è il nome del modulo e `{nome-campo}` il valore di un campo, ad esempio `Prenotazione di {your-name}`. Se lo lasci vuoto resta `[nome del modulo] nome`.
- Il **Rispondi a** è il campo email del visitatore: il primo, o quello che indichi.
- L'email elenca tutti i campi con la loro etichetta, nell'ordine del modulo, e **Messaggi** li mostra allo stesso modo.

Il server ricontrolla ogni messaggio, qualunque cosa abbia fatto il browser: campi obbligatori, indirizzi email, numeri e date entro i limiti, opzioni esistenti, lunghezze. I campi che il modulo non ha vengono ignorati. Lo spam resta fuori grazie a un campo nascosto, a un limite di cinque messaggi ogni dieci minuti per visitatore e, con il plugin **Captcha**, a Turnstile o reCAPTCHA. Con il plugin **Antispam**, i messaggi che giudica spam restano nella sua coda dello spam invece di essere inviati; lì **Non è spam** li salva e li invia per email come se fossero appena arrivati.

Con il plugin **NewLetter** attivo e collegato a un servizio di email marketing, il modulo può offrire la casella **Iscrivimi alla newsletter**, non spuntata (solo su scelta del visitatore, Forms 1.6.0): l'iscrizione parte solo se il visitatore la spunta e il messaggio viene consegnato (non quando è trattenuto come spam, finché non viene liberato).

I messaggi fanno parte degli strumenti privacy del sito: **Privacy → Richieste** li esporta e li cancella per indirizzo email.

## Come si usa

1. Attiva **Moduli** in **Plugin** e imposta in **Impostazioni → Moduli** l'indirizzo che riceve i messaggi.
2. Aggiungi il blocco **Modulo di contatto** a una pagina.
3. Per fare il tuo modulo apri **Campi** nel blocco e fai clic su **Aggiungi** per ogni campo. Con le frecce ne cambi l'ordine.

Un esempio, la richiesta di prenotazione di un hotel:

| Etichetta / segnaposto                       | Nome        | Tipo        | Larghezza | Obbligatorio |
| -------------------------------------------- | ----------- | ----------- | --------- | ------------ |
| Nome                                         | `your-name` | Testo       | 1/6       | sì           |
| Email                                        | `email`     | Email       | 1/6       | sì           |
| Telefono                                     | `phone`     | Telefono    | 1/6       |              |
| Numero ospiti                                | `guests`    | Numero      | 1/6       |              |
| Arrivo                                       | `arrival`   | Data        | 1/6       | sì           |
| Partenza                                     | `departure` | Data        | 1/6       | sì           |
| Richieste particolari                        | `requests`  | Testo lungo | intera    | sì           |
| Accetto la [privacy policy](/privacy-policy) | `privacy`   | Consenso    |           |              |

Con **Consenso e pulsante sulla stessa riga** attivo, il pulsante "INVIA LA RICHIESTA" e l'oggetto `Sito Hotel aurora Varazze`, su computer i sei campi stanno su una riga, le richieste sotto, poi il consenso accanto al pulsante.

## Per gli sviluppatori

- Blocco `forms/contact`. Attributi: `formName`, `buttonLabel`, `askPhone`, `successMessage`, `privacyUrl` e, dalla 1.3.0, `fields` (una lista di `{ name, type, label, placeholder, required, width, options, min, max, className }`), `subject`, `replyTo`, `submitInline`. Senza `fields` il blocco disegna il modulo classico esattamente come prima.
- I campi arrivano al server firmati (HMAC-SHA256 con una chiave del sito conservata nei segreti del plugin) nel campo nascosto `_spec`, così una richiesta non può cambiare ciò che viene controllato né l'oggetto. Il destinatario viene solo dalle impostazioni.
- I messaggi sono nella tabella `plg_forms.submissions`; `data` (jsonb, 1.3.0) contiene tutti i campi di un modulo personalizzato come `{ name, label, type, value }`, in ordine. `GET /api/v1/ext/forms/submissions` lo restituisce come `fields`.
- La griglia: il modulo ha la classe `cf-grid` (dodici colonne da 1024px), ogni campo `cf-field cf-<tipo> cf-w-<larghezza>` (ad esempio `cf-w-1-6`) e la riga di consenso e pulsante `cf-submit-row`.
- API dei plugin 1.43: attributi lista nell'editor a blocchi.
