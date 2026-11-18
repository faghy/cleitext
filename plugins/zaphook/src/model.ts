/**
 * Zaphook's rules, without the database or the network: webhooks and their
 * checks, which messages go where, the JSON sent, the signature, what an
 * answer means and when to try again.
 */

/** A webhook as saved (its secret is kept apart, in the plugin's secrets). */
export interface Webhook {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  /** Every form, or only the forms named in `forms`. */
  scope: 'all' | 'selected';
  forms: string[];
  includeIp: boolean;
  includeUserAgent: boolean;
  /** Do not send the notification email for the messages this webhook gets. */
  skipMail: boolean;
  /** A signing secret is set (its value is never given back). */
  hasSecret: boolean;
  /**
   * Values sent with every message, at the root of the JSON (since 1.1.0),
   * e.g. a product code the automation expects. They win over a form field
   * with the same name.
   */
  fixedFields: FixedField[];
}

/** A value sent with every message of a webhook. */
export interface FixedField {
  name: string;
  value: string;
}

export const MAX_FIXED_FIELDS = 20;

/** The fixed fields as saved: a name not starting with `_`, a value, each name once. */
export function fixedFieldsOf(value: unknown): FixedField[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: FixedField[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim().slice(0, 80) : '';
    const fieldValue = typeof row.value === 'string' ? row.value.slice(0, 1000) : '';
    if (!name || name.startsWith('_') || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, value: fieldValue });
    if (out.length === MAX_FIXED_FIELDS) break;
  }
  return out;
}

/** What the admin sends to save a webhook: `secret` set replaces it, `''` clears it. */
export interface WebhookInput {
  id?: string;
  label?: unknown;
  url?: unknown;
  enabled?: unknown;
  scope?: unknown;
  forms?: unknown;
  includeIp?: unknown;
  includeUserAgent?: unknown;
  skipMail?: unknown;
  secret?: unknown;
  fixedFields?: unknown;
}

/** A message delivered by Forms (`forms.delivered`, Forms 1.9.0). */
export interface DeliveredMessage {
  messageId: string;
  form: string;
  fields: Record<string, string | string[]>;
  page: { path: string; url?: string; title?: string };
  locale: string;
  submittedAt: string;
  ip?: string;
  userAgent?: string;
}

export const MAX_WEBHOOKS = 20;
/** The log keeps this many deliveries per site. */
export const LOG_SIZE = 200;
/** The waits before each new attempt; after the last one, the delivery has failed. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];
/** A failed delivery keeps its payload this long, to be tried again by hand. */
export const FAILED_KEEP_MS = 7 * 24 * 3_600_000;

export class InvalidWebhook extends Error {}

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** An https address a webhook can be sent to; null when it is not one. */
export function webhookUrl(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (!url.hostname.includes('.') && !url.hostname.includes(':')) return null;
  return url.toString();
}

/** The host of a webhook's address, as shown and logged (never the full address). */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * A webhook from what the admin sent, merged with the saved one. Throws
 * InvalidWebhook with a message for the admin.
 */
export function webhookFrom(
  input: WebhookInput,
  saved: Webhook | null,
  newId: () => string,
): { webhook: Webhook; secret: string | null | undefined } {
  const url = webhookUrl(input.url ?? saved?.url);
  if (!url) throw new InvalidWebhook('The address must be a full https:// address.');
  const forms = Array.isArray(input.forms)
    ? [...new Set(input.forms.map((f) => text(f, 80)).filter(Boolean))].slice(0, 50)
    : (saved?.forms ?? []);
  const scope = input.scope === 'selected' ? 'selected' : input.scope === 'all' ? 'all' : null;
  const flag = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;
  // undefined: keep; '' or null: clear; text: replace.
  let secret: string | null | undefined;
  if (input.secret === null || input.secret === '') secret = null;
  else if (typeof input.secret === 'string') {
    secret = input.secret.trim();
    if (secret.length < 8 || secret.length > 200)
      throw new InvalidWebhook('The secret must be 8 to 200 characters long.');
  }
  const webhook: Webhook = {
    id: saved?.id ?? newId(),
    label: text(input.label, 80) || saved?.label || hostOf(url),
    url,
    enabled: flag(input.enabled, saved?.enabled ?? true),
    scope: scope ?? saved?.scope ?? 'all',
    forms,
    includeIp: flag(input.includeIp, saved?.includeIp ?? false),
    includeUserAgent: flag(input.includeUserAgent, saved?.includeUserAgent ?? false),
    skipMail: flag(input.skipMail, saved?.skipMail ?? false),
    hasSecret: secret === undefined ? (saved?.hasSecret ?? false) : secret !== null,
    fixedFields:
      input.fixedFields === undefined
        ? (saved?.fixedFields ?? [])
        : fixedFieldsOf(input.fixedFields),
  };
  if (webhook.scope === 'selected' && webhook.forms.length === 0)
    throw new InvalidWebhook('Choose at least one form, or send every form.');
  return { webhook, secret };
}

