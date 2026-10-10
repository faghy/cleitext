import { z } from 'zod';

/** Media API payloads (docs/SPECIFICATIONS.md §6.3). */

export interface MediaVariantView {
  variant: string;
  format: string;
  url: string;
  width: number;
  height: number;
}

export interface MediaView {
  id: string;
  url: string;
  filename: string;
  mime: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  sizeBytes: number;
  width: number | null;
  height: number | null;
  /** Alternative text per language. */
  alt: Record<string, string>;
  caption: Record<string, string>;
  uploadedBy: { id: string; displayName: string } | null;
  createdAt: string;
  /** Resized WebP/AVIF variants; filled in shortly after upload. */
  variants: MediaVariantView[];
}

export interface MediaListResponse {
  items: MediaView[];
  nextCursor: string | null;
}

export const listMediaQuerySchema = z.object({
  kind: z.enum(['image', 'video', 'audio', 'document']).optional(),
  /** Searches the file name, alternative texts and captions. */
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  cursor: z.string().max(200).optional(),
});

const perLocale = z.record(z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/), z.string().max(1_000));

export const updateMediaRequestSchema = z.object({
  alt: perLocale.optional(),
  caption: perLocale.optional(),
});
export type UpdateMediaRequest = z.input<typeof updateMediaRequestSchema>;
