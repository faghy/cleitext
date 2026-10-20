import {
  labelText,
  zoneItems,
  type FieldValues,
  type ZoneDefinition,
  type ZoneDevice,
  type ZoneItem,
  type ZoneRow,
  type ZonesField,
  type ZonesValue,
} from '@cleitext/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from './i18n.js';

/** Where a dragged element comes from (null: the list of elements). */
interface Drag {
  name: string;
  from: { row: string; zone: string } | null;
}

/** Icons of the usual elements, by `ZoneItem.icon` (or a guess from the element's name). */
const ICON_PATHS: Record<string, string[]> = {
  logo: ['M4 5h16v14H4z', 'M4 15l4-4 4 4 3-3 5 5', 'M15 9h.01'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  toggle: ['M5 8h14', 'M5 12h14', 'M5 16h14'],
  button: ['M4 9h16v6H4z'],
  html: ['M9 8l-4 4 4 4', 'M15 8l4 4-4 4'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4-4'],
  social: [
    'M18 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    'M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    'M18 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    'M8 11l8-4',
    'M8 13l8 4',
  ],
  account: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 20c1-4 4-6 8-6s7 2 8 6'],
  widget: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  cart: [
    'M3 4h3l2 11h10l2-8H7',
    'M10 19a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
    'M17 19a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  ],
  copyright: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M15 9.5a3.5 3.5 0 1 0 0 5'],
  divider: ['M12 4v16'],
  language: [
    'M4 5h10',
    'M9 3v2',
    'M5 5c1 5 4 8 8 9',
    'M13 5c-1 5-4 8-8 9',
    'M13 20l4-9 4 9',
    'M14.5 17h5',
  ],
};

function ItemIcon({ name }: { name: string }) {
  const paths = ICON_PATHS[name];
  if (!paths)
    return <span className="text-base font-semibold">{name.slice(0, 1).toUpperCase()}</span>;
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const iconOf = (item: ZoneItem): string => {
  if (item.icon) return item.icon;
  const n = item.name.toLowerCase();
  if (n.includes('trigger') || n.includes('toggle')) return 'toggle';
  if (n.includes('identity') || n === 'logo') return 'logo';
  return Object.keys(ICON_PATHS).find((k) => n.includes(k)) ?? item.name;
};

const Gear = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
    <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
  </svg>
);

/**
 * The builder of a zones field (docs/THEMES.md §4): rows with a gear (their
 * settings) and zones where elements are dropped, added with the "+" of a
 * zone or dragged between zones; a click on an element opens its settings
 * (`onOpen` with the section). Rows `stacked` (an off-canvas panel) are a
 * column on the left.
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
  /** The device shown; without it, the builder has its own switch. */
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
    return zones.filter(
      (z) =>
        (!z.devices || z.devices.includes(device)) &&
        (!z.whenUsed || used(z.whenUsed) || used(z.name)),
    );
  };

  const chip = (name: string, row: string, zone: string, index: number) => {
    const item = itemOf(name);
    const section = item?.section;
    const label = item ? labelText(item.label, locale) : name;
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
        className={`flex h-[34px] cursor-grab items-center border bg-white text-xs text-slate-700 shadow-[0_1px_1px_rgba(0,0,0,0.04)] ${
          section && section === active
            ? 'border-[#2271b1]'
            : 'border-[#dddddd] hover:border-slate-400'
        }`}
      >
        <button
          type="button"
          className="h-full pl-3.5 pr-2 hover:text-[#2271b1]"
          onClick={() => section && onOpen?.(section)}
        >
          {label}
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('Remove {name}', { name: label })}
          title={t('Remove {name}', { name: label })}
          className="h-full px-2.5 text-base leading-none text-slate-600 hover:text-red-700"
          onClick={() => remove(name, row, zone)}
        >
          ×
        </button>
      </li>
    );
  };

  const zoneBox = (row: ZoneRow, zone: ZoneDefinition, grow: string, stacked = false) => {
    const list = zoneItems(value, device, row.name, zone.name);
    const key = `${row.name}.${zone.name}`;
    const choices = items.filter((i) => !placed.has(i.name) && fits(i, row.name));
    const zoneLabel = `${labelText(row.label, locale)} · ${labelText(zone.label, locale) || zone.name}`;
    const align =
      zone.name === 'right' || zone.name === 'right_center'
        ? 'justify-end'
        : zone.name === 'center'
          ? 'justify-center'
          : '';
    return (
      <div
        key={zone.name}
        aria-label={zoneLabel}
        onDragOver={(e) => {
          const item = drag && itemOf(drag.name);
          if (item && fits(item, row.name)) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          drop(row.name, zone.name);
        }}
        className={`group relative flex min-h-[52px] min-w-0 gap-2 p-2 ${grow} ${
          stacked ? 'flex-col items-stretch' : `items-center ${align}`
        } ${drag ? 'bg-[#f0f6fc]' : ''}`}
      >
        <ul className={`flex flex-wrap gap-2 ${stacked ? 'flex-col' : ''}`}>
          {list.map((name, index) => chip(name, row.name, zone.name, index))}
        </ul>
        {choices.length > 0 && !disabled && (
          <button
            type="button"
            aria-label={t('Add an element to {zone}', { zone: zoneLabel })}
            title={t('Add an element')}
            aria-expanded={adding === key}
            onClick={() => setAdding(adding === key ? null : key)}
            className={`h-6 w-6 shrink-0 rounded-full text-lg leading-6 text-slate-500 hover:bg-white hover:text-[#2271b1] focus:opacity-100 ${
              adding === key ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            } ${list.length ? '' : 'absolute inset-0 m-auto'}`}
          >
            +
          </button>
        )}
        {adding === key && (
          <AddPopover onClose={() => setAdding(null)}>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">
              {t('Insert elements')}
            </p>
            <ul className="grid grid-cols-4 gap-1">
              {choices.map((item) => (
                <li key={item.name}>
                  <button
                    type="button"
                    className="flex h-[78px] w-full flex-col items-center justify-center gap-2 rounded border border-transparent px-1 text-center text-xs text-slate-700 hover:border-[#2271b1] hover:text-[#2271b1]"
                    onClick={() => {
                      place(item.name, row.name, zone.name);
                      setAdding(null);
                      if (item.section) onOpen?.(item.section);
                    }}
                  >
                    <ItemIcon name={iconOf(item)} />
                    {labelText(item.label, locale)}
                  </button>
                </li>
              ))}
            </ul>
          </AddPopover>
        )}
      </div>
    );
  };

  /** Zone widths: the sides share the room, an empty center stays narrow. */
  const growOf = (row: ZoneRow, zone: ZoneDefinition) => {
    if (zone.name === 'center' && zoneItems(value, device, row.name, 'center').length === 0)
      return 'w-[135px] shrink-0';
    return 'flex-1';
  };

  const rowBox = (row: ZoneRow) => (
    <div
      key={row.name}
      className={`flex items-stretch border border-dashed bg-[#f9f9f9] ${
        row.section && row.section === active ? 'border-[#2271b1]' : 'border-[#cccccc]'
      }`}
    >
      <button
        type="button"
        disabled={!row.section || !onOpen}
        title={t('Settings of {row}', { row: labelText(row.label, locale) })}
        aria-label={t('Settings of {row}', { row: labelText(row.label, locale) })}
        className="flex w-[30px] shrink-0 items-center justify-center border-r border-dashed border-[#cccccc] text-slate-500 hover:text-[#2271b1] disabled:cursor-default"
        onClick={() => row.section && onOpen?.(row.section)}
      >
        <Gear />
      </button>
      <div className="flex min-w-0 flex-1 divide-x divide-dashed divide-[#cccccc]">
        {zonesOf(row).map((zone) => zoneBox(row, zone, growOf(row, zone)))}
      </div>
    </div>
  );

  const stackedRows = rows.filter((r) => r.stacked);
  const flatRows = rows.filter((r) => !r.stacked);
  const deviceLabel = (d: ZoneDevice) => (d === 'desktop' ? t('Desktop') : t('Tablet / Mobile'));

  return (
    <div className="space-y-3 text-sm">
      {!controlled && field.devices.length > 1 && (
        <div role="tablist" aria-label={t('Device')} className="flex w-fit rounded border">
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
      <div className="flex gap-5">
        {stackedRows.map((row) => (
          <div
            key={row.name}
            className={`flex w-[200px] shrink-0 flex-col border border-dashed bg-[#f9f9f9] ${
              row.section && row.section === active ? 'border-[#2271b1]' : 'border-[#cccccc]'
            }`}
          >
            <button
              type="button"
              disabled={!row.section || !onOpen}
              onClick={() => row.section && onOpen?.(row.section)}
              className="flex items-center gap-2 border-b border-dashed border-[#cccccc] px-3 py-2 text-left text-[11px] uppercase tracking-wide text-slate-500 hover:text-[#2271b1]"
            >
              <Gear />
              {labelText(row.label, locale)}
            </button>
            {zonesOf(row).map((zone) => zoneBox(row, zone, 'flex-1', true))}
          </div>
        ))}
        <div className="min-w-0 flex-1 space-y-4">{flatRows.map(rowBox)}</div>
      </div>
    </div>
  );
}

/** The "Insert elements" box above a zone; closes on Escape or a click outside. */
function AddPopover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="dialog"
      className="absolute bottom-full left-1/2 z-30 mb-2 w-[428px] max-w-[90vw] -translate-x-1/2 rounded bg-white p-3 text-left shadow-[0_2px_20px_rgba(0,0,0,0.2)]"
    >
      {children}
      <span
        aria-hidden="true"
        className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white"
      />
    </div>
  );
}
