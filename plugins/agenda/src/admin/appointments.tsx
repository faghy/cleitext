/**
 * The appointments: a list (with filters, search and CSV export) and a
 * calendar by day, week or month; one appointment opens in a side panel
 * with its details, status buttons, a new time and notes. "New
 * appointment" books one by hand (a call, a walk-in).
 */
import { useT } from '@cleitext/admin-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SLUG } from '../config';
import { addDays, localDate, localMinutes, formatTime, localToUtc } from '../model/time';
import type { Appointment, Service, Status } from '../model/types';
import { agenda, agendaApi, messageOf } from './api';
import { Check, Field, Pill } from './ui';

type View = 'list' | 'day' | 'week' | 'month';

function useFormat(timeZone: string) {
  const { language } = useT();
  const lang = language === 'it' ? 'it-IT' : 'en-GB';
  return {
    date: (ms: number) =>
      new Intl.DateTimeFormat(lang, {
        timeZone,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(ms)),
    time: (ms: number) =>
      new Intl.DateTimeFormat(lang, {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(ms)),
    day: (date: string, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(lang, { timeZone: 'UTC', ...options }).format(
        new Date(`${date}T12:00:00Z`),
      ),
  };
}

const startOfWeek = (date: string) => {
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
};

function rangeOf(view: View, anchor: string): { from: string; to: string } {
  if (view === 'day') return { from: anchor, to: anchor };
  if (view === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  if (view === 'month') {
    const first = `${anchor.slice(0, 7)}-01`;
    const from = startOfWeek(first);
    const [y, m] = anchor.split('-').map(Number) as [number, number];
    const last = `${anchor.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    return { from, to: addDays(startOfWeek(last), 6) };
  }
  return { from: anchor, to: addDays(anchor, 89) };
}

export function Appointments({
  services,
  timeZone,
  onChanged,
  initial,
}: {
  services: Service[];
  timeZone: string;
  onChanged: () => void;
  initial: string | null;
}) {
  const { t } = useT();
  const f = useFormat(timeZone);
  const today = localDate(Date.now(), timeZone);
  const [view, setView] = useState<View>('list');
  const [anchor, setAnchor] = useState(today);
  const [service, setService] = useState('');
  const [status, setStatus] = useState('confirmed,pending');
  const [search, setSearch] = useState('');
  const [past, setPast] = useState(false);
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(initial);
  const [creating, setCreating] = useState(false);
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const range = rangeOf(view, anchor);
  const query = useMemo(() => {
    const q: Record<string, string> = {};
    if (view === 'list') {
      if (past) {
        q.to = new Date().toISOString();
        q.order = 'desc';
      } else q.from = new Date().toISOString();
    } else {
      q.from = new Date(
        localToUtc(range.from, 0, timeZone) ?? Date.parse(range.from),
      ).toISOString();
      q.to = new Date(
        localToUtc(addDays(range.to, 1), 0, timeZone) ?? Date.parse(range.to),
      ).toISOString();
    }
    if (service) q.service = service;
    if (status) q.status = status;
    if (search.trim()) q.q = search.trim();
    q.limit = view === 'list' ? '200' : '1000';
    return q;
  }, [view, range.from, range.to, service, status, search, past, timeZone]);

  const load = useCallback(() => {
    agenda
      .appointments(query)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
        setError('');
      })
      .catch((e) => setError(messageOf(e)));
  }, [JSON.stringify(query)]);
  useEffect(load, [load]);

  const changed = () => {
    load();
    onChanged();
  };

  const move = (n: number) => {
    if (view === 'day') setAnchor(addDays(anchor, n));
    else if (view === 'week') setAnchor(addDays(anchor, 7 * n));
    else {
      const [y, m] = anchor.split('-').map(Number) as [number, number];
      const d = new Date(Date.UTC(y, m - 1 + n, 1));
      setAnchor(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`);
    }
  };

  const exportUrl = `/api/v1/ext/${SLUG}/export.csv?${new URLSearchParams({ ...query, limit: '5000' }).toString()}`;
  const current = items?.find((a) => a.id === open) ?? null;

  const event = (a: Appointment) => {
    const s = byId.get(a.serviceId);
    const start = Date.parse(a.start);
    return (
      <button
        key={a.id}
        type="button"
        className={`agx-event${a.status === 'cancelled' ? ' is-cancelled' : ''}`}
        style={{ ['--c' as string]: s?.color ?? '#2563eb' }}
        onClick={() => setOpen(a.id)}
        title={`${f.time(start)} ${a.name} · ${s?.name ?? ''}`}
      >
        {f.time(start)} {a.name || '—'}
      </button>
    );
  };

  const days: string[] = [];
  if (view !== 'list') for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d);
  const onDay = (d: string) =>
    (items ?? []).filter((a) => localDate(Date.parse(a.start), timeZone) === d);

  return (
    <div className="agx-grid">
      <div className="agx-row" style={{ justifyContent: 'space-between' }}>
        <div className="agx-chips" role="group" aria-label={t('View')}>
          {(['list', 'day', 'week', 'month'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              className="agx-chip"
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {{ list: t('List'), day: t('Day'), week: t('Week'), month: t('Month') }[v]}
            </button>
          ))}
        </div>
        <div className="agx-row">
          <button type="button" className="agx-btn agx-primary" onClick={() => setCreating(true)}>
            + {t('New appointment')}
          </button>
          <a className="agx-btn" href={exportUrl} download>
            {t('Export CSV')}
          </a>
        </div>
      </div>
      <div className="agx-row">
        {view !== 'list' ? (
          <>
            <button
              type="button"
              className="agx-btn"
              aria-label={t('Previous')}
              onClick={() => move(-1)}
            >
              ‹
            </button>
            <button type="button" className="agx-btn" onClick={() => setAnchor(today)}>
              {t('Today')}
            </button>
            <button
              type="button"
              className="agx-btn"
              aria-label={t('Next')}
              onClick={() => move(1)}
            >
              ›
            </button>
            <strong style={{ textTransform: 'capitalize', minWidth: '12rem' }}>
              {view === 'month'
                ? f.day(anchor, { month: 'long', year: 'numeric' })
                : view === 'day'
                  ? f.day(anchor, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : `${f.day(range.from, { day: 'numeric', month: 'short' })} – ${f.day(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </strong>
          </>
        ) : (
          <div className="agx-chips">
            <button
              type="button"
              className="agx-chip"
              aria-pressed={!past}
              onClick={() => setPast(false)}
            >
              {t('Upcoming')}
            </button>
            <button
              type="button"
              className="agx-chip"
              aria-pressed={past}
              onClick={() => setPast(true)}
            >
              {t('Past')}
            </button>
          </div>
        )}
        <select
          aria-label={t('Service')}
          value={service}
          onChange={(e) => setService(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="">{t('All services')}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t('Status')}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="confirmed,pending">{t('Confirmed and pending')}</option>
          <option value="pending">{t('Pending')}</option>
          <option value="confirmed">{t('Confirmed')}</option>
          <option value="cancelled">{t('Cancelled')}</option>
          <option value="no_show">{t('No-show')}</option>
          <option value="">{t('Any status')}</option>
        </select>
        <input
          type="search"
          placeholder={t('Search name, email, phone')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '14rem' }}
        />
      </div>
      {error ? (
        <p className="agx-alert" role="alert">
          {error}
        </p>
      ) : null}
      {items === null ? (
        <p className="agx-muted">{t('Loading…')}</p>
      ) : view === 'list' ? (
        items.length === 0 ? (
          <div className="agx-card">
            <p className="agx-muted" style={{ margin: 0 }}>
              {t('No appointments here.')}
            </p>
          </div>
        ) : (
          <div className="agx-card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="agx-table">
              <thead>
                <tr>
                  <th>{t('When')}</th>
                  <th>{t('Customer')}</th>
                  <th>{t('Service')}</th>
                  <th>{t('Status')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const start = Date.parse(a.start);
                  return (
                    <tr key={a.id} data-click="" onClick={() => setOpen(a.id)}>
                      <td>
                        <button
                          type="button"
                          className="agx-link"
                          onClick={() => setOpen(a.id)}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <strong>{f.date(start)}</strong> {f.time(start)}
                        </button>
                      </td>
                      <td>
                        {a.anonymized ? <em className="agx-muted">{t('Erased')}</em> : a.name}
                        <div className="agx-muted">
                          {a.email}
                          {a.phone ? ` · ${a.phone}` : ''}
                        </div>
                      </td>
                      <td>{byId.get(a.serviceId)?.name ?? '—'}</td>
                      <td>
                        <Pill status={a.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {total > items.length ? (
              <p className="agx-help" style={{ padding: '.5rem' }}>
                {t('Showing {n} of {total}.', { n: items.length, total })}
              </p>
            ) : null}
          </div>
        )
      ) : view === 'day' ? (
        <div className="agx-card">
          {onDay(anchor).length === 0 ? (
            <p className="agx-muted" style={{ margin: 0 }}>
              {t('No appointments here.')}
            </p>
          ) : (
            onDay(anchor).map(event)
          )}
        </div>
      ) : (
        <div
          className={`agx-cal ${view === 'week' ? 'agx-cal-week' : 'agx-cal-month'}`}
          style={{ overflowX: 'auto' }}
        >
          {days.map((d) => (
            <div
              key={d}
              className={`agx-day${d === today ? ' is-today' : ''}${view === 'month' && d.slice(0, 7) !== anchor.slice(0, 7) ? ' is-other' : ''}`}
            >
              <div className="agx-day-head">
                <button
                  type="button"
                  className="agx-link"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                  onClick={() => {
                    setAnchor(d);
                    setView('day');
                  }}
                >
                  {view === 'week'
                    ? f.day(d, { weekday: 'short', day: 'numeric' })
                    : Number(d.slice(8))}
                </button>
              </div>
              {onDay(d)
                .slice(0, view === 'month' ? 4 : 50)
                .map(event)}
              {view === 'month' && onDay(d).length > 4 ? (
                <span className="agx-help">+{onDay(d).length - 4}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {current ? (
        <Details
          appointment={current}
          service={byId.get(current.serviceId) ?? null}
          timeZone={timeZone}
          onClose={() => setOpen(null)}
          onChanged={changed}
        />
      ) : open && items !== null ? (
        <OpenById
          id={open}
          services={byId}
          timeZone={timeZone}
          onClose={() => setOpen(null)}
          onChanged={changed}
        />
      ) : null}
      {creating ? (
        <NewAppointment
          services={services}
          timeZone={timeZone}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            changed();
          }}
        />
      ) : null}
    </div>
  );
}

/** An appointment not in the list shown (a link from an email or the dashboard). */
function OpenById(props: {
  id: string;
  services: Map<string, Service>;
  timeZone: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [a, setA] = useState<Appointment | null>(null);
  useEffect(() => {
    agendaApi<Appointment>('GET', `/appointments/${props.id}`).then(setA).catch(props.onClose);
  }, [props.id]);
  if (!a) return null;
  return (
    <Details
      appointment={a}
      service={props.services.get(a.serviceId) ?? null}
      timeZone={props.timeZone}
      onClose={props.onClose}
      onChanged={() => {
        props.onChanged();
      }}
    />
  );
}

function toLocalInput(ms: number, timeZone: string) {
  return `${localDate(ms, timeZone)}T${formatTime(localMinutes(ms, timeZone))}`;
}

function fromLocalInput(value: string, timeZone: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return localToUtc(m[1]!, Number(m[2]) * 60 + Number(m[3]), timeZone);
}

function Details({
  appointment: a,
  service,
  timeZone,
  onClose,
  onChanged,
}: {
  appointment: Appointment;
  service: Service | null;
  timeZone: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useT();
  const f = useFormat(timeZone);
  const [notify, setNotify] = useState(true);
  const [when, setWhen] = useState(toLocalInput(Date.parse(a.start), timeZone));
  const [notes, setNotes] = useState(a.notes);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setWhen(toLocalInput(Date.parse(a.start), timeZone));
    setNotes(a.notes);
  }, [a.id, a.start]);

  const run = async (input: Parameters<typeof agenda.update>[1]) => {
    setBusy(true);
    setError('');
    try {
      await agenda.update(a.id, { ...input, notify });
      onChanged();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  const start = Date.parse(a.start);
  const statusButton = (status: Status, label: string) =>
    a.status === status ? null : (
      <button
        type="button"
        className={`agx-btn${status === 'cancelled' ? ' agx-danger' : ''}`}
        disabled={busy}
        onClick={() => void run({ status })}
      >
        {label}
      </button>
    );
  return (
    <aside className="agx-panel agx" role="dialog" aria-modal="false" aria-label={t('Appointment')}>
      <div className="agx-row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>{service?.name ?? t('Appointment')}</h2>
        <button type="button" className="agx-btn" onClick={onClose} aria-label={t('Close')}>
          ×
        </button>
      </div>
      <dl className="agx-dl">
        <dt>{t('When')}</dt>
        <dd>
          {f.date(start)}, {f.time(start)}–{f.time(Date.parse(a.end))}
        </dd>
        <dt>{t('Status')}</dt>
        <dd>
          <Pill status={a.status} />
        </dd>
        <dt>{t('Name')}</dt>
        <dd>{a.anonymized ? <em>{t('Erased')}</em> : a.name}</dd>
        <dt>Email</dt>
        <dd>{a.email ? <a href={`mailto:${a.email}`}>{a.email}</a> : '—'}</dd>
        <dt>{t('Phone')}</dt>
        <dd>{a.phone ? <a href={`tel:${a.phone.replace(/\s+/g, '')}`}>{a.phone}</a> : '—'}</dd>
        {a.fields.map((field) => (
          <FragmentRow key={field.name} label={field.label} value={field.value} />
        ))}
        <dt>{t('Source')}</dt>
        <dd>{{ site: t('The site'), admin: t('By hand'), import: t('Imported') }[a.source]}</dd>
        <dt>{t('Booked on')}</dt>
        <dd>{f.date(Date.parse(a.createdAt))}</dd>
      </dl>
      {error ? (
        <p className="agx-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="agx-grid">
        <div className="agx-row">
          {a.status === 'pending' ? statusButton('confirmed', t('Confirm')) : null}
          {a.status !== 'pending' ? statusButton('confirmed', t('Mark as confirmed')) : null}
          {start < Date.now() ? statusButton('no_show', t('Did not come')) : null}
          {statusButton('cancelled', t('Cancel'))}
        </div>
        {a.status === 'confirmed' || a.status === 'pending' ? (
          <div className="agx-row">
            <Field label={t('Move to')}>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            <button
              type="button"
              className="agx-btn"
              style={{ alignSelf: 'end' }}
              disabled={busy || when === toLocalInput(start, timeZone)}
              onClick={() => {
                const ms = fromLocalInput(when, timeZone);
                if (ms === null) setError(t('Choose a date and a time.'));
                else void run({ start: new Date(ms).toISOString() });
              }}
            >
              {t('Move')}
            </button>
          </div>
        ) : null}
        <Check
          label={t('Email the customer about changes')}
          checked={notify}
          onChange={setNotify}
        />
        <Field label={t('Private notes')}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div>
          <button
            type="button"
            className="agx-btn"
            disabled={busy || notes === a.notes}
            onClick={() => void run({ notes })}
          >
            {t('Save notes')}
          </button>
        </div>
      </div>
    </aside>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function NewAppointment({
  services,
  timeZone,
  onClose,
  onCreated,
}: {
  services: Service[];
  timeZone: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useT();
  const f = useFormat(timeZone);
  const usable = services.filter((s) => s.status !== 'archived');
  const [serviceId, setServiceId] = useState(usable[0]?.id ?? '');
  const [date, setDate] = useState(localDate(Date.now(), timeZone));
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState<{ start: string }[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!serviceId) return;
    agenda
      .slots(serviceId, date, date)
      .then((r) => setSlots(r.slots))
      .catch(() => setSlots([]));
  }, [serviceId, date]);
  async function save() {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time);
    const start = m ? localToUtc(date, Number(m[1]) * 60 + Number(m[2]), timeZone) : null;
    if (start === null) {
      setError(t('Choose a date and a time.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await agenda.book({
        serviceId,
        start: new Date(start).toISOString(),
        name,
        email,
        phone,
        notes,
        notify,
      });
      onCreated();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="agx-panel agx" role="dialog" aria-label={t('New appointment')}>
      <div className="agx-row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>{t('New appointment')}</h2>
        <button type="button" className="agx-btn" onClick={onClose} aria-label={t('Close')}>
          ×
        </button>
      </div>
      <div className="agx-grid">
        <Field label={t('Service')}>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {usable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="agx-cols">
          <Field label={t('Date')}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('Time')}>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {slots.length ? (
          <div className="agx-field">
            <span className="agx-help">{t('Free times')}</span>
            <div className="agx-chips">
              {slots.map((s) => {
                const label = f.time(Date.parse(s.start));
                return (
                  <button
                    key={s.start}
                    type="button"
                    className="agx-chip"
                    aria-pressed={time === label}
                    onClick={() => setTime(label)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="agx-help">
            {t('No free times on this day: you can still choose a time by hand.')}
          </p>
        )}
        <Field label={t('Name')}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('Phone')}>
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t('Private notes')}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Check
          label={t('Send the confirmation to the customer')}
          checked={notify}
          onChange={setNotify}
        />
        {error ? (
          <p className="agx-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div>
          <button
            type="button"
            className="agx-btn agx-primary"
            disabled={busy || !serviceId || !name.trim()}
            onClick={() => void save()}
          >
            {t('Book')}
          </button>
        </div>
      </div>
    </aside>
  );
}
