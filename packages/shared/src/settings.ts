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
};

export const CORE_SETTINGS_DEFAULTS = {
  title: '',
  tagline: '',
  frontPage: null,
  postsPage: null,
  postsPerPage: 10,
  errorPage: null,
  discourageSearchEngines: false,
} as const;

export const coreSettingsSchema = z.object(coreSettingsFields);
export type CoreSettings = z.infer<typeof coreSettingsSchema>;

/** Partial update: only the given keys change (no defaults applied). */
export const updateCoreSettingsRequestSchema = z.object(coreSettingsFields).partial();
export type UpdateCoreSettingsRequest = z.input<typeof updateCoreSettingsRequestSchema>;
