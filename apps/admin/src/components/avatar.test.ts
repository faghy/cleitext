import { describe, expect, it } from 'vitest';
import { initials } from './avatar';

describe('initials', () => {
  it('uses the first and last word', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('  maria  de la cruz ')).toBe('MC');
    expect(initials('Zoë')).toBe('Z');
    expect(initials('')).toBe('?');
  });
});
