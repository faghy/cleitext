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
6. **Sign in** at `/cl-admin/`. The official SEO and Forms plugins are installed but not active; Hi John is active, on the dashboard.

**Install right after enabling Node.js**: until the wizard is completed, whoever opens the site first can complete it with their own database and administrator. To require a setup token as well, set `CLEITEXT_SETUP_TOKEN=true` in the environment of the Node.js application before enabling it: the wizard then asks for the token printed in the domain's **Logs** and kept in `cleitext/tmp/setup-token`.

**Email**: as WordPress does, emails (invitations, password resets, forms) leave through the server's sendmail (Postfix on Plesk) with no setting, from `no-reply@` the site's domain with the site's name. A site can use its own SMTP server (**Settings → Email**), and `MAIL_URL`/`MAIL_FROM` in `cleitext-shared/.env` (§5) change it for the whole server. Without sendmail, emails are only written to the log: the dashboard and `cleitext doctor` say so.

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
TRUST_PROXY=true                  # behind nginx (loopback and private networks)
# TRUST_CLOUDFLARE=true           # also behind Cloudflare (orange cloud)
MEDIA_PATH=/var/www/vhosts/example.com/cleitext-shared/media
PLUGINS_PATH=/var/www/vhosts/example.com/cleitext-shared/plugins
THEMES_PATH=/var/www/vhosts/example.com/cleitext-shared/themes
# MAIL_URL=smtp://user:password@localhost:587 # not set: the server's sendmail
# MAIL_FROM=Example <no-reply@example.com>    # not set: "Site name" <no-reply@site domain>
```

On Plesk, `localhost:25` without the credentials of a mailbox delivers only to the server's own domains ("Relay access denied"): use `MAIL_URL=sendmail://`, which hands the messages to the server's mail system, or the SMTP settings of a mailbox.

`chmod 600 cleitext-shared/.env`. The other settings are listed in [`.env.example`](../.env.example).

### Proxies and the visitor's address

Login throttling, rate limits, the activity log, spam checks on comments and forms, the Captcha plugin's trusted addresses and the installation report all use the visitor's address. Behind a proxy the server only sees the proxy, so it reads the address from `X-Forwarded-For`, walking it **from the right**: each trusted proxy hands over to the address it reports, and the first address that is not a trusted proxy is the visitor. The leftmost entries are written by the visitor and are never believed as such.

| `TRUST_PROXY`                                      | Trusted proxies                                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `false` (default)                                  | none: `X-Forwarded-*` is ignored, the visitor is whoever connects                                                                                                                                                   |
| `true`                                             | loopback, link-local and private networks: `127.0.0.0/8`, `::1`, `169.254.0.0/16`, `fe80::/10`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `fc00::/7`. Plesk's nginx, HAProxy over WireGuard |
| a number, e.g. `2`                                 | that many hops, whatever their address. Only when nobody can reach Cleitext directly (it listens on `127.0.0.1`)                                                                                                    |
| a list, e.g. `loopback,10.0.0.200,198.51.100.0/24` | exactly these addresses and networks (CIDR), and the keywords `loopback`, `linklocal`, `uniquelocal`                                                                                                                |

A proxy on a **public** address (a load balancer or another server reached over the internet) is not covered by `true`: list it, e.g. `TRUST_PROXY=loopback,uniquelocal,198.51.100.20`, otherwise its address is taken as the visitor's.

**Behind Cloudflare** (orange cloud), also set `TRUST_CLOUDFLARE=true`: Cloudflare's published networks become trusted too, so with Cloudflare → HAProxy → nginx → Cleitext the address Cloudflare appends to `X-Forwarded-For` is the visitor's, and a visitor cannot pretend to come through Cloudflare by writing the header itself. `CF-Connecting-IP` is not read. The list of networks is bundled with Cleitext (`apps/server/src/config/trust-proxy.ts`, with its date) and refreshed in new releases from <https://www.cloudflare.com/ips-v4> and <https://www.cloudflare.com/ips-v6>. `TRUST_CLOUDFLARE` cannot be combined with a number of hops.

