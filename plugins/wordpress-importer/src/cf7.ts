/**
 * Contact Form 7 → the Forms plugin (since 1.28.0). A CF7 form is a post
 * (`wpcf7_contact_form`) whose meta hold the form's template (`_form`), its
 * mail (`_mail`, `_mail_2`) and messages (`_messages`); pages show it with
 * `[contact-form-7 id="…" title="…"]`, where the id is the post's or, since
 * CF7 5.8, the first 7 characters of its `_hash`. Forms has no stored forms:
 * every shortcode becomes a `forms/contact` block carrying the whole form
 * (fields, subject, Reply-To, thank-you message).
 */
import { newBlockId, type CxdBlock } from '@cleitext/blocks';
import { IMPORTED_BLOCK } from '@cleitext/blocks/html';

export interface Cf7Form {
  id: number;
  title: string;
  /** `_hash` (CF7 5.8+): shortcodes use its first 7 characters. */
  hash: string;
  /** The form's template (`_form`). */
  template: string;
  /** `_mail`, unserialized. */
  mail: Record<string, unknown> | null;
  /** `_mail_2` (the autoresponder), unserialized. */
  mail2: Record<string, unknown> | null;
  /** `_messages`, unserialized. */
  messages: Record<string, unknown> | null;
}

/** A field as the Forms block saves it. */
export interface FormsField {
  name: string;
  type: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  width: 'full';
  options?: string;
  min?: string;
  max?: string;
  className?: string;
  value?: string;
}

export interface ConvertedForm {
  attrs: Record<string, unknown>;
  /** What could not be carried over, for the report. */
  warnings: string[];
}

const SIMPLE: Record<string, string> = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
  range: 'number',
  date: 'date',
  textarea: 'textarea',
  select: 'select',
  checkbox: 'checkbox',
  radio: 'radio',
  acceptance: 'acceptance',
};
/** Tags with nothing to carry over: where messages appear, a counter, reCAPTCHA (the Captcha plugin protects instead). */
const SILENT = new Set(['response', 'count', 'recaptcha']);

interface Tag {
  type: string;
  required: boolean;
  name: string;
  options: string[];
  values: string[];
  /** The text enclosed by `[tag]…[/tag]` (acceptance, textarea). */
  content: string | null;
  start: number;
  end: number;
}

