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
6. **Accedi** da `/cl-admin/`. I plugin ufficiali SEO e Moduli sono installati ma non attivi; Hi John è attivo, nella bacheca.

**Installa subito dopo aver abilitato Node.js**: finché la procedura non è completata, chi apre il sito per primo può completarla con un suo database e un suo amministratore. Per chiedere anche un codice di setup, imposta `CLEITEXT_SETUP_TOKEN=true` nelle variabili d'ambiente dell'applicazione Node.js prima di abilitarla: la procedura chiede allora il codice scritto nei **Log** del dominio e in `cleitext/tmp/setup-token`.

**Email**: finché non aggiungi `MAIL_URL` e `MAIL_FROM` a `cleitext-shared/.env` (§5) e riavvii l'applicazione, le email (inviti, reimpostazione della password) vengono solo scritte nel log.

**Plugin e temi dal catalogo.** I super admin installano i plugin ufficiali (Multilingua, Privacy e GDPR, Analytics…) e i temi (Canvas, Pulsar…) da **Plugin → Aggiungi nuovo** e **Aspetto → Temi → Aggiungi nuovo tema**, e li aggiornano da lì o da **Aggiornamenti**. Il [catalogo di Cleitext](https://github.com/faghy/cleitext-catalog) è un indice firmato con Ed25519; ogni pacchetto viene verificato con il suo SHA-256 prima dell'installazione. `CATALOG_URL` (vuoto: spento) e `CATALOG_PUBLIC_KEY` cambiano da dove arriva.

**Multilingua**, **Privacy e GDPR** e **Analytics** non sono nel pacchetto base: installali dal catalogo, oppure scarica `cleitext-plugin-multilingual-<versione>.zip`, `cleitext-plugin-privacy-<versione>.zip` o `cleitext-plugin-analytics-<versione>.zip` dalla stessa pagina Releases e caricalo da **Plugin → Carica plugin** (vedi [PRIVACY.md](./PRIVACY.md) per il banner dei cookie e le policy).

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
TRUST_PROXY=true                  # dietro nginx (loopback e reti private)
# TRUST_CLOUDFLARE=true           # anche dietro Cloudflare (nuvola arancione)
MEDIA_PATH=/var/www/vhosts/example.com/cleitext-shared/media
PLUGINS_PATH=/var/www/vhosts/example.com/cleitext-shared/plugins
THEMES_PATH=/var/www/vhosts/example.com/cleitext-shared/themes
MAIL_URL=smtp://user:password@localhost:587   # oppure sendmail:// (il sendmail del server, senza casella)
MAIL_FROM=Example <no-reply@example.com>
```

Su Plesk, `localhost:25` senza le credenziali di una casella consegna solo ai domini del server («Relay access denied»): usa `MAIL_URL=sendmail://`, che passa i messaggi al sistema di posta del server, oppure i dati SMTP di una casella.

`chmod 600 cleitext-shared/.env`. Le altre impostazioni sono elencate in [`.env.example`](../../.env.example).

### Proxy e indirizzo del visitatore

Il limite ai tentativi di accesso, i limiti di frequenza, il registro delle attività, i controlli antispam su commenti e moduli, gli indirizzi fidati del plugin Captcha e il resoconto dell'installazione usano tutti l'indirizzo del visitatore. Dietro un proxy il server vede solo il proxy, quindi legge l'indirizzo da `X-Forwarded-For` percorrendolo **da destra**: ogni proxy fidato passa la mano all'indirizzo che riporta, e il primo indirizzo che non è un proxy fidato è il visitatore. Le voci più a sinistra le scrive il visitatore e non vengono mai credute come tali.

| `TRUST_PROXY`                                               | Proxy fidati                                                                                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `false` (predefinito)                                       | nessuno: `X-Forwarded-*` viene ignorato, il visitatore è chi si collega                                                                                                                                        |
| `true`                                                      | loopback, link-local e reti private: `127.0.0.0/8`, `::1`, `169.254.0.0/16`, `fe80::/10`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `fc00::/7`. L'nginx di Plesk, HAProxy su WireGuard |
| un numero, ad esempio `2`                                   | quel numero di passaggi, qualunque sia l'indirizzo. Solo se nessuno può raggiungere Cleitext direttamente (ascolta su `127.0.0.1`)                                                                             |
| un elenco, ad esempio `loopback,10.0.0.200,198.51.100.0/24` | esattamente questi indirizzi e reti (CIDR), e le parole chiave `loopback`, `linklocal`, `uniquelocal`                                                                                                          |

Un proxy su un indirizzo **pubblico** (un bilanciatore o un altro server raggiunto via internet) non rientra in `true`: elencalo, ad esempio `TRUST_PROXY=loopback,uniquelocal,198.51.100.20`, altrimenti il suo indirizzo viene preso per quello del visitatore.

**Dietro Cloudflare** (nuvola arancione) imposta anche `TRUST_CLOUDFLARE=true`: diventano fidate anche le reti pubblicate da Cloudflare, così con Cloudflare → HAProxy → nginx → Cleitext l'indirizzo che Cloudflare aggiunge a `X-Forwarded-For` è quello del visitatore, e un visitatore non può fingere di passare da Cloudflare scrivendo l'intestazione da sé. `CF-Connecting-IP` non viene letto. L'elenco delle reti è incluso in Cleitext (`apps/server/src/config/trust-proxy.ts`, con la sua data) e viene aggiornato nelle nuove versioni da <https://www.cloudflare.com/ips-v4> e <https://www.cloudflare.com/ips-v6>. `TRUST_CLOUDFLARE` non si può combinare con un numero di passaggi.

Le installazioni esistenti con `TRUST_PROXY=true` continuano a funzionare: il valore ora indica le reti private qui sopra invece di «qualunque proxy», e questo impedisce di falsificare la voce più a sinistra di `X-Forwarded-For`. Nella procedura guidata la casella **Dietro un proxy** scrive `TRUST_PROXY=true` e **Dietro Cloudflare** scrive `TRUST_CLOUDFLARE=true`.

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

Il comando applica le migrazioni, crea il sito e chiede email e password del super amministratore; con `--official-plugins` installa anche SEO e Moduli (non attivi) e Hi John (attivo), come la procedura guidata. Poi attiva l'applicazione in Plesk con **Enable** e apri `https://example.com/cl-admin/`.

**Oppure installa dal browser** (RF-SIT-02): con `DATABASE_ADMIN_URL` nel `.env`, attiva l'applicazione su un database vuoto (senza alcun `.env` parte invece la procedura guidata completa, vedi l'inizio di questa guida). Il server risponde solo su `/install` con un modulo per il sito e il super amministratore (con `CLEITEXT_SETUP_TOKEN=true` chiede anche un codice di setup, scritto nel log: Plesk **Log** del dominio, systemd `journalctl -u cleitext`): l'installazione esegue lo stesso comando in un processo separato, poi il server riparte in modalità normale. Il token deriva da `APP_SECRET`, quindi ogni processo mostra lo stesso.

