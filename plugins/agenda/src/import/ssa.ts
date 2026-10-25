/**
 * Simply Schedule Appointments: its export (Settings → Import/Export, a JSON
 * text with `settings`, `appointment_types` and `appointments`) or a dump of
 * its tables (`wp_ssa_appointment_types`, `wp_ssa_appointments`), which have
 * the same fields. Appointment types become services with their weekly
 * hours (blocks or start times), buffers and notice; appointments keep their
 * time (stored in UTC by SSA), customer and status. Fields read: see
 * ~/.claude/plans/bookings-research.md (SSA's GPL sources, names only).
 */
import { csvObjects } from '../model/csv';
import { COLORS, normalizeService } from '../model/normalize';
import { isDate, isTimeZone, parseTime } from '../model/time';
import type { DayHours, Status } from '../model/types';
import { readDump } from './sql';
import { list, obj, utcOf, type ImportedAppointment, type ImportPlan } from './types';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const text = (v: unknown, max = 5000) =>
  typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '';
const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** SSA's `availability`: `{ Monday: [{ time_start, time_end }], … }` → our seven days. */
export function ssaDays(availability: unknown, fixed: boolean): DayHours[] {
  const byDay = new Map(Object.entries(obj(availability)).map(([k, v]) => [k.toLowerCase(), v]));
  return DAYS.map((day) => {
    const blocks = list(byDay.get(day));
    const windows: DayHours['windows'] = [];
    const times: number[] = [];
    for (const b of blocks) {
      const o = obj(b);
      const start = parseTime(o.time_start);
      if (start === null) continue;
      if (fixed) times.push(start);
      else {
        const end = parseTime(o.time_end);
        // SSA writes the end of the day as 24:00 or 23:59.
        const endMin = end === 23 * 60 + 59 ? 1440 : end;
        if (endMin !== null && endMin > start) windows.push({ start, end: endMin });
      }
    }
    return { windows, times: [...new Set(times)].sort((a, b) => a - b) };
  });
}

function statusOf(value: unknown): Status | null {
  switch (text(value).toLowerCase()) {
    case 'booked':
    case '':
      return 'confirmed';
    case 'canceled':
    case 'cancelled':
      return 'cancelled';
    case 'no_show':
      return 'no_show';
    case 'pending_approval':
      return 'pending';
    default:
      // pending_form, pending_payment, abandoned: bookings never completed.
      return null;
  }
}

/** Name, email, phone and the other answers of `customer_information`. */
export function ssaCustomer(value: unknown) {
  const info = obj(value);
  let name = '';
  let email = '';
  let phone = '';
  const fields: ImportedAppointment['fields'] = [];
  for (const [key, raw] of Object.entries(info)) {
    const v = Array.isArray(raw) ? raw.map((x) => text(x, 500)).join(', ') : text(raw, 2000);
    const k = key.toLowerCase().replace(/[^a-z]/g, '');
    if (k === 'name' || k === 'fullname') name = v;
    else if (k === 'email' || k === 'emailaddress') email = v.toLowerCase();
    else if (k === 'phone' || k === 'phonenumber' || k === 'telefono' || k === 'mobile') phone = v;
    else if (v)
      fields.push({
        name:
          key
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'field',
        label: key.slice(0, 200),
        value: v,
      });
  }
  return {
    name: name.slice(0, 200),
    email: email.slice(0, 200),
    phone: phone.slice(0, 40),
    fields,
  };
}

