/**
 * Custom fields of the contact form (Forms 1.3.0), as pure functions tested
 * on their own: the fields saved in the block made safe to render, the
 * signed copy the form carries to the server, the check of a message
 * against them, its subject and its text.
 */

export const FIELD_TYPES = [
  'text',
  'email',
  'tel',
  'number',
  'date',
  'textarea',
  'select',
  'checkbox',
  'radio',
  'acceptance',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_WIDTHS = ['full', '1/2', '1/3', '1/4', '1/6'] as const;
export type FieldWidth = (typeof FIELD_WIDTHS)[number];

/** A field as saved in the block's `fields` attribute (any value may be missing). */
export interface SavedField {
  name?: unknown;
  type?: unknown;
  label?: unknown;
  placeholder?: unknown;
  required?: unknown;
  width?: unknown;
  options?: unknown;
  min?: unknown;
  max?: unknown;
  className?: unknown;
}

export interface FieldOption {
  value: string;
  label: string;
}

/** A field ready to render and to check messages against. */
export interface FormField {
  /** The input's name: letters, digits, `-` and `_`. */
  name: string;
  type: FieldType;
  label: string;
  placeholder: string;
  required: boolean;
  width: FieldWidth;
  options: FieldOption[];
  /** Bounds of numbers and dates (`YYYY-MM-DD`), when set. */
  min?: string;
  max?: string;
  className: string;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[a-z][a-z0-9_-]{0,39}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_RE = /^-?\d{1,15}(\.\d{1,6})?$/;
const TEL_RE = /^[0-9+()\-./\s]{3,40}$/;
/** Names the form itself uses: the honeypot and the hidden fields. */
const RESERVED = new Set(['website']);
const MAX_FIELDS = 30;

/** Longest value kept per type. */
export const MAX_LENGTH: Record<FieldType, number> = {
  text: 200,
  email: 200,
  tel: 40,
  number: 30,
  date: 10,
  textarea: 5000,
  select: 200,
  checkbox: 1000,
  radio: 200,
  acceptance: 10,
};

const str = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * The options of a select, checkboxes or radio buttons: one per line, as
 * `value|label` or just the text (used for both), as Contact Form 7 lists them.
 */
export function parseOptions(value: unknown): FieldOption[] {
  const lines = typeof value === 'string' ? value.split(/\r?\n/) : [];
  const out: FieldOption[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const [rawValue = '', ...rest] = line.split('|');
    const optionValue = rawValue.trim().slice(0, 200);
    const label = rest.join('|').trim().slice(0, 200) || optionValue;
    if (!optionValue || seen.has(optionValue)) continue;
    seen.add(optionValue);
    out.push({ value: optionValue, label });
    if (out.length >= 100) break;
  }
  return out;
}

function bound(type: FieldType, value: unknown): string | undefined {
  const text = typeof value === 'number' ? String(value) : str(value, 20);
  if (!text) return undefined;
  if (type === 'number') return NUMBER_RE.test(text) ? text : undefined;
  if (type === 'date') return validDate(text) ? text : undefined;
  return undefined;
}

/** Extra classes typed by the editor: class names only. */
function classNames(value: unknown): string {
  return str(value, 200)
    .split(/\s+/)
    .filter((c) => /^-?[A-Za-z_][\w-]{0,60}$/.test(c))
    .slice(0, 8)
    .join(' ');
}

function nameOf(value: unknown, index: number): string {
  const name = str(value, 60)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return NAME_RE.test(name) ? name : `field-${index + 1}`;
}

/**
 * The block's fields made safe: known types and widths, valid unique names,
 * options parsed, bounds checked. Fields that cannot work (a select without
 * options) are left out.
 */
export function normalizeFields(saved: unknown): FormField[] {
  if (!Array.isArray(saved)) return [];
  const out: FormField[] = [];
  const names = new Set<string>();
  for (const [index, raw] of saved.slice(0, MAX_FIELDS).entries()) {
    if (!raw || typeof raw !== 'object') continue;
    const field = raw as SavedField;
    const type = (FIELD_TYPES as readonly unknown[]).includes(field.type)
      ? (field.type as FieldType)
      : 'text';
    const options = parseOptions(field.options);
    if ((type === 'select' || type === 'radio') && options.length === 0) continue;
    let name = nameOf(field.name, index);
    for (let n = 2; names.has(name) || RESERVED.has(name); n++) {
      name = `${nameOf(field.name, index).slice(0, 36)}-${n}`;
    }
    names.add(name);
    const min = bound(type, field.min);
    const max = bound(type, field.max);
    out.push({
      name,
      type,
      label: str(field.label, 500),
      placeholder: str(field.placeholder, 200),
      // A consent is always required.
      required: type === 'acceptance' || field.required === true,
      width: (FIELD_WIDTHS as readonly unknown[]).includes(field.width)
        ? (field.width as FieldWidth)
        : 'full',
      options: type === 'select' || type === 'radio' || type === 'checkbox' ? options : [],
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      className: classNames(field.className),
    });
  }
  return out;
}

/** The name a field is shown with in emails and in the admin. */
export function fieldTitle(field: FormField): string {
  return labelText(field.label) || field.placeholder || field.name;
}

/** A part of a label: text, or a link. */
export type LabelPart = { text: string } | { text: string; href: string };

const LINK_RE =
  /\[([^\]]{1,200})\]\(([^)\s]{1,500})\)|<a\s+[^>]*?href\s*=\s*["']([^"']{1,500})["'][^>]*>(.{1,200}?)<\/a>/gi;

