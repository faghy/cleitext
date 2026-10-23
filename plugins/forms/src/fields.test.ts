import { describe, expect, it } from 'vitest';
import {
  checkValues,
  importKey,
  labelParts,
  labelText,
  messageText,
  normalizeFields,
  parseOptions,
  readSpec,
  replyToField,
  signSpec,
  subjectOf,
  type FormSpec,
} from './fields';
import fixture from './hotel.fixture.json';

/**
 * The acceptance case: a hotel's booking request rebuilt from Contact Form 7
 * (six fields on one row on desktop, the requests below, the consent and the
 * button on one row).
 */
const HOTEL_ATTRS = fixture.attrs;
const HOTEL_REQUEST: Record<string, string> = fixture.request;

const hotel = normalizeFields(HOTEL_ATTRS.fields);

describe('fields', () => {
  it('keeps the saved fields, made safe', () => {
    expect(hotel.map((f) => [f.name, f.type, f.width, f.required])).toEqual([
      ['your-name', 'text', '1/6', true],
      ['your-email', 'email', '1/6', true],
      ['your-tel', 'tel', '1/6', false],
      ['guests', 'number', '1/6', false],
      ['arrival', 'date', '1/6', true],
      ['departure', 'date', '1/6', true],
      ['requests', 'textarea', 'full', true],
      // A consent is always required.
      ['privacy', 'acceptance', 'full', true],
    ]);
    expect(hotel[3]).toMatchObject({ min: '1', max: '20' });
  });

  it('fixes names, types, widths, bounds and classes', () => {
    const fields = normalizeFields([
      { name: 'Your Name!', type: 'password', width: '2/3', className: 'big "x" <b> ok-1' },
      { name: 'your-name' },
      { name: '' },
      { name: 'website' },
      { name: 'when', type: 'date', min: '2027-02-30', max: '2027-12-31' },
      { name: 'menu', type: 'select' },
      null,
      'text',
    ]);
    expect(fields.map((f) => f.name)).toEqual([
      'your-name',
      'your-name-2',
      'field-3',
      'website-2',
      'when',
    ]);
    expect(fields[0]).toMatchObject({ type: 'text', width: 'full', className: 'big ok-1' });
    expect(fields[4]).toMatchObject({ max: '2027-12-31' });
    expect(fields[4]).not.toHaveProperty('min');
    expect(normalizeFields(undefined)).toEqual([]);
    expect(normalizeFields(Array.from({ length: 40 }, () => ({})))).toHaveLength(30);
  });

  it('reads options one per line, as value|label or text', () => {
    expect(parseOptions('single|Camera singola\nDoppia\n\nDoppia\n a | b|c ')).toEqual([
      { value: 'single', label: 'Camera singola' },
      { value: 'Doppia', label: 'Doppia' },
      { value: 'a', label: 'b|c' },
    ]);
  });

  it('finds links in labels, only safe ones', () => {
    expect(labelParts('I accept the [privacy policy](/privacy).')).toEqual([
      { text: 'I accept the ' },
      { text: 'privacy policy', href: '/privacy' },
      { text: '.' },
    ]);
    expect(
      labelParts('Accetto la <a href="https://example.com/p" target="_blank">privacy</a>'),
    ).toEqual([{ text: 'Accetto la ' }, { text: 'privacy', href: 'https://example.com/p' }]);
    expect(labelParts('[x](javascript:alert(1))')[0]).toEqual({ text: 'x' });
    expect(labelText('See [terms](//evil.test)')).toBe('See terms');
  });

  it('picks the Reply-To field', () => {
    const fields = normalizeFields([
      { name: 'a', type: 'email' },
      { name: 'b', type: 'email' },
      { name: 'c' },
    ]);
    expect(replyToField(fields, undefined)).toBe('a');
    expect(replyToField(fields, 'B')).toBe('b');
    expect(replyToField(fields, 'c')).toBe('a');
    expect(replyToField(normalizeFields([{ name: 'x' }]), '')).toBeNull();
  });
});

