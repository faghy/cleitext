# Developing Cleitext plugins

> Plugin API **1.0** · 🇮🇹 [Leggi in italiano](./it/PLUGIN.md)

A plugin extends Cleitext the way a WordPress plugin extends WordPress. It can add content types with custom fields, blocks, pages to the admin, settings, endpoints, addresses on the public site and its own database tables, and it can react to what happens through hooks.

This guide is all you need to write one. A complete example lives in [`examples/plugin-events`](../examples/plugin-events): an _Events_ plugin with a content type, a block, an admin page and its own table. The smallest one is the official [`plugins/hi-john`](../plugins/hi-john), Cleitext's Hello Dolly: one admin entry with a dashboard widget, no server code, no permissions.

## Contents

1. [How plugins work](#1-how-plugins-work)
2. [Folder layout and manifest](#2-folder-layout-and-manifest)
3. [Build, install, activate](#3-build-install-activate)
4. [The server entry](#4-the-server-entry)
5. [Hooks](#5-hooks)
6. [Content types and custom fields](#6-content-types-and-custom-fields)
7. [Blocks](#7-blocks)
8. [Routes](#8-routes)
9. [Settings, capabilities, cache, mail](#9-settings-capabilities-cache-mail)
10. [Your own tables](#10-your-own-tables)
11. [The admin entry](#11-the-admin-entry)
12. [Permissions](#12-permissions)
13. [Deactivation, updates, uninstall, errors](#13-deactivation-updates-uninstall-errors)
14. [Reference: field types](#14-reference-field-types)
15. [Languages (language plugins)](#15-languages-language-plugins)

---

## 1. How plugins work

- A plugin is a folder with a manifest (`cleitext.plugin.json`), a **server entry** and, optionally, an **admin entry**, SQL migrations and other files.
- It is **installed once** on a Cleitext server and **activated per site**. Everything it adds (types, blocks, routes, hooks, capabilities) only exists on the sites where it is active.
- Plugins are written in TypeScript or JavaScript, with JSX. `cleitext plugin:build` bundles them. The bundles do **not** include React, Drizzle, Zod or the SDK: Cleitext provides them at runtime, so there is a single React for blocks and admin pages (see [shared modules](#shared-modules)).
- The public site has no client JavaScript: blocks and pages are rendered on the server with React.
- Plugins run in the same process as Cleitext. They are trusted code: permissions make what a plugin does explicit and catch mistakes, but they are not a sandbox.

## 2. Folder layout and manifest

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

| Field                               | Required | Description                                                                                                                           |
| ----------------------------------- | :------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`                              |    ✅    | `^[a-z][a-z0-9-]{1,39}$`. Also names the database schema (`plg_<slug>`, dashes become `_`) and prefixes your blocks and field groups. |
| `name`                              |    ✅    | Shown in the admin.                                                                                                                   |
| `version`                           |    ✅    | Semantic version. Installing a lower version than the installed one is refused.                                                       |
| `apiVersion`                        |    ✅    | Semver range of the plugin API you support, e.g. `^1.0`.                                                                              |
| `license`                           |    ✅    | SPDX identifier of a GPL-compatible license: `GPL-2.0-or-later`, `GPL-3.0-or-later`, `MIT`, `Apache-2.0`, `BSD-3-Clause`, `ISC`…      |
| `server`                            |          | Path of the built server entry. Its source is the same path under `src/` (`dist/server.js` ← `src/server.ts` or `.tsx`, `.js`).       |
| `admin`                             |          | Path of the built admin entry, same rule.                                                                                             |
| `requires.plugins`                  |          | Plugins that must be installed (and active on the site) first: `{ "slug": "semver range" }`.                                          |
| `permissions`                       |          | What the plugin uses ([§12](#12-permissions)). Using something not listed throws `PluginPermissionError`.                             |
| `capabilities`                      |          | Capabilities the plugin defines ([§9](#capabilities)).                                                                                |
| `description`, `author`, `homepage` |          | Shown in Plugins.                                                                                                                     |

## 3. Build, install, activate

```bash
cleitext plugin:build ./my-plugin             # bundles src/ into dist/
cleitext plugin:install ./my-plugin           # copies, runs migrations, registers
cleitext plugin:install ./my-plugin --build   # both
cleitext plugin:install ./my-plugin --link    # development: links the folder instead of copying it
cleitext plugin:install ./my-plugin --required  # must-use: always active on every site
cleitext plugin:list
cleitext plugin:uninstall my-plugin           # removes the plugin and ALL its data (asks first)
```

In a Cleitext checkout, run them as `pnpm cleitext …`.

- Installed plugins live in `PLUGINS_PATH` (default `cleitext-data/plugins`). The previous version is kept next to it (`<slug>.previous`).
- Running servers **reload their plugins automatically** after `plugin:install` and `plugin:uninstall`: no restart is needed.
- Then, in the admin, **Plugins → Activate** turns the plugin on for the current site. Super admins can also **activate it on every site** (network activation), and **Delete** a plugin that is active on no site: like `plugin:uninstall`, it removes the plugin with ALL its data, after a confirmation.
- Super admins can also install a built plugin from the admin (**Plugins → Upload Plugin**, a `.zip` or `.tgz` of the plugin folder). Servers can turn this off with `PLUGINS_INSTALL_FROM_UI=false`.
- During development, use `--link`. After `plugin:build`, install again (with `--link` the files are already in place, so this only reloads the servers).

## 4. The server entry

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

`setup` only **declares** things. It does not know about sites: every handler receives the `siteId` it runs for.

The context `ctx` contains:

| Member                                                | What it does                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ctx.plugin`                                          | `{ slug, version }`                                                                     |
| `ctx.log`                                             | `debug/info/warn/error(message, data?)`, written to the server log with the plugin name |
| `ctx.hooks`                                           | Actions and filters ([§5](#5-hooks))                                                    |
| `ctx.content`                                         | Content types, field groups, reading entries ([§6](#6-content-types-and-custom-fields)) |
| `ctx.blocks`                                          | Blocks ([§7](#7-blocks))                                                                |
| `ctx.routes`                                          | API endpoints and public addresses ([§8](#8-routes))                                    |
| `ctx.settings`, `ctx.access`, `ctx.cache`, `ctx.mail` | [§9](#9-settings-capabilities-cache-mail)                                               |
| `ctx.db`                                              | Your own tables ([§10](#10-your-own-tables))                                            |

## 5. Hooks

As in WordPress: **actions** tell you something happened, **filters** let you change a value. Lower `priority` runs first (default 10). Handlers only run on sites where your plugin is active. An error in a handler is logged and skipped. For a filter, this means the value goes on unchanged. A handler slower than 5 seconds is abandoned.

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

**Actions** (they run after the change is saved):

| Name                                      | Payload                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| `entry.created` · `entry.saved`           | `{ entry }`                                                    |
| `entry.published` · `entry.unpublished`   | `{ entry }`                                                    |
| `entry.trashed` · `entry.deleted`         | `{ entry }`                                                    |
| `term.created` · `term.deleted`           | `{ term }`                                                     |
| `media.uploaded`                          | `{ media: { id, mime, filename, url } }`                       |
| `languages.pending`                       | `{}` ([language data](#15-languages-language-plugins) arrived) |
| `plugin.activated` · `plugin.deactivated` | `{ plugin }` (slug)                                            |

`entry` is `{ id, siteId, type, locale, slug, title, status, fields }`, `term` is `{ id, siteId, taxonomy, locale, slug, name }`. Scheduled entries published automatically do not emit `entry.published` yet. `term.created` is emitted for terms created from the terms screen, the API and plugins (not for tags typed in the editor).

**Filters** (public site, they need the `theme:hooks` permission):

| Name                       | Value                                                                                | Context                          |
| -------------------------- | ------------------------------------------------------------------------------------ | -------------------------------- |
| `render.head`              | `HeadData`: `title`, `description`, `canonical`, `og`, `robots`, `tags`              | `RenderHookContext`              |
| `render.blocks`            | the entry's blocks (`CxdBlock[]`)                                                    | `RenderHookContext` with `entry` |
| `render.html`              | the final HTML string                                                                | `RenderHookContext`              |
| `theme.templateCandidates` | template names tried in order                                                        | `RenderHookContext`              |
| `entry.states`             | tags next to entry titles in the admin (`{ key, label }` by entry id); no permission | `{ siteId, ids }`                |

`RenderHookContext` is `{ siteId, locale, route, path, entry?, tag(tag) }`. `route` is `entry`, `archive`, `search`, `404` or `maintenance`. `entry` is the public entry: `{ id, type, title, url, fields, document, terms, … }`. Call `tag('type:event')` when what you add depends on other data (see [caching](#cache)).

`head.tags` adds tags to `<head>`: `{ tag: 'meta', attrs }`, `{ tag: 'link', attrs }` or `{ tag: 'json-ld', data }` (structured data, safely serialized).

**Your own hooks.** Declare them with TypeScript declaration merging and emit them with `ctx.hooks.emit` (names must start with your slug). Other plugins listen with `ctx.hooks.on`:

```ts
declare module '@cleitext/plugin-sdk' {
  interface Actions {
    'events.rsvp': { eventId: string; email: string };
  }
}
await ctx.hooks.emit('events.rsvp', { eventId, email }, { siteId });
```

## 6. Content types and custom fields

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

- The type appears in the admin sidebar, with the usual list, editor, revisions, translations and scheduling. Fields appear in the editor sidebar under **Details** ([field types](#14-reference-field-types)).
- Field values are validated when saving. `required` fields are checked when publishing, so a draft can be incomplete.
- Entries are shown with the theme's templates. To add something to their page, use the `render.blocks` filter (for example a box with the date) and `render.head` (structured data).

**Field groups** add fields to existing types. Values are stored under `fields[<id>]`, and the id must start with your slug:

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

**Reading entries** (`content:read`). The newest come first, and only published entries are returned unless `status: 'any'`:

```ts
const events = await ctx.content.find(siteId, { type: 'event', locale: 'en', limit: 20 });
const one = await ctx.content.get(siteId, id); // any status, or null
// { id, type, locale, slug, title, status, url, publishedAt, fields }
```

**Copying entries** (`content:write`). A draft copy with the content, fields, excerpt and featured image, made on behalf of a user whose permissions apply (and who is recorded in the activity log). In another language, the parent and the terms become their translations when the language plugin knows them:

```ts
const copy = await ctx.content.copy(siteId, id, { userId: request.user!.id, locale: 'it' });
```

**Updating entries** (`content:write`). `ctx.content.update(siteId, id, { title, excerpt, document, fields }, { userId })` saves a new revision as that user (the document is validated like one from the editor); `ctx.content.revision(siteId, id)` reads the latest saved version. `@cleitext/plugin-sdk` also exports `inlineToHtml` and `htmlToInline`, to work on the rich text of blocks.

**Terms** (`content:read`, `content:write` to copy):

```ts
const terms = await ctx.terms.find(siteId, { taxonomy: 'category', locale: 'en' });
// { id, taxonomy, locale, slug, name, parentId, url }
const copy = await ctx.terms.copy(siteId, id, {
  userId,
  locale: 'it',
  name: 'Viaggi',
  parentId: null,
});
```

## 7. Blocks

A block has **attributes described with fields**. Every editor builds the editing form from them (in Gutenberg, a form inside the block). Then the server renders it with your `render` function. It needs the `blocks` permission.

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

- `load` runs before rendering and may be asynchronous. `render` is synchronous and returns React elements. There is no client JavaScript.
- The output is wrapped in `<div class="wp-block-events-upcoming">`: style your markup from the theme or with a `<style>` element in `render`.
- Attributes get their `default` values. A block that throws (in `load` or `render`) renders nothing, and the page is still served.
- When the plugin is inactive, its blocks stay in the content but render nothing. The editor shows them as _unavailable_ and keeps them unchanged.

## 8. Routes

**API endpoints** (`routes:admin`), served at `/api/v1/ext/<slug><path>`:

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

Without `public`, the user must be signed in. Requests that change data (`POST`, `PUT`, `PATCH`, `DELETE`) need the CSRF token. The admin SDK's `api` and `pluginApi` send it for you.

**Public addresses** (`routes:public`), on the site itself, matched before permalinks:

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

`POST` public routes receive HTML form posts (`application/x-www-form-urlencoded`, parsed into an object) and are refused when the `Origin` is another site. Paths starting with `/api`, `/admin`, `/media` and `/__preview` are reserved.

`request` is `{ siteId, method, path, params, query, body, ip, user, headers }`. `user` is `{ id, displayName, capabilities }` or `null`. The handler returns `{ status?, body?, contentType?, headers?, cacheTags? }`: a string `body` is sent as is, anything else as JSON. To redirect, return `{ status: 303, headers: { location: '/thanks' } }`.

## 9. Settings, capabilities, cache, mail

### Settings

`settings:own`. Declared with fields; the admin shows the form under **Settings**, per site.

```ts
ctx.settings.define(
  [{ name: 'recipient', type: 'text', label: 'Send RSVPs to', help: 'An email address' }],
  { title: 'Events', capability: 'manage_events' }, // default capability: manage_settings
);
const { recipient } = await ctx.settings.get(siteId); // with defaults
```

Small values that are not settings (a migration marker, a last sync time) go in the plugin **storage**, per site, next to the settings:

```ts
await ctx.storage.set(siteId, 'lastSync', new Date().toISOString());
const last = await ctx.storage.get<string>(siteId, 'lastSync'); // or null
await ctx.storage.delete(siteId, 'lastSync');
```

**Secrets** such as API keys go in `ctx.secrets` (`settings:own`): they are encrypted in the database with a key derived from the server's `APP_SECRET`, and never shown back.

```ts
await ctx.secrets.set(siteId, 'apiKey', key);
const apiKey = await ctx.secrets.get(siteId, 'apiKey'); // or null
```

### Capabilities

Declare the capability in the manifest, then grant it to roles:

```ts
ctx.access.defineCapability('manage_events', {
  label: 'Manage events',
  roles: ['administrator', 'editor'],
});
```

Super admins have every capability. Use capabilities in routes (`capability`) and admin pages (`capability`).

### Cache

Public pages are cached and refreshed through **tags**. Pages showing an entry carry `entry:<id>` and `type:<type>`, menus carry `menus:<locale>`, and every page carries `site`. Publishing content and changing settings invalidate the right tags automatically. In your code:

- add tags to what you render: `context.tag('type:event')` in blocks and filters, `cacheTags` in public routes;
- invalidate tags when your own data changes: `await ctx.cache.invalidate(siteId, ['type:event'])`.

### Mail

`mail:send`: `await ctx.mail.send({ to, subject, text, replyTo? })`, sent with the server's mail settings.

### Personal data (GDPR)

A plugin that keeps personal data (messages, sign-ups, orders…) should let the site answer the requests of people about it, as WordPress's privacy exporters and erasers do (plugin API 1.2, no permission needed):

```ts
ctx.privacy.registerExporter({
  id: 'events', // starts with the plugin slug
  label: { en: 'Event sign-ups', it: 'Iscrizioni agli eventi' },
  async export(siteId, email) {
    const rows = await ctx.db.transaction(siteId, (tx) =>
      tx.select().from(signups).where(eq(signups.email, email)),
    );
    return [
      {
        id: 'events.signups',
        label: 'Sign-ups',
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
    return { removed: gone.length, retained: 0 }; // retained + messages: what must stay, and why
  },
});
```

The email comes in lowercase. Only the plugins active on the site are asked. A plugin with the `privacy` permission (such as Privacy & GDPR) runs the requests: `ctx.privacy.exportPersonalData(siteId, email)` gathers the core's data (the account of a member of the site, its sessions, tokens and activity) and every exporter's; `ctx.privacy.erasePersonalData(siteId, email)` runs the erasers (accounts are kept: they are deleted from Users).

## 10. Your own tables

Tables live in the plugin's PostgreSQL schema `plg_<slug>`. They are created by SQL migrations in `migrations/`, named `NNNN_description.sql` and run in order when the plugin is installed or updated:

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

- Do not edit a migration once it has been installed: Cleitext refuses to install a changed migration. Add a new migration instead.
- Queries run as a PostgreSQL role dedicated to your plugin. That role can only use the `plg_<slug>` schema, and Row Level Security limits rows to the current site. Core tables are not reachable: use the context APIs.

Query with Drizzle (shared with Cleitext):

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

Always pass `siteId` when inserting: the database refuses rows of another site.

## 11. The admin entry

The admin entry adds pages to the admin. They are listed in the sidebar and served at `/admin/ext/<slug>/<path>`:

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

- Page props: `plugin`, `site` (`id`, `name`, `defaultLocale`, `locales`), `user` (`id`, `displayName`, `locale`, `capabilities`) and `api`, which calls your endpoints (`api('GET', '/rsvps')` → `/api/v1/ext/<slug>/rsvps`).
- `menu: false` hides a page from the sidebar. `capability` hides it from users without that capability.
- From `@cleitext/admin-sdk` you get `Button`, `Card`, `TextField`, `Alert`, `FieldsForm` (a form generated from field definitions), `api` (the core API), `pluginApi`, `ApiError`, `errorMessage` and `labelText`. Use them and their Tailwind classes, or inline styles. Your own Tailwind classes are not compiled.
- `@tanstack/react-query` is available, with the admin's query client.
- A page that crashes shows an error message; the rest of the admin keeps working.

**Editor sections and list columns.** Besides pages and Dashboard widgets, the admin entry can add a section to the editor sidebar and columns to the lists of entries and terms (the Multilingual plugin adds its Translations section and columns this way):

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

`entry` is `{ id, type, locale, title, slug, status }`; rows are `{ id, locale, title, status? }`. `navigate('/entries/<id>')` opens an admin address. `visible` hides a section or column, e.g. when the site has a single language.

### Shared modules

These imports are provided by Cleitext at runtime and are not bundled. Do not install other versions of them:

| Server entry                                                                                      | Admin entry                                                                               |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@cleitext/plugin-sdk`, `react`, `react/jsx-runtime`, `zod`, `drizzle-orm`, `drizzle-orm/pg-core` | `@cleitext/admin-sdk`, `react`, `react/jsx-runtime`, `react-dom`, `@tanstack/react-query` |

Any other dependency (installed in your plugin's `node_modules`) is bundled by `plugin:build`.

**Types.** For type checking and editor support, add the SDK packages of your Cleitext version as development dependencies (`@cleitext/plugin-sdk`, `@cleitext/admin-sdk`, `react` types). Until they are published, install them from a Cleitext checkout (`npm install --save-dev /path/to/cleitext/packages/plugin-sdk`). They are not needed to build: `plugin:build` resolves them.

## 12. Permissions

| Permission      | Allows                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| `content:read`  | `ctx.content.find` / `get`, `ctx.terms.find`                                 |
| `content:write` | `ctx.content.registerType` / `registerFieldGroup` / `copy`, `ctx.terms.copy` |
| `blocks`        | `ctx.blocks.register`                                                        |
| `routes:admin`  | `ctx.routes.api`                                                             |
| `routes:public` | `ctx.routes.public`                                                          |
| `settings:own`  | `ctx.settings.define` / `get`, `ctx.storage`                                 |
| `languages`     | `ctx.languages` ([language plugins](#15-languages-language-plugins))         |
| `theme:hooks`   | filters `render.*` and `theme.*`                                             |
| `mail:send`     | `ctx.mail.send`                                                              |
| `privacy`       | `ctx.privacy.exportPersonalData` / `erasePersonalData`                       |
| `media:read`    | reserved for the media API                                                   |

Administrators see the requested permissions in **Plugins → Details**. Your own tables (`ctx.db`), hooks on actions, logging, capabilities and cache invalidation need no permission.

## 13. Deactivation, updates, uninstall, errors

- **Deactivation** (per site) must never break the site. Content types disappear from the admin, their entries are no longer served (404, except for logged-in previews), and links to them leave the menus. Blocks render nothing, routes answer 404, filters stop. **Data is kept**: reactivating brings everything back.
- **Updates**: install the new version with `plugin:install`. New migrations run, running servers reload, and the previous files are kept in `<slug>.previous`.
- **Uninstall** (`plugin:uninstall`, every site) runs `onUninstall`, then drops the `plg_<slug>` schema, the plugin role and the plugin settings. Entries of its content types stay in the database and come back if the plugin is installed again.
- **Errors**: a plugin that fails to load is shown in Plugins with its error, and the rest of the site works. Errors and the time spent in hooks are listed in **Plugins → Details → Activity**.

## 14. Reference: field types

Used by content type fields, field groups, block attributes and settings.

| `type`     | Value           | Options                                                 |
| ---------- | --------------- | ------------------------------------------------------- |
| `text`     | string          | `maxLength`, `multiline`, `default`                     |
| `url`      | string          | `default`. Accepts `http(s)://`, `/`, `mailto:`, `tel:` |
| `number`   | number          | `min`, `max`, `step`, `default`                         |
| `boolean`  | boolean         | `default`                                               |
| `date`     | `YYYY-MM-DD`    | `default`                                               |
| `datetime` | ISO 8601        | `default`                                               |
| `select`   | string          | `options: [{ value, label }]`, `default`                |
| `media`    | media id (uuid) | an image of the media library                           |

Common options: `name` (letters, digits, `_`), `label`, `help`, `required` and `translation`. Labels are strings or per-language objects (`{ en: 'Date', it: 'Data' }`). An optional field may be empty (`null`).

`translation` says what happens to the field in other languages, with a language plugin: `translate` (default) is copied into a new translation and then edited there, `copy` stays the same as in the original (it is updated when the original is saved, like a price), `ignore` starts empty.

## 15. Languages (language plugins)

The core knows one language per site, its **default language**, and the language of each entry, term and menu. Everything else about several languages belongs to a **language plugin** such as the official Multilingual plugin (`plugins/multilingual`): the list of languages, which items translate each other, and the screens to manage them. A site without one pays nothing: no language prefix, hreflang, switcher or extra query.

A language plugin (permission `languages`, one active per site) tells the core two things:

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

With these the core routes `/it/…` addresses, builds the URLs of every language, writes hreflang links (pages, archives, sitemaps), gives themes the language switcher (`page.locales`), shows the front, posts and error pages in each language, and lets the admin write content, terms and menus in each language. A language can also have a domain of its own (`host: 'example.de'`, one of the site's secondary domains): its pages are served there without a prefix, and links between languages become absolute. Results of `locales` are cached for 30 seconds; call `await ctx.languages.changed(siteId)` after a change.

Other calls:

| Call                                             | Does                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `ctx.languages.defaultLocale(siteId)`            | The default language (the core's).                               |
| `ctx.languages.setDefault(siteId, code)`         | Changes it; the code must be one of `locales`.                   |
| `ctx.languages.usage(siteId)`                    | Entries, terms and menus per language, e.g. before removing one. |
| `ctx.languages.pending(siteId)` · `clearPending` | Language data the core holds for a language plugin (see below).  |

For translations, `ctx.content.updateFields(siteId, id, values, { userId })` saves some custom fields of an entry (e.g. to sync `copy` fields), and `ctx.content.fields(siteId, type)` returns the fields of a type with the field groups (`translation` included). The filter `site.strings` (`{ title, tagline }`, context `{ siteId, locale }`) gives the site title and tagline in the other languages; the core never calls it for the default language. Action handlers receive the user who made the change as `context.userId`, when there is one.

**Pending language data.** Sites from before M7 and imported sites bring languages and translation links (`{ locales, entries: [{ id, group }], terms: [...] }`). The core keeps them until a language plugin takes them over: read them with `pending`, store them in your tables, then `clearPending`. The Multilingual plugin does it when it is activated and on the action `languages.pending`.

**Export.** `cleitext export` includes the languages and the translation groups the plugin reports, so a site moves with its translations.