Existing installations with `TRUST_PROXY=true` keep working: the value now means the private networks above instead of "every proxy", which closes the spoofing of the leftmost `X-Forwarded-For` entry. The setup wizard's **Behind a proxy** checkbox writes `TRUST_PROXY=true`, and **Behind Cloudflare** writes `TRUST_CLOUDFLARE=true`.

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

The command applies the migrations, creates the site and asks for the super admin's email and password; with `--official-plugins` it also installs SEO and Forms (not active) and Hi John (active), as the wizard does. Then **Enable** the application in Plesk and open `https://example.com/cl-admin/`.

**Or install from the browser** (RF-SIT-02): with `DATABASE_ADMIN_URL` in `.env`, enable the application on an empty database (without any `.env`, the full setup wizard starts instead, see the top of this guide). The server then answers only `/install` and shows a form for the site and the super admin (with `CLEITEXT_SETUP_TOKEN=true` it also asks for a setup token, printed in its log: Plesk **Logs** of the domain, systemd `journalctl -u cleitext`): the installation runs the same command in a separate process, then the server restarts in normal mode. The token is derived from `APP_SECRET`, so every process shows the same one.

Official plugins are installed like any other:

```bash
bin/cleitext plugin:install plugins/seo
bin/cleitext plugin:install plugins/forms
```

A site in more than one language needs the **Multilingual** plugin. It is not in the base package: `pnpm release` writes it to `release/cleitext-plugin-multilingual-<version>.zip` (also on the Releases page). Upload it in **Plugins → Upload Plugin**, or unpack it on the server and run `bin/cleitext plugin:install <folder>`; then activate it on the site and add the languages in **Languages**. A site with one language does not need it and pays nothing for it.

**Upgrading a multilingual site to 0.6 (M7).** Languages moved from the core to the Multilingual plugin. Migration 0016 keeps the site's languages and translation links aside; install and activate the plugin and it takes them over, with the same addresses. Until then the site shows its default language only.

## 8. Updates

**From the admin** (Cleitext 0.8 and later): super admins see a notice on the dashboard when a new version is published, and update in **Updates** with one button. Cleitext downloads the release from GitHub, checks it against its SHA-256, makes a backup in `cleitext-shared/backups`, runs the database migrations, updates the official plugins that are installed, **starts the new version on the side** (a free local port, with no scheduled work) and checks that it is ready and serves a site's home page, and only then switches to it and restarts. The site keeps answering during the update; if a step fails, the trial included, it stays on the running version and the error says why. The previous version is kept: `.cleitext-previous` next to a `cleitext` folder installed by the wizard, or the previous folder in `releases/`.

If something is wrong after an update, `cleitext rollback` goes back to the previous version (run it again to undo). The database stays as it is, because migrations only add; to bring it back too, restore the backup taken before the update: `cleitext restore cleitext-shared/backups/before-<version>.tar.gz`.

Plugins and themes work the same way. An update from the catalog keeps the version before as `<slug>.previous`. If the new version does not load, Cleitext puts the version before back at once and says so. By hand: `cleitext plugin:rollback <slug>` and `cleitext theme:rollback <slug>`.

The same from SSH: `bin/cleitext update` (`--check` only tells whether there is one). Updates come from `UPDATES_REPO` (default `faghy/cleitext`); an empty value turns the check off.

**Installation reports.** As WordPress tells wordpress.org what a site runs, about once a day each visited site sends to cleitext.com:

- its address;
- the version of Cleitext;
- its theme and the installed themes and plugins, with their versions and whether they are active;
- a random identifier of the server, which groups the sites of one installation.

Nothing about content, users or visitors is sent. The maintainers use this registry to know which versions are in use before a release, and to warn the sites hit by a broken update. Each site can turn it off in **Settings → General → Installation report**; `INSTALL_REPORT_URL` changes where reports of the whole server go, and an empty value turns them off. The registry deletes the sites it has not heard from for 180 days. Only production installations report (`NODE_ENV=production`); development, tests and the trial run of an update never do, and the registry ignores local and test addresses (`localhost`, `.test`, `.local`, private IPs).

