import { describe, expect, it, vi } from 'vitest';
import {
  BROWSER_AGENT,
  FONTS_ROUTE,
  cssFileUrls,
  familiesToLoad,
  fontType,
  googleFontsMode,
  isGoogleCssUrl,
  isGoogleFileUrl,
  pageFamilies,
  rewriteCss,
  servedFile,
} from '../src/core/font-host.js';
import { googleCssUrl, normalizeKit } from '../src/core/kit.js';
import { canvasFontSheets } from '../src/editor/canvas-fonts.js';
import {
  copyFamily,
  LocalFonts,
  retryDelay,
  type FontStore,
  type HttpSend,
} from '../src/local-fonts.js';

const WOFF2 = 'd09GMgABAAAAAAAA'; // "wOF2" and a few bytes, base64
const TTF = 'AAEAAAALAIAAAwAw'; // 00 01 00 00 …

/** A stylesheet as Google gives browsers: WOFF2 files by alphabet. */
const googleCss = (family: string, slug: string) => `/* latin-ext */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/${slug}/v20/a-ext.woff2) format('woff2');
  unicode-range: U+0100-02BA;
}
/* latin */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/${slug}/v20/a.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/${slug}/v20/a.woff2) format('woff2');
}
`;

function memoryStore() {
  const files = new Map<string, { mime: string; data: string }>();
  const sets = new Map<string, string>();
  const store: FontStore = {
    getSet: async (siteId, key) => sets.get(`${siteId}|${key}`) ?? null,
    setSet: async (siteId, key, css) => void sets.set(`${siteId}|${key}`, css),
    existing: async (siteId, names) =>
      new Set(names.filter((name) => files.has(`${siteId}|${name}`))),
    put: async (siteId, name, mime, data) =>
      void files.set(`${siteId}|${name}`, {
        mime,
        data: 'base64' in data ? data.base64 : data.text,
      }),
    get: async (siteId, name) => {
      const file = files.get(`${siteId}|${name}`);
      return file ? { mime: file.mime, bytes: new TextEncoder().encode(file.data) } : null;
    },
  };
  return { store, files, sets };
}

/** Google, as the server reaches it: every request is recorded. */
function fakeGoogle(options: { css?: (url: URL) => string; file?: string; status?: number } = {}) {
  const calls: { url: string; userAgent?: string | undefined; binary?: boolean | undefined }[] = [];
  const http: HttpSend = async (request) => {
    calls.push({ url: request.url, userAgent: request.userAgent, binary: request.binary });
    const url = new URL(request.url);
    if (options.status) return { status: options.status, type: 'text/html', text: '' };
    if (url.hostname === 'fonts.googleapis.com') {
      const family = url.searchParams.get('family')!.split(':')[0]!;
      const css = options.css?.(url) ?? googleCss(family, family.toLowerCase().replace(/ /g, ''));
      return { status: 200, type: 'text/css', text: css };
    }
    if (url.hostname === 'fonts.gstatic.com') {
      return { status: 200, type: 'font/woff2', text: '', base64: options.file ?? WOFF2 };
    }
    return { status: 404, type: 'text/plain', text: '' };
  };
  return { http, calls };
}

const log = { debug() {}, info() {}, warn: vi.fn(), error() {} };
const SITE = '00000000-0000-4000-8000-000000000001';

