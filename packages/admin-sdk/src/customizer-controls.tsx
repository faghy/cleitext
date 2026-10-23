import {
  DEVICES,
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
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEVICE_ICONS, useDevice } from './compound-fields.js';
import { useT } from './i18n.js';
import { useMediaPicker } from './media-picker.js';

/*
 * The controls of the customizer look of forms (`FieldsForm` with
 * `appearance="customizer"`): small, WordPress-admin styled pieces in a
 * 300 px panel, like the controls of the WordPress customizer.
 */

export const BLUE = '#2271b1';
/** An input's look, without its width. */
export const czField =
  'h-8 rounded-[3px] border border-[#dcdcde] bg-white px-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] disabled:opacity-60';
export const czInput = `${czField} w-full`;
export const czFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2271b1] focus-visible:ring-offset-1';
export const czButton = `inline-flex h-8 items-center justify-center rounded-[3px] border border-[#2271b1] bg-[#f6f7f7] px-3 text-[13px] text-[#2271b1] hover:border-[#135e96] hover:bg-[#f0f0f1] hover:text-[#135e96] disabled:opacity-60 ${czFocus}`;
const popoverClass =
  'absolute left-0 right-0 top-full z-40 mt-1.5 rounded-[3px] border border-[#dcdcde] bg-white p-3 shadow-[0_3px_14px_rgba(0,0,0,0.16)]';
const smallLabel = 'mb-1.5 block text-[13px] text-slate-800';

// ── Icons ────────────────────────────────────────────────────────────────

export function ResetIcon() {
  return (
    <svg width="12" height="13" viewBox="0 0 15 13" fill="currentColor" aria-hidden="true">
      <path d="M1.107 2.926 1.284.062.286 0 .031 4.115 0 4.614l.499.031 4.115.256.062-.998-2.93-.182a4.65 4.65 0 0 1 3.85-1.769c2.787 0 5.046 2.239 5.046 5s-2.26 5-5.046 5a5.05 5.05 0 0 1-4.121-2.115l-.824.577a6.06 6.06 0 0 0 6.771 2.258 6.05 6.05 0 0 0 4.229-5.706 6.05 6.05 0 0 0-4.202-5.726 6.06 6.06 0 0 0-6.342 1.686Z" />
    </svg>
  );
}

export function ChevronIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.5 11.6 12 16l-5.5-4.4.9-1.2L12 14l4.5-3.6 1 1.2z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 21 21" fill="none" className={className} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" />
      <path
        d="M10.409 4C9.013 4.864 8 7.436 8 10.473 8 13.576 9.057 16.193 10.5 17"
        stroke="currentColor"
      />
      <path
        d="M10.591 4C11.987 4.864 13 7.436 13 10.473 13 13.576 11.943 16.193 10.5 17"
        stroke="currentColor"
      />
      <path d="M17 10.5H4" stroke="currentColor" />
    </svg>
  );
}

function LinkIcon({ linked }: { linked: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
      {linked ? (
        <path d="M10 17.389H8.444A5.194 5.194 0 1 1 8.444 7H10v1.5H8.444a3.694 3.694 0 0 0 0 7.389H10v1.5ZM14 7h1.556a5.194 5.194 0 0 1 0 10.39H14v-1.5h1.556a3.694 3.694 0 0 0 0-7.39H14V7Zm-4.5 6h5v-1.5h-5V13Z" />
      ) : (
        <path d="M17.031 4.703 15.576 4l-1.56 3H14v.03l-2.324 4.47H9.5V13h1.396l-1.502 2.889h-.95a3.694 3.694 0 0 1 0-7.389H10V7H8.444a5.194 5.194 0 1 0 0 10.389h.17L7.5 19.53l1.416.719L15.049 8.5h.507a3.694 3.694 0 0 1 0 7.39H14v1.5h1.556a5.194 5.194 0 0 0 .273-10.383l1.202-2.304Z" />
      )}
    </svg>
  );
}

function DragIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M8 7h2V5H8v2zm0 6h2v-2H8v2zm0 6h2v-2H8v2zm6-14v2h2V5h-2zm0 8h2v-2h-2v2zm0 6h2v-2h-2v2z" />
    </svg>
  );
}
export { DragIcon };

// ── Small shared pieces ──────────────────────────────────────────────────

/** The device icon of a responsive field: a click moves to the next device. */
export function DeviceCycle() {
  const { t } = useT();
  const [device, setDevice] = useDevice();
  const names: Record<Device, string> = {
    desktop: t('Desktop'),
    tablet: t('Tablet'),
    mobile: t('Mobile'),
  };
  const next = DEVICES[(DEVICES.indexOf(device) + 1) % DEVICES.length]!;
  return (
    <button
      type="button"
      title={t('Editing: {device}. Click for {next}.', {
        device: names[device],
        next: names[next],
      })}
      aria-label={t('Editing: {device}. Click for {next}.', {
        device: names[device],
        next: names[next],
      })}
      className={`rounded-sm p-0.5 text-slate-500 hover:text-[#2271b1] ${czFocus}`}
      onClick={() => setDevice(next)}
    >
      {DEVICE_ICONS[device]}
    </button>
  );
}

/** ↺: back to the default. */
export function ResetButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useT();
  return (
    <button
      type="button"
      disabled={disabled}
      title={t('Reset to default')}
      aria-label={t('Reset to default')}
      className={`rounded-sm p-1 text-slate-400 hover:text-[#2271b1] ${czFocus}`}
      onClick={onClick}
    >
      <ResetIcon />
    </button>
  );
}

