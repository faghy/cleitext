import { describe, expect, it } from 'vitest';
import {
  elementGoogleFonts,
  googleFontList,
  isGoogleFont,
  pageGoogleFonts,
  usedGoogleFonts,
} from '../src/core/fonts.js';
import { googleFontsUrl, normalizeKit } from '../src/core/kit.js';
import { rootProps } from '../src/core/common.js';

describe('Google Fonts', () => {
  it('knows the whole catalog, not only the popular families', () => {
    const list = googleFontList();
    expect(list.length).toBeGreaterThan(1500);
    expect(isGoogleFont('Abel')).toBe(true);
    expect(isGoogleFont('Zilla Slab')).toBe(true);
    expect(isGoogleFont('Arial')).toBe(false);
    expect(list.find((f) => f.family === 'Lobster')?.category).toBe('display');
  });

  it('asks Google only for the weights a family has', () => {
    const url = googleFontsUrl(normalizeKit({ googleFonts: ['Abel'] }))!;
    expect(url).toContain('family=Abel:wght@400&');
    // Families with every weight keep the address they always had.
    expect(url).toContain('family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400');
  });

  it('finds the fonts of elements and pages, to load them where they are used', () => {
    expect(
      elementGoogleFonts({
        title_typography_family: 'Lobster',
        text_typography_family: 'var(--fr-t-primary-family)',
        font: 'Arial',
        _styles: [{ device: 'desktop', state: '', props: { fontFamily: 'Pacifico' } }],
      }),
    ).toEqual(['Lobster', 'Pacifico']);
    expect(
      pageGoogleFonts('<div data-fr-fonts="Lobster|Nope"></div><p data-fr-fonts="Abel">'),
    ).toEqual(['Lobster', 'Abel']);
    expect(usedGoogleFonts('body h2{font-family:"Lora", serif}:root{--fr-v-x:"Karla"}')).toEqual([
      'Lora',
      'Karla',
    ]);
    const url = googleFontsUrl(normalizeKit({}), ['Lobster', 'Not A Font'])!;
    expect(url).toContain('family=Lobster');
    expect(url).not.toContain('Not');
  });

  it('names the fonts of an element on the page only (not in the editor)', () => {
    const node = {
      id: 'a1',
      type: 'fresco/heading',
      v: 1,
      attrs: { title_typography_family: 'Lobster' },
    };
    expect(rootProps(node, node.attrs, 'fr-heading', false)['data-fr-fonts']).toBe('Lobster');
    expect(rootProps(node, node.attrs, 'fr-heading', true)['data-fr-fonts']).toBeUndefined();
    expect(
      rootProps({ ...node, attrs: {} }, {}, 'fr-heading', false)['data-fr-fonts'],
    ).toBeUndefined();
  });
});
