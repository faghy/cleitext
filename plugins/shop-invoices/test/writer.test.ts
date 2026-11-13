import { deflateSync } from 'node:zlib';
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
