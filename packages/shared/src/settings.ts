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
  /** Days before trashed entries are deleted; 0 keeps them (RF-CNT-14). */
  trashDays: z.number().int().min(0).max(3650),
  /** IANA time zone of the site, e.g. Europe/Rome (dates, scheduling). */
  timezone: z.string().min(1).max(64).refine(isTimeZone, 'Choose a time zone from the list'),
  /** How dates are written on the site. */
  dateStyle: z.enum(['long', 'medium', 'short']),
  /** AI assistants can connect to the site through MCP (/mcp), with OAuth. */
  mcp: z.boolean(),
  /** An arrow on the public pages that scrolls back to the top. */
  backToTop: z.boolean(),
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
  trashDays: 30,
  timezone: 'UTC',
  dateStyle: 'long',
  mcp: false,
  backToTop: false,
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
