/**
 * Site settings (the kit), as in other builders: a menu of panels, each with
 * the way back (also Esc). Global colors and fonts, the theme style
 * (typography, buttons, images, form fields), the site's identity,
 * background, layout and lightbox, variables and classes, and the panels of
 * other plugins (Fresco Pro's custom CSS and page transitions).
 */
import { api as coreApi, t as tr, useT } from '@cleitext/admin-sdk';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
  BORDER_STYLES,
  DECORATIONS,
  DEFAULT_KIT,
  FALLBACKS,
  FONT_STYLES,
  THEME_TEXTS,
  TRANSFORMS,
  type Filters,
  type Kit,
  type KitBox,
  type KitColor,
  type KitDevice,
  type KitFont,
  type ResponsiveText,
  type Shadow,
  type TextStyle,
  type ThemeStyle,
  type ThemeText,
  type TypoStyle,
} from '../core/kit.js';
import {
  OPTIONAL_BREAKPOINTS,
  OPTIONAL_DEVICES,
  activeDevices,
  type Breakpoints,
  type Device,
  type OptionalDevice,
  type SizeValue,
} from '../core/model.js';
import { extensions, type SiteSettingsPanelProps } from '../core/extensions.js';
import {
  ColorPicker,
  DEVICE_ICONS,
  DEVICE_NAMES,
  MediaPicker,
  Svg,
  type ControlEnv,
} from './controls.js';
import { FontPicker, systemGroup } from './font-picker.js';
import { notify } from './dialogs.js';
import { useStore, type Store } from './store.js';
import { ClassManager, VariablesManager } from './design-managers.js';

/** The panels of Site settings (other plugins add theirs by id). */
export type SiteSection =
  | 'colors'
  | 'fonts'
  | 'typography'
  | 'buttons'
  | 'images'
  | 'fields'
  | 'identity'
  | 'style'
  | 'layout'
  | 'lightbox'
  | 'variables'
  | 'classes';

interface MenuItem {
  id: string;
  title: string;
  icon: string;
}

/** The menu of Site settings, in groups. */
export const SITE_MENU: {
  group: string;
  id: 'design' | 'theme' | 'settings';
  items: MenuItem[];
}[] = [
  {
    group: 'Design system',
    id: 'design',
    items: [
      {
        id: 'colors',
        title: 'Global colors',
        icon: 'M12 3a9 9 0 0 0 0 18c1.2 0 1.9-1 1.5-2-.5-1.3.4-2.3 1.7-2.3H17a4 4 0 0 0 4-4C21 7.3 17 3 12 3z M7 11.5h.01 M10.5 7.5h.01 M15 9h.01',
      },
      { id: 'fonts', title: 'Global fonts', icon: 'M4 20l6-16h2l6 16 M7 14h10' },
      {
        id: 'variables',
        title: 'Variables manager',
        icon: 'M8 4H6a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h2 M16 4h2a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-2',
      },
      {
        id: 'classes',
        title: 'Class manager',
        icon: 'M4 6h16 M4 12h10 M4 18h6 M17 15l3 3-3 3',
      },
    ],
  },
  {
    group: 'Theme style',
    id: 'theme',
    items: [
      { id: 'typography', title: 'Typography', icon: 'M4 7V5h16v2 M9 19h6 M12 5v14' },
      { id: 'buttons', title: 'Buttons', icon: 'M3 8h18v8H3z M8 12h8' },
      { id: 'images', title: 'Images', icon: 'M3 5h18v14H3z M3 15l5-5 4 4 3-3 6 6 M15.5 9.5h.01' },
      { id: 'fields', title: 'Form fields', icon: 'M3 6h18v5H3z M3 15h12v4H3z' },
    ],
  },
  {
    group: 'Settings',
    id: 'settings',
    items: [
      {
        id: 'identity',
        title: 'Site identity',
        icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
      },
      { id: 'style', title: 'Background', icon: 'M4 4h16v16H4z M4 15l16-11' },
      { id: 'layout', title: 'Layout', icon: 'M4 4h16v16H4z M4 9h16 M9 9v11' },
      { id: 'lightbox', title: 'Lightbox', icon: 'M3 3h18v18H3z M8 8h8v8H8z' },
    ],
  },
];

/** The menu with the panels of other plugins (those this user may open). */
export function siteMenu(capabilities: readonly string[]): typeof SITE_MENU {
  const extra = extensions().siteSettings.filter(
    (panel) => !panel.capability || capabilities.includes(panel.capability),
  );
  return SITE_MENU.map((group) => ({
    ...group,
    items: [
      ...group.items,
      ...extra
        .filter((panel) => (panel.group ?? 'settings') === group.id)
        .map((panel) => ({ id: panel.id, title: panel.title, icon: panel.icon })),
    ],
  }));
}

// ---- Small fields --------------------------------------------------------------------------

/** The device whose values the responsive fields show; the canvas follows. */
export interface DeviceEnv {
  device: Device;
  setDevice: (device: Device) => void;
  breakpoints: Breakpoints;
}

