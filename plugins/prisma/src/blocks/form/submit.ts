import type { CxdBlock } from '@cleitext/plugin-sdk';
import type { Attrs } from '../../lib/types';
import { CALLING_CODES, COUNTRIES } from './countries';
import {
  blockIdOf,
  dateBound,
  EMAIL_RE,
  emailList,
  fieldOf,
  optionsOf,
  plainText,
  type FieldKind,
} from './schema';
import { MIN_FILL_MS } from './token';

/**
 * What the server does with a message, as pure functions (tested on their
 * own): find the form in the saved page, check the values against its
 * fields, decide whether it is spam, write the email.
 */

/** A field of the saved form. */
export interface FormField {
  /** The block's id: the name of its inputs. */
  id: string;
  kind: FieldKind;
  label: string;
  required: boolean;
  attrs: Attrs;
}

/** The form with this id in a page's blocks (at any depth), or null. */
export function findForm(blocks: unknown, formId: string): CxdBlock | null {
  if (!Array.isArray(blocks)) return null;
  for (const block of blocks as CxdBlock[]) {
    if (!block || typeof block !== 'object') continue;
    const attrs = (block.attrs ?? {}) as Attrs;
    if (block.type === 'prisma/form' && blockIdOf(attrs, block.id) === formId) return block;
    const found = findForm(block.children, formId);
    if (found) return found;
  }
  return null;
}

/** The fields of a form, in their order. */
export function formFields(form: CxdBlock): FormField[] {
  const out: FormField[] = [];
  const walk = (blocks: CxdBlock[] | undefined) => {
    for (const block of blocks ?? []) {
      const spec = fieldOf(block.type);
      if (!spec) {
        walk(block.children);
        continue;
      }
      const attrs = (block.attrs ?? {}) as Attrs;
      out.push({
        id: blockIdOf(attrs, block.id),
        kind: spec.kind,
        label: plainText(attrs[spec.label] ?? '') || spec.fallback,
        // A field keeps its defaults unsaved: `required` is off unless saved on.
        required: spec.required ? attrs[spec.required] === true : false,
        attrs,
      });
    }
  };
  walk(form.children);
  return out;
}

/** The values sent under a name (a form body gives a string or a list of them). */
export function valuesOf(body: Record<string, unknown>, name: string): string[] {
  const raw = Object.prototype.hasOwnProperty.call(body, name) ? body[name] : undefined;
  const list = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  return list
    .filter((v): v is string | number | boolean =>
      ['string', 'number', 'boolean'].includes(typeof v),
    )
    .map((v) => String(v));
}

const clip = (s: string, max: number) => s.trim().slice(0, max);
const MAX_TEXT = 500;
const MAX_MESSAGE = 10_000;

export interface Checked {
  /** Label and value of each field, in order (empty optional fields included). */
  entries: { label: string; value: string }[];
  /** Messages by field id. */
  errors: Record<string, string>;
  /** The first email address given: the email's reply-to. */
  replyTo: string | null;
}

