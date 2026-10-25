/**
 * Agenda's tables (schema `plg_agenda`, Row Level Security). Bookings are
 * stored by `book`, inside a transaction that first locks the site's
 * services (`SELECT … FOR UPDATE`): two visitors asking for the same place
 * at the same moment are served one after the other, and the second one
 * sees the first one's appointment when the slot is checked again. The free
 * limit is checked in the same transaction.
 */
import type { PluginContext, PluginTransaction } from '@cleitext/plugin-sdk';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { boolean, date, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { ImportPlan } from './import/types';
import { COUNTED_SOURCES } from './model/limit';
import { normalizeException, normalizeService } from './model/normalize';
import { freeSlots, placesLeft, type Busy } from './model/slots';
import { localDate } from './model/time';
import {
  HOLDING,
  type Appointment,
  type Exception,
  type Service,
  type Source,
  type Status,
} from './model/types';

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  position: integer('position').notNull(),
  data: jsonb('data').notNull(),
  externalId: text('external_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const exceptions = pgTable('exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  serviceId: uuid('service_id'),
  dateFrom: date('date_from').notNull(),
  dateTo: date('date_to').notNull(),
  closed: boolean('closed').notNull(),
  hours: jsonb('hours').notNull(),
  note: text('note').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  serviceId: uuid('service_id').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  bufferBefore: integer('buffer_before').notNull(),
  bufferAfter: integer('buffer_after').notNull(),
  seats: integer('seats').notNull(),
  status: text('status').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  fields: jsonb('fields').notNull(),
  notes: text('notes').notNull(),
  locale: text('locale').notNull(),
  timezone: text('timezone').notNull(),
  source: text('source').notNull(),
  externalId: text('external_id'),
  sequence: integer('sequence').notNull(),
  consentAt: timestamp('consent_at', { withTimezone: true }),
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

type ServiceRow = typeof services.$inferSelect;
type AppointmentRow = typeof appointments.$inferSelect;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function serviceOf(row: ServiceRow): Service {
  return normalizeService({
    ...(row.data as object),
    id: row.id,
    name: row.name,
    status: row.status,
    position: row.position,
  });
}

function serviceColumns(service: Service) {
  const { name, status, position, ...rest } = service;
  const data: Partial<Service> = { ...rest };
  delete data.id;
  return { name, status, position, data };
}

export function appointmentOf(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    serviceId: row.serviceId,
    start: row.startsAt.toISOString(),
    end: row.endsAt.toISOString(),
    seats: row.seats,
    status: row.status as Status,
    name: row.name,
    email: row.email,
    phone: row.phone,
    fields: Array.isArray(row.fields) ? (row.fields as Appointment['fields']) : [],
    notes: row.notes,
    locale: row.locale,
    timezone: row.timezone,
    source: row.source as Source,
    externalId: row.externalId,
    bufferBefore: row.bufferBefore,
    bufferAfter: row.bufferAfter,
    sequence: row.sequence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    anonymized: row.anonymizedAt !== null,
  };
}

function exceptionOf(row: typeof exceptions.$inferSelect): Exception {
  return normalizeException(
    {
      id: row.id,
      serviceId: row.serviceId,
      from: row.dateFrom,
      to: row.dateTo,
      closed: row.closed,
      hours: row.hours,
      note: row.note,
    },
    row.id,
  )!;
}

const busyOf = (row: AppointmentRow): Busy => ({
  id: row.id,
  serviceId: row.serviceId,
  start: row.startsAt.getTime(),
  end: row.endsAt.getTime(),
  seats: row.seats,
  bufferBefore: row.bufferBefore,
  bufferAfter: row.bufferAfter,
});

/** Why a booking was refused. */
export type BookRefusal = 'service' | 'taken' | 'limit' | 'not-found' | 'status';

export class BookingError extends Error {
  constructor(readonly code: BookRefusal) {
    super(code);
  }
}

export interface BookInput {
  serviceId: string;
  start: number;
  seats?: number;
  status: Status;
  name: string;
  email: string;
  phone: string;
  fields: Appointment['fields'];
  notes?: string;
  locale: string;
  timezone: string;
  source: Exclude<Source, 'import'>;
  consent: boolean;
}

export interface AvailabilityContext {
  timeZone: string;
  shared: boolean;
  now: number;
  /** Bookings the site may take (Infinity: no limit). */
  limit: number;
  /** Times blocked by extensions. */
  blocked: (
    service: Service,
    from: number,
    to: number,
  ) => Promise<{ start: number; end: number }[]>;
}

export interface AppointmentQuery {
  from?: number;
  to?: number;
  status?: Status[];
  serviceId?: string;
  search?: string;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

const DAY = 86400_000;

export function databaseStore(ctx: PluginContext) {
  const run = <T>(siteId: string, fn: (tx: PluginTransaction) => Promise<T>) =>
    ctx.db.transaction<T>(siteId, fn);

  async function holdingBetween(tx: PluginTransaction, siteId: string, from: number, to: number) {
    const rows = await tx
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.siteId, siteId),
          inArray(appointments.status, HOLDING as Status[]),
          // A day of margin on each side: buffers reach outside the range.
          lt(appointments.startsAt, new Date(to + DAY)),
          gte(appointments.endsAt, new Date(from - DAY)),
        ),
      );
    return rows.map(busyOf);
  }

  async function exceptionsIn(tx: PluginTransaction, siteId: string, from: string, to: string) {
    const rows = await tx
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.siteId, siteId),
          lte(exceptions.dateFrom, to),
          gte(exceptions.dateTo, from),
        ),
      );
    return rows.map(exceptionOf);
  }

  async function countForLimit(tx: PluginTransaction, siteId: string): Promise<number> {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(appointments)
      .where(
        and(
          eq(appointments.siteId, siteId),
          inArray(appointments.source, COUNTED_SOURCES as Source[]),
        ),
      );
    return row?.n ?? 0;
  }

  /** Locks the site's services: bookings of the site are stored one at a time. */
  async function lockSite(tx: PluginTransaction, siteId: string): Promise<ServiceRow[]> {
    return tx
      .select()
      .from(services)
      .where(eq(services.siteId, siteId))
      .orderBy(asc(services.id))
      .for('update');
  }

  async function serviceRow(tx: PluginTransaction, siteId: string, id: string) {
    if (!UUID.test(id)) return null;
    const [row] = await tx
      .select()
      .from(services)
      .where(and(eq(services.siteId, siteId), eq(services.id, id)));
    return row ?? null;
  }

  return {
    // ---- Services ------------------------------------------------------------------
    async listServices(siteId: string, options: { archived?: boolean } = {}): Promise<Service[]> {
      const rows = await run(siteId, (tx) =>
        tx
          .select()
          .from(services)
          .where(eq(services.siteId, siteId))
          .orderBy(asc(services.position), asc(services.createdAt)),
      );
      return rows.map(serviceOf).filter((s) => options.archived || s.status !== 'archived');
    },

    async getService(siteId: string, id: string): Promise<Service | null> {
      const row = await run(siteId, (tx) => serviceRow(tx, siteId, id));
      return row ? serviceOf(row) : null;
    },

    /** An imported service by its id in the other plugin (`ssa:type:3`, `ssa:slug:x`, `wpbc:resource:1`). */
    async serviceByRef(siteId: string, ref: string): Promise<Service | null> {
      const slug = /^ssa:slug:(.+)$/.exec(ref)?.[1];
      const rows = await run(siteId, (tx) =>
        tx
          .select()
          .from(services)
          .where(
            and(
              eq(services.siteId, siteId),
              slug
                ? sql`${services.data}->'import'->>'slug' = ${slug}`
                : eq(services.externalId, ref),
            ),
          ),
      );
      return rows[0] ? serviceOf(rows[0]) : null;
    },

    async createService(siteId: string, input: Service): Promise<Service> {
      const service = normalizeService(input);
      const [row] = await run(siteId, (tx) =>
        tx
          .insert(services)
          .values({ siteId, ...serviceColumns(service) })
          .returning(),
      );
      return serviceOf(row!);
    },

    async updateService(siteId: string, id: string, input: Service): Promise<Service | null> {
      if (!UUID.test(id)) return null;
      const service = normalizeService({ ...input, id });
      const [row] = await run(siteId, (tx) =>
        tx
          .update(services)
          .set({ ...serviceColumns(service), updatedAt: new Date() })
          .where(and(eq(services.siteId, siteId), eq(services.id, id)))
          .returning(),
      );
      return row ? serviceOf(row) : null;
    },

    /** Deletes a service without appointments; one with appointments is archived (kept). */
    async removeService(siteId: string, id: string): Promise<'deleted' | 'archived' | null> {
      if (!UUID.test(id)) return null;
      return run(siteId, async (tx) => {
        const [used] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(appointments)
          .where(and(eq(appointments.siteId, siteId), eq(appointments.serviceId, id)));
        if ((used?.n ?? 0) > 0) {
          const rows = await tx
            .update(services)
            .set({ status: 'archived', updatedAt: new Date() })
            .where(and(eq(services.siteId, siteId), eq(services.id, id)))
            .returning({ id: services.id });
          return rows.length ? 'archived' : null;
        }
        const rows = await tx
          .delete(services)
          .where(and(eq(services.siteId, siteId), eq(services.id, id)))
          .returning({ id: services.id });
        return rows.length ? 'deleted' : null;
      });
    },

    // ---- Exceptions ----------------------------------------------------------------
    async listExceptions(siteId: string, fromDate?: string): Promise<Exception[]> {
      const rows = await run(siteId, (tx) =>
        tx
          .select()
          .from(exceptions)
          .where(
            fromDate
              ? and(eq(exceptions.siteId, siteId), gte(exceptions.dateTo, fromDate))
              : eq(exceptions.siteId, siteId),
          )
          .orderBy(asc(exceptions.dateFrom)),
      );
      return rows.map(exceptionOf);
    },

    async saveException(siteId: string, input: Exception, id?: string): Promise<Exception | null> {
      const values = {
        serviceId: input.serviceId && UUID.test(input.serviceId) ? input.serviceId : null,
        dateFrom: input.from,
        dateTo: input.to,
        closed: input.closed,
        hours: input.hours,
        note: input.note,
      };
      const [row] = await run(siteId, (tx) =>
        id
          ? tx
              .update(exceptions)
              .set(values)
              .where(and(eq(exceptions.siteId, siteId), eq(exceptions.id, id)))
              .returning()
          : tx
              .insert(exceptions)
              .values({ siteId, ...values })
              .returning(),
      );
      return row ? exceptionOf(row) : null;
    },

    async removeException(siteId: string, id: string): Promise<boolean> {
      if (!UUID.test(id)) return false;
      const rows = await run(siteId, (tx) =>
        tx
          .delete(exceptions)
          .where(and(eq(exceptions.siteId, siteId), eq(exceptions.id, id)))
          .returning({ id: exceptions.id }),
      );
      return rows.length > 0;
    },

    // ---- Availability ----------------------------------------------------------------
    /** Free slots of a service between two local dates. */
    async slots(
      siteId: string,
      service: Service,
      from: string,
      to: string,
      context: AvailabilityContext,
      options: { ignoreId?: string } = {},
    ) {
      const { busy, list } = await run(siteId, async (tx) => ({
        list: await exceptionsIn(tx, siteId, from, to),
        busy: await holdingBetween(
          tx,
          siteId,
          Date.parse(`${from}T00:00:00Z`) - DAY,
          Date.parse(`${to}T00:00:00Z`) + 2 * DAY,
        ),
      }));
      const blocked = await context.blocked(
        service,
        Date.parse(`${from}T00:00:00Z`) - DAY,
        Date.parse(`${to}T00:00:00Z`) + 2 * DAY,
      );
      return freeSlots({
        service,
        exceptions: list,
        busy,
        blocked,
        from,
        to,
        now: context.now,
        timeZone: context.timeZone,
        shared: context.shared,
        ignoreId: options.ignoreId,
      });
    },

    async countForLimit(siteId: string): Promise<number> {
      return run(siteId, (tx) => countForLimit(tx, siteId));
    },

    /**
     * Stores a booking if its place is still free, the service takes
     * bookings and (for new bookings) the site is under its limit. Throws
     * a `BookingError` otherwise. `admin`: the administrator books, so the
     * weekly hours and the notice do not apply (places and clashes do).
     */
    async book(
      siteId: string,
      input: BookInput,
      context: AvailabilityContext,
      options: { admin?: boolean } = {},
    ): Promise<{ appointment: Appointment; service: Service; used: number }> {
      const blockedCache = new Map<string, { start: number; end: number }[]>();
      return run(siteId, async (tx) => {
        const locked = await lockSite(tx, siteId);
        const row = locked.find((r) => r.id === input.serviceId);
        if (!row) throw new BookingError('service');
        const service = serviceOf(row);
        if (service.status === 'archived' || (!options.admin && service.status !== 'active'))
          throw new BookingError('service');
        const used = await countForLimit(tx, siteId);
        if (used >= context.limit) throw new BookingError('limit');
        const seats = Math.max(1, Math.min(input.seats ?? 1, service.capacity));
        const end = input.start + service.duration * 60_000;
        const busy = await holdingBetween(tx, siteId, input.start - DAY, end + DAY);
        if (!blockedCache.has(service.id))
          blockedCache.set(
            service.id,
            await context.blocked(service, input.start - DAY, end + DAY),
          );
        const blocked = blockedCache.get(service.id)!;
        if (options.admin) {
          if (placesLeft(service, input.start, busy, context.shared, blocked) < seats)
            throw new BookingError('taken');
        } else {
          const date = localDate(input.start, context.timeZone);
          const slot = freeSlots({
            service,
            exceptions: await exceptionsIn(tx, siteId, date, date),
            busy,
            blocked,
            from: date,
            to: date,
            now: context.now,
            timeZone: context.timeZone,
            shared: context.shared,
          }).find((s) => s.start === input.start);
          if (!slot || slot.left < seats) throw new BookingError('taken');
        }
        const [inserted] = await tx
          .insert(appointments)
          .values({
            siteId,
            serviceId: service.id,
            startsAt: new Date(input.start),
            endsAt: new Date(end),
            bufferBefore: service.bufferBefore,
            bufferAfter: service.bufferAfter,
            seats,
            status: input.status,
            name: input.name,
            email: input.email,
            phone: input.phone,
            fields: input.fields,
            notes: input.notes ?? '',
            locale: input.locale,
            timezone: input.timezone,
            source: input.source,
            sequence: 0,
            consentAt: input.consent ? new Date() : null,
          })
          .returning();
        return { appointment: appointmentOf(inserted!), service, used: used + 1 };
      });
    },

    /** Moves an appointment to another free time (the same service), raising its sequence. */
    async reschedule(
      siteId: string,
      id: string,
      start: number,
      context: AvailabilityContext,
      options: { admin?: boolean } = {},
    ): Promise<{ appointment: Appointment; previous: Appointment; service: Service }> {
      if (!UUID.test(id)) throw new BookingError('not-found');
      return run(siteId, async (tx) => {
        const locked = await lockSite(tx, siteId);
        const [current] = await tx
          .select()
          .from(appointments)
          .where(and(eq(appointments.siteId, siteId), eq(appointments.id, id)));
        if (!current) throw new BookingError('not-found');
        if (!HOLDING.includes(current.status as Status)) throw new BookingError('status');
        const row = locked.find((r) => r.id === current.serviceId);
        if (!row) throw new BookingError('service');
        const service = serviceOf(row);
        const end = start + service.duration * 60_000;
        const busy = await holdingBetween(tx, siteId, start - DAY, end + DAY);
        const blocked = await context.blocked(service, start - DAY, end + DAY);
        let ok: boolean;
        if (options.admin) {
          ok = placesLeft(service, start, busy, context.shared, blocked, id) >= current.seats;
        } else {
          const date = localDate(start, context.timeZone);
          const slot = freeSlots({
            service,
            exceptions: await exceptionsIn(tx, siteId, date, date),
            busy,
            blocked,
            from: date,
            to: date,
            now: context.now,
            timeZone: context.timeZone,
            shared: context.shared,
            ignoreId: id,
          }).find((s) => s.start === start);
          ok = !!slot && slot.left >= current.seats;
        }
        if (!ok) throw new BookingError('taken');
        const [updated] = await tx
          .update(appointments)
          .set({
            startsAt: new Date(start),
            endsAt: new Date(end),
            bufferBefore: service.bufferBefore,
            bufferAfter: service.bufferAfter,
            sequence: current.sequence + 1,
            reminderSentAt: null,
            updatedAt: new Date(),
          })
          .where(and(eq(appointments.siteId, siteId), eq(appointments.id, id)))
          .returning();
        return { appointment: appointmentOf(updated!), previous: appointmentOf(current), service };
      });
    },

    /**
     * Changes the status. Giving a place back to a cancelled or missed
     * appointment checks that it is still free, under the same lock.
     */
    async setStatus(
      siteId: string,
      id: string,
      status: Status,
      context: AvailabilityContext,
    ): Promise<{ appointment: Appointment; previous: Appointment } | null> {
      if (!UUID.test(id)) return null;
      return run(siteId, async (tx) => {
        const locked = await lockSite(tx, siteId);
        const [current] = await tx
          .select()
          .from(appointments)
          .where(and(eq(appointments.siteId, siteId), eq(appointments.id, id)));
        if (!current) return null;
        if (current.status === status)
          return { appointment: appointmentOf(current), previous: appointmentOf(current) };
        if (HOLDING.includes(status) && !HOLDING.includes(current.status as Status)) {
          const row = locked.find((r) => r.id === current.serviceId);
          if (!row) throw new BookingError('service');
          const start = current.startsAt.getTime();
          const busy = await holdingBetween(
            tx,
            siteId,
            start - DAY,
            current.endsAt.getTime() + DAY,
          );
          if (placesLeft(serviceOf(row), start, busy, context.shared, [], id) < current.seats)
            throw new BookingError('taken');
        }
        const [updated] = await tx
          .update(appointments)
          .set({
            status,
            updatedAt: new Date(),
            ...(status === 'cancelled'
              ? { cancelledAt: new Date(), sequence: current.sequence + 1 }
              : {}),
          })
          .where(and(eq(appointments.siteId, siteId), eq(appointments.id, id)))
          .returning();
        return { appointment: appointmentOf(updated!), previous: appointmentOf(current) };
      });
    },

    async updateDetails(
      siteId: string,
      id: string,
      input: { name?: string; email?: string; phone?: string; notes?: string },
    ): Promise<Appointment | null> {
      if (!UUID.test(id)) return null;
      const [row] = await run(siteId, (tx) =>
        tx
          .update(appointments)
          .set({ ...input, updatedAt: new Date() })
          .where(and(eq(appointments.siteId, siteId), eq(appointments.id, id)))
          .returning(),
      );
      return row ? appointmentOf(row) : null;
    },

    async getAppointment(siteId: string, id: string): Promise<Appointment | null> {
      if (!UUID.test(id)) return null;
      const [row] = await run(siteId, (tx) =>
        tx
          .select()
          .from(appointments)
          .where(and(eq(appointments.siteId, siteId), eq(appointments.id, id))),
      );
      return row ? appointmentOf(row) : null;
    },

    async listAppointments(siteId: string, q: AppointmentQuery = {}) {
      const where = and(
        eq(appointments.siteId, siteId),
        q.from !== undefined ? gte(appointments.endsAt, new Date(q.from)) : undefined,
        q.to !== undefined ? lt(appointments.startsAt, new Date(q.to)) : undefined,
        q.status?.length ? inArray(appointments.status, q.status) : undefined,
        q.serviceId && UUID.test(q.serviceId) ? eq(appointments.serviceId, q.serviceId) : undefined,
        q.search
          ? or(
              ilike(appointments.name, `%${q.search.replace(/[%_\\]/g, '\\$&')}%`),
              ilike(appointments.email, `%${q.search.replace(/[%_\\]/g, '\\$&')}%`),
              ilike(appointments.phone, `%${q.search.replace(/[%_\\]/g, '\\$&')}%`),
            )
          : undefined,
      );
      return run(siteId, async (tx) => {
        const rows = await tx
          .select()
          .from(appointments)
          .where(where)
          .orderBy(q.order === 'desc' ? desc(appointments.startsAt) : asc(appointments.startsAt))
          .limit(Math.min(q.limit ?? 200, 5000))
          .offset(q.offset ?? 0);
        const [total] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(appointments)
          .where(where);
        return { items: rows.map(appointmentOf), total: total?.n ?? 0 };
      });
    },

    /** Upcoming appointments holding a place, for the dashboard. */
    async upcoming(siteId: string, now: number, until: number) {
      const rows = await run(siteId, (tx) =>
        tx
          .select()
          .from(appointments)
          .where(
            and(
              eq(appointments.siteId, siteId),
              inArray(appointments.status, HOLDING as Status[]),
              gte(appointments.startsAt, new Date(now)),
              lt(appointments.startsAt, new Date(until)),
            ),
          )
          .orderBy(asc(appointments.startsAt))
          .limit(200),
      );
      return rows.map(appointmentOf);
    },

    /**
     * Confirmed appointments starting within `hours` that have no reminder
     * yet, marked as reminded in the same statement (so two servers never
     * send it twice). Those booked less than `hours` before get none.
     */
    async takeDueReminders(siteId: string, now: number, hours: number): Promise<Appointment[]> {
      const rows = await run(siteId, (tx) =>
        tx
          .update(appointments)
          .set({ reminderSentAt: new Date(now) })
          .where(
            and(
              eq(appointments.siteId, siteId),
              eq(appointments.status, 'confirmed'),
              isNull(appointments.reminderSentAt),
              isNull(appointments.anonymizedAt),
              gte(appointments.startsAt, new Date(now)),
              lte(appointments.startsAt, new Date(now + hours * 3600_000)),
              sql`${appointments.startsAt} - ${appointments.createdAt} > make_interval(hours => ${hours})`,
              sql`${appointments.email} <> ''`,
            ),
          )
          .returning(),
      );
      return rows.map(appointmentOf);
    },

    /** Erases the personal data of appointments ended more than `months` ago. */
    async anonymizeBefore(siteId: string, before: number): Promise<number> {
      const rows = await run(siteId, (tx) =>
        tx
          .update(appointments)
          .set({ name: '', email: '', phone: '', fields: [], notes: '', anonymizedAt: new Date() })
          .where(
            and(
              eq(appointments.siteId, siteId),
              isNull(appointments.anonymizedAt),
              lt(appointments.endsAt, new Date(before)),
            ),
          )
          .returning({ id: appointments.id }),
      );
      return rows.length;
    },

    async byEmail(siteId: string, email: string): Promise<Appointment[]> {
      const rows = await run(siteId, (tx) =>
        tx
          .select()
          .from(appointments)
          .where(
            and(
              eq(appointments.siteId, siteId),
              sql`lower(${appointments.email}) = ${email.toLowerCase()}`,
            ),
          )
          .orderBy(asc(appointments.startsAt)),
      );
      return rows.map(appointmentOf);
    },

    async eraseEmail(siteId: string, email: string): Promise<number> {
      const rows = await run(siteId, (tx) =>
        tx
          .update(appointments)
          .set({ name: '', email: '', phone: '', fields: [], notes: '', anonymizedAt: new Date() })
          .where(
            and(
              eq(appointments.siteId, siteId),
              sql`lower(${appointments.email}) = ${email.toLowerCase()}`,
            ),
          )
          .returning({ id: appointments.id }),
      );
      return rows.length;
    },

    // ---- Import -------------------------------------------------------------------------
    /**
     * Stores what an importer read. Services are matched by their id in the
     * other plugin (updated when imported again), appointments too (left as
     * they are when already there). Imported appointments never count
     * toward the free limit and are stored without checking places: they
     * were booked in the other plugin.
     */
    async importPlan(siteId: string, plan: ImportPlan) {
      return run(siteId, async (tx) => {
        const result = {
          services: 0,
          servicesUpdated: 0,
          exceptions: 0,
          appointments: 0,
          existing: 0,
          orphans: 0,
        };
        const ids = new Map<string, string>();
        const existing = await tx
          .select()
          .from(services)
          .where(and(eq(services.siteId, siteId), isNotNull(services.externalId)));
        for (const row of existing) ids.set(row.externalId!, row.id);
        let position = existing.length;
        for (const item of plan.services) {
          const known = ids.get(item.externalId);
          if (known) {
            const [row] = await tx.select().from(services).where(eq(services.id, known));
            // Keep what was changed here; take the other plugin's settings again.
            const merged = normalizeService({ ...item.service, color: serviceOf(row!).color });
            await tx
              .update(services)
              .set({ ...serviceColumns(merged), status: row!.status, updatedAt: new Date() })
              .where(eq(services.id, known));
            result.servicesUpdated++;
          } else {
            const [row] = await tx
              .insert(services)
              .values({
                siteId,
                ...serviceColumns({
                  ...item.service,
                  position: item.service.position || position++,
                }),
                externalId: item.externalId,
              })
              .returning({ id: services.id });
            ids.set(item.externalId, row!.id);
            result.services++;
          }
        }
        for (const e of plan.exceptions) {
          const [dup] = await tx
            .select({ id: exceptions.id })
            .from(exceptions)
            .where(
              and(
                eq(exceptions.siteId, siteId),
                eq(exceptions.dateFrom, e.from),
                eq(exceptions.dateTo, e.to),
                isNull(exceptions.serviceId),
              ),
            );
          if (dup) continue;
          await tx.insert(exceptions).values({
            siteId,
            serviceId: null,
            dateFrom: e.from,
            dateTo: e.to,
            closed: e.closed,
            hours: e.hours,
            note: e.note,
          });
          result.exceptions++;
        }
        const buffers = new Map<string, { before: number; after: number }>();
        for (const item of plan.services)
          buffers.set(item.externalId, {
            before: item.service.bufferBefore,
            after: item.service.bufferAfter,
          });
        for (const a of plan.appointments) {
          const serviceId = ids.get(a.serviceExternalId);
          if (!serviceId) {
            result.orphans++;
            continue;
          }
          const b = buffers.get(a.serviceExternalId) ?? { before: 0, after: 0 };
          const inserted = await tx
            .insert(appointments)
            .values({
              siteId,
              serviceId,
              startsAt: new Date(a.start),
              endsAt: new Date(a.end),
              bufferBefore: b.before,
              bufferAfter: b.after,
              seats: 1,
              status: a.status,
              name: a.name,
              email: a.email,
              phone: a.phone,
              fields: a.fields,
              notes: a.notes ?? '',
              locale: a.locale,
              timezone: a.timezone,
              source: 'import',
              externalId: a.externalId,
              sequence: 0,
              // No reminders for what was booked elsewhere and is already past.
              reminderSentAt: a.start < Date.now() ? new Date() : null,
              ...(a.status === 'cancelled' ? { cancelledAt: new Date() } : {}),
              ...(a.createdAt ? { createdAt: new Date(a.createdAt) } : {}),
            })
            .onConflictDoNothing()
            .returning({ id: appointments.id });
          if (inserted.length) result.appointments++;
          else result.existing++;
        }
        return result;
      });
    },
  };
}

export type Store = ReturnType<typeof databaseStore>;