describe('Google Fonts kept on the site', () => {
  it('keeps them on the site unless the site settings say otherwise, for old sites too', () => {
    expect(googleFontsMode(normalizeKit({}))).toBe('local');
    expect(googleFontsMode(normalizeKit({ googleFontsMode: 'google' }))).toBe('google');
    expect(googleFontsMode(normalizeKit({ googleFontsMode: 'none' }))).toBe('none');
    expect(normalizeKit({ googleFontsMode: 'cdn' }).googleFontsMode).toBeUndefined();
    expect(normalizeKit({ googleFontsMode: 'local' }).googleFontsMode).toBeUndefined();
  });

  it('downloads only from fonts.googleapis.com and fonts.gstatic.com over https', () => {
    expect(isGoogleCssUrl('https://fonts.googleapis.com/css2?family=Inter')).toBe(true);
    expect(isGoogleCssUrl('https://fonts.googleapis.com/css?family=Inter')).toBe(true);
    for (const bad of [
      'http://fonts.googleapis.com/css2?family=Inter',
      'https://fonts.googleapis.com.evil.test/css2?family=Inter',
      'https://user@fonts.googleapis.com/css2?family=Inter',
      'https://fonts.googleapis.com:8443/css2?family=Inter',
      'https://fonts.googleapis.com/icon?family=Inter',
      'https://example.com/css2?family=Inter',
      'not a url',
    ]) {
      expect(isGoogleCssUrl(bad), bad).toBe(false);
    }
    expect(isGoogleFileUrl('https://fonts.gstatic.com/s/inter/v20/a.woff2')).toBe(true);
    for (const bad of [
      'http://fonts.gstatic.com/s/inter/v20/a.woff2',
      'https://fonts.gstatic.com.evil.test/s/inter/a.woff2',
      'https://fonts.gstatic.com/other/a.woff2',
      'https://evil.test/s/inter/a.woff2',
      'data:font/woff2;base64,AAAA',
    ]) {
      expect(isGoogleFileUrl(bad), bad).toBe(false);
    }
  });

  it('copies a stylesheet only when every file it names is on fonts.gstatic.com', () => {
    expect(cssFileUrls(googleCss('Inter', 'inter'))).toEqual([
      'https://fonts.gstatic.com/s/inter/v20/a-ext.woff2',
      'https://fonts.gstatic.com/s/inter/v20/a.woff2',
    ]);
    expect(
      cssFileUrls(`${googleCss('Inter', 'inter')}@font-face{src:url(https://evil.test/a.woff2)}`),
    ).toBeNull();
    expect(cssFileUrls(`@import url(https://fonts.gstatic.com/s/x.css);`)).toBeNull();
    expect(cssFileUrls('<html>Error 400</html>')).toBeNull();
    expect(cssFileUrls('body{color:red}')).toBeNull();
  });

  it('rewrites the stylesheet to the site’s copies, without any Google address left', () => {
    const css = googleCss('Inter', 'inter');
    const names = new Map([
      ['https://fonts.gstatic.com/s/inter/v20/a-ext.woff2', `${'a'.repeat(32)}.woff2`],
      ['https://fonts.gstatic.com/s/inter/v20/a.woff2', `${'b'.repeat(32)}.woff2`],
    ]);
    const out = rewriteCss(css, names)!;
    expect(out).toContain(`url(${FONTS_ROUTE}/${'a'.repeat(32)}.woff2)`);
    expect(out).toContain(`url(${FONTS_ROUTE}/${'b'.repeat(32)}.woff2) format('woff2')`);
    expect(out).toContain('unicode-range: U+0000-00FF');
    expect(out).not.toMatch(/gstatic|googleapis/);
    // A file without a copy: nothing half-rewritten.
    expect(rewriteCss(css, new Map([...names].slice(0, 1)))).toBeNull();
  });

  it('knows font files by their first bytes, and serves only names it makes', () => {
    const bytes = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
    expect(fontType(bytes('wOF2....'))?.ext).toBe('woff2');
    expect(fontType(bytes('wOFF....'))?.ext).toBe('woff');
    expect(fontType(bytes('\x00\x01\x00\x00'))?.ext).toBe('ttf');
    expect(fontType(bytes('OTTO'))?.ext).toBe('otf');
    expect(fontType(bytes('<htm'))).toBeNull();
    expect(servedFile(`${'a'.repeat(32)}.woff2`)?.mime).toBe('font/woff2');
    expect(servedFile(`${'a'.repeat(32)}.css`)?.mime).toBe('text/css; charset=utf-8');
    expect(servedFile('../../etc/passwd')).toBeNull();
    expect(servedFile(`${'a'.repeat(32)}.svg`)).toBeNull();
  });

  it('downloads a family once, as a browser, and keeps its stylesheet and files', async () => {
    const { store, files, sets } = memoryStore();
    const google = fakeGoogle();
    const url = googleCssUrl(['Lora'])!;
    const name = await copyFamily(google.http, store, SITE, url);
    expect(name).toMatch(/^[a-f0-9]{32}\.css$/);
    expect(google.calls[0]).toMatchObject({ url, userAgent: BROWSER_AGENT });
    // Two distinct files (one named twice), each downloaded once.
    expect(google.calls.filter((c) => c.binary)).toHaveLength(2);
    expect(google.calls.every((c) => isGoogleCssUrl(c.url) || isGoogleFileUrl(c.url))).toBe(true);
    const css = files.get(`${SITE}|${name}`)!.data;
    expect(css).toContain(`${FONTS_ROUTE}/`);
    expect(css).not.toMatch(/gstatic|googleapis/);
    expect([...sets.values()]).toEqual([name]);
    // Again: the files are kept, only the stylesheet is asked.
    google.calls.length = 0;
    await copyFamily(google.http, store, SITE, url);
    expect(google.calls.filter((c) => c.binary)).toHaveLength(0);
  });

  it('keeps nothing usable when a stylesheet or a file is not as expected', async () => {
    const url = googleCssUrl(['Lora'])!;
    const foreign = fakeGoogle({
      css: () => "@font-face{font-family:'Lora';src:url(https://evil.test/s/a.woff2)}",
    });
    const a = memoryStore();
    await expect(copyFamily(foreign.http, a.store, SITE, url)).rejects.toThrow(/outside/);
    expect(foreign.calls.map((c) => new URL(c.url).hostname)).toEqual(['fonts.googleapis.com']);
    expect(a.sets.size).toBe(0);

    const notFont = fakeGoogle({ file: btoa('<html>nope</html>') });
    const b = memoryStore();
    await expect(copyFamily(notFont.http, b.store, SITE, url)).rejects.toThrow(/not a font/);
    expect(b.sets.size).toBe(0);

    // A TrueType file under a .woff2 name is refused too.
    const mismatch = fakeGoogle({ file: TTF });
    await expect(copyFamily(mismatch.http, memoryStore().store, SITE, url)).rejects.toThrow();

    await expect(
      copyFamily(
        fakeGoogle().http,
        memoryStore().store,
        SITE,
        'https://evil.test/css2?family=Lora',
      ),
    ).rejects.toThrow(/Not a Google/);
  });

  it('gives pages the site’s stylesheets once ready, never Google’s, and tries failures again later', async () => {
    let now = 1_000_000;
    const { store } = memoryStore();
    let down = true;
    const google = fakeGoogle();
    const http: HttpSend = (request) =>
      down ? Promise.resolve({ status: 503, type: 'text/html', text: '' }) : google.http(request);
    const onReady = vi.fn();
    const fonts = new LocalFonts({ http, store, log, onReady, now: () => now });

    // Google is down: nothing, no fallback to Google, and a warning.
    expect(await fonts.stylesheets(SITE, ['Lora', 'Karla'], 1000)).toEqual([]);
    expect(log.warn).toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();

    // Not tried again before its time.
    down = false;
    expect(await fonts.stylesheets(SITE, ['Lora'], 1000)).toEqual([]);
    expect(google.calls).toHaveLength(0);

    now += retryDelay(1) + 1;
    const sheets = await fonts.stylesheets(SITE, ['Lora', 'Karla'], 1000);
    expect(sheets).toHaveLength(2);
    for (const href of sheets) expect(href).toMatch(/^\/_fresco\/gfonts\/[a-f0-9]{32}\.css$/);
    expect(onReady).toHaveBeenCalledWith(SITE);

    // Ready copies are not downloaded again.
    google.calls.length = 0;
    expect(await fonts.stylesheets(SITE, ['Karla', 'Lora'], 0)).toEqual([sheets[1], sheets[0]]);
    expect(google.calls).toHaveLength(0);
  });

  it('downloads in the background when the page cannot wait', async () => {
    const { store } = memoryStore();
    const google = fakeGoogle();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const http: HttpSend = async (request) => {
      await gate;
      return google.http(request);
    };
    const onReady = vi.fn();
    const fonts = new LocalFonts({ http, store, log, onReady });
    expect(await fonts.stylesheets(SITE, ['Lora'], 10)).toEqual([]);
    release();
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledWith(SITE));
    expect(await fonts.stylesheets(SITE, ['Lora'])).toHaveLength(1);
    expect(retryDelay(1)).toBe(600_000);
    expect(retryDelay(20)).toBe(6 * 60 * 60_000);
  });
});

