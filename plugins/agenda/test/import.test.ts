// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  attrsFromShortcode,
  blockFromShortcode,
  isBookingShortcode,
  parseOwnShortcode,
  replaceShortcodes,
} from '../src/import/shortcodes';
import { readDump } from '../src/import/sql';
import { parseSsa, ssaCustomer, ssaDays } from '../src/import/ssa';
import { parseWpbc, parseWpbcForm } from '../src/import/wpbc';
import { csvObjects, parseCsv, toCsv } from '../src/model/csv';
import { localDate, localMinutes } from '../src/model/time';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('Simply Schedule Appointments', () => {
  const plan = parseSsa(fixture('ssa-export.json'), 'export.json');

  it('turns appointment types into services', () => {
    expect(plan.timezone).toBe('Europe/Rome');
    expect(plan.services.map((s) => s.externalId)).toEqual(['ssa:type:1', 'ssa:type:2']);
    const [one, group] = plan.services.map((s) => s.service);
    expect(one).toMatchObject({
      name: 'Consulenza online',
      duration: 50,
      bufferBefore: 80,
      bufferAfter: 10,
      minNotice: 1440,
      maxNotice: 525600,
      capacity: 1,
      status: 'active',
    });
    expect(one!.schedule.mode).toBe('fixed');
    expect(one!.schedule.days[4]!.times).toEqual([780, 855, 930]);
    expect(one!.schedule.days[1]!.times).toEqual([]);
    expect(one!.data.askPhone).toBe(true);
    expect(one!.data.import).toMatchObject({ from: 'ssa', id: '1', slug: 'consulenza-online' });
    expect(group).toMatchObject({ capacity: 8, status: 'hidden' });
    expect(group!.schedule).toMatchObject({ mode: 'intervals', step: 30 });
    expect(group!.schedule.days[6]!.windows).toEqual([{ start: 540, end: 720 }]);
    expect(group!.fields).toEqual([
      { name: 'note', label: 'Note', type: 'textarea', required: false, options: [] },
    ]);
  });

  it('keeps completed appointments, in UTC, with their customer', () => {
    expect(plan.appointments.map((a) => a.externalId)).toEqual([
      'ssa:appointment:101',
      'ssa:appointment:102',
      'ssa:appointment:104',
    ]);
    const [mario, anna, luca] = plan.appointments;
    expect(new Date(mario!.start).toISOString()).toBe('2030-07-04T11:00:00.000Z');
    expect(localMinutes(mario!.start, 'Europe/Rome')).toBe(13 * 60);
    expect(mario).toMatchObject({
      status: 'confirmed',
      name: 'Mario Rossi',
      email: 'mario@example.test',
      phone: '+39 333 0000000',
      locale: 'it',
      timezone: 'Europe/Rome',
    });
    expect(anna).toMatchObject({
      status: 'cancelled',
      email: 'anna@example.test',
      fields: [{ name: 'motivo', label: 'Motivo', value: 'Ansia' }],
    });
    expect(luca!.serviceExternalId).toBe('ssa:type:2');
    expect(plan.exceptions).toEqual([
      {
        serviceId: null,
        from: '2030-08-15',
        to: '2030-08-15',
        closed: true,
        hours: { windows: [], times: [] },
        note: 'SSA',
      },
    ]);
    expect(plan.warnings.join(' ')).toMatch(/1 appointment/);
  });

  it('reads a dump of its tables and refuses broken JSON', () => {
    const dump = `INSERT INTO \`wp_ssa_appointment_types\` (\`id\`,\`title\`,\`duration\`,\`availability_type\`,\`availability\`,\`status\`) VALUES (5,'Call',20,'available_blocks','{\\"Friday\\":[{\\"time_start\\":\\"10:00:00\\",\\"time_end\\":\\"11:00:00\\"}]}','publish');
INSERT INTO \`wp_ssa_appointments\` (\`id\`,\`appointment_type_id\`,\`start_date\`,\`end_date\`,\`customer_information\`,\`status\`) VALUES (9,5,'2031-01-03 09:00:00','2031-01-03 09:20:00','{\\"Name\\":\\"Zoe\\",\\"Email\\":\\"z@example.test\\"}','booked');`;
    const fromDump = parseSsa(dump, 'db.sql');
    expect(fromDump.services[0]!.service.schedule.days[5]!.windows).toEqual([
      { start: 600, end: 660 },
    ]);
    expect(fromDump.appointments[0]).toMatchObject({
      name: 'Zoe',
      email: 'z@example.test',
      serviceExternalId: 'ssa:type:5',
    });
    expect(() => parseSsa('{ nope', 'x.json')).toThrow(/not valid JSON/);
    expect(
      ssaDays({ sunday: [{ time_start: '22:00', time_end: '23:59' }] }, false)[0]!.windows,
    ).toEqual([{ start: 1320, end: 1440 }]);
    expect(
      ssaCustomer({ 'Full Name': 'A', 'Email Address': 'a@b.c', Tags: ['x', 'y'] }),
    ).toMatchObject({ name: 'A', email: 'a@b.c', fields: [{ value: 'x, y' }] });
  });
});