export function planFromSsa(input: {
  settings?: unknown;
  appointment_types?: unknown;
  appointments?: unknown;
}): ImportPlan {
  const warnings: string[] = [];
  const settings = obj(input.settings);
  const tz = text(obj(settings.global).timezone_string, 64);
  const plan: ImportPlan = {
    source: 'ssa',
    timezone: tz && isTimeZone(tz) ? tz : null,
    services: [],
    exceptions: [],
    appointments: [],
    warnings,
  };

  const types = list(input.appointment_types);
  types.forEach((raw, index) => {
    const t = obj(raw);
    const id = text(t.id, 40);
    if (!id) return;
    const status = text(t.status).toLowerCase();
    if (status === 'delete') return;
    const fixed = text(t.availability_type) === 'start_times';
    const step = num(t.availability_increment, 15);
    const custom = list(t.custom_customer_information);
    const service = normalizeService({
      name: text(t.title, 200) || `Appointment ${id}`,
      description: text(t.description),
      duration: num(t.duration, 30),
      bufferBefore: num(t.buffer_before, 0),
      bufferAfter: num(t.buffer_after, 0),
      minNotice: num(t.min_booking_notice, 0),
      maxNotice: num(t.max_booking_notice, 0),
      capacity: text(t.capacity_type) === 'group' ? num(t.capacity, 1) : 1,
      status: status === 'publish' ? 'active' : status === 'trash' ? 'archived' : 'hidden',
      position: num(t.display_order, index),
      color: COLORS[index % COLORS.length],
      schedule: {
        mode: fixed ? 'fixed' : 'intervals',
        step: fixed ? 0 : step,
        days: ssaDays(t.availability, fixed),
      },
      fields: custom
        .map((f) => obj(f))
        .filter((f) => text(f.field) && !/^(name|email|phone)$/i.test(text(f.field)))
        .map((f) => ({
          name: text(f.field, 40),
          label: text(f.field, 200),
          type: text(f.type) === 'multi-text' || text(f.type) === 'textarea' ? 'textarea' : 'text',
          required: f.required === true || f.required === '1' || f.required === 1,
        })),
      data: { import: { from: 'ssa', id, slug: text(t.slug, 100) } },
    });
    // SSA asks for the phone only when it is a field of the type.
    if (
      [...list(t.customer_information), ...custom].some((f) => /^phone$/i.test(text(obj(f).field)))
    )
      service.data.askPhone = true;
    plan.services.push({ externalId: `ssa:type:${id}`, service });
  });

  // Blackout dates: closed days for every service.
  const blackout = obj(settings.blackout_dates);
  if (blackout.enabled === true || blackout.enabled === '1' || blackout.enabled === 1) {
    for (const d of list(blackout.dates)) {
      const date = text(typeof d === 'string' ? d : obj(d).date, 10);
      if (isDate(date))
        plan.exceptions.push({
          serviceId: null,
          from: date,
          to: date,
          closed: true,
          hours: { windows: [], times: [] },
          note: 'SSA',
        });
    }
  }

  let skipped = 0;
  for (const raw of list(input.appointments)) {
    const a = obj(raw);
    const id = text(a.id, 40);
    const start = utcOf(a.start_date);
    const end = utcOf(a.end_date);
    const typeRef = `ssa:type:${text(a.appointment_type_id, 40)}`;
    const status = statusOf(a.status);
    if (!id || start === null || end === null || end <= start || !status) {
      skipped++;
      continue;
    }
    const customer = ssaCustomer(a.customer_information);
    const tzOf = text(a.customer_timezone, 64);
    plan.appointments.push({
      externalId: `ssa:appointment:${id}`,
      serviceExternalId: typeRef,
      start,
      end,
      status,
      ...customer,
      timezone: tzOf && isTimeZone(tzOf) ? tzOf : '',
      locale: text(a.customer_locale, 10).replace('_', '-').split('-')[0] ?? '',
      createdAt: utcOf(a.date_created),
    });
  }
  if (skipped)
    warnings.push(
      `${skipped} appointment(s) left out: never completed (abandoned, waiting for a form or a payment) or without a valid time.`,
    );
  return plan;
}

/** A pasted or uploaded SSA export (JSON), or a dump/CSV of its tables. */
export function parseSsa(content: string, filename = ''): ImportPlan {
  const trimmed = content.trim().replace(/^\uFEFF/, '');
  if (trimmed.startsWith('{')) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new Error(
        'The file is not valid JSON: copy the whole export of Simply Schedule Appointments.',
      );
    }
    return planFromSsa(obj(data));
  }
  if (/\.csv$/i.test(filename) || !/INSERT\s+INTO/i.test(trimmed)) {
    const rows = csvObjects(trimmed);
    const isTypes = rows[0] && 'availability_type' in rows[0];
    return planFromSsa(isTypes ? { appointment_types: rows } : { appointments: rows });
  }
  const tables = readDump(trimmed, ['ssa_appointment_types', 'ssa_appointments']);
  return planFromSsa({
    appointment_types: tables.ssa_appointment_types,
    appointments: tables.ssa_appointments,
  });
}
