import { z } from 'zod';

/** General settings of a site (RF-SET-01), namespace `core`. */
const coreSettingsFields = {
  /** Public title; the site name when empty. */
  title: z.string().trim().max(200),
  tagline: z.string().trim().max(300),
  /** Static front page (a page in the default language), or the latest posts. */
  frontPage: z.uuid().nullable(),
  /** Page that lists the posts when a static front page is set. */
  postsPage: z.uuid().nullable(),
  postsPerPage: z.number().int().min(1).max(100),
  /** Page shown for "not found" (in the default language), or the theme's 404. */
  errorPage: z.uuid().nullable(),
  /** Ask search engines not to index the site. */
  discourageSearchEngines: z.boolean(),
  /**
   * Public addresses end with a slash (`/about/`), as WordPress's: the other
   * form redirects (301). Off: `/about`, as before.
   */
  trailingSlash: z.boolean(),
  /** Days before trashed entries are deleted; 0 keeps them (RF-CNT-14). */
  trashDays: z.number().int().min(0).max(3650),
  /** IANA time zone of the site, e.g. Europe/Rome (dates, scheduling). */
  timezone: z.string().min(1).max(64).refine(isTimeZone, 'Choose a time zone from the list'),
  /** How dates are written on the site. */
  dateStyle: z.enum(['long', 'medium', 'short']),
  /**
   * A date format of its own, written with PHP's letters as WordPress's
   * (`F j, Y`, `d/m/Y`): it wins over `dateStyle` when set (core 0.82).
   * Empty: the date style.
   */
  dateFormat: z.string().trim().max(64),
  /**
   * The editor new entries of a content type open with, by content type
   * slug: a plugin editor's id (e.g. `fresco`). Missing: the block editor.
   */
  defaultEditors: z.record(
    z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  ),
  /** AI assistants can connect to the site through MCP (/mcp), with OAuth. */
  mcp: z.boolean(),
  /**
   * Once a day, tell cleitext.com the site's address and the versions of
   * Cleitext, its themes and plugins (the installation registry).
   */
  installReport: z.boolean(),
  /** An arrow on the public pages that scrolls back to the top. */
  backToTop: z.boolean(),
  /** The arrow's colour (`#rrggbb`); a dark grey when null. */
  backToTopColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, 'A colour like #1e40af')
    .transform((v) => v.toLowerCase())
    .nullable(),
  /** The corner the arrow sits in. */
  backToTopPosition: z.enum(['right', 'left']),

  // ---- Privacy ----
  /**
   * Web fonts of Google Fonts and Bunny Fonts that pages link (themes,
   * plugins): `local` keeps a copy on the site and links that, so visitors'
   * browsers never reach the font services; `provider` leaves the links to
   * the services (only families a plugin already keeps on the site are not
   * loaded twice); `theme` leaves the pages exactly as the theme and the
   * plugins wrote them.
   */
  webFonts: z.enum(['local', 'provider', 'theme']),

  // ---- Membership (RF-USR-11) ----
  /** Anyone can create an account on the site. */
  registration: z.boolean(),
  /** Role given to people who sign up. */
  defaultRole: z.string().trim().min(1).max(64),
  /** New accounts confirm their email address before they can sign in. */
  verifyEmail: z.boolean(),
  /** Page with the terms people accept when they sign up; none when null. */
  termsPage: z.uuid().nullable(),

  // ---- Discussion (RF-COM) ----
  /** New entries of types with comments accept them. */
  commentsDefault: z.boolean(),
  /** Only signed-in people can comment. */
  commentRegistration: z.boolean(),
  /** Guests give a name and an email address. */
  commentRequireNameEmail: z.boolean(),
  /** Comments close on entries older than this many days; 0 never. */
  commentCloseAfterDays: z.number().int().min(0).max(3650),
  /** Levels of replies (1: no replies). */
  commentThreadDepth: z.number().int().min(1).max(10),
  /** Top-level comments per page; 0 all on one page. */
  commentsPerPage: z.number().int().min(0).max(500),
  commentOrder: z.enum(['oldest', 'newest']),
  /** Held for approval: every comment, the first of each person, or none. */
  commentModeration: z.enum(['always', 'first', 'none']),
  /** Held when it has more links than this. */
  commentMaxLinks: z.number().int().min(0).max(50),
  /** Words (one per line) that hold a comment for approval. */
  commentHoldWords: z.string().max(20_000),
  /** Words (one per line) that send a comment to spam. */
  commentBlockWords: z.string().max(20_000),
  /** Email the entry's author about new comments. */
  commentNotifyAuthor: z.boolean(),
  /** Email the moderators about comments waiting for approval. */
  commentNotifyModerators: z.boolean(),
  /** Pictures next to comments: initials, or Gravatar (sends a hash of the email to Gravatar). */
  avatars: z.enum(['initials', 'gravatar']),
  /** Who can like entries. */
  likes: z.enum(['off', 'everyone', 'users']),
  /** Links to share entries on social networks, under entries with comments. */
  shareButtons: z.boolean(),
};

