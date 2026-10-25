import { describe, expect, it } from 'vitest';
import { formatPhpDate } from './date-format.js';

const DATE = '2025-10-24T08:05:09Z';

describe('dates in a format of PHP letters (WordPress date_format)', () => {
  it('F j, Y as an Italian WordPress site writes it', () => {
    expect(formatPhpDate(DATE, 'F j, Y', 'it', 'Europe/Rome')).toBe('Ottobre 24, 2025');
    expect(formatPhpDate(DATE, 'F j, Y', 'en', 'UTC')).toBe('October 24, 2025');
  });

  it('numbers, names, times and escapes', () => {
    expect(formatPhpDate(DATE, 'd/m/Y H:i:s', 'it', 'Europe/Rome')).toBe('24/10/2025 10:05:09');
    expect(formatPhpDate(DATE, 'D, jS M y \\a\\t g:i A', 'en', 'UTC')).toBe(
      'Fri, 24th Oct 25 at 8:05 AM',
    );
    expect(formatPhpDate(DATE, 'l N w z W n t L o', 'en', 'UTC')).toBe(
      'Friday 5 5 296 43 10 31 0 2025',
    );
    expect(formatPhpDate(DATE, 'c', 'en', 'Europe/Rome')).toBe('2025-10-24T10:05:09+02:00');
    expect(formatPhpDate(DATE, 'O P Z U e', 'en', 'UTC')).toBe('+0000 +00:00 0 1761293109 UTC');
    expect(formatPhpDate(DATE, 'r', 'en', 'UTC')).toBe('Fri, 24 Oct 2025 08:05:09 +0000');
    expect(formatPhpDate('2025-10-01T20:00:00Z', 'jS jS', 'en')).toBe('1st 1st');
    expect(formatPhpDate('2025-10-13T20:00:00Z', 'jS', 'en')).toBe('13th');
    expect(formatPhpDate('2025-10-22T20:00:00Z', 'jS h a', 'en')).toBe('22nd 08 pm');
  });

  it('a wrong date or time zone does not break the page', () => {
    expect(formatPhpDate('nope', 'Y', 'en')).toBe('');
    expect(formatPhpDate(DATE, 'Y', 'en', 'Nowhere/City')).toBe('2025');
    expect(formatPhpDate(new Date(DATE), 'Y', 'xx-invalid-locale-')).toBe('2025');
  });
});