I plugin ufficiali si installano come qualsiasi altro:

```bash
bin/cleitext plugin:install plugins/seo
bin/cleitext plugin:install plugins/forms
```

Un sito in più lingue ha bisogno del plugin **Multilingua**. Non è nel pacchetto base: `pnpm release` lo scrive in `release/cleitext-plugin-multilingual-<versione>.zip` (lo trovi anche nella pagina Releases). Caricalo da **Plugin → Carica plugin**, oppure scompattalo sul server ed esegui `bin/cleitext plugin:install <cartella>`; poi attivalo sul sito e aggiungi le lingue in **Lingue**. Un sito con una sola lingua non ne ha bisogno e non paga nulla.

**Aggiornare un sito multilingua alla 0.6 (M7).** Le lingue sono passate dal core al plugin Multilingua. La migrazione 0016 mette da parte lingue e collegamenti fra traduzioni del sito; installa e attiva il plugin e li riprende, con gli stessi indirizzi. Fino ad allora il sito mostra solo la lingua predefinita.

## 8. Aggiornamenti

**Dall'amministrazione** (da Cleitext 0.8): i super admin vedono in bacheca un avviso quando esce una nuova versione, e aggiornano da **Aggiornamenti** con un pulsante. Cleitext scarica la release da GitHub, la verifica con il suo SHA-256, fa un backup in `cleitext-shared/backups`, esegue le migrazioni del database, aggiorna i plugin ufficiali installati, **avvia la nuova versione di prova** (su una porta locale libera, senza lavori programmati) e controlla che sia pronta e che mostri la home di un sito; solo dopo passa alla nuova versione e riavvia. Il sito continua a rispondere durante l'aggiornamento; se un passo fallisce, prova compresa, resta sulla versione in uso e l'errore spiega il perché. La versione precedente viene conservata: `.cleitext-previous` accanto a una cartella `cleitext` installata con la procedura guidata, oppure la cartella precedente in `releases/`.

