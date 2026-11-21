/**
 * A push notification of the official app for each delivered message
 * (Forms 1.10.0, plugin API 1.78): to the people with `manage_forms` who
 * chose "form messages" in the app. Missing on older cores.
 */
import { adminUrl, type PluginContext, type PushNotification } from '@cleitext/plugin-sdk';
import type { FieldValue } from './fields';

export interface PushedMessage {
  id: string;
  formName: string;
  name: string;
  email: string;
  message: string;
  data: FieldValue[] | null;
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** "New message — Contact" / "Ada: Hello…" */
export function messageNotification(message: PushedMessage): PushNotification {
  const form = oneLine(message.formName).slice(0, 60);
  const fields = message.data ?? [];
  const who =
    oneLine(message.name) ||
    oneLine(message.email) ||
    oneLine(fields.find((f) => f.type === 'email' || f.name === 'name')?.value ?? '');
  const text =
    oneLine(message.message) ||
    oneLine(
      fields
        .filter((f) => f.value && f.type !== 'email')
        .map((f) => f.value)
        .join(' · '),
    );
  const body = [who, text].filter(Boolean).join(': ');
  return {
    event: 'form.message',
    id: message.id,
    title: { en: `New message — ${form}`, it: `Nuovo messaggio — ${form}` },
    body: body.length > 300 ? `${body.slice(0, 299)}…` : body,
    adminPath: adminUrl('/ext/forms/messages'),
  };
}

/** Never throws, never waits: the visitor is waiting for the page. */
export function pushMessage(ctx: PluginContext, siteId: string, message: PushedMessage): void {
  try {
    ctx.push?.notify(siteId, messageNotification(message));
  } catch (error) {
    ctx.log.warn(`Push notification not sent: ${String(error)}`);
  }
}
