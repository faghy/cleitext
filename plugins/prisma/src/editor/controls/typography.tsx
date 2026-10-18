import { BaseControl, Button, Dropdown, SelectControl } from '@wordpress/components';
import { typography as typographyIcon } from '@wordpress/icons';
import { plain, value, type Bind } from './bind';
import { Range, Select } from './fields';

/** Fonts offered: the theme's, system stacks and the most used Google fonts. */
const FONTS = [
  { value: '', label: 'Default' },
  { value: 'inherit', label: 'Inherit' },
  { value: 'system-ui', label: 'System UI' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Verdana', label: 'Verdana' },
  ...[
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Poppins',
    'Raleway',
    'Oswald',
    'Playfair Display',
    'Merriweather',
    'Nunito',
    'Inter',
    'Source Sans 3',
    'PT Serif',
    'Lora',
    'Rubik',
    'Work Sans',
    'Josefin Sans',
    'Dancing Script',
    'Great Vibes',
    'Cormorant Garamond',
  ].map((f) => ({ value: f, label: f })),
];

const WEIGHTS = ['', '100', '200', '300', '400', '500', '600', '700', '800', '900'].map((w) => ({
  value: w,
  label: w || 'Default',
}));

/**
 * Typography of a part of a block (`<prefix>FontFamily`, `<prefix>FontSize`…,
 * Spectra's names): a button that opens family, weight, style, size, line
 * height, letter spacing, transform and decoration.
 */
export function Typography({
  bind,
  prefix,
  label = 'Typography',
}: {
  bind: Bind;
  prefix: string;
  label?: string;
}) {
  const k = (name: string) => `${prefix}${name}`;
  return (
    <BaseControl __nextHasNoMarginBottom className="pr-typography">
      <div className="pr-color__row">
        <span className="pr-label">{label}</span>
        <Dropdown
          popoverProps={{ placement: 'left-start', offset: 36 }}
          renderToggle={({ isOpen, onToggle }) => (
            <Button
              icon={typographyIcon}
              label={label}
              aria-expanded={isOpen}
              onClick={onToggle}
              size="small"
            />
          )}
          renderContent={() => (
            <div className="pr-typography__popover">
              <SelectControl
                __nextHasNoMarginBottom
                __next40pxDefaultSize
                label="Font family"
                value={String(value(bind, k('FontFamily')) ?? '')}
                options={FONTS}
                onChange={(family: string) =>
                  bind.setAttributes({
                    [k('FontFamily')]: family,
                    // Google fonts load on the site when chosen here.
                    [k('LoadGoogleFonts')]:
                      Boolean(family) && !FONTS.slice(0, 8).some((f) => f.value === family),
                  })
                }
              />
              <Select bind={bind} name={k('FontWeight')} label="Weight" options={WEIGHTS} />
              <Range
                bind={bind}
                label="Size"
                keys={plain(k('FontSize'))}
                unitKeys={plain(k('FontSizeType'))}
                units={['px', 'em', 'rem']}
                max={200}
              />
              <Range
                bind={bind}
                label="Line height"
                keys={plain(k('LineHeight'))}
                unitKeys={plain(k('LineHeightType'))}
                units={['em', 'px']}
                max={100}
              />
              <Range
                bind={bind}
                label="Letter spacing"
                keys={plain(k('LetterSpacing'))}
                unitKeys={plain(k('LetterSpacingType'))}
                units={['px', 'em']}
                min={-5}
                max={50}
              />
              <Select
                bind={bind}
                name={k('Transform')}
                label="Transform"
                options={[
                  { value: '', label: 'Default' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'capitalize', label: 'Capitalize' },
                  { value: 'uppercase', label: 'Uppercase' },
                  { value: 'lowercase', label: 'Lowercase' },
                ]}
              />
              <Select
                bind={bind}
                name={k('FontStyle')}
                label="Style"
                options={[
                  { value: '', label: 'Default' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'italic', label: 'Italic' },
                  { value: 'oblique', label: 'Oblique' },
                ]}
              />
              <Select
                bind={bind}
                name={k('Decoration')}
                label="Decoration"
                options={[
                  { value: '', label: 'Default' },
                  { value: 'none', label: 'None' },
                  { value: 'underline', label: 'Underline' },
                  { value: 'overline', label: 'Overline' },
                  { value: 'line-through', label: 'Line through' },
                ]}
              />
            </div>
          )}
        />
      </div>
    </BaseControl>
  );
}
