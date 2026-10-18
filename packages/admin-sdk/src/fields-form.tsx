import {
  fieldVisible,
  labelText,
  type FieldDefinition,
  type FieldValues,
  type ListField,
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
  defaults = {},
}: {
  fields: FieldDefinition[];
  values: FieldValues;
  onChange: (values: FieldValues) => void;
  locale?: string;
  disabled?: boolean;
  /** Messages by field name. */
  errors?: Record<string, string>;
  /** Values used when a field has none (for `showIf`). */
  defaults?: FieldValues;
}) {
  const shown = fields.filter((field) => fieldVisible(field, values, defaults));
  return (
    <div className="space-y-3">
      {shown.map((field, i) => {
        const heading =
          field.group !== undefined &&
          labelText(field.group, locale) !== labelText(shown[i - 1]?.group, locale);
        return (
          <div key={field.name} className={heading && i > 0 ? 'pt-3' : undefined}>
            {heading && (
              <h3 className="mb-2 border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {labelText(field.group, locale)}
              </h3>
            )}
            <Field
              field={field}
              value={values[field.name] ?? undefined}
              placeholder={defaults[field.name]}
              locale={locale}
              disabled={disabled}
              error={errors[field.name]}
              onChange={(value) => onChange({ ...values, [field.name]: value })}
            />
          </div>
        );
      })}
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
  placeholder,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  locale: string;
  disabled: boolean;
  error: string | undefined;
  /** The default, shown when there is no value. */
  placeholder?: unknown;
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
  const { t } = useT();
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
      control =
        field.display === 'range' ? (
          <div className="flex items-center gap-2">
            <input
              {...common}
              type="range"
              className="min-w-0 flex-1 accent-sky-700"
              value={
                typeof value === 'number'
                  ? value
                  : typeof placeholder === 'number'
                    ? placeholder
                    : (field.min ?? 0)
              }
              min={field.min ?? 0}
              max={field.max ?? 100}
              step={field.step ?? 1}
              onChange={(e) => onChange(Number(e.target.value))}
            />
            <input
              type="number"
              aria-label={label}
              disabled={disabled}
              className={`${inputClass} w-20`}
              value={typeof value === 'number' ? value : ''}
              placeholder={typeof placeholder === 'number' ? String(placeholder) : undefined}
              min={field.min}
              max={field.max}
              step={field.step ?? 'any'}
              onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            />
            {field.unit && <span className="text-xs text-slate-500">{field.unit}</span>}
          </div>
        ) : (
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
    case 'select': {
      // With a default, an unset field shows it (no empty choice); without, "—" means none.
      const fallback =
        typeof placeholder === 'string' && field.options.some((o) => o.value === placeholder)
          ? placeholder
          : '';
      control = (
        <select
          {...common}
          className={inputClass}
          value={text || fallback}
          onChange={(e) => onChange(empty(e.target.value))}
        >
          {!fallback && <option value="">—</option>}
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {labelText(option.label, locale)}
            </option>
          ))}
        </select>
      );
      break;
    }
    case 'media':
      control = (
        <MediaPicker id={id} value={text || null} disabled={disabled} onChange={onChange} />
      );
      break;
    case 'color': {
      const shown = text || (typeof placeholder === 'string' ? placeholder : '');
      const known = /^#[0-9a-f]{6}/i.test(shown);
      control = (
        <div className="flex items-center gap-2">
          <span className="relative inline-flex">
            <input
              type="color"
              aria-label={label}
              disabled={disabled}
              className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
              value={known ? shown.slice(0, 7) : '#000000'}
              onChange={(e) =>
                // The alpha of a typed #rrggbbaa stays when the swatch changes the color.
                onChange(e.target.value + (field.alpha && text.length === 9 ? text.slice(7) : ''))
              }
            />
            {/* No color yet: a crossed swatch, not a black one that looks like a choice. */}
            {!known && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0.5 rounded-sm border border-slate-200 bg-white"
                style={{
                  backgroundImage:
                    'linear-gradient(to top right, transparent calc(50% - 1px), #dc2626 calc(50% - 1px), #dc2626 calc(50% + 1px), transparent calc(50% + 1px))',
                }}
              />
            )}
          </span>
          <input
            {...common}
            className={`${inputClass} w-32 font-mono`}
            value={text}
            placeholder={typeof placeholder === 'string' ? placeholder : '#'}
            maxLength={field.alpha ? 9 : 7}
            onChange={(e) => onChange(empty(e.target.value.trim()))}
          />
          {text && (
            <button
              type="button"
              disabled={disabled}
              className="text-xs text-slate-600 hover:underline"
              onClick={() => onChange(null)}
            >
              {placeholder ? t('Default') : t('Clear')}
            </button>
          )}
        </div>
      );
      break;
    }
    case 'choice': {
      const current = text || (typeof placeholder === 'string' ? placeholder : '');
      const images = field.display === 'images';
      control = (
        <div
          role="radiogroup"
          aria-labelledby={`${id}-label`}
          className={images ? 'grid grid-cols-3 gap-2' : 'flex flex-wrap gap-1'}
        >
          {field.options.map((option) => {
            const on = option.value === current;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                onClick={() => onChange(option.value)}
                className={
                  images
                    ? `rounded border-2 p-1 text-xs ${on ? 'border-sky-600 bg-sky-50 text-sky-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`
                    : `rounded border px-2.5 py-1 text-sm ${on ? 'border-sky-700 bg-sky-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`
                }
              >
                {images && option.image && (
                  <img
                    src={option.image}
                    alt=""
                    className="mb-1 block aspect-[4/3] w-full object-contain"
                  />
                )}
                {labelText(option.label, locale)}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    case 'code':
      control = (
        <textarea
          {...common}
          rows={10}
          spellCheck={false}
          className={`${inputClass} font-mono text-xs`}
          value={text}
          placeholder={field.language === 'css' ? '.my-class { color: #333; }' : undefined}
          onChange={(e) => onChange(empty(e.target.value))}
        />
      );
      break;
    case 'list':
      control = (
        <ListControl
          field={field}
          value={
            Array.isArray(value)
              ? (value as FieldValues[])
              : Array.isArray(placeholder)
                ? (placeholder as FieldValues[])
                : []
          }
          locale={locale}
          disabled={disabled}
          onChange={onChange}
        />
      );
      break;
  }

  return (
    <div className="space-y-1">
      <label id={`${id}-label`} htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
        {field.required && <span aria-hidden="true"> *</span>}
      </label>
      {control}
      <Help id={id} help={help} error={error} />
    </div>
  );
}

/** Items of a list field: each with its own fields, added, removed and moved. */
function ListControl({
  field,
  value,
  locale,
  disabled,
  onChange,
}: {
  field: ListField;
  value: FieldValues[];
  locale: string;
  disabled: boolean;
  onChange: (value: FieldValues[]) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState<number | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
    if (open === from) setOpen(to);
  };
  const name = (item: FieldValues, i: number) => {
    const key = field.itemLabel ?? field.fields[0]?.name;
    const raw = key ? item[key] : undefined;
    const option =
      key &&
      field.fields.find((f) => f.name === key && (f.type === 'select' || f.type === 'choice'));
    if (option && 'options' in option) {
      const found = option.options.find((o) => o.value === raw);
      if (found) return labelText(found.label, locale);
    }
    return typeof raw === 'string' && raw ? raw : `${t('Item')} ${i + 1}`;
  };
  return (
    <div className="space-y-1">
      <ul className="space-y-1">
        {value.map((item, i) => (
          <li
            key={i}
            draggable={!disabled}
            onDragStart={() => setDragged(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragged !== null) move(dragged, i);
              setDragged(null);
            }}
            className="rounded border border-slate-200 bg-white"
          >
            <div className="flex items-center gap-1 px-2 py-1 text-sm">
              <span aria-hidden="true" className="cursor-grab text-slate-400">
                ⠿
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-medium text-slate-800"
                aria-expanded={open === i}
                onClick={() => setOpen(open === i ? null : i)}
              >
                {name(item, i)}
              </button>
              <button
                type="button"
                disabled={disabled || i === 0}
                aria-label={t('Move up')}
                className="px-1 text-slate-500 disabled:opacity-30"
                onClick={() => move(i, i - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={disabled || i === value.length - 1}
                aria-label={t('Move down')}
                className="px-1 text-slate-500 disabled:opacity-30"
                onClick={() => move(i, i + 1)}
              >
                ↓
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={t('Remove')}
                className="px-1 text-red-700"
                onClick={() => {
                  onChange(value.filter((_, j) => j !== i));
                  setOpen(null);
                }}
              >
                ×
              </button>
            </div>
            {open === i && (
              <div className="border-t border-slate-100 p-2">
                <FieldsForm
                  fields={field.fields}
                  values={item}
                  locale={locale}
                  disabled={disabled}
                  onChange={(next) => onChange(value.map((old, j) => (j === i ? next : old)))}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {(field.max === undefined || value.length < field.max) && (
        <button
          type="button"
          disabled={disabled}
          className="rounded border border-dashed border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
          onClick={() => {
            onChange([...value, {}]);
            setOpen(value.length);
          }}
        >
          + {t('Add')}
        </button>
      )}
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