/** `px ⌄`: the unit of a value, in the label's line. */
export function CzUnit({
  units,
  value,
  onChange,
  disabled,
}: {
  units: string[];
  value: string | undefined;
  onChange: (unit: string) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  if (units.length < 2) {
    return units[0] ? <span className="px-1 text-[12px] text-slate-600">{units[0]}</span> : null;
  }
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label={t('Unit')}
        disabled={disabled}
        className={`cursor-pointer appearance-none rounded-sm bg-transparent py-0.5 pl-1 pr-4 text-[12px] text-slate-600 hover:text-[#2271b1] ${czFocus}`}
        value={value ?? units[0]}
        onChange={(e) => onChange(e.target.value)}
      >
        {units.map((u) => (
          <option key={u} value={u}>
            {u || '—'}
          </option>
        ))}
      </select>
      <ChevronIcon className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-slate-500" />
    </span>
  );
}

/** Closes a popover on Escape (giving the focus back to its button) and on a click outside. */
export function usePopover<K extends string>() {
  const [open, setOpen] = useState<K | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      ref.current?.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus();
      setOpen(null);
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const RANGE_CLASS =
  'h-[3px] min-w-0 flex-1 cursor-pointer appearance-none rounded-full focus-visible:outline-none disabled:cursor-default [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#2271b1] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#2271b1] focus-visible:[&::-moz-range-thumb]:shadow-[0_0_0_3px_rgba(34,113,177,0.35)] focus-visible:[&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgba(34,113,177,0.35)]';

/** Limits of a slider for a unit: the field's for its first unit, sensible ones for the others. */
export function rangeLimits(
  unit: string | undefined,
  first: string | undefined,
  field: { min?: number; max?: number; step?: number },
): { min: number; max: number; step: number } {
  if (!unit || unit === first) {
    return { min: field.min ?? 0, max: field.max ?? 100, step: field.step ?? 1 };
  }
  if (unit === 'em' || unit === 'rem') return { min: 0, max: 10, step: 0.1 };
  if (unit === 'vw' || unit === 'vh') return { min: 0, max: 100, step: 0.5 };
  if (unit === '%') return { min: 0, max: 100, step: 1 };
  return { min: 0, max: Math.max(field.max ?? 0, 200), step: 1 };
}

/** A slider (blue thumb, filled track) and the number beside it. */
export function CzRange({
  id,
  label,
  value,
  placeholder,
  min,
  max,
  step,
  onChange,
  disabled,
  describedBy,
}: {
  id?: string;
  label: string;
  value: number | undefined;
  placeholder: number | undefined;
  min: number;
  max: number;
  step: number;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const shown = value ?? placeholder ?? min;
  const pct = max > min ? Math.min(100, Math.max(0, ((shown - min) / (max - min)) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={label}
        disabled={disabled}
        className={RANGE_CLASS}
        style={{ background: `linear-gradient(to right, ${BLUE} ${pct}%, #dcdcde ${pct}%)` }}
        value={shown}
        min={min}
        max={Math.max(max, shown)}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        id={id}
        type="number"
        disabled={disabled}
        aria-describedby={describedBy}
        className={`${czField} w-16 shrink-0 px-2`}
        value={value ?? ''}
        placeholder={placeholder === undefined ? undefined : String(placeholder)}
        min={min}
        step="any"
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </div>
  );
}

/** An on / off switch. */
export function CzToggle({
  id,
  on,
  onChange,
  disabled,
  labelledBy,
  label,
}: {
  id?: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  labelledBy?: string;
  label?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      title={labelledBy ? undefined : label}
      disabled={disabled}
      className={`relative h-[18px] w-9 shrink-0 rounded-full border transition-colors disabled:opacity-60 ${czFocus} ${
        on ? 'border-[#2271b1] bg-[#2271b1]' : 'border-[#1e1e1e] bg-white'
      }`}
      onClick={() => onChange(!on)}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all ${
          on ? 'left-[19px] bg-white' : 'left-[2px] bg-[#1e1e1e]'
        }`}
      />
    </button>
  );
}

/** Buttons side by side, the chosen ones blue (choices, devices, tabs, text case). */
export function JoinedButtons<V extends string>({
  options,
  isOn,
  onClick,
  disabled,
  labelledBy,
  label,
  role = 'radiogroup',
  small = false,
}: {
  options: { value: V; label: string; content?: ReactNode }[];
  isOn: (value: V) => boolean;
  onClick: (value: V) => void;
  disabled?: boolean;
  labelledBy?: string;
  label?: string;
  /** `radiogroup` (one choice), `group` (toggles) or `tablist`. */
  role?: 'radiogroup' | 'group' | 'tablist';
  small?: boolean;
}) {
  const itemRole = role === 'radiogroup' ? 'radio' : role === 'tablist' ? 'tab' : undefined;
  return (
    <div
      role={role}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      className="flex"
    >
      {options.map((option, i) => {
        const on = isOn(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role={itemRole}
            aria-checked={itemRole === 'radio' ? on : undefined}
            aria-selected={itemRole === 'tab' ? on : undefined}
            aria-pressed={itemRole === undefined ? on : undefined}
            aria-label={option.content ? option.label : undefined}
            title={option.content ? option.label : undefined}
            disabled={disabled}
            onClick={() => onClick(option.value)}
            className={`relative flex min-w-0 flex-1 items-center justify-center border px-1.5 ${
              small ? 'h-8 text-[12px]' : 'h-[30px] text-[12px]'
            } font-semibold disabled:opacity-60 ${i > 0 ? '-ml-px' : 'rounded-l-[3px]'} ${
              i === options.length - 1 ? 'rounded-r-[3px]' : ''
            } ${
              on
                ? `z-[1] border-[#2271b1] bg-[#2271b1] text-white hover:bg-[#135e96] ${i > 0 && isOn(options[i - 1]!.value) ? 'shadow-[inset_1px_0_0_rgba(255,255,255,0.3)]' : ''}`
                : 'border-[#dcdcde] bg-white text-slate-700 hover:text-[#2271b1]'
            } focus-visible:z-[2] ${czFocus}`}
          >
            {option.content ?? <span className="truncate">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A native select in the panel's style. */
export function CzSelect({
  id,
  value,
  onChange,
  disabled,
  children,
  label,
  describedBy,
  className = 'w-full',
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
  label?: string;
  describedBy?: string;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <select
        id={id}
        aria-label={label}
        aria-describedby={describedBy}
        disabled={disabled}
        className={`${czInput} cursor-pointer appearance-none pr-8`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronIcon className="pointer-events-none absolute right-2 h-[18px] w-[18px] text-slate-700" />
    </span>
  );
}

// ── Colors ───────────────────────────────────────────────────────────────

const CHECKER = 'repeating-conic-gradient(#dcdcde 0% 25%, #fff 0% 50%) 50% / 8px 8px';

/** The global colors of a palette: their color and name. */
export function paletteEntries(
  palette: ColorPalette | undefined,
  form: FieldValues,
): { color: string; name: string }[] {
  if (!palette) return [];
  const list = form[palette.field];
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      color: typeof record.color === 'string' ? record.color : '',
      name: typeof record.name === 'string' ? record.name : '',
    };
  });
}

/** The real color of a value (a palette's resolved), `''` when none. */
export function resolveColor(
  value: string,
  palette: ColorPalette | undefined,
  form: FieldValues,
): string {
  if (!value) return '';
  const index = palette ? paletteIndex(value, palette) : null;
  if (index === null) return value;
  return paletteEntries(palette, form)[index]?.color ?? '';
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseHex(value: string): Rgba | null {
  const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (!m) return null;
  let hex = m[1]!;
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
}

function toHex({ r, g, b, a }: Rgba, alpha: boolean): string {
  const two = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${two(r)}${two(g)}${two(b)}${alpha && a < 1 ? two(a * 255) : ''}`;
}

interface Hsva {
  h: number;
  s: number;
  v: number;
  a: number;
}

function rgbaToHsva({ r, g, b, a }: Rgba): Hsva {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const d = max - Math.min(rr, gg, bb);
  let h = 0;
  if (d) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max, a };
}

function hsvaToRgba({ h, s, v, a }: Hsva): Rgba {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return { r: f(5), g: f(3), b: f(1), a };
}

/** Dark colors get a white icon on them. */
function isDark(color: string): boolean {
  const rgba = parseHex(color);
  if (!rgba || rgba.a < 0.5) return false;
  return 0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b < 150;
}

/** A round swatch: the color, a checkerboard when none, a globe for a palette color. */
export function Swatch({
  color,
  background,
  global,
  label,
  open,
  disabled,
  onClick,
}: {
  /** The real color shown (`''`: none). */
  color: string;
  /** Any CSS background instead of a color (gradients, images). */
  background?: string;
  global: boolean;
  label: string;
  open: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const layer = background ?? (color ? `linear-gradient(${color}, ${color})` : '');
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-7 w-7 shrink-0 rounded-full border ${
        open ? 'border-[#2271b1] ring-1 ring-[#2271b1]' : 'border-[#dcdcde]'
      } ${czFocus}`}
      style={{ background: layer ? `${layer}, ${CHECKER}` : CHECKER }}
    >
      {global && (
        <GlobeIcon
          className={`absolute inset-0 m-auto h-[19px] w-[19px] ${isDark(color) ? 'text-white' : 'text-slate-500'}`}
        />
      )}
    </button>
  );
}

/** Drag on an element: the pointer's position in it, from 0 to 1. */
function useDrag(onMove: (x: number, y: number) => void) {
  const handlers = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      e.currentTarget.setPointerCapture(e.pointerId);
      move(e);
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e);
    },
  };
  function move(e: React.PointerEvent<HTMLElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    onMove(clamp((e.clientX - box.left) / box.width), clamp((e.clientY - box.top) / box.height));
  }
  return handlers;
}

/** Saturation and brightness area, hue and alpha bars, and the hex code. */
export function ColorPicker({
  hex,
  alpha,
  onChange,
  disabled,
}: {
  hex: string;
  alpha: boolean;
  onChange: (hex: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const toHsva = (h: string) => rgbaToHsva(parseHex(h) ?? { r: 0, g: 0, b: 0, a: 1 });
  const [hsva, setHsva] = useState(() => toHsva(hex));
  const [seen, setSeen] = useState(hex);
  const [text, setText] = useState(hex);
  if (hex !== seen) {
    // Changed from outside (a palette color, a reset): follow it.
    setSeen(hex);
    setText(hex);
    if (parseHex(hex)) setHsva(toHsva(hex));
  }
  const emit = (next: Hsva) => {
    setHsva(next);
    const out = toHex(hsvaToRgba(next), alpha);
    setSeen(out);
    setText(out);
    onChange(out);
  };
  const area = useDrag((x, y) => !disabled && emit({ ...hsva, s: x, v: 1 - y }));
  const hue = useDrag((x) => !disabled && emit({ ...hsva, h: x * 360 }));
  const opacity = useDrag((x) => !disabled && emit({ ...hsva, a: Math.round(x * 100) / 100 }));
  const solid = toHex(hsvaToRgba({ ...hsva, a: 1 }), false);
  const keys =
    (change: (dx: number, dy: number) => void) => (e: React.KeyboardEvent<HTMLElement>) => {
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      const m = moves[e.key];
      if (!m || disabled) return;
      e.preventDefault();
      change(m[0], m[1]);
    };
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const pointer =
    'pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]';
  return (
    <div className="space-y-3">
      <div
        {...area}
        role="slider"
        tabIndex={0}
        aria-label={t('Color')}
        aria-valuetext={t('Saturation {s}%, brightness {v}%', {
          s: Math.round(hsva.s * 100),
          v: Math.round(hsva.v * 100),
        })}
        aria-valuenow={Math.round(hsva.s * 100)}
        onKeyDown={keys((dx, dy) =>
          emit({ ...hsva, s: clamp(hsva.s + dx / 100), v: clamp(hsva.v + dy / 100) }),
        )}
        className={`relative h-[140px] cursor-crosshair touch-none rounded-[3px] ${czFocus}`}
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsva.h} 100% 50%)`,
        }}
      >
        <span
          className={pointer}
          style={{ left: `${hsva.s * 100}%`, top: `${(1 - hsva.v) * 100}%`, background: solid }}
        />
      </div>
      <div
        {...hue}
        role="slider"
        tabIndex={0}
        aria-label={t('Hue')}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsva.h)}
        onKeyDown={keys((dx) => emit({ ...hsva, h: (hsva.h + dx * 3.6 + 360) % 360 }))}
        className={`relative h-3 cursor-pointer touch-none rounded-full ${czFocus}`}
        style={{
          background:
            'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
        }}
      >
        <span
          className={`${pointer} top-1/2`}
          style={{ left: `${(hsva.h / 360) * 100}%`, background: `hsl(${hsva.h} 100% 50%)` }}
        />
      </div>
      {alpha && (
        <div
          {...opacity}
          role="slider"
          tabIndex={0}
          aria-label={t('Opacity')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsva.a * 100)}
          onKeyDown={keys((dx) => emit({ ...hsva, a: clamp(hsva.a + dx / 100) }))}
          className={`relative h-3 cursor-pointer touch-none rounded-full ${czFocus}`}
          style={{ background: `linear-gradient(to right, transparent, ${solid}), ${CHECKER}` }}
        >
          <span
            className={`${pointer} top-1/2`}
            style={{ left: `${hsva.a * 100}%`, background: solid }}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-slate-500">Hex</span>
        <input
          aria-label={t('Hex code')}
          disabled={disabled}
          className={`${czInput} min-w-0 flex-1 font-mono text-[12px] uppercase`}
          value={text}
          placeholder="#"
          maxLength={alpha ? 9 : 7}
          onChange={(e) => {
            const raw = e.target.value.trim();
            setText(raw);
            const parsed = parseHex(raw);
            if (
              parsed &&
              (raw.replace('#', '').length === 6 || raw.replace('#', '').length === 8)
            ) {
              const out = toHex(parsed, alpha);
              setSeen(out);
              setHsva(rgbaToHsva(parsed));
              onChange(out);
            } else if (raw === '') {
              onChange(null);
            }
          }}
        />
        {alpha && (
          <span className="w-9 text-right text-[12px] text-slate-500">
            {Math.round(hsva.a * 100)}%
          </span>
        )}
        <button
          type="button"
          disabled={disabled}
          className={`rounded-sm px-1 text-[12px] text-[#2271b1] hover:underline ${czFocus}`}
          onClick={() => onChange(null)}
        >
          {t('Clear')}
        </button>
      </div>
    </div>
  );
}

