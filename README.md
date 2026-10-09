# Cleitext

**An open-source, multi-site, multilingual CMS with a plugin system. It works like WordPress, but it is not built on WordPress.**

> Status: **design phase** (v0.2, October 2026). No code yet. Currently intended for internal use, with a public release planned later.
> License: **GPL-2.0-or-later** (same as WordPress) · 🇮🇹 [Leggi in italiano](./README.it.md)

## At a glance

- **Stack**: TypeScript · Node.js 24 · NestJS (Fastify adapter) · Drizzle ORM · PostgreSQL
- **Admin**: React · Vite · Tailwind · shadcn/ui · TanStack
- **Editor**: **Gutenberg** (standalone) behind an `EditorAdapter`, replaceable in the future. Content is stored in Cleitext's own format, **CXD**.
- **Public site**: React SSR themes, no JavaScript by default, tag-based page cache
- **Extensibility**: a plugin system modeled on WordPress (hooks, activation/uninstall lifecycle, upload and auto-updates), with typed hooks and a dedicated PostgreSQL schema per plugin
- **Multi-site**: one installation serves many domains, isolated with PostgreSQL Row Level Security
- **Deployment**: Plesk (Node.js extension) or Docker

## Documentation

| Document | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Principles, stack, data model (DDL), multi-site, editor, plugins, themes, security, deployment, ADRs, risks |
| [`docs/SPECIFICATIONS.md`](./docs/SPECIFICATIONS.md) | Functional and non-functional requirements, REST API, plugin SDK, hooks, CXD format, CLI, roadmap |

Italian translations live in [`docs/it/`](./docs/it/). English is the reference version.

## Key principle

> **WordPress as a model, not as code. Gutenberg as the editor, but replaceable.**

WordPress users will feel at home: same concepts, a familiar admin, the block editor, themes and plugins. The code, however, is entirely our own (TypeScript + PostgreSQL). Gutenberg is used as a library behind an adapter: content is saved in our own format (CXD) and the public HTML is rendered by Cleitext. Switching to a different editor later means writing a new adapter, **with no data migration**.

## Origin

Cleitext is the successor of **Cleito CMS**, a private PHP + PostgreSQL CMS. It keeps the ideas that worked there (multi-site with `site_id`, per-language content, tree menus), and the `cleito-import` plugin migrates its content.

## License

Cleitext is free software, released under the [GNU General Public License v2.0 or later](./LICENSE).
