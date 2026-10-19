/**
 * The controls of the panel. Each edits one setting (or, for groups, a few
 * prefixed ones) of the selected element, for the device being edited.
 */
import { t, type EditorMedia } from '@cleitext/admin-sdk';
import { askText } from './dialogs.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { ANIMATIONS } from '../core/common.js';
import { isBox, isSize } from '../core/css.js';
import { Icon, iconDataLoaded, iconNames } from '../core/icons.js';
import { GOOGLE_FONTS, SYSTEM_FONTS, type Kit } from '../core/kit.js';
import { extensions } from '../core/extensions.js';
import { isMedia } from '../core/media.js';
import {
  settingKey,
  type BoxValue,
  type Control,
  type ControlOption,
  type Device,
  type GroupControl,
  type LinkValue,
  type Settings,
  type SizeValue,
} from '../core/model.js';

export interface ControlEnv {
  /** Settings of the element (stored values only). */
  attrs: Settings;
  /** With the defaults. */
  settings: Settings;
  device: Device;
  hover: boolean;
  kit: Kit;
  setDevice: (device: Device) => void;
  set: (changes: Settings, merge?: string) => void;
  media: {
    upload: (file: File) => Promise<EditorMedia>;
    list: (query: { kind?: 'image'; search?: string }) => Promise<EditorMedia[]>;
  };
  readOnly: boolean;
}

// ---- Small parts ------------------------------------------------------------------------

