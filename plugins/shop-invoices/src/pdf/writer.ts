/**
 * A small PDF writer for invoices and packing slips: A4 pages, text in
 * Helvetica and Helvetica-Bold (the PDF standard fonts, WinAnsi: Western
 * European languages and the euro), lines, filled boxes, JPEG and PNG
 * pictures (also with transparency). No dependency, no paid service.
 */
import { deflateSync, inflateSync } from 'node:zlib';

export const A4 = { width: 595.28, height: 841.89 };

// Widths of the standard fonts (Adobe's AFM), in thousandths of the size, for ASCII.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** WinAnsi codes of the characters outside Latin-1 it has (typographic quotes, dashes, €). */
const WIN_ANSI: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  '‰': 0x89,
  Š: 0x8a,
  '‹': 0x8b,
  Œ: 0x8c,
  Ž: 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '™': 0x99,
  š: 0x9a,
  '›': 0x9b,
  œ: 0x9c,
  ž: 0x9e,
  Ÿ: 0x9f,
};

/** A string as WinAnsi bytes; characters it lacks become `?`. */
export function winAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0)!;
    if (WIN_ANSI[ch] !== undefined) out.push(WIN_ANSI[ch]!);
    else if (code === 0x09) out.push(0x20);
    else if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff)) out.push(code);
    else out.push(0x3f);
  }
  return out;
}

/** The width of a byte in a font: ASCII from the tables, accented letters as their base letter. */
function byteWidth(byte: number, bold: boolean): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  if (byte >= 32 && byte <= 126) return table[byte - 32]!;
  if (byte === 0x80) return 556;
  if (byte >= 0xc0) {
    const base = String.fromCharCode(byte).normalize('NFD').charCodeAt(0);
    if (base >= 32 && base <= 126) return table[base - 32]!;
  }
  return 556;
}

/** The width of a text in points. */
export function textWidth(text: string, size: number, bold = false): number {
  return (winAnsi(text).reduce((sum, b) => sum + byteWidth(b, bold), 0) * size) / 1000;
}

/** Splits a text into lines no wider than `width`. */
export function wrap(text: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size, bold) <= width || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

interface Picture {
  width: number;
  height: number;
  /** The image object, and its soft mask (transparency) when there is one. */
  dict: string;
  data: Buffer;
  mask?: { dict: string; data: Buffer };
}

