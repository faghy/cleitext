import { cxdDocumentSchema } from './cxd.js';
import { z } from 'zod';

/**
 * Transfer document (RF-IMP-01…04): the common model of every import and
 * export, shared by the core and the import plugins (`@cleitext/blocks/transfer`).
 * Records refer to each other with `ref` strings chosen by the
 * source (Cleitext ids, WordPress post ids, Cleito ids…); the importer gives
 * them new ids, so a document can be imported into any site, even twice.
 */

const ref = z.string().min(1).max(200);
const locale = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/);
const labels = z.record(z.string(), z.string().max(200));
const slug = z.string().min(1).max(200);

export const transferUserSchema = z.object({
  ref,
  email: z.string().max(320),
  displayName: z.string().max(200),
  /** Role slug on the site, e.g. `editor`. */
  role: z.string().max(64).optional(),
  locale: z.string().max(10).optional(),
});

export const transferTermSchema = z.object({
  ref,
  taxonomy: slug,
  locale,
  /** Terms with the same `translationRef` are translations of each other. */
  translationRef: ref.optional(),
  parentRef: ref.optional(),
  slug,
  name: z.string().min(1).max(200),
  description: z.string().max(5_000).nullable().optional(),
  /** Custom fields of the taxonomy (e.g. a plugin's term image). */
  fields: z.record(z.string(), z.unknown()).optional(),
  /** Manual order among siblings. */
  position: z.number().int().min(0).max(1_000_000).optional(),
});

export const transferMediaSchema = z.object({
  ref,
  /** Path inside the archive, local file path or http(s) URL. */
  file: z.string().min(1).max(2_000),
  filename: z.string().min(1).max(255),
  alt: z.record(z.string(), z.string().max(1_000)).optional(),
  caption: z.record(z.string(), z.string().max(1_000)).optional(),
  /** Public addresses the file had on the old site (rewritten in content). */
  urls: z.array(z.string().max(2_000)).max(50).optional(),
});

/** A comment on an entry (RF-COM); replies point to their parent. */
export const transferCommentSchema = z.object({
  ref,
  parentRef: ref.optional(),
  /** The account that wrote it, when it had one. */
  userRef: ref.optional(),
  authorName: z.string().max(200),
  authorEmail: z.string().max(320).default(''),
  authorUrl: z.string().max(2_000).nullable().optional(),
  content: z.string().max(65_000),
  status: z.enum(['pending', 'approved', 'spam']),
  createdAt: z.iso.datetime({ offset: true }),
  ip: z.string().max(64).nullable().optional(),
});

export const transferEntrySchema = z.object({
  ref,
  type: slug,
  locale,
  translationRef: ref.optional(),
  parentRef: ref.optional(),
  slug,
  title: z.string().max(500),
  status: z.enum(['draft', 'pending', 'scheduled', 'published', 'private']),
  authorRef: ref.optional(),
  publishedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
  position: z.number().int().optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  /** Image blocks refer to media with `attrs.id` = media `ref`. */
  document: cxdDocumentSchema,
  /** Featured image: a media `ref`. */
  featuredMediaRef: ref.optional(),
  /** Term refs by taxonomy slug. */
  terms: z.record(z.string(), z.array(ref)).optional(),
  /** Old public paths, redirected to the new address. */
  oldPaths: z.array(z.string().max(2_000)).max(20).optional(),
  /** Visitors may comment (types with comments only). */
  commentStatus: z.enum(['open', 'closed']).optional(),
  comments: z.array(transferCommentSchema).max(20_000).optional(),
});

export interface TransferMenuItem {
  kind: 'entry' | 'term' | 'url' | 'custom';
  entryRef?: string | undefined;
  termRef?: string | undefined;
  url?: string | undefined;
  label?: string | null | undefined;
  target?: '_blank' | null | undefined;
  children?: TransferMenuItem[] | undefined;
}

const transferMenuItemSchema: z.ZodType<TransferMenuItem> = z.lazy(() =>
  z.object({
    kind: z.enum(['entry', 'term', 'url', 'custom']),
    entryRef: ref.optional(),
    termRef: ref.optional(),
    url: z.string().max(2_000).optional(),
    label: z.string().max(200).nullable().optional(),
    target: z.literal('_blank').nullable().optional(),
    children: z.array(transferMenuItemSchema).max(200).optional(),
  }),
);

export const transferDocumentSchema = z.object({
  format: z.literal('cleitext-transfer'),
  version: z.literal(1),
  source: z.object({
    kind: z.enum(['cleitext', 'wordpress', 'cleito']),
    name: z.string().max(200).optional(),
    url: z.string().max(2_000).optional(),
    exportedAt: z.iso.datetime({ offset: true }),
  }),
  site: z
    .object({
      title: z.string().max(200).optional(),
      tagline: z.string().max(300).optional(),
      postsPerPage: z.number().int().min(1).max(100).optional(),
      frontPageRef: ref.optional(),
      postsPageRef: ref.optional(),
    })
    .default({}),
  locales: z
    .array(
      z.object({
        code: locale,
        name: z.string().min(1).max(100),
        isDefault: z.boolean().optional(),
        urlPrefix: z.string().max(50).nullable().optional(),
      }),
    )
    .default([]),
  users: z.array(transferUserSchema).default([]),
  contentTypes: z
    .array(
      z.object({
        slug,
        name: labels,
        hierarchical: z.boolean().default(false),
        permalink: z.string().max(200),
      }),
    )
    .default([]),
  taxonomies: z
    .array(
      z.object({
        slug,
        name: labels,
        hierarchical: z.boolean().default(false),
        contentTypes: z.array(slug).default([]),
      }),
    )
    .default([]),
  terms: z.array(transferTermSchema).default([]),
  media: z.array(transferMediaSchema).default([]),
  entries: z.array(transferEntrySchema).default([]),
  menus: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        locale,
        location: z.string().max(64).nullable().optional(),
        items: z.array(transferMenuItemSchema).max(500),
      }),
    )
    .default([]),
  redirects: z
    .array(
      z.object({
        from: z.string().min(1).max(2_000),
        to: z.string().min(1).max(2_000),
        status: z.union([z.literal(301), z.literal(302), z.literal(410)]).default(301),
      }),
    )
    .default([]),
});

export type TransferDocument = z.output<typeof transferDocumentSchema>;
export type TransferDocumentInput = z.input<typeof transferDocumentSchema>;
export type TransferEntry = z.output<typeof transferEntrySchema>;
export type TransferTerm = z.output<typeof transferTermSchema>;
export type TransferComment = z.output<typeof transferCommentSchema>;
export type TransferMedia = z.output<typeof transferMediaSchema>;
