# Installare Cleitext su Plesk

> 🇬🇧 Versione di riferimento in inglese: [docs/DEPLOYMENT.md](../DEPLOYMENT.md). Questa traduzione è secondaria e può essere meno aggiornata.

Questa guida installa Cleitext su un server gestito con Plesk, usando l'estensione **Node.js** di Plesk (Phusion Passenger). Il server riceve solo i file compilati: scaricali dalla pagina Releases, oppure compilali tu (§3).

## Installazione rapida: la procedura guidata

Il modo più semplice, come con WordPress: niente da compilare, nessun file di configurazione da scrivere.

1. **Scarica** `cleitext-<versione>.zip` dalla pagina [Releases](https://github.com/faghy/cleitext/releases). È compilato per Linux x64.
2. **Il database**: la procedura può crearlo da sola con utente e password dell'amministratore di PostgreSQL (Plesk: **Strumenti e impostazioni → Server di database → PostgreSQL**). Oppure crealo tu in Plesk (**Database → Aggiungi database**, tipo PostgreSQL, con un utente) e annota nome del database, utente e password.
3. **Carica lo zip** nella cartella del dominio (**File**, poi **Estrai file**): crea la cartella `cleitext`. La versione è solo nel nome dello zip, mai in quello della cartella.
4. **Configura Node.js** (**Siti web e domini → Node.js**) come al §6: radice dell'applicazione `/cleitext`, radice dei documenti `/cleitext/public`, file di avvio `app.js`, Node.js 22 o 24, modalità production. In **Impostazioni di hosting** fai puntare anche la radice dei documenti a `cleitext/public` e attiva **SSL/TLS** (Let's Encrypt). Poi **Abilita Node.js**.
5. **Apri il sito.** La procedura parte da `/install`:
   1. **Benvenuto**: cosa ti serve, poi **Inizia**.
   2. **Requisiti**: Node.js, cartelle scrivibili, `pg_dump` per i backup, HTTPS.
   3. **Database**, in uno dei due modi:
      - **Crealo ora** (predefinito): inserisci il nome del database e l'amministratore di PostgreSQL. La procedura crea l'utente proprietario (con il permesso di creare ruoli) e il database; l'amministratore serve solo in quel momento e non viene salvato.
      - **Esiste già**: inserisci il nome del database e il suo utente, che diventa il proprietario. Se non può creare ruoli, la pagina mostra il comando da eseguire una volta come root, per esempio:
        ```bash
        sudo -u postgres psql -c 'ALTER ROLE "example_user" CREATEROLE;'
        ```

      In entrambi i casi la procedura crea poi l'utente dell'applicazione, genera i segreti e scrive `cleitext-shared/.env` (permessi 600, accanto alla cartella `cleitext`), con le cartelle `media`, `plugins`, `themes` e `backups`.

   4. **Sito e amministratore**: nome del sito, dominio, lingua, email e password del super amministratore.
6. **Accedi** da `/admin/`. I plugin ufficiali SEO e Moduli sono installati ma non attivi; Hi John è attivo, nella bacheca.

**Installa subito dopo aver abilitato Node.js**: finché la procedura non è completata, chi apre il sito per primo può completarla con un suo database e un suo amministratore. Per chiedere anche un codice di setup, imposta `CLEITEXT_SETUP_TOKEN=true` nelle variabili d'ambiente dell'applicazione Node.js prima di abilitarla: la procedura chiede allora il codice scritto nei **Log** del dominio e in `cleitext/tmp/setup-token`.

**Email**: finché non aggiungi `MAIL_URL` e `MAIL_FROM` a `cleitext-shared/.env` (§5) e riavvii l'applicazione, le email (inviti, reimpostazione della password) vengono solo scritte nel log.

**Multilingua** non è nel pacchetto base: scarica `cleitext-plugin-multilingual-<versione>.zip` dalla stessa pagina Releases e caricalo da **Plugin → Carica plugin**.

Il resto della guida descrive l'installazione manuale e gli aggiornamenti (§8).

## 1. Requisiti

