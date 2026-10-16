import { describe, expect, it } from 'vitest';
import { backordersOf, categoryPaths, columnOf, parseCsv, toCsv, yesNo } from './csv';

describe('csv', () => {
  it('writes and reads back quotes, commas and line breaks', () => {
    const rows = [
      ['Name', 'Description'],
      ['Case, black', 'Says "hello"\nTwice'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('keeps formulas out of spreadsheets but not negative numbers', () => {
    expect(toCsv([['=SUM(A1)', '-3', '@x']])).toBe("'=SUM(A1),-3,'@x\r\n");
  });

  it('reads semicolons, a byte order mark and skips empty lines', () => {
    expect(parseCsv('﻿SKU;Prezzo\r\nA1;12,50\r\n\r\n')).toEqual([
      ['SKU', 'Prezzo'],
      ['A1', '12,50'],
    ]);
  });

  it('recognizes WooCommerce and Italian headers', () => {
    expect(columnOf('Weight (kg)')).toBe('weight');
    expect(columnOf('GTIN, UPC, EAN, or ISBN')).toBe('gtin');
    expect(columnOf('Prezzo di listino')).toBe('listPrice');
    expect(columnOf('regular price')).toBe('regularPrice');
    expect(columnOf('Meta: _foo')).toBeUndefined();
  });

  it('reads category paths, flags and backorders', () => {
    expect(categoryPaths('Electronics > Phones, Garden, Pots\\, big')).toEqual([
      ['Electronics', 'Phones'],
      ['Garden'],
      ['Pots, big'],
    ]);
    expect(yesNo('Sì')).toBe(true);
    expect(yesNo('0')).toBe(false);
    expect(yesNo('maybe')).toBeUndefined();
    expect(backordersOf('notify')).toBe('notify');
    expect(backordersOf('1')).toBe('yes');
  });
});