function DevicePick({ env }: { env: DeviceEnv }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`fre-devices${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="is-on"
        title={tr('Responsive: {device}', { device: tr(DEVICE_NAMES[env.device]) })}
        aria-label={tr('Responsive: {device}', { device: tr(DEVICE_NAMES[env.device]) })}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Svg path={DEVICE_ICONS[env.device]} size={12} />
      </button>
      {open && (
        <span className="fre-devices__list" role="menu">
          {activeDevices(env.breakpoints).map((device) => (
            <button
              key={device}
              type="button"
              role="menuitem"
              className={device === env.device ? 'is-on' : undefined}
              title={tr(DEVICE_NAMES[device])}
              aria-label={tr(DEVICE_NAMES[device])}
              onClick={() => {
                env.setDevice(device);
                setOpen(false);
              }}
            >
              <Svg path={DEVICE_ICONS[device]} size={12} />
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function Row({
  label,
  children,
  help,
  responsive,
  inline = true,
}: {
  label: string;
  children: ReactNode;
  help?: string;
  responsive?: DeviceEnv;
  inline?: boolean;
}) {
  return (
    <div className={`fre-control${inline ? ' fre-control--inline' : ''}`}>
      <div className="fre-control__head">
        <span className="fre-control__label">{label}</span>
        {responsive && <DevicePick env={responsive} />}
      </div>
      <div className="fre-control__body">{children}</div>
      {help && <p className="fre-help">{help}</p>}
    </div>
  );
}

function ColorField({
  label,
  value,
  kit,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  kit: Kit;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
}) {
  return (
    <Row label={label}>
      <ColorPicker
        value={value ?? placeholder ?? ''}
        kit={{ ...kit, colors: [] }}
        onChange={(v) => onChange(v && !v.startsWith('var(') ? v : undefined)}
      />
    </Row>
  );
}

function SizeInput({
  value,
  onChange,
  units,
  placeholder,
  label,
}: {
  value: SizeValue | undefined;
  onChange: (v: SizeValue | undefined) => void;
  units: string[];
  placeholder?: SizeValue | undefined;
  label: string;
}) {
  const unit = value?.unit ?? placeholder?.unit ?? units[0]!;
  return (
    <span className="fre-sizefield">
      <input
        className="fre-input fre-input--number"
        type="number"
        step="any"
        aria-label={label}
        value={typeof value?.size === 'number' ? value.size : ''}
        placeholder={typeof placeholder?.size === 'number' ? String(placeholder.size) : ''}
        onChange={(e) =>
          onChange(e.target.value === '' ? undefined : { size: Number(e.target.value), unit })
        }
      />
      {units.length > 1 || units[0] ? (
        <select
          className="fre-unit"
          aria-label={tr('Unit')}
          value={unit}
          onChange={(e) =>
            onChange(
              typeof value?.size === 'number'
                ? { size: value.size, unit: e.target.value }
                : undefined,
            )
          }
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {u || '—'}
            </option>
          ))}
        </select>
      ) : null}
    </span>
  );
}

function SizeField({
  label,
  value,
  onChange,
  units = ['px', 'em', 'rem'],
  responsive,
  placeholder,
}: {
  label: string;
  value: SizeValue | undefined;
  onChange: (v: SizeValue | undefined) => void;
  units?: string[];
  responsive?: DeviceEnv;
  placeholder?: SizeValue;
}) {
  return (
    <Row label={label} responsive={responsive}>
      <SizeInput
        value={value}
        onChange={onChange}
        units={units}
        placeholder={placeholder}
        label={label}
      />
    </Row>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  emptyLabel,
}: {
  label: string;
  value: T | undefined;
  options: readonly (T | { value: T; label: string })[];
  onChange: (v: T | undefined) => void;
  emptyLabel?: string;
}) {
  const { t } = useT();
  return (
    <Row label={label}>
      <select
        className="fre-input"
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
      >
        <option value="">{emptyLabel ?? t('Default')}</option>
        {options.map((o) => {
          const option = typeof o === 'string' ? { value: o, label: o } : o;
          return (
            <option key={option.value} value={option.value}>
              {t(capitalize(option.label))}
            </option>
          );
        })}
      </select>
    </Row>
  );
}

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <Row label={suffix ? `${label} (${suffix})` : label}>
      <input
        className="fre-input fre-input--number"
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value ?? ''}
        onChange={(e) => {
          if (e.target.value === '') return onChange(undefined);
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
      />
    </Row>
  );
}

function SwitchField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  help?: string;
}) {
  return (
    <Row label={label} help={help}>
      <label className="fre-switch">
        <input
          type="checkbox"
          aria-label={label}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked ? true : undefined)}
        />
        <span />
      </label>
    </Row>
  );
}

/** The global fonts, to pick one. */
function FontField({
  label,
  kit,
  value,
  onChange,
}: {
  label: string;
  kit: Kit;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const { t } = useT();
  return (
    <Row label={label}>
      <select
        className="fre-input"
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">{t('Default')}</option>
        {kit.fonts.map((f) => (
          <option key={f.id} value={f.id}>
            {f.title}
          </option>
        ))}
      </select>
    </Row>
  );
}

const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];

/** A shadow, switched on and off, with its offsets, blur, spread and color. */
function ShadowField({
  label,
  value,
  kit,
  onChange,
}: {
  label: string;
  value: Shadow | undefined;
  kit: Kit;
  onChange: (v: Shadow | undefined) => void;
}) {
  const { t } = useT();
  const shadow = value ?? { x: 0, y: 4, blur: 10, spread: 0, color: 'rgba(0,0,0,0.2)' };
  const num = (key: 'x' | 'y' | 'blur' | 'spread', name: string) => (
    <label>
      <input
        className="fre-input fre-input--number"
        type="number"
        aria-label={`${label}: ${name}`}
        value={shadow[key]}
        onChange={(e) => onChange({ ...shadow, [key]: Number(e.target.value) || 0 })}
      />
      <span>{name}</span>
    </label>
  );
  return (
    <div className="fre-control">
      <div className="fre-control__head">
        <span className="fre-control__label">{label}</span>
        <label className="fre-switch">
          <input
            type="checkbox"
            aria-label={label}
            checked={!!value}
            onChange={(e) => onChange(e.target.checked ? shadow : undefined)}
          />
          <span />
        </label>
      </div>
      {value && (
        <div className="fre-shadow">
          {num('x', t('Horizontal'))}
          {num('y', t('Vertical'))}
          {num('blur', t('Blur'))}
          {num('spread', t('Spread'))}
          <ColorPicker
            value={shadow.color}
            kit={{ ...kit, colors: [] }}
            onChange={(v) => v && !v.startsWith('var(') && onChange({ ...shadow, color: v })}
          />
        </div>
      )}
    </div>
  );
}

function FiltersField({
  value,
  onChange,
}: {
  value: Filters | undefined;
  onChange: (v: Filters | undefined) => void;
}) {
  const { t } = useT();
  const f = value ?? {};
  const set = (patch: Filters) => {
    const next = { ...f, ...patch };
    for (const key of Object.keys(next) as (keyof Filters)[])
      if (next[key] === undefined) delete next[key];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <>
      <NumberField
        label={t('Blur')}
        suffix="px"
        min={0}
        max={10}
        step={0.1}
        value={f.blur}
        onChange={(blur) => set({ blur })}
      />
      <NumberField
        label={t('Brightness')}
        suffix="%"
        min={0}
        max={200}
        value={f.brightness}
        onChange={(brightness) => set({ brightness })}
      />
      <NumberField
        label={t('Contrast')}
        suffix="%"
        min={0}
        max={200}
        value={f.contrast}
        onChange={(contrast) => set({ contrast })}
      />
      <NumberField
        label={t('Saturation')}
        suffix="%"
        min={0}
        max={200}
        value={f.saturate}
        onChange={(saturate) => set({ saturate })}
      />
      <NumberField
        label={t('Hue')}
        suffix="deg"
        min={0}
        max={360}
        value={f.hue}
        onChange={(hue) => set({ hue })}
      />
    </>
  );
}

/** Four sides, linked or not. */
function BoxField({
  label,
  value,
  onChange,
  responsive,
  placeholder = 10,
}: {
  label: string;
  value: KitBox | undefined;
  onChange: (v: KitBox | undefined) => void;
  responsive?: DeviceEnv;
  placeholder?: number;
}) {
  const { t } = useT();
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  const box = value ?? {
    top: placeholder,
    right: placeholder,
    bottom: placeholder,
    left: placeholder,
    unit: 'px',
  };
  return (
    <Row label={label} responsive={responsive} inline={false}>
      <span className="fre-box">
        {sides.map((side) => (
          <label key={side}>
            <input
              className="fre-input fre-input--number"
              type="number"
              aria-label={`${label}: ${t(capitalize(side))}`}
              value={value ? value[side] : ''}
              placeholder={String(placeholder)}
              onChange={(e) => {
                if (e.target.value === '' && sides.every((s) => s === side || !value)) {
                  onChange(undefined);
                  return;
                }
                onChange({ ...box, [side]: Number(e.target.value) || 0 });
              }}
            />
            <span>{t(capitalize(side))}</span>
          </label>
        ))}
        <select
          className="fre-unit"
          aria-label={t('Unit')}
          value={box.unit}
          onChange={(e) => onChange({ ...box, unit: e.target.value })}
        >
          {['px', 'em', 'rem', '%', 'vw'].map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        {value && (
          <button
            type="button"
            className="fre-reset"
            title={t('Reset')}
            aria-label={t('Reset {control}', { control: label })}
            onClick={() => onChange(undefined)}
          >
            <Svg path="M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4" size={12} />
          </button>
        )}
      </span>
    </Row>
  );
}

/** Normal and Hover (or Focus) tabs of a section. */
function States({
  value,
  onChange,
  second = 'Hover',
}: {
  value: 'normal' | 'hover';
  onChange: (v: 'normal' | 'hover') => void;
  second?: string;
}) {
  const { t } = useT();
  return (
    <div className="fre-states" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={value === 'normal'}
        className={value === 'normal' ? 'is-on' : ''}
        onClick={() => onChange('normal')}
      >
        {t('Normal')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'hover'}
        className={value === 'hover' ? 'is-on' : ''}
        onClick={() => onChange('hover')}
      >
        {t(second)}
      </button>
    </div>
  );
}

// ---- Responsive values ------------------------------------------------------------------------

/** A responsive value of a text: desktop's at the top, the others under `devices`. */
export function responsiveGet(
  value: { devices?: Partial<Record<KitDevice, ResponsiveText>> } & ResponsiveText,
  key: keyof ResponsiveText,
  device: Device,
): SizeValue | undefined {
  return device === 'desktop' ? value[key] : value.devices?.[device]?.[key];
}

/** The same value changed (removed when undefined), empty objects left out. */
export function responsiveSet<
  T extends { devices?: Partial<Record<KitDevice, ResponsiveText>> } & ResponsiveText,
>(value: T, key: keyof ResponsiveText, device: Device, next: SizeValue | undefined): T {
  if (device === 'desktop') {
    const out = { ...value, [key]: next };
    if (next === undefined) delete out[key];
    return out;
  }
  const own = { ...value.devices?.[device], [key]: next };
  if (next === undefined) delete own[key];
  const devices = { ...value.devices, [device]: own };
  if (Object.keys(own).length === 0) delete devices[device];
  const out: T = { ...value, devices };
  if (Object.keys(devices).length === 0) delete out.devices;
  return out;
}

/**
 * A typography: a global font (it gives all its values), or a family, and
 * size, weight, transform, style, decoration, line height and spacing, the
 * sizes per device.
 */
function TypoFields({
  value,
  onChange,
  kit,
  responsive,
}: {
  value: TypoStyle;
  onChange: (v: TypoStyle) => void;
  kit: Kit;
  responsive: DeviceEnv;
}) {
  const { t } = useT();
  const set = (patch: Partial<TypoStyle>) => {
    const next: TypoStyle = { ...value, ...patch };
    for (const key of Object.keys(patch) as (keyof TypoStyle)[])
      if (next[key] === undefined) delete next[key];
    onChange(next);
  };
  const r = (key: keyof ResponsiveText) => responsiveGet(value, key, responsive.device);
  const setR = (key: keyof ResponsiveText, v: SizeValue | undefined) =>
    onChange(responsiveSet(value, key, responsive.device, v));
  return (
    <>
      <FontField
        label={t('Global font')}
        kit={kit}
        value={value.font}
        onChange={(font) => set({ font, fontAll: font ? true : undefined })}
      />
      {!value.font && (
        <Row label={t('Family')}>
          <FontPicker
            value={value.family ?? ''}
            onChange={(family) => set({ family: family || undefined })}
            groups={[systemGroup()]}
            emptyLabel={t('Default')}
            ariaLabel={t('Family')}
          />
        </Row>
      )}
      <SizeField
        label={t('Size')}
        value={r('size')}
        onChange={(v) => setR('size', v)}
        units={['px', 'em', 'rem', 'vw']}
        responsive={responsive}
      />
      <SelectField
        label={t('Weight')}
        value={value.weight}
        options={WEIGHTS}
        onChange={(weight) => set({ weight })}
      />
      <SelectField
        label={t('Transform')}
        value={value.transform}
        options={TRANSFORMS}
        onChange={(transform) => set({ transform })}
      />
      <SelectField
        label={t('Style')}
        value={value.style}
        options={FONT_STYLES}
        onChange={(style) => set({ style })}
      />
      <SelectField
        label={t('Decoration')}
        value={value.decoration}
        options={DECORATIONS}
        onChange={(decoration) => set({ decoration })}
      />
      <SizeField
        label={t('Line height')}
        value={r('line')}
        onChange={(v) => setR('line', v)}
        units={['', 'px', 'em']}
        responsive={responsive}
      />
      <SizeField
        label={t('Letter spacing')}
        value={r('letter')}
        onChange={(v) => setR('letter', v)}
        units={['px', 'em']}
        responsive={responsive}
      />
      <SizeField
        label={t('Word spacing')}
        value={r('word')}
        onChange={(v) => setR('word', v)}
        units={['px', 'em']}
        responsive={responsive}
      />
    </>
  );
}

/** A section of a panel that opens and closes (the first one open). */
function Fold({
  title,
  children,
  open: initial = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  const [open, setOpen] = useState(initial);
  return (
    <section className={`fre-section${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="fre-section__head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <Svg path={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} size={12} />
      </button>
      {open && <div className="fre-section__body">{children}</div>}
    </section>
  );
}