| Cosa                           | Versione / note                                                                |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Plesk                          | Obsidian o successiva, con l'estensione **Node.js**                            |
| Node.js                        | 22.12 o successiva (consigliata la 24 LTS), installata dall'estensione Node.js |
| PostgreSQL                     | 16 o successiva, sullo stesso server o raggiungibile da esso                   |
| Strumenti client di PostgreSQL | `pg_dump` e `pg_restore` della stessa versione principale, per i backup        |
| Accesso SSH                    | per l'utente di sistema del dominio, con una chiave                            |

## 2. Database

Crea il database da Plesk (**Databases → Add Database**, tipo PostgreSQL) e **due utenti** su di esso:

- il **proprietario** (per esempio `cleitext_owner`), usato per le migrazioni e i comandi di amministrazione;
- l'utente dell'**applicazione** (per esempio `cleitext_app`), usato dal server in esecuzione. Non deve essere proprietario di nessuna tabella, perché la Row Level Security, che tiene separati i siti, non si applica al proprietario di una tabella.

Il proprietario deve poter creare ruoli: ogni plugin riceve un proprio ruolo PostgreSQL, che può raggiungere solo le tabelle del plugin. Plesk non offre questa opzione, quindi, come root sul server del database:

```bash
sudo -u postgres psql -c 'ALTER ROLE "cleitext_owner" CREATEROLE;'
```

Da PostgreSQL 16, `CREATEROLE` dà potere solo sui ruoli creati dal proprietario stesso.

## 3. Compilare la release

Sul tuo computer, in una copia locale del repository:

```bash
pnpm install
pnpm release        # → release/cleitext-<version>.tar.gz and .zip; inside, the folder is always cleitext/
```

L'archivio contiene:

- `app.js` (file di avvio) e `bin/cleitext` (lo strumento da riga di comando);
- il server e la CLI, con le dipendenze di produzione;
- l'amministrazione compilata, i plugin ufficiali in `plugins/` e le cartelle vuote `public/` e `tmp/` per Passenger.

I moduli nativi (`sharp`, `argon2`) vengono compilati per la piattaforma su cui esegui `pnpm release`. Compila su Linux x64 se il server è Linux x64, per esempio in CI.

## 4. Cartelle sul server

```
/var/www/vhosts/example.com/
├─ cleitext/                 → symbolic link to the current release
├─ releases/
│  └─ cleitext-0.5.0/        one folder per release (the previous ones allow a quick rollback)
└─ cleitext-shared/
   ├─ .env                   settings and secrets (outside the document root)
   ├─ media/                 uploads
   ├─ plugins/               installed plugins
   └─ backups/
```

Carica e scompatta la release:

```bash
scp release/cleitext-0.5.0.tar.gz user@example.com:releases/
ssh user@example.com
cd releases && mkdir cleitext-0.5.0 && tar -xzf cleitext-0.5.0.tar.gz -C cleitext-0.5.0 --strip-components=1 && rm cleitext-0.5.0.tar.gz
mkdir -p ../cleitext-shared/media ../cleitext-shared/plugins ../cleitext-shared/backups
ln -sfn ../../cleitext-shared/.env cleitext-0.5.0/.env
ln -sfn releases/cleitext-0.5.0 ../cleitext
```

## 5. Impostazioni: `cleitext-shared/.env`

```bash
NODE_ENV=production
DATABASE_URL=postgres://cleitext_app:…@localhost:5432/cleitext
DATABASE_ADMIN_URL=postgres://cleitext_owner:…@localhost:5432/cleitext
APP_SECRET=…                      # openssl rand -hex 32
TRUST_PROXY=true                  # behind nginx
MEDIA_PATH=/var/www/vhosts/example.com/cleitext-shared/media
PLUGINS_PATH=/var/www/vhosts/example.com/cleitext-shared/plugins
THEMES_PATH=/var/www/vhosts/example.com/cleitext-shared/themes
MAIL_URL=smtp://user:password@localhost:587
MAIL_FROM=Example <no-reply@example.com>
```

`chmod 600 cleitext-shared/.env`. Le altre impostazioni sono elencate in [`.env.example`](../../.env.example).

## 6. Plesk: l'applicazione Node.js

In **Websites & Domains → example.com → Node.js**:

