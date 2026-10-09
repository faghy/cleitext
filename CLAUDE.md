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
CLAUDE.md                     these conventions
docs/ARCHITECTURE.md          architecture (reference)
docs/SPECIFICATIONS.md        requirements, APIs, SDK, roadmap (reference)
docs/it/                      Italian translations
```

The planned code layout (monorepo `apps/`, `packages/`, `plugins/`, `themes/`) is described in `docs/ARCHITECTURE.md` §5. Follow it when code is added.

## Workflow

- Before changing behavior or design, check the relevant sections of `docs/ARCHITECTURE.md` and `docs/SPECIFICATIONS.md`. If a decision changes, update the docs (EN, then IT) in the same change, including the ADR table (§20) and the decisions table (§22).
- Keep requirement IDs (`RF-…`, `RNF-…`) stable. Reference them in commits and PRs when relevant.
- Priorities in the specs: MVP → 1.0 (internal use) → Public (open-source release) → Later. Don't build "Public"/"Later" items unless asked.

## Git

- Default branch: `main`. Remote: `git@github.com:faghy/cleitext.git` (public).
- Use Conventional Commits in English (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`…).
- Commit or push only when the maintainer asks. Pushing publishes to a public repository.
- If SSH push is rejected (`Permission denied (publickey)`), push over HTTPS with the GitHub CLI credentials: `git -c credential.helper='!gh auth git-credential' push https://github.com/faghy/cleitext.git main`.
- Never commit secrets, `.env` files, database dumps or customer data. The legacy Cleito CMS code is private and must never be copied into this repository, nor referenced by local paths.

## Project decisions

The source of truth is `docs/ARCHITECTURE.md` §20 (ADRs) and §22 (decisions and open questions). Key points:

- License GPL-2.0-or-later, with a plugin model identical to WordPress.
- Gutenberg is the editor, used only behind `EditorAdapter`. `@wordpress/*` imports are allowed only in `packages/editor-gutenberg` and in `*.gutenberg.tsx` files. Content is always stored as CXD.
- The plugin registry, e-commerce, comments and the WordPress-compatible API are planned but **not to be built now**.