**Automatic updates** (Cleitext 0.27 and later), as in WordPress: in **Updates → Automatic updates** super admins choose, for the whole server, whether Cleitext updates itself (**Off**, **Fix releases only**, such as 0.26.0 → 0.26.1, or **Every release**) and which plugins and themes from the catalog update by themselves. Everything is off until chosen. About twice a day Cleitext updates the chosen plugins and themes that work with the installed version (paid ones while their license includes the update), then the core as above; super admins get an email with what changed, and the page keeps the history. **Check and update now** runs it at once. Choices are kept in `auto-updates.json` next to the media folder.

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

Imports add content to the site; they do not replace it. Every import prints a report and can save it with `--report report.json`.

**From WordPress**: install the **WordPress Importer** plugin from **Plugins → Add New** (it is not in the base package), export the old site with **Tools → Export → All content** in WordPress, then open **Import from WordPress** in the admin and upload the file. It runs in the background and shows a report at the end; old addresses are redirected to the new ones. Media files are downloaded from the old site (public addresses only), so keep it online until the import ends. WordPress addresses end with a slash (`/my-page/`): turn on **End addresses with a slash** in **Settings → Content structure** to keep them identical (the report suggests it). The **Comments** choice brings the approved comments (default), all of them, or none.

## 11. Several sites

One installation serves many sites. Point other domains to the same application (as aliases of the domain in Plesk, or as domains whose document root is the same folder), then:

```bash
bin/cleitext site:create --slug blog --name "Blog" --domain blog.example.com
bin/cleitext site:domain:add --site main --domain www.example.com
```

## 12. Troubleshooting

| Problem                                     | Check                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| The application does not start              | Plesk → Node.js → logs; a configuration error is printed with the variable's name       |
| `permission denied to create role`          | the owner role lacks `CREATEROLE` (§2)                                                  |
| Every site answers "Not Found"              | the domain is not registered: `bin/cleitext site:list`, `site:domain:add`               |
| Wrong client address in logs or rate limits | `TRUST_PROXY=true`; `TRUST_CLOUDFLARE=true` behind Cloudflare; list public proxies (§5) |
| `pg_dump not found`                         | install the PostgreSQL client tools or set `PG_BIN`                                     |
| `/health/ready` answers 503                 | the database is unreachable or migrations are missing (`bin/cleitext migrate`)          |

## 13. Automation (JSON)

Hosting panels (the Plesk extension **Cleitext Toolkit**) and scripts drive Cleitext only through `bin/cleitext … --json`, run as the domain's system user. The contract:

- With `--json` a command prints **exactly one JSON object** on stdout, followed by a newline. Progress and logs go to stderr.
- On failure the object is `{"error":{"code":"…","message":"…"}}` and the exit code is not 0. `code` is stable and meant for programs; `message` is for people.
- `--json` never prompts. Passwords come from stdin (`--password-stdin`), and destructive commands need `--yes`.
- Without `--json` every command prints the same text as before.

**Error codes.**

