# Feed social

🇬🇧 [Read in English](./README.md)

Il plugin ufficiale di Cleitext che mostra sul sito gli ultimi post del tuo account **Instagram** e della tua **Pagina Facebook**. È gratuito e non fa parte del pacchetto base: installalo da **Plugin → Aggiungi nuovo** (catalogo), oppure scarica `cleitext-plugin-social-feed-<versione>.zip` dalla pagina Releases e caricalo in **Plugin → Carica plugin**.

## Cosa fa

- **Instagram, Facebook o entrambi.** Ogni canale si attiva da solo. Un feed può mostrarne uno, o tutti e due in un unico elenco ordinato per data.
- **Il blocco Feed social**, nell'editor a blocchi e in Fresco (come blocco plugin):
  - disposizione a griglia, carosello o elenco, con le colonne per computer, tablet e telefono;
  - quanti post, e un pulsante **Carica altri** che mostra i successivi;
  - immagini quadrate, verticali o come pubblicate;
  - didascalia, data, Mi piace e commenti, ognuno attivabile;
  - un'**intestazione** con immagine del profilo, nome, follower e pulsante **Segui**;
  - un **lightbox**: il post si apre in una finestra sulla pagina, con la didascalia e il link all'originale.
- **Veloce e visibile ai motori di ricerca.** I post sono scritti nella pagina dal server, con link veri e testo alternativo preso dalle didascalie. L'unico script (circa 4 KB) aggiunge Carica altri, le frecce del carosello e il lightbox; senza, i post restano link.
- **Si adatta al tuo sito.** Il blocco prende caratteri, colori e pulsanti dal tema.
- **Immagini che non si rompono, e niente caricato da Meta.** Le immagini vengono copiate sul sito e servite da lì: gli indirizzi delle immagini di Meta scadono dopo alcuni giorni, e i visitatori invierebbero il loro indirizzo a Meta. Niente cookie, nessun consenso necessario. Se preferisci, le immagini possono essere caricate dai server di Meta: con il plugin **Privacy & GDPR** aspettano allora il consenso, e il plugin compare nella cookie policy.
- **API ufficiali e la tua app.** Il plugin parla con Meta tramite la tua app di Meta: l'API di Instagram con Instagram Login (`instagram_business_basic`), o la Graph API con Facebook Login per una Pagina (`pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, e `instagram_basic` per leggere Instagram tramite la Pagina). Nessun servizio di terzi in mezzo.
- **Token gestiti da solo.** I token di accesso sono salvati cifrati sul server e mai inviati al browser. Il token di Instagram dura 60 giorni: il plugin lo rinnova da solo un mese prima della scadenza. Le impostazioni mostrano quando scade ogni token e avvisano una settimana prima.
- **Robusto.** I post vengono scaricati ogni ora (o quando scegli tu) e a richiesta. Quando Meta limita le richieste o un token smette di funzionare, il sito continua a mostrare gli ultimi post, l'errore compare nelle impostazioni e il plugin riprova più tardi.

## Come si usa

1. Attiva il plugin e apri **Impostazioni → Feed social**.
2. Crea la tua app di Meta: la pagina ha una guida passo passo (in italiano e in inglese) e l'**indirizzo di reindirizzamento** da copiare nell'app. Meta richiede https.
3. Incolla ID e chiave segreta dell'app e premi **Salva**.
4. Premi **Collega con Instagram** (o **Collega con Facebook**), accedi e consenti. Con più Pagine ne scegli una. I primi post arrivano subito.
5. Aggiungi il blocco **Feed social** a una pagina e scegli la disposizione.

Non puoi usare l'accesso? **Incolla un token**: un token utente di Instagram di lunga durata (da **Genera token di accesso** nell'app), o un token di Pagina o utente di Facebook (dal Graph API Explorer).

## Buono a sapersi

- Instagram richiede un **account professionale** (Azienda o Creator): gli account personali non si possono leggere con le API di Meta da quando la Basic Display API è stata ritirata.
- Finché l'app di Meta è in modalità sviluppo, possono collegarsi solo gli account con un ruolo nell'app: aggiungiti come tester, o pubblica l'app. I tuoi account e le tue Pagine non richiedono la revisione dell'app.
- Si tengono fino a 50 post per canale e fino a 120 immagini; le immagini che nessun post usa più vengono cancellate dopo un giorno.
- Scollegare un canale cancella il suo token, i suoi post e le sue immagini.

## Per sviluppatori

- Blocco: `social-feed/feed`, con gli attributi `source` (`all`, `instagram`, `facebook`), `layout` (`grid`, `carousel`, `list`), `columns` (`{ desktop, tablet, mobile }`), `count`, `gap`, `aspect`, `header`, `follow`, `followLabel`, `caption`, `captionLength`, `date`, `likes`, `loadMore`, `loadMoreLabel`, `lightbox`.
- Le pagine con un feed hanno il tag di cache `social-feed`, aggiornato quando arrivano nuovi post.
- Le immagini sono servite a `/social-feed/media/<chiave>.<ext>`, in cache per un anno (l'indirizzo cambia con il contenuto).
- API delle impostazioni sotto `/api/v1/ext/social-feed` (capacità `manage_settings`): `GET`/`PUT /settings`, `POST /oauth/start`, `/oauth/callback`, `/facebook/page`, `/token`, `/refresh`, `/disconnect`.
- Plugin API 1.36 o successiva (`ctx.http` con i file); gli assistenti AI conoscono il blocco tramite `ctx.ai` (API 1.40) dove disponibile.

Licenza: GPL-2.0-or-later.
