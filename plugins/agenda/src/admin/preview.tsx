/**
 * What the customer will see, live, while a service is set up: the booking
 * widget's own stylesheet with its month calendar and the first free day's
 * times, computed by the same function as the site (no appointments yet),
 * and the booking form as the site draws it, in each language of the site.
 */
import { useT } from '@cleitext/admin-sdk';
import { useMemo, useState } from 'react';
import { formOf, visibleFields } from '../model/form';
import { freeSlots } from '../model/slots';
import { stringsFor } from '../model/strings';
import { addDays, localDate } from '../model/time';
import type { Service } from '../model/types';
import { FormField } from '../render';
import { pad } from './ui';

export function Preview({
  service,
  timeZone,
  locales = [],
}: {
  service: Service;
  timeZone: string;
  /** The site's languages, its own first: the form is shown in each (none: the admin's). */
  locales?: string[];
}) {
  const { t, language } = useT();
  const [formLocale, setFormLocale] = useState(locales[0] ?? language);
  const strings = stringsFor(formLocale);
  const lang = language === 'it' ? 'it-IT' : 'en-GB';
  const today = localDate(Date.now(), timeZone);
  const first = `${today.slice(0, 7)}-01`;
  const [y, m] = first.split('-').map(Number) as [number, number];
  const last = `${today.slice(0, 7)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  const slots = useMemo(
    () =>
      freeSlots({
        service: { ...service, id: service.id || 'preview' },
        exceptions: [],
        busy: [],
        from: today,
        to: addDays(last, 0),
        now: Date.now(),
        timeZone,
        shared: true,
      }),
    [JSON.stringify(service), timeZone, today, last],
  );
  const byDay = new Map<string, number[]>();
  for (const s of slots) {
    const d = localDate(s.start, timeZone);
    byDay.set(d, [...(byDay.get(d) ?? []), s.start]);
  }
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && byDay.has(picked) ? picked : ([...byDay.keys()][0] ?? null);
  const label = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(lang, { timeZone: 'UTC', ...options }).format(
      new Date(`${date}T12:00:00Z`),
    );
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(offset).fill(null)];
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  const time = (ms: number) =>
    new Intl.DateTimeFormat(lang, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(ms));
  return (
    <div>
      <p className="agx-preview-label">{t('What your customers see')}</p>
      <div className="agx-preview">
        <div className="ag" style={{ maxWidth: '100%' }}>
          <div className="ag-summary">
            <span>
              <strong>{service.name || t('Your service')}</strong> ·{' '}
              {t('{n} min', { n: service.duration })}
              {service.price ? ` · ${service.price}` : ''}
            </span>
          </div>
          <div className="ag-nav">
            <span className="ag-icon" aria-hidden="true">
              ‹
            </span>
            <span className="ag-nav-label">{label(first, { month: 'long', year: 'numeric' })}</span>
            <span className="ag-icon" aria-hidden="true">
              ›
            </span>
          </div>
          <div className="ag-month">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span key={i} className="ag-dow">
                {label(addDays('2024-01-01', i), { weekday: 'narrow' })}
              </span>
            ))}
            {cells.map((d, i) =>
              d ? (
                <button
                  key={d}
                  type="button"
                  className={`ag-day${byDay.has(d) ? ' is-free' : ''}`}
                  aria-pressed={d === day}
                  disabled={!byDay.has(d)}
                  onClick={() => setPicked(d)}
                >
                  {Number(d.slice(8))}
                </button>
              ) : (
                <span key={`e${i}`} />
              ),
            )}
          </div>
          {day ? (
            <>
              <p className="ag-times-title">
                {label(day, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <div className="ag-times">
                {(byDay.get(day) ?? []).slice(0, 12).map((ms) => (
                  <span key={ms} className="ag-time">
                    {time(ms)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="ag-note">{t('No free times this month with these hours.')}</p>
          )}
        </div>
      </div>
      <div className="agx-row" style={{ justifyContent: 'space-between', margin: '1rem 0 .5rem' }}>
        <p className="agx-preview-label" style={{ margin: 0 }}>
          {t('The booking form')}
        </p>
        {locales.length > 1 ? (
          <div className="agx-chips" role="group" aria-label={t('Language of the preview')}>
            {locales.map((l) => (
              <button
                key={l}
                type="button"
                className="agx-chip"
                aria-pressed={l === formLocale}
                onClick={() => setFormLocale(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="agx-form-preview" data-agx-form-preview="">
        <div className="ag" style={{ maxWidth: '100%' }} lang={formLocale}>
          <div className="ag-form">
            <div className="ag-fields">
              {visibleFields(formOf(service)).map((field) => (
                <FormField
                  key={field.name}
                  field={field}
                  uid="agx-preview"
                  strings={strings}
                  locale={formLocale}
                />
              ))}
            </div>
            <span className="ag-primary" style={{ textAlign: 'center' }}>
              {strings.book}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