export function Svg({ path, size = 16 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export const DEVICE_ICONS: Record<Device, string> = {
  desktop: 'M3 5h18v11H3z M8 20h8 M12 16v4',
  tablet: 'M6 3h12v18H6z M11 18h2',
  mobile: 'M8 3h8v18H8z M11 18h2',
};

const DEVICE_NAMES: Record<Device, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
};

/** The device being edited; a click shows the others (the canvas follows). */
function DeviceSwitch({ env }: { env: ControlEnv }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useClickAway(ref, open, () => setOpen(false));
  return (
    <span ref={ref} className={`fre-devices${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="is-on"
        title={t('Responsive: {device}', { device: t(DEVICE_NAMES[env.device]) })}
        aria-label={t('Responsive: {device}', { device: t(DEVICE_NAMES[env.device]) })}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Svg path={DEVICE_ICONS[env.device]} size={12} />
      </button>
      {open && (
        <span className="fre-devices__list" role="menu">
          {(['desktop', 'tablet', 'mobile'] as const)
            .filter((device) => device !== env.device)
            .map((device) => (
              <button
                key={device}
                type="button"
                role="menuitem"
                title={t(DEVICE_NAMES[device])}
                aria-label={t(DEVICE_NAMES[device])}
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

/** Calls `close` on a pointer down outside `ref` while `open`. */
function useClickAway(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => event.key === 'Escape' && close();
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open, close, ref]);
}

function Row({
  control,
  env,
  children,
  inline = false,
  reset,
}: {
  control: Control;
  env: ControlEnv;
  children: ReactNode;
  inline?: boolean;
  reset?: () => void;
}) {
  return (
    <div className={`fre-control${inline ? ' fre-control--inline' : ''}`}>
      <div className="fre-control__head">
        <span className="fre-control__label">{t(control.label)}</span>
        {extensions().fieldAddons.map((addon, i) => {
          const Addon = addon as ComponentType<{ control: Control; env: ControlEnv }>;
          return <Addon key={i} control={control} env={env} />;
        })}
        {control.responsive && <DeviceSwitch env={env} />}
        {reset && (
          <button
            type="button"
            className="fre-reset"
            title={t('Reset')}
            aria-label={t('Reset {control}', { control: t(control.label) })}
            onClick={reset}
          >
            <Svg path="M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4" size={12} />
          </button>
        )}
      </div>
      <div className="fre-control__body">{children}</div>
      {control.help && <p className="fre-help">{t(control.help)}</p>}
    </div>
  );
}

/** The stored value for the device and state, and the inherited one shown as placeholder. */
function valueOf(
  control: Control,
  env: ControlEnv,
): { key: string; value: unknown; inherited: unknown } {
  const device = control.responsive ? env.device : 'desktop';
  const hover = control.hover ? env.hover : false;
  const key = settingKey(control.name, device, hover);
  const chain: Device[] =
    device === 'mobile' ? ['tablet', 'desktop'] : device === 'tablet' ? ['desktop'] : [];
  let inherited: unknown;
  for (const d of chain) {
    const v =
      d === 'desktop' && !hover
        ? env.settings[control.name]
        : env.attrs[settingKey(control.name, d, hover)];
    if (v !== undefined && v !== '') {
      inherited = v;
      break;
    }
  }
  const value = device === 'desktop' && !hover ? env.settings[key] : env.attrs[key];
  return { key, value, inherited };
}

// ---- Dispatcher ---------------------------------------------------------------------------

export function ControlField({ control, env }: { control: Control; env: ControlEnv }) {
  useOptionSources();
  const { key, value, inherited } = valueOf(control, env);
  const set = (v: unknown, merge = true) => env.set({ [key]: v }, merge ? key : undefined);
  const has = env.attrs[key] !== undefined;
  const reset = has && control.type !== 'heading' ? () => env.set({ [key]: undefined }) : undefined;
  switch (control.type) {
    case 'heading':
      return <h4 className="fre-subheading">{t(control.label)}</h4>;
    case 'notice':
      return <p className="fre-notice">{t(control.label)}</p>;
    case 'text':
      return (
        <Row control={control} env={env} reset={reset}>
          <input
            className="fre-input"
            value={typeof value === 'string' ? value : ''}
            placeholder={
              typeof inherited === 'string'
                ? inherited
                : control.placeholder
                  ? t(control.placeholder)
                  : ''
            }
            onChange={(e) => set(e.target.value)}
            readOnly={env.readOnly}
          />
        </Row>
      );
    case 'textarea':
    case 'code':
      return (
        <Row control={control} env={env} reset={reset}>
          <textarea
            className={`fre-input${control.type === 'code' ? ' fre-code' : ''}`}
            rows={control.type === 'code' ? 8 : 4}
            value={typeof value === 'string' ? value : ''}
            placeholder={control.placeholder ? t(control.placeholder) : ''}
            onChange={(e) => set(e.target.value)}
            readOnly={env.readOnly}
            spellCheck={control.type !== 'code'}
          />
        </Row>
      );
    case 'richtext':
      return (
        <Row control={control} env={env}>
          <RichText
            value={typeof value === 'string' ? value : ''}
            onChange={(v) => set(v)}
            readOnly={env.readOnly}
          />
        </Row>
      );
    case 'number':
      return (
        <Row control={control} env={env} inline reset={reset}>
          <input
            className="fre-input fre-input--number"
            type="number"
            min={control.min}
            max={control.max}
            step={control.step ?? 1}
            value={typeof value === 'number' ? value : ''}
            placeholder={typeof inherited === 'number' ? String(inherited) : ''}
            onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </Row>
      );
    case 'select':
    case 'animation': {
      // The labels of the definition are translated; those from a source are content.
      const options = [
        ...(control.type === 'animation' ? ANIMATIONS : (control.options ?? [])).map((o) => ({
          ...o,
          label: t(o.label),
        })),
        ...(control.type !== 'animation' && control.source ? sourceOptions(control.source) : []),
      ];
      return (
        <Row control={control} env={env} inline reset={reset}>
          <select
            className="fre-input"
            value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
            onChange={(e) => set(e.target.value, false)}
            disabled={env.readOnly}
          >
            {(control.responsive || control.hover) && !options.some((o) => o.value === '') && (
              <option value="">
                {inherited !== undefined
                  ? t('Inherit ({value})', { value: String(inherited) })
                  : t('Default')}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Row>
      );
    }
    case 'choose':
      return (
        <Row control={control} env={env} inline reset={reset}>
          <span className="fre-choose" role="group" aria-label={t(control.label)}>
            {(control.options ?? []).map((option) => (
              <button
                key={option.value}
                type="button"
                title={t(option.label)}
                aria-pressed={value === option.value}
                className={
                  value === option.value
                    ? 'is-on'
                    : inherited === option.value
                      ? 'is-inherited'
                      : ''
                }
                onClick={() => set(value === option.value ? undefined : option.value, false)}
              >
                {option.icon ? <Svg path={option.icon} /> : t(option.label)}
              </button>
            ))}
          </span>
        </Row>
      );
    case 'switch':
      return (
        <Row control={control} env={env} inline>
          <label className="fre-switch">
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) => set(e.target.checked ? true : undefined, false)}
            />
            <span />
          </label>
        </Row>
      );
    case 'color':
      return (
        <Row control={control} env={env} inline reset={reset}>
          <ColorPicker
            value={typeof value === 'string' ? value : ''}
            kit={env.kit}
            onChange={(v) => set(v)}
          />
        </Row>
      );
    case 'slider':
      return (
        <Row control={control} env={env} reset={reset}>
          <Slider control={control} value={value} inherited={inherited} onChange={(v) => set(v)} />
        </Row>
      );
    case 'box':
      return (
        <Row control={control} env={env} reset={reset}>
          <BoxInput
            control={control}
            value={value}
            inherited={inherited}
            onChange={(v) => set(v)}
          />
        </Row>
      );
    case 'url':
      return (
        <Row control={control} env={env} reset={reset}>
          <LinkInput value={value as LinkValue | undefined} onChange={(v) => set(v)} />
        </Row>
      );
    case 'media':
      return (
        <Row control={control} env={env} reset={reset}>
          <MediaInput
            value={value}
            env={env}
            accept={control.accept ?? 'image'}
            onChange={(v) => set(v, false)}
          />
        </Row>
      );
    case 'gallery':
      return (
        <Row control={control} env={env} reset={reset}>
          <GalleryInput
            value={Array.isArray(value) ? value : []}
            env={env}
            onChange={(v) => set(v, false)}
          />
        </Row>
      );
    case 'icon':
      return (
        <Row control={control} env={env} reset={reset}>
          <IconInput value={value} onChange={(v) => set(v, false)} />
        </Row>
      );
    case 'font':
      return (
        <Row control={control} env={env} inline reset={reset}>
          <FontSelect
            value={typeof value === 'string' ? value : ''}
            onChange={(v) => set(v, false)}
          />
        </Row>
      );
    case 'date':
      return (
        <Row control={control} env={env} inline reset={reset}>
          <input
            className="fre-input"
            type="datetime-local"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => set(e.target.value)}
          />
        </Row>
      );
    case 'repeater':
      return <Repeater control={control} env={env} />;
    case 'typography':
    case 'background':
    case 'border':
    case 'shadow':
    case 'textShadow':
    case 'filters':
      return <Group control={control as GroupControl} env={env} />;
  }
}

// ---- Rich text ------------------------------------------------------------------------------

function RichText({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState(false);
  // Written only when the value changes from outside, so the caret stays put.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value && document.activeElement !== ref.current) {
      ref.current.innerHTML = value;
    }
  }, [value, source]);
  const command = (name: string, argument?: string) => {
    ref.current?.focus();
    document.execCommand(name, false, argument);
    if (ref.current) onChange(ref.current.innerHTML);
  };
  return (
    <div className="fre-rich">
      <div className="fre-rich__bar" role="toolbar" aria-label={t('Formatting')}>
        <button
          type="button"
          title={t('Bold')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('bold')}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          title={t('Italic')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('italic')}
        >
          <i>I</i>
        </button>
        <button
          type="button"
          title={t('Underline')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('underline')}
        >
          <u>U</u>
        </button>
        <button
          type="button"
          title={t('List')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('insertUnorderedList')}
        >
          <Svg path="M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01" size={14} />
        </button>
        <button
          type="button"
          title={t('Numbered list')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('insertOrderedList')}
        >
          <Svg path="M10 6h10 M10 12h10 M10 18h10 M4 6h1v4 M4 10h2 M4 14h2l-2 3h2" size={14} />
        </button>
        <button
          type="button"
          title={t('Link')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            // The dialog takes the focus: the selection is put back before linking.
            const selection = window.getSelection();
            const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
            void askText({ title: t('Link address'), value: 'https://' }).then((url) => {
              if (!url) return;
              if (range) {
                selection?.removeAllRanges();
                selection?.addRange(range);
              }
              command('createLink', url);
            });
          }}
        >
          <Svg
            path="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
            size={14}
          />
        </button>
        <button
          type="button"
          title={t('Paragraph')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('formatBlock', 'p')}
        >
          P
        </button>
        <button
          type="button"
          title={t('Heading')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('formatBlock', 'h3')}
        >
          H
        </button>
        <button
          type="button"
          title="HTML"
          className={source ? 'is-on' : ''}
          onClick={() => setSource((s) => !s)}
        >
          {'</>'}
        </button>
      </div>
      {source ? (
        <textarea
          className="fre-input fre-code"
          rows={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
        />
      ) : (
        <div
          ref={ref}
          className="fre-rich__area"
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        />
      )}
    </div>
  );
}

// ---- Colors -----------------------------------------------------------------------------

const GLOBAL_RE = /^var\(--fr-c-([a-z0-9-]+)\)$/;

export function ColorPicker({
  value,
  kit,
  onChange,
}: {
  value: string;
  kit: Kit;
  onChange: (v: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const global = GLOBAL_RE.exec(value)?.[1];
  const globalColor = global ? kit.colors.find((c) => c.id === global) : undefined;
  const shown = globalColor?.value ?? value;
  const hex = /^#[0-9a-f]{6}$/i.test(shown) ? shown : '#000000';
  return (
    <span className="fre-color">
      <button
        type="button"
        className="fre-color__swatch"
        style={{ background: shown || 'transparent' }}
        title={
          globalColor ? t('Global: {name}', { name: globalColor.title }) : value || t('No color')
        }
        onClick={() => setOpen((o) => !o)}
      >
        {!shown && <span className="fre-color__none" />}
      </button>
      {open && (
        <div className="fre-popover" role="dialog" aria-label={t('Color')}>
          <div className="fre-color__row">
            <input
              type="color"
              value={hex}
              onChange={(e) => onChange(e.target.value)}
              aria-label={t('Pick a color')}
            />
            <input
              className="fre-input fre-mono"
              value={global ? '' : value}
              placeholder={globalColor ? globalColor.value : '#rrggbb'}
              onChange={(e) => onChange(e.target.value.trim() || undefined)}
              aria-label={t('Color value')}
            />
          </div>
          <p className="fre-popover__title">{t('Global colors')}</p>
          <div className="fre-globals">
            {kit.colors.map((color) => (
              <button
                key={color.id}
                type="button"
                className={global === color.id ? 'is-on' : ''}
                title={color.title}
                onClick={() => {
                  onChange(`var(--fr-c-${color.id})`);
                  setOpen(false);
                }}
              >
                <span style={{ background: color.value }} />
                {color.title}
              </button>
            ))}
          </div>
          <div className="fre-popover__actions">
            <button type="button" onClick={() => onChange(undefined)}>
              {t('Clear')}
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              {t('Done')}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

// ---- Sizes and boxes --------------------------------------------------------------------

function Slider({
  control,
  value,
  inherited,
  onChange,
}: {
  control: Control;
  value: unknown;
  inherited: unknown;
  onChange: (v: SizeValue | undefined) => void;
}) {
  const units = control.units ?? ['px'];
  const current: SizeValue = isSize(value)
    ? value
    : { size: '', unit: isSize(inherited) ? inherited.unit : units[0]! };
  const max =
    current.unit === '%' || current.unit === 'vw' || current.unit === 'vh'
      ? 100
      : current.unit === 'em' || current.unit === 'rem'
        ? 10
        : (control.max ?? 100);
  const step =
    current.unit === 'em' || current.unit === 'rem' || current.unit === ''
      ? 0.1
      : (control.step ?? 1);
  const update = (size: number | '', unit = current.unit) =>
    onChange(size === '' ? undefined : { size, unit });
  return (
    <div className="fre-slider">
      <input
        type="range"
        min={control.min ?? 0}
        max={max}
        step={step}
        value={
          current.size === ''
            ? isSize(inherited) && inherited.size !== ''
              ? inherited.size
              : (control.min ?? 0)
            : current.size
        }
        onChange={(e) => update(Number(e.target.value))}
        aria-label={t(control.label)}
      />
      <input
        className="fre-input fre-input--number"
        type="number"
        step={step}
        value={current.size}
        placeholder={isSize(inherited) ? String(inherited.size) : ''}
        onChange={(e) => update(e.target.value === '' ? '' : Number(e.target.value))}
        aria-label={t('{control} value', { control: t(control.label) })}
      />
      {units.length > 1 || units[0] !== '' ? (
        <select
          className="fre-unit"
          value={current.unit}
          onChange={(e) => update(current.size === '' ? '' : current.size, e.target.value)}
          aria-label={t('Unit')}
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {u || '—'}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function BoxInput({
  control,
  value,
  inherited,
  onChange,
}: {
  control: Control;
  value: unknown;
  inherited: unknown;
  onChange: (v: BoxValue | undefined) => void;
}) {
  const units = control.units ?? ['px'];
  const box: BoxValue = isBox(value)
    ? value
    : { top: '', right: '', bottom: '', left: '', unit: units[0]!, linked: true };
  const hint: Partial<BoxValue> = isBox(inherited) ? inherited : {};
  const linked = box.linked !== false;
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  const update = (next: BoxValue) => {
    const empty = sides.every((s) => next[s] === '');
    onChange(empty ? undefined : next);
  };
  return (
    <div className="fre-box">
      {sides.map((side) => (
        <label key={side}>
          <input
            className="fre-input fre-input--number"
            type="number"
            value={box[side]}
            placeholder={hint[side] !== undefined && hint[side] !== '' ? String(hint[side]) : ''}
            onChange={(e) => {
              const v = e.target.value === '' ? '' : Number(e.target.value);
              update(
                linked ? { ...box, top: v, right: v, bottom: v, left: v } : { ...box, [side]: v },
              );
            }}
          />
          <span>{t(side)}</span>
        </label>
      ))}
      <button
        type="button"
        className={`fre-link${linked ? ' is-on' : ''}`}
        title={linked ? t('Unlink values') : t('Link values')}
        aria-pressed={linked}
        onClick={() => update({ ...box, linked: !linked })}
      >
        <Svg
          path="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
          size={13}
        />
      </button>
      <select
        className="fre-unit"
        value={box.unit}
        onChange={(e) => update({ ...box, unit: e.target.value })}
        aria-label={t('Unit')}
      >
        {units.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---- Links, media, icons, fonts ------------------------------------------------------------

function LinkInput({
  value,
  onChange,
}: {
  value: LinkValue | undefined;
  onChange: (v: LinkValue | undefined) => void;
}) {
  const link = value ?? { url: '' };
  const [options, setOptions] = useState(false);
  return (
    <div className="fre-linkinput">
      <div className="fre-color__row">
        <input
          className="fre-input"
          value={link.url}
          placeholder={t('https:// or /page')}
          onChange={(e) => onChange(e.target.value ? { ...link, url: e.target.value } : undefined)}
        />
        <button
          type="button"
          className={`fre-iconbtn${options ? ' is-on' : ''}`}
          title={t('Link options')}
          onClick={() => setOptions((o) => !o)}
        >
          <Svg
            path="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8 M4.6 9a1.7 1.7 0 0 0-.3-1.8"
            size={14}
          />
        </button>
      </div>
      {options && (
        <div className="fre-checks">
          <label>
            <input
              type="checkbox"
              checked={link.newTab === true}
              onChange={(e) => onChange({ ...link, newTab: e.target.checked || undefined })}
            />
            {t('Open in a new tab')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={link.nofollow === true}
              onChange={(e) => onChange({ ...link, nofollow: e.target.checked || undefined })}
            />
            {t('Add nofollow')}
          </label>
        </div>
      )}
    </div>
  );
}

function MediaInput({
  value,
  env,
  accept,
  onChange,
}: {
  value: unknown;
  env: ControlEnv;
  accept: 'image' | 'video' | 'svg';
  onChange: (v: unknown) => void;
}) {
  const [picking, setPicking] = useState(false);
  const media = isMedia(value) && value.url ? value : null;
  return (
    <div className="fre-media">
      <button type="button" className="fre-media__preview" onClick={() => setPicking(true)}>
        {media ? (
          accept === 'video' ? (
            <span className="fre-media__file">{media.url.split('/').pop()}</span>
          ) : (
            <img src={media.url} alt="" />
          )
        ) : (
          <span className="fre-media__empty">
            <Svg path="M12 5v14 M5 12h14" size={20} />
            {accept === 'video' ? t('Choose a video') : t('Choose an image')}
          </span>
        )}
      </button>
      {media && (
        <div className="fre-media__actions">
          <button type="button" onClick={() => setPicking(true)}>
            {t('Replace')}
          </button>
          <button type="button" onClick={() => onChange(undefined)}>
            {t('Remove')}
          </button>
        </div>
      )}
      {picking && (
        <MediaPicker
          env={env}
          kind={accept === 'image' ? 'image' : undefined}
          onClose={() => setPicking(false)}
          onPick={(items) => {
            const item = items[0];
            if (item)
              onChange({ id: item.id, url: item.url, ...(item.alt ? { alt: item.alt } : {}) });
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

function GalleryInput({
  value,
  env,
  onChange,
}: {
  value: unknown[];
  env: ControlEnv;
  onChange: (v: unknown) => void;
}) {
  const [picking, setPicking] = useState(false);
  const items = value.filter(isMedia);
  return (
    <div className="fre-gallery">
      <div className="fre-gallery__grid">
        {items.map((item, i) => (
          <span key={`${item.id ?? item.url}-${i}`} className="fre-gallery__item">
            <img src={item.url} alt="" />
            <button
              type="button"
              aria-label={t('Remove')}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <button type="button" className="fre-button" onClick={() => setPicking(true)}>
        {items.length ? t('Add images') : t('Choose images')}
      </button>
      {picking && (
        <MediaPicker
          env={env}
          kind="image"
          multiple
          onClose={() => setPicking(false)}
          onPick={(picked) => {
            onChange([
              ...items,
              ...picked.map((m) => ({ id: m.id, url: m.url, ...(m.alt ? { alt: m.alt } : {}) })),
            ]);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

export function MediaPicker({
  env,
  kind,
  multiple = false,
  onPick,
  onClose,
}: {
  env: ControlEnv;
  kind?: 'image';
  multiple?: boolean;
  onPick: (items: EditorMedia[]) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<EditorMedia[] | null>(null);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<EditorMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      env.media
        .list({ ...(kind ? { kind } : {}), ...(search ? { search } : {}) })
        .then((list) => !cancelled && setItems(list))
        .catch((e: unknown) => !cancelled && setError(String(e)));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [env.media, kind, search]);
  const toggle = (item: EditorMedia) => {
    if (!multiple) return onPick([item]);
    setChosen((list) =>
      list.some((m) => m.id === item.id) ? list.filter((m) => m.id !== item.id) : [...list, item],
    );
  };
  return (
    <div
      className="fre-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('Media library')}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="fre-modal__box">
        <div className="fre-modal__head">
          <strong>{t('Media library')}</strong>
          <input
            className="fre-input"
            placeholder={t('Search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="fre-button">
            {busy ? t('Uploading…') : t('Upload')}
            <input
              type="file"
              hidden
              accept={kind === 'image' ? 'image/*' : undefined}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError(null);
                try {
                  const uploaded = await env.media.upload(file);
                  setItems((list) => [uploaded, ...(list ?? [])]);
                  if (!multiple) onPick([uploaded]);
                } catch (err) {
                  setError(String(err instanceof Error ? err.message : err));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          <button type="button" className="fre-iconbtn" aria-label={t('Close')} onClick={onClose}>
            ×
          </button>
        </div>
        {error && <p className="fre-error">{error}</p>}
        <div className="fre-modal__grid">
          {items === null ? (
            <p>{t('Loading…')}</p>
          ) : items.length === 0 ? (
            <p>{t('No files.')}</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`fre-thumb${chosen.some((m) => m.id === item.id) ? ' is-on' : ''}`}
                title={item.alt ?? item.url}
                onClick={() => toggle(item)}
              >
                {item.mime.startsWith('image/') ? (
                  <img src={item.thumbnailUrl ?? item.url} alt="" />
                ) : (
                  <span>{item.url.split('/').pop()}</span>
                )}
              </button>
            ))
          )}
        </div>
        {multiple && (
          <div className="fre-modal__foot">
            <button
              type="button"
              className="fre-button fre-button--primary"
              disabled={chosen.length === 0}
              onClick={() => onPick(chosen)}
            >
              {t('Add {count} selected', { count: chosen.length || '' })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function IconInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fre-iconinput">
      <button
        type="button"
        className="fre-iconinput__preview"
        onClick={() => setOpen(true)}
        title={t('Choose an icon')}
      >
        {value ? <Icon value={value} /> : <span>{t('None')}</span>}
      </button>
      <button type="button" className="fre-button" onClick={() => setOpen(true)}>
        {t('Icon library')}
      </button>
      {value ? (
        <button type="button" className="fre-button" onClick={() => onChange(undefined)}>
          {t('Remove')}
        </button>
      ) : null}
      {open && (
        <IconPicker onClose={() => setOpen(false)} onPick={(v) => (onChange(v), setOpen(false))} />
      )}
    </div>
  );
}

function IconPicker({
  onPick,
  onClose,
}: {
  onPick: (v: { set: string; name: string; url?: string }) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [set, setSet] = useState('all');
  const all = useMemo(
    (): [string, string, string?][] => [
      ...extensions().iconSets.flatMap((group) =>
        group.icons.map((icon): [string, string, string] => [group.id, icon.name, icon.url]),
      ),
      ...(iconDataLoaded() ? iconNames() : []),
    ],
    [],
  );
  const shown = all
    .filter(
      ([s, name]) =>
        (set === 'all' || s === set) && (!search || name.includes(search.toLowerCase().trim())),
    )
    .slice(0, 400);
  return (
    <div
      className="fre-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('Icon library')}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="fre-modal__box">
        <div className="fre-modal__head">
          <strong>{t('Icon library')}</strong>
          <input
            className="fre-input"
            placeholder={t('Search icons')}
            value={search}
            autoFocus
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="fre-input"
            value={set}
            onChange={(e) => setSet(e.target.value)}
            aria-label={t('Icon set')}
          >
            <option value="all">{t('All')}</option>
            {extensions().iconSets.map((group) => (
              <option key={group.id} value={group.id}>
                {group.label}
              </option>
            ))}
            <option value="solid">{t('Solid')}</option>
            <option value="regular">{t('Regular')}</option>
            <option value="brands">{t('Brands')}</option>
          </select>
          <button type="button" className="fre-iconbtn" aria-label={t('Close')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="fre-modal__grid fre-modal__grid--icons">
          {shown.map(([s, name, url]) => (
            <button
              key={`${s}:${name}`}
              type="button"
              className="fre-thumb fre-thumb--icon"
              title={`${name} (${s})`}
              onClick={() => onPick(url ? { set: s, name, url } : { set: s, name })}
            >
              <Icon value={url ? { set: s, name, url } : { set: s, name }} />
              <span>{name}</span>
            </button>
          ))}
        </div>
        <p className="fre-help">{t('Icons: Font Awesome Free (CC BY 4.0).')}</p>
      </div>
    </div>
  );
}

function FontSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <select
      className="fre-input"
      value={value}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{t('Default')}</option>
      <optgroup label={t('Global fonts')}>
        {['primary', 'secondary', 'text', 'accent'].map((id) => (
          <option key={id} value={`var(--fr-t-${id}-family)`}>
            {t(id[0]!.toUpperCase() + id.slice(1))}
          </option>
        ))}
      </optgroup>
      {extensions().customFonts.length > 0 && (
        <optgroup label={t('Custom fonts')}>
          {extensions().customFonts.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label={t('System')}>
        {SYSTEM_FONTS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </optgroup>
      <optgroup label="Google Fonts">
        {[...GOOGLE_FONTS].sort().map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

// ---- Repeater ---------------------------------------------------------------------------------

function Repeater({ control, env }: { control: Control; env: ControlEnv }) {
  const items = (
    Array.isArray(env.settings[control.name]) ? env.settings[control.name] : []
  ) as Settings[];
  const [open, setOpen] = useState<number | null>(null);
  const write = (next: Settings[]) => env.set({ [control.name]: next }, control.name);
  return (
    <div className="fre-control">
      <div className="fre-control__head">
        <span className="fre-control__label">{t(control.label)}</span>
      </div>
      <div className="fre-repeater">
        {items.map((item, index) => (
          <div key={String(item._id ?? index)} className="fre-repeater__item">
            <div className="fre-repeater__head">
              <button
                type="button"
                className="fre-repeater__title"
                onClick={() => setOpen(open === index ? null : index)}
              >
                {String(item[control.itemTitle ?? ''] ?? '') || t('Item {n}', { n: index + 1 })}
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title={t('Move up')}
                disabled={index === 0}
                onClick={() => {
                  const next = [...items];
                  [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                  write(next);
                }}
              >
                <Svg path="M12 19V5 M6 11l6-6 6 6" size={12} />
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title={t('Duplicate')}
                onClick={() => {
                  const next = [...items];
                  next.splice(index + 1, 0, {
                    ...structuredClone(item),
                    _id: Math.random().toString(36).slice(2, 9),
                  });
                  write(next);
                }}
              >
                <Svg path="M8 8h12v12H8z M4 16V4h12" size={12} />
              </button>
              <button
                type="button"
                className="fre-iconbtn"
                title={t('Remove')}
                onClick={() => write(items.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
            {open === index && (
              <div className="fre-repeater__body">
                {(control.fields ?? [])
                  .filter((field) => conditionMet(field, { ...fieldDefaults(control), ...item }))
                  .map((field) => (
                    <ControlField
                      key={field.name}
                      control={{ ...field, responsive: false, hover: false }}
                      env={{
                        ...env,
                        attrs: item,
                        settings: { ...fieldDefaults(control), ...item },
                        set: (changes) => {
                          const next = [...items];
                          const updated = { ...item };
                          for (const [k, v] of Object.entries(changes)) {
                            if (v === undefined || v === '') delete updated[k];
                            else updated[k] = v;
                          }
                          next[index] = updated;
                          write(next);
                        },
                      }}
                    />
                  ))}
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          className="fre-button"
          onClick={() => {
            const fresh: Settings = { _id: Math.random().toString(36).slice(2, 9) };
            for (const f of control.fields ?? [])
              if (f.default !== undefined) fresh[f.name] = structuredClone(f.default);
            write([...items, fresh]);
            setOpen(items.length);
          }}
        >
          {t('+ Add item')}
        </button>
      </div>
    </div>
  );
}

// ---- Groups -----------------------------------------------------------------------------------

const WEIGHTS = ['', '100', '200', '300', '400', '500', '600', '700', '800', '900'].map((w) => ({
  value: w,
  label: w || 'Default',
}));

function groupFields(control: GroupControl): Control[] {
  const n = control.name;
  const base = { tab: control.tab, section: control.section } as const;
  const f = (
    name: string,
    type: Control['type'],
    label: string,
    extra: Partial<Control> = {},
  ): Control => ({ ...base, name: `${n}_${name}`, type, label, ...extra });
  switch (control.type) {
    case 'typography':
      return [
        f('family', 'font', 'Family'),
        f('size', 'slider', 'Size', {
          responsive: true,
          units: ['px', 'em', 'rem', 'vw'],
          max: 200,
        }),
        f('weight', 'select', 'Weight', { options: WEIGHTS }),
        f('transform', 'select', 'Transform', {
          options: ['', 'uppercase', 'lowercase', 'capitalize', 'none'].map((v) => ({
            value: v,
            label: v || 'Default',
          })),
        }),
        f('style', 'select', 'Style', {
          options: ['', 'normal', 'italic', 'oblique'].map((v) => ({
            value: v,
            label: v || 'Default',
          })),
        }),
        f('decoration', 'select', 'Decoration', {
          options: ['', 'underline', 'overline', 'line-through', 'none'].map((v) => ({
            value: v,
            label: v || 'Default',
          })),
        }),
        f('line', 'slider', 'Line height', {
          responsive: true,
          units: ['', 'px', 'em'],
          max: 3,
          step: 0.1,
        }),
        f('letter', 'slider', 'Letter spacing', {
          responsive: true,
          units: ['px', 'em'],
          min: -5,
          max: 10,
          step: 0.1,
        }),
        f('word', 'slider', 'Word spacing', { responsive: true, units: ['px', 'em'], max: 50 }),
      ];
    case 'background':
      return [
        f('type', 'choose', 'Type', {
          options: [
            { value: 'classic', label: 'Classic', icon: 'M4 4h16v16H4z' },
            { value: 'gradient', label: 'Gradient', icon: 'M4 4h16v16H4z M4 20L20 4' },
          ],
        }),
        f('color', 'color', 'Color', {
          condition: { [`${n}_type`]: ['classic', 'gradient'] },
          responsive: true,
        }),
        f('image', 'media', 'Image', { condition: { [`${n}_type`]: 'classic' }, responsive: true }),
        f('position', 'select', 'Position', {
          responsive: true,
          condition: { [`${n}_type`]: 'classic' },
          options: [
            '',
            'center center',
            'center top',
            'center bottom',
            'left top',
            'right top',
            'left center',
            'right center',
          ].map((v) => ({ value: v, label: v || 'Default' })),
        }),
        f('repeat', 'select', 'Repeat', {
          responsive: true,
          condition: { [`${n}_type`]: 'classic' },
          options: ['', 'no-repeat', 'repeat', 'repeat-x', 'repeat-y'].map((v) => ({
            value: v,
            label: v || 'Default',
          })),
        }),
        f('size', 'select', 'Display size', {
          responsive: true,
          condition: { [`${n}_type`]: 'classic' },
          options: ['', 'auto', 'cover', 'contain'].map((v) => ({
            value: v,
            label: v || 'Default',
          })),
        }),
        f('attachment', 'select', 'Attachment', {
          condition: { [`${n}_type`]: 'classic' },
          options: ['', 'scroll', 'fixed'].map((v) => ({ value: v, label: v || 'Default' })),
        }),
        f('color_b', 'color', 'Second color', { condition: { [`${n}_type`]: 'gradient' } }),
        f('stop', 'slider', 'Location', { units: ['%'], condition: { [`${n}_type`]: 'gradient' } }),
        f('stop_b', 'slider', 'Second location', {
          units: ['%'],
          condition: { [`${n}_type`]: 'gradient' },
        }),
        f('gradient', 'select', 'Gradient type', {
          condition: { [`${n}_type`]: 'gradient' },
          options: [
            { value: 'linear', label: 'Linear' },
            { value: 'radial', label: 'Radial' },
          ],
        }),
        f('angle', 'slider', 'Angle', {
          units: ['deg'],
          max: 360,
          condition: { [`${n}_type`]: 'gradient' },
        }),
      ];
    case 'border':
      return [
        f('style', 'select', 'Border type', {
          options: ['', 'none', 'solid', 'double', 'dotted', 'dashed', 'groove'].map((v) => ({
            value: v,
            label: v || 'Default',
          })),
        }),
        f('width', 'box', 'Width', {
          responsive: true,
          units: ['px', 'em'],
          condition: { [`${n}_style`]: ['solid', 'double', 'dotted', 'dashed', 'groove'] },
        }),
        f('color', 'color', 'Color', {
          condition: { [`${n}_style`]: ['solid', 'double', 'dotted', 'dashed', 'groove'] },
        }),
        f('radius', 'box', 'Radius', { responsive: true, units: ['px', '%', 'em'] }),
      ];
    case 'filters':
      return [
        f('blur', 'slider', 'Blur', { units: ['px'], max: 10, step: 0.1 }),
        f('brightness', 'slider', 'Brightness', { units: ['%'], max: 200 }),
        f('contrast', 'slider', 'Contrast', { units: ['%'], max: 200 }),
        f('saturate', 'slider', 'Saturation', { units: ['%'], max: 200 }),
        f('hue', 'slider', 'Hue', { units: ['deg'], max: 360 }),
      ];
    default:
      return [];
  }
}

/** Choices from option sources, loaded when shown and again after a few seconds. */
const sourceCache = new Map<string, { options: ControlOption[]; at: number }>();
const sourceListeners = new Set<() => void>();
function sourceOptions(name: string): ControlOption[] {
  const cached = sourceCache.get(name);
  if (cached && Date.now() - cached.at < 10_000) return cached.options;
  const load = extensions().optionSources[name];
  sourceCache.set(name, { options: cached?.options ?? [], at: Date.now() });
  load?.()
    .then((options) => {
      sourceCache.set(name, { options, at: Date.now() });
      for (const listener of sourceListeners) listener();
    })
    .catch(() => sourceCache.delete(name));
  return cached?.options ?? [];
}
/** Re-renders a control when its source has loaded. */
export function useOptionSources(): void {
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    sourceListeners.add(listener);
    return () => {
      sourceListeners.delete(listener);
    };
  }, []);
}

/** Defaults of a repeater's fields, for an item that has not set them. */
function fieldDefaults(control: Control): Settings {
  return Object.fromEntries(
    (control.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.name, f.default]),
  );
}

function conditionMet(control: Control, settings: Settings): boolean {
  if (!control.condition) return true;
  return Object.entries(control.condition).every(([key, expected]) => {
    const actual = settings[key];
    return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
  });
}

function Group({ control, env }: { control: GroupControl; env: ControlEnv }) {
  const [open, setOpen] = useState<'edit' | 'global' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(null), []);
  useClickAway(ref, open !== null, close);
  const n = control.name;
  const used = Object.keys(env.attrs).some((k) => k === n || k.startsWith(`${n}_`));
  if (control.type === 'shadow' || control.type === 'textShadow') {
    return <ShadowControl control={control} env={env} />;
  }
  const typography = control.type === 'typography';
  const global = typography ? env.attrs[`${n}_global`] : undefined;
  const globalFont = typeof global === 'string' ? env.kit.fonts.find((f) => f.id === global) : null;
  return (
    <div ref={ref} className={`fre-control fre-group${open ? ' is-open' : ''}`}>
      <div className="fre-control__head">
        <span className="fre-control__label">
          {t(control.label)}
          {globalFont && <em className="fre-globaltag">{globalFont.title}</em>}
        </span>
        {used && (
          <button
            type="button"
            className="fre-reset"
            title={t('Reset')}
            aria-label={t('Reset {control}', { control: t(control.label) })}
            onClick={() =>
              env.set(
                Object.fromEntries(
                  Object.keys(env.attrs)
                    .filter((k) => k === n || k.startsWith(`${n}_`))
                    .map((k) => [k, undefined]),
                ),
              )
            }
          >
            <Svg path="M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4" size={12} />
          </button>
        )}
        {typography && (
          <button
            type="button"
            className={`fre-toggle${open === 'global' ? ' is-on' : ''}${globalFont ? ' is-used' : ''}`}
            aria-expanded={open === 'global'}
            title={t('Global fonts')}
            aria-label={t('Global fonts')}
            onClick={() => setOpen(open === 'global' ? null : 'global')}
          >
            <Svg path={GLOBE} size={13} />
          </button>
        )}
        <button
          type="button"
          className={`fre-toggle${open === 'edit' ? ' is-on' : ''}${used ? ' is-used' : ''}`}
          aria-expanded={open === 'edit'}
          title={t('Edit {control}', { control: t(control.label) })}
          aria-label={t('Edit {control}', { control: t(control.label) })}
          onClick={() => setOpen(open === 'edit' ? null : 'edit')}
        >
          <Svg path="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" size={13} />
        </button>
      </div>
      {open === 'global' && (
        <div className="fre-popup fre-popup--globals" role="listbox" aria-label={t('Global fonts')}>
          <p className="fre-popup__title">{t('Global fonts')}</p>
          {env.kit.fonts.map((font) => (
            <button
              key={font.id}
              type="button"
              role="option"
              aria-selected={global === font.id}
              className={`fre-popup__font${global === font.id ? ' is-on' : ''}`}
              style={{
                fontFamily: font.family || undefined,
                fontWeight: font.weight || undefined,
              }}
              onClick={() => {
                env.set({ [`${n}_global`]: global === font.id ? undefined : font.id });
                setOpen(null);
              }}
            >
              <span>{font.title}</span>
              <small>
                {[font.family, font.weight, font.size ? `${font.size}px` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            </button>
          ))}
        </div>
      )}
      {open === 'edit' && (
        <div className="fre-popup">
          {groupFields(control)
            .filter((field) => conditionMet(field, env.settings))
            .map((field) => (
              <ControlField key={field.name} control={field} env={env} />
            ))}
        </div>
      )}
    </div>
  );
}

const GLOBE =
  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18';

function ShadowControl({ control, env }: { control: GroupControl; env: ControlEnv }) {
  const { key, value } = valueOf({ ...control, responsive: false }, env);
  const shadow = (value && typeof value === 'object' ? value : null) as {
    x?: number;
    y?: number;
    blur?: number;
    spread?: number;
    color?: string;
    inset?: boolean;
  } | null;
  const set = (patch: Partial<NonNullable<typeof shadow>>) =>
    env.set(
      { [key]: { x: 0, y: 4, blur: 10, spread: 0, color: 'rgba(0,0,0,0.2)', ...shadow, ...patch } },
      key,
    );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickAway(ref, open, close);
  const fields: [keyof NonNullable<typeof shadow>, string, number, number][] =
    control.type === 'shadow'
      ? [
          ['x', 'Horizontal', -100, 100],
          ['y', 'Vertical', -100, 100],
          ['blur', 'Blur', 0, 100],
          ['spread', 'Spread', -100, 100],
        ]
      : [
          ['x', 'Horizontal', -100, 100],
          ['y', 'Vertical', -100, 100],
          ['blur', 'Blur', 0, 100],
        ];
  return (
    <div ref={ref} className={`fre-control fre-group${open ? ' is-open' : ''}`}>
      <div className="fre-control__head">
        <span className="fre-control__label">{t(control.label)}</span>
        {shadow && (
          <button
            type="button"
            className="fre-reset"
            title={t('Reset')}
            onClick={() => env.set({ [key]: undefined })}
          >
            <Svg path="M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4" size={12} />
          </button>
        )}
        <button
          type="button"
          className={`fre-toggle${open ? ' is-on' : ''}${shadow ? ' is-used' : ''}`}
          aria-expanded={open}
          title={t('Edit {control}', { control: t(control.label) })}
          aria-label={t('Edit {control}', { control: t(control.label) })}
          onClick={() => setOpen((o) => !o)}
        >
          <Svg path="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" size={13} />
        </button>
      </div>
      {open && (
        <div className="fre-popup">
          <div className="fre-control fre-control--inline">
            <div className="fre-control__head">
              <span className="fre-control__label">{t('Color')}</span>
            </div>
            <div className="fre-control__body">
              <ColorPicker
                value={shadow?.color ?? ''}
                kit={env.kit}
                onChange={(v) => set({ color: v ?? 'rgba(0,0,0,0.2)' })}
              />
            </div>
          </div>
          {fields.map(([field, label, min, max]) => (
            <div key={field} className="fre-control">
              <div className="fre-control__head">
                <span className="fre-control__label">{t(label)}</span>
              </div>
              <div className="fre-slider">
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={Number(shadow?.[field] ?? 0)}
                  onChange={(e) => set({ [field]: Number(e.target.value) })}
                />
                <input
                  className="fre-input fre-input--number"
                  type="number"
                  value={Number(shadow?.[field] ?? 0)}
                  onChange={(e) => set({ [field]: Number(e.target.value) })}
                />
              </div>
            </div>
          ))}
          {control.type === 'shadow' && (
            <label className="fre-checks">
              <input
                type="checkbox"
                checked={shadow?.inset === true}
                onChange={(e) => set({ inset: e.target.checked })}
              />
              {t('Inset')}
            </label>
          )}
        </div>
      )}
    </div>
  );
}
