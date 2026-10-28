import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import type {
  FieldDefinition,
  FieldGroupInput,
  FieldValues,
  Label,
  OptionsPageInput,
} from '@cleitext/shared';
import type { PhpValue } from './php.js';
import type { HeadData, MenuItemView, PublicEntry, ThemeLocation } from '@cleitext/theme-sdk';
import type { BlockLocale } from './context.js';

/**
 * Hook catalog (docs/SPECIFICATIONS.md §8). Plugins add their own hooks with
 * declaration merging:
 *
 * ```ts
 * declare module '@cleitext/plugin-sdk' {
 *   interface Actions { 'events.rsvp': { eventId: string; email: string } }
 * }
 * ```
 */

/** An entry as hooks see it. */
export interface EntryEvent {
  id: string;
  siteId: string;
  type: string;
  locale: string;
  slug: string;
  title: string;
  status: string;
  fields: Record<string, unknown>;
  /** Ids of its terms by taxonomy slug, when known (plugin API 1.13). */
  terms?: Record<string, string[]>;
  /** Its featured image, when known (plugin API 1.13). */
  featuredMediaId?: string | null;
}

/** A taxonomy term as hooks see it. */
export interface TermEvent {
  id: string;
  siteId: string;
  taxonomy: string;
  locale: string;
  slug: string;
  name: string;
}

/** Actions (events): payload by name. Handlers run after the change is saved. */
export interface Actions {
  'entry.created': { entry: EntryEvent };
  'entry.saved': { entry: EntryEvent };
  'entry.published': { entry: EntryEvent };
  'entry.unpublished': { entry: EntryEvent };
  'entry.trashed': { entry: EntryEvent };
  'entry.deleted': { entry: EntryEvent };
  /**
   * An entry was copied (plugin API 1.21): duplicated in its language, or
   * copied into another one as a translation (`entry.locale !== from.locale`).
   * Emitted after `entry.created`, once the copy has its terms.
   */
  'entry.copied': { entry: EntryEvent; from: { id: string; locale: string } };
  'term.created': { term: TermEvent };
  'term.deleted': { term: TermEvent };
  /**
   * A term was created or changed (plugin API 1.49), with its field values
   * as saved (`term.fields`) and those it had before (`previous`, null for
   * a new term): e.g. to keep a two-way relation on the other side.
   */
  'term.saved': { term: TermEvent & { fields: FieldValues }; previous: FieldValues | null };
  /**
   * A person's user fields were saved on a site (plugin API 1.49): the
   * values as saved (every group) and those they had before.
   */
  'user.saved': {
    user: { id: string; siteId: string; fields: FieldValues };
    previous: FieldValues;
  };
  /** Languages and translations were imported for the site: see `ctx.languages.pending`. */
  'languages.pending': Record<string, never>;
  'media.uploaded': { media: { id: string; mime: string; filename: string; url: string } };
  'plugin.activated': { plugin: string };
  'plugin.deactivated': { plugin: string };
  /**
   * Pages of the site showing any of these tags changed (plugin API 1.9),
   * e.g. to purge them from a cache in front of Cleitext (Varnish, a CDN).
   * Emitted once per change, by the process that made it; `site` means
   * every page of the site.
   */
  'cache.invalidated': { tags: string[] };
  /** Someone created an account on the site (plugin API 1.12). */
  'user.registered': { user: { id: string; email: string; displayName: string } };
  /** A comment was posted, whatever its status (plugin API 1.12). */
  'comment.created': { comment: CommentEvent };
  /** A comment changed status: approved, spam, trash… (plugin API 1.12). */
  'comment.status': { comment: CommentEvent; from: string };
  /**
   * A visitor got a "not found" page (API 1.24), also when it came from the
   * page cache: e.g. for a 404 log. Emitted after the response is sent.
   */
  'request.notFound': {
    path: string;
    /** The query string without the `?` (at most 500 characters). */
    query: string;
    referrer: string | null;
    userAgent: string | null;
  };
  /**
   * A submission kept aside as spam was released as not spam (plugin API
   * 1.45, `ctx.forms.release` of a protection plugin): the plugin that owns
   * `form` (it starts with its slug) delivers it now, as if it had just
   * been sent and passed every check. Only forms verified with `hold: true`
   * are ever released.
   */
  'form.released': FormReleasedEvent;
  /**
   * A paid conversion (plugin API 1.58): an order paid, a booking confirmed,
   * a license sold, a lead sent. Announced by the plugin that made it with
   * `ctx.conversions.paid`, delivered once its transaction committed;
   * e.g. for an affiliate program or a report. The same `source` and `id`
   * may be announced again (an order paid, put on hold, paid again): keep
   * the first.
   */
  'conversion.paid': ConversionEvent;
  /**
   * A conversion refunded or cancelled, all of it or part of it (plugin API
   * 1.58, `ctx.conversions.reversed`): `amount` is what this reversal takes
   * back; without it, everything that was left.
   */
  'conversion.reversed': ConversionReversal;
  /**
   * A visitor arrived through a referral link (plugin API 1.58): a public
   * page asked with the parameter of a plugin's `ctx.referrals.capture`,
   * e.g. `?ref=anna`. Only the plugin named by `plugin` should count it.
   * Sent by the page's script (pages stay cached), without the visitor's
   * address: count visits, do not identify people.
   */
  'referral.visit': ReferralVisitEvent;
}

