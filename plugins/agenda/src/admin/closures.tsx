/** Holidays, closures and days with other hours, for every service or one. */
import { useT } from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import { localDate } from '../model/time';
import type { DayHours, Exception, Service } from '../model/types';
import { agenda, messageOf } from './api';
import { DayEditor } from './schedule';
import { Field } from './ui';

export function Closures({ services, timeZone }: { services: Service[]; timeZone: string }) {
  const { t, language } = useT();
  const today = localDate(Date.now(), timeZone);
  const [list, setList] = useState<Exception[] | null>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [serviceId, setServiceId] = useState('');
  const [closed, setClosed] = useState(true);
  const [hours, setHours] = useState<DayHours>({
    windows: [{ start: 9 * 60, end: 13 * 60 }],
    times: [],
  });
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const load = () => {
    agenda
      .exceptions()
      .then(setList)
      .catch((e) => setError(messageOf(e)));
  };
  useEffect(load, []);
  const service = services.find((s) => s.id === serviceId);
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(language === 'it' ? 'it-IT' : 'en-GB', {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${d}T12:00:00Z`));

  async function add() {
    setError('');
    try {
      await agenda.createException({
        from,
        to: to < from ? from : to,
        serviceId: serviceId || null,
        closed,
        hours,
        note,
      });
      setNote('');
      load();
    } catch (e) {
      setError(messageOf(e));
    }
  }

  return (
    <div className="agx-grid">
      <div className="agx-card agx-grid">
        <h2>{t('Add a closure or special hours')}</h2>
        <div className="agx-cols">
          <Field label={t('From')}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t('To')}>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label={t('For')}>
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">{t('Every service')}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Note (only for you)')}>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('e.g. Holidays')}
            />
          </Field>
        </div>
        <div className="agx-chips">
          <button
            type="button"
            className="agx-chip"
            aria-pressed={closed}
            onClick={() => setClosed(true)}
          >
            {t('Closed')}
          </button>
          <button
            type="button"
            className="agx-chip"
            aria-pressed={!closed}
            onClick={() => setClosed(false)}
          >
            {t('Open with other hours')}
          </button>
        </div>
        {!closed ? (
          <DayEditor
            hours={hours}
            mode={service?.schedule.mode ?? 'intervals'}
            label={t('Hours')}
            onChange={setHours}
          />
        ) : null}
        {error ? (
          <p className="agx-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div>
          <button type="button" className="agx-btn agx-primary" onClick={() => void add()}>
            {t('Add')}
          </button>
        </div>
      </div>
      <div className="agx-card" style={{ padding: 0 }}>
        {list === null ? (
          <p className="agx-muted" style={{ padding: '1rem' }}>
            {t('Loading…')}
          </p>
        ) : list.length === 0 ? (
          <p className="agx-muted" style={{ padding: '1rem', margin: 0 }}>
            {t('No closures.')}
          </p>
        ) : (
          <table className="agx-table">
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td>
                    {fmt(e.from)}
                    {e.to !== e.from ? ` – ${fmt(e.to)}` : ''}
                  </td>
                  <td>
                    {e.serviceId
                      ? (services.find((s) => s.id === e.serviceId)?.name ?? '—')
                      : t('Every service')}
                  </td>
                  <td>{e.closed ? t('Closed') : t('Other hours')}</td>
                  <td className="agx-muted">{e.note}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="agx-btn"
                      onClick={() => void agenda.removeException(e.id).then(load)}
                    >
                      {t('Remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
