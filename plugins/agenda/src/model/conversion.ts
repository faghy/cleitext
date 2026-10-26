import type { ConversionInput, ConversionReversalInput } from '@cleitext/plugin-sdk';
import type { Appointment } from './types';

/**
 * Bookings as conversions (plugin API 1.58), e.g. for an affiliate program:
 * Agenda takes no payments, so a confirmed booking is a lead of amount 0;
 * a confirmed booking cancelled reverses it. Imported bookings never count.
 */
export type BookingConversion =
  | { kind: 'paid'; conversion: ConversionInput }
  | { kind: 'reversed'; reversal: ConversionReversalInput }
  | null;

export function bookingConversion(
  appointment: Appointment,
  previous: Appointment | null,
  serviceName: string,
  referrals: Record<string, string>,
): BookingConversion {
  if (appointment.source === 'import') return null;
  const was = previous?.status ?? null;
  if (appointment.status === 'confirmed' && was !== 'confirmed') {
    return {
      kind: 'paid',
      conversion: {
        kind: 'lead',
        id: appointment.id,
        amount: '0',
        currency: '',
        customer: { email: appointment.email },
        items: [{ id: appointment.serviceId, name: serviceName, amount: '0' }],
        label: `${serviceName} · ${appointment.start.slice(0, 16).replace('T', ' ')}`,
        referrals,
      },
    };
  }
  if (was === 'confirmed' && appointment.status === 'cancelled')
    return { kind: 'reversed', reversal: { id: appointment.id, reason: 'cancel' } };
  return null;
}