/** CF7's tags in a template, in order. */
export function parseTags(template: string): Tag[] {
  const tags: Tag[] = [];
  const re = /\[([a-z][a-z0-9_]*)(\*?)((?:\s+(?:"[^"]*"|'[^']*'|[^\s\]"']+))*)\s*\]/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template))) {
    const type = match[1]!.toLowerCase();
    const tokens = [...match[3]!.matchAll(/"([^"]*)"|'([^']*)'|([^\s"']+)/g)];
    const values = tokens.filter((t) => t[3] === undefined).map((t) => t[1] ?? t[2] ?? '');
    const words = tokens.filter((t) => t[3] !== undefined).map((t) => t[3]!);
    const name = type === 'submit' ? '' : (words.shift() ?? '');
    let end = match.index + match[0].length;
    let content: string | null = null;
    const close = new RegExp(`\\[\\/${type}\\]`, 'i').exec(template.slice(end));
    // Enclosing tags: acceptance's text, textarea's default value.
    if (close && (type === 'acceptance' || type === 'textarea')) {
      const between = template.slice(end, end + close.index);
      if (!/\[[a-z]/i.test(between)) {
        content = between;
        end += close.index + close[0].length;
        re.lastIndex = end;
      }
    }
    tags.push({
      type,
      required: match[2] === '*',
      name,
      options: words,
      values,
      content,
      start: match.index,
      end,
    });
  }
  return tags;
}

const BLOCK_END = /<\/(?:p|div|label|li|td|th|h[1-6]|span)>|<br\s*\/?>|\n\s*\n/gi;

/** Text of markup: tags dropped (links kept as `<a href>` when asked), spaces collapsed. */
function plain(html: string, keepLinks = false): string {
  const text = keepLinks
    ? html.replace(/<(?!\/?a[\s>])[^>]*>/gi, ' ')
    : html.replace(/<[^>]*>/g, ' ');
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Your name (required)", "Nome*", "Email:" → "Your name", "Nome", "Email". */
function cleanLabel(label: string): string {
  return label
    .replace(
      /\s*\((?:required|obbligatorio|richiesto|obligatoire|erforderlich|pflichtfeld|requerido|obligatorio)\)\s*/gi,
      ' ',
    )
    .replace(/\s*\*+\s*$/, '')
    .replace(/\s*:\s*$/, '')
    .trim();
}

/**
 * The label of a field: the text just before its tag, in the same paragraph
 * or label, or in the paragraph just before it ("<p>Extras</p>[checkbox…]").
 */
function labelBefore(template: string, from: number, to: number, reach = true): string {
  const before = template.slice(from, to);
  const pieces: string[] = [];
  let last = 0;
  for (const match of before.matchAll(BLOCK_END)) {
    const end = match.index + match[0].length;
    // A break just before the tag ("Name<br/>[text]") ends no label.
    if (/^<br/i.test(match[0]) && !plain(before.slice(end))) continue;
    pieces.push(before.slice(last, match.index));
    last = end;
  }
  pieces.push(before.slice(last));
  for (let i = pieces.length - 1; i >= (reach ? 0 : pieces.length - 1); i--) {
    const text = cleanLabel(plain(pieces[i]!));
    if (text) return text;
  }
  return '';
}

/** A field's name as Forms keeps it (letters, digits, `-` and `_`, starting with a letter). */
export function fieldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

const option = (options: string[], key: string) =>
  options.find((o) => o.startsWith(`${key}:`))?.slice(key.length + 1);

/** The options chosen by `default:1_3` (1-based). */
function chosen(options: string[], values: string[]): string {
  const raw = option(options, 'default');
  if (!raw) return '';
  return raw
    .split('_')
    .map((n) => values[Number(n) - 1])
    .filter((v): v is string => v !== undefined)
    .join('\n');
}

/** Options of a menu, checkboxes or radio buttons, one per line, as Forms reads them. */
const optionLines = (values: string[]) =>
  values.map((v) => (v.includes('|') ? `${v.split('|')[1]}|${v.split('|')[0]}` : v)).join('\n');

/** The mail's `[tags]` as Forms' `{tags}`: fields by name, the site's title as text. */
function mailTemplate(template: string, names: Set<string>, siteTitle: string): string {
  return template
    .replace(/\[_site_title\]/g, siteTitle)
    .replace(/\[_(?:raw_)?([a-z][\w-]*)\]/gi, (whole, name: string) =>
      names.has(fieldName(name)) ? `{${fieldName(name)}}` : '',
    )
    .replace(/\[([a-z][\w-]*)\]/gi, (whole, name: string) =>
      names.has(fieldName(name)) ? `{${fieldName(name)}}` : '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** A CF7 form as the attributes of a Forms block. */
export function convertCf7(form: Cf7Form, siteTitle = ''): ConvertedForm {
  const warnings: string[] = [];
  const fields: FormsField[] = [];
  let buttonLabel = '';
  const tags = parseTags(form.template);
  let previous = 0;
  for (const tag of tags) {
    const from = previous;
    previous = tag.end;
    if (tag.type === 'submit') {
      buttonLabel = tag.values[0] ?? '';
      continue;
    }
    if (SILENT.has(tag.type)) continue;
    const type = SIMPLE[tag.type];
    if (!type) {
      warnings.push(
        tag.type === 'quiz'
          ? `the quiz "${tag.name}" was left out (the Captcha plugin protects the form instead)`
          : tag.type === 'file'
            ? `the file upload "${tag.name}" was left out (Forms has no uploads)`
            : `the field [${tag.type}${tag.name ? ` ${tag.name}` : ''}] has no equivalent and was left out`,
      );
      continue;
    }
    const name = fieldName(tag.name) || `field-${fields.length + 1}`;
    const placeholder = tag.options.includes('placeholder') || tag.options.includes('watermark');
    // Fields with a placeholder take no heading from a paragraph above as their label.
    const label = labelBefore(form.template, from, tag.start, !placeholder);
    const field: FormsField = { name, type, label, width: 'full' };
    if (tag.required) field.required = true;
    const classes = tag.options
      .filter((o) => o.startsWith('class:'))
      .map((o) => o.slice(6))
      .join(' ');
    if (classes) field.className = classes;
    switch (tag.type) {
      case 'select':
      case 'checkbox':
      case 'radio': {
        let values = tag.values;
        if (tag.type === 'select' && tag.options.includes('first_as_label') && values.length > 1) {
          field.placeholder = values[0]!;
          values = values.slice(1);
        }
        if (tag.type === 'select' && tag.options.includes('multiple')) {
          field.type = 'checkbox';
          warnings.push(`the menu "${tag.name}" with several choices became checkboxes`);
        }
        field.options = optionLines(values);
        const value = chosen(tag.options, values);
        if (value) {
          field.value = value
            .split('\n')
            .map((v) => (v.includes('|') ? v.split('|')[1]! : v))
            .join('\n');
        }
        break;
      }
      case 'acceptance': {
        const text = plain(tag.content ?? '', true) || label;
        field.label = text;
        // Forms' consents are required; an optional one is a checkbox.
        if (tag.options.includes('optional')) field.type = 'checkbox';
        else field.required = true;
        break;
      }
      case 'textarea': {
        const value = tag.content?.trim() || tag.values[0] || '';
        if (value && placeholder) field.placeholder = value;
        else if (value) field.value = value;
        break;
      }
      default: {
        const value = tag.values[0] ?? '';
        if (value && placeholder) field.placeholder = value;
        else if (value) field.value = value;
        const min = option(tag.options, 'min');
        const max = option(tag.options, 'max');
        if (min && (type === 'number' || type === 'date')) field.min = min;
        if (max && (type === 'number' || type === 'date')) field.max = max;
      }
    }
    // A field without a label shows its placeholder; without either, its name.
    if (!field.label && !field.placeholder && type !== 'acceptance') field.label = tag.name;
    fields.push(field);
  }

  const names = new Set(fields.map((f) => f.name));
  const attrs: Record<string, unknown> = {
    formName: form.title.slice(0, 80) || 'Contact',
    buttonLabel: (buttonLabel || 'Send').slice(0, 40),
    fields,
    // The consent beside the button, as most CF7 forms show it.
    ...(fields.at(-1)?.type === 'acceptance' ? { submitInline: true } : {}),
  };
  const mail = form.mail ?? {};
  const subject = mailTemplate(str(mail.subject), names, siteTitle);
  if (subject) attrs.subject = subject.slice(0, 200);
  const replyTo = /^reply-to:\s*\[_?(?:raw_)?([\w-]+)\]/im.exec(str(mail.additional_headers));
  const replyName = replyTo ? fieldName(replyTo[1]!) : '';
  if (replyName && names.has(replyName)) attrs.replyTo = replyName;
  const thanks = str(form.messages?.mail_sent_ok).trim();
  if (thanks) attrs.successMessage = thanks.slice(0, 300);
  const recipient = str(mail.recipient).trim();
  if (recipient && !/^\[_site_admin_email\]$/.test(recipient)) {
    warnings.push(
      `its messages went to ${recipient}: Forms sends every form to the address in Settings → Forms`,
    );
  }
  if (form.mail2 && (form.mail2.active === true || form.mail2.active === '1')) {
    warnings.push('its autoresponder (Mail (2)) was left out: Forms sends no reply to visitors');
  }
  return { attrs, warnings };
}

/** The `forms/contact` block of a converted form. */
export function formsBlock(attrs: Record<string, unknown>): CxdBlock {
  return { id: newBlockId(), type: 'forms/contact', v: 1, attrs: structuredClone(attrs) };
}

export interface Cf7Lookup {
  /** The form a shortcode names (by id, hash or title), in the entry's language when translated. */
  find(attrs: Record<string, string>, locale: string): Cf7Form | undefined;
  /** The block attributes of a form, converted once. */
  convert(form: Cf7Form): ConvertedForm;
}

/**
 * The CF7 shortcodes standing alone (placeholders of the conversion) become
 * Forms blocks; a page builder's placeholder keeps its wrapper. Returns how
 * many, and the shortcodes whose form is not in the export.
 */
export function replaceCf7Shortcodes(
  blocks: CxdBlock[],
  locale: string,
  lookup: Cf7Lookup,
): { blocks: CxdBlock[]; converted: number; missing: string[] } {
  let converted = 0;
  const missing: string[] = [];
  const walk = (list: CxdBlock[]): CxdBlock[] =>
    list.map((block) => {
      if (block.type === IMPORTED_BLOCK) {
        const shortcode = block.attrs.shortcode as
          { tag?: unknown; attrs?: Record<string, string>; text?: unknown } | undefined;
        const tag = typeof shortcode?.tag === 'string' ? shortcode.tag.toLowerCase() : '';
        if (tag === 'contact-form-7' || tag === 'contact-form') {
          const form = lookup.find(shortcode?.attrs ?? {}, locale);
          if (!form) {
            missing.push(String(shortcode?.text ?? tag));
            return block;
          }
          converted++;
          const inner = formsBlock(lookup.convert(form).attrs);
          const wrap = block.attrs.wrap as
            { type?: unknown; v?: unknown; attrs?: Record<string, unknown> } | undefined;
          return typeof wrap?.type === 'string'
            ? {
                id: newBlockId(),
                type: wrap.type,
                v: typeof wrap.v === 'number' ? wrap.v : 1,
                attrs: { ...(wrap.attrs ?? {}) },
                children: [inner],
              }
            : inner;
        }
      }
      return block.children ? { ...block, children: walk(block.children) } : block;
    });
  return { blocks: walk(blocks), converted, missing };
}
