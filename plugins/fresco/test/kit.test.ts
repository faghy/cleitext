import { describe, expect, it } from 'vitest';
import {
  googleFontsUrl,
  kitCss,
  mergeKit,
  normalizeKit,
  normalizeTheme,
  themeCss,
} from '../src/core/kit.js';

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
        button: {
          background: '#111111',
          hoverBackground: '#222222',
          paddingY: { size: 10, unit: 'px' },
        },
        image: { radius: { size: 8, unit: 'px' }, hoverOpacity: 0.5 },
        field: { borderColor: '#cccccc', focusBorderColor: '#c2410c' },
        lightbox: { background: '#000000', uiColor: '#ffffff' },
      }),
    );
    expect(css).toContain('body{font-family:');
    expect(css).toContain('color:#333333');
    expect(css).toContain('body h2{font-family:var(--fr-t-secondary-family)');
    expect(css).toContain('.fr-button__link{background-color:#111111;padding:10px 24px}');
    expect(css).toContain(
      '.fr-button__link:hover,.fr-button__link:focus-visible{background-color:#222222}',
    );
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

describe('kits imported from other builders', () => {
  it('lays the imported kit over the current one', () => {
    const current = normalizeKit({
      colors: [{ id: 'brand', title: 'Brand', value: '#000000' }],
      googleFonts: ['Inter'],
      theme: { texts: { h1: { color: '#111111' } } },
    });
    const kit = mergeKit(current, {
      colors: [
        { id: 'primary', title: 'Primary', value: '#123456' },
        { id: 'a1b2c3d', title: 'Sand', value: '#f5e6c8' },
      ],
      fonts: [{ id: 'primary', title: 'Primary', family: 'Abel', weight: '700' }],
      breakpoints: { tablet: 1000, mobile: 700 },
      gap: { size: 16, unit: 'px' },
      theme: { texts: { h2: { family: 'Lora' } }, button: { background: '#ff6600' } },
      googleFonts: ['Abel', 'Karla', 'Bad;font'],
      titleSelector: 'h1.entry-title, .hello-title',
    });
    expect(kit.colors.find((c) => c.id === 'primary')!.value).toBe('#123456');
    expect(kit.colors.map((c) => c.id)).toEqual([
      'primary',
      'secondary',
      'text',
      'accent',
      'brand',
      'a1b2c3d',
    ]);
    expect(kit.fonts[0]).toMatchObject({ family: 'Abel', weight: '700' });
    expect(kit.breakpoints).toEqual({ tablet: 1000, mobile: 700 });
    expect(kit.gap).toEqual({ size: 16, unit: 'px' });
    expect(kit.theme).toEqual({
      texts: { h1: { color: '#111111' }, h2: { family: 'Lora' } },
      button: { background: '#ff6600' },
    });
    expect(kit.googleFonts).toEqual(['Inter', 'Abel', 'Karla']);
    expect(kit.titleSelector).toBe('h1.entry-title, .hello-title');
  });

  it('loads any Google font listed in the kit, not only the popular ones', () => {
    const url = googleFontsUrl(normalizeKit({ googleFonts: ['Abel', 'Roboto Slab'] }))!;
    expect(url).toContain('family=Abel:');
    expect(url).toContain('family=Roboto+Slab:');
    // Global fonts are loaded only when they are popular ones (others may be custom fonts).
    const globals = googleFontsUrl(
      normalizeKit({ fonts: [{ id: 'primary', title: 'P', family: 'My Brand', weight: '400' }] }),
    )!;
    expect(globals).toContain('family=Inter');
    expect(globals).not.toContain('My+Brand');
  });
});
