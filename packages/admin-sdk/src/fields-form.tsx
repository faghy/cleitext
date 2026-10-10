import {
  labelText,
  type FieldDefinition,
  type FieldValues,
  type MediaListResponse,
} from '@cleitext/shared';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { api } from './api.js';
import { useT } from './i18n.js';

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600';

/**
 * Form generated from field definitions (docs/SPECIFICATIONS.md §10): used
 * for custom fields, plugin settings and plugin block attributes.
 */
export function FieldsForm({
  fields,
  values,
  onChange,
  locale = 'en',
  disabled = false,
  errors = {},
}: {
  fields: FieldDefinition[];
  values: FieldValues;
  onChange: (values: FieldValues) => void;
  locale?: string;
  disabled?: boolean;
  /** Messages by field name. */
  errors?: Record<string, string>;
}) {
  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <Field
          key={field.name}
          field={field}
          value={values[field.name]}
          locale={locale}
          disabled={disabled}
          error={errors[field.name]}
          onChange={(value) => onChange({ ...values, [field.name]: value })}
        />
      ))}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
  locale,
  disabled,
  error,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  locale: string;
  disabled: boolean;
  error: string | undefined;
}) {
  const id = useId();
  const label = labelText(field.label, locale);
  const help = labelText(field.help, locale);
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
  const common = {
    id,
    disabled,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': field.required ? true : undefined,
  } as const;
  const text = typeof value === 'string' ? value : '';
  const empty = (next: string) => (next === '' ? null : next);

  let control: React.ReactNode;
  switch (field.type) {
    case 'text':
      control = field.multiline ? (
        <textarea
          {...common}
          rows={4}
          className={inputClass}
          value={text}
          maxLength={field.maxLength}
          onChange={(e) => onChange(empty(e.target.value))}
        />
      ) : (
        <input
          {...common}
          className={inputClass}
          value={text}
          maxLength={field.maxLength}
          onChange={(e) => onChange(empty(e.target.value))}
        />
      );
      break;
    case 'url':
      control = (
        <input
          {...common}
          type="url"
          className={inputClass}
          value={text}
          placeholder="https://"
          onChange={(e) => onChange(empty(e.target.value))}
        />
      );
      break;
    case 'number':
      control = (
        <input
          {...common}
          type="number"
          className={inputClass}
          value={typeof value === 'number' ? value : ''}
          min={field.min}
          max={field.max}
          step={field.step ?? 'any'}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
      break;
    case 'boolean':
      return (
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm" htmlFor={id}>
            <input
              {...common}
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span className="font-medium text-slate-800">{label}</span>
          </label>
          <Help id={id} help={help} error={error} />
        </div>
      );
    case 'date':
      control = (
        <input
          {...common}
          type="date"
          className={inputClass}
          value={text}
          onChange={(e) => onChange(empty(e.target.value))}
        />
      );
      break;
    case 'datetime':
      control = (
        <input
          {...common}
          type="datetime-local"
          className={inputClass}
          value={text ? toLocalInput(text) : ''}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        />
      );
      break;
    case 'select':
      control = (
        <select
          {...common}
          className={inputClass}
          value={text}
          onChange={(e) => onChange(empty(e.target.value))}
        >
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {labelText(option.label, locale)}
            </option>
          ))}
        </select>
      );
      break;
    case 'media':
      control = (
        <MediaPicker id={id} value={text || null} disabled={disabled} onChange={onChange} />
      );
      break;
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
        {field.required && <span aria-hidden="true"> *</span>}
      </label>
      {control}
      <Help id={id} help={help} error={error} />
    </div>
  );
}

function Help({ id, help, error }: { id: string; help: string; error: string | undefined }) {
  if (error) {
    return (
      <p id={`${id}-error`} className="text-xs text-red-700">
        {error}
      </p>
    );
  }
  return help ? (
    <p id={`${id}-help`} className="text-xs text-slate-500">
      {help}
    </p>
  ) : null;
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Chooses an image of the media library. */
function MediaPicker({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const images = useQuery({
    queryKey: ['media', 'picker'],
    queryFn: () => api<MediaListResponse>('GET', '/media?kind=image&limit=60'),
    enabled: open || value !== null,
  });
  const selected = images.data?.items.find((m) => m.id === value);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {selected && (
          <img src={selected.url} alt="" className="h-12 w-12 rounded border object-cover" />
        )}
        <button
          id={id}
          type="button"
          disabled={disabled}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {value ? t('Change image') : t('Choose image')}
        </button>
        {value && (
          <button
            type="button"
            disabled={disabled}
            className="text-sm text-red-700 hover:underline"
            onClick={() => onChange(null)}
          >
            {t('Remove')}
          </button>
        )}
      </div>
      {open && (
        <ul className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto rounded border border-slate-200 p-2">
          {images.data?.items.map((media) => (
            <li key={media.id}>
              <button
                type="button"
                className={`block w-full rounded border-2 ${media.id === value ? 'border-sky-600' : 'border-transparent'}`}
                aria-label={media.filename}
                onClick={() => {
                  onChange(media.id);
                  setOpen(false);
                }}
              >
                <img src={media.url} alt="" className="aspect-square w-full object-cover" />
              </button>
            </li>
          ))}
          {images.data?.items.length === 0 && (
            <li className="col-span-4 text-sm text-slate-500">
              {t('The media library is empty.')}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
