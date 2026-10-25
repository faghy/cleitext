import type { FieldDefinition, Label } from './fields.js';
import type { FieldGroupView } from './plugins.js';
import { z } from 'zod';
import { fieldListSchema } from './fields.js';
import { localeSchema } from './api.js';

/** Content API payloads (docs/SPECIFICATIONS.md §6.2). Documents are CXD. */

export const ENTRY_STATUSES = [
  'draft',
  'pending',
  'scheduled',
  'published',
  'private',
  'trashed',
] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

/** Up to 200 characters, as WordPress's `post_name` (core 0.82; 120 before). */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens.');

const titleSchema = z.string().trim().max(300);
/** Validated in depth by the server with the CXD schema and block definitions. */
const documentSchema = z.unknown();
const fieldsSchema = z.record(z.string(), z.unknown());
/** Summary shown in listings and as meta description (RF-CNT-12). */
const excerptSchema = z.string().trim().max(1_000).nullable();
/** Featured image: a media item of the site. */
const featuredMediaSchema = z.uuid().nullable();
/**
 * The entry's page template (plugin API 1.47): one the theme offers
 * (`pageTemplates`), or null for the default one.
 */
const templateSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'Lowercase letters, digits, - and _')
  .nullable();

export const createEntryRequestSchema = z.object({
  type: z.string().min(1).max(64),
  locale: localeSchema.optional(),
  title: titleSchema.default(''),
  slug: slugSchema.optional(),
  parentId: z.uuid().nullable().optional(),
  template: templateSchema.optional(),
  document: documentSchema.optional(),
  fields: fieldsSchema.optional(),
  excerpt: excerptSchema.optional(),
  featuredMediaId: featuredMediaSchema.optional(),
});
export type CreateEntryRequest = z.input<typeof createEntryRequestSchema>;

export const updateEntryRequestSchema = z.object({
  title: titleSchema.optional(),
  /** Replaces the terms of the listed taxonomies. */
  terms: z.lazy(() => termAssignmentsSchema).optional(),
  slug: slugSchema.optional(),
  parentId: z.uuid().nullable().optional(),
  template: templateSchema.optional(),
  position: z.number().int().min(0).max(1_000_000).optional(),
  document: documentSchema.optional(),
  fields: fieldsSchema.optional(),
  excerpt: excerptSchema.optional(),
  featuredMediaId: featuredMediaSchema.optional(),
  /**
   * Gives the entry to another writer of the site (like WordPress's Author box).
   * Needs `edit_others_entries`; not saved as a revision.
   */
  authorId: z.uuid().optional(),
});
export type UpdateEntryRequest = z.input<typeof updateEntryRequestSchema>;

export const autosaveRequestSchema = z.object({
  title: titleSchema,
  document: documentSchema,
  fields: fieldsSchema.optional(),
  excerpt: excerptSchema.optional(),
  featuredMediaId: featuredMediaSchema.optional(),
});
export type AutosaveRequest = z.input<typeof autosaveRequestSchema>;

/** `private`: visible only to users who may read private entries (RF-CNT-16). */
export const publishRequestSchema = z.object({
  visibility: z.enum(['public', 'private']).default('public'),
});

export const scheduleRequestSchema = z.object({ scheduledAt: z.iso.datetime({ offset: true }) });
export type ScheduleRequest = z.input<typeof scheduleRequestSchema>;

export const listEntriesQuerySchema = z.object({
  type: z.string().min(1).max(64).optional(),
  status: z.enum(ENTRY_STATUSES).optional(),
  locale: localeSchema.optional(),
  q: z.string().trim().max(200).optional(),
  author: z.uuid().optional(),
  parent: z.uuid().optional(),
  /** Entries with this term (category, tag…). */
  term: z.uuid().optional(),
  /** `updated` (default), `title`, `date` (publication) or `order` (manual position). */
  sort: z.enum(['updated', 'title', 'date', 'order']).default('updated'),
  dir: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});

