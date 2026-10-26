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

### Font da Google e Bunny

Le pagine che caricano **Google Fonts** (`fonts.googleapis.com`, `fonts.gstatic.com`) o **Bunny Fonts** (`fonts.bunny.net`) inviano a quel servizio l'indirizzo IP del visitatore appena si aprono, prima di qualsiasi consenso: un tribunale tedesco ha sanzionato un sito per questo (LG München, 20 gennaio 2022) e il Garante italiano è dello stesso avviso. Bunny è nell'UE e non tiene log, ma resta una terza parte. **Privacy → Banner cookie → Font da Google e Bunny → Controlla il sito** legge la home page e le ultime pagine e articoli come un visitatore (senza cookie), con i fogli di stile del sito che usano (e quelli che importano), ed elenca le pagine che caricano quei font e da dove. Gli script bloccati fino al consenso e i commenti HTML non contano. Vengono lette solo quelle pagine: un font caricato da uno script dopo l'apertura della pagina non viene visto.

Per correggere, ospita i font sul sito. Cleitext lo fa da sé per ogni tema e plugin (vedi [Web font ospitati sul sito](#web-font-ospitati-sul-sito) qui sotto): quello che il controllo elenca ancora viene da un file di stile di un tema o di un plugin (indicato sotto la pagina), da correggere lì, oppure da un sito in cui l'impostazione è stata cambiata. **Fresco** (**Impostazioni del sito → Font globali → Google Fonts → Ospita su questo sito**, il predefinito da Fresco 2.8) e **Prisma** (**Impostazioni → Prisma → Google Fonts → Ospita su questo sito**, il predefinito da Prisma 0.7) ospitano i propri font allo stesso modo; con più di uno in una pagina, una famiglia è collegata una volta sola.

### Web font ospitati sul sito

Fa parte di Cleitext stesso, con o senza il plugin Privacy. **Impostazioni → Generali → Privacy → Web font da Google Fonts e Bunny Fonts**:

- **Ospitali su questo sito** (il predefinito, anche per i siti esistenti): dopo che il tema e i plugin hanno generato una pagina, il core sostituisce ogni link a un foglio di stile di Google Fonts o Bunny Fonts (`<link rel="stylesheet">`, un preload di stile, `@import` in uno `<style>`) con i link alle copie tenute dal sito, uno per famiglia (`/_fonts/<hash>.css`, con il suo `data-font-family`), e toglie i `preconnect`, i `dns-prefetch` e i preload di font verso quei servizi. Il server scarica ogni famiglia una volta (solo da `fonts.googleapis.com`, `fonts.gstatic.com` e `fonts.bunny.net`, in https, con limiti di dimensione e di tempo; solo file WOFF2), la tiene nel database del sito e la serve con una cache di un anno. Finché la copia di una famiglia non è pronta (una pagina la attende al massimo 2,5 secondi; un download fallito viene ritentato più tardi, da 10 minuti fino a 6 ore di distanza) la pagina è senza quella famiglia, mai con il link al servizio, e le pagine in cache vengono rigenerate quando la copia è pronta. L'editor a blocchi riceve i font del tema dalle stesse copie.
- **Caricali da Google o Bunny Fonts**: i link restano; vengono tolti solo quelli verso famiglie che Fresco o Prisma ospitano già sul sito per quella pagina.
- **Lascia le pagine come le ha scritte il tema**: il core non tocca le pagine.

I font dichiarati solo dentro un file di stile di un tema o di un plugin (un `@import` o un `@font-face` in un file `.css`), o caricati da uno script, non vengono visti: il controllo qui sopra li elenca. I font di icone dei servizi (`fonts.googleapis.com/icon`, Material Icons) restano come sono.

### Script bloccati fino al consenso

In **Privacy → Banner cookie** incolla il codice di statistiche, pubblicità o pixel nella sua categoria: arriva nella pagina inattivo (`<script type="text/plain">`, iframe senza `src`) e parte solo dopo che il visitatore ha accettato quella categoria. Nelle pagine e nei temi, scrivi gli script come `<script type="text/plain" data-cx-category="statistics">` e gli iframe con `data-cx-src="…" data-cx-category="marketing"` per lo stesso comportamento. Video, mappe e post di altri siti nelle pagine (YouTube, anche `youtube-nocookie.com`, Vimeo, TikTok, Instagram, Facebook, X, incorporamenti…) aspettano la categoria **Marketing** quando il banner la propone (o quella scelta in **Categoria dei contenuti incorporati**, dalla 1.8.0; un iframe con un proprio `data-cx-category` proposto aspetta quella), con un avviso al loro posto fino ad allora, che nomina il fornitore e la categoria. Anche gli script degli incorporamenti segnati `<script data-cx-embed="Fornitore">` (lo script di un post social mantenuto dall'importatore WordPress) restano fermi, con l'avviso prima di loro; il suo **Accetta e mostra** li avvia senza ricaricare la pagina.

**Google Consent Mode v2**: se attiva, i tag di Google partono con tutto _negato_ e seguono la scelta (`statistics` → `analytics_storage`, `marketing` → `ad_storage`, `ad_user_data`, `ad_personalization`, `preferences` → `functionality_storage`, `personalization_storage`).

Gli script del sito possono leggere la scelta: `window.cleitextConsent.get()` restituisce le categorie accettate, `window.cleitextConsent.open()` apre il banner, e a ogni scelta viene emesso l'evento `cleitext:consent`.

## Gestori dei consensi: iubenda, Cookiebot, CookieYes

I siti che usano già un gestore dei consensi esterno (CMP) lo scelgono in **Privacy → Banner cookie → Gestore dei consensi**; **Privacy (banner integrato)** resta il predefinito, e nulla viene caricato da un CMP finché non se ne sceglie uno. Ogni scelta collega la dashboard del CMP e dice dove trovare i suoi ID, controllati mentre si scrivono:

- **iubenda** (Cookie Solution): l'ID del sito e l'ID della cookie policy (numeri, in Cookie Solution → Incorpora). iubenda ha una policy per lingua: in un sito multilingua indica l'ID di ogni lingua. Il banner parla la lingua della pagina, o una fissa; altre opzioni di `_iub.csConfiguration` si aggiungono in JSON (`siteId`, `cookiePolicyId`, `lang` e le callback le imposta il plugin; `perPurposeConsent` è attivo).
- **Cookiebot** (Usercentrics): l'ID del gruppo di domini (cbid) e la modalità di blocco. **Manuale** (il predefinito) lascia a questo plugin il blocco di script e contenuti incorporati; **automatica** fa riscrivere a Cookiebot da sé gli script della pagina, e può entrare in conflitto con quelli trattenuti qui: usala solo per qualcosa che non viene trattenuto altrimenti. La lingua del banner segue la pagina (`data-culture`).
- **CookieYes**: la chiave del sito, presa dal codice di installazione o dall'indirizzo dello script (`https://cdn-cookieyes.com/client_data/<chiave>/script.js`) quando li incolli. Attiva il suo rilevamento della lingua per il banner nella lingua della pagina.

Con un gestore dei consensi il banner integrato, il suo pulsante nell'angolo e il cookie `cx_consent` sono spenti, e lo script ufficiale del CMP è il primo nel `<head>`, dopo i valori predefiniti di Google Consent Mode quando li imposta questo plugin. Tutto ciò che è trattenuto continua ad aspettare il consenso: gli script incollati per categoria, gli script `type="text/plain" data-cx-category`, gli iframe `data-cx-src` e i video, le mappe e i post di altri siti. Un piccolo script segue la scelta del CMP, all'apertura della pagina e a ogni cambiamento, e li rilascia per categoria:

| Categoria qui | iubenda (finalità)          | Cookiebot                       | CookieYes                  |
| ------------- | --------------------------- | ------------------------------- | -------------------------- |
| Preferenze    | 2 Interazioni, 3 Esperienza | `Cookiebot.consent.preferences` | `functional`               |
| Statistiche   | 4 Misurazione               | `Cookiebot.consent.statistics`  | `analytics`, `performance` |
| Marketing     | 5 Marketing                 | `Cookiebot.consent.marketing`   | `advertisement`            |

La scelta si legge da `_iub.cs.api.getPreferences()` (con `onPreferenceExpressedOrNotNeeded` e le altre callback; quando iubenda dice che il consenso non serve, tutto viene rilasciato), da `Cookiebot.consent` (con `CookiebotOnConsentReady`, `CookiebotOnAccept`, `CookiebotOnDecline`) e da `getCkyConsent()` e l'evento `cookieyes_consent_update`. Quando si revoca una categoria i cui script sono già partiti, la pagina si ricarica, così si fermano.

Il pulsante **Preferenze cookie** di un contenuto trattenuto, le voci di menu con `#cookie-preferences`, il blocco **Pulsante preferenze cookie** e gli elementi `[data-cx-open]` aprono le preferenze del CMP (`_iub.cs.api.openPreferences()`, `Cookiebot.renew()`, il banner di CookieYes). **Accetta e mostra** dà il consenso al Marketing tramite il CMP (`_iub.cs.api.setPreferences()`, `Cookiebot.submitCustomConsent()`, `performBannerAction('accept_partial')` di CookieYes con i suoi interruttori) e apre il CMP quando non è possibile. Gli altri script continuano a usare `window.cleitextConsent.get()`, `window.cleitextConsent.open()` e l'evento `cleitext:consent`; `window.cleitextConsent.allow('marketing')` chiede una categoria al CMP.

**Google Consent Mode**, se attiva (o attivata da Analytics), la imposta il gestore dei consensi per impostazione predefinita: iubenda riceve `googleConsentMode: true`; lascia attivo il Consent Mode in Cookiebot (il predefinito); attiva _Support Google Consent Mode (GCM)_ in CookieYes. Il plugin allora non emette valori predefiniti propri, così non vengono mai inviati due volte. Scegli invece **Questo plugin** perché sia il plugin a impostare i valori predefiniti (tutto negato) prima del CMP e a inviare gli aggiornamenti: `googleConsentMode` di iubenda e il Consent Mode di Cookiebot (`data-consentmode="disabled"`) vengono disattivati per te, mentre in CookieYes spegni tu il GCM.

**Registro dei consensi**: il CMP registra ogni consenso come prova e lo conserva nella sua dashboard, quindi il registro di questo plugin non viene scritto (`/_privacy/consent` risponde 404); le registrazioni fatte prima restano. La tabella dei cookie elenca il cookie di consenso del CMP (`_iub_cs-<id>`, `CookieConsent`, `cookieyes-consent`) al posto di `cx_consent`.

**Policy**: con iubenda, **Mostra la privacy e cookie policy di iubenda nelle pagine delle policy** fa creare a **Privacy → Policy** pagine con il blocco **Policy del gestore dei consensi**, che mostra la policy di iubenda nella lingua della pagina con il suo codice ufficiale: un link che la apre (tutti i piani) o il testo nella pagina (`iub-body-embed`, piani Advanced e Ultimate); il blocco **Tabella dei cookie** mostra la cookie policy di iubenda. Con Cookiebot, **Mostra la dichiarazione dei cookie di Cookiebot** fa mostrare al blocco **Tabella dei cookie** la dichiarazione dei cookie trovati da Cookiebot (`cd.js`); la privacy policy resta quella scritta qui. Con CookieYes restano le policy scritte qui.

**Content Security Policy**: le pagine pubbliche di Cleitext inviano una policy che vieta solo i plugin del browser, il dirottamento di `<base>` e l'inclusione in frame da altri siti, quindi script e frame dei CMP non richiedono nulla. Una policy più severa aggiunta da un proxy deve permettere le loro origini: `cdn.iubenda.com`, `www.iubenda.com`, `cs.iubenda.com`; `consent.cookiebot.com`, `consentcdn.cookiebot.com`; `cdn-cookieyes.com`, `log.cookieyes.com`.

Il controllo **Font da Google e Bunny** e gli altri controlli funzionano allo stesso modo con un gestore dei consensi.

## Registro dei consensi

Ogni scelta viene registrata come prova (art. 7.1 GDPR): un id casuale conservato nel cookie `cx_consent` del visitatore, le categorie, la versione del banner, l'IP senza l'ultima parte e il browser. **Privacy → Registro consensi** mostra i totali e le ultime scelte, e le scarica tutte in CSV. Le registrazioni più vecchie del periodo di conservazione (24 mesi di default) vengono cancellate. Con un gestore dei consensi esterno il registro lo tiene lui (vedi sopra).

## Policy

**Privacy → Policy** chiede chi è il titolare del trattamento e cosa fa il sito (moduli di contatto, account, newsletter, statistiche, contenuti incorporati, hosting), poi crea le bozze **Privacy policy** e **Cookie policy** in ogni lingua del sito, fatte di blocchi normali da modificare nell'editor. La cookie policy contiene il blocco **Tabella dei cookie**, sempre allineato a **Privacy → Cookie**, e il **Pulsante preferenze cookie**. Una volta pubblicate, il banner le collega, e l'elenco delle pagine le segna con l'etichetta _Privacy policy_ o _Cookie policy_.

Altri plugin che conservano dati personali possono aggiungere una sezione alla **privacy policy** generata (Privacy 1.7): mettono una funzione nella mappa su `globalThis` sotto `Symbol.for('cleitext.privacy.policySections')`, con il loro slug, che risponde `{ title, text }[]` per un sito e una lingua (`async ({ siteId, locale }) => …`, nulla sui siti dove non sono attivi). Il plugin ufficiale **Agenda** descrive così i suoi appuntamenti, con il periodo di conservazione.

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
