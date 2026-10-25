/**
 * Simply Schedule Appointments. Accepted:
 * - its export (Settings → Import/Export: JSON with `settings`,
 *   `appointment_types`, `appointment_type_labels`, `appointments`,
 *   `appointment_meta`…);
 * - its tables as JSON rows, with the same names, bare or with the
 *   prefix (`wp_ssa_appointments`), and `settings` (the option
 *   `ssa_settings_json`, as an object or as its JSON text), or
 *   phpMyAdmin's JSON export of them;
 * - a SQL dump or CSVs of `wp_ssa_appointment_types` and `wp_ssa_appointments`.
 *
 * Appointment types become services with their weekly hours (blocks or
 * start times), buffers, notice, labels and questions; appointments keep
 * their time (stored in UTC by SSA), customer and status; the settings give
 * the administrator's address, the customers' email texts, the closed days
 * and whether services share one calendar. SSA's buffer rule is Agenda's
 * (see `clashes` in model/slots.ts). Fields read: see
 * ~/.claude/plans/bookings-research.md (SSA's GPL sources, names only).
 */
import { csvObjects } from '../model/csv';
import { COLORS, normalizeFields, normalizeService } from '../model/normalize';
import { isDate, isTimeZone, parseTime } from '../model/time';
import type { CustomField, DayHours, EmailKind, EmailText, Status } from '../model/types';
import { readDump } from './sql';
import {
  list,
  note,
  obj,
  utcOf,
  type ImportedAppointment,
  type ImportedSettings,
  type ImportPlan,
} from './types';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const text = (v: unknown, max = 5000) =>
  typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '';
const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const yes = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true';
/** SSA writes "no date" as `0000-00-00 00:00:00`, empty or null. */
const someDate = (v: unknown) => /^[1-9]\d{3}-/.test(text(v));

/** A question's name as Agenda stores it (`Zip Code` → `zip-code`), the same for services and answers. */
const fieldName = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'field';

/** SSA's label colours (Material's names) → hex. */
const LABEL_COLORS: Record<string, string> = {
  red: '#f44336',
  pink: '#e91e63',
  purple: '#9c27b0',
  'deep-purple': '#673ab7',
  indigo: '#3f51b5',
  blue: '#2196f3',
  'light-blue': '#03a9f4',
  cyan: '#00bcd4',
  teal: '#009688',
  green: '#4caf50',
  'light-green': '#8bc34a',
  lime: '#cddc39',
  yellow: '#ffeb3b',
  amber: '#ffc107',
  orange: '#ff9800',
  'deep-orange': '#ff5722',
  brown: '#795548',
  grey: '#9e9e9e',
  'blue-grey': '#607d8b',
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
    else if (v) fields.push({ name: fieldName(key), label: key.slice(0, 200), value: v });
  }
  return {
    name: name.slice(0, 200),
    email: email.slice(0, 200),
    phone: phone.slice(0, 40),
    fields,
  };
}

const CORE_FIELD = /^(name|email|phone)$/i;

const standardField = (name: 'name' | 'email' | 'phone', state: CustomField['state']) => ({
  name,
  label: '',
  state,
});

/**
 * The booking form of a type: name, email and phone as SSA asks them (name
 * and email are always required in Agenda), then the standard questions SSA
 * shows (`customer_information` with `display`: Address, City, Notes…) and
 * the custom ones of its paid versions (`custom_customer_information`).
 * The questions are imported optional, even when SSA required them: the
 * site's owner decides in the service's form which ones to require.
 * `relaxed` lists those that were required.
 */
