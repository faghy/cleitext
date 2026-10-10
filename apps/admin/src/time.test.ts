import { describe, expect, it } from 'vitest';
import { isoToZonedTime, zonedTimeToIso } from './time';

describe('site time zone', () => {
  it('reads wall-clock times in the site time zone', () => {
    expect(zonedTimeToIso('2026-01-15T09:00', 'Europe/Rome')).toBe('2026-01-15T08:00:00.000Z');
    expect(zonedTimeToIso('2026-07-15T09:00', 'Europe/Rome')).toBe('2026-07-15T07:00:00.000Z');
    expect(zonedTimeToIso('2026-07-15T09:00', 'America/New_York')).toBe('2026-07-15T13:00:00.000Z');
    expect(zonedTimeToIso('2026-07-15T09:00', 'UTC')).toBe('2026-07-15T09:00:00.000Z');
  });

  it('round-trips with the input format', () => {
    for (const tz of ['Europe/Rome', 'Asia/Kolkata', 'Pacific/Auckland']) {
      const iso = zonedTimeToIso('2026-10-25T12:30', tz);
      expect(isoToZonedTime(iso, tz)).toBe('2026-10-25T12:30');
    }
  });
});