| Code                                                                                       | Meaning                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usage`                                                                                    | unknown command or option, or a required option is missing                                                                                                                  |
| `not_configured`                                                                           | `DATABASE_ADMIN_URL` (or the application role) is not set                                                                                                                   |
| `db_unreachable`                                                                           | the database refuses the connection, the password is wrong, or it does not exist                                                                                            |
| `missing_option`, `invalid_option`, `password_required`, `confirmation_required`           | the input is incomplete or wrong                                                                                                                                            |
| `not_found`, `not_member`, `user_inactive`, `site_archived`, `no_domain`                   | `login-link`, `entry:reassign`, `user:set-role`, `user:set-locale` and the domain commands                                                                                  |
| `unknown_role`                                                                             | `user:set-role`: no such role on the site (the message lists them)                                                                                                          |
| `cannot_write`                                                                             | `entry:reassign`: the new author's role cannot write entries                                                                                                                |
| `run_as_root`, `invalid_wxr`, `conflict`                                                   | `media:rename-imported`, `media:purge-renamed`, `entry:raw-titles`, `user:set-role`, `user:set-locale`: run as root, not a WordPress export, a media item changed meanwhile |
| `primary_domain`                                                                           | `site:domain:remove` on the primary domain                                                                                                                                  |
| `installed`                                                                                | `install` when a site already exists                                                                                                                                        |
| `no_previous_version`, `update_failed`                                                     | `rollback`, `update`                                                                                                                                                        |
| `db_connect`, `db_version`, `db_createrole`, `db_owner`, `db_role_taken`, `db_app_connect` | `configure`: the same problems as the setup wizard, with the command to fix them                                                                                            |
| `timeout`                                                                                  | no answer in time                                                                                                                                                           |
| `failed`                                                                                   | any other problem the message explains                                                                                                                                      |
| `internal`                                                                                 | an unexpected error (a bug: please report it)                                                                                                                               |

### Status and checks

`cleitext status --json` [`--root <dir>`] also works when the database is down: then `db` is `{"ok":false,"error":"…"}`.

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
      "name": "Example",
      "status": "active",
      "maintenance": false,
      "locale": "en",
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

`layout` is `folder` (a `cleitext` folder, as the setup wizard leaves it) or `releases` (`releases/cleitext-<version>` and the `cleitext` link, §4). `previous` is the version `cleitext rollback` goes back to. `lastUpdate` is the progress file of the last core update. `appUrls` lists `APP_URL` first, if it is set, then the home page of each site.

`cleitext doctor --json` [`--offline`] returns `{"status":"ok|warn|fail","checks":[{"id","status","message","fix?"}]}`. Without `--json` it exits with 1 when a check fails. The checks are:

| `id`                              | What it checks                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `env_file`                        | the `.env` exists and has mode 600                                              |
| `document_root`                   | `cleitext/public` exists, and `httpdocs` has no default page left (best effort) |
| `setup_token`                     | no setup token left in `tmp/setup-token`                                        |
| `trust_proxy`                     | `TRUST_PROXY` is set and is not a bare number of hops                           |
| `database`                        | the database answers                                                            |
| `https`                           | `APP_URL` and the sites' addresses use HTTPS                                    |
| `migrations`                      | no migration is pending                                                         |
| `installed`                       | a site exists, so the installer is not open to the first visitor                |
| `owner_createrole`                | the owner role has `CREATEROLE`, which plugins with tables need                 |
| `pg_dump`                         | `pg_dump` is there, and its major version is not older than the server's        |
| `disk_space`                      | the backup folder has room for a backup: the database, media and plugins        |
| `core_update`                     | a newer Cleitext release (skipped with `--offline`)                             |
| `plugin_updates`, `theme_updates` | newer compatible versions in the signed catalog (skipped with `--offline`)      |

### Configuring and installing

```bash
printf '%s' "$OWNER_PASSWORD" | bin/cleitext configure --json \
  --db-host localhost --db-port 5432 --db-name example_cleitext --owner example_owner \
  [--app-role example_app] [--data-dir <dir>] [--app-url https://example.com] \
  [--trust-proxy true] [--trust-cloudflare] [--app-secret-from <other .env>]
```

`configure` is the setup wizard's database step, using the same code. It checks the owner (PostgreSQL 16 or later, `CREATEROLE`, owns the database), creates or updates the application role (default `<db-name>_app`), and writes `cleitext-shared/.env` with mode 600. The file is linked from the release folder, as `cleitext update` expects. The owner password comes from stdin or `CLEITEXT_DB_OWNER_PASSWORD`. It never comes from an option, because options show in the list of processes.

Running it again is safe. It keeps `APP_SECRET`, the application role's password, `TRUST_PROXY`/`TRUST_CLOUDFLARE` (unless they are given again) and every other setting of the file (`MAIL_URL`, …). When nothing changes, the file is not rewritten. A changed file is kept as `.env.bak-<date>`. `--app-url` is written as `APP_URL`: `status`, `doctor` and `login-link` read it, and the server ignores it.

Result: `{"envFile","envLink","dataDir","appRole","changed":true,"secret":"new|kept|copied"}`.

Then `bin/cleitext install --json --site-name … --site-slug … --domain … --admin-email … --password-stdin [--locale it] [--official-plugins]` returns `{"site":{"id","slug","name","domain"},"admin","adminUrl","plugins":[{"slug","version","active"}]}`.

### One-click sign-in

```bash
bin/cleitext login-link --json (--email <address> | --first-super-admin) [--site <slug>] [--ttl 60]
# {"url":"https://example.com/api/v1/auth/one-time?token=…","expiresAt":"…","user":"…","site":"main"}
```

The link signs in to the admin of that site, the first active one by default. Only who can run commands on the server can create one: the panel runs the command as the domain's user. How it is protected:

- It works **once**, within its TTL: 60 seconds by default, 300 at most. Only the SHA-256 of the token is stored, like every other token (kind `panel_login`).
- It works only on the site it was made for, and only for an active user who may use that site: a member, or a super admin.
- `GET /api/v1/auth/one-time?token=…` creates a normal session (the usual cookie rules: `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS, not "remember me"). Then it redirects to `/cl-admin/`. Answers have `cache-control: no-store` and `referrer-policy: no-referrer`.
- Wrong or used links count as failed sign-ins of the address: 20 in 15 minutes lock it for 15 minutes (`429`).
- The activity log records `auth.login_panel`.

