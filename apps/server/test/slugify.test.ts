/** Slugs made from titles (RF-CNT-11), with German umlauts as German writes them (core 0.99). */
import { describe, expect, it } from 'vitest';
import { slugify } from '../src/content/slug.js';

describe('slugify', () => {
  it('writes umlauts as ae, oe, ue for German content', () => {
    expect(slugify('Föderation', undefined, 'de')).toBe('foederation');
    expect(slugify('Über die Brücke', undefined, 'de-AT')).toBe('ueber-die-bruecke');
    expect(slugify('Straße', undefined, 'de')).toBe('strasse');
  });

  it('drops the dots elsewhere, as before', () => {
    expect(slugify('Föderation')).toBe('foderation');
    expect(slugify('Jyväskylä', undefined, 'fi')).toBe('jyvaskyla');
    expect(slugify('Fédération', undefined, 'fr')).toBe('federation');
  });
});