// ---- Theme style ---------------------------------------------------------------------------

type SetKit = (patch: Partial<Kit>) => void;
type SetTheme = (theme: ThemeStyle) => void;

interface SectionProps {
  kit: Kit;
  setTheme: SetTheme;
  set: SetKit;
  responsive: DeviceEnv;
}

const TEXT_LABELS: Record<ThemeText | 'link', string> = {
  body: 'Body text',
  link: 'Links',
  h1: 'H1',
  h2: 'H2',
  h3: 'H3',
  h4: 'H4',
  h5: 'H5',
  h6: 'H6',
};

/** Without the keys left undefined (the stored kit stays small). */
function clean<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function TypographySettings({ kit, setTheme, set, responsive }: SectionProps) {
  const { t } = useT();
  const [open, setOpen] = useState<ThemeText | 'link'>('body');
  const texts = kit.theme.texts ?? {};
  const setText = (key: ThemeText, next: TextStyle) =>
    setTheme({ ...kit.theme, texts: { ...texts, [key]: clean(next) } });
  const tabs = ['body', 'link', ...THEME_TEXTS.slice(1)] as const;
  const used = (key: ThemeText | 'link') =>
    key === 'link'
      ? !!(kit.theme.link || kit.style.link || kit.style.linkHover)
      : !!texts[key] && Object.keys(texts[key]!).length > 0;
  const paragraph = kit.theme.paragraph ?? {};
  const spacing =
    responsive.device === 'desktop'
      ? paragraph.spacing
      : paragraph.devices?.[responsive.device as KitDevice];
  const setSpacing = (v: SizeValue | undefined) => {
    const next = { ...paragraph };
    if (responsive.device === 'desktop') next.spacing = v;
    else {
      const devices = { ...next.devices, [responsive.device]: v };
      if (v === undefined) delete devices[responsive.device as KitDevice];
      next.devices = Object.keys(devices).length ? devices : undefined;
    }
    const kept = clean(next);
    setTheme({ ...kit.theme, paragraph: Object.keys(kept).length ? kept : undefined });
  };
  return (
    <>
      <p className="fre-help">
        {t('How texts and headings look on every Fresco page, unless an element says otherwise.')}
      </p>
      <div className="fre-chips">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            className={`fre-chip${open === key ? ' is-on' : ''}`}
            aria-pressed={open === key}
            onClick={() => setOpen(key)}
          >
            {t(TEXT_LABELS[key])}
            {used(key) && <span className="fre-dot" />}
          </button>
        ))}
      </div>
      {open === 'link' ? (
        <>
          <ColorField
            label={t('Link color')}
            kit={kit}
            value={kit.style.link}
            onChange={(link) => set({ style: clean({ ...kit.style, link }) })}
          />
          <ColorField
            label={t('Link color on hover')}
            kit={kit}
            value={kit.style.linkHover}
            onChange={(linkHover) => set({ style: clean({ ...kit.style, linkHover }) })}
          />
          <SelectField
            label={t('Decoration on hover')}
            value={kit.theme.link?.hoverDecoration}
            options={DECORATIONS}
            onChange={(hoverDecoration) =>
              setTheme({ ...kit.theme, link: clean({ ...kit.theme.link, hoverDecoration }) })
            }
          />
          <h4 className="fre-subheading">{t('Typography')}</h4>
          <TypoFields
            value={kit.theme.link ?? {}}
            kit={kit}
            responsive={responsive}
            onChange={(link) => setTheme({ ...kit.theme, link: clean({ ...link }) })}
          />
        </>
      ) : (
        <>
          <ColorField
            label={t('Color')}
            kit={kit}
            value={texts[open]?.color}
            onChange={(color) => setText(open, { ...texts[open], color })}
          />
          {open === 'body' && (
            <>
              <ColorField
                label={t('Text color of the elements')}
                kit={kit}
                value={kit.style.text}
                onChange={(text) => set({ style: clean({ ...kit.style, text }) })}
              />
              <SizeField
                label={t('Paragraph spacing')}
                value={spacing}
                onChange={setSpacing}
                units={['px', 'em', 'rem']}
                responsive={responsive}
              />
            </>
          )}
          <h4 className="fre-subheading">{t('Typography')}</h4>
          <TypoFields
            value={texts[open] ?? {}}
            kit={kit}
            responsive={responsive}
            onChange={(next) => setText(open, { ...next, color: texts[open]?.color })}
          />
        </>
      )}
    </>
  );
}

type ButtonStyle = NonNullable<ThemeStyle['button']>;

