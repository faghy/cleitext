/**
 * Everything that comes in (the admin, imports, older rows) made complete
 * and safe: numbers in range, times sorted, texts trimmed.
 */
import { formatTime, isDate, isTimeZone, parseTime } from './time';
import {
  EMAIL_KINDS,
  type CustomField,
  type DayHours,
  type EmailKind,
  type EmailText,
  type Exception,
  type FieldType,
  type Schedule,
  type Service,
  type ServiceText,
  type Settings,
  type Window,
} from './types';

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '';
export const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n)
    ? Math.min(max, Math.max(min, Math.round(n)))
    : fallback;
};
const bool = (v: unknown, fallback: boolean) =>
  typeof v === 'boolean'
    ? v
    : v === 'true' || v === 1 || v === '1'
      ? true
      : v === 'false' || v === 0 || v === '0'
        ? false
        : fallback;

const minutesOf = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1440 ? v : parseTime(v);

export function normalizeWindows(value: unknown): Window[] {
  const list = Array.isArray(value) ? value : [];
  const out: Window[] = [];
  for (const item of list.slice(0, 24)) {
    const o = obj(item);
    const start = minutesOf(o.start);
    const end = minutesOf(o.end);
    if (start === null || end === null || end <= start) continue;
    out.push({ start, end });
  }
  out.sort((a, b) => a.start - b.start);
  // Overlapping windows become one.
  const merged: Window[] = [];
  for (const w of out) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }
  return merged;
}

export function normalizeTimes(value: unknown): number[] {
  const list = Array.isArray(value) ? value : [];
  const set = new Set<number>();
  for (const item of list.slice(0, 96)) {
    const m = minutesOf(item);
    if (m !== null && m < 1440) set.add(m);
  }
  return [...set].sort((a, b) => a - b);
}

export function normalizeDay(value: unknown): DayHours {
  const o = obj(value);
  return { windows: normalizeWindows(o.windows), times: normalizeTimes(o.times) };
}

/** Monday to Friday, 9–13 and 14–18: the schedule of a new service. */
export function defaultSchedule(): Schedule {
  const work = (): DayHours => ({
    windows: [
      { start: 9 * 60, end: 13 * 60 },
      { start: 14 * 60, end: 18 * 60 },
    ],
    times: [],
  });
  const off = (): DayHours => ({ windows: [], times: [] });
  return {
    mode: 'intervals',
    step: 0,
    days: [off(), work(), work(), work(), work(), work(), off()],
  };
}

export function normalizeSchedule(value: unknown): Schedule {
  const o = obj(value);
  if (!Array.isArray(o.days)) return defaultSchedule();
  const days = Array.from({ length: 7 }, (_, i) =>
    normalizeDay(o.days instanceof Array ? o.days[i] : null),
  );
  return {
    mode: o.mode === 'fixed' ? 'fixed' : 'intervals',
    step: int(o.step, 0, 720, 0),
    days,
  };
}

const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'select', 'checkbox', 'number', 'date'];
const RESERVED = new Set(['name', 'email', 'phone', 'consent', 'website', 'service', 'start']);

export function normalizeFields(value: unknown): CustomField[] {
  const list = Array.isArray(value) ? value : [];
  const out: CustomField[] = [];
  const seen = new Set<string>();
  for (const item of list.slice(0, 20)) {
    const o = obj(item);
    const label = str(o.label, 300);
    let name = str(o.name, 40)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^[^a-z]+/, '')
      .replace(/-+$/, '');
    if (!name) name = `field-${out.length + 1}`;
    if (!label || RESERVED.has(name) || seen.has(name)) continue;
    seen.add(name);
    const type = FIELD_TYPES.includes(o.type as FieldType) ? (o.type as FieldType) : 'text';
    const options = (
      Array.isArray(o.options)
        ? o.options
        : typeof o.options === 'string'
          ? o.options.split(/\r?\n/)
          : []
    )
      .map((x) => str(x, 200))
      .filter(Boolean)
      .slice(0, 50);
    out.push({ name, label, type, required: bool(o.required, false), options });
  }
  return out;
}

function normalizeTranslations(value: unknown): Record<string, ServiceText> {
  const out: Record<string, ServiceText> = {};
  for (const [locale, v] of Object.entries(obj(value)).slice(0, 30)) {
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(locale)) continue;
    const o = obj(v);
    const t: ServiceText = {};
    if (str(o.name, 200)) t.name = str(o.name, 200);
    if (str(o.description, 5000)) t.description = str(o.description, 5000);
    if (str(o.price, 100)) t.price = str(o.price, 100);
    if (Object.keys(t).length) out[locale] = t;
  }
  return out;
}

