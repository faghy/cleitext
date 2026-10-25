/**
 * Sending Agenda's emails: the customer's (texts per language, the calendar
 * file attached), the administrators' notifications and the one email sent
 * when the free limit is reached. Sending never holds up a booking: errors
 * are logged.
 */
import type { PluginContext } from '@cleitext/plugin-sdk';
import { PRO_NAME, PUBLIC_BASE } from './config';
import { emailText, fill, textToHtml, type Values } from './model/emails';
import { buildIcs, googleCalendarUrl } from './model/ics';
import { emailList, serviceText } from './model/normalize';
import { formatWhen } from './model/time';
import { linkExpiry, signLink } from './model/tokens';
import type { Appointment, EmailKind, Service, Settings } from './model/types';

export interface SiteInfo {
  name: string;
  defaultLocale: string;
  locales: string[];
  timeZone: string;
  origin: string;
}

export interface Links {
  token: string;
  manageUrl: string;
  icsUrl: string;
  googleUrl: string;
}

/** Addresses of an appointment's page, in its language (`/it/…` when not the default). */
export function linksOf(
  key: string,
  appointment: Appointment,
  service: Service,
  site: SiteInfo,
): Links {
  const end = Date.parse(appointment.end);
  const token = signLink(key, {
    id: appointment.id,
    seq: appointment.sequence,
    exp: linkExpiry(end),
  });
  const locale = appointment.locale || site.defaultLocale;
  const prefix = locale !== site.defaultLocale && site.locales.includes(locale) ? `/${locale}` : '';
  const base = `${site.origin}${prefix}${PUBLIC_BASE}/appointment`;
  const t = serviceText(service, locale);
  return {
    token,
    manageUrl: `${base}?t=${token}`,
    icsUrl: `${site.origin}${PUBLIC_BASE}/appointment.ics?t=${token}`,
    googleUrl: googleCalendarUrl({
      start: Date.parse(appointment.start),
      end,
      summary: `${t.name} – ${site.name}`,
      description: `${base}?t=${token}`,
    }),
  };
}

