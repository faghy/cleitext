import { describe, expect, it } from 'vitest';
import { activeHtml, googleFontHosts, scanGoogleFonts, siteStylesheets } from './checks';

const SITE = 'https://example.test';

describe('Google Fonts loaded before consent', () => {
  it('finds the Google font hosts a page or a stylesheet names', () => {
    expect(
      googleFontHosts(
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&amp;display=swap">',
      ),
    ).toEqual(['fonts.googleapis.com']);
    expect(
      googleFontHosts('@font-face{src:url(https://fonts.gstatic.com/s/inter/v1/a.woff2)}'),
    ).toEqual(['fonts.gstatic.com']);
    expect(googleFontHosts('<link href="//fonts.googleapis.com/css?family=Lato">')).toEqual([
      'fonts.googleapis.com',
    ]);
    expect(
      googleFontHosts('<link rel="stylesheet" href="https://fonts.bunny.net/css?family=inter">'),
    ).toEqual([]);
    expect(googleFontHosts('<p>We use fonts.googleapis.com.evil.test</p>')).toEqual([]);
  });

  it('ignores comments and scripts the banner keeps inert until consent', () => {
    const html = `<!-- <link href="https://fonts.googleapis.com/css2?family=A"> -->
<script type="text/plain" data-cx-category="marketing">load('https://fonts.googleapis.com/css2?family=B')</script>
<p>Hello</p>`;
    expect(googleFontHosts(activeHtml(html))).toEqual([]);
  });

  it('follows the site’s own stylesheets, not other sites’', () => {
    const html = `<link rel="stylesheet" href="/themes/t/style.css?v=2">
<link rel='stylesheet' href='https://cdn.other.test/x.css'>
<link rel="preload" href="/font.woff2" as="font">
<style>@import url("/custom.css");</style>`;
    expect(siteStylesheets(html, `${SITE}/about`)).toEqual([
      `${SITE}/themes/t/style.css?v=2`,
      `${SITE}/custom.css`,
    ]);
  });

  it('reports the pages and the stylesheets that load Google Fonts', async () => {
    const texts: Record<string, string> = {
      [`${SITE}/`]: '<link rel="stylesheet" href="/theme.css"><p>Home</p>',
      [`${SITE}/clean`]: '<link rel="stylesheet" href="/theme-clean.css"><p>Clean</p>',
      [`${SITE}/direct`]:
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato">',
      [`${SITE}/theme.css`]: '@import url("/fonts.css"); body{color:red}',
      [`${SITE}/fonts.css`]: '@import url(https://fonts.googleapis.com/css2?family=Lora);',
      [`${SITE}/theme-clean.css`]: '@font-face{font-family:Lora;src:url(/_fresco/gfonts/a.woff2)}',
    };
    const findings = await scanGoogleFonts(
      [`${SITE}/`, `${SITE}/clean`, `${SITE}/direct`, `${SITE}/missing`],
      async (url) => texts[url] ?? null,
    );
    expect(findings).toEqual([
      { page: `${SITE}/`, source: `${SITE}/fonts.css`, host: 'fonts.googleapis.com' },
      { page: `${SITE}/direct`, source: `${SITE}/direct`, host: 'fonts.googleapis.com' },
    ]);
  });
});
