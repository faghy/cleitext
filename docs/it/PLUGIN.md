# Sviluppare plugin per Cleitext

> 🇬🇧 Versione di riferimento in inglese: [docs/PLUGINS.md](../PLUGINS.md). Questa traduzione è secondaria e può essere meno aggiornata.

> API dei plugin **1.0**

Un plugin estende Cleitext come un plugin di WordPress estende WordPress. Può aggiungere tipi di contenuto con campi personalizzati, blocchi, pagine all'amministrazione, impostazioni, endpoint, indirizzi sul sito pubblico e tabelle proprie nel database, e può reagire a ciò che accade tramite gli hook.

Questa guida è tutto ciò che ti serve per scriverne uno. Un esempio completo si trova in [`examples/plugin-events`](../../examples/plugin-events): un plugin _Events_ con un tipo di contenuto, un blocco, una pagina di amministrazione e una tabella propria.

## Indice

1. [Come funzionano i plugin](#1-come-funzionano-i-plugin)
2. [Struttura della cartella e manifest](#2-struttura-della-cartella-e-manifest)
3. [Build, installazione, attivazione](#3-build-installazione-attivazione)
4. [Il punto di ingresso del server](#4-il-punto-di-ingresso-del-server)
5. [Hook](#5-hook)
6. [Tipi di contenuto e campi personalizzati](#6-tipi-di-contenuto-e-campi-personalizzati)
7. [Blocchi](#7-blocchi)
8. [Route](#8-route)
9. [Impostazioni, capability, cache, mail](#9-impostazioni-capability-cache-mail)
10. [Le tue tabelle](#10-le-tue-tabelle)
11. [Il punto di ingresso dell'admin](#11-il-punto-di-ingresso-delladmin)
12. [Permessi](#12-permessi)
13. [Disattivazione, aggiornamenti, disinstallazione, errori](#13-disattivazione-aggiornamenti-disinstallazione-errori)
14. [Riferimento: tipi di campo](#14-riferimento-tipi-di-campo)

---

## 1. Come funzionano i plugin

- Un plugin è una cartella con un manifest (`cleitext.plugin.json`), un **punto di ingresso del server** e, facoltativamente, un **punto di ingresso dell'admin**, migrazioni SQL e altri file.
- Viene **installato una sola volta** su un server Cleitext e **attivato per singolo sito**. Tutto ciò che aggiunge (tipi, blocchi, route, hook, capability) esiste solo sui siti in cui è attivo.
- I plugin si scrivono in TypeScript o JavaScript, con JSX. `cleitext plugin:build` ne crea il bundle. I bundle **non** includono React, Drizzle, Zod né l'SDK: li fornisce Cleitext a runtime, così c'è un'unica istanza di React per blocchi e pagine dell'admin (vedi [moduli condivisi](#moduli-condivisi)).
- Il sito pubblico non ha JavaScript lato client: blocchi e pagine sono renderizzati sul server con React.
- I plugin girano nello stesso processo di Cleitext. Sono codice fidato: i permessi rendono esplicito ciò che un plugin fa e intercettano gli errori, ma non sono una sandbox.

## 2. Struttura della cartella e manifest

```
my-plugin/
├─ cleitext.plugin.json      manifest
├─ src/
│  ├─ server.tsx             server entry  → dist/server.js
│  └─ admin.tsx              admin entry   → dist/admin.js (optional)
├─ migrations/               SQL for your own tables (optional)
│  └─ 0001_create_tables.sql
└─ dist/                     written by `cleitext plugin:build`
```

`cleitext.plugin.json`:

```json
{
  "slug": "events",
  "name": "Events",
  "version": "1.0.0",
  "apiVersion": "^1.0",
  "description": "Events with RSVPs.",
  "author": "Your name",
  "homepage": "https://example.com/events",
  "license": "GPL-2.0-or-later",
  "server": "dist/server.js",
  "admin": "dist/admin.js",
  "requires": { "plugins": { "forms": "^1.0" } },
  "permissions": ["content:read", "content:write", "blocks", "routes:admin"],
  "capabilities": ["manage_events"]
}
```

| Campo                               | Obbligatorio | Descrizione                                                                                                                                                      |
| ----------------------------------- | :----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`                              |      ✅      | `^[a-z][a-z0-9-]{1,39}$`. Dà anche il nome allo schema del database (`plg_<slug>`, i trattini diventano `_`) e fa da prefisso ai tuoi blocchi e gruppi di campi. |
| `name`                              |      ✅      | Mostrato nell'admin.                                                                                                                                             |
| `version`                           |      ✅      | Versione semantica. L'installazione di una versione inferiore a quella già installata viene rifiutata.                                                           |
| `apiVersion`                        |      ✅      | Intervallo semver dell'API dei plugin che supporti, ad esempio `^1.0`.                                                                                           |
| `license`                           |      ✅      | Identificatore SPDX di una licenza compatibile con la GPL: `GPL-2.0-or-later`, `GPL-3.0-or-later`, `MIT`, `Apache-2.0`, `BSD-3-Clause`, `ISC`…                   |
| `server`                            |              | Percorso del punto di ingresso del server compilato. Il sorgente è lo stesso percorso sotto `src/` (`dist/server.js` ← `src/server.ts` o `.tsx`, `.js`).         |
| `admin`                             |              | Percorso del punto di ingresso dell'admin compilato, con la stessa regola.                                                                                       |
| `requires.plugins`                  |              | Plugin che devono essere installati (e attivi sul sito) prima: `{ "slug": "semver range" }`.                                                                     |
| `permissions`                       |              | Ciò che il plugin usa ([§12](#12-permessi)). Usare qualcosa che non è elencato lancia `PluginPermissionError`.                                                   |
| `capabilities`                      |              | Capability definite dal plugin ([§9](#capability)).                                                                                                              |
| `description`, `author`, `homepage` |              | Mostrati in Plugins.                                                                                                                                             |

## 3. Build, installazione, attivazione

```bash
cleitext plugin:build ./my-plugin             # bundles src/ into dist/
cleitext plugin:install ./my-plugin           # copies, runs migrations, registers
cleitext plugin:install ./my-plugin --build   # both
cleitext plugin:install ./my-plugin --link    # development: links the folder instead of copying it
cleitext plugin:list
cleitext plugin:uninstall my-plugin           # removes the plugin and ALL its data (asks first)
```

In una copia di lavoro di Cleitext, eseguili come `pnpm cleitext …`.

- I plugin installati si trovano in `PLUGINS_PATH` (predefinito `cleitext-data/plugins`). La versione precedente viene conservata accanto (`<slug>.previous`).
- I server in esecuzione **ricaricano automaticamente i plugin** dopo `plugin:install` e `plugin:uninstall`: non serve riavviarli.
- Poi, nell'admin, **Plugins → Activate** attiva il plugin per il sito corrente.
- Durante lo sviluppo, usa `--link`. Dopo `plugin:build`, installa di nuovo (con `--link` i file sono già al loro posto, quindi questo ricarica soltanto i server).

## 4. Il punto di ingresso del server

```tsx
import { definePlugin } from '@cleitext/plugin-sdk';

export default definePlugin({
  setup(ctx) {
    // Runs once when the server starts (and on every reload):
    // register hooks, content types, blocks, routes, settings, capabilities.
    ctx.log.info('Hello from my plugin');
  },
  async onActivate(site, ctx) {
    // When activated on a site. Throwing cancels the activation and shows
    // the message to the administrator.
  },
  async onDeactivate(site, ctx) {
    // When deactivated on a site. Data is kept.
  },
  async onUninstall({ plugin, log }) {
    // Before the plugin's schema and settings are deleted.
  },
});
```

`setup` si limita a **dichiarare** le cose. Non conosce i siti: ogni handler riceve il `siteId` per cui viene eseguito.

Il contesto `ctx` contiene:

| Membro                                                | Cosa fa                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ctx.plugin`                                          | `{ slug, version }`                                                                                        |
| `ctx.log`                                             | `debug/info/warn/error(message, data?)`, scritto nel log del server con il nome del plugin                 |
| `ctx.hooks`                                           | Azioni e filtri ([§5](#5-hook))                                                                            |
| `ctx.content`                                         | Tipi di contenuto, gruppi di campi, lettura delle voci ([§6](#6-tipi-di-contenuto-e-campi-personalizzati)) |
| `ctx.blocks`                                          | Blocchi ([§7](#7-blocchi))                                                                                 |
| `ctx.routes`                                          | Endpoint API e indirizzi pubblici ([§8](#8-route))                                                         |
| `ctx.settings`, `ctx.access`, `ctx.cache`, `ctx.mail` | [§9](#9-impostazioni-capability-cache-mail)                                                                |
| `ctx.db`                                              | Le tue tabelle ([§10](#10-le-tue-tabelle))                                                                 |

## 5. Hook

Come in WordPress: le **azioni** ti avvisano che qualcosa è successo, i **filtri** ti permettono di modificare un valore. Una `priority` più bassa viene eseguita prima (predefinita 10). Gli handler vengono eseguiti solo sui siti in cui il tuo plugin è attivo. Un errore in un handler viene registrato nel log e saltato. Per un filtro, questo significa che il valore prosegue invariato. Un handler che impiega più di 5 secondi viene abbandonato.

```ts
ctx.hooks.on('entry.published', async ({ entry }, { siteId }) => {
  ctx.log.info(`Published ${entry.title}`, { siteId });
});

ctx.hooks.filter(
  'render.head',
  (head, context) => ({
    ...head,
    tags: [
      ...(head.tags ?? []),
      { tag: 'meta', attrs: { name: 'generator', content: 'My plugin' } },
    ],
  }),
  { priority: 20 },
);
```

**Azioni** (vengono eseguite dopo che la modifica è stata salvata):

| Nome                                      | Payload                                  |
| ----------------------------------------- | ---------------------------------------- |
| `entry.created` · `entry.saved`           | `{ entry }`                              |
| `entry.published` · `entry.unpublished`   | `{ entry }`                              |
| `entry.trashed` · `entry.deleted`         | `{ entry }`                              |
| `media.uploaded`                          | `{ media: { id, mime, filename, url } }` |
| `plugin.activated` · `plugin.deactivated` | `{ plugin }` (slug)                      |

`entry` è `{ id, siteId, type, locale, slug, title, status, translationGroup, fields }`. Le voci programmate pubblicate automaticamente non emettono ancora `entry.published`.

**Filtri** (sito pubblico, richiedono il permesso `theme:hooks`):

| Nome                       | Valore                                                                  | Contesto                        |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| `render.head`              | `HeadData`: `title`, `description`, `canonical`, `og`, `robots`, `tags` | `RenderHookContext`             |
| `render.blocks`            | i blocchi della voce (`CxdBlock[]`)                                     | `RenderHookContext` con `entry` |
| `render.html`              | la stringa HTML finale                                                  | `RenderHookContext`             |
| `theme.templateCandidates` | nomi dei template provati in ordine                                     | `RenderHookContext`             |

`RenderHookContext` è `{ siteId, locale, route, path, entry?, tag(tag) }`. `route` è `entry`, `archive`, `search`, `404` o `maintenance`. `entry` è la voce pubblica: `{ id, type, title, url, fields, document, terms, … }`. Chiama `tag('type:event')` quando ciò che aggiungi dipende da altri dati (vedi [cache](#cache)).

`head.tags` aggiunge tag a `<head>`: `{ tag: 'meta', attrs }`, `{ tag: 'link', attrs }` oppure `{ tag: 'json-ld', data }` (dati strutturati, serializzati in modo sicuro).

**I tuoi hook.** Dichiarali con il declaration merging di TypeScript ed emettili con `ctx.hooks.emit` (i nomi devono iniziare con il tuo slug). Gli altri plugin li ascoltano con `ctx.hooks.on`:

```ts
declare module '@cleitext/plugin-sdk' {
  interface Actions {
    'events.rsvp': { eventId: string; email: string };
  }
}
await ctx.hooks.emit('events.rsvp', { eventId, email }, { siteId });
```

## 6. Tipi di contenuto e campi personalizzati

```ts
ctx.content.registerType({
  slug: 'event',
  name: { en: 'Events', it: 'Eventi' },
  permalink: '/events/{slug}', // default /<type>/{slug}; also {year}, {month}, {path}
  hierarchical: false,
  fields: [
    { name: 'startsAt', type: 'date', label: { en: 'Date', it: 'Data' }, required: true },
    { name: 'venue', type: 'text', label: 'Venue', maxLength: 200 },
  ],
});
```

- Il tipo compare nella barra laterale dell'admin, con i soliti elenco, editor, revisioni, traduzioni e programmazione. I campi compaiono nella barra laterale dell'editor sotto **Details** ([tipi di campo](#14-riferimento-tipi-di-campo)).
- I valori dei campi vengono validati al salvataggio. I campi `required` vengono controllati alla pubblicazione, quindi una bozza può essere incompleta.
- Le voci vengono mostrate con i template del tema. Per aggiungere qualcosa alla loro pagina, usa il filtro `render.blocks` (ad esempio un riquadro con la data) e `render.head` (dati strutturati).

I **gruppi di campi** aggiungono campi a tipi esistenti. I valori vengono salvati in `fields[<id>]`, e l'id deve iniziare con il tuo slug:

```ts
ctx.content.registerFieldGroup({
  id: 'seo',
  title: 'SEO',
  types: ['page', 'article'],
  fields: [
    { name: 'description', type: 'text', label: 'Description', multiline: true, maxLength: 160 },
  ],
});
// later, in a filter: context.entry?.fields.seo?.description
```

**Lettura delle voci** (`content:read`). Le più recenti vengono per prime, e vengono restituite solo le voci pubblicate a meno di `status: 'any'`:

```ts
const events = await ctx.content.find(siteId, { type: 'event', locale: 'en', limit: 20 });
const one = await ctx.content.get(siteId, id); // any status, or null
// { id, type, locale, slug, title, status, url, publishedAt, fields }
```

## 7. Blocchi

Un blocco ha **attributi descritti tramite campi**. Ogni editor costruisce da questi il modulo di modifica (in Gutenberg, un modulo all'interno del blocco). Poi il server lo renderizza con la tua funzione `render`. Richiede il permesso `blocks`.

```tsx
import { defineBlock, type PluginEntry } from '@cleitext/plugin-sdk';

ctx.blocks.register(
  defineBlock<{ heading: string; limit: number }, PluginEntry[]>({
    type: 'events/upcoming', // <slug>/<name>
    title: { en: 'Upcoming events', it: 'Prossimi eventi' },
    description: 'The next events, by date.',
    icon: 'calendar', // a Dashicon name
    category: 'widgets',
    attributes: [
      { name: 'heading', type: 'text', label: 'Heading', default: 'Upcoming events' },
      { name: 'limit', type: 'number', label: 'How many', min: 1, max: 20, default: 3 },
    ],
    async load(attrs, context) {
      context.tag('type:event'); // refresh the page when events change
      const events = await ctx.content.find(context.siteId, {
        type: 'event',
        locale: context.locale,
      });
      return events.slice(0, attrs.limit);
    },
    render({ attrs, data }) {
      return (
        <section>
          <h2>{attrs.heading}</h2>
          <ul>
            {data.map((e) => (
              <li key={e.id}>
                <a href={e.url}>{e.title}</a>
              </li>
            ))}
          </ul>
        </section>
      );
    },
  }),
);
```

- `load` viene eseguita prima del rendering e può essere asincrona. `render` è sincrona e restituisce elementi React. Non c'è JavaScript lato client.
- L'output viene racchiuso in `<div class="wp-block-events-upcoming">`: dai stile al tuo markup dal tema o con un elemento `<style>` in `render`.
- Gli attributi ricevono i loro valori `default`. Un blocco che lancia un errore (in `load` o `render`) non renderizza nulla, e la pagina viene comunque servita.
- Quando il plugin è inattivo, i suoi blocchi restano nel contenuto ma non renderizzano nulla. L'editor li mostra come _non disponibili_ e li mantiene invariati.

## 8. Route

**Endpoint API** (`routes:admin`), serviti su `/api/v1/ext/<slug><path>`:

```ts
ctx.routes.api({
  method: 'GET',
  path: '/events/:id/rsvps',
  capability: 'manage_events', // signed-in users with this capability
  async handler(request) {
    return { body: await listRsvps(request.siteId, request.params.id) };
  },
});

ctx.routes.api({
  method: 'POST',
  path: '/rsvp',
  public: true, // anonymous; the Origin header must be the site
  async handler(request) {
    const { email } = request.body as { email: string };
    return { status: 201, body: { ok: true } };
  },
});
```

Senza `public`, l'utente deve aver effettuato l'accesso. Le richieste che modificano dati (`POST`, `PUT`, `PATCH`, `DELETE`) richiedono il token CSRF. `api` e `pluginApi` dell'SDK dell'admin lo inviano al posto tuo.

**Indirizzi pubblici** (`routes:public`), sul sito stesso, valutati prima dei permalink:

```ts
ctx.routes.public({
  method: 'GET',
  path: '/events.ics',
  async handler(request) {
    return {
      body: buildCalendar(),
      contentType: 'text/calendar; charset=utf-8',
      cacheTags: ['type:event'],
    };
  },
});
```

Le route pubbliche `POST` ricevono gli invii di moduli HTML (`application/x-www-form-urlencoded`, convertiti in un oggetto) e vengono rifiutate quando l'`Origin` è un altro sito. I percorsi che iniziano con `/api`, `/admin`, `/media` e `/__preview` sono riservati.

`request` è `{ siteId, method, path, params, query, body, ip, user, headers }`. `user` è `{ id, displayName, capabilities }` oppure `null`. L'handler restituisce `{ status?, body?, contentType?, headers?, cacheTags? }`: un `body` stringa viene inviato così com'è, qualsiasi altra cosa come JSON. Per un reindirizzamento, restituisci `{ status: 303, headers: { location: '/thanks' } }`.

## 9. Impostazioni, capability, cache, mail

### Impostazioni

`settings:own`. Si dichiarano con dei campi; l'admin mostra il modulo sotto **Settings**, per singolo sito.

```ts
ctx.settings.define(
  [{ name: 'recipient', type: 'text', label: 'Send RSVPs to', help: 'An email address' }],
  { title: 'Events', capability: 'manage_events' }, // default capability: manage_settings
);
const { recipient } = await ctx.settings.get(siteId); // with defaults
```

### Capability

Dichiara la capability nel manifest, poi assegnala ai ruoli:

```ts
ctx.access.defineCapability('manage_events', {
  label: 'Manage events',
  roles: ['administrator', 'editor'],
});
```

I super admin hanno tutte le capability. Usa le capability nelle route (`capability`) e nelle pagine dell'admin (`capability`).

### Cache

Le pagine pubbliche sono in cache e vengono aggiornate tramite **tag**. Le pagine che mostrano una voce hanno i tag `entry:<id>` e `type:<type>`, i menu hanno `menus:<locale>`, e ogni pagina ha `site`. La pubblicazione di contenuti e la modifica delle impostazioni invalidano automaticamente i tag giusti. Nel tuo codice:

- aggiungi tag a ciò che renderizzi: `context.tag('type:event')` nei blocchi e nei filtri, `cacheTags` nelle route pubbliche;
- invalida i tag quando cambiano i tuoi dati: `await ctx.cache.invalidate(siteId, ['type:event'])`.

### Mail

`mail:send`: `await ctx.mail.send({ to, subject, text, replyTo? })`, inviata con le impostazioni di posta del server.

## 10. Le tue tabelle

Le tabelle si trovano nello schema PostgreSQL del plugin, `plg_<slug>`. Vengono create da migrazioni SQL in `migrations/`, chiamate `NNNN_description.sql` ed eseguite in ordine quando il plugin viene installato o aggiornato:

```sql
-- migrations/0001_rsvps.sql
CREATE TABLE rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  event_id uuid NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Every table with site data needs site_id and this line (Row Level Security):
SELECT cleitext_enable_tenant_rls('rsvps');
```

- Non modificare una migrazione dopo che è stata installata: Cleitext rifiuta di installare una migrazione modificata. Aggiungi invece una nuova migrazione.
- Le query vengono eseguite con un ruolo PostgreSQL dedicato al tuo plugin. Quel ruolo può usare solo lo schema `plg_<slug>`, e la Row Level Security limita le righe al sito corrente. Le tabelle del core non sono raggiungibili: usa le API del contesto.

Esegui le query con Drizzle (condiviso con Cleitext):

```ts
import { eq } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const rsvps = pgTable('rsvps', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  eventId: uuid('event_id').notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

await ctx.db.transaction(siteId, (tx) => tx.insert(rsvps).values({ siteId, eventId, email }));
const rows = await ctx.db.transaction(siteId, (tx) =>
  tx.select().from(rsvps).where(eq(rsvps.eventId, id)),
);
```

Passa sempre `siteId` negli inserimenti: il database rifiuta le righe di un altro sito.

## 11. Il punto di ingresso dell'admin

Il punto di ingresso dell'admin aggiunge pagine all'amministrazione. Sono elencate nella barra laterale e servite su `/admin/ext/<slug>/<path>`:

```tsx
import { Button, Card, defineAdminPlugin, type AdminPageProps } from '@cleitext/admin-sdk';
import { useQuery } from '@tanstack/react-query';

function RsvpsPage({ api, site }: AdminPageProps) {
  const rsvps = useQuery({
    queryKey: ['events', 'rsvps'],
    queryFn: () => api<Rsvp[]>('GET', '/rsvps'),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">RSVPs</h1>
      <Card>{/* … */}</Card>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: 'rsvps',
      title: { en: 'RSVPs', it: 'Prenotazioni' },
      capability: 'manage_events',
      component: RsvpsPage,
    },
  ],
});
```

- Props della pagina: `plugin`, `site` (`id`, `name`, `defaultLocale`, `locales`), `user` (`id`, `displayName`, `locale`, `capabilities`) e `api`, che chiama i tuoi endpoint (`api('GET', '/rsvps')` → `/api/v1/ext/<slug>/rsvps`).
- `menu: false` nasconde una pagina dalla barra laterale. `capability` la nasconde agli utenti che non hanno quella capability.
- Da `@cleitext/admin-sdk` ottieni `Button`, `Card`, `TextField`, `Alert`, `FieldsForm` (un modulo generato dalle definizioni dei campi), `api` (l'API del core), `pluginApi`, `ApiError`, `errorMessage` e `labelText`. Usali insieme alle loro classi Tailwind, oppure usa stili inline. Le tue classi Tailwind non vengono compilate.
- `@tanstack/react-query` è disponibile, con il query client dell'admin.
- Una pagina che va in crash mostra un messaggio di errore; il resto dell'admin continua a funzionare.

### Moduli condivisi

Questi import sono forniti da Cleitext a runtime e non finiscono nel bundle. Non installarne altre versioni:

| Punto di ingresso del server                                                                      | Punto di ingresso dell'admin                                                              |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@cleitext/plugin-sdk`, `react`, `react/jsx-runtime`, `zod`, `drizzle-orm`, `drizzle-orm/pg-core` | `@cleitext/admin-sdk`, `react`, `react/jsx-runtime`, `react-dom`, `@tanstack/react-query` |

Qualsiasi altra dipendenza (installata nei `node_modules` del tuo plugin) viene inclusa nel bundle da `plugin:build`.

**Tipi.** Per il controllo dei tipi e il supporto nell'editor di codice, aggiungi come dipendenze di sviluppo i pacchetti SDK della tua versione di Cleitext (`@cleitext/plugin-sdk`, `@cleitext/admin-sdk`, i tipi di `react`). Finché non saranno pubblicati, installali da una copia di lavoro di Cleitext (`npm install --save-dev /path/to/cleitext/packages/plugin-sdk`). Non servono per la build: `plugin:build` li risolve da sé.

## 12. Permessi

| Permesso        | Consente                                          |
| --------------- | ------------------------------------------------- |
| `content:read`  | `ctx.content.find` / `get`                        |
| `content:write` | `ctx.content.registerType` / `registerFieldGroup` |
| `blocks`        | `ctx.blocks.register`                             |
| `routes:admin`  | `ctx.routes.api`                                  |
| `routes:public` | `ctx.routes.public`                               |
| `settings:own`  | `ctx.settings.define` / `get`                     |
| `theme:hooks`   | filtri `render.*` e `theme.*`                     |
| `mail:send`     | `ctx.mail.send`                                   |
| `media:read`    | riservato all'API dei media                       |

Gli amministratori vedono i permessi richiesti in **Plugins → Details**. Le tue tabelle (`ctx.db`), gli hook sulle azioni, il logging, le capability e l'invalidazione della cache non richiedono permessi.

## 13. Disattivazione, aggiornamenti, disinstallazione, errori

- La **disattivazione** (per singolo sito) non deve mai rompere il sito. I tipi di contenuto spariscono dall'admin, le loro voci non vengono più servite (404, tranne che per le anteprime degli utenti autenticati) e i link verso di esse escono dai menu. I blocchi non renderizzano nulla, le route rispondono 404, i filtri si fermano. **I dati vengono conservati**: riattivando il plugin torna tutto come prima.
- **Aggiornamenti**: installa la nuova versione con `plugin:install`. Le nuove migrazioni vengono eseguite, i server in esecuzione si ricaricano e i file precedenti vengono conservati in `<slug>.previous`.
- La **disinstallazione** (`plugin:uninstall`, su tutti i siti) esegue `onUninstall`, poi elimina lo schema `plg_<slug>`, il ruolo del plugin e le impostazioni del plugin. Le voci dei suoi tipi di contenuto restano nel database e ricompaiono se il plugin viene installato di nuovo.
- **Errori**: un plugin che non riesce a caricarsi viene mostrato in Plugins con il suo errore, e il resto del sito funziona. Gli errori e il tempo trascorso negli hook sono elencati in **Plugins → Details → Activity**.

## 14. Riferimento: tipi di campo

Usati dai campi dei tipi di contenuto, dai gruppi di campi, dagli attributi dei blocchi e dalle impostazioni.

| `type`     | Valore              | Opzioni                                                 |
| ---------- | ------------------- | ------------------------------------------------------- |
| `text`     | stringa             | `maxLength`, `multiline`, `default`                     |
| `url`      | stringa             | `default`. Accetta `http(s)://`, `/`, `mailto:`, `tel:` |
| `number`   | numero              | `min`, `max`, `step`, `default`                         |
| `boolean`  | booleano            | `default`                                               |
| `date`     | `YYYY-MM-DD`        | `default`                                               |
| `datetime` | ISO 8601            | `default`                                               |
| `select`   | stringa             | `options: [{ value, label }]`, `default`                |
| `media`    | id del media (uuid) | un'immagine della libreria media                        |

Opzioni comuni: `name` (lettere, cifre, `_`), `label`, `help` e `required`. Le etichette sono stringhe oppure oggetti per lingua (`{ en: 'Date', it: 'Data' }`). Un campo facoltativo può essere vuoto (`null`).
