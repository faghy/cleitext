# Installare Cleitext su Plesk

> 🇬🇧 Versione di riferimento in inglese: [docs/DEPLOYMENT.md](../DEPLOYMENT.md). Questa traduzione è secondaria e può essere meno aggiornata.

Questa guida installa Cleitext su un server gestito con Plesk, usando l'estensione **Node.js** di Plesk (Phusion Passenger). La release viene compilata sul tuo computer o in CI; il server riceve solo i file compilati.

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
pnpm release        # → release/cleitext-<version>.tar.gz
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
cd releases && tar -xzf cleitext-0.5.0.tar.gz && rm cleitext-0.5.0.tar.gz
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

Il comando applica le migrazioni, crea il sito e chiede email e password del super amministratore. Poi attiva l'applicazione in Plesk con **Enable** e apri `https://example.com/admin/`.

I plugin ufficiali si installano come qualsiasi altro:

```bash
bin/cleitext plugin:install plugins/seo
bin/cleitext plugin:install plugins/forms
```

## 8. Aggiornamenti

```bash
# on your computer
pnpm release && scp release/cleitext-0.6.0.tar.gz user@example.com:releases/
# on the server
cd /var/www/vhosts/example.com/releases && tar -xzf cleitext-0.6.0.tar.gz
ln -sfn ../../cleitext-shared/.env cleitext-0.6.0/.env
cleitext-0.6.0/bin/cleitext backup --out ../cleitext-shared/backups/before-0.6.0.tar.gz
cleitext-0.6.0/bin/cleitext migrate
ln -sfn releases/cleitext-0.6.0 ../cleitext
touch ../cleitext/tmp/restart.txt      # or "Restart App" in Plesk
```

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