export function ssaForm(t: Record<string, unknown>): { fields: CustomField[]; relaxed: string[] } {
  const standard = list(t.customer_information)
    .map((f) => obj(f))
    .filter((f) => f.display === undefined || yes(f.display));
  const custom = list(t.custom_customer_information).map((f) => obj(f));
  const questions: Record<string, unknown>[] = [];
  const relaxed: string[] = [];
  for (const f of [...standard, ...custom]) {
    const label = text(f.field, 200);
    if (!label || CORE_FIELD.test(label)) continue;
    const type = text(f.type);
    const options = text(f.values)
      .split(/\r?\n|;/)
      .map((o) => o.trim())
      .filter(Boolean);
    if (yes(f.required)) relaxed.push(label);
    questions.push({
      name: fieldName(label),
      label,
      type:
        type === 'multi-text' || type === 'textarea' || /^notes$/i.test(label)
          ? 'textarea'
          : (type === 'dropdown' || type === 'select' || type === 'radio') && options.length
            ? 'select'
            : type === 'checkbox' && options.length <= 1
              ? 'checkbox'
              : 'text',
      state: 'optional',
      options,
    });
  }
  const phone = phoneOf(t);
  const fields = normalizeFields([
    standardField('name', 'required'),
    standardField('email', 'required'),
    standardField('phone', phone === 'off' ? 'hidden' : phone),
    ...questions,
  ]);
  // SSA has no notes of its own unless asked: Agenda's stay hidden.
  if (!fields.some((f) => f.name === 'notes'))
    fields.push(...normalizeFields([{ name: 'notes', label: '', state: 'hidden' }]));
  return { fields, relaxed };
}

/** Whether a type asks the phone, and whether it is required. */
function phoneOf(t: Record<string, unknown>): 'off' | 'optional' | 'required' {
  const f = [...list(t.customer_information), ...list(t.custom_customer_information)]
    .map((x) => obj(x))
    .find((x) => /^phone$/i.test(text(x.field)) && (x.display === undefined || yes(x.display)));
  return !f ? 'off' : yes(f.required) ? 'required' : 'optional';
}

// ---- Email texts ------------------------------------------------------------------------

/** SSA's (Twig) variables → Agenda's placeholders; the others have no equivalent. */
const VARIABLES: [RegExp, string][] = [
  [/^(appointment\.customer_information\.(name|full_?name)|customer_name)$/i, '{name}'],
  [/^appointment\.customer_information_summary$/i, '{name}'],
  [/^appointment\.appointmenttype\.title$/i, '{service}'],
  [/^appointment\.(customer|business)_start_date$/i, '{date}, {time}'],
  [/^appointment\.(customer_)?timezone$/i, '{timezone}'],
  [/^appointment\.appointmenttype\.duration$/i, '{duration}'],
  [/^appointment\.public_(edit|cancel)_url$/i, '{manage_url}'],
  [/^global\.(home_url|site_url|site_name)$/i, '{site}'],
];

function variable(expr: string, company: string): string | null {
  const name = expr.split('|')[0]!.trim();
  if (/^global\.company_name$/i.test(name)) return company || '{site}';
  return VARIABLES.find(([re]) => re.test(name))?.[1] ?? null;
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  egrave: 'è',
  eacute: 'é',
  agrave: 'à',
  igrave: 'ì',
  ograve: 'ò',
  ugrave: 'ù',
  euro: '€',
};

/** An HTML email of SSA → Agenda's plain text (paragraphs, line breaks, links written out). */
export function htmlToText(html: string): string {
  return html
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const inner = label.replace(/<[^>]+>/g, '').trim();
      return !inner || inner === href ? href : `${inner} (${href})`;
    })
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
      e[0] === '#'
        ? String.fromCodePoint(
            e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1),
          )
        : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * A notification's text with Agenda's placeholders: `{% if %}` blocks kept
 * when their variable has an equivalent (else their `{% else %}` part),
 * variables replaced, the ones without an equivalent left out (listed in
 * `missing`).
 */
