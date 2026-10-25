/**
 * The weekly hours of a service: for each day, time windows (a slot every
 * few minutes) or fixed start times, with "copy to every day" so a usual
 * week takes a few clicks. Also the hours of a special day (closures tab).
 */
import { useT } from '@cleitext/admin-sdk';
import { formatTime, parseTime } from '../model/time';
import type { DayHours, Schedule } from '../model/types';

/** Monday first, as in Italy and most of Europe. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function dayName(day: number, language: string, style: 'long' | 'short' = 'long'): string {
  // 2024-01-07 was a Sunday.
  return new Intl.DateTimeFormat(language === 'it' ? 'it-IT' : 'en-GB', {
    weekday: style,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2024, 0, 7 + day, 12)));
}

function TimesInput({
  times,
  onChange,
  label,
}: {
  times: number[];
  onChange: (t: number[]) => void;
  label: string;
}) {
  return (
    <input
      type="text"
      aria-label={label}
      placeholder="13:00, 14:15, 15:30"
      defaultValue={times.map(formatTime).join(', ')}
      onBlur={(e) => {
        const list = e.target.value
          .split(/[,;\s]+/)
          .map((x) => parseTime(x))
          .filter((x): x is number => x !== null && x < 1440);
        const sorted = [...new Set(list)].sort((a, b) => a - b);
        e.target.value = sorted.map(formatTime).join(', ');
        onChange(sorted);
      }}
    />
  );
}

export function DayEditor({
  hours,
  mode,
  onChange,
  label,
}: {
  hours: DayHours;
  mode: Schedule['mode'];
  onChange: (h: DayHours) => void;
  label: string;
}) {
  const { t } = useT();
  if (mode === 'fixed')
    return (
      <TimesInput
        key={hours.times.join()}
        times={hours.times}
        label={t('Start times on {day}', { day: label })}
        onChange={(times) => onChange({ ...hours, times })}
      />
    );
  return (
    <div className="agx-grid" style={{ gap: '.35rem' }}>
      {hours.windows.map((w, i) => (
        <div key={i} className="agx-row">
          <input
            type="time"
            aria-label={t('From')}
            value={formatTime(w.start)}
            style={{ width: '7.5rem' }}
            onChange={(e) => {
              const v = parseTime(e.target.value);
              if (v === null) return;
              onChange({
                ...hours,
                windows: hours.windows.map((x, j) => (j === i ? { ...x, start: v } : x)),
              });
            }}
          />
          <span>–</span>
          <input
            type="time"
            aria-label={t('To')}
            value={formatTime(w.end === 1440 ? 1439 : w.end)}
            style={{ width: '7.5rem' }}
            onChange={(e) => {
              const v = parseTime(e.target.value);
              if (v === null) return;
              onChange({
                ...hours,
                windows: hours.windows.map((x, j) => (j === i ? { ...x, end: v } : x)),
              });
            }}
          />
          <button
            type="button"
            className="agx-btn"
            aria-label={t('Remove')}
            onClick={() => onChange({ ...hours, windows: hours.windows.filter((_, j) => j !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="agx-link"
          onClick={() => {
            const last = hours.windows[hours.windows.length - 1];
            const start = last ? Math.min(last.end + 60, 22 * 60) : 9 * 60;
            onChange({
              ...hours,
              windows: [...hours.windows, { start, end: Math.min(start + 4 * 60, 1440) }],
            });
          }}
        >
          {hours.windows.length ? t('Add hours') : t('Open this day')}
        </button>
      </div>
    </div>
  );
}

export function ScheduleEditor({
  schedule,
  duration,
  onChange,
}: {
  schedule: Schedule;
  duration: number;
  onChange: (s: Schedule) => void;
}) {
  const { t, language } = useT();
  const setDay = (day: number, hours: DayHours) =>
    onChange({ ...schedule, days: schedule.days.map((d, i) => (i === day ? hours : d)) });
  const copyToAll = (day: number) => {
    const source = schedule.days[day]!;
    onChange({
      ...schedule,
      days: schedule.days.map((d, i) =>
        i === 0 || i === 6
          ? d
          : { windows: source.windows.map((w) => ({ ...w })), times: [...source.times] },
      ),
    });
  };
  return (
    <div className="agx-grid">
      <div className="agx-chips" role="group" aria-label={t('Kind of hours')}>
        <button
          type="button"
          className="agx-chip"
          aria-pressed={schedule.mode === 'intervals'}
          onClick={() => onChange({ ...schedule, mode: 'intervals' })}
        >
          {t('Open hours (a slot every few minutes)')}
        </button>
        <button
          type="button"
          className="agx-chip"
          aria-pressed={schedule.mode === 'fixed'}
          onClick={() => onChange({ ...schedule, mode: 'fixed' })}
        >
          {t('Fixed start times')}
        </button>
      </div>
      {schedule.mode === 'intervals' ? (
        <label className="agx-row">
          <span>{t('A new slot every')}</span>
          <select
            value={schedule.step}
            style={{ width: 'auto' }}
            onChange={(e) => onChange({ ...schedule, step: Number(e.target.value) })}
          >
            <option value={0}>{t('{n} minutes (the duration)', { n: duration })}</option>
            {[10, 15, 20, 30, 45, 60, 90, 120]
              .filter((n) => n !== duration)
              .map((n) => (
                <option key={n} value={n}>
                  {t('{n} minutes', { n })}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <p className="agx-help">
          {t(
            'Write the times the appointments start, separated by commas, e.g. 13:00, 14:15, 15:30.',
          )}
        </p>
      )}
      <table className="agx-days">
        <tbody>
          {WEEK.map((day) => (
            <tr key={day}>
              <th
                scope="row"
                style={{ width: '8rem', textAlign: 'left', textTransform: 'capitalize' }}
              >
                {dayName(day, language)}
              </th>
              <td>
                <DayEditor
                  hours={schedule.days[day]!}
                  mode={schedule.mode}
                  label={dayName(day, language)}
                  onChange={(h) => setDay(day, h)}
                />
              </td>
              <td style={{ width: '9rem' }}>
                {day === 1 ? (
                  <button type="button" className="agx-link" onClick={() => copyToAll(1)}>
                    {t('Copy to Tue–Fri')}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
