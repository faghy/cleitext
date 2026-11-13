import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PdfDocument, picture, textWidth, winAnsi, wrap } from '../src/pdf/writer';

/** A tiny RGBA PNG (2×1: red opaque, half-transparent blue). */
function rgbaPng(): Buffer {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (name: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const nb = Buffer.concat([Buffer.from(name, 'latin1'), body]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(nb));
    return Buffer.concat([len, nb, c]);
  };
  const ihdr = Buffer.from([0, 0, 0, 2, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const raw = Buffer.from([0, 255, 0, 0, 255, 0, 0, 255, 128]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('the PDF writer', () => {
  it('encodes Western European text and the euro, and measures it', () => {
    expect(winAnsi('Città €')).toEqual([67, 105, 116, 116, 0xe0, 32, 0x80]);
    expect(winAnsi('中')).toEqual([0x3f]);
    expect(textWidth('Hello', 10)).toBeCloseTo(22.78, 1);
    expect(textWidth('Hello', 10, true)).toBeGreaterThan(textWidth('Hello', 10));
    expect(wrap('one two three four', 40, 10).length).toBeGreaterThan(1);
  });

  it('reads PNG pictures with their transparency', () => {
    const pic = picture(rgbaPng());
    expect(pic).toMatchObject({ width: 2, height: 1 });
    expect(pic.mask).toBeDefined();
    expect(() => picture(Buffer.from('GIF89a'))).toThrow();
  });

  it('writes a valid file: header, objects, cross-reference table', () => {
    const doc = new PdfDocument({ title: 'Fattura 1' });
    doc.text(40, 40, 'Fattura n. 1 – Città', { size: 16, bold: true });
    doc.text(555, 40, '€ 12,50', { align: 'right' });
    doc.line(40, 70, 555, 70);
    doc.image(rgbaPng(), 40, 80, 100, 50);
    doc.addPage();
    doc.text(40, 40, 'Second page');
    const pdf = doc.toBuffer();
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Count 2');
    // Every object starts where the table says.
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    const table = text.slice(start).split('\n');
    const count = Number(table[1]!.split(' ')[1]);
    for (let i = 1; i < count; i++) {
      const offset = Number(table[2 + i]!.slice(0, 10));
      expect(text.slice(offset, offset + 12)).toMatch(new RegExp(`^${i} 0 obj`));
    }
  });
});

/** A PNG from rows of samples: any type and depth, interlaced (Adam7) or not. */
function encodePng(options: {
  width: number;
  height: number;
  type: number;
  depth: number;
  channels: number;
  samples: (x: number, y: number) => number[];
  interlaced: boolean;
  palette?: Buffer;
}): Buffer {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (name: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const nb = Buffer.concat([Buffer.from(name, 'latin1'), body]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(nb));
    return Buffer.concat([len, nb, c]);
  };
  const { width, height, depth, channels } = options;
  const passes = options.interlaced
    ? [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2],
      ]
    : [[0, 0, 1, 1]];
  const bytes: number[] = [];
  for (const [x0, y0, dx, dy] of passes) {
    const w = Math.ceil((width - x0!) / dx!);
    const h = Math.ceil((height - y0!) / dy!);
    if (w <= 0 || h <= 0) continue;
    for (let y = 0; y < h; y++) {
      bytes.push(0);
      let acc = 0;
      let bits = 0;
      for (let x = 0; x < w; x++) {
        for (const v of options.samples(x0! + x * dx!, y0! + y * dy!)) {
          acc = (acc << depth) | v;
          bits += depth;
          while (bits >= 8) {
            bytes.push((acc >> (bits - 8)) & 0xff);
            bits -= 8;
          }
        }
      }
      if (bits > 0) bytes.push((acc << (8 - bits)) & 0xff);
      acc = 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = depth;
  ihdr[9] = options.type;
  ihdr[12] = options.interlaced ? 1 : 0;
  void channels;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(options.palette ? [chunk('PLTE', options.palette)] : []),
    chunk('IDAT', deflateSync(Buffer.from(bytes))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('PNG logos', () => {
  const rgb = (x: number, y: number) => [x * 20, y * 30, (x + y) * 10];

  it('reads interlaced PNGs as the plain ones', () => {
    const base = { width: 9, height: 7, type: 2, depth: 8, channels: 3, samples: rgb };
    const plain = picture(encodePng({ ...base, interlaced: false }));
    const interlaced = picture(encodePng({ ...base, interlaced: true }));
    expect(interlaced.width).toBe(9);
    expect(inflateSync(interlaced.data)).toEqual(inflateSync(plain.data));
    expect(inflateSync(plain.data).subarray(0, 6)).toEqual(Buffer.from([0, 0, 0, 20, 0, 10]));
  });

  it('reads palette PNGs of 4 bits per pixel, interlaced too', () => {
    const palette = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const index = (x: number, y: number) => [(x + y) % 3];
    const a = picture(
      encodePng({
        width: 5,
        height: 3,
        type: 3,
        depth: 4,
        channels: 1,
        samples: index,
        interlaced: false,
        palette,
      }),
    );
    const b = picture(
      encodePng({
        width: 5,
        height: 3,
        type: 3,
        depth: 4,
        channels: 1,
        samples: index,
        interlaced: true,
        palette,
      }),
    );
    expect(inflateSync(a.data).subarray(0, 9)).toEqual(
      Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]),
    );
    expect(inflateSync(b.data)).toEqual(inflateSync(a.data));
  });
});
