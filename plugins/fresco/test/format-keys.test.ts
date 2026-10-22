import { describe, expect, it } from 'vitest';
import { formatShortcut } from '../src/editor/format-keys.js';

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('format shortcuts', () => {
  it('maps Ctrl/Cmd+B, I and U', () => {
    expect(formatShortcut(key('b', { ctrlKey: true }))).toBe('bold');
    expect(formatShortcut(key('I', { metaKey: true }))).toBe('italic');
    expect(formatShortcut(key('u', { ctrlKey: true }))).toBe('underline');
  });
  it('ignores other keys and combinations', () => {
    expect(formatShortcut(key('b'))).toBeNull();
    expect(formatShortcut(key('b', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(formatShortcut(key('s', { ctrlKey: true }))).toBeNull();
  });
});
