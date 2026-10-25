/**
 * The booking form of a service: its fields in order, each required,
 * optional or hidden, with label and help in every language. Fields move by
 * dragging them or with the up/down buttons (keyboard); the service's own
 * questions can be added and removed, the standard ones only hidden.
 */
import { useT } from '@cleitext/admin-sdk';
import { useState } from 'react';
import { moveField } from '../model/form';
import { isFixedField, isStandardField } from '../model/normalize';
import type { Strings } from '../model/strings';
import type { CustomField, FieldState, FieldText } from '../model/types';
import { Field } from './ui';

function newQuestion(fields: CustomField[]): CustomField {
  let n = fields.length + 1;
  while (fields.some((f) => f.name === `question-${n}`)) n++;
  return {
    name: `question-${n}`,
    label: '',
    help: '',
    type: 'text',
    state: 'optional',
    required: false,
    options: [],
    translations: {},
  };
}

export function FormEditor({
  fields,
  onChange,
  locales,
  strings,
}: {
  fields: CustomField[];
  onChange: (fields: CustomField[]) => void;
  /** The site's other languages. */
  locales: string[];
  /** The visitors' texts in the site's language: the standard labels. */
  strings: Strings;
}) {
  const { t } = useT();
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const titleOf = (f: CustomField) =>
    f.label || (isStandardField(f.name) ? strings[f.name] : '') || t('New question');
  const update = (i: number, patch: Partial<CustomField>) =>
    onChange(
      fields.map((f, j) =>
        j === i
          ? { ...f, ...patch, ...(patch.state ? { required: patch.state === 'required' } : {}) }
          : f,
      ),
    );
  const move = (from: number, to: number, focus = false) => {
    if (to < 0 || to >= fields.length || from === to) return;
    const field = fields[from]!;
    onChange(moveField(fields, from, to));
    setAnnounce(
      t('{field} moved to position {n} of {total}.', {
        field: titleOf(field),
        n: to + 1,
        total: fields.length,
      }),
    );
    if (focus)
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLButtonElement>(
            `[data-agx-move="${field.name}-${to > from ? 'down' : 'up'}"]:not(:disabled)`,
          )
          ?.focus(),
      );
  };
  const states: [FieldState, string][] = [
    ['required', t('Required')],
    ['optional', t('Optional')],
    ['hidden', t('Hidden')],
  ];
  const types: [CustomField['type'], string][] = [
    ['text', t('Short text')],
    ['textarea', t('Long text')],
    ['select', t('A choice')],
    ['checkbox', t('Yes/no box')],
    ['number', t('Number')],
    ['date', t('Date')],
  ];

  return (
    <div className="agx-grid">
      <p className="agx-help">
        {t(
          'Choose for each field whether it is required, optional or hidden, and its order: drag it, or use the arrows. Name and email are always required, the booking needs them. Changes apply to new bookings; existing ones keep their answers.',
        )}
      </p>
      <p className="agx-sr" aria-live="polite">
        {announce}
      </p>
      <ol className="agx-form-list">
        {fields.map((f, i) => {
          const standard = isStandardField(f.name);
          const fixed = isFixedField(f.name);
          const title = titleOf(f);
          const setText = (locale: string, patch: FieldText) =>
            update(i, {
              translations: {
                ...f.translations,
                [locale]: { ...f.translations[locale], ...patch },
              },
            });
          return (
            <li
              key={f.name}
              className={`agx-form-row${f.state === 'hidden' ? ' is-hidden' : ''}${over === i && dragging !== null && dragging !== i ? ' is-over' : ''}`}
              draggable
              onDragStart={(e) => {
                // Dragging starts from the row, not from a text being selected in an input.
                if ((e.target as HTMLElement).closest('input, textarea, select')) {
                  e.preventDefault();
                  return;
                }
                setDragging(i);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', f.name);
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) move(dragging, i);
                setDragging(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              data-field={f.name}
            >
              <span className="agx-handle" aria-hidden="true" title={t('Drag to move')}>
                ⋮⋮
              </span>
              <div className="agx-grid" style={{ gap: '.6rem' }}>
                <div className="agx-row" style={{ justifyContent: 'space-between' }}>
                  <strong>{title}</strong>
                  <span className="agx-pill">
                    {standard ? t('Standard field') : types.find(([v]) => v === f.type)?.[1]}
                  </span>
                </div>
                {fixed ? (
                  <p className="agx-help">{t('Always required: the booking needs it.')}</p>
                ) : (
                  <div
                    className="agx-chips"
                    role="group"
                    aria-label={t('{field}: how it is asked', { field: title })}
                  >
                    {states.map(([state, label]) => (
                      <button
                        key={state}
                        type="button"
                        className="agx-chip"
                        aria-pressed={f.state === state}
                        onClick={() => update(i, { state })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="agx-cols">
                  <Field label={standard ? t('Label') : t('Question')}>
                    <input
                      type="text"
                      value={f.label}
                      placeholder={standard ? strings[f.name as keyof Strings] : ''}
                      onChange={(e) => update(i, { label: e.target.value })}
                    />
                  </Field>
                  <Field label={t('Help text (optional)')}>
                    <input
                      type="text"
                      value={f.help}
                      onChange={(e) => update(i, { help: e.target.value })}
                    />
                  </Field>
                  {standard ? null : (
                    <Field label={t('Answer')}>
                      <select
                        value={f.type}
                        onChange={(e) => update(i, { type: e.target.value as CustomField['type'] })}
                      >
                        {types.map(([v, label]) => (
                          <option key={v} value={v}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
                {f.type === 'select' && !standard ? (
                  <Field label={t('Choices (one per line)')}>
                    <textarea
                      value={f.options.join('\n')}
                      onChange={(e) => update(i, { options: e.target.value.split('\n') })}
                      style={{ minHeight: '4rem' }}
                    />
                  </Field>
                ) : null}
                {locales.length ? (
                  <details>
                    <summary className="agx-link" style={{ textDecoration: 'none' }}>
                      {t('Other languages')}
                    </summary>
                    <div className="agx-grid" style={{ marginTop: '.5rem' }}>
                      {locales.map((locale) => (
                        <div key={locale} className="agx-cols">
                          <Field label={`${standard ? t('Label') : t('Question')} (${locale})`}>
                            <input
                              type="text"
                              value={f.translations[locale]?.label ?? ''}
                              placeholder={
                                f.label || (standard ? t('The standard text of the language') : '')
                              }
                              onChange={(e) => setText(locale, { label: e.target.value })}
                            />
                          </Field>
                          <Field label={`${t('Help text (optional)')} (${locale})`}>
                            <input
                              type="text"
                              value={f.translations[locale]?.help ?? ''}
                              placeholder={f.help}
                              onChange={(e) => setText(locale, { help: e.target.value })}
                            />
                          </Field>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
              <div className="agx-form-tools">
                <button
                  type="button"
                  className="agx-btn"
                  data-agx-move={`${f.name}-up`}
                  aria-label={t('Move up: {field}', { field: title })}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1, true)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="agx-btn"
                  data-agx-move={`${f.name}-down`}
                  aria-label={t('Move down: {field}', { field: title })}
                  disabled={i === fields.length - 1}
                  onClick={() => move(i, i + 1, true)}
                >
                  ↓
                </button>
                {standard ? null : (
                  <button
                    type="button"
                    className="agx-btn agx-danger"
                    aria-label={t('Remove: {field}', { field: title })}
                    onClick={() => onChange(fields.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div>
        <button
          type="button"
          className="agx-btn"
          onClick={() => onChange([...fields, newQuestion(fields)])}
        >
          + {t('Add a question')}
        </button>
      </div>
    </div>
  );
}