/** A safe link target: a path of the site or an http(s) address. */
export function safeHref(href: string): string | null {
  return /^(\/(?!\/)|https?:\/\/|#)/i.test(href) && !/[<>"\s]/.test(href) ? href : null;
}

/**
 * A label with its links (a consent's "I accept the [privacy policy](/privacy)"
 * or, from Contact Form 7, `<a href="/privacy">privacy policy</a>`): other
 * markup is kept as text.
 */
export function labelParts(label: string): LabelPart[] {
  const parts: LabelPart[] = [];
  let last = 0;
  for (const match of label.matchAll(LINK_RE)) {
    const text = (match[1] ?? match[4] ?? '').replace(/<[^>]*>/g, '');
    const href = safeHref((match[2] ?? match[3] ?? '').replace(/&amp;/g, '&'));
    if (match.index > last) parts.push({ text: label.slice(last, match.index) });
    parts.push(href ? { text, href } : { text });
    last = match.index + match[0].length;
  }
  if (last < label.length) parts.push({ text: label.slice(last) });
  return parts;
}

/** A label as plain text (links become their text). */
export function labelText(label: string): string {
  return labelParts(label)
    .map((p) => p.text)
    .join('')
    .trim();
}

/** The block's settings the server needs, carried by the form with a signature. */
export interface FormSpec {
  /** The form's name. */
  form: string;
  fields: FormField[];
  /** Subject template (`{form}`, `{field-name}`); empty for the default. */
  subject: string;
  /** The field whose address is the email's Reply-To. */
  replyTo: string | null;
}

/** The field used as Reply-To: the one chosen if it is an email field, else the first. */
export function replyToField(fields: FormField[], chosen: unknown): string | null {
  const emails = fields.filter((f) => f.type === 'email');
  const wanted = typeof chosen === 'string' ? chosen.trim().toLowerCase() : '';
  return (emails.find((f) => f.name === wanted) ?? emails[0])?.name ?? null;
}

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The longest signed spec accepted back. */
export const MAX_SPEC = 32_000;

async function mac(key: CryptoKey, payload: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

/** An HMAC key from the site's secret. */
export function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(raw),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** `<spec>.<signature>`, for a hidden field of the form. */
export async function signSpec(key: CryptoKey, spec: FormSpec): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(spec)));
  return `${payload}.${await mac(key, payload)}`;
}

/** The spec carried by a form, or null when it is missing, too long or forged. */
export async function readSpec(key: CryptoKey, token: unknown): Promise<FormSpec | null> {
  if (typeof token !== 'string' || token.length > MAX_SPEC) return null;
  const match = /^([\w-]+)\.([\w-]{43})$/.exec(token);
  if (!match || (await mac(key, match[1]!)) !== match[2]) return null;
  const bytes = fromBase64Url(match[1]!);
  if (!bytes) return null;
  try {
    const spec = JSON.parse(new TextDecoder().decode(bytes)) as FormSpec;
    // Signed by this site, so made by normalizeFields: checked again all the same.
    return {
      form: str(spec.form, 80) || 'Contact',
      fields: normalizeFields(spec.fields),
      subject: str(spec.subject, 200),
      replyTo: typeof spec.replyTo === 'string' ? spec.replyTo : null,
    };
  } catch {
    return null;
  }
}

/** The values sent under a name (a form body gives a string or a list of them). */
export function valuesOf(body: Record<string, unknown>, name: string): string[] {
  const raw = Object.prototype.hasOwnProperty.call(body, name) ? body[name] : undefined;
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  return list
    .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v))
    .slice(0, 100);
}

/** A field's value in a stored message. */
export interface FieldValue {
  name: string;
  label: string;
  type: FieldType;
  value: string;
}

export interface Checked {
  /** Every field, in order, empty optional ones included. */
  values: FieldValue[];
  /** The names of the fields that are not valid. */
  invalid: string[];
}

/** Text of a yes for a checkbox or a consent, in the form's language. */
export const YES = { en: 'Yes', it: 'Sì' };

/**
 * A message checked against the form's fields: what the browser checks
 * (required, email, number and date ranges, options) is checked again here,
 * since a request can skip it. Values are trimmed and capped; fields the
 * form does not have are ignored.
 */
