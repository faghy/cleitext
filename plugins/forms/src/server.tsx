import { defineBlock, definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import { asc, desc, eq } from 'drizzle-orm';
import type { ReactNode } from 'react';
import {
  checkValues,
  EMAIL_RE,
  FIELD_TYPES,
  FIELD_WIDTHS,
  GRID_CSS,
  importKey,
  labelParts,
  messageText,
  normalizeFields,
  readSpec,
  replyToField,
  signSpec,
  subjectOf,
  widthClass,
  type FieldValue,
  type FormField,
  type SavedField,
} from './fields';
import { submissions, type Submission } from './schema';

const SUBMIT_PATH = '/_forms/submit';
/** At most this many messages per address and site in the window. */
const RATE_LIMIT = { max: 5, windowMs: 10 * 60_000 };

interface FormAttrs {
  formName: string;
  buttonLabel: string;
  askPhone?: boolean;
  successMessage: string;
  privacyUrl?: string;
  /** Custom fields (1.3.0): when empty, the classic name, email and message. */
  fields?: SavedField[];
  /** Subject template with `{form}` and `{field-name}`. */
  subject?: string;
  /** The email field used as Reply-To (default: the first). */
  replyTo?: string;
  /** The consent and the button on one row. */
  submitInline?: boolean;
}

/** What a message keeps and sends. */
interface Message {
  formName: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  /** Every field of a custom form, in order. */
  data: FieldValue[] | null;
  replyTo: string | null;
  subject: string;
  text: string;
}

const TYPE_LABELS: Record<(typeof FIELD_TYPES)[number], { en: string; it: string }> = {
  text: { en: 'Text', it: 'Testo' },
  email: { en: 'Email', it: 'Email' },
  tel: { en: 'Phone', it: 'Telefono' },
  url: { en: 'Web address', it: 'Indirizzo web' },
  number: { en: 'Number', it: 'Numero' },
  date: { en: 'Date', it: 'Data' },
  textarea: { en: 'Long text', it: 'Testo lungo' },
  select: { en: 'Drop-down menu', it: 'Menu a tendina' },
  checkbox: { en: 'Checkboxes', it: 'Caselle di spunta' },
  radio: { en: 'Radio buttons', it: 'Scelta singola' },
  acceptance: { en: 'Consent (required)', it: 'Consenso (obbligatorio)' },
};

const SECRET = 'form-key';
const keys = new Map<string, Promise<CryptoKey>>();

/** Per-process limiter: enough against casual abuse on a single server. */
const recent = new Map<string, number[]>();
function allowed(key: string): boolean {
  const now = Date.now();
  const times = (recent.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (times.length >= RATE_LIMIT.max) return false;
  times.push(now);
  recent.set(key, times);
  if (recent.size > 10_000) recent.clear();
  return true;
}

/** Same-site path of the page the form was sent from. */
function returnPath(referer: string | undefined, host: string | undefined): string {
  try {
    const url = new URL(referer ?? '');
    if (url.host === host && url.pathname.startsWith('/')) return url.pathname;
  } catch {
    // no referer
  }
  return '/';
}

/**
 * The form's id for the site's bot protection (`ctx.forms`, plugin API
 * 1.38): the same for every contact form, since a block's `load` does not
 * know its block.
 */
const FORM_ID = 'forms/contact';

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** A label with its links. */
function Label({ label }: { label: string }) {
  return (
    <>
      {labelParts(label).map((part, i) =>
        'href' in part ? (
          <a key={i} href={part.href}>
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** One custom field. */
function Field({ field }: { field: FormField }) {
  const classes = (...extra: string[]) =>
    ['cf-field', `cf-${field.type}`, widthClass(field.width), ...extra, field.className]
      .filter(Boolean)
      .join(' ');
  const title = field.label ? (
    <span className="cf-label">
      <Label label={field.label} />
    </span>
  ) : null;
  const aria = field.label ? undefined : field.placeholder || field.name;
  const placeholder = field.placeholder || undefined;
  switch (field.type) {
    case 'textarea':
      return (
        <label className={classes()}>
          {title}
          <textarea
            name={field.name}
            required={field.required}
            maxLength={5000}
            rows={6}
            placeholder={placeholder}
            defaultValue={field.value || undefined}
            aria-label={aria}
          />
        </label>
      );
    case 'select':
      return (
        <label className={classes()}>
          {title}
          <select
            name={field.name}
            required={field.required}
            aria-label={aria}
            defaultValue={field.value}
          >
            <option value="">{field.placeholder || '—'}</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case 'radio':
    case 'checkbox':
      if (field.type === 'radio' || field.options.length > 0) {
        const chosen = new Set(field.value ? field.value.split('\n') : []);
        return (
          <fieldset className={classes()}>
            {field.label && (
              <legend className="cf-label">
                <Label label={field.label} />
              </legend>
            )}
            {field.options.map((o, i) => (
              <label key={o.value} className="cf-choice">
                <input
                  type={field.type}
                  name={field.name}
                  value={o.value}
                  defaultChecked={chosen.has(o.value) || undefined}
                  // One radio button required is enough for the browser.
                  required={field.type === 'radio' && field.required && i === 0}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </fieldset>
        );
      }
      return (
        <label className={classes('cf-choice')}>
          <input
            type="checkbox"
            name={field.name}
            value="1"
            required={field.required}
            defaultChecked={field.value === '1' || undefined}
          />
          <span>
            <Label label={field.label || field.placeholder || field.name} />
          </span>
        </label>
      );
    case 'acceptance':
      return (
        <label className={classes()}>
          <input type="checkbox" name={field.name} value="1" required />
          <span>
            <Label label={field.label || field.placeholder || field.name} />
          </span>
        </label>
      );
    default:
      return (
        <label className={classes()}>
          {title}
          <input
            name={field.name}
            type={field.type}
            required={field.required}
            maxLength={
              field.type === 'number' || field.type === 'date'
                ? undefined
                : field.type === 'tel'
                  ? 40
                  : field.type === 'url'
                    ? 500
                    : 200
            }
            min={field.min}
            max={field.max}
            placeholder={placeholder}
            defaultValue={field.value || undefined}
            aria-label={aria}
            autoComplete={
              field.type === 'email'
                ? 'email'
                : field.type === 'tel'
                  ? 'tel'
                  : field.type === 'url'
                    ? 'url'
                    : undefined
            }
          />
        </label>
      );
  }
}

/** The custom fields, the hidden ones and the button. */
function CustomFields({
  fields,
  submitInline,
  button,
  privacy,
  challenge,
}: {
  fields: FormField[];
  submitInline: boolean;
  button: ReactNode;
  privacy: ReactNode;
  challenge: ReactNode;
}) {
  const inRow = (f: FormField) => submitInline && f.type === 'acceptance';
  return (
    <>
      {fields
        .filter((f) => !inRow(f))
        .map((f) => (
          <Field key={f.name} field={f} />
        ))}
      {privacy}
      {challenge}
      {submitInline ? (
        <div className="cf-submit-row">
          {fields.filter(inRow).map((f) => (
            <Field key={f.name} field={f} />
          ))}
          {button}
        </div>
      ) : (
        button
      )}
    </>
  );
}

/** The site's signing key for the forms' fields, made on first use. */
function formKey(ctx: PluginContext, siteId: string): Promise<CryptoKey> {
  let key = keys.get(siteId);
  if (!key) {
    key = (async () => {
      let raw = await ctx.secrets.get(siteId, SECRET);
      if (!raw) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        await ctx.secrets.set(siteId, SECRET, raw);
      }
      return importKey(raw);
    })();
    // A failure is not kept: the next form tries again.
    key.catch(() => keys.delete(siteId));
    keys.set(siteId, key);
  }
  return key;
}

/** What a message of a custom form keeps in the table's own columns. */
function columnsOf(values: FieldValue[], replyTo: string | null) {
  const first = (type: FieldValue['type']) => values.find((v) => v.type === type && v.value);
  const reply = values.find((v) => v.name === replyTo);
  return {
    name:
      values.find((v) => (v.name === 'name' || v.name === 'your-name') && v.value)?.value ??
      first('text')?.value ??
      '',
    email: reply?.value && EMAIL_RE.test(reply.value) ? reply.value : '',
    phone: first('tel')?.value ?? null,
    message: first('textarea')?.value ?? '',
  };
}

/**
 * Forms (official plugin): a contact form block that works without
 * JavaScript. Messages are stored and, if set, emailed to the site owner.
 */
export default definePlugin({
  setup(ctx) {
    ctx.access.defineCapability('manage_forms', {
      label: { en: 'Read form messages', it: 'Leggere i messaggi dei moduli' },
      roles: ['administrator', 'editor'],
    });

    ctx.settings.define(
      [
        {
          name: 'recipient',
          type: 'text',
          label: { en: 'Send messages to', it: 'Invia i messaggi a' },
          help: {
            en: 'An email address. Leave empty to only keep them in the admin.',
            it: 'Un indirizzo email. Vuoto: solo nell’amministrazione.',
          },
          maxLength: 200,
        },
      ],
      { title: { en: 'Forms', it: 'Moduli' } },
    );

    ctx.blocks.register(
      defineBlock<FormAttrs, { challenge: string; spec?: string }>({
        type: 'forms/contact',
        title: { en: 'Contact form', it: 'Modulo di contatto' },
        description: { en: 'Name, email and message.', it: 'Nome, email e messaggio.' },
        icon: 'email',
        attributes: [
          {
            name: 'formName',
            type: 'text',
            label: { en: 'Form name', it: 'Nome del modulo' },
            default: 'Contact',
            maxLength: 80,
          },
          {
            name: 'buttonLabel',
            type: 'text',
            label: { en: 'Button', it: 'Pulsante' },
            default: 'Send',
            maxLength: 40,
          },
          {
            name: 'askPhone',
            type: 'boolean',
            label: { en: 'Ask for a phone number', it: 'Chiedi il telefono' },
          },
          {
            name: 'successMessage',
            type: 'text',
            label: { en: 'Thank-you message', it: 'Messaggio di ringraziamento' },
            default: 'Thank you, we will reply soon.',
            maxLength: 300,
          },
          {
            name: 'privacyUrl',
            type: 'text',
            label: { en: 'Privacy policy address', it: 'Indirizzo della privacy policy' },
            help: {
              en: 'e.g. /privacy-policy: a notice with this link is shown under the form.',
              it: 'Es. /privacy-policy: sotto il modulo compare un’informativa con questo link.',
            },
            maxLength: 300,
          },
          {
            name: 'fields',
            type: 'list',
            label: { en: 'Fields', it: 'Campi' },
            help: {
              en: 'Your own fields, in order. Without any, the form asks for name, email and message.',
              it: 'I tuoi campi, in ordine. Senza campi, il modulo chiede nome, email e messaggio.',
            },
            itemLabel: 'label',
            max: 30,
            fields: [
              {
                name: 'label',
                type: 'text',
                label: { en: 'Label', it: 'Etichetta' },
                help: {
                  en: 'A link is written [text](/address), e.g. in a consent.',
                  it: 'Un link si scrive [testo](/indirizzo), ad esempio in un consenso.',
                },
                maxLength: 500,
              },
              {
                name: 'name',
                type: 'text',
                label: { en: 'Name (in the subject: {name})', it: 'Nome (nell’oggetto: {nome})' },
                help: {
                  en: 'Letters, digits and dashes, e.g. arrival-date.',
                  it: 'Lettere, cifre e trattini, ad esempio data-arrivo.',
                },
                maxLength: 40,
              },
              {
                name: 'type',
                type: 'select',
                label: { en: 'Type', it: 'Tipo' },
                default: 'text',
                options: FIELD_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] })),
              },
              {
                name: 'placeholder',
                type: 'text',
                label: { en: 'Placeholder', it: 'Testo segnaposto' },
                maxLength: 200,
              },
              {
                name: 'value',
                type: 'text',
                multiline: true,
                label: { en: 'Default value', it: 'Valore iniziale' },
                help: {
                  en: 'The text it starts with; for menus, checkboxes and radio buttons the chosen option(s), one per line.',
                  it: 'Il testo con cui parte; per menu, caselle e scelta singola le opzioni scelte, una per riga.',
                },
                maxLength: 5000,
              },
              {
                name: 'required',
                type: 'boolean',
                label: { en: 'Required', it: 'Obbligatorio' },
              },
              {
                name: 'width',
                type: 'select',
                label: { en: 'Width on desktop', it: 'Larghezza su desktop' },
                default: 'full',
                options: FIELD_WIDTHS.map((value) => ({
                  value,
                  label: value === 'full' ? { en: 'Full', it: 'Intera' } : value,
                })),
              },
              {
                name: 'options',
                type: 'text',
                multiline: true,
                label: { en: 'Options', it: 'Opzioni' },
                help: {
                  en: 'Select, checkboxes, radio buttons: one per line, as value|label or just the text.',
                  it: 'Menu, caselle, scelta singola: una per riga, come valore|etichetta o solo il testo.',
                },
                maxLength: 5000,
              },
              {
                name: 'min',
                type: 'text',
                label: { en: 'Minimum (number or date)', it: 'Minimo (numero o data)' },
                help: { en: 'Dates as YYYY-MM-DD.', it: 'Date come AAAA-MM-GG.' },
                maxLength: 20,
              },
              {
                name: 'max',
                type: 'text',
                label: { en: 'Maximum (number or date)', it: 'Massimo (numero o data)' },
                maxLength: 20,
              },
              {
                name: 'className',
                type: 'text',
                label: { en: 'Extra CSS class', it: 'Classe CSS aggiuntiva' },
                maxLength: 200,
              },
            ],
          },
          {
            name: 'subject',
            type: 'text',
            label: { en: 'Email subject', it: 'Oggetto dell’email' },
            help: {
              en: '{form} is the form name, {field-name} a field’s value. Empty: [form name] name.',
              it: '{form} è il nome del modulo, {nome-campo} il valore di un campo. Vuoto: [nome del modulo] nome.',
            },
            maxLength: 200,
          },
          {
            name: 'replyTo',
            type: 'text',
            label: { en: 'Reply-To field', it: 'Campo per Rispondi a' },
            help: {
              en: 'The name of the email field to reply to. Empty: the first email field.',
              it: 'Il nome del campo email a cui rispondere. Vuoto: il primo campo email.',
            },
            maxLength: 40,
          },
          {
            name: 'submitInline',
            type: 'boolean',
            label: {
              en: 'Consent and button on one row',
              it: 'Consenso e pulsante sulla stessa riga',
            },
          },
        ],
        // The site's bot protection, when a plugin gives one (e.g. Captcha),
        // and the custom fields, signed for the server.
        async load(attrs, context) {
          const challenge = await ctx.forms
            ?.challenge({
              siteId: context.siteId,
              form: FORM_ID,
              locale: context.locale,
              signedIn: context.signedIn === true,
            })
            .catch(() => '');
          const fields = normalizeFields(attrs.fields);
          let spec = '';
          if (fields.length > 0) {
            spec = await signSpec(await formKey(ctx, context.siteId), {
              form: text(attrs.formName, 80) || 'Contact',
              fields,
              subject: text(attrs.subject, 200),
              replyTo: replyToField(fields, attrs.replyTo),
            }).catch((error: unknown) => {
              ctx.log.error('Form key not available', { error: String(error) });
              return '';
            });
          }
          return { challenge: challenge ?? '', spec };
        },
        render({ attrs, block, context, data }) {
          const it = context.locale.startsWith('it');
          const id = `form-${block.id}`;
          const fields = normalizeFields(attrs.fields);
          const custom = fields.length > 0;
          const privacy = attrs.privacyUrl && /^(\/|https?:\/\/)/.test(attrs.privacyUrl) && (
            <p className="form-privacy">
              {it
                ? 'Inviando il messaggio, i tuoi dati saranno trattati per risponderti, come descritto nella '
                : 'By sending the message, your data will be used to reply to you, as described in the '}
              <a href={attrs.privacyUrl}>privacy policy</a>.
            </p>
          );
          const challenge = data?.challenge ? (
            <div className="form-challenge" dangerouslySetInnerHTML={{ __html: data.challenge }} />
          ) : null;
          const button = <button type="submit">{attrs.buttonLabel}</button>;
          return (
            <section className="contact-form" id={id}>
              <style>
                {`#${id}-sent:not(:target),#${id}-error:not(:target),#${id}-check:not(:target){display:none}` +
                  `.contact-form form{display:grid;gap:.75rem;max-width:36rem}` +
                  `.contact-form label{display:grid;gap:.25rem}` +
                  `.contact-form .form-privacy{font-size:.875em;margin:0}` +
                  `.contact-form .hp{position:absolute;left:-10000px}` +
                  (custom ? GRID_CSS : '')}
              </style>
              <p id={`${id}-sent`} role="status">
                {attrs.successMessage}
              </p>
              <p id={`${id}-error`} role="alert">
                {it
                  ? 'Il messaggio non è stato inviato. Controlla i campi e riprova.'
                  : 'The message was not sent. Check the fields and try again.'}
              </p>
              <p id={`${id}-check`} role="alert">
                {it
                  ? 'Il controllo anti-spam non è riuscito: riprova.'
                  : 'The spam check did not pass: please try again.'}
              </p>
              {custom ? (
                <form method="post" action={SUBMIT_PATH} className="cf-grid">
                  <input type="hidden" name="_form" value={attrs.formName} />
                  <input type="hidden" name="_block" value={block.id} />
                  <input type="hidden" name="_spec" value={data?.spec ?? ''} />
                  {/* Left empty by people; bots fill it in. */}
                  <label className="hp" aria-hidden="true">
                    Website
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                  <CustomFields
                    fields={fields}
                    submitInline={attrs.submitInline === true}
                    button={button}
                    privacy={privacy}
                    challenge={challenge}
                  />
                </form>
              ) : (
                <form method="post" action={SUBMIT_PATH}>
                  <input type="hidden" name="_form" value={attrs.formName} />
                  <input type="hidden" name="_block" value={block.id} />
                  <label>
                    {it ? 'Nome' : 'Name'}
                    <input name="name" required maxLength={120} autoComplete="name" />
                  </label>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      required
                      maxLength={200}
                      autoComplete="email"
                    />
                  </label>
                  {attrs.askPhone && (
                    <label>
                      {it ? 'Telefono' : 'Phone'}
                      <input name="phone" type="tel" maxLength={40} autoComplete="tel" />
                    </label>
                  )}
                  <label>
                    {it ? 'Messaggio' : 'Message'}
                    <textarea name="message" required maxLength={5000} rows={6} />
                  </label>
                  {/* Left empty by people; bots fill it in. */}
                  <label className="hp" aria-hidden="true">
                    Website
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                  {privacy}
                  {challenge}
                  {button}
                </form>
              )}
            </section>
          );
        },
      }),
    );

    /**
     * The message of a submission, from the form's fields: a custom form's
     * own copy (signed when the page was drawn) or the classic fields.
     * Null when it is not valid.
     */
    async function messageOf(
      siteId: string,
      form: Record<string, unknown>,
      back: string,
      locale: string,
    ): Promise<Message | null> {
      if (form._spec !== undefined) {
        const spec = await readSpec(await formKey(ctx, siteId), form._spec).catch(() => null);
        if (!spec || spec.fields.length === 0) return null;
        const checked = checkValues(spec.fields, form, locale);
        if (checked.invalid.length > 0) return null;
        const columns = columnsOf(checked.values, spec.replyTo);
        return {
          formName: spec.form,
          ...columns,
          data: checked.values,
          replyTo: columns.email || null,
          subject: subjectOf(spec.subject, spec.form, checked.values),
          text: messageText(checked.values, back, locale),
        };
      }
      const name = text(form.name, 120);
      const email = text(form.email, 200).toLowerCase();
      const body = text(form.message, 5000);
      const phone = text(form.phone, 40) || null;
      if (!name || !EMAIL_RE.test(email) || !body) return null;
      const formName = text(form._form, 80) || 'Contact';
      return {
        formName,
        name,
        email,
        phone,
        message: body,
        data: null,
        replyTo: email,
        subject: `[${formName}] ${name}`,
        text: `${name} <${email}>${phone ? `\nPhone: ${phone}` : ''}\nPage: ${back}\n\n${body}`,
      };
    }

    /** Stores the message and sends it to the site's recipient. */
    async function deliver(siteId: string, message: Message, back: string): Promise<void> {
      await ctx.db.transaction(siteId, (tx) =>
        tx.insert(submissions).values({
          siteId,
          formName: message.formName,
          pagePath: back,
          name: message.name,
          email: message.email,
          phone: message.phone,
          message: message.message,
          data: message.data,
        }),
      );
      const { recipient } = await ctx.settings.get(siteId);
      if (typeof recipient === 'string' && EMAIL_RE.test(recipient)) {
        await ctx.mail
          .send({
            siteId,
            to: recipient,
            ...(message.replyTo ? { replyTo: message.replyTo } : {}),
            subject: message.subject,
            text: message.text,
          })
          .catch((error: unknown) => ctx.log.error('Mail not sent', { error: String(error) }));
      }
    }

    ctx.routes.public({
      method: 'POST',
      path: SUBMIT_PATH,
      async handler(request) {
        const form = (request.body ?? {}) as Record<string, unknown>;
        const block = text(form._block, 64).replace(/[^\w-]/g, '');
        const back = returnPath(request.headers.referer, request.headers.host);
        const redirect = (outcome: 'sent' | 'error' | 'check', challenge = false) => ({
          status: 303,
          headers: {
            // A captcha shown only when asked (plugin API 1.45) appears on the page.
            location: `${back}${challenge ? `?cl-challenge=${encodeURIComponent(FORM_ID)}` : ''}#form-${block}-${outcome}`,
          },
        });
        // Bots: pretend it worked.
        if (text(form.website, 200)) return redirect('sent');

        const message = await messageOf(request.siteId, form, back, request.locale);
        if (!message) return redirect('error');
        if (!allowed(`${request.siteId}|${request.ip}`)) {
          return { status: 429, body: 'Too many messages. Try again later.' };
        }
        // The site's bot protection (Captcha, Antispam), when there is one.
        const verdict = await ctx.forms?.verify({
          siteId: request.siteId,
          form: FORM_ID,
          locale: request.locale,
          // The page, for a message delivered later (`form.released`).
          fields: { ...form, _back: back },
          ip: request.ip,
          host: (request.headers.host ?? '').replace(/:\d+$/, ''),
          signedIn: request.user !== null,
          // Spam is kept aside and delivered if released (plugin API 1.45).
          hold: true,
        });
        if (verdict && !verdict.ok)
          return verdict.silent ? redirect('sent') : redirect('check', verdict.challenge === true);
        // Held as spam: the visitor reads the usual thanks.
        if (verdict?.spam) return redirect('sent');

        await deliver(request.siteId, message, back);
        return redirect('sent');
      },
    });

    // A message held as spam and released as not spam (plugin API 1.45).
    ctx.hooks.on('form.released', async ({ form, fields, locale }, { siteId }) => {
      if (form !== FORM_ID) return;
      const back =
        typeof fields._back === 'string' && /^\/(?![/\\])/.test(fields._back) ? fields._back : '/';
      const message = await messageOf(siteId, fields, back, locale);
      if (!message) {
        ctx.log.warn('Released message not valid', { form });
        return;
      }
      await deliver(siteId, message, back);
    });

    // GDPR requests (Privacy plugin): the messages sent with an email address.
    ctx.privacy.registerExporter({
      id: 'forms',
      label: { en: 'Form messages', it: 'Messaggi dei moduli' },
      async export(siteId, email) {
        const rows = await ctx.db.transaction(siteId, (tx) =>
          tx
            .select()
            .from(submissions)
            .where(eq(submissions.email, email))
            .orderBy(asc(submissions.createdAt)),
        );
        return rows.length === 0
          ? []
          : [
              {
                id: 'forms.submissions',
                label: { en: 'Form messages', it: 'Messaggi dei moduli' },
                items: rows.map((r) => ({
                  // A custom form's fields, by label (the columns below win a clash).
                  ...Object.fromEntries((r.data ?? []).map((f) => [f.label, f.value])),
                  form: r.formName,
                  page: r.pagePath,
                  name: r.name,
                  email: r.email,
                  phone: r.phone,
                  message: r.message,
                  sent: r.createdAt.toISOString(),
                })),
              },
            ];
      },
    });
    ctx.privacy.registerEraser({
      id: 'forms',
      label: { en: 'Form messages', it: 'Messaggi dei moduli' },
      async erase(siteId, email) {
        const removed = await ctx.db.transaction(siteId, (tx) =>
          tx
            .delete(submissions)
            .where(eq(submissions.email, email))
            .returning({ id: submissions.id }),
        );
        return { removed: removed.length, retained: 0 };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/submissions',
      capability: 'manage_forms',
      async handler(request) {
        const rows = await ctx.db.transaction(request.siteId, (tx) =>
          tx.select().from(submissions).orderBy(desc(submissions.createdAt)).limit(500),
        );
        const body: Submission[] = rows.map((r) => ({
          id: r.id,
          formName: r.formName,
          pagePath: r.pagePath,
          name: r.name,
          email: r.email,
          phone: r.phone,
          message: r.message,
          fields: r.data ?? null,
          createdAt: r.createdAt.toISOString(),
        }));
        return { body };
      },
    });

    ctx.routes.api({
      method: 'DELETE',
      path: '/submissions/:id',
      capability: 'manage_forms',
      async handler(request) {
        if (!/^[0-9a-f-]{36}$/i.test(request.params.id ?? '')) return { status: 404 };
        await ctx.db.transaction(request.siteId, (tx) =>
          tx.delete(submissions).where(eq(submissions.id, request.params.id!)),
        );
        return { status: 204 };
      },
    });
  },
});