/** A JPEG as a PDF image: its bytes as they are (DCTDecode). */
function jpeg(data: Buffer): Picture {
  let i = 2;
  while (i < data.length) {
    if (data[i] !== 0xff) break;
    const marker = data[i + 1]!;
    const length = data.readUInt16BE(i + 2);
    // Start of frame (baseline, progressive…): height, width, components.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = data.readUInt16BE(i + 5);
      const width = data.readUInt16BE(i + 7);
      const components = data[i + 9]!;
      const space =
        components === 1 ? '/DeviceGray' : components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      return {
        width,
        height,
        dict: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode${components === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : ''}`,
        data,
      };
    }
    i += 2 + length;
  }
  throw new Error('Not a JPEG this writer can read.');
}

/** The rows of a PNG, unfiltered (8 bits per channel, not interlaced). */
function pngRows(raw: Buffer, width: number, channels: number, height: number): Buffer {
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + x]! : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels]! : 0;
      let v = row[x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 0xff;
    }
  }
  return out;
}

/** A PNG as a PDF image, with a soft mask for its transparency. */
function png(data: Buffer): Picture {
  let i = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let alphaOfPalette: Buffer | null = null;
  const idat: Buffer[] = [];
  while (i < data.length) {
    const length = data.readUInt32BE(i);
    const name = data.toString('latin1', i + 4, i + 8);
    const body = data.subarray(i + 8, i + 8 + length);
    if (name === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8]!;
      type = body[9]!;
      interlace = body[12]!;
    } else if (name === 'PLTE') palette = body;
    else if (name === 'tRNS') alphaOfPalette = body;
    else if (name === 'IDAT') idat.push(body);
    else if (name === 'IEND') break;
    i += 12 + length;
  }
  if (depth !== 8 || interlace)
    throw new Error('Use a PNG with 8 bits per channel, not interlaced, or a JPEG.');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type as 0 | 2 | 3 | 4 | 6];
  if (!channels) throw new Error('This PNG cannot be read.');
  const pixels = pngRows(inflateSync(Buffer.concat(idat)), width, channels, height);
  const count = width * height;
  const colors = type === 0 || type === 4 ? 1 : 3;
  const color = Buffer.alloc(count * colors);
  let alpha: Buffer | null =
    type === 4 || type === 6 || (type === 3 && alphaOfPalette) ? Buffer.alloc(count) : null;
  for (let p = 0; p < count; p++) {
    if (type === 3) {
      const index = pixels[p]!;
      color[p * 3] = palette![index * 3]!;
      color[p * 3 + 1] = palette![index * 3 + 1]!;
      color[p * 3 + 2] = palette![index * 3 + 2]!;
      if (alpha) alpha[p] = index < alphaOfPalette!.length ? alphaOfPalette![index]! : 255;
    } else {
      for (let k = 0; k < colors; k++) color[p * colors + k] = pixels[p * channels + k]!;
      if (alpha) alpha[p] = pixels[p * channels + channels - 1]!;
    }
  }
  if (alpha && alpha.every((v) => v === 255)) alpha = null;
  const space = colors === 1 ? '/DeviceGray' : '/DeviceRGB';
  return {
    width,
    height,
    dict: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${space} /BitsPerComponent 8 /Filter /FlateDecode`,
    data: deflateSync(color),
    ...(alpha
      ? {
          mask: {
            dict: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,
            data: deflateSync(alpha),
          },
        }
      : {}),
  };
}

/** A picture from its bytes: JPEG or PNG. */
export function picture(data: Buffer): Picture {
  if (data[0] === 0xff && data[1] === 0xd8) return jpeg(data);
  if (data.subarray(1, 4).toString('latin1') === 'PNG') return png(data);
  throw new Error('Only JPEG and PNG pictures can go in a PDF.');
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const pdfString = (bytes: number[]) =>
  `(${bytes.map((b) => (b === 0x28 || b === 0x29 || b === 0x5c ? `\\${String.fromCharCode(b)}` : b < 0x20 || b > 0x7e ? `\\${b.toString(8).padStart(3, '0')}` : String.fromCharCode(b))).join('')})`;

export interface TextOptions {
  size?: number;
  bold?: boolean;
  /** Where `x` is: the start (default), the end or the middle of the text. */
  align?: 'left' | 'right' | 'center';
  /** Grey 0 (black) to 1 (white). */
  gray?: number;
}

/**
 * A PDF being drawn, page by page, with y from the top of the page (as one
 * reads), in points.
 */
export class PdfDocument {
  private pages: string[][] = [];
  private pictures: Picture[] = [];
  private current: string[] = [];

  constructor(private readonly info: { title: string; author?: string } = { title: '' }) {
    this.addPage();
  }

  addPage(): void {
    this.current = [];
    this.pages.push(this.current);
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Starts a new document in this file: the first page if still empty, else a new one. Returns its index. */
  startDocument(): number {
    if (this.current.length > 0 || this.pages.length === 0) this.addPage();
    return this.pages.length - 1;
  }

  /** Draws on an earlier page from now on (footers, page numbers). */
  goTo(index: number): void {
    const page = this.pages[index];
    if (page) this.current = page;
  }

  text(x: number, y: number, value: string, options: TextOptions = {}): void {
    const size = options.size ?? 10;
    const bold = options.bold ?? false;
    const width = textWidth(value, size, bold);
    const left =
      options.align === 'right' ? x - width : options.align === 'center' ? x - width / 2 : x;
    const gray = options.gray ?? 0;
    this.current.push(
      `BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(gray)} g ${num(left)} ${num(A4.height - y - size)} Td ${pdfString(winAnsi(value))} Tj ET`,
    );
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options: { width?: number; gray?: number } = {},
  ): void {
    this.current.push(
      `${num(options.width ?? 0.5)} w ${num(options.gray ?? 0.75)} G ${num(x1)} ${num(A4.height - y1)} m ${num(x2)} ${num(A4.height - y2)} l S`,
    );
  }

  box(x: number, y: number, width: number, height: number, gray = 0.95): void {
    this.current.push(
      `${num(gray)} g ${num(x)} ${num(A4.height - y - height)} ${num(width)} ${num(height)} re f 0 g`,
    );
  }

  /** A picture fitted in a box (its proportions kept), top-left at x, y. */
  image(
    data: Buffer,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number,
  ): { width: number; height: number } {
    const pic = picture(data);
    this.pictures.push(pic);
    const scale = Math.min(maxWidth / pic.width, maxHeight / pic.height, 1);
    const width = pic.width * scale;
    const height = pic.height * scale;
    this.current.push(
      `q ${num(width)} 0 0 ${num(height)} ${num(x)} ${num(A4.height - y - height)} cm /Im${this.pictures.length} Do Q`,
    );
    return { width, height };
  }

  /** The finished file. */
  toBuffer(): Buffer {
    const objects: Buffer[] = [];
    const add = (body: string | Buffer) => {
      objects.push(typeof body === 'string' ? Buffer.from(body, 'latin1') : body);
      return objects.length;
    };
    const stream = (dict: string, data: Buffer) =>
      Buffer.concat([
        Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, 'latin1'),
        data,
        Buffer.from('\nendstream', 'latin1'),
      ]);

    const catalog = add('');
    const pagesId = add('');
    const font1 = add(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    );
    const font2 = add(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    );
    const images = this.pictures.map((pic) => {
      const mask = pic.mask ? add(stream(pic.mask.dict, pic.mask.data)) : null;
      return add(stream(`${pic.dict}${mask ? ` /SMask ${mask} 0 R` : ''}`, pic.data));
    });
    const xobjects = images.map((id, i) => `/Im${i + 1} ${id} 0 R`).join(' ');
    const resources = `<< /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ''} >>`;
    const kids = this.pages.map((content) => {
      const contentId = add(
        stream('/Filter /FlateDecode', deflateSync(Buffer.from(content.join('\n'), 'latin1'))),
      );
      return add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources ${resources} /Contents ${contentId} 0 R >>`,
      );
    });
    objects[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, 'latin1');
    objects[pagesId - 1] = Buffer.from(
      `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`,
      'latin1',
    );
    const infoId = add(
      `<< /Title ${pdfString(winAnsi(this.info.title))}${this.info.author ? ` /Author ${pdfString(winAnsi(this.info.author))}` : ''} /Producer (Cleitext) >>`,
    );

    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    const offsets: number[] = [];
    let length = parts[0]!.length;
    objects.forEach((body, index) => {
      offsets.push(length);
      const chunk = Buffer.concat([
        Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
        body,
        Buffer.from('\nendobj\n', 'latin1'),
      ]);
      parts.push(chunk);
      length += chunk.length;
    });
    const xref = [
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
      ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`),
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${infoId} 0 R >>\nstartxref\n${length}\n%%EOF\n`,
    ].join('');
    parts.push(Buffer.from(xref, 'latin1'));
    return Buffer.concat(parts);
  }
}
