import { z } from 'zod';

/** General settings of a site (RF-SET-01), namespace `core`. */
const coreSettingsFields = {
  /** Public title; the site name when empty. */
  title: z.string().trim().max(200),
  tagline: z.string().trim().max(300),
  /** Static front page (translation group of a page), or the latest posts. */
  frontPage: z.uuid().nullable(),
  /** Page that lists the posts when a static front page is set. */
  postsPage: z.uuid().nullable(),
  postsPerPage: z.number().int().min(1).max(100),
  /** Page shown for "not found" (translation group), or the theme's 404. */
  errorPage: z.uuid().nullable(),
  /** Ask search engines not to index the site. */
  discourageSearchEngines: z.boolean(),
  /** Days before trashed entries are deleted; 0 keeps them (RF-CNT-14). */
  trashDays: z.number().int().min(0).max(3650),
  /** IANA time zone of the site, e.g. Europe/Rome (dates, scheduling). */
  timezone: z.string().min(1).max(64).refine(isTimeZone, 'Choose a time zone from the list'),
  /** How dates are written on the site. */
  dateStyle: z.enum(['long', 'medium', 'short']),
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
} as const;

export const coreSettingsSchema = z.object(coreSettingsFields);
export type CoreSettings = z.infer<typeof coreSettingsSchema>;

/** Partial update: only the given keys change (no defaults applied). */
export const updateCoreSettingsRequestSchema = z.object(coreSettingsFields).partial();
export type UpdateCoreSettingsRequest = z.input<typeof updateCoreSettingsRequestSchema>;

/** A language of the site (RF-SET-01). */
export interface SiteLocaleView {
  code: string;
  name: string;
  isDefault: boolean;
  /** Address prefix, e.g. `/it`; the code when null. The default language has none. */
  urlPrefix: string | null;
  position: number;
  /** Entries written in this language. */
  entries: number;
}

export const createLocaleRequestSchema = z.object({
  code: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'A language code such as it or de-CH'),
  name: z.string().trim().min(1).max(60),
  urlPrefix: z
    .string()
    .regex(/^\/[a-z0-9-]{1,20}$/)
    .nullable()
    .optional(),
});

export const updateLocaleRequestSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  urlPrefix: z
    .string()
    .regex(/^\/[a-z0-9-]{1,20}$/)
    .nullable()
    .optional(),
  position: z.number().int().min(0).max(1000).optional(),
  isDefault: z.literal(true).optional(),
});
