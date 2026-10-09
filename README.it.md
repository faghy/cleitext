# Cleitext

**CMS open source, multi-sito e multilingua, con sistema a plugin. Si usa come WordPress, ma non è costruito su WordPress.**

> 🇬🇧 La versione di riferimento è quella inglese: [README.md](./README.md). Questa traduzione è secondaria e può essere meno aggiornata.
>
> Stato: **sviluppo iniziale**, tappa M0 (fondamenta). Per ora è a uso interno; la distribuzione pubblica è prevista in seguito.
> Licenza: **GPL-2.0-or-later** (come WordPress)

## In sintesi

- **Stack**: TypeScript · Node.js 24 · NestJS (adapter Fastify) · Drizzle ORM · PostgreSQL
- **Admin**: React · Vite · Tailwind · shadcn/ui · TanStack
- **Editor**: **Gutenberg** (standalone) dietro un `EditorAdapter`, sostituibile in futuro. I contenuti sono salvati nel formato proprio **CXD**.
- **Sito pubblico**: temi in React SSR, senza JavaScript di default, con cache a tag
- **Estensibilità**: sistema a plugin sul modello di WordPress (hook, ciclo di vita attivazione/disinstallazione, upload e aggiornamenti automatici), con hook tipizzati e uno schema PostgreSQL dedicato per ogni plugin
- **Multi-sito**: un'unica installazione per più domini, isolati con il Row Level Security di PostgreSQL
- **Deploy**: Plesk (estensione Node.js)

## Sviluppo

Requisiti: **Node.js 22+** e **pnpm 10** (`corepack enable`). Non serve installare PostgreSQL né usare container: un server PostgreSQL reale viene avviato dai binari embedded.

```bash
pnpm install
pnpm dev          # database locale + server (http://127.0.0.1:3000) + admin (http://localhost:5173/admin/)
```

Al primo avvio `pnpm dev` crea un database locale in `.cleitext-dev/` e scrive un file `.env` (vedi `.env.example`).

| Comando                                       | Cosa fa                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`                                    | Avvia database locale, server e admin con ricaricamento automatico              |
| `pnpm db:dev`                                 | Avvia solo il database locale (con le migrazioni applicate)                     |
| `pnpm test`                                   | Esegue tutti i test, ogni suite su un PostgreSQL embedded nuovo                 |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | Build, controllo dei tipi, lint                                                 |
| `pnpm db:generate`                            | Genera una migrazione dopo una modifica allo schema in `packages/db/src/schema` |

## Documentazione

| Documento                                                                             | Contenuto                                                                                             |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`docs/it/ARCHITETTURA.md`](./docs/it/ARCHITETTURA.md) ([EN](./docs/ARCHITECTURE.md)) | Principi, stack, modello dati (DDL), multi-sito, editor, plugin, temi, sicurezza, deploy, ADR, rischi |
| [`docs/it/SPECIFICHE.md`](./docs/it/SPECIFICHE.md) ([EN](./docs/SPECIFICATIONS.md))   | Requisiti funzionali e non funzionali, API REST, SDK dei plugin, hook, formato CXD, CLI, roadmap      |

## Il principio chiave

> **WordPress come modello, non come codice. Gutenberg come editor, ma sostituibile.**

Chi viene da WordPress ritrova concetti, admin, editor a blocchi, temi e plugin. Il codice però è interamente nostro (TypeScript + PostgreSQL). Gutenberg è usato come libreria dietro un adattatore: i contenuti sono salvati in un formato proprio (CXD) e l'HTML pubblico lo genera Cleitext. Un domani si può passare a un altro editor scrivendo un nuovo adattatore, **senza migrare i dati**.

## Origine

Cleitext nasce come successore di **Cleito CMS**, un CMS privato in PHP + PostgreSQL. Ne eredita le idee che hanno funzionato (multi-sito con `site_id`, testi per lingua, menu ad albero), e il plugin `cleito-import` ne migra i contenuti.

## Licenza

Cleitext è software libero, rilasciato con licenza [GNU General Public License v2.0 o successiva](./LICENSE).
