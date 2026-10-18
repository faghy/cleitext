import { useSettings } from '@wordpress/block-editor';
import {
  BaseControl,
  Button,
  ColorIndicator,
  ColorPalette,
  Dropdown,
  GradientPicker,
} from '@wordpress/components';
import { useState, type ReactNode } from 'react';
import { value, type Bind } from './bind';

/** The theme's palette and gradients, as the block editor knows them. */
function usePalette(): {
  colors: { name: string; slug: string; color: string }[];
  gradients: { name: string; slug: string; gradient: string }[];
} {
  const [colors, gradients] = useSettings('color.palette', 'color.gradients') as [
    { name: string; slug: string; color: string }[] | undefined,
    { name: string; slug: string; gradient: string }[] | undefined,
  ];
  return { colors: colors ?? [], gradients: gradients ?? [] };
}

/** A color: a swatch that opens the palette and a picker (Spectra's color setting). */
export function Color({ bind, name, label }: { bind: Bind; name: string; label: string }) {
  const { colors } = usePalette();
  const current = String(value(bind, name) ?? '');
  return (
    <BaseControl __nextHasNoMarginBottom className="pr-color">
      <div className="pr-color__row">
        <span className="pr-label">{label}</span>
        <Dropdown
          popoverProps={{ placement: 'left-start', offset: 36 }}
          renderToggle={({ isOpen, onToggle }) => (
            <Button
              className="pr-color__toggle"
              onClick={onToggle}
              aria-expanded={isOpen}
              label={`${label}: ${current || 'none'}`}
            >
              <ColorIndicator colorValue={current || 'transparent'} />
            </Button>
          )}
          renderContent={() => (
            <div className="pr-color__popover">
              <ColorPalette
                colors={colors}
                value={current}
                enableAlpha
                onChange={(c?: string) => bind.setAttributes({ [name]: c ?? '' })}
              />
            </div>
          )}
        />
      </div>
    </BaseControl>
  );
}

/** Normal and hover states of the same settings (Spectra's Normal | Hover switch). */
export function States({
  normal,
  hover,
  labels = ['Normal', 'Hover'],
}: {
  normal: ReactNode;
  hover: ReactNode;
  labels?: [string, string];
}) {
  const [state, setState] = useState<'normal' | 'hover'>('normal');
  return (
    <div className="pr-states">
      <div className="pr-states__switch" role="group" aria-label="State">
        {(['normal', 'hover'] as const).map((s) => (
          <Button key={s} size="small" isPressed={state === s} onClick={() => setState(s)}>
            {s === 'normal' ? labels[0] : labels[1]}
          </Button>
        ))}
      </div>
      {state === 'normal' ? normal : hover}
    </div>
  );
}

/** A CSS gradient, from the theme's presets or custom. */
export function Gradient({ bind, name, label }: { bind: Bind; name: string; label: string }) {
  const { gradients } = usePalette();
  return (
    <BaseControl __nextHasNoMarginBottom label={label} className="pr-gradient">
      <GradientPicker
        value={String(value(bind, name) ?? '') || null}
        gradients={gradients}
        onChange={(g?: string) => bind.setAttributes({ [name]: g ?? '' })}
      />
    </BaseControl>
  );
}