**Two-factor authentication is not asked** for these links, as WP Toolkit does for WordPress. Whoever can run the command already controls the installation: they can read `.env`, the database and the 2FA secrets. A second factor would protect nothing against them. A panel that offers the button should check its own users as usual.

### Other commands

| Command                                                                          | JSON result                                                                                                                               |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `migrate`                                                                        | `{"applied","total","expected","appRole"}` (`applied`: migrations run now)                                                                |
| `update --check`                                                                 | `{"current","latest","available","publishedAt","url","notes"}`                                                                            |
| `update [--to <v>]`                                                              | `{"updated":true,"from","to","root","previous","backup"}`, or `{"updated":false,"from","to","current"}`                                   |
| `rollback`                                                                       | `{"from","to","root","databaseBackup"}`                                                                                                   |
| `site:create`                                                                    | the site, as in `status`                                                                                                                  |
| `site:list`                                                                      | `{"sites":[…]}`, as in `status`                                                                                                           |
| `site:domain:add` / `site:domain:remove`                                         | `{"site","domain","primary"}` / `{"site","domain","removed":true}`                                                                        |
| `site:domain:replace --from <host> --to <host> [--site <slug>]`                  | `{"site","from","to","primary"}`: renames a domain, keeping whether it is primary and forces HTTPS                                        |
| `site:maintenance`, `site:archive`, `site:update`                                | `{"site",…}`                                                                                                                              |
| `user:create … --password-stdin`                                                 | `{"id","email","superAdmin","site","role"}`                                                                                               |
| `user:reset-password --email <e> --password-stdin`                               | `{"email"}`                                                                                                                               |
| `user:set-role --site <s> --email <e> --role <r> [--add]`                        | `{"site","email","userId","from","to","changed","added","noAdministrator"}`: `from` is null when added                                    |
| `user:set-locale --locale <l> --email <e>` \| `--site <s> --all`                 | `{"locale","site","changed":[{"email","from"}],"unchanged"}`                                                                              |
| `user:set-username --email <e> --username <name>` (`""` removes it)              | `{"email","from","to"}`; `conflict` when another account has it                                                                           |
| `entry:reassign --site <s> --from <u> --to <u> [--type <t>]`                     | `{"site","from","to","type","entries","published","media"}`: `from`/`to` are `{"id","email"}`                                             |
| `entry:raw-titles --site <s> --wxr <file> [--dry-run] [--report <file>]`         | `{"site","dryRun","entries":[{"wpId","slug","title","rawTitle","action","matchedBy","revisions"}],"counts","report"}`                     |
| `media:rename-imported --site <s> --wxr <file> [--uploads <folder>] [--dry-run]` | `{"site","dryRun","alreadyFixed","renamed","counts","skipped","unmatched","references","report",…}`: `counts.byChecksum` with `--uploads` |
| `media:purge-renamed [--site <s>] [--dry-run]`                                   | `{"dryRun","deleted":[{"site","key"}],"waiting","kept"}`                                                                                  |
| `plugin:list`                                                                    | `{"plugins":[{"slug","name","version","apiVersion","network","mustUse","paid","activeOn":["main"]}]}`                                     |
| `plugin:activate <slug> --site <s>` \| `--network`                               | `{"slug","site","version","alreadyActive","network"}`                                                                                     |
| `plugin:deactivate <slug> --site <s>` \| `--network`                             | `{"slug","site","network","message"}`                                                                                                     |
| `plugin:install`, `plugin:rollback`, `plugin:uninstall --yes`                    | `{"slug","version","previousVersion","migrations"}`, `{"slug","from","to"}`, `{"slug","uninstalled"}`                                     |
| `theme:list`                                                                     | `{"themes":[{"slug","name","version","bundled"}]}`                                                                                        |
| `backup [--out <file>]`                                                          | `{"file","bytes"}`. Default file: `cleitext-shared/backups/cleitext-<date>.tar.gz`                                                        |
| `backup:list [--dir <dir>]`                                                      | `{"dir","backups":[{"name","path","bytes","createdAt","beforeVersion"}]}`, newest first                                                   |
| `backup:prune --keep <n> [--dir <dir>]`                                          | `{"dir","keep","removed":[…]}`: keeps the n newest, those taken before updates included                                                   |
| `restore <file> --yes`                                                           | `{"file","createdAt","postgres","revokedRoles"}`                                                                                          |