/** Bulk actions of list tables (RF-ADM-03). */
export const bulkEntriesRequestSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
    action: z.enum(['publish', 'unpublish', 'trash', 'restore', 'delete', 'author']),
    /** The new author, for the `author` action ("Change author"). */
    authorId: z.uuid().optional(),
  })
  .refine((v) => v.action !== 'author' || v.authorId !== undefined, {
    message: 'Choose the new author.',
    path: ['authorId'],
  });
export type BulkEntriesRequest = z.input<typeof bulkEntriesRequestSchema>;

/** A member of the site who can write entries: a choice for the Author box. */
export interface EntryAuthorOption {
  id: string;
  displayName: string;
  email: string;
}

export interface BulkEntriesResponse {
  results: { id: string; ok: boolean; error?: string }[];
}
export type ListEntriesQuery = z.input<typeof listEntriesQuerySchema>;

export interface ContentTypeView {
  slug: string;
  name: Record<string, string>;
  hierarchical: boolean;
  supports: string[];
  permalink: string;
  /** `core`, `user` or `plugin:<slug>`. */
  source: string;
  /** Custom fields of the type. */
  fields: FieldDefinition[];
  /** Extra fields added by plugins. */
  fieldGroups: FieldGroupView[];
}

const structureSlug = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,31}$/, 'Lowercase letters, digits, - and _, starting with a letter');
const labels = z.record(
  z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
  z.string().trim().min(1).max(100),
);

/** Features an entry type can offer in the editor. */
export const CONTENT_TYPE_FEATURES = [
  'blocks',
  'featured_image',
  'excerpt',
  'parent',
  'comments',
] as const;

export const createContentTypeRequestSchema = z.object({
  slug: structureSlug,
  name: labels.refine((v) => Object.keys(v).length > 0, 'Give at least one name'),
  hierarchical: z.boolean().default(false),
  supports: z.array(z.enum(CONTENT_TYPE_FEATURES)).default(['blocks']),
  /** `/events/{slug}`; built from the slug when omitted. */
  permalink: z.string().max(200).optional(),
  fields: z.lazy(() => fieldListSchema).default([]),
});
export const updateContentTypeRequestSchema = z.object({
  name: labels.optional(),
  supports: z.array(z.enum(CONTENT_TYPE_FEATURES)).optional(),
  permalink: z.string().max(200).optional(),
  fields: z.lazy(() => fieldListSchema).optional(),
});

export const createTaxonomyRequestSchema = z.object({
  slug: structureSlug,
  name: labels.refine((v) => Object.keys(v).length > 0, 'Give at least one name'),
  hierarchical: z.boolean().default(false),
  contentTypes: z.array(z.string().min(1).max(64)).max(50).default([]),
});
export const updateTaxonomyRequestSchema = z.object({
  name: labels.optional(),
  contentTypes: z.array(z.string().min(1).max(64)).max(50).optional(),
  /**
   * First part of the archives' addresses: null the taxonomy's slug
   * (/category/news), '' none (/news), or a word (/topics/news).
   */
  base: z
    .string()
    .trim()
    .regex(/^([a-z0-9]+(?:-[a-z0-9]+)*)?$/, 'Lowercase letters, digits and dashes')
    .max(60)
    .nullable()
    .optional(),
});

/** Concurrent editing lock (RF-CNT-15). */
export interface EntryLockView {
  /** Someone else editing the entry, or null. */
  lockedBy: { id: string; displayName: string } | null;
  expiresAt: string | null;
}

export interface EntrySummary {
  id: string;
  type: string;
  locale: string;
  parentId: string | null;
  slug: string;
  title: string;
  status: EntryStatus;
  /** Manual order among siblings (RF-CNT-13). */
  position: number;
  author: { id: string; displayName: string } | null;
  publishedAt: string | null;
  scheduledAt: string | null;
  updatedAt: string;
  /** Saved changes not yet published (RF-CNT-07). */
  hasUnpublishedChanges: boolean;
  /** What the entry is for, shown next to its title: front page, 404 page, privacy policy… */
  states?: EntryState[];
}

