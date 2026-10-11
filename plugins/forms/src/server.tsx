import { defineBlock, definePlugin } from '@cleitext/plugin-sdk';
import { asc, desc, eq } from 'drizzle-orm';
import { submissions, type Submission } from './schema';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMIT_PATH = '/_forms/submit';
/** At most this many messages per address and site in the window. */
const RATE_LIMIT = { max: 5, windowMs: 10 * 60_000 };

interface FormAttrs {
  formName: string;
  buttonLabel: string;
  askPhone?: boolean;
  successMessage: string;
  privacyUrl?: string;
}

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

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

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
      defineBlock<FormAttrs>({
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
        ],
        render({ attrs, block, context }) {
          const it = context.locale.startsWith('it');
          const id = `form-${block.id}`;
          return (
            <section className="contact-form" id={id}>
              <style>
                {`#${id}-sent:not(:target),#${id}-error:not(:target){display:none}` +
                  `.contact-form form{display:grid;gap:.75rem;max-width:36rem}` +
                  `.contact-form label{display:grid;gap:.25rem}` +
                  `.contact-form .form-privacy{font-size:.875em;margin:0}` +
                  `.contact-form .hp{position:absolute;left:-10000px}`}
              </style>
              <p id={`${id}-sent`} role="status">
                {attrs.successMessage}
              </p>
              <p id={`${id}-error`} role="alert">
                {it
                  ? 'Il messaggio non è stato inviato. Controlla i campi e riprova.'
                  : 'The message was not sent. Check the fields and try again.'}
              </p>
              <form method="post" action={SUBMIT_PATH}>
                <input type="hidden" name="_form" value={attrs.formName} />
                <input type="hidden" name="_block" value={block.id} />
                <label>
                  {it ? 'Nome' : 'Name'}
                  <input name="name" required maxLength={120} autoComplete="name" />
                </label>
                <label>
                  Email
                  <input name="email" type="email" required maxLength={200} autoComplete="email" />
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
                {attrs.privacyUrl && /^(\/|https?:\/\/)/.test(attrs.privacyUrl) && (
                  <p className="form-privacy">
                    {it
                      ? 'Inviando il messaggio, i tuoi dati saranno trattati per risponderti, come descritto nella '
                      : 'By sending the message, your data will be used to reply to you, as described in the '}
                    <a href={attrs.privacyUrl}>privacy policy</a>.
                  </p>
                )}
                <button type="submit">{attrs.buttonLabel}</button>
              </form>
            </section>
          );
        },
      }),
    );

    ctx.routes.public({
      method: 'POST',
      path: SUBMIT_PATH,
      async handler(request) {
        const form = (request.body ?? {}) as Record<string, unknown>;
        const block = text(form._block, 64).replace(/[^\w-]/g, '');
        const back = returnPath(request.headers.referer, request.headers.host);
        const redirect = (outcome: 'sent' | 'error') => ({
          status: 303,
          headers: { location: `${back}#form-${block}-${outcome}` },
        });
        // Bots: pretend it worked.
        if (text(form.website, 200)) return redirect('sent');

        const name = text(form.name, 120);
        const email = text(form.email, 200).toLowerCase();
        const message = text(form.message, 5000);
        const phone = text(form.phone, 40) || null;
        if (!name || !EMAIL_RE.test(email) || !message) return redirect('error');
        if (!allowed(`${request.siteId}|${request.ip}`)) {
          return { status: 429, body: 'Too many messages. Try again later.' };
        }

        const formName = text(form._form, 80) || 'Contact';
        await ctx.db.transaction(request.siteId, (tx) =>
          tx.insert(submissions).values({
            siteId: request.siteId,
            formName,
            pagePath: back,
            name,
            email,
            phone,
            message,
          }),
        );
        const { recipient } = await ctx.settings.get(request.siteId);
        if (typeof recipient === 'string' && EMAIL_RE.test(recipient)) {
          await ctx.mail
            .send({
              siteId: request.siteId,
              to: recipient,
              replyTo: email,
              subject: `[${formName}] ${name}`,
              text: `${name} <${email}>${phone ? `\nPhone: ${phone}` : ''}\nPage: ${back}\n\n${message}`,
            })
            .catch((error: unknown) => ctx.log.error('Mail not sent', { error: String(error) }));
        }
        return redirect('sent');
      },
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
