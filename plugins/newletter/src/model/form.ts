/**
 * The signup form's data: what a form may do (its lists, tags, double
 * opt-in and fields), signed when the page is drawn so a visitor cannot
 * point it to other lists; the submission's checks; the consent record.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { idList, labelOf, text, type CustomField, type Settings } from './settings';
import type { Strings } from './strings';
import type { FieldSet, SignupAttrs } from './types';

export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

/** What one form does, decided by the block and the settings. */
export interface FormSpec {
  lists: string[];
  tags: string[];
  doubleOptIn: boolean;
  fields: FieldSet;
  /** Keys of the custom fields shown (forms with all fields). */
  custom: string[];
}

export function specOf(attrs: SignupAttrs, settings: Settings): FormSpec {
  const lists = idList(attrs.lists);
  const tags = idList(attrs.tags);
  const fields: FieldSet =
    attrs.fields && ['email', 'name', 'name-surname', 'all'].includes(attrs.fields)
      ? attrs.fields
      : settings.fields;
  return {
    lists: lists.length ? lists : settings.lists,
    tags: [...new Set([...settings.tags, ...tags])].slice(0, 20),
    doubleOptIn:
      attrs.doubleOptIn === 'on'
        ? true
        : attrs.doubleOptIn === 'off'
          ? false
          : settings.doubleOptIn,
    fields,
    custom: fields === 'all' ? settings.customFields.map((f) => f.key) : [],
  };
}

const b64 = (value: string) => Buffer.from(value).toString('base64url');

export function signSpec(key: string, spec: FormSpec): string {
  const payload = b64(JSON.stringify(spec));
  const mac = createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function readSpec(key: string, token: unknown): FormSpec | null {
  if (typeof token !== 'string' || token.length > 4000) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = createHmac('sha256', key).update(payload).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as FormSpec;
    return {
      lists: idList(raw.lists),
      tags: idList(raw.tags),
      doubleOptIn: raw.doubleOptIn === true,
      fields: ['email', 'name', 'name-surname', 'all'].includes(raw.fields) ? raw.fields : 'email',
      custom: idList(raw.custom, 10),
    };
  } catch {
    return null;
  }
}

export const showsName = (fields: FieldSet) => fields !== 'email';
export const showsSurname = (fields: FieldSet) => fields === 'name-surname' || fields === 'all';

/** A checked submission, or the fields that are wrong. */
export interface Submission {
  email: string;
  firstName: string;
  lastName: string;
  /** Custom fields by the service's keys. */
  fields: Record<string, string>;
  bad: string[];
}

export function readSubmission(
  input: Record<string, unknown>,
  spec: FormSpec,
  customFields: CustomField[],
): Submission {
  const bad: string[] = [];
  const email = text(input.email, 254).toLowerCase();
  if (!isEmail(email)) bad.push('email');
  const firstName = showsName(spec.fields) ? text(input.first_name, 100) : '';
  const lastName = showsSurname(spec.fields) ? text(input.last_name, 100) : '';
  const fields: Record<string, string> = {};
  for (const key of spec.custom) {
    const field = customFields.find((f) => f.key === key);
    const value = text(input[`f_${key}`], 300);
    if (field?.required && !value) bad.push(`f_${key}`);
    if (value) fields[key] = value;
  }
  if (input.consent !== '1' && input.consent !== true && input.consent !== 'on')
    bad.push('consent');
  return { email, firstName, lastName, fields, bad };
}

/** The visitor's names in the service's own fields, when the owner mapped them. */
export function providerFields(
  submission: Pick<Submission, 'firstName' | 'lastName' | 'fields'>,
  settings: Pick<Settings, 'firstNameKey' | 'lastNameKey'>,
): { fields: Record<string, string>; firstName?: string; lastName?: string } {
  const fields = { ...submission.fields };
  let firstName: string | undefined = submission.firstName || undefined;
  let lastName: string | undefined = submission.lastName || undefined;
  if (firstName && settings.firstNameKey) {
    fields[settings.firstNameKey] = firstName;
    firstName = undefined;
  }
  if (lastName && settings.lastNameKey) {
    fields[settings.lastNameKey] = lastName;
    lastName = undefined;
  }
  return { fields, ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) };
}

/** A full name split into first name and surname (the last word). */
export function splitName(name: string): { firstName: string; lastName: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { firstName: words[0] ?? '', lastName: '' };
  return { firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1]! };
}

/** The consent's text as the visitor read it (the link's text in place of `{privacy}`). */
export function consentText(s: Strings, privacyUrl: string): string {
  return privacyUrl ? s.consent.replace('{privacy}', s.privacy) : s.consentPlain;
}

/** HMAC of a value with the site's key: the log keeps no email or IP in clear. */
export function hashOf(key: string, kind: 'email' | 'ip', value: string): string {
  return createHmac('sha256', key)
    .update(`${kind}:${value.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

/** `m•••@e•••.com`: enough to tell two subscriptions apart, not to read the address. */
export function emailHint(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const dot = domain.lastIndexOf('.');
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.slice(0, 1)}•••@${domain.slice(0, 1)}•••${tld}`;
}

/** What is kept of a visitor's consent. */
export interface ConsentRecord {
  at: string;
  text: string;
  ipHash: string | null;
  /** The form or the plugin it was given in. */
  source: string;
  page?: string;
}

export function consentRecord(input: {
  key: string;
  text: string;
  ip?: string | null;
  source: string;
  page?: string;
  now?: Date;
}): ConsentRecord {
  return {
    at: (input.now ?? new Date()).toISOString(),
    text: input.text.slice(0, 1000),
    ipHash: input.ip ? hashOf(input.key, 'ip', input.ip) : null,
    source: input.source,
    ...(input.page ? { page: input.page.slice(0, 300) } : {}),
  };
}

/** The labels of the custom fields a form shows, in a language. */
export function customFieldsOf(
  spec: FormSpec,
  settings: Settings,
  locale: string,
): { key: string; label: string; required: boolean }[] {
  return spec.custom
    .map((key) => settings.customFields.find((f) => f.key === key))
    .filter((f): f is CustomField => Boolean(f))
    .map((f) => ({ key: f.key, label: labelOf(f, locale), required: f.required }));
}
