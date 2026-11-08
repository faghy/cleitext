import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { choiceUrl, choices, combinations, headingOf, select, slugify, type Item } from './data';
import { attrsOf, Filter } from './render';

const item = (id: string, title: string, types: string[], place: string): Item => ({
  id,
  title,
  url: `/${id}`,
  excerpt: `About ${title}.`,
  types: types.map((t) => ({ slug: slugify(t), name: t })),
  place,
});
const items = [
  item('a', 'Lavatrici Albenga', ['Lavatrici'], 'Albenga'),
  item('b', 'Frigoriferi Albenga', ['Frigoriferi a incasso'], 'Albenga'),
  item('c', 'Lavatrici Cairo', ['Lavatrici', 'Carica dall’alto'], 'Cairo Montenotte'),
  item('d', 'Senza zona', ['Lavatrici'], ''),
];

describe('the data of a filter', () => {
  it('turns places into address values', () => {
    expect(slugify('Cairo Montenotte')).toBe('cairo-montenotte');
    expect(slugify('Città di Castello')).toBe('citta-di-castello');
    expect(slugify('Sant’Olcese')).toBe('santolcese');
  });

  it('gives the choices, the matches and the combinations with results', () => {
    const { types, places } = choices(items);
    expect(types.map((t) => t.slug)).toEqual([
      'carica-dallalto',
      'frigoriferi-a-incasso',
      'lavatrici',
    ]);
    expect(places.map((p) => p.name)).toEqual(['Albenga', 'Cairo Montenotte']);
    expect(select(items, 'lavatrici', 'albenga').map((i) => i.id)).toEqual(['a']);
    expect(select(items, 'lavatrici', null).map((i) => i.id)).toEqual(['a', 'c', 'd']);
    expect(select(items, null, 'albenga').map((i) => i.id)).toEqual(['b', 'a']);
    const combos = combinations(items).map(
      (c) => `${c.type?.slug ?? '*'}|${c.place?.slug ?? '*'}|${c.count}`,
    );
    expect(combos).toContain('lavatrici|albenga|1');
    expect(combos).toContain('lavatrici|*|3');
    expect(combos).toContain('*|cairo-montenotte|1');
    expect(combos).not.toContain('frigoriferi-a-incasso|cairo-montenotte|0');
  });

  it('writes headings and addresses in a fixed order', () => {
    const w = { both: '{tipo} a {zona}', typeOnly: '{tipo}', placeOnly: 'Tutto a {zona}' };
    expect(headingOf(w, { slug: 'l', name: 'Lavatrici' }, { slug: 'a', name: 'Albenga' })).toBe(
      'Lavatrici ad Albenga',
    );
    expect(choiceUrl('/zone/', { type: 'tipo', place: 'comune' }, 'lavatrici', 'albenga')).toBe(
      '/zone/?tipo=lavatrici&comune=albenga',
    );
    expect(choiceUrl('/zone/', { type: 'tipo', place: 'comune' }, null, 'albenga')).toBe(
      '/zone/?comune=albenga',
    );
  });
});

describe('the filter block', () => {
  const attrs = attrsOf({ taxonomy: 'elettrodomestici', paramPlace: 'comune' });
  const render = (params?: Record<string, string>) =>
    renderToStaticMarkup(
      <Filter attrs={attrs} items={items} options={choices(items)} params={params} path="/zone/" />,
    );

  it('has a GET form with the choices, and links to every choice with results', () => {
    const html = render();
    expect(html).toMatch(
      /<form (?=[^>]*class="setax-form")(?=[^>]*method="get")(?=[^>]*action="\/zone\/")[^>]*>/,
    );
    expect(html).toContain('<select name="tipo">');
    expect(html).toContain('<select name="comune">');
    expect(html).toContain('href="/zone/?tipo=lavatrici&amp;comune=albenga"');
    expect(html).not.toContain('setax-results');
  });

  it('shows the matches of a choice under its heading, or a message', () => {
    const html = render({ tipo: 'lavatrici', comune: 'albenga' });
    expect(html).toContain('<h2 class="setax-heading">Lavatrici ad Albenga</h2>');
    expect(html).toContain('<a href="/a">Lavatrici Albenga</a>');
    expect(html).toContain('<option value="lavatrici" selected="">');
    expect(render({ tipo: 'frigoriferi-a-incasso', comune: 'cairo-montenotte' })).toContain(
      'Nessun risultato trovato.',
    );
    expect(render({ tipo: 'nope' })).toContain('Nessun risultato trovato.');
  });
});

describe('the import from WordPress', () => {
  it('takes the place of each imported page from its meta, not ACF keys', async () => {
    const { importPlaces } = await import('./import');
    const empty = {
      entries: {},
      terms: {},
      fieldGroups: [],
      optionsPages: [],
      options: [],
      warnings: [],
    };
    const out = importPlaces(
      empty,
      [
        { ref: 'post:1', imported: true, meta: { comune: 'Albenga', _comune: 'field_5f1a2b' } },
        { ref: 'post:2', imported: true, meta: { comune: 'field_5f1a2b' } },
        { ref: 'post:3', imported: false, meta: { comune: 'Alassio' } },
        { ref: 'post:4', imported: true, meta: {} },
      ],
      'comune',
      'setax',
    );
    expect(out.entries).toEqual({ 'post:1': { setax: { place: 'Albenga' } } });
    expect(out.warnings).toEqual(['Setax: the place (comune) of 1 entries was imported.']);
    expect(importPlaces(empty, [], 'comune', 'setax')).toBe(empty);
  });
});