export function ButtonSettings({ kit, setTheme, responsive }: SectionProps) {
  const { t } = useT();
  const [state, setState] = useState<'normal' | 'hover'>('normal');
  const b = kit.theme.button ?? {};
  const set = (patch: Partial<ButtonStyle>) =>
    setTheme({ ...kit.theme, button: clean({ ...b, ...patch }) });
  const padding = (axis: 'y' | 'x') =>
    responsive.device === 'desktop'
      ? axis === 'y'
        ? b.paddingY
        : b.paddingX
      : b.padding?.[responsive.device as KitDevice]?.[axis];
  const setPadding = (axis: 'y' | 'x', v: SizeValue | undefined) => {
    if (responsive.device === 'desktop') {
      set(axis === 'y' ? { paddingY: v } : { paddingX: v });
      return;
    }
    const device = responsive.device as KitDevice;
    const own = clean({ ...b.padding?.[device], [axis]: v });
    const all = { ...b.padding, [device]: own };
    if (Object.keys(own).length === 0) delete all[device];
    set({ padding: Object.keys(all).length ? all : undefined });
  };
  return (
    <>
      <p className="fre-help">{t('The look of every button, unless a button says otherwise.')}</p>
      <Fold title={t('Typography')} open>
        <TypoFields
          value={b}
          kit={kit}
          responsive={responsive}
          onChange={(next) => setTheme({ ...kit.theme, button: clean({ ...next }) })}
        />
        <ShadowField
          label={t('Text shadow')}
          kit={kit}
          value={b.textShadow}
          onChange={(textShadow) => set({ textShadow })}
        />
      </Fold>
      <Fold title={t('Colors and border')} open>
        <States value={state} onChange={setState} />
        {state === 'normal' ? (
          <>
            <ColorField
              label={t('Text color')}
              kit={kit}
              value={b.color}
              onChange={(color) => set({ color })}
            />
            <ColorField
              label={t('Background')}
              kit={kit}
              value={b.background}
              onChange={(background) => set({ background })}
            />
            <ColorField
              label={t('Second color (gradient)')}
              kit={kit}
              value={b.backgroundB}
              onChange={(backgroundB) => set({ backgroundB })}
            />
            {b.backgroundB && (
              <NumberField
                label={t('Angle')}
                suffix="deg"
                min={0}
                max={360}
                value={b.angle}
                onChange={(angle) => set({ angle })}
              />
            )}
            <ShadowField
              label={t('Box shadow')}
              kit={kit}
              value={b.shadow}
              onChange={(shadow) => set({ shadow })}
            />
            <SelectField
              label={t('Border type')}
              value={b.borderStyle}
              options={BORDER_STYLES}
              onChange={(borderStyle) => set({ borderStyle })}
            />
            <SizeField
              label={t('Border width')}
              value={b.borderWidth}
              onChange={(borderWidth) => set({ borderWidth })}
              units={['px']}
            />
            <ColorField
              label={t('Border color')}
              kit={kit}
              value={b.borderColor}
              onChange={(borderColor) => set({ borderColor })}
            />
            <SizeField
              label={t('Border radius')}
              value={b.radius}
              onChange={(radius) => set({ radius })}
              units={['px', '%', 'em']}
            />
          </>
        ) : (
          <>
            <ColorField
              label={t('Text color')}
              kit={kit}
              value={b.hoverColor}
              onChange={(hoverColor) => set({ hoverColor })}
            />
            <ColorField
              label={t('Background')}
              kit={kit}
              value={b.hoverBackground}
              onChange={(hoverBackground) => set({ hoverBackground })}
            />
            <ColorField
              label={t('Second color (gradient)')}
              kit={kit}
              value={b.hoverBackgroundB}
              onChange={(hoverBackgroundB) => set({ hoverBackgroundB })}
            />
            <ColorField
              label={t('Border color')}
              kit={kit}
              value={b.hoverBorderColor}
              onChange={(hoverBorderColor) => set({ hoverBorderColor })}
            />
            <SizeField
              label={t('Border radius')}
              value={b.hoverRadius}
              onChange={(hoverRadius) => set({ hoverRadius })}
              units={['px', '%', 'em']}
            />
            <ShadowField
              label={t('Box shadow')}
              kit={kit}
              value={b.hoverShadow}
              onChange={(hoverShadow) => set({ hoverShadow })}
            />
            <NumberField
              label={t('Transition duration')}
              suffix="s"
              min={0}
              max={5}
              step={0.1}
              value={b.transition}
              onChange={(transition) => set({ transition })}
            />
          </>
        )}
      </Fold>
      <Fold title={t('Padding')} open>
        <SizeField
          label={t('Padding top and bottom')}
          value={padding('y')}
          onChange={(v) => setPadding('y', v)}
          responsive={responsive}
        />
        <SizeField
          label={t('Padding left and right')}
          value={padding('x')}
          onChange={(v) => setPadding('x', v)}
          responsive={responsive}
        />
      </Fold>
    </>
  );
}

type ImageStyle = NonNullable<ThemeStyle['image']>;

export function ImageSettings({ kit, setTheme }: SectionProps) {
  const { t } = useT();
  const [state, setState] = useState<'normal' | 'hover'>('normal');
  const i = kit.theme.image ?? {};
  const set = (patch: Partial<ImageStyle>) =>
    setTheme({ ...kit.theme, image: clean({ ...i, ...patch }) });
  const opacity = (
    label: string,
    value: number | undefined,
    change: (v: number | undefined) => void,
  ) => (
    <Row label={label}>
      <span className="fre-slider">
        <input
          type="range"
          aria-label={label}
          min={0}
          max={1}
          step={0.05}
          value={value ?? 1}
          onChange={(e) => change(Number(e.target.value))}
        />
        <span className="fre-mono">{value ?? 1}</span>
      </span>
    </Row>
  );
  return (
    <>
      <p className="fre-help">
        {t('The look of every image element, unless an image says otherwise.')}
      </p>
      <States value={state} onChange={setState} />
      {state === 'normal' ? (
        <>
          <SelectField
            label={t('Border type')}
            value={i.borderStyle}
            options={BORDER_STYLES}
            onChange={(borderStyle) => set({ borderStyle })}
          />
          <SizeField
            label={t('Border width')}
            value={i.borderWidth}
            onChange={(borderWidth) => set({ borderWidth })}
            units={['px']}
          />
          <ColorField
            label={t('Border color')}
            kit={kit}
            value={i.borderColor}
            onChange={(borderColor) => set({ borderColor })}
          />
          <SizeField
            label={t('Border radius')}
            value={i.radius}
            onChange={(radius) => set({ radius })}
            units={['px', '%']}
          />
          {opacity(t('Opacity'), i.opacity, (v) => set({ opacity: v }))}
          <ShadowField
            label={t('Box shadow')}
            kit={kit}
            value={i.shadow}
            onChange={(shadow) => set({ shadow })}
          />
          <h4 className="fre-subheading">{t('CSS filters')}</h4>
          <FiltersField value={i.filters} onChange={(filters) => set({ filters })} />
        </>
      ) : (
        <>
          <ColorField
            label={t('Border color')}
            kit={kit}
            value={i.hoverBorderColor}
            onChange={(hoverBorderColor) => set({ hoverBorderColor })}
          />
          <SizeField
            label={t('Border radius')}
            value={i.hoverRadius}
            onChange={(hoverRadius) => set({ hoverRadius })}
            units={['px', '%']}
          />
          {opacity(t('Opacity'), i.hoverOpacity, (v) => set({ hoverOpacity: v }))}
          <ShadowField
            label={t('Box shadow')}
            kit={kit}
            value={i.hoverShadow}
            onChange={(hoverShadow) => set({ hoverShadow })}
          />
          <h4 className="fre-subheading">{t('CSS filters')}</h4>
          <FiltersField value={i.hoverFilters} onChange={(hoverFilters) => set({ hoverFilters })} />
          <NumberField
            label={t('Transition duration')}
            suffix="s"
            min={0}
            max={5}
            step={0.1}
            value={i.transition}
            onChange={(transition) => set({ transition })}
          />
        </>
      )}
    </>
  );
}

type FieldStyle = NonNullable<ThemeStyle['field']>;

export function FieldSettings({ kit, setTheme, responsive }: SectionProps) {
  const { t } = useT();
  const [state, setState] = useState<'normal' | 'hover'>('normal');
  const f = kit.theme.field ?? {};
  const set = (patch: Partial<FieldStyle>) =>
    setTheme({ ...kit.theme, field: clean({ ...f, ...patch }) });
  const label = f.label ?? {};
  return (
    <>
      <p className="fre-help">{t('The fields of the forms on Fresco pages.')}</p>
      <Fold title={t('Label')}>
        <ColorField
          label={t('Text color')}
          kit={kit}
          value={label.color}
          onChange={(color) => set({ label: clean({ ...label, color }) })}
        />
        <TypoFields
          value={label}
          kit={kit}
          responsive={responsive}
          onChange={(next) => set({ label: clean({ ...next, color: label.color }) })}
        />
      </Fold>
      <Fold title={t('Field')} open>
        <TypoFields
          value={f}
          kit={kit}
          responsive={responsive}
          onChange={(next) => setTheme({ ...kit.theme, field: clean({ ...next }) })}
        />
        <ColorField
          label={t('Accent color')}
          kit={kit}
          value={f.accent}
          onChange={(accent) => set({ accent })}
        />
        <States value={state} onChange={setState} second="Focus" />
        {state === 'normal' ? (
          <>
            <ColorField
              label={t('Text color')}
              kit={kit}
              value={f.color}
              onChange={(color) => set({ color })}
            />
            <ColorField
              label={t('Background')}
              kit={kit}
              value={f.background}
              onChange={(background) => set({ background })}
            />
            <ShadowField
              label={t('Box shadow')}
              kit={kit}
              value={f.shadow}
              onChange={(shadow) => set({ shadow })}
            />
            <SelectField
              label={t('Border type')}
              value={f.borderStyle}
              options={BORDER_STYLES}
              onChange={(borderStyle) => set({ borderStyle })}
            />
            <SizeField
              label={t('Border width')}
              value={f.borderWidth}
              onChange={(borderWidth) => set({ borderWidth })}
              units={['px']}
            />
            <ColorField
              label={t('Border color')}
              kit={kit}
              value={f.borderColor}
              onChange={(borderColor) => set({ borderColor })}
            />
            <SizeField
              label={t('Border radius')}
              value={f.radius}
              onChange={(radius) => set({ radius })}
              units={['px', '%']}
            />
            <SizeField
              label={t('Padding top and bottom')}
              value={f.paddingY}
              onChange={(paddingY) => set({ paddingY })}
            />
            <SizeField
              label={t('Padding left and right')}
              value={f.paddingX}
              onChange={(paddingX) => set({ paddingX })}
            />
          </>
        ) : (
          <>
            <ColorField
              label={t('Text color')}
              kit={kit}
              value={f.focusColor}
              onChange={(focusColor) => set({ focusColor })}
            />
            <ColorField
              label={t('Background')}
              kit={kit}
              value={f.focusBackground}
              onChange={(focusBackground) => set({ focusBackground })}
            />
            <ColorField
              label={t('Border color when focused')}
              kit={kit}
              value={f.focusBorderColor}
              onChange={(focusBorderColor) => set({ focusBorderColor })}
            />
            <ShadowField
              label={t('Box shadow')}
              kit={kit}
              value={f.focusShadow}
              onChange={(focusShadow) => set({ focusShadow })}
            />
            <NumberField
              label={t('Transition duration')}
              suffix="s"
              min={0}
              max={5}
              step={0.1}
              value={f.transition}
              onChange={(transition) => set({ transition })}
            />
          </>
        )}
      </Fold>
    </>
  );
}