/** What kind of conversion it is (plugin API 1.58). */
export type ConversionKind = 'order' | 'booking' | 'license' | 'lead';

/** A conversion as its plugin announces it (`ctx.conversions.paid`, plugin API 1.58). */
export interface ConversionInput {
  kind: ConversionKind;
  /** The plugin's own id of what was converted, e.g. the order's id: unique in the plugin. */
  id: string;
  /**
   * What the customer paid, as a decimal string in the currency's units
   * (`'49.90'`), as Cleishop stores money; `'0'` for leads and free bookings.
   */
  amount: string;
  /** ISO 4217 code, e.g. `EUR`; empty when the amount is 0 and there is no currency. */
  currency: string;
  customer: { email: string; userId?: string | null };
  /** What was bought (optional), each with its amount as above. */
  items?: { id: string; name: string; amount: string }[];
  /** A short name for people, e.g. `Order #1024` (optional). */
  label?: string;
  /** When it happened (ISO 8601); now when omitted. */
  at?: string;
  /**
   * The referral codes the customer came with, by the slug of the plugin
   * that captured them (`RouteRequest.referrals` at checkout, kept with the
   * order until it is paid). Omit when unknown.
   */
  referrals?: Record<string, string>;
}

/** A conversion as listeners get it (`conversion.paid`, plugin API 1.58). */
export interface ConversionEvent extends Required<Omit<ConversionInput, 'customer' | 'label'>> {
  /** The slug of the plugin that announced it: `shop`, `agenda`, `store`, `forms`… */
  source: string;
  customer: { email: string; userId: string | null };
  label?: string;
}

/** A refund or a cancellation, as its plugin announces it (`ctx.conversions.reversed`). */
export interface ConversionReversalInput {
  /** The id given to `ctx.conversions.paid`. */
  id: string;
  /** What this reversal takes back (decimal string); omitted: everything that was left. */
  amount?: string;
  reason?: 'refund' | 'cancel';
  /** When it happened (ISO 8601); now when omitted. */
  at?: string;
}

/** A refund or a cancellation as listeners get it (`conversion.reversed`, plugin API 1.58). */
export interface ConversionReversal {
  source: string;
  id: string;
  amount?: string;
  reason: 'refund' | 'cancel';
  at: string;
}

/** A visit through a referral link (`referral.visit`, plugin API 1.58). */
export interface ReferralVisitEvent {
  /** The plugin whose parameter the address had. */
  plugin: string;
  /** The code, as given (letters, digits, `-` and `_`, at most 64). */
  code: string;
  /** The page visited, without the query. */
  path: string;
  /** The host of the page the visitor came from, if any (no path, no query). */
  referrer: string | null;
  /** The visitor's consent allowed the referral cookie: the link can be credited later. */
  stored: boolean;
}

/** A held submission released as not spam (`form.released`, plugin API 1.45). */
export interface FormReleasedEvent {
  /** The form's id, e.g. `forms/contact`. */
  form: string;
  /** The language of the page it was sent from. */
  locale: string;
  /** The submitted values, as they were given to `form.verify`. */
  fields: Record<string, unknown>;
}

export interface CommentEvent {
  id: string;
  entryId: string;
  parentId: string | null;
  type: string;
  status: 'pending' | 'approved' | 'spam' | 'trash';
  userId: string | null;
  authorName: string;
  authorEmail: string;
  content: string;
  /** Plugin data of the comment, e.g. a review's rating (plugin API 1.19). */
  meta?: Record<string, unknown>;
}

/** Context of the `cache.headers` filter: a public response going into the page cache. */
export interface CacheHeadersContext {
  siteId: string;
  /** Host name of the request, without the port. */
  host: string;
  path: string;
  status: number;
  /** Its page-cache tags, e.g. `site`, `entry:<id>`, `type:article`. */
  tags: string[];
}

