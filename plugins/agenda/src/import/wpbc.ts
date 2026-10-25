/**
 * Booking Calendar (WPBC): a dump (or CSVs) of its tables `wp_booking`
 * (the booking, its form as `type^name<resource>^value~…`, `booking_type`
 * = the resource), `wp_bookingdates` (one row per booked day, `approved`;
 * a time slot's start ends in second 01 and its end in second 02) and, in
 * the paid versions, `wp_bookingtypes` (the resources). Resources become
 * services (hidden, to be reviewed: Agenda books times, not whole days),
 * bookings keep their days or times in the site's zone, as WPBC stores them.
 */
import { csvObjects } from '../model/csv';
import { COLORS, normalizeService } from '../model/normalize';
import { addDays, localToUtc, parseTime } from '../model/time';
import { readDump, type SqlRow } from './sql';
import type { ImportedAppointment, ImportPlan } from './types';

const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

/** WPBC's form: `text^name1^Mario~email^email1^m@x.it~…` → values by field name (resource number removed). */
export function parseWpbcForm(
  form: string | null | undefined,
  resource: string,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (form ?? '').split('~')) {
    const [, field = '', ...rest] = part.split('^');
    const rawName = field.replace(/\[\]$/, '');
    if (!rawName) continue;
    const value = rest
      .join('^')
      .replace(/curret/g, '^')
      .replace(/tilde/g, '~')
      .trim();
    const name = rawName.endsWith(resource)
      ? rawName.slice(0, -resource.length)
      : rawName.replace(/\d+$/, '');
    const key = name.toLowerCase();
    out.set(key, out.has(key) && value ? `${out.get(key)}, ${value}` : (out.get(key) ?? value));
  }
  return out;
}

const NAME_KEYS = ['name', 'firstname', 'first_name', 'nome'];
const SURNAME_KEYS = ['secondname', 'lastname', 'last_name', 'surname', 'cognome'];
const EMAIL_KEYS = ['email', 'mail'];
const PHONE_KEYS = ['phone', 'tel', 'telefono', 'mobile'];
const TIME_KEYS = ['rangetime', 'starttime', 'endtime', 'durationtime'];

const pick = (form: Map<string, string>, keys: string[]) =>
  keys.map((k) => form.get(k)).find(Boolean) ?? '';

