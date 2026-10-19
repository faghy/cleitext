import { describe, expect, it } from 'vitest';
import { kitCss, normalizeKit, normalizeTheme, themeCss } from '../src/core/kit.js';

describe('theme style of the site settings', () => {
  it('keeps only known and safe values', () => {
    const theme = normalizeTheme({
      texts: {
        h1: { font: 'primary', size: { size: 48, unit: 'px' }, color: '#112233' },
        h2: { color: 'red;}body{display:none' },
        p: { color: '#000000' },
      },
      button: { background: '#c2410c', radius: { size: 4, unit: 'px' }, evil: 'x' },
      image: { opacity: 2, hoverOpacity: 0.8 },
      lightbox: {},
    });
    expect(theme).toEqual({
      texts: { h1: { font: 'primary', size: { size: 48, unit: 'px' }, color: '#112233' } },
      button: { background: '#c2410c', radius: { size: 4, unit: 'px' } },
      image: { hoverOpacity: 0.8 },
    });
  });

  it('writes CSS for texts, buttons, images, fields and the lightbox', () => {
    const css = themeCss(
      normalizeTheme({
        texts: { body: { family: 'Roboto', color: '#333333' }, h2: { font: 'secondary' } },
        button: { background: '#111111', hoverBackground: '#222222', paddingY: { size: 10, unit: 'px' } },
        image: { radius: { size: 8, unit: 'px' }, hoverOpacity: 0.5 },
        field: { borderColor: '#cccccc', focusBorderColor: '#c2410c' },
        lightbox: { background: '#000000', uiColor: '#ffffff' },
      }),
    );
    expect(css).toContain('body{font-family:');
    expect(css).toContain('color:#333333');
    expect(css).toContain('body h2{font-family:var(--fr-t-secondary-family)');
    expect(css).toContain('.fr-button__link{background-color:#111111;padding:10px 24px}');
    expect(css).toContain('.fr-button__link:hover,.fr-button__link:focus-visible{background-color:#222222}');
    expect(css).toContain('.fr-image img:hover{opacity:0.5}');
    expect(css).toContain(':focus{border-color:#c2410c');
    expect(css).toContain('.fr-lb{background:#000000}');
  });

  it('is part of the kit and empty by default', () => {
    expect(normalizeKit({}).theme).toEqual({});
    expect(themeCss({})).toBe('');
    expect(kitCss(normalizeKit({ theme: { texts: { h3: { color: '#abcdef' } } } }))).toContain(
      'body h3{color:#abcdef}',
    );
  });
});
