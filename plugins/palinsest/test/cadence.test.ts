import { describe, expect, it } from 'vitest';
import { cleanTiming, onDay, slotsOf, zonedDay, zonedInstant } from '../src/model/cadence';

describe('cadences', () => {
  it('cleans a timing: two times twice a day, one otherwise, known cadences only', () => {
    expect(cleanTiming({ cadence: 'twice-daily', times: ['20:30'] }, '2026-11-12')).toEqual({
      cadence: 'twice-daily',
      times: ['09:00', '20:30'],
      startsOn: '2026-11-12',
    });
    expect(
      cleanTiming({ cadence: 'weird' as never, times: ['25:00', '07:15'] }, '2026-11-12'),
    ).toEqual({ cadence: 'daily', times: ['07:15'], startsOn: '2026-11-12' });
  });

  it('gives slots every N days from the first day', () => {
    const timing = { cadence: '3' as const, times: ['10:00'], startsOn: '2026-11-12' };
    expect(onDay(timing, '2026-11-12')).toBe(true);
    expect(onDay(timing, '2026-11-13')).toBe(false);
    expect(onDay(timing, '2026-11-15')).toBe(true);
    expect(onDay(timing, '2026-11-09')).toBe(false);
    expect(slotsOf(timing, '2026-11-12', 7, 'UTC').map((d) => d.toISOString())).toEqual([
      '2026-11-12T10:00:00.000Z',
      '2026-11-15T10:00:00.000Z',
      '2026-11-18T10:00:00.000Z',
    ]);
  });

  it('places times in the site time zone, across daylight saving changes', () => {
    expect(zonedInstant('2026-11-12', '09:00', 'Europe/Rome').toISOString()).toBe(
      '2026-11-12T08:00:00.000Z',
    );
    expect(zonedInstant('2026-07-01', '09:00', 'Europe/Rome').toISOString()).toBe(
      '2026-07-01T07:00:00.000Z',
    );
    // The night clocks go back: 09:00 is still 09:00 local.
    const twice = {
      cadence: 'twice-daily' as const,
      times: ['09:00', '18:00'],
      startsOn: '2026-10-24',
    };
    const slots = slotsOf(twice, '2026-10-24', 2, 'Europe/Rome');
    expect(slots.map((d) => d.toISOString())).toEqual([
      '2026-10-24T07:00:00.000Z',
      '2026-10-24T16:00:00.000Z',
      '2026-10-25T08:00:00.000Z',
      '2026-10-25T17:00:00.000Z',
    ]);
    expect(zonedDay(new Date('2026-11-12T23:30:00Z'), 'Europe/Rome')).toBe('2026-11-13');
  });
});