export function convertTemplate(source: string, company: string, missing: Set<string>): string {
  const tokens = source.split(/(\{%-?\s*(?:if\s[\s\S]*?|else|endif)\s*-?%\})/);
  let i = 0;
  const block = (stopAt: string[]): string => {
    let out = '';
    for (; i < tokens.length; i++) {
      const tok = tokens[i]!;
      const tag = /^\{%-?\s*(if\s([\s\S]*?)|else|endif)\s*-?%\}$/.exec(tok);
      if (!tag) {
        out += tok;
        continue;
      }
      if (stopAt.includes(tag[1]!.split(/\s/)[0]!)) return out;
      // `{% if x %}`: the part that holds, by whether x has an equivalent.
      i++;
      const known = variable(tag[2]!.replace(/^not\s+/, ''), company) !== null;
      const then = block(['else', 'endif']);
      let otherwise = '';
      if (/^\{%-?\s*else/.test(tokens[i] ?? '')) {
        i++;
        otherwise = block(['endif']);
      }
      if (!known) missing.add(tag[2]!.trim());
      out += known ? then : otherwise;
    }
    return out;
  };
  return block([])
    .replace(/\{\{-?\s*([\s\S]*?)\s*-?\}\}/g, (_, expr: string) => {
      const v = variable(expr, company);
      if (v === null) missing.add(expr.split('|')[0]!.trim());
      return v ?? '';
    })
    .replace(/\{%[\s\S]*?%\}/g, '');
}

const KIND_OF_TRIGGER: Record<string, EmailKind> = {
  appointment_booked: 'confirmed',
  appointment_pending: 'pending',
  appointment_canceled: 'cancelled',
  appointment_cancelled: 'cancelled',
  appointment_rescheduled: 'rescheduled',
  appointment_start_date: 'reminder',
};

function settingsFrom(settings: Record<string, unknown>, plan: ImportPlan): ImportedSettings {
  const global = obj(settings.global);
  const company = text(global.company_name, 200);
  const adminEmail = text(global.admin_email, 200).toLowerCase();
  const locale = text(global.locale, 10).replace('_', '-').split('-')[0]!.toLowerCase();
  const out: ImportedSettings = {
    notify: adminEmail.includes('@') ? [adminEmail] : [],
    emails: {},
    locale: /^[a-z]{2,3}$/.test(locale) ? locale : null,
  };
  if (adminEmail)
    plan.notes.push(
      note('info', 'Bookings will be notified to {email} (the administrator’s email of SSA).', {
        email: adminEmail,
      }),
    );
  const developer = obj(settings.developer);
  if (yes(developer.separate_appointment_type_availability)) {
    out.shared = false;
    plan.notes.push(note('info', 'Each service keeps its own calendar, as in SSA.'));
  }

  const notifications = obj(settings.notifications);
  const missing = new Set<string>();
  let adminTexts = 0;
  let usesCompany = false;
  for (const raw of list(notifications.notifications)) {
    const n = obj(raw);
    const to = list(n.sent_to).map((x) => text(x, 200));
    const kind = KIND_OF_TRIGGER[text(n.trigger)];
    const toCustomer = to.some((x) => /customer_email/.test(x));
    // Other addresses that are told of bookings.
    for (const x of to)
      if (/^[^\s@{}]+@[^\s@{}]+$/.test(x) && !out.notify.includes(x.toLowerCase()))
        out.notify.push(x.toLowerCase());
    if (!toCustomer) {
      adminTexts++;
      continue;
    }
    const delayed = num(n.duration, 0) > 0 && text(n.when) === 'after';
    if (!kind || delayed || (kind === 'reminder' && text(n.when) !== 'before')) {
      plan.notes.push(
        note('skipped', 'The email “{title}” of SSA: Agenda has no such email.', {
          title: text(n.title, 100) || text(n.trigger, 100),
        }),
      );
      continue;
    }
    if (out.emails[kind]) {
      plan.notes.push(
        note(
          'skipped',
          'The email “{title}” of SSA: only the first one of each kind is imported.',
          {
            title: text(n.title, 100) || text(n.subject, 100),
          },
        ),
      );
      continue;
    }
    usesCompany ||= /company_name/.test(`${text(n.subject)} ${text(n.message)}`);
    const email: EmailText = {
      subject: convertTemplate(htmlToText(text(n.subject, 1000)), company, missing).slice(0, 200),
      body: htmlToText(convertTemplate(text(n.message, 20000), company, missing)).slice(0, 10000),
    };
    out.emails[kind] = email;
    if (list(n.appointment_types).length)
      plan.notes.push(
        note(
          'review',
          'The email “{title}” was only for some appointment types in SSA: in Agenda it is for every service.',
          { title: text(n.title, 100) || text(n.subject, 100) },
        ),
      );
    if (kind === 'reminder')
      plan.notes.push(
        note('info', 'The reminder is sent {n} hours before, as in SSA.', {
          n: Math.max(1, Math.round(num(n.duration, 1440) / 60)),
        }),
      );
  }
  if (company && usesCompany)
    plan.notes.push(
      note('info', 'The company name “{name}” is written in the imported email texts.', {
        name: company,
      }),
    );
  const kinds = Object.keys(out.emails) as EmailKind[];
  if (kinds.length) {
    plan.notes.push(
      note('info', 'Customers’ email texts imported: {kinds}.', { kinds: kinds.join(', ') }),
    );
    if (!Object.values(out.emails).some((e) => e?.body.includes('{manage_url}')))
      plan.notes.push(
        note(
          'review',
          'The imported email texts have no link to cancel or move the appointment: add {manage_url} in Settings → Emails if you want it.',
        ),
      );
  }
  if (missing.size)
    plan.notes.push(
      note(
        'review',
        'Parts of the SSA email texts without an equivalent in Agenda were left out ({list}): check the texts in Settings → Emails.',
        { list: [...missing].slice(0, 8).join(', ') },
      ),
    );
  if (adminTexts)
    plan.notes.push(
      note(
        'skipped',
        '{n} email(s) to the administrator: Agenda sends its own notification, with every detail of the booking.',
        { n: adminTexts },
      ),
    );
  if (!kinds.includes('reminder'))
    plan.notes.push(
      note(
        'review',
        'SSA sent no reminder; Agenda sends one the day before: turn it off in Settings if you do not want it.',
      ),
    );
  return out;
}

// ---- The plan ---------------------------------------------------------------------------

export interface SsaData {
  settings?: unknown;
  appointment_types?: unknown;
  appointment_type_labels?: unknown;
  appointments?: unknown;
  appointment_meta?: unknown;
  /** SSA's cache of computed free times: not needed, only counted. */
  availability?: unknown;
}

export function planFromSsa(input: SsaData): ImportPlan {
  const settings = obj(input.settings);
  const tz = text(obj(settings.global).timezone_string, 64);
  const plan: ImportPlan = {
    source: 'ssa',
    timezone: tz && isTimeZone(tz) ? tz : null,
    services: [],
    exceptions: [],
    appointments: [],
    notes: [],
  };

  const labels = new Map(
    list(input.appointment_type_labels).map((l) => [text(obj(l).id, 40), obj(l)]),
  );
  const types = list(input.appointment_types);
  types.forEach((raw, index) => {
    const t = obj(raw);
    const id = text(t.id, 40);
    if (!id) return;
    const ssaStatus = text(t.status).toLowerCase();
    const title = text(t.title, 200) || `Appointment ${id}`;
    const fixed = text(t.availability_type) === 'start_times';
    const step = num(t.availability_increment, 15);
    const label = labels.get(text(t.label_id, 40));
    const labelName = text(label?.name, 100);
    const labelColor = LABEL_COLORS[text(label?.color, 40)];
    const form = ssaForm(t);
    const service = normalizeService({
      name: title,
      // SSA's "instructions" are shown to customers when they book.
      description: text(t.description) || text(t.instructions),
      // "Default" is the label SSA gives every type.
      category: labelName && labelName !== 'Default' ? labelName : '',
      duration: num(t.duration, 30),
      bufferBefore: num(t.buffer_before, 0),
      bufferAfter: num(t.buffer_after, 0),
      minNotice: num(t.min_booking_notice, 0),
      maxNotice: num(t.max_booking_notice, 0),
      capacity: text(t.capacity_type) === 'group' ? num(t.capacity, 1) : 1,
      status: ssaStatus === 'publish' ? 'active' : 'hidden',
      position: num(t.display_order, index),
      color: labelColor ?? COLORS[index % COLORS.length],
      schedule: {
        mode: fixed ? 'fixed' : 'intervals',
        step: fixed ? 0 : step,
        days: ssaDays(t.availability, fixed),
      },
      fields: form.fields,
      data: { import: { from: 'ssa', id, slug: text(t.slug, 100), status: ssaStatus } },
    });
    plan.services.push({ externalId: `ssa:type:${id}`, service });
    if (form.relaxed.length)
      plan.notes.push(
        note(
          'info',
          '“{name}”: {fields} were required in SSA and are imported as optional. You decide which ones to require in the service’s booking form, and can change it at any time.',
          { name: title, fields: form.relaxed.join(', ') },
        ),
      );
    if (ssaStatus !== 'publish')
      plan.notes.push(
        ssaStatus === 'delete' || ssaStatus === 'trash'
          ? note(
              'review',
              '“{name}” was deleted in SSA: it is imported hidden, with its appointments.',
              {
                name: title,
              },
            )
          : note('review', '“{name}” was not bookable in SSA: it is imported hidden.', {
              name: title,
            }),
      );
    if (num(t.max_event_count, 0) > 0)
      plan.notes.push(
        note(
          'review',
          '“{name}”: SSA allowed at most {n} appointments a day; Agenda has no such limit.',
          {
            name: title,
            n: num(t.max_event_count, 0),
          },
        ),
      );
    if (
      someDate(t.booking_start_date) ||
      someDate(t.booking_end_date) ||
      someDate(t.availability_start_date) ||
      someDate(t.availability_end_date)
    )
      plan.notes.push(
        note(
          'review',
          '“{name}” could be booked only between two dates in SSA: add closures in Agenda for the days outside.',
          { name: title },
        ),
      );
    const meetings = obj(t.web_meetings);
    if (text(meetings.provider) || text(meetings.url))
      plan.notes.push(
        note(
          'review',
          '“{name}”: the video call link of SSA is not imported; write it in the service’s description.',
          {
            name: title,
          },
        ),
      );
  });
  if (plan.services.length)
    plan.notes.push(
      note(
        'info',
        'Booking forms: name and email are required, the phone is asked as in SSA, every other question is optional. Change them in each service at any time; existing appointments keep their answers.',
      ),
    );
  if (plan.services.length)
    plan.notes.push(
      note('info', '{n} appointment type(s) became services: {active} bookable, {hidden} hidden.', {
        n: plan.services.length,
        active: plan.services.filter((s) => s.service.status === 'active').length,
        hidden: plan.services.filter((s) => s.service.status !== 'active').length,
      }),
    );

  // Blackout dates: closed days for every service.
  const blackout = obj(settings.blackout_dates);
  const blackoutDates = list(blackout.dates)
    .map((d) => text(typeof d === 'string' ? d : obj(d).date, 10))
    .filter(isDate);
  if (yes(blackout.enabled)) {
    for (const date of blackoutDates)
      plan.exceptions.push({
        serviceId: null,
        from: date,
        to: date,
        closed: true,
        hours: { windows: [], times: [] },
        note: 'SSA',
      });
  } else if (blackoutDates.length)
    plan.notes.push(
      note('skipped', '{n} blackout date(s): turned off in SSA.', { n: blackoutDates.length }),
    );
  if (yes(obj(settings.advanced_scheduling).enabled))
    plan.notes.push(
      note(
        'review',
        'SSA’s advanced scheduling options are not imported: check each service’s notice.',
      ),
    );

  // Meta of the appointments: the booking page (not needed) and the cancellation notes.
  const notesOf = new Map<string, string>();
  const meta = list(input.appointment_meta);
  for (const raw of meta) {
    const m = obj(raw);
    if (text(m.meta_key) === 'cancelation_note' && text(m.meta_value))
      notesOf.set(text(m.appointment_id, 40), text(m.meta_value, 2000));
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
      ...(notesOf.has(id) ? { notes: notesOf.get(id)! } : {}),
    });
  }
  if (plan.appointments.length) {
    const count = (s: Status) => plan.appointments.filter((a) => a.status === s).length;
    plan.notes.push(
      note(
        'info',
        '{n} appointment(s): {confirmed} confirmed, {cancelled} cancelled, {other} pending or no-show; times in UTC, as SSA stores them.',
        {
          n: plan.appointments.length,
          confirmed: count('confirmed'),
          cancelled: count('cancelled'),
          other: count('pending') + count('no_show'),
        },
      ),
    );
  }
  if (skipped)
    plan.notes.push(
      note(
        'skipped',
        '{n} appointment(s) never completed (abandoned, waiting for a form or a payment) or without a valid time.',
        { n: skipped },
      ),
    );
  if (meta.length)
    plan.notes.push(
      note(
        'skipped',
        '{n} appointment meta row(s): the page each booking was made on, not needed in Agenda.',
        { n: meta.length - notesOf.size },
      ),
    );
  const cache = list(input.availability).length;
  if (cache)
    plan.notes.push(
      note(
        'skipped',
        '{n} availability row(s): SSA’s cache of free times; Agenda works them out from the weekly hours.',
        { n: cache },
      ),
    );

  if (Object.keys(settings).length) plan.settings = settingsFrom(settings, plan);
  return plan;
}

