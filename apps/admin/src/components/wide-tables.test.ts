import { describe, expect, it } from 'vitest';
import { tableIsWide } from './wide-tables';

const table = (
  size: { offset: number; scroll?: number; client?: number; room: number; right?: number },
  marked = false,
) => ({
  marked,
  offsetWidth: size.offset,
  scrollWidth: size.scroll ?? size.offset,
  clientWidth: size.client ?? size.offset,
  room: size.room,
  right: size.right ?? 12 + size.offset,
  limit: 378,
});

describe('tableIsWide', () => {
  it('leaves a table that fits its box', () => {
    expect(tableIsWide(table({ offset: 340, room: 340 }))).toBe(false);
  });

  it('marks a table wider than its box', () => {
    expect(tableIsWide(table({ offset: 520, room: 340 }))).toBe(true);
  });

  it('marks a table whose boxes grew with it past the content edge', () => {
    expect(tableIsWide(table({ offset: 432, room: 432, right: 456 }))).toBe(true);
  });

  it('keeps a scrolling table marked while its content is wider', () => {
    expect(tableIsWide(table({ offset: 340, scroll: 520, client: 340, room: 340 }, true))).toBe(
      true,
    );
  });

  it('lets a scrolling table go back once its content fits', () => {
    expect(tableIsWide(table({ offset: 340, room: 340 }, true))).toBe(false);
  });
});
