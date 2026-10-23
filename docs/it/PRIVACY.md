# Privacy e GDPR

> 🇬🇧 [Read in English](../PRIVACY.md)

Il plugin ufficiale di Cleitext per la conformità privacy nell'Unione europea: un banner dei cookie con consenso per categoria, un registro delle scelte, le pagine di privacy policy e cookie policy, e le richieste delle persone di esportare o cancellare i propri dati personali. Non è nel pacchetto base: scarica `cleitext-plugin-privacy-<versione>.zip` dalla pagina Releases e caricalo da **Plugin → Carica plugin**.

Segue il GDPR e, per l'Italia, le linee guida cookie del Garante del 10 giugno 2021. Le policy che scrive sono un punto di partenza: il titolare del sito le rivede e ne è responsabile.

## Banner dei cookie

- **Accetta tutti** e **Rifiuta tutti** con lo stesso aspetto; chiudere con la X significa continuare senza accettare; niente è preselezionato; **Personalizza** permette di scegliere le categorie: _Preferenze_, _Statistiche_, _Marketing_ (il sito sceglie quali offrire). I cookie _Necessari_ non richiedono consenso.
- Senza categorie facoltative il sito usa solo cookie tecnici e il banner non compare.
- La scelta dura 6 mesi (fino a 12), poi viene richiesta; viene richiesta di nuovo anche quando cambiano le categorie o l'elenco dei cookie, o con **Salva e chiedi di nuovo a tutti**.
- Si cambia la scelta da un piccolo pulsante in un angolo di ogni pagina, da una voce di menu con indirizzo `#cookie-preferences`, o dal blocco **Pulsante preferenze cookie**.
- Testi in italiano e inglese, oppure i tuoi per ogni lingua; barra o riquadro; il tuo colore. Usabile da tastiera.

### Servizi di altri plugin

I servizi aggiunti da altri plugin, come **Analytics** (Matomo, Google Analytics, Tag Manager, Meta Pixel), portano le proprie regole: la loro categoria viene offerta nel banner, i loro cookie entrano nella tabella dei cookie, la Google Consent Mode si attiva per i servizi Google e la privacy policy li descrive. **Privacy → Banner cookie → Servizi di tracciamento** li mostra.

### Script bloccati fino al consenso

In **Privacy → Banner cookie** incolla il codice di statistiche, pubblicità o pixel nella sua categoria: arriva nella pagina inattivo (`<script type="text/plain">`, iframe senza `src`) e parte solo dopo che il visitatore ha accettato quella categoria. Nelle pagine e nei temi, scrivi gli script come `<script type="text/plain" data-cx-category="statistics">` e gli iframe con `data-cx-src="…" data-cx-category="marketing"` per lo stesso comportamento. Video, mappe e post di altri siti nelle pagine (YouTube, anche `youtube-nocookie.com`, Vimeo, incorporamenti…) aspettano la categoria **Marketing** quando il banner la propone, con un avviso al loro posto fino ad allora.

**Google Consent Mode v2**: se attiva, i tag di Google partono con tutto _negato_ e seguono la scelta (`statistics` → `analytics_storage`, `marketing` → `ad_storage`, `ad_user_data`, `ad_personalization`, `preferences` → `functionality_storage`, `personalization_storage`).

Gli script del sito possono leggere la scelta: `window.cleitextConsent.get()` restituisce le categorie accettate, `window.cleitextConsent.open()` apre il banner, e a ogni scelta viene emesso l'evento `cleitext:consent`.

## Registro dei consensi

Ogni scelta viene registrata come prova (art. 7.1 GDPR): un id casuale conservato nel cookie `cx_consent` del visitatore, le categorie, la versione del banner, l'IP senza l'ultima parte e il browser. **Privacy → Registro consensi** mostra i totali e le ultime scelte, e le scarica tutte in CSV. Le registrazioni più vecchie del periodo di conservazione (24 mesi di default) vengono cancellate.

## Policy

**Privacy → Policy** chiede chi è il titolare del trattamento e cosa fa il sito (moduli di contatto, account, newsletter, statistiche, contenuti incorporati, hosting), poi crea le bozze **Privacy policy** e **Cookie policy** in ogni lingua del sito, fatte di blocchi normali da modificare nell'editor. La cookie policy contiene il blocco **Tabella dei cookie**, sempre allineato a **Privacy → Cookie**, e il **Pulsante preferenze cookie**. Una volta pubblicate, il banner le collega, e l'elenco delle pagine le segna con l'etichetta _Privacy policy_ o _Cookie policy_.

Il modulo di contatto del plugin **Moduli** ha un _Indirizzo della privacy policy_: se impostato, sotto il modulo compare una breve informativa con il link. Un modulo con campi propri (Moduli 1.3.0) può chiedere anche un **consenso**: una casella obbligatoria la cui etichetta può avere il link all'informativa.

## Richieste sui dati personali

Quando qualcuno chiede i propri dati (artt. 15 e 20 GDPR) o di cancellarli (art. 17), verifica chi è, poi inserisci la sua email in **Privacy → Richieste sui dati**:

- **Esporta** scarica un file JSON con ciò che il sito conserva su di lui: l'account di un membro del sito (profilo, sessioni, token, attività), i suoi commenti e mi piace, e i dati di ogni plugin che ha registrato un exporter, come i messaggi di Moduli.
- **Cancella** rende anonimi i suoi commenti come fa WordPress (il testo resta, senza nome, email, sito web e indirizzo IP), rimuove i suoi mi piace ed esegue gli eraser dei plugin (per esempio i messaggi di Moduli vengono eliminati). Gli account restano: eliminali da **Utenti** se serve.

Ogni richiesta viene registrata con la data e chi l'ha gestita; per le cancellazioni resta solo un indirizzo mascherato.

## Installazione

```bash
bin/cleitext plugin:install plugins/privacy
```

oppure carica lo zip da **Plugin → Carica plugin**, poi attivalo sul sito. Impostazioni, registrazioni e richieste restano se lo disattivi. Richiede Cleitext 0.13 o successivo (API dei plugin 1.4).
