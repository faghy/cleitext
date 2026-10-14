import { describe, expect, it } from 'vitest';
import { directionsLink, mapFrame, openLinks, type MapOptions } from './embed';
import { parseLocation, type Place } from './links';

const place = (input: string): Place => {
  const parsed = parseLocation(input);
  if (parsed.kind !== 'place') throw new Error(`not a place: ${input}`);
  return parsed.place;
};

describe('parseLocation', () => {
  it('reads coordinates and addresses', () => {
    expect(place('45.4642, 9.19')).toEqual({ source: 'text', lat: 45.4642, lng: 9.19 });
    expect(place('-33.8568 151.2153')).toMatchObject({ lat: -33.8568, lng: 151.2153 });
    expect(place('Piazza del Duomo, Milano')).toEqual({
      source: 'text',
      query: 'Piazza del Duomo, Milano',
    });
    expect(parseLocation('  ').kind).toBe('empty');
    expect(parseLocation('https://example.com/where').kind).toBe('empty');
    expect(parseLocation('javascript:alert(1)').kind).not.toBe('short');
  });

  it('reads Google Maps links', () => {
    expect(
      place(
        'https://www.google.com/maps/place/Duomo+di+Milano/@45.4640976,9.1893924,17z/data=!3m1!4b1!4m6!3m5!1s0x4786c6aec34636a1:0xab7f4e27101a2e13!8m2!3d45.4640976!4d9.1919727',
      ),
    ).toEqual({
      source: 'google',
      lat: 45.464098,
      lng: 9.191973,
      zoom: 17,
      name: 'Duomo di Milano',
      query: 'Duomo di Milano',
    });
    expect(place('https://maps.google.it/maps?q=Colosseo,+Roma&z=16')).toMatchObject({
      source: 'google',
      query: 'Colosseo, Roma',
      zoom: 16,
    });
    expect(place('https://www.google.com/maps/@41.8902,12.4922,800m/data=!3m1!1e3')).toMatchObject({
      lat: 41.8902,
      lng: 12.4922,
      satellite: true,
      zoom: 16,
    });
    expect(
      place('https://www.google.com/maps/search/?api=1&query=Mole+Antonelliana+Torino'),
    ).toMatchObject({ query: 'Mole Antonelliana Torino' });
    expect(place('https://www.google.com/maps/dir/Milano/Torino/@45.2,8.4,9z')).toMatchObject({
      query: 'Torino',
      zoom: 9,
    });
  });

  it('keeps Google My Maps and embed codes as they are', () => {
    expect(place('https://www.google.com/maps/d/edit?mid=1AbC-dEf_123&usp=sharing')).toEqual({
      source: 'google',
      embed: { service: 'google', src: 'https://www.google.com/maps/d/embed?mid=1AbC-dEf_123' },
      link: 'https://www.google.com/maps/d/viewer?mid=1AbC-dEf_123',
    });
    const code =
      '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2798.2!2d9.19!3d45.4642!2m3!1f0" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy"></iframe>';
    expect(place(code)).toMatchObject({
      source: 'google',
      embed: {
        service: 'google',
        src: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2798.2!2d9.19!3d45.4642!2m3!1f0',
      },
      lat: 45.4642,
      lng: 9.19,
    });
  });

  it('marks short links to be followed', () => {
    expect(parseLocation('https://maps.app.goo.gl/AbCdEf123')).toEqual({
      kind: 'short',
      url: 'https://maps.app.goo.gl/AbCdEf123',
    });
    expect(parseLocation('https://goo.gl/maps/xyz').kind).toBe('short');
    expect(parseLocation('https://goo.gl/other').kind).toBe('empty');
  });

  it('reads OpenStreetMap, Bing, Apple Maps and uMap links', () => {
    expect(place('https://www.openstreetmap.org/#map=16/45.46420/9.19000')).toEqual({
      source: 'openstreetmap',
      lat: 45.4642,
      lng: 9.19,
      zoom: 16,
    });
    expect(
      place('https://www.openstreetmap.org/?mlat=45.4642&mlon=9.19#map=18/45.4640/9.1880'),
    ).toMatchObject({ lat: 45.4642, lng: 9.19, zoom: 18 });
    expect(
      place(
        'https://www.openstreetmap.org/export/embed.html?bbox=9.18,45.46,9.20,45.47&layer=mapnik&marker=45.465,9.19',
      ),
    ).toMatchObject({ lat: 45.465, lng: 9.19 });
    expect(place('https://www.bing.com/maps?cp=45.4642~9.19&lvl=15&style=a')).toEqual({
      source: 'bing',
      lat: 45.4642,
      lng: 9.19,
      zoom: 15,
      satellite: true,
    });
    expect(place('https://maps.apple.com/?ll=45.4642,9.19&q=Duomo&z=17&t=k')).toEqual({
      source: 'apple',
      lat: 45.4642,
      lng: 9.19,
      name: 'Duomo',
      query: 'Duomo',
      zoom: 17,
      satellite: true,
    });
    expect(
      place('https://maps.apple.com/place?coordinate=45.4642,9.19&name=Duomo%20di%20Milano'),
    ).toMatchObject({ lat: 45.4642, lng: 9.19, name: 'Duomo di Milano' });
    expect(place('https://maps.apple.com/?address=Via+Roma+1,+Torino')).toMatchObject({
      query: 'Via Roma 1, Torino',
    });
    expect(place('https://umap.openstreetmap.fr/it/map/i-miei-posti_12345')).toEqual({
      source: 'umap',
      embed: { service: 'umap', src: 'https://umap.openstreetmap.fr/it/map/i-miei-posti_12345' },
      link: 'https://umap.openstreetmap.fr/it/map/i-miei-posti_12345',
    });
  });

  it('refuses impossible coordinates', () => {
    expect(place('95, 200')).toEqual({ source: 'text', query: '95, 200' });
  });
});

