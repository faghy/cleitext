/**
 * The booking form of a service: its fields in order (the standard ones and
 * the service's questions), each required, optional or hidden, with label
 * and help in every language. The site, the admin's preview and the
 * booking's validation all read it from here.
 *
 * Services saved before 1.0.1 have only their questions: the standard
 * fields are added where they used to be (name, email, phone first, the
 * phone as the settings ask it; the customer's notes hidden at the end).
 */
import { isFixedField, isEmail, isStandardField, normalizeFields, str } from './normalize';
import type { Strings } from './strings';
import type { Appointment, CustomField, FieldState, Service, Settings } from './types';

export const PHONE_RE = /^[0-9+()\-./\s]{5,40}$/;

function standard(name: 'name' | 'email' | 'phone' | 'notes', state: FieldState): CustomField {
  return {
    name,
    label: '',
    help: '',
    type: name === 'notes' ? 'textarea' : 'text',
    state,
    required: state === 'required',
    options: [],
    translations: {},
  };
}

/** The phone of a service saved before 1.0.1: the settings', or required by an import. */
function legacyPhone(service: Pick<Service, 'data'>, phone: Settings['phone']): FieldState {
  if (service.data.askPhone === true || phone === 'required') return 'required';
  return phone === 'off' ? 'hidden' : 'optional';
}

/** Every field of the service's form, in order, the hidden ones included. */
export function formOf(
  service: Pick<Service, 'fields' | 'data'>,
  phone: Settings['phone'] = 'optional',
): CustomField[] {
  const list = normalizeFields(service.fields);
  const has = (name: string) => list.some((f) => f.name === name);
  const head: CustomField[] = [];
  if (!has('name')) head.push(standard('name', 'required'));
  if (!has('email')) head.push(standard('email', 'required'));
  if (!has('phone')) head.push(standard('phone', legacyPhone(service, phone)));
  // The new ones go right after the last standard field already there (or first).
  let at = 0;
  list.forEach((f, i) => {
    if (f.name === 'name' || f.name === 'email') at = i + 1;
  });
  const out = [...list.slice(0, at), ...head, ...list.slice(at)];
  if (!has('notes')) out.push(standard('notes', 'hidden'));
  return out;
}

/** The fields a customer sees, in order. */
export const visibleFields = (form: CustomField[]) => form.filter((f) => f.state !== 'hidden');

/** A field's label and help in a language (the site's ones, then the standard text). */
export function fieldText(
  field: CustomField,
  locale: string,
  strings: Strings,
): { label: string; help: string } {
  const t = field.translations[locale] ?? field.translations[locale.split('-')[0]!] ?? {};
  const base = isStandardField(field.name) ? strings[field.name] : '';
  return {
    label: t.label || field.label || base,
    help: t.help || field.help,
  };
}

/** The list with one field moved to another place (drag and drop, or up/down). */
export function moveField<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, item!);
  return out;
}

/**
 * The form of a service imported again: what was decided here stays (states,
 * labels, order); questions added in the other plugin since are appended.
 * The importers always give the whole form (with the standard fields).
 */
export function mergeImportedFields(kept: unknown, imported: unknown): CustomField[] {
  const mine = normalizeFields(kept);
  // A form never saved since 1.0.1 has no standard fields: the import's is taken as it is.
  if (!mine.some((f) => f.name === 'name')) return normalizeFields(imported);
  const names = new Set(mine.map((f) => f.name));
  return [...mine, ...normalizeFields(imported).filter((f) => !names.has(f.name))];
}

export interface BookingAnswers {
  name: string;
  email: string;
  phone: string;
  fields: Appointment['fields'];
  /** Names of the inputs to correct (`f_<name>` for the questions). */
  bad: string[];
}

/**
 * A booking's details checked against the form: required fields filled in,
 * hidden ones ignored (even if sent), choices among the options. The
 * answers keep the label they had, so later changes to the form do not
 * touch existing bookings.
 */
export function readAnswers(
  form: CustomField[],
  input: Record<string, unknown>,
  strings: Strings,
): BookingAnswers {
  const out: BookingAnswers = { name: '', email: '', phone: '', fields: [], bad: [] };
  const answers = (
    input.fields && typeof input.fields === 'object' && !Array.isArray(input.fields)
      ? input.fields
      : {}
  ) as Record<string, unknown>;
  for (const field of form) {
    if (field.state === 'hidden' && !isFixedField(field.name)) continue;
    const required = field.state === 'required' || isFixedField(field.name);
    if (field.name === 'name') {
      out.name = str(input.name, 200);
      if (!out.name) out.bad.push('name');
    } else if (field.name === 'email') {
      out.email = str(input.email, 200).toLowerCase();
      if (!isEmail(out.email)) out.bad.push('email');
    } else if (field.name === 'phone') {
      out.phone = str(input.phone, 40);
      if (required ? !PHONE_RE.test(out.phone) : out.phone && !PHONE_RE.test(out.phone))
        out.bad.push('phone');
    } else {
      const value = str(answers[field.name], 2000);
      const wrongChoice = field.type === 'select' && value && !field.options.includes(value);
      if ((required && !value) || wrongChoice) out.bad.push(`f_${field.name}`);
      else if (value)
        out.fields.push({
          name: field.name,
          label: field.label || (isStandardField(field.name) ? strings[field.name] : field.name),
          value,
        });
    }
  }
  return out;
}