type LightboxStyle = NonNullable<ThemeStyle['lightbox']>;

/**
 * Where pages get their Google Fonts. Kept on the site by default: visitors'
 * browsers never reach Google, which in the EU needs their consent.
 */
export function GoogleFontsSetting({ kit, set }: Pick<SectionProps, 'kit' | 'set'>) {
  const { t } = useT();
  const mode = kit.googleFontsMode;
  return (
    <>
      <h4 className="fre-subheading">{t('Google Fonts')}</h4>
      <SelectField
        label={t('Load from')}
        value={mode === 'local' ? undefined : mode}
        emptyLabel={t('Host on this site (recommended)')}
        options={[
          { value: 'google', label: 'Load from Google' },
          { value: 'none', label: "Don't load" },
        ]}
        onChange={(googleFontsMode) => set({ googleFontsMode: googleFontsMode ?? 'local' })}
      />
      <p className="fre-help">
        {mode === 'google'
          ? t(
              "Visitors' browsers download the fonts from Google's servers: in the EU this needs their consent (GDPR).",
            )
          : mode === 'none'
            ? t(
                'Fresco adds no Google font: the theme or your own CSS provides them (self-hosted @font-face).',
              )
            : t(
                'The fonts are downloaded once by the server and served by your site: no visitor talks to Google. Fonts the theme already loads are never added again.',
              )}
      </p>
    </>
  );
}

export function LightboxSettings({ kit, setTheme }: SectionProps) {
  const { t } = useT();
  const l = kit.theme.lightbox ?? {};
  const set = (patch: Partial<LightboxStyle>) =>
    setTheme({ ...kit.theme, lightbox: clean({ ...l, ...patch }) });
  return (
    <>
      <p className="fre-help">{t('The window that shows images enlarged.')}</p>
      <SwitchField
        label={t('Open image links in the lightbox')}
        help={t('Links of Fresco elements to an image file open it in the lightbox.')}
        value={l.images}
        onChange={(images) => set({ images })}
      />
      <SwitchField
        label={t('Counter')}
        value={l.counter}
        onChange={(counter) => set({ counter })}
      />
      <SwitchField
        label={t('Fullscreen')}
        value={l.fullscreen}
        onChange={(fullscreen) => set({ fullscreen })}
      />
      <SwitchField label={t('Zoom')} value={l.zoom} onChange={(zoom) => set({ zoom })} />
      <SwitchField
        label={t('Download')}
        value={l.download}
        onChange={(download) => set({ download })}
      />
      <SelectField
        label={t('Text under the image')}
        value={l.caption}
        options={[
          { value: 'caption', label: 'Caption' },
          { value: 'alt', label: 'Alternative text' },
          { value: 'none', label: 'None' },
        ]}
        onChange={(caption) => set({ caption })}
      />
      <h4 className="fre-subheading">{t('Style')}</h4>
      <ColorField
        label={t('Background')}
        kit={kit}
        value={l.background}
        onChange={(background) => set({ background })}
      />
      <ColorField
        label={t('Buttons color')}
        kit={kit}
        value={l.uiColor}
        onChange={(uiColor) => set({ uiColor })}
      />
      <ColorField
        label={t('Buttons color on hover')}
        kit={kit}
        value={l.uiHoverColor}
        onChange={(uiHoverColor) => set({ uiHoverColor })}
      />
      <ColorField
        label={t('Text color')}
        kit={kit}
        value={l.textColor}
        onChange={(textColor) => set({ textColor })}
      />
      <NumberField
        label={t('Toolbar icons size')}
        suffix="px"
        min={8}
        max={80}
        value={l.iconSize}
        onChange={(iconSize) => set({ iconSize })}
      />
      <NumberField
        label={t('Close icon size')}
        suffix="px"
        min={8}
        max={120}
        value={l.closeSize}
        onChange={(closeSize) => set({ closeSize })}
      />
      <NumberField
        label={t('Navigation icons size')}
        suffix="px"
        min={8}
        max={120}
        value={l.navSize}
        onChange={(navSize) => set({ navSize })}
      />
    </>
  );
}

type BackgroundStyle = NonNullable<ThemeStyle['background']>;

export function BackgroundSettings({
  kit,
  setTheme,
  set: setKit,
  media,
}: SectionProps & { media: ControlEnv['media'] }) {
  const { t } = useT();
  const [picking, setPicking] = useState(false);
  const bg = kit.theme.background ?? {};
  // Earlier versions kept one color (`style.background`): it becomes this panel's on the first change.
  const legacy = !kit.theme.background && kit.style.background ? kit.style.background : undefined;
  const set = (patch: Partial<BackgroundStyle>) => {
    const next = clean({ ...(legacy ? { color: legacy } : {}), ...bg, ...patch });
    const theme = { ...kit.theme, background: Object.keys(next).length ? next : undefined };
    if (legacy) {
      const style = { ...kit.style };
      delete style.background;
      setKit({ theme, style });
    } else setTheme(theme);
  };
  const gradient = bg.type === 'gradient';
  return (
    <>
      <p className="fre-help">
        {t('The background of every Fresco page, unless a page has its own.')}
      </p>
      <Row label={t('Type')}>
        <span className="fre-choose" role="group" aria-label={t('Type')}>
          {(['classic', 'gradient'] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={(bg.type ?? 'classic') === type}
              className={(bg.type ?? 'classic') === type ? 'is-on' : ''}
              onClick={() => set({ type: type === 'classic' ? undefined : type })}
            >
              {t(type === 'classic' ? 'Classic' : 'Gradient')}
            </button>
          ))}
        </span>
      </Row>
      <ColorField
        label={t('Color')}
        kit={kit}
        value={bg.color ?? legacy}
        onChange={(color) => set({ color })}
      />
      {gradient ? (
        <>
          <ColorField
            label={t('Second color')}
            kit={kit}
            value={bg.colorB}
            onChange={(colorB) => set({ colorB })}
          />
          <SelectField
            label={t('Gradient type')}
            value={bg.gradient}
            options={[
              { value: 'linear', label: 'Linear' },
              { value: 'radial', label: 'Radial' },
            ]}
            onChange={(gradient) => set({ gradient })}
          />
          <NumberField
            label={t('Angle')}
            suffix="deg"
            min={0}
            max={360}
            value={bg.angle}
            onChange={(angle) => set({ angle })}
          />
        </>
      ) : (
        <>
          <div className="fre-control">
            <div className="fre-control__head">
              <span className="fre-control__label">{t('Image')}</span>
            </div>
            <div className="fre-media">
              <button type="button" className="fre-media__preview" onClick={() => setPicking(true)}>
                {bg.image ? (
                  <img src={bg.image.url} alt="" />
                ) : (
                  <span className="fre-media__empty">
                    <Svg path="M12 5v14 M5 12h14" size={20} />
                    {t('Choose an image')}
                  </span>
                )}
              </button>
              {bg.image && (
                <div className="fre-media__actions">
                  <button type="button" onClick={() => setPicking(true)}>
                    {t('Replace')}
                  </button>
                  <button type="button" onClick={() => set({ image: undefined })}>
                    {t('Remove')}
                  </button>
                </div>
              )}
            </div>
          </div>
          {bg.image && (
            <>
              <SelectField
                label={t('Position')}
                value={bg.position}
                options={[
                  'center center',
                  'center top',
                  'center bottom',
                  'left top',
                  'right top',
                  'left center',
                  'right center',
                  'left bottom',
                  'right bottom',
                ]}
                onChange={(position) => set({ position })}
              />
              <SelectField
                label={t('Repeat')}
                value={bg.repeat}
                options={['no-repeat', 'repeat', 'repeat-x', 'repeat-y']}
                onChange={(repeat) => set({ repeat })}
              />
              <SelectField
                label={t('Display size')}
                value={bg.size}
                options={['auto', 'cover', 'contain']}
                onChange={(size) => set({ size })}
              />
            </>
          )}
        </>
      )}
      {(gradient || bg.image) && (
        <SelectField
          label={t('Attachment')}
          value={bg.attachment}
          options={['scroll', 'fixed']}
          onChange={(attachment) => set({ attachment })}
        />
      )}
      <h4 className="fre-subheading">{t('Mobile browser')}</h4>
      <ColorField
        label={t('Browser bar color')}
        kit={kit}
        value={bg.mobileColor}
        onChange={(mobileColor) => set({ mobileColor })}
      />
      <p className="fre-help">
        {t('The color of the address bar in browsers on phones that support it.')}
      </p>
      {picking && (
        <MediaPicker
          env={{ media } as ControlEnv}
          kind="image"
          onClose={() => setPicking(false)}
          onPick={(items) => {
            const item = items[0];
            if (item) set({ image: { url: item.url, id: item.id } });
            setPicking(false);
          }}
        />
      )}
    </>
  );
}

