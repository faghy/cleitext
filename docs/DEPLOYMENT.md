# Deploying Cleitext on Plesk

> 🇮🇹 [Leggi in italiano](./it/DEPLOY.md)

This guide installs Cleitext on a server managed with Plesk, using the Plesk **Node.js** extension (Phusion Passenger). The release is built on your computer or in CI; the server only receives compiled files.

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
pnpm release        # → release/cleitext-<version>.tar.gz
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
cd releases && tar -xzf cleitext-0.5.0.tar.gz && rm cleitext-0.5.0.tar.gz
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

Do not run "NPM install": the release already contains its dependencies. In **Hosting settings**, point the domain's document root to `cleitext/public` as well, and enable **SSL/TLS** (Let's Encrypt).

## 7. First installation

```bash
cd /var/www/vhosts/example.com/cleitext
bin/cleitext install --domain example.com --site-name "Example" --site-slug main --locale it
```

The command applies the migrations, creates the site and asks for the super admin's email and password. Then **Enable** the application in Plesk and open `https://example.com/admin/`.

Official plugins are installed like any other:

```bash
bin/cleitext plugin:install plugins/seo
bin/cleitext plugin:install plugins/forms
```

## 8. Updates

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