describe('fonts the page loads already', () => {
  const page = `<html><head>
<link rel="preconnect" href="https://fonts.bunny.net">
<link rel="stylesheet" href="https://fonts.bunny.net/css?family=space-grotesk:400,500,700|jetbrains-mono:400,600&amp;display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400&amp;family=Lato&amp;display=swap">
<style>:root{--x:1}@font-face{font-family:"Brand Serif";src:url(/media/brand.woff2)}
@font-face { font-family: Karla; src: url(/themes/z/karla.woff2) format('woff2') }
@import url('https://fonts.bunny.net/css?family=lora:400');</style>
</head><body><p style="font-family:Inter">x</p></body></html>`;

  it('finds the theme’s Google, Bunny and self-hosted fonts', () => {
    expect([...pageFamilies(page)].sort()).toEqual(
      ['brandserif', 'jetbrainsmono', 'karla', 'lato', 'lora', 'opensans', 'spacegrotesk'].sort(),
    );
  });

  it('never adds a family the theme declares, whatever the mode', () => {
    expect(
      familiesToLoad(['Space Grotesk', 'Open Sans', 'Karla', 'Lora', 'Inter', 'Pacifico'], page),
    ).toEqual(['Inter', 'Pacifico']);
    expect(familiesToLoad(['Inter'], '<html><head></head></html>')).toEqual(['Inter']);
  });
});

describe('fonts of the editor’s canvas', () => {
  const href = `${FONTS_ROUTE}/${'c'.repeat(32)}.css`;

  it('uses the site’s copies when the site does, never Google', () => {
    const kit = normalizeKit({});
    expect(canvasFontSheets(kit, ['Lora'], { Inter: href, Lora: null })).toEqual([href]);
    expect(canvasFontSheets(kit, ['Lora'], {}).join()).not.toContain('googleapis');
  });

  it('loads from Google only when the site does, and nothing with “Don’t load”', () => {
    const google = canvasFontSheets(normalizeKit({ googleFontsMode: 'google' }), ['Lora'], {});
    expect(google).toHaveLength(2);
    expect(google[0]).toContain('https://fonts.googleapis.com/css2?family=Inter');
    expect(canvasFontSheets(normalizeKit({ googleFontsMode: 'none' }), ['Lora'], {})).toEqual([]);
  });
});
