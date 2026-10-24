/**
 * Diorama 1.2: fonts of the site and Google fonts, text outlines, line
 * breaking and button sizes, per device; sliders of 1.1 keep their CSS.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  cleanFamily,
  familyStack,
  fontCss,
  googleFontsHref,
  markedFonts,
  pageFonts,
  settingsFamilies,
  sliderGoogleFonts,
} from '../src/model/fonts';
import { defaultLayer, defaultSlide, defaultSlider, normalizeSlider } from '../src/model/normalize';
import { layerStyle } from '../src/model/resolve';
import type { Layer, LayerStyle, SliderData } from '../src/model/types';
import { BASE_CSS } from '../src/render/base-css';
import { layerDeclarations, sliderCss } from '../src/render/css';
import { SliderView } from '../src/render/render';
import { MEDIA } from './fixtures';

type Style = Partial<LayerStyle>;

function layer(
  type: Layer['type'],
  style: { base?: Style; tablet?: Style; mobile?: Style },
  text?: string,
): Layer {
  const fallback = defaultLayer(type);
  return normalizeSlider({
    slides: [
      {
        layers: [
          {
            ...fallback,
            id: 'l1',
            content: { ...fallback.content, ...(text === undefined ? {} : { text }) },
            style: { ...style, base: { ...fallback.style.base, ...style.base } },
          },
        ],
      },
    ],
  }).slides[0]!.layers[0]!;
}

function slider(layers: Layer[]): SliderData {
  return normalizeSlider(defaultSlider({ slides: [defaultSlide({ layers })] }));
}

const decl = (l: Layer, device: 'desktop' | 'tablet' | 'mobile', autoMobile = false) =>
  layerDeclarations(l, device, autoMobile, true).split(';');

describe('the new style values', () => {
  it('have defaults that write nothing, so 1.1 sliders keep their CSS', () => {
    const old = defaultLayer('button');
    const stored = JSON.parse(JSON.stringify(old)) as Layer;
    for (const key of [
      'strokeWidth',
      'strokeColor',
      'outline',
      'textWrap',
      'minHeight',
      'widthMode',
      'fixedWidth',
    ] as const)
      delete (stored.style.base as Partial<LayerStyle>)[key];
    const normalized = normalizeSlider({ slides: [{ layers: [stored] }] }).slides[0]!.layers[0]!;
    expect(normalized.style.base).toMatchObject({
      strokeWidth: 0,
      outline: false,
      textWrap: 'auto',
      minHeight: 0,
      widthMode: 'auto',
    });
    const list = decl(normalized, 'desktop');
    expect(list.join(';')).not.toMatch(/stroke|text-wrap|white-space|min-height|fill-color/);
    expect(list).not.toContain('width:100%');
  });

  it('are bounded', () => {
    const l = layer('heading', {
      base: {
        strokeWidth: 99,
        strokeColor: 'red;x:y' as string,
        textWrap: 'squeeze' as never,
        minHeight: -4,
        widthMode: 'huge' as never,
        fixedWidth: 1,
      },
    });
    expect(l.style.base).toMatchObject({
      strokeWidth: 20,
      strokeColor: '#000000',
      textWrap: 'auto',
      minHeight: 0,
      widthMode: 'auto',
      fixedWidth: 20,
    });
  });
});

describe('fonts', () => {
  it('keeps presets, the theme’s heading font and families’ names; drops anything else', () => {
    expect(cleanFamily('serif')).toBe('serif');
    expect(cleanFamily('heading')).toBe('heading');
    expect(cleanFamily('  Rubik ')).toBe('Rubik');
    expect(cleanFamily('Open  Sans')).toBe('Open Sans');
    for (const bad of ['Rubik;color:red', '"Rubik"', 'a{b}', '', 42, '-apple-system'])
      expect(cleanFamily(bad)).toBeNull();
    const l = layer('text', { base: { fontFamily: 'x}{' } });
    expect(l.style.base.fontFamily).toBe('inherit');
  });

  it('writes a family with the generic family of its Google category', () => {
    expect(familyStack('Rubik')).toBe('"Rubik",sans-serif');
    expect(familyStack('Lora')).toBe('"Lora",serif');
    expect(familyStack('Caveat')).toBe('"Caveat",cursive');
    expect(familyStack('My Theme Font')).toBe('"My Theme Font",sans-serif');
    expect(fontCss('heading')).toBeNull();
    expect(fontCss('inherit')).toBe('inherit');
  });

  it('writes the family per device', () => {
    const l = layer('heading', {
      base: { fontFamily: 'Rubik' },
      mobile: { fontFamily: 'Lora' },
    });
    expect(decl(l, 'desktop')).toContain('font-family:"Rubik",sans-serif');
    const css = sliderCss(slider([l]), 'k');
    expect(css).toContain('font-family:"Rubik",sans-serif');
    expect(css).toMatch(/@media \(max-width:767px\)\{[^@]*font-family:"Lora",serif/);
  });

  it('leaves the theme’s heading font to the theme’s rules (class dio-fh)', () => {
    const l = layer('heading', { base: { fontFamily: 'heading' }, tablet: { fontFamily: 'Lora' } });
    expect(decl(l, 'desktop').some((d) => d.startsWith('font-family'))).toBe(false);
    expect(decl(l, 'tablet')).toContain('font-family:"Lora",serif');
    const back = layer('heading', {
      base: { fontFamily: 'heading' },
      mobile: { fontFamily: 'inherit' },
    });
    expect(decl(back, 'mobile')).toContain('font-family:inherit');
    const html = renderToStaticMarkup(
      <SliderView slider={slider([l])} scope="k" uid="u" title="T" locale="en" media={MEDIA} />,
    );
    expect(html).toMatch(/<h2 class="dio-l dio-ll1 dio-heading dio-fh"/);
    // Every other layer still inherits the whole font; this one keeps the theme's family.
    expect(BASE_CSS).toContain('.dio-l:not(:where(.dio-fh)){font:inherit}');
    expect(BASE_CSS).not.toMatch(/\.dio-l\{[^}]*font:inherit/);
  });

  it('lists the Google fonts of a slider with the weights each family has', () => {
    const s = slider([
      layer('heading', { base: { fontFamily: 'Rubik', fontWeight: 800 } }),
      layer('text', { base: { fontFamily: 'Rubik', fontWeight: 400 } }),
      layer('button', { base: { fontFamily: 'Lobster', fontWeight: 600 } }),
      layer('text', { base: { fontFamily: 'My Theme Font' } }),
      layer('text', { base: { fontFamily: 'serif' }, mobile: { fontFamily: 'Oswald' } }),
    ]);
    const fonts = sliderGoogleFonts(s);
    // Lobster has only 400: it is asked for with it.
    expect([...fonts]).toEqual([
      ['Lobster', [400]],
      ['Oswald', [400]],
      ['Rubik', [400, 800]],
    ]);
    expect(googleFontsHref(fonts)).toBe(
      'https://fonts.googleapis.com/css2?family=Lobster:wght@400&family=Oswald:wght@400&family=Rubik:wght@400;800&display=swap',
    );
    expect(googleFontsHref(new Map())).toBeNull();
  });

  it('reads the families of the sliders’ links on a page, merged', () => {
    const html =
      '<link rel="stylesheet" href="x" data-dio-fonts="Rubik:400;700|Nope Font:400"><p></p><link data-dio-fonts="Rubik:900|Oswald:700">';
    expect([...markedFonts(html)]).toEqual([
      ['Oswald', [700]],
      ['Rubik', [400, 700, 900]],
    ]);
  });

  it('finds the fonts a page of the site loads', () => {
    const html = `<head>
<link rel="stylesheet" href="/_fonts/${'a'.repeat(32)}.css" data-font-family="Rubik">
<link rel="stylesheet" href="https://fonts.bunny.net/css?family=open-sans:400|lato:700">
<link rel="stylesheet" href="https://elsewhere.example/_fonts/x.css" data-font-family="Karla">
<style>@font-face{font-family:'Brand Sans';src:url(/fonts/brand.woff2)}body{font-family:'Brand Sans'}</style>
<style>@import url("https://fonts.googleapis.com/css2?family=Lora:wght@400");</style></head>`;
    const found = pageFonts(html, 'https://site.example');
    expect(found.families).toEqual(['Rubik', 'Open Sans', 'Lato', 'Karla', 'Brand Sans', 'Lora']);
    expect(found.links).toEqual([{ family: 'Rubik', href: `/_fonts/${'a'.repeat(32)}.css` }]);
    expect(found.faces).toContain("font-family:'Brand Sans'");
  });
});

it('reads the families of a theme’s settings', () => {
  expect(
    settingsFamilies({
      'body-font-family': 'rubik',
      'headings-font-family': 'Oswald',
      'body-font-weight': '400',
      typography: { family: 'Lora', size: { desktop: 18 } },
      'font-source': 'google',
      fontStack: 'system-ui, sans-serif',
      'button-font-family': 'inherit',
      title: 'Rubik',
    }),
  ).toEqual(['Rubik', 'Oswald', 'Lora']);
});

describe('text outline', () => {
  it('writes the stroke per device and takes it back on a smaller one', () => {
    const l = layer('heading', {
      base: { strokeWidth: 2, strokeColor: '#ff0000' },
      mobile: { strokeWidth: 0 },
    });
    expect(decl(l, 'desktop')).toContain('-webkit-text-stroke:2px #ff0000');
    expect(decl(l, 'tablet')).toContain('-webkit-text-stroke:2px #ff0000');
    expect(decl(l, 'mobile')).toContain('-webkit-text-stroke:0 transparent');
  });

  it('draws outlined letters: no fill, at least 1 px', () => {
    const l = layer('text', { base: { outline: true }, tablet: { outline: false } });
    const desktop = decl(l, 'desktop');
    expect(desktop).toContain('-webkit-text-stroke:1px #000000');
    expect(desktop).toContain('-webkit-text-fill-color:transparent');
    expect(decl(l, 'tablet')).toContain('-webkit-text-fill-color:currentcolor');
    expect(decl(layer('button', { base: { outline: true, strokeWidth: 3 } }), 'desktop')).toContain(
      '-webkit-text-stroke:3px #000000',
    );
  });

  it('is not written for pictures and shapes', () => {
    const shape = layer('shape', { base: { strokeWidth: 4 } });
    expect(decl(shape, 'desktop').join(';')).not.toContain('stroke');
  });
});

describe('line breaking', () => {
  it('keeps the shared CSS by default: balanced headings, “pretty” texts', () => {
    expect(BASE_CSS).toContain('text-wrap:balance');
    expect(BASE_CSS).toContain('.dio-l.dio-text{text-wrap:pretty}');
    expect(decl(layer('heading', {}), 'desktop').join(';')).not.toContain('wrap');
  });

  it('writes the choice per device, and the type’s default when a smaller device goes back', () => {
    const l = layer('heading', { base: { textWrap: 'normal' }, tablet: { textWrap: 'pretty' } });
    expect(decl(l, 'desktop')).toContain('text-wrap:wrap');
    expect(decl(l, 'tablet')).toContain('text-wrap:pretty');
    const back = layer('text', { base: { textWrap: 'balance' }, mobile: { textWrap: 'auto' } });
    expect(decl(back, 'mobile')).toContain('text-wrap:pretty');
  });

  it('keeps one line on phones only when set there (no text running off the slide)', () => {
    const l = layer('heading', { base: { textWrap: 'nowrap' } });
    expect(decl(l, 'desktop')).toContain('white-space:nowrap');
    expect(layerStyle(l, 'mobile', true).textWrap).toBe('auto');
    const phone = decl(l, 'mobile', true);
    expect(phone).toContain('white-space:normal');
    expect(phone).toContain('text-wrap:balance');
    const kept = layer('heading', { base: { textWrap: 'nowrap' }, mobile: { textWrap: 'nowrap' } });
    expect(decl(kept, 'mobile', true)).toContain('white-space:nowrap');
  });

  it('turns line breaks of the text into <br>, Windows ones too', () => {
    const l = layer('heading', {}, 'One\nTwo\r\nThree');
    const html = renderToStaticMarkup(
      <SliderView slider={slider([l])} scope="k" uid="u" title="T" locale="en" media={MEDIA} />,
    );
    expect(html).toContain('One<br/>Two<br/>Three');
    const button = layer('button', {}, 'Book\nnow');
    expect(decl(button, 'desktop')).toContain('text-align:center');
    expect(decl(layer('button', {}, 'Book now'), 'desktop').join(';')).not.toContain('text-align');
  });
});

describe('button size', () => {
  it('has a least height per device, the text centred by the shared CSS', () => {
    const l = layer('button', { base: { minHeight: 56 }, mobile: { minHeight: 0 } });
    expect(decl(l, 'desktop')).toContain('min-height:56px');
    expect(decl(l, 'tablet')).toContain('min-height:56px');
    expect(decl(l, 'mobile')).toContain('min-height:0');
    expect(BASE_CSS).toMatch(
      /\.dio-btn\{display:inline-flex;align-items:center;justify-content:center/,
    );
    // The padding still applies.
    expect(decl(l, 'desktop')).toContain('padding:14px 28px');
  });

  it('is as wide as its text, fixed or full width', () => {
    const fixed = layer('button', {
      base: { widthMode: 'fixed', fixedWidth: 260 },
      tablet: { widthMode: 'full' },
      mobile: { widthMode: 'auto' },
    });
    const desktop = decl(fixed, 'desktop');
    // After the position's width, so it wins.
    expect(desktop.indexOf('width:260px')).toBeGreaterThan(desktop.indexOf('width:max-content'));
    expect(desktop).toContain('max-width:100%');
    expect(decl(fixed, 'tablet')).toContain('width:100%');
    // In a box (not placed), back to its text's width.
    expect(layerDeclarations(fixed, 'mobile', false, false).split(';')).toContain('width:auto');
    expect(decl(layer('heading', { base: { minHeight: 40 } }), 'desktop').join(';')).not.toContain(
      'min-height',
    );
  });
});
