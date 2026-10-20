import {
  googleFonts,
  paletteIndex,
  type BackgroundValue,
  type ColorPalette,
  type Device,
  type FieldValues,
  type Side,
  type SpacingValue,
  type TypographyValue,
} from '@cleitext/shared';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useT } from './i18n.js';

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600';
const smallInput =
  'w-full min-w-0 rounded border border-slate-300 bg-white px-1.5 py-1 text-sm focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600';

/**
 * The device whose values the responsive fields edit. A page with a preview
 * (Customize) provides it, so the fields and the preview change together.
 */
export const DeviceContext = createContext<{
  device: Device;
  setDevice: (device: Device) => void;
} | null>(null);

/** The device edited now: the page's, or one of the form's own. */
export function useDevice(): [Device, (device: Device) => void] {
  const shared = useContext(DeviceContext);
  const [own, setOwn] = useState<Device>('desktop');
  return shared ? [shared.device, shared.setDevice] : [own, setOwn];
}

const DEVICE_ICONS: Record<Device, ReactNode> = {
  desktop: (
    <svg
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="2" y="3" width="16" height="11" rx="1" />
      <path d="M7 17h6M10 14v3" />
    </svg>
  ),
  tablet: (
    <svg
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="4" y="2" width="12" height="16" rx="1.5" />
      <path d="M9 15h2" />
    </svg>
  ),
  mobile: (
    <svg
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="6" y="2" width="8" height="16" rx="1.5" />
      <path d="M9.5 15h1" />
    </svg>
  ),
};

