/**
 * The customers' emails: default texts in English and Italian, the site's
 * own texts per language (Settings → Emails, one tab per language of the
 * Multilingual plugin) and the placeholders filled in.
 */
import type { EmailKind, EmailText, Settings } from './types';

export const PLACEHOLDERS = [
  'name',
  'service',
  'date',
  'time',
  'timezone',
  'duration',
  'price',
  'site',
  'manage_url',
] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type Values = Record<Placeholder, string>;

const EN: Record<EmailKind, EmailText> = {
  confirmed: {
    subject: 'Your appointment is confirmed: {service}, {date} at {time}',
    body: 'Hello {name},\n\nyour appointment is confirmed.\n\n{service}\n{date} at {time} ({timezone})\nDuration: {duration} minutes\n\nThe calendar file is attached: open it to add the appointment to your calendar.\n\nTo cancel or move it: {manage_url}\n\nSee you soon,\n{site}',
  },
  pending: {
    subject: 'We received your request: {service}, {date} at {time}',
    body: 'Hello {name},\n\nwe received your request for {service} on {date} at {time} ({timezone}).\n\nWe will confirm it soon by email.\n\nTo cancel it: {manage_url}\n\n{site}',
  },
  cancelled: {
    subject: 'Appointment cancelled: {service}, {date} at {time}',
    body: 'Hello {name},\n\nyour appointment for {service} on {date} at {time} ({timezone}) has been cancelled.\n\nYou can book again on our site whenever you like.\n\n{site}',
  },
  rescheduled: {
    subject: 'Appointment moved: {service}, {date} at {time}',
    body: 'Hello {name},\n\nyour appointment has been moved.\n\n{service}\nNew time: {date} at {time} ({timezone})\n\nThe new calendar file is attached.\n\nTo cancel or move it again: {manage_url}\n\n{site}',
  },
  reminder: {
    subject: 'Reminder: {service}, {date} at {time}',
    body: 'Hello {name},\n\na reminder of your appointment:\n\n{service}\n{date} at {time} ({timezone})\n\nIf you cannot come, please cancel or move it: {manage_url}\n\nSee you soon,\n{site}',
  },
};

const IT: Record<EmailKind, EmailText> = {
  confirmed: {
    subject: 'Appuntamento confermato: {service}, {date} alle {time}',
    body: 'Ciao {name},\n\nil tuo appuntamento è confermato.\n\n{service}\n{date} alle {time} ({timezone})\nDurata: {duration} minuti\n\nIn allegato trovi il file del calendario: aprilo per aggiungere l’appuntamento al tuo calendario.\n\nPer annullarlo o spostarlo: {manage_url}\n\nA presto,\n{site}',
  },
  pending: {
    subject: 'Abbiamo ricevuto la tua richiesta: {service}, {date} alle {time}',
    body: 'Ciao {name},\n\nabbiamo ricevuto la tua richiesta per {service} il {date} alle {time} ({timezone}).\n\nTi confermeremo presto l’appuntamento via email.\n\nPer annullarla: {manage_url}\n\n{site}',
  },
  cancelled: {
    subject: 'Appuntamento annullato: {service}, {date} alle {time}',
    body: 'Ciao {name},\n\nil tuo appuntamento per {service} del {date} alle {time} ({timezone}) è stato annullato.\n\nPuoi prenotare di nuovo dal nostro sito quando vuoi.\n\n{site}',
  },
  rescheduled: {
    subject: 'Appuntamento spostato: {service}, {date} alle {time}',
    body: 'Ciao {name},\n\nil tuo appuntamento è stato spostato.\n\n{service}\nNuovo orario: {date} alle {time} ({timezone})\n\nIn allegato trovi il nuovo file del calendario.\n\nPer annullarlo o spostarlo di nuovo: {manage_url}\n\n{site}',
  },
  reminder: {
    subject: 'Promemoria: {service}, {date} alle {time}',
    body: 'Ciao {name},\n\nti ricordiamo il tuo appuntamento:\n\n{service}\n{date} alle {time} ({timezone})\n\nSe non puoi venire, annullalo o spostalo: {manage_url}\n\nA presto,\n{site}',
  },
};

export function defaultEmail(kind: EmailKind, locale: string): EmailText {
  return (locale.toLowerCase().startsWith('it') ? IT : EN)[kind];
}

/** The text of an email: the site's for the language, its default language's, or the built-in one. */
export function emailText(
  settings: Pick<Settings, 'emails'>,
  kind: EmailKind,
  locale: string,
  defaultLocale: string,
): EmailText {
  const lang = (l: string) => l.toLowerCase().split('-')[0]!;
  const ownOf = (l: string) => settings.emails[l]?.[kind] ?? settings.emails[lang(l)]?.[kind];
  // A language without built-in texts uses the default language's own ones first.
  const known = lang(locale) === 'en' || lang(locale) === 'it';
  const own = ownOf(locale) ?? (known ? undefined : ownOf(defaultLocale));
  const builtIn = defaultEmail(kind, known || !own ? locale : defaultLocale);
  return { subject: own?.subject || builtIn.subject, body: own?.body || builtIn.body };
}

export function fill(template: string, values: Partial<Values>, oneLine = false): string {
  const out = template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key as Placeholder] ?? '') : match,
  );
  return oneLine ? out.replace(/[\r\n]+/g, ' ').trim() : out;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A plain HTML version: paragraphs, with addresses made links. */
export function textToHtml(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map((p) =>
    escapeHtml(p)
      .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`)
      .replace(/\n/g, '<br>'),
  );
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1f2937">${paragraphs.map((p) => `<p>${p}</p>`).join('')}</body></html>`;
}
