/**
 * Removes what a camera or an editor writes into a picture besides the
 * picture itself (core 0.120): EXIF (with the GPS position where it was
 * taken, the camera, the date), XMP, IPTC and comments. The pixels are not
 * touched (no new compression); the color profile stays, and a JPEG turned
 * by its EXIF orientation keeps just that tag, so it still shows upright.
 * A file that cannot be read safely is given back unchanged.
 */

/** Orientation 2–8 of a JPEG, read from its EXIF (1 or none: upright). */
export type Orientation = number;

export function stripMetadata(data: Buffer, mime: string, orientation?: Orientation): Buffer {
  try {
    if (mime === 'image/jpeg') return stripJpeg(data, orientation ?? 1);
    if (mime === 'image/png') return stripPng(data);
    if (mime === 'image/webp') return stripWebp(data);
  } catch {
    // Not what it seemed: keep the file as uploaded.
  }
  return data;
}

// ---- JPEG ----------------------------------------------------------------------

/** Segments kept: JFIF (APP0), the ICC color profile (APP2) and Adobe's color info (APP14). */
const KEPT_APP = new Set([0xe0, 0xe2, 0xee]);

function stripJpeg(data: Buffer, orientation: number): Buffer {
  if (data[0] !== 0xff || data[1] !== 0xd8) return data;
  const parts: Buffer[] = [data.subarray(0, 2)];
  let offset = 2;
  let insertedOrientation = orientation < 2 || orientation > 8;
  const orientationSegment = () => {
    if (insertedOrientation) return;
    parts.push(exifWithOrientation(orientation));
    insertedOrientation = true;
  };
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) return data;
    const marker = data[offset + 1]!;
    // Padding bytes between segments.
    if (marker === 0xff) {
      offset++;
      continue;
    }
    // Start of scan: the image data follows, copied as it is.
    if (marker === 0xda) {
      orientationSegment();
      parts.push(data.subarray(offset));
      return Buffer.concat(parts);
    }
    const length = data.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > data.length) return data;
    const segment = data.subarray(offset, offset + 2 + length);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const dropped = (isApp && !KEPT_APP.has(marker)) || marker === 0xfe;
    if (!dropped) parts.push(segment);
    // Right after JFIF, where EXIF usually is.
    if (marker === 0xe0) orientationSegment();
    offset += 2 + length;
  }
  return data;
}

/** An APP1 EXIF segment holding only the orientation tag (0x0112). */
function exifWithOrientation(orientation: number): Buffer {
  const tiff = Buffer.from([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08, // big-endian TIFF, first IFD at 8
    0x00,
    0x01, // one entry
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // no next IFD
  ]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xffe1, 0);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}

// ---- PNG -----------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Text, EXIF and time chunks: the rest (the color profile too) stays. */
const DROPPED_PNG = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(data: Buffer): Buffer {
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) return data;
  const parts: Buffer[] = [PNG_SIGNATURE];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('latin1', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > data.length) return data;
    if (!DROPPED_PNG.has(type)) parts.push(data.subarray(offset, end));
    offset = end;
    if (type === 'IEND') return Buffer.concat(parts);
  }
  return data;
}

// ---- WebP ----------------------------------------------------------------------

function stripWebp(data: Buffer): Buffer {
  if (data.toString('latin1', 0, 4) !== 'RIFF' || data.toString('latin1', 8, 12) !== 'WEBP')
    return data;
  const chunks: Buffer[] = [];
  let offset = 12;
  let changed = false;
  while (offset + 8 <= data.length) {
    const type = data.toString('latin1', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (end > data.length) return data;
    if (type === 'EXIF' || type === 'XMP ') changed = true;
    else chunks.push(Buffer.from(data.subarray(offset, end)));
    offset = end;
  }
  if (!changed) return data;
  // The extended header says which chunks follow: EXIF (0x08) and XMP (0x04) no longer.
  const vp8x = chunks.find((c) => c.toString('latin1', 0, 4) === 'VP8X');
  if (vp8x) vp8x[8] = vp8x[8]! & ~0x0c;
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length + 4, 4);
  head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}