/** The page of the posts on its archive (`RenderHookContext.postsPage`, plugin API 1.55). */
export interface RenderPostsPage {
  id: string;
  type: string;
  locale: string;
  title: string;
  url: string;
  /** Its own excerpt, if it has one. */
  excerpt: string | null;
  /** Its field values, e.g. the search title of an SEO plugin. */
  fields: Record<string, unknown>;
}

/** Context of the public-rendering filters. */
export interface RenderHookContext {
  siteId: string;
  locale: string;
  route: 'entry' | 'archive' | 'search' | '404' | 'maintenance';
  path: string;
  /** Set on single entries. */
  entry?: PublicEntry;
  /** Adds a page-cache tag, so the page refreshes when that data changes. */
  tag(tag: string): void;
  /** The page is shown inside a visual editor (`PageContext.editorFrame`). */
  editorFrame?: boolean;
  /** Entries: the entry is the site's home page. */
  isFrontPage?: boolean;
  /** Archives: the term (taxonomy and slug) or the content type listed; `home` for the latest posts on the home page. */
  archive?: { taxonomy?: string; term?: string; type?: string; home?: boolean };
  /**
   * Archives: the page set as the page of the posts (Settings → Reading),
   * on its archive of the latest posts (plugin API 1.55; missing on older
   * cores), so SEO plugins use its own search title and description, as
   * WordPress's do on the posts page.
   */
  postsPage?: RenderPostsPage;
  /**
   * Archives and searches: the page shown and how many there are (plugin API
   * 1.57; missing on older cores), for titles such as Yoast SEO's
   * "Page 2 of 22".
   */
  pagination?: { page: number; pages: number };
  /**
   * The visitor is signed in (plugin API 1.33). Their pages are never
   * cached, so content may depend on it.
   */
  signedIn?: boolean;
}

/**
 * A maintenance page given by a plugin (`render.maintenance`, plugin API
 * 1.35): a whole HTML document, sent instead of the theme's.
 */
export interface MaintenancePage {
  /** The complete document, from `<!doctype html>` on. */
  html: string;
  /** Seconds until the site is expected back (`Retry-After`); default 3600. */
  retryAfter?: number;
}

/** Context of the `render.maintenance` filter. */
export interface MaintenanceContext {
  siteId: string;
  /** The language of the page asked for (its address prefix), or the default one. */
  locale: string;
  /** The site's default language. */
  defaultLocale: string;
  /** The site's address as the visitor reached it, e.g. `https://example.com`. */
  origin: string;
  path: string;
  site: {
    /** Title and tagline in `locale`. */
    title: string;
    tagline: string;
    /** IANA time zone of the site (Settings → General), for dates. */
    timezone: string;
    /** Addresses of the theme's logo and site icon (`logo`, `favicon` settings), when set. */
    logoUrl?: string;
    iconUrl?: string;
  };
  /** Shown to an administrator as a preview (Settings → General), not to a visitor. */
  preview?: boolean;
}

/**
 * A form of the site that can be protected against bots (plugin API 1.38):
 * `core/login`, `core/register`, `core/lost-password`, `core/reset-password`,
 * `core/comment`, or a plugin's form named `<slug>/<form>`, e.g.
 * `forms/<block id>`, `shop/checkout`, `fresco-pro/form`, `prisma/form`.
 */
export interface FormChallengeContext {
  siteId: string;
  /** The form's stable id (see above). */
  form: string;
  /** The page's language. */
  locale: string;
  /** The visitor is signed in. Pages of guests may be cached: keep the markup the same for all of them. */
  signedIn: boolean;
}

/** Context of the `form.verify` filter (plugin API 1.38). */
export interface FormVerifyContext {
  siteId: string;
  form: string;
  /** The page's language, for the message. */
  locale: string;
  /**
   * The submitted values, the fields of the challenge included (e.g.
   * `cf-turnstile-response`, `g-recaptcha-response`). Read only what you need.
   */
  fields: Record<string, unknown>;
  /** The visitor's address as the core sees it (`TRUST_PROXY` behind a proxy). */
  ip: string;
  /** Host name of the request, without the port, when known. */
  host?: string;
  signedIn: boolean;
  /**
   * The form can keep a submission aside as spam and deliver it later, when
   * it is released (`form.released`, plugin API 1.45): core comments and
   * the forms that listen to `form.released`. Without it, a `spam` verdict
   * refuses the submission.
   */
  hold?: boolean;
}

/**
 * Origins the challenge needs in the admin (`form.sources`, plugin API
 * 1.38), e.g. `https://challenges.cloudflare.com`: the admin's Content
 * Security Policy allows only these for scripts and frames, besides its own.
 */
export interface FormSources {
  script: string[];
  frame: string[];
}

