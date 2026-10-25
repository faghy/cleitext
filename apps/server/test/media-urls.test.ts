import { describe, expect, it } from 'vitest';
import {
  mediaByUrl,
  mediaTextRewriter,
  mediaUrlKey,
  type MediaTarget,
} from '../src/transfer/media-urls.js';

const OLD = 'https://ilpescepazzo.it';
const logo: MediaTarget = { id: 'm1', url: '/media/s/logo.png' };
const badge: MediaTarget = { id: 'm2', url: '/media/s/badge.png' };

/** The importer's map: each old address and its key (without host and size). */
function urlMap(): Map<string, MediaTarget> {
  const map = new Map<string, MediaTarget>();
  for (const [url, target] of [
    [`${OLD}/wp-content/uploads/2021/05/il-pesce-pazzo-logo-4.png`, logo],
    [`${OLD}/wp-content/uploads/2026/07/dueclic-bn-bg.png`, badge],
  ] as const) {
    map.set(url, target);
    map.set(mediaUrlKey(url), target);
  }
  return map;
}

describe('media addresses in imported text', () => {
  it('drops host, query, resized size and -scaled from the key', () => {
    expect(mediaUrlKey(`${OLD}/wp-content/uploads/a-300x200.jpg?v=2`)).toBe(
      '/wp-content/uploads/a.jpg',
    );
    expect(mediaUrlKey('//cdn.test/wp-content/uploads/a-scaled.jpg')).toBe(
      '/wp-content/uploads/a.jpg',
    );
    expect(
      mediaByUrl(urlMap(), `${OLD}/wp-content/uploads/2021/05/il-pesce-pazzo-logo-4.png`),
    ).toBe(logo);
  });

  it('rewrites <img> src, a resized copy, srcset, links and CSS url()', () => {
    const r = mediaTextRewriter(urlMap(), `${OLD}/`);
    // The footer's badge (a resized copy inside a Divi text module).
    expect(
      r.rewrite(
        `<a href="https://www.dueclic.com/"><img src="${OLD}/wp-content/uploads/2026/07/dueclic-bn-bg-288x300.png" class="wp-image-615" /></a>`,
      ),
    ).toBe(
      `<a href="https://www.dueclic.com/"><img src="/media/s/badge.png" class="wp-image-615" /></a>`,
    );
    expect(
      r.rewrite(
        `<img srcset="${OLD}/wp-content/uploads/2021/05/il-pesce-pazzo-logo-4-300x57.png 300w, ${OLD}/wp-content/uploads/2021/05/il-pesce-pazzo-logo-4.png 422w">`,
      ),
    ).toBe('<img srcset="/media/s/logo.png 300w, /media/s/logo.png 422w">');
    expect(
      r.rewrite(
        `selector{background-image:url("${OLD}/wp-content/uploads/2026/07/dueclic-bn-bg.png")}`,
      ),
    ).toBe('selector{background-image:url("/media/s/badge.png")}');
    expect(
      r.rewrite(`a{background:url(/wp-content/uploads/2026/07/dueclic-bn-bg-150x150.png)}`),
    ).toBe('a{background:url(/media/s/badge.png)}');
    // www. and http: of the same site, protocol-relative, and a full stop after it.
    expect(
      r.rewrite(
        `see http://www.ilpescepazzo.it/wp-content/uploads/2021/05/il-pesce-pazzo-logo-4.png. and //ilpescepazzo.it/wp-content/uploads/2026/07/dueclic-bn-bg.png`,
      ),
    ).toBe('see /media/s/logo.png. and /media/s/badge.png');
    expect(r.takeMissing()).toEqual([]);
  });

  it('leaves other sites and pages alone, and collects missing media once', () => {
    const r = mediaTextRewriter(urlMap(), OLD);
    const text = [
      'https://elsewhere.test/wp-content/uploads/2021/05/il-pesce-pazzo-logo-4.png',
      `${OLD}/contatti/`,
      `${OLD}/wp-content/uploads/2020/01/gone.jpg`,
      `${OLD}/wp-content/uploads/2020/01/gone.jpg`,
      'host.test/wp-content/uploads/x.png',
    ].join(' ');
    expect(r.rewrite(text)).toBe(text);
    expect(r.takeMissing()).toEqual([`${OLD}/wp-content/uploads/2020/01/gone.jpg`]);
    expect(r.takeMissing()).toEqual([]);
    expect(r.rewrite('no address here')).toBe('no address here');
  });

  it('without the old address, matches only exact addresses and /wp-content/ paths', () => {
    const r = mediaTextRewriter(urlMap(), undefined);
    expect(r.rewrite(`${OLD}/wp-content/uploads/2021/05/il-pesce-pazzo-logo-4.png`)).toBe(
      '/media/s/logo.png',
    );
    expect(r.rewrite(`${OLD}/wp-content/uploads/2021/05/il-pesce-pazzo-logo-4-300x57.png`)).toBe(
      `${OLD}/wp-content/uploads/2021/05/il-pesce-pazzo-logo-4-300x57.png`,
    );
    expect(r.rewrite('/wp-content/uploads/2021/05/il-pesce-pazzo-logo-4-300x57.png')).toBe(
      '/media/s/logo.png',
    );
    expect(r.rewrite('/wp-content/uploads/none.png')).toBe('/wp-content/uploads/none.png');
    expect(r.takeMissing()).toEqual(['/wp-content/uploads/none.png']);
  });
});
