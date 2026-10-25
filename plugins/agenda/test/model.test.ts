// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BLOCK_TYPE, CAPABILITY, FORM_ID, NAME, SLUG } from '../src/config';
import { defaultEmail, emailText, fill, textToHtml } from '../src/model/emails';
import { buildIcs, fold, googleCalendarUrl, icsText } from '../src/model/ics';
import {
  COUNTED_SOURCES,
  countsTowardLimit,
  FREE_BOOKINGS,
  limitState,
  WARN_FROM,
} from '../src/model/limit';
import {
  emailList,
  normalizeException,
  normalizeFields,
  normalizeSchedule,
  normalizeService,
  normalizeSettings,
  serviceText,
} from '../src/model/normalize';
import { stringsFor } from '../src/model/strings';
import { formatWhen, isTimeZone, parseTime } from '../src/model/time';
import { linkExpiry, readLink, signLink } from '../src/model/tokens';
import { bookingLimit, installServerApi, notify, serverApi } from '../src/pro';

describe('names in one place', () => {
  it('match the manifest', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../cleitext.plugin.json', import.meta.url), 'utf8'),
    ) as {
      slug: string;
      name: string;
      capabilities: string[];
    };
    expect(manifest.slug).toBe(SLUG);
    expect(manifest.name).toBe(NAME.en);
    expect(manifest.capabilities).toEqual([CAPABILITY]);
    expect(BLOCK_TYPE.startsWith(`${SLUG}/`)).toBe(true);
    expect(FORM_ID.startsWith(`${SLUG}/`)).toBe(true);
  });
});

describe('signed links', () => {
  const key = 'k'.repeat(64);
  const now = Date.UTC(2030, 0, 1);

  it('carry the appointment and its version, and expire', () => {
    const token = signLink(key, { id: 'abc', seq: 2, exp: Math.floor(now / 1000) + 60 });
    expect(readLink(key, token, now)).toEqual({
      id: 'abc',
      seq: 2,
      exp: Math.floor(now / 1000) + 60,
    });
    expect(readLink(key, token, now + 61_000)).toBeNull();
    expect(readLink('other', token, now)).toBeNull();
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ i: 'other', s: 2, e: 9e9 })).toString('base64url');
    expect(readLink(key, `${forged}.${sig}`, now)).toBeNull();
    expect(readLink(key, `${payload}.`, now)).toBeNull();
    expect(readLink(key, 42, now)).toBeNull();
    expect(readLink(key, 'x'.repeat(500), now)).toBeNull();
    expect(linkExpiry(now)).toBe(now / 1000 + 7 * 86400);
  });
});

describe('the calendar file', () => {
  it('is a valid event in UTC with escaped text', () => {
    const ics = buildIcs({
      uid: 'a1@example.test',
      start: Date.UTC(2030, 6, 4, 11, 0),
      end: Date.UTC(2030, 6, 4, 11, 50),
      summary: 'Consulenza; online, studio',
      description: 'Riga 1\nRiga 2',
      url: 'https://example.test/agenda/appointment?t=x',
      sequence: 1,
      status: 'CONFIRMED',
      stamp: Date.UTC(2030, 5, 1),
    });
    expect(ics).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n');
    expect(ics).toContain('METHOD:PUBLISH\r\n');
    expect(ics).toContain('DTSTART:20300704T110000Z\r\n');
    expect(ics).toContain('DTEND:20300704T115000Z\r\n');
    expect(ics).toContain('DTSTAMP:20300601T000000Z\r\n');
    expect(ics).toContain('SEQUENCE:1\r\n');
    expect(ics).toContain('SUMMARY:Consulenza\\; online\\, studio\r\n');
    expect(ics).toContain('DESCRIPTION:Riga 1\\nRiga 2\r\n');
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
    const cancelled = buildIcs({
      uid: 'u',
      start: 0,
      end: 60_000,
      summary: 's',
      sequence: 2,
      status: 'CANCELLED',
    });
    expect(cancelled).toContain('METHOD:CANCEL');
    expect(cancelled).toContain('STATUS:CANCELLED');
  });

  it('folds long lines without cutting characters', () => {
    const line = `SUMMARY:${'è'.repeat(60)}`;
    const folded = fold(line);
    for (const part of folded.split('\r\n'))
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    expect(icsText('a\\b')).toBe('a\\\\b');
    expect(googleCalendarUrl({ start: 0, end: 60_000, summary: 'X' })).toContain(
      'dates=19700101T000000Z%2F19700101T000100Z',
    );
  });
});

