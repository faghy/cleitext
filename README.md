# Cleitext

**An open-source, multi-site, multilingual CMS with a plugin system. It works like WordPress, but it is not built on WordPress.**

> Status: **early development** — milestones M0 (foundations) and M1 (identity and sites). Currently intended for internal use, with a public release planned later.
> License: **GPL-2.0-or-later** (same as WordPress) · 🇮🇹 [Leggi in italiano](./README.it.md)

## At a glance

- **Stack**: TypeScript · Node.js 24 · NestJS (Fastify adapter) · Drizzle ORM · PostgreSQL
- **Admin**: React · Vite · Tailwind · shadcn/ui · TanStack
- **Editor**: **Gutenberg** (standalone) behind an `EditorAdapter`, replaceable in the future. Content is stored in Cleitext's own format, **CXD**.
- **Public site**: React SSR themes, no JavaScript by default, tag-based page cache
- **Extensibility**: a plugin system modeled on WordPress (hooks, activation/uninstall lifecycle, upload and auto-updates), with typed hooks and a dedicated PostgreSQL schema per plugin
- **Multi-site**: one installation serves many domains, isolated with PostgreSQL Row Level Security
- **Deployment**: Plesk (Node.js extension)

## Development

Requirements: **Node.js 22+** and **pnpm 12** (`npm i -g pnpm@12`). No PostgreSQL installation and no containers are needed: a real PostgreSQL server is started from embedded binaries.

```bash
pnpm install
pnpm dev          # local database + server (http://127.0.0.1:3000) + admin (http://localhost:5173/admin/)
```

On first start, `pnpm dev` creates a local database in `.cleitext-dev/`, writes a `.env` file (see `.env.example`) and creates a **Development** site answering on `localhost`. Sign in at http://localhost:5173/admin/ with `admin@example.com` / `cleitext-admin` (local development only). Emails are printed in the server log.

| Command                                       | What it does                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                    | Starts the local database, the server and the admin with hot reload                                            |
| `pnpm db:dev`                                 | Starts only the local database (migrations applied)                                                            |
| `pnpm test`                                   | Runs all tests, each suite on a fresh embedded PostgreSQL                                                      |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | Build, type checks, lint                                                                                       |
| `pnpm db:generate`                            | Generates a migration after a schema change in `packages/db/src/schema`                                        |
| `pnpm cleitext <command>`                     | CLI: `install`, `migrate`, `site:create`, `site:list`, `site:domain:add`, `user:create`, `user:reset-password` |

| Package            | Purpose                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| `apps/server`      | NestJS + Fastify server: site resolution, authentication, users, profile, health probes |
| `apps/admin`       | Admin SPA (React, Vite, Tailwind)                                                       |
| `packages/db`      | Drizzle schema, migrations, Row Level Security, site context helpers                    |
| `packages/shared`  | Capabilities, default roles and API schemas shared by server and admin                  |
| `packages/cli`     | `cleitext` command-line tool (owner connection)                                         |
| `packages/testing` | Embedded PostgreSQL and database provisioning for tests                                 |
| `tools/dev-db`     | Persistent local PostgreSQL for development                                             |

## Documentation

| Document                                             | Contents                                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)     | Principles, stack, data model (DDL), multi-site, editor, plugins, themes, security, deployment, ADRs, risks |
| [`docs/SPECIFICATIONS.md`](./docs/SPECIFICATIONS.md) | Functional and non-functional requirements, REST API, plugin SDK, hooks, CXD format, CLI, roadmap           |

Italian translations live in [`docs/it/`](./docs/it/). English is the reference version.

## Key principle

> **WordPress as a model, not as code. Gutenberg as the editor, but replaceable.**

WordPress users will feel at home: same concepts, a familiar admin, the block editor, themes and plugins. The code, however, is entirely our own (TypeScript + PostgreSQL). Gutenberg is used as a library behind an adapter: content is saved in our own format (CXD) and the public HTML is rendered by Cleitext. Switching to a different editor later means writing a new adapter, **with no data migration**.

## Origin

Cleitext is the successor of **Cleito CMS**, a private PHP + PostgreSQL CMS. It keeps the ideas that worked there (multi-site with `site_id`, per-language content, tree menus), and the `cleito-import` plugin migrates its content.

## License

Cleitext is free software, released under the [GNU General Public License v2.0 or later](./LICENSE).
