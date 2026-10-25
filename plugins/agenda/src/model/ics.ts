/**
 * The calendar file (iCalendar, RFC 5545) of an appointment, attached to the
 * emails and offered on the confirmation: one event in UTC, with a stable
 * UID and a SEQUENCE raised when it moves, so calendars update it.
 */

export interface IcsEvent {
  uid: string;
  start: number;
  end: number;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  sequence: number;
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  organizer?: { name: string; email: string };
  stamp?: number;
}

export function icsDate(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Lines of at most 75 octets, continued with a space (never cutting a character). */
export function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildIcs(event: IcsEvent, productName = 'Agenda'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Cleitext//${productName}//EN`,
    'CALSCALE:GREGORIAN',
    `METHOD:${event.status === 'CANCELLED' ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${icsDate(event.stamp ?? Date.now())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SEQUENCE:${event.sequence}`,
    `STATUS:${event.status}`,
    `SUMMARY:${icsText(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${icsText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    ...(event.organizer
      ? [
          `ORGANIZER;CN=${icsText(event.organizer.name).replace(/"/g, '')}:mailto:${event.organizer.email}`,
        ]
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** "Add to Google Calendar": an address, no account or API involved. */
export function googleCalendarUrl(
  event: Pick<IcsEvent, 'start' | 'end' | 'summary' | 'description'>,
): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.summary,
    dates: `${icsDate(event.start)}/${icsDate(event.end)}`,
    ...(event.description ? { details: event.description } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