export const MESSAGES = {
  required: 'This field is required.',
  email: 'Enter a valid email address.',
  url: 'Enter a valid web address.',
  phone: 'Enter a valid phone number.',
  date: 'Enter a valid date.',
  range: 'Choose a date in the allowed range.',
  choice: 'Choose one of the options.',
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * The values of a message checked against the saved fields: what the
 * browser checks (required, email, address, date range, choices) is
 * checked again here, since a request can skip it.
 */
export function checkValues(fields: FormField[], body: Record<string, unknown>): Checked {
  const entries: Checked['entries'] = [];
  const errors: Record<string, string> = {};
  let replyTo: string | null = null;
  for (const f of fields) {
    const sent = valuesOf(body, f.id).map((v) =>
      clip(v, f.kind === 'textarea' ? MAX_MESSAGE : MAX_TEXT),
    );
    const first = sent.find((v) => v !== '') ?? '';
    let value = first;
    let error: string | null = null;
    switch (f.kind) {
      case 'email':
        if (first && !EMAIL_RE.test(first)) error = MESSAGES.email;
        else if (first) replyTo ??= first;
        break;
      case 'url':
        if (first) {
          try {
            const url = new URL(first);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') error = MESSAGES.url;
          } catch {
            error = MESSAGES.url;
          }
        }
        break;
      case 'phone': {
        // The country menu comes first, then the number.
        const [country = '', number = ''] = sent;
        const code =
          COUNTRIES.find((c) => c.iso === country)?.code ??
          (CALLING_CODES.has(country) ? country : '');
        value = number ? `${code} ${number}`.trim() : '';
        if (number && !/^[0-9+()\-.\s]{3,30}$/.test(number)) error = MESSAGES.phone;
        break;
      }
      case 'date': {
        if (first && !validDate(first)) error = MESSAGES.date;
        else if (first) {
          const min = dateBound(f.attrs, 'min');
          const max = dateBound(f.attrs, 'max');
          if ((min && first < min) || (max && first > max)) error = MESSAGES.range;
        }
        break;
      }
      case 'select':
      case 'radio': {
        const allowed = optionsOf(f.attrs).map((o) => o.optionvalue);
        if (first && !allowed.includes(first)) error = MESSAGES.choice;
        break;
      }
      case 'checkbox': {
        const allowed = new Set(optionsOf(f.attrs).map((o) => o.optionvalue));
        const chosen = [...new Set(sent.filter((v) => v !== ''))];
        if (chosen.some((v) => !allowed.has(v))) error = MESSAGES.choice;
        value = chosen.join(', ');
        break;
      }
      case 'toggle': {
        const on = String(f.attrs.trueValue ?? 'on');
        const off = String(f.attrs.falseValue ?? 'off');
        // The hidden "off" value is always sent; the checkbox adds "on" when checked.
        const checked = sent.includes(on) && sent.length > 0 && sent[sent.length - 1] === on;
        value = checked ? on : off;
        if (f.required && !checked) error = MESSAGES.required;
        break;
      }
      case 'accept':
        value = first ? 'Agree' : '';
        break;
      case 'hidden':
        // The saved value, never the one sent.
        value = String(f.attrs.hidden_field_value ?? '');
        break;
      case 'upload':
        // Files are not kept: their names only (the browser sends names without JavaScript too).
        value = sent
          .filter(Boolean)
          .map((name) => name.replace(/^.*[\\/]/, ''))
          .join(', ');
        break;
      default:
        break;
    }
    if (!error && f.required && f.kind !== 'toggle' && value === '') error = MESSAGES.required;
    if (error) errors[f.id] = error;
    entries.push({ label: f.label, value });
  }
  return { entries, errors, replyTo };
}

export type SpamVerdict = 'ok' | 'bot' | 'quick';

/**
 * Spam checks without a third party: the hidden field people leave empty,
 * and the time between drawing the form and sending it (its signed token;
 * with JavaScript, also the time the page measured).
 */
export function spamVerdict(input: {
  honeypot: string;
  drawnAt: number | null;
  now: number;
  elapsed?: string;
}): SpamVerdict {
  if (input.honeypot.trim() !== '') return 'bot';
  if (input.drawnAt === null || input.now - input.drawnAt < MIN_FILL_MS) return 'quick';
  if (input.elapsed !== undefined && input.elapsed !== '') {
    const ms = Number(input.elapsed);
    if (!Number.isFinite(ms) || ms < MIN_FILL_MS) return 'quick';
  }
  return 'ok';
}

/** Who receives the message: the form's addresses, else the site's default one. */
export function recipientsOf(
  attrs: Attrs,
  fallback: unknown,
): { to: string[]; cc: string[]; bcc: string[] } {
  const own = emailList(attrs.afterSubmitToEmail);
  const to = own.length ? own : emailList(fallback);
  const seen = new Set(to.map((e) => e.toLowerCase()));
  const unique = (list: string[]) =>
    list.filter((e) => {
      const key = e.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const cc = unique(emailList(attrs.afterSubmitCcEmail));
  const bcc = unique(emailList(attrs.afterSubmitBccEmail));
  return { to, cc, bcc };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The email: subject, plain text and HTML, one field per paragraph. */
export function composeEmail(input: {
  subject: unknown;
  entries: Checked['entries'];
  siteName: string;
  pageUrl: string;
}): { subject: string; text: string; html: string } {
  const subject =
    (typeof input.subject === 'string' ? input.subject : '')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 200) || 'Form Submission';
  const footer = `Sent from a form of ${input.siteName}${input.pageUrl ? ` (${input.pageUrl})` : ''}.`;
  const text = [
    ...input.entries.map((e) =>
      e.value.includes('\n') ? `${e.label}:\n${e.value}\n` : `${e.label}: ${e.value}`,
    ),
    '',
    '--',
    footer,
  ].join('\n');
  const html =
    `<div style="border:40px solid #f6f6f6;padding:15px;font-family:sans-serif">` +
    input.entries
      .map(
        (e) =>
          `<p><strong>${escapeHtml(e.label)}</strong><br>${escapeHtml(e.value).replace(/\n/g, '<br>')}</p>`,
      )
      .join('') +
    `<p style="text-align:center;color:#666;font-size:12px">${escapeHtml(footer)}</p></div>`;
  return { subject, text, html };
}

/** Same-site path of the page the form was sent from (for the answer without JavaScript). */
export function returnPath(referer: string | undefined, origin: string): string {
  try {
    const url = new URL(referer ?? '');
    if (url.origin === new URL(origin).origin) return `${url.pathname}${url.search}`;
  } catch {
    // no referer
  }
  return '/';
}
