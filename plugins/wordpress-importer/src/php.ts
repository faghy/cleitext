/**
 * PHP's `serialize()` format, read: WordPress exports arrays of post meta
 * (e.g. a page builder's template conditions) this way. Only plain values
 * and arrays; objects become plain objects of their properties. Lengths of
 * strings count bytes (UTF-8), as PHP writes them.
 */

export type PhpValue = string | number | boolean | null | PhpValue[] | { [key: string]: PhpValue };

/** The value of a serialized string, or undefined when it is not one. */
export function unserialize(text: string): PhpValue | undefined {
  const bytes = Buffer.from(text, 'utf8');
  let at = 0;
  const fail = (): never => {
    throw new Error('not serialized');
  };
  const readUntil = (char: string): string => {
    const end = bytes.indexOf(char, at, 'utf8');
    if (end === -1) fail();
    const value = bytes.toString('utf8', at, end);
    at = end + 1;
    return value;
  };
  const expect = (char: string) => {
    if (bytes.toString('utf8', at, at + 1) !== char) fail();
    at++;
  };
  const value = (): PhpValue => {
    const type = bytes.toString('utf8', at, at + 1);
    at += 2; // type and colon (or semicolon for N)
    switch (type) {
      case 'N':
        return null;
      case 'b':
        return readUntil(';') === '1';
      case 'i':
      case 'd': {
        const n = Number(readUntil(';'));
        return Number.isFinite(n) ? n : 0;
      }
      case 's': {
        const length = Number(readUntil(':'));
        if (!Number.isInteger(length) || length < 0) fail();
        expect('"');
        const s = bytes.toString('utf8', at, at + length);
        at += length;
        expect('"');
        expect(';');
        return s;
      }
      case 'a':
      case 'O': {
        if (type === 'O') {
          readUntil(':'); // class name length
          expect('"');
          readUntil('"');
          expect(':');
        }
        const size = Number(readUntil(':'));
        expect('{');
        const entries: [string | number, PhpValue][] = [];
        for (let i = 0; i < size; i++) {
          const key = value();
          if (typeof key !== 'string' && typeof key !== 'number') fail();
          entries.push([key as string | number, value()]);
        }
        expect('}');
        // A list (keys 0, 1, 2…) becomes an array.
        if (entries.every(([key], i) => key === i)) return entries.map(([, v]) => v);
        return Object.fromEntries(entries.map(([key, v]) => [String(key), v]));
      }
      default:
        return fail();
    }
  };
  try {
    const result = value();
    return at === bytes.length ? result : undefined;
  } catch {
    return undefined;
  }
}

/** A post meta value: serialized PHP, JSON, or the text itself. */
export function metaValue(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  if (/^(a|O|s|i|d|b):\d*[:;]|^N;$/.test(trimmed)) {
    const php = unserialize(trimmed);
    if (php !== undefined) return php;
  }
  if (/^[[{]/.test(trimmed)) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      // Not JSON: the text.
    }
  }
  return text;
}