/** A time zone known to the runtime (IANA name). */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const CORE_SETTINGS_DEFAULTS = {
  title: '',
  tagline: '',
  frontPage: null,
  postsPage: null,
  postsPerPage: 10,
  errorPage: null,
  discourageSearchEngines: false,
  trailingSlash: false,
  trashDays: 30,
  timezone: 'UTC',
  dateStyle: 'long',
  dateFormat: '',
  defaultEditors: {},
  mcp: false,
  installReport: true,
  backToTop: false,
  backToTopColor: null,
  backToTopPosition: 'right',
  webFonts: 'local',
  registration: false,
  defaultRole: 'subscriber',
  verifyEmail: true,
  termsPage: null,
  commentsDefault: true,
  commentRegistration: false,
  commentRequireNameEmail: true,
  commentCloseAfterDays: 0,
  commentThreadDepth: 5,
  commentsPerPage: 50,
  commentOrder: 'oldest',
  commentModeration: 'first',
  commentMaxLinks: 2,
  commentHoldWords: '',
  commentBlockWords: '',
  commentNotifyAuthor: true,
  commentNotifyModerators: true,
  avatars: 'initials',
  likes: 'everyone',
  shareButtons: true,
} as const;

export const coreSettingsSchema = z.object(coreSettingsFields);
export type CoreSettings = z.infer<typeof coreSettingsSchema>;

/** Partial update: only the given keys change (no defaults applied). */
export const updateCoreSettingsRequestSchema = z.object(coreSettingsFields).partial();
export type UpdateCoreSettingsRequest = z.input<typeof updateCoreSettingsRequestSchema>;

/** Outgoing email of a site (RF-SET-02); the server's MAIL_URL otherwise. */
export const mailSettingsRequestSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-z0-9.-]+$/i, 'A host name, e.g. smtp.example.com'),
  port: z.number().int().min(1).max(65_535),
  /** `tls`: encrypted from the start (465); `starttls`: upgraded (587); `none`: local relays only. */
  security: z.enum(['tls', 'starttls', 'none']),
  user: z.string().trim().max(320).optional(),
  /** Omitted: the stored password is kept. */
  password: z.string().max(500).optional(),
  /** Sender, e.g. `Example <no-reply@example.com>`. */
  from: z.string().trim().min(3).max(320),
});
export type MailSettingsRequest = z.input<typeof mailSettingsRequestSchema>;

export interface MailSettingsView {
  /** False: the server's default settings are used. */
  configured: boolean;
  host: string | null;
  port: number | null;
  security: 'tls' | 'starttls' | 'none' | null;
  user: string | null;
  from: string | null;
  /** The password itself is never returned. */
  hasPassword: boolean;
  /**
   * True when the server's own settings only write emails to its log
   * (`MAIL_URL=log://`): without settings here, nothing is delivered.
   */
  serverLogsOnly: boolean;
}

export const testMailRequestSchema = z.object({ to: z.email() });

// ---- Sites (RF-SIT-03, super admins) -----------------------------------------------

const HOST_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** A host name without scheme, port or path, lowercased (e.g. www.example.com). */
export const hostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^https?:\/\//, '').replace(/[/:].*$/, ''))
  .pipe(z.string().regex(HOST_RE, 'A domain name, e.g. example.com'));

export interface SiteDomainView {
  id: string;
  host: string;
  isPrimary: boolean;
  forceHttps: boolean;
}

export interface SiteView {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'maintenance' | 'archived';
  defaultLocale: string;
  createdAt: string;
  domains: SiteDomainView[];
}

export const createSiteRequestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Lowercase letters, digits and dashes'),
  name: z.string().trim().min(1).max(200),
  host: hostSchema,
  locale: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
    .default('en'),
  forceHttps: z.boolean().default(true),
});

export const updateSiteRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'maintenance', 'archived']).optional(),
});

export const addDomainRequestSchema = z.object({
  host: hostSchema,
  isPrimary: z.boolean().default(false),
  forceHttps: z.boolean().default(true),
});

export const updateDomainRequestSchema = z.object({
  isPrimary: z.literal(true).optional(),
  forceHttps: z.boolean().optional(),
});

// ---- Redirects (RF-NAV-04) -------------------------------------------------------

export const REDIRECT_STATUSES = [301, 302, 307, 308, 410] as const;

export interface RedirectView {
  id: string;
  from: string;
  to: string;
  status: (typeof REDIRECT_STATUSES)[number];
  hits: number;
}

export const redirectRequestSchema = z
  .object({
    from: z.string().trim().startsWith('/', 'Start with /').max(2_000),
    /** A path of the site or a full address; empty for 410 Gone. */
    to: z
      .string()
      .trim()
      .max(2_000)
      .refine((v) => v === '' || v.startsWith('/') || /^https?:\/\//i.test(v), {
        message: 'Use a path starting with / or an http(s) address',
      }),
    status: z
      .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308), z.literal(410)])
      .default(301),
  })
  .refine((r) => r.status === 410 || r.to !== '', { message: 'Give the new address', path: ['to'] })
  .refine((r) => r.from !== r.to, { message: 'A redirect cannot point to itself', path: ['to'] });
export type RedirectRequest = z.input<typeof redirectRequestSchema>;

export const redirectImportSchema = z.object({ csv: z.string().max(2_000_000) });

export interface RedirectImportResult {
  saved: number;
  errors: { line: number; message: string }[];
}
