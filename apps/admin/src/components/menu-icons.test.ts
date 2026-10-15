import { describe, expect, it } from 'vitest';
import { MENU_ICONS, pluginIcon } from './menu-icons';

describe('menu icons', () => {
  it('uses the plugin icon when it is path data', () => {
    const envelope = 'M4 6h16v12H4z M4 7l8 6 8-6';
    expect(pluginIcon(envelope)).toBe(envelope);
  });

  it('falls back to the puzzle piece otherwise', () => {
    expect(pluginIcon(undefined)).toBe(MENU_ICONS.plugin);
    expect(pluginIcon('')).toBe(MENU_ICONS.plugin);
    expect(pluginIcon('<svg onload="alert(1)">')).toBe(MENU_ICONS.plugin);
    expect(pluginIcon('M0 0" onclick="x')).toBe(MENU_ICONS.plugin);
    expect(pluginIcon(`M0 0${'l1 1'.repeat(600)}`)).toBe(MENU_ICONS.plugin);
    expect(pluginIcon(42)).toBe(MENU_ICONS.plugin);
  });

  it('has only path data for the core entries', () => {
    for (const path of Object.values(MENU_ICONS)) expect(pluginIcon(path)).toBe(path);
  });
});
