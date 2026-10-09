# Cleitext

**CMS open source, multi-sito e multilingua, con sistema a plugin. Si usa come WordPress, ma non è costruito su WordPress.**

> 🇬🇧 La versione di riferimento è quella inglese: [README.md](./README.md). Questa traduzione è secondaria e può essere meno aggiornata.
>
> Stato: **progettazione** (v0.2, ottobre 2026), codice non ancora scritto. Per ora è a uso interno; la distribuzione pubblica è prevista in seguito.
> Licenza: **GPL-2.0-or-later** (come WordPress)

## In sintesi

- **Stack**: TypeScript · Node.js 24 · NestJS (adapter Fastify) · Drizzle ORM · PostgreSQL
- **Admin**: React · Vite · Tailwind · shadcn/ui · TanStack
- **Editor**: **Gutenberg** (standalone) dietro un `EditorAdapter`, sostituibile in futuro. I contenuti sono salvati nel formato proprio **CXD**.
- **Sito pubblico**: temi in React SSR, senza JavaScript di default, con cache a tag
- **Estensibilità**: sistema a plugin sul modello di WordPress (hook, ciclo di vita attivazione/disinstallazione, upload e aggiornamenti automatici), con hook tipizzati e uno schema PostgreSQL dedicato per ogni plugin
- **Multi-sito**: un'unica installazione per più domini, isolati con il Row Level Security di PostgreSQL
- **Deploy**: Plesk (estensione Node.js) oppure Docker

## Documentazione

| Documento | Contenuto |
|---|---|
| [`docs/it/ARCHITETTURA.md`](./docs/it/ARCHITETTURA.md) ([EN](./docs/ARCHITECTURE.md)) | Principi, stack, modello dati (DDL), multi-sito, editor, plugin, temi, sicurezza, deploy, ADR, rischi |
| [`docs/it/SPECIFICHE.md`](./docs/it/SPECIFICHE.md) ([EN](./docs/SPECIFICATIONS.md)) | Requisiti funzionali e non funzionali, API REST, SDK dei plugin, hook, formato CXD, CLI, roadmap |

## Il principio chiave

> **WordPress come modello, non come codice. Gutenberg come editor, ma sostituibile.**

Chi viene da WordPress ritrova concetti, admin, editor a blocchi, temi e plugin. Il codice però è interamente nostro (TypeScript + PostgreSQL). Gutenberg è usato come libreria dietro un adattatore: i contenuti sono salvati in un formato proprio (CXD) e l'HTML pubblico lo genera Cleitext. Un domani si può passare a un altro editor scrivendo un nuovo adattatore, **senza migrare i dati**.

## Origine

Cleitext nasce come successore di **Cleito CMS**, un CMS privato in PHP + PostgreSQL. Ne eredita le idee che hanno funzionato (multi-sito con `site_id`, testi per lingua, menu ad albero), e il plugin `cleito-import` ne migra i contenuti.

## Licenza

Cleitext è software libero, rilasciato con licenza [GNU General Public License v2.0 o successiva](./LICENSE).
