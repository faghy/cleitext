<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/admin/public/brand/logo-dark.svg" />
    <img src="apps/admin/public/brand/logo.svg" alt="Cleitext" width="268" height="64" />
  </picture>
</p>

# Cleitext

**An open-source, multi-site, multilingual CMS with a plugin system. It works like WordPress, but it is not built on WordPress.**

> Status: **early development** — milestones M0 (foundations), M1 (identity and sites), M2 (content and editor), M3 (public site) and M4 (plugins). Currently intended for internal use, with a public release planned later.
> License: **GPL-2.0-or-later** (same as WordPress) · 🇮🇹 [Leggi in italiano](./README.it.md)

## At a glance

- **Stack**: TypeScript · Node.js 24 · NestJS (Fastify adapter) · Drizzle ORM · PostgreSQL
- **Admin**: React · Vite · Tailwind · shadcn/ui · TanStack
- **Editor**: **Gutenberg** (standalone) behind an `EditorAdapter`, replaceable in the future. Content is stored in Cleitext's own format, **CXD**.
- **Public site**: React SSR themes, no JavaScript by default, tag-based page cache
- **Extensibility**: a plugin system modeled on WordPress (hooks, activation/uninstall lifecycle, upload and auto-updates), with typed hooks and a dedicated PostgreSQL schema per plugin
- **Multi-site**: one installation serves many domains, isolated with PostgreSQL Row Level Security
- **AI assistants**: an MCP server lets people connect ChatGPT and other AI assistants with OAuth and have them build pages and posts with the blocks of the editor, or ask in the chat of the admin with the site's own AI provider
- **Privacy & GDPR** (separate plugin): cookie banner following the Italian Garante's guidelines, with scripts held until consent and a consent log, privacy and cookie policy pages made of blocks, and requests to export or erase personal data
- **Analytics** (separate plugin): Matomo, Google Analytics 4, Tag Manager, Meta Pixel, Search Console and Bing verification, with their privacy rules applied by Privacy & GDPR
- **Catalog**: official plugins and themes installed and updated from the admin (Plugins → Add New), from a catalog signed with Ed25519 — [faghy/cleitext-catalog](https://github.com/faghy/cleitext-catalog)
- **Deployment**: Plesk (Node.js extension)

## Development

Requirements: **Node.js 22+** and **pnpm 12** (`npm i -g pnpm@12`). No PostgreSQL installation and no containers are needed: a real PostgreSQL server is started from embedded binaries.

```bash
pnpm install
pnpm dev          # local database + server and public site (http://localhost:3000) + admin (http://localhost:5173/cl-admin/)
```

On first start, `pnpm dev` creates a local database in `.cleitext-dev/`, writes a `.env` file (see `.env.example`) and creates a **Development** site answering on `localhost`. Sign in at http://localhost:5173/cl-admin/ with `admin@example.com` / `cleitext-admin` (local development only). Emails are printed in the server log.

| Command                                       | What it does                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                    | Starts the local database, the server and the admin with hot reload                                                                                                                                                                                                            |
| `pnpm db:dev`                                 | Starts only the local database (migrations applied)                                                                                                                                                                                                                            |
| `pnpm test`                                   | Runs all tests, each suite on a fresh embedded PostgreSQL                                                                                                                                                                                                                      |
| `pnpm e2e`                                    | Browser tests of the admin, the Gutenberg editor, plugins and the public site (Playwright; starts `pnpm dev` if needed)                                                                                                                                                        |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | Build, type checks, lint                                                                                                                                                                                                                                                       |
| `pnpm db:generate`                            | Generates a migration after a schema change in `packages/db/src/schema`                                                                                                                                                                                                        |
| `pnpm cleitext <command>`                     | CLI: `install`, `migrate`, `site:create`, `site:list`, `site:update`, `site:archive`, `site:domain:add`, `site:locale:add`, `site:maintenance`, `user:create`, `user:reset-password`, `plugin:build`, `plugin:install`, `plugin:list`, `plugin:deactivate`, `plugin:uninstall` |

| Package                        | Purpose                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `apps/server`                  | NestJS + Fastify server: sites, authentication, users, content, media, taxonomies, menus, public site and page cache |
| `apps/admin`                   | Admin SPA (React, Vite, Tailwind)                                                                                    |
| `packages/db`                  | Drizzle schema, migrations, Row Level Security, site context helpers                                                 |
| `packages/shared`              | Capabilities, default roles and API schemas shared by server and admin                                               |
| `packages/blocks`              | Cleitext Document (CXD) format, rich-text conversion, core block definitions                                         |
| `packages/editor-core`         | `EditorAdapter` contract between the admin and a block editor                                                        |
| `packages/editor-gutenberg`    | Gutenberg adapter (the only package allowed to import `@wordpress/*`)                                                |
| `packages/renderer`            | Server-side HTML rendering of CXD blocks (React, no client JavaScript)                                               |
| `packages/theme-sdk`           | Theme contract, template hierarchy and helpers for themes                                                            |
| `packages/plugin-sdk`          | Plugin API: manifest, `definePlugin`, `defineBlock`, typed hooks, context                                            |
| `packages/admin-sdk`           | Admin toolkit shared with plugin admin pages: API client, UI components, generated forms                             |
| `plugins/seo`, `plugins/forms` | Official plugins                                                                                                     |
| `examples/plugin-events`       | Example plugin, built only from the plugin guide                                                                     |
| `themes/aurora`                | Default theme                                                                                                        |
| `packages/cli`                 | `cleitext` command-line tool (owner connection)                                                                      |
| `packages/testing`             | Embedded PostgreSQL and database provisioning for tests                                                              |
| `tools/dev-db`                 | Persistent local PostgreSQL for development                                                                          |

## Documentation

| Document                                             | Contents                                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)     | Principles, stack, data model (DDL), multi-site, editor, plugins, themes, security, deployment, ADRs, risks |
| [`docs/SPECIFICATIONS.md`](./docs/SPECIFICATIONS.md) | Functional and non-functional requirements, REST API, plugin SDK, hooks, CXD format, CLI, roadmap           |
| [`docs/PLUGINS.md`](./docs/PLUGINS.md)               | Developing plugins: manifest, hooks, content types, blocks, routes, own tables, admin pages                 |
| [`docs/THEMES.md`](./docs/THEMES.md)                 | Developing themes: templates, settings, block areas, editor styles                                          |
| [`docs/FRESCO.md`](./docs/FRESCO.md)                 | Fresco and Fresco Pro: the visual page builder, Theme Builder, forms, loops, popups                         |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)         | Installing and updating on a server (Plesk, nginx), backups                                                 |
| [`docs/MCP.md`](./docs/MCP.md)                       | AI assistants: connecting them through MCP and OAuth, their tools                                           |
| [`docs/PRIVACY.md`](./docs/PRIVACY.md)               | Privacy & GDPR plugin: cookie banner, consent log, policies, personal data requests                         |
| [`docs/ANALYTICS.md`](./docs/ANALYTICS.md)           | Analytics plugin: Matomo, Google Analytics, Tag Manager, Meta Pixel, search engines                         |
| [`docs/ASVS.md`](./docs/ASVS.md)                     | OWASP ASVS security checklist, open items; vulnerability reports in [`SECURITY.md`](./SECURITY.md)          |

Italian translations live in [`docs/it/`](./docs/it/). English is the reference version.

## Key principle

> **WordPress as a model, not as code. Gutenberg as the editor, but replaceable.**

WordPress users will feel at home: same concepts, a familiar admin, the block editor, themes and plugins. The code, however, is entirely our own (TypeScript + PostgreSQL). Gutenberg is used as a library behind an adapter: content is saved in our own format (CXD) and the public HTML is rendered by Cleitext. Switching to a different editor later means writing a new adapter, **with no data migration**.

## Origin

Cleitext is the successor of **Cleito CMS**, a private PHP + PostgreSQL CMS. It keeps the ideas that worked there (multi-site with `site_id`, per-language content, tree menus), and the `cleito-import` plugin migrates its content.

## License

Cleitext is free software, released under the [GNU General Public License v2.0 or later](./LICENSE).
