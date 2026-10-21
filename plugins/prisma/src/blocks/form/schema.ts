import type { Attrs } from '../../lib/types';

/**
 * What the form's fields are, shared by the blocks (src/blocks/form/fields.tsx)
 * and the server that receives the messages (route.ts): which attribute
 * holds a field's label and which one makes it required.
 */

export type FieldKind =
  | 'name'
  | 'email'
  | 'phone'
  | 'textarea'
  | 'url'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'toggle'
  | 'date'
  | 'hidden'
  | 'upload'
  | 'accept';

export interface FieldSpec {
  kind: FieldKind;
  /** The attribute with the label (rich text, except the acceptance text). */
  label: string;
  /** The attribute that makes it required (none for hidden fields). */
  required?: string;
  /** The label when the field has none. */
  fallback: string;
}

export const FIELDS: Record<FieldKind, FieldSpec> = {
  name: { kind: 'name', label: 'name', required: 'nameRequired', fallback: 'Name' },
  email: { kind: 'email', label: 'name', required: 'required', fallback: 'Email' },
  phone: { kind: 'phone', label: 'phoneName', required: 'phoneRequired', fallback: 'Phone' },
  textarea: {
    kind: 'textarea',
    label: 'textareaName',
    required: 'textareaRequired',
    fallback: 'Message',
  },
  url: { kind: 'url', label: 'name', required: 'required', fallback: 'URL' },
  select: { kind: 'select', label: 'selectName', required: 'selectRequired', fallback: 'Select' },
  radio: { kind: 'radio', label: 'radioName', required: 'radioRequired', fallback: 'Radio' },
  checkbox: {
    kind: 'checkbox',
    label: 'checkboxName',
    required: 'checkboxRequired',
    fallback: 'Checkbox',
  },
  toggle: { kind: 'toggle', label: 'name', required: 'toggleRequired', fallback: 'Toggle' },
  date: { kind: 'date', label: 'name', required: 'dateRequired', fallback: 'Date' },
  hidden: { kind: 'hidden', label: 'hidden_field_name', fallback: 'Hidden' },
  upload: { kind: 'upload', label: 'name', required: 'required', fallback: 'Upload' },
  accept: { kind: 'accept', label: 'acceptText', required: 'acceptRequired', fallback: 'Accept' },
};

/** `prisma/form-email` → the email field. */
export function fieldOf(type: string): FieldSpec | null {
  const match = /^prisma\/form-([a-z]+)$/.exec(type);
  return match && match[1]! in FIELDS ? FIELDS[match[1] as FieldKind] : null;
}

/** The form's address on the site (a public route of the plugin). */
export const SUBMIT_PATH = '/_prisma/form';

/** The forms' id for the site's bot protection (`ctx.forms`, plugin API 1.38). */
export const SITE_CAPTCHA_FORM = 'prisma/form';

/**
 * Which spam check a form uses: its own reCAPTCHA when both keys are set
 * (in Settings → Prisma or, as in Spectra, in the form), none that can pass
 * with only one of them, or the site's captcha (the Captcha plugin) when
 * the form chooses it or has no keys of its own.
 */
export function captchaMode(a: Attrs, settings: Attrs): 'own' | 'broken' | 'site' {
  if (a.reCaptchaEnable && a.reCaptchaType !== 'site') {
    const v = a.reCaptchaType === 'v3' ? 'V3' : 'V2';
    const site = String(settings[`recaptchaSiteKey${v}`] || a[`reCaptchaSiteKey${v}`] || '').trim();
    const secret = String(
      settings[`recaptchaSecretKey${v}`] || a[`reCaptchaSecretKey${v}`] || '',
    ).trim();
    if (site && secret) return 'own';
    if (site || secret) return 'broken';
  }
  return 'site';
}

/** A label as plain text: rich text nodes, or HTML. */
export function plainText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((node: unknown) => {
        if (!node || typeof node !== 'object') return '';
        const n = node as { text?: unknown; children?: unknown };
        return typeof n.text === 'string' ? n.text : plainText(n.children);
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (typeof value !== 'string') return '';
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A choice of a select, radio or checkbox field. */
export interface Option {
  optiontitle: string;
  optionvalue: string;
}

/** The choices of a field, as saved. */
export function optionsOf(a: Attrs): Option[] {
  if (!Array.isArray(a.options)) return [];
  return (a.options as unknown[])
    .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === 'object')
    .map((o) => ({
      optiontitle: typeof o.optiontitle === 'string' ? o.optiontitle : String(o.optiontitle ?? ''),
      optionvalue: typeof o.optionvalue === 'string' ? o.optionvalue : String(o.optionvalue ?? ''),
    }));
}

/** `min`/`max` of a date field with a range (`YYYY-MM-DD`), or ''. */
export function dateBound(a: Attrs, which: 'min' | 'max'): string {
  if (!a.additonalVal) return '';
  const y = String(a[`${which}Year`] ?? '');
  const m = String(a[`${which}Month`] ?? '');
  const d = String(a[`${which}Day`] ?? '');
  return /^\d{4}$/.test(y) && /^\d{2}$/.test(m) && /^\d{2}$/.test(d) ? `${y}-${m}-${d}` : '';
}

/** The id of a block in its class and in its fields' names (as the server draws it). */
export function blockIdOf(attrs: Attrs, fallback: string): string {
  return typeof attrs.blockId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(attrs.blockId)
    ? attrs.blockId
    : fallback;
}

/** Comma-separated addresses → the valid ones. */
export function emailList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => EMAIL_RE.test(s));
}

export const EMAIL_RE = /^[^\s@,;<>"]{1,64}@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;

/**
 * Where to go after a message: an https address or a path of the site
 * (anything else, e.g. `javascript:`, is ignored).
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (/^\/(?!\/)[^\s]*$/.test(url)) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname ? parsed.href : '';
  } catch {
    return '';
  }
}