export function LayoutSettings({ kit, set, responsive }: SectionProps) {
  const { t } = useT();
  const layout = kit.layout ?? {};
  const device = responsive.device;
  const own = device === 'desktop' ? undefined : layout.devices?.[device as KitDevice];
  const setLayout = (next: NonNullable<Kit['layout']>) => {
    const kept = clean(next);
    set({ layout: Object.keys(kept).length ? kept : undefined });
  };
  const setDevice = (patch: { width?: SizeValue; gap?: SizeValue; padding?: KitBox }) => {
    const key = device as KitDevice;
    const values = clean({ ...layout.devices?.[key], ...patch });
    const devices = { ...layout.devices, [key]: values };
    if (Object.keys(values).length === 0) delete devices[key];
    setLayout({ ...layout, devices: Object.keys(devices).length ? devices : undefined });
  };
  return (
    <>
      {device === 'desktop' ? (
        <>
          <NumberRow
            label={t('Content width (px)')}
            value={Number(kit.containerWidth.size)}
            min={300}
            max={2400}
            onChange={(v) => set({ containerWidth: { size: v, unit: 'px' } })}
            responsive={responsive}
          />
          <NumberRow
            label={t('Gap between elements (px)')}
            value={Number(kit.gap.size)}
            min={0}
            max={200}
            onChange={(v) => set({ gap: { size: v, unit: 'px' } })}
            responsive={responsive}
          />
        </>
      ) : (
        <>
          <SizeField
            label={t('Content width')}
            value={own?.width}
            placeholder={kit.containerWidth}
            units={['px', '%', 'vw']}
            onChange={(width) => setDevice({ width })}
            responsive={responsive}
          />
          <SizeField
            label={t('Gap between elements')}
            value={own?.gap}
            placeholder={kit.gap}
            units={['px', 'em', 'rem']}
            onChange={(gap) => setDevice({ gap })}
            responsive={responsive}
          />
        </>
      )}
      <BoxField
        label={t('Container padding')}
        value={device === 'desktop' ? layout.padding : own?.padding}
        onChange={(padding) =>
          device === 'desktop' ? setLayout({ ...layout, padding }) : setDevice({ padding })
        }
        responsive={responsive}
      />
      <p className="fre-help">
        {t('Around the content of top-level containers, unless a container has its own padding.')}
      </p>
      <SelectField
        label={t('Default page layout')}
        value={layout.pageLayout}
        options={[
          { value: 'full', label: 'Full width' },
          { value: 'canvas', label: 'Canvas (no header and footer)' },
        ]}
        emptyLabel={t('Theme default')}
        onChange={(pageLayout) => setLayout({ ...layout, pageLayout })}
      />
      <p className="fre-help">
        {t('For pages that keep the default layout in their page settings.')}
      </p>
      <BreakpointsSettings
        breakpoints={kit.breakpoints}
        onChange={(breakpoints) => set({ breakpoints })}
      />
      <div className="fre-control">
        <div className="fre-control__head">
          <span className="fre-control__label">{t('Page title selector')}</span>
        </div>
        <input
          className="fre-input fre-mono"
          value={kit.titleSelector ?? ''}
          placeholder={DEFAULT_KIT.titleSelector}
          onChange={(e) => set({ titleSelector: e.target.value || undefined })}
        />
        <p className="fre-help">
          {t('What "Hide the page title" hides, as a CSS selector of your theme.')}
        </p>
      </div>
    </>
  );
}

// ---- Global colors and fonts ----------------------------------------------------------------

