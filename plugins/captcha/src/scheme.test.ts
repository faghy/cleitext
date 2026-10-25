import { describe, expect, it } from 'vitest';
import { pageScheme, widgetTheme, type SchemeView } from './public/_scheme';

/** A root with the given attribute, a computed color-scheme and a system preference. */
function page(attribute: string | null, computed: string | undefined, systemDark: boolean) {
  const root = {
    getAttribute: (name: string) => (name === 'data-color-scheme' ? attribute : null),
  };
  const view: SchemeView = {
    getComputedStyle: () => ({ colorScheme: computed }),
    matchMedia: (query) => ({ matches: query === '(prefers-color-scheme: dark)' && systemDark }),
  };
  return { root, view };
}

describe('automatic widget theme', () => {
  it('follows <html data-color-scheme> over the system', () => {
    const light = page('light', 'light dark', true);
    expect(pageScheme(light.root, light.view)).toBe('light');
    const dark = page('dark', 'light dark', false);
    expect(pageScheme(dark.root, dark.view)).toBe('dark');
  });

  it('then the computed color-scheme of the root, when it names one scheme', () => {
    const light = page('auto', 'light', true);
    expect(pageScheme(light.root, light.view)).toBe('light');
    const onlyLight = page(null, 'only light', true);
    expect(pageScheme(onlyLight.root, onlyLight.view)).toBe('light');
    const dark = page(null, 'dark', false);
    expect(pageScheme(dark.root, dark.view)).toBe('dark');
  });

  it('then the system, when the page follows it or says nothing', () => {
    for (const computed of ['light dark', 'normal', '', undefined]) {
      const dark = page('auto', computed, true);
      expect(pageScheme(dark.root, dark.view)).toBe('dark');
      const light = page(null, computed, false);
      expect(pageScheme(light.root, light.view)).toBe('light');
    }
    expect(pageScheme(null, {})).toBe('light');
    expect(
      pageScheme(page(null, '', true).root, {
        getComputedStyle: () => {
          throw new Error('not an element');
        },
        matchMedia: () => ({ matches: true }),
      }),
    ).toBe('dark');
  });

  it('keeps a fixed choice of the settings', () => {
    const lightPage = page('light', 'light', false);
    expect(widgetTheme('dark', lightPage.root, lightPage.view)).toBe('dark');
    const darkPage = page('dark', 'dark', true);
    expect(widgetTheme('light', darkPage.root, darkPage.view)).toBe('light');
    expect(widgetTheme('auto', darkPage.root, darkPage.view)).toBe('dark');
    expect(widgetTheme(undefined, lightPage.root, lightPage.view)).toBe('light');
  });
});