| Impostazione                                | Valore             |
| ------------------------------------------- | ------------------ |
| Versione di Node.js (Node.js version)       | 22 o 24            |
| Modalità (Application mode)                 | production         |
| Radice dell'applicazione (Application root) | `/cleitext`        |
| File di avvio (Application startup file)    | `app.js`           |
| document root (Document root)               | `/cleitext/public` |

Ogni campo si modifica a sé (clic sul valore, poi sul segno di spunta): non c'è un "Salva" generale. Non eseguire "NPM install": la release contiene già le sue dipendenze. In **Hosting settings**, fai puntare anche la document root del dominio a `cleitext/public` e attiva **SSL/TLS** (Let's Encrypt).

## 7. Prima installazione

```bash
cd /var/www/vhosts/example.com/cleitext
bin/cleitext install --domain example.com --site-name "Example" --site-slug main --locale it
```

Il comando applica le migrazioni, crea il sito e chiede email e password del super amministratore; con `--official-plugins` installa anche SEO e Moduli (non attivi) e Hi John (attivo), come la procedura guidata. Poi attiva l'applicazione in Plesk con **Enable** e apri `https://example.com/admin/`.

**Oppure installa dal browser** (RF-SIT-02): con `DATABASE_ADMIN_URL` nel `.env`, attiva l'applicazione su un database vuoto (senza alcun `.env` parte invece la procedura guidata completa, vedi l'inizio di questa guida). Il server risponde solo su `/install` con un modulo per il sito e il super amministratore (con `CLEITEXT_SETUP_TOKEN=true` chiede anche un codice di setup, scritto nel log: Plesk **Log** del dominio, systemd `journalctl -u cleitext`): l'installazione esegue lo stesso comando in un processo separato, poi il server riparte in modalità normale. Il token deriva da `APP_SECRET`, quindi ogni processo mostra lo stesso.

I plugin ufficiali si installano come qualsiasi altro:

```bash
bin/cleitext plugin:install plugins/seo
bin/cleitext plugin:install plugins/forms
```

Un sito in più lingue ha bisogno del plugin **Multilingua**. Non è nel pacchetto base: `pnpm release` lo scrive in `release/cleitext-plugin-multilingual-<versione>.zip` (lo trovi anche nella pagina Releases). Caricalo da **Plugin → Carica plugin**, oppure scompattalo sul server ed esegui `bin/cleitext plugin:install <cartella>`; poi attivalo sul sito e aggiungi le lingue in **Lingue**. Un sito con una sola lingua non ne ha bisogno e non paga nulla.

**Aggiornare un sito multilingua alla 0.6 (M7).** Le lingue sono passate dal core al plugin Multilingua. La migrazione 0016 mette da parte lingue e collegamenti fra traduzioni del sito; installa e attiva il plugin e li riprende, con gli stessi indirizzi. Fino ad allora il sito mostra solo la lingua predefinita.

## 8. Aggiornamenti

**Dall'amministrazione** (da Cleitext 0.8): i super admin vedono in bacheca un avviso quando esce una nuova versione, e aggiornano da **Aggiornamenti** con un pulsante. Cleitext scarica la release da GitHub, la verifica con il suo SHA-256, fa un backup in `cleitext-shared/backups`, esegue le migrazioni del database, aggiorna i plugin ufficiali installati, passa alla nuova versione e riavvia. Il sito continua a rispondere durante l'aggiornamento; se un passo fallisce, resta sulla versione in uso. La versione precedente viene conservata: `.cleitext-previous` accanto a una cartella `cleitext` installata con la procedura guidata, oppure la cartella precedente in `releases/`.

