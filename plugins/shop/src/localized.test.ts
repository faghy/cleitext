import { describe, expect, it } from 'vitest';
import { noteIn, shortText, termsIn } from './localized';

describe('shop texts in the customer language', () => {
  const note =
    'Dati trattati da Molinari S.N.C.\n[en]\nData processed by Molinari S.N.C.\n[de]\nDaten…';

  it('picks the section of the language, else the text before the sections', () => {
    expect(noteIn(note, 'en')).toBe('Data processed by Molinari S.N.C.');
    expect(noteIn(note, 'en-GB')).toBe('Data processed by Molinari S.N.C.');
    expect(noteIn(note, 'it')).toBe('Dati trattati da Molinari S.N.C.');
    expect(noteIn(note, 'fr')).toBe('Dati trattati da Molinari S.N.C.');
    expect(noteIn('Just one text\non two lines', 'en')).toBe('Just one text\non two lines');
  });

  it('picks the terms page of the language', () => {
    const others = 'en https://shop.example/terms\nde: https://shop.example/agb';
    expect(termsIn('https://shop.example/it/condizioni', others, 'en')).toBe(
      'https://shop.example/terms',
    );
    expect(termsIn('https://shop.example/it/condizioni', others, 'de-AT')).toBe(
      'https://shop.example/agb',
    );
    expect(termsIn('https://shop.example/it/condizioni', others, 'it')).toBe(
      'https://shop.example/it/condizioni',
    );
    expect(termsIn('https://shop.example/x', '', 'en')).toBe('https://shop.example/x');
  });

  it('turns an excerpt into a short plain text', () => {
    expect(shortText('<p>Filtri per <strong>tassonomie</strong>&nbsp;incrociate</p>')).toBe(
      'Filtri per tassonomie incrociate',
    );
    expect(shortText('a'.repeat(200)).length).toBe(140);
  });
});
