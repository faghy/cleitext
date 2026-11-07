import { describe, expect, it } from 'vitest';
import { durationText } from './config';

describe('cookie durations', () => {
  it('are written in the language of the policy', () => {
    expect(durationText('2 years', 'it')).toBe('2 anni');
    expect(durationText('1 year', 'it-IT')).toBe('1 anno');
    expect(durationText('3 months', 'es')).toBe('3 meses');
    expect(durationText('30 minutes', 'de')).toBe('30 Minuten');
    expect(durationText('Session', 'it')).toBe('Sessione');
    expect(durationText('2 years', 'en')).toBe('2 years');
    // Anything else is kept as written.
    expect(durationText('Fino alla chiusura del browser', 'it')).toBe(
      'Fino alla chiusura del browser',
    );
  });
});