// ---- Reading the file -------------------------------------------------------------------

const TABLES = [
  'appointment_type_labels',
  'appointment_types',
  'appointment_meta',
  'appointments',
  'availability',
] as const;

/**
 * SSA's data from a parsed JSON file: its export, its tables as rows (bare
 * or prefixed names, `ssa_settings_json` for the settings) or phpMyAdmin's
 * JSON export (`[{ type: 'table', name: 'wp_ssa_…', data: […] }]`).
 */
export function ssaTables(parsed: unknown): { data: SsaData; format: 'export' | 'tables' } {
  const source: Record<string, unknown> = {};
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const o = obj(item);
      if (o.type === 'table' && typeof o.name === 'string') source[o.name] = o.data;
    }
  } else Object.assign(source, obj(parsed), obj(obj(parsed).tables));
  const data: SsaData = {};
  let prefixed = Array.isArray(parsed);
  for (const [key, value] of Object.entries(source)) {
    const k = key.toLowerCase();
    if (k === 'settings' || k.endsWith('ssa_settings_json')) {
      data.settings = obj(value);
      continue;
    }
    const table = TABLES.find((t) => k === t || k.endsWith(`ssa_${t}`));
    if (!table) continue;
    if (k !== table) prefixed = true;
    data[table] = value;
  }
  // SSA's export has no `availability` (a cache): rows of the tables do.
  const format = prefixed || data.availability !== undefined ? 'tables' : 'export';
  return { data, format };
}