/**
 * An email on its way out (`mail.deliver`, plugin API 1.60), as the core
 * checked it: plain addresses, one-line subject.
 */
export interface OutgoingMail {
  /** The From header the core would use, `"Name" <address>` or an address. */
  from: string;
  /** True when the sender was chosen for this message (a plugin's `from`), not the site's. */
  fromChosen: boolean;
  to: string[];
  cc: string[];
  /** Hidden copies: never put them in a header. */
  bcc: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments: { filename: string; content: Uint8Array; contentType: string }[];
}

export interface MailDeliverContext {
  siteId: string;
  message: OutgoingMail;
}

/** The SMTP server a plugin hands the core for one message (`mail.deliver`). */
export interface MailDeliverSmtp {
  /** A host name: addresses, `localhost` and names without a dot are refused. */
  host: string;
  port: number;
  /** `tls`: encrypted from the start (465); `starttls`: upgraded (587); `none`. */
  security: 'tls' | 'starttls' | 'none';
  user?: string;
  password?: string;
}

/**
 * What a transport plugin did with an email (`mail.deliver`):
 * - `{ delivered: true }`: the plugin sent it itself, e.g. through its service's API;
 * - `{ smtp }`: the core sends it through that SMTP server;
 * - `from` (both): the sender to use instead, honored only when `fromChosen` is false.
 */
export type MailDeliverResult =
  { delivered: true; from?: string } | { smtp: MailDeliverSmtp; from?: string };

/** What a protection plugin says of a submission (`form.verify`). */
export interface FormVerifyResult {
  ok: boolean;
  /** Shown to the visitor when `ok` is false, in `locale`. */
  message?: string;
  /**
   * With `ok: true` (plugin API 1.45): the submission looks like spam. A
   * form verified with `hold` keeps it aside (core comments get the `spam`
   * status) and answers the visitor as if it went through; other forms
   * refuse it with `message`.
   */
  spam?: boolean;
  /**
   * With `ok: false` (plugin API 1.45): answer the visitor as if the
   * submission went through, and drop it (for obvious bots).
   */
  silent?: boolean;
  /**
   * A challenge (a captcha) decides (plugin API 1.45). With `ok: true`, set
   * by a plugin that is unsure: a captcha plugin that runs later checks the
   * submission and clears `spam` when it passes; when no plugin takes it up,
   * it is ignored. With `ok: false`: the visitor must solve the challenge
   * first, so the form shows it (see `window.cleitextChallenge.require`).
   */
  challenge?: boolean;
}

/** A problem with a value, shown under its field in the editor. */
export interface FieldError {
  /** `fields.<name>`, `fields.<group>.<name>` (also `fields.<group>.<list>.<row>.<name>`), or `title`. */
  path: string;
  message: string;
}

/** Context of the `entry.validate` filter (plugin API 1.47). */
export interface EntryValidateContext {
  siteId: string;
  /** The person saving. */
  userId: string;
  /** Publishing (or updating a published entry): required fields were checked. */
  publishing: boolean;
  entry: {
    /** Null while the entry is being created. */
    id: string | null;
    type: string;
    locale: string;
    status: string;
    title: string;
    template: string | null;
    parentId: string | null;
    /** Ids of its terms, all taxonomies. */
    terms: string[];
  };
  /** The values being saved, checked by the core. */
  fields: Record<string, unknown>;
  /** The field groups shown for the entry (their values are under `fields[<id>]`). */
  groups: { id: string; fields: FieldDefinition[] }[];
}