describe('the free limit', () => {
  it('counts bookings made on the site and by hand, never imported ones', () => {
    expect(FREE_BOOKINGS).toBe(30);
    expect(COUNTED_SOURCES).toEqual(['site', 'admin']);
    expect(countsTowardLimit({ source: 'site' })).toBe(true);
    expect(countsTowardLimit({ source: 'admin' })).toBe(true);
    expect(countsTowardLimit({ source: 'import' })).toBe(false);
  });

  it('warns from 25 and stops at 30, unless lifted', () => {
    expect(limitState(12, 30)).toEqual({ used: 12, limit: 30, reached: false, warning: false });
    expect(limitState(WARN_FROM, 30)).toMatchObject({ warning: true, reached: false });
    expect(limitState(30, 30)).toMatchObject({ warning: true, reached: true });
    expect(limitState(500, Infinity)).toEqual({
      used: 500,
      limit: null,
      reached: false,
      warning: false,
    });
  });

  it('is lifted by Agenda Pro through the server API', async () => {
    const api = installServerApi();
    expect(serverApi()).toBe(api);
    expect(await bookingLimit(api, 's')).toBe(30);
    api.bookingLimit.push(
      () => null,
      () => {
        throw new Error('broken');
      },
      async () => Infinity,
    );
    const log: string[] = [];
    expect(await bookingLimit(api, 's', (m) => log.push(m))).toBe(Infinity);
    expect(log).toHaveLength(1);
    const seen: number[] = [];
    await notify([(n: number) => void seen.push(n), () => Promise.reject(new Error('x'))], 7, (m) =>
      log.push(m),
    );
    expect(seen).toEqual([7]);
    expect(log).toHaveLength(2);
  });
});

describe('emails', () => {
  it('fill placeholders, per language, with the site’s own texts first', () => {
    expect(defaultEmail('confirmed', 'it').subject).toContain('Appuntamento confermato');
    expect(defaultEmail('reminder', 'en').subject).toBe('Reminder: {service}, {date} at {time}');
    const settings = { emails: { it: { confirmed: { subject: 'Confermato {name}', body: '' } } } };
    expect(emailText(settings, 'confirmed', 'it', 'it').subject).toBe('Confermato {name}');
    expect(emailText(settings, 'confirmed', 'it', 'it').body).toBe(
      defaultEmail('confirmed', 'it').body,
    );
    expect(emailText(settings, 'confirmed', 'en', 'it').subject).toBe(
      defaultEmail('confirmed', 'en').subject,
    );
    // A language without built-in texts uses the default language's own.
    expect(emailText(settings, 'confirmed', 'de', 'it').subject).toBe('Confermato {name}');
    expect(fill('Hi {name}, {unknown}\n{site}', { name: 'Ann', site: 'S' })).toBe(
      'Hi Ann, {unknown}\nS',
    );
    expect(fill('a\nb', {}, true)).toBe('a b');
    expect(textToHtml('<b>x</b>\nhttps://e.test/a?b=1&c=2\n\nnext')).toContain(
      '<a href="https://e.test/a?b=1&amp;c=2">',
    );
    expect(textToHtml('<b>')).toContain('&lt;b&gt;');
  });

  it('format dates in the site’s zone and the language', () => {
    const when = formatWhen(Date.UTC(2030, 6, 4, 11, 0), 'Europe/Rome', 'it');
    expect(when.time).toBe('13:00');
    expect(when.date).toMatch(/giovedì 4 luglio 2030/);
    expect(formatWhen(0, 'UTC', 'xx-invalid-').time).toBe('00:00');
    expect(stringsFor('it-IT').book).toBe('Prenota');
    expect(stringsFor('de').book).toBe('Book');
  });
});

