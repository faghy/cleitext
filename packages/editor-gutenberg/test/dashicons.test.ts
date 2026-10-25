import {
  getBlockType,
  getBlockVariations,
  registerBlockType,
  unregisterBlockType,
} from '@wordpress/blocks';
import * as icons from '@wordpress/icons';
import { describe, expect, it } from 'vitest';
import {
  DASHICONS,
  dashiconSvg,
  installDashiconIcons,
  svgIcon,
  withSvgIcons,
} from '../src/dashicons';
import { loadPluginEditors } from '../src/plugin-editors';

describe('Dashicon names as block icons', () => {
  it('turns names into SVG icons, a close one or a generic one', () => {
    expect(dashiconSvg('calendar')).toBe(icons.calendar);
    expect(dashiconSvg('calendar-alt')).toBe(icons.calendar);
    expect(dashiconSvg('id')).toBe(icons.postAuthor);
    expect(dashiconSvg('star-filled')).toBe(icons.starFilled);
    expect(dashiconSvg('no-such-dashicon')).toBe(icons.blockDefault);
    // Every name of the table leads to a real icon.
    for (const icon of Object.values(DASHICONS)) expect(icons[icon]).toBeDefined();
    for (const name of [
      'email',
      'format-chat',
      'location-alt',
      'slides',
      'cart',
      'admin-plugins',
    ]) {
      expect(dashiconSvg(name)).not.toBe(icons.blockDefault);
    }
  });

  it('keeps icons that are already SVG, and converts objects with a name', () => {
    expect(svgIcon(icons.cart)).toBe(icons.cart);
    expect(svgIcon('<svg></svg>')).toBe('<svg></svg>');
    expect(svgIcon({ src: 'cart', foreground: '#f00' })).toEqual({
      src: icons.cart,
      foreground: '#f00',
    });
    expect(withSvgIcons({ title: 'X', variations: [{ icon: 'id' }] })).toEqual({
      title: 'X',
      variations: [{ icon: icons.postAuthor }],
    });
  });

  it('gives blocks registered with a Dashicon name its SVG, variations too', async () => {
    installDashiconIcons();
    registerBlockType('test/dashicon', {
      apiVersion: 3,
      title: 'Guide card',
      category: 'widgets',
      icon: 'id',
      attributes: { name: { type: 'string' } },
      edit: () => null,
      save: () => null,
    } as never);
    expect(getBlockType('test/dashicon')?.icon).toMatchObject({ src: icons.postAuthor });
    // Plugin entries reach `@wordpress/blocks` through the shared modules.
    await loadPluginEditors([]);
    const shared = (
      globalThis as unknown as Record<string, Record<string, Record<string, unknown>>>
    ).__cleitextShared!['@wordpress/blocks']!;
    (shared.registerBlockVariation as (name: string, v: object) => void)('test/dashicon', {
      name: 'card',
      title: 'Card',
      icon: 'cart',
      attributes: { name: 'card' },
    });
    expect(getBlockVariations('test/dashicon')?.[0]?.icon).toBe(icons.cart);
    unregisterBlockType('test/dashicon');
  });
});
