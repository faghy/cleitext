/**
 * PHP's `serialize()` format, read (plugin API 1.48): WordPress exports
 * arrays of post, term and option meta this way (e.g. ACF's field settings
 * and repeater layouts). Plain values and arrays; objects become plain
 * objects of their properties. String lengths count bytes (UTF-8), as PHP
 * writes them.
 */

export type PhpValue = string | number | boolean | null | PhpValue[] | { [key: string]: PhpValue };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The value of a serialized string, or undefined when it is not one. */
export function phpUnserialize(text: string): PhpValue | undefined {
  const bytes = encoder.encode(text);
  let at = 0;
  const fail = (): never => {
    throw new Error('not serialized');
  };
  const char = (): string => String.fromCharCode(bytes[at] ?? 0);
  const readUntil = (stop: string): string => {
    const code = stop.charCodeAt(0);
    const end = bytes.indexOf(code, at);
    if (end === -1) fail();
    const value = decoder.decode(bytes.subarray(at, end));
    at = end + 1;
    return value;
  };
  const expect = (wanted: string) => {
    if (char() !== wanted) fail();
    at++;
  };
  const value = (depth: number): PhpValue => {
    if (depth > 64) fail();
    const type = char();
    at += 2; // the type and its colon (a semicolon for N)
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
        if (!Number.isInteger(length) || length < 0 || at + length + 1 > bytes.length) fail();
        expect('"');
        const s = decoder.decode(bytes.subarray(at, at + length));
        at += length;
        expect('"');
        expect(';');
        return s;
      }
      case 'a':
      case 'O': {
        if (type === 'O') {
          readUntil(':'); // the class name's length
          expect('"');
          readUntil('"');
          expect(':');
        }
        const size = Number(readUntil(':'));
        if (!Number.isInteger(size) || size < 0) fail();
        expect('{');
        const entries: [string | number, PhpValue][] = [];
        for (let i = 0; i < size; i++) {
          const key = value(depth + 1);
          if (typeof key !== 'string' && typeof key !== 'number') fail();
          entries.push([key as string | number, value(depth + 1)]);
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
    const result = value(0);
    return at === bytes.length ? result : undefined;
  } catch {
    return undefined;
  }
}

/** A meta value as WordPress stored it: serialized PHP, JSON, or the text itself. */
export function phpMetaValue(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  if (/^(a|O|s|i|d|b):\d*[:;]|^N;$/.test(trimmed)) {
    const php = phpUnserialize(trimmed);
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