`entry:reassign` gives all of a user's entries on a site to another writer, like WordPress's "Attribute all content to" when a user is deleted: every status (drafts, pending, scheduled, trash) and every language. `--from` and `--to` take an email address or a user id. The new author must be an active member of the site whose role can write entries (`edit_entries`). The media the user uploaded follow too, unless `--type` limits the change to one content type. Revisions keep who saved them, and the modification date does not change. The activity log records `entries.reassigned` with the counts, and the site's page cache is cleared. Before removing someone from a site, run it so their content keeps an author. In the admin, one entry's author changes from the editor's Author box, and several from the **Change author** bulk action (both need `edit_others_entries`; logged as `entry.author_changed`).

`plugin:activate --site` activates the plugin like the **Activate** button in the admin. It checks dependencies and conflicts, creates the content types and runs `onActivate`, and the activity log records it. A paid plugin needs the site's license, entered in the admin first. `--network` activates it on every site.

### Roles and language of migrated accounts

When a WordPress site moves to Cleitext, its administrators must be administrators here and the accounts should speak the site's language. Since core 0.88 (WordPress Importer 1.34.0) the import does it: new accounts get the language of the content, and the roles come from the list of `wp user list --fields=user_login,user_email,roles --format=csv` (pasted in **Roles of the WordPress users** on the upload page, or sent by scripts as the multipart text field `users`) or from `?admins=login1,login2`. Users are matched by login, then by email; of several roles the most powerful known wins. A member who already has a higher role keeps it: imports raise roles, never lower them.

| WordPress role                             | Cleitext role                                         |
| ------------------------------------------ | ----------------------------------------------------- |
| administrator                              | administrator                                         |
| editor, shop_manager (WooCommerce)         | editor                                                |
| author                                     | author                                                |
| contributor                                | contributor                                           |
| subscriber, customer (WooCommerce)         | subscriber                                            |
| any other, or a user missing from the list | the role chosen for imported authors (default author) |

Sites imported before, or accounts to fix by hand:

```sh
bin/cleitext user:set-role --site main --email anna@example.com --role administrator
bin/cleitext user:set-role --site main --email new@example.com --role editor --add
bin/cleitext user:set-locale --email anna@example.com --locale it
bin/cleitext user:set-locale --site main --all --locale it
bin/cleitext user:set-username --email anna@example.com --username anna
```

`user:set-role` takes the built-in roles and the site's own ones, and adds someone who is not a member only with `--add`. As the API, it does not stop at the last administrator (it warns when the site has none left: only super admins can manage it then) and the activity log records `member.role.changed` (`via: "cli"`). `user:set-locale` sets the admin language of one account, or of every member of a site with `--site --all` (accounts are shared by the sites they belong to). Both refuse to run as root. In the admin, an administrator changes a member's language in their account (**Users → the person → Admin language**).

**Usernames.** As in WordPress, a person signs in with the email or the username. The username is optional, unique and case-insensitive (letters, digits, spaces, `_ . -`, up to 60 characters, never `@`). It is set in **Profile**, by administrators in **Users** (adding or editing someone), with `user:create --username` or `user:set-username`. The WordPress importer gives every account its WordPress `user_login`, also accounts that had none, unless another account has it (the import report says so) or it is an email.

