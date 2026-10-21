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

| Field                               | Required | Description                                                                                                                                                  |
| ----------------------------------- | :------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `slug`                              |    ✅    | `^[a-z][a-z0-9-]{1,39}$`. Also names the database schema (`plg_<slug>`, dashes become `_`) and prefixes your blocks and field groups.                        |
| `name`                              |    ✅    | Shown in the admin.                                                                                                                                          |
| `version`                           |    ✅    | Semantic version. Installing a lower version than the installed one is refused.                                                                              |
| `apiVersion`                        |    ✅    | Semver range of the plugin API you support, e.g. `^1.0`.                                                                                                     |
| `license`                           |    ✅    | SPDX identifier of a GPL-compatible license: `GPL-2.0-or-later`, `GPL-3.0-or-later`, `MIT`, `Apache-2.0`, `BSD-3-Clause`, `ISC`…                             |
| `server`                            |          | Path of the built server entry. Its source is the same path under `src/` (`dist/server.js` ← `src/server.ts` or `.tsx`, `.js`).                              |
| `admin`                             |          | Path of the built admin entry, same rule.                                                                                                                    |
| `public`                            |          | Folder of files for the public site, e.g. `dist/public` (§9, Public scripts and styles).                                                                     |
| `requires.plugins`                  |          | Plugins that must be installed (and active on the site) first: `{ "slug": "semver range" }`.                                                                 |
| `conflicts`                         |          | Plugins that cannot be active on the same site, e.g. `["seo"]` for another SEO plugin (API 1.24). Activating one while the other is active fails, both ways. |
| `permissions`                       |          | What the plugin uses ([§12](#12-permissions)). Using something not listed throws `PluginPermissionError`.                                                    |
| `capabilities`                      |          | Capabilities the plugin defines ([§9](#capabilities)).                                                                                                       |
| `description`, `author`, `homepage` |          | Shown in Plugins.                                                                                                                                            |

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

| Name                                      | Payload                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `entry.created` · `entry.saved`           | `{ entry }`                                                                                                                       |
| `entry.published` · `entry.unpublished`   | `{ entry }`                                                                                                                       |
| `entry.trashed` · `entry.deleted`         | `{ entry }`                                                                                                                       |
| `entry.copied`                            | `{ entry, from: { id, locale } }` (API 1.21; see below)                                                                           |
| `term.created` · `term.deleted`           | `{ term }`                                                                                                                        |
| `media.uploaded`                          | `{ media: { id, mime, filename, url } }`                                                                                          |
| `languages.pending`                       | `{}` ([language data](#15-languages-language-plugins) arrived)                                                                    |
| `plugin.activated` · `plugin.deactivated` | `{ plugin }` (slug)                                                                                                               |
| `cache.invalidated`                       | `{ tags }`: pages with these tags changed (`site`: all), API 1.9                                                                  |
| `user.registered`                         | `{ user: { id, email, displayName } }`, API 1.12                                                                                  |
| `comment.created`                         | `{ comment }`, whatever its status, API 1.12                                                                                      |
| `comment.status`                          | `{ comment, from }`: approved, held, spam or trashed, API 1.12                                                                    |
| `request.notFound`                        | `{ path, query, referrer, userAgent }`: a visitor got a “not found” page, also from the page cache (after the response), API 1.24 |

`entry` is `{ id, siteId, type, locale, slug, title, status, fields }`, plus (API 1.13), when the change knows them, `terms` (term ids by taxonomy slug) and `featuredMediaId`, so a plugin can keep its own copy of entries up to date; `term` is `{ id, siteId, taxonomy, locale, slug, name }`, `comment` is `{ id, entryId, parentId, type, status, userId, authorName, authorEmail, content }`. Scheduled entries published automatically do not emit `entry.published` yet. `term.created` is emitted for terms created from the terms screen, the API and plugins (not for tags typed in the editor).

**Filters** (public site, they need the `theme:hooks` permission):

| Name                       | Value                                                                                                                                                                 | Context                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `render.head`              | `HeadData`: `title`, `description`, `canonical`, `og`, `robots`, `tags`                                                                                               | `RenderHookContext`                                    |
| `render.blocks`            | the entry's blocks (`CxdBlock[]`)                                                                                                                                     | `RenderHookContext` with `entry`                       |
| `render.html`              | the final HTML string                                                                                                                                                 | `RenderHookContext`                                    |
| `render.adminBarEdit`      | the edit link of the public toolbar on an entry, `{ label, href }` (an admin address), or `null` to hide it, e.g. "Edit with …" (API 1.29)                            | `{ siteId, locale, entry: { id, type, editor? } }`     |
| `render.maintenance`       | the page visitors get in maintenance mode: `{ html, retryAfter? }` (a whole document) instead of the theme's, or `null` (API 1.35)                                    | `MaintenanceContext`                                   |
| `form.challenge`           | markup placed in a form before its submit button, e.g. a captcha widget; add to the value (needs `forms:protect`, API 1.38)                                           | `FormChallengeContext`                                 |
| `form.verify`              | `{ ok, message? }` for a submission of a protected form, or `null` to let it through (needs `forms:protect`, API 1.38)                                                | `FormVerifyContext`                                    |
| `theme.templateCandidates` | template names tried in order                                                                                                                                         | `RenderHookContext`                                    |
| `entry.states`             | tags next to entry titles in the admin (`{ key, label }` by entry id); no permission                                                                                  | `{ siteId, ids }`                                      |
| `account.links`            | links on a visitor's account page (`{ label, url }[]`, local addresses; API 1.17)                                                                                     | `{ siteId, locale, userId, base }`                     |
| `import.block`             | a WordPress block without an equivalent on import: the plugin's blocks instead (API 1.23)                                                                             | `{ siteId, name, attrs, html, children }`              |
| `import.shortcode`         | a WordPress shortcode standing alone on import (own line or paragraph, Shortcode block, Elementor shortcode/text/HTML widget): the plugin's blocks instead (API 1.36) | `{ siteId, tag, attrs, content, text }`                |
| `import.pluginData`        | the plugin's data of an imported document (`document.plugins[slug]`): `{ warnings? }` when taken, `null` otherwise (API 1.28)                                         | `{ siteId, slug, data, idMap, userId }`                |
| `feed.title`               | title of an RSS feed (the site's, or `<term> – <site>`; API 1.22)                                                                                                     | `{ siteId, locale, siteTitle, term }`                  |
| `sitemap.sources`          | content types and taxonomies with an XML sitemap (`{ kind, slug }[]`)                                                                                                 | `{ siteId }`                                           |
| `sitemap.urls`             | the addresses of one sitemap (`loc`, `lastmod`, `images`, `alternates`, `entry` or `term`)                                                                            | `{ siteId, kind, slug, locale }`                       |
| `cache.headers`            | extra headers of a public response kept by the page cache, API 1.9                                                                                                    | `{ siteId, host, path, status, tags }`                 |
| `robots.txt`               | the text of `/robots.txt`, with its `Sitemap:` line; no permission. A site that asks search engines to stay away keeps `Disallow: /` (API 1.24)                       | `{ siteId, origin, sitemap, discourageSearchEngines }` |

`RenderHookContext` is `{ siteId, locale, route, path, entry?, signedIn?, tag(tag) }`. `route` is `entry`, `archive`, `search`, `404` or `maintenance`. `entry` is the public entry: `{ id, type, title, url, fields, document, terms, … }`. `signedIn` (plugin API 1.33) is `true` when the visitor is signed in: their pages are never cached, so content may depend on it. Call `tag('type:event')` when what you add depends on other data (see [caching](#cache)).

**Caches in front of Cleitext** (plugin API 1.9). `cache.headers` adds headers to the public responses the page cache keeps (never to signed-in visitors): computed once, stored with the page and sent on every hit, e.g. a `Cache-Control` with `s-maxage` and the page's tags for Varnish or a CDN. `cache.invalidated` is emitted once per change, outside the transaction that made it, with the tags whose pages changed: purge them there. The official **Edge cache** plugin does both for Varnish and Cloudflare.

**Maintenance page** (plugin API 1.35). While a site is in maintenance mode (**Settings → General** or `cleitext site:maintenance`), visitors get a 503 page and signed-in users still see the site. `render.maintenance` replaces the theme's `maintenance` template: return `{ html, retryAfter? }` and the core sends that document with status 503, `Retry-After` (`retryAfter` seconds, 3600 by default), `X-Robots-Tag: noindex` and no caching; `null` (the starting value) leaves the page to the theme. The context, `MaintenanceContext`, is `{ siteId, locale, defaultLocale, origin, path, site: { title, tagline, timezone, logoUrl?, iconUrl? }, preview? }`: `locale` is the language of the address asked for (the default one otherwise), `logoUrl` and `iconUrl` are the absolute addresses of the theme's `logo` and `favicon` settings when set, and `preview` is `true` for the preview of **Settings → General** (`GET /api/v1/settings/maintenance/preview?locale=`), which shows the page to an administrator. The page is sent under the public Content Security Policy: keep its styles inline. The official **Maintenance** plugin uses it:

```ts
ctx.hooks.filter(
  'render.maintenance',
  async (page, context) =>
    page ?? { html: myPage(context.locale, context.site), retryAfter: 2 * 3600 },
);
```

**Protecting forms** (plugin API 1.38). One plugin protects every form of the site against bots, e.g. with a captcha, and forms ask it through the core instead of each having its own keys. Forms have a stable id: `core/login`, `core/register`, `core/lost-password`, `core/reset-password` and `core/comment` for the core's own (which ask by themselves), and `<slug>/<form>` for a plugin's, e.g. `forms/<block id>`, `shop/checkout`, `fresco-pro/form`, `prisma/form`. A protection plugin (permission `forms:protect`) answers two filters:

- `form.challenge`: the markup to place inside the form, before its submit button (a widget and its `<script>` tags). The context, `FormChallengeContext`, is `{ siteId, form, locale, signedIn }`. Pages of guests may be cached, so the markup must not depend on anything else (no tokens in it). Add to the value: `''` shows nothing.
- `form.verify`: `{ ok: false, message }` refuses a submission, with a message for the visitor in `locale`; `{ ok: true }` or `null` lets it go on. The context, `FormVerifyContext`, is `{ siteId, form, locale, fields, ip, host?, signedIn }`, where `fields` are the submitted values with the challenge's own (e.g. `cf-turnstile-response`) and `ip` is the visitor's address as the core sees it (set `TRUST_PROXY` behind a proxy). Keep a refusal given before yours, and catch your own errors: a handler that throws or times out (5 seconds) is skipped.

A plugin with forms of its own uses `ctx.forms` (no permission): `await ctx.forms.challenge({ siteId, form, locale, signedIn })` gives the markup (in a block's `load`, `context.signedIn` tells whether the visitor is signed in), and `await ctx.forms.verify({ siteId, form, locale, fields, ip, host, signedIn })` gives `{ ok, message? }`, always `{ ok: true }` when no plugin protects forms. On the core's forms a refusal is shown like their other errors. In the browser, a form sent with JavaScript calls `await window.cleitextChallenge?.prepare(form)` before reading its fields (invisible captchas get their token then) and `window.cleitextChallenge?.reset(form)` after a refused submission, since tokens work once; markup added with `innerHTML` needs its `<script>` elements created again. The official **Captcha** plugin provides Cloudflare Turnstile and Google reCAPTCHA this way.

**Theme locations** (plugin API 1.11). `render.locations` lets a theme builder replace parts of the theme: return CXD documents for `header`, `footer`, `single` (entry pages), `archive` (archives and search) and `overlay` (popups and panels, added at the end of every page whatever the theme). They render like the content, with plugin blocks, media and patterns; themes mark the places with `<Location>`. In the `single` template, a `cleitext/entry-content` block shows the entry's own content:

```ts
ctx.hooks.filter('render.locations', async (locations, context) =>
  context.route === 'entry' ? { ...locations, header: myHeader, single: mySingle } : locations,
);
```

Since plugin API 1.33, keys named `hook:<name>` fill the hook points a theme marks in its layout (e.g. `hook:zenit_header_before` in Zenit). They show nothing until a plugin fills them; names the theme does not mark are ignored.

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

- `public: false` (plugin API 1.11) makes a private type: its entries have no public address and stay out of sitemaps, search and the admin sidebar, for content the plugin uses itself, such as a theme builder's templates.
- The type appears in the admin sidebar, with the usual list, editor, revisions, translations and scheduling. Fields appear in the editor sidebar under **Details** ([field types](#14-reference-field-types)).
- Field values are validated when saving. `required` fields are checked when publishing, so a draft can be incomplete.
- Entries are shown with the theme's templates. To add something to their page, use the `render.blocks` filter (for example a box with the date) and `render.head` (structured data).

**Taxonomies** (plugin API 1.13) group the entries of your types, like WordPress's `register_taxonomy`:

```ts
ctx.content.registerTaxonomy({
  slug: 'brand', // also the address of its archives: /brand/<term>
  name: { en: 'Brands', it: 'Marchi' },
  hierarchical: false, // true: terms have parents, like categories
  types: ['product'],
  fields: [
    { name: 'logo', type: 'media', label: 'Logo' },
    { name: 'website', type: 'url', label: 'Website' },
  ],
});
```

- It appears in the admin under its types, with the usual list of terms; its `fields` are edited with each term and validated like entry fields.
- Terms have a manual order (`position`, then the name), set through the API (`PATCH /api/v1/terms/:id`).
- Like types, it is hidden while the plugin is not active: terms and assignments are kept. It cannot be deleted from the admin; a taxonomy with the same slug made in the admin (or imported) is taken over.

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

`types: ['*']` shows the group on every content type, including those of other plugins (API 1.24).

**Reading entries** (`content:read`). The newest come first, and only published entries are returned unless `status: 'any'`:

```ts
const events = await ctx.content.find(siteId, { type: 'event', locale: 'en', limit: 20 });
const one = await ctx.content.get(siteId, id); // any status, or null
// { id, type, locale, slug, title, status, url, publishedAt, fields, terms, featuredMediaId }
```

With `withDocument: true` each entry also has its block `document` (the published one; the latest with `status: 'any'`). Entries of private types (`public: false`) are found too, with an empty `url`.

**Copying entries** (`content:write`). A draft copy with the content, fields, excerpt and featured image, made on behalf of a user whose permissions apply (and who is recorded in the activity log). In another language, the parent and the terms become their translations when the language plugin knows them:

```ts
const copy = await ctx.content.copy(siteId, id, { userId: request.user!.id, locale: 'it' });
```

Every copy, this one or the admin's **Duplicate**, ends with the action `entry.copied` (plugin API 1.21): `entry` is the copy and `from` the original. Plugins keeping their own data of entries copy it there: a translation has another `locale` than `from.locale`, a duplicate the same. `ctx.content.translations(siteId, id)` (`content:read`) lists the other versions of an entry, `[{ id, locale }]`, as the language plugin knows them (none without one): a shop shares the prices and the stock of a product's translations this way.

**Updating entries** (`content:write`). `ctx.content.update(siteId, id, { title, excerpt, document, fields }, { userId })` saves a new revision as that user (the document is validated like one from the editor); `ctx.content.revision(siteId, id)` reads the latest saved version. `@cleitext/plugin-sdk` also exports `inlineToHtml` and `htmlToInline`, to work on the rich text of blocks.

**Terms** (`content:read`, `content:write` to copy):

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

With `withCounts: true` (plugin API 1.22) each term also has `count`, the number of its published entries, for tag clouds and category lists.

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
- Blocks render wherever they are: in the entry, in the theme's block areas and in synced patterns.

**Containers, CSS and media** (plugin API 1.11). Page builders need blocks that hold other blocks and style themselves:

```tsx
defineBlock<{ gap: number; image?: string }>({
  type: 'builder/section',
  title: 'Section',
  container: true, // children are in block.children
  attributes: [
    { name: 'gap', type: 'number', label: 'Gap', default: 16 },
    { name: 'image', type: 'media', label: 'Background' },
  ],
  media: (attrs) => (attrs.image ? [attrs.image] : []),
  css: ({ attrs, block }) => `.s-${block.id}{display:flex;gap:${attrs.gap}px}`,
  render: ({ attrs, block, children, context }) => (
    <section
      className={`s-${block.id}`}
      style={{ backgroundImage: `url(${context.media.get(attrs.image ?? '')?.url ?? ''})` }}
    >
      {children}
    </section>
  ),
});
```

- `container: true` lets the block keep blocks in `children`. Cleitext renders them and passes them to `render` as `children`.
- `wrapper: false` drops the `<div class="wp-block-…">` wrapper. Containers have none.
- Containers and blocks without wrapper render inside the page, so their `render` must not throw. Other blocks are rendered on their own first.
- `css` returns the CSS of one instance. The CSS of every instance on the page goes into one `<style data-cx-blocks>` at the end of `<head>`, after the plugins' stylesheets, so it overrides them.
- `context.page` (also in `load`) is the page being rendered: `route`, `site` (`title`, `tagline`, `home`), `params` (the query parameters of the address, e.g. a page number), and `entry` (the full public entry), `archive` (title, term, entries, pagination; `html` for plugin listings, API 1.20) or `search`, for blocks that show the page's own data, such as a theme builder's post title or archive list.
- `context.query({ type, terms, ids, exclude, orderBy, order, limit, offset })` in `load` (plugin API 1.11) lists published entries in the page's language, complete as themes get them (excerpt, images, terms, fields), with the `total` for pagination; the page refreshes when entries of those types change. `orderBy` is `date` (default), `title`, `modified`, `random` or `order` (the manual order of the admin, as WordPress's `menu_order`, API 1.31); `terms` is `{ taxonomy, slugs }`; `limit` is at most 100. Loops, related posts and portfolios use it.
- `context.menus` holds the site's menus in the page's language, by theme location (`{ id, label, url, target?, current, children }`), for navigation blocks.
- `context.preview` (plugin API 1.36) is `true` when the block is rendered for an editor's preview (`POST /api/v1/blocks/preview`, e.g. Fresco's canvas), not for a page: a block whose content comes from a script (a booking widget) can show a placeholder there.
- `items` (containers): each child rendered on its own, to wrap them one by one (tabs, accordions, carousels).
- `html` lists attributes holding raw HTML: for authors without `unfiltered_html` they are cleaned on save, like the Custom HTML block.
- `media` lists the media ids an instance uses. They are preloaded into `context.media`, with their `url`, size, `alt` and resized `variants`.

**Blocks with their own editor** (plugin API 1.23). A form of fields is enough for most blocks. Design blocks need more: a live preview in the canvas, settings in the sidebar, nested blocks. Such a plugin ships a block editor entry and registers its blocks in Gutenberg itself:

```json
{ "editor": "dist/editor.js", "public": "dist/public", "editorStyles": ["blocks.css"] }
```

```tsx
// src/editor.tsx: runs with the block editor, before the document opens.
import { InnerBlocks, InspectorControls, RichText, useBlockProps } from '@wordpress/block-editor';
import { registerBlockType } from '@wordpress/blocks';
import { PanelBody, RangeControl } from '@wordpress/components';

registerBlockType('acme/box', {
  apiVersion: 3,
  title: 'Box',
  category: 'design',
  attributes: { heading: { type: 'string' }, padding: { type: 'number', default: 24 } },
  edit: ({ attributes, setAttributes }) => (
    <section {...useBlockProps({ className: 'acme-box', style: { padding: attributes.padding } })}>
      <InspectorControls>
        <PanelBody title="Spacing">
          <RangeControl
            label="Padding"
            value={attributes.padding}
            onChange={(padding) => setAttributes({ padding })}
          />
        </PanelBody>
      </InspectorControls>
      <RichText
        tagName="h2"
        value={attributes.heading}
        onChange={(heading) => setAttributes({ heading })}
      />
      <InnerBlocks />
    </section>
  ),
  save: () => <InnerBlocks.Content />,
});
```

On the server the block is declared with `schema: 'json'`, so its attributes are whatever the editor saves (any JSON object, at most 64 KB), plus `richAttributes` for the text edited with `RichText` (stored as CXD inline nodes; render them with `inlineToHtml`) and `container: true` for `InnerBlocks`:

```tsx
defineBlock<{ heading?: CxdInline[]; padding?: number }>({
  type: 'acme/box',
  title: 'Box',
  schema: 'json',
  richAttributes: ['heading'],
  container: true,
  css: ({ attrs, block }) => `.acme-${block.id}{padding:${Number(attrs.padding ?? 24)}px}`,
  render: ({ attrs, block, children }) => (
    <section className={`acme-box acme-${block.id}`}>
      <h2 dangerouslySetInnerHTML={{ __html: inlineToHtml(attrs.heading ?? []) }} />
      {children}
    </section>
  ),
});
```

- The entry imports `@wordpress/block-editor`, `blocks`, `components`, `compose`, `data`, `element`, `hooks`, `i18n`, `icons`, `keycodes`, `primitives` and `rich-text`, plus React: `cleitext plugin:build` gives it the editor's own instances, never copies.
- `editorStyles` are stylesheets of the `public` folder loaded in the canvas, after the theme's, so blocks look there as on the site.
- Nothing is saved as markup: `save` is not used. Attributes may come from any version of the editor entry, so `render` must not trust them: escape what it prints, as above.
- The editor's preview device is in the `cleitext/editor` data store: `select('cleitext/editor').getDeviceType()` (`Desktop`, `Tablet`, `Mobile`) and `dispatch('cleitext/editor').setDeviceType('Tablet')`. The canvas takes the device's width, so its media queries apply; responsive settings of blocks should show and edit that device's value.
- The entry runs in the entries' editor and in the theme's areas. Without it (an error, or the plugin turned off), the block shows as unavailable and its content is kept.

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

`POST` public routes receive HTML form posts (`application/x-www-form-urlencoded`, parsed into an object) and are refused when the `Origin` is another site. Paths starting with `/api`, `/admin`, `/cl-admin`, `/media` and `/__preview` are reserved.

`request` is `{ siteId, method, path, params, query, body, rawBody, ip, user, headers, cookies, locale }`. `user` is `{ id, displayName, capabilities }` or `null`; `rawBody` is the body as received (a `Buffer`, for JSON and forms) or `null`. The handler returns `{ status?, body?, contentType?, headers?, cacheTags?, cookies?, page? }`: a string or a `Buffer` (plugin API 1.10) `body` is sent as is, anything else as JSON. To redirect, return `{ status: 303, headers: { location: '/thanks' } }`.

**Pages in the theme and cookies** (plugin API 1.14). A public route can answer with `page: { title, html, description? }`: Cleitext shows `html` (the plugin's own markup) as the content of a page of the active theme, with its header, menus and footer, not cached and with `noindex`. With `cacheTags` in the answer (API 1.17) the page is cached for visitors who are not signed in, like the theme's pages; `index: true` shows it to search engines, and `head` adds tags such as structured data (`{ tag: 'json-ld', data }`): a shop's catalog, for example. A route also answers behind a language prefix (`/cart` at `/it/cart`), and `request.locale` is the language of the address. `request.queryAll` (API 1.17) has every value of repeated query parameters (`?brand=a&brand=b`), where `request.query` keeps the last one. `request.origin` (API 1.16) is the site's address as the visitor reached it, for links in emails; `ctx.site(siteId)` gives the site's name and languages, and (API 1.37) `trailingSlash` when its addresses end with a slash. `request.cookies` holds only the plugin's own cookies, named `<slug>_…` (`-` in the slug becomes `_`); `cookies: [{ name, value, maxAge? }]` in the answer sets them, HTTP-only and `SameSite=Lax` (`maxAge: 0` deletes one). A cart, for example:

```ts
ctx.routes.public({
  method: 'GET',
  path: '/cart',
  handler: async (request) => {
    const cart = await loadCart(request.siteId, request.cookies.shop_cart);
    return { page: { title: 'Cart', html: renderCart(cart, request.locale) } };
  },
});
```

**Listings** (plugin API 1.20). A page that lists entries, such as a shop's catalog or one of its categories, says so with `archive: { type?, term?: { taxonomy, slug, name, description? } }` in `page`. Hooks then see an archive of that content type or term (`route: 'archive'`), so a theme builder applies its archive templates there, and blocks find the plugin's `html` in `context.page.archive.html` to show where an archive's entries go.

**Calls from other servers** (plugin API 1.10): an API route with `webhook: true` is anonymous and skips the origin check, for payment webhooks or clients such as Cleitext sites. The session is ignored even when a cookie comes with the request, so the handler must check who is calling, e.g. an HMAC signature over `rawBody`:

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

The official **Store** plugin uses them for the license server of paid themes.

**Uploads** (plugin API 1.7): `await request.file()` returns the `file` field of a `multipart/form-data` request as `{ filename, mime, data }` (a `Buffer`), or `null`; files over the server's upload limit (`MEDIA_MAX_BYTES`) get a 413. In the admin, `uploadFile(file, { path: '/ext/<slug>/…', onProgress })` from the admin SDK sends it with the CSRF token and reports the progress.

## 9. Settings, capabilities, cache, mail

### Public scripts and styles (plugin API 1.11)

Files for visitors (scripts, styles, fonts, images) go in the folder named by `public` in the manifest, e.g. `dist/public`. `plugin:build` fills it from `src/public`:

- every `.ts`, `.tsx`, `.js` file is bundled with its imports and minified (`.mts` becomes an ES module `.mjs`);
- `.css` files are minified;
- other files are copied;
- files and folders starting with `_` are only imported, never published.

They are served at `/plugin-assets/<slug>/<version>/<file>`, cached for a year (the version changes the address). Add them to pages with `ctx.assets` (needs `theme:hooks`):

```ts
// Only on pages that use the plugin's widget.
ctx.assets.enqueue({ file: 'slider.js', when: ({ html }) => html.includes('my-slider') });
ctx.assets.enqueue({ file: 'slider.css', when: ({ html }) => html.includes('my-slider') });
const font = ctx.assets.url('fonts/icons.woff2'); // the address, for your own markup
```

Styles go at the end of `<head>`, scripts before `</body>` (`defer`, or `type="module"` for `.mjs`). `when` receives the page's hook context and its final HTML.

### Extending a theme's options (plugin API 1.32)

A plugin can add settings, sections, header or footer builder elements, ready-made styles and block areas to a theme, by its slug: an add-on such as a "Pro" version of the theme. Call `ctx.themes.extend` in `setup` (needs `theme:hooks`):

```ts
ctx.themes.extend('zenit', {
  settingsSections: [{ id: 'pro-topbar', label: 'Top bar', parent: 'header' }],
  settings: [
    { name: 'topbarText', type: 'text', section: 'pro-topbar', label: 'Text', default: '' },
    {
      name: 'topbarSticky',
      type: 'boolean',
      section: 'pro-topbar',
      label: 'Sticky',
      default: false,
    },
  ],
  // Elements for the theme's zones fields, by field name.
  zoneItems: { headerLayout: [{ name: 'topbar', label: 'Top bar', section: 'pro-topbar' }] },
  presets: [{ id: 'pro-dark', label: 'Dark (Pro)', values: { topbarSticky: true } }],
  areas: { 'pro-topbar': 'Top bar' },
  areaDefaults: { 'pro-topbar': { schema: 1, blocks: [] } },
  // Options of menu items (plugin API 1.34), e.g. a mega menu.
  menuItemFields: [
    { field: { name: 'mega', type: 'boolean', label: 'Mega menu', default: false }, levels: 'top' },
  ],
});
```

- It applies on sites where the theme is active and the plugin is active. **Appearance → Customize** shows the added fields with the theme's, and the theme's templates get their values with `useThemeSettings()`, checked and with defaults, like its own; the added areas are edited in **Appearance → Areas**.
- Settings, sections and presets are added after the theme's; `zoneItems` adds elements to the theme's `zones` fields (unknown field names are ignored); areas are merged; `menuItemFields` (plugin API 1.34) are added after the theme's menu item options ([THEMES.md §4](THEMES.md)), shown in **Appearance → Menus** and given to the theme in `MenuItemView.data`. A setting, section, element, preset, area or menu item option whose name the theme already uses is ignored, with a warning in the log.
- The theme decides what to do with the values: an add-on targets a theme that reads them (for example by name, `settings.topbarText`), or renders its elements and areas.
- When the plugin is deactivated its fields leave Customize (and its menu item options leave Menus) and its values no longer reach the theme, but they stay stored and come back when it is activated again.

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

`mail:send`: `await ctx.mail.send({ to, subject, text, html?, replyTo?, siteId? })`, sent with the server's mail settings, or the site's own SMTP server with `siteId`. `html` (plugin API 1.16) is an HTML version of the message, such as an order confirmation; `text` stays for mail clients that show only text.

### Comments of a plugin

`comments` (plugin API 1.19): `ctx.comments.post(request, { entryId, type, content, meta?, authorName?, authorEmail? })` posts a comment of the plugin's own type (a review, a question) for the visitor of a public request, signed in or a guest, with the core's moderation, spam checks, limits and notifications; `meta` holds the plugin's data, such as a rating. The entry must be published; whether it takes them is the plugin's call. Errors carry a message for the visitor and a `status`. `ctx.comments.find(siteId, { entryId?, type?, status?, userId?, authorEmail?, limit?, offset? })` reads them (approved ones by default). They are moderated in Comments like the others, never shown in the entries' comment threads, and the `comment.created` and `comment.status` actions carry their `meta`.

### Scheduled tasks

`ctx.schedule.every(name, minutes, handler)` (plugin API 1.18) runs `handler(siteId)` about every `minutes` (at least 1) for each site where the plugin is active, e.g. to cancel unpaid orders or send a digest. No permission is needed. Tasks run in every server process, so a task must be harmless when two run at once (update rows with conditions, not by reading then writing).

### Requests to other services

`network` (plugin API 1.11): `await ctx.http.send({ url, method?, headers?, body?, timeoutMs? })` returns `{ status, type, text }`. Use it for webhooks, mailing lists and chat notifications. Only public `https` addresses are accepted: names resolving to the server's own network are refused when connecting, redirects are not followed, answers are cut at 1 MB and requests last 10 seconds by default (30 at most). With `binary: true` (plugin API 1.36) the answer is a file: its bytes come as `base64` (up to 5 MB) and `text` is empty, e.g. to copy a font or an image from an imported site.

```ts
const res = await ctx.http.send({
  url: 'https://hooks.example.com/notify',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: 'New message' }),
});
if (res.status >= 400) ctx.log.warn('Webhook refused', { status: res.status });
```

### Media

`media:read`: `await ctx.media.get(siteId, id)` returns an item of the media library (`url`, `mime`, `width`, `height`, `alt` by language), e.g. the image chosen in a `media` field. Entries returned by `ctx.content.find` / `get` carry their `parentId`.

`media:write` (API 1.30): `await ctx.media.fromUrl(siteId, url, { userId, alt?, filename? })` downloads a picture or a document from a public http(s) address into the library, as uploaded by that user (who needs `upload_media`); addresses of the server's own network are refused, the size limit of uploads applies and a file already in the library is reused. Imports use it for the pictures of other platforms.

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

A plugin that loads tracking scripts (analytics, ads, pixels) should also declare them (plugin API 1.4), so that the privacy plugin asks consent for their category, lists their cookies and describes them in the policies:

```ts
ctx.privacy.declareTrackers(async (siteId) => [
  {
    id: 'stats.plausible',
    name: 'Plausible',
    provider: 'Plausible Insights OÜ',
    category: 'statistics',
    requiresConsent: false, // anonymous, no cookies
    cookies: [],
    purpose: { en: 'We measure visits anonymously.', it: 'Misuriamo le visite in forma anonima.' },
  },
]);
```

Load scripts that need consent inert — `<script type="text/plain" data-cx-category="statistics">` — and the banner runs them after consent. `ctx.privacy.trackers(siteId)` (permission `privacy`) returns the declarations of the active plugins.

The email comes in lowercase. Only the plugins active on the site are asked. A plugin with the `privacy` permission (such as Privacy & GDPR) runs the requests: `ctx.privacy.exportPersonalData(siteId, email)` gathers the core's data (the account of a member of the site, its sessions, tokens and activity) and every exporter's; `ctx.privacy.erasePersonalData(siteId, email)` runs the erasers (accounts are kept: they are deleted from Users).

### Import

A plugin with the `import` permission can bring content from another system into a site (plugin API 1.8), as the official **WordPress Importer** does: it reads the other system's export, builds a **transfer document** (the format of `@cleitext/blocks/transfer`, the same as Cleitext's own exports) and hands it to the core:

```ts
import type { TransferDocumentInput } from '@cleitext/plugin-sdk';

const document: TransferDocumentInput = convert(file); // entries, media, terms, menus, users, redirects
const report = await ctx.transfer.importDocument(siteId, document, {
  userId: request.user!.id, // recorded as author of the import
  onProgress: (message) => ctx.log.info(message),
});
// { created: { entries: 12, media: 30, … }, skipped: {…}, warnings: […], errors: […] }
```

Entry content is made of blocks: `@cleitext/blocks/html` turns HTML and block markup into them (`htmlToCxd`). During an import (`keepUnknown`), WordPress blocks without an equivalent and shortcodes standing alone become `core/imported` placeholders: active plugins replace them through `import.block` and `import.shortcode` (API 1.36), and the rest keeps its text, with one report line per kind. In an Elementor page imported into Fresco, a shortcode's blocks go inside a Fresco plugin block element (the placeholder's `wrap`). For example, the official **Kross Booking** plugin turns `[kross-booking id="3" lang="it"]` into its block:

```ts
ctx.hooks.filter(
  'import.shortcode',
  (blocks, { tag, attrs }) =>
    blocks ?? (tag === 'kross-booking' ? [blockFromShortcode(attrs)] : null),
);
```

Media files are given by their http(s) address and downloaded only from public addresses, never from the server's own network. What is already on the site is kept, and old addresses (`oldPaths`) become redirects. A big site takes minutes: start the import without awaiting it in the route, and keep its progress in `ctx.storage`.

Entries may point to each other in any order: inside a document (or plugin data), `{ "$entry": "<entry ref>", "prefix": "entry:" }` becomes `prefix + <new id>` once every entry exists (`null` when that entry was not imported). Entries of a content type the site does not have (e.g. a plugin that is not active) are left out with one report line per type. Settings meant for a plugin go in `document.plugins` by plugin slug (API 1.28): after the entries, each active plugin gets its own through the `import.pluginData` filter, with media objects and entry references already remapped and `idMap` (`{ entries, terms, media }` by `ref`) for anything else; data that no active plugin takes is reported.

```ts
ctx.hooks.filter('import.pluginData', async (result, { siteId, slug, data }) => {
  if (slug !== ctx.plugin.slug) return result;
  await ctx.storage.set(siteId, 'settings', merge(await ctx.storage.get(siteId, 'settings'), data));
  return { warnings: [...(result?.warnings ?? []), 'Settings imported.'] };
});
```

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

The admin entry adds pages to the admin. They are listed in the sidebar and served at `/cl-admin/ext/<slug>/<path>` (`adminUrl(path)` from the admin SDK, plugin API 1.15, links to any admin screen):

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

- Page props: `plugin`, `site` (`id`, `name`, `defaultLocale`, `locales`), `user` (`id`, `displayName`, `locale`, `capabilities`) and `api`, which calls your endpoints (`api('GET', '/rsvps')` → `/api/v1/ext/<slug>/rsvps`).
- `editors(type?)` (API 1.26; missing on older sites, so check it first) lists the editors of the site: the block editor first (`{ id: 'blocks', plugin: null }`), then the [editors](#editors) of the active plugins that the user may use, for a content type when given. Each is `{ id, title, plugin, types?, fromBlocks?, toBlocks? }`, with the plugin's own converters; the block editor's return the document as it is. A tool can move content between editors with them: `toBlocks` of the editor that made the document (its `document.editor.id`, `blocks` when there is none), then `fromBlocks` of the other one. The **Convert Editors** plugin does this for many entries at once.
- `menu: false` hides a page from the sidebar. `capability` hides it from users without that capability.
- `icon` is the page's sidebar icon: SVG path data on a 24×24 grid, drawn as an outline like the core's icons (stroke 1.75, round ends, no fill). Pages without one, or with something that is not path data, get a puzzle piece.
- `parent` (API 1.25) makes a page a submenu item, as in WordPress: under another page of the plugin (its `path`, `''` for the main one) or under an admin section (`'/appearance'`, `'/settings'`, `'/users'`, `'/posts'`, `'/pages'`, `'/media'`, `'/plugins'`, and `'/tools'` from API 1.26). A page under `'/tools'` also gets a card on the **Tools** screen, with its `description` (API 1.26), a sentence on what it is for. The current entry shows its submenu below it; the others show it beside the sidebar on hover or focus.
- `link` (API 1.25) makes a menu entry that opens an admin address instead of a page, e.g. `{ path: 'options', title: 'Theme options', parent: '', link: '/appearance?tab=customize' }`; such an entry needs no `component`.
- `after` (API 1.25) puts a top-level entry right after an admin section instead of at the end of the sidebar, e.g. `after: '/appearance'` for a theme's own menu.
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

`entry` is `{ id, type, locale, title, slug, status }`; rows are `{ id, locale, title, status? }`. From API 1.24 an editor section also gets `draft`, the entry as it is being edited, before it is saved (`title`, `slug`, `excerpt`, `featuredMediaId`, `document`, `fields`; it renders again a moment after each change, e.g. for a live SEO analysis), and `setFields(group, values)`, which changes a field group's values like the sidebar's fields (saved with the entry). On older sites both are missing: check before using them. `navigate('/entries/<id>')` opens an admin address. `visible` hides a section or column, e.g. when the site has a single language.

<a id="editors"></a>**Editors** (plugin API 1.11). A plugin can offer an editor for entries instead of the block editor, such as a page builder. It takes the whole screen under the editor's top bar, which keeps the title, saving, preview and publishing:

```tsx
export default defineAdminPlugin({
  editors: [
    {
      id: 'builder', // stored as document.editor.id
      title: { en: 'Builder', it: 'Builder' },
      types: ['page'], // all types when omitted
      fromBlocks: (document) => convert(document), // optional
      component: BuilderEditor,
    },
  ],
});

function BuilderEditor({
  document,
  onChange,
  readOnly,
  frameUrl,
  media,
  openSettings,
}: EditorProps) {
  // Show the site in an iframe: frameUrl() is the page in the theme's layout,
  // with an empty [data-cx-editor-canvas] element where the content goes.
  // Call onChange with the whole document after every change.
}
```

- The top bar shows **Edit with …** for every editor that fits the entry's type. Switching converts the content with `fromBlocks` (and back with `toBlocks`). Without them, the page starts empty after a confirmation, and the old content stays in the revisions.
- Documents the editor saves carry `editor: { id, data? }`. `data` holds page-level settings. Such documents always open with that editor; when its plugin is not active, the admin says so instead of opening them in the block editor.
- Content blocks are ordinary CXD blocks, usually your plugin's own (§7). Revisions, autosaves, translations, export and the AI assistants keep working.
- After a revision or an autosave is restored, the editor is mounted again with the new `document`.
- `media.upload` and `media.list` give the media library. `openSettings()` opens the entry's settings (status, custom fields, revisions) over the editor.
- **Full screen** (API 1.27): `chrome: 'none'` in the definition hides the entry editor's top bar, and the editor draws its own, as page builders do.
  - It gets `host`: `{ title, setTitle, status, dirty, busy, error, canPublish, canSubmit, published, save(), publish(), submit(), preview(), back: { url, label } }`.
  - The actions never reject; a failure lands in `host.error`.
  - Ctrl/⌘+S in the admin page saves as usual. Inside your own frame, call `host.save()`.
- In the frame, React portals (`createPortal` from `react-dom`) can render into the iframe's document, since it has the same origin.

### Shared modules

These imports are provided by Cleitext at runtime and are not bundled. Do not install other versions of them:

| Server entry                                                                                      | Admin entry                                                                               |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@cleitext/plugin-sdk`, `react`, `react/jsx-runtime`, `zod`, `drizzle-orm`, `drizzle-orm/pg-core` | `@cleitext/admin-sdk`, `react`, `react/jsx-runtime`, `react-dom`, `@tanstack/react-query` |

Any other dependency (installed in your plugin's `node_modules`) is bundled by `plugin:build`.

**Types.** For type checking and editor support, add the SDK packages of your Cleitext version as development dependencies (`@cleitext/plugin-sdk`, `@cleitext/admin-sdk`, `react` types). Until they are published, install them from a Cleitext checkout (`npm install --save-dev /path/to/cleitext/packages/plugin-sdk`). They are not needed to build: `plugin:build` resolves them.

## 12. Permissions

| Permission      | Allows                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `content:read`  | `ctx.content.find` / `get`, `ctx.terms.find`                                                      |
| `content:write` | `ctx.content.registerType` / `registerTaxonomy` / `registerFieldGroup` / `copy`, `ctx.terms.copy` |
| `blocks`        | `ctx.blocks.register`                                                                             |
| `routes:admin`  | `ctx.routes.api`                                                                                  |
| `routes:public` | `ctx.routes.public`                                                                               |
| `settings:own`  | `ctx.settings.define` / `get`, `ctx.storage`                                                      |
| `languages`     | `ctx.languages` ([language plugins](#15-languages-language-plugins))                              |
| `theme:hooks`   | filters `render.*` and `theme.*`, `ctx.assets.enqueue`, `ctx.themes.extend` (API 1.32)            |
| `mail:send`     | `ctx.mail.send`                                                                                   |
| `network`       | `ctx.http.send`                                                                                   |
| `forms:protect` | filters `form.challenge` and `form.verify` (API 1.38)                                             |
| `privacy`       | `ctx.privacy.exportPersonalData` / `erasePersonalData`                                            |
| `media:read`    | `ctx.media.get`                                                                                   |
| `media:write`   | `ctx.media.fromUrl` (API 1.30)                                                                    |
| `import`        | `ctx.transfer.importDocument`                                                                     |

Administrators see the requested permissions in **Plugins → Details**. Your own tables (`ctx.db`), hooks on actions, logging, capabilities and cache invalidation need no permission.

## 13. Deactivation, updates, uninstall, errors

- **Deactivation** (per site) must never break the site. Content types disappear from the admin, their entries are no longer served (404, except for logged-in previews), and links to them leave the menus. Blocks render nothing, routes answer 404, filters stop. **Data is kept**: reactivating brings everything back.
- **Updates**: install the new version with `plugin:install`. New migrations run, running servers reload, and the previous files are kept in `<slug>.previous`.
- **Uninstall** (`plugin:uninstall`, every site) runs `onUninstall`, then drops the `plg_<slug>` schema, the plugin role and the plugin settings. Entries of its content types stay in the database and come back if the plugin is installed again.
- **Errors**: a plugin that fails to load is shown in Plugins with its error, and the rest of the site works. Errors and the time spent in hooks are listed in **Plugins → Details → Activity**.

## 14. Reference: field types

Used by content type fields, field groups, block attributes and settings.

| `type`       | Value            | Options                                                                                                                                                                        |
| ------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `text`       | string           | `maxLength`, `multiline`, `default`                                                                                                                                            |
| `url`        | string           | `default`. Accepts `http(s)://`, `/`, `mailto:`, `tel:`                                                                                                                        |
| `number`     | number           | `min`, `max`, `step`, `default`, `display: 'range'` (a slider), `unit` (shown beside it, e.g. `px`)                                                                            |
| `boolean`    | boolean          | `default`, `display: 'devices'` (with `responsive`: three device buttons, e.g. visibility)                                                                                     |
| `date`       | `YYYY-MM-DD`     | `default`                                                                                                                                                                      |
| `datetime`   | ISO 8601         | `default`                                                                                                                                                                      |
| `select`     | string           | `options: [{ value, label }]`, `default`                                                                                                                                       |
| `media`      | media id (uuid)  | an image of the media library                                                                                                                                                  |
| `color`      | `#rrggbb`        | `alpha` (also `#rrggbbaa`), `default`                                                                                                                                          |
| `choice`     | string           | `options: [{ value, label, image? }]`, `display: 'buttons' \| 'images'`, `default`                                                                                             |
| `code`       | string           | `language: 'css'`, `default`. Up to 100,000 characters, never `</style`                                                                                                        |
| `list`       | array of objects | `fields` (any type but `list`), `itemLabel` (the field that names an item), `max` (default 200), `default`                                                                     |
| `spacing`    | object           | `{ top, right, bottom, left, unit }`; options `units` (default `px`, `em`, `%`), `sides`, `corners` (radii), `default`                                                         |
| `background` | object           | `{ type: 'color' \| 'gradient' \| 'image', color, gradient, image, position, size, repeat, attachment, overlay }`; `palette`, `default`                                        |
| `typography` | object           | `{ family, weight, size: { desktop, tablet, mobile, desktopUnit… }, lineHeight, lineHeightUnit, letterSpacing, letterSpacingUnit, transform, decoration }`; `units`, `default` |
| `zones`      | object           | `devices`, `rows`, `items`, `default`: a header or footer builder (THEMES.md §4); not inside a `list`                                                                          |

Common options: `name` (letters, digits, `_`), `label`, `help`, `required`, `translation` and `hidden` (never shown in forms: data kept with the others, e.g. settings imported from another site). In settings forms, `section` puts a field in a tab (theme options, §4 of THEMES.md), `group` puts a heading above it, and `showIf` shows it only when other fields have some values: `{ field: 'header', equals: 'transparent' }`, `{ field: 'layout', in: ['left', 'right'] }`, `{ field: 'sidebar', not: 'none' }`, or several with `{ all: [...] }` / `{ any: [...] }`. A field without a value counts as its default. `inline: true` draws a field on the same line as the one before it, as just its control, with its label as tooltip (in Customize: a hover color's swatch beside the normal color's). Labels are strings or per-language objects (`{ en: 'Date', it: 'Data' }`). An optional field may be empty (`null`).

`responsive: true` (on `number`, `select`, `choice`, `boolean`, `spacing`, `background`, `color` and `text`) keeps a value per device, `{ desktop, tablet, mobile }`: a device without one uses the larger one's (`deviceValue(value, device)` in `@cleitext/shared`). A responsive `number` may have `units` (`['px', 'em']`), stored as `desktopUnit`, `tabletUnit`, `mobileUnit`. In Customize the device switch beside the label follows the preview. A `color` or `background` with `palette: { field, prefix }` also offers the theme's global colors: `field` is a list of `{ color }` items of the same form, and the value is `var(<prefix><index>)`, e.g. `var(--zn-global-color-0)`. Fonts of `typography` fields are checked against nothing but their spelling; `googleFonts()` in `@cleitext/shared` lists the Google families and weights.

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
