/**
 * The rewrite of a page's web fonts (Settings → Privacy → Web fonts): links,
 * `@import`s and hints to Google Fonts and Bunny Fonts, without a server.
 */
import { describe, expect, it } from 'vitest';
import { rewriteWebFonts, type ResolveFonts } from '../src/public/web-fonts.js';

const BUNNY =
  'https://fonts.bunny.net/css?family=inter:400,700|jetbrains-mono:400&amp;display=swap';
const INTER = 'https://fonts.bunny.net/css?family=inter%3A400%2C700&display=swap';
const MONO = 'https://fonts.bunny.net/css?family=jetbrains-mono%3A400&display=swap';
const LORA = 'https://fonts.googleapis.com/css2?family=Lora&display=swap';

/** Copies ready for these addresses; records what was asked. */
function copies(ready: Record<string, string>) {
  const asked: string[][] = [];
  const resolve: ResolveFonts = async (urls) => {
    asked.push(urls);
    return new Map(urls.filter((u) => ready[u]).map((u) => [u, ready[u]!]));
  };
  return { asked, resolve };
}

const page = (head: string, body = '') =>
  `<!doctype html><html><head><title>x</title>${head}</head><body>${body}</body></html>`;

describe('web fonts kept on the site', () => {
  it('links the copies of each family instead of the service, and drops its hints', async () => {
    const { resolve, asked } = copies({ [INTER]: '/_fonts/i.css', [MONO]: '/_fonts/m.css' });
    const html = page(
      `<link rel="preconnect" href="https://fonts.bunny.net"><link rel="dns-prefetch" href="//fonts.googleapis.com"><link rel="stylesheet" href="${BUNNY}"><link rel="stylesheet" href="/theme.css">`,
    );
    const out = await rewriteWebFonts(html, { mode: 'local', resolve });
    expect(out.missing).toBe(false);
    expect(asked).toEqual([[INTER, MONO]]);
    expect(out.text).not.toMatch(/bunny|googleapis/);
    expect(out.text).toContain(
      '<link rel="stylesheet" href="/_fonts/i.css" data-font-family="inter"><link rel="stylesheet" href="/_fonts/m.css" data-font-family="jetbrains-mono"><link rel="stylesheet" href="/theme.css">',
    );
  });

  it('rewrites @import in inline styles, and style preloads', async () => {
    const { resolve } = copies({ [LORA]: '/_fonts/l.css', [INTER]: '/_fonts/i.css' });
    const html = page(
      `<style id="t">@import url('${LORA}');body{font-family:Lora}</style><link rel="preload" as="style" href="${INTER.replace(/&/g, '&amp;')}" onload="this.rel='stylesheet'">`,
    );
    const out = await rewriteWebFonts(html, { mode: 'local', resolve });
    expect(out.text).toContain('<style id="t">@import url("/_fonts/l.css");body{font-family:Lora}');
    expect(out.text).toContain('href="/_fonts/i.css" data-font-family="inter"');
    expect(out.text).not.toMatch(/bunny|googleapis/);
  });

  it('leaves out a family without a copy yet, never linking the service', async () => {
    const { resolve } = copies({ [INTER]: '/_fonts/i.css' });
    const out = await rewriteWebFonts(page(`<link rel="stylesheet" href="${BUNNY}">`), {
      mode: 'local',
      resolve,
    });
    expect(out.missing).toBe(true);
    expect(out.text).toContain('data-font-family="inter"');
    expect(out.text).not.toContain('jetbrains');
    expect(out.text).not.toContain('bunny');
  });

  it('never links a family a plugin already keeps on the site (data-font-family)', async () => {
    const { resolve, asked } = copies({ [MONO]: '/_fonts/m.css' });
    const html = page(
      `<link rel="stylesheet" href="${BUNNY}"><link rel="stylesheet" href="/_fresco/gfonts/f.css" data-font-family="Inter">`,
    );
    const out = await rewriteWebFonts(html, { mode: 'local', resolve });
    expect(asked).toEqual([[MONO]]);
    expect(out.missing).toBe(false);
    expect(out.text.match(/data-font-family/g)).toHaveLength(2);
    expect(out.text).toContain('href="/_fresco/gfonts/f.css"');
  });

  it('links a family once when the page names it twice', async () => {
    const { resolve } = copies({ [LORA]: '/_fonts/l.css' });
    const out = await rewriteWebFonts(
      page(`<link rel="stylesheet" href="${LORA}"><style>@import url("${LORA}");</style>`),
      { mode: 'local', resolve },
    );
    expect(out.text.match(/_fonts\/l\.css/g)).toHaveLength(1);
  });

  it('leaves other stylesheets of the services alone (Material Icons)', async () => {
    const icons =
      '<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">';
    const { resolve } = copies({});
    const out = await rewriteWebFonts(page(icons), { mode: 'local', resolve });
    expect(out.text).toContain(icons);
  });

  it('keeps the links in provider mode, but not those a plugin copy already covers', async () => {
    const { resolve, asked } = copies({});
    const html = page(
      `<link rel="preconnect" href="https://fonts.bunny.net"><link rel="stylesheet" href="${BUNNY}"><link rel="stylesheet" href="${LORA}"><link rel="stylesheet" href="/_prisma/gfonts/p.css" data-font-family="Lora">`,
    );
    const out = await rewriteWebFonts(html, { mode: 'provider', resolve });
    expect(asked).toEqual([]);
    expect(out.text).toContain(
      `<link rel="preconnect" href="https://fonts.bunny.net"><link rel="stylesheet" href="${BUNNY}">`,
    );
    expect(out.text).not.toContain(LORA);
  });

  it('rewrites the imports of an editor stylesheet', async () => {
    const { resolve } = copies({ [INTER]: '/_fonts/i.css' });
    const css = `@import url("${BUNNY.replace(/&amp;/g, '&')}");\nbody{font-family:Inter}`;
    const out = await rewriteWebFonts(css, { mode: 'local', resolve, css: true });
    expect(out.text).toBe('@import url("/_fonts/i.css");\nbody{font-family:Inter}');
  });

  it('does not read pages without font services', async () => {
    const { resolve, asked } = copies({});
    const html = page('<link rel="stylesheet" href="/a.css">');
    expect((await rewriteWebFonts(html, { mode: 'local', resolve })).text).toBe(html);
    expect(asked).toEqual([]);
  });
});
