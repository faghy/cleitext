import { fetchPublic, PublicFetchError } from '../common/public-fetch.js';
import { ToolError } from './errors.js';

export { isPublicAddress } from '../common/public-fetch.js';

/**
 * Downloads an image an assistant pointed to (tool `upload_image`): https
 * only, never the server's own network (common/public-fetch.ts), 15 MB at most.
 */

const MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export async function fetchPublicFile(
  address: string,
): Promise<{ filename: string; data: Buffer }> {
  let file: Awaited<ReturnType<typeof fetchPublic>>;
  try {
    file = await fetchPublic(address, {
      maxBytes: MAX_BYTES,
      accept: 'image/*',
      userAgent: 'Cleitext-MCP/1.0',
    });
  } catch (error) {
    if (error instanceof PublicFetchError) throw new ToolError(error.message);
    throw error;
  }
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new ToolError('This address is not an image (JPEG, PNG, WebP, GIF or AVIF).');
  const base = (file.url.pathname.split('/').pop() ?? 'image')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\w.-]+/g, '-');
  return { filename: `${base.slice(0, 80) || 'image'}.${ext}`, data: file.data };
}