/** A pasted or uploaded SSA export or tables (JSON), or a dump/CSV of its tables. */
export function parseSsa(content: string, filename = ''): ImportPlan {
  const trimmed = content.trim().replace(/^\uFEFF/, '');
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(
        'The file is not valid JSON: copy the whole export of Simply Schedule Appointments.',
      );
    }
    const { data, format } = ssaTables(parsed);
    if (data.appointment_types === undefined && data.appointments === undefined && !data.settings)
      throw new Error(
        'No appointment types, appointments or settings of Simply Schedule Appointments in this file.',
      );
    const plan = planFromSsa(data);
    plan.notes.unshift(
      format === 'export'
        ? note('info', 'Read as the export of Simply Schedule Appointments.')
        : note('info', 'Read as the tables of Simply Schedule Appointments (JSON rows).'),
    );
    return plan;
  }
  if (/\.csv$/i.test(filename) || !/INSERT\s+INTO/i.test(trimmed)) {
    const rows = csvObjects(trimmed);
    const isTypes = rows[0] && 'availability_type' in rows[0];
    const plan = planFromSsa(isTypes ? { appointment_types: rows } : { appointments: rows });
    plan.notes.unshift(note('info', 'Read as a CSV of a Simply Schedule Appointments table.'));
    return plan;
  }
  const tables = readDump(trimmed, [
    'ssa_appointment_types',
    'ssa_appointment_type_labels',
    'ssa_appointments',
    'ssa_appointment_meta',
  ]);
  const plan = planFromSsa({
    appointment_types: tables.ssa_appointment_types,
    appointment_type_labels: tables.ssa_appointment_type_labels,
    appointments: tables.ssa_appointments,
    appointment_meta: tables.ssa_appointment_meta,
  });
  plan.notes.unshift(
    note('info', 'Read as a SQL dump of the Simply Schedule Appointments tables.'),
  );
  return plan;
}