/** A role of an entry on the site, like WordPress's post states ("— Front Page"). */
export interface EntryState {
  /** e.g. `front`, `posts`, `error`, `privacy`. */
  key: string;
  label: Label;
}

export interface RevisionView {
  id: string;
  kind: 'manual' | 'autosave' | 'import' | 'restore';
  title: string;
  fields: Record<string, unknown>;
  excerpt: string | null;
  featuredMediaId: string | null;
  document: unknown;
  author: { id: string; displayName: string } | null;
  createdAt: string;
}

export interface EntryView extends EntrySummary {
  /** The page template (plugin API 1.47); null for the default one. */
  template: string | null;
  createdAt: string;
  trashedAt: string | null;
  /** Comments: open or closed, and how many are approved (RF-COM). */
  comments: { status: 'open' | 'closed'; count: number };
  /** Current (latest saved) revision. */
  revision: RevisionView | null;
  /** The user's autosave, when newer than the current revision (RF-CNT-06). */
  autosave: RevisionView | null;
  /** Assigned terms, by taxonomy slug. */
  terms: Record<string, TermView[]>;
  /** What the current user may do. */
  permissions: { edit: boolean; publish: boolean; delete: boolean };
}

export interface RevisionSummary {
  id: string;
  kind: RevisionView['kind'];
  title: string;
  author: { id: string; displayName: string } | null;
  createdAt: string;
  current: boolean;
  published: boolean;
}

export interface EntryListResponse {
  items: EntrySummary[];
  nextCursor: string | null;
}

// ---- Taxonomies (RF-TAX-01/03) ------------------------------------------------

export interface TaxonomyView {
  slug: string;
  name: Record<string, string>;
  hierarchical: boolean;
  contentTypes: string[];
  /** `core`, `user` (made in the admin) or `plugin:<slug>`. */
  source: string;
  /** Custom fields of its terms (e.g. an image), edited with each term. */
  fields: FieldDefinition[];
  /** First part of its archives' addresses: null its slug, '' none. */
  base: string | null;
}

export interface TermView {
  id: string;
  taxonomy: string;
  locale: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  /** Values of the taxonomy's custom fields. */
  fields: Record<string, unknown>;
  /** Manual order among siblings (then by name). */
  position: number;
  /** Entries using the term (in lists). */
  count: number;
}

export const createTermRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema.optional(),
  parentId: z.uuid().nullable().optional(),
  locale: localeSchema.optional(),
  description: z.string().max(2_000).optional(),
  fields: fieldsSchema.optional(),
  position: z.number().int().min(0).max(1_000_000).optional(),
});
export type CreateTermRequest = z.input<typeof createTermRequestSchema>;

export const updateTermRequestSchema = createTermRequestSchema.omit({ locale: true }).partial();
export type UpdateTermRequest = z.input<typeof updateTermRequestSchema>;

/** Term assignments: ids of existing terms, or `{ name }` to find or create (tags). */
export const termAssignmentsSchema = z.record(
  z.string().min(1).max(64),
  z.array(z.union([z.uuid(), z.object({ name: z.string().trim().min(1).max(200) })])).max(100),
);

// ---- Patterns (RF-EDT-07) --------------------------------------------------------

export interface PatternView {
  id: string;
  title: string;
  document: unknown;
  /** Inserted as a reference: changes reach every place that uses it. */
  synced: boolean;
  createdBy: { id: string; displayName: string } | null;
  updatedAt: string;
}

export const createPatternRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  document: z.unknown(),
  synced: z.boolean().default(false),
});
export const updatePatternRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  document: z.unknown().optional(),
});
