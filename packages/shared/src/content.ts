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

export const createEntryRequestSchema = z.object({
  type: z.string().min(1).max(64),
  locale: localeSchema.optional(),
  title: titleSchema.default(''),
  slug: slugSchema.optional(),
  parentId: z.uuid().nullable().optional(),
  document: documentSchema.optional(),
  fields: fieldsSchema.optional(),
});
export type CreateEntryRequest = z.input<typeof createEntryRequestSchema>;

export const updateEntryRequestSchema = z.object({
  title: titleSchema.optional(),
  slug: slugSchema.optional(),
  parentId: z.uuid().nullable().optional(),
  position: z.number().int().min(0).max(1_000_000).optional(),
  document: documentSchema.optional(),
  fields: fieldsSchema.optional(),
});
export type UpdateEntryRequest = z.input<typeof updateEntryRequestSchema>;

export const autosaveRequestSchema = z.object({
  title: titleSchema,
  document: documentSchema,
  fields: fieldsSchema.optional(),
});
export type AutosaveRequest = z.input<typeof autosaveRequestSchema>;

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
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});
export type ListEntriesQuery = z.input<typeof listEntriesQuerySchema>;

export interface ContentTypeView {
  slug: string;
  name: Record<string, string>;
  hierarchical: boolean;
  supports: string[];
  permalink: string;
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
  document: unknown;
  author: { id: string; displayName: string } | null;
  createdAt: string;
}

export interface EntryView extends EntrySummary {
  createdAt: string;
  trashedAt: string | null;
  position: number;
  /** Current (latest saved) revision. */
  revision: RevisionView | null;
  /** The user's autosave, when newer than the current revision (RF-CNT-06). */
  autosave: RevisionView | null;
  /** Other languages of the same content. */
  translations: { id: string; locale: string; title: string; status: EntryStatus }[];
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
