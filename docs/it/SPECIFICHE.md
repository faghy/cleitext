# Cleitext — Specifiche

> 🇬🇧 Versione di riferimento in inglese: [docs/SPECIFICATIONS.md](../SPECIFICATIONS.md). Questa traduzione è secondaria e può essere meno aggiornata.

> Versione 0.2 · ottobre 2026 · stato: **bozza**
> Progetto: **cleitext** · Licenza: **GPL-2.0-or-later** · Editor: **Gutenberg** (sostituibile)
> Documento complementare ad [`ARCHITETTURA.md`](./ARCHITETTURA.md): qui si definisce **cosa** deve fare il sistema, lì **come**.

**Priorità** usate in questo documento:

- **MVP**: prima versione utilizzabile su un sito reale;
- **1.0**: prima versione stabile **per uso interno** (i nostri siti);
- **Pubblico**: necessario solo quando Cleitext verrà distribuito come open source (registro, pubblicazione, sito del progetto);
- **Poi**: in seguito.

> **Fase attuale: uso interno.** Cleitext inizialmente serve ai nostri siti e non viene distribuito. Tutto ciò che riguarda la distribuzione pubblica è progettato, ma la sua implementazione è rinviata alla fase **Pubblico**.

---

## Indice

1. [Scopo e ambito](#1-scopo-e-ambito)
2. [Glossario](#2-glossario)
3. [Ruoli e capability](#3-ruoli-e-capability)
4. [Requisiti funzionali](#4-requisiti-funzionali)
5. [Requisiti non funzionali](#5-requisiti-non-funzionali)
6. [API REST](#6-api-rest)
7. [Specifica plugin](#7-specifica-plugin)
8. [Catalogo hook del core](#8-catalogo-hook-del-core)
9. [Formato contenuti CXD](#9-formato-contenuti-cxd)
10. [DSL dei campi personalizzati](#10-dsl-dei-campi-personalizzati)
11. [Specifica tema](#11-specifica-tema)
12. [CLI](#12-cli)
13. [Roadmap e criteri di accettazione](#13-roadmap-e-criteri-di-accettazione)
14. [Fuori ambito](#14-fuori-ambito)
15. [Definition of Done](#15-definition-of-done)

---

## 1. Scopo e ambito

Cleitext è un CMS open source, multi-sito e multilingua, basato su **Node.js/TypeScript e PostgreSQL**, che:

- offre un'esperienza **familiare a chi usa WordPress**: admin, editor a blocchi, tipi di contenuto, tassonomie, temi, plugin;
- **non dipende da WordPress**: formati, nomi e API sono propri, e la compatibilità WordPress è confinata in plugin rimovibili;
- è **estendibile tramite plugin** con un contratto versionato;
- si installa su **Plesk** (estensione Node.js);
- usa **Gutenberg** come editor, ma è progettato per poterlo sostituire in futuro senza migrare i contenuti;
- distribuisce plugin e temi tramite un **registro proprio**, con installazione dall'admin;
- è rilasciato con licenza **GPL-2.0-or-later**, con lo stesso modello di plugin di WordPress.

**Utenti target:**

- agenzie web e sviluppatori che gestiscono molti siti;
- redattori abituati a WordPress;
- sviluppatori di plugin e temi.

---

## 2. Glossario

| Termine                  | Definizione                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------ |
| **Sito**                 | Un tenant: domini, lingue, contenuti, utenti e impostazioni propri.                  |
| **Tipo di contenuto**    | Definizione di una classe di contenuti (pagina, articolo, evento…) con i suoi campi. |
| **Entry**                | Singolo contenuto di un tipo, in una lingua.                                         |
| **Revisione**            | Istantanea immutabile di un'entry.                                                   |
| **Gruppo di traduzione** | Insieme delle entry che rappresentano lo stesso contenuto in lingue diverse.         |
| **Blocco**               | Unità di contenuto dell'editor (paragrafo, immagine, colonne…).                      |
| **CXD**                  | _Cleitext Document_, il formato JSON in cui si salvano i blocchi.                    |
| **Pattern**              | Composizione di blocchi riutilizzabile.                                              |
| **Tassonomia / Termine** | Sistema di classificazione (categorie, tag) e i suoi valori.                         |
| **Area**                 | Zona del tema (header, footer, sidebar) composta a blocchi.                          |
| **Capability**           | Permesso atomico (`publish_entries`, `manage_plugins`…).                             |
| **Hook**                 | Punto di estensione: _action_ (evento) o _filter_ (trasformazione).                  |
| **Plugin**               | Pacchetto che estende server, admin e/o editor tramite il Plugin SDK.                |
| **Tema**                 | Pacchetto che definisce l'aspetto pubblico di un sito.                               |

---

## 3. Ruoli e capability

### 3.1 Ruoli predefiniti

I nomi sono gli stessi di WordPress per familiarità. Tutti i ruoli sono personalizzabili per sito.

| Capability                                       | Super admin | Amministratore | Editore | Autore |  Collaboratore  | Sottoscrittore |
| ------------------------------------------------ | :---------: | :------------: | :-----: | :----: | :-------------: | :------------: |
| `manage_sites` (creare/eliminare siti, domini)   |     ✅      |                |         |        |                 |                |
| `manage_plugins` (installare plugin)             |     ✅      |                |         |        |                 |                |
| `activate_plugins` (sul proprio sito)            |     ✅      |       ✅       |         |        |                 |                |
| `manage_themes` / `edit_theme_settings`          |     ✅      |       ✅       |         |        |                 |                |
| `manage_users` / `promote_users`                 |     ✅      |       ✅       |         |        |                 |                |
| `manage_settings`                                |     ✅      |       ✅       |         |        |                 |                |
| `manage_content_types` / `manage_taxonomies`     |     ✅      |       ✅       |         |        |                 |                |
| `manage_menus`                                   |     ✅      |       ✅       |   ✅    |        |                 |                |
| `edit_others_entries` / `publish_others_entries` |     ✅      |       ✅       |   ✅    |        |                 |                |
| `manage_terms`                                   |     ✅      |       ✅       |   ✅    |        |                 |                |
| `publish_entries` (proprie)                      |     ✅      |       ✅       |   ✅    |   ✅   |                 |                |
| `upload_media`                                   |     ✅      |       ✅       |   ✅    |   ✅   |                 |                |
| `edit_entries` (proprie, bozze)                  |     ✅      |       ✅       |   ✅    |   ✅   |       ✅        |                |
| `delete_entries` (proprie)                       |     ✅      |       ✅       |   ✅    |   ✅   | ✅ (solo bozze) |                |
| `read_private_entries`                           |     ✅      |       ✅       |   ✅    |        |                 |                |
| `unfiltered_html`                                |     ✅      |      ✅*       |         |        |                 |                |
| `view_audit_log`                                 |     ✅      |       ✅       |         |        |                 |                |
| `read` (profilo, area riservata)                 |     ✅      |       ✅       |   ✅    |   ✅   |       ✅        |       ✅       |

\* Disattivabile per sito.

### 3.2 Regole

- I permessi sulle entry tengono conto del tipo di contenuto. Un tipo può richiedere capability dedicate (`edit_events`…) invece di quelle generiche.
- I plugin possono definire nuove capability e assegnarle a ruoli predefiniti all'attivazione.
- Il super admin è globale. Tutti gli altri ruoli valgono **per sito** (`site_members`).

---

## 4. Requisiti funzionali

### 4.1 Installazione e siti

| ID        | Requisito                                                                                                  | Priorità |
| --------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| RF-SIT-01 | Installazione guidata da CLI (`cleitext install`): connessione al DB, migrazioni, primo sito, super admin. | MVP      |
| RF-SIT-02 | Installazione guidata web al primo avvio, se il DB è vuoto, protetta da un token mostrato nei log.         | 1.0      |
| RF-SIT-03 | Creazione, modifica e archiviazione dei siti da CLI e da admin (super admin).                              | MVP      |
| RF-SIT-04 | Più domini per sito (primario più alias), con redirect al dominio primario e HTTPS forzato configurabile.  | MVP      |
| RF-SIT-05 | Risoluzione del sito dall'host della richiesta. Un host sconosciuto riceve un 404 neutro.                  | MVP      |
| RF-SIT-06 | Modalità manutenzione per sito, con bypass per gli utenti autenticati e pagina personalizzabile dal tema.  | MVP      |
| RF-SIT-07 | Clonazione di un sito (struttura, impostazioni, contenuti opzionali).                                      | Poi      |

### 4.2 Utenti e accesso

| ID        | Requisito                                                                                     | Priorità |
| --------- | --------------------------------------------------------------------------------------------- | -------- |
| RF-USR-01 | Login con email e password, sessione via cookie, logout e "ricordami" (durata configurabile). | MVP      |
| RF-USR-02 | Reset password via email, con token monouso a scadenza breve.                                 | MVP      |
| RF-USR-03 | Invito di un utente su un sito con un ruolo: l'utente imposta la password al primo accesso.   | MVP      |
| RF-USR-04 | 2FA TOTP con codici di recupero, obbligatoria per ruoli configurabili.                        | 1.0      |
| RF-USR-05 | Login con passkey (WebAuthn).                                                                 | 1.0      |
| RF-USR-06 | Gestione ruoli e capability da admin.                                                         | 1.0      |
| RF-USR-07 | Profilo utente: nome, avatar, lingua dell'admin, sessioni attive (con revoca).                | MVP      |
| RF-USR-08 | Token API con scope e scadenza, creati dall'utente o dall'amministratore.                     | 1.0      |
| RF-USR-09 | Rate limit e blocco progressivo sul login, con audit dei tentativi.                           | MVP      |
| RF-USR-10 | Registrazione pubblica degli utenti (opzionale per sito).                                     | Poi      |
| RF-USR-11 | SSO OIDC (Google, Microsoft, Keycloak) come plugin.                                           | Poi      |

### 4.3 Contenuti

| ID        | Requisito                                                                                                                                | Priorità                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| RF-CNT-01 | Tipi `page` (gerarchico) e `article` creati di default per ogni sito.                                                                    | MVP                                   |
| RF-CNT-02 | Creazione di tipi di contenuto personalizzati da admin: nome, slug, gerarchico, supporti, campi, permalink.                              | 1.0                                   |
| RF-CNT-03 | Registrazione di tipi di contenuto da plugin.                                                                                            | MVP                                   |
| RF-CNT-04 | Stati: bozza, in revisione, pianificato, pubblicato, privato, cestino. Le transizioni sono quelle del diagramma in ARCHITETTURA §9.2.    | MVP                                   |
| RF-CNT-05 | Ogni salvataggio crea una revisione. Elenco, confronto visivo (diff) e ripristino delle revisioni.                                       | MVP (elenco e ripristino), 1.0 (diff) |
| RF-CNT-06 | Autosalvataggio ogni 30 s e recupero dopo crash o chiusura del browser.                                                                  | MVP                                   |
| RF-CNT-07 | Modifica di un contenuto pubblicato senza esporre le modifiche fino alla ripubblicazione.                                                | MVP                                   |
| RF-CNT-08 | Pubblicazione programmata, con data e ora nel fuso del sito.                                                                             | MVP                                   |
| RF-CNT-09 | Anteprima con il tema, tramite un link di anteprima condivisibile a scadenza.                                                            | MVP                                   |
| RF-CNT-10 | Traduzioni: creare la versione in un'altra lingua da un'entry esistente, navigare tra le traduzioni, vedere lo stato di ogni traduzione. | MVP                                   |
| RF-CNT-11 | Slug generato dal titolo (traslitterazione), modificabile e unico per tipo e lingua. Cambiarlo crea una redirect 301 automatica.         | MVP                                   |
| RF-CNT-12 | Immagine in evidenza ed estratto (se supportati dal tipo).                                                                               | MVP                                   |
| RF-CNT-13 | Pagine figlie, ordinamento e permalink gerarchico (`/chi-siamo/team`).                                                                   | MVP                                   |
| RF-CNT-14 | Cestino con svuotamento automatico dopo N giorni (default 30).                                                                           | MVP                                   |
| RF-CNT-15 | Blocco di modifica concorrente: avviso "X sta modificando questa pagina" con possibilità di prendere il controllo.                       | 1.0                                   |
| RF-CNT-16 | Pagina di visibilità "privata" (solo utenti con capability) e "protetta da password".                                                    | 1.0                                   |
| RF-CNT-17 | Workflow editoriali personalizzati (stati custom).                                                                                       | Poi                                   |

### 4.4 Editor a blocchi

| ID        | Requisito                                                                                                                                                                                          | Priorità                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| RF-EDT-01 | Editor **Gutenberg** (block editor standalone) a schermo intero con: area di scrittura, inserter (pulsante "+" e comando `/`), toolbar del blocco, inspector laterale (schede Documento e Blocco). | MVP                                         |
| RF-EDT-00 | L'editor è integrato tramite l'interfaccia `EditorAdapter`. I contenuti sono salvati solo in formato CXD (mai nel markup `<!-- wp: -->`) e l'HTML pubblico è prodotto dal renderer Cleitext.       | MVP                                         |
| RF-EDT-02 | Blocchi del core: paragrafo, titolo, elenco, citazione, immagine, galleria, pulsanti, colonne, gruppo, separatore, spaziatore, embed, tabella, codice, HTML.                                       | MVP (senza tabella e galleria), 1.0 (tutti) |
| RF-EDT-03 | Formattazione inline: grassetto, corsivo, sottolineato, barrato, link, codice, apice e pedice.                                                                                                     | MVP                                         |
| RF-EDT-04 | Spostamento dei blocchi (su/giù, drag & drop), duplicazione, trasformazione (paragrafo ⇄ titolo ⇄ elenco).                                                                                         | MVP                                         |
| RF-EDT-05 | Vista elenco ad albero dei blocchi.                                                                                                                                                                | 1.0                                         |
| RF-EDT-06 | Annulla/ripeti e scorciatoie da tastiera (documentate in una finestra di aiuto).                                                                                                                   | MVP                                         |
| RF-EDT-07 | Pattern: salva una selezione come pattern, inserisci un pattern. Pattern sincronizzati (riutilizzabili).                                                                                           | 1.0                                         |
| RF-EDT-08 | Incolla da Word, Google Docs e HTML con conversione pulita in blocchi.                                                                                                                             | 1.0                                         |
| RF-EDT-09 | Blocchi definiti dai plugin, con lo stesso livello di integrazione dei blocchi core (definizione agnostica più componente edit Gutenberg).                                                         | MVP                                         |
| RF-EDT-13 | Un blocco senza componente per l'editor attivo resta modificabile tramite un form generato dal suo schema Zod.                                                                                     | 1.0                                         |
| RF-EDT-14 | Adattatore editor selezionabile per sito (`editor.adapter`), per consentire in futuro il passaggio graduale a un altro editor.                                                                     | 1.0                                         |
| RF-EDT-15 | Gli stili del tema attivo vengono applicati nell'editor (editor styles in iframe) per un'anteprima fedele.                                                                                         | 1.0                                         |
| RF-EDT-10 | Conteggio parole, tempo di lettura e struttura dei titoli (avvisi su livelli saltati).                                                                                                             | 1.0                                         |
| RF-EDT-11 | Accessibilità: editor completamente utilizzabile da tastiera, annunci per screen reader.                                                                                                           | 1.0                                         |
| RF-EDT-12 | Modifica collaborativa in tempo reale.                                                                                                                                                             | Poi                                         |

### 4.5 Media

| ID        | Requisito                                                                                                                                | Priorità              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| RF-MED-01 | Upload multiplo con drag & drop, barra di avanzamento e limite di dimensione configurabile.                                              | MVP                   |
| RF-MED-02 | Whitelist dei tipi, verificati tramite magic bytes. Il default è immagini (jpg, png, gif, webp, avif), pdf, documenti office, mp4 e mp3. | MVP                   |
| RF-MED-03 | Generazione delle varianti immagine (AVIF/WebP più fallback) in background.                                                              | MVP                   |
| RF-MED-04 | Libreria media in griglia ed elenco, con ricerca, filtri per tipo e data, e dettaglio con testo alternativo e didascalia per lingua.     | MVP                   |
| RF-MED-05 | Punto focale per il ritaglio responsive.                                                                                                 | 1.0                   |
| RF-MED-06 | Ritaglio e rotazione dall'admin.                                                                                                         | Poi                   |
| RF-MED-07 | Driver di storage su disco e su S3-compatibile.                                                                                          | MVP (disco), 1.0 (S3) |
| RF-MED-08 | Rilevamento dei duplicati (checksum) e indicazione di dove un media è usato.                                                             | 1.0                   |
| RF-MED-09 | SVG: disabilitato di default, oppure abilitabile con sanificazione.                                                                      | 1.0                   |

### 4.6 Tassonomie

| ID        | Requisito                                                                  | Priorità |
| --------- | -------------------------------------------------------------------------- | -------- |
| RF-TAX-01 | Tassonomie `category` (gerarchica) e `tag` predefinite per `article`.      | MVP      |
| RF-TAX-02 | Tassonomie personalizzate da admin e da plugin.                            | 1.0      |
| RF-TAX-03 | Termini tradotti, con slug per lingua, descrizione e campi personalizzati. | MVP      |
| RF-TAX-04 | Archivi pubblici per termine (`/categoria/notizie`).                       | MVP      |

### 4.7 Menu e navigazione

| ID        | Requisito                                                                                                                    | Priorità                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| RF-NAV-01 | Editor di menu ad albero con drag & drop. Le voci possono essere entry, termini, URL o etichette senza link.                 | MVP                         |
| RF-NAV-02 | Assegnazione del menu alle posizioni dichiarate dal tema, per lingua.                                                        | MVP                         |
| RF-NAV-03 | Le voci collegate a entry si aggiornano da sole quando cambia lo slug o il titolo, e spariscono se l'entry non è pubblicata. | MVP                         |
| RF-NAV-04 | Redirect: gestione da admin (da percorso a percorso, codice, contatore di accessi), con import da CSV.                       | 1.0 (plugin `redirects-ui`) |

### 4.8 Temi e sito pubblico

| ID        | Requisito                                                                                                                        | Priorità                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| RF-THM-01 | Installazione (da cartella locale, upload dall'admin o CLI; dal registro nella fase pubblica) e attivazione di un tema per sito. | MVP (CLI), 1.0 (upload), Pubblico (registro) |
| RF-THM-02 | Gerarchia dei template (ARCHITETTURA §12.2).                                                                                     | MVP                                          |
| RF-THM-03 | Impostazioni del tema da schema (logo, colori, font, social…), con anteprima in tempo reale.                                     | 1.0                                          |
| RF-THM-04 | Aree del tema composte a blocchi (header, footer).                                                                               | 1.0                                          |
| RF-THM-05 | Tema predefinito `aurora`: responsive, accessibile (AA), punteggio Lighthouse ≥ 95 su tutte le categorie.                        | MVP                                          |
| RF-THM-06 | Meta di base generati dal core: `<title>`, description, canonical, hreflang, Open Graph minimo.                                  | MVP                                          |
| RF-THM-07 | Sitemap XML (indice più una sitemap per tipo e lingua) e `robots.txt` configurabile.                                             | MVP                                          |
| RF-THM-08 | Feed RSS/Atom per gli articoli e per termine.                                                                                    | 1.0                                          |
| RF-THM-09 | Pagina 404 personalizzabile (entry designata nelle impostazioni).                                                                | MVP                                          |
| RF-THM-10 | Ricerca pubblica full-text per lingua, con evidenziazione dei termini.                                                           | MVP                                          |
| RF-THM-11 | Temi figli (override di template e stili).                                                                                       | Poi                                          |

### 4.9 Plugin

| ID        | Requisito                                                                                                                                                                                            | Priorità |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| RF-PLG-01 | Installazione e aggiornamento dei plugin da CLI, con verifica di `apiVersion` e delle dipendenze.                                                                                                    | MVP      |
| RF-PLG-02 | Elenco dei plugin in admin (stato per sito, versione, permessi), attivazione e disattivazione per sito.                                                                                              | MVP      |
| RF-PLG-03 | Migrazioni del plugin in uno schema dedicato, eseguite all'installazione e all'aggiornamento.                                                                                                        | MVP      |
| RF-PLG-04 | Disinstallazione con rimozione dei dati, previa conferma.                                                                                                                                            | 1.0      |
| RF-PLG-05 | Isolamento degli errori: un plugin che fallisce ripetutamente viene disattivato e segnalato in bacheca.                                                                                              | 1.0      |
| RF-PLG-06 | Metriche per plugin (tempo negli hook, errori) visibili in admin.                                                                                                                                    | 1.0      |
| RF-PLG-07 | Installazione e aggiornamento dei plugin **dall'admin** (_Plugin → Aggiungi nuovo_): ricerca nel registro Cleitext, installazione, aggiornamento con un clic, rollback, riavvio graceful automatico. | Pubblico |
| RF-PLG-09 | Verifica di firma (Ed25519) e checksum dei pacchetti dal registro.                                                                                                                                   | Pubblico |
| RF-PLG-10 | _Carica plugin_: upload manuale di un pacchetto `.zip`/`.tgz` dall'admin, come in WordPress, con un avviso se il pacchetto non viene dal registro. Vietabile con `PLUGINS_ALLOW_UNSIGNED=false`.     | 1.0      |
| RF-PLG-13 | Aggiornamenti dal server dello sviluppatore (`updateSource`) per i plugin premium.                                                                                                                   | Pubblico |
| RF-PLG-14 | Aggiornamenti automatici attivabili per singolo plugin (servono il registro, o `updateSource`, per sapere delle nuove versioni).                                                                     | 1.0      |
| RF-PLG-15 | Attivazione di un plugin su tutti i siti (super admin) e plugin obbligatori (`plugins-required/`, sempre attivi).                                                                                    | 1.0      |
| RF-PLG-16 | Registro aperto: account sviluppatore, `cleitext publish`, revisione automatica e manuale, solo licenze compatibili con la GPL.                                                                      | Pubblico |
| RF-PLG-11 | Notifiche in admin degli aggiornamenti disponibili e delle versioni revocate dal registro.                                                                                                           | Pubblico |
| RF-PLG-12 | Installazione dall'admin disattivabile via env (`PLUGINS_INSTALL_FROM_UI=false`).                                                                                                                    | 1.0      |
| RF-PLG-08 | Plugin ufficiali alla 1.0: `seo`, `forms`, `redirects-ui`, `wp-import`, `cleito-import`. `wp-compat` e `comments` dopo.                                                                              | 1.0      |

### 4.10 Impostazioni

| ID        | Requisito                                                                                                                          | Priorità |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- |
| RF-SET-01 | Impostazioni generali: nome del sito, slogan, lingue, fuso orario, formato data, pagina iniziale, pagina 404, articoli per pagina. | MVP      |
| RF-SET-02 | Impostazioni email (SMTP) per sito, con email di test.                                                                             | MVP      |
| RF-SET-03 | Permalink per tipo di contenuto (pattern con segnaposto `{slug}`, `{year}`, `{month}`, `{parent}`, `{term:category}`).             | 1.0      |
| RF-SET-04 | Impostazioni dei plugin in pagine generate dallo schema.                                                                           | MVP      |

### 4.11 Import, export e migrazione

| ID        | Requisito                                                                                                                                         | Priorità  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-IMP-01 | Import di file WXR di WordPress (plugin `wp-import`), con report.                                                                                 | 1.0       |
| RF-IMP-02 | Migrazione dal vecchio Cleito CMS (plugin `cleito-import`): pagine, testi per lingua, menu, opzioni, utenti (reset password obbligatorio), media. | Rimandato |
| RF-IMP-03 | Export completo di un sito in formato Cleitext (JSON più media, in un archivio).                                                                  | 1.0       |
| RF-IMP-04 | Import di un export Cleitext, per migrare o clonare tra istanze.                                                                                  | 1.0       |

### 4.12 Admin UI

| ID        | Requisito                                                                                                                                                                                                                    | Priorità                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| RF-ADM-01 | Layout in stile WordPress: barra laterale con le sezioni (Bacheca, Articoli, Pagine, Media, tipi personalizzati, Aspetto, Plugin, Utenti, Impostazioni), barra superiore, selettore del sito per chi ne gestisce più di uno. | MVP                       |
| RF-ADM-02 | Bacheca a widget: bozze recenti, attività, stato del sistema, widget dei plugin.                                                                                                                                             | MVP                       |
| RF-ADM-03 | Tabelle elenco con ricerca, filtri (stato, autore, lingua, termine), ordinamento, paginazione, azioni di massa e modifica rapida.                                                                                            | MVP                       |
| RF-ADM-04 | Tema chiaro e scuro, interfaccia tradotta (IT ed EN alla 1.0).                                                                                                                                                               | MVP (IT), 1.0 (EN, scuro) |
| RF-ADM-05 | Palette dei comandi (`Ctrl+K`): navigazione e azioni rapide.                                                                                                                                                                 | 1.0                       |
| RF-ADM-06 | Registro attività (audit) consultabile e filtrabile.                                                                                                                                                                         | 1.0                       |
| RF-ADM-07 | Pagina "Stato del sistema": versioni, migrazioni, job, cache, spazio media.                                                                                                                                                  | 1.0                       |

---

## 5. Requisiti non funzionali

| ID     | Requisito                                | Misura / verifica                                                                                                                                                    |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RNF-01 | Prestazioni pagina pubblica in cache     | TTFB p95 < 50 ms (k6, 100 RPS, 1 vCPU)                                                                                                                               |
| RNF-02 | Prestazioni pagina pubblica non in cache | TTFB p95 < 300 ms                                                                                                                                                    |
| RNF-03 | API admin                                | p95 < 150 ms con 50.000 entry per sito                                                                                                                               |
| RNF-04 | Bundle admin                             | Caricamento iniziale < 500 KB gzip. Gutenberg caricato solo nella schermata di modifica (lazy).                                                                      |
| RNF-05 | Memoria                                  | < 300 MB RSS per processo web a regime                                                                                                                               |
| RNF-06 | Scalabilità multi-sito                   | ≥ 100 siti per istanza senza degrado oltre il 10%                                                                                                                    |
| RNF-07 | Isolamento                               | 0 fughe di dati tra siti (suite RLS in CI, obbligatoria)                                                                                                             |
| RNF-08 | Sicurezza                                | OWASP ASVS L2 come checklist. Nessuna vulnerabilità alta o critica aperta in `pnpm audit` al rilascio.                                                               |
| RNF-09 | Accessibilità                            | Admin e tema predefinito WCAG 2.1 AA (axe in CI più verifica manuale)                                                                                                |
| RNF-10 | Compatibilità browser admin              | Ultime 2 versioni di Chrome, Firefox, Safari ed Edge                                                                                                                 |
| RNF-11 | Runtime                                  | Node.js 24 LTS (supportato 22 LTS), PostgreSQL 16+                                                                                                                   |
| RNF-12 | Stabilità                                | Semver. Deprecazioni di almeno 2 minor. Migrazioni sempre reversibili tramite backup documentato.                                                                    |
| RNF-13 | Qualità                                  | TypeScript strict, copertura core ≥ 80%, nessun `any` esplicito senza giustificazione                                                                                |
| RNF-14 | Avvio                                    | Avvio a freddo del processo < 3 s (escluse le migrazioni)                                                                                                            |
| RNF-15 | Backup                                   | Comando `cleitext backup` (pg_dump più archivio dei media) e procedura di ripristino documentata e testata                                                           |
| RNF-16 | Editor sostituibile                      | Import da `@wordpress/*` consentiti solo in `packages/editor-gutenberg` e nei file `*.gutenberg.tsx` (lint in CI). Server, renderer e DB non dipendono da Gutenberg. |
| RNF-17 | Licenze                                  | Core GPL-2.0-or-later. Tutte le dipendenze hanno licenze compatibili con la GPL (license-checker in CI).                                                             |
| RNF-18 | Round-trip editor                        | Per ogni blocco core, CXD → Gutenberg → CXD è identico (test in CI).                                                                                                 |

---

## 6. API REST

Base: `/api/v1`. Il formato è JSON. Gli errori seguono RFC 9457. La paginazione è a cursore (`?cursor=…&limit=…`).

### 6.1 Autenticazione

| Metodo | Percorso                                         | Descrizione                                                                      |
| ------ | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| POST   | `/auth/login`                                    | Email e password. Risponde con un cookie di sessione, oppure con `2fa_required`. |
| POST   | `/auth/2fa`                                      | Verifica TOTP o codice di recupero.                                              |
| POST   | `/auth/passkey/options` · `/auth/passkey/verify` | Login WebAuthn.                                                                  |
| POST   | `/auth/logout`                                   | Revoca la sessione corrente.                                                     |
| POST   | `/auth/password/forgot` · `/auth/password/reset` | Reset della password.                                                            |
| GET    | `/auth/me`                                       | Utente corrente, siti e capability sul sito corrente.                            |
| GET    | `/auth/csrf`                                     | Token CSRF.                                                                      |

### 6.2 Contenuti

| Metodo                | Percorso                                                        | Descrizione                                                                  |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| GET                   | `/content-types`                                                | Elenco dei tipi del sito.                                                    |
| POST · PATCH · DELETE | `/content-types[/:slug]`                                        | Gestione dei tipi (`manage_content_types`).                                  |
| GET                   | `/entries`                                                      | Filtri: `type`, `status`, `locale`, `author`, `term`, `q`, `parent`, `sort`. |
| POST                  | `/entries`                                                      | Crea un'entry (bozza).                                                       |
| GET                   | `/entries/:id`                                                  | Entry più revisione corrente (`?revision=published` per quella pubblicata).  |
| PATCH                 | `/entries/:id`                                                  | Salva: crea una revisione `manual`.                                          |
| PUT                   | `/entries/:id/autosave`                                         | Autosalvataggio.                                                             |
| POST                  | `/entries/:id/publish` · `/unpublish` · `/schedule` · `/submit` | Transizioni di stato.                                                        |
| POST                  | `/entries/:id/trash` · `/restore`                               | Cestino.                                                                     |
| DELETE                | `/entries/:id`                                                  | Eliminazione definitiva (solo se nel cestino).                               |
| GET                   | `/entries/:id/revisions`                                        | Elenco delle revisioni.                                                      |
| GET                   | `/entries/:id/revisions/:rev`                                   | Dettaglio di una revisione.                                                  |
| POST                  | `/entries/:id/revisions/:rev/restore`                           | Ripristino di una revisione.                                                 |
| GET                   | `/entries/:id/translations`                                     | Traduzioni del gruppo.                                                       |
| POST                  | `/entries/:id/translations`                                     | Crea la traduzione `{ locale }`.                                             |
| POST                  | `/entries/:id/preview-token`                                    | Link di anteprima a scadenza.                                                |
| POST                  | `/entries/:id/lock` · DELETE `/entries/:id/lock`                | Blocco di modifica concorrente.                                              |

### 6.3 Tassonomie, media, navigazione

| Metodo                | Percorso                                              |
| --------------------- | ----------------------------------------------------- |
| GET/POST/PATCH/DELETE | `/taxonomies[/:slug]`                                 |
| GET/POST/PATCH/DELETE | `/taxonomies/:slug/terms[/:id]`                       |
| GET                   | `/media` (filtri: `type`, `q`, `from`, `to`)          |
| POST                  | `/media` (multipart)                                  |
| GET/PATCH/DELETE      | `/media/:id`                                          |
| GET                   | `/media/:id/usage`                                    |
| GET/POST/PATCH/DELETE | `/menus[/:id]`                                        |
| PUT                   | `/menus/:id/items` (sostituzione atomica dell'albero) |
| GET/POST/PATCH/DELETE | `/redirects[/:id]`                                    |

### 6.4 Sistema

| Metodo                | Percorso                                                                       | Descrizione                                               |
| --------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| GET/POST/PATCH        | `/sites[/:id]`                                                                 | Siti (super admin).                                       |
| GET/POST/DELETE       | `/sites/:id/domains[/:id]`                                                     | Domini.                                                   |
| GET/PATCH             | `/settings/:namespace`                                                         | Impostazioni (validate dallo schema del namespace).       |
| GET/POST/PATCH/DELETE | `/users[/:id]` · POST `/users/invite`                                          | Utenti del sito.                                          |
| GET/POST/PATCH/DELETE | `/roles[/:id]`                                                                 | Ruoli.                                                    |
| GET/POST/DELETE       | `/tokens[/:id]`                                                                | Token API.                                                |
| GET                   | `/plugins`                                                                     | Plugin installati e stato sul sito.                       |
| POST                  | `/plugins/:slug/activate` · `/deactivate`                                      | Attivazione per sito.                                     |
| GET                   | `/registry/plugins?q=` · `/registry/themes?q=`                                 | Ricerca nel registro Cleitext (tramite proxy del server). |
| POST                  | `/plugins/install` `{slug, version}` · `/plugins/upload` (multipart .zip/.tgz) | Installazione (`manage_plugins` + 2FA).                   |
| POST                  | `/plugins/:slug/update` · `/plugins/:slug/rollback`                            | Aggiornamento e rollback.                                 |
| DELETE                | `/plugins/:slug`                                                               | Disinstallazione (con conferma).                          |
| GET                   | `/themes` · POST `/themes/install` · `/themes/:slug/activate`                  | Temi.                                                     |
| GET                   | `/search?q=`                                                                   | Ricerca globale admin (entry, media, termini, utenti).    |
| GET                   | `/audit`                                                                       | Registro attività.                                        |
| GET                   | `/system/status`                                                               | Stato del sistema.                                        |
| GET                   | `/blocks`                                                                      | Registro dei blocchi disponibili (per l'editor).          |

### 6.5 Delivery (sola lettura, headless)

`GET /api/v1/delivery/entries`, `/delivery/entries/by-path?path=/chi-siamo`, `/delivery/menus/:location`, `/delivery/terms`, `/delivery/search`.

Espone solo contenuti pubblicati. Accetta un token con scope `delivery:read`, oppure nessun token se il sito è configurato come pubblico. Le risposte sono in cache con ETag.

---

## 7. Specifica plugin

> La guida per gli sviluppatori, con ciò che è realizzato oggi, è [PLUGIN.md](./PLUGIN.md).

### 7.1 Manifest `cleitext.plugin.json`

| Campo                                       | Tipo                            | Obbl. | Descrizione                                                                                                                       |
| ------------------------------------------- | ------------------------------- | :---: | --------------------------------------------------------------------------------------------------------------------------------- |
| `slug`                                      | string `^[a-z][a-z0-9-]{1,39}$` |  ✅   | Identificativo univoco, usato anche per lo schema DB `plg_<slug>`.                                                                |
| `name`                                      | string                          |  ✅   | Nome visualizzato.                                                                                                                |
| `version`                                   | semver                          |  ✅   | Versione del plugin.                                                                                                              |
| `apiVersion`                                | range semver                    |  ✅   | Versioni del Plugin SDK supportate.                                                                                               |
| `server`                                    | path                            |       | Entry server (ESM).                                                                                                               |
| `admin`                                     | path                            |       | Entry admin (ESM, React condiviso).                                                                                               |
| `requires.cleitext`                         | range semver                    |       | Versione minima del core.                                                                                                         |
| `requires.plugins`                          | mappa slug → range              |       | Dipendenze da altri plugin.                                                                                                       |
| `permissions`                               | string[]                        |       | Permessi richiesti (§7.3).                                                                                                        |
| `capabilities`                              | string[]                        |       | Capability definite dal plugin.                                                                                                   |
| `settingsSchema`                            | path                            |       | JSON Schema delle impostazioni (generato da Zod).                                                                                 |
| `updateSource`                              | URL                             |       | Server di aggiornamento dello sviluppatore, per i plugin premium distribuiti fuori dal registro (come `Update URI` di WordPress). |
| `license`                                   | SPDX                            |  ✅   | Deve essere compatibile con la GPL.                                                                                               |
| `description`, `author`, `homepage`, `icon` |                                 |       | Metadati.                                                                                                                         |

### 7.2 Interfaccia SDK (server)

```ts
interface PluginDefinition {
  setup(ctx: PluginContext): void | Promise<void>;
  onInstall?(ctx: InstallContext): Promise<void>;
  onActivate?(site: SiteView, ctx: PluginContext): Promise<void>;
  onDeactivate?(site: SiteView, ctx: PluginContext): Promise<void>;
  onUninstall?(ctx: InstallContext): Promise<void>;
}

interface PluginContext {
  plugin: { slug: string; version: string };
  hooks: HookApi; // on / filter / emit (solo hook propri) / off
  content: ContentFacade; // query entry, registerType, registerFieldGroup (secondo i permessi)
  taxonomy: TaxonomyFacade;
  media: MediaFacade;
  users: UserFacade; // sola lettura, salvo il permesso users:write
  settings: SettingsFacade; // define(schema), get, set (solo il proprio namespace)
  access: AccessFacade; // defineCapability, can(user, cap)
  routes: RouteApi; // get/post/… pubbliche o admin-only, con guard sulle capability
  blocks: BlockRegistry; // register(defineBlock(...))
  jobs: JobApi; // define, enqueue, schedule (cron)
  cache: CacheApi; // invalidate(tags), remember(key, ttl, fn)
  db: PluginDatabase; // Drizzle sullo schema plg_<slug>, con la RLS del sito corrente
  http: SafeHttpClient; // solo con il permesso http:outbound, protetto da SSRF
  mail: MailApi; // con il permesso mail:send
  log: Logger; // pino child logger con il contesto del plugin
  i18n: I18nApi; // t(), lingue del sito
}
```

### 7.3 Permessi dichiarabili

`content:read`, `content:write`, `media:read`, `media:write`, `users:read`, `users:write`, `settings:own`, `settings:read`, `http:outbound`, `mail:send`, `routes:public`, `routes:admin`, `jobs`, `blocks`, `theme:hooks`.

Ogni facade verifica il permesso e solleva `PluginPermissionError` se manca. Ricordare il limite di sicurezza descritto in ARCHITETTURA §11.6.

### 7.4 Migrazioni dei plugin

- Si trovano in `migrations/NNNN_nome.sql` (oppure sono generate da Drizzle) e vengono eseguite nello schema `plg_<slug>`.
- Sono registrate in `plugin_migrations` con un checksum. Una migrazione già applicata e poi modificata blocca l'avvio.
- Ogni tabella del plugin che contiene dati di un sito **deve** avere `site_id`. La policy RLS viene aggiunta automaticamente dall'helper `cleitextTenantTable()`.

### 7.5 SDK admin

```ts
export default defineAdminPlugin({
  menu: [{ id: 'seo', label: 'SEO', icon: 'search', capability: 'manage_seo', route: '/seo' }],
  routes: [{ path: '/seo', component: lazy(() => import('./SeoPage')) }],
  dashboardWidgets: [{ id: 'seo-health', component: SeoHealthWidget }],
  documentPanels: [
    { id: 'seo-meta', title: 'SEO', types: ['page', 'article'], component: SeoPanel },
  ],
  listColumns: [{ type: 'article', id: 'seo-score', header: 'SEO', cell: SeoScoreCell }],
  bulkActions: [],
  settingsPages: [{ id: 'seo', schema: 'auto' }],
});
```

---

## 8. Catalogo hook del core

### 8.1 Action (eventi)

| Hook                                                 | Payload                 | Momento          |
| ---------------------------------------------------- | ----------------------- | ---------------- |
| `app.ready`                                          | `{}`                    | Avvio completato |
| `site.created` · `site.deleted`                      | `{ site }`              |                  |
| `user.login` · `user.logout` · `user.login.failed`   | `{ user?, email?, ip }` |                  |
| `user.created` · `user.updated` · `user.deleted`     | `{ user, site }`        |                  |
| `entry.created` · `entry.saved`                      | `{ entry, revision }`   | Dopo il commit   |
| `entry.published` · `entry.unpublished`              | `{ entry }`             | Dopo il commit   |
| `entry.trashed` · `entry.restored` · `entry.deleted` | `{ entry }`             |                  |
| `term.saved` · `term.deleted`                        | `{ term }`              |                  |
| `media.uploaded` · `media.deleted`                   | `{ media }`             |                  |
| `menu.saved`                                         | `{ menu }`              |                  |
| `settings.updated`                                   | `{ namespace, keys }`   |                  |
| `plugin.activated` · `plugin.deactivated`            | `{ plugin, site }`      |                  |
| `cache.invalidated`                                  | `{ tags }`              |                  |

### 8.2 Filter (trasformazioni)

| Hook                       | Valore            | Contesto                                                                          |
| -------------------------- | ----------------- | --------------------------------------------------------------------------------- |
| `entry.beforeSave`         | `EntryInput`      | `{ user, site }`. Può validare o arricchire, e lanciare un errore di validazione. |
| `entry.permalink`          | `string`          | `{ entry }`                                                                       |
| `entry.excerpt`            | `string`          | `{ entry }`                                                                       |
| `render.head`              | `HeadTag[]`       | `{ entry?, route }`                                                               |
| `render.bodyClass`         | `string[]`        | `{ entry?, route }`                                                               |
| `render.blocks`            | `CxdBlock[]`      | `{ entry }` (prima del rendering)                                                 |
| `render.html`              | `string`          | `{ entry?, route }` (HTML finale, da usare con parsimonia)                        |
| `theme.templateCandidates` | `string[]`        | `{ route, entry? }`                                                               |
| `query.entries`            | `EntryQuery`      | `{ route }`                                                                       |
| `search.document`          | `SearchDoc`       | `{ entry }` (testo indicizzato)                                                   |
| `sitemap.entries`          | `SitemapItem[]`   | `{ site, locale }`                                                                |
| `admin.menu`               | `AdminMenuItem[]` | `{ user }`                                                                        |
| `media.allowedTypes`       | `string[]`        | `{ site }`                                                                        |
| `mail.message`             | `MailMessage`     | `{ template }`                                                                    |

---

## 9. Formato contenuti CXD

### 9.1 Struttura

```ts
type CxdDocument = {
  schema: 1; // versione del formato documento
  blocks: CxdBlock[];
};

type CxdBlock = {
  id: string; // id stabile (per ancore, commenti, diff)
  type: `${string}/${string}`; // namespace/nome: 'core/paragraph', 'seo/faq'
  v: number; // versione dello schema attributi del blocco
  attrs: Record<string, unknown>;
  content?: CxdInline[]; // per i blocchi di testo
  children?: CxdBlock[]; // per i blocchi contenitore
};

type CxdInline =
  | { text: string; marks?: Mark[] }
  | { type: 'link'; href: string; target?: '_blank'; rel?: string; children: CxdInline[] }
  | { type: 'mention' | 'inline-media'; [k: string]: unknown };

type Mark = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'sup' | 'sub';
```

### 9.2 Regole

- **Validazione** di ogni blocco contro lo schema Zod della sua versione, sia al salvataggio sia all'import.
- **Blocco sconosciuto** (plugin disattivato): conservato intatto, mostrato in editor come segnaposto "blocco non disponibile", non mostrato nel sito pubblico (o mostrato tramite il filtro `render.unknownBlock`).
- **Migrazione**: se `v` è inferiore alla versione registrata, si applica `migrate` in lettura. Il documento migrato viene salvato al successivo salvataggio.
- **Conversione** Gutenberg ⇄ CXD: la gestisce il pacchetto `editor-gutenberg`. Il rich text HTML degli attributi Gutenberg viene convertito e sanificato in span `content`. È testata con proprietà di round-trip, cioè `toCxd(fromCxd(doc))` deve essere uguale a `doc`.
- **Indipendenza**: il formato CXD non contiene nulla di specifico di Gutenberg. Un futuro adattatore deve solo implementare la stessa conversione.
- **Testo per la ricerca**: estratto da `content` dei blocchi testuali e dagli attributi marcati `searchable`.

---

## 10. DSL dei campi personalizzati

```json
{
  "fields": [
    {
      "name": "subtitle",
      "type": "text",
      "label": { "it": "Sottotitolo" },
      "maxLength": 160,
      "translatable": true
    },
    { "name": "price", "type": "number", "min": 0, "step": 0.01, "indexed": true },
    { "name": "eventDate", "type": "date", "required": true, "indexed": true },
    { "name": "venue", "type": "relation", "to": "venue", "multiple": false },
    { "name": "gallery", "type": "media", "multiple": true, "accept": ["image/*"] },
    {
      "name": "speakers",
      "type": "repeater",
      "fields": [
        { "name": "name", "type": "text", "required": true },
        { "name": "bio", "type": "richtext" }
      ]
    }
  ]
}
```

| Tipo                | Valore salvato     | Opzioni                             |
| ------------------- | ------------------ | ----------------------------------- |
| `text`              | string             | `maxLength`, `pattern`, `multiline` |
| `richtext`          | CxdInline[]        | `marks` consentiti                  |
| `number`            | number             | `min`, `max`, `step`                |
| `boolean`           | boolean            |                                     |
| `date` / `datetime` | ISO 8601           | `min`, `max`                        |
| `select`            | string \| string[] | `options`, `multiple`               |
| `media`             | uuid \| uuid[]     | `accept`, `multiple`                |
| `relation`          | uuid \| uuid[]     | `to` (tipo), `multiple`             |
| `repeater`          | object[]           | `fields`, `min`, `max`              |
| `group`             | object             | `fields`                            |
| `json`              | unknown            | `schema` (JSON Schema)              |

**Opzioni comuni:**

- `required`, `default`, `label`, `help`, `translatable` (default `true`);
- `indexed`, che crea un indice di espressione;
- `searchable`, che include il campo nel full-text;
- `showInList`, che mostra il campo come colonna nella tabella dell'admin.

---

## 11. Specifica tema

### 11.1 Manifest `cleitext.theme.json`

```json
{
  "slug": "aurora",
  "name": "Aurora",
  "version": "1.0.0",
  "apiVersion": "^1.0",
  "menuLocations": { "primary": "Menu principale", "footer": "Menu footer" },
  "areas": { "header": "Header", "footer": "Footer", "sidebar": "Barra laterale" },
  "supports": ["featured-image", "dark-mode", "custom-logo"],
  "imageSizes": { "card": [640, 400], "hero": [1920, 900] },
  "settingsSchema": "dist/settings.schema.json"
}
```

### 11.2 Contratto dei template

```ts
// templates/entry.tsx
import type { TemplateProps } from '@cleitext/theme-sdk';
import { Blocks, useMenu, Image } from '@cleitext/theme-sdk';

export default function EntryTemplate({ entry, site, locale }: TemplateProps<'entry'>) {
  return (
    <article>
      <h1>{entry.title}</h1>
      {entry.featuredImage && <Image media={entry.featuredImage} size="hero" priority />}
      <Blocks document={entry.document} />
    </article>
  );
}
```

- `layout.tsx` riceve `children` e `head` (risultato del filtro `render.head`).
- I template non accedono al database direttamente: ricevono props e usano gli helper dell'SDK, che passano dai servizi del core e dalla cache.

---

## 12. CLI

| Comando                                                                           | Descrizione                                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `cleitext install`                                                                | Installazione interattiva (DB, migrazioni, primo sito, super admin).                |
| `cleitext migrate [--plugins]`                                                    | Esegue le migrazioni del core e dei plugin.                                         |
| `cleitext site:create · site:update · site:archive · site:list · site:domain:add` | Gestione siti.                                                                      |
| `cleitext user:create · user:reset-password · user:promote`                       | Gestione utenti.                                                                    |
| `cleitext plugin:search · plugin:install <slug                                    | file.zip                                                                            | file.tgz> · plugin:update · plugin:rollback · plugin:list · plugin:uninstall` | Plugin (dal registro Cleitext o da file). |
| `cleitext theme:search · theme:install · theme:activate --site`                   | Temi.                                                                               |
| `cleitext login · publish`                                                        | Per gli sviluppatori: autenticazione e pubblicazione di plugin o temi sul registro. |
| `cleitext import:wxr <file> --site`                                               | Import WordPress (richiede `wp-import`).                                            |
| `cleitext import:cleito --dsn <pg> --site-id <n> --site`                          | Migrazione dal vecchio CMS.                                                         |
| `cleitext export · import`                                                        | Export e import di un sito in formato Cleitext.                                     |
| `cleitext cache:purge [--site] [--tag]`                                           | Cache.                                                                              |
| `cleitext jobs:tick · jobs:work · jobs:status`                                    | Job (tick per il cron di Plesk).                                                    |
| `cleitext backup · restore`                                                       | Backup e ripristino di DB e media.                                                  |
| `cleitext doctor`                                                                 | Diagnostica: versioni, connessioni, permessi delle cartelle, configurazione.        |

---

## 13. Roadmap e criteri di accettazione

### M0 — Fondamenta (2–3 settimane)

- Monorepo, CI (lint, typecheck, test), database di sviluppo locale (PostgreSQL embedded, senza container).
- Scheletro NestJS + Fastify, configurazione validata, logging, health check.
- Schema DB del core, migrazioni, RLS con suite di isolamento.

**✅ Accettazione:** `pnpm dev` avvia server e admin. I test RLS passano: due siti, zero fughe.

### M1 — Identità e siti (2–3 settimane)

- Siti, domini, lingue, risoluzione dell'host.
- Login, sessioni, CSRF, reset password, inviti, ruoli e capability predefiniti.
- Shell dell'admin (layout in stile WordPress, bacheca vuota, gestione utenti).

**✅ Accettazione:** un amministratore invita un editore, che accede e vede solo le sezioni consentite. Il rate limit sul login funziona.

### M2 — Contenuti ed editor (5–7 settimane, _la milestone critica_)

- Tipi `page` e `article`, entry, revisioni, stati, autosalvataggio, pianificazione, traduzioni.
- **Spike Gutenberg standalone** nella prima settimana: block editor fuori da WordPress, servizi forniti dall'adattatore, iframe e stili.
- Formato CXD, `EditorAdapter`, adattatore Gutenberg con 10 blocchi base e round-trip testato.
- Media (upload, varianti, libreria), tassonomie base.

**✅ Accettazione:** un redattore scrive un articolo con titoli, immagini e colonne, lo salva, lo traduce, ripristina una revisione e lo pianifica. Il round-trip CXD è testato. **Punto di verifica sull'editor** (vedi rischi in ARCHITETTURA §21).

### M3 — Sito pubblico (3–4 settimane)

- Renderer SSR, gerarchia dei template, tema `aurora`.
- Menu, permalink, redirect automatiche, 404, sitemap, meta di base, ricerca.
- Cache di pagina con invalidazione a tag.

**✅ Accettazione:** il sito demo supera Lighthouse ≥ 95 e rispetta RNF-01 e RNF-02. Pubblicare un articolo aggiorna home, archivio e menu senza dover svuotare la cache a mano.

### M4 — Plugin (3–4 settimane)

- Plugin SDK v1 (server e admin), manifest, ciclo di vita, schemi dedicati, hook tipizzati.
- Plugin di riferimento: `seo` e `forms`.

**✅ Accettazione:** un plugin esterno al monorepo, sviluppato solo con la documentazione dell'SDK, aggiunge un tipo di contenuto, un blocco, una pagina admin e una tabella propria. Disattivarlo non rompe il sito.

### M5 — Migrazioni e deploy (2–3 settimane)

- `cleito-import` (primo caso reale: un sito Cleito in produzione) e `wp-import`. _Aggiornamento (ottobre 2026): `cleito-import` è rimandato, perché per ora non c'è nessun sito Cleito da migrare; il modello di import e `import:wxr` coprono WordPress._
- Pacchetto per Plesk, guida di deploy, backup e ripristino.

**✅ Accettazione:** il sito Cleito di esempio è migrato su Plesk con contenuti, menu, lingue e redirect corretti (rimandato insieme a `cleito-import`). Un export WXR reale di WordPress viene importato con un report senza errori bloccanti.

### M6 — Release 1.0 per uso interno (3–4 settimane)

- 2FA e passkey, audit log, stato del sistema, tema scuro.
- Upload di plugin e temi dall'admin, aggiornamenti automatici per plugin, plugin obbligatori.
- Hardening di sicurezza (checklist ASVS), test di carico, documentazione interna (installazione, plugin, temi).

**✅ Accettazione:** tutti i requisiti MVP e 1.0 soddisfatti, RNF verificati in CI, i nostri siti in produzione su Cleitext.

> **Stima fino alla 1.0 interna:** circa 5–7 mesi per un team di 2–3 sviluppatori. È da rivedere dopo M2, che è il principale fattore di incertezza.

### M7 — Apertura pubblica (quando si deciderà di distribuirlo)

- Scelta del dominio, sito del progetto, documentazione pubblica, admin in inglese.
- Registro Cleitext aperto: account sviluppatori, `cleitext publish`, revisione, firma dei pacchetti, revoca, aggiornamenti dal registro e da `updateSource`.
- Repository pubblico con file `LICENSE` GPL-2.0-or-later, linee guida per contribuire, verifica legale delle condizioni del registro.

**✅ Accettazione:** tutti i requisiti **Pubblico** soddisfatti, almeno 3 plugin ufficiali pubblicati nel registro.

---

## 14. Fuori ambito

- E-commerce: **previsto in futuro** come plugin, non da fare ora (vedi ARCHITETTURA §22.1).
- Registro pubblico di plugin e temi: **previsto in futuro** (milestone M7), non da fare ora.
- Commenti (plugin separato, non pianificato per ora).
- Modifica collaborativa in tempo reale.
- Page builder visuale a trascinamento libero (oltre all'editor a blocchi).
- Esecuzione di plugin o temi WordPress esistenti.
- Plugin a pagamento nel registro (vendita, licenze commerciali).
- Hosting SaaS gestito.

---

## 15. Definition of Done

Una funzionalità è completa quando:

1. soddisfa i requisiti e i criteri di accettazione collegati (ID RF/RNF nel titolo della PR);
2. ha test unitari e di integrazione, più test E2E se tocca un flusso utente principale;
3. rispetta i permessi (test sia positivi sia negativi sulle capability) e l'isolamento tra siti;
4. ha gli schemi Zod condivisi e la documentazione OpenAPI aggiornata;
5. è accessibile (nessuna violazione axe), tradotta (stringhe in i18n) e documentata (utente e/o sviluppatore);
6. usa solo dipendenze con licenze compatibili con la GPL e non importa `@wordpress/*` fuori dall'adattatore dell'editor;
7. è stata revisionata da almeno un'altra persona.