export const COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#4b5563',
];

/** Minutes in a year: the longest notice. */
const YEAR = 366 * 24 * 60;

export function normalizeService(value: unknown, id = ''): Service {
  const o = obj(value);
  const color = str(o.color, 9);
  return {
    id: str(o.id, 40) || id,
    name: str(o.name, 200) || 'Appointment',
    description: str(o.description, 5000),
    category: str(o.category, 100),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : COLORS[0]!,
    duration: int(o.duration, 5, 24 * 60, 30),
    bufferBefore: int(o.bufferBefore, 0, 24 * 60, 0),
    bufferAfter: int(o.bufferAfter, 0, 24 * 60, 0),
    minNotice: int(o.minNotice, 0, YEAR, 0),
    maxNotice: int(o.maxNotice, 0, 2 * YEAR, 0),
    price: str(o.price, 100),
    capacity: int(o.capacity, 1, 1000, 1),
    approval: bool(o.approval, false),
    status: o.status === 'hidden' || o.status === 'archived' ? o.status : 'active',
    schedule: normalizeSchedule(o.schedule),
    fields: normalizeFields(o.fields),
    translations: normalizeTranslations(o.translations),
    position: int(o.position, 0, 10000, 0),
    data: obj(o.data),
  };
}

/** The service's texts in a language (the default ones where it has none). */
export function serviceText(service: Service, locale: string): Required<ServiceText> {
  const t = service.translations[locale] ?? service.translations[locale.split('-')[0]!] ?? {};
  return {
    name: t.name || service.name,
    description: t.description || service.description,
    price: t.price || service.price,
  };
}

export function normalizeException(value: unknown, id = ''): Exception | null {
  const o = obj(value);
  const from = str(o.from, 10);
  const to = str(o.to, 10) || from;
  if (!isDate(from) || !isDate(to) || to < from) return null;
  const serviceId = str(o.serviceId, 40);
  return {
    id: str(o.id, 40) || id,
    serviceId: serviceId || null,
    from,
    to,
    closed: bool(o.closed, true),
    hours: normalizeDay(o.hours),
    note: str(o.note, 300),
  };
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export const isEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 200 && EMAIL_RE.test(v);

export function emailList(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(isEmail)
    .slice(0, 10);
}

export const DEFAULT_SETTINGS: Settings = {
  notify: '',
  contact: '',
  timezone: '',
  shared: true,
  changeNoticeHours: 24,
  allowCancel: true,
  allowReschedule: true,
  reminders: true,
  reminderHours: 24,
  retentionMonths: 24,
  privacyUrl: '',
  phone: 'optional',
  emails: {},
  setupDone: false,
};

function normalizeEmails(value: unknown): Settings['emails'] {
  const out: Settings['emails'] = {};
  for (const [locale, v] of Object.entries(obj(value)).slice(0, 30)) {
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(locale)) continue;
    const kinds: Partial<Record<EmailKind, EmailText>> = {};
    for (const kind of EMAIL_KINDS) {
      const t = obj(obj(v)[kind]);
      const subject = str(t.subject, 200);
      const body = str(t.body, 10000);
      if (subject || body) kinds[kind] = { subject, body };
    }
    if (Object.keys(kinds).length) out[locale] = kinds;
  }
  return out;
}

export function normalizeSettings(value: unknown): Settings {
  const o = obj(value);
  const d = DEFAULT_SETTINGS;
  const tz = str(o.timezone, 64);
  const privacy = str(o.privacyUrl, 300);
  return {
    notify: emailList(str(o.notify, 1000)).join(', '),
    contact: str(o.contact, 1000),
    timezone: tz && isTimeZone(tz) ? tz : '',
    shared: bool(o.shared, d.shared),
    changeNoticeHours: int(o.changeNoticeHours, 0, 24 * 30, d.changeNoticeHours),
    allowCancel: bool(o.allowCancel, d.allowCancel),
    allowReschedule: bool(o.allowReschedule, d.allowReschedule),
    reminders: bool(o.reminders, d.reminders),
    reminderHours: int(o.reminderHours, 1, 24 * 7, d.reminderHours),
    retentionMonths: int(o.retentionMonths, 0, 120, d.retentionMonths),
    privacyUrl: /^(\/|https?:\/\/)/.test(privacy) ? privacy : '',
    phone: o.phone === 'required' || o.phone === 'off' ? o.phone : 'optional',
    emails: normalizeEmails(o.emails),
    setupDone: bool(o.setupDone, false),
  };
}

export { formatTime };
