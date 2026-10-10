import sharp from 'sharp';

/** Profile pictures are square WebP images of this size. */
export const AVATAR_SIZE = 256;

/** Public address of a stored profile picture. */
export function avatarUrl(key: string | null): string | null {
  return key ? `/media/${key}` : null;
}

/** Crops and resizes an uploaded image; EXIF and other metadata are dropped. */
export function processAvatar(data: Buffer): Promise<Buffer> {
  return sharp(data, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82 })
    .toBuffer();
}