On cores before 0.88, the same with SQL, run with the owner connection (`DATABASE_ADMIN_URL`):

```sql
BEGIN;
-- site_members has FORCE ROW LEVEL SECURITY, also for the owner: say which site first.
SELECT set_config('app.site_id', (SELECT id::text FROM sites WHERE slug = '<slug>'), true);
-- WordPress administrators (their emails) become administrators of the site.
UPDATE site_members sm
   SET role_id = (SELECT id FROM roles WHERE site_id IS NULL AND slug = 'administrator')
  FROM users u
 WHERE sm.user_id = u.id
   AND sm.site_id = (SELECT id FROM sites WHERE slug = '<slug>')
   AND u.email IN ('anna@example.com', 'bruno@example.com');
-- Every member of the site gets Italian.
UPDATE users SET locale = 'it'
 WHERE id IN (SELECT user_id FROM site_members
               WHERE site_id = (SELECT id FROM sites WHERE slug = '<slug>'));
COMMIT;
```

### Media of sites imported from WordPress before 0.85

Since core 0.85 imported media keep WordPress's name and year/month folder (`/media/<site>/2015/07/photo.jpg`). Sites imported before have them under a generated name in the month of the import (`/media/<site>/2026/09/0192…e4.jpg`). `media:rename-imported` gives them WordPress's names, with the original export of the old site:

```bash
# As the domain user, never as root (root-owned files break Plesk backups):
bin/cleitext media:rename-imported --site main --wxr ~/old-site.WordPress.2026-09-01.xml --dry-run
bin/cleitext media:rename-imported --site main --wxr ~/old-site.WordPress.2026-09-01.xml
# Files of the same name in different months: tell them apart by their content.
bin/cleitext media:rename-imported --site main --wxr ~/old-site.WordPress.2026-09-01.xml --uploads ~/old-site/wp-content/uploads --dry-run
```

- **Dry run first.** `--dry-run` prints every address that would change (old → new, with the variants), the media skipped and why, the attachments of the export not found on the site, and how many addresses would be rewritten in each table; it writes nothing.
- **Which media.** Each attachment of the export is found by what the import recorded (`att:<WordPress id>`), else, for older imports, by its file name (and size, when two have the same name). With `--uploads <folder>` (a copy of the old site's `wp-content/uploads`), an attachment not found by its name, or whose name several media share (`marketing.jpg` in 2015/10 and in 2015/11), is found by the checksum (sha256, as `media.checksum`) of its file there: `_wp_attached_file`, else the path of its address or guid. The folder is only read, never written, and only files inside it are read (paths with `..`, absolute paths and links that lead outside are refused); the report counts the attachments found this way (`counts.byChecksum`). Only media whose file still has a generated name are renamed: a file already renamed, or named by hand, is skipped and listed. When no media item of the site has a generated name the command stops: the site is already fixed, and running it again changes nothing.
- **Names.** As a new import would (core 0.87): WordPress's file name exactly, case and extension included (`Fotolia_63675623_M.jpg`, `PIATTO.JPG`; the real type's extension only when WordPress's names another type), taken from `_wp_attached_file` (the file on WordPress's disk, also for the year and month) before the address and the guid; only characters other than `A-Z a-z 0-9 . _ - @` are replaced (`Città d'arte.jpg` → `Citta-d-arte.jpg`). A `-scaled` image keeps that name, and its original's address (`original_image`) redirects to it too. `-1`, `-2`… are added when the name is taken (case-sensitively; `photo.jpg` also takes `photo.png`); the variants follow (`photo-thumb.webp`). Every old address of an attachment (attached file, address, guid) redirects.
- **Files are copied, never moved**, and never over an existing file. The old files stay for the grace period (`--grace-days`, 30 by default).
- **One transaction for the site**: the media and variants get their new files, the old WordPress addresses (`/wp-content/uploads/…`) are recorded so that they redirect (301), and the addresses in the content are rewritten: the current, published and autosaved revisions of every entry, every setting of the site (Additional CSS, theme settings, block areas and widgets, plugin settings), menus, terms, patterns and options pages. Older revisions are history and keep their addresses: those keep working through the redirect. If anything fails, the copies are removed and nothing changes. Then the site's page cache is cleared and the activity log records `media.renamed`.
- **Report.** Also written as JSON next to the export (`<export>.media-rename-<date>.json`), or to `--report <file>`.
- **Old addresses.** During the grace period the old `/media/…` files are still served. Afterwards `media:purge-renamed` (`--dry-run` lists the files first; without `--site`, every site) removes them, and a request for an old address answers 301 to the new one. If the web server serves `/media/` by itself, it must pass the requests for missing files to Cleitext, or the old addresses give 404 once purged. Media in the tables of plugins (other than their settings) are not rewritten: they redirect.