/** Filters (transformations): `[value, context]` by name. */
export interface Filters {
  /**
   * Checks an entry before it is saved (plugin API 1.47), after the core
   * checked its fields: add problems to the list (`[...errors, { path,
   * message }]`) to refuse the save; they show under the fields in the
   * editor. Keep the others' errors. No permission needed.
   */
  'entry.validate': [errors: FieldError[], context: EntryValidateContext];
  /**
   * Markup placed inside a form, before its submit button (plugin API 1.38,
   * needs `forms:protect`), e.g. a captcha widget with its `<script>` tags.
   * Add to the value (`html + mine`); `''` (the starting value) shows
   * nothing. Forms ask through `ctx.forms.challenge`; the core's own sign-in,
   * sign-up, password and comment forms ask too.
   */
  'form.challenge': [html: string, context: FormChallengeContext];
  /**
   * Checks a submission of a protected form (plugin API 1.38, needs
   * `forms:protect`): `{ ok: false, message }` refuses it with that message,
   * `{ ok: true }` or `null` (the starting value) lets it through. Keep a
   * refusal given by another plugin. A handler that throws or times out is
   * skipped, so catch your own errors and decide. Since plugin API 1.45 the
   * result can also flag spam, drop a bot silently or ask for a challenge
   * (see `FormVerifyResult`).
   */
  'form.verify': [result: FormVerifyResult | null, context: FormVerifyContext];
  /**
   * Origins the admin's sign-in challenge loads scripts and frames from
   * (plugin API 1.38, needs `forms:protect`): the admin's Content Security
   * Policy adds them, and only them. Return none when the admin is not
   * protected. Only `https://` origins, with an optional path, are kept.
   */
  'form.sources': [sources: FormSources, context: { siteId: string }];
  /**
   * Delivers the site's emails (plugin API 1.60, needs `mail:transport`):
   * every email of the site goes through it, password resets included.
   * Return `{ delivered: true }` once sent, or `{ smtp }` to have the core
   * send it through that server; `null` (the starting value) leaves the email
   * to the site's own SMTP settings or the server's. Keep a result given by
   * another plugin. Throw when sending fails: the core then sends the email
   * the usual way and logs a warning, so the site never stops sending.
   * Runs with the time limit of background jobs.
   */
  'mail.deliver': [result: MailDeliverResult | null, context: MailDeliverContext];
  /** Title, meta tags and extra `<head>` tags of a public page (needs `theme:hooks`). */
  'render.head': [head: HeadData, context: RenderHookContext];
  /** Blocks of an entry before rendering, e.g. to add a details box (needs `theme:hooks`). */
  'render.blocks': [blocks: CxdBlock[], context: RenderHookContext & { entry: PublicEntry }];
  /**
   * Content for the theme's locations (header, footer, single, archive),
   * replacing what the theme shows there, e.g. templates of a theme builder
   * (needs `theme:hooks`). Themes mark them with `<Location>`. Since plugin
   * API 1.33, `hook:<name>` keys fill the hook points a theme marks in its
   * layout (e.g. `hook:zenit_header_before`), which are empty otherwise.
   */
  'render.locations': [
    locations: Partial<Record<ThemeLocation, CxdDocument>>,
    context: RenderHookContext,
  ];
  /**
   * The menus of a public page, by theme location, before the theme and the
   * blocks get them (plugin API 1.54, needs `theme:hooks`): add, replace or
   * remove items, e.g. a language switcher as menu items, shown by every
   * theme as its own menu. Items need a unique `id`, a `label` and a `url`
   * (unsafe addresses are dropped); `current` marks the page shown.
   * `locales` are the site's languages with this page's address in each
   * (empty on sites with one language).
   */
  'render.menus': [
    menus: Record<string, MenuItemView[]>,
    context: RenderHookContext & { locales: BlockLocale[] },
  ];
  /** Final HTML of a public page; use sparingly (needs `theme:hooks`). */
  'render.html': [html: string, context: RenderHookContext];
  /**
   * The page visitors get while the site is in maintenance mode (plugin API
   * 1.35, needs `theme:hooks`): return a page to send it, with status 503,
   * `Retry-After` and `X-Robots-Tag: noindex`, instead of the theme's
   * `maintenance` template; `null` leaves it to the theme. Signed-in users
   * still see the site.
   */
  'render.maintenance': [page: MaintenancePage | null, context: MaintenanceContext];
  /**
   * The "Edit" link of the toolbar shown to signed-in users on an entry, e.g.
   * "Edit with <builder>" for entries made with a page builder; `null` hides
   * it (plugin API 1.29, needs `theme:hooks`).
   */
  'render.adminBarEdit': [link: AdminBarEditLink | null, context: AdminBarEditContext];
  /** Template names tried in order, e.g. `entry-event` (needs `theme:hooks`). */
  'theme.templateCandidates': [candidates: string[], context: RenderHookContext];
  /**
   * Site title and tagline in a language other than the default one, e.g.
   * translated by the language plugin (needs `languages`). Never called for
   * the default language.
   */
  'site.strings': [
    strings: { title: string; tagline: string },
    context: { siteId: string; locale: string },
  ];
  /**
   * What entries are for, shown next to their title in the admin, e.g. a
   * plugin's own pages: `states[id].push({ key: 'privacy', label: { en: 'Privacy policy' } })`.
   * The core already marks the front, posts and 404 pages. No permission needed.
   */
  'entry.states': [
    states: Record<string, { key: string; label: Label }[]>,
    context: { siteId: string; ids: string[] },
  ];
  /**
   * Extra headers of public responses that the page cache keeps (plugin API
   * 1.9, needs `theme:hooks`), e.g. for a cache in front of Cleitext: a
   * `Cache-Control` with `s-maxage`, `CDN-Cache-Control`, the tags of the
   * page. Signed-in visitors never get them: their pages are not cached.
   */
  'cache.headers': [headers: Record<string, string>, context: CacheHeadersContext];
  /**
   * Links on a visitor's account page (plugin API 1.17), e.g. a shop's
   * orders and addresses: `[...links, { label: 'Orders', url: \`${context.base}/orders\` }]`.
   * `base` is the account's address in the page's language (`/it/account`).
   */
  'account.links': [
    links: { label: string; url: string }[],
    context: { siteId: string; locale: string; userId: string; base: string },
  ];
  /**
   * A WordPress block that Cleitext has no equivalent for, during an import
   * (plugin API 1.23): return blocks of the plugin to use instead, e.g. a
   * block library's own. `attrs` are the block comment's JSON, `html` its
   * markup, `children` its inner blocks already converted. Without an
   * answer, its text is kept. Inner blocks come first.
   */
  'import.block': [
    blocks: CxdBlock[] | null,
    context: {
      siteId: string;
      name: string;
      attrs: Record<string, unknown>;
      html: string;
      children: CxdBlock[];
    },
  ];
  /**
   * A WordPress shortcode standing alone during an import (plugin API 1.36):
   * on its own line or paragraph of the content, in a Shortcode block, or in
   * an Elementor shortcode, text or HTML widget. Return blocks of the plugin
   * to use instead, e.g. `[my-form id="3"]` → the plugin's form block.
   * `attrs` are its attributes by lowercase name (positional ones by index:
   * `0`, `1`…), `content` the text between `[tag]` and `[/tag]` (null when
   * it encloses none), `text` the shortcode as written. In a page builder's
   * page (an Elementor page imported into Fresco), each block is placed in
   * the builder's element for plugin blocks. Without an answer, the
   * shortcode stays as text; the import report counts both.
   */
  'import.shortcode': [
    blocks: CxdBlock[] | null,
    context: {
      siteId: string;
      tag: string;
      attrs: Record<string, string>;
      content: string | null;
      text: string;
    },
  ];
  /**
   * Class and id names of WordPress markup that the plugin renders under its
   * own names (plugin API 1.53), e.g. a block library's
   * `{ 'uagb-ifb-separator': 'pr-info-box__separator' }`: the Additional CSS
   * of a WordPress import (Customize's, a child theme's rules) is rewritten
   * with them, whole names only and in selectors only (not in declarations,
   * strings, `url()` or comments), and the report lists the rewrites. Add
   * yours and keep the others' (`{ ...classes, ...mine }`). Called once per
   * WordPress import that has Additional CSS, after the theme's
   * `importCssPrefixes`. No permission needed.
   */
  'import.cssClasses': [classes: Record<string, string>, context: { siteId: string }];
  /**
   * The meta of a WordPress export during its import (plugin API 1.48): every
   * item's post meta (also of WordPress's own types, e.g. ACF's field groups
   * and fields, which are not imported as content), every term's term meta,
   * and the site options when the export has them. Called once per import,
   * before anything is written. Add to the result (keep the others'): field
   * values for the imported entries and terms, by their ref; field groups,
   * options pages and option values, created before the values. Refs in
   * values: `{ $media: 'att:<attachment id>' }`, `{ $entry: 'post:<post id>' }`,
   * `{ $term: '<term ref>' }` (see `WxrMetaTerm.ref`). Needs `import`.
   */
  'import.wxrMeta': [result: WxrMetaResult, context: WxrMetaContext];
  /**
   * The plugins' own data in a site export (`cleitext export`, plugin API
   * 1.46): `document.plugins`, by plugin slug. Add your data under your slug
   * and keep the others' (`{ ...data, [slug]: mine }`); it comes back through
   * `import.pluginData`. Write media as objects `{ id: <media id>, url }`
   * and entries as `{ $entry: <entry id> }`: the import remaps them to the
   * new site's media and entries.
   */
  'export.pluginData': [data: Record<string, unknown>, context: { siteId: string }];
  /**
   * Data for this plugin in an imported transfer document (plugin API 1.28):
   * `document.plugins[slug]`, e.g. a page builder's site settings converted
   * from another system. Called once per slug, after the entries, media and
   * terms were imported; media objects `{ id: <media ref>, url }` and entry
   * references `{ $entry: <ref> }` in `data` are already remapped, and
   * `idMap` gives the new ids of every imported record. Return a result (with
   * report lines) when the data was taken: a slug that no active plugin takes
   * is reported as not imported.
   */
  'import.pluginData': [
    result: ImportPluginDataResult | null,
    context: {
      siteId: string;
      /** The plugin the data is for: answer only for your own slug. */
      slug: string;
      data: unknown;
      idMap: ImportIdMap;
      /** The user the import runs as. */
      userId: string;
    },
  ];
  /**
   * Title of an RSS feed (plugin API 1.22): the site's, or "<term> – <site>"
   * for a category's or tag's, e.g. with an SEO plugin's separator.
   */
  'feed.title': [
    title: string,
    context: {
      siteId: string;
      locale: string;
      siteTitle: string;
      term: { taxonomy: string; slug: string; name: string } | null;
    },
  ];
  /** Content types and taxonomies that get an XML sitemap (all by default). */
  'sitemap.sources': [sources: SitemapSource[], context: { siteId: string }];
  /** The addresses of one XML sitemap: remove pages kept out of search, add images… */
  'sitemap.urls': [
    urls: SitemapUrl[],
    context: { siteId: string; kind: SitemapSource['kind']; slug: string; locale: string },
  ];
  /**
   * The text of /robots.txt (API 1.24), e.g. rules written by the site's
   * owner in an SEO plugin. When the site asks search engines to stay away,
   * the text is `Disallow: /` whatever the filters return.
   */
  'robots.txt': [
    text: string,
    context: { siteId: string; origin: string; sitemap: string; discourageSearchEngines: boolean },
  ];
}

