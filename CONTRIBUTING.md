# Cleitext — working conventions

## Language

- **English is the primary language of the repository.** Code, identifiers, file and folder names, comments, commit messages, PR titles/descriptions, issues, changelogs and documentation are written in English.
- **Italian is the secondary language.** Italian translations live next to the English source:
  - docs: `docs/it/<NAME>.md` (e.g. `docs/it/ARCHITETTURA.md` ↔ `docs/ARCHITECTURE.md`)
  - top-level files: `<NAME>.it.md` (e.g. `README.it.md`)
  - UI strings: Italian is a first-class locale in i18n files.
- When an English document changes, update its Italian translation in the same change when feasible. Otherwise note in the PR that the translation lags behind.
- **Talk to the maintainer in Italian**, in chat and in explanations, even though repository content is English.

## Repository layout

```
README.md / README.it.md      project overview (EN primary, IT secondary)
LICENSE                       GPL-2.0 full text (project is GPL-2.0-or-later)
CONTRIBUTING.md                     these conventions
docs/ARCHITECTURE.md          architecture (reference)
docs/SPECIFICATIONS.md        requirements, APIs, SDK, roadmap (reference)
docs/it/                      Italian translations
apps/server                   NestJS + Fastify server
apps/admin                    admin SPA (React, Vite, Tailwind)
packages/db                   Drizzle schema, migrations (drizzle/), RLS, site context
packages/shared               capabilities, default roles, API schemas (server + admin)
packages/cli                  `cleitext` CLI (owner connection)
packages/testing              embedded PostgreSQL + DB provisioning for tests
tools/dev-db                  persistent local PostgreSQL for `pnpm dev`
```

The full target layout (`plugins/`, `themes/`, more packages) is described in `docs/ARCHITECTURE.md` §5. Follow it when code is added.

## Commands

- `pnpm dev` — local DB + server + admin. `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format`.
- Schema changes: edit `packages/db/src/schema`, then `pnpm db:generate`. Hand-written SQL (RLS, functions) goes in custom migrations (`drizzle-kit generate --custom`).
- Every new table with a `site_id` column must get RLS (`cleitext_enable_tenant_rls`) and composite FKs `(site_id, id)` to its parents. The isolation suite in `packages/db/test` fails when a tenant table has no RLS.
- Auth model: cookie session + CSRF double-submit (`x-csrf-token` header and same-origin `Origin`) on every state-changing request; routes are authenticated by default (global `AuthGuard`), use `@Public()` / `@RequireCapability()`. Data access goes through `withContext(db, { siteId, userId }, fn)`.
- Dev login: `admin@example.com` / `cleitext-admin` on `localhost` (seeded by `tools/dev-db`).
- No Docker: tests and dev use embedded PostgreSQL. Set `CLEITEXT_TEST_PG_URL` (superuser URL) to test against an external server.
- NestJS code in `apps/server` must not use `import type` for injected classes (decorator metadata).
- TypeScript 7 compiles everything (`tsc` comes from `@typescript/native` = `typescript@7`). The `typescript` package is aliased to `@typescript/typescript6` only because typescript-eslint still needs the TS 6 API (official side-by-side setup). Drop the alias when typescript-eslint supports TS 7.
- Prefer the latest stable, officially released version of every tool and library; no pre-releases as main choice.
- pnpm 12 is pinned in `packageManager`. Its default `minimumReleaseAge` policy rejects packages published in the last day: keep it (supply-chain protection) and retry later instead of relaxing it.

## Workflow

- Before changing behavior or design, check the relevant sections of `docs/ARCHITECTURE.md` and `docs/SPECIFICATIONS.md`. If a decision changes, update the docs (EN, then IT) in the same change, including the ADR table (§20) and the decisions table (§22).
- Keep requirement IDs (`RF-…`, `RNF-…`) stable. Reference them in commits and PRs when relevant.
- Priorities in the specs: MVP → 1.0 (internal use) → Public (open-source release) → Later. Don't build "Public"/"Later" items unless asked.

## Git

- Work happens directly on `main`: no feature branches or pull requests for now. Remote: `git@github.com:faghy/cleitext.git` (private for now).
- Use Conventional Commits in English (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`…).
- Commit or push only when the maintainer asks.
- No attribution lines in commits or pull requests (no `Co-Authored-By` trailers for tools, no "generated with" footers).
- If SSH push is rejected (`Permission denied (publickey)`), push over HTTPS with the GitHub CLI credentials: `git -c credential.helper='!gh auth git-credential' push https://github.com/faghy/cleitext.git main`. The GitHub CLI (`gh`) is the preferred way to talk to GitHub.
- Never commit secrets, `.env` files, database dumps or customer data. The legacy Cleito CMS code is private and must never be copied into this repository, nor referenced by local paths.

## Project decisions

The source of truth is `docs/ARCHITECTURE.md` §20 (ADRs) and §22 (decisions and open questions). Key points:

- License GPL-2.0-or-later, with a plugin model identical to WordPress.
- Gutenberg is the editor, used only behind `EditorAdapter`. `@wordpress/*` imports are allowed only in `packages/editor-gutenberg` and in `*.gutenberg.tsx` files. Content is always stored as CXD.
- The plugin registry, e-commerce, comments and the WordPress-compatible API are planned but **not to be built now**.