Lo stesso da SSH: `bin/cleitext update` (`--check` dice solo se ce n'è uno). Gli aggiornamenti arrivano da `UPDATES_REPO` (predefinito `faghy/cleitext`); un valore vuoto spegne il controllo.

**A mano**, come prima:

```bash
# on your computer
pnpm release && scp release/cleitext-0.6.0.tar.gz user@example.com:releases/
# on the server
cd /var/www/vhosts/example.com/releases
mkdir cleitext-0.6.0 && tar -xzf cleitext-0.6.0.tar.gz -C cleitext-0.6.0 --strip-components=1
ln -sfn ../../cleitext-shared/.env cleitext-0.6.0/.env
cleitext-0.6.0/bin/cleitext backup --out ../cleitext-shared/backups/before-0.6.0.tar.gz
cleitext-0.6.0/bin/cleitext migrate
ln -sfn releases/cleitext-0.6.0 ../cleitext
touch ../cleitext/tmp/restart.txt      # or "Restart App" in Plesk
```

In un sito installato con la procedura guidata `cleitext` è una cartella normale: la prima volta spostala in `releases/` (`mkdir -p releases && mv cleitext releases/cleitext-<versione precedente>`), poi segui i passi qui sopra. Configurazione e dati sono già in `cleitext-shared`.

Negli archivi la cartella si chiama sempre `cleitext`; le cartelle con la versione in `releases/` le nomini tu scompattando, con `--strip-components=1`, solo per tenere la release precedente e poter tornare indietro. Il sito gira sempre da `cleitext`.

Per tornare indietro, fai puntare `cleitext` alla release precedente e riavvia. Se le migrazioni hanno modificato il database, ripristina il backup fatto prima dell'aggiornamento (§9).

I plugin non richiedono un riavvio: `plugin:install` e `plugin:uninstall` li ricaricano nel server in esecuzione.

## 9. Backup

```bash
bin/cleitext backup --out ../cleitext-shared/backups/cleitext-$(date +%F).tar.gz
```

Un backup contiene l'intero database (`pg_dump`), i media e i plugin installati. Pianificalo in **Tools & Settings → Scheduled Tasks** (o negli **Scheduled Tasks** del dominio), per esempio ogni notte. Copia i file anche altrove: un backup sullo stesso disco non protegge dalla perdita del server. Se `pg_dump` non è nel `PATH`, imposta `PG_BIN` sulla sua cartella (per esempio `/usr/lib/postgresql/16/bin`).

**Ripristino** (sostituisce database, media e plugin; le cartelle attuali dei media e dei plugin vengono conservate come `*.before-restore`):

```bash
bin/cleitext restore ../cleitext-shared/backups/cleitext-2026-10-10.tar.gz
touch tmp/restart.txt
```

Ogni tanto ripristina un backup su una copia di prova, per essere sicuro che i tuoi backup funzionino.

## 10. Importare contenuti

| Da                     | Comando                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Un altro sito Cleitext | `bin/cleitext export --site main --out site.tar.gz`, poi `bin/cleitext import site.tar.gz --site main` |
| WordPress              | **Tools → Export → All content** in WordPress, poi `bin/cleitext import:wxr export.xml --site main`    |

Le importazioni aggiungono contenuti al sito, non li sostituiscono. I file media di WordPress vengono scaricati dal vecchio sito; se hai una copia della sua cartella `wp-content/uploads`, passa `--uploads /path/to/uploads`. Ogni importazione stampa un resoconto e può salvarlo con `--report report.json`. I vecchi indirizzi vengono reindirizzati a quelli nuovi.

## 11. Più siti

Un'unica installazione serve molti siti. Fai puntare gli altri domini alla stessa applicazione (come alias del dominio in Plesk, oppure come domini la cui document root è la stessa cartella), poi:

```bash
bin/cleitext site:create --slug blog --name "Blog" --domain blog.example.com
bin/cleitext site:domain:add --site main --domain www.example.com
```

## 12. Risoluzione dei problemi

| Problema                                                      | Cosa controllare                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| L'applicazione non si avvia                                   | Plesk → Node.js → log; un errore di configurazione viene stampato con il nome della variabile |
| `permission denied to create role`                            | al ruolo proprietario manca `CREATEROLE` (§2)                                                 |
| Ogni sito risponde "Not Found"                                | il dominio non è registrato: `bin/cleitext site:list`, `site:domain:add`                      |
| Indirizzo del client errato nei log o nei limiti di frequenza | `TRUST_PROXY=true`                                                                            |
| `pg_dump not found`                                           | installa gli strumenti client di PostgreSQL o imposta `PG_BIN`                                |
| `/health/ready` risponde 503                                  | il database non è raggiungibile o mancano delle migrazioni (`bin/cleitext migrate`)           |
