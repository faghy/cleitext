import { fileTypeFromBuffer } from 'file-type';

/**
 * Accepted uploads (RF-MED-02), checked against the file's magic bytes, not
 * its name or the browser-declared type. SVG is refused (RF-MED-09, 1.0).
 */
export const ALLOWED_TYPES: Record<
  string,
  { ext: string; kind: 'image' | 'video' | 'audio' | 'document' }
> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/avif': { ext: 'avif', kind: 'image' },
  'application/pdf': { ext: 'pdf', kind: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: 'docx',
    kind: 'document',
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    ext: 'xlsx',
    kind: 'document',
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    ext: 'pptx',
    kind: 'document',
  },
  'application/vnd.oasis.opendocument.text': { ext: 'odt', kind: 'document' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'audio/mpeg': { ext: 'mp3', kind: 'audio' },
};

/** Image types for which resized variants are generated. */
export const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export async function detectType(data: Buffer): Promise<string | null> {
  const type = await fileTypeFromBuffer(data);
  return type && type.mime in ALLOWED_TYPES ? type.mime : null;
}
