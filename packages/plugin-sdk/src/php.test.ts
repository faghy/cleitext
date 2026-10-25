import { describe, expect, it } from 'vitest';
import { phpMetaValue, phpUnserialize } from './php.js';

describe('phpUnserialize', () => {
  it('reads plain values, lists and keyed arrays', () => {
    expect(phpUnserialize('i:12;')).toBe(12);
    expect(phpUnserialize('d:1.5;')).toBe(1.5);
    expect(phpUnserialize('b:1;')).toBe(true);
    expect(phpUnserialize('N;')).toBeNull();
    expect(phpUnserialize('a:2:{i:0;s:4:"hero";i:1;s:7:"gallery";}')).toEqual(['hero', 'gallery']);
    expect(
      phpUnserialize('a:2:{s:4:"type";s:6:"number";s:4:"rows";a:1:{i:0;a:1:{s:1:"x";i:1;}}}'),
    ).toEqual({ type: 'number', rows: [{ x: 1 }] });
  });

  it('counts string lengths in bytes, as PHP writes them', () => {
    expect(phpUnserialize('s:6:"caffè";')).toBe('caffè');
    expect(phpUnserialize('s:5:"caffè";')).toBeUndefined();
  });

  it('reads objects as their properties', () => {
    expect(phpUnserialize('O:8:"stdClass":1:{s:4:"name";s:3:"Ann";}')).toEqual({ name: 'Ann' });
  });

  it('gives undefined for text that is not serialized', () => {
    expect(phpUnserialize('hello')).toBeUndefined();
    expect(phpUnserialize('a:1:{i:0;s:3:"ab";}')).toBeUndefined();
    expect(phpUnserialize('i:1;extra')).toBeUndefined();
  });
});

describe('phpMetaValue', () => {
  it('decodes serialized PHP and JSON, keeps other text', () => {
    expect(phpMetaValue('a:1:{i:0;i:5;}')).toEqual([5]);
    expect(phpMetaValue('[1,2]')).toEqual([1, 2]);
    expect(phpMetaValue('{"a":1}')).toEqual({ a: 1 });
    expect(phpMetaValue('just text')).toBe('just text');
    expect(phpMetaValue(undefined)).toBeUndefined();
  });
});
