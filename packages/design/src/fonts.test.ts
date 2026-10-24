import { describe, expect, it } from 'vitest';
import {
  FONT_FAMILY_ATTRIBUTE,
  cssFileUrls,
  familiesToLoad,
  familyStylesheets,
  fontFileCheck,
  fontLink,
  fontsMode,
  isBunnyCssUrl,
  isBunnyFileUrl,
  isFontServiceCssUrl,
  pageFamilies,
  rewriteCss,
  woff2Only,
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

describe('Bunny Fonts and family stylesheets', () => {
  it('accepts Bunny Fonts stylesheets and files only on fonts.bunny.net', () => {
    expect(isBunnyCssUrl('https://fonts.bunny.net/css?family=inter:400')).toBe(true);
    expect(isBunnyCssUrl('http://fonts.bunny.net/css?family=inter:400')).toBe(false);
    expect(isBunnyCssUrl('https://fonts.bunny.net/inter/files/a.woff2')).toBe(false);
    expect(isFontServiceCssUrl('https://fonts.googleapis.com/css2?family=Lora')).toBe(true);
    expect(isBunnyFileUrl('https://fonts.bunny.net/inter/files/inter-latin-400-normal.woff2')).toBe(
      true,
    );
    expect(isBunnyFileUrl('https://fonts.bunny.net/inter/files/../x.woff2')).toBe(false);
    expect(isBunnyFileUrl('https://evil.example/inter/files/a.woff2')).toBe(false);
    // Each service's stylesheet names files of that service only.
    const bunnyCss =
      "@font-face{src:url(https://fonts.gstatic.com/s/a/v1/b.woff2) format('woff2')}";
    expect(cssFileUrls(bunnyCss, fontFileCheck('https://fonts.bunny.net/css?family=a')!)).toBe(
      null,
    );
  });

  it('keeps only the WOFF2 files of a Bunny stylesheet', () => {
    const css =
      "@font-face {\n  font-family: 'Inter';\n  src: url(https://fonts.bunny.net/inter/files/a.woff2) format('woff2'), url(https://fonts.bunny.net/inter/files/a.woff) format('woff'); \n}";
    expect(woff2Only(css)).toContain(
      "src: url(https://fonts.bunny.net/inter/files/a.woff2) format('woff2');",
    );
    expect(woff2Only(css)).not.toContain('a.woff)');
    // Nothing to choose: as it was.
    const ttf = '@font-face{src:url(https://x/a.ttf) format("truetype")}';
    expect(woff2Only(ttf)).toBe(ttf);
  });

  it('splits a stylesheet into one address per family', () => {
    expect(
      familyStylesheets(
        'https://fonts.bunny.net/css?family=inter:400,700|jetbrains-mono:400&amp;display=swap',
      ),
    ).toEqual([
      {
        family: 'inter',
        url: 'https://fonts.bunny.net/css?family=inter%3A400%2C700&display=swap',
      },
      {
        family: 'jetbrains-mono',
        url: 'https://fonts.bunny.net/css?family=jetbrains-mono%3A400&display=swap',
      },
    ]);
    expect(
      familyStylesheets(
        '//fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&family=Lora&display=swap',
      ).map((s) => s.family),
    ).toEqual(['Open Sans', 'Lora']);
    // One family: the address as it is.
    expect(familyStylesheets('https://fonts.googleapis.com/css2?family=Lora')).toEqual([
      { family: 'Lora', url: 'https://fonts.googleapis.com/css2?family=Lora' },
    ]);
    expect(familyStylesheets('https://fonts.googleapis.com/icon?family=Material+Icons')).toEqual(
      [],
    );
    expect(familyStylesheets('/local.css')).toEqual([]);
  });
});