describe('normalizing', () => {
  it('makes services complete and safe', () => {
    const s = normalizeService({
      name: '  Taglio ',
      duration: '45',
      capacity: 0,
      color: 'red',
      status: 'weird',
      bufferBefore: -5,
      translations: { it: { name: 'Taglio' }, 'bad locale!': { name: 'x' }, en: {} },
    });
    expect(s).toMatchObject({
      name: 'Taglio',
      duration: 45,
      capacity: 1,
      color: '#2563eb',
      status: 'active',
      bufferBefore: 0,
    });
    expect(Object.keys(s.translations)).toEqual(['it']);
    expect(serviceText({ ...s, translations: { it: { name: 'Taglio IT' } } }, 'it-IT').name).toBe(
      'Taglio IT',
    );
    expect(normalizeService({}).schedule.days[1]!.windows).toHaveLength(2);
  });

  it('cleans schedules, fields, exceptions and settings', () => {
    const sch = normalizeSchedule({
      mode: 'fixed',
      step: 99999,
      days: [
        { times: ['15:30', '13:00', '13:00', 'x', 2000] },
        {
          windows: [
            { start: '09:00', end: '12:00' },
            { start: '11:00', end: '13:00' },
            { start: '14:00', end: '13:00' },
          ],
        },
      ],
    });
    expect(sch.mode).toBe('fixed');
    expect(sch.step).toBe(720);
    expect(sch.days[0]!.times).toEqual([780, 930]);
    expect(sch.days[1]!.windows).toEqual([{ start: 540, end: 780 }]);
    expect(sch.days).toHaveLength(7);
    expect(
      normalizeFields([
        { label: 'Età', name: 'Età!', type: 'number' },
        { label: 'Email', name: 'email' },
        { label: '' },
        { label: 'Scelta', type: 'select', options: 'a\nb\n\n' },
      ]),
    ).toEqual([
      { name: 'et', label: 'Età', type: 'number', required: false, options: [] },
      { name: 'field-2', label: 'Scelta', type: 'select', required: false, options: ['a', 'b'] },
    ]);
    expect(normalizeException({ from: '2030-02-30' })).toBeNull();
    expect(normalizeException({ from: '2030-02-10', to: '2030-02-01' })).toBeNull();
    expect(
      normalizeException({
        from: '2030-02-10',
        closed: false,
        hours: { windows: [{ start: '9:00', end: '10:00' }] },
      }),
    ).toMatchObject({ to: '2030-02-10', closed: false, serviceId: null });
    const st = normalizeSettings({
      notify: 'a@b.it, nope; c@d.it',
      timezone: 'Mars/Base',
      privacyUrl: 'javascript:x',
      phone: 'required',
      retentionMonths: 999,
      emails: { it: { reminder: { subject: 'S' } }, 'x y': {} },
    });
    expect(st).toMatchObject({
      notify: 'a@b.it, c@d.it',
      timezone: '',
      privacyUrl: '',
      phone: 'required',
      retentionMonths: 120,
    });
    expect(st.emails).toEqual({ it: { reminder: { subject: 'S', body: '' } } });
    expect(emailList('x@y.z ; bad')).toEqual(['x@y.z']);
    expect(isTimeZone('Europe/Rome')).toBe(true);
    expect(isTimeZone('Nope/Nope')).toBe(false);
    expect(parseTime('24:00')).toBe(1440);
    expect(parseTime('24:30')).toBeNull();
  });
});