/** The saved webhooks, checked again (storage may hold older shapes). */
export function webhooksOf(stored: unknown): Webhook[] {
  if (!Array.isArray(stored)) return [];
  const out: Webhook[] = [];
  for (const item of stored as Partial<Webhook>[]) {
    if (!item || typeof item.id !== 'string') continue;
    const url = webhookUrl(item.url);
    if (!url) continue;
    out.push({
      id: item.id,
      label: text(item.label, 80) || hostOf(url),
      url,
      enabled: item.enabled !== false,
      scope: item.scope === 'selected' ? 'selected' : 'all',
      forms: Array.isArray(item.forms) ? item.forms.filter((f) => typeof f === 'string') : [],
      includeIp: item.includeIp === true,
      includeUserAgent: item.includeUserAgent === true,
      skipMail: item.skipMail === true,
      hasSecret: item.hasSecret === true,
      fixedFields: fixedFieldsOf(item.fixedFields),
    });
  }
  return out.slice(0, MAX_WEBHOOKS);
}

/** Whether a webhook gets the messages of a form. */
export function matches(webhook: Webhook, form: string): boolean {
  if (!webhook.enabled) return false;
  if (webhook.scope === 'all') return true;
  const name = form.trim().toLowerCase();
  return webhook.forms.some((f) => f.trim().toLowerCase() === name);
}

/**
 * The JSON sent for a message: the form's fields at the root, by name, as
 * the visitor sent them (lists stay lists), then Zaphook's own keys, which
 * start with `_`. The IP address and the browser only when the webhook asks.
 */
export function buildPayload(
  webhook: Pick<Webhook, 'includeIp' | 'includeUserAgent'> & { fixedFields?: FixedField[] },
  message: DeliveredMessage,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(message.fields)) {
    if (name.startsWith('_')) continue;
    if (typeof value === 'string') out[name] = value;
    else if (Array.isArray(value)) out[name] = value.filter((v) => typeof v === 'string');
  }
  // The webhook's fixed values (1.1.0), over a visitor's field with the same name.
  for (const field of webhook.fixedFields ?? []) out[field.name] = field.value;
  out._form = message.form;
  out._page_url = message.page.url ?? message.page.path;
  out._page_title = message.page.title ?? '';
  out._submitted_at = message.submittedAt;
  out._locale = message.locale;
  out._message_id = message.messageId;
  if (webhook.includeIp && message.ip) out._ip = message.ip;
  if (webhook.includeUserAgent && message.userAgent) out._user_agent = message.userAgent;
  return out;
}

/** A message to test a webhook with: sample values, and `_test: true`. */
export function samplePayload(
  webhook: Pick<Webhook, 'includeIp' | 'includeUserAgent'> & { fixedFields?: FixedField[] },
  origin: string,
  locale: string,
): Record<string, unknown> {
  const it = locale.toLowerCase().startsWith('it');
  return {
    ...buildPayload(webhook, {
      messageId: 'test',
      form: it ? 'Prova' : 'Test',
      fields: {
        name: 'Mario Rossi',
        email: 'mario.rossi@example.com',
        phone: '+39 012 345 6789',
        message: it
          ? 'Questo è un messaggio di prova di Zaphook.'
          : 'This is a Zaphook test message.',
      },
      page: { path: '/', url: `${origin}/`, title: it ? 'Prova' : 'Test' },
      locale,
      submittedAt: new Date().toISOString(),
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0 (Zaphook test)',
    }),
    _test: true,
  };
}

/** The visitor's email address in a payload, for privacy requests. */
export function emailOf(payload: Record<string, unknown>): string | null {
  const re = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  const values = Object.entries(payload)
    .filter(([name]) => !name.startsWith('_'))
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((v): v is string => typeof v === 'string');
  const found = values.find((v) => re.test(v.trim()));
  return found ? found.trim().toLowerCase().slice(0, 254) : null;
}

/** The headers of a signed request: `X-Zaphook-Signature: sha256=<hex>` of `<timestamp>.<body>`. */
export async function signature(
  secret: string,
  timestamp: string,
  body: string,
): Promise<Record<string, string>> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const hex = Buffer.from(mac).toString('hex');
  return { 'X-Zaphook-Timestamp': timestamp, 'X-Zaphook-Signature': `sha256=${hex}` };
}

export type Outcome = 'sent' | 'retry' | 'failed';

/** What an answer means: 2xx sent, 410 gone, 429 and 5xx later, other ones refused. */
export function classify(status: number | null): Outcome {
  if (status === null) return 'retry';
  if (status >= 200 && status < 300) return 'sent';
  if (status === 410) return 'failed';
  if (status === 429 || status >= 500) return 'retry';
  return 'failed';
}

/** When to try again after `attempts` attempts; null when it is time to give up. */
export function nextAttempt(attempts: number, now: number): Date | null {
  const wait = BACKOFF_MS[attempts - 1];
  return wait === undefined ? null : new Date(now + wait);
}

/**
 * An error as the log keeps it: one short line, without the webhook's
 * address (it may hold a key) or the secret.
 */
export function shortError(error: unknown, hide: (string | null | undefined)[] = []): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of hide) if (secret) message = message.split(secret).join('…');
  message = message
    .replace(/https?:\/\/\S+/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
  return message.length > 160 ? `${message.slice(0, 159)}…` : message;
}