export function checkValues(
  fields: FormField[],
  body: Record<string, unknown>,
  locale = 'en',
): Checked {
  const yes = locale.startsWith('it') ? YES.it : YES.en;
  const values: FieldValue[] = [];
  const invalid: string[] = [];
  for (const field of fields) {
    const max = MAX_LENGTH[field.type];
    const sent = valuesOf(body, field.name).map((v) =>
      field.type === 'textarea'
        ? v.replace(/\r\n/g, '\n').trim().slice(0, max)
        : v.replace(/\s+/g, ' ').trim().slice(0, max),
    );
    const first = sent.find((v) => v !== '') ?? '';
    let value = first;
    let ok = true;
    switch (field.type) {
      case 'email':
        value = first.toLowerCase();
        if (value && !EMAIL_RE.test(value)) ok = false;
        break;
      case 'tel':
        if (first && !TEL_RE.test(first)) ok = false;
        break;
      case 'number': {
        if (!first) break;
        const n = Number(first.replace(',', '.'));
        if (!NUMBER_RE.test(first.replace(',', '.')) || !Number.isFinite(n)) ok = false;
        else if (field.min !== undefined && n < Number(field.min)) ok = false;
        else if (field.max !== undefined && n > Number(field.max)) ok = false;
        else value = String(n);
        break;
      }
      case 'date':
        if (!first) break;
        if (!validDate(first)) ok = false;
        else if (field.min !== undefined && first < field.min) ok = false;
        else if (field.max !== undefined && first > field.max) ok = false;
        break;
      case 'select':
      case 'radio': {
        const option = field.options.find((o) => o.value === first);
        if (first && !option) ok = false;
        break;
      }
      case 'checkbox':
        if (field.options.length > 0) {
          const allowed = new Set(field.options.map((o) => o.value));
          const chosen = [...new Set(sent.filter((v) => v !== ''))];
          if (chosen.some((v) => !allowed.has(v))) ok = false;
          value = chosen.join(', ');
        } else {
          value = first ? yes : '';
        }
        break;
      case 'acceptance':
        value = first ? yes : '';
        break;
      default:
        break;
    }
    if (ok && field.required && value === '') ok = false;
    if (!ok) invalid.push(field.name);
    values.push({ name: field.name, label: fieldTitle(field), type: field.type, value });
  }
  return { values, invalid };
}

/** One line of a subject: no line breaks, capped. */
const oneLine = (text: string, max = 200) => text.replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * The email's subject: the template with `{form}` and `{field-name}`
 * replaced, or `[form] name` as the classic form has it.
 */
export function subjectOf(template: string, form: string, values: FieldValue[]): string {
  if (!template.trim()) {
    const name =
      values.find((v) => v.name === 'name' || v.name === 'your-name')?.value ??
      values.find((v) => v.type === 'text' && v.value)?.value ??
      '';
    return oneLine(`[${form}] ${name}`);
  }
  const byName = new Map(values.map((v) => [v.name, v.value]));
  return oneLine(
    template.replace(/\{([a-z][a-z0-9_-]{0,39})\}/gi, (whole, key: string) =>
      key === 'form' ? form : (byName.get(key.toLowerCase()) ?? whole),
    ),
  );
}

/** The email's text: every field with its label, in the form's order. */
export function messageText(values: FieldValue[], page: string, locale = 'en'): string {
  const it = locale.startsWith('it');
  const lines: string[] = [];
  for (const v of values) {
    const value = v.value || '—';
    lines.push(v.type === 'textarea' ? `${v.label}:\n${value}\n` : `${v.label}: ${value}`);
  }
  lines.push('', `${it ? 'Pagina' : 'Page'}: ${page}`);
  return lines.join('\n');
}

/** CSS class of a width: `cf-w-1-2`. */
export const widthClass = (width: FieldWidth) => `cf-w-${width.replace('/', '-')}`;

/**
 * The grid of the custom fields: twelve columns on desktop, wider fields on
 * tablets (halves and thirds), one column on phones.
 */
export const GRID_CSS =
  `.contact-form .cf-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:.75rem;max-width:none}` +
  `.contact-form .cf-grid>*{grid-column:1/-1;min-width:0}` +
  `.contact-form .cf-field input:not([type=checkbox]):not([type=radio]),.contact-form .cf-field select,.contact-form .cf-field textarea{width:100%;box-sizing:border-box}` +
  `.contact-form fieldset.cf-field{border:0;margin:0;padding:0;display:grid;gap:.25rem}` +
  `.contact-form .cf-choice,.contact-form .cf-acceptance{display:flex;gap:.5rem;align-items:flex-start}` +
  `.contact-form .cf-submit-row{display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;align-items:center;justify-content:space-between}` +
  `@media (min-width:600px){.contact-form .cf-grid>.cf-w-1-2,.contact-form .cf-grid>.cf-w-1-3,.contact-form .cf-grid>.cf-w-1-4{grid-column:span 6}.contact-form .cf-grid>.cf-w-1-6{grid-column:span 4}}` +
  `@media (min-width:1024px){.contact-form .cf-grid>.cf-w-1-3{grid-column:span 4}.contact-form .cf-grid>.cf-w-1-4{grid-column:span 3}.contact-form .cf-grid>.cf-w-1-6{grid-column:span 2}}`;
