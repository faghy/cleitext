/**
 * The `forms.delivered` extension point (Forms 1.9.0, plugin API 1.73).
 *
 * Every message Forms delivers (sent directly, or held as spam and then
 * released) is offered to the plugins that provide `forms.delivered`, after
 * it is stored and before the email is sent:
 *
 *   ctx.services?.provide('forms.delivered', {
 *     async delivered(siteId, message: DeliveredMessage) {
 *       // enqueue only: no network calls here
 *       return { skipMail: false };
 *     },
 *   });
 *
 * A provider may answer `{ skipMail: true }`: the email is then not sent
 * (the message stays in Messages). Providers must only put the message aside
 * (e.g. in their own table) and do the slow work later, in a scheduled task:
 * the visitor is waiting for the page. A provider that fails is logged and
 * left out; the message is delivered anyway.
 */
import type { PluginContext } from '@cleitext/plugin-sdk';
import type { FieldValue } from './fields';

/** What a `forms.delivered` provider is given. */
export interface DeliveredMessage {
  /** The id of the stored message (Messages). */
  messageId: string;
  /** The form's name, as set in the block. */
  form: string;
  /**
   * Every named field the visitor sent, by name: a text, or a list for
   * fields with several values (checkboxes). Internal fields are left out:
   * the ones starting with `_`, the hidden anti-bot field, captcha tokens.
   */
  fields: Record<string, string | string[]>;
  /** The page the form was sent from: its path, and its full address when known. */
  page: { path: string; url?: string; title?: string };
  /** The language of the page. */
  locale: string;
  /** When the visitor sent it (ISO 8601). */
  submittedAt: string;
  ip?: string;
  userAgent?: string;
}

/** What a provider may answer. */
export interface DeliveredAnswer {
  /** Do not send the notification email for this message. */
  skipMail?: boolean;
}

/** Fields that are not the visitor's: internal, anti-bot, captchas. */
const INTERNAL =
  /^(_|website$|cl_as|cl-captcha|cf-turnstile|g-recaptcha|h-captcha|frc-captcha)|captcha|challenge/i;
const MAX_FIELDS = 100;
const MAX_TEXT = 5000;

const textOf = (value: unknown): string | null =>
  typeof value === 'string'
    ? value.trim().slice(0, MAX_TEXT)
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : null;

/**
 * The visitor's fields of a message, by name. The values checked by Forms
 * (trimmed, emails in lowercase, numbers normalized) take the place of the
 * ones sent; checkboxes with several choices stay lists.
 */
export function submittedFields(
  body: Record<string, unknown>,
  checked: FieldValue[] | null,
  classic: { name: string; email: string; phone: string | null; message: string } | null,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  let count = 0;
  for (const [key, raw] of Object.entries(body)) {
    if (count >= MAX_FIELDS) break;
    if (!key || key.length > 100 || INTERNAL.test(key)) continue;
    if (Array.isArray(raw)) {
      const list = raw
        .map(textOf)
        .filter((v): v is string => v !== null && v !== '')
        .slice(0, 100);
      out[key] = list;
    } else {
      const value = textOf(raw);
      if (value === null) continue;
      out[key] = value;
    }
    count++;
  }
  if (checked) {
    for (const field of checked) {
      if (INTERNAL.test(field.name)) continue;
      const sent = out[field.name];
      out[field.name] =
        field.type === 'checkbox' && Array.isArray(sent) && sent.length > 0
          ? [...new Set(sent)]
          : field.value;
    }
  } else if (classic) {
    out.name = classic.name;
    out.email = classic.email;
    out.message = classic.message;
    if (classic.phone !== null || 'phone' in out) out.phone = classic.phone ?? '';
  }
  return out;
}

/**
 * Offers a delivered message to every `forms.delivered` provider. True when
 * one of them asked not to send the email. Never throws.
 */
export async function notifyDelivered(
  ctx: PluginContext,
  siteId: string,
  message: DeliveredMessage,
): Promise<{ skipMail: boolean }> {
  let skipMail = false;
  let providers: { plugin: string; service: Record<string, unknown> }[] = [];
  try {
    providers = (await ctx.services?.all(siteId, 'forms.delivered')) ?? [];
  } catch (error) {
    ctx.log.warn(`forms.delivered: ${String(error)}`);
  }
  for (const { plugin, service } of providers) {
    try {
      const delivered = service.delivered as
        ((s: string, m: DeliveredMessage) => Promise<DeliveredAnswer | null | void>) | undefined;
      if (typeof delivered !== 'function') continue;
      const answer = await delivered(siteId, message);
      if (answer && typeof answer === 'object' && answer.skipMail === true) skipMail = true;
    } catch (error) {
      ctx.log.warn(`forms.delivered of ${plugin}: ${String(error)}`);
    }
  }
  return { skipMail };
}
