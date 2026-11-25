/**
 * Piuma's choices for one picture, apart from the server so they can be
 * tested with a fake image library: how large it may be, how it is
 * compressed, when a PNG photo becomes a JPEG, and when the result is kept.
 */
import type { EncodedPicture, PictureEncodeOptions, PictureInfo } from '@cleitext/plugin-sdk';

export interface PiumaConfig {
  /** Make every new picture lighter when it is uploaded. */
  onUpload: boolean;
  /** Longest side in pixels; 0 keeps the size. */
  maxSize: number;
  /** Quality of JPEG, WebP and AVIF pictures, 40–95. */
  quality: number;
  /** PNG photos without transparency become JPEG (only at upload: the address changes). */
  pngToJpeg: boolean;
}

export const DEFAULT_CONFIG: PiumaConfig = {
  onUpload: true,
  maxSize: 2560,
  quality: 82,
  pngToJpeg: true,
};

export const MAX_SIZES = [0, 1920, 2560, 3840] as const;

export function normalizeConfig(value: unknown): PiumaConfig {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<PiumaConfig>;
  const quality = Math.round(Number(v.quality));
  return {
    onUpload: typeof v.onUpload === 'boolean' ? v.onUpload : DEFAULT_CONFIG.onUpload,
    maxSize: (MAX_SIZES as readonly number[]).includes(Number(v.maxSize))
      ? Number(v.maxSize)
      : DEFAULT_CONFIG.maxSize,
    quality: Number.isFinite(quality)
      ? Math.min(Math.max(quality, 40), 95)
      : DEFAULT_CONFIG.quality,
    pngToJpeg: typeof v.pngToJpeg === 'boolean' ? v.pngToJpeg : DEFAULT_CONFIG.pngToJpeg,
  };
}

/** The core's image library, as `ctx.media` gives it. */
export interface Pictures {
  inspect(data: Buffer): Promise<PictureInfo | null>;
  encode(data: Buffer, options: PictureEncodeOptions): Promise<EncodedPicture>;
}

/** A result is kept only when it saves at least this share (or the picture was too large). */
const MIN_SAVING = 0.05;
/** A PNG photo becomes JPEG only when that saves at least this share. */
const JPEG_SAVING = 0.4;

/**
 * A lighter version of a picture, or null to keep it as it is: animations,
 * pictures already light, results not smaller. `changeType`: the type may
 * change (at upload, before the picture has an address).
 */
export async function lighter(
  pictures: Pictures,
  data: Buffer,
  config: PiumaConfig,
  options: { changeType: boolean },
): Promise<EncodedPicture | null> {
  const info = await pictures.inspect(data);
  if (!info || info.pages > 1) return null;
  const tooLarge =
    config.maxSize > 0 && (info.width > config.maxSize || info.height > config.maxSize);
  const size = tooLarge ? { maxWidth: config.maxSize, maxHeight: config.maxSize } : {};
  // AVIF is already as light as it gets: only made smaller.
  if (info.mime === 'image/avif' && !tooLarge) return null;

  let result = await pictures.encode(data, { ...size, format: 'same', quality: config.quality });
  if (info.mime === 'image/png' && !info.transparent && config.pngToJpeg && options.changeType) {
    const jpeg = await pictures.encode(data, { ...size, format: 'jpeg', quality: config.quality });
    if (jpeg.data.length <= result.data.length * (1 - JPEG_SAVING)) result = jpeg;
  }
  const smaller = result.data.length <= data.length * (1 - MIN_SAVING);
  return smaller || (tooLarge && result.data.length < data.length) ? result : null;
}
