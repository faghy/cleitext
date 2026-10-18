import { InspectorControls } from '@wordpress/block-editor';
import {
  BaseControl,
  Button,
  PanelBody,
  RangeControl,
  SelectControl,
  TextControl,
  ToggleControl,
  __experimentalToggleGroupControl as ToggleGroupControl,
  __experimentalToggleGroupControlOption as ToggleGroupControlOption,
} from '@wordpress/components';
import { brush, cog, link, linkOff, settings } from '@wordpress/icons';
import { useState, type ReactNode } from 'react';
import { value, type Bind, type DeviceKeys } from './bind';
import { DeviceSwitch, useDevice } from './device';
import { ExtensionPanels } from './extensions';

// ---- Tabs and panels -------------------------------------------------------------------

type TabName = 'general' | 'style' | 'advanced';
/** The tab last opened, kept while editing (as Spectra does). */
let lastTab: TabName = 'general';

const TABS: { name: TabName; title: string; icon: typeof cog }[] = [
  { name: 'general', title: 'General', icon: cog },
  { name: 'style', title: 'Style', icon: brush },
  { name: 'advanced', title: 'Advanced', icon: settings },
];

/** The block's settings in three tabs: General, Style, Advanced. */
export function InspectorTabs(props: {
  general?: ReactNode;
  style?: ReactNode;
  advanced?: ReactNode;
}) {
  const [tab, setTab] = useState<TabName>(lastTab);
  const choose = (name: TabName) => {
    lastTab = name;
    setTab(name);
  };
  return (
    <InspectorControls>
      <div className="pr-tabs" role="tablist" aria-label="Block settings">
        {TABS.map((t) => (
          <Button
            key={t.name}
            role="tab"
            aria-selected={tab === t.name}
            className={`pr-tabs__tab${tab === t.name ? ' is-active' : ''}`}
            icon={t.icon}
            onClick={() => choose(t.name)}
          >
            {t.title}
          </Button>
        ))}
      </div>
      <div className="pr-tabs__panel" role="tabpanel">
        {props[tab]}
        {tab === 'advanced' && <ExtensionPanels />}
      </div>
    </InspectorControls>
  );
}

/** A folding section of a tab. */
export function Panel({
  title,
  initialOpen = false,
  children,
}: {
  title: string;
  initialOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <PanelBody title={title} initialOpen={initialOpen} className="pr-panel">
      {children}
    </PanelBody>
  );
}

/** A control's label, with the device switch when the value depends on the device. */
export function Label({ label, responsive }: { label: string; responsive?: boolean }) {
  return (
    <span className="pr-label">
      <span>{label}</span>
      {responsive && <DeviceSwitch />}
    </span>
  );
}

// ---- Simple fields ----------------------------------------------------------------------

export function Toggle({
  bind,
  name,
  label,
  help,
}: {
  bind: Bind;
  name: string;
  label: string;
  help?: string;
}) {
  return (
    <ToggleControl
      __nextHasNoMarginBottom
      label={label}
      help={help}
      checked={Boolean(value(bind, name))}
      onChange={(checked: boolean) => bind.setAttributes({ [name]: checked })}
    />
  );
}

export function Text({
  bind,
  name,
  label,
  help,
  placeholder,
}: {
  bind: Bind;
  name: string;
  label: string;
  help?: string;
  placeholder?: string;
}) {
  return (
    <TextControl
      __nextHasNoMarginBottom
      __next40pxDefaultSize
      label={label}
      help={help}
      placeholder={placeholder}
      value={String(value(bind, name) ?? '')}
      onChange={(text: string) => bind.setAttributes({ [name]: text })}
    />
  );
}

export interface Option {
  value: string;
  label: string;
}

/** A select, by device when `keys` is given. */
export function Select({
  bind,
  name,
  keys,
  label,
  options,
}: {
  bind: Bind;
  name?: string;
  keys?: DeviceKeys;
  label: string;
  options: Option[];
}) {
  const [device] = useDevice();
  const key = keys ? keys(device) : name!;
  return (
    <SelectControl
      __nextHasNoMarginBottom
      __next40pxDefaultSize
      label={<Label label={label} responsive={Boolean(keys)} />}
      value={String(value(bind, key) ?? '')}
      options={
        keys && device !== 'desktop' ? [{ value: '', label: 'Default' }, ...options] : options
      }
      onChange={(v: string) => bind.setAttributes({ [key]: v })}
    />
  );
}

/** Buttons for a few choices (alignment, layout…), by device when `keys` is given. */
export function Choice({
  bind,
  name,
  keys,
  label,
  options,
}: {
  bind: Bind;
  name?: string;
  keys?: DeviceKeys;
  label: string;
  options: Option[];
}) {
  const [device] = useDevice();
  const key = keys ? keys(device) : name!;
  const current = String(value(bind, key) ?? '');
  return (
    <BaseControl __nextHasNoMarginBottom className="pr-choice">
      <Label label={label} responsive={Boolean(keys)} />
      <ToggleGroupControl
        __nextHasNoMarginBottom
        __next40pxDefaultSize
        isBlock
        label={label}
        hideLabelFromVision
        value={current}
        // Choosing the current one again clears a tablet or mobile value.
        onChange={(v: string | number | undefined) =>
          bind.setAttributes({
            [key]: v === current && device !== 'desktop' ? '' : String(v ?? ''),
          })
        }
      >
        {options.map((o) => (
          <ToggleGroupControlOption key={o.value} value={o.value} label={o.label} />
        ))}
      </ToggleGroupControl>
    </BaseControl>
  );
}

