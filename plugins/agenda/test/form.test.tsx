// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  fieldText,
  formOf,
  mergeImportedFields,
  moveField,
  readAnswers,
  visibleFields,
} from '../src/model/form';
import { normalizeFields, normalizeService } from '../src/model/normalize';
import { stringsFor } from '../src/model/strings';
import { BookingWidget, type BlockView } from '../src/render';

const it_ = stringsFor('it');
/** The tag of the input with a name. */
const tag = (html: string, name: string) =>
  html.match(new RegExp(`<(input|select|textarea)[^>]*name="${name}"[^>]*>`))?.[0] ?? '';
const states = (form: { name: string; state: string }[]) => form.map((f) => [f.name, f.state]);

/** A service saved with its whole form (1.0.1). */
const service = normalizeService(
  {
    name: 'Visita',
    fields: [
      { name: 'name', label: '' },
      { name: 'email', label: '', state: 'hidden' },
      { name: 'phone', label: '', state: 'required', help: 'Per avvisarti' },
      { name: 'address', label: 'Indirizzo', state: 'required' },
      { name: 'city', label: 'Città', state: 'hidden' },
      { name: 'size', label: 'Taglia', type: 'select', options: ['S', 'M'], state: 'optional' },
      {
        name: 'notes',
        label: '',
        state: 'optional',
        translations: { en: { label: 'Anything else?', help: 'Optional' } },
      },
    ],
  },
  '00000000-0000-4000-8000-000000000001',
);
const form = formOf(service);

const valid = {
  name: 'Ada',
  email: 'ADA@example.test',
  phone: '+39 333 1234567',
  fields: { address: 'Via Roma 1', size: 'M', notes: 'Grazie' },
};

describe('the booking form of a service', () => {
  it('keeps name and email required, and the order and states chosen', () => {
    expect(states(form)).toEqual([
      ['name', 'required'],
      ['email', 'required'],
      ['phone', 'required'],
      ['address', 'required'],
      ['city', 'hidden'],
      ['size', 'optional'],
      ['notes', 'optional'],
    ]);
    expect(form.every((f) => f.required === (f.state === 'required'))).toBe(true);
    // Before 1.0.1 a question had only `required`.
    expect(states(normalizeFields([{ name: 'eta', label: 'Età', required: true }]))).toEqual([
      ['eta', 'required'],
    ]);
  });

  it('completes the services saved before 1.0.1 with the standard fields', () => {
    const old = {
      fields: normalizeFields([{ name: 'eta', label: 'Età', required: true }]),
      data: {},
    };
    expect(states(formOf(old, 'optional'))).toEqual([
      ['name', 'required'],
      ['email', 'required'],
      ['phone', 'optional'],
      ['eta', 'required'],
      ['notes', 'hidden'],
    ]);
    expect(formOf(old, 'off').find((f) => f.name === 'phone')!.state).toBe('hidden');
    expect(formOf(old, 'required').find((f) => f.name === 'phone')!.state).toBe('required');
    // Imported by 1.0.0 from SSA with the phone required.
    expect(
      formOf({ fields: [], data: { askPhone: true } }, 'off').find((f) => f.name === 'phone')!
        .state,
    ).toBe('required');
  });

  it('gives each field its label and help in the page’s language', () => {
    const notes = form.find((f) => f.name === 'notes')!;
    expect(fieldText(notes, 'it', it_)).toEqual({ label: 'Note', help: '' });
    expect(fieldText(notes, 'en-GB', stringsFor('en'))).toEqual({
      label: 'Anything else?',
      help: 'Optional',
    });
    const address = form.find((f) => f.name === 'address')!;
    expect(fieldText(address, 'en', stringsFor('en')).label).toBe('Indirizzo');
  });

  it('moves a field up, down and to any place', () => {
    const names = form.map((f) => f.name);
    expect(moveField(names, 3, 2)).toEqual([
      'name',
      'email',
      'address',
      'phone',
      'city',
      'size',
      'notes',
    ]);
    expect(moveField(names, 0, 6)).toEqual([...names.slice(1), 'name']);
    expect(moveField(names, 6, -3)[0]).toBe('notes');
    expect(moveField(names, 9, 0)).toBe(names);
    expect(moveField(names, 2, 2)).toBe(names);
    const reordered = normalizeService({ ...service, fields: moveField(form, 5, 0) });
    expect(formOf(reordered).map((f) => f.name)[0]).toBe('size');
  });

  it('keeps the form chosen here when a service is imported again', () => {
    const imported = normalizeFields([
      { name: 'name', label: '' },
      { name: 'address', label: 'Address', state: 'optional' },
      { name: 'zip', label: 'Zip', state: 'optional' },
    ]);
    const merged = mergeImportedFields(form, imported);
    expect(merged.find((f) => f.name === 'address')).toMatchObject({
      label: 'Indirizzo',
      state: 'required',
    });
    expect(merged.map((f) => f.name).slice(-1)).toEqual(['zip']);
    // Never saved since 1.0.1: the import's form.
    expect(mergeImportedFields([{ label: 'Età' }], imported)).toEqual(imported);
  });
});