/** A WordPress item with its post meta (`import.wxrMeta`, plugin API 1.48). */
export interface WxrMetaItem {
  /**
   * `post:<id>`, `att:<id>` for attachments: the ref of the entry or media
   * made from it (see `imported`).
   */
  ref: string;
  /** WordPress's post id. */
  id: number;
  /** WordPress's post type, e.g. `post`, `page`, `acf-field-group`, `acf-field`. */
  type: string;
  /** WordPress's status, e.g. `publish`, `draft`, `acf-disabled`. */
  status: string;
  /** `post_name` (ACF: the field or group key, e.g. `field_5f1…`). */
  name: string;
  title: string;
  /** `content:encoded` as exported (ACF: the serialized settings). */
  content: string;
  /** `excerpt:encoded` (ACF fields: their name). */
  excerpt: string;
  /** `post_parent` (0 for none). */
  parent: number;
  menuOrder: number;
  /** Whether it is imported as an entry (or a media file), with `ref`. */
  imported: boolean;
  /** Post meta by key (its first value): serialized arrays as text (see `unserialize`). */
  meta: Record<string, string>;
}

/** A WordPress term with its term meta (`import.wxrMeta`, plugin API 1.48). */
export interface WxrMetaTerm {
  /** The ref of the imported term (e.g. `category:news`), when `imported`. */
  ref: string;
  /** WordPress's term id. */
  id: number;
  /** WordPress's taxonomy, e.g. `category`, `post_tag`, `genre`. */
  taxonomy: string;
  slug: string;
  name: string;
  imported: boolean;
  meta: Record<string, string>;
}