export function planFromWpbc(
  tables: { booking: SqlRow[]; bookingdates: SqlRow[]; bookingtypes: SqlRow[] },
  timeZone: string,
): ImportPlan {
  const warnings: string[] = [];
  const plan: ImportPlan = {
    source: 'wpbc',
    timezone: null,
    services: [],
    exceptions: [],
    appointments: [],
    warnings,
  };

  const datesOf = new Map<
    string,
    { date: string; h: number; m: number; s: number; approved: boolean }[]
  >();
  for (const row of tables.bookingdates) {
    const id = String(row.booking_id ?? '');
    const m = DATE_TIME.exec(String(row.booking_date ?? ''));
    if (!id || !m) continue;
    const list = datesOf.get(id) ?? [];
    list.push({
      date: m[1]!,
      h: +m[2]!,
      m: +m[3]!,
      s: +m[4]!,
      approved: String(row.approved) === '1',
    });
    datesOf.set(id, list);
  }

  const titles = new Map(
    tables.bookingtypes.map((r) => [String(r.booking_type_id ?? ''), String(r.title ?? '')]),
  );
  const resources = new Set<string>([
    ...titles.keys(),
    ...tables.booking.map((b) => String(b.booking_type ?? '1') || '1'),
  ]);
  [...resources].filter(Boolean).forEach((resource, index) => {
    plan.services.push({
      externalId: `wpbc:resource:${resource}`,
      service: normalizeService({
        name: titles.get(resource) || (resource === '1' ? 'Booking' : `Resource ${resource}`),
        duration: 60,
        status: 'hidden',
        color: COLORS[index % COLORS.length],
        data: { import: { from: 'wpbc', id: resource } },
      }),
    });
  });

  let skipped = 0;
  for (const b of tables.booking) {
    const id = String(b.booking_id ?? '');
    const resource = String(b.booking_type ?? '1') || '1';
    const days = (datesOf.get(id) ?? []).sort((x, y) =>
      `${x.date}${x.h}${x.m}${x.s}`.localeCompare(`${y.date}${y.h}${y.m}${y.s}`),
    );
    if (!id || days.length === 0) {
      skipped++;
      continue;
    }
    const form = parseWpbcForm(b.form, resource);
    let start: number | null;
    let end: number | null;
    const startRow = days.find((d) => d.s === 1);
    const endRow = [...days].reverse().find((d) => d.s === 2);
    if (startRow && endRow) {
      start = localToUtc(startRow.date, startRow.h * 60 + startRow.m, timeZone);
      end = localToUtc(endRow.date, endRow.h * 60 + endRow.m, timeZone);
    } else {
      // A time chosen in the form ("14:00 - 16:00"), else whole days.
      const range = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(pick(form, TIME_KEYS));
      const from = range ? parseTime(range[1]) : null;
      const to = range ? parseTime(range[2]) : null;
      if (from !== null && to !== null && to > from) {
        start = localToUtc(days[0]!.date, from, timeZone);
        end = localToUtc(days[days.length - 1]!.date, to, timeZone);
      } else {
        start = localToUtc(days[0]!.date, 0, timeZone);
        end = localToUtc(addDays(days[days.length - 1]!.date, 1), 0, timeZone);
      }
    }
    if (start === null || end === null || end <= start) {
      skipped++;
      continue;
    }
    const trashed = String(b.trash ?? '0') === '1' || String(b.is_trash ?? '0') === '1';
    const approved = days.every((d) => d.approved);
    const name = [pick(form, NAME_KEYS), pick(form, SURNAME_KEYS)].filter(Boolean).join(' ');
    const used = new Set([
      ...NAME_KEYS,
      ...SURNAME_KEYS,
      ...EMAIL_KEYS,
      ...PHONE_KEYS,
      ...TIME_KEYS,
    ]);
    const fields: ImportedAppointment['fields'] = [...form]
      .filter(([k, v]) => v && !used.has(k))
      .map(([k, v]) => ({ name: k.slice(0, 40), label: k.slice(0, 200), value: v.slice(0, 2000) }));
    const created = DATE_TIME.exec(String(b.creation_date ?? b.modification_date ?? ''));
    plan.appointments.push({
      externalId: `wpbc:booking:${id}`,
      serviceExternalId: `wpbc:resource:${resource}`,
      start,
      end,
      status: trashed ? 'cancelled' : approved ? 'confirmed' : 'pending',
      name: name.slice(0, 200),
      email: pick(form, EMAIL_KEYS).toLowerCase().slice(0, 200),
      phone: pick(form, PHONE_KEYS).slice(0, 40),
      fields,
      timezone: '',
      locale: '',
      createdAt: created
        ? localToUtc(created[1]!, +created[2]! * 60 + +created[3]!, timeZone)
        : null,
    });
  }
  if (skipped) warnings.push(`${skipped} booking(s) left out: without dates.`);
  if (plan.services.length)
    warnings.push(
      'Resources became hidden services: review their duration and weekly hours before showing them.',
    );
  return plan;
}

/** A dump of WPBC's tables, or CSVs of them (each recognised by its columns). */
export function parseWpbc(
  files: { name: string; content: string }[],
  timeZone: string,
): ImportPlan {
  const tables = {
    booking: [] as SqlRow[],
    bookingdates: [] as SqlRow[],
    bookingtypes: [] as SqlRow[],
  };
  for (const file of files) {
    if (/INSERT\s+INTO/i.test(file.content)) {
      const dump = readDump(file.content, ['booking', 'bookingdates', 'bookingtypes']);
      tables.booking.push(...(dump.booking ?? []));
      tables.bookingdates.push(...(dump.bookingdates ?? []));
      tables.bookingtypes.push(...(dump.bookingtypes ?? []));
      continue;
    }
    const rows = csvObjects(file.content);
    const first = rows[0] ?? {};
    if ('booking_date' in first) tables.bookingdates.push(...rows);
    else if ('form' in first) tables.booking.push(...rows);
    else if ('booking_type_id' in first) tables.bookingtypes.push(...rows);
  }
  return planFromWpbc(tables, timeZone);
}
