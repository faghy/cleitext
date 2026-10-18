import { expect, it } from 'vitest';
import { googleMap, mapUrl } from '../src/blocks/google-map';
import type { SpectraSource } from '../src/lib/types';
import { renderBlock } from './render';

it('embeds the map of an address as a lazy iframe with a title', () => {
  const { html } = renderBlock(googleMap, {
    address: 'Piazza del Duomo, Varazze',
    zoom: 15,
    language: 'it',
    height: 450,
  });
  expect(html).toContain('class="wp-block-prisma-google-map pr-google-map pr-block-test0001"');
  expect(html).toContain(
    '<iframe class="pr-google-map__frame" title="Google Map for Piazza del Duomo, Varazze"',
  );
  expect(html).toContain(
    'src="https://maps.google.com/maps?q=Piazza%20del%20Duomo%2C%20Varazze&amp;z=15&amp;hl=it&amp;t=m&amp;output=embed&amp;iwloc=near"',
  );
  expect(html).toContain('width="640" height="450" loading="lazy"');
});

it('shows satellite pictures, and falls back on bad values', () => {
  expect(mapUrl({ address: 'Rome', enableSatelliteView: true, zoom: 8, language: 'en' })).toContain(
    '&t=k',
  );
  const url = mapUrl({ address: '  ', zoom: '', language: '"><x' });
  expect(url).toContain('q=Colosseum%2C%20Rome&z=12&hl=en');
});

it('sets the height by device', () => {
  const { css } = renderBlock(googleMap, { height: 400, heightTablet: 320, heightMobile: '' });
  expect(css).toContain('.pr-block-test0001 .pr-google-map__frame{height:400px}');
  expect(css).toMatch(
    /@media \(max-width: ?976px\)\{\.pr-block-test0001 \.pr-google-map__frame\{height:320px\}/,
  );
  expect(css).not.toMatch(/767px\)\{[^}]*pr-google-map__frame/);
});

it('imports a Spectra map', () => {
  const src = {
    html: '',
    children: [],
    block: (n: string, a: Record<string, unknown>) => ({
      id: 'x',
      type: `prisma/${n}`,
      v: 1,
      attrs: a,
    }),
    rich: (h: string) => [{ text: h }],
    inner: () => '',
    innerAny: () => '',
  } as unknown as SpectraSource;
  const [block] = googleMap.spectra!['uagb/google-map']!(
    { address: 'Varazze', zoom: 14, heightMobile: 250, enableSatelliteView: true },
    src,
  );
  expect(block).toMatchObject({
    type: 'prisma/google-map',
    attrs: { address: 'Varazze', zoom: 14, heightMobile: 250, enableSatelliteView: true },
  });
});