/** What `import.wxrMeta` gets besides the result. */
export interface WxrMetaContext {
  siteId: string;
  /** The language the content is imported in. */
  locale: string;
  items: WxrMetaItem[];
  terms: WxrMetaTerm[];
  /** Site options by name, when the export has them; null otherwise (a WordPress export has none). */
  options: Record<string, string> | null;
  /**
   * The export's authors (plugin API 1.49), e.g. for user fields: WordPress
   * stores a person as their id, written in values as `{ $user: author.ref }`.
   * The import gives refs the imported member (or the member of the site
   * with that email); people not imported become null.
   */
  authors: WxrMetaAuthor[];
  /**
   * The content types and taxonomies the importer made of WordPress's
   * custom ones (plugin API 1.49): Cleitext slug by WordPress name.
   */
  types: Record<string, string>;
  taxonomies: Record<string, string>;
  /** PHP's `unserialize()` (undefined for text that is not serialized). */
  unserialize(text: string): PhpValue | undefined;
  /** A meta value: serialized PHP or JSON decoded, the text otherwise. */
  metaValue(text: string | undefined): unknown;
}

/** What plugins make of a WordPress export's meta (`import.wxrMeta`). */
export interface WxrMetaResult {
  /** Field values of imported entries, by item ref: added to theirs (each group as a whole). */
  entries: Record<string, FieldValues>;
  /** Field values of imported terms, by term ref. */
  terms: Record<string, FieldValues>;
  /** Field groups of the site's owners, created before the values (existing ids are kept). */
  fieldGroups: FieldGroupInput[];
  /** Options pages of the site's owners, created before the values. */
  optionsPages: OptionsPageInput[];
  /** Values of options pages (all of them in the default language unless `locale`). */
  options: { page: string; locale?: string; fields: FieldValues }[];
  /**
   * Content types to create or describe (plugin API 1.49), e.g. from ACF's
   * post types: by slug, their name, `hierarchical` and permalink replace
   * what the importer guessed; new slugs are added (the import creates them
   * before the entries). Missing on older cores.
   */
  contentTypes?: WxrMetaContentType[];
  /** Taxonomies to create or describe, likewise (their `contentTypes` are added). */
  taxonomies?: WxrMetaTaxonomy[];
  /** Lines added to the import report. */
  warnings: string[];
}

