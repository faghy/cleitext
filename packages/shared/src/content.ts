import type { FieldDefinition } from './fields.js';
import type { FieldGroupView } from './plugins.js';
import { z } from 'zod';
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

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens.');

const titleSchema = z.string().trim().max(300);
/** Validated in depth by the server with the CXD schema and block definitions. */
const documentSchema = z.unknown();
const fieldsSchema = z.record(z.string(), z.unknown());
/** Summary shown in listings and as meta description (RF-CNT-12). */
const excerptSchema = z.string().trim().max(1_000).nullable();
/** Featured image: a media item of the site. */
const featuredMediaSchema = z.uuid().nullable();

export const createEntryRequestSchema = z.object({
  type: z.string().min(1).max(64),
  locale: localeSchema.optional(),
  title: titleSchema.default(''),
  slug: slugSchema.optional(),
  parentId: z.uuid().nullable().optional(),
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
  position: z.number().int().min(0).max(1_000_000).optional(),
  document: documentSchema.optional(),
  fields: fieldsSchema.optional(),
  excerpt: excerptSchema.optional(),
  featuredMediaId: featuredMediaSchema.optional(),
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

export const createTranslationRequestSchema = z.object({ locale: localeSchema });
export type CreateTranslationRequest = z.input<typeof createTranslationRequestSchema>;

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
export const bulkEntriesRequestSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  action: z.enum(['publish', 'unpublish', 'trash', 'restore', 'delete']),
});

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

export interface EntrySummary {
  id: string;
  type: string;
  locale: string;
  translationGroup: string;
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
  createdAt: string;
  trashedAt: string | null;
  /** Current (latest saved) revision. */
  revision: RevisionView | null;
  /** The user's autosave, when newer than the current revision (RF-CNT-06). */
  autosave: RevisionView | null;
  /** Other languages of the same content. */
  translations: { id: string; locale: string; title: string; status: EntryStatus }[];
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
}

export interface TermView {
  id: string;
  taxonomy: string;
  locale: string;
  translationGroup: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  /** Entries using the term (in lists). */
  count: number;
}

export const createTermRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema.optional(),
  parentId: z.uuid().nullable().optional(),
  locale: localeSchema.optional(),
  description: z.string().max(2_000).optional(),
});
export type CreateTermRequest = z.input<typeof createTermRequestSchema>;

export const updateTermRequestSchema = createTermRequestSchema.omit({ locale: true }).partial();
export type UpdateTermRequest = z.input<typeof updateTermRequestSchema>;

/** Term assignments: ids of existing terms, or `{ name }` to find or create (tags). */
export const termAssignmentsSchema = z.record(
  z.string().min(1).max(64),
  z.array(z.union([z.uuid(), z.object({ name: z.string().trim().min(1).max(200) })])).max(100),
);
