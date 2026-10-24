# Sviluppare plugin per Cleitext

> 🇬🇧 Versione di riferimento in inglese: [docs/PLUGINS.md](../PLUGINS.md). Questa traduzione è secondaria e può essere meno aggiornata.

> API dei plugin **1.0**

Un plugin estende Cleitext come un plugin di WordPress estende WordPress. Può aggiungere tipi di contenuto con campi personalizzati, blocchi, pagine all'amministrazione, impostazioni, endpoint, indirizzi sul sito pubblico e tabelle proprie nel database, e può reagire a ciò che accade tramite gli hook.

Questa guida è tutto ciò che ti serve per scriverne uno. Un esempio completo si trova in [`examples/plugin-events`](../../examples/plugin-events): un plugin _Events_ con un tipo di contenuto, un blocco, una pagina di amministrazione e una tabella propria. Il più piccolo è il plugin ufficiale [`plugins/hi-john`](../../plugins/hi-john), l'Hello Dolly di Cleitext: un solo ingresso nell'admin con un riquadro in bacheca, niente codice server, nessun permesso.

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
15. [Lingue (plugin delle lingue)](#15-lingue-plugin-delle-lingue)

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

| Campo                               | Obbligatorio | Descrizione                                                                                                                                                                      |
| ----------------------------------- | :----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`                              |      ✅      | `^[a-z][a-z0-9-]{1,39}$`. Dà anche il nome allo schema del database (`plg_<slug>`, i trattini diventano `_`) e fa da prefisso ai tuoi blocchi e gruppi di campi.                 |
| `name`                              |      ✅      | Mostrato nell'admin.                                                                                                                                                             |
| `version`                           |      ✅      | Versione semantica. L'installazione di una versione inferiore a quella già installata viene rifiutata.                                                                           |
| `apiVersion`                        |      ✅      | Intervallo semver dell'API dei plugin che supporti, ad esempio `^1.0`.                                                                                                           |
| `license`                           |      ✅      | Identificatore SPDX di una licenza compatibile con la GPL: `GPL-2.0-or-later`, `GPL-3.0-or-later`, `MIT`, `Apache-2.0`, `BSD-3-Clause`, `ISC`…                                   |
| `server`                            |              | Percorso del punto di ingresso del server compilato. Il sorgente è lo stesso percorso sotto `src/` (`dist/server.js` ← `src/server.ts` o `.tsx`, `.js`).                         |
| `admin`                             |              | Percorso del punto di ingresso dell'admin compilato, con la stessa regola.                                                                                                       |
| `public`                            |              | Cartella dei file per il sito pubblico, per esempio `dist/public` (§9, Script e stili pubblici).                                                                                 |
| `requires.plugins`                  |              | Plugin che devono essere installati (e attivi sul sito) prima: `{ "slug": "semver range" }`.                                                                                     |
| `conflicts`                         |              | Plugin che non possono essere attivi sullo stesso sito, es. `["seo"]` per un altro plugin SEO (API 1.24). Attivarne uno mentre l'altro è attivo non riesce, in entrambi i sensi. |
| `permissions`                       |              | Ciò che il plugin usa ([§12](#12-permessi)). Usare qualcosa che non è elencato lancia `PluginPermissionError`.                                                                   |
| `capabilities`                      |              | Capability definite dal plugin ([§9](#capability)).                                                                                                                              |
| `description`, `author`, `homepage` |              | Mostrati in Plugins.                                                                                                                                                             |

## 3. Build, installazione, attivazione

```bash
cleitext plugin:build ./my-plugin             # bundles src/ into dist/
cleitext plugin:install ./my-plugin           # copies, runs migrations, registers
cleitext plugin:install ./my-plugin --build   # both
cleitext plugin:install ./my-plugin --link    # development: links the folder instead of copying it
cleitext plugin:install ./my-plugin --required  # obbligatorio: sempre attivo su tutti i siti
cleitext plugin:list
cleitext plugin:deactivate my-plugin --site blog  # lo spegne su un sito, dati conservati (anche --network)
cleitext plugin:uninstall my-plugin           # removes the plugin and ALL its data (asks first)
```

In una copia di lavoro di Cleitext, eseguili come `pnpm cleitext …`.

- I plugin installati si trovano in `PLUGINS_PATH` (predefinito `cleitext-data/plugins`). La versione precedente viene conservata accanto (`<slug>.previous`).
- I server in esecuzione **ricaricano automaticamente i plugin** dopo `plugin:install` e `plugin:uninstall`: non serve riavviarli.
- Poi, nell'admin, **Plugins → Activate** attiva il plugin per il sito corrente. I super admin possono anche **attivarlo su tutti i siti** (attivazione di rete) ed **eliminare** un plugin non attivo su nessun sito: come `plugin:uninstall`, rimuove il plugin con TUTTI i suoi dati, dopo una conferma.
- I super admin possono installare un plugin già compilato dall'admin (**Plugins → Carica plugin**, un `.zip` o `.tgz` della cartella del plugin). Il server può disattivarlo con `PLUGINS_INSTALL_FROM_UI=false`. Con `plugin:install --required` il plugin diventa obbligatorio: sempre attivo su tutti i siti.
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
| `ctx.apiVersion`                                      | L'API dei plugin del core, per esempio `1.44.0` (API 1.41; manca sui core più vecchi)                      |
| `ctx.log`                                             | `debug/info/warn/error(message, data?)`, scritto nel log del server con il nome del plugin                 |
| `ctx.hooks`                                           | Azioni e filtri ([§5](#5-hook))                                                                            |
| `ctx.content`                                         | Tipi di contenuto, gruppi di campi, lettura delle voci ([§6](#6-tipi-di-contenuto-e-campi-personalizzati)) |
| `ctx.blocks`                                          | Blocchi ([§7](#7-blocchi))                                                                                 |
| `ctx.routes`                                          | Endpoint API e indirizzi pubblici ([§8](#8-route))                                                         |
| `ctx.settings`, `ctx.access`, `ctx.cache`, `ctx.mail` | [§9](#9-impostazioni-capability-cache-mail)                                                                |
| `ctx.db`                                              | Le tue tabelle ([§10](#10-le-tue-tabelle))                                                                 |
| `ctx.users`                                           | I membri del sito, in sola lettura ([§9](#membri-del-sito-api-dei-plugin-142), API 1.42)                   |

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

| Nome                                      | Payload                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entry.created` · `entry.saved`           | `{ entry }`                                                                                                                                          |
| `entry.published` · `entry.unpublished`   | `{ entry }`                                                                                                                                          |
| `entry.trashed` · `entry.deleted`         | `{ entry }`                                                                                                                                          |
| `entry.copied`                            | `{ entry, from: { id, locale } }` (API 1.21; vedi sotto)                                                                                             |
| `term.created` · `term.deleted`           | `{ term }`                                                                                                                                           |
| `media.uploaded`                          | `{ media: { id, mime, filename, url } }`                                                                                                             |
| `languages.pending`                       | `{}` (sono arrivati [dati linguistici](#15-lingue-plugin-delle-lingue))                                                                              |
| `plugin.activated` · `plugin.deactivated` | `{ plugin }` (slug)                                                                                                                                  |
| `cache.invalidated`                       | `{ tags }`: sono cambiate le pagine con questi tag (`site`: tutte), API 1.9                                                                          |
| `user.registered`                         | `{ user: { id, email, displayName } }`, API 1.12                                                                                                     |
| `comment.created`                         | `{ comment }`, qualunque sia il suo stato, API 1.12                                                                                                  |
| `comment.status`                          | `{ comment, from }`: approvato, trattenuto, spam o cestinato, API 1.12                                                                               |
| `request.notFound`                        | `{ path, query, referrer, userAgent }`: un visitatore ha avuto una pagina “non trovata”, anche dalla cache delle pagine (dopo la risposta), API 1.24 |
| `form.released`                           | `{ form, locale, fields }`: un invio trattenuto come spam è stato rilasciato come non spam; il plugin che possiede `form` lo consegna, API 1.45      |

`entry` è `{ id, siteId, type, locale, slug, title, status, fields }`, più (API 1.13), quando la modifica li conosce, `terms` (id dei termini per slug di tassonomia) e `featuredMediaId`, così un plugin può tenere aggiornata la sua copia delle voci; `term` è `{ id, siteId, taxonomy, locale, slug, name }`, `comment` è `{ id, entryId, parentId, type, status, userId, authorName, authorEmail, content }`. Le voci programmate pubblicate automaticamente non emettono ancora `entry.published`. `term.created` viene emesso per i termini creati dalla schermata dei termini, dall'API e dai plugin (non per i tag digitati nell'editor).

**Filtri** (sito pubblico, richiedono il permesso `theme:hooks`):

| Nome                       | Valore                                                                                                                                                                                    | Contesto                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `render.head`              | `HeadData`: `title`, `description`, `canonical`, `og`, `robots`, `tags`                                                                                                                   | `RenderHookContext`                                    |
| `render.blocks`            | i blocchi della voce (`CxdBlock[]`)                                                                                                                                                       | `RenderHookContext` con `entry`                        |
| `render.html`              | la stringa HTML finale                                                                                                                                                                    | `RenderHookContext`                                    |
| `render.adminBarEdit`      | il link di modifica della barra pubblica su una voce, `{ label, href }` (un indirizzo dell'admin), o `null` per nasconderlo, es. «Modifica con …» (API 1.29)                              | `{ siteId, locale, entry: { id, type, editor? } }`     |
| `render.maintenance`       | la pagina che i visitatori ricevono in modalità manutenzione: `{ html, retryAfter? }` (un documento intero) al posto di quella del tema, o `null` (API 1.35)                              | `MaintenanceContext`                                   |
| `form.challenge`           | markup inserito in un modulo prima del pulsante di invio, ad esempio il widget di un captcha; aggiungilo al valore (richiede `forms:protect`, API 1.38)                                   | `FormChallengeContext`                                 |
| `form.verify`              | `{ ok, message? }` per un invio di un modulo protetto, oppure `null` per lasciarlo passare (richiede `forms:protect`, API 1.38)                                                           | `FormVerifyContext`                                    |
| `form.sources`             | origini che servono alla verifica dell'accesso all'admin, `{ script, frame }` (solo `https://`), aggiunte alla Content Security Policy dell'admin (richiede `forms:protect`, API 1.38)    | `{ siteId }`                                           |
| `theme.templateCandidates` | nomi dei template provati in ordine                                                                                                                                                       | `RenderHookContext`                                    |
| `entry.states`             | etichette accanto ai titoli delle voci nell'admin (`{ key, label }` per id); nessun permesso                                                                                              | `{ siteId, ids }`                                      |
| `account.links`            | link nella pagina account dei visitatori (`{ label, url }[]`, indirizzi locali; API 1.17)                                                                                                 | `{ siteId, locale, userId, base }`                     |
| `import.block`             | un blocco WordPress senza equivalente all'import: al suo posto i blocchi del plugin (API 1.23)                                                                                            | `{ siteId, name, attrs, html, children }`              |
| `import.shortcode`         | uno shortcode WordPress isolato all'import (su una riga o in un paragrafo a sé, blocco Shortcode, widget shortcode/testo/HTML di Elementor): al suo posto i blocchi del plugin (API 1.36) | `{ siteId, tag, attrs, content, text }`                |
| `import.pluginData`        | i dati del plugin in un documento importato (`document.plugins[slug]`): `{ warnings? }` se li prende, altrimenti `null` (API 1.28)                                                        | `{ siteId, slug, data, idMap, userId }`                |
| `feed.title`               | titolo di un feed RSS (quello del sito, o `<termine> – <sito>`; API 1.22)                                                                                                                 | `{ siteId, locale, siteTitle, term }`                  |
| `sitemap.sources`          | tipi di contenuto e tassonomie con una sitemap XML (`{ kind, slug }[]`)                                                                                                                   | `{ siteId }`                                           |
| `sitemap.urls`             | gli indirizzi di una sitemap (`loc`, `lastmod`, `images`, `alternates`, `entry` o `term`)                                                                                                 | `{ siteId, kind, slug, locale }`                       |
| `cache.headers`            | header in più delle risposte pubbliche tenute dalla cache delle pagine, API 1.9                                                                                                           | `{ siteId, host, path, status, tags }`                 |
| `robots.txt`               | il testo di `/robots.txt`, con la sua riga `Sitemap:`; nessun permesso. Un sito che chiede ai motori di restare fuori tiene `Disallow: /` (API 1.24)                                      | `{ siteId, origin, sitemap, discourageSearchEngines }` |

`RenderHookContext` è `{ siteId, locale, route, path, entry?, signedIn?, tag(tag) }`. `route` è `entry`, `archive`, `search`, `404` o `maintenance`. `entry` è la voce pubblica: `{ id, type, title, url, fields, document, terms, … }`. `signedIn` (API dei plugin 1.33) è `true` quando il visitatore ha effettuato l'accesso: le sue pagine non vanno mai in cache, quindi il contenuto può dipenderne. Chiama `tag('type:event')` quando ciò che aggiungi dipende da altri dati (vedi [cache](#cache)).

**Cache davanti a Cleitext** (API dei plugin 1.9). `cache.headers` aggiunge header alle risposte pubbliche che la cache delle pagine tiene (mai a chi ha fatto il login): calcolati una volta, salvati con la pagina e inviati a ogni hit, per esempio un `Cache-Control` con `s-maxage` e i tag della pagina per Varnish o una CDN. `cache.invalidated` viene emesso una volta per modifica, fuori dalla transazione che l’ha fatta, con i tag delle pagine cambiate: svuotale lì. Il plugin ufficiale **Cache esterna** fa entrambe le cose per Varnish e Cloudflare.

**Pagina di manutenzione** (API dei plugin 1.35). Quando un sito è in modalità manutenzione (**Impostazioni → Generali** o `cleitext site:maintenance`), i visitatori ricevono una pagina 503 e chi ha effettuato l'accesso continua a vedere il sito. `render.maintenance` sostituisce il template `maintenance` del tema: restituisci `{ html, retryAfter? }` e il core invia quel documento con stato 503, `Retry-After` (`retryAfter` secondi, 3600 se manca), `X-Robots-Tag: noindex` e senza cache; `null` (il valore di partenza) lascia la pagina al tema. Il contesto, `MaintenanceContext`, è `{ siteId, locale, defaultLocale, origin, path, site: { title, tagline, timezone, logoUrl?, iconUrl? }, preview? }`: `locale` è la lingua dell'indirizzo richiesto (altrimenti quella predefinita), `logoUrl` e `iconUrl` sono gli indirizzi assoluti delle impostazioni `logo` e `favicon` del tema quando ci sono, e `preview` vale `true` per l'anteprima di **Impostazioni → Generali** (`GET /api/v1/settings/maintenance/preview?locale=`), che mostra la pagina a un amministratore. La pagina viene inviata con la Content Security Policy pubblica: tieni gli stili in linea. Il plugin ufficiale **Manutenzione** la usa così:

```ts
ctx.hooks.filter(
  'render.maintenance',
  async (page, context) =>
    page ?? { html: myPage(context.locale, context.site), retryAfter: 2 * 3600 },
);
```

**Proteggere i moduli** (API dei plugin 1.38). Un solo plugin protegge dai bot tutti i moduli del sito, ad esempio con un captcha, e i moduli lo interpellano tramite il core invece di avere ciascuno le proprie chiavi. Ogni modulo ha un identificativo stabile: `core/login`, `core/register`, `core/lost-password`, `core/reset-password` e `core/comment` per quelli del core, e `core/admin-login`, `core/admin-lost-password` e `core/admin-reset-password` per l'accesso all'admin (solo il passaggio con la password: passkey, secondo fattore e token API non vengono mai interpellati), che lo interpellano da soli, e `<slug>/<modulo>` per quelli dei plugin, ad esempio `forms/<id del blocco>`, `shop/checkout`, `fresco-pro/form`, `prisma/form`. Un plugin di protezione (permesso `forms:protect`) risponde a due filtri:

- `form.challenge`: il markup da inserire nel modulo, prima del pulsante di invio (un widget e i suoi tag `<script>`). Il contesto, `FormChallengeContext`, è `{ siteId, form, locale, signedIn }`. Le pagine dei visitatori non connessi possono stare in cache, quindi il markup non deve dipendere da altro (niente token). Aggiungilo al valore: `''` non mostra nulla.
- `form.verify`: `{ ok: false, message }` rifiuta un invio, con un messaggio per il visitatore nella lingua `locale`; `{ ok: true }` oppure `null` lo lascia proseguire. Il contesto, `FormVerifyContext`, è `{ siteId, form, locale, fields, ip, host?, signedIn }`, dove `fields` sono i valori inviati insieme a quelli della verifica (ad esempio `cf-turnstile-response`) e `ip` è l'indirizzo del visitatore come lo vede il core (dietro un proxy imposta `TRUST_PROXY`). Mantieni un rifiuto dato prima del tuo e gestisci i tuoi errori: un handler che lancia un'eccezione o va in timeout (5 secondi) viene saltato.

Un plugin con moduli propri usa `ctx.forms` (nessun permesso): `await ctx.forms.challenge({ siteId, form, locale, signedIn })` restituisce il markup (nel `load` di un blocco, `context.signedIn` dice se il visitatore ha effettuato l'accesso) e `await ctx.forms.verify({ siteId, form, locale, fields, ip, host, signedIn })` restituisce `{ ok, message? }`, sempre `{ ok: true }` se nessun plugin protegge i moduli. Nei moduli del core un rifiuto compare come gli altri errori. Nel browser, un modulo inviato con JavaScript chiama `await window.cleitextChallenge?.prepare(form)` prima di leggere i campi (i captcha invisibili ottengono lì il token) e `window.cleitextChallenge?.reset(form)` dopo un invio rifiutato, perché i token valgono una volta sola; il markup aggiunto con `innerHTML` richiede di ricreare i suoi elementi `<script>`. Le schermate di accesso dell'admin ricevono il markup da `GET /api/v1/auth/challenge?form=<id>` e inviano i campi della verifica con la richiesta; un rifiuto è un 400 mostrato come gli altri errori di accesso. La Content Security Policy dell'admin non ammette altre origini, quindi il plugin elenca quelle che servono al suo widget con `form.sources` (nessuna se l'admin non è protetto). Il plugin ufficiale **Captcha** fornisce così Cloudflare Turnstile e Google reCAPTCHA. Chi resta chiuso fuori a causa di un plugin di protezione lo spegne con `cleitext plugin:deactivate <slug> --site <sito>`.

**Verdetti di spam** (API dei plugin 1.45). Oltre a rifiutare, `form.verify` può dire di più, così un filtro segna lo spam invece di respingerlo, scarta i bot in silenzio e lascia i casi dubbi a un captcha:

- `{ ok: true, spam: true, message? }`: l'invio è spam. Un modulo verificato con `hold: true` lo mette da parte e risponde al visitatore come se fosse andato a buon fine: il modulo dei commenti del core salva il commento con lo stato `spam` (a meno che chi commenta moderi i commenti o abbia scritto la voce), il plugin Moduli e il modulo di Prisma non inviano nulla. Gli altri moduli (registrazione, moduli senza `hold`) lo rifiutano con `message`.
- `{ ok: false, silent: true }`: lo scarta e risponde come se fosse andato a buon fine (bot evidenti): il modulo dei commenti dice che il commento attende la moderazione, la registrazione dice di controllare l'email.
- `{ ok: true, challenge: true }`: dubbio. Un plugin di captcha eseguito dopo (`priority` più alta) controlla l'invio e toglie `spam` se viene superato; se nessuno lo raccoglie, viene ignorato (e `spam`, se presente, resta). Un plugin di captcha che vuole prima la soluzione del visitatore risponde `{ ok: false, challenge: true, message }`: i moduli del core tornano allora alla pagina con `cl-challenge=<id del modulo>` nell'indirizzo (le risposte JSON hanno `challenge: true`) e lo script del captcha mostra il suo widget; i moduli inviati con JavaScript chiamano `window.cleitextChallenge?.require?.(form)` (oppure `reset(form)`, come dopo ogni rifiuto).

`ctx.forms.verify` passa questi flag ai moduli: `spam` solo con `hold: true` nell'input (altrimenti è un rifiuto), `silent` e `challenge` con `ok: false`. Un plugin di protezione che conserva gli invii trattenuti ne rilascia uno segnato come non spam con `ctx.forms.release({ siteId, form, locale, fields })` (permesso `forms:protect`): il core emette l'azione `form.released` e il plugin che possiede il modulo (il suo id comincia con il suo slug) lo consegna a partire da `fields`, che sono quelli dati a `verify`: mettici quello che serve alla consegna (ad esempio il percorso della pagina). Il plugin ufficiale **Antispam** funziona così, con Captcha mostrato solo quando è in dubbio (modalità “Solo quando Antispam ha dei dubbi” di Captcha).

**Posizioni del tema** (API dei plugin 1.11). `render.locations` permette a un theme builder di sostituire parti del tema: restituisci documenti CXD per `header`, `footer`, `single` (pagine delle voci), `archive` (archivi e ricerca) e `overlay` (popup e pannelli, aggiunti in fondo a ogni pagina con qualsiasi tema). Vengono disegnati come il contenuto, con blocchi dei plugin, media e pattern; i temi segnano i punti con `<Location>`. Nel template `single`, un blocco `cleitext/entry-content` mostra il contenuto della voce:

```ts
ctx.hooks.filter('render.locations', async (locations, context) =>
  context.route === 'entry' ? { ...locations, header: myHeader, single: mySingle } : locations,
);
```

Dall'API dei plugin 1.33, le chiavi `hook:<nome>` riempiono i punti di aggancio che un tema segna nel suo layout (ad esempio `hook:zenit_header_before` in Zenit). Non mostrano nulla finché un plugin non li riempie; i nomi che il tema non segna sono ignorati.

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

- `public: false` (API dei plugin 1.11) crea un tipo privato: le sue voci non hanno indirizzo pubblico e restano fuori da sitemap, ricerca e barra laterale dell'admin, per contenuti che il plugin usa da sé, come i modelli di un theme builder.
- Il tipo compare nella barra laterale dell'admin, con i soliti elenco, editor, revisioni, traduzioni e programmazione. I campi compaiono nella barra laterale dell'editor sotto **Details** ([tipi di campo](#14-riferimento-tipi-di-campo)).
- I valori dei campi vengono validati al salvataggio. I campi `required` vengono controllati alla pubblicazione, quindi una bozza può essere incompleta.
- Le voci vengono mostrate con i template del tema. Per aggiungere qualcosa alla loro pagina, usa il filtro `render.blocks` (ad esempio un riquadro con la data) e `render.head` (dati strutturati).

Le **tassonomie** (API dei plugin 1.13) raggruppano le voci dei tuoi tipi, come `register_taxonomy` di WordPress:

```ts
ctx.content.registerTaxonomy({
  slug: 'brand', // anche l'indirizzo dei suoi archivi: /brand/<termine>
  name: { en: 'Brands', it: 'Marchi' },
  hierarchical: false, // true: i termini hanno un genitore, come le categorie
  types: ['product'],
  fields: [
    { name: 'logo', type: 'media', label: 'Logo' },
    { name: 'website', type: 'url', label: 'Website' },
  ],
});
```

- Compare nell'admin sotto i suoi tipi, con il solito elenco dei termini; i suoi `fields` si modificano con ogni termine e vengono validati come i campi delle voci.
- I termini hanno un ordine manuale (`position`, poi il nome), impostato dall'API (`PATCH /api/v1/terms/:id`).
- Come i tipi, è nascosta finché il plugin non è attivo: termini e assegnazioni restano. Non si può eliminare dall'admin; una tassonomia con lo stesso slug creata nell'admin (o importata) viene presa in carico.

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

`types: ['*']` mostra il gruppo su tutti i tipi di contenuto, anche quelli di altri plugin (API 1.24).

**Lettura delle voci** (`content:read`). Le più recenti vengono per prime, e vengono restituite solo le voci pubblicate a meno di `status: 'any'`:

```ts
const events = await ctx.content.find(siteId, { type: 'event', locale: 'en', limit: 20 });
const one = await ctx.content.get(siteId, id); // any status, or null
// { id, type, locale, slug, title, status, url, publishedAt, fields, terms, featuredMediaId }
```

**Copia delle voci** (`content:write`). Una bozza con contenuto, campi, riassunto e immagine in evidenza, fatta per conto di un utente: valgono i suoi permessi e il registro attività lo riporta. In un'altra lingua, il genitore e i termini diventano le loro traduzioni, quando il plugin delle lingue le conosce:

```ts
const copy = await ctx.content.copy(siteId, id, { userId: request.user!.id, locale: 'it' });
```

Ogni copia, questa o il **Duplica** dell'admin, termina con l'azione `entry.copied` (API dei plugin 1.21): `entry` è la copia e `from` l'originale. I plugin che tengono dati propri delle voci li copiano lì: una traduzione ha un `locale` diverso da `from.locale`, un duplicato lo stesso. `ctx.content.translations(siteId, id)` (`content:read`) elenca le altre versioni di una voce, `[{ id, locale }]`, come le conosce il plugin delle lingue (nessuna senza): un negozio condivide così prezzi e scorte delle traduzioni di un prodotto.

**Aggiornare le voci** (`content:write`). `ctx.content.update(siteId, id, { title, excerpt, document, fields }, { userId })` salva una nuova revisione per conto di quell'utente (il documento viene validato come uno salvato dall'editor); `ctx.content.revision(siteId, id)` legge l'ultima versione salvata. `@cleitext/plugin-sdk` esporta anche `inlineToHtml` e `htmlToInline`, per lavorare sul testo ricco dei blocchi.

**Termini** (`content:read`, `content:write` per copiarli):

```ts
const terms = await ctx.terms.find(siteId, { taxonomy: 'category', locale: 'en' });
// { id, taxonomy, locale, slug, name, parentId, url, description, fields, position }
const copy = await ctx.terms.copy(siteId, id, {
  userId,
  locale: 'it',
  name: 'Viaggi',
  parentId: null,
});
```

Con `withCounts: true` (API dei plugin 1.22) ogni termine ha anche `count`, il numero delle sue voci pubblicate, per nuvole di tag ed elenchi di categorie.

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
- I blocchi vengono disegnati ovunque si trovino: nella voce, nelle aree a blocchi del tema e nei pattern sincronizzati.

**Contenitori, CSS e media** (API dei plugin 1.11). I page builder hanno bisogno di blocchi che ne contengono altri e che si danno uno stile da sé:

- `container: true`: il blocco può tenere altri blocchi in `children`. Cleitext li disegna e li passa a `render` come `children`.
- `wrapper: false`: toglie il `<div class="wp-block-…">` intorno al blocco. I contenitori non ce l'hanno.
- I contenitori e i blocchi senza wrapper vengono disegnati dentro la pagina, quindi il loro `render` non deve lanciare errori. Gli altri blocchi vengono prima disegnati a parte.
- `css`: restituisce il CSS di un'istanza. Il CSS di tutte le istanze della pagina va in un unico `<style data-cx-blocks>` nel `<head>`.
- `context.page` (anche in `load`) è la pagina che si sta disegnando: `route`, `site` (`title`, `tagline`, `home`), `params` (i parametri dell’indirizzo, per esempio un numero di pagina) e `entry` (la voce pubblica completa), `archive` (titolo, termine, voci, paginazione; `html` per gli elenchi dei plugin, API 1.20) o `search`, per i blocchi che mostrano i dati della pagina, come il titolo della voce o l'elenco di un archivio di un theme builder.
- API dei plugin 1.41: `context.page.site.logo` è il logo scelto nelle impostazioni del tema (`{ id, url, width, height, alt }`), quando c'è. `context.page.user` è il visitatore connesso (`{ id, displayName, avatarUrl, email?, role }`, dove `role` è `{ slug, name }` o null) e manca per tutti gli altri. Le pagine dei visitatori connessi (con una sessione o un token API) non vanno mai in cache, quindi un blocco può salutarli o mostrarne l'avatar; senza `user` non deve mostrare nulla di personale, perché la pagina va in cache ed è condivisa.
- `context.query({ type, terms, ids, exclude, orderBy, order, limit, offset })` in `load` (API plugin 1.11) elenca le voci pubblicate nella lingua della pagina, complete come le ricevono i temi (estratto, immagini, termini, campi), con il `total` per la paginazione; la pagina si aggiorna quando cambiano voci di quei tipi. `orderBy` è `date` (predefinito), `title`, `modified`, `random` o `order` (l'ordine manuale dell'admin, come il `menu_order` di WordPress, API 1.31); `terms` è `{ taxonomy, slugs }`; `limit` vale al massimo 100. Servono a loop, articoli correlati e portfolio.
- `context.menus` contiene i menu del sito nella lingua della pagina, per posizione del tema (`{ id, label, url, target?, current, children }`), per i blocchi di navigazione.
- `context.preview` (API dei plugin 1.36) vale `true` quando il blocco viene disegnato per l'anteprima di un editor (`POST /api/v1/blocks/preview`, es. il canvas di Fresco) e non per una pagina: un blocco il cui contenuto arriva da uno script (un widget di prenotazione) può mostrare lì un segnaposto.
- `items` (contenitori): ogni figlio disegnato a parte, per avvolgerli uno per uno (schede, accordion, caroselli).
- `html`: elenca gli attributi che contengono HTML libero; per gli autori senza `unfiltered_html` vengono ripuliti al salvataggio, come il blocco HTML personalizzato.
- `media`: elenca gli id dei media usati da un'istanza. Vengono precaricati in `context.media`, con `url`, dimensioni, `alt` e varianti ridimensionate (`variants`).
- API dei plugin 1.43: un attributo `list` (elementi con gli stessi campi, nessuna lista dentro una lista) si modifica nel modulo del blocco: gli elementi si aggiungono, si rimuovono, si spostano su e giù e si aprono uno alla volta; `itemLabel` indica il campo mostrato come titolo di ciascun elemento. Il valore è un array di oggetti. Sui core più vecchi l'editor a blocchi non lo mostra, quindi richiedi `"apiVersion": "^1.43"`. I campi personalizzati del plugin **Moduli** lo usano.

**Blocchi con un editor proprio** (API dei plugin 1.23). Per la maggior parte dei blocchi basta un modulo di campi. I blocchi di design chiedono di più: anteprima dal vivo nel canvas, impostazioni nella barra laterale, blocchi annidati. Un plugin così fornisce uno script per l'editor a blocchi e registra lui stesso i suoi blocchi in Gutenberg:

```json
{ "editor": "dist/editor.js", "public": "dist/public", "editorStyles": ["blocks.css"] }
```

`src/editor.tsx` chiama `registerBlockType` dei pacchetti `@wordpress/*` con un suo `edit` (`InspectorControls`, `RichText`, `InnerBlocks`…), come in WordPress. Sul server il blocco si dichiara con `schema: 'json'`: gli attributi sono quelli che l'editor salva (qualsiasi oggetto JSON, al massimo 64 KB). Ci sono poi `richAttributes`, per i testi modificati con `RichText` (salvati come nodi inline CXD: si mostrano con `inlineToHtml`), e `container: true` per `InnerBlocks`. L'esempio completo è nella guida inglese.

- Lo script importa `@wordpress/block-editor`, `blocks`, `components`, `compose`, `data`, `element`, `hooks`, `i18n`, `icons`, `keycodes`, `primitives` e `rich-text`, più React: `cleitext plugin:build` gli passa le istanze dell'editor, mai copie.
- `editorStyles` sono fogli di stile della cartella `public` caricati nel canvas dopo quelli del tema, così i blocchi appaiono come sul sito.
- Non si salva HTML: `save` non è usato. Gli attributi possono venire da qualsiasi versione dello script, quindi `render` non deve fidarsi: fai l'escape di ciò che stampa.
- Il dispositivo dell'anteprima è nello store `cleitext/editor`: `select('cleitext/editor').getDeviceType()` (`Desktop`, `Tablet`, `Mobile`) e `dispatch('cleitext/editor').setDeviceType('Tablet')`. Il canvas prende la larghezza del dispositivo, così le sue media query valgono; le impostazioni responsive dei blocchi dovrebbero mostrare e modificare il valore di quel dispositivo.
- Lo script gira nell'editor delle voci e nelle aree del tema. Senza (un errore, o il plugin spento) il blocco appare come non disponibile e il suo contenuto resta.

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

Le route pubbliche `POST` ricevono gli invii di moduli HTML (`application/x-www-form-urlencoded`, convertiti in un oggetto) e vengono rifiutate quando l'`Origin` è un altro sito. I percorsi che iniziano con `/api`, `/admin`, `/cl-admin`, `/media` e `/__preview` sono riservati.

`request` è `{ siteId, method, path, params, query, body, rawBody, ip, user, headers, cookies, locale }`. `user` è `{ id, displayName, capabilities }` oppure `null`; `rawBody` è il corpo così come è arrivato (un `Buffer`, per JSON e moduli) oppure `null`. L'handler restituisce `{ status?, body?, contentType?, headers?, cacheTags?, cookies?, page? }`: un `body` stringa o `Buffer` (API dei plugin 1.10) viene inviato così com'è, qualsiasi altra cosa come JSON. Per un reindirizzamento, restituisci `{ status: 303, headers: { location: '/thanks' } }`.

**Pagine nel tema e cookie** (API dei plugin 1.14). Una rotta pubblica può rispondere con `page: { title, html, description? }`: Cleitext mostra `html` (il markup del plugin) come contenuto di una pagina del tema attivo, con intestazione, menu e piè di pagina, non in cache e con `noindex`. Con `cacheTags` nella risposta (API 1.17) la pagina va in cache per i visitatori non connessi, come le pagine del tema; `index: true` la mostra ai motori di ricerca e `head` aggiunge tag come i dati strutturati (`{ tag: 'json-ld', data }`): il catalogo di un negozio, per esempio. Una rotta risponde anche dietro il prefisso di una lingua (`/cart` a `/it/cart`), e `request.locale` è la lingua dell'indirizzo. `request.queryAll` (API 1.17) contiene tutti i valori dei parametri ripetuti (`?brand=a&brand=b`), mentre `request.query` tiene l'ultimo. `request.origin` (API 1.16) è l'indirizzo del sito come lo ha raggiunto il visitatore, per i link nelle email; `ctx.site(siteId)` dà nome e lingue del sito e (API 1.37) `trailingSlash` quando i suoi indirizzi finiscono con la barra. `request.cookies` contiene solo i cookie del plugin, con nome `<slug>_…` (`-` nello slug diventa `_`); `cookies: [{ name, value, maxAge? }]` nella risposta li imposta, HTTP-only e `SameSite=Lax` (`maxAge: 0` ne elimina uno). Un carrello, per esempio:

```ts
ctx.routes.public({
  method: 'GET',
  path: '/cart',
  handler: async (request) => {
    const cart = await loadCart(request.siteId, request.cookies.shop_cart);
    return { page: { title: 'Carrello', html: renderCart(cart, request.locale) } };
  },
});
```

**Elenchi** (API dei plugin 1.20). Una pagina che elenca voci, come il catalogo di un negozio o una sua categoria, lo dichiara con `archive: { type?, term?: { taxonomy, slug, name, description? } }` in `page`. Gli hook vedono allora un archivio di quel tipo di contenuto o di quel termine (`route: 'archive'`): un theme builder vi applica i suoi modelli di archivio, e i blocchi trovano l'`html` del plugin in `context.page.archive.html`, da mostrare dove vanno le voci di un archivio.

**Chiamate da altri server** (API dei plugin 1.10): una rotta API con `webhook: true` è anonima e salta il controllo dell'origine, per i webhook dei pagamenti o per client come i siti Cleitext. La sessione viene ignorata anche se la richiesta porta un cookie, quindi l'handler deve verificare chi chiama, per esempio con una firma HMAC su `rawBody`:

```ts
ctx.routes.api({
  method: 'POST',
  path: '/webhooks/payments',
  webhook: true,
  async handler(request) {
    const secret = await ctx.secrets.get(request.siteId, 'webhookSecret');
    const expected = createHmac('sha256', secret ?? '')
      .update(request.rawBody ?? '')
      .digest('hex');
    if (!secret || request.headers['x-signature'] !== expected) return { status: 401 };
    return { body: { ok: true } };
  },
});
```

Il plugin ufficiale **Store** le usa per il server delle licenze dei temi a pagamento.

**Caricamenti** (API dei plugin 1.7): `await request.file()` restituisce il campo `file` di una richiesta `multipart/form-data` come `{ filename, mime, data }` (un `Buffer`), oppure `null`; i file oltre il limite del server (`MEDIA_MAX_BYTES`) ricevono un 413. Nell'admin, `uploadFile(file, { path: '/ext/<slug>/…', onProgress })` dell'admin SDK lo invia con il token CSRF e riporta l'avanzamento.

## 9. Impostazioni, capability, cache, mail

### Script e stili pubblici (API dei plugin 1.11)

I file per i visitatori (script, stili, font, immagini) vanno nella cartella indicata da `public` nel manifest, per esempio `dist/public`. `plugin:build` la riempie da `src/public`:

- ogni file `.ts`, `.tsx`, `.js` viene impacchettato con i suoi import e minificato (`.mts` diventa un modulo ES `.mjs`);
- i file `.css` vengono minificati;
- gli altri file vengono copiati;
- file e cartelle che iniziano con `_` servono solo agli import e non vengono pubblicati.

Sono serviti su `/plugin-assets/<slug>/<versione>/<file>`, con cache di un anno (la versione cambia l'indirizzo). Si aggiungono alle pagine con `ctx.assets` (serve `theme:hooks`):

```ts
// Solo nelle pagine che usano il widget del plugin.
ctx.assets.enqueue({ file: 'slider.js', when: ({ html }) => html.includes('my-slider') });
ctx.assets.enqueue({ file: 'slider.css', when: ({ html }) => html.includes('my-slider') });
const font = ctx.assets.url('fonts/icons.woff2'); // l'indirizzo, per il proprio markup
```

Gli stili vanno in fondo al `<head>`, gli script prima di `</body>` (`defer`, oppure `type="module"` per `.mjs`). `when` riceve il contesto dell'hook della pagina e il suo HTML finale.

I plugin seguono un ordine stabile (API dei plugin 1.42): un plugin dopo quelli che elenca in `requires.plugins`, gli altri per slug, e i file di ciascun plugin nell'ordine in cui li ha aggiunti. Così il foglio di stile di un'estensione si carica sempre dopo quello del plugin che estende e può sovrascriverlo a parità di specificità.

### Estendere le opzioni di un tema (API dei plugin 1.32)

Un plugin può aggiungere impostazioni, sezioni, elementi del costruttore di intestazione o piè di pagina, stili pronti e aree di blocchi a un tema, indicato per slug: un'estensione come la versione "Pro" del tema. Si chiama `ctx.themes.extend` in `setup` (serve `theme:hooks`):

```ts
ctx.themes.extend('zenit', {
  settingsSections: [{ id: 'pro-topbar', label: 'Barra superiore', parent: 'header' }],
  settings: [
    { name: 'topbarText', type: 'text', section: 'pro-topbar', label: 'Testo', default: '' },
    {
      name: 'topbarSticky',
      type: 'boolean',
      section: 'pro-topbar',
      label: 'Fissa',
      default: false,
    },
  ],
  // Elementi per i campi zones del tema, per nome del campo.
  zoneItems: {
    headerLayout: [{ name: 'topbar', label: 'Barra superiore', section: 'pro-topbar' }],
  },
  presets: [{ id: 'pro-dark', label: 'Scuro (Pro)', values: { topbarSticky: true } }],
  areas: { 'pro-topbar': 'Barra superiore' },
  areaDefaults: { 'pro-topbar': { schema: 1, blocks: [] } },
  // Opzioni delle voci di menu (API dei plugin 1.34), per esempio un mega menu.
  menuItemFields: [
    { field: { name: 'mega', type: 'boolean', label: 'Mega menu', default: false }, levels: 'top' },
  ],
});
```

- Vale nei siti in cui il tema è attivo e il plugin è attivo. **Aspetto → Personalizza** mostra i campi aggiunti insieme a quelli del tema, e i template del tema ricevono i loro valori con `useThemeSettings()`, controllati e con i predefiniti, come i propri; le aree aggiunte si modificano in **Aspetto → Aree**.
- Impostazioni, sezioni e stili pronti vanno dopo quelli del tema; `zoneItems` aggiunge elementi ai campi `zones` del tema (i nomi di campo sconosciuti sono ignorati); le aree si uniscono; `menuItemFields` (API dei plugin 1.34) vanno dopo le opzioni delle voci di menu del tema ([TEMI.md §4](TEMI.md)), compaiono in **Aspetto → Menu** e arrivano al tema in `MenuItemView.data`. Un'impostazione, sezione, elemento, stile pronto, area o opzione delle voci di menu con un nome già usato dal tema viene ignorato, con un avviso nel log.
- Cosa fare dei valori lo decide il tema: un'estensione è pensata per un tema che li legge (per esempio per nome, `settings.topbarText`) o che disegna i suoi elementi e le sue aree.
- Quando il plugin viene disattivato i suoi campi escono da Personalizza (e le sue opzioni delle voci di menu da Menu) e i suoi valori non arrivano più al tema, ma restano salvati e tornano quando lo si riattiva.

### Impostazioni

`settings:own`. Si dichiarano con dei campi; l'admin mostra il modulo sotto **Settings**, per singolo sito.

```ts
ctx.settings.define(
  [{ name: 'recipient', type: 'text', label: 'Send RSVPs to', help: 'An email address' }],
  { title: 'Events', capability: 'manage_events' }, // default capability: manage_settings
);
const { recipient } = await ctx.settings.get(siteId); // with defaults
```

I valori piccoli che non sono impostazioni (un segnaposto di migrazione, l'ora dell'ultima sincronizzazione) vanno nello **storage** del plugin, per sito, accanto alle impostazioni:

```ts
await ctx.storage.set(siteId, 'lastSync', new Date().toISOString());
const last = await ctx.storage.get<string>(siteId, 'lastSync'); // or null
await ctx.storage.delete(siteId, 'lastSync');
```

I **segreti**, come le chiavi API, vanno in `ctx.secrets` (`settings:own`): sono cifrati nel database con una chiave derivata dall'`APP_SECRET` del server e non vengono mai rimostrati.

```ts
await ctx.secrets.set(siteId, 'apiKey', key);
const apiKey = await ctx.secrets.get(siteId, 'apiKey'); // or null
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

`mail:send`: `await ctx.mail.send({ to, subject, text, html?, replyTo?, siteId? })`, inviata con le impostazioni di posta del server, oppure con il server SMTP del sito indicando `siteId`. `html` (API dei plugin 1.16) è una versione HTML del messaggio, come una conferma d'ordine; `text` resta per i programmi di posta che mostrano solo testo.

L'API dei plugin 1.41 aggiunge `from`, `fromName`, `cc`, `bcc` e `attachments`:

```ts
await ctx.mail.send({
  siteId,
  to: ['vendite@example.com', 'ufficio@example.com'],
  cc: 'capo@example.com',
  bcc: 'archivio@example.com',
  replyTo: emailDelVisitatore,
  fromName: 'Modulo del sito', // con l'indirizzo del sito
  subject: 'Nuova richiesta',
  text,
  attachments: [
    { filename: 'preventivo.pdf', content: bytesDelPdf, contentType: 'application/pdf' },
  ],
});
```

- Gli indirizzi (`to`, `cc`, `bcc`) sono una stringa, con più indirizzi separati da virgole, oppure un elenco; ognuno è un indirizzo o `Nome <indirizzo>`. Un indirizzo non valido, o con un a capo, fa fallire `send`: non parte nulla, quindi non si possono iniettare intestazioni. `replyTo` e `from` accettano un solo indirizzo. L'oggetto e `fromName` restano su una riga.
- `from` sostituisce il mittente del sito. I server di posta possono rifiutare o segnalare mittenti di altri domini (SPF, DMARC): conviene tenere l'indirizzo del sito e mettere quello del visitatore in `replyTo`; `fromName` da solo cambia soltanto il nome mostrato.
- I destinatari in `bcc` ricevono il messaggio senza comparire nelle intestazioni.
- `attachments` sono file in memoria: `content` sono i byte (va bene un `Buffer`) oppure testo UTF-8. I file non vengono mai letti dal disco o da un indirizzo, e gli altri campi del programma di invio non passano.
- Limiti: 50 destinatari fra To, Cc e Bcc; 10 allegati, 20 MB in tutto; 2.000.000 di caratteri per `text` e per `html`.
- Sui core più vecchi questi campi non sono ufficiali: controlla `ctx.apiVersion` (manca prima della 1.41) oppure richiedi `"apiVersion": "^1.41"` nel manifest.

### Commenti di un plugin

`comments` (API dei plugin 1.19): `ctx.comments.post(request, { entryId, type, content, meta?, authorName?, authorEmail? })` pubblica un commento di un tipo del plugin (una recensione, una domanda) per il visitatore di una richiesta pubblica, connesso o ospite, con la moderazione, i controlli antispam, i limiti e le notifiche del core; `meta` contiene i dati del plugin, come un voto. La voce deve essere pubblicata; se li accetta lo decide il plugin. Gli errori hanno un messaggio per il visitatore e uno `status`. `ctx.comments.find(siteId, { entryId?, type?, status?, userId?, authorEmail?, limit?, offset? })` li legge (per default quelli approvati). Si moderano in Commenti come gli altri, non compaiono mai nelle discussioni delle voci e le azioni `comment.created` e `comment.status` ne portano il `meta`.

Dall'API dei plugin 1.45 un plugin modera anche i commenti di qualsiasi tipo: `ctx.comments.setStatus(siteId, { ids, status, origin, userId? })` li porta a `pending`, `approved`, `spam` o `trash` come fa la schermata Commenti (seguono i conteggi, la cache delle pagine, l'azione `comment.status` e le email; `origin`, ad esempio `request.origin`, serve per i link delle email), e `ctx.comments.remove(siteId, { ids, userId? })` elimina definitivamente quelli nello spam o nel cestino (al massimo 500 alla volta). Con `userId` il plugin agisce per quella persona, che deve poter moderare i commenti; senza, per conto proprio (ad esempio un'attività programmata); il registro delle attività annota il plugin.

### Attività periodiche

`ctx.schedule.every(name, minutes, handler)` (API dei plugin 1.18) esegue `handler(siteId)` circa ogni `minutes` minuti (almeno 1) per ogni sito in cui il plugin è attivo, per esempio per annullare gli ordini non pagati o inviare un riepilogo. Non serve alcun permesso. Le attività girano in ogni processo del server: un'attività deve restare innocua se due partono insieme (aggiornare le righe con condizioni, non leggerle e poi scriverle).

### Richieste ad altri servizi

`network` (API plugin 1.11): `await ctx.http.send({ url, method?, headers?, body?, timeoutMs? })` restituisce `{ status, type, text }`. Serve per webhook, liste di contatti e notifiche in chat. Sono accettati solo indirizzi `https` pubblici: i nomi che portano alla rete del server vengono rifiutati al momento della connessione, i reindirizzamenti non vengono seguiti, le risposte sono tagliate a 1 MB e le richieste durano 10 secondi se non indicato diversamente (30 al massimo). Con `binary: true` (API plugin 1.36) la risposta è un file: i byte arrivano in `base64` (fino a 5 MB) e `text` è vuoto, ad esempio per copiare un font o un'immagine da un sito importato. `userAgent` (API plugin 1.44; ASCII stampabile, al massimo 200 caratteri) sostituisce il predefinito `Cleitext-Plugin/<slug>`, per esempio per ricevere quello che riceve un browser: Fresco chiede i Google Fonts come un browser per copiarne i file WOFF2.

```ts
const res = await ctx.http.send({
  url: 'https://hooks.example.com/notify',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: 'Nuovo messaggio' }),
});
if (res.status >= 400) ctx.log.warn('Webhook rifiutato', { status: res.status });
```

### Media

`media:read`: `await ctx.media.get(siteId, id)` restituisce un elemento della libreria media (`url`, `mime`, `width`, `height`, `alt` per lingua), per esempio l'immagine scelta in un campo `media`. Le voci restituite da `ctx.content.find` / `get` hanno il loro `parentId`.

`media:write` (API 1.30): `await ctx.media.fromUrl(siteId, url, { userId, alt?, filename? })` scarica un'immagine o un documento da un indirizzo pubblico http(s) nella libreria, come caricato da quell'utente (che deve avere `upload_media`); gli indirizzi della rete del server sono rifiutati, vale il limite di dimensione dei caricamenti e un file già presente viene riusato. Gli import lo usano per le immagini di altre piattaforme.

### Membri del sito (API dei plugin 1.42)

`users:read`: `ctx.users` legge i membri del sito, ad esempio per @menzionare le persone nelle note e scrivere loro un'email. È in sola lettura e vede soltanto i membri del sito (row-level security), e solo gli account attivi (non quelli invitati, in attesa o sospesi).

```ts
const people = await ctx.users.find(siteId, { search: 'ann', limit: 10 });
// [{ id, displayName, email, avatarUrl, role: 'editor' }, …] in ordine di nome
const person = await ctx.users.get(siteId, userId); // null se non è un membro
```

- `find(siteId, query?)`: `search` cerca parole del nome o di un indirizzo confermato (senza distinguere maiuscole, `%` e `_` valgono alla lettera); `ids` (al massimo 100), `role` (lo slug di un ruolo), `limit` (predefinito 20, al massimo 100) e `offset`.
- `email` è l'indirizzo solo se il titolare l'ha confermato: un'iscrizione confermata, un invito accettato o una password reimpostata via email. Altrimenti è `null` (ad esempio un account a cui un amministratore ha dato la password, o un indirizzo cambiato in **Utenti** e non più confermato), così un'email a `email` arriva a chi possiede l'account.
- `avatarUrl` è l'immagine del profilo, Gravatar se il sito lo usa (**Impostazioni → Discussione**), oppure `null` per le iniziali.
- Attivare un plugin che chiede `users:read` richiede il consenso dell'amministratore: l'admin lo chiede prima di attivarlo.
- Sui core più vecchi `ctx.users` manca: chiamalo come `ctx.users?.find(...)` oppure richiedi `"apiVersion": "^1.42"`.

### Dati personali (GDPR)

Un plugin che conserva dati personali (messaggi, iscrizioni, ordini…) dovrebbe permettere al sito di rispondere alle richieste delle persone, come fanno gli exporter e gli eraser della privacy di WordPress (API dei plugin 1.2, nessun permesso richiesto):

```ts
ctx.privacy.registerExporter({
  id: 'events', // inizia con lo slug del plugin
  label: { en: 'Event sign-ups', it: 'Iscrizioni agli eventi' },
  async export(siteId, email) {
    const rows = await ctx.db.transaction(siteId, (tx) =>
      tx.select().from(signups).where(eq(signups.email, email)),
    );
    return [
      {
        id: 'events.signups',
        label: 'Iscrizioni',
        items: rows.map((r) => ({ event: r.title, date: r.createdAt.toISOString() })),
      },
    ];
  },
});
ctx.privacy.registerEraser({
  id: 'events',
  label: { en: 'Event sign-ups', it: 'Iscrizioni agli eventi' },
  async erase(siteId, email) {
    const gone = await ctx.db.transaction(siteId, (tx) =>
      tx.delete(signups).where(eq(signups.email, email)).returning({ id: signups.id }),
    );
    return { removed: gone.length, retained: 0 }; // retained + messages: cosa deve restare, e perché
  },
});
```

Un plugin che carica script di tracciamento (statistiche, pubblicità, pixel) dovrebbe anche dichiararli (API dei plugin 1.4), perché il plugin privacy chieda il consenso per la loro categoria, elenchi i loro cookie e li descriva nelle policy:

```ts
ctx.privacy.declareTrackers(async (siteId) => [
  {
    id: 'stats.plausible',
    name: 'Plausible',
    provider: 'Plausible Insights OÜ',
    category: 'statistics',
    requiresConsent: false, // anonimo, senza cookie
    cookies: [],
    purpose: { en: 'We measure visits anonymously.', it: 'Misuriamo le visite in forma anonima.' },
  },
]);
```

Carica inattivi gli script che richiedono il consenso — `<script type="text/plain" data-cx-category="statistics">` — e il banner li esegue dopo il consenso. `ctx.privacy.trackers(siteId)` (permesso `privacy`) restituisce le dichiarazioni dei plugin attivi.

L'email arriva in minuscolo. Vengono interpellati solo i plugin attivi sul sito. Un plugin con il permesso `privacy` (come Privacy e GDPR) esegue le richieste: `ctx.privacy.exportPersonalData(siteId, email)` raccoglie i dati del core (l'account di un membro del sito, le sue sessioni, i token e l'attività) e quelli di ogni exporter; `ctx.privacy.erasePersonalData(siteId, email)` esegue gli eraser (gli account restano: si eliminano da Utenti).

### Importazione

Un plugin con il permesso `import` può portare in un sito contenuti da un altro sistema (API dei plugin 1.8), come fa il plugin ufficiale **WordPress Importer**: legge l'esportazione dell'altro sistema, costruisce un **documento di trasferimento** (il formato di `@cleitext/blocks/transfer`, lo stesso delle esportazioni di Cleitext) e lo passa al core:

```ts
import type { TransferDocumentInput } from '@cleitext/plugin-sdk';

const document: TransferDocumentInput = convert(file); // voci, media, termini, menu, utenti, redirect
const report = await ctx.transfer.importDocument(siteId, document, {
  userId: request.user!.id, // registrato come autore dell'importazione
  onProgress: (message) => ctx.log.info(message),
});
// { created: { entries: 12, media: 30, … }, skipped: {…}, warnings: […], errors: […] }
```

Il contenuto delle voci è fatto di blocchi: `@cleitext/blocks/html` li ricava da HTML e block markup (`htmlToCxd`). Durante un'importazione (`keepUnknown`) i blocchi WordPress senza equivalente e gli shortcode isolati diventano segnaposto `core/imported`: i plugin attivi li sostituiscono con `import.block` e `import.shortcode` (API 1.36), il resto conserva il suo testo, con una riga di report per tipo. In una pagina Elementor importata in Fresco, i blocchi di uno shortcode finiscono dentro un elemento blocco di plugin di Fresco (il `wrap` del segnaposto). Il plugin ufficiale **Kross Booking**, per esempio, trasforma `[kross-booking id="3" lang="it"]` nel suo blocco:

```ts
ctx.hooks.filter(
  'import.shortcode',
  (blocks, { tag, attrs }) =>
    blocks ?? (tag === 'kross-booking' ? [blockFromShortcode(attrs)] : null),
);
```

I file media si indicano con il loro indirizzo http(s) e vengono scaricati solo da indirizzi pubblici, mai dalla rete del server. Quello che c'è già sul sito resta com'è, e i vecchi indirizzi (`oldPaths`) diventano redirect. Un sito grande richiede minuti: avvia l'importazione senza attenderla nella route e tieni l'avanzamento in `ctx.storage`.

Le voci possono rimandare l'una all'altra in qualsiasi ordine: in un documento (o nei dati di un plugin), `{ "$entry": "<ref della voce>", "prefix": "entry:" }` diventa `prefix + <nuovo id>` quando tutte le voci esistono (`null` se quella voce non è stata importata). Le voci di un tipo di contenuto che il sito non ha (ad esempio di un plugin non attivo) restano fuori, con una riga del resoconto per tipo. Le impostazioni destinate a un plugin vanno in `document.plugins`, per slug del plugin (API 1.28): dopo le voci, ogni plugin attivo riceve le sue con il filtro `import.pluginData`, con oggetti media e riferimenti alle voci già rimappati e `idMap` (`{ entries, terms, media }` per `ref`) per tutto il resto; i dati che nessun plugin attivo prende finiscono nel resoconto.

```ts
ctx.hooks.filter('import.pluginData', async (result, { siteId, slug, data }) => {
  if (slug !== ctx.plugin.slug) return result;
  await ctx.storage.set(siteId, 'settings', merge(await ctx.storage.get(siteId, 'settings'), data));
  return { warnings: [...(result?.warnings ?? []), 'Impostazioni importate.'] };
});
```

<a id="assistenti-ia"></a>

### Assistenti IA

Gli assistenti IA di Cleitext (MCP e la chat dell'admin, vedi [MCP.md](./MCP.md)) leggono una guida prima di scrivere e lavorano con degli strumenti. Con `ctx.ai` (API dei plugin 1.40, non serve alcun permesso) un plugin li istruisce. Chiamalo in `setup`; vale sui siti dove il plugin è attivo. Sui core più vecchi `ctx.ai` manca, quindi chiamalo come `ctx.ai?.…`.

**Un editor.** Un plugin con un suo [editor](#editors) (per esempio un page builder) lo registra, così gli assistenti mantengono le sue pagine in quell'editor invece di trasformarle in pagine dell'editor a blocchi:

```ts
ctx.ai?.registerEditor({
  id: 'builder', // l'id dell'editor dell'admin: `document.editor.id`
  title: 'Builder',
  types: ['page'], // tutti i tipi di contenuto se omesso
  // Markdown, breve: il formato, gli elementi e le impostazioni principali, un esempio.
  guide: async ({ siteId, locale }) => `Una pagina di Builder è un elenco di sezioni…`,
  // Blocchi (CXD) dall'assistente (markup dei blocchi e HTML vengono letti prima) → documento di Builder.
  fromBlocks: (blocks, { locale }) => ({
    schema: 1,
    blocks: toSections(blocks),
    editor: { id: 'builder' },
  }),
  // Un documento di Builder → blocchi, per gli assistenti che lo leggono come blocchi (`as_blocks` di get_entry).
  toBlocks: (document) => toCoreBlocks(document.blocks),
  // Un documento nel formato di Builder (`native`): il documento ripulito, o cosa non va.
  validate: (document) =>
    problems(document).length ? { errors: problems(document) } : { document: clean(document) },
});
```

- `get_site` elenca l'editor, `get_entry` restituisce i suoi documenti come `native` (ed `editor_settings`, le impostazioni di pagina in `editor.data`), e `get_block_guide` con `editor: 'builder'` dà le regole di Cleitext, la tua guida, le sezioni dei plugin, la guida del tema e i pattern.
- `create_entry` e `update_entry` mantengono l'editor del contenuto e il suo `editor.data`: `content` e `blocks` passano da `fromBlocks`, `native` da `validate`. Senza `fromBlocks` (o `validate`) agli assistenti viene detto di inviare l'altra forma; se il plugin non è attivo, gli strumenti si rifiutano di scrivere quei contenuti invece di spostarli in un altro editor.
- Il core valida e ripulisce comunque i blocchi del risultato, come per ogni salvataggio. `validate` dovrebbe controllare ciò che il core non può: tipi di elementi, annidamento, testo formattato (Fresco lo ripulisce con il suo sanitizzatore).
- Le funzioni ricevono `{ siteId, userId, locale, type? }`. Gli errori che lanciano arrivano all'assistente come un breve messaggio.
- **Impostazioni → Scrittura** sceglie, per tipo di contenuto, l'editor con cui si aprono i nuovi contenuti, nell'admin e per gli assistenti (`defaultEditors` delle impostazioni del core; `me.site.defaultEditors` nell'admin).

**Una sezione della guida**, per esempio come si usano i blocchi o i campi del plugin:

```ts
ctx.ai?.addContext({
  title: 'Prodotti',
  markdown: ({ siteId, locale }) =>
    'Mostra i prodotti con il blocco shop/products; i prezzi vengono dal negozio, non scriverli nel testo.',
});
```

**Strumenti** del plugin, con nome `<slug del plugin>_<nome>` per l'assistente (i trattini diventano `_`). Agiscono come la persona per cui lavora l'assistente: `context.api` è la REST API del sito con i permessi di quella persona. Gli strumenti `write` richiedono una connessione che possa scrivere; `capability` nasconde uno strumento a chi non ce l'ha. Lancia un errore con `expose: true` per dare all'assistente il suo messaggio; gli altri errori diventano un messaggio generico e finiscono nel log.

```ts
ctx.ai?.registerTool({
  name: 'low_stock',
  title: 'Prodotti in esaurimento',
  description: 'I prodotti con meno di `below` pezzi in magazzino.',
  scope: 'read',
  capability: 'manage_shop',
  inputSchema: {
    type: 'object',
    properties: { below: { type: 'integer', minimum: 1 } },
    additionalProperties: false,
  },
  async run(args, { api }) {
    const { data } = await api('GET', `/ext/shop/products?stock_below=${Number(args.below ?? 5)}`);
    return data;
  },
});
```

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

Il punto di ingresso dell'admin aggiunge pagine all'amministrazione. Sono elencate nella barra laterale e servite su `/cl-admin/ext/<slug>/<path>` (`adminUrl(path)` della SDK admin, API dei plugin 1.15, crea i link a qualsiasi schermata dell’admin):

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
      icon: 'M8 3v3 M16 3v3 M4 8h16 M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    },
  ],
});
```

- Props della pagina: `plugin`, `site` (`id`, `name`, `defaultLocale`, `locales`), `user` (`id`, `displayName`, `locale`, `capabilities`) e `api`, che chiama i tuoi endpoint (`api('GET', '/rsvps')` → `/api/v1/ext/<slug>/rsvps`).
- `editors(type?)` (API 1.26; manca sui siti più vecchi, quindi controlla prima che ci sia) elenca gli editor del sito: prima l'editor a blocchi (`{ id: 'blocks', plugin: null }`), poi gli [editor](#editors) dei plugin attivi che l'utente può usare, per un tipo di contenuto se indicato. Ognuno è `{ id, title, plugin, types?, fromBlocks?, toBlocks? }`, con i convertitori del suo plugin; quelli dell'editor a blocchi restituiscono il documento così com'è. Uno strumento può spostare contenuti da un editor all'altro: `toBlocks` dell'editor che ha creato il documento (il suo `document.editor.id`, `blocks` se non c'è), poi `fromBlocks` dell'altro. Il plugin **Converti editor** lo fa per molte voci insieme.
- `menu: false` nasconde una pagina dalla barra laterale. `capability` la nasconde agli utenti che non hanno quella capability.
- `icon` è l'icona della pagina nella barra laterale: dati di un tracciato SVG su una griglia 24×24, disegnato a contorno come le icone del core (tratto 1.75, estremità arrotondate, senza riempimento). Le pagine senza icona, o con qualcosa che non è un tracciato, ricevono un pezzo di puzzle.
- `parent` (API 1.25) fa della pagina una voce di sottomenu, come in WordPress: sotto un'altra pagina del plugin (il suo `path`, `''` per quella principale) o sotto una sezione dell'admin (`'/appearance'`, `'/settings'`, `'/users'`, `'/posts'`, `'/pages'`, `'/media'`, `'/plugins'` e, dall'API 1.26, `'/tools'`). Una pagina sotto `'/tools'` ha anche una scheda nella schermata **Strumenti**, con la sua `description` (API 1.26), una frase su a cosa serve. La voce corrente mostra il sottomenu sotto di sé; le altre lo mostrano accanto alla barra laterale al passaggio del mouse o con il focus.
- `link` (API 1.25) crea una voce di menu che apre un indirizzo dell'admin invece di una pagina, es. `{ path: 'options', title: 'Opzioni del tema', parent: '', link: '/appearance?tab=customize' }`; una voce così non ha bisogno di `component`.
- `after` (API 1.25) mette una voce principale subito dopo una sezione dell'admin invece che in fondo alla barra laterale, es. `after: '/appearance'` per il menu di un tema.
- Da `@cleitext/admin-sdk` ottieni `Button`, `Card`, `TextField`, `Alert`, `FieldsForm` (un modulo generato dalle definizioni dei campi), `api` (l'API del core), `pluginApi`, `ApiError`, `errorMessage` e `labelText`. Usali insieme alle loro classi Tailwind, oppure usa stili inline. Le tue classi Tailwind non vengono compilate.
- `@tanstack/react-query` è disponibile, con il query client dell'admin.
- Una pagina che va in crash mostra un messaggio di errore; il resto dell'admin continua a funzionare.

**Sezioni dell'editor e colonne degli elenchi.** Oltre a pagine e widget della Bacheca, il punto di ingresso dell'admin può aggiungere una sezione alla barra laterale dell'editor e colonne agli elenchi di voci e termini (il plugin Multilingua aggiunge così la sezione e le colonne Traduzioni):

```tsx
export default defineAdminPlugin({
  editorPanels: [
    {
      id: 'checks',
      title: { en: 'Checks', it: 'Controlli' },
      types: ['article'], // all types when omitted
      visible: (props) => props.user.capabilities.includes('edit_entries'),
      component: ({ entry, api, navigate }) => <p>{entry.title}</p>,
    },
  ],
  entryColumns: [
    {
      id: 'score',
      title: 'Score',
      // Once per page of rows, so cells do not each call the server.
      load: (rows, { api }) => api('GET', `/scores?ids=${rows.map((r) => r.id).join(',')}`),
      cell: ({ row, data, refresh }) => <span>{String(data ?? '—')}</span>,
    },
  ],
  termColumns: [], // the same, for categories, tags and other taxonomies
});
```

`entry` è `{ id, type, locale, title, slug, status }`; le righe sono `{ id, locale, title, status? }`. Dall'API 1.24 una sezione dell'editor riceve anche `draft`, la voce com'è mentre la si modifica, prima del salvataggio (`title`, `slug`, `excerpt`, `featuredMediaId`, `document`, `fields`; si aggiorna poco dopo ogni modifica, per esempio per un'analisi SEO dal vivo), e `setFields(group, values)`, che cambia i valori di un gruppo di campi come i campi della barra laterale (salvati con la voce). Sui siti più vecchi mancano entrambi: controlla prima di usarli. `navigate('/entries/<id>')` apre un indirizzo dell'admin. `visible` nasconde una sezione o una colonna, per esempio quando il sito ha una sola lingua.

<a id="editors"></a>**Editor** (API dei plugin 1.11). Un plugin può offrire un editor per le voci al posto dell'editor a blocchi, per esempio un page builder. Occupa tutto lo schermo sotto la barra superiore dell'editor, che mantiene titolo, salvataggio, anteprima e pubblicazione:

```tsx
export default defineAdminPlugin({
  editors: [
    {
      id: 'builder', // salvato come document.editor.id
      title: { en: 'Builder', it: 'Builder' },
      types: ['page'], // tutti i tipi se omesso
      fromBlocks: (document) => convert(document), // facoltativo
      component: BuilderEditor,
    },
  ],
});
```

- La barra superiore mostra **Modifica con …** per ogni editor adatto al tipo della voce. Il passaggio converte il contenuto con `fromBlocks` (e all'indietro con `toBlocks`). Senza, dopo una conferma la pagina riparte vuota, e il contenuto precedente resta nelle revisioni.
- I documenti salvati dall'editor portano `editor: { id, data? }`. In `data` vanno le impostazioni della pagina intera. Questi documenti si aprono sempre con quell'editor; se il suo plugin non è attivo, l'admin lo dice invece di aprirli nell'editor a blocchi.
- I blocchi del contenuto sono normali blocchi CXD, di solito quelli del plugin (§7). Revisioni, salvataggi automatici, traduzioni, esportazione e assistenti IA continuano a funzionare; registra l'editor anche con [`ctx.ai`](#assistenti-ia), così gli assistenti scrivono le sue pagine nel suo formato.
- Props:
  - `document`: il contenuto iniziale;
  - `onChange(document)`: da chiamare con il documento intero a ogni modifica;
  - `readOnly`;
  - `frameUrl()`: la pagina nel layout del tema con un elemento vuoto `[data-cx-editor-canvas]` dove va il contenuto, per un iframe;
  - `media.upload` e `media.list`: la libreria media;
  - `openSettings()`: apre le impostazioni della voce sopra l'editor.
- **A tutto schermo** (API 1.27): `chrome: 'none'` nella definizione nasconde la barra superiore dell'editor delle voci, e l'editor disegna la sua, come fanno i page builder.
  - Riceve `host`: `{ title, setTitle, status, dirty, busy, error, canPublish, canSubmit, published, save(), publish(), submit(), preview(), back: { url, label } }`.
  - Le azioni non falliscono mai con un'eccezione; l'errore finisce in `host.error`.
  - Con l'API 1.39, se il tipo di contenuto ha l'immagine in evidenza, `host` ha anche `featuredMediaId` (l'id di un media, o null) e `setFeaturedMediaId(id)`, salvati con il resto, così l'editor può mostrarla nelle sue impostazioni della pagina.
  - Ctrl/⌘+S nella pagina dell'admin salva come sempre. Dentro il tuo iframe chiama `host.save()`. Un editor che salva da sé (per esempio con dati suoi) chiama `preventDefault()` sul tasto: l'admin allora non lo gestisce, e la pagina si salva una volta sola.
- Dopo il ripristino di una revisione o di un salvataggio automatico, l'editor viene montato di nuovo con il nuovo `document`.
- Nell'iframe, che ha la stessa origine, i portali React (`createPortal` di `react-dom`) possono disegnare nel documento della pagina.

### Moduli condivisi

Questi import sono forniti da Cleitext a runtime e non finiscono nel bundle. Non installarne altre versioni:

| Punto di ingresso del server                                                                      | Punto di ingresso dell'admin                                                              |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@cleitext/plugin-sdk`, `react`, `react/jsx-runtime`, `zod`, `drizzle-orm`, `drizzle-orm/pg-core` | `@cleitext/admin-sdk`, `react`, `react/jsx-runtime`, `react-dom`, `@tanstack/react-query` |

Qualsiasi altra dipendenza (installata nei `node_modules` del tuo plugin) viene inclusa nel bundle da `plugin:build`.

**Tipi.** Per il controllo dei tipi e il supporto nell'editor di codice, aggiungi come dipendenze di sviluppo i pacchetti SDK della tua versione di Cleitext (`@cleitext/plugin-sdk`, `@cleitext/admin-sdk`, i tipi di `react`). Finché non saranno pubblicati, installali da una copia di lavoro di Cleitext (`npm install --save-dev /path/to/cleitext/packages/plugin-sdk`). Non servono per la build: `plugin:build` li risolve da sé.

## 12. Permessi

| Permesso        | Consente                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `content:read`  | `ctx.content.find` / `get`, `ctx.terms.find`                                                      |
| `content:write` | `ctx.content.registerType` / `registerTaxonomy` / `registerFieldGroup` / `copy`, `ctx.terms.copy` |
| `blocks`        | `ctx.blocks.register`                                                                             |
| `routes:admin`  | `ctx.routes.api`                                                                                  |
| `routes:public` | `ctx.routes.public`                                                                               |
| `settings:own`  | `ctx.settings.define` / `get`, `ctx.storage`                                                      |
| `languages`     | `ctx.languages` ([plugin delle lingue](#15-lingue-plugin-delle-lingue))                           |
| `theme:hooks`   | filtri `render.*` e `theme.*`, `ctx.assets.enqueue`, `ctx.themes.extend` (API 1.32)               |
| `mail:send`     | `ctx.mail.send`                                                                                   |
| `network`       | `ctx.http.send`                                                                                   |
| `forms:protect` | filtri `form.challenge` e `form.verify` (API 1.38)                                                |
| `users:read`    | `ctx.users.find` / `get` (API 1.42); attivare il plugin chiede il consenso dell'amministratore    |
| `privacy`       | `ctx.privacy.exportPersonalData` / `erasePersonalData`                                            |
| `media:read`    | `ctx.media.get`                                                                                   |
| `media:write`   | `ctx.media.fromUrl` (API 1.30)                                                                    |
| `import`        | `ctx.transfer.importDocument`                                                                     |

Gli amministratori vedono i permessi richiesti in **Plugins → Details**. Le tue tabelle (`ctx.db`), gli hook sulle azioni, il logging, le capability e l'invalidazione della cache non richiedono permessi.

## 13. Disattivazione, aggiornamenti, disinstallazione, errori

- La **disattivazione** (per singolo sito) non deve mai rompere il sito. I tipi di contenuto spariscono dall'admin, le loro voci non vengono più servite (404, tranne che per le anteprime degli utenti autenticati) e i link verso di esse escono dai menu. I blocchi non renderizzano nulla, le route rispondono 404, i filtri si fermano. **I dati vengono conservati**: riattivando il plugin torna tutto come prima.
- **Aggiornamenti**: installa la nuova versione con `plugin:install`. Le nuove migrazioni vengono eseguite, i server in esecuzione si ricaricano e i file precedenti vengono conservati in `<slug>.previous`.
- La **disinstallazione** (`plugin:uninstall`, su tutti i siti) esegue `onUninstall`, poi elimina lo schema `plg_<slug>`, il ruolo del plugin e le impostazioni del plugin. Le voci dei suoi tipi di contenuto restano nel database e ricompaiono se il plugin viene installato di nuovo.
- **Errori**: un plugin che non riesce a caricarsi viene mostrato in Plugins con il suo errore, e il resto del sito funziona. Gli errori e il tempo trascorso negli hook sono elencati in **Plugins → Details → Activity**.

## 14. Riferimento: tipi di campo

Usati dai campi dei tipi di contenuto, dai gruppi di campi, dagli attributi dei blocchi e dalle impostazioni.

| `type`       | Valore              | Opzioni                                                                                                                                                                        |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `text`       | stringa             | `maxLength`, `multiline`, `default`                                                                                                                                            |
| `url`        | stringa             | `default`. Accetta `http(s)://`, `/`, `mailto:`, `tel:`                                                                                                                        |
| `number`     | numero              | `min`, `max`, `step`, `default`, `display: 'range'` (un cursore), `unit` (mostrata accanto, es. `px`)                                                                          |
| `boolean`    | booleano            | `default`, `display: 'devices'` (con `responsive`: tre pulsanti dei dispositivi, es. visibilità)                                                                               |
| `date`       | `YYYY-MM-DD`        | `default`                                                                                                                                                                      |
| `datetime`   | ISO 8601            | `default`                                                                                                                                                                      |
| `select`     | stringa             | `options: [{ value, label }]`, `default`                                                                                                                                       |
| `media`      | id del media (uuid) | un'immagine della libreria media                                                                                                                                               |
| `color`      | `#rrggbb`           | `alpha` (anche `#rrggbbaa`), `default`                                                                                                                                         |
| `choice`     | stringa             | `options: [{ value, label, image? }]`, `display: 'buttons' \| 'images'`, `default`                                                                                             |
| `code`       | stringa             | `language: 'css'`, `default`. Fino a 100.000 caratteri, mai `</style`                                                                                                          |
| `list`       | array di oggetti    | `fields` (ogni tipo tranne `list`), `itemLabel` (il campo che dà il nome a un elemento), `max` (predefinito 200), `default`                                                    |
| `spacing`    | oggetto             | `{ top, right, bottom, left, unit }`; opzioni `units` (predefinite `px`, `em`, `%`), `sides`, `corners` (raggi), `default`                                                     |
| `background` | oggetto             | `{ type: 'color' \| 'gradient' \| 'image', color, gradient, image, position, size, repeat, attachment, overlay }`; `palette`, `default`                                        |
| `typography` | oggetto             | `{ family, weight, size: { desktop, tablet, mobile, desktopUnit… }, lineHeight, lineHeightUnit, letterSpacing, letterSpacingUnit, transform, decoration }`; `units`, `default` |
| `zones`      | oggetto             | `devices`, `rows`, `items`, `default`: un costruttore di intestazione o piè di pagina (TEMI.md §4); non dentro una `list`                                                      |

Opzioni comuni: `name` (lettere, cifre, `_`), `label`, `help`, `required`, `translation` e `hidden` (mai mostrato nei moduli: dati conservati con gli altri, per esempio impostazioni importate da un altro sito). Nei moduli di impostazioni, `section` mette un campo in una scheda (opzioni del tema, §4 di TEMI.md), `group` gli mette sopra un titolo e `showIf` lo mostra solo quando altri campi hanno certi valori: `{ field: 'header', equals: 'transparent' }`, `{ field: 'layout', in: ['left', 'right'] }`, `{ field: 'sidebar', not: 'none' }`, oppure più condizioni con `{ all: [...] }` / `{ any: [...] }`. Un campo senza valore conta come il suo predefinito. `inline: true` disegna un campo sulla stessa riga di quello prima, solo con il suo controllo e con l'etichetta come suggerimento (in Personalizza: il campione del colore al passaggio del mouse accanto a quello del colore normale). Le etichette sono stringhe oppure oggetti per lingua (`{ en: 'Date', it: 'Data' }`). Un campo facoltativo può essere vuoto (`null`).

`responsive: true` (su `number`, `select`, `choice`, `boolean`, `spacing`, `background`, `color` e `text`) tiene un valore per dispositivo, `{ desktop, tablet, mobile }`: un dispositivo senza valore usa quello del più grande (`deviceValue(value, device)` in `@cleitext/shared`). Un `number` responsive può avere `units` (`['px', 'em']`), salvate come `desktopUnit`, `tabletUnit`, `mobileUnit`. In Personalizza il selettore del dispositivo accanto all'etichetta segue l'anteprima. Un `color` o un `background` con `palette: { field, prefix }` offre anche i colori globali del tema: `field` è una lista di elementi `{ color }` dello stesso modulo, e il valore è `var(<prefix><indice>)`, per esempio `var(--zn-global-color-0)`. Dei caratteri dei campi `typography` si controlla solo la scrittura; `googleFonts()` in `@cleitext/shared` elenca famiglie e spessori di Google.

`translation` dice cosa succede al campo nelle altre lingue, con un plugin delle lingue: `translate` (predefinito) viene copiato nella nuova traduzione e poi modificato lì, `copy` resta uguale all'originale (si aggiorna quando l'originale viene salvato, come un prezzo), `ignore` parte vuoto.

## 15. Lingue (plugin delle lingue)

Il core conosce una sola lingua per sito, la **lingua predefinita**, più la lingua di ogni voce, termine e menu. Tutto il resto delle lingue multiple spetta a un **plugin delle lingue**, come il plugin ufficiale Multilingua (`plugins/multilingual`): l'elenco delle lingue, quali elementi si traducono a vicenda e le schermate per gestirli. Un sito che non lo usa non paga nulla: niente prefisso di lingua, hreflang, selettore o query in più.

Un plugin delle lingue (permesso `languages`, uno solo attivo per sito) dice due cose al core:

```ts
ctx.languages.provide({
  // The site's languages. The core puts the default first and gives it no prefix.
  locales: async (siteId) => [
    { code: 'en', name: 'English', prefix: '', isDefault: true },
    { code: 'it', name: 'Italiano', prefix: '/it', isDefault: false },
  ],
  // For each id, the other versions of the item: [{ id, locale }].
  translations: async (siteId, kind /* 'entry' | 'term' */, ids) => ({}),
  // Optional: lists of another language also show the default language's
  // untranslated entries (null: no; or the ids already translated into it).
  fallback: async (siteId, locale) => null,
});
```

Con queste informazioni il core:

- instrada gli indirizzi `/it/…` e costruisce gli URL di ogni lingua;
- scrive i link hreflang (pagine, archivi, sitemap);
- dà ai temi il selettore della lingua (`page.locales`);
- mostra in ogni lingua la pagina iniziale, quella degli articoli e quella di errore;
- permette all'admin di scrivere contenuti, termini e menu in ogni lingua.

Una lingua può anche avere un dominio tutto suo (`host: 'example.de'`, uno dei domini secondari del sito): le sue pagine sono servite lì senza prefisso, e i link fra le lingue diventano assoluti. Il risultato di `locales` resta in cache per 30 secondi: dopo una modifica chiama `await ctx.languages.changed(siteId)`.

Altre chiamate:

| Chiamata                                         | Fa                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `ctx.languages.defaultLocale(siteId)`            | La lingua predefinita (quella del core).                                       |
| `ctx.languages.setDefault(siteId, code)`         | La cambia; il codice deve essere tra quelli di `locales`.                      |
| `ctx.languages.usage(siteId)`                    | Voci, termini e menu per lingua, per esempio prima di rimuoverne una.          |
| `ctx.languages.pending(siteId)` · `clearPending` | Dati linguistici che il core conserva per un plugin delle lingue (vedi sotto). |

Per le traduzioni, `ctx.content.updateFields(siteId, id, values, { userId })` salva alcuni campi personalizzati di una voce (per esempio per sincronizzare i campi `copy`), e `ctx.content.fields(siteId, type)` restituisce i campi di un tipo con i gruppi di campi (compreso `translation`). Il filtro `site.strings` (`{ title, tagline }`, contesto `{ siteId, locale }`) fornisce titolo e motto del sito nelle altre lingue; il core non lo chiama mai per la lingua predefinita. I gestori delle azioni ricevono l'utente che ha fatto la modifica come `context.userId`, quando c'è.

**Dati linguistici in attesa.** I siti precedenti a M7 e i siti importati portano con sé lingue e collegamenti fra traduzioni (`{ locales, entries: [{ id, group }], terms: [...] }`). Il core li conserva finché un plugin delle lingue non li prende in carico: leggili con `pending`, salvali nelle tue tabelle, poi chiama `clearPending`. Il plugin Multilingua lo fa quando viene attivato e all'azione `languages.pending`.

**Export.** `cleitext export` include le lingue e i gruppi di traduzione indicati dal plugin, così un sito si sposta insieme alle sue traduzioni.