### Search titles of sites imported before 0.88

WordPress shows titles with curly quotes and dashes (`L’ipnosi – cos’è`), but Yoast SEO and Rank Math put the title as written (`L'ipnosi - cos'è`) in the page's `<title>` and social tags. Since the WordPress Importer 1.35.0 (core 0.88) an import keeps that title beside the SEO fields (`fields.seo.rawTitle`), and the SEO and Vetta plugins use it while the entry's title is still the imported one. `entry:raw-titles` gives it to the entries of a site imported before, with the original export of the old site:

```bash
# As the domain user, never as root:
bin/cleitext entry:raw-titles --site main --wxr ~/old-site.WordPress.2026-09-01.xml --dry-run
bin/cleitext entry:raw-titles --site main --wxr ~/old-site.WordPress.2026-09-01.xml
```

- **Dry run first.** `--dry-run` lists every post, page and other entry of the export: slug, the entry's title now, the title as written in WordPress and what would happen (`set`, `already`, `same`, `skipped:edited`, `skipped:ambiguous`, `not-found`), with the counts; it writes nothing.
- **Which entries.** Each item of the export is found by what the import recorded (`post:<WordPress id>`, this export's own records first), else, for older imports, by its slug and content type (`post` → `article`, `page` → `page`, custom types by their name, as the importer makes them); when several entries share them (one per language), by the title. Items of types the site has no entries of (WordPress's own records) are left out.
- **Only typography.** The title is kept only when the entry's title differs from WordPress's by curly quotes, dashes and ellipses alone (as the SEO plugins compare them): a title an editor changed is skipped and listed, and so is an entry whose title has nothing to keep. Titles are never changed.
- **What is written.** `fields.seo.rawTitle`, every other field kept, on the entry's current and published revisions and its autosaves, each checked against its own title; older revisions are history. One transaction for the site, then the site's page cache is cleared and the activity log records `entries.raw_titles`. Running it again changes nothing.
- **Report.** Also written as JSON next to the export (`<export>.raw-titles-<date>.json`), or to `--report <file>`.

### Copying a site (clone)

A backup can be restored into another database, with another name and other roles. Plugin roles carry a tag of the database name (`cleitext_plg_<slug>_<hash>`). After a restore, `restore` creates the plugin roles of the new database and gives them their rights again. It also **takes every right away from the roles of the source database** (its application role and plugin roles), so the original installation cannot reach the copy. Roles that the restore had to create only for this purpose are dropped again. Their names are in `revokedRoles`.

```bash
# on the source
bin/cleitext backup --json                      # → {"file": ".../cleitext-2026-10-21-10-00-00.tar.gz"}
# on the copy: unpack the release (§4), then
printf '%s' "$OWNER_PASSWORD" | bin/cleitext configure --json --db-name copy_db --owner copy_owner \
  --app-secret-from /var/www/vhosts/example.com/cleitext-shared/.env
bin/cleitext restore /path/to/cleitext-2026-10-21-10-00-00.tar.gz --yes --json
bin/cleitext site:domain:replace --json --from example.com --to staging.example.com
bin/cleitext site:domain:remove --json --site main --domain www.example.com   # aliases the copy does not serve
```

**Take `APP_SECRET` from the source** (`--app-secret-from`). Two-factor secrets, the SMTP password and license keys are encrypted with it, and with another secret the copy cannot read them. Paid licenses are activated for an address: activate the key again in the copy if its updates are needed there. Sessions copied with the database stay tied to the old domain's cookies.