/** Three small buttons choosing the device a responsive field edits. */
export function DeviceSwitch() {
  const { t } = useT();
  const [device, setDevice] = useDevice();
  const names: Record<Device, string> = {
    desktop: t('Desktop'),
    tablet: t('Tablet'),
    mobile: t('Mobile'),
  };
  return (
    <span role="group" aria-label={t('Device')} className="inline-flex gap-0.5">
      {(Object.keys(names) as Device[]).map((d) => (
        <button
          key={d}
          type="button"
          title={names[d]}
          aria-label={names[d]}
          aria-pressed={d === device}
          className={`rounded p-1 ${d === device ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          onClick={() => setDevice(d)}
        >
          {DEVICE_ICONS[d]}
        </button>
      ))}
    </span>
  );
}

/** A small unit chooser (`px ▾`). */
export function UnitSelect({
  units,
  value,
  onChange,
  disabled,
  label,
}: {
  units: string[];
  value: string | undefined;
  onChange: (unit: string) => void;
  disabled?: boolean;
  label: string;
}) {
  if (units.length < 2)
    return units[0] ? <span className="text-xs text-slate-500">{units[0]}</span> : null;
  return (
    <select
      aria-label={label}
      disabled={disabled}
      className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
      value={value || units[0]}
      onChange={(e) => onChange(e.target.value)}
    >
      {units.map((u) => (
        <option key={u} value={u}>
          {u || '—'}
        </option>
      ))}
    </select>
  );
}

const COLOR_RE = /^#[0-9a-f]{6}/i;

/** The colors of a palette, from the form's values. */
function paletteColors(palette: ColorPalette | undefined, form: FieldValues): string[] {
  if (!palette) return [];
  const list = form[palette.field];
  if (!Array.isArray(list)) return [];
  return list.map((item) =>
    item && typeof item === 'object' && typeof (item as { color?: unknown }).color === 'string'
      ? (item as { color: string }).color
      : '',
  );
}

/** A color: swatch, hexadecimal code and, with a palette, the theme's global colors. */
export function ColorInput({
  id,
  value,
  onChange,
  placeholder,
  alpha,
  palette,
  form = {},
  disabled,
  label,
  describedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string | null) => void;
  placeholder?: string;
  alpha?: boolean;
  palette?: ColorPalette;
  form?: FieldValues;
  disabled?: boolean;
  label: string;
  describedBy?: string;
}) {
  const { t } = useT();
  const colors = paletteColors(palette, form);
  const resolve = (v: string) => {
    const index = palette ? paletteIndex(v, palette) : null;
    return index !== null ? (colors[index] ?? '') : v;
  };
  const shown = value || placeholder || '';
  const real = resolve(shown);
  const known = COLOR_RE.test(real);
  const global = palette ? paletteIndex(value, palette) : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="relative inline-flex">
          <input
            type="color"
            aria-label={label}
            disabled={disabled}
            className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
            value={known ? real.slice(0, 7) : '#000000'}
            onChange={(e) =>
              // The alpha of a typed #rrggbbaa stays when the swatch changes the color.
              onChange(e.target.value + (alpha && value.length === 9 ? value.slice(7) : ''))
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
        {global !== null ? (
          <span className="flex-1 text-sm text-slate-700">
            {t('Global color {n}', { n: global + 1 })}
          </span>
        ) : (
          <input
            id={id}
            aria-describedby={describedBy}
            disabled={disabled}
            className={`${inputClass} w-32 font-mono`}
            value={value}
            placeholder={placeholder && !placeholder.startsWith('var(') ? placeholder : '#'}
            maxLength={alpha ? 9 : 7}
            onChange={(e) => onChange(e.target.value.trim() || null)}
          />
        )}
        {value && (
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
      {palette && colors.length > 0 && (
        <div role="group" aria-label={t('Global colors')} className="flex flex-wrap gap-1">
          {colors.map((color, i) => {
            const token = `var(${palette.prefix}${i})`;
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                title={t('Global color {n}', { n: i + 1 })}
                aria-label={t('Global color {n}', { n: i + 1 })}
                aria-pressed={value === token}
                className={`h-6 w-6 rounded-full border ${value === token ? 'ring-2 ring-sky-600 ring-offset-1' : 'border-slate-300'}`}
                style={{ background: color || '#fff' }}
                onClick={() => onChange(token)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

/** Four numbers (padding, margin, widths, radii) with a link and a unit. */
export function SpacingControl({
  value,
  placeholder,
  onChange,
  units = ['px', 'em', '%'],
  sides = SIDES,
  corners,
  disabled,
  label,
}: {
  value: SpacingValue | undefined;
  placeholder?: SpacingValue;
  onChange: (value: SpacingValue | null) => void;
  units?: string[];
  sides?: Side[];
  corners?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const { t } = useT();
  const [linked, setLinked] = useState(false);
  const names: Record<Side, string> = corners
    ? {
        top: t('Top left'),
        right: t('Top right'),
        bottom: t('Bottom right'),
        left: t('Bottom left'),
      }
    : { top: t('Top'), right: t('Right'), bottom: t('Bottom'), left: t('Left') };
  const current = value ?? {};
  const set = (side: Side, raw: string) => {
    const n = raw === '' ? null : Number(raw);
    const next: SpacingValue = { ...current };
    for (const s of linked ? sides : [side]) next[s] = n;
    onChange(
      SIDES.every((s) => next[s] === null || next[s] === undefined) && !next.unit ? null : next,
    );
  };
  return (
    <div className="flex items-end gap-1.5">
      <div className={`grid flex-1 gap-1 ${sides.length === 4 ? 'grid-cols-4' : 'grid-cols-2'}`}>
        {sides.map((side) => (
          <label key={side} className="text-center text-[11px] text-slate-500">
            <input
              type="number"
              disabled={disabled}
              aria-label={`${label}: ${names[side]}`}
              className={smallInput}
              value={typeof current[side] === 'number' ? String(current[side]) : ''}
              placeholder={
                typeof placeholder?.[side] === 'number' ? String(placeholder[side]) : undefined
              }
              onChange={(e) => set(side, e.target.value)}
            />
            {names[side]}
          </label>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1 pb-4">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={linked}
          title={t('Same value on every side')}
          aria-label={t('Same value on every side')}
          className={`rounded px-1 text-sm ${linked ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          onClick={() => setLinked((l) => !l)}
        >
          🔗
        </button>
        <UnitSelect
          units={units}
          value={current.unit ?? placeholder?.unit}
          label={t('Unit')}
          disabled={disabled}
          onChange={(unit) => onChange({ ...current, unit })}
        />
      </div>
    </div>
  );
}

/** A background: color, gradient or image (with position, size, repeat and an overlay). */
export function BackgroundControl({
  value,
  placeholder,
  onChange,
  palette,
  form,
  disabled,
  label,
  mediaPicker,
}: {
  value: BackgroundValue | undefined;
  placeholder?: BackgroundValue;
  onChange: (value: BackgroundValue | null) => void;
  palette?: ColorPalette;
  form?: FieldValues;
  disabled?: boolean;
  label: string;
  /** The media library picker of the form. */
  mediaPicker: (value: string | null, onChange: (id: string | null) => void) => ReactNode;
}) {
  const { t } = useT();
  const current = value ?? {};
  const type = current.type ?? placeholder?.type ?? 'color';
  const set = (patch: Partial<BackgroundValue>) => {
    const next = Object.fromEntries(
      Object.entries({ ...current, ...patch }).filter(
        ([, v]) => v !== null && v !== undefined && v !== '',
      ),
    ) as BackgroundValue;
    onChange(Object.keys(next).length ? next : null);
  };
  const types = [
    ['color', t('Color')],
    ['gradient', t('Gradient')],
    ['image', t('Image')],
  ] as const;
  return (
    <div className="space-y-2 rounded border border-slate-200 p-2">
      <div role="tablist" aria-label={label} className="flex gap-1">
        {types.map(([v, name]) => (
          <button
            key={v}
            type="button"
            role="tab"
            disabled={disabled}
            aria-selected={type === v}
            className={`rounded px-2 py-0.5 text-xs ${type === v ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            onClick={() => set({ type: v })}
          >
            {name}
          </button>
        ))}
      </div>
      {type === 'color' && (
        <ColorInput
          label={t('Color')}
          alpha
          value={current.color ?? ''}
          placeholder={placeholder?.color}
          palette={palette}
          form={form}
          disabled={disabled}
          onChange={(color) => set({ color: color ?? undefined })}
        />
      )}
      {type === 'gradient' && (
        <div className="space-y-1">
          <div
            aria-hidden="true"
            className="h-6 rounded border border-slate-200"
            style={{ background: current.gradient || placeholder?.gradient || '#fff' }}
          />
          <input
            aria-label={t('Gradient')}
            disabled={disabled}
            className={`${inputClass} font-mono text-xs`}
            placeholder="linear-gradient(90deg, #ffffff 0%, #000000 100%)"
            value={current.gradient ?? ''}
            onChange={(e) => set({ gradient: e.target.value })}
          />
        </div>
      )}
      {type === 'image' && (
        <div className="space-y-2">
          {mediaPicker(current.image ?? null, (image) => set({ image: image ?? undefined }))}
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <BgSelect
              label={t('Position')}
              value={current.position}
              options={[
                'left top',
                'center top',
                'right top',
                'left center',
                'center center',
                'right center',
                'left bottom',
                'center bottom',
                'right bottom',
              ]}
              onChange={(position) => set({ position })}
            />
            <BgSelect
              label={t('Size')}
              value={current.size}
              options={['auto', 'cover', 'contain']}
              onChange={(size) => set({ size: size as BackgroundValue['size'] })}
            />
            <BgSelect
              label={t('Repeat')}
              value={current.repeat}
              options={['repeat', 'no-repeat', 'repeat-x', 'repeat-y']}
              onChange={(repeat) => set({ repeat: repeat as BackgroundValue['repeat'] })}
            />
            <BgSelect
              label={t('Attachment')}
              value={current.attachment}
              options={['scroll', 'fixed']}
              onChange={(attachment) =>
                set({ attachment: attachment as BackgroundValue['attachment'] })
              }
            />
          </div>
          <div className="text-xs text-slate-600">
            {t('Overlay')}
            <ColorInput
              label={t('Overlay')}
              alpha
              value={current.overlay ?? ''}
              palette={palette}
              form={form}
              disabled={disabled}
              onChange={(overlay) => set({ overlay: overlay ?? undefined })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BgSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="space-y-0.5">
      <span className="block text-slate-600">{label}</span>
      <select
        className="w-full rounded border border-slate-300 bg-white px-1 py-1"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];

/** A font: family, weight, size per device, line height, spacing, case and decoration. */
export function TypographyControl({
  value,
  placeholder,
  onChange,
  units = ['px', 'em', 'rem', 'vw'],
  disabled,
  label,
}: {
  value: TypographyValue | undefined;
  placeholder?: TypographyValue;
  onChange: (value: TypographyValue | null) => void;
  units?: string[];
  disabled?: boolean;
  label: string;
}) {
  const { t } = useT();
  const [device] = useDevice();
  const [open, setOpen] = useState(false);
  const fonts = useMemo(() => [...googleFonts().keys()], []);
  const current = value ?? {};
  const set = (patch: Partial<TypographyValue>) => {
    const next = Object.fromEntries(
      Object.entries({ ...current, ...patch }).filter(
        ([, v]) => v !== null && v !== undefined && v !== '',
      ),
    ) as TypographyValue;
    onChange(Object.keys(next).length ? next : null);
  };
  const family = current.family || placeholder?.family || '';
  const weights = googleFonts().get(family)?.weights ?? WEIGHTS;
  const size = current.size ?? {};
  const sizeUnit = `${device}Unit` as const;
  const listId = useMemo(() => `fonts-${Math.random().toString(36).slice(2)}`, []);
  const summary = [
    family && family !== 'inherit' ? family : t('Default font'),
    current.weight || placeholder?.weight,
    typeof size.desktop === 'number' ? `${size.desktop}${size.desktopUnit ?? units[0]}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="rounded border border-slate-200">
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate text-slate-700">{summary}</span>
        <span aria-hidden="true" className="text-slate-500">
          ✎
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-100 p-2 text-xs">
          <label className="block space-y-0.5">
            <span className="text-slate-600">{t('Font family')}</span>
            <input
              list={listId}
              disabled={disabled}
              aria-label={`${label}: ${t('Font family')}`}
              className={smallInput}
              placeholder={placeholder?.family || t('Default font')}
              value={current.family ?? ''}
              onChange={(e) => set({ family: e.target.value })}
            />
            <datalist id={listId}>
              <option value="inherit" />
              {fonts.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="space-y-0.5">
              <span className="block text-slate-600">{t('Weight')}</span>
              <select
                disabled={disabled}
                className={smallInput}
                value={current.weight ?? ''}
                onChange={(e) => set({ weight: e.target.value })}
              >
                <option value="">
                  {placeholder?.weight ? `${t('Default')} (${placeholder.weight})` : t('Default')}
                </option>
                <option value="inherit">{t('Inherit')}</option>
                {weights.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-0.5">
              <span className="flex items-center justify-between text-slate-600">
                {t('Size')}
                <DeviceSwitch />
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  disabled={disabled}
                  aria-label={`${label}: ${t('Size')}`}
                  className={smallInput}
                  value={typeof size[device] === 'number' ? String(size[device]) : ''}
                  placeholder={
                    typeof placeholder?.size?.[device] === 'number'
                      ? String(placeholder.size[device])
                      : undefined
                  }
                  onChange={(e) =>
                    set({
                      size: {
                        ...size,
                        [device]: e.target.value === '' ? null : Number(e.target.value),
                      },
                    })
                  }
                />
                <UnitSelect
                  units={units}
                  value={size[sizeUnit]}
                  label={t('Unit')}
                  disabled={disabled}
                  onChange={(unit) => set({ size: { ...size, [sizeUnit]: unit } })}
                />
              </div>
            </div>
            <label className="space-y-0.5">
              <span className="block text-slate-600">{t('Line height')}</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.05"
                  disabled={disabled}
                  className={smallInput}
                  value={typeof current.lineHeight === 'number' ? String(current.lineHeight) : ''}
                  placeholder={
                    typeof placeholder?.lineHeight === 'number'
                      ? String(placeholder.lineHeight)
                      : undefined
                  }
                  onChange={(e) =>
                    set({ lineHeight: e.target.value === '' ? null : Number(e.target.value) })
                  }
                />
                <UnitSelect
                  units={['', 'em', 'px']}
                  value={current.lineHeightUnit ?? placeholder?.lineHeightUnit ?? ''}
                  label={t('Unit')}
                  onChange={(lineHeightUnit) => set({ lineHeightUnit })}
                />
              </span>
            </label>
            <label className="space-y-0.5">
              <span className="block text-slate-600">{t('Letter spacing')}</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  disabled={disabled}
                  className={smallInput}
                  value={
                    typeof current.letterSpacing === 'number' ? String(current.letterSpacing) : ''
                  }
                  onChange={(e) =>
                    set({ letterSpacing: e.target.value === '' ? null : Number(e.target.value) })
                  }
                />
                <UnitSelect
                  units={['px', 'em']}
                  value={current.letterSpacingUnit}
                  label={t('Unit')}
                  onChange={(letterSpacingUnit) => set({ letterSpacingUnit })}
                />
              </span>
            </label>
            <label className="space-y-0.5">
              <span className="block text-slate-600">{t('Text transform')}</span>
              <select
                disabled={disabled}
                className={smallInput}
                value={current.transform ?? ''}
                onChange={(e) => set({ transform: e.target.value as TypographyValue['transform'] })}
              >
                <option value="">{t('Default')}</option>
                <option value="none">{t('None')}</option>
                <option value="capitalize">Aa</option>
                <option value="uppercase">AA</option>
                <option value="lowercase">aa</option>
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="block text-slate-600">{t('Decoration')}</span>
              <select
                disabled={disabled}
                className={smallInput}
                value={current.decoration ?? ''}
                onChange={(e) =>
                  set({ decoration: e.target.value as TypographyValue['decoration'] })
                }
              >
                <option value="">{t('Default')}</option>
                <option value="none">{t('None')}</option>
                <option value="underline">{t('Underline')}</option>
                <option value="line-through">{t('Line through')}</option>
              </select>
            </label>
          </div>
          {value && (
            <button
              type="button"
              disabled={disabled}
              className="text-slate-600 hover:underline"
              onClick={() => onChange(null)}
            >
              ↺ {t('Reset')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
