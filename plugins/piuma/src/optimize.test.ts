import type { EncodedPicture, PictureEncodeOptions, PictureInfo } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, lighter, normalizeConfig, type Pictures } from './optimize';

/** A fake image library: sizes in bytes by format, as told. */
function fake(
  info: Partial<PictureInfo>,
  sizes: Partial<Record<'jpeg' | 'png' | 'webp' | 'avif', number>>,
): Pictures & { calls: PictureEncodeOptions[] } {
  const full: PictureInfo = {
    mime: 'image/jpeg',
    width: 1000,
    height: 800,
    transparent: false,
    pages: 1,
    ...info,
  };
  const calls: PictureEncodeOptions[] = [];
  return {
    calls,
    inspect: async () => full,
    encode: async (_data, options): Promise<EncodedPicture> => {
      calls.push(options);
      const format =
        options.format && options.format !== 'same'
          ? options.format
          : (full.mime.slice(6) as 'jpeg');
      return {
        data: Buffer.alloc(sizes[format] ?? 1),
        mime: `image/${format}` as PictureInfo['mime'],
        width: Math.min(full.width, options.maxWidth ?? full.width),
        height: full.height,
      };
    },
  };
}
const file = (bytes: number) => Buffer.alloc(bytes);

describe('lighter', () => {
  it('keeps a picture already light', async () => {
    expect(
      await lighter(fake({}, { jpeg: 980 }), file(1000), DEFAULT_CONFIG, { changeType: true }),
    ).toBeNull();
  });

  it('takes a lighter one, and makes a large picture smaller', async () => {
    const lib = fake({ width: 4000, height: 3000 }, { jpeg: 500 });
    const result = await lighter(lib, file(1000), DEFAULT_CONFIG, { changeType: false });
    expect(result?.data.length).toBe(500);
    expect(lib.calls[0]).toMatchObject({ maxWidth: 2560, maxHeight: 2560, quality: 82 });
  });

  it('turns a PNG photo into JPEG only at upload and when much lighter', async () => {
    const photo = { mime: 'image/png' as const };
    const upload = await lighter(fake(photo, { png: 900, jpeg: 200 }), file(1000), DEFAULT_CONFIG, {
      changeType: true,
    });
    expect(upload?.mime).toBe('image/jpeg');
    // In the library the type stays.
    const library = await lighter(
      fake(photo, { png: 900, jpeg: 200 }),
      file(1000),
      DEFAULT_CONFIG,
      {
        changeType: false,
      },
    );
    expect(library?.mime).toBe('image/png');
    // Not enough saved: PNG it stays.
    const close = await lighter(fake(photo, { png: 900, jpeg: 700 }), file(1000), DEFAULT_CONFIG, {
      changeType: true,
    });
    expect(close?.mime).toBe('image/png');
    // Transparent: never JPEG.
    const logo = await lighter(
      fake({ ...photo, transparent: true }, { png: 900, jpeg: 100 }),
      file(1000),
      DEFAULT_CONFIG,
      { changeType: true },
    );
    expect(logo?.mime).toBe('image/png');
  });

  it('leaves animations and small AVIF pictures alone', async () => {
    expect(
      await lighter(fake({ pages: 4 }, { jpeg: 10 }), file(1000), DEFAULT_CONFIG, {
        changeType: true,
      }),
    ).toBeNull();
    expect(
      await lighter(fake({ mime: 'image/avif' }, { avif: 10 }), file(1000), DEFAULT_CONFIG, {
        changeType: true,
      }),
    ).toBeNull();
  });
});

describe('normalizeConfig', () => {
  it('keeps values in range', () => {
    expect(normalizeConfig({ maxSize: 1234, quality: 300, onUpload: 'yes' })).toEqual({
      ...DEFAULT_CONFIG,
      quality: 95,
    });
    expect(normalizeConfig({ maxSize: 0, quality: 10, pngToJpeg: false })).toEqual({
      ...DEFAULT_CONFIG,
      maxSize: 0,
      quality: 40,
      pngToJpeg: false,
    });
  });
});
