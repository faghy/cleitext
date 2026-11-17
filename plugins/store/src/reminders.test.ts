import { describe, expect, it } from 'vitest';
import { reminderDue } from './server';

const now = new Date('2026-11-17T10:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);

describe('renewal reminders', () => {
  it('go out 30 days and 7 days before the updates end, once each', () => {
    expect(reminderDue(inDays(45), now, [])).toBeNull();
    expect(reminderDue(inDays(29), now, [])).toBe(30);
    expect(reminderDue(inDays(29), now, [30])).toBeNull();
    expect(reminderDue(inDays(6), now, [30])).toBe(7);
    expect(reminderDue(inDays(6), now, [30, 7])).toBeNull();
    // Bought late: only the nearest one.
    expect(reminderDue(inDays(5), now, [])).toBe(7);
  });

  it('never for ended updates or licenses without an end', () => {
    expect(reminderDue(inDays(-1), now, [])).toBeNull();
    expect(reminderDue(null, now, [])).toBeNull();
  });
});