describe('checking a message', () => {
  it('accepts the hotel request', () => {
    const { values, invalid } = checkValues(hotel, { ...HOTEL_REQUEST, extra: 'ignored' }, 'it');
    expect(invalid).toEqual([]);
    expect(values.map((v) => [v.label, v.value])).toEqual([
      ['Nome*', 'Mario Rossi'],
      ['Email*', 'mario@example.com'],
      ['Telefono', '+39 019 123456'],
      ['Numero ospiti', '2'],
      ['Arrivo*', '2027-07-10'],
      ['Partenza*', '2027-07-17'],
      ['Richieste particolari*', 'Camera vista mare,\nse possibile.'],
      ['Ho letto e accetto la privacy policy', 'Sì'],
    ]);
    expect(values.some((v) => v.name === 'extra')).toBe(false);
  });

  it('refuses what is missing or not valid', () => {
    const invalid = (changes: Record<string, unknown>) =>
      checkValues(hotel, { ...HOTEL_REQUEST, ...changes }).invalid;
    expect(invalid({ 'your-name': '  ' })).toEqual(['your-name']);
    expect(invalid({ 'your-email': 'nope' })).toEqual(['your-email']);
    expect(invalid({ 'your-tel': 'call me' })).toEqual(['your-tel']);
    expect(invalid({ guests: '0' })).toEqual(['guests']);
    expect(invalid({ guests: '21' })).toEqual(['guests']);
    expect(invalid({ guests: 'two' })).toEqual(['guests']);
    expect(invalid({ arrival: '2027-02-30' })).toEqual(['arrival']);
    expect(invalid({ departure: '17/07/2027' })).toEqual(['departure']);
    expect(invalid({ privacy: undefined })).toEqual(['privacy']);
    expect(invalid({ requests: '' })).toEqual(['requests']);
    // Optional fields may be empty.
    expect(invalid({ 'your-tel': '', guests: '' })).toEqual([]);
  });

  it('checks dates against their bounds, and options', () => {
    const fields = normalizeFields([
      { name: 'day', type: 'date', min: '2027-01-01', max: '2027-12-31' },
      { name: 'room', type: 'select', options: 'single|Single\ndouble|Double', required: true },
      { name: 'extras', type: 'checkbox', options: 'breakfast\nparking' },
      { name: 'board', type: 'radio', options: 'half\nfull' },
      { name: 'news', type: 'checkbox' },
    ]);
    const check = (body: Record<string, unknown>) => checkValues(fields, body);
    const ok = check({
      day: '2027-06-01',
      room: 'double',
      extras: ['parking', 'breakfast'],
      news: 'on',
    });
    expect(ok.invalid).toEqual([]);
    expect(ok.values.map((v) => v.value)).toEqual([
      '2027-06-01',
      'double',
      'parking, breakfast',
      '',
      'Yes',
    ]);
    expect(check({ day: '2026-12-31', room: 'single' }).invalid).toEqual(['day']);
    expect(check({ room: 'suite' }).invalid).toEqual(['room']);
    expect(check({ room: 'single', extras: ['spa'] }).invalid).toEqual(['extras']);
    expect(check({ room: 'single', board: 'none' }).invalid).toEqual(['board']);
  });

  it('caps the length of values', () => {
    const fields = normalizeFields([{ name: 'a' }, { name: 'b', type: 'textarea' }]);
    const { values } = checkValues(fields, { a: 'x'.repeat(1000), b: 'y'.repeat(9000) });
    expect(values[0]!.value).toHaveLength(200);
    expect(values[1]!.value).toHaveLength(5000);
  });
});

describe('the email', () => {
  const { values } = checkValues(hotel, HOTEL_REQUEST, 'it');

  it('has the subject of its template, or the classic one', () => {
    expect(subjectOf('Sito Hotel aurora Varazze', 'Prenotazione', values)).toBe(
      'Sito Hotel aurora Varazze',
    );
    expect(subjectOf('{form}: {your-name}, {arrival} {unknown}', 'Prenotazione', values)).toBe(
      'Prenotazione: Mario Rossi, 2027-07-10 {unknown}',
    );
    expect(subjectOf('', 'Prenotazione', values)).toBe('[Prenotazione] Mario Rossi');
    expect(subjectOf('{your-name}', 'F', [{ ...values[0]!, value: 'A\r\nBcc: x@y.z' }])).toBe(
      'A Bcc: x@y.z',
    );
  });

  it('lists every field with its label, in order', () => {
    expect(messageText(values, '/prenota', 'it')).toBe(
      [
        'Nome*: Mario Rossi',
        'Email*: mario@example.com',
        'Telefono: +39 019 123456',
        'Numero ospiti: 2',
        'Arrivo*: 2027-07-10',
        'Partenza*: 2027-07-17',
        'Richieste particolari*:\nCamera vista mare,\nse possibile.\n',
        'Ho letto e accetto la privacy policy: Sì',
        '',
        'Pagina: /prenota',
      ].join('\n'),
    );
  });
});

describe('the signed fields', () => {
  const spec: FormSpec = {
    form: 'Prenotazione',
    fields: hotel,
    subject: 'Sito Hotel aurora Varazze',
    replyTo: 'your-email',
  };

  it('come back as they were signed', async () => {
    const key = await importKey('secret');
    const token = await signSpec(key, spec);
    expect(await readSpec(key, token)).toEqual(spec);
  });

  it('are refused when changed, signed with another key or missing', async () => {
    const key = await importKey('secret');
    const token = await signSpec(key, spec);
    const [payload, signature] = token.split('.') as [string, string];
    const forged = await signSpec(await importKey('other'), { ...spec, fields: [] });
    expect(await readSpec(key, `${payload.slice(0, -2)}AA.${signature}`)).toBeNull();
    expect(await readSpec(key, forged)).toBeNull();
    expect(await readSpec(key, undefined)).toBeNull();
    expect(await readSpec(key, 'x'.repeat(40_000))).toBeNull();
  });
});