/** The palette's swatches over the color picker: the content of a color popover. */
export function ColorPanel({
  value,
  placeholder,
  alpha,
  palette,
  form,
  onChange,
  disabled,
}: {
  value: string;
  placeholder?: string;
  alpha: boolean;
  palette?: ColorPalette;
  form: FieldValues;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const entries = paletteEntries(palette, form);
  const real = resolveColor(value || placeholder || '', palette, form);
  return (
    <div className="space-y-3">
      {palette && entries.length > 0 && (
        <div role="group" aria-label={t('Global colors')} className="flex flex-wrap gap-1.5">
          {entries.map((entry, i) => {
            const token = `var(${palette.prefix}${i})`;
            const on = (value || placeholder) === token;
            const name = entry.name || t('Global color {n}', { n: i + 1 });
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                title={name}
                aria-label={name}
                aria-pressed={on}
                className={`relative h-6 w-6 rounded-full border border-[#dcdcde] ${czFocus}`}
                style={{
                  background: entry.color
                    ? `linear-gradient(${entry.color}, ${entry.color}), ${CHECKER}`
                    : CHECKER,
                }}
                onClick={() => onChange(token)}
              >
                {on && (
                  <svg
                    viewBox="0 0 24 24"
                    className={`absolute inset-0 m-auto h-5 w-5 ${isDark(entry.color) ? 'text-white' : 'text-slate-800'}`}
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M16.5 7.5 10 13.9l-2.5-2.4-1 1 3.5 3.6 7.5-7.6z" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
      <ColorPicker
        hex={parseHex(real) ? real : ''}
        alpha={alpha}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

/** The popover box under a field. */
export function Popover({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="dialog" aria-label={label} className={popoverClass}>
      {children}
    </div>
  );
}

// ── Spacing ──────────────────────────────────────────────────────────────

const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

/** Four joined boxes (top, right, bottom, left) and a link button at the end. */
export function CzSpacing({
  label,
  value,
  placeholder,
  sides = SIDES,
  corners,
  onChange,
  disabled,
  id,
}: {
  label: string;
  value: SpacingValue | undefined;
  placeholder: SpacingValue | undefined;
  sides?: Side[];
  corners?: boolean;
  onChange: (value: SpacingValue | null) => void;
  disabled?: boolean;
  id?: string;
}) {
  const { t } = useT();
  const shown = value ?? placeholder ?? {};
  const [linked, setLinked] = useState(() => {
    const first = shown[sides[0]!] ?? null;
    return sides.every((s) => (shown[s] ?? null) === first);
  });
  const sideNames: Record<Side, string> = {
    top: t('Top'),
    right: t('Right'),
    bottom: t('Bottom'),
    left: t('Left'),
  };
  const names: Record<Side, string> = corners
    ? {
        top: t('Top left'),
        right: t('Top right'),
        bottom: t('Bottom right'),
        left: t('Bottom left'),
      }
    : sideNames;
  const current = value ?? {};
  const set = (side: Side, raw: string) => {
    const n = raw === '' ? null : Number(raw);
    const next: SpacingValue = { ...current };
    for (const s of linked ? sides : [side]) next[s] = n;
    onChange(SIDES.every((s) => next[s] === null || next[s] === undefined) ? null : next);
  };
  return (
    <div className="flex items-start">
      {sides.map((side, i) => (
        <label key={side} className={`min-w-0 flex-1 ${i > 0 ? '-ml-px' : ''}`}>
          <input
            id={i === 0 ? id : undefined}
            type="number"
            disabled={disabled}
            aria-label={`${label}: ${names[side]}`}
            className={`relative h-8 w-full border border-[#dcdcde] bg-white px-1 text-center text-[12px] text-slate-800 [appearance:textfield] placeholder:text-slate-400 focus:z-[1] focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] [&::-webkit-inner-spin-button]:appearance-none ${
              i === 0 ? 'rounded-l-[3px]' : ''
            }`}
            value={typeof current[side] === 'number' ? String(current[side]) : ''}
            placeholder={
              typeof placeholder?.[side] === 'number' ? String(placeholder[side]) : undefined
            }
            onChange={(e) => set(side, e.target.value)}
          />
          <span
            aria-hidden="true"
            className="mt-1 block truncate text-center text-[10px] uppercase tracking-wide text-slate-400"
          >
            {sideNames[side]}
          </span>
        </label>
      ))}
      <button
        type="button"
        disabled={disabled}
        aria-pressed={linked}
        title={t('Same value on every side')}
        aria-label={t('Same value on every side')}
        className={`-ml-px flex h-8 w-9 shrink-0 items-center justify-center rounded-r-[3px] border ${
          linked
            ? 'border-[#dcdcde] bg-[#f0f0f1] text-slate-800'
            : 'border-[#dcdcde] bg-[#f0f0f1] text-slate-500'
        } hover:text-[#2271b1] ${czFocus}`}
        onClick={() => setLinked((l) => !l)}
      >
        <LinkIcon linked={linked} />
      </button>
    </div>
  );
}

// ── Media ────────────────────────────────────────────────────────────────

/** An image of the media library: preview with Change / Remove, or a Select button. */
export function CzMedia({
  id,
  value,
  onChange,
  disabled,
  describedBy,
}: {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const picker = useMediaPicker(open, value);
  const { selected, items } = picker;
  return (
    <div className="space-y-2">
      {value ? (
        <>
          <div className="flex min-h-[72px] items-center justify-center rounded-[3px] border border-[#dcdcde] bg-[repeating-conic-gradient(#f0f0f1_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-2">
            {selected ? (
              <img src={selected.url} alt="" className="max-h-32 max-w-full object-contain" />
            ) : (
              <span className="text-[12px] text-slate-500">{t('Image chosen')}</span>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={disabled}
              className={`inline-flex h-8 items-center rounded-[3px] px-2 text-[13px] text-[#b32d2e] hover:underline ${czFocus}`}
              onClick={() => onChange(null)}
            >
              {t('Remove')}
            </button>
            <button
              id={id}
              type="button"
              disabled={disabled}
              aria-expanded={open}
              aria-describedby={describedBy}
              className={czButton}
              onClick={() => setOpen((o) => !o)}
            >
              {t('Change image')}
            </button>
          </div>
        </>
      ) : (
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-describedby={describedBy}
          className={`flex h-10 w-full items-center justify-center rounded-[3px] border border-[#2271b1] bg-white text-[13px] text-[#2271b1] hover:bg-[#f6f7f7] ${czFocus}`}
          onClick={() => setOpen((o) => !o)}
        >
          {t('Select image')}
        </button>
      )}
      {open && (
        <div className="space-y-1.5 rounded-[3px] border border-[#dcdcde] bg-white p-1.5">
          <input
            type="search"
            value={picker.search}
            placeholder={t('Search media')}
            aria-label={t('Search media')}
            className={`h-8 w-full rounded-[3px] border border-[#8c8f94] px-2 text-[13px] ${czFocus}`}
            onChange={(e) => picker.setSearch(e.target.value)}
          />
          <ul className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto">
            {items.map((media) => (
              <li key={media.id}>
                <button
                  type="button"
                  className={`block w-full rounded-[2px] border-2 ${media.id === value ? 'border-[#2271b1]' : 'border-transparent'} ${czFocus}`}
                  aria-label={media.filename}
                  aria-pressed={media.id === value}
                  title={media.filename}
                  onClick={() => {
                    onChange(media.id);
                    setOpen(false);
                  }}
                >
                  <img
                    src={media.url}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                </button>
              </li>
            ))}
            {picker.loaded && items.length === 0 && (
              <li className="col-span-3 p-1 text-[12px] text-slate-500">
                {picker.searching ? t('Nothing found.') : t('The media library is empty.')}
              </li>
            )}
            {picker.more && (
              <li className="col-span-3 text-center">
                <button
                  type="button"
                  disabled={picker.loadingMore}
                  className={czButton}
                  onClick={picker.loadMore}
                >
                  {t('Load more')}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Background ───────────────────────────────────────────────────────────

const GRADIENTS = [
  'linear-gradient(135deg, #2271b1 0%, #72aee6 100%)',
  'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
  'linear-gradient(135deg, #f97316 0%, #facc15 100%)',
  'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
  'linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%)',
  'linear-gradient(90deg, #10b981 0%, #06b6d4 100%)',
];

/** The swatch's look of a background value. */
export function backgroundLook(
  value: BackgroundValue | undefined,
  palette: ColorPalette | undefined,
  form: FieldValues,
): { color: string; background?: string; global: boolean } {
  const type = value?.type ?? 'color';
  if (type === 'gradient' && value?.gradient) {
    return { color: '', background: value.gradient, global: false };
  }
  if (type === 'image' && value?.image) {
    return {
      color: '',
      background: 'linear-gradient(135deg, #94a3b8 0 40%, #cbd5e1 40% 60%, #64748b 60% 100%)',
      global: false,
    };
  }
  const color = value?.color ?? '';
  return {
    color: resolveColor(color, palette, form),
    global: palette !== undefined && paletteIndex(color, palette) !== null,
  };
}

/** The content of a background popover: Color / Gradient / Image tabs. */
export function BackgroundPanel({
  value,
  placeholder,
  palette,
  form,
  onChange,
  disabled,
}: {
  value: BackgroundValue | undefined;
  placeholder?: BackgroundValue;
  palette?: ColorPalette;
  form: FieldValues;
  onChange: (value: BackgroundValue | null) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const [overlay, setOverlay] = useState(false);
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
  const bgSelect = (
    name: string,
    key: 'position' | 'size' | 'repeat' | 'attachment',
    options: string[],
  ) => (
    <label className="block">
      <span className="mb-1 block text-[12px] text-slate-600">{name}</span>
      <CzSelect
        value={current[key] ?? ''}
        disabled={disabled}
        onChange={(v) => set({ [key]: v || undefined } as Partial<BackgroundValue>)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </CzSelect>
    </label>
  );
  return (
    <div className="space-y-3">
      <JoinedButtons
        role="tablist"
        label={t('Background type')}
        options={[
          { value: 'color', label: t('Color') },
          { value: 'gradient', label: t('Gradient') },
          { value: 'image', label: t('Image') },
        ]}
        isOn={(v) => v === type}
        disabled={disabled}
        onClick={(v) => set({ type: v as BackgroundValue['type'] })}
      />
      {type === 'color' && (
        <ColorPanel
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
        <div className="space-y-2">
          <div
            aria-hidden="true"
            className="h-10 rounded-[3px] border border-[#dcdcde]"
            style={{ background: current.gradient || placeholder?.gradient || CHECKER }}
          />
          <div role="group" aria-label={t('Gradients')} className="flex flex-wrap gap-1.5">
            {GRADIENTS.map((g) => (
              <button
                key={g}
                type="button"
                disabled={disabled}
                title={g}
                aria-label={g}
                aria-pressed={current.gradient === g}
                className={`h-6 w-6 rounded-full border ${current.gradient === g ? 'border-[#2271b1] ring-1 ring-[#2271b1]' : 'border-[#dcdcde]'} ${czFocus}`}
                style={{ background: g }}
                onClick={() => set({ gradient: g })}
              />
            ))}
          </div>
          <input
            aria-label={t('Gradient')}
            disabled={disabled}
            className={`${czInput} font-mono text-[11px]`}
            placeholder="linear-gradient(90deg, #fff 0%, #000 100%)"
            value={current.gradient ?? ''}
            onChange={(e) => set({ gradient: e.target.value })}
          />
        </div>
      )}
      {type === 'image' && (
        <div className="space-y-3">
          <CzMedia
            value={current.image ?? null}
            disabled={disabled}
            onChange={(image) => set({ image: image ?? undefined })}
          />
          <div className="grid grid-cols-2 gap-2">
            {bgSelect(t('Position'), 'position', [
              'left top',
              'center top',
              'right top',
              'left center',
              'center center',
              'right center',
              'left bottom',
              'center bottom',
              'right bottom',
            ])}
            {bgSelect(t('Size'), 'size', ['auto', 'cover', 'contain'])}
            {bgSelect(t('Repeat'), 'repeat', ['repeat', 'no-repeat', 'repeat-x', 'repeat-y'])}
            {bgSelect(t('Attachment'), 'attachment', ['scroll', 'fixed'])}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-slate-600">{t('Overlay')}</span>
            <Swatch
              color={resolveColor(current.overlay ?? '', palette, form)}
              global={palette !== undefined && paletteIndex(current.overlay, palette) !== null}
              label={t('Overlay')}
              open={overlay}
              disabled={disabled}
              onClick={() => setOverlay((o) => !o)}
            />
          </div>
          {overlay && (
            <ColorPanel
              alpha
              value={current.overlay ?? ''}
              palette={palette}
              form={form}
              disabled={disabled}
              onChange={(color) => set({ overlay: color ?? undefined })}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Typography ───────────────────────────────────────────────────────────

const SYSTEM_FONTS = [
  'system-ui',
  'Arial',
  'Helvetica',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Courier New',
];
const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];

/** The family list: Inherit, system fonts, Google fonts, searchable. */
function FontFamily({
  id,
  value,
  placeholder,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (family: string) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const google = useMemo(() => [...googleFonts().keys()], []);
  const listId = useId();
  const q = query.trim().toLowerCase();
  const options = useMemo(() => {
    const match = (f: string) => !q || f.toLowerCase().includes(q);
    const all: { value: string; label: string; group?: string }[] = [];
    if (match('inherit') || match(t('Inherit')))
      all.push({ value: 'inherit', label: t('Inherit') });
    for (const f of SYSTEM_FONTS) if (match(f)) all.push({ value: f, label: f, group: 'system' });
    for (const f of google) if (match(f)) all.push({ value: f, label: f, group: 'google' });
    return all.slice(0, 120);
  }, [q, google, t]);
  const shown = value || placeholder;
  const choose = (family: string) => {
    onChange(family);
    setOpen(false);
    setQuery('');
    document.getElementById(id)?.focus();
  };
  return (
    <div>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${czInput} flex items-center justify-between text-left`}
        onClick={() => {
          setOpen((o) => !o);
          setActive(0);
        }}
      >
        <span className={`truncate ${value ? '' : 'text-slate-500'}`}>
          {shown === 'inherit' || !shown ? t('Inherit') : shown}
        </span>
        <ChevronIcon className="h-[18px] w-[18px] shrink-0 text-slate-700" />
      </button>
      {open && (
        <div className="mt-1 rounded-[3px] border border-[#dcdcde] bg-white">
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
            aria-label={t('Search fonts')}
            placeholder={t('Search fonts')}
            className="h-8 w-full border-b border-[#dcdcde] px-2 text-[13px] focus:outline-none"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(options.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (options[active]) choose(options[active].value);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
                document.getElementById(id)?.focus();
              }
            }}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={t('Font family')}
            className="max-h-52 overflow-y-auto py-1"
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                className={`cursor-pointer px-2 py-1 text-[13px] ${
                  i === active
                    ? 'bg-[#2271b1] text-white'
                    : o.value === value
                      ? 'text-[#2271b1]'
                      : 'text-slate-800'
                } ${i > 0 && options[i - 1]!.group !== o.group ? 'mt-1 border-t border-[#f0f0f1] pt-1.5' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o.value)}
              >
                {o.label}
              </li>
            ))}
            {options.length === 0 && (
              <li className="px-2 py-1 text-[12px] text-slate-500">{t('No font found.')}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** "Family  16px | 400 ⌄", opening the font's settings. */
export function CzTypography({
  id,
  label,
  value,
  placeholder,
  units = ['px', 'em', 'rem', 'vw'],
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: TypographyValue | undefined;
  placeholder: TypographyValue | undefined;
  units?: string[];
  onChange: (value: TypographyValue | null) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const [device] = useDevice();
  const { open, setOpen, ref } = usePopover<'font'>();
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
  const weight = current.weight || placeholder?.weight || '';
  const size = current.size ?? {};
  const fallbackSize = placeholder?.size ?? {};
  const sizeUnitKey = `${device}Unit` as const;
  const desktopSize = size.desktop ?? fallbackSize.desktop;
  const desktopUnit = size.desktopUnit ?? fallbackSize.desktopUnit ?? units[0];
  const weightNames: Record<string, string> = {
    '100': t('Thin 100'),
    '200': t('Extra-Light 200'),
    '300': t('Light 300'),
    '400': t('Normal 400'),
    '500': t('Medium 500'),
    '600': t('Semi-Bold 600'),
    '700': t('Bold 700'),
    '800': t('Extra-Bold 800'),
    '900': t('Ultra-Bold 900'),
  };
  const weights = googleFonts().get(family)?.weights ?? WEIGHTS;
  const deviceSize = size[device] ?? undefined;
  const larger =
    device === 'desktop'
      ? undefined
      : ((device === 'mobile' ? size.tablet : undefined) ?? size.desktop ?? undefined);
  const sizePlaceholder = larger ?? fallbackSize[device] ?? fallbackSize.desktop ?? undefined;
  const unit = size[sizeUnitKey] ?? fallbackSize[sizeUnitKey] ?? units[0];
  const limits = rangeLimits(unit, units[0], { min: 0, max: 100, step: 1 });
  const famId = useId();
  const weightId = useId();
  const sizeId = useId();
  const setSize = (patch: Record<string, unknown>) => {
    const next = Object.fromEntries(
      Object.entries({ ...size, ...patch }).filter(([, v]) => v !== null && v !== undefined),
    );
    set({ size: Object.keys(next).length ? next : undefined });
  };
  const caseButtons = (
    key: 'transform' | 'decoration',
    options: { value: string; label: string; content: ReactNode }[],
  ) => (
    <JoinedButtons
      role="group"
      label={key === 'transform' ? t('Text transform') : t('Decoration')}
      options={options}
      disabled={disabled}
      small
      isOn={(v) => (current[key] ?? placeholder?.[key] ?? '') === v}
      onClick={(v) =>
        set({ [key]: current[key] === v ? undefined : v } as Partial<TypographyValue>)
      }
    />
  );
  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open === 'font'}
        className={`flex h-8 w-full items-center rounded-[3px] border bg-white pl-2 pr-1 text-[12px] text-slate-600 ${
          open === 'font' ? 'border-[#2271b1] ring-1 ring-[#2271b1]' : 'border-[#dcdcde]'
        } ${czFocus}`}
        onClick={() => setOpen(open === 'font' ? null : 'font')}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {!family || family === 'inherit' ? t('Inherit') : family}
        </span>
        <span>{typeof desktopSize === 'number' ? `${desktopSize}${desktopUnit}` : 'inherit'}</span>
        <span aria-hidden="true" className="mx-1.5 h-3.5 border-l border-[#dcdcde]" />
        <span>{weight || 'inherit'}</span>
        <ChevronIcon className="ml-2 h-[18px] w-[18px] text-slate-700" />
      </button>
      {open === 'font' && (
        <Popover label={label}>
          <div className="space-y-3 p-1">
            <div>
              <label htmlFor={famId} className={smallLabel}>
                {t('Font Family')}
              </label>
              <FontFamily
                id={famId}
                value={current.family ?? ''}
                placeholder={placeholder?.family ?? ''}
                disabled={disabled}
                onChange={(f) => {
                  const ok = googleFonts().get(f)?.weights;
                  // A weight the new family does not have goes back to the default.
                  set({
                    family: f,
                    ...(ok && current.weight && !ok.includes(current.weight)
                      ? { weight: undefined }
                      : {}),
                  });
                }}
              />
            </div>
            <hr className="border-[#f0f0f1]" />
            <div>
              <label htmlFor={weightId} className={smallLabel}>
                {t('Font Weight')}
              </label>
              <CzSelect
                id={weightId}
                value={current.weight ?? ''}
                disabled={disabled}
                onChange={(w) => set({ weight: w })}
              >
                <option value="">
                  {placeholder?.weight
                    ? `${t('Default')} (${weightNames[placeholder.weight] ?? placeholder.weight})`
                    : t('Default')}
                </option>
                <option value="inherit">{t('Inherit')}</option>
                {weights.map((w) => (
                  <option key={w} value={w}>
                    {weightNames[w] ?? w}
                  </option>
                ))}
              </CzSelect>
            </div>
            <hr className="border-[#f0f0f1]" />
            <div>
              <div className="mb-1.5 flex min-h-[24px] items-center gap-1.5">
                <label htmlFor={sizeId} className="text-[13px] text-slate-800">
                  {t('Font Size')}
                </label>
                <DeviceCycle />
                <span className="ml-auto flex items-center gap-0.5">
                  {(size[device] !== undefined || size[sizeUnitKey] !== undefined) && (
                    <ResetButton
                      disabled={disabled}
                      onClick={() => setSize({ [device]: null, [sizeUnitKey]: null })}
                    />
                  )}
                  <CzUnit
                    units={units}
                    value={unit}
                    disabled={disabled}
                    onChange={(u) => setSize({ [sizeUnitKey]: u })}
                  />
                </span>
              </div>
              <CzRange
                id={sizeId}
                label={t('Font Size')}
                value={deviceSize ?? undefined}
                placeholder={sizePlaceholder ?? undefined}
                {...limits}
                disabled={disabled}
                onChange={(n) => setSize({ [device]: n })}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <span className="relative min-w-0 flex-1">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400"
                  >
                    ↕
                  </span>
                  <input
                    type="number"
                    step="0.05"
                    disabled={disabled}
                    aria-label={t('Line height')}
                    title={t('Line height')}
                    className={`${czInput} pl-5 pr-1`}
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
                </span>
                <CzUnit
                  units={['', 'em', 'px']}
                  value={current.lineHeightUnit ?? placeholder?.lineHeightUnit ?? ''}
                  disabled={disabled}
                  onChange={(lineHeightUnit) => set({ lineHeightUnit })}
                />
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <span className="relative min-w-0 flex-1">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"
                  >
                    |A|
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    disabled={disabled}
                    aria-label={t('Letter spacing')}
                    title={t('Letter spacing')}
                    className={`${czInput} pl-7 pr-1`}
                    value={
                      typeof current.letterSpacing === 'number' ? String(current.letterSpacing) : ''
                    }
                    placeholder={
                      typeof placeholder?.letterSpacing === 'number'
                        ? String(placeholder.letterSpacing)
                        : undefined
                    }
                    onChange={(e) =>
                      set({ letterSpacing: e.target.value === '' ? null : Number(e.target.value) })
                    }
                  />
                </span>
                <CzUnit
                  units={['px', 'em']}
                  value={current.letterSpacingUnit ?? placeholder?.letterSpacingUnit}
                  disabled={disabled}
                  onChange={(letterSpacingUnit) => set({ letterSpacingUnit })}
                />
              </div>
            </div>
            <hr className="border-[#f0f0f1]" />
            <div className="flex gap-3">
              <div className="flex-1">
                {caseButtons('transform', [
                  { value: 'lowercase', label: t('Lowercase'), content: 'aa' },
                  { value: 'capitalize', label: t('Capitalize'), content: 'Aa' },
                  { value: 'uppercase', label: t('Uppercase'), content: 'AA' },
                ])}
              </div>
              <div className="flex-1">
                {caseButtons('decoration', [
                  { value: 'none', label: t('None'), content: 'Aa' },
                  {
                    value: 'underline',
                    label: t('Underline'),
                    content: <span className="underline">Aa</span>,
                  },
                  {
                    value: 'line-through',
                    label: t('Line through'),
                    content: <span className="line-through">AA</span>,
                  },
                ])}
              </div>
            </div>
            {value && (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={disabled}
                  className={`inline-flex items-center gap-1 rounded-sm text-[12px] text-[#2271b1] hover:underline ${czFocus}`}
                  onClick={() => onChange(null)}
                >
                  <ResetIcon /> {t('Reset to default')}
                </button>
              </div>
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}
