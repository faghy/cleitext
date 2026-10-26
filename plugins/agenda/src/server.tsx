/**
 * Agenda (official plugin): appointments booked from the site. Services
 * with weekly hours, a booking block (block editor, Fresco, Prisma's
 * containers, the `[agenda]` shortcode), emails with the calendar file and
 * links to cancel or move without an account, reminders, an admin with a
 * list and a calendar, CSV export, importers from Simply Schedule
 * Appointments and Booking Calendar. The free version takes 30 bookings
 * (`model/limit.ts`); Agenda Pro lifts the limit through `pro.ts`.
 */
import {
  definePlugin,
  defineBlock,
  type PluginContext,
  type RouteRequest,
} from '@cleitext/plugin-sdk';
import { randomBytes } from 'node:crypto';
import {
  BLOCK_TYPE,
  CACHE_TAG,
  CAPABILITY,
  FORM_ID,
  MARKER,
  NAME,
  PUBLIC_BASE,
  SLUG,
} from './config';
import { icsOf, linksOf, mailer, type SiteInfo } from './emails';
import { parseSsa } from './import/ssa';
import {
  blockFromShortcode,
  isBookingShortcode,
  replaceShortcodes,
  type BlockAttrs,
} from './import/shortcodes';
import type { ImportPlan } from './import/types';
import { parseWpbc } from './import/wpbc';
import { toCsv } from './model/csv';
import { limitState } from './model/limit';
import {
  emailList,
  isEmail,
  normalizeException,
  normalizeService,
  normalizeSettings,
  serviceText,
  str,
} from './model/normalize';
import { bookingConversion } from './model/conversion';
import { formOf, readAnswers } from './model/form';
import { stringsFor } from './model/strings';
import { addDays, daysBetween, isDate, isTimeZone, localDate, formatWhen } from './model/time';
import { readLink } from './model/tokens';
import {
  STATUSES,
  type Appointment,
  type EmailKind,
  type EmailText,
  type Service,
  type Settings,
  type Status,
} from './model/types';
import { newsletterCheckbox, newsletterSubscribe, newsletterTicked } from './newsletter-optin';
import { appointmentPage, invalidLinkPage } from './page';
import { bookingLimit, installServerApi, notify, type AgendaServerApi } from './pro';
import { BookingWidget, type BlockView, type WidgetConfig } from './render';
import { BookingError, databaseStore, UUID, type AvailabilityContext, type Store } from './store';

declare module '@cleitext/plugin-sdk' {
  interface Actions {
    /** A booking was stored (from the site or the admin). */
    'agenda.booked': { appointment: Appointment };
    /** An appointment changed status or time. */
    'agenda.changed': { appointment: Appointment; previous: Appointment };
  }
}

const API_BASE = `/api/v1/ext/${SLUG}`;
const SETTINGS_KEY = 'settings';
const ORIGIN_KEY = 'origin';
const LIMIT_MAIL_KEY = 'limit-mailed';
const ACTIVE_KEY = 'active';
const STAGING_KEY = 'import-files';
const LINK_SECRET = 'link-key';
const DAY = 86400_000;

const AI_GUIDE = `Online appointments are handled by **Agenda** (admin → Agenda): services with their weekly hours, appointments, settings. Never imitate a booking calendar with forms or HTML. Show the booking calendar with the **${BLOCK_TYPE}** block: \`{ "type": "${BLOCK_TYPE}", "attrs": { "service": "<service id, optional>", "view": "month" } }\` (without \`service\` the visitor chooses among the active services; \`view\` is \`month\` or \`week\`). The services are listed by \`GET ${API_BASE}/options\`. A shortcode \`[agenda]\` alone in a paragraph also works.`;

const body = (request: RouteRequest) =>
  (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;

/** A per-process limiter: enough against casual abuse. */
const hits = new Map<string, number[]>();
function allowed(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) return false;
  list.push(now);
  hits.set(key, list);
  if (hits.size > 20_000) hits.clear();
  return true;
}

