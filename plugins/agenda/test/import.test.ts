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
import {
  convertTemplate,
  htmlToText,
  parseSsa,
  ssaCustomer,
  ssaDays,
  ssaTables,
} from '../src/import/ssa';
import { IT } from '../src/admin/it';
import { parseWpbc, parseWpbcForm } from '../src/import/wpbc';
import { csvObjects, parseCsv, toCsv } from '../src/model/csv';
import { localDate, localMinutes } from '../src/model/time';
import type { CustomField } from '../src/model/types';

const STANDARD = ['name', 'email', 'phone', 'notes'];
const states = (fields: CustomField[]) => fields.map((f) => [f.name, f.state]);

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('Simply Schedule Appointments', () => {
  const plan = parseSsa(fixture('ssa-export.json'), 'export.json');

  it('turns appointment types into services', () => {
    expect(plan.timezone).toBe('Europe/Rome');
    expect(plan.services.map((s) => s.externalId)).toEqual([
      'ssa:type:1',
      'ssa:type:2',
      'ssa:type:3',
    ]);
    const [one, group, old] = plan.services.map((s) => s.service);
    expect(old!.status).toBe('hidden');
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
    // SSA required the phone: it stays required (name and email always are).
    expect(states(one!.fields).slice(0, 3)).toEqual([
      ['name', 'required'],
      ['email', 'required'],
      ['phone', 'required'],
    ]);
    expect(one!.data.askPhone).toBeUndefined();
    expect(one!.data.import).toMatchObject({ from: 'ssa', id: '1', slug: 'consulenza-online' });
    expect(group).toMatchObject({ capacity: 8, status: 'hidden' });
    expect(group!.schedule).toMatchObject({ mode: 'intervals', step: 30 });
    expect(group!.schedule.days[6]!.windows).toEqual([{ start: 540, end: 720 }]);
    expect(group!.fields.filter((f) => f.name === 'note')).toEqual([
      {
        name: 'note',
        label: 'Note',
        help: '',
        type: 'textarea',
        state: 'optional',
        required: false,
        options: [],
        translations: {},
      },
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
    expect(plan.notes).toContainEqual({
      kind: 'skipped',
      text: '{n} appointment(s) never completed (abandoned, waiting for a form or a payment) or without a valid time.',
      values: { n: 1 },
    });
    expect(plan.notes[0]!.text).toMatch(/export of Simply/);
    expect(plan.settings!.notify).toEqual(['studio@example.test']);
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

describe('Simply Schedule Appointments, its tables as JSON rows', () => {
  const content = fixture('ssa-tables.json');
  const plan = parseSsa(content, 'ssa.json');
  const texts = plan.notes.map((n) => n.text);

  it('detects the shape, also with prefixed names and from phpMyAdmin', () => {
    expect(texts[0]).toMatch(/tables of Simply Schedule Appointments/);
    const raw = JSON.parse(content) as Record<string, unknown>;
    const prefixed = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [
        k === 'settings' ? 'wp_ssa_settings_json' : k === 'source' ? k : `wp_ssa_${k}`,
        k === 'settings' ? JSON.stringify(v) : v,
      ]),
    );
    const again = parseSsa(JSON.stringify(prefixed), 'x.json');
    expect(again.services).toHaveLength(3);
    expect(again.appointments).toHaveLength(4);
    expect(again.settings!.notify).toContain('studio@example.test');
    const phpMyAdmin = [
      { type: 'header', version: '5.2' },
      { type: 'table', name: 'wp_ssa_appointment_types', data: raw.appointment_types },
      { type: 'table', name: 'wp_ssa_appointments', data: raw.appointments },
    ];
    expect(ssaTables(phpMyAdmin).format).toBe('tables');
    expect(parseSsa(JSON.stringify(phpMyAdmin), 'x.json').appointments).toHaveLength(4);
    expect(() => parseSsa('{"posts": []}', 'x.json')).toThrow(/No appointment types/);
  });

  it('imports every type: the published one bookable, the others hidden', () => {
    const [online, studio, call] = plan.services.map((s) => s.service);
    expect(online).toMatchObject({
      name: 'Colloquio online',
      description: 'Il link arriva per email.',
      category: '',
      color: '#8bc34a',
      duration: 45,
      bufferBefore: 70,
      bufferAfter: 10,
      minNotice: 720,
      maxNotice: 86400,
      capacity: 1,
      status: 'active',
    });
    expect(online!.schedule.mode).toBe('fixed');
    expect(online!.schedule.days[2]!.times).toEqual([600, 675, 750]);
    expect(online!.schedule.days.filter((d) => d.times.length)).toHaveLength(1);
    // Shown standard questions become the service's, optional even when SSA
    // required them (Address); hidden ones (Notes) do not: Agenda's notes stay hidden.
    expect(states(online!.fields)).toEqual([
      ['name', 'required'],
      ['email', 'required'],
      ['phone', 'required'],
      ['address', 'optional'],
      ['zip', 'optional'],
      ['notes', 'hidden'],
    ]);
    expect(texts).toContain(
      '“{name}”: {fields} were required in SSA and are imported as optional. You decide which ones to require in the service’s booking form, and can change it at any time.',
    );
    expect(plan.notes.find((n) => n.text.includes('were required in SSA'))?.values).toEqual({
      name: online!.name,
      fields: 'Address',
    });
    expect(texts.some((t) => t.startsWith('Booking forms: name and email are required'))).toBe(
      true,
    );
    expect(studio).toMatchObject({ status: 'hidden' });
    expect(states(studio!.fields)).toEqual([
      ['name', 'required'],
      ['email', 'required'],
      ['phone', 'hidden'],
      ['notes', 'hidden'],
    ]);
    expect(call).toMatchObject({ status: 'hidden', category: 'Telefono', color: '#009688' });
    expect(texts).toContain(
      '“{name}” was deleted in SSA: it is imported hidden, with its appointments.',
    );
    expect(texts).toContain('“{name}” was not bookable in SSA: it is imported hidden.');
  });

  it('keeps the appointments with their customer, status and UTC time', () => {
    expect(plan.appointments.map((a) => [a.externalId, a.status])).toEqual([
      ['ssa:appointment:1', 'confirmed'],
      ['ssa:appointment:2', 'confirmed'],
      ['ssa:appointment:3', 'cancelled'],
      ['ssa:appointment:4', 'confirmed'],
    ]);
    const [winter, summer, cancelled] = plan.appointments;
    // 10:00 in Rome in winter (UTC+1) and in summer (UTC+2).
    expect(localMinutes(winter!.start, winter!.timezone)).toBe(600);
    expect(localDate(winter!.start, 'Europe/Rome')).toBe('2031-02-04');
    expect(localMinutes(summer!.start, 'Europe/Rome')).toBe(600);
    expect(summer).toMatchObject({
      name: 'Cliente Finto 2',
      email: 'finto2@example.test',
      phone: '+39 000 111 0002',
      locale: 'it',
      fields: [
        { name: 'address', label: 'Address', value: 'Via Esempio 1' },
        { name: 'zip', label: 'Zip', value: '00000' },
      ],
    });
    expect(cancelled!.notes).toBe('Impegno di lavoro');
    expect(plan.exceptions).toEqual([]);
    expect(texts).toContain('{n} blackout date(s): turned off in SSA.');
    expect(plan.notes).toContainEqual({
      kind: 'skipped',
      text: '{n} appointment meta row(s): the page each booking was made on, not needed in Agenda.',
      values: { n: 12 },
    });
    expect(plan.notes.find((n) => n.text.startsWith('{n} availability row'))!.values).toEqual({
      n: 2,
    });
  });

  it('takes the administrator’s addresses and the customers’ email texts', () => {
    expect(plan.timezone).toBe('Europe/Rome');
    expect(plan.settings).toMatchObject({
      notify: ['studio@example.test', 'segreteria@example.test'],
      locale: 'it',
    });
    expect(plan.settings!.shared).toBeUndefined();
    expect(texts).toContain('The company name “{name}” is written in the imported email texts.');
    const { confirmed, cancelled } = plan.settings!.emails;
    expect(confirmed!.subject).toBe('Conferma del tuo appuntamento');
    expect(confirmed!.body).toBe(
      [
        'Gentile {name},',
        'la prenotazione è confermata.',
        'Data e ora: {date}, {time}',
        'Tipo: {service}',
        'Modulo: compila il modulo (https://example.test/modulo) & firma',
        'Saluti,\nStudio Esempio',
        'Per modificare: {manage_url}',
      ].join('\n\n'),
    );
    expect(cancelled!.body).toBe(
      'Ciao {name},\nil tuo appuntamento di "{service}" è stato annullato',
    );
    expect(plan.notes).toContainEqual(
      expect.objectContaining({ kind: 'skipped', values: { n: 2 } }),
    );
    expect(texts).toContain(
      'SSA sent no reminder; Agenda sends one the day before: turn it off in Settings if you do not want it.',
    );
  });

  it('converts SSA’s templates', () => {
    const missing = new Set<string>();
    expect(
      convertTemplate(
        '{% if a %}A{% if b %}B{% else %}C{% endif %}{% else %}D{% endif %}{{ Appointment.customer_information.Name }}{{ x|raw }}{% if Appointment.public_edit_url %}E{% endif %}',
        '',
        missing,
      ),
    ).toBe('D{name}E');
    expect([...missing]).toEqual(['b', 'a', 'x']);
    expect(convertTemplate('{{ Global.company_name }}', '', new Set())).toBe('{site}');
    expect(
      htmlToText('<ul><li>Uno</li><li>Due&nbsp;&#8364; &#x41;</li></ul><a href="u">u</a>'),
    ).toBe('- Uno\n\n- Due € A\n\nu');
    // Reminders and follow-ups: the reminder is taken, follow-ups have no equivalent.
    const withReminder = parseSsa(
      JSON.stringify({
        settings: {
          notifications: {
            notifications: [
              {
                sent_to: ['{{customer_email}}'],
                trigger: 'appointment_start_date',
                when: 'before',
                duration: 120,
                subject: 'Domani',
                message: 'Ci vediamo {{ Appointment.customer_start_date }}',
                appointment_types: [3],
              },
              {
                sent_to: ['{{customer_email}}'],
                trigger: 'appointment_booked',
                when: 'after',
                duration: 60,
                title: 'Follow-up',
                message: 'x',
              },
              {
                sent_to: ['{{customer_email}}'],
                trigger: 'appointment_start_date',
                when: 'before',
                duration: 60,
                title: 'Second',
                message: 'y',
              },
            ],
          },
          developer: { separate_appointment_type_availability: true },
          advanced_scheduling: { enabled: true },
        },
        appointment_types: [
          {
            id: '9',
            title: 'T',
            status: 'publish',
            max_event_count: '2',
            booking_start_date: '2031-01-01 00:00:00',
            web_meetings: '{"provider":"zoom"}',
            custom_customer_information: [
              { field: 'Colore', type: 'dropdown', values: 'Rosso\nBlu', required: '1' },
              { field: 'Privacy', type: 'checkbox' },
            ],
          },
        ],
      }),
    );
    expect(withReminder.settings!.emails.reminder).toEqual({
      subject: 'Domani',
      body: 'Ci vediamo {date}, {time}',
    });
    expect(withReminder.settings!.shared).toBe(false);
    expect(
      withReminder.services[0]!.service.fields.filter((f) => !STANDARD.includes(f.name)),
    ).toEqual([
      {
        name: 'colore',
        label: 'Colore',
        help: '',
        type: 'select',
        // Required in SSA: optional here, the owner decides.
        state: 'optional',
        required: false,
        options: ['Rosso', 'Blu'],
        translations: {},
      },
      {
        name: 'privacy',
        label: 'Privacy',
        help: '',
        type: 'checkbox',
        state: 'optional',
        required: false,
        options: [],
        translations: {},
      },
    ]);
    expect(withReminder.notes.filter((n) => n.kind === 'skipped').map((n) => n.values)).toEqual([
      { title: 'Follow-up' },
      { title: 'Second' },
    ]);
    const kinds = withReminder.notes.map((n) => `${n.kind}:${n.text.slice(0, 20)}`);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'info:The reminder is sent',
        'review:The email “{title}” ',
        'skipped:The email “{title}” ',
        'info:Each service keeps i',
        'review:SSA’s advanced sched',
        'review:“{name}”: SSA allowe',
        'review:“{name}” could be bo',
        'review:“{name}”: the video ',
        'review:The imported email t',
      ]),
    );
  });

  it('has every line of the report in Italian', () => {
    const missing: string[] = [];
    for (const file of ['ssa.ts', 'wpbc.ts']) {
      const source = readFileSync(new URL(`../src/import/${file}`, import.meta.url), 'utf8');
      for (const m of source.matchAll(/note\(\s*'(?:info|skipped|review)',\s*'((?:[^'\\]|\\.)*)'/g))
        if (!(m[1]! in IT)) missing.push(m[1]!);
    }
    expect(missing).toEqual([]);
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
    expect(plan.notes.map((n) => n.text).join(' ')).toMatch(/hidden services/);
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
