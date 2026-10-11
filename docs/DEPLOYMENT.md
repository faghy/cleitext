# Deploying Cleitext on Plesk

> 🇮🇹 [Leggi in italiano](./it/DEPLOY.md)

This guide installs Cleitext on a server managed with Plesk, using the Plesk **Node.js** extension (Phusion Passenger). The server only receives compiled files: download them from the Releases page, or build them yourself (§3).

## Quick installation: the setup wizard

The easiest way, as with WordPress: nothing to build, no configuration file to write.

1. **Download** `cleitext-<version>.zip` from the [Releases](https://github.com/faghy/cleitext/releases) page. It is built for Linux x64.
2. **The database**: the wizard can create it for you with the PostgreSQL administrator's user and password (Plesk: **Tools & Settings → Database Servers → PostgreSQL**). Or create it yourself in Plesk (**Databases → Add Database**, type PostgreSQL, with one user) and note the database name, the user and the password.
3. **Upload the zip** to the domain's folder (**Files**, then **Extract Files**): it creates the `cleitext` folder. The version is only in the name of the zip, never in the folder.
4. **Set up Node.js** (**Websites & Domains → Node.js**) as in §6: application root `/cleitext`, document root `/cleitext/public`, startup file `app.js`, Node.js 22 or 24, mode production. In **Hosting settings** point the document root to `cleitext/public` as well, and enable **SSL/TLS** (Let's Encrypt). Then **Enable Node.js**.
5. **Open the site.** The wizard starts at `/install`:
   1. **Welcome**: what you need, then **Start**.
   2. **Requirements**: Node.js, writable folders, `pg_dump` for backups, HTTPS.
   3. **Database**, in one of two ways:
      - **Create it now** (the default): enter the database name and the PostgreSQL administrator. The wizard creates the owner user (with the right to create roles) and the database; the administrator is used only at that moment and is not saved.
      - **It already exists**: enter the database name and its user, which becomes the owner. If it cannot create roles, the page shows the command to run once as root, for example:
        ```bash
        sudo -u postgres psql -c 'ALTER ROLE "example_user" CREATEROLE;'
        ```

      Either way the wizard then creates the application user, generates the secrets and writes `cleitext-shared/.env` (mode 600, next to the `cleitext` folder), with the `media`, `plugins`, `themes` and `backups` folders.

   4. **Site and administrator**: site name, domain, language, the super admin's email and password.
6. **Sign in** at `/admin/`. The official SEO and Forms plugins are installed but not active; Hi John is active, on the dashboard.

**Install right after enabling Node.js**: until the wizard is completed, whoever opens the site first can complete it with their own database and administrator. To require a setup token as well, set `CLEITEXT_SETUP_TOKEN=true` in the environment of the Node.js application before enabling it: the wizard then asks for the token printed in the domain's **Logs** and kept in `cleitext/tmp/setup-token`.

**Email**: until you add `MAIL_URL` and `MAIL_FROM` to `cleitext-shared/.env` (§5) and restart the app, emails (invitations, password resets) are only written to the log.

**Plugins and themes from the catalog.** Super admins install the official plugins (Multilingual, Privacy & GDPR, Analytics…) and themes (Canvas, Pulsar…) from **Plugins → Add New** and **Appearance → Themes → Add New**, and update them from there or from **Updates**. The [Cleitext catalog](https://github.com/faghy/cleitext-catalog) is an index signed with Ed25519; every package is checked against its SHA-256 before installing. `CATALOG_URL` (empty: off) and `CATALOG_PUBLIC_KEY` change where it comes from.

**Multilingual**, **Privacy & GDPR** and **Analytics** are not in the base package: install them from the catalog, or download `cleitext-plugin-multilingual-<version>.zip`, `cleitext-plugin-privacy-<version>.zip` or `cleitext-plugin-analytics-<version>.zip` from the same Releases page and upload it in **Plugins → Upload Plugin** (see [PRIVACY.md](./PRIVACY.md) for the cookie banner and the policies).

The rest of this guide is the manual installation, and the updates (§8).

## 1. Requirements

| What                    | Version / notes                                                           |
| ----------------------- | ------------------------------------------------------------------------- |
| Plesk                   | Obsidian or later, with the **Node.js** extension                         |
| Node.js                 | 22.12 or later (24 LTS recommended), installed from the Node.js extension |
| PostgreSQL              | 16 or later, on the same server or reachable from it                      |
| PostgreSQL client tools | `pg_dump` and `pg_restore` of the same major version, for backups         |
| SSH access              | for the domain's system user, with a key                                  |

## 2. Database

Create the database from Plesk (**Databases → Add Database**, type PostgreSQL) and **two users** on it:

- the **owner** (for example `cleitext_owner`), used for migrations and administrative commands;
- the **application** user (for example `cleitext_app`), used by the running server. It must not own any table, because Row Level Security, which keeps sites apart, does not apply to the owner of a table.

The owner must be allowed to create roles: each plugin gets its own PostgreSQL role, which can only reach the plugin's tables. Plesk does not offer this option, so as root on the database server:

```bash
sudo -u postgres psql -c 'ALTER ROLE "cleitext_owner" CREATEROLE;'
```

Since PostgreSQL 16, `CREATEROLE` only gives power over the roles the owner creates itself.

## 3. Build the release

On your computer, in a checkout of the repository:

```bash
pnpm install
pnpm release        # → release/cleitext-<version>.tar.gz and .zip; inside, the folder is always cleitext/
```

The archive contains:

- `app.js` (startup file) and `bin/cleitext` (the command-line tool);
- the server and the CLI, with production dependencies;
- the built admin, the official plugins in `plugins/`, and empty `public/` and `tmp/` folders for Passenger.

Native modules (`sharp`, `argon2`) are built for the platform where you run `pnpm release`. Build on Linux x64 if the server is Linux x64, for example in CI.

## 4. Folders on the server

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

Upload and unpack the release:

```bash
scp release/cleitext-0.5.0.tar.gz user@example.com:releases/
ssh user@example.com
cd releases && mkdir cleitext-0.5.0 && tar -xzf cleitext-0.5.0.tar.gz -C cleitext-0.5.0 --strip-components=1 && rm cleitext-0.5.0.tar.gz
mkdir -p ../cleitext-shared/media ../cleitext-shared/plugins ../cleitext-shared/backups
ln -sfn ../../cleitext-shared/.env cleitext-0.5.0/.env
ln -sfn releases/cleitext-0.5.0 ../cleitext
```

## 5. Settings: `cleitext-shared/.env`

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

`chmod 600 cleitext-shared/.env`. The other settings are listed in [`.env.example`](../.env.example).

## 6. Plesk: the Node.js application

In **Websites & Domains → example.com → Node.js**:

| Setting                  | Value              |
| ------------------------ | ------------------ |
| Node.js version          | 22 or 24           |
| Application mode         | production         |
| Application root         | `/cleitext`        |
| Application startup file | `app.js`           |
| Document root            | `/cleitext/public` |

Each field is edited on its own (click the value, then the check mark); there is no global "Save". Do not run "NPM install": the release already contains its dependencies. In **Hosting settings**, point the domain's document root to `cleitext/public` as well, and enable **SSL/TLS** (Let's Encrypt).

## 7. First installation

```bash
cd /var/www/vhosts/example.com/cleitext
bin/cleitext install --domain example.com --site-name "Example" --site-slug main --locale it
```

The command applies the migrations, creates the site and asks for the super admin's email and password; with `--official-plugins` it also installs SEO and Forms (not active) and Hi John (active), as the wizard does. Then **Enable** the application in Plesk and open `https://example.com/admin/`.

**Or install from the browser** (RF-SIT-02): with `DATABASE_ADMIN_URL` in `.env`, enable the application on an empty database (without any `.env`, the full setup wizard starts instead, see the top of this guide). The server then answers only `/install` and shows a form for the site and the super admin (with `CLEITEXT_SETUP_TOKEN=true` it also asks for a setup token, printed in its log: Plesk **Logs** of the domain, systemd `journalctl -u cleitext`): the installation runs the same command in a separate process, then the server restarts in normal mode. The token is derived from `APP_SECRET`, so every process shows the same one.

Official plugins are installed like any other:

```bash
bin/cleitext plugin:install plugins/seo
bin/cleitext plugin:install plugins/forms
```

A site in more than one language needs the **Multilingual** plugin. It is not in the base package: `pnpm release` writes it to `release/cleitext-plugin-multilingual-<version>.zip` (also on the Releases page). Upload it in **Plugins → Upload Plugin**, or unpack it on the server and run `bin/cleitext plugin:install <folder>`; then activate it on the site and add the languages in **Languages**. A site with one language does not need it and pays nothing for it.

**Upgrading a multilingual site to 0.6 (M7).** Languages moved from the core to the Multilingual plugin. Migration 0016 keeps the site's languages and translation links aside; install and activate the plugin and it takes them over, with the same addresses. Until then the site shows its default language only.

## 8. Updates

**From the admin** (Cleitext 0.8 and later): super admins see a notice on the dashboard when a new version is published, and update in **Updates** with one button. Cleitext downloads the release from GitHub, checks it against its SHA-256, makes a backup in `cleitext-shared/backups`, runs the database migrations, updates the official plugins that are installed, switches to the new version and restarts. The site keeps answering during the update; if a step fails, it stays on the running version. The previous version is kept: `.cleitext-previous` next to a `cleitext` folder installed by the wizard, or the previous folder in `releases/`.

The same from SSH: `bin/cleitext update` (`--check` only tells whether there is one). Updates come from `UPDATES_REPO` (default `faghy/cleitext`); an empty value turns the check off.

**By hand**, as before:

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

A site installed with the setup wizard has `cleitext` as a plain folder: the first time, move it into `releases/` (`mkdir -p releases && mv cleitext releases/cleitext-<old version>`), then follow the steps above. The configuration and the data are already in `cleitext-shared`.

Inside the archives the folder is always `cleitext`; the versioned folders in `releases/` are named when unpacking, with `--strip-components=1`, only to keep the previous release for a rollback. The site always runs from `cleitext`.

To roll back, point `cleitext` to the previous release and restart. If the migrations changed the database, restore the backup made before the update (§9).

Plugins do not need a restart: `plugin:install` and `plugin:uninstall` reload them in the running server.

## 9. Backups

```bash
bin/cleitext backup --out ../cleitext-shared/backups/cleitext-$(date +%F).tar.gz
```

A backup contains the whole database (`pg_dump`), the media and the installed plugins. Schedule it in **Tools & Settings → Scheduled Tasks** (or the domain's **Scheduled Tasks**), for example every night. Copy the files elsewhere too: a backup on the same disk does not protect against losing the server. If `pg_dump` is not on the `PATH`, set `PG_BIN` to its folder (for example `/usr/lib/postgresql/16/bin`).

**Restore** (it replaces the database, media and plugins; the current media and plugins folders are kept as `*.before-restore`):

```bash
bin/cleitext restore ../cleitext-shared/backups/cleitext-2026-10-10.tar.gz
touch tmp/restart.txt
```

Restore a backup on a test copy now and then, to be sure that your backups work.

## 10. Moving content in

| From                  | Command                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Another Cleitext site | `bin/cleitext export --site main --out site.tar.gz`, then `bin/cleitext import site.tar.gz --site main` |
| WordPress             | **Tools → Export → All content** in WordPress, then `bin/cleitext import:wxr export.xml --site main`    |

Imports add content to the site; they do not replace it. WordPress media files are downloaded from the old site; with a copy of its `wp-content/uploads` folder, pass `--uploads /path/to/uploads`. Every import prints a report and can save it with `--report report.json`. Old addresses are redirected to the new ones.

From the admin, without the command line: install **WordPress Importer** from **Plugins → Add New**, open **Import from WordPress** and upload the export file. It runs in the background and shows the report at the end. Media files are downloaded from the old site (public addresses only), so keep it online until the import ends.

## 11. Several sites

One installation serves many sites. Point other domains to the same application (as aliases of the domain in Plesk, or as domains whose document root is the same folder), then:

```bash
bin/cleitext site:create --slug blog --name "Blog" --domain blog.example.com
bin/cleitext site:domain:add --site main --domain www.example.com
```

## 12. Troubleshooting

| Problem                                     | Check                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| The application does not start              | Plesk → Node.js → logs; a configuration error is printed with the variable's name |
| `permission denied to create role`          | the owner role lacks `CREATEROLE` (§2)                                            |
| Every site answers "Not Found"              | the domain is not registered: `bin/cleitext site:list`, `site:domain:add`         |
| Wrong client address in logs or rate limits | `TRUST_PROXY=true`                                                                |
| `pg_dump not found`                         | install the PostgreSQL client tools or set `PG_BIN`                               |
| `/health/ready` answers 503                 | the database is unreachable or migrations are missing (`bin/cleitext migrate`)    |