export default definePlugin({
  async onActivate(site, ctx) {
    await ctx.storage.set(site.id, ACTIVE_KEY, true);
  },
  async onDeactivate(site, ctx) {
    await ctx.storage.delete(site.id, ACTIVE_KEY);
  },

  setup(ctx: PluginContext) {
    const store: Store = databaseStore(ctx);
    const api: AgendaServerApi = installServerApi();
    const mail = mailer(ctx);
    const warn = (message: string) => ctx.log.warn(message);

    ctx.access.defineCapability(CAPABILITY, {
      label: {
        en: `Manage appointments (${NAME.en})`,
        it: `Gestire gli appuntamenti (${NAME.it})`,
      },
      roles: ['administrator', 'editor'],
    });

    // ---- Helpers ---------------------------------------------------------------------

    const settingsOf = async (siteId: string): Promise<Settings> =>
      normalizeSettings(await ctx.storage.get(siteId, SETTINGS_KEY));

    const origins = new Map<string, string>();
    /** The site's address as visitors reach it, kept for emails sent by scheduled tasks. */
    async function rememberOrigin(siteId: string, origin: string | undefined) {
      if (!origin || !/^https?:\/\/[^/]+$/.test(origin) || origins.get(siteId) === origin) return;
      origins.set(siteId, origin);
      await ctx.storage.set(siteId, ORIGIN_KEY, origin).catch(() => undefined);
    }

    async function siteInfo(
      siteId: string,
      settings: Settings,
      origin?: string,
    ): Promise<SiteInfo> {
      const site = await ctx.site(siteId);
      const zone = settings.timezone || site.timezone || 'UTC';
      return {
        name: site.name,
        defaultLocale: site.defaultLocale,
        locales: site.locales,
        timeZone: isTimeZone(zone) ? zone : 'UTC',
        origin:
          origin ??
          origins.get(siteId) ??
          (await ctx.storage.get<string>(siteId, ORIGIN_KEY)) ??
          '',
      };
    }

    const keys = new Map<string, Promise<string>>();
    function linkKey(siteId: string): Promise<string> {
      let key = keys.get(siteId);
      if (!key) {
        key = (async () => {
          let raw = await ctx.secrets.get(siteId, LINK_SECRET);
          if (!raw) {
            raw = randomBytes(32).toString('hex');
            await ctx.secrets.set(siteId, LINK_SECRET, raw);
          }
          return raw;
        })();
        key.catch(() => keys.delete(siteId));
        keys.set(siteId, key);
      }
      return key;
    }

    async function availability(
      siteId: string,
      settings: Settings,
      timeZone: string,
    ): Promise<AvailabilityContext> {
      return {
        timeZone,
        shared: settings.shared,
        now: Date.now(),
        limit: await bookingLimit(api, siteId, warn),
        async blocked(service, from, to) {
          const out: { start: number; end: number }[] = [];
          for (const provider of api.blocked) {
            try {
              out.push(...(await provider({ siteId, service, from, to })));
            } catch (error) {
              warn(`An Agenda busy-times provider failed: ${String(error)}`);
            }
          }
          return out;
        },
      };
    }

    async function limitOf(siteId: string) {
      const [used, limit] = await Promise.all([
        store.countForLimit(siteId),
        bookingLimit(api, siteId, warn),
      ]);
      return limitState(used, limit);
    }

    /** One email to the administrators when the limit is reached (again after it was lifted). */
    async function limitReached(siteId: string, site: SiteInfo, settings: Settings, limit: number) {
      if (await ctx.storage.get(siteId, LIMIT_MAIL_KEY)) return;
      await ctx.storage.set(siteId, LIMIT_MAIL_KEY, new Date().toISOString());
      await mail.limit(siteId, site, settings, limit, api.upgradeUrl);
    }

    const adminLink = (site: SiteInfo, appointment: Appointment) =>
      `${site.origin}/cl-admin/ext/${SLUG}?appointment=${appointment.id}`;

    /** Emails, extensions and hooks after a change; never fails the request. */
    function after(siteId: string, work: () => Promise<void>) {
      void work().catch((error: unknown) =>
        ctx.log.error('Agenda: after a change', { error: String(error) }),
      );
      void ctx.cache.invalidate(siteId, [CACHE_TAG]).catch(() => undefined);
    }

    function announceBooked(
      siteId: string,
      appointment: Appointment,
      service: Service,
      site: SiteInfo,
      settings: Settings,
      notifyCustomer = true,
    ) {
      after(siteId, async () => {
        const links = linksOf(await linkKey(siteId), appointment, service, site);
        if (notifyCustomer)
          await mail.customer(
            siteId,
            appointment.status === 'pending' ? 'pending' : 'confirmed',
            appointment,
            service,
            site,
            settings,
            links,
          );
        await mail.admin(
          siteId,
          appointment.status === 'pending' ? 'pending' : 'new',
          appointment,
          service,
          site,
          settings,
          adminLink(site, appointment),
        );
        await notify(api.booked, { siteId, appointment, service }, warn);
        await ctx.hooks.emit('agenda.booked', { appointment }, { siteId });
        await announceConversion(siteId, appointment, null, service);
      });
    }

    /** A confirmed booking is a lead for affiliate programs (plugin API 1.58). */
    async function announceConversion(
      siteId: string,
      appointment: Appointment,
      previous: Appointment | null,
      service: Service,
    ) {
      if (!ctx.conversions) return;
      const outcome = bookingConversion(
        appointment,
        previous,
        serviceText(service, appointment.locale).name,
        appointment.status === 'confirmed' ? await store.referralsOf(siteId, appointment.id) : {},
      );
      if (outcome?.kind === 'paid') ctx.conversions.paid(siteId, outcome.conversion);
      else if (outcome?.kind === 'reversed') ctx.conversions.reversed(siteId, outcome.reversal);
    }

    function announceChanged(
      siteId: string,
      appointment: Appointment,
      previous: Appointment,
      service: Service,
      site: SiteInfo,
      settings: Settings,
      options: { customer?: boolean; admin?: boolean } = {},
    ) {
      after(siteId, async () => {
        const links = linksOf(await linkKey(siteId), appointment, service, site);
        const moved = appointment.start !== previous.start;
        const kind =
          appointment.status === 'cancelled' && previous.status !== 'cancelled'
            ? 'cancelled'
            : moved
              ? 'rescheduled'
              : appointment.status === 'confirmed' && previous.status === 'pending'
                ? 'confirmed'
                : null;
        if (kind && options.customer !== false)
          await mail.customer(siteId, kind, appointment, service, site, settings, links);
        if (options.admin && (kind === 'cancelled' || kind === 'rescheduled'))
          await mail.admin(
            siteId,
            kind,
            appointment,
            service,
            site,
            settings,
            adminLink(site, appointment),
          );
        await notify(api.changed, { siteId, appointment, service, previous }, warn);
        await ctx.hooks.emit('agenda.changed', { appointment, previous }, { siteId });
        await announceConversion(siteId, appointment, previous, service);
      });
    }

    function serviceView(service: Service, locale: string): WidgetConfig['services'][number] {
      const t = serviceText(service, locale);
      return {
        id: service.id,
        name: t.name,
        duration: service.duration,
        price: t.price,
        color: service.color,
        capacity: service.capacity,
      };
    }

    // ---- The block ---------------------------------------------------------------------

    async function blockView(
      attrs: BlockAttrs,
      siteId: string,
      locale: string,
      signedIn: boolean,
      preview: boolean,
      uid: string,
    ): Promise<BlockView> {
      const settings = await settingsOf(siteId);
      const site = await siteInfo(siteId, settings);
      const all = await store.listServices(siteId);
      let fixed: Service | null = null;
      const ref = str(attrs.service, 80);
      if (UUID.test(ref)) fixed = all.find((s) => s.id === ref) ?? null;
      else if (attrs.ref) fixed = await store.serviceByRef(siteId, str(attrs.ref, 120));
      if (fixed?.status === 'archived') fixed = null;
      const category = str(attrs.category, 100);
      const services = fixed
        ? [fixed]
        : all.filter((s) => s.status === 'active' && (!category || s.category === category));
      const limit = await limitOf(siteId);
      const challenge =
        services.length > 0 && !limit.reached
          ? ((await ctx.forms
              ?.challenge({ siteId, form: FORM_ID, locale, signedIn })
              .catch(() => '')) ?? '')
          : '';
      // "Subscribe me to the newsletter", when the NewLetter plugin offers it.
      const newsletter =
        services.length > 0 && !limit.reached
          ? await newsletterCheckbox({ siteId, locale, source: 'agenda' })
          : null;
      return {
        uid,
        preview,
        newsletter,
        heading: str(attrs.heading, 200),
        limitReached: limit.reached,
        challenge,
        services,
        settings: {
          phone: settings.phone,
          privacyUrl: settings.privacyUrl,
          contact: settings.contact || (emailList(settings.notify)[0] ?? ''),
        },
        config: {
          api: API_BASE,
          manage: `${PUBLIC_BASE}/appointment`,
          locale,
          timeZone: site.timeZone,
          view: attrs.view === 'week' ? 'week' : 'month',
          fixed: fixed?.id ?? null,
          services: services.map((s) => serviceView(s, locale)),
          strings: stringsFor(locale),
        },
      };
    }

    ctx.blocks.register(
      defineBlock<BlockAttrs, BlockView>({
        type: BLOCK_TYPE,
        title: { en: 'Booking (Agenda)', it: 'Prenotazione (Agenda)' },
        description: {
          en: 'A calendar to book an appointment: the free times of your services.',
          it: 'Un calendario per prenotare un appuntamento: gli orari liberi dei tuoi servizi.',
        },
        icon: 'calendar-alt',
        category: 'widgets',
        attributes: [
          {
            name: 'service',
            type: 'text',
            maxLength: 80,
            label: { en: 'Service', it: 'Servizio' },
            help: {
              en: 'Empty: the visitor chooses among the active services.',
              it: 'Vuoto: il visitatore sceglie tra i servizi attivi.',
            },
          },
          {
            name: 'view',
            type: 'select',
            label: { en: 'Calendar', it: 'Calendario' },
            default: 'month',
            options: [
              { value: 'month', label: { en: 'Month', it: 'Mese' } },
              { value: 'week', label: { en: 'Week', it: 'Settimana' } },
            ],
          },
          {
            name: 'category',
            type: 'text',
            maxLength: 100,
            label: { en: 'Only the services of a category', it: 'Solo i servizi di una categoria' },
          },
          { name: 'heading', type: 'text', maxLength: 200, label: { en: 'Heading', it: 'Titolo' } },
          { name: 'ref', type: 'text', maxLength: 120, label: 'Import', hidden: true },
        ],
        async load(attrs, context) {
          context.tag(CACHE_TAG);
          return blockView(
            attrs,
            context.siteId,
            context.locale,
            context.signedIn === true,
            false,
            `ag-${randomBytes(4).toString('hex')}`,
          );
        },
        render: ({ data, block, context }) => (
          <BookingWidget
            view={{
              ...data,
              preview: context.preview === true,
              uid: `ag-${block.id.replace(/[^\w-]/g, '').slice(0, 40) || data.uid}`,
            }}
          />
        ),
      }),
    );

    ctx.assets.enqueue({
      file: 'agenda.css',
      when: ({ html }) => html.includes(`${MARKER}=`) || html.includes('ag-appointment'),
    });
    ctx.assets.enqueue({ file: 'agenda.js', when: ({ html }) => html.includes(`${MARKER}=`) });

    // `[agenda]` standing alone in a paragraph, a shortcode or an HTML block.
    ctx.hooks.filter('render.blocks', (blocks) => replaceShortcodes(blocks));
    // `[ssa_booking]`, `[booking]` and `[agenda]` of WordPress pages, on import (plugin API 1.36).
    ctx.hooks.filter(
      'import.shortcode',
      (blocks, { tag, attrs }) =>
        blocks ??
        (isBookingShortcode(tag)
          ? [blockFromShortcode(tag, attrs, `b_${randomBytes(8).toString('hex')}`)]
          : null),
    );

    // ---- Public API (the widget) -------------------------------------------------------

    const today = (timeZone: string) => localDate(Date.now(), timeZone);

    ctx.routes.api({
      method: 'GET',
      path: '/public/slots',
      public: true,
      async handler(request) {
        if (!allowed(`slots|${request.siteId}|${request.ip}`, 240, 10 * 60_000))
          return { status: 429, body: { code: 'busy', message: 'Too many requests.' } };
        const settings = await settingsOf(request.siteId);
        const site = await siteInfo(request.siteId, settings);
        let service = await store.getService(request.siteId, String(request.query.service ?? ''));
        let ignoreId: string | undefined;
        if (request.query.token) {
          const claims = readLink(await linkKey(request.siteId), request.query.token);
          const appointment = claims ? await store.getAppointment(request.siteId, claims.id) : null;
          if (!appointment || appointment.sequence !== claims!.seq)
            return { status: 404, body: { code: 'link' } };
          service = await store.getService(request.siteId, appointment.serviceId);
          ignoreId = appointment.id;
        } else {
          const limit = await limitOf(request.siteId);
          if (limit.reached)
            return {
              body: {
                limit: true,
                contact: settings.contact || (emailList(settings.notify)[0] ?? ''),
                slots: [],
                next: null,
                timeZone: site.timeZone,
              },
              headers: { 'cache-control': 'no-store' },
            };
        }
        if (!service || service.status === 'archived')
          return { status: 404, body: { code: 'service' } };
        const first = today(site.timeZone);
        let from = isDate(request.query.from) ? request.query.from : first;
        if (from < addDays(first, -1)) from = addDays(first, -1);
        let to = isDate(request.query.to) ? request.query.to : addDays(from, 30);
        if (daysBetween(from, to) > 62 || to < from) to = addDays(from, 62);
        const context = await availability(request.siteId, settings, site.timeZone);
        const slots = await store.slots(request.siteId, service, from, to, context, { ignoreId });
        // Nothing in the range: the first day with a free time, up to a year ahead.
        let next: string | null = null;
        if (slots.length === 0) {
          const horizon = service.maxNotice ? Math.ceil(service.maxNotice / 1440) + 1 : 366;
          for (
            let start = addDays(to, 1);
            daysBetween(first, start) <= horizon;
            start = addDays(start, 62)
          ) {
            const found = await store.slots(
              request.siteId,
              service,
              start,
              addDays(start, 61),
              context,
              { ignoreId },
            );
            if (found[0]) {
              next = localDate(found[0].start, site.timeZone);
              break;
            }
          }
        }
        return {
          headers: { 'cache-control': 'no-store' },
          body: {
            timeZone: site.timeZone,
            slots: slots.map((s) => ({
              start: new Date(s.start).toISOString(),
              end: new Date(s.end).toISOString(),
              left: s.left,
            })),
            next,
          },
        };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/public/book',
      public: true,
      async handler(request) {
        const input = body(request);
        const siteId = request.siteId;
        await rememberOrigin(siteId, request.origin);
        const settings = await settingsOf(siteId);
        const site = await siteInfo(siteId, settings, request.origin);
        const locale = str(input.locale, 10) || site.defaultLocale;
        const s = stringsFor(locale);
        // Bots fill the hidden field: answer as if it went through.
        if (str(input.website, 200))
          return {
            status: 201,
            body: {
              status: 'confirmed',
              start: str(input.start, 40),
              email: str(input.email, 200),
            },
          };
        if (!allowed(`book|${siteId}|${request.ip}`, 10, 10 * 60_000))
          return { status: 429, body: { code: 'busy', message: s.error } };
        const service = await store.getService(siteId, str(input.service, 40));
        if (!service || service.status === 'archived')
          return { status: 404, body: { code: 'service', message: s.unavailable } };
        const start = Date.parse(str(input.start, 40));
        // Checked against the service's form as it is now; existing bookings keep their answers.
        const answers = readAnswers(
          formOf(service, settings.phone),
          input,
          stringsFor(site.defaultLocale),
        );
        const { name, email, phone, fields } = answers;
        const bad = answers.bad;
        if (input.consent !== true && input.consent !== '1') bad.push('consent');
        if (Number.isNaN(start)) bad.push('start');
        if (bad.length)
          return { status: 400, body: { code: 'invalid', message: s.invalid, fields: bad } };

        const verdict = await ctx.forms?.verify({
          siteId,
          form: FORM_ID,
          locale,
          fields: Object.fromEntries(
            Object.entries(input).filter(([, v]) => typeof v === 'string'),
          ) as Record<string, string>,
          ip: request.ip,
          host: (request.headers.host ?? '').replace(/:\d+$/, ''),
          signedIn: request.user !== null,
        });
        if (verdict && !verdict.ok) {
          if (verdict.silent)
            return {
              status: 201,
              body: { status: 'confirmed', start: new Date(start).toISOString(), email },
            };
          return {
            status: 403,
            body: {
              code: 'check',
              message: verdict.message ?? s.error,
              challenge: verdict.challenge === true,
            },
          };
        }

        const context = await availability(siteId, settings, site.timeZone);
        try {
          const { appointment, used } = await store.book(
            siteId,
            {
              serviceId: service.id,
              start,
              status: service.approval ? 'pending' : 'confirmed',
              name,
              email,
              phone,
              fields,
              locale,
              timezone: isTimeZone(input.timezone) ? input.timezone : '',
              source: 'site',
              consent: true,
              ...(request.referrals ? { referrals: request.referrals } : {}),
            },
            context,
          );
          if (used >= context.limit) await limitReached(siteId, site, settings, context.limit);
          announceBooked(siteId, appointment, service, site, settings);
          // The visitor ticked "Subscribe me to the newsletter" (opt-in, never by default).
          if (newsletterTicked(input.cx_newsletter))
            await newsletterSubscribe({
              siteId,
              source: 'agenda',
              email,
              ...(name ? { name } : {}),
              locale,
              ip: request.ip,
            });
          const links = linksOf(await linkKey(siteId), appointment, service, site);
          return {
            status: 201,
            body: {
              status: appointment.status,
              start: appointment.start,
              end: appointment.end,
              email,
              manageUrl: links.manageUrl,
              icsUrl: links.icsUrl,
              googleUrl: links.googleUrl,
            },
          };
        } catch (error) {
          if (!(error instanceof BookingError)) throw error;
          if (error.code === 'limit') {
            await limitReached(siteId, site, settings, context.limit);
            return {
              status: 409,
              body: {
                code: 'limit',
                message: s.limit,
                contact: settings.contact || (emailList(settings.notify)[0] ?? ''),
              },
            };
          }
          if (error.code === 'service')
            return { status: 404, body: { code: 'service', message: s.unavailable } };
          return { status: 409, body: { code: 'taken', message: s.taken } };
        }
      },
    });

    /** The appointment of a link, when the link is valid and current. */
    async function fromLink(siteId: string, token: unknown) {
      const claims = readLink(await linkKey(siteId), token);
      if (!claims) return null;
      const appointment = await store.getAppointment(siteId, claims.id);
      if (!appointment || appointment.sequence !== claims.seq || appointment.anonymized)
        return null;
      const service = await store.getService(siteId, appointment.serviceId);
      return service ? { appointment, service } : null;
    }

    const canChange = (appointment: Appointment, settings: Settings) =>
      (appointment.status === 'confirmed' || appointment.status === 'pending') &&
      Date.parse(appointment.start) - Date.now() > settings.changeNoticeHours * 3600_000;

    ctx.routes.api({
      method: 'POST',
      path: '/public/reschedule',
      public: true,
      async handler(request) {
        const input = body(request);
        const siteId = request.siteId;
        const found = await fromLink(siteId, input.token);
        const settings = await settingsOf(siteId);
        const s = stringsFor(found?.appointment.locale || request.locale);
        if (!found) return { status: 404, body: { code: 'link', message: s.linkInvalid } };
        if (!settings.allowReschedule || !canChange(found.appointment, settings))
          return { status: 409, body: { code: 'late', message: s.tooLate } };
        const start = Date.parse(str(input.start, 40));
        if (Number.isNaN(start))
          return { status: 400, body: { code: 'invalid', message: s.error } };
        const site = await siteInfo(siteId, settings, request.origin);
        try {
          const { appointment, previous, service } = await store.reschedule(
            siteId,
            found.appointment.id,
            start,
            await availability(siteId, settings, site.timeZone),
          );
          announceChanged(siteId, appointment, previous, service, site, settings, { admin: true });
          return {
            body: {
              ok: true,
              start: appointment.start,
              manageUrl: linksOf(await linkKey(siteId), appointment, service, site).manageUrl,
            },
          };
        } catch (error) {
          if (!(error instanceof BookingError)) throw error;
          return { status: 409, body: { code: 'taken', message: s.taken } };
        }
      },
    });

    // ---- The appointment's page ---------------------------------------------------------

    ctx.routes.public({
      method: 'GET',
      path: `${PUBLIC_BASE}/appointment`,
      async handler(request) {
        const siteId = request.siteId;
        const settings = await settingsOf(siteId);
        const found = await fromLink(siteId, request.query.t);
        const locale = found?.appointment.locale || request.locale;
        const s = stringsFor(locale);
        const headers = { 'cache-control': 'no-store', 'referrer-policy': 'same-origin' };
        if (!found)
          return {
            status: 404,
            headers,
            page: { title: s.yourAppointment, html: invalidLinkPage(s) },
          };
        const site = await siteInfo(siteId, settings, request.origin);
        const token = String(request.query.t);
        return {
          headers,
          page: {
            title: s.yourAppointment,
            html: appointmentPage({
              ...found,
              settings,
              strings: s,
              locale,
              timeZone: site.timeZone,
              token,
              canChange: canChange(found.appointment, settings),
              done: str(request.query.done, 20),
              widget: {
                api: API_BASE,
                manage: `${PUBLIC_BASE}/appointment`,
                locale,
                timeZone: site.timeZone,
                view: 'month',
                fixed: found.service.id,
                token,
                services: [serviceView(found.service, locale)],
                strings: s,
              },
            }),
          },
        };
      },
    });

    ctx.routes.public({
      method: 'POST',
      path: `${PUBLIC_BASE}/appointment`,
      async handler(request) {
        const input = body(request);
        const siteId = request.siteId;
        const token = str(input.t, 400);
        const site0 = await ctx.site(siteId);
        const prefix =
          request.locale !== site0.defaultLocale && site0.locales.includes(request.locale)
            ? `/${request.locale}`
            : '';
        const page = (t: string, done: string) =>
          `${prefix}${PUBLIC_BASE}/appointment?t=${encodeURIComponent(t)}${done ? `&done=${done}` : ''}`;
        const back = (done: string) => ({ status: 303, headers: { location: page(token, done) } });
        const found = await fromLink(siteId, token);
        if (!found || input.action !== 'cancel') return back('');
        const settings = await settingsOf(siteId);
        if (!settings.allowCancel || !canChange(found.appointment, settings)) return back('');
        const site = await siteInfo(siteId, settings, request.origin);
        const context = await availability(siteId, settings, site.timeZone);
        const changed = await store.setStatus(siteId, found.appointment.id, 'cancelled', context);
        if (!changed) return back('');
        announceChanged(
          siteId,
          changed.appointment,
          changed.previous,
          found.service,
          site,
          settings,
          { admin: true },
        );
        // The link changes with the sequence: the new one shows the cancelled appointment.
        const links = linksOf(await linkKey(siteId), changed.appointment, found.service, site);
        return { status: 303, headers: { location: page(links.token, 'cancelled') } };
      },
    });

    ctx.routes.public({
      method: 'GET',
      path: `${PUBLIC_BASE}/appointment.ics`,
      async handler(request) {
        const found = await fromLink(request.siteId, request.query.t);
        if (!found)
          return { status: 404, body: 'Not found', contentType: 'text/plain; charset=utf-8' };
        const settings = await settingsOf(request.siteId);
        const site = await siteInfo(request.siteId, settings, request.origin);
        const links = linksOf(
          await linkKey(request.siteId),
          found.appointment,
          found.service,
          site,
        );
        return {
          body: icsOf(found.appointment, found.service, site, links),
          contentType: 'text/calendar; charset=utf-8',
          headers: {
            'cache-control': 'no-store',
            'content-disposition': 'attachment; filename="appointment.ics"',
          },
        };
      },
    });

    // ---- Scheduled tasks ---------------------------------------------------------------

    ctx.schedule.every('reminders', 10, async (siteId) => {
      const settings = await settingsOf(siteId);
      if (!settings.reminders) return;
      const due = await store.takeDueReminders(siteId, Date.now(), settings.reminderHours);
      if (due.length === 0) return;
      const site = await siteInfo(siteId, settings);
      const key = await linkKey(siteId);
      for (const appointment of due) {
        const service = await store.getService(siteId, appointment.serviceId);
        if (!service) continue;
        await mail.customer(
          siteId,
          'reminder',
          appointment,
          service,
          site,
          settings,
          linksOf(key, appointment, service, site),
        );
      }
    });

    ctx.schedule.every('retention', 60, async (siteId) => {
      const settings = await settingsOf(siteId);
      if (settings.retentionMonths <= 0) return;
      const before = new Date();
      before.setUTCMonth(before.getUTCMonth() - settings.retentionMonths);
      const n = await store.anonymizeBefore(siteId, before.getTime());
      if (n > 0)
        ctx.log.info(`Agenda: personal data of ${n} past appointment(s) erased`, { siteId });
    });

    // ---- Privacy ---------------------------------------------------------------------

    ctx.privacy.registerExporter({
      id: SLUG,
      label: { en: 'Appointments', it: 'Appuntamenti' },
      async export(siteId, email) {
        const list = await store.byEmail(siteId, email);
        if (list.length === 0) return [];
        const services = new Map(
          (await store.listServices(siteId, { archived: true })).map((s) => [s.id, s.name]),
        );
        return [
          {
            id: `${SLUG}.appointments`,
            label: { en: 'Appointments', it: 'Appuntamenti' },
            items: list.map((a) => ({
              ...Object.fromEntries(a.fields.map((f) => [f.label, f.value])),
              service: services.get(a.serviceId) ?? '',
              start: a.start,
              end: a.end,
              status: a.status,
              name: a.name,
              email: a.email,
              phone: a.phone,
              booked: a.createdAt,
            })),
          },
        ];
      },
    });
    ctx.privacy.registerEraser({
      id: SLUG,
      label: { en: 'Appointments', it: 'Appuntamenti' },
      async erase(siteId, email) {
        return { removed: await store.eraseEmail(siteId, email), retained: 0 };
      },
    });

    // A section of the privacy policy made by the Privacy plugin (Privacy 1.x registry).
    const policy = ((globalThis as unknown as Record<symbol, unknown>)[
      Symbol.for('cleitext.privacy.policySections')
    ] ??= new Map()) as Map<
      string,
      (input: { siteId: string; locale: string }) => Promise<{ title: string; text: string }[]>
    >;
    policy.set(SLUG, async ({ siteId, locale }) => {
      if (!(await ctx.storage.get(siteId, ACTIVE_KEY))) return [];
      const settings = await settingsOf(siteId);
      const it = locale.toLowerCase().startsWith('it');
      const months = settings.retentionMonths;
      return [
        {
          title: it ? 'Prenotazione di appuntamenti' : 'Booking appointments',
          text: it
            ? `Se prenoti un appuntamento dal sito usiamo nome, email, telefono, le risposte che ci dai e l’orario scelto per gestire l’appuntamento, mandarti la conferma, un promemoria e i link per annullarlo o spostarlo (art. 6.1.b GDPR). I dati restano nel database del sito e non sono ceduti a terzi. ${months > 0 ? `Sono cancellati automaticamente ${months} mesi dopo l’appuntamento.` : 'Sono conservati per il tempo necessario a gestire gli appuntamenti.'}`
            : `If you book an appointment on the site, we use your name, email, phone, the answers you give and the time you chose to manage the appointment, send you the confirmation, a reminder and the links to cancel or move it (Art. 6(1)(b) GDPR). The data stay in the site’s database and are not passed on. ${months > 0 ? `They are erased automatically ${months} months after the appointment.` : 'They are kept as long as needed to manage the appointments.'}`,
        },
      ];
    });

    ctx.ai?.addContext({ title: `Appointments (${NAME.en})`, markdown: () => AI_GUIDE });

    // ---- Admin API -------------------------------------------------------------------

    const adminRoute = (
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      handler: Parameters<typeof ctx.routes.api>[0]['handler'],
    ) => ctx.routes.api({ method, path, capability: CAPABILITY, handler });

    adminRoute('GET', '/overview', async (request) => {
      const siteId = request.siteId;
      const settings = await settingsOf(siteId);
      const site = await siteInfo(siteId, settings);
      const limit = await limitOf(siteId);
      const now = Date.now();
      const upcoming = await store.upcoming(siteId, now, now + 30 * DAY);
      const todayEnd = Date.parse(`${addDays(today(site.timeZone), 1)}T00:00:00Z`) + 2 * DAY;
      const services = await store.listServices(siteId);
      return {
        body: {
          limit,
          upgradeUrl: api.upgradeUrl,
          timeZone: site.timeZone,
          setupDone: settings.setupDone || services.length > 0,
          services: services.length,
          phone: settings.phone,
          today: upcoming.filter(
            (a) => localDate(Date.parse(a.start), site.timeZone) === today(site.timeZone),
          ).length,
          week: upcoming.filter((a) => Date.parse(a.start) < now + 7 * DAY).length,
          pending: upcoming.filter((a) => a.status === 'pending').length,
          next: upcoming.slice(0, 5),
          todayEnd,
        },
      };
    });

    // The admin edits the whole form: services saved before 1.0.1 get their standard fields.
    adminRoute('GET', '/services', async (request) => {
      const { phone } = await settingsOf(request.siteId);
      const list = await store.listServices(request.siteId, {
        archived: request.query.archived === '1',
      });
      return { body: list.map((s) => ({ ...s, fields: formOf(s, phone) })) };
    });
    adminRoute('POST', '/services', async (request) => {
      const { phone } = await settingsOf(request.siteId);
      const input = normalizeService(body(request));
      const service = await store.createService(request.siteId, {
        ...input,
        fields: formOf(input, phone),
      });
      await ctx.cache.invalidate(request.siteId, [CACHE_TAG]);
      return { status: 201, body: service };
    });
    adminRoute('PUT', '/services/:id', async (request) => {
      const service = await store.updateService(
        request.siteId,
        request.params.id ?? '',
        normalizeService(body(request)),
      );
      if (!service) return { status: 404, body: { message: 'Service not found.' } };
      await ctx.cache.invalidate(request.siteId, [CACHE_TAG]);
      return { body: service };
    });
    adminRoute('DELETE', '/services/:id', async (request) => {
      const outcome = await store.removeService(request.siteId, request.params.id ?? '');
      if (!outcome) return { status: 404, body: { message: 'Service not found.' } };
      await ctx.cache.invalidate(request.siteId, [CACHE_TAG]);
      return { body: { outcome } };
    });

    adminRoute('GET', '/exceptions', async (request) => ({
      body: await store.listExceptions(
        request.siteId,
        isDate(request.query.from) ? request.query.from : undefined,
      ),
    }));
    adminRoute('POST', '/exceptions', async (request) => {
      const e = normalizeException(body(request));
      if (!e) return { status: 400, body: { message: 'Choose valid dates.' } };
      const saved = await store.saveException(request.siteId, e);
      await ctx.cache.invalidate(request.siteId, [CACHE_TAG]);
      return { status: 201, body: saved };
    });
    adminRoute('PUT', '/exceptions/:id', async (request) => {
      const e = normalizeException(body(request));
      if (!e || !UUID.test(request.params.id ?? ''))
        return { status: 400, body: { message: 'Choose valid dates.' } };
      const saved = await store.saveException(request.siteId, e, request.params.id);
      return saved ? { body: saved } : { status: 404, body: { message: 'Not found.' } };
    });
    adminRoute('DELETE', '/exceptions/:id', async (request) =>
      (await store.removeException(request.siteId, request.params.id ?? ''))
        ? { body: { ok: true } }
        : { status: 404, body: { message: 'Not found.' } },
    );

    const queryOf = (request: RouteRequest) => {
      const statuses = String(request.query.status ?? '')
        .split(',')
        .filter((x): x is Status => (STATUSES as readonly string[]).includes(x));
      const from = Date.parse(String(request.query.from ?? ''));
      const to = Date.parse(String(request.query.to ?? ''));
      return {
        ...(Number.isNaN(from) ? {} : { from }),
        ...(Number.isNaN(to) ? {} : { to }),
        ...(statuses.length ? { status: statuses } : {}),
        ...(request.query.service ? { serviceId: String(request.query.service) } : {}),
        ...(request.query.q ? { search: str(request.query.q, 100) } : {}),
        order: request.query.order === 'desc' ? ('desc' as const) : ('asc' as const),
      };
    };

    adminRoute('GET', '/appointments', async (request) => {
      const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 1000);
      const offset = Math.max(Number(request.query.offset) || 0, 0);
      return {
        body: await store.listAppointments(request.siteId, { ...queryOf(request), limit, offset }),
      };
    });

    adminRoute('GET', '/appointments/:id', async (request) => {
      const a = await store.getAppointment(request.siteId, request.params.id ?? '');
      return a ? { body: a } : { status: 404, body: { message: 'Appointment not found.' } };
    });

    adminRoute('GET', '/export.csv', async (request) => {
      const siteId = request.siteId;
      const settings = await settingsOf(siteId);
      const site = await siteInfo(siteId, settings);
      const { items } = await store.listAppointments(siteId, { ...queryOf(request), limit: 5000 });
      const services = new Map(
        (await store.listServices(siteId, { archived: true })).map((s) => [s.id, s.name]),
      );
      const it = (request.query.lang ?? site.defaultLocale).startsWith('it');
      const extra = [...new Set(items.flatMap((a) => a.fields.map((f) => f.label)))];
      const rows: unknown[][] = [
        [
          ...(it
            ? [
                'Data',
                'Ora',
                'Fine',
                'Servizio',
                'Stato',
                'Nome',
                'Email',
                'Telefono',
                'Note',
                'Origine',
                'Prenotato il',
              ]
            : [
                'Date',
                'Time',
                'End',
                'Service',
                'Status',
                'Name',
                'Email',
                'Phone',
                'Notes',
                'Source',
                'Booked on',
              ]),
          ...extra,
        ],
        ...items.map((a) => {
          const start = Date.parse(a.start);
          const end = formatWhen(Date.parse(a.end), site.timeZone, 'en-GB');
          return [
            localDate(start, site.timeZone),
            formatWhen(start, site.timeZone, 'en-GB').time,
            end.time,
            services.get(a.serviceId) ?? '',
            a.status,
            a.name,
            a.email,
            a.phone,
            a.notes,
            a.source,
            a.createdAt.slice(0, 10),
            ...extra.map((label) => a.fields.find((f) => f.label === label)?.value ?? ''),
          ];
        }),
      ];
      return {
        body: toCsv(rows),
        contentType: 'text/csv; charset=utf-8',
        headers: {
          'content-disposition': `attachment; filename="${SLUG}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      };
    });

    adminRoute('GET', '/slots', async (request) => {
      const settings = await settingsOf(request.siteId);
      const site = await siteInfo(request.siteId, settings);
      const service = await store.getService(request.siteId, String(request.query.service ?? ''));
      if (!service) return { status: 404, body: { message: 'Service not found.' } };
      const from = isDate(request.query.from) ? request.query.from : today(site.timeZone);
      const to =
        isDate(request.query.to) && daysBetween(from, request.query.to) <= 62
          ? request.query.to
          : addDays(from, 13);
      const slots = await store.slots(
        request.siteId,
        service,
        from,
        to,
        await availability(request.siteId, settings, site.timeZone),
      );
      return {
        body: {
          timeZone: site.timeZone,
          slots: slots.map((s) => ({
            start: new Date(s.start).toISOString(),
            end: new Date(s.end).toISOString(),
            left: s.left,
          })),
        },
      };
    });

    /** A manual booking: the administrator may book outside the weekly hours, never over another appointment. */
    adminRoute('POST', '/appointments', async (request) => {
      const input = body(request);
      const siteId = request.siteId;
      await rememberOrigin(siteId, request.origin);
      const settings = await settingsOf(siteId);
      const site = await siteInfo(siteId, settings, request.origin);
      const service = await store.getService(siteId, str(input.serviceId, 40));
      if (!service) return { status: 400, body: { code: 'service', message: 'Choose a service.' } };
      const start = Date.parse(str(input.start, 40));
      const email = str(input.email, 200).toLowerCase();
      const name = str(input.name, 200);
      if (Number.isNaN(start))
        return { status: 400, body: { code: 'invalid', message: 'Choose a date and a time.' } };
      if (!name)
        return { status: 400, body: { code: 'invalid', message: 'Write the customer’s name.' } };
      if (email && !isEmail(email))
        return {
          status: 400,
          body: { code: 'invalid', message: 'The email address is not valid.' },
        };
      const status: Status = input.status === 'pending' ? 'pending' : 'confirmed';
      const context = await availability(siteId, settings, site.timeZone);
      try {
        const { appointment, used } = await store.book(
          siteId,
          {
            serviceId: service.id,
            start,
            seats: Number(input.seats) || 1,
            status,
            name,
            email,
            phone: str(input.phone, 40),
            fields: [],
            notes: str(input.notes, 5000),
            locale: str(input.locale, 10) || site.defaultLocale,
            timezone: '',
            source: 'admin',
            consent: false,
          },
          context,
          { admin: true },
        );
        if (used >= context.limit) await limitReached(siteId, site, settings, context.limit);
        announceBooked(
          siteId,
          appointment,
          service,
          site,
          { ...settings, notify: '' },
          input.notify !== false && !!email,
        );
        return { status: 201, body: appointment };
      } catch (error) {
        if (!(error instanceof BookingError)) throw error;
        const messages: Record<string, string> = {
          limit: 'The free version takes 30 bookings: Agenda Pro takes as many as you need.',
          taken: 'This time is taken by another appointment.',
          service: 'This service does not take bookings.',
        };
        return {
          status: 409,
          body: {
            code: error.code,
            message: messages[error.code] ?? 'Not possible.',
            upgradeUrl: api.upgradeUrl,
          },
        };
      }
    });

    adminRoute('PATCH', '/appointments/:id', async (request) => {
      const input = body(request);
      const siteId = request.siteId;
      const id = request.params.id ?? '';
      const settings = await settingsOf(siteId);
      await rememberOrigin(siteId, request.origin);
      const site = await siteInfo(siteId, settings, request.origin);
      const context = await availability(siteId, settings, site.timeZone);
      const customer = input.notify !== false;
      try {
        let current = await store.getAppointment(siteId, id);
        if (!current) return { status: 404, body: { message: 'Appointment not found.' } };
        const service = await store.getService(siteId, current.serviceId);
        if (!service) return { status: 404, body: { message: 'Service not found.' } };
        const details: Record<string, string> = {};
        for (const k of ['name', 'phone', 'notes'] as const)
          if (typeof input[k] === 'string') details[k] = str(input[k], k === 'notes' ? 5000 : 200);
        if (typeof input.email === 'string') {
          const email = str(input.email, 200).toLowerCase();
          if (email && !isEmail(email))
            return { status: 400, body: { message: 'The email address is not valid.' } };
          details.email = email;
        }
        if (Object.keys(details).length)
          current = (await store.updateDetails(siteId, id, details)) ?? current;
        if (
          typeof input.start === 'string' &&
          Date.parse(input.start) !== Date.parse(current.start)
        ) {
          const moved = await store.reschedule(siteId, id, Date.parse(input.start), context, {
            admin: true,
          });
          announceChanged(siteId, moved.appointment, moved.previous, service, site, settings, {
            customer,
          });
          current = moved.appointment;
        }
        if (
          typeof input.status === 'string' &&
          (STATUSES as readonly string[]).includes(input.status) &&
          input.status !== current.status
        ) {
          const changed = await store.setStatus(siteId, id, input.status as Status, context);
          if (changed) {
            announceChanged(
              siteId,
              changed.appointment,
              changed.previous,
              service,
              site,
              settings,
              { customer },
            );
            current = changed.appointment;
          }
        }
        await ctx.cache.invalidate(siteId, [CACHE_TAG]);
        return { body: current };
      } catch (error) {
        if (!(error instanceof BookingError)) throw error;
        return {
          status: 409,
          body: {
            code: error.code,
            message:
              error.code === 'taken'
                ? 'This time is taken by another appointment.'
                : 'Not possible.',
          },
        };
      }
    });

    adminRoute('GET', '/settings', async (request) => {
      const settings = await settingsOf(request.siteId);
      const site = await ctx.site(request.siteId);
      return {
        body: {
          settings,
          siteTimeZone: site.timezone ?? null,
          locales: site.locales,
          defaultLocale: site.defaultLocale,
        },
      };
    });
    adminRoute('PUT', '/settings', async (request) => {
      const before = await settingsOf(request.siteId);
      const next = normalizeSettings({ ...before, ...body(request) });
      await ctx.storage.set(request.siteId, SETTINGS_KEY, next);
      await ctx.cache.invalidate(request.siteId, [CACHE_TAG]);
      return { body: next };
    });

    // The first-run wizard: a service and the settings in one call (the page is made by the admin).
    adminRoute('POST', '/setup', async (request) => {
      const input = body(request);
      const siteId = request.siteId;
      const before = await settingsOf(siteId);
      const settings = normalizeSettings({
        ...before,
        notify: typeof input.notify === 'string' ? input.notify : before.notify,
        timezone: typeof input.timezone === 'string' ? input.timezone : before.timezone,
        setupDone: true,
      });
      await ctx.storage.set(siteId, SETTINGS_KEY, settings);
      const service = input.service
        ? await store.createService(siteId, normalizeService(input.service))
        : null;
      await ctx.cache.invalidate(siteId, [CACHE_TAG]);
      return { status: 201, body: { settings, service } };
    });

    // ---- Import ------------------------------------------------------------------------

    interface Staged {
      name: string;
      content: string;
    }
    const staged = async (siteId: string) =>
      (await ctx.storage.get<Staged[]>(siteId, STAGING_KEY)) ?? [];

    adminRoute('POST', '/import/files', async (request) => {
      const file = await request.file();
      if (!file) return { status: 400, body: { message: 'Choose a file.' } };
      if (file.data.length > 8 * 1024 * 1024)
        return { status: 413, body: { message: 'The file is too large (8 MB at most).' } };
      const name = file.filename.slice(0, 200);
      // The same file uploaded again replaces the one before (else it would be read twice).
      const list = [
        ...(await staged(request.siteId)).filter((f) => f.name !== name),
        { name, content: file.data.toString('utf8') },
      ].slice(-5);
      await ctx.storage.set(request.siteId, STAGING_KEY, list);
      return { body: { files: list.map((f) => ({ name: f.name, size: f.content.length })) } };
    });
    adminRoute('DELETE', '/import/files', async (request) => {
      await ctx.storage.delete(request.siteId, STAGING_KEY);
      return { body: { files: [] } };
    });
    adminRoute('GET', '/import/files', async (request) => ({
      body: {
        files: (await staged(request.siteId)).map((f) => ({
          name: f.name,
          size: f.content.length,
        })),
      },
    }));

    /**
     * The other plugin's settings, without undoing what was set here: its
     * addresses join the notified ones, its email texts fill the kinds that
     * have no text of the site yet. What changed, for the report.
     */
    const importSettings = async (
      siteId: string,
      plan: ImportPlan,
      before: Settings,
    ): Promise<{ notify: string[]; emails: string[]; shared: boolean | null }> => {
      const done = {
        notify: [] as string[],
        emails: [] as string[],
        shared: null as boolean | null,
      };
      const from = plan.settings;
      if (!from) return done;
      const notify = emailList(before.notify);
      for (const address of from.notify)
        if (!notify.includes(address)) {
          notify.push(address);
          done.notify.push(address);
        }
      const site = await ctx.site(siteId);
      const locale = from.locale ?? site.defaultLocale.split('-')[0]!;
      const own = { ...(before.emails[locale] ?? {}) };
      for (const [kind, text] of Object.entries(from.emails) as [EmailKind, EmailText][])
        if (!own[kind]) {
          own[kind] = text;
          done.emails.push(`${kind} (${locale})`);
        }
      if (from.shared !== undefined && from.shared !== before.shared) done.shared = from.shared;
      const next = normalizeSettings({
        ...before,
        notify: notify.join(', '),
        emails: { ...before.emails, [locale]: own },
        shared: from.shared ?? before.shared,
      });
      await ctx.storage.set(siteId, SETTINGS_KEY, next);
      return done;
    };

    adminRoute('POST', '/import/run', async (request) => {
      const input = body(request);
      const siteId = request.siteId;
      const files = await staged(siteId);
      if (files.length === 0)
        return { status: 400, body: { message: 'Upload the file to import first.' } };
      const settings = await settingsOf(siteId);
      const site = await siteInfo(siteId, settings);
      let plan: ImportPlan;
      try {
        plan =
          input.kind === 'wpbc'
            ? parseWpbc(files, site.timeZone)
            : files
                .map((f) => parseSsa(f.content, f.name))
                .reduce((all, p) => ({
                  ...all,
                  timezone: all.timezone ?? p.timezone,
                  services: [...all.services, ...p.services],
                  exceptions: [...all.exceptions, ...p.exceptions],
                  appointments: [...all.appointments, ...p.appointments],
                  settings: all.settings ?? p.settings,
                  notes: [...all.notes, ...p.notes],
                }));
      } catch (error) {
        return {
          status: 400,
          body: { message: error instanceof Error ? error.message : 'The file could not be read.' },
        };
      }
      const now = Date.now();
      const summary = {
        services: plan.services.map((s) => ({
          name: s.service.name,
          duration: s.service.duration,
          status: s.service.status,
          bufferBefore: s.service.bufferBefore,
          bufferAfter: s.service.bufferAfter,
        })),
        appointments: plan.appointments.length,
        future: plan.appointments.filter((a) => a.start > now && a.status !== 'cancelled').length,
        exceptions: plan.exceptions.length,
        timezone: plan.timezone,
        siteTimeZone: site.timeZone,
        notes: plan.notes,
      };
      if (input.dryRun === true) return { body: { preview: summary } };
      const result = {
        ...(await store.importPlan(siteId, plan)),
        settings: await importSettings(siteId, plan, settings),
      };
      await ctx.storage.delete(siteId, STAGING_KEY);
      await ctx.cache.invalidate(siteId, [CACHE_TAG]);
      return { body: { preview: summary, result } };
    });

    // The site's services, for the block editor's and Fresco's pickers.
    ctx.routes.api({
      method: 'GET',
      path: '/options',
      capability: 'edit_entries',
      async handler(request) {
        const list = await store.listServices(request.siteId);
        return {
          body: list.map((s) => ({
            value: s.id,
            label: s.name,
            status: s.status,
            category: s.category,
          })),
        };
      },
    });
  },
});
