// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bookingConversion } from '../src/model/conversion';
import type { Appointment } from '../src/model/types';

const appointment = (changes: Partial<Appointment> = {}) =>
  ({
    id: 'a1',
    serviceId: 's1',
    start: '2026-11-03T09:30:00.000Z',
    status: 'confirmed',
    email: 'ada@example.test',
    source: 'site',
    ...changes,
  }) as Appointment;

describe('bookings as conversions', () => {
  it('a confirmed booking is a lead of amount 0, with its referral codes', () => {
    expect(bookingConversion(appointment(), null, 'Massage', { passaparola: 'anna' })).toEqual({
      kind: 'paid',
      conversion: {
        kind: 'lead',
        id: 'a1',
        amount: '0',
        currency: '',
        customer: { email: 'ada@example.test' },
        items: [{ id: 's1', name: 'Massage', amount: '0' }],
        label: 'Massage · 2026-11-03 09:30',
        referrals: { passaparola: 'anna' },
      },
    });
  });

  it('a pending booking counts once it is confirmed, and only then', () => {
    expect(bookingConversion(appointment({ status: 'pending' }), null, 'X', {})).toBeNull();
    const confirmed = bookingConversion(appointment(), appointment({ status: 'pending' }), 'X', {});
    expect(confirmed?.kind).toBe('paid');
    // Moved, still confirmed: nothing new.
    expect(bookingConversion(appointment(), appointment(), 'X', {})).toBeNull();
  });

  it('a confirmed booking cancelled is reversed; imported ones never count', () => {
    expect(bookingConversion(appointment({ status: 'cancelled' }), appointment(), 'X', {})).toEqual(
      { kind: 'reversed', reversal: { id: 'a1', reason: 'cancel' } },
    );
    expect(
      bookingConversion(
        appointment({ status: 'cancelled' }),
        appointment({ status: 'pending' }),
        'X',
        {},
      ),
    ).toBeNull();
    expect(bookingConversion(appointment({ source: 'import' }), null, 'X', {})).toBeNull();
  });
});
