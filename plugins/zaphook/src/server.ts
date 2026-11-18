/**
 * Zaphook: every message delivered by Forms (`forms.delivered`, Forms 1.9.0)
 * sent to webhooks, e.g. a Zapier "Catch Hook", Make, n8n or any https address.
 *
 * Forms hands over each message while the visitor waits: Zaphook only puts it
 * in its queue (one row per webhook). A task every minute sends what is due,
 * and tries again after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours
 * when the other side is busy, down or unreachable.
 */
import { definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import { and, asc, desc, eq, inArray, lte, notInArray, sql } from 'drizzle-orm';
import {
  buildPayload,
  classify,
  emailOf,
  FAILED_KEEP_MS,
  hostOf,
  InvalidWebhook,
  LOG_SIZE,
  matches,
  MAX_WEBHOOKS,
  nextAttempt,
  samplePayload,
  shortError,
  signature,
  webhookFrom,
  webhooksOf,
  type DeliveredMessage,
  type Webhook,
  type WebhookInput,
} from './model';
import { deliveries, type DeliveryStatus } from './schema';

export const SLUG = 'zaphook';
const CAPABILITY = 'manage_zaphook';
const WEBHOOKS_KEY = 'webhooks';
const ACTIVE_KEY = 'active';
const ALERTS_KEY = 'alerts';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The email sent when a delivery fails for good (1.1.0): on by default, to
 * the site's administrators, or to the address chosen.
 */
export interface Alerts {
  enabled: boolean;
  email: string;
}

export function alertsOf(stored: unknown): Alerts {
  const v = (stored ?? {}) as Partial<Alerts>;
  const email = typeof v.email === 'string' ? v.email.trim().toLowerCase().slice(0, 200) : '';
  return { enabled: v.enabled !== false, email: EMAIL_RE.test(email) ? email : '' };
}
/** Deliveries sent per site in one run of the task. */
const BATCH = 25;
/** A claimed delivery is not claimed again before this long (another server, a crash). */
const LEASE_MS = 5 * 60_000;
const TIMEOUT_MS = 15_000;

const secretName = (id: string) => `webhook-${id}`;

/** A delivery as the admin's log shows it: no payload values, no secret, no address. */
export interface LogLine {
  id: string;
  createdAt: string;
  updatedAt: string;
  webhookId: string;
  webhook: string;
  form: string;
  status: DeliveryStatus;
  httpStatus: number | null;
  attempts: number;
  error: string | null;
  fields: string[];
  canRetry: boolean;
}

export interface StateView {
  formsActive: boolean;
  formNames: string[];
  webhooks: Webhook[];
  log: LogLine[];
  alerts: Alerts;
}

export interface TestResult {
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
}

export function setupZaphook(ctx: PluginContext): void {
  ctx.access.defineCapability(CAPABILITY, {
    label: { en: 'Manage Zaphook webhooks', it: 'Gestire i webhook di Zaphook' },
    roles: ['administrator'],
  });

  const webhooksOfSite = async (siteId: string) =>
    webhooksOf(await ctx.storage.get(siteId, WEBHOOKS_KEY));

  // ---- From Forms: only into the queue ------------------------------------------------

  async function enqueue(
    siteId: string,
    message: DeliveredMessage,
  ): Promise<{ skipMail: boolean }> {
    const hooks = (await webhooksOfSite(siteId)).filter((w) =>
      matches(w, String(message?.form ?? '')),
    );
    if (hooks.length === 0) return { skipMail: false };
    const rows = hooks.map((w) => {
      const payload = buildPayload(w, message);
      return {
        siteId,
        webhookId: w.id,
        webhookLabel: w.label,
        formName: String(message.form).slice(0, 200),
        messageId: String(message.messageId ?? '').slice(0, 100) || null,
        status: 'queued' as const,
        fieldNames: Object.keys(payload).filter((k) => !k.startsWith('_')),
        payload,
        email: emailOf(payload),
      };
    });
    await ctx.db.transaction(siteId, (tx) => tx.insert(deliveries).values(rows));
    return { skipMail: hooks.some((w) => w.skipMail) };
  }

  ctx.services?.provide('forms.delivered', {
    delivered: (siteId: string, message: DeliveredMessage) => enqueue(siteId, message),
  });

  // ---- Sending ----------------------------------------------------------------------

  /** One request to a webhook: the HTTP status, or null when it could not be reached. */
  async function post(
    siteId: string,
    webhook: Webhook,
    payload: Record<string, unknown>,
  ): Promise<{ status: number | null; error: string | null }> {
    const body = JSON.stringify(payload);
    const secret = webhook.hasSecret ? await ctx.secrets.get(siteId, secretName(webhook.id)) : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      ...(secret ? await signature(secret, String(Math.floor(Date.now() / 1000)), body) : {}),
    };
    try {
      const answer = await ctx.http.send({
        url: webhook.url,
        method: 'POST',
        headers,
        body,
        timeoutMs: TIMEOUT_MS,
      });
      const outcome = classify(answer.status);
      return {
        status: answer.status,
        error:
          outcome === 'sent'
            ? null
            : answer.status >= 300 && answer.status < 400
              ? `HTTP ${answer.status}: redirected${answer.location ? ` to ${hostOf(answer.location)}` : ''}`
              : `HTTP ${answer.status}`,
      };
    } catch (error) {
      return { status: null, error: shortError(error, [webhook.url, secret]) };
    }
  }

  /** Tells the site's administrators (or the chosen address) that a delivery failed for good. */
  async function alertFailure(
    siteId: string,
    webhook: Webhook,
    form: string,
    attempts: number,
    result: { status: number | null; error: string | null },
  ): Promise<void> {
    const alerts = alertsOf(await ctx.storage.get(siteId, ALERTS_KEY));
    if (!alerts.enabled) return;
    const to = alerts.email
      ? [alerts.email]
      : (await ctx.users.find(siteId, { role: 'administrator', limit: 20 }))
          .map((u) => u.email)
          .filter((e): e is string => typeof e === 'string' && EMAIL_RE.test(e));
    if (to.length === 0) return;
    const site = await ctx.site(siteId);
    const it = site.defaultLocale.toLowerCase().startsWith('it');
    const host = hostOf(webhook.url);
    const answer =
      result.status !== null
        ? `HTTP ${result.status}${result.error ? ` – ${result.error}` : ''}`
        : (result.error ?? '');
    const text = it
      ? [
          `Un messaggio del modulo «${form}» non è arrivato al webhook «${webhook.label}» (${host}) dopo ${attempts} tentativi.`,
          `Risposta: ${answer}`,
          '',
          'Il messaggio è comunque salvato nei Messaggi del sito. Da Impostazioni → Zaphook puoi controllare il webhook e premere «Riprova» nel registro degli invii, entro 7 giorni.',
        ]
      : [
          `A message of the form "${form}" did not reach the webhook "${webhook.label}" (${host}) after ${attempts} attempts.`,
          `Answer: ${answer}`,
          '',
          'The message is still saved in the site’s Messages. In Settings → Zaphook you can check the webhook and press "Try again" in the delivery log, within 7 days.',
        ];
    await ctx.mail.send({
      siteId,
      to,
      notification: true,
      subject: it
        ? `[${site.name}] Zaphook: invio non riuscito a ${host}`
        : `[${site.name}] Zaphook: delivery to ${host} failed`,
      text: text.join('\n'),
    });
  }

  /** Sends the deliveries that are due (or only one, tried again by hand). */
  async function sendDue(siteId: string, only?: string): Promise<number> {
    const now = Date.now();
    const due = and(
      inArray(deliveries.status, ['queued', 'retrying']),
      lte(deliveries.nextAt, new Date(now)),
      ...(only ? [eq(deliveries.id, only)] : []),
    );
    // Claimed first, so that two servers never send the same one.
    const claimed = await ctx.db.transaction(siteId, (tx) =>
      tx
        .update(deliveries)
        .set({ nextAt: new Date(now + LEASE_MS) })
        .where(
          and(
            due,
            inArray(
              deliveries.id,
              tx
                .select({ id: deliveries.id })
                .from(deliveries)
                .where(due)
                .orderBy(asc(deliveries.nextAt))
                .limit(BATCH),
            ),
          ),
        )
        .returning(),
    );
    if (claimed.length === 0) return 0;
    const hooks = new Map((await webhooksOfSite(siteId)).map((w) => [w.id, w]));
    for (const row of claimed) {
      const webhook = hooks.get(row.webhookId);
      const attempts = row.attempts + 1;
      let result: { status: number | null; error: string | null };
      let outcome: 'sent' | 'retry' | 'failed';
      if (!webhook || !row.payload) {
        result = { status: null, error: 'The webhook was removed.' };
        outcome = 'failed';
      } else if (!webhook.enabled) {
        result = { status: null, error: 'The webhook was turned off.' };
        outcome = 'failed';
      } else {
        result = await post(siteId, webhook, row.payload);
        outcome = classify(result.status);
      }
      const next = outcome === 'retry' ? nextAttempt(attempts, Date.now()) : null;
      const status: DeliveryStatus =
        outcome === 'sent' ? 'sent' : outcome === 'retry' && next ? 'retrying' : 'failed';
      const final = status === 'sent' || status === 'failed';
      if (status === 'failed') {
        ctx.log.warn('A webhook delivery failed', {
          siteId,
          host: webhook ? hostOf(webhook.url) : '',
          httpStatus: result.status,
          attempts,
        });
        if (webhook && !only)
          await alertFailure(siteId, webhook, row.formName, attempts, result).catch((error) =>
            ctx.log.warn('The failure email was not sent', { siteId, error: shortError(error) }),
          );
      }
      await ctx.db.transaction(siteId, (tx) =>
        tx
          .update(deliveries)
          .set({
            status,
            attempts,
            httpStatus: result.status,
            error: result.error,
            nextAt: next ?? new Date(),
            updatedAt: new Date(),
            // Sent: the values go. Failed: kept a few days, to try again by hand.
            ...(status === 'sent' || (final && !webhook) ? { payload: null, email: null } : {}),
          })
          .where(eq(deliveries.id, row.id)),
      );
    }
    await tidy(siteId);
    return claimed.length;
  }

  /** The log keeps the latest deliveries; failed ones lose their values after a few days. */
  async function tidy(siteId: string): Promise<void> {
    await ctx.db.transaction(siteId, async (tx) => {
      await tx
        .update(deliveries)
        .set({ payload: null, email: null })
        .where(
          and(
            eq(deliveries.status, 'failed'),
            lte(deliveries.updatedAt, new Date(Date.now() - FAILED_KEEP_MS)),
            sql`${deliveries.payload} is not null`,
          ),
        );
      const kept = tx
        .select({ id: deliveries.id })
        .from(deliveries)
        .orderBy(desc(deliveries.createdAt))
        .limit(LOG_SIZE);
      await tx
        .delete(deliveries)
        .where(
          and(inArray(deliveries.status, ['sent', 'failed']), notInArray(deliveries.id, kept)),
        );
    });
  }

  // Due deliveries (the first attempt comes within a minute of the message).
  ctx.schedule.every('deliver', 1, async (siteId) => {
    try {
      await sendDue(siteId);
    } catch (error) {
      ctx.log.warn('The webhook deliveries failed', { siteId, error: shortError(error) });
    }
  });

  // ---- Privacy ----------------------------------------------------------------------

  ctx.privacy.registerExporter({
    id: SLUG,
    label: {
      en: 'Form messages waiting for a webhook',
      it: 'Messaggi dei moduli in attesa di un webhook',
    },
    async export(siteId, email) {
      const rows = await ctx.db.transaction(siteId, (tx) =>
        tx
          .select()
          .from(deliveries)
          .where(
            and(eq(deliveries.email, email.toLowerCase()), sql`${deliveries.payload} is not null`),
          )
          .orderBy(asc(deliveries.createdAt)),
      );
      return rows.length === 0
        ? []
        : [
            {
              id: 'zaphook.deliveries',
              label: { en: 'Webhook deliveries', it: 'Invii ai webhook' },
              items: rows.map((r) => ({
                ...Object.fromEntries(
                  Object.entries(r.payload ?? {}).filter(([k]) => !k.startsWith('_')),
                ),
                form: r.formName,
                webhook: r.webhookLabel,
                status: r.status,
                created: r.createdAt.toISOString(),
              })),
            },
          ];
    },
  });
  ctx.privacy.registerEraser({
    id: SLUG,
    label: {
      en: 'Form messages waiting for a webhook',
      it: 'Messaggi dei moduli in attesa di un webhook',
    },
    async erase(siteId, email) {
      const removed = await ctx.db.transaction(siteId, (tx) =>
        tx
          .delete(deliveries)
          .where(eq(deliveries.email, email.toLowerCase()))
          .returning({ id: deliveries.id }),
      );
      return {
        removed: removed.length,
        retained: 0,
        ...(removed.length > 0
          ? {
              messages: [
                'Messages already sent to a webhook are kept by the receiving service: delete them there too.',
              ],
            }
          : {}),
      };
    },
  });

  // A section of the privacy policy made by the Privacy plugin (Privacy 1.7 registry):
  // the services the forms' messages go to.
  const policy = ((globalThis as unknown as Record<symbol, unknown>)[
    Symbol.for('cleitext.privacy.policySections')
  ] ??= new Map()) as Map<
    string,
    (input: { siteId: string; locale: string }) => Promise<{ title: string; text: string }[]>
  >;
  policy.set(SLUG, async ({ siteId, locale }) => {
    if (!(await ctx.storage.get(siteId, ACTIVE_KEY))) return [];
    return policySection(await webhooksOfSite(siteId), locale);
  });

  // ---- Admin ------------------------------------------------------------------------

  const problem = (status: number, message: string) => ({
    status,
    body: { type: 'about:blank', title: message, detail: message, status, message },
  });

  async function formsInfo(siteId: string): Promise<{ active: boolean; names: string[] }> {
    try {
      const forms = await ctx.services?.use(siteId, 'forms');
      if (!forms) return { active: false, names: [] };
      const names =
        typeof forms.formNames === 'function'
          ? await (forms.formNames as (s: string) => Promise<string[]>)(siteId)
          : [];
      return { active: true, names: Array.isArray(names) ? names.slice(0, 100) : [] };
    } catch (error) {
      ctx.log.warn('The form names could not be read', { error: shortError(error) });
      return { active: true, names: [] };
    }
  }

  async function logOf(siteId: string): Promise<LogLine[]> {
    const rows = await ctx.db.transaction(siteId, (tx) =>
      tx
        .select({
          id: deliveries.id,
          createdAt: deliveries.createdAt,
          updatedAt: deliveries.updatedAt,
          webhookId: deliveries.webhookId,
          webhook: deliveries.webhookLabel,
          form: deliveries.formName,
          status: deliveries.status,
          httpStatus: deliveries.httpStatus,
          attempts: deliveries.attempts,
          error: deliveries.error,
          fields: deliveries.fieldNames,
          hasPayload: sql<boolean>`${deliveries.payload} is not null`,
        })
        .from(deliveries)
        .orderBy(desc(deliveries.createdAt))
        .limit(LOG_SIZE),
    );
    return rows.map(({ hasPayload, ...r }) => ({
      ...r,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
      fields: Array.isArray(r.fields) ? r.fields : [],
      canRetry: r.status === 'failed' && hasPayload === true,
    }));
  }

  async function state(siteId: string): Promise<StateView> {
    const forms = await formsInfo(siteId);
    return {
      formsActive: forms.active,
      formNames: forms.names,
      webhooks: await webhooksOfSite(siteId),
      log: await logOf(siteId),
      alerts: alertsOf(await ctx.storage.get(siteId, ALERTS_KEY)),
    };
  }

  const route = (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    handler: Parameters<typeof ctx.routes.api>[0]['handler'],
  ) => ctx.routes.api({ method, path, capability: CAPABILITY, handler });

  route('GET', '/state', async (request) => ({ body: await state(request.siteId) }));

  // The email about failed deliveries (1.1.0): on or off, and where it goes.
  route('PUT', '/alerts', async (request) => {
    const body = (request.body ?? {}) as { enabled?: unknown; email?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (email && !EMAIL_RE.test(email)) return problem(400, 'The email address is not valid.');
    await ctx.storage.set(
      request.siteId,
      ALERTS_KEY,
      alertsOf({ enabled: body.enabled !== false, email }),
    );
    return { body: await state(request.siteId) };
  });

  /** Saves a new webhook (no id) or changes one. */
  async function save(siteId: string, input: WebhookInput, id?: string) {
    const hooks = await webhooksOfSite(siteId);
    const saved = id ? (hooks.find((w) => w.id === id) ?? null) : null;
    if (id && !saved) return problem(404, 'Webhook not found.');
    if (!id && hooks.length >= MAX_WEBHOOKS)
      return problem(400, `At most ${MAX_WEBHOOKS} webhooks.`);
    let made: ReturnType<typeof webhookFrom>;
    try {
      made = webhookFrom(input, saved, () => globalThis.crypto.randomUUID());
    } catch (error) {
      if (error instanceof InvalidWebhook) return problem(400, error.message);
      throw error;
    }
    const { webhook, secret } = made;
    if (secret === null) await ctx.secrets.delete(siteId, secretName(webhook.id));
    else if (secret !== undefined) await ctx.secrets.set(siteId, secretName(webhook.id), secret);
    const next = saved
      ? hooks.map((w) => (w.id === webhook.id ? webhook : w))
      : [...hooks, webhook];
    await ctx.storage.set(siteId, WEBHOOKS_KEY, next);
    return { body: await state(siteId) };
  }

  route('POST', '/webhooks', async (request) =>
    save(request.siteId, (request.body ?? {}) as WebhookInput),
  );
  route('PUT', '/webhooks/:id', async (request) =>
    save(request.siteId, (request.body ?? {}) as WebhookInput, request.params.id),
  );
  route('DELETE', '/webhooks/:id', async (request) => {
    const hooks = await webhooksOfSite(request.siteId);
    const id = request.params.id ?? '';
    if (!hooks.some((w) => w.id === id)) return problem(404, 'Webhook not found.');
    await ctx.storage.set(
      request.siteId,
      WEBHOOKS_KEY,
      hooks.filter((w) => w.id !== id),
    );
    await ctx.secrets.delete(request.siteId, secretName(id));
    return { body: await state(request.siteId) };
  });

  // "Send a test": a sample message, now, with the answer.
  route('POST', '/webhooks/:id/test', async (request) => {
    const webhook = (await webhooksOfSite(request.siteId)).find((w) => w.id === request.params.id);
    if (!webhook) return problem(404, 'Webhook not found.');
    const result = await post(
      request.siteId,
      webhook,
      samplePayload(
        webhook,
        request.origin,
        typeof (request.body as { locale?: unknown } | null)?.locale === 'string'
          ? (request.body as { locale: string }).locale
          : 'en',
      ),
    );
    const body: TestResult = {
      ok: classify(result.status) === 'sent',
      httpStatus: result.status,
      error: result.error,
    };
    return { body };
  });

  // "Try again" on a failed delivery that still has its values.
  route('POST', '/deliveries/:id/retry', async (request) => {
    const id = request.params.id ?? '';
    const [row] = await ctx.db.transaction(request.siteId, (tx) =>
      tx
        .update(deliveries)
        .set({
          status: 'queued',
          attempts: 0,
          nextAt: new Date(),
          error: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(deliveries.id, id),
            eq(deliveries.status, 'failed'),
            sql`${deliveries.payload} is not null`,
          ),
        )
        .returning({ id: deliveries.id }),
    );
    if (!row) return problem(404, 'This delivery cannot be tried again.');
    await sendDue(request.siteId, row.id);
    return { body: await state(request.siteId) };
  });
}

/**
 * What the privacy policy says about the webhooks: the services that receive
 * the forms' messages, by host, in the policy's language.
 */
export function policySection(
  webhooks: Webhook[],
  locale: string,
): { title: string; text: string }[] {
  const enabled = webhooks.filter((w) => w.enabled);
  const hosts = [...new Set(enabled.map((w) => hostOf(w.url)).filter(Boolean))];
  if (hosts.length === 0) return [];
  const list = hosts.join(', ');
  const technical = enabled.some((w) => w.includeIp || w.includeUserAgent);
  const lang = locale.toLowerCase().slice(0, 2);
  if (lang === 'it')
    return [
      {
        title: 'Invio dei moduli ad altri servizi',
        text: `Quando ci scrivi con un modulo del sito, i dati che inserisci (ad esempio nome, email, telefono e messaggio)${technical ? ', insieme all’indirizzo IP o al browser usato,' : ''} sono inviati anche a questi servizi, che li ricevono per nostro conto per gestire la tua richiesta: ${list}. La base giuridica è la tua richiesta (art. 6.1.b GDPR). Se un servizio si trova fuori dall’Unione europea, il trasferimento avviene con le garanzie previste dagli artt. 44–49 GDPR, come una decisione di adeguatezza o le clausole contrattuali standard.`,
      },
    ];
  if (lang === 'es')
    return [
      {
        title: 'Envío de los formularios a otros servicios',
        text: `Cuando nos escribes con un formulario del sitio, los datos que introduces (por ejemplo nombre, email, teléfono y mensaje)${technical ? ', junto con la dirección IP o el navegador usado,' : ''} se envían también a estos servicios, que los reciben por cuenta nuestra para gestionar tu petición: ${list}. La base jurídica es tu petición (art. 6.1.b RGPD). Si un servicio está fuera de la Unión Europea, la transferencia se realiza con las garantías de los artículos 44–49 RGPD, como una decisión de adecuación o las cláusulas contractuales tipo.`,
      },
    ];
  return [
    {
      title: 'Forms sent to other services',
      text: `When you write to us through a form of the site, the data you enter (for example name, email, phone and message)${technical ? ', together with your IP address or browser,' : ''} is also sent to these services, which receive it on our behalf to handle your request: ${list}. The legal basis is your request (Art. 6(1)(b) GDPR). If a service is outside the European Union, the transfer takes place with the safeguards of Articles 44–49 GDPR, such as an adequacy decision or the standard contractual clauses.`,
    },
  ];
}

export default definePlugin({
  async onActivate(site, ctx) {
    await ctx.storage.set(site.id, ACTIVE_KEY, true);
  },
  async onDeactivate(site, ctx) {
    await ctx.storage.delete(site.id, ACTIVE_KEY);
  },
  setup(ctx: PluginContext) {
    setupZaphook(ctx);
  },
});