export function icsOf(
  appointment: Appointment,
  service: Service,
  site: SiteInfo,
  links?: Links,
): string {
  const t = serviceText(service, appointment.locale || site.defaultLocale);
  const host = site.origin.replace(/^https?:\/\//, '') || 'cleitext';
  return buildIcs({
    uid: `${appointment.id}@${host}`,
    start: Date.parse(appointment.start),
    end: Date.parse(appointment.end),
    summary: `${t.name} – ${site.name}`,
    description: [t.description, links?.manageUrl].filter(Boolean).join('\n\n'),
    url: links?.manageUrl,
    sequence: appointment.sequence,
    status:
      appointment.status === 'cancelled'
        ? 'CANCELLED'
        : appointment.status === 'pending'
          ? 'TENTATIVE'
          : 'CONFIRMED',
  });
}

export function valuesOf(
  appointment: Appointment,
  service: Service,
  site: SiteInfo,
  links: Links | null,
): Values {
  const locale = appointment.locale || site.defaultLocale;
  const when = formatWhen(Date.parse(appointment.start), site.timeZone, locale);
  const t = serviceText(service, locale);
  return {
    name: appointment.name,
    service: t.name,
    date: when.date,
    time: when.time,
    timezone: site.timeZone.replace(/_/g, ' '),
    duration: String(
      Math.round((Date.parse(appointment.end) - Date.parse(appointment.start)) / 60000),
    ),
    price: t.price,
    site: site.name,
    manage_url: links?.manageUrl ?? '',
  };
}

export function mailer(ctx: PluginContext) {
  const send = (siteId: string, message: Parameters<PluginContext['mail']['send']>[0]) =>
    ctx.mail
      .send({ ...message, siteId })
      .catch((error: unknown) => ctx.log.error('Agenda: email not sent', { error: String(error) }));

  return {
    /** The customer's email of a kind, in the appointment's language. */
    async customer(
      siteId: string,
      kind: EmailKind,
      appointment: Appointment,
      service: Service,
      site: SiteInfo,
      settings: Settings,
      links: Links,
    ) {
      if (!appointment.email || appointment.anonymized) return;
      const locale = appointment.locale || site.defaultLocale;
      const text = emailText(settings, kind, locale, site.defaultLocale);
      const values = valuesOf(appointment, service, site, kind === 'cancelled' ? null : links);
      const body = fill(text.body, values);
      const withIcs = kind === 'confirmed' || kind === 'rescheduled' || kind === 'cancelled';
      const replyTo = emailList(settings.notify)[0];
      await send(siteId, {
        to: appointment.email,
        subject: fill(text.subject, values, true),
        text: body,
        html: textToHtml(body),
        fromName: site.name,
        ...(replyTo ? { replyTo } : {}),
        ...(withIcs
          ? {
              attachments: [
                {
                  filename: kind === 'cancelled' ? 'cancelled.ics' : 'appointment.ics',
                  content: icsOf(appointment, service, site, links),
                  contentType: `text/calendar; charset=utf-8; method=${kind === 'cancelled' ? 'CANCEL' : 'PUBLISH'}`,
                },
              ],
            }
          : {}),
      });
    },

    /** The administrators' notification, in the site's default language. */
    async admin(
      siteId: string,
      kind: 'new' | 'pending' | 'cancelled' | 'rescheduled',
      appointment: Appointment,
      service: Service,
      site: SiteInfo,
      settings: Settings,
      adminUrl: string,
    ) {
      const to = emailList(settings.notify);
      if (to.length === 0) return;
      const it = site.defaultLocale.startsWith('it');
      const v = valuesOf(
        appointment,
        service,
        { ...site, defaultLocale: site.defaultLocale },
        null,
      );
      const when = formatWhen(Date.parse(appointment.start), site.timeZone, site.defaultLocale);
      const titles = it
        ? {
            new: 'Nuova prenotazione',
            pending: 'Prenotazione da confermare',
            cancelled: 'Prenotazione annullata',
            rescheduled: 'Prenotazione spostata',
          }
        : {
            new: 'New booking',
            pending: 'Booking to confirm',
            cancelled: 'Booking cancelled',
            rescheduled: 'Booking moved',
          };
      const lines = [
        `${titles[kind]}: ${v.service}`,
        '',
        `${it ? 'Quando' : 'When'}: ${when.date}, ${when.time} (${v.timezone})`,
        `${it ? 'Nome' : 'Name'}: ${appointment.name}`,
        `Email: ${appointment.email}`,
        ...(appointment.phone ? [`${it ? 'Telefono' : 'Phone'}: ${appointment.phone}`] : []),
        ...appointment.fields.map((f) => `${f.label}: ${f.value}`),
        '',
        `${it ? 'Apri in Agenda' : 'Open in Agenda'}: ${adminUrl}`,
      ];
      const body = lines.join('\n');
      await send(siteId, {
        to,
        ...(appointment.email ? { replyTo: appointment.email } : {}),
        subject: `[${site.name}] ${titles[kind]}: ${v.service}, ${when.date} ${when.time}`,
        text: body,
        html: textToHtml(body),
      });
    },

    /** Sent once when the site reaches the free limit. */
    async limit(
      siteId: string,
      site: SiteInfo,
      settings: Settings,
      limit: number,
      upgradeUrl: string,
    ) {
      const to = emailList(settings.notify);
      if (to.length === 0) return false;
      const it = site.defaultLocale.startsWith('it');
      const body = it
        ? `Ciao,\n\nil sito ${site.name} ha raggiunto le ${limit} prenotazioni della versione gratuita di Agenda.\n\nLe prenotazioni già fatte restano valide: i clienti possono ancora annullarle o spostarle. Le nuove prenotazioni online sono sospese: chi visita la pagina vede i vostri contatti.\n\nPer continuare a ricevere prenotazioni senza limiti: ${PRO_NAME}, ${upgradeUrl}\n\nAgenda`
        : `Hello,\n\nthe site ${site.name} has reached the ${limit} bookings of Agenda's free version.\n\nThe bookings already made stay valid: customers can still cancel or move them. New online bookings are paused: visitors of the page see your contacts.\n\nTo keep taking bookings without limits: ${PRO_NAME}, ${upgradeUrl}\n\nAgenda`;
      await send(siteId, {
        to,
        subject: it
          ? `[${site.name}] Agenda: raggiunto il limite di ${limit} prenotazioni`
          : `[${site.name}] Agenda: the limit of ${limit} bookings is reached`,
        text: body,
        html: textToHtml(body),
      });
      return true;
    },
  };
}
