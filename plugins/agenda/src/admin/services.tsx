/**
 * The services: a list, and the editor of one with the essentials first
 * (name, duration, hours) and the rest under "More options" (buffers,
 * notice, places, approval, questions, other languages), with the live
 * preview beside it.
 */
import { useT } from '@cleitext/admin-sdk';
import { useState } from 'react';
import { COLORS, defaultSchedule, normalizeService } from '../model/normalize';
import type { CustomField, Service } from '../model/types';
import { agenda, messageOf } from './api';
import { Preview } from './preview';
import { ScheduleEditor } from './schedule';
import { Check, Field } from './ui';

export function Services({
  services,
  timeZone,
  locales,
  defaultLocale,
  onChanged,
}: {
  services: Service[];
  timeZone: string;
  locales: string[];
  defaultLocale: string;
  onChanged: () => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState<Service | null>(null);
  if (editing)
    return (
      <ServiceEditor
        initial={editing}
        timeZone={timeZone}
        locales={locales.filter((l) => l !== defaultLocale)}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    );
  return (
    <div className="agx-grid">
      <div className="agx-row" style={{ justifyContent: 'space-between' }}>
        <p className="agx-muted" style={{ margin: 0 }}>
          {t('What customers can book, with its hours.')}
        </p>
        <button
          type="button"
          className="agx-btn agx-primary"
          onClick={() =>
            setEditing(
              normalizeService({
                name: '',
                duration: 30,
                schedule: defaultSchedule(),
                color: COLORS[services.length % COLORS.length],
              }),
            )
          }
        >
          + {t('New service')}
        </button>
      </div>
      {services.length === 0 ? (
        <div className="agx-card">
          <p className="agx-muted" style={{ margin: 0 }}>
            {t('No services yet.')}
          </p>
        </div>
      ) : (
        <div className="agx-card" style={{ padding: 0 }}>
          <table className="agx-table">
            <thead>
              <tr>
                <th>{t('Service')}</th>
                <th>{t('Duration')}</th>
                <th>{t('Places')}</th>
                <th>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} data-click="" onClick={() => setEditing(s)}>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        background: s.color,
                        marginRight: 8,
                      }}
                    />
                    <button type="button" className="agx-link" onClick={() => setEditing(s)}>
                      {s.name}
                    </button>
                    {s.category ? <span className="agx-muted"> · {s.category}</span> : null}
                  </td>
                  <td>{t('{n} min', { n: s.duration })}</td>
                  <td>{s.capacity}</td>
                  <td>
                    <span className="agx-pill">
                      {s.status === 'active'
                        ? t('Bookable')
                        : s.status === 'hidden'
                          ? t('Hidden')
                          : t('Archived')}
                    </span>
                    {s.approval ? (
                      <span className="agx-pill" style={{ marginLeft: 4 }}>
                        {t('Needs approval')}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const minutesToHours = (m: number) => Math.round((m / 60) * 10) / 10;

function ServiceEditor({
  initial,
  timeZone,
  locales,
  onClose,
  onSaved,
}: {
  initial: Service;
  timeZone: string;
  locales: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [s, setS] = useState<Service>(initial);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Service>) => setS((x) => ({ ...x, ...patch }));
  const setField = (i: number, patch: Partial<CustomField>) =>
    set({ fields: s.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  async function save() {
    setBusy(true);
    setError('');
    try {
      if (s.id) await agenda.saveService(s);
      else await agenda.createService(s);
      onSaved();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !s.id ||
      !window.confirm(
        t('Remove this service? With appointments it is archived, and they are kept.'),
      )
    )
      return;
    try {
      await agenda.removeService(s.id);
      onSaved();
    } catch (e) {
      setError(messageOf(e));
    }
  }

  return (
    <div className="agx-grid">
      <div className="agx-row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="agx-link" onClick={onClose}>
          ← {t('Services')}
        </button>
        <div className="agx-row">
          {s.id ? (
            <button type="button" className="agx-btn agx-danger" onClick={() => void remove()}>
              {t('Remove')}
            </button>
          ) : null}
          <button
            type="button"
            className="agx-btn agx-primary"
            disabled={busy || !s.name.trim()}
            onClick={() => void save()}
          >
            {t('Save')}
          </button>
        </div>
      </div>
      {error ? (
        <p className="agx-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div className="agx-wizard">
        <div className="agx-grid">
          <div className="agx-card agx-grid">
            <div className="agx-cols">
              <Field label={t('Name')}>
                <input
                  type="text"
                  value={s.name}
                  onChange={(e) => set({ name: e.target.value })}
                  autoFocus={!s.id}
                />
              </Field>
              <Field label={t('Duration (minutes)')}>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={s.duration}
                  onChange={(e) => set({ duration: Number(e.target.value) })}
                />
              </Field>
              <Field label={t('Price (shown as written)')}>
                <input
                  type="text"
                  value={s.price}
                  onChange={(e) => set({ price: e.target.value })}
                  placeholder="€ 60"
                />
              </Field>
            </div>
            <Field label={t('Description')}>
              <textarea
                value={s.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <div className="agx-row">
              <span>{t('Status')}:</span>
              <div className="agx-chips">
                {(['active', 'hidden'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    className="agx-chip"
                    aria-pressed={s.status === st}
                    onClick={() => set({ status: st })}
                  >
                    {st === 'active' ? t('Bookable') : t('Hidden')}
                  </button>
                ))}
              </div>
              <span className="agx-help">
                {t('Hidden: not in the list, but a booking block can still show it.')}
              </span>
            </div>
          </div>
          <div className="agx-card">
            <h3>{t('Weekly hours')}</h3>
            <ScheduleEditor
              schedule={s.schedule}
              duration={s.duration}
              onChange={(schedule) => set({ schedule })}
            />
          </div>
          <div className="agx-card agx-grid">
            <button
              type="button"
              className="agx-link"
              aria-expanded={more}
              onClick={() => setMore(!more)}
              style={{ justifySelf: 'start' }}
            >
              {more ? '▾' : '▸'} {t('More options')}
            </button>
            {more ? (
              <>
                <div className="agx-cols">
                  <Field
                    label={t('Free time before (minutes)')}
                    help={t('Kept free before each appointment.')}
                  >
                    <input
                      type="number"
                      min={0}
                      value={s.bufferBefore}
                      onChange={(e) => set({ bufferBefore: Number(e.target.value) })}
                    />
                  </Field>
                  <Field
                    label={t('Free time after (minutes)')}
                    help={t('Kept free after each appointment.')}
                  >
                    <input
                      type="number"
                      min={0}
                      value={s.bufferAfter}
                      onChange={(e) => set({ bufferAfter: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={t('Book at least (hours before)')}>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={minutesToHours(s.minNotice)}
                      onChange={(e) => set({ minNotice: Math.round(Number(e.target.value) * 60) })}
                    />
                  </Field>
                  <Field label={t('Book at most (days ahead)')} help={t('0: no limit.')}>
                    <input
                      type="number"
                      min={0}
                      value={Math.round(s.maxNotice / 1440)}
                      onChange={(e) =>
                        set({ maxNotice: Math.round(Number(e.target.value)) * 1440 })
                      }
                    />
                  </Field>
                  <Field
                    label={t('Places per time')}
                    help={t('1: one customer at a time. More: a group (a class, a tour).')}
                  >
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={s.capacity}
                      onChange={(e) => set({ capacity: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={t('Category')}>
                    <input
                      type="text"
                      value={s.category}
                      onChange={(e) => set({ category: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="agx-row">
                  <span>{t('Colour')}:</span>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      aria-pressed={s.color === c}
                      onClick={() => set({ color: c })}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        background: c,
                        border: s.color === c ? '3px solid #0f172a' : '1px solid #cbd5e1',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
                <Check
                  label={t('I confirm each booking myself')}
                  help={t(
                    'Customers get "request received", then the confirmation when you confirm it. The time stays taken meanwhile.',
                  )}
                  checked={s.approval}
                  onChange={(approval) => set({ approval })}
                />
                <div className="agx-grid">
                  <h3>{t('Questions for the customer')}</h3>
                  <p className="agx-help">
                    {t(
                      'Name, email and phone are always asked (the phone as set in Settings). Add only what you really need.',
                    )}
                  </p>
                  {s.fields.map((f, i) => (
                    <div key={i} className="agx-row" style={{ alignItems: 'flex-end' }}>
                      <Field label={t('Question')}>
                        <input
                          type="text"
                          value={f.label}
                          onChange={(e) =>
                            setField(i, { label: e.target.value, name: f.name || e.target.value })
                          }
                        />
                      </Field>
                      <Field label={t('Answer')}>
                        <select
                          value={f.type}
                          onChange={(e) =>
                            setField(i, { type: e.target.value as CustomField['type'] })
                          }
                        >
                          <option value="text">{t('Short text')}</option>
                          <option value="textarea">{t('Long text')}</option>
                          <option value="select">{t('A choice')}</option>
                          <option value="checkbox">{t('Yes/no box')}</option>
                          <option value="number">{t('Number')}</option>
                          <option value="date">{t('Date')}</option>
                        </select>
                      </Field>
                      {f.type === 'select' ? (
                        <Field label={t('Choices (one per line)')}>
                          <textarea
                            value={f.options.join('\n')}
                            onChange={(e) => setField(i, { options: e.target.value.split('\n') })}
                            style={{ minHeight: '2.4rem' }}
                          />
                        </Field>
                      ) : null}
                      <Check
                        label={t('Required')}
                        checked={f.required}
                        onChange={(required) => setField(i, { required })}
                      />
                      <button
                        type="button"
                        className="agx-btn"
                        aria-label={t('Remove')}
                        onClick={() => set({ fields: s.fields.filter((_, j) => j !== i) })}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div>
                    <button
                      type="button"
                      className="agx-link"
                      onClick={() =>
                        set({
                          fields: [
                            ...s.fields,
                            {
                              name: `question-${s.fields.length + 1}`,
                              label: '',
                              type: 'text',
                              required: false,
                              options: [],
                            },
                          ],
                        })
                      }
                    >
                      + {t('Add a question')}
                    </button>
                  </div>
                </div>
                {locales.length ? (
                  <div className="agx-grid">
                    <h3>{t('Other languages')}</h3>
                    {locales.map((locale) => {
                      const tr = s.translations[locale] ?? {};
                      const setTr = (patch: Record<string, string>) =>
                        set({ translations: { ...s.translations, [locale]: { ...tr, ...patch } } });
                      return (
                        <div key={locale} className="agx-cols">
                          <Field label={`${t('Name')} (${locale})`}>
                            <input
                              type="text"
                              value={tr.name ?? ''}
                              placeholder={s.name}
                              onChange={(e) => setTr({ name: e.target.value })}
                            />
                          </Field>
                          <Field label={`${t('Description')} (${locale})`}>
                            <input
                              type="text"
                              value={tr.description ?? ''}
                              onChange={(e) => setTr({ description: e.target.value })}
                            />
                          </Field>
                          <Field label={`${t('Price')} (${locale})`}>
                            <input
                              type="text"
                              value={tr.price ?? ''}
                              placeholder={s.price}
                              onChange={(e) => setTr({ price: e.target.value })}
                            />
                          </Field>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        <Preview service={normalizeService(s)} timeZone={timeZone} />
      </div>
    </div>
  );
}
