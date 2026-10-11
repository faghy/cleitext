<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/admin/public/brand/logo-dark.svg" />
    <img src="apps/admin/public/brand/logo.svg" alt="Cleitext" width="268" height="64" />
  </picture>
</p>

# Cleitext

**CMS open source, multi-sito e multilingua, con sistema a plugin. Si usa come WordPress, ma non è costruito su WordPress.**

> 🇬🇧 La versione di riferimento è quella inglese: [README.md](./README.md). Questa traduzione è secondaria e può essere meno aggiornata.
>
> Stato: **sviluppo iniziale**, tappe M0 (fondamenta), M1 (identità e siti), M2 (contenuti ed editor), M3 (sito pubblico) e M4 (plugin). Per ora è a uso interno; la distribuzione pubblica è prevista in seguito.
> Licenza: **GPL-2.0-or-later** (come WordPress)

## In sintesi

- **Stack**: TypeScript · Node.js 24 · NestJS (adapter Fastify) · Drizzle ORM · PostgreSQL
- **Admin**: React · Vite · Tailwind · shadcn/ui · TanStack
- **Editor**: **Gutenberg** (standalone) dietro un `EditorAdapter`, sostituibile in futuro. I contenuti sono salvati nel formato proprio **CXD**.
- **Sito pubblico**: temi in React SSR, senza JavaScript di default, con cache a tag
- **Estensibilità**: sistema a plugin sul modello di WordPress (hook, ciclo di vita attivazione/disinstallazione, upload e aggiornamenti automatici), con hook tipizzati e uno schema PostgreSQL dedicato per ogni plugin
- **Multi-sito**: un'unica installazione per più domini, isolati con il Row Level Security di PostgreSQL
- **Assistenti IA**: un server MCP permette di collegare ChatGPT e altri assistenti IA con OAuth e far costruire loro pagine e articoli con i blocchi dell'editor, oppure chiedere nella chat dell'admin con il fornitore di IA del sito
- **Privacy e GDPR** (plugin separato): banner dei cookie secondo le linee guida del Garante, con gli script bloccati fino al consenso e un registro dei consensi, pagine di privacy e cookie policy fatte di blocchi, e richieste di esportazione o cancellazione dei dati personali
- **Deploy**: Plesk (estensione Node.js)

## Sviluppo

Requisiti: **Node.js 22+** e **pnpm 12** (`npm i -g pnpm@12`). Non serve installare PostgreSQL né usare container: un server PostgreSQL reale viene avviato dai binari embedded.

```bash
pnpm install
pnpm dev          # database locale + server e sito pubblico (http://localhost:3000) + admin (http://localhost:5173/admin/)
```

Al primo avvio `pnpm dev` crea un database locale in `.cleitext-dev/`, scrive un file `.env` (vedi `.env.example`) e crea un sito **Development** che risponde su `localhost`. Accedi a http://localhost:5173/admin/ con `admin@example.com` / `cleitext-admin` (solo per lo sviluppo locale). Le email vengono stampate nel log del server.

| Comando                                       | Cosa fa                                                                                                                                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                    | Avvia database locale, server e admin con ricaricamento automatico                                                                                                                                                                                        |
| `pnpm db:dev`                                 | Avvia solo il database locale (con le migrazioni applicate)                                                                                                                                                                                               |
| `pnpm test`                                   | Esegue tutti i test, ogni suite su un PostgreSQL embedded nuovo                                                                                                                                                                                           |
| `pnpm e2e`                                    | Test nel browser dell'admin, dell'editor Gutenberg, dei plugin e del sito pubblico (Playwright; avvia `pnpm dev` se serve)                                                                                                                                |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | Build, controllo dei tipi, lint                                                                                                                                                                                                                           |
| `pnpm db:generate`                            | Genera una migrazione dopo una modifica allo schema in `packages/db/src/schema`                                                                                                                                                                           |
| `pnpm cleitext <comando>`                     | CLI: `install`, `migrate`, `site:create`, `site:list`, `site:update`, `site:archive`, `site:domain:add`, `site:locale:add`, `site:maintenance`, `user:create`, `user:reset-password`, `plugin:build`, `plugin:install`, `plugin:list`, `plugin:uninstall` |

## Documentazione

| Documento                                                                             | Contenuto                                                                                             |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`docs/it/ARCHITETTURA.md`](./docs/it/ARCHITETTURA.md) ([EN](./docs/ARCHITECTURE.md)) | Principi, stack, modello dati (DDL), multi-sito, editor, plugin, temi, sicurezza, deploy, ADR, rischi |
| [`docs/it/SPECIFICHE.md`](./docs/it/SPECIFICHE.md) ([EN](./docs/SPECIFICATIONS.md))   | Requisiti funzionali e non funzionali, API REST, SDK dei plugin, hook, formato CXD, CLI, roadmap      |
| [`docs/it/PLUGIN.md`](./docs/it/PLUGIN.md) ([EN](./docs/PLUGINS.md))                  | Sviluppare plugin: manifest, hook, tipi di contenuto, blocchi, route, tabelle proprie, pagine admin   |
| [`docs/it/TEMI.md`](./docs/it/TEMI.md) ([EN](./docs/THEMES.md))                       | Sviluppare temi: template, impostazioni, aree di blocchi, stili dell'editor                           |
| [`docs/it/DEPLOY.md`](./docs/it/DEPLOY.md) ([EN](./docs/DEPLOYMENT.md))               | Installazione e aggiornamento su server (Plesk, nginx), backup                                        |
| [`docs/it/MCP.md`](./docs/it/MCP.md) ([EN](./docs/MCP.md))                            | Assistenti IA: collegarli con MCP e OAuth, i loro strumenti                                           |
| [`docs/it/PRIVACY.md`](./docs/it/PRIVACY.md) ([EN](./docs/PRIVACY.md))                | Plugin Privacy e GDPR: banner dei cookie, registro consensi, policy, richieste sui dati personali     |
| [`docs/it/ASVS.md`](./docs/it/ASVS.md) ([EN](./docs/ASVS.md))                         | Checklist di sicurezza OWASP ASVS e punti aperti; segnalazioni in [`SECURITY.md`](./SECURITY.md)      |

## Il principio chiave

> **WordPress come modello, non come codice. Gutenberg come editor, ma sostituibile.**

Chi viene da WordPress ritrova concetti, admin, editor a blocchi, temi e plugin. Il codice però è interamente nostro (TypeScript + PostgreSQL). Gutenberg è usato come libreria dietro un adattatore: i contenuti sono salvati in un formato proprio (CXD) e l'HTML pubblico lo genera Cleitext. Un domani si può passare a un altro editor scrivendo un nuovo adattatore, **senza migrare i dati**.

## Origine

Cleitext nasce come successore di **Cleito CMS**, un CMS privato in PHP + PostgreSQL. Ne eredita le idee che hanno funzionato (multi-sito con `site_id`, testi per lingua, menu ad albero), e il plugin `cleito-import` ne migra i contenuti.

## Licenza

Cleitext è software libero, rilasciato con licenza [GNU General Public License v2.0 o successiva](./LICENSE).