describe('Booking Calendar', () => {
  it('reads resources and bookings from a dump', () => {
    const plan = parseWpbc([{ name: 'db.sql', content: fixture('wpbc-dump.sql') }], 'Europe/Rome');
    expect(plan.services.map((s) => [s.externalId, s.service.name, s.service.status])).toEqual([
      ['wpbc:resource:1', 'Camera doppia', 'hidden'],
      ['wpbc:resource:2', 'Sala riunioni', 'hidden'],
    ]);
    const [slot, range, days] = plan.appointments;
    expect(slot).toMatchObject({
      externalId: 'wpbc:booking:1',
      status: 'confirmed',
      name: 'Giulia Neri',
      email: 'giulia@example.test',
      phone: '333 111',
    });
    expect(localMinutes(slot!.start, 'Europe/Rome')).toBe(600);
    expect(localMinutes(slot!.end, 'Europe/Rome')).toBe(720);
    expect(slot!.fields).toEqual([
      { name: 'details', label: 'details', value: 'Prima visita; grazie' },
    ]);
    // In the bin: cancelled; a time chosen in the form.
    expect(range).toMatchObject({ status: 'cancelled', serviceExternalId: 'wpbc:resource:2' });
    expect(localMinutes(range!.start, 'Europe/Rome')).toBe(14 * 60);
    // Whole days: from the first day's midnight to the day after the last.
    expect(days!.name).toBe("O'Brien");
    expect(localDate(days!.start, 'Europe/Rome')).toBe('2030-07-01');
    expect(localDate(days!.end, 'Europe/Rome')).toBe('2030-07-03');
    expect(plan.warnings.join(' ')).toMatch(/hidden services/);
  });

  it('reads CSVs of its tables', () => {
    const plan = parseWpbc(
      [
        { name: 'dates.csv', content: fixture('wpbc-dates.csv') },
        { name: 'booking.csv', content: fixture('wpbc-booking.csv') },
      ],
      'Europe/Rome',
    );
    expect(plan.appointments).toHaveLength(1);
    expect(plan.appointments[0]).toMatchObject({
      name: 'Sara',
      status: 'confirmed',
      externalId: 'wpbc:booking:7',
    });
    expect(
      parseWpbcForm(
        'text^name3^A~checkbox^extras3[]^x~checkbox^extras3[]^y~text^v^a curret b tilde',
        '3',
      ).get('extras'),
    ).toBe('x, y');
  });
});

describe('dumps and CSV', () => {
  it('reads values with quotes, escapes and NULL', () => {
    const t = readDump(
      "INSERT INTO `x_booking` (`a`,`b`,`c`) VALUES ('it\\'s, ok',NULL,'line\\nnext'),(2,'(x)','');",
      ['booking'],
    );
    expect(t.booking).toEqual([
      { a: "it's, ok", b: null, c: 'line\nnext' },
      { a: '2', b: '(x)', c: '' },
    ]);
  });

  it('writes and reads CSV safely', () => {
    const csv = toCsv([
      ['a', 'b'],
      ['=1+1', 'x, "y"'],
    ]);
    expect(csv).toBe('\uFEFFa,b\r\n\'=1+1,"x, ""y"""\r\n');
    expect(parseCsv('a;b\n1;"2;3"\n')).toEqual([
      ['a', 'b'],
      ['1', '2;3'],
    ]);
    expect(csvObjects('A,B\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }]);
  });
});

describe('shortcodes', () => {
  it('converts WordPress shortcodes to the booking block', () => {
    expect(isBookingShortcode('ssa_booking')).toBe(true);
    expect(isBookingShortcode('BOOKING')).toBe(true);
    expect(isBookingShortcode('gallery')).toBe(false);
    expect(attrsFromShortcode('ssa_booking', { type: '4' })).toEqual({ ref: 'ssa:type:4' });
    expect(attrsFromShortcode('ssa_booking', { type: 'consulenza-online', view: 'week' })).toEqual({
      ref: 'ssa:slug:consulenza-online',
      view: 'week',
    });
    expect(attrsFromShortcode('ssa_booking', {})).toEqual({});
    expect(attrsFromShortcode('booking', { type: '2', nummonths: '3' })).toEqual({
      ref: 'wpbc:resource:2',
    });
    expect(attrsFromShortcode('booking', {})).toEqual({ ref: 'wpbc:resource:1' });
    expect(blockFromShortcode('agenda', { service: 'abc' }, 'b1')).toEqual({
      id: 'b1',
      type: 'agenda/booking',
      v: 1,
      attrs: { service: 'abc' },
    });
  });

  it('replaces [agenda] standing alone in a paragraph', () => {
    expect(parseOwnShortcode(' [agenda service="x" category=\'Visite\'] ')).toEqual({
      service: 'x',
      category: 'Visite',
    });
    expect(parseOwnShortcode('Book: [agenda]')).toBeNull();
    const blocks = [
      { id: 'p1', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: '[agenda]' }] },
      {
        id: 'g',
        type: 'core/group',
        v: 1,
        attrs: {},
        children: [
          { id: 'h', type: 'core/shortcode', v: 1, attrs: { text: '[agenda view="week"]' } },
        ],
      },
      { id: 'p2', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'Hello' }] },
    ];
    const out = replaceShortcodes(blocks as never);
    expect(out[0]).toMatchObject({ id: 'p1', type: 'agenda/booking' });
    expect(out[1]!.children![0]).toMatchObject({ type: 'agenda/booking', attrs: {} });
    expect(out[2]).toBe(blocks[2]);
    const untouched = [blocks[2]] as never[];
    expect(replaceShortcodes(untouched)).toBe(untouched);
  });
});