Se dopo un aggiornamento qualcosa non va, `cleitext rollback` torna alla versione precedente (rieseguilo per annullare). Il database resta com'è, perché le migrazioni aggiungono soltanto; per riportare indietro anche quello, ripristina il backup fatto prima dell'aggiornamento: `cleitext restore cleitext-shared/backups/before-<versione>.tar.gz`.

Plugin e temi funzionano allo stesso modo. Un aggiornamento dal catalogo conserva la versione precedente come `<slug>.previous`. Se la nuova versione non si carica, Cleitext rimette subito quella precedente e lo dice. A mano: `cleitext plugin:rollback <slug>` e `cleitext theme:rollback <slug>`.

Lo stesso da SSH: `bin/cleitext update` (`--check` dice solo se ce n'è uno). Gli aggiornamenti arrivano da `UPDATES_REPO` (predefinito `faghy/cleitext`); un valore vuoto spegne il controllo.

**Resoconto delle installazioni.** Come WordPress comunica a wordpress.org cosa usa un sito, circa una volta al giorno ogni sito visitato invia a cleitext.com:

- il suo indirizzo;
- la versione di Cleitext;
- il tema in uso e i temi e plugin installati, con le versioni e se sono attivi;
- un identificativo casuale del server, che raggruppa i siti di una stessa installazione.

Non viene inviato nulla su contenuti, utenti o visitatori. I manutentori usano questo registro per sapere quali versioni sono in uso prima di un rilascio, e per avvisare i siti colpiti da un aggiornamento difettoso. Ogni sito può spegnerlo in **Impostazioni → Generali → Resoconto delle installazioni**; `INSTALL_REPORT_URL` cambia la destinazione dei resoconti di tutto il server, e un valore vuoto li spegne. Il registro cancella i siti da cui non riceve nulla da 180 giorni. Segnalano solo le installazioni in produzione (`NODE_ENV=production`): sviluppo, test e la prova di un aggiornamento non lo fanno mai, e il registro ignora gli indirizzi locali e di prova (`localhost`, `.test`, `.local`, IP privati).

**Aggiornamenti automatici** (Cleitext 0.27 e successivi), come in WordPress: in **Aggiornamenti → Aggiornamenti automatici** i super amministratori scelgono, per tutto il server, se Cleitext si aggiorna da solo (**Spenti**, **Solo versioni di correzione**, come 0.26.0 → 0.26.1, o **Tutte le versioni**) e quali plugin e temi del catalogo si aggiornano da soli. Tutto è spento finché non si sceglie. Circa due volte al giorno Cleitext aggiorna i plugin e i temi scelti che funzionano con la versione installata (quelli a pagamento finché la licenza include l'aggiornamento), poi il core come sopra; i super amministratori ricevono un'email con quello che è cambiato e la pagina ne tiene lo storico. **Controlla e aggiorna ora** lo fa subito. Le scelte stanno in `auto-updates.json` accanto alla cartella dei media.

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

Le importazioni aggiungono contenuti al sito, non li sostituiscono. Ogni importazione stampa un resoconto e può salvarlo con `--report report.json`.

**Da WordPress**: installa il plugin **WordPress Importer** da **Plugin → Aggiungi nuovo** (non è nel pacchetto base), esporta il vecchio sito con **Strumenti → Esporta → Tutti i contenuti** in WordPress, poi apri **Importa da WordPress** nell'amministrazione e carica il file. Lavora in background e alla fine mostra un resoconto; i vecchi indirizzi vengono reindirizzati a quelli nuovi. I file media vengono scaricati dal vecchio sito (solo da indirizzi pubblici), quindi tienilo online finché l'importazione non finisce. Gli indirizzi di WordPress finiscono con la barra (`/mia-pagina/`): attiva **Indirizzi con la barra finale** in **Impostazioni → Struttura dei contenuti** per mantenerli identici (il resoconto lo suggerisce). La scelta **Commenti** importa quelli approvati (predefinito), tutti oppure nessuno.

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
| Indirizzo del client errato nei log o nei limiti di frequenza | `TRUST_PROXY=true`; `TRUST_CLOUDFLARE=true` dietro Cloudflare; elenca i proxy pubblici (§5)   |
| `pg_dump not found`                                           | installa gli strumenti client di PostgreSQL o imposta `PG_BIN`                                |
| `/health/ready` risponde 503                                  | il database non è raggiungibile o mancano delle migrazioni (`bin/cleitext migrate`)           |

## 13. Automazione (JSON)

I pannelli di hosting (l'estensione Plesk **Cleitext Toolkit**) e gli script usano Cleitext solo con i comandi `bin/cleitext … --json`, eseguiti come utente di sistema del dominio. Le regole:

- Con `--json` un comando stampa **un solo oggetto JSON** su stdout, seguito da un a capo. I messaggi di avanzamento e i log vanno su stderr.
- Se qualcosa va storto, l'oggetto è `{"error":{"code":"…","message":"…"}}` e il codice di uscita non è 0. `code` è stabile e serve ai programmi; `message` è per le persone.
- Con `--json` non ci sono mai domande. Le password arrivano da stdin (`--password-stdin`) e i comandi distruttivi vogliono `--yes`.
- Senza `--json` ogni comando stampa lo stesso testo di prima.

**Codici di errore.**

| Codice                                                                                     | Significato                                                                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `usage`                                                                                    | comando o opzione sconosciuti, oppure manca un'opzione obbligatoria                     |
| `not_configured`                                                                           | `DATABASE_ADMIN_URL` (o il ruolo dell'applicazione) non è impostato                     |
| `db_unreachable`                                                                           | il database rifiuta la connessione, la password è sbagliata o il database non esiste    |
| `missing_option`, `invalid_option`, `password_required`, `confirmation_required`           | i dati sono incompleti o sbagliati                                                      |
| `not_found`, `not_member`, `user_inactive`, `site_archived`, `no_domain`                   | `login-link` e i comandi dei domini                                                     |
| `primary_domain`                                                                           | `site:domain:remove` sul dominio principale                                             |
| `installed`                                                                                | `install` quando esiste già un sito                                                     |
| `no_previous_version`, `update_failed`                                                     | `rollback`, `update`                                                                    |
| `db_connect`, `db_version`, `db_createrole`, `db_owner`, `db_role_taken`, `db_app_connect` | `configure`: gli stessi problemi della procedura guidata, con il comando per risolverli |
| `timeout`                                                                                  | nessuna risposta in tempo                                                               |
| `failed`                                                                                   | ogni altro problema, spiegato dal messaggio                                             |
| `internal`                                                                                 | un errore inatteso (un bug: segnalalo)                                                  |

### Stato e controlli

`cleitext status --json` [`--root <cartella>`] funziona anche con il database spento: in quel caso `db` vale `{"ok":false,"error":"…"}`.

```json
{
  "version": "0.58.0",
  "root": "/var/www/vhosts/example.com/releases/cleitext-0.58.0",
  "layout": "releases",
  "link": "/var/www/vhosts/example.com/cleitext",
  "previous": {
    "version": "0.57.0",
    "path": "/var/www/vhosts/example.com/releases/cleitext-0.57.0"
  },
  "node": "22.12.0",
  "configured": true,
  "envFile": "/var/www/vhosts/example.com/cleitext-shared/.env",
  "dataDir": "/var/www/vhosts/example.com/cleitext-shared",
  "db": {
    "ok": true,
    "postgres": "17.2",
    "database": "cleitext",
    "migrations": { "applied": 28, "expected": 28, "pending": 0 }
  },
  "installed": true,
  "sites": [
    {
      "id": "…",
      "slug": "main",
      "name": "Esempio",
      "status": "active",
      "maintenance": false,
      "locale": "it",
      "domains": [{ "host": "example.com", "primary": true, "forceHttps": true }],
      "url": "https://example.com/"
    }
  ],
  "autoUpdates": {
    "core": "patch",
    "items": [{ "type": "plugin", "slug": "seo" }],
    "lastRun": null,
    "nextRun": null
  },
  "lastUpdate": null,
  "appUrls": ["https://example.com/"]
}
```

`layout` vale `folder` (una cartella `cleitext`, come la lascia la procedura guidata) oppure `releases` (`releases/cleitext-<versione>` più il collegamento `cleitext`, §4). `previous` è la versione a cui torna `cleitext rollback`. `lastUpdate` è il file di avanzamento dell'ultimo aggiornamento del core. `appUrls` elenca prima `APP_URL`, se è impostato, poi la home di ogni sito.

`cleitext doctor --json` [`--offline`] restituisce `{"status":"ok|warn|fail","checks":[{"id","status","message","fix?"}]}`. Senza `--json` esce con 1 quando un controllo fallisce. I controlli sono:

| `id`                              | Cosa controlla                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `env_file`                        | il `.env` esiste e ha i permessi 600                                                             |
| `document_root`                   | `cleitext/public` esiste e in `httpdocs` non è rimasta la pagina predefinita (per quanto si può) |
| `setup_token`                     | non è rimasto un token di installazione in `tmp/setup-token`                                     |
| `trust_proxy`                     | `TRUST_PROXY` è impostato e non è un semplice numero di passaggi                                 |
| `database`                        | il database risponde                                                                             |
| `https`                           | `APP_URL` e gli indirizzi dei siti usano HTTPS                                                   |
| `migrations`                      | non ci sono migrazioni in sospeso                                                                |
| `installed`                       | esiste un sito, quindi l'installazione non è aperta al primo visitatore                          |
| `owner_createrole`                | il ruolo proprietario ha `CREATEROLE`, che serve ai plugin con tabelle                           |
| `pg_dump`                         | `pg_dump` c'è e la sua versione principale non è più vecchia di quella del server                |
| `disk_space`                      | nella cartella dei backup c'è spazio per un backup: database, media e plugin                     |
| `core_update`                     | una versione più recente di Cleitext (saltato con `--offline`)                                   |
| `plugin_updates`, `theme_updates` | versioni compatibili più recenti nel catalogo firmato (saltato con `--offline`)                  |

### Configurare e installare

```bash
printf '%s' "$OWNER_PASSWORD" | bin/cleitext configure --json \
  --db-host localhost --db-port 5432 --db-name example_cleitext --owner example_owner \
  [--app-role example_app] [--data-dir <cartella>] [--app-url https://example.com] \
  [--trust-proxy true] [--trust-cloudflare] [--app-secret-from <altro .env>]
```

`configure` è il passo del database della procedura guidata e usa lo stesso codice. Controlla il proprietario (PostgreSQL 16 o successivo, `CREATEROLE`, proprietario del database), crea o aggiorna il ruolo dell'applicazione (di solito `<db-name>_app`) e scrive `cleitext-shared/.env` con i permessi 600. Il file è collegato dalla cartella della release, come si aspetta `cleitext update`. La password del proprietario arriva da stdin o da `CLEITEXT_DB_OWNER_PASSWORD`. Non arriva mai da un'opzione, perché le opzioni si vedono nell'elenco dei processi.

Si può eseguire più volte. Mantiene `APP_SECRET`, la password del ruolo dell'applicazione, `TRUST_PROXY`/`TRUST_CLOUDFLARE` (se non li ripeti) e tutte le altre impostazioni del file (`MAIL_URL`, …). Se non cambia niente, il file non viene riscritto. Un file modificato resta come `.env.bak-<data>`. `--app-url` viene scritto come `APP_URL`: lo leggono `status`, `doctor` e `login-link`, mentre il server lo ignora.

Risultato: `{"envFile","envLink","dataDir","appRole","changed":true,"secret":"new|kept|copied"}`.

Poi `bin/cleitext install --json --site-name … --site-slug … --domain … --admin-email … --password-stdin [--locale it] [--official-plugins]` restituisce `{"site":{"id","slug","name","domain"},"admin","adminUrl","plugins":[{"slug","version","active"}]}`.

### Accesso con un clic

```bash
bin/cleitext login-link --json (--email <indirizzo> | --first-super-admin) [--site <slug>] [--ttl 60]
# {"url":"https://example.com/api/v1/auth/one-time?token=…","expiresAt":"…","user":"…","site":"main"}
```

Il link fa entrare nell'amministrazione di quel sito, di solito il primo sito attivo. Può crearlo solo chi esegue comandi sul server: il pannello lancia il comando come utente del dominio. Come è protetto:

- Funziona **una volta sola**, entro la sua durata: 60 secondi di solito, al massimo 300. Del token si conserva solo lo SHA-256, come per tutti gli altri token (tipo `panel_login`).
- Funziona solo sul sito per cui è stato creato, e solo per un utente attivo che può usare quel sito: un membro o un super amministratore.
- `GET /api/v1/auth/one-time?token=…` crea una sessione normale (le solite regole del cookie: `HttpOnly`, `SameSite=Lax`, `Secure` su HTTPS, senza "ricordami"). Poi porta a `/cl-admin/`. Le risposte hanno `cache-control: no-store` e `referrer-policy: no-referrer`.
- I link sbagliati o già usati contano come accessi falliti dell'indirizzo: 20 in 15 minuti lo bloccano per 15 minuti (`429`).
- Il registro attività annota `auth.login_panel`.

**Con questi link non viene chiesta l'autenticazione a due fattori**, come fa WP Toolkit con WordPress. Chi può eseguire il comando controlla già l'installazione: può leggere `.env`, il database e i segreti 2FA. Un secondo fattore non proteggerebbe niente contro di lui. Un pannello che offre il pulsante deve verificare i propri utenti come al solito.

### Altri comandi

| Comando                                                         | Risultato JSON                                                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `migrate`                                                       | `{"applied","total","expected","appRole"}` (`applied`: le migrazioni eseguite adesso)                       |
| `update --check`                                                | `{"current","latest","available","publishedAt","url","notes"}`                                              |
| `update [--to <v>]`                                             | `{"updated":true,"from","to","root","previous","backup"}`, oppure `{"updated":false,"from","to","current"}` |
| `rollback`                                                      | `{"from","to","root","databaseBackup"}`                                                                     |
| `site:create`                                                   | il sito, come in `status`                                                                                   |
| `site:list`                                                     | `{"sites":[…]}`, come in `status`                                                                           |
| `site:domain:add` / `site:domain:remove`                        | `{"site","domain","primary"}` / `{"site","domain","removed":true}`                                          |
| `site:domain:replace --from <host> --to <host> [--site <slug>]` | `{"site","from","to","primary"}`: rinomina un dominio e mantiene se è principale e se forza HTTPS           |
| `site:maintenance`, `site:archive`, `site:update`               | `{"site",…}`                                                                                                |
| `user:create … --password-stdin`                                | `{"id","email","superAdmin","site","role"}`                                                                 |
| `user:reset-password --email <e> --password-stdin`              | `{"email"}`                                                                                                 |
| `plugin:list`                                                   | `{"plugins":[{"slug","name","version","apiVersion","network","mustUse","paid","activeOn":["main"]}]}`       |
| `plugin:activate <slug> --site <s>` \| `--network`              | `{"slug","site","version","alreadyActive","network"}`                                                       |
| `plugin:deactivate <slug> --site <s>` \| `--network`            | `{"slug","site","network","message"}`                                                                       |
| `plugin:install`, `plugin:rollback`, `plugin:uninstall --yes`   | `{"slug","version","previousVersion","migrations"}`, `{"slug","from","to"}`, `{"slug","uninstalled"}`       |
| `theme:list`                                                    | `{"themes":[{"slug","name","version","bundled"}]}`                                                          |
| `backup [--out <file>]`                                         | `{"file","bytes"}`. File predefinito: `cleitext-shared/backups/cleitext-<data>.tar.gz`                      |
| `backup:list [--dir <cartella>]`                                | `{"dir","backups":[{"name","path","bytes","createdAt","beforeVersion"}]}`, dal più recente                  |
| `backup:prune --keep <n> [--dir <cartella>]`                    | `{"dir","keep","removed":[…]}`: tiene gli n più recenti, compresi quelli fatti prima degli aggiornamenti    |
| `restore <file> --yes`                                          | `{"file","createdAt","postgres","revokedRoles"}`                                                            |

`plugin:activate --site` attiva il plugin come il pulsante **Attiva** dell'amministrazione. Controlla dipendenze e conflitti, crea i tipi di contenuto ed esegue `onActivate`, e il registro attività lo annota. Un plugin a pagamento richiede la licenza del sito, inserita prima nell'amministrazione. `--network` lo attiva su tutti i siti.

### Copiare un sito (clone)

Un backup si può ripristinare in un altro database, con un altro nome e altri ruoli. I ruoli dei plugin portano un'etichetta del nome del database (`cleitext_plg_<slug>_<hash>`). Dopo un ripristino, `restore` crea i ruoli dei plugin del nuovo database e ridà loro i permessi. Inoltre **toglie ogni permesso ai ruoli del database di origine** (il suo ruolo dell'applicazione e i suoi ruoli dei plugin), così l'installazione originale non può raggiungere la copia. I ruoli che il ripristino ha dovuto creare solo per questo vengono di nuovo eliminati. I loro nomi sono in `revokedRoles`.

```bash
# sull'origine
bin/cleitext backup --json                      # → {"file": ".../cleitext-2026-10-21-10-00-00.tar.gz"}
# sulla copia: scompatta la release (§4), poi
printf '%s' "$OWNER_PASSWORD" | bin/cleitext configure --json --db-name copy_db --owner copy_owner \
  --app-secret-from /var/www/vhosts/example.com/cleitext-shared/.env
bin/cleitext restore /percorso/cleitext-2026-10-21-10-00-00.tar.gz --yes --json
bin/cleitext site:domain:replace --json --from example.com --to staging.example.com
bin/cleitext site:domain:remove --json --site main --domain www.example.com   # gli alias che la copia non serve
```

**Prendi `APP_SECRET` dall'origine** (`--app-secret-from`). Con questo segreto sono cifrati i segreti a due fattori, la password SMTP e le chiavi di licenza: con un segreto diverso la copia non riesce a leggerli. Le licenze a pagamento sono attivate per un indirizzo: se nella copia servono i loro aggiornamenti, attiva di nuovo la chiave. Le sessioni copiate con il database restano legate ai cookie del vecchio dominio.
