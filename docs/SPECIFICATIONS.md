# Cleitext — Specifications

> Version 0.2 · October 2026 · status: **draft**
> Project: **cleitext** · License: **GPL-2.0-or-later** · Editor: **Gutenberg** (replaceable)
> Companion document to [`ARCHITECTURE.md`](./ARCHITECTURE.md): this one defines **what** the system must do, that one defines **how**.

> 🇮🇹 Italian version: [docs/it/SPECIFICHE.md](./it/SPECIFICHE.md) (secondary, may lag behind).

**Priorities** used in this document:

- **MVP**: first version usable on a real site;
- **1.0**: first stable version **for internal use** (our own sites);
- **Public**: needed only when Cleitext is distributed as open source (registry, publishing, project website);
- **Later**: afterwards.

> **Current phase: internal use.** Cleitext initially serves our own sites and is not distributed. Everything related to public distribution is designed, but its implementation is deferred to the **Public** phase.

---

## Table of contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [Glossary](#2-glossary)
3. [Roles and capabilities](#3-roles-and-capabilities)
4. [Functional requirements](#4-functional-requirements)
5. [Non-functional requirements](#5-non-functional-requirements)
6. [REST API](#6-rest-api)
7. [Plugin specification](#7-plugin-specification)
8. [Core hook catalog](#8-core-hook-catalog)
9. [CXD content format](#9-cxd-content-format)
10. [Custom field DSL](#10-custom-field-dsl)
11. [Theme specification](#11-theme-specification)
12. [CLI](#12-cli)
13. [Roadmap and acceptance criteria](#13-roadmap-and-acceptance-criteria)
14. [Out of scope](#14-out-of-scope)
15. [Definition of Done](#15-definition-of-done)

---

## 1. Purpose and scope

Cleitext is an open-source, multi-site, multilingual CMS built on **Node.js/TypeScript and PostgreSQL** that:

- offers an experience **familiar to WordPress users**: admin, block editor, content types, taxonomies, themes, plugins;
- **does not depend on WordPress**: formats, names and APIs are its own, and WordPress compatibility is confined to removable plugins;
- is **extensible through plugins** with a versioned contract;
- installs on **Plesk** (Node.js extension);
- uses **Gutenberg** as its editor, but is designed so it can be replaced in the future without migrating content;
- distributes plugins and themes through **its own registry**, with installation from the admin;
- is released under the **GPL-2.0-or-later** license, with the same plugin model as WordPress.

**Target users:**

- web agencies and developers managing many sites;
- editors used to WordPress;
- plugin and theme developers.

---

## 2. Glossary

| Term                  | Definition                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| **Site**              | A tenant: its own domains, languages, content, users and settings.                                       |
| **Content type**      | Definition of a class of content (page, article, event…) with its fields.                                |
| **Entry**             | A single piece of content of a type, in one language.                                                    |
| **Revision**          | An immutable snapshot of an entry.                                                                       |
| **Translation group** | The set of entries that represent the same content in different languages (kept by the language plugin). |
| **Block**             | A unit of content in the editor (paragraph, image, columns…).                                            |
| **CXD**               | _Cleitext Document_, the JSON format in which blocks are stored.                                         |
| **Pattern**           | A reusable composition of blocks.                                                                        |
| **Taxonomy / Term**   | A classification system (categories, tags) and its values.                                               |
| **Area**              | A theme region (header, footer, sidebar) composed of blocks.                                             |
| **Capability**        | An atomic permission (`publish_entries`, `manage_plugins`…).                                             |
| **Hook**              | An extension point: _action_ (event) or _filter_ (transformation).                                       |
| **Plugin**            | A package that extends the server, admin and/or editor through the Plugin SDK.                           |
| **Theme**             | A package that defines the public look of a site.                                                        |

---

## 3. Roles and capabilities

### 3.1 Default roles

The names are the same as in WordPress for familiarity. All roles can be customized per site.

| Capability                                       | Super admin | Administrator | Editor | Author |   Contributor    | Subscriber |
| ------------------------------------------------ | :---------: | :-----------: | :----: | :----: | :--------------: | :--------: |
| `manage_sites` (create/delete sites, domains)    |     ✅      |               |        |        |                  |            |
| `manage_plugins` (install plugins)               |     ✅      |               |        |        |                  |            |
| `activate_plugins` (on own site)                 |     ✅      |      ✅       |        |        |                  |            |
| `manage_themes` / `edit_theme_settings`          |     ✅      |      ✅       |        |        |                  |            |
| `manage_users` / `promote_users`                 |     ✅      |      ✅       |        |        |                  |            |
| `manage_settings`                                |     ✅      |      ✅       |        |        |                  |            |
| `manage_content_types` / `manage_taxonomies`     |     ✅      |      ✅       |        |        |                  |            |
| `manage_menus`                                   |     ✅      |      ✅       |   ✅   |        |                  |            |
| `edit_others_entries` / `publish_others_entries` |     ✅      |      ✅       |   ✅   |        |                  |            |
| `manage_terms`                                   |     ✅      |      ✅       |   ✅   |        |                  |            |
| `publish_entries` (own)                          |     ✅      |      ✅       |   ✅   |   ✅   |                  |            |
| `upload_media`                                   |     ✅      |      ✅       |   ✅   |   ✅   |                  |            |
| `edit_entries` (own, drafts)                     |     ✅      |      ✅       |   ✅   |   ✅   |        ✅        |            |
| `delete_entries` (own)                           |     ✅      |      ✅       |   ✅   |   ✅   | ✅ (drafts only) |            |
| `read_private_entries`                           |     ✅      |      ✅       |   ✅   |        |                  |            |
| `unfiltered_html`                                |     ✅      |      ✅*      |        |        |                  |            |
| `view_audit_log`                                 |     ✅      |      ✅       |        |        |                  |            |
| `read` (profile, members area)                   |     ✅      |      ✅       |   ✅   |   ✅   |        ✅        |     ✅     |

\* Can be disabled per site.

### 3.2 Rules

- Entry permissions take the content type into account. A type can require dedicated capabilities (`edit_events`…) instead of the generic ones.
- Plugins can define new capabilities and assign them to default roles on activation.
- The super admin is global. All other roles apply **per site** (`site_members`).

---

## 4. Functional requirements

### 4.1 Installation and sites

| ID        | Requirement                                                                                                          | Priority |
| --------- | -------------------------------------------------------------------------------------------------------------------- | -------- |
| RF-SIT-01 | Guided CLI installation (`cleitext install`): DB connection, migrations, first site, super admin.                    | MVP      |
| RF-SIT-02 | Guided web installation on first start, if the DB is empty, protected by a token shown in the logs.                  | 1.0      |
| RF-SIT-03 | Creating, editing and archiving sites from the CLI and the admin (super admin).                                      | MVP      |
| RF-SIT-04 | Multiple domains per site (primary plus aliases), with redirect to the primary domain and configurable forced HTTPS. | MVP      |
| RF-SIT-05 | Site resolution from the request host. An unknown host gets a neutral 404.                                           | MVP      |
| RF-SIT-06 | Per-site maintenance mode, with bypass for authenticated users and a page customizable by the theme.                 | MVP      |
| RF-SIT-07 | Cloning a site (structure, settings, optionally content).                                                            | Later    |

### 4.2 Users and access

| ID        | Requirement                                                                                            | Priority |
| --------- | ------------------------------------------------------------------------------------------------------ | -------- |
| RF-USR-01 | Login with email and password, cookie-based session, logout and "remember me" (configurable duration). | MVP      |
| RF-USR-02 | Password reset via email, with a short-lived single-use token.                                         | MVP      |
| RF-USR-03 | Inviting a user to a site with a role: the user sets their password on first access.                   | MVP      |
| RF-USR-04 | TOTP 2FA with recovery codes, optional for every user (turned on in the profile).                      | 1.0      |
| RF-USR-05 | Passkey login (WebAuthn).                                                                              | 1.0      |
| RF-USR-06 | Role and capability management from the admin.                                                         | 1.0      |
| RF-USR-07 | User profile: name, avatar, admin language, active sessions (with revocation).                         | MVP      |
| RF-USR-08 | API tokens with scopes and expiry, created by the user or by the administrator.                        | 1.0      |
| RF-USR-09 | Rate limiting and progressive lockout on login, with auditing of attempts.                             | MVP      |
| RF-USR-10 | Public user registration (optional per site).                                                          | Later    |
| RF-USR-11 | OIDC SSO (Google, Microsoft, Keycloak) as a plugin.                                                    | Later    |

### 4.3 Content

| ID        | Requirement                                                                                                                                                                        | Priority                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| RF-CNT-01 | `page` (hierarchical) and `article` types created by default for every site.                                                                                                       | MVP                                |
| RF-CNT-02 | Creating custom content types from the admin: name, slug, hierarchical, supports, fields, permalink.                                                                               | 1.0                                |
| RF-CNT-03 | Registering content types from plugins.                                                                                                                                            | MVP                                |
| RF-CNT-04 | Statuses: draft, pending review, scheduled, published, private, trash. Transitions are those in the diagram in ARCHITECTURE §9.2.                                                  | MVP                                |
| RF-CNT-05 | Every save creates a revision. Listing, visual comparison (diff) and restoring revisions.                                                                                          | MVP (list and restore), 1.0 (diff) |
| RF-CNT-06 | Autosave every 30 s and recovery after a crash or browser close.                                                                                                                   | MVP                                |
| RF-CNT-07 | Editing published content without exposing the changes until it is republished.                                                                                                    | MVP                                |
| RF-CNT-08 | Scheduled publishing, with date and time in the site's time zone.                                                                                                                  | MVP                                |
| RF-CNT-09 | Preview with the theme, via a shareable, expiring preview link.                                                                                                                    | MVP                                |
| RF-CNT-10 | Translations: create the version in another language from an existing entry, navigate between translations, see the status of each translation (official Multilingual plugin, M7). | MVP                                |
| RF-CNT-11 | Slug generated from the title (transliteration), editable and unique per type and language. Changing it creates an automatic 301 redirect.                                         | MVP                                |
| RF-CNT-12 | Featured image and excerpt (if supported by the type).                                                                                                                             | MVP                                |
| RF-CNT-13 | Child pages, ordering and hierarchical permalinks (`/about-us/team`).                                                                                                              | MVP                                |
| RF-CNT-14 | Trash with automatic emptying after N days (default 30).                                                                                                                           | MVP                                |
| RF-CNT-15 | Concurrent editing lock: "X is editing this page" warning with the option to take over.                                                                                            | 1.0                                |
| RF-CNT-16 | "Private" visibility (only users with the capability) and "password protected".                                                                                                    | 1.0                                |
| RF-CNT-17 | Custom editorial workflows (custom statuses).                                                                                                                                      | Later                              |

### 4.4 Block editor

| ID        | Requirement                                                                                                                                                                                     | Priority                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| RF-EDT-01 | Full-screen **Gutenberg** editor (standalone block editor) with: writing area, inserter ("+" button and `/` command), block toolbar, side inspector (Document and Block tabs).                  | MVP                                        |
| RF-EDT-00 | The editor is integrated through the `EditorAdapter` interface. Content is stored only in CXD format (never in `<!-- wp: -->` markup) and the public HTML is produced by the Cleitext renderer. | MVP                                        |
| RF-EDT-02 | Core blocks: paragraph, heading, list, quote, image, gallery, buttons, columns, group, separator, spacer, embed, table, code, HTML.                                                             | MVP (without table and gallery), 1.0 (all) |
| RF-EDT-03 | Inline formatting: bold, italic, underline, strikethrough, link, code, superscript and subscript.                                                                                               | MVP                                        |
| RF-EDT-04 | Moving blocks (up/down, drag & drop), duplicating, transforming (paragraph ⇄ heading ⇄ list).                                                                                                   | MVP                                        |
| RF-EDT-05 | Tree list view of blocks.                                                                                                                                                                       | 1.0                                        |
| RF-EDT-06 | Undo/redo and keyboard shortcuts (documented in a help dialog).                                                                                                                                 | MVP                                        |
| RF-EDT-07 | Patterns: save a selection as a pattern, insert a pattern. Synced (reusable) patterns.                                                                                                          | 1.0                                        |
| RF-EDT-08 | Paste from Word, Google Docs and HTML with clean conversion to blocks.                                                                                                                          | 1.0                                        |
| RF-EDT-09 | Plugin-defined blocks, with the same level of integration as core blocks (agnostic definition plus Gutenberg edit component).                                                                   | MVP                                        |
| RF-EDT-13 | A block without a component for the active editor remains editable through a form generated from its Zod schema.                                                                                | 1.0                                        |
| RF-EDT-14 | Editor adapter selectable per site (`editor.adapter`), to allow a gradual switch to another editor in the future.                                                                               | 1.0                                        |
| RF-EDT-15 | The active theme's styles are applied in the editor (editor styles in an iframe) for a faithful preview.                                                                                        | 1.0                                        |
| RF-EDT-10 | Word count, reading time and heading structure (warnings on skipped levels).                                                                                                                    | 1.0                                        |
| RF-EDT-11 | Accessibility: editor fully usable by keyboard, screen reader announcements.                                                                                                                    | 1.0                                        |
| RF-EDT-12 | Real-time collaborative editing.                                                                                                                                                                | Later                                      |

### 4.5 Media

| ID        | Requirement                                                                                                                         | Priority             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| RF-MED-01 | Multiple upload with drag & drop, progress bar and configurable size limit.                                                         | MVP                  |
| RF-MED-02 | Type whitelist, verified via magic bytes. The default is images (jpg, png, gif, webp, avif), pdf, office documents, mp4 and mp3.    | MVP                  |
| RF-MED-03 | Generation of image variants (AVIF/WebP plus fallback) in the background.                                                           | MVP                  |
| RF-MED-04 | Media library in grid and list view, with search, filters by type and date, and detail view with alt text and caption per language. | MVP                  |
| RF-MED-05 | Focal point for responsive cropping.                                                                                                | 1.0                  |
| RF-MED-06 | Cropping and rotation from the admin.                                                                                               | Later                |
| RF-MED-07 | Disk and S3-compatible storage drivers.                                                                                             | MVP (disk), 1.0 (S3) |
| RF-MED-08 | Duplicate detection (checksum) and display of where a media item is used.                                                           | 1.0                  |
| RF-MED-09 | SVG: disabled by default, or can be enabled with sanitization.                                                                      | 1.0                  |

### 4.6 Taxonomies

| ID        | Requirement                                                                                                 | Priority |
| --------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| RF-TAX-01 | Default `category` (hierarchical) and `tag` taxonomies for `article`.                                       | MVP      |
| RF-TAX-02 | Custom taxonomies from the admin and from plugins.                                                          | 1.0      |
| RF-TAX-03 | Translated terms, with per-language slug, description and custom fields (official Multilingual plugin, M7). | MVP      |
| RF-TAX-04 | Public archives per term (`/category/news`).                                                                | MVP      |

### 4.7 Menus and navigation

| ID        | Requirement                                                                                                               | Priority                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| RF-NAV-01 | Tree menu editor with drag & drop. Items can be entries, terms, URLs or labels without a link.                            | MVP                         |
| RF-NAV-02 | Assigning menus to the locations declared by the theme, per language.                                                     | MVP                         |
| RF-NAV-03 | Items linked to entries update automatically when the slug or title changes, and disappear if the entry is not published. | MVP                         |
| RF-NAV-04 | Redirects: management from the admin (path to path, status code, hit counter), with CSV import.                           | 1.0 (`redirects-ui` plugin) |

### 4.8 Themes and public site

| ID        | Requirement                                                                                                                            | Priority                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| RF-THM-01 | Installing (from a local folder, upload from the admin or CLI; from the registry in the public phase) and activating a theme per site. | MVP (CLI), 1.0 (upload), Public (registry) |
| RF-THM-02 | Template hierarchy (ARCHITECTURE §12.2).                                                                                               | MVP                                        |
| RF-THM-03 | Theme settings from a schema (logo, colors, fonts, social…), with live preview.                                                        | 1.0                                        |
| RF-THM-04 | Theme areas composed of blocks (header, footer).                                                                                       | 1.0                                        |
| RF-THM-05 | Default theme `aurora`: responsive, accessible (AA), Lighthouse score ≥ 95 in all categories.                                          | MVP                                        |
| RF-THM-06 | Basic meta generated by the core: `<title>`, description, canonical, hreflang, minimal Open Graph.                                     | MVP                                        |
| RF-THM-07 | XML sitemap (index plus one sitemap per type and language) and configurable `robots.txt`.                                              | MVP                                        |
| RF-THM-08 | RSS/Atom feeds for articles and per term.                                                                                              | 1.0                                        |
| RF-THM-09 | Customizable 404 page (entry designated in the settings).                                                                              | MVP                                        |
| RF-THM-10 | Public full-text search per language, with term highlighting.                                                                          | MVP                                        |
| RF-THM-11 | Child themes (template and style overrides).                                                                                           | Later                                      |

### 4.9 Plugins

| ID        | Requirement                                                                                                                                                                                                    | Priority |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| RF-PLG-01 | Installing and updating plugins from the CLI, with `apiVersion` and dependency checks.                                                                                                                         | MVP      |
| RF-PLG-02 | Plugin list in the admin (per-site status, version, permissions), per-site activation and deactivation.                                                                                                        | MVP      |
| RF-PLG-03 | Plugin migrations in a dedicated schema, run on install and update.                                                                                                                                            | MVP      |
| RF-PLG-04 | Uninstall with data removal, after confirmation.                                                                                                                                                               | 1.0      |
| RF-PLG-05 | Error isolation: a plugin that fails repeatedly is deactivated and flagged on the Dashboard.                                                                                                                   | 1.0      |
| RF-PLG-06 | Per-plugin metrics (time spent in hooks, errors) visible in the admin.                                                                                                                                         | 1.0      |
| RF-PLG-07 | Installing and updating plugins **from the admin** (_Plugins → Add New_): search the Cleitext registry, install, one-click update, rollback, automatic graceful restart.                                       | Public   |
| RF-PLG-09 | Signature (Ed25519) and checksum verification of packages from the registry.                                                                                                                                   | Public   |
| RF-PLG-10 | _Upload Plugin_: manual upload of a `.zip`/`.tgz` package from the admin, as in WordPress, with a warning if the package does not come from the registry. Can be disabled with `PLUGINS_ALLOW_UNSIGNED=false`. | 1.0      |
| RF-PLG-13 | Updates from the developer's server (`updateSource`) for premium plugins.                                                                                                                                      | Public   |
| RF-PLG-14 | Automatic updates, enabled per plugin (they need the registry, or `updateSource`, to know about new versions).                                                                                                 | 1.0      |
| RF-PLG-15 | Network-wide plugin activation across all sites (super admin) and must-use plugins (`plugins-required/`, always active).                                                                                       | 1.0      |
| RF-PLG-16 | Open registry: developer accounts, `cleitext publish`, automated and manual review, GPL-compatible licenses only.                                                                                              | Public   |
| RF-PLG-11 | Admin notifications for available updates and for versions revoked by the registry.                                                                                                                            | Public   |
| RF-PLG-12 | Installation from the admin can be disabled via env (`PLUGINS_INSTALL_FROM_UI=false`).                                                                                                                         | 1.0      |
| RF-PLG-08 | Official plugins at 1.0: `seo`, `forms`, `redirects-ui`, `wp-import`, `cleito-import`. `wp-compat` and `comments` afterwards.                                                                                  | 1.0      |

### 4.10 Settings

| ID        | Requirement                                                                                                                                                           | Priority |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| RF-SET-01 | General settings: site name, tagline, default language (more languages with the Multilingual plugin), time zone, date format, home page, 404 page, articles per page. | MVP      |
| RF-SET-02 | Per-site email (SMTP) settings, with a test email.                                                                                                                    | MVP      |
| RF-SET-03 | Permalinks per content type (pattern with `{slug}`, `{year}`, `{month}`, `{parent}`, `{term:category}` placeholders).                                                 | 1.0      |
| RF-SET-04 | Plugin settings on pages generated from the schema.                                                                                                                   | MVP      |

### 4.11 Import, export and migration

| ID        | Requirement                                                                                                                                     | Priority |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| RF-IMP-01 | Import of WordPress WXR files (`wp-import` plugin), with a report.                                                                              | 1.0      |
| RF-IMP-02 | Migration from the old Cleito CMS (`cleito-import` plugin): pages, texts per language, menus, options, users (mandatory password reset), media. | Deferred |
| RF-IMP-03 | Full export of a site in Cleitext format (JSON plus media, in an archive).                                                                      | 1.0      |
| RF-IMP-04 | Import of a Cleitext export, to migrate or clone between instances.                                                                             | 1.0      |

### 4.12 Admin UI

| ID        | Requirement                                                                                                                                                                                      | Priority                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| RF-ADM-01 | WordPress-style layout: sidebar with the sections (Dashboard, Posts, Pages, Media, custom types, Appearance, Plugins, Users, Settings), top bar, site switcher for those managing more than one. | MVP                      |
| RF-ADM-02 | Widget-based Dashboard: recent drafts, activity, system status, plugin widgets.                                                                                                                  | MVP                      |
| RF-ADM-03 | List tables with search, filters (status, author, language, term), sorting, pagination, bulk actions and quick edit.                                                                             | MVP                      |
| RF-ADM-04 | Light and dark theme, translated interface (IT and EN at 1.0).                                                                                                                                   | MVP (IT), 1.0 (EN, dark) |
| RF-ADM-05 | Command palette (`Ctrl+K`): navigation and quick actions.                                                                                                                                        | 1.0                      |
| RF-ADM-06 | Browsable and filterable activity log (audit).                                                                                                                                                   | 1.0                      |
| RF-ADM-07 | "System status" page: versions, migrations, jobs, cache, media storage.                                                                                                                          | 1.0                      |

---

## 5. Non-functional requirements

| ID     | Requirement                      | Measure / verification                                                                                                                                                   |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RNF-01 | Cached public page performance   | TTFB p95 < 50 ms (k6, 100 RPS, 1 vCPU)                                                                                                                                   |
| RNF-02 | Uncached public page performance | TTFB p95 < 300 ms                                                                                                                                                        |
| RNF-03 | Admin API                        | p95 < 150 ms with 50,000 entries per site                                                                                                                                |
| RNF-04 | Admin bundle                     | Initial load < 500 KB gzip. Gutenberg loaded only on the edit screen (lazy).                                                                                             |
| RNF-05 | Memory                           | < 300 MB RSS per web process at steady state                                                                                                                             |
| RNF-06 | Multi-site scalability           | ≥ 100 sites per instance with no more than 10% degradation                                                                                                               |
| RNF-07 | Isolation                        | 0 data leaks between sites (RLS suite in CI, mandatory)                                                                                                                  |
| RNF-08 | Security                         | OWASP ASVS L2 as a checklist. No open high or critical vulnerabilities in `pnpm audit` at release.                                                                       |
| RNF-09 | Accessibility                    | Admin and default theme WCAG 2.1 AA (axe in CI plus manual review)                                                                                                       |
| RNF-10 | Admin browser compatibility      | Latest 2 versions of Chrome, Firefox, Safari and Edge                                                                                                                    |
| RNF-11 | Runtime                          | Node.js 24 LTS (22 LTS supported), PostgreSQL 16+                                                                                                                        |
| RNF-12 | Stability                        | Semver. Deprecations last at least 2 minor versions. Migrations always reversible via a documented backup.                                                               |
| RNF-13 | Quality                          | TypeScript strict, core coverage ≥ 80%, no explicit `any` without justification                                                                                          |
| RNF-14 | Startup                          | Process cold start < 3 s (excluding migrations)                                                                                                                          |
| RNF-15 | Backup                           | `cleitext backup` command (pg_dump plus media archive) and a documented, tested restore procedure                                                                        |
| RNF-16 | Replaceable editor               | Imports from `@wordpress/*` allowed only in `packages/editor-gutenberg` and in `*.gutenberg.tsx` files (lint in CI). Server, renderer and DB do not depend on Gutenberg. |
| RNF-17 | Licenses                         | Core GPL-2.0-or-later. All dependencies have GPL-compatible licenses (license-checker in CI).                                                                            |
| RNF-18 | Editor round-trip                | For every core block, CXD → Gutenberg → CXD is identical (tested in CI).                                                                                                 |

---

## 6. REST API

Base: `/api/v1`. The format is JSON. Errors follow RFC 9457. Pagination is cursor-based (`?cursor=…&limit=…`).

### 6.1 Authentication

| Method | Path                                             | Description                                                                 |
| ------ | ------------------------------------------------ | --------------------------------------------------------------------------- |
| POST   | `/auth/login`                                    | Email and password. Responds with a session cookie, or with `2fa_required`. |
| POST   | `/auth/2fa`                                      | Verifies a TOTP or recovery code.                                           |
| POST   | `/auth/passkey/options` · `/auth/passkey/verify` | WebAuthn login.                                                             |
| POST   | `/auth/logout`                                   | Revokes the current session.                                                |
| POST   | `/auth/password/forgot` · `/auth/password/reset` | Password reset.                                                             |
| GET    | `/auth/me`                                       | Current user, sites and capabilities on the current site.                   |
| GET    | `/auth/csrf`                                     | CSRF token.                                                                 |

### 6.2 Content

| Method                | Path                                                            | Description                                                                   |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GET                   | `/content-types`                                                | List of the site's types.                                                     |
| POST · PATCH · DELETE | `/content-types[/:slug]`                                        | Type management (`manage_content_types`).                                     |
| GET                   | `/entries`                                                      | Filters: `type`, `status`, `locale`, `author`, `term`, `q`, `parent`, `sort`. |
| POST                  | `/entries`                                                      | Creates an entry (draft).                                                     |
| GET                   | `/entries/:id`                                                  | Entry plus current revision (`?revision=published` for the published one).    |
| PATCH                 | `/entries/:id`                                                  | Save: creates a `manual` revision.                                            |
| PUT                   | `/entries/:id/autosave`                                         | Autosave.                                                                     |
| POST                  | `/entries/:id/publish` · `/unpublish` · `/schedule` · `/submit` | Status transitions.                                                           |
| POST                  | `/entries/:id/trash` · `/restore`                               | Trash.                                                                        |
| DELETE                | `/entries/:id`                                                  | Permanent deletion (only if in the trash).                                    |
| GET                   | `/entries/:id/revisions`                                        | List of revisions.                                                            |
| GET                   | `/entries/:id/revisions/:rev`                                   | Revision detail.                                                              |
| POST                  | `/entries/:id/revisions/:rev/restore`                           | Restores a revision.                                                          |
| GET                   | `/entries/:id/translations`                                     | Translations in the group.                                                    |
| POST                  | `/entries/:id/translations`                                     | Creates the translation `{ locale }`.                                         |
| POST                  | `/entries/:id/preview-token`                                    | Expiring preview link.                                                        |
| POST                  | `/entries/:id/lock` · DELETE `/entries/:id/lock`                | Concurrent editing lock.                                                      |

### 6.3 Taxonomies, media, navigation

| Method                | Path                                                |
| --------------------- | --------------------------------------------------- |
| GET/POST/PATCH/DELETE | `/taxonomies[/:slug]`                               |
| GET/POST/PATCH/DELETE | `/taxonomies/:slug/terms[/:id]`                     |
| GET                   | `/media` (filters: `type`, `q`, `from`, `to`)       |
| POST                  | `/media` (multipart)                                |
| GET/PATCH/DELETE      | `/media/:id`                                        |
| GET                   | `/media/:id/usage`                                  |
| GET/POST/PATCH/DELETE | `/menus[/:id]`                                      |
| PUT                   | `/menus/:id/items` (atomic replacement of the tree) |
| GET/POST/PATCH/DELETE | `/redirects[/:id]`                                  |

### 6.4 System

| Method                | Path                                                                           | Description                                                |
| --------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| GET/POST/PATCH        | `/sites[/:id]`                                                                 | Sites (super admin).                                       |
| GET/POST/DELETE       | `/sites/:id/domains[/:id]`                                                     | Domains.                                                   |
| GET/PATCH             | `/settings/:namespace`                                                         | Settings (validated against the namespace schema).         |
| GET/POST/PATCH/DELETE | `/users[/:id]` · POST `/users/invite`                                          | Site users.                                                |
| GET/POST/PATCH/DELETE | `/roles[/:id]`                                                                 | Roles.                                                     |
| GET/POST/DELETE       | `/tokens[/:id]`                                                                | API tokens.                                                |
| GET                   | `/plugins`                                                                     | Installed plugins and their status on the site.            |
| POST                  | `/plugins/:slug/activate` · `/deactivate`                                      | Per-site activation.                                       |
| GET                   | `/registry/plugins?q=` · `/registry/themes?q=`                                 | Search the Cleitext registry (proxied through the server). |
| POST                  | `/plugins/install` `{slug, version}` · `/plugins/upload` (multipart .zip/.tgz) | Installation (`manage_plugins`).                           |
| POST                  | `/plugins/:slug/update` · `/plugins/:slug/rollback`                            | Update and rollback.                                       |
| DELETE                | `/plugins/:slug`                                                               | Uninstall (with confirmation).                             |
| GET                   | `/themes` · POST `/themes/install` · `/themes/:slug/activate`                  | Themes.                                                    |
| GET                   | `/search?q=`                                                                   | Global admin search (entries, media, terms, users).        |
| GET                   | `/audit`                                                                       | Activity log.                                              |
| GET                   | `/system/status`                                                               | System status.                                             |
| GET                   | `/blocks`                                                                      | Registry of available blocks (for the editor).             |

### 6.5 Delivery (read-only, headless)

`GET /api/v1/delivery/entries`, `/delivery/entries/by-path?path=/about-us`, `/delivery/menus/:location`, `/delivery/terms`, `/delivery/search`.

Exposes only published content. Accepts a token with the `delivery:read` scope, or no token if the site is configured as public. Responses are cached with ETags.

---

## 7. Plugin specification

> The developer guide, with what is implemented today, is [PLUGINS.md](./PLUGINS.md).

### 7.1 Manifest `cleitext.plugin.json`

| Field                                       | Type                            | Req. | Description                                                                                                      |
| ------------------------------------------- | ------------------------------- | :--: | ---------------------------------------------------------------------------------------------------------------- |
| `slug`                                      | string `^[a-z][a-z0-9-]{1,39}$` |  ✅  | Unique identifier, also used for the DB schema `plg_<slug>`.                                                     |
| `name`                                      | string                          |  ✅  | Display name.                                                                                                    |
| `version`                                   | semver                          |  ✅  | Plugin version.                                                                                                  |
| `apiVersion`                                | semver range                    |  ✅  | Supported Plugin SDK versions.                                                                                   |
| `server`                                    | path                            |      | Server entry point (ESM).                                                                                        |
| `admin`                                     | path                            |      | Admin entry point (ESM, shared React).                                                                           |
| `requires.cleitext`                         | semver range                    |      | Minimum core version.                                                                                            |
| `requires.plugins`                          | map slug → range                |      | Dependencies on other plugins.                                                                                   |
| `permissions`                               | string[]                        |      | Requested permissions (§7.3).                                                                                    |
| `capabilities`                              | string[]                        |      | Capabilities defined by the plugin.                                                                              |
| `settingsSchema`                            | path                            |      | JSON Schema for the settings (generated from Zod).                                                               |
| `updateSource`                              | URL                             |      | Developer's update server, for premium plugins distributed outside the registry (like WordPress's `Update URI`). |
| `license`                                   | SPDX                            |  ✅  | Must be GPL-compatible.                                                                                          |
| `description`, `author`, `homepage`, `icon` |                                 |      | Metadata.                                                                                                        |

### 7.2 SDK interface (server)

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
  hooks: HookApi; // on / filter / emit (own hooks only) / off
  content: ContentFacade; // query entries, registerType, registerFieldGroup (subject to permissions)
  taxonomy: TaxonomyFacade;
  media: MediaFacade;
  users: UserFacade; // read-only, unless the users:write permission is granted
  settings: SettingsFacade; // define(schema), get, set (own namespace only)
  access: AccessFacade; // defineCapability, can(user, cap)
  routes: RouteApi; // get/post/… public or admin-only, with capability guards
  blocks: BlockRegistry; // register(defineBlock(...))
  jobs: JobApi; // define, enqueue, schedule (cron)
  cache: CacheApi; // invalidate(tags), remember(key, ttl, fn)
  db: PluginDatabase; // Drizzle on the plg_<slug> schema, with the current site's RLS
  http: SafeHttpClient; // only with the http:outbound permission, SSRF-protected
  mail: MailApi; // with the mail:send permission
  log: Logger; // pino child logger with the plugin context
  i18n: I18nApi; // t(), site languages
}
```

### 7.3 Declarable permissions

`content:read`, `content:write`, `media:read`, `media:write`, `users:read`, `users:write`, `settings:own`, `settings:read`, `http:outbound`, `mail:send`, `routes:public`, `routes:admin`, `jobs`, `blocks`, `theme:hooks`.

Each facade checks the permission and throws `PluginPermissionError` if it is missing. Keep in mind the security limitation described in ARCHITECTURE §11.6.

### 7.4 Plugin migrations

- They live in `migrations/NNNN_name.sql` (or are generated by Drizzle) and run in the `plg_<slug>` schema.
- They are recorded in `plugin_migrations` with a checksum. A migration that was already applied and then modified blocks startup.
- Every plugin table that holds site data **must** have `site_id`. The RLS policy is added automatically by the `cleitextTenantTable()` helper.

### 7.5 Admin SDK

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

## 8. Core hook catalog

### 8.1 Actions (events)

| Hook                                                 | Payload                 | When             |
| ---------------------------------------------------- | ----------------------- | ---------------- |
| `app.ready`                                          | `{}`                    | Startup complete |
| `site.created` · `site.deleted`                      | `{ site }`              |                  |
| `user.login` · `user.logout` · `user.login.failed`   | `{ user?, email?, ip }` |                  |
| `user.created` · `user.updated` · `user.deleted`     | `{ user, site }`        |                  |
| `entry.created` · `entry.saved`                      | `{ entry, revision }`   | After commit     |
| `entry.published` · `entry.unpublished`              | `{ entry }`             | After commit     |
| `entry.trashed` · `entry.restored` · `entry.deleted` | `{ entry }`             |                  |
| `term.saved` · `term.deleted`                        | `{ term }`              |                  |
| `media.uploaded` · `media.deleted`                   | `{ media }`             |                  |
| `menu.saved`                                         | `{ menu }`              |                  |
| `settings.updated`                                   | `{ namespace, keys }`   |                  |
| `plugin.activated` · `plugin.deactivated`            | `{ plugin, site }`      |                  |
| `cache.invalidated`                                  | `{ tags }`              |                  |

### 8.2 Filters (transformations)

| Hook                       | Value             | Context                                                                 |
| -------------------------- | ----------------- | ----------------------------------------------------------------------- |
| `entry.beforeSave`         | `EntryInput`      | `{ user, site }`. Can validate or enrich, and throw a validation error. |
| `entry.permalink`          | `string`          | `{ entry }`                                                             |
| `entry.excerpt`            | `string`          | `{ entry }`                                                             |
| `render.head`              | `HeadTag[]`       | `{ entry?, route }`                                                     |
| `render.bodyClass`         | `string[]`        | `{ entry?, route }`                                                     |
| `render.blocks`            | `CxdBlock[]`      | `{ entry }` (before rendering)                                          |
| `render.html`              | `string`          | `{ entry?, route }` (final HTML, use sparingly)                         |
| `theme.templateCandidates` | `string[]`        | `{ route, entry? }`                                                     |
| `query.entries`            | `EntryQuery`      | `{ route }`                                                             |
| `search.document`          | `SearchDoc`       | `{ entry }` (indexed text)                                              |
| `sitemap.entries`          | `SitemapItem[]`   | `{ site, locale }`                                                      |
| `admin.menu`               | `AdminMenuItem[]` | `{ user }`                                                              |
| `media.allowedTypes`       | `string[]`        | `{ site }`                                                              |
| `mail.message`             | `MailMessage`     | `{ template }`                                                          |

---

## 9. CXD content format

### 9.1 Structure

```ts
type CxdDocument = {
  schema: 1; // document format version
  blocks: CxdBlock[];
};

type CxdBlock = {
  id: string; // stable id (for anchors, comments, diffs)
  type: `${string}/${string}`; // namespace/name: 'core/paragraph', 'seo/faq'
  v: number; // version of the block's attribute schema
  attrs: Record<string, unknown>;
  content?: CxdInline[]; // for text blocks
  children?: CxdBlock[]; // for container blocks
};

type CxdInline =
  | { text: string; marks?: Mark[] }
  | { type: 'link'; href: string; target?: '_blank'; rel?: string; children: CxdInline[] }
  | { type: 'mention' | 'inline-media'; [k: string]: unknown };

type Mark = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'sup' | 'sub';
```

### 9.2 Rules

- **Validation** of every block against the Zod schema for its version, both on save and on import.
- **Unknown block** (plugin deactivated): preserved intact, shown in the editor as a "block unavailable" placeholder, not shown on the public site (or shown via the `render.unknownBlock` filter).
- **Migration**: if `v` is lower than the registered version, `migrate` is applied on read. The migrated document is persisted on the next save.
- **Conversion** Gutenberg ⇄ CXD: handled by the `editor-gutenberg` package. The HTML rich text in Gutenberg attributes is converted and sanitized into `content` spans. It is tested with round-trip property tests, i.e. `toCxd(fromCxd(doc))` must equal `doc`.
- **Independence**: the CXD format contains nothing Gutenberg-specific. A future adapter only needs to implement the same conversion.
- **Search text**: extracted from the `content` of text blocks and from attributes marked `searchable`.

---

## 10. Custom field DSL

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

| Type                | Stored value       | Options                             |
| ------------------- | ------------------ | ----------------------------------- |
| `text`              | string             | `maxLength`, `pattern`, `multiline` |
| `richtext`          | CxdInline[]        | allowed `marks`                     |
| `number`            | number             | `min`, `max`, `step`                |
| `boolean`           | boolean            |                                     |
| `date` / `datetime` | ISO 8601           | `min`, `max`                        |
| `select`            | string \| string[] | `options`, `multiple`               |
| `media`             | uuid \| uuid[]     | `accept`, `multiple`                |
| `relation`          | uuid \| uuid[]     | `to` (type), `multiple`             |
| `repeater`          | object[]           | `fields`, `min`, `max`              |
| `group`             | object             | `fields`                            |
| `json`              | unknown            | `schema` (JSON Schema)              |

**Common options:**

- `required`, `default`, `label`, `help`, `translatable` (default `true`);
- `indexed`, which creates an expression index;
- `searchable`, which includes the field in full-text search;
- `showInList`, which shows the field as a column in the admin table.

---

## 11. Theme specification

### 11.1 Manifest `cleitext.theme.json`

```json
{
  "slug": "aurora",
  "name": "Aurora",
  "version": "1.0.0",
  "apiVersion": "^1.0",
  "menuLocations": { "primary": "Main menu", "footer": "Footer menu" },
  "areas": { "header": "Header", "footer": "Footer", "sidebar": "Sidebar" },
  "supports": ["featured-image", "dark-mode", "custom-logo"],
  "imageSizes": { "card": [640, 400], "hero": [1920, 900] },
  "settingsSchema": "dist/settings.schema.json"
}
```

### 11.2 Template contract

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

- `layout.tsx` receives `children` and `head` (the result of the `render.head` filter).
- Templates do not access the database directly: they receive props and use the SDK helpers, which go through the core services and the cache.

---

## 12. CLI

| Command                                                                           | Description                                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `cleitext install`                                                                | Interactive installation (DB, migrations, first site, super admin).                 |
| `cleitext migrate [--plugins]`                                                    | Runs core and plugin migrations.                                                    |
| `cleitext site:create · site:update · site:archive · site:list · site:domain:add` | Site management.                                                                    |
| `cleitext user:create · user:reset-password · user:promote`                       | User management.                                                                    |
| `cleitext plugin:search · plugin:install <slug                                    | file.zip                                                                            | file.tgz> · plugin:update · plugin:rollback · plugin:list · plugin:uninstall` | Plugins (from the Cleitext registry or from a file). |
| `cleitext theme:search · theme:install · theme:activate --site`                   | Themes.                                                                             |
| `cleitext login · publish`                                                        | For developers: authentication and publishing of plugins or themes to the registry. |
| `cleitext import:wxr <file> --site`                                               | WordPress import (requires `wp-import`).                                            |
| `cleitext import:cleito --dsn <pg> --site-id <n> --site`                          | Migration from the old CMS.                                                         |
| `cleitext export · import`                                                        | Export and import of a site in Cleitext format.                                     |
| `cleitext cache:purge [--site] [--tag]`                                           | Cache.                                                                              |
| `cleitext jobs:tick · jobs:work · jobs:status`                                    | Jobs (tick for the Plesk cron).                                                     |
| `cleitext backup · restore`                                                       | Backup and restore of DB and media.                                                 |
| `cleitext doctor`                                                                 | Diagnostics: versions, connections, folder permissions, configuration.              |

---

## 13. Roadmap and acceptance criteria

### M0 — Foundations (2–3 weeks)

- Monorepo, CI (lint, typecheck, test), local development database (embedded PostgreSQL, no containers).
- NestJS + Fastify skeleton, validated configuration, logging, health check.
- Core DB schema, migrations, RLS with isolation suite.

**✅ Acceptance:** `pnpm dev` starts the server and the admin. The RLS tests pass: two sites, zero leaks.

### M1 — Identity and sites (2–3 weeks)

- Sites, domains, languages, host resolution.
- Login, sessions, CSRF, password reset, invitations, default roles and capabilities.
- Admin shell (WordPress-style layout, empty Dashboard, user management).

**✅ Acceptance:** an Administrator invites an Editor, who logs in and sees only the permitted sections. Login rate limiting works.

### M2 — Content and editor (5–7 weeks, _the critical milestone_)

- `page` and `article` types, entries, revisions, statuses, autosave, scheduling, translations.
- **Standalone Gutenberg spike** in the first week: block editor outside WordPress, services provided by the adapter, iframe and styles.
- CXD format, `EditorAdapter`, Gutenberg adapter with 10 basic blocks and tested round-trip.
- Media (upload, variants, library), basic taxonomies.

**✅ Acceptance:** an editor writes an article with headings, images and columns, saves it, translates it, restores a revision and schedules it. The CXD round-trip is tested. **Editor checkpoint** (see risks in ARCHITECTURE §21).

### M3 — Public site (3–4 weeks)

- SSR renderer, template hierarchy, `aurora` theme.
- Menus, permalinks, automatic redirects, 404, sitemap, basic meta, search.
- Page cache with tag-based invalidation.

**✅ Acceptance:** the demo site scores Lighthouse ≥ 95 and meets RNF-01 and RNF-02. Publishing an article updates the home page, archive and menus without having to purge the cache manually.

### M4 — Plugins (3–4 weeks)

- Plugin SDK v1 (server and admin), manifest, lifecycle, dedicated schemas, typed hooks.
- Reference plugins: `seo` and `forms`.

**✅ Acceptance:** a plugin outside the monorepo, developed using only the SDK documentation, adds a content type, a block, an admin page and its own table. Deactivating it does not break the site.

### M5 — Migrations and deployment (2–3 weeks)

- `cleito-import` (first real case: a Cleito site in production) and `wp-import`. _Update (October 2026): `cleito-import` is deferred, since no Cleito site needs migrating for now; the import model and `import:wxr` cover WordPress._
- Plesk package, deployment guide, backup and restore.

**✅ Acceptance:** the sample Cleito site is migrated to Plesk with correct content, menus, languages and redirects (deferred with `cleito-import`). A real WordPress WXR export is imported with a report showing no blocking errors.

### M6 — 1.0 release for internal use (3–4 weeks)

- 2FA and passkeys, audit log, system status, dark theme.
- Plugin and theme upload from the admin, per-plugin automatic updates, must-use plugins.
- Security hardening (ASVS checklist), load testing, internal documentation (installation, plugins, themes).

**✅ Acceptance:** all MVP and 1.0 requirements met, RNFs verified in CI, our sites in production on Cleitext.

> **Estimate up to the internal 1.0:** about 5–7 months for a team of 2–3 developers. To be revised after M2, which is the main source of uncertainty.

### M7 — Multilingual in a plugin

- The core keeps the language of each entry, term and menu and the site's default language, and nothing else: a site with one language has no language prefix, hreflang, switcher, extra query or plugin call.
- The official **Multilingual** plugin (`plugins/multilingual`) adds the languages, the translation links of entries and terms (`LanguageProvider`), Settings → Languages, the Translations section of the editor and the translations columns of the lists.
- Plugin API 1.1: `ctx.languages`, `ctx.content.copy`, `ctx.terms`, `ctx.storage`, term events, editor sections and list columns in the admin.
- Migration 0016 hands the existing languages and translations over to the plugin; front, posts and error pages are stored as page ids.

**✅ Acceptance:** monolingual sites behave as before with no multilingual cost (tested in CI); multilingual sites keep their languages, addresses and translations once the plugin is active.

### M8 — Public release (when we decide to distribute it)

- Choice of domain, project website, public documentation, admin in English.
- Open Cleitext registry: developer accounts, `cleitext publish`, review, package signing, revocation, updates from the registry and from `updateSource`.
- Public repository with a GPL-2.0-or-later `LICENSE` file, contribution guidelines, legal review of the registry terms.

**✅ Acceptance:** all **Public** requirements met, at least 3 official plugins published in the registry.

---

### M9 — AI assistants (MCP)

- **RF-AI-01** MCP server at `/mcp` (stateless Streamable HTTP), off until the site turns it on (Settings → AI assistants). Tools over the REST API, called with the assistant's token: site overview, block guide (core blocks, plugin blocks, the theme's `aiGuide`, the site's patterns), list/read/create/update entries (WordPress block markup, HTML or CXD, validated), preview links, publish (own scope), images from public https addresses, menus. New entries are drafts.
- **RF-AI-02** OAuth 2.1 for assistants: protected resource and authorization server metadata, dynamic client registration, consent in the admin (Connect an assistant), authorization code with PKCE (S256), rotating refresh tokens. Access tokens are API tokens of the user (scopes `read`, `write`, `publish`), listed and revoked in Admin → AI assistants and in the profile.
- **RF-AI-03** Chat in Admin → AI assistants: the site's AI provider (OpenAI-compatible chat completions API, address, model and encrypted key set by super admins) runs the same tools as the signed-in user, with streamed progress; drafts unless the user lets it publish. Ready requests to use in the chat or copy into an assistant.
- Acceptance: an assistant connected through OAuth builds a page from the theme's sections, saved as a draft that opens in the block editor; a read-only connection cannot change anything; revoking the token disconnects it.

## 14. Out of scope

- E-commerce: **planned for the future** as a plugin, not to be done now (see ARCHITECTURE §22.1).
- Public plugin and theme registry: **planned for the future** (milestone M8), not to be done now.
- Comments (separate plugin, not planned for now).
- Real-time collaborative editing.
- Free-form drag-and-drop visual page builder (beyond the block editor).
- Running existing WordPress plugins or themes.
- Paid plugins in the registry (sales, commercial licenses).
- Managed SaaS hosting.

---

## 15. Definition of Done

A feature is complete when it:

1. meets the linked requirements and acceptance criteria (RF/RNF IDs in the PR title);
2. has unit and integration tests, plus E2E tests if it touches a main user flow;
3. respects permissions (both positive and negative capability tests) and isolation between sites;
4. has shared Zod schemas and up-to-date OpenAPI documentation;
5. is accessible (no axe violations), translated (strings in i18n) and documented (user and/or developer);
6. uses only dependencies with GPL-compatible licenses and does not import `@wordpress/*` outside the editor adapter;
7. has been reviewed by at least one other person.