describe('mapFrame', () => {
  const options: MapOptions = {
    service: 'openstreetmap',
    zoom: 15,
    height: 400,
    layer: 'standard',
    locale: 'it',
  };
  const duomo: Place = { source: 'text', lat: 45.4642, lng: 9.19, name: 'Duomo' };

  it('draws OpenStreetMap with a marker and a box around the place', () => {
    const frame = mapFrame(duomo, options)!;
    expect(frame.service).toBe('openstreetmap');
    expect(frame.src).toMatch(
      /^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=9\.1\d+,45\.4\d+,9\.2\d+,45\.4\d+&layer=mapnik&marker=45\.4642,9\.19$/,
    );
    expect(mapFrame(duomo, { ...options, layer: 'cycle' })!.src).toContain('layer=cyclosm');
    // An address that was not found cannot be drawn by OpenStreetMap or Bing.
    expect(mapFrame({ source: 'text', query: 'Nowhere' }, options)).toBeNull();
  });

  it('draws Google Maps with or without the API key', () => {
    expect(
      mapFrame({ source: 'text', query: 'Colosseo' }, { ...options, service: 'google' }),
    ).toEqual({
      service: 'google',
      src: 'https://maps.google.com/maps?q=Colosseo&z=15&t=m&hl=it&output=embed',
    });
    const keyed = { ...options, service: 'google' as const, googleKey: 'AIza-test' };
    expect(mapFrame(duomo, { ...keyed, layer: 'satellite' })!.src).toBe(
      'https://www.google.com/maps/embed/v1/place?key=AIza-test&q=45.4642,9.19&center=45.4642,9.19&zoom=15&maptype=satellite&language=it',
    );
    expect(mapFrame(duomo, { ...keyed, googleView: 'streetview' })!.src).toContain(
      '/streetview?key=AIza-test&location=45.4642,9.19',
    );
    expect(
      mapFrame(
        { source: 'text', query: 'Duomo di Milano', lat: 45.4642, lng: 9.19 },
        { ...keyed, googleView: 'directions', from: 'Milano Centrale', travelMode: 'walking' },
      )!.src,
    ).toBe(
      'https://www.google.com/maps/embed/v1/directions?key=AIza-test&origin=Milano+Centrale&destination=Duomo+di+Milano&mode=walking&language=it',
    );
  });

  it('draws Bing Maps and keeps embeds as they are', () => {
    expect(mapFrame(duomo, { ...options, service: 'bing', layer: 'satellite' })!.src).toBe(
      'https://www.bing.com/maps/embed?h=400&w=1000&cp=45.4642~9.19&lvl=15&typ=d&sty=a&src=SHELL&FORM=MBEDV8',
    );
    expect(
      mapFrame(
        {
          source: 'umap',
          embed: { service: 'umap', src: 'https://umap.openstreetmap.fr/it/map/x_1' },
        },
        options,
      ),
    ).toEqual({ service: 'umap', src: 'https://umap.openstreetmap.fr/it/map/x_1' });
  });

  it('links to Google Maps, Apple Maps, OpenStreetMap and directions', () => {
    expect(openLinks(duomo).map((l) => l.href)).toEqual([
      'https://www.google.com/maps/search/?api=1&query=Duomo+45.4642,9.19',
      'https://maps.apple.com/?ll=45.4642,9.19&q=Duomo',
      'https://www.openstreetmap.org/?mlat=45.4642&mlon=9.19#map=16/45.4642/9.19',
    ]);
    expect(directionsLink(duomo)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=45.4642,9.19',
    );
    expect(
      openLinks({ source: 'google', embed: { service: 'google', src: 'x' }, link: 'https://l' }),
    ).toEqual([{ service: 'map', href: 'https://l' }]);
  });
});
