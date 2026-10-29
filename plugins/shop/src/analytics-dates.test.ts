import { describe, expect, it } from 'vitest';
import {
  addMonths,
  defaultInterval,
  intervalsOf,
  presetRange,
  previousRange,
  startOf,
  todayIn,
} from './analytics-dates';

describe('report dates', () => {
  // A Wednesday.
  const today = '2026-10-28';

  it('works out the presets, weeks from Monday', () => {
    expect(presetRange('today', today)).toEqual({ after: today, before: today });
    expect(presetRange('yesterday', today)).toEqual({ after: '2026-10-27', before: '2026-10-27' });
    expect(presetRange('week', today)).toEqual({ after: '2026-10-26', before: today });
    expect(presetRange('last_week', today)).toEqual({ after: '2026-10-19', before: '2026-10-25' });
    expect(presetRange('month', today)).toEqual({ after: '2026-10-01', before: today });
    expect(presetRange('last_month', today)).toEqual({ after: '2026-09-01', before: '2026-09-30' });
    expect(presetRange('quarter', today)).toEqual({ after: '2026-10-01', before: today });
    expect(presetRange('last_quarter', today)).toEqual({
      after: '2026-07-01',
      before: '2026-09-30',
    });
    expect(presetRange('year', today)).toEqual({ after: '2026-01-01', before: today });
    expect(presetRange('last_year', today)).toEqual({ after: '2025-01-01', before: '2025-12-31' });
    // Sunday belongs to the week started on Monday.
    expect(startOf('2026-11-01', 'week')).toBe('2026-10-26');
  });

  it('compares with the period before or the same days a year earlier', () => {
    const range = { after: '2026-10-01', before: '2026-10-28' };
    expect(previousRange(range, 'previous_period')).toEqual({
      after: '2026-09-03',
      before: '2026-09-30',
    });
    expect(previousRange(range, 'previous_year')).toEqual({
      after: '2025-10-01',
      before: '2025-10-28',
    });
    // 29 February has no twin: the month's last day.
    expect(addMonths('2028-02-29', -12)).toBe('2027-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('splits a range into days, weeks or months', () => {
    expect(intervalsOf({ after: '2026-10-27', before: '2026-10-29' }, 'day')).toEqual([
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ]);
    expect(intervalsOf({ after: '2026-10-01', before: '2026-10-14' }, 'week')).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
    ]);
    expect(intervalsOf({ after: '2026-01-31', before: '2026-03-01' }, 'month')).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);
    expect(defaultInterval({ after: '2026-10-01', before: '2026-10-28' })).toBe('day');
    expect(defaultInterval({ after: '2026-07-01', before: '2026-09-30' })).toBe('week');
    expect(defaultInterval({ after: '2025-01-01', before: '2025-12-31' })).toBe('month');
  });

  it('knows the day in the site’s time zone', () => {
    const late = new Date('2026-10-28T23:30:00Z');
    expect(todayIn('UTC', late)).toBe('2026-10-28');
    expect(todayIn('Europe/Rome', late)).toBe('2026-10-29');
    expect(todayIn('Not/AZone', late)).toBe('2026-10-28');
  });
});