/** An author of a WordPress export (`import.wxrMeta`, plugin API 1.49). */
export interface WxrMetaAuthor {
  /** WordPress's user id, as user fields store it. */
  id: number;
  login: string;
  email: string;
  displayName: string;
  /** The ref to write in values: `{ $user: ref }` (`user:<login>`). */
  ref: string;
}

/** A content type made or described by a plugin during a WordPress import (plugin API 1.49). */
export interface WxrMetaContentType {
  /** Lowercase letters, digits, `-` and `_`, at most 32 characters. */
  slug: string;
  name: Record<string, string>;
  hierarchical?: boolean;
  /** `/events/{slug}`; built from the slug when omitted. */
  permalink?: string;
}

/** A taxonomy made or described by a plugin during a WordPress import (plugin API 1.49). */
export interface WxrMetaTaxonomy {
  slug: string;
  name: Record<string, string>;
  hierarchical?: boolean;
  /** Content type slugs it groups. */
  contentTypes?: string[];
}

/** The input of `import.wxrMeta`, as an import plugin gives it with its document. */
export interface WxrMetaInput {
  items: WxrMetaItem[];
  terms: WxrMetaTerm[];
  options?: Record<string, string> | null;
  /** The export's authors (plugin API 1.49). */
  authors?: WxrMetaAuthor[];
  /** Cleitext slugs of WordPress's custom post types and taxonomies (plugin API 1.49). */
  types?: Record<string, string>;
  taxonomies?: Record<string, string>;
}

/** New ids of the records of an imported transfer document, by their `ref`. */
export interface ImportIdMap {
  entries: Record<string, string>;
  terms: Record<string, string>;
  media: Record<string, { id: string; url: string }>;
}

/** The edit link of the toolbar on the public site (`render.adminBarEdit`). */
export interface AdminBarEditLink {
  label: string;
  /** An address of the admin, e.g. `/cl-admin/entries/<id>`. */
  href: string;
}

export interface AdminBarEditContext {
  siteId: string;
  /** The language of the signed-in user's admin (`en`, `it`…). */
  locale: string;
  entry: {
    id: string;
    type: string;
    /** The editor the entry is made with (`document.editor.id`), if not the block editor. */
    editor?: string;
  };
}

/** What a plugin did with its data of an import (`import.pluginData`). */
export interface ImportPluginDataResult {
  /** Lines added to the import report. */
  warnings?: string[];
}

/** What can have an XML sitemap: a content type or a taxonomy. */
export interface SitemapSource {
  kind: 'type' | 'taxonomy';
  slug: string;
}

/** An address of an XML sitemap, as the `sitemap.urls` filter sees it. */
export interface SitemapUrl {
  /** Absolute address. */
  loc: string;
  /** ISO date of the last change, or null. */
  lastmod: string | null;
  /** Absolute addresses of the images of the page. */
  images: string[];
  /** The same page in other languages (hreflang). */
  alternates: { hreflang: string; href: string }[];
  /** The entry, for content type sitemaps. */
  entry?: { id: string; type: string; fields: Record<string, unknown> };
  /** The term, for taxonomy sitemaps. */
  term?: { id: string; taxonomy: string };
}

/** Context of action handlers. */
export interface HookContext {
  siteId: string;
  /** The user whose change emitted the action, when there is one. */
  userId?: string;
}

export interface HookOptions {
  /** Lower runs first. Default 10, as in WordPress. */
  priority?: number;
}

export type ActionHandler<K extends keyof Actions> = (
  payload: Actions[K],
  context: HookContext,
) => void | Promise<void>;

export type FilterHandler<K extends keyof Filters> = (
  value: Filters[K][0],
  context: Filters[K][1],
) => Filters[K][0] | Promise<Filters[K][0]>;

/**
 * Hook bus as seen by a plugin. Handlers only run on sites where the plugin
 * is active. An error in a handler is logged and does not stop the others.
 */
export interface HookApi {
  on<K extends keyof Actions>(name: K, handler: ActionHandler<K>, options?: HookOptions): void;
  filter<K extends keyof Filters>(name: K, handler: FilterHandler<K>, options?: HookOptions): void;
  /** Emits an action declared by this plugin (its name must start with `<slug>.`). */
  emit<K extends keyof Actions>(name: K, payload: Actions[K], context: HookContext): Promise<void>;
}
