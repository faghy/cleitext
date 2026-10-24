import { describe, expect, it } from 'vitest';
import {
  FONT_FAMILY_ATTRIBUTE,
  familiesToLoad,
  fontLink,
  fontsMode,
  pageFamilies,
  rewriteCss,
} from './fonts.js';

describe('Google Fonts kept on the site, shared by Fresco and Prisma', () => {
  it('keeps them on the site unless the setting says otherwise', () => {
    expect(fontsMode(undefined)).toBe('local');
    expect(fontsMode('cdn')).toBe('local');
    expect(fontsMode('google')).toBe('google');
    expect(fontsMode('none')).toBe('none');
  });

  it('rewrites a stylesheet to the route of the plugin that keeps the copies', () => {
    const css = "@font-face{src:url(https://fonts.gstatic.com/s/lora/v1/a.woff2) format('woff2')}";
    const names = new Map([
      ['https://fonts.gstatic.com/s/lora/v1/a.woff2', `${'a'.repeat(32)}.woff2`],
    ]);
    expect(rewriteCss(css, names, '/_prisma/gfonts')).toBe(
      `@font-face{src:url(/_prisma/gfonts/${'a'.repeat(32)}.woff2) format('woff2')}`,
    );
  });

  it('names the family of each link, so another plugin never loads it again', () => {
    const link = fontLink(`/_fresco/gfonts/${'b'.repeat(32)}.css`, 'Poiret One');
    expect(link).toBe(
      `<link rel="stylesheet" href="/_fresco/gfonts/${'b'.repeat(32)}.css" ${FONT_FAMILY_ATTRIBUTE}="Poiret One">`,
    );
    const page = `<html><head>${link}<link rel="stylesheet" href="/x.css" data-font-family='Lora'></head></html>`;
    expect([...pageFamilies(page)].sort()).toEqual(['lora', 'poiretone']);
    expect(familiesToLoad(['Poiret One', 'Lora', 'Inter'], page)).toEqual(['Inter']);
    // A family attribute on something else than a stylesheet is not a font.
    expect(pageFamilies('<link rel="preload" href="/a" data-font-family="Lora">').size).toBe(0);
    expect(fontLink('/a.css?x=1&y="2"', 'A<b')).toContain('href="/a.css?x=1&amp;y=&quot;2&quot;"');
  });
});