describe('a booking checked against the form', () => {
  it('takes the answers of the visible fields, with their label', () => {
    const a = readAnswers(form, valid, it_);
    expect(a.bad).toEqual([]);
    expect(a).toMatchObject({ name: 'Ada', email: 'ada@example.test', phone: '+39 333 1234567' });
    expect(a.fields).toEqual([
      { name: 'address', label: 'Indirizzo', value: 'Via Roma 1' },
      { name: 'size', label: 'Taglia', value: 'M' },
      { name: 'notes', label: 'Note', value: 'Grazie' },
    ]);
  });

  it('enforces the required fields and the choices', () => {
    const a = readAnswers(
      form,
      { name: '', email: 'nope', phone: '', fields: { size: 'XL', notes: '' } },
      it_,
    );
    expect(a.bad).toEqual(['name', 'email', 'phone', 'f_address', 'f_size']);
    // Optional: may be empty, but a phone given must look like one.
    const optional = formOf(normalizeService({ fields: [{ name: 'phone', state: 'optional' }] }));
    expect(readAnswers(optional, { ...valid, phone: '' }, it_).bad).toEqual([]);
    expect(readAnswers(optional, { ...valid, phone: 'call me' }, it_).bad).toEqual(['phone']);
  });

  it('ignores hidden fields, even when they are sent', () => {
    const a = readAnswers(form, { ...valid, fields: { ...valid.fields, city: 'Roma' } }, it_);
    expect(a.fields.map((f) => f.name)).not.toContain('city');
    const noPhone = formOf(normalizeService({ fields: [{ name: 'phone', state: 'hidden' }] }));
    expect(readAnswers(noPhone, { ...valid, phone: 'x' }, it_)).toMatchObject({
      phone: '',
      bad: [],
    });
    // A form sent as a list, not an object: no answers.
    expect(readAnswers(form, { ...valid, fields: ['x'] }, it_).bad).toEqual(['f_address']);
  });

  it('leaves the answers of existing bookings as they were when the form changes', () => {
    const before = readAnswers(form, valid, it_).fields;
    const changed = formOf(
      normalizeService({
        ...service,
        fields: form.map((f) =>
          f.name === 'address' ? { ...f, label: 'Via', state: 'hidden' } : f,
        ),
      }),
    );
    expect(before.find((f) => f.name === 'address')!.label).toBe('Indirizzo');
    expect(readAnswers(changed, valid, it_).fields.map((f) => f.name)).not.toContain('address');
  });
});

describe('the form on the page', () => {
  const view = (s = service): BlockView => ({
    uid: 'ag-test',
    preview: false,
    heading: '',
    limitReached: false,
    challenge: '',
    services: [s],
    settings: { phone: 'optional', privacyUrl: '', contact: '' },
    config: {
      api: '/api',
      manage: '/m',
      locale: 'it',
      timeZone: 'Europe/Rome',
      view: 'month',
      fixed: null,
      services: [],
      strings: it_,
    },
  });

  it('draws the visible fields in order, required ones marked, hidden ones not at all', () => {
    const html = renderToStaticMarkup(<BookingWidget view={view()} />);
    const names = [...html.matchAll(/name="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((n) => n !== 'website' && n !== 'consent');
    expect(names).toEqual(['name', 'email', 'phone', 'f_address', 'f_size', 'f_notes']);
    expect(html).not.toContain('f_city');
    expect(tag(html, 'f_address')).toContain('required=""');
    expect(tag(html, 'f_size')).not.toContain('required');
    expect(html).toContain('Per avvisarti');
    expect(html).toContain('aria-describedby="ag-test-00000000-f-phone-help"');
    expect(html).toContain('(facoltativo)');
  });

  it('draws a service saved before 1.0.1 as it was', () => {
    const old = normalizeService(
      { name: 'Old', fields: [{ name: 'eta', label: 'Età', required: true }] },
      'x',
    );
    const html = renderToStaticMarkup(<BookingWidget view={view(old)} />);
    expect(tag(html, 'phone')).not.toContain('required');
    expect(tag(html, 'f_eta')).toContain('required');
    expect(html).not.toContain('f_notes');
    expect(visibleFields(formOf(old)).map((f) => f.name)).toEqual([
      'name',
      'email',
      'phone',
      'eta',
    ]);
  });
});