// ---- Numbers with units -------------------------------------------------------------------

/** Unit buttons (px, %, em…). */
function Units({
  units,
  current,
  onChange,
}: {
  units: string[];
  current: string;
  onChange: (u: string) => void;
}) {
  if (units.length < 2) return null;
  return (
    <span className="pr-units" role="group" aria-label="Unit">
      {units.map((u) => (
        <Button
          key={u}
          size="small"
          isPressed={u === current}
          onClick={() => onChange(u)}
          className="pr-units__unit"
        >
          {u}
        </Button>
      ))}
    </span>
  );
}

const MAX_BY_UNIT: Record<string, number> = {
  px: 1600,
  '%': 100,
  em: 50,
  rem: 50,
  vw: 100,
  vh: 100,
};

/**
 * A slider with a number field and units: Spectra's range setting. With
 * `keys`, one value per device (the preview device decides which).
 */
export function Range({
  bind,
  label,
  name,
  keys,
  unitName,
  unitKeys,
  units = ['px'],
  min = 0,
  max,
  step = 1,
  help,
}: {
  bind: Bind;
  label: string;
  name?: string;
  keys?: DeviceKeys;
  unitName?: string;
  unitKeys?: DeviceKeys;
  units?: string[];
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}) {
  const [device] = useDevice();
  const key = keys ? keys(device) : name!;
  const unitKey = unitKeys ? unitKeys(device) : unitName;
  const unit = String((unitKey && value(bind, unitKey)) || units[0]);
  const raw = value(bind, key);
  const number = raw === '' || raw === undefined || raw === null ? undefined : Number(raw);
  return (
    <BaseControl __nextHasNoMarginBottom help={help} className="pr-range">
      <div className="pr-range__head">
        <Label label={label} responsive={Boolean(keys)} />
        {unitKey && (
          <Units
            units={units}
            current={unit}
            onChange={(u) => bind.setAttributes({ [unitKey]: u })}
          />
        )}
      </div>
      <RangeControl
        __nextHasNoMarginBottom
        __next40pxDefaultSize
        label={label}
        hideLabelFromVision
        value={Number.isFinite(number) ? number : undefined}
        min={min}
        max={max ?? MAX_BY_UNIT[unit] ?? 100}
        step={unit === 'em' || unit === 'rem' ? 0.1 : step}
        allowReset
        resetFallbackValue={undefined}
        onChange={(n?: number) => bind.setAttributes({ [key]: n === undefined ? '' : n })}
        withInputField
      />
    </BaseControl>
  );
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type Side = (typeof SIDES)[number];

/**
 * Four sides (padding, margin, border width, radius): Spectra's dimensions
 * setting, by device, with units and a link that changes them together.
 */
export function Spacing({
  bind,
  label,
  keys,
  unitKeys,
  linkName,
  units = ['px', '%', 'em'],
  sides = ['Top', 'Right', 'Bottom', 'Left'],
  min = -1000,
}: {
  bind: Bind;
  label: string;
  /** The attribute of a side on a device. */
  keys: (side: Side, device: 'desktop' | 'tablet' | 'mobile') => string;
  unitKeys?: DeviceKeys;
  linkName?: string;
  units?: string[];
  sides?: [string, string, string, string];
  min?: number;
}) {
  const [device] = useDevice();
  const unitKey = unitKeys?.(device);
  const unit = String((unitKey && value(bind, unitKey)) || units[0]);
  const linked = linkName ? Boolean(value(bind, linkName)) : false;
  const set = (side: Side, raw: string) => {
    const v = raw === '' ? '' : Number(raw);
    if (linked) bind.setAttributes(Object.fromEntries(SIDES.map((s) => [keys(s, device), v])));
    else bind.setAttributes({ [keys(side, device)]: v });
  };
  return (
    <BaseControl __nextHasNoMarginBottom className="pr-spacing">
      <div className="pr-range__head">
        <Label label={label} responsive />
        {unitKey && (
          <Units
            units={units}
            current={unit}
            onChange={(u) => bind.setAttributes({ [unitKey]: u })}
          />
        )}
      </div>
      <div className="pr-spacing__fields">
        {SIDES.map((side, i) => {
          const v = value(bind, keys(side, device));
          return (
            <label key={side} className="pr-spacing__side">
              <input
                type="number"
                min={min}
                value={v === '' || v === undefined || v === null ? '' : String(v)}
                onChange={(e) => set(side, e.target.value)}
                aria-label={`${label} ${sides[i]}`}
              />
              <span>{sides[i]}</span>
            </label>
          );
        })}
        {linkName && (
          <Button
            size="small"
            icon={linked ? link : linkOff}
            label={linked ? 'Unlink sides' : 'Link sides'}
            isPressed={linked}
            onClick={() => bind.setAttributes({ [linkName]: !linked })}
          />
        )}
      </div>
    </BaseControl>
  );
}
