import {
  DEVICES,
  deviceValue,
  fieldVisible,
  labelText,
  paletteIndex,
  type BackgroundValue,
  type Device,
  type FieldDefinition,
  type FieldValues,
  type ListField,
  type ResponsiveValue,
  type SpacingValue,
  type TypographyValue,
  type ZonesValue,
} from '@cleitext/shared';
import { useId, useState, type ReactNode } from 'react';
import { DEVICE_ICONS, DeviceContext, useDevice } from './compound-fields.js';
import {
  BackgroundPanel,
  ChevronIcon,
  ColorPanel,
  CzMedia,
  CzRange,
  CzSelect,
  CzSpacing,
  CzToggle,
  CzTypography,
  CzUnit,
  DeviceCycle,
  DragIcon,
  JoinedButtons,
  Popover,
  ResetButton,
  Swatch,
  backgroundLook,
  czButton,
  czField,
  czFocus,
  czInput,
  rangeLimits,
  resolveColor,
  usePopover,
} from './customizer-controls.js';
import { useT } from './i18n.js';
import { ZonesBuilder } from './zones-builder.js';

/**
 * A field bound to the form: its value (the device's, for a responsive
 * field), default, unit and reset.
 */
interface Binding {
  field: FieldDefinition;
  value: unknown;
  placeholder: unknown;
  set: (value: unknown) => void;
  /** The value differs from the default: the reset arrow is shown. */
  changed: boolean;
  /** The field's whole value once reset (`null`: no value). */
  resetValue: unknown;
  responsive: boolean;
  units?: string[];
  unit?: string;
  setUnit?: (unit: string) => void;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isSet = (v: unknown) => v !== undefined && v !== null && v !== '';

function bind(
  field: FieldDefinition,
  values: FieldValues,
  defaults: FieldValues,
  device: Device,
  change: (value: unknown) => void,
): Binding {
  const raw = values[field.name] ?? undefined;
  const fallback = defaults[field.name];
  const devices = field.type === 'boolean' && field.display === 'devices';
  if (field.responsive && !devices) {
    const record = (raw && typeof raw === 'object' ? raw : {}) as ResponsiveValue<unknown>;
    const defaultRecord = (
      fallback && typeof fallback === 'object' ? fallback : {}
    ) as ResponsiveValue<unknown>;
    const larger =
      device === 'desktop'
        ? undefined
        : deviceValue(record, device === 'mobile' ? 'tablet' : 'desktop');
    const unitKey = `${device}Unit` as const;
    const patched = (patch: Record<string, unknown>) => {
      const next = Object.fromEntries(
        Object.entries({ ...record, ...patch }).filter(([, v]) => isSet(v)),
      );
      return Object.keys(next).length ? next : null;
    };
    const update = (patch: Record<string, unknown>) => change(patched(patch));
    const binding: Binding = {
      field: { ...field, responsive: false } as FieldDefinition,
      value: record[device] ?? undefined,
      placeholder: larger ?? deviceValue(defaultRecord, device),
      set: (v) => update({ [device]: v }),
      changed: isSet(record[device]) || isSet(record[unitKey]),
      resetValue: patched({ [device]: null, [unitKey]: null }),
      responsive: true,
    };
    if (field.type === 'number' && field.units?.length) {
      binding.units = field.units;
      binding.unit = record[unitKey] ?? defaultRecord[unitKey] ?? field.units[0];
      binding.setUnit = (unit) => update({ [unitKey]: unit });
    }
    return withSpacingUnit(binding);
  }
  const binding: Binding = {
    field,
    value: raw,
    placeholder: fallback,
    set: change,
    changed: isSet(raw) && !same(raw, fallback),
    resetValue: null,
    responsive: false,
  };
  if (field.type === 'number' && field.unit) binding.units = [field.unit];
  return withSpacingUnit(binding);
}

/** A spacing's unit lives in its value: `{ top, …, unit }`. */
function withSpacingUnit(binding: Binding): Binding {
  const { field } = binding;
  if (field.type !== 'spacing') return binding;
  const units = field.units ?? ['px', 'em', '%'];
  const value = binding.value as SpacingValue | undefined;
  const placeholder = binding.placeholder as SpacingValue | undefined;
  return {
    ...binding,
    units,
    unit: value?.unit ?? placeholder?.unit ?? units[0],
    setUnit: (unit) => binding.set({ ...(value ?? {}), unit }),
  };
}

/** Drawn as a round swatch in the label's line. */
const swatchType = (field: FieldDefinition) =>
  field.type === 'color' || field.type === 'background';
/** One short line: no rule between two of them. */
const compactType = (field: FieldDefinition) =>
  swatchType(field) || (field.type === 'boolean' && field.display !== 'devices');

/**
 * The customizer look of `FieldsForm`: the controls of the WordPress
 * customizer in a 300 px panel (labels with device, reset and unit, sliders,
 * switches, swatches with popovers…).
 */
export function CustomizerForm({
  fields,
  values,
  onChange,
  locale,
  disabled,
  errors,
  defaults,
  nested = false,
}: {
  fields: FieldDefinition[];
  values: FieldValues;
  onChange: (values: FieldValues) => void;
  locale: string;
  disabled: boolean;
  errors: Record<string, string>;
  defaults: FieldValues;
  /** Inside a list item: narrower padding. */
  nested?: boolean;
}) {
  const [device, setDevice] = useDevice();
  // Lines of fields: an inline field joins the one before it (when that one
  // is hidden, the first shown inline field takes the line).
  const lines: FieldDefinition[][] = [];
  for (const field of fields) {
    const last = lines[lines.length - 1];
    if (field.inline && last) last.push(field);
    else lines.push([field]);
  }
  const rows = lines.flatMap((line) => {
    const [main, ...inline] = line.filter((field) => fieldVisible(field, values, defaults));
    return main ? [{ main, inline }] : [];
  });
  const form = { ...defaults, ...values };
  const binding = (field: FieldDefinition) =>
    bind(field, values, defaults, device, (value) => onChange({ ...values, [field.name]: value }));
  const pad = nested ? 'px-3' : 'px-6';
  const groupOf = (i: number) => labelText(rows[i]?.main.group, locale);
  return (
    <DeviceContext.Provider value={{ device, setDevice }}>
      <div className="text-[13px] text-slate-800">
        {rows.map((row, i) => {
          const group = groupOf(i);
          const heading = group !== '' && group !== groupOf(i - 1);
          const tightBefore =
            i > 0 && !heading && compactType(row.main) && compactType(rows[i - 1]!.main);
          const next = rows[i + 1];
          const tightAfter =
            next !== undefined &&
            !(groupOf(i + 1) !== '' && groupOf(i + 1) !== group) &&
            compactType(row.main) &&
            compactType(next.main);
          const rule = i === 0 || tightBefore ? null : heading || !group ? 'full' : 'inset';
          return (
            <div key={row.main.name}>
              {rule === 'full' && <div aria-hidden="true" className="border-t border-[#dcdcde]" />}
              {rule === 'inset' && (
                <div
                  aria-hidden="true"
                  className={`${nested ? 'mx-3' : 'mx-6'} border-t border-[#dcdcde]`}
                />
              )}
              <div
                className={`relative ${pad} ${tightBefore ? 'pt-1' : nested ? 'pt-3' : 'pt-[18px]'} ${
                  tightAfter ? 'pb-1' : nested ? 'pb-3' : 'pb-[18px]'
                }`}
              >
                {heading && <h3 className="mb-3 text-[13px] font-bold text-slate-800">{group}</h3>}
                <CzRow
                  onReset={(list) =>
                    onChange({
                      ...values,
                      ...Object.fromEntries(list.map((b) => [b.field.name, b.resetValue])),
                    })
                  }
                  main={binding(row.main)}
                  inline={row.inline.map(binding)}
                  locale={locale}
                  disabled={disabled}
                  error={errors[row.main.name]}
                  form={form}
                />
              </div>
            </div>
          );
        })}
      </div>
    </DeviceContext.Provider>
  );
}

/** A field, and the fields drawn on its line. */
function CzRow({
  main,
  inline,
  locale,
  disabled,
  error,
  form,
  onReset,
}: {
  onReset: (bindings: Binding[]) => void;
  main: Binding;
  inline: Binding[];
  locale: string;
  disabled: boolean;
  error: string | undefined;
  form: FieldValues;
}) {
  const { t } = useT();
  const id = useId();
  const { open, setOpen, ref } = usePopover<string>();
  const { field } = main;
  const label = labelText(field.label, locale);
  const help = labelText(field.help, locale);
  const labelId = `${id}-label`;
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
  const text = typeof main.value === 'string' ? main.value : '';
  const empty = (next: string) => (next === '' ? null : next);
  const name = (b: Binding) => b.field.name;

  // Swatches (colors, backgrounds) open their popover under the line.
  const swatch = (b: Binding, tip: string) => {
    const f = b.field;
    const key = name(b);
    if (f.type === 'color') {
      const raw = typeof b.value === 'string' ? b.value : '';
      const shown = raw || (typeof b.placeholder === 'string' ? b.placeholder : '');
      return (
        <Swatch
          key={key}
          label={tip}
          color={resolveColor(shown, f.palette, form)}
          global={f.palette !== undefined && paletteIndex(shown, f.palette) !== null}
          open={open === key}
          disabled={disabled}
          onClick={() => setOpen(open === key ? null : key)}
        />
      );
    }
    if (f.type === 'background') {
      const look = backgroundLook(
        (b.value ?? b.placeholder) as BackgroundValue | undefined,
        f.palette,
        form,
      );
      return (
        <Swatch
          key={key}
          label={tip}
          {...look}
          open={open === key}
          disabled={disabled}
          onClick={() => setOpen(open === key ? null : key)}
        />
      );
    }
    return null;
  };
  const panel = (b: Binding) => {
    const f = b.field;
    if (f.type === 'color') {
      return (
        <ColorPanel
          value={typeof b.value === 'string' ? b.value : ''}
          placeholder={typeof b.placeholder === 'string' ? b.placeholder : undefined}
          alpha={f.alpha === true}
          palette={f.palette}
          form={form}
          disabled={disabled}
          onChange={(v) => b.set(v)}
        />
      );
    }
    if (f.type === 'background') {
      return (
        <BackgroundPanel
          value={b.value as BackgroundValue | undefined}
          placeholder={b.placeholder as BackgroundValue | undefined}
          palette={f.palette}
          form={form}
          disabled={disabled}
          onChange={(v) => b.set(v)}
        />
      );
    }
    return null;
  };

  // The other inline fields: just their control, the label as tooltip.
  const compact = (b: Binding) => {
    const f = b.field;
    const tip = labelText(f.label, locale);
    if (swatchType(f)) return swatch(b, tip);
    if (f.type === 'boolean') {
      return (
        <CzToggle
          key={f.name}
          label={tip}
          on={b.value === undefined || b.value === null ? b.placeholder === true : b.value === true}
          disabled={disabled}
          onChange={(on) => b.set(on)}
        />
      );
    }
    if (f.type === 'number') {
      return (
        <input
          key={f.name}
          type="number"
          aria-label={tip}
          title={tip}
          disabled={disabled}
          className={`${czField} w-16 px-2`}
          value={typeof b.value === 'number' ? b.value : ''}
          placeholder={typeof b.placeholder === 'number' ? String(b.placeholder) : undefined}
          onChange={(e) => b.set(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    }
    if (f.type === 'select' || f.type === 'choice') {
      const v = typeof b.value === 'string' ? b.value : '';
      const fallback = typeof b.placeholder === 'string' ? b.placeholder : '';
      return (
        <CzSelect
          key={f.name}
          label={tip}
          className="w-28"
          value={v || fallback}
          disabled={disabled}
          onChange={(next) => b.set(empty(next))}
        >
          {!fallback && <option value="">—</option>}
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {labelText(o.label, locale)}
            </option>
          ))}
        </CzSelect>
      );
    }
    return (
      <input
        key={f.name}
        aria-label={tip}
        title={tip}
        disabled={disabled}
        className={`${czField} w-28`}
        value={typeof b.value === 'string' ? b.value : ''}
        placeholder={typeof b.placeholder === 'string' ? b.placeholder : undefined}
        onChange={(e) => b.set(empty(e.target.value))}
      />
    );
  };

  const all = [main, ...inline];
  const changed = all.some((b) => b.changed);
  const resetAll = () => onReset(all.filter((b) => b.changed));
  const anyResponsive = all.some((b) => b.responsive);
  const swatches = all.filter((b) => swatchType(b.field));
  const openBinding = all.find((b) => name(b) === open);

  const labelRow = (control?: ReactNode, labelFor = true) => (
    <div className="flex min-h-[28px] items-center gap-1.5">
      {labelFor ? (
        <label id={labelId} htmlFor={id} className="text-[13px] leading-tight text-slate-800">
          {label}
          {field.required && <span aria-hidden="true"> *</span>}
        </label>
      ) : (
        <span id={labelId} className="text-[13px] leading-tight text-slate-800">
          {label}
          {field.required && <span aria-hidden="true"> *</span>}
        </span>
      )}
      {anyResponsive && <DeviceCycle />}
      <span className="ml-auto flex items-center gap-1">
        {changed && <ResetButton disabled={disabled} onClick={resetAll} />}
        {main.units && (
          <CzUnit
            units={main.units}
            value={main.unit}
            disabled={disabled}
            onChange={(u) => main.setUnit?.(u)}
          />
        )}
        {inline.filter((b) => !swatchType(b.field) || !swatchType(field)).map(compact)}
        {control}
      </span>
    </div>
  );

  let body: ReactNode = null;
  let head: ReactNode;
  switch (field.type) {
    case 'color':
    case 'background':
      // Label and swatches on one line; the popover opens under it.
      head = labelRow(
        <span className="flex items-center gap-2">
          {swatches.map((b) => swatch(b, b === main ? label : labelText(b.field.label, locale)))}
        </span>,
        false,
      );
      break;
    case 'boolean':
      if (field.display === 'devices' && main.responsive === false && field.responsive) {
        const record = (
          main.value && typeof main.value === 'object' ? main.value : {}
        ) as ResponsiveValue<boolean>;
        const names: Record<Device, string> = {
          desktop: t('Desktop'),
          tablet: t('Tablet'),
          mobile: t('Mobile'),
        };
        const on = (d: Device) =>
          deviceValue<boolean>(record, d) ??
          (typeof main.placeholder === 'boolean'
            ? main.placeholder
            : deviceValue<boolean>(main.placeholder, d)) ??
          false;
        head = labelRow(undefined, false);
        body = (
          <div className="mt-2">
            <JoinedButtons
              role="group"
              labelledBy={labelId}
              disabled={disabled}
              options={DEVICES.map((d) => ({
                value: d,
                label: names[d],
                content: DEVICE_ICONS[d],
              }))}
              isOn={on}
              onClick={(d) => {
                const next = { ...record, [d]: !on(d) };
                main.set(next);
              }}
            />
          </div>
        );
      } else {
        head = labelRow(
          <CzToggle
            id={id}
            labelledBy={labelId}
            on={
              main.value === undefined || main.value === null
                ? main.placeholder === true
                : main.value === true
            }
            disabled={disabled}
            onChange={(on) => main.set(on)}
          />,
        );
      }
      break;
    case 'number': {
      head = labelRow();
      const value = typeof main.value === 'number' ? main.value : undefined;
      const placeholder = typeof main.placeholder === 'number' ? main.placeholder : undefined;
      body =
        field.display === 'range' || main.responsive ? (
          <div className="mt-2">
            <CzRange
              id={id}
              label={label}
              value={value}
              placeholder={placeholder}
              {...rangeLimits(main.unit, main.units?.[0], field)}
              disabled={disabled}
              describedBy={describedBy}
              onChange={(n) => main.set(n)}
            />
          </div>
        ) : (
          <input
            id={id}
            type="number"
            disabled={disabled}
            aria-describedby={describedBy}
            className={`${czInput} mt-2`}
            value={value ?? ''}
            placeholder={placeholder === undefined ? undefined : String(placeholder)}
            min={field.min}
            max={field.max}
            step={field.step ?? 'any'}
            onChange={(e) => main.set(e.target.value === '' ? null : Number(e.target.value))}
          />
        );
      break;
    }
    case 'text':
    case 'url':
    case 'date':
    case 'datetime':
    case 'code': {
      head = labelRow();
      const placeholder = typeof main.placeholder === 'string' ? main.placeholder : undefined;
      const common = {
        id,
        disabled,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': field.required ? true : undefined,
      } as const;
      if (field.type === 'code' || (field.type === 'text' && field.multiline)) {
        body = (
          <textarea
            {...common}
            rows={field.type === 'code' ? 8 : 4}
            spellCheck={field.type === 'code' ? false : undefined}
            className={`${czInput} mt-2 h-auto py-2 ${field.type === 'code' ? 'font-mono text-[12px]' : ''}`}
            value={text}
            placeholder={placeholder}
            maxLength={field.type === 'text' ? field.maxLength : undefined}
            onChange={(e) => main.set(empty(e.target.value))}
          />
        );
      } else if (field.type === 'datetime') {
        body = (
          <input
            {...common}
            type="datetime-local"
            className={`${czInput} mt-2`}
            value={text ? toLocalInput(text) : ''}
            onChange={(e) =>
              main.set(e.target.value ? new Date(e.target.value).toISOString() : null)
            }
          />
        );
      } else {
        body = (
          <input
            {...common}
            type={field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : 'text'}
            className={`${czInput} mt-2`}
            value={text}
            placeholder={field.type === 'url' ? placeholder || 'https://' : placeholder}
            maxLength={field.type === 'text' ? field.maxLength : undefined}
            onChange={(e) => main.set(empty(e.target.value))}
          />
        );
      }
      break;
    }
    case 'select': {
      head = labelRow();
      const fallback =
        typeof main.placeholder === 'string' &&
        field.options.some((o) => o.value === main.placeholder)
          ? main.placeholder
          : '';
      body = (
        <div className="mt-2">
          <CzSelect
            id={id}
            value={text || fallback}
            disabled={disabled}
            describedBy={describedBy}
            onChange={(v) => main.set(empty(v))}
          >
            {!fallback && <option value="">—</option>}
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {labelText(option.label, locale)}
              </option>
            ))}
          </CzSelect>
        </div>
      );
      break;
    }
    case 'choice': {
      head = labelRow(undefined, false);
      const current = text || (typeof main.placeholder === 'string' ? main.placeholder : '');
      if (field.display === 'images') {
        body = (
          <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="mt-2 grid grid-cols-2 gap-x-6 gap-y-4"
          >
            {field.options.map((option) => {
              const on = option.value === current;
              const name = labelText(option.label, locale);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={name}
                  title={name}
                  disabled={disabled}
                  onClick={() => main.set(option.value)}
                  className={`flex items-center justify-center overflow-hidden rounded-[2px] border-2 bg-white p-1 ${
                    on ? 'border-[#2271b1] bg-[#2271b1]' : 'border-[#dcdcde] hover:border-[#a7aaad]'
                  } ${czFocus}`}
                >
                  {option.image ? (
                    <img
                      src={option.image}
                      alt=""
                      className="block aspect-[4/3] w-full bg-white object-contain"
                    />
                  ) : (
                    <span className={`py-3 text-[12px] ${on ? 'text-white' : 'text-slate-700'}`}>
                      {name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      } else {
        body = (
          <div className="mt-2">
            <JoinedButtons
              labelledBy={labelId}
              disabled={disabled}
              options={field.options.map((o) => ({
                value: o.value,
                label: labelText(o.label, locale),
              }))}
              isOn={(v) => v === current}
              onClick={(v) => main.set(v)}
            />
          </div>
        );
      }
      break;
    }
    case 'media':
      head = labelRow();
      body = (
        <div className="mt-2">
          <CzMedia
            id={id}
            value={text || null}
            disabled={disabled}
            describedBy={describedBy}
            onChange={(v) => main.set(v)}
          />
        </div>
      );
      break;
    case 'spacing':
      head = labelRow();
      body = (
        <div className="mt-2">
          <CzSpacing
            id={id}
            label={label}
            value={main.value as SpacingValue | undefined}
            placeholder={main.placeholder as SpacingValue | undefined}
            sides={field.sides}
            corners={field.corners}
            disabled={disabled}
            onChange={(v) => main.set(v)}
          />
        </div>
      );
      break;
    case 'typography':
      head = labelRow();
      body = (
        <div className="mt-2">
          <CzTypography
            id={id}
            label={label}
            value={main.value as TypographyValue | undefined}
            placeholder={main.placeholder as TypographyValue | undefined}
            units={field.units}
            disabled={disabled}
            onChange={(v) => main.set(v)}
          />
        </div>
      );
      break;
    case 'list':
      head = labelRow(undefined, false);
      body = (
        <div className="mt-2">
          <CzList
            field={field}
            labelledBy={labelId}
            value={
              Array.isArray(main.value)
                ? (main.value as FieldValues[])
                : Array.isArray(main.placeholder)
                  ? (main.placeholder as FieldValues[])
                  : []
            }
            locale={locale}
            disabled={disabled}
            onChange={(v) => main.set(v)}
          />
        </div>
      );
      break;
    case 'zones':
      head = labelRow(undefined, false);
      body = (
        <div className="mt-2">
          <ZonesBuilder
            field={field}
            value={(main.value ?? main.placeholder ?? {}) as ZonesValue}
            values={form}
            locale={locale}
            disabled={disabled}
            onChange={(v) => main.set(v)}
          />
        </div>
      );
      break;
  }

  return (
    <div>
      <div ref={ref} className="relative">
        {head}
        {openBinding && (
          <Popover label={labelText(openBinding.field.label, locale)}>{panel(openBinding)}</Popover>
        )}
      </div>
      {body}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[12px] text-[#b32d2e]">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="mt-1.5 text-[12px] leading-snug text-slate-500">
          {help}
        </p>
      ) : null}
    </div>
  );
}

/** Items of a list: bordered rows with a handle, a title and a chevron opening their fields. */
function CzList({
  field,
  value,
  locale,
  disabled,
  onChange,
  labelledBy,
}: {
  field: ListField;
  value: FieldValues[];
  locale: string;
  disabled: boolean;
  onChange: (value: FieldValues[]) => void;
  labelledBy: string;
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
  const small = `rounded-sm px-1.5 py-1 text-[12px] text-[#2271b1] hover:underline disabled:opacity-40 disabled:no-underline ${czFocus}`;
  return (
    <div className="space-y-2.5">
      <ul aria-labelledby={labelledBy} className="space-y-2.5">
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
            className={`rounded-[3px] border bg-white ${open === i ? 'border-[#2271b1]' : 'border-[#dcdcde]'}`}
          >
            <div className="flex h-9 items-center gap-1.5 pl-1.5 pr-1">
              <span aria-hidden="true" className="cursor-grab text-slate-400">
                <DragIcon />
              </span>
              <button
                type="button"
                className={`min-w-0 flex-1 truncate rounded-sm text-left text-[13px] text-slate-800 ${czFocus}`}
                aria-expanded={open === i}
                onClick={() => setOpen(open === i ? null : i)}
              >
                {name(item, i)}
              </button>
              <button
                type="button"
                aria-label={t('Edit {name}', { name: name(item, i) })}
                aria-expanded={open === i}
                className={`rounded-sm p-0.5 text-slate-500 hover:text-[#2271b1] ${czFocus}`}
                onClick={() => setOpen(open === i ? null : i)}
              >
                <ChevronIcon className={`h-[18px] w-[18px] ${open === i ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={t('Remove {name}', { name: name(item, i) })}
                title={t('Remove')}
                className={`rounded-sm px-1 text-[16px] leading-none text-slate-500 hover:text-[#b32d2e] ${czFocus}`}
                onClick={() => {
                  onChange(value.filter((_, j) => j !== i));
                  setOpen(null);
                }}
              >
                ×
              </button>
            </div>
            {open === i && (
              <div className="border-t border-[#dcdcde]">
                <CustomizerForm
                  nested
                  fields={field.fields}
                  values={item}
                  defaults={{}}
                  errors={{}}
                  locale={locale}
                  disabled={disabled}
                  onChange={(next) => onChange(value.map((old, j) => (j === i ? next : old)))}
                />
                <div className="flex justify-end gap-1 border-t border-[#f0f0f1] px-2 py-1">
                  <button
                    type="button"
                    disabled={disabled || i === 0}
                    className={small}
                    onClick={() => move(i, i - 1)}
                  >
                    {t('Move up')}
                  </button>
                  <button
                    type="button"
                    disabled={disabled || i === value.length - 1}
                    className={small}
                    onClick={() => move(i, i + 1)}
                  >
                    {t('Move down')}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {(field.max === undefined || value.length < field.max) && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={disabled}
            className={`${czButton} gap-1 bg-white`}
            onClick={() => {
              onChange([...value, {}]);
              setOpen(value.length);
            }}
          >
            <span aria-hidden="true" className="text-[16px] leading-none">
              +
            </span>
            {t('Add')}
          </button>
        </div>
      )}
    </div>
  );
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
