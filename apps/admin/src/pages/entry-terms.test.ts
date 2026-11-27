import type { TermView } from '@cleitext/shared';
import { describe, expect, it } from 'vitest';
import { plain, suggestTerms } from './entry-terms';

const term = (id: string, name: string) => ({ id, name }) as TermView;
const terms = [
  term('1', 'Città'),
  term('2', 'Cittadella'),
  term('3', 'Mare'),
  term('4', 'La città vecchia'),
];

describe('suggestions of existing terms (#53)', () => {
  it('match without case and accents, those starting with the text first', () => {
    expect(plain('  CITTÀ ')).toBe('citta');
    expect(suggestTerms(terms, 'citt').map((t) => t.name)).toEqual([
      'Città',
      'Cittadella',
      'La città vecchia',
    ]);
    expect(suggestTerms(terms, 'citt', ['1']).map((t) => t.id)).toEqual(['2', '4']);
    expect(suggestTerms(terms, '  ')).toEqual([]);
    expect(suggestTerms(terms, 'xyz')).toEqual([]);
  });
});
