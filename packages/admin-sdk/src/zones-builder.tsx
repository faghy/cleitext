import {
  labelText,
  zoneItems,
  type FieldValues,
  type ZoneDevice,
  type ZoneItem,
  type ZoneRow,
  type ZonesField,
  type ZonesValue,
} from '@cleitext/shared';
import { useState } from 'react';
import { useT } from './i18n.js';

/** Where a dragged element comes from (null: the list of elements). */
interface Drag {
  name: string;
  from: { row: string; zone: string } | null;
}

/**
 * The builder of a zones field (docs/THEMES.md §4): a tab per device, the
 * rows with their zones, and the elements, dragged into the zones, between
 * them and back. A click on an element or on a row's gear opens its
 * settings (`onOpen` with the section).
 */
export function ZonesBuilder({
  field,
  value,
  onChange,
  locale = 'en',
  disabled = false,
  values = {},
  device: controlled,
  onDevice,
  onOpen,
  active,
}: {
  field: ZonesField;
  /** The field's value (or its default). */
  value: ZonesValue;
  onChange: (value: ZonesValue) => void;
  locale?: string;
  disabled?: boolean;
  /** The values of the whole form (the number of columns of a row). */
  values?: FieldValues;
  device?: ZoneDevice;
  onDevice?: (device: ZoneDevice) => void;
  onOpen?: (section: string) => void;
  /** The section open now, highlighted. */
  active?: string;
}) {
  const { t } = useT();
  const [own, setOwn] = useState<ZoneDevice>(field.devices[0] ?? 'desktop');
  const device = controlled && field.devices.includes(controlled) ? controlled : own;
  const setDevice = (next: ZoneDevice) => {
    setOwn(next);
    onDevice?.(next);
  };
  const [drag, setDrag] = useState<Drag | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const rows = field.rows.filter((row) => !row.devices || row.devices.includes(device));
  const items = field.items.filter((item) => !item.devices || item.devices.includes(device));
  const placed = new Set(
    rows.flatMap((row) => row.zones.flatMap((z) => zoneItems(value, device, row.name, z.name))),
  );
  const fits = (item: ZoneItem, row: string) => !item.rows || item.rows.includes(row);
  const itemOf = (name: string) => field.items.find((i) => i.name === name);

  /** Moves an element into a zone, at a position (default: the end). */
  const place = (name: string, row: string, zone: string, index?: number) => {
    const layout: Record<string, Record<string, string[]>> = {};
    for (const [r, zones] of Object.entries(value[device] ?? {})) {
      layout[r] = {};
      for (const [z, list] of Object.entries(zones)) {
        layout[r]![z] = list.filter((n) => n !== name);
      }
    }
    const target = [...(layout[row]?.[zone] ?? [])];
    target.splice(index ?? target.length, 0, name);
    layout[row] = { ...layout[row], [zone]: target };
    onChange({ ...value, [device]: layout });
  };
  const remove = (name: string, row: string, zone: string) => {
    const zones = value[device]?.[row] ?? {};
    onChange({
      ...value,
      [device]: {
        ...value[device],
        [row]: { ...zones, [zone]: (zones[zone] ?? []).filter((n) => n !== name) },
      },
    });
  };
  const drop = (row: string, zone: string, index?: number) => {
    if (!drag) return;
    const item = itemOf(drag.name);
    if (item && fits(item, row)) place(drag.name, row, zone, index);
    setDrag(null);
  };

  /** The zones of a row shown now: the used columns, the side zones when used. */
  const zonesOf = (row: ZoneRow) => {
    const columns = row.columnsField ? Number(values[row.columnsField]) : NaN;
    const zones = Number.isFinite(columns) && columns > 0 ? row.zones.slice(0, columns) : row.zones;
    const used = (zone: string) => zoneItems(value, device, row.name, zone).length > 0;
    return zones.filter((z) => !z.whenUsed || used(z.whenUsed) || used(z.name));
  };

  const chip = (name: string, row: string, zone: string, index: number) => {
    const item = itemOf(name);
    const section = item?.section;
    return (
      <li
        key={name}
        draggable={!disabled}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', name);
          setDrag({ name, from: { row, zone } });
        }}
        onDragEnd={() => setDrag(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          drop(row, zone, index);
        }}
        className={`flex items-center rounded border bg-white text-xs shadow-sm ${
          section && section === active ? 'border-sky-600 ring-1 ring-sky-600' : 'border-slate-300'
        }`}
      >
        <span aria-hidden="true" className="cursor-grab pl-1.5 text-slate-400">
          ⠿
        </span>
        <button
          type="button"
          className="px-1.5 py-1 font-medium text-slate-800 hover:text-sky-700"
          onClick={() => section && onOpen?.(section)}
        >
          {item ? labelText(item.label, locale) : name}
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('Remove {name}', { name: item ? labelText(item.label, locale) : name })}
          className="px-1.5 py-1 text-slate-500 hover:text-red-700"
          onClick={() => remove(name, row, zone)}
        >
          ×
        </button>
      </li>
    );
  };

  const deviceLabel = (d: ZoneDevice) => (d === 'desktop' ? t('Desktop') : t('Tablet / Mobile'));

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {field.devices.length > 1 && (
          <div role="tablist" aria-label={t('Device')} className="flex rounded border">
            {field.devices.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={d === device}
                className={`px-3 py-1 text-xs ${d === device ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                onClick={() => setDevice(d)}
              >
                {deviceLabel(d)}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={disabled || field.default === undefined}
          className="ml-auto text-xs text-slate-600 hover:underline disabled:opacity-40"
          onClick={() => {
            const fallback = field.default?.[device];
            const next = { ...value };
            if (fallback) next[device] = fallback;
            else delete next[device];
            onChange(next);
          }}
        >
          {t('Reset {device} layout', { device: deviceLabel(device) })}
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.name}
            className={`flex items-stretch gap-2 rounded border bg-slate-50 p-1.5 ${
              row.section && row.section === active ? 'border-sky-600' : 'border-slate-200'
            }`}
          >
            <button
              type="button"
              disabled={!row.section || !onOpen}
              title={t('Settings of {row}', { row: labelText(row.label, locale) })}
              className="flex w-28 shrink-0 items-center gap-1 rounded px-1.5 text-left text-xs font-medium text-slate-600 hover:bg-white disabled:cursor-default"
              onClick={() => row.section && onOpen?.(row.section)}
            >
              {row.section && <span aria-hidden="true">⚙</span>}
              {labelText(row.label, locale)}
            </button>
            <div className={`flex min-w-0 flex-1 gap-1.5 ${row.stacked ? 'flex-col' : ''}`}>
              {zonesOf(row).map((zone) => {
                const list = zoneItems(value, device, row.name, zone.name);
                const key = `${row.name}.${zone.name}`;
                const choices = items.filter((i) => !placed.has(i.name) && fits(i, row.name));
                return (
                  <div
                    key={zone.name}
                    aria-label={`${labelText(row.label, locale)} · ${labelText(zone.label, locale) || zone.name}`}
                    onDragOver={(e) => {
                      const item = drag && itemOf(drag.name);
                      if (item && fits(item, row.name)) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      drop(row.name, zone.name);
                    }}
                    className={`relative flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-1 rounded border border-dashed p-1 ${
                      drag ? 'border-sky-400 bg-sky-50' : 'border-slate-300 bg-white'
                    }`}
                  >
                    <ul className="contents">
                      {list.map((name, index) => chip(name, row.name, zone.name, index))}
                    </ul>
                    <button
                      type="button"
                      disabled={disabled || choices.length === 0}
                      aria-label={t('Add an element')}
                      aria-expanded={adding === key}
                      className="ml-auto rounded px-1.5 text-base leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:invisible"
                      onClick={() => setAdding(adding === key ? null : key)}
                    >
                      +
                    </button>
                    {adding === key && (
                      <ul className="absolute right-0 top-full z-10 mt-1 grid w-56 grid-cols-2 gap-1 rounded border border-slate-200 bg-white p-1.5 shadow-lg">
                        {choices.map((item) => (
                          <li key={item.name}>
                            <button
                              type="button"
                              className="w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-100"
                              onClick={() => {
                                place(item.name, row.name, zone.name);
                                setAdding(null);
                              }}
                            >
                              {labelText(item.label, locale)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div
        onDragOver={(e) => {
          if (drag?.from) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (drag?.from) remove(drag.name, drag.from.row, drag.from.zone);
          setDrag(null);
        }}
      >
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('Elements')}
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => {
            const used = placed.has(item.name);
            return (
              <li
                key={item.name}
                draggable={!disabled && !used}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', item.name);
                  setDrag({ name: item.name, from: null });
                }}
                onDragEnd={() => setDrag(null)}
                className={`rounded border text-xs ${
                  used
                    ? 'border-slate-200 bg-slate-100 text-slate-500'
                    : 'cursor-grab border-slate-300 bg-white text-slate-800'
                }`}
              >
                <button
                  type="button"
                  className="px-2 py-1"
                  onClick={() => item.section && onOpen?.(item.section)}
                >
                  {used && <span aria-hidden="true">✓ </span>}
                  {labelText(item.label, locale)}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