function ColorRow({
  color,
  kit,
  system,
  onChange,
  onRemove,
}: {
  color: KitColor;
  kit: Kit;
  system: boolean;
  onChange: (c: KitColor) => void;
  onRemove: () => void;
}) {
  return (
    <div className="fre-kitrow">
      <ColorPicker
        value={color.value}
        kit={{ ...kit, colors: [] }}
        onChange={(v) => v && !v.startsWith('var(') && onChange({ ...color, value: v })}
      />
      <input
        className="fre-input"
        value={color.title}
        aria-label={tr('Name')}
        onChange={(e) => onChange({ ...color, title: e.target.value })}
      />
      <code className="fre-mono">{color.value}</code>
      {!system && (
        <button
          type="button"
          className="fre-iconbtn"
          aria-label={tr('Remove {name}', { name: color.title })}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** A global font: name, family and fallback, and the rest of its typography (folded). */
function FontRow({
  font,
  system,
  onChange,
  onRemove,
  responsive,
}: {
  font: KitFont;
  system: boolean;
  onChange: (f: KitFont) => void;
  onRemove: () => void;
  responsive: DeviceEnv;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<KitFont>) => {
    const next = { ...font, ...patch };
    for (const key of Object.keys(patch) as (keyof KitFont)[])
      if (next[key] === undefined) delete next[key];
    onChange(next);
  };
  const r = (key: keyof ResponsiveText) => responsiveGet(font, key, responsive.device);
  const setR = (key: keyof ResponsiveText, v: SizeValue | undefined) =>
    onChange(responsiveSet(font, key, responsive.device, v));
  return (
    <div className="fre-kitfont">
      <div className="fre-kitrow">
        <input
          className="fre-input"
          value={font.title}
          aria-label={t('Name')}
          onChange={(e) => set({ title: e.target.value })}
        />
        <button
          type="button"
          className={`fre-iconbtn${open ? ' is-on' : ''}`}
          aria-expanded={open}
          title={t('Edit {control}', { control: font.title })}
          aria-label={t('Edit {control}', { control: font.title })}
          onClick={() => setOpen(!open)}
        >
          <Svg path="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" size={13} />
        </button>
        {!system && (
          <button
            type="button"
            className="fre-iconbtn"
            aria-label={t('Remove {name}', { name: font.title })}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>
      <div className="fre-kitrow">
        <FontPicker
          value={font.family}
          ariaLabel={t('Family')}
          groups={[systemGroup()]}
          onChange={(family) => family && set({ family })}
        />
        <select
          className="fre-input"
          value={font.weight}
          aria-label={t('Weight')}
          onChange={(e) => set({ weight: e.target.value })}
        >
          {WEIGHTS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>
      {open && (
        <div className="fre-kitfont__more">
          <SelectField
            label={t('Fallback font')}
            value={font.fallback as (typeof FALLBACKS)[number] | undefined}
            options={FALLBACKS}
            onChange={(fallback) => set({ fallback })}
          />
          <SizeField
            label={t('Size')}
            value={r('size')}
            onChange={(v) => setR('size', v)}
            units={['px', 'em', 'rem', 'vw']}
            responsive={responsive}
          />
          <SelectField
            label={t('Transform')}
            value={font.transform as (typeof TRANSFORMS)[number] | undefined}
            options={TRANSFORMS}
            onChange={(transform) => set({ transform })}
          />
          <SelectField
            label={t('Style')}
            value={font.style as (typeof FONT_STYLES)[number] | undefined}
            options={FONT_STYLES}
            onChange={(style) => set({ style })}
          />
          <SelectField
            label={t('Decoration')}
            value={font.decoration as (typeof DECORATIONS)[number] | undefined}
            options={DECORATIONS}
            onChange={(decoration) => set({ decoration })}
          />
          <SizeField
            label={t('Line height')}
            value={r('line')}
            onChange={(v) => setR('line', v)}
            units={['', 'px', 'em']}
            responsive={responsive}
          />
          <SizeField
            label={t('Letter spacing')}
            value={r('letter')}
            onChange={(v) => setR('letter', v)}
            units={['px', 'em']}
            responsive={responsive}
          />
          <SizeField
            label={t('Word spacing')}
            value={r('word')}
            onChange={(v) => setR('word', v)}
            units={['px', 'em']}
            responsive={responsive}
          />
        </div>
      )}
      <p
        className="fre-preview-font"
        style={{
          fontFamily: font.fallback ? `"${font.family}", ${font.fallback}` : font.family,
          fontWeight: font.weight,
          fontStyle: font.style,
          textTransform: font.transform as React.CSSProperties['textTransform'],
          textDecoration: font.decoration,
          letterSpacing: font.letter ? `${font.letter.size}${font.letter.unit}` : undefined,
        }}
      >
        {t('The quick brown fox')}
      </p>
    </div>
  );
}

// ---- Layout: breakpoints ----------------------------------------------------------------------

function NumberRow({
  label,
  value,
  min,
  max,
  onChange,
  responsive,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  responsive?: DeviceEnv;
}) {
  return (
    <Row label={label} responsive={responsive}>
      <input
        className="fre-input fre-input--number"
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
      />
    </Row>
  );
}

/** Labels of the breakpoint rows, from the smallest device. */
const BREAKPOINT_ROWS: { device: Exclude<Device, 'desktop'>; label: string }[] = [
  { device: 'mobile', label: 'Mobile up to (px)' },
  { device: 'mobile_extra', label: 'Mobile extra up to (px)' },
  { device: 'tablet', label: 'Tablet up to (px)' },
  { device: 'tablet_extra', label: 'Tablet extra up to (px)' },
  { device: 'laptop', label: 'Laptop up to (px)' },
  { device: 'widescreen', label: 'Widescreen from (px)' },
];

/**
 * The breakpoints: tablet and mobile always, the other devices off until
 * switched on. Each value stays between its neighbours' (widescreen above all).
 */
function BreakpointsSettings({
  breakpoints,
  onChange,
}: {
  breakpoints: Breakpoints;
  onChange: (next: Breakpoints) => void;
}) {
  const { t: tx } = useT();
  // Bounds of a device: past its active neighbours (widescreen starts at
  // least two pixels above the widest max-width breakpoint, so desktop keeps a width).
  const bounds = (device: Exclude<Device, 'desktop'>) => {
    const index = BREAKPOINT_ROWS.findIndex((r) => r.device === device);
    const active = (rows: typeof BREAKPOINT_ROWS) =>
      rows.filter((r) => typeof breakpoints[r.device] === 'number');
    const below = active(BREAKPOINT_ROWS.slice(0, index)).at(-1);
    const above = active(BREAKPOINT_ROWS.slice(index + 1))[0];
    const step = (a: Device, b: Device) => (a === 'widescreen' || b === 'widescreen' ? 2 : 1);
    const cap =
      device === 'widescreen' ? 5000 : device === 'tablet' || device === 'mobile' ? 2400 : 2999;
    return {
      min: below ? breakpoints[below.device]! + step(below.device, device) : 320,
      max: above ? Math.min(cap, breakpoints[above.device]! - step(above.device, device)) : cap,
    };
  };
  return (
    <>
      <h4 className="fre-subheading">{tx('Breakpoints')}</h4>
      <p className="fre-help">
        {tx(
          'Extra devices are off until you switch them on; each one gets its own values and its own button in the top bar.',
        )}
      </p>
      {BREAKPOINT_ROWS.map(({ device, label }) => {
        const optional = (OPTIONAL_DEVICES as readonly string[]).includes(device);
        const value = breakpoints[device];
        const { min, max } = bounds(device);
        const on = typeof value === 'number';
        return (
          <div key={device} className="fre-control fre-control--inline">
            <div className="fre-control__head">
              <span className="fre-control__label">{tx(label)}</span>
            </div>
            <div className="fre-control__body">
              {optional && (
                <label className="fre-switch" title={tx(on ? 'Switch off' : 'Switch on')}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && min > max}
                    aria-label={tx(DEVICE_NAMES[device])}
                    onChange={(e) => {
                      const next = { ...breakpoints };
                      if (e.target.checked) {
                        const wanted = OPTIONAL_BREAKPOINTS[device as OptionalDevice];
                        next[device] = Math.max(min, Math.min(max, wanted));
                      } else delete next[device];
                      onChange(next);
                    }}
                  />
                  <span />
                </label>
              )}
              {on && (
                <input
                  className="fre-input fre-input--number"
                  type="number"
                  min={min}
                  max={max}
                  value={value}
                  aria-label={tx(label)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v > 0)
                      onChange({ ...breakpoints, [device]: Math.max(min, Math.min(max, v)) });
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---- The Site settings panel -----------------------------------------------------------------

export interface SiteViewProps {
  store: Store;
  media: ControlEnv['media'];
  canManageKit: boolean;
  onSaveKit: () => Promise<void>;
  /** The site settings are saved with the page (Publish), not with their own button. */
  savesWithPage?: boolean;
  canManageSettings?: boolean;
  canManageTheme?: boolean;
  /** The user's capabilities (panels of other plugins may need one). */
  capabilities?: readonly string[];
  /** The page in the canvas, for the live previews of other plugins' panels. */
  canvas?: () => Document | null;
}

/** Whether Esc goes back one level: not while a popover, a menu or a dialog takes it. */
export function escapeGoesBack(doc: Document): boolean {
  return !doc.querySelector(
    '.fre-popover, .fre-popup, .fre-fontpick__menu, .fre-modalbg, .fre-devices.is-open, .fre-menu, .fre-dropdown',
  );
}

export function SiteView({
  store,
  media,
  canManageKit,
  onSaveKit,
  savesWithPage,
  canManageSettings,
  canManageTheme,
  capabilities = [],
  canvas = () => null,
}: SiteViewProps) {
  const { t: tx } = useT();
  const kit = useStore(store, (s) => s.kit);
  const dirty = useStore(store, (s) => s.kitDirty || Object.keys(s.sitePending).length > 0);
  const section = useStore(store, (s) => s.siteSection);
  const device = useStore(store, (s) => s.device);
  const readOnly = useStore(store, (s) => s.readOnly);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Kit>) => store.actions.setKit({ ...store.get().kit, ...patch });
  const setTheme = (theme: Kit['theme']) => set({ theme: clean(theme) });
  const responsive: DeviceEnv = {
    device,
    setDevice: (d) => store.actions.setDevice(d),
    breakpoints: kit.breakpoints,
  };
  const menu = siteMenu(capabilities);
  const current = menu.flatMap((g) => g.items).find((item) => item.id === section);
  const extra = extensions().siteSettings.find((panel) => panel.id === section);

  // Esc goes back to the menu (as in other builders), unless something else takes it.
  useEffect(() => {
    if (!current) return;
    const back = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!escapeGoesBack(window.document)) return;
      event.stopPropagation();
      store.actions.openSite('');
    };
    window.addEventListener('keydown', back, true);
    return () => window.removeEventListener('keydown', back, true);
  }, [current, store]);

  const save = canManageKit && !savesWithPage && (
    <div className="fre-site__save">
      {error && <p className="fre-error">{error}</p>}
      <button
        type="button"
        className="fre-button fre-button--primary"
        disabled={!dirty || saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            await onSaveKit();
          } catch (e) {
            setError(String(e instanceof Error ? e.message : e));
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? tx('Saving…') : dirty ? tx('Save site settings') : tx('Site settings saved')}
      </button>
    </div>
  );

  if (!current) {
    return (
      <div className="fre-site fre-site--menu">
        <p className="fre-help">
          {tx('They apply to every Fresco page of the site.')}
          {!canManageKit && ` ${tx('Only administrators can save them.')}`}
        </p>
        {menu.map((group) => (
          <section key={group.group} className="fre-sitemenu">
            <h4>{tx(group.group)}</h4>
            {group.items.map((item) => (
              <button key={item.id} type="button" onClick={() => store.actions.openSite(item.id)}>
                <Svg path={item.icon} size={16} />
                <span>{tx(item.title)}</span>
                <Svg path="M9 6l6 6-6 6" size={12} />
              </button>
            ))}
          </section>
        ))}
        {save}
      </div>
    );
  }
  const props: SectionProps = { kit, setTheme, set, responsive };
  const Extra = extra?.component as ComponentType<SiteSettingsPanelProps> | undefined;
  return (
    <div className="fre-site">
      <button
        type="button"
        className="fre-site__back"
        title={tx('Back (Esc)')}
        onClick={() => store.actions.openSite('')}
      >
        <Svg path="M15 6l-6 6 6 6" size={14} />
        <span>{tx(current.title)}</span>
      </button>
      {section === 'colors' && (
        <div className="fre-section__body">
          {kit.colors.map((color, index) => (
            <ColorRow
              key={color.id}
              color={color}
              kit={kit}
              system={index < 4}
              onChange={(next) =>
                set({ colors: kit.colors.map((c) => (c.id === color.id ? next : c)) })
              }
              onRemove={() => set({ colors: kit.colors.filter((c) => c.id !== color.id) })}
            />
          ))}
          <button
            type="button"
            className="fre-button"
            onClick={() => {
              const id = `c${Math.random().toString(36).slice(2, 8)}`;
              set({ colors: [...kit.colors, { id, title: 'New color', value: '#64748b' }] });
            }}
          >
            {tx('+ Add color')}
          </button>
        </div>
      )}
      {section === 'fonts' && (
        <div className="fre-section__body">
          {kit.fonts.map((font, index) => (
            <FontRow
              key={font.id}
              font={font}
              system={index < 4}
              responsive={responsive}
              onChange={(next) =>
                set({ fonts: kit.fonts.map((f) => (f.id === font.id ? next : f)) })
              }
              onRemove={() => set({ fonts: kit.fonts.filter((f) => f.id !== font.id) })}
            />
          ))}
          <button
            type="button"
            className="fre-button"
            onClick={() => {
              const id = `f${Math.random().toString(36).slice(2, 8)}`;
              set({
                fonts: [...kit.fonts, { id, title: 'New font', family: 'Inter', weight: '400' }],
              });
            }}
          >
            {tx('+ Add font')}
          </button>
          <GoogleFontsSetting kit={kit} set={set} />
        </div>
      )}
      {section === 'typography' && <TypographySettings {...props} />}
      {section === 'buttons' && <ButtonSettings {...props} />}
      {section === 'images' && <ImageSettings {...props} />}
      {section === 'fields' && <FieldSettings {...props} />}
      {section === 'lightbox' && <LightboxSettings {...props} />}
      {section === 'style' && <BackgroundSettings {...props} media={media} />}
      {section === 'layout' && <LayoutSettings {...props} />}
      {section === 'variables' && (
        <VariablesManager kit={kit} set={set} readOnly={readOnly || !canManageKit} />
      )}
      {section === 'classes' && (
        <ClassManager kit={kit} set={set} readOnly={readOnly || !canManageKit} />
      )}
      {section === 'identity' && (
        <IdentitySettings
          canManage={canManageSettings === true}
          canManageTheme={canManageTheme === true}
          media={media}
        />
      )}
      {Extra && extra && (
        <Extra
          setPending={(fn) => store.actions.setSitePending(extra.id, fn)}
          canvas={canvas}
          readOnly={readOnly || !canManageKit}
        />
      )}
      {save}
    </div>
  );
}

// ---- Site identity (the core's general settings) ------------------------------------------

/** An image of the media library kept by its id (featured image, logo, site icon). */
export function MediaIdField({
  label,
  help,
  id,
  onChange,
  media,
  readOnly = false,
}: {
  label: string;
  help?: string;
  id: string | null;
  onChange: (id: string | null) => void;
  media: ControlEnv['media'];
  readOnly?: boolean;
}) {
  const { t } = useT();
  const [picking, setPicking] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    coreApi<{ url: string; variants?: { variant: string; url: string }[] }>(
      'GET',
      `/media/${encodeURIComponent(id)}`,
    )
      .then((item) => {
        if (!cancelled) setUrl(item.variants?.find((v) => v.variant === 'thumb')?.url ?? item.url);
      })
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
    };
  }, [id]);
  return (
    <div className="fre-control">
      <div className="fre-control__head">
        <span className="fre-control__label">{label}</span>
      </div>
      <div className="fre-media">
        <button
          type="button"
          className="fre-media__preview"
          disabled={readOnly}
          onClick={() => setPicking(true)}
        >
          {id && url ? (
            <img src={url} alt="" />
          ) : (
            <span className="fre-media__empty">
              <Svg path="M12 5v14 M5 12h14" size={20} />
              {t('Choose an image')}
            </span>
          )}
        </button>
        {id && !readOnly && (
          <div className="fre-media__actions">
            <button type="button" onClick={() => setPicking(true)}>
              {t('Replace')}
            </button>
            <button type="button" onClick={() => onChange(null)}>
              {t('Remove')}
            </button>
          </div>
        )}
      </div>
      {help && <p className="fre-help">{help}</p>}
      {picking && (
        <MediaPicker
          env={{ media } as ControlEnv}
          kind="image"
          onClose={() => setPicking(false)}
          onPick={(items) => {
            const item = items[0];
            if (item) {
              onChange(item.id);
              setUrl(item.thumbnailUrl ?? item.url);
            }
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

/** The theme's settings, as Appearance → Customize keeps them. */
interface ActiveTheme {
  theme?: { settings?: { name: string; type: string }[] };
  values: Record<string, unknown>;
}

/** Appearance → Customize in this admin. */
const customizeUrl = () =>
  `${window.location.pathname.split('/entries/')[0]}/appearance?tab=customize`;

/**
 * The site's identity: title and tagline (general settings), logo and site
 * icon (the theme's `logo` and `favicon` settings, as Customize keeps them,
 * when the active theme has them).
 */
export function IdentitySettings({
  canManage,
  canManageTheme,
  media,
}: {
  canManage: boolean;
  canManageTheme: boolean;
  media: ControlEnv['media'];
}) {
  const { t } = useT();
  const [values, setValues] = useState<{ title: string; tagline: string } | null>(null);
  const [theme, setTheme] = useState<ActiveTheme | null>(null);
  const [images, setImages] = useState<{ logo: string | null; favicon: string | null }>({
    logo: null,
    favicon: null,
  });
  const [dirty, setDirty] = useState({ core: false, theme: false });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!canManage) return;
    void coreApi<{ title: string; tagline: string }>('GET', '/settings/core')
      .then((s) => setValues({ title: s.title, tagline: s.tagline }))
      .catch(() => setValues(null));
  }, [canManage]);
  useEffect(() => {
    if (!canManageTheme) return;
    void coreApi<ActiveTheme>('GET', '/themes/active')
      .then((active) => {
        setTheme(active);
        const id = (key: string) =>
          typeof active.values[key] === 'string' && active.values[key]
            ? (active.values[key] as string)
            : null;
        setImages({ logo: id('logo'), favicon: id('favicon') });
      })
      .catch(() => setTheme(null));
  }, [canManageTheme]);
  const has = (name: string) =>
    theme?.theme?.settings?.some((field) => field.name === name && field.type === 'media') === true;
  const themeFields = (['logo', 'favicon'] as const).filter(has);
  if (!canManage && themeFields.length === 0) {
    return (
      <p className="fre-help">{t('Only administrators can change the identity of the site.')}</p>
    );
  }
  if (canManage && !values) return <p className="fre-empty-note">{t('Loading…')}</p>;
  const save = async () => {
    setSaving(true);
    try {
      if (dirty.core && values) await coreApi('PATCH', '/settings/core', values);
      if (dirty.theme && theme) {
        const saved = await coreApi<Record<string, unknown>>('PUT', '/themes/active/settings', {
          values: { ...theme.values, ...images },
        });
        setTheme({ ...theme, values: saved });
      }
      setDirty({ core: false, theme: false });
      notify(t('Site identity saved.'), 'success');
    } catch (e) {
      notify(String(e instanceof Error ? e.message : e), 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      {canManage && values && (
        <>
          <div className="fre-control">
            <div className="fre-control__head">
              <span className="fre-control__label">{t('Site title')}</span>
            </div>
            <input
              className="fre-input"
              value={values.title}
              onChange={(e) => {
                setValues({ ...values, title: e.target.value });
                setDirty((d) => ({ ...d, core: true }));
              }}
            />
          </div>
          <div className="fre-control">
            <div className="fre-control__head">
              <span className="fre-control__label">{t('Tagline')}</span>
            </div>
            <input
              className="fre-input"
              value={values.tagline}
              onChange={(e) => {
                setValues({ ...values, tagline: e.target.value });
                setDirty((d) => ({ ...d, core: true }));
              }}
            />
          </div>
        </>
      )}
      {themeFields.map((name) => (
        <MediaIdField
          key={name}
          label={name === 'logo' ? t('Site logo') : t('Site icon')}
          help={
            name === 'favicon'
              ? t('Shown in browser tabs and bookmarks: a square image, at least 512 × 512 px.')
              : undefined
          }
          id={images[name]}
          media={media}
          onChange={(id) => {
            setImages((current) => ({ ...current, [name]: id }));
            setDirty((d) => ({ ...d, theme: true }));
          }}
        />
      ))}
      {themeFields.length < 2 && (
        <p className="fre-help">
          {themeFields.length === 0
            ? t('The logo and the site icon are set in the theme’s options:')
            : t('The theme’s other images are set in its options:')}{' '}
          <a href={customizeUrl()} target="_blank" rel="noopener noreferrer">
            {t('Appearance → Customize')}
          </a>
        </p>
      )}
      <button
        type="button"
        className="fre-button fre-button--primary"
        disabled={saving || (!dirty.core && !dirty.theme)}
        onClick={() => void save()}
      >
        {saving ? t('Saving…') : t('Save')}
      </button>
    </>
  );
}
