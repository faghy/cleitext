import { TextControl } from '@wordpress/components';
import { plain, value, type Bind } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color, States } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Text,
  Toggle,
} from '../../editor/controls/fields';
import { IconPicker } from '../../editor/controls/icon';
import { Media } from '../../editor/controls/media';
import { BoxShadow } from '../../editor/controls/shadow';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { Sides } from '../heading/settings.gutenberg';
import { renamed } from '../icon-list/settings.gutenberg';

/** A number typed in (any size, negatives allowed), or empty. */
export function NumberField({
  bind,
  name,
  label,
  help,
  min,
  step,
}: {
  bind: Bind;
  name: string;
  label: string;
  help?: string;
  min?: number;
  step?: number;
}) {
  const current = value(bind, name);
  return (
    <TextControl
      __nextHasNoMarginBottom
      __next40pxDefaultSize
      type="number"
      label={label}
      help={help}
      {...(min !== undefined ? { min } : {})}
      {...(step !== undefined ? { step } : {})}
      value={current === undefined || current === null ? '' : String(current)}
      onChange={(text: string) =>
        bind.setAttributes({
          [name]: text === '' || Number.isNaN(Number(text)) ? '' : Number(text),
        })
      }
    />
  );
}

/**
 * Typography of a part whose sizes have one unit for every device
 * (`headingFontSize`, `headingFontSizeType`): the shared control asks for
 * a unit by device, given here the single one.
 */
export function OneUnitTypography({
  bind,
  prefix,
  names = ['FontSize', 'LineHeight', 'LetterSpacing'],
}: {
  bind: Bind;
  prefix: string;
  names?: string[];
}) {
  const map: Record<string, string> = {};
  for (const name of names) {
    for (const s of ['Tablet', 'Mobile']) map[`${prefix}${name}Type${s}`] = `${prefix}${name}Type`;
  }
  return <Typography bind={renamed(bind, map)} prefix={prefix} />;
}

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export const CounterSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const layout = String(a.layout);
  const showIcon = Boolean(a.showIcon);
  const image = a.sourceType === 'image';
  const positive = layout !== 'number' ? 'Use positive values for the circle and bar layouts.' : '';
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="General" initialOpen>
            <Choice
              bind={bind}
              name="layout"
              label="Layout"
              options={[
                { value: 'number', label: 'Number' },
                { value: 'circle', label: 'Circle' },
                { value: 'bars', label: 'Bar' },
              ]}
            />
            <Choice bind={bind} keys={plain('align')} label="Alignment" options={ALIGN} />
            {layout === 'bars' && (
              <Toggle bind={bind} name="barFlip" label="Flip title and bar positions" />
            )}
            <NumberField
              bind={bind}
              name="startNumber"
              label="Starting number"
              {...(positive ? { help: positive, min: 0 } : {})}
            />
            <NumberField
              bind={bind}
              name="endNumber"
              label="Ending number"
              {...(positive ? { help: positive, min: 0 } : {})}
            />
            {layout !== 'number' && (
              <NumberField
                bind={bind}
                name="totalNumber"
                label="Total number"
                help="At least the ending number (or the starting number, to count down)."
              />
            )}
            <Range bind={bind} label="Decimal places" name="decimalPlaces" max={10} />
            <Text bind={bind} name="numberPrefix" label="Number prefix" />
            <Text bind={bind} name="numberSuffix" label="Number suffix" />
            <NumberField
              bind={bind}
              name="animationDuration"
              label="Animation duration (ms)"
              min={1}
              step={100}
            />
            <Select
              bind={bind}
              name="thousandSeparator"
              label="Thousands"
              options={[
                { value: '', label: 'None' },
                { value: ',', label: 'Comma' },
                { value: '.', label: 'Dot' },
                { value: ' ', label: 'Whitespace' },
                { value: "'", label: 'Apostrophe' },
              ]}
            />
          </Panel>
          <Panel title="Icon or image">
            <Toggle bind={bind} name="showIcon" label="Icon or image" />
            {showIcon && (layout === 'circle' || layout === 'number') && (
              <Select
                bind={bind}
                name="iconImgPosition"
                label="Position"
                options={[
                  { value: 'top', label: 'Top' },
                  { value: 'bottom', label: 'Bottom' },
                  ...(layout === 'number'
                    ? [
                        { value: 'left-number', label: 'Left of the number' },
                        { value: 'right-number', label: 'Right of the number' },
                      ]
                    : []),
                ]}
              />
            )}
            {showIcon && (
              <Choice
                bind={bind}
                name="sourceType"
                label="Source"
                options={[
                  { value: 'icon', label: 'Icon' },
                  { value: 'image', label: 'Image' },
                ]}
              />
            )}
            {showIcon && !image && <IconPicker bind={bind} name="icon" />}
            {showIcon && image && <Media bind={bind} name="iconImage" label="Image" />}
          </Panel>
        </>
      }
      style={
        <>
          {showIcon && (
            <Panel title="Icon or image" initialOpen>
              {image ? (
                <>
                  <Toggle
                    bind={bind}
                    name="imageWidthType"
                    label="Custom width"
                    help="Turn it off to keep the image's own width."
                  />
                  {Boolean(a.imageWidthType) && (
                    <Range
                      bind={bind}
                      label="Image width"
                      keys={plain('imageWidth')}
                      unitKeys={plain('imageWidthUnit')}
                      units={['px', '%', 'em']}
                      max={500}
                    />
                  )}
                </>
              ) : (
                <>
                  <Range
                    bind={bind}
                    label="Width"
                    keys={plain('iconSize')}
                    unitKeys={plain('iconSizeType')}
                    units={['px', '%', 'em']}
                    max={500}
                  />
                  <States
                    normal={
                      <>
                        <Color bind={bind} name="iconColor" label="Color" />
                        <Color bind={bind} name="iconBackgroundColor" label="Background" />
                      </>
                    }
                    hover={
                      <>
                        <Color bind={bind} name="iconHoverColor" label="Color" />
                        <Color bind={bind} name="iconBackgroundHoverColor" label="Background" />
                      </>
                    }
                  />
                </>
              )}
              <Border bind={bind} prefix="iconWrap" />
              <Sides bind={bind} prefix="icon" kind="Padding" />
              <Sides bind={bind} prefix="icon" kind="Margin" />
            </Panel>
          )}
          <Panel title="Headline">
            <Color bind={bind} name="headingColor" label="Color" />
            <OneUnitTypography bind={bind} prefix="heading" />
            <Sides bind={bind} prefix="heading" kind="Margin" />
          </Panel>
          <Panel title="Number">
            <Color bind={bind} name="numberColor" label="Color" />
            <OneUnitTypography bind={bind} prefix="number" />
            <Sides
              bind={bind}
              prefix="number"
              kind="Margin"
              label={layout === 'bars' ? 'Padding' : 'Margin'}
            />
            <Range
              bind={bind}
              label="Prefix right margin"
              keys={plain('prefixRightDistance')}
              max={200}
            />
            <Range
              bind={bind}
              label="Suffix left margin"
              keys={plain('suffixLeftDistance')}
              max={200}
            />
          </Panel>
          {layout === 'circle' && (
            <Panel title="Circle">
              <Range bind={bind} label="Circle size" name="circleSize" max={1000} />
              <Range bind={bind} label="Stroke size" name="circleStokeSize" max={100} />
              <Color bind={bind} name="circleForeground" label="Progress color" />
              <Color bind={bind} name="circleBackground" label="Color" />
            </Panel>
          )}
          {layout === 'bars' && (
            <Panel title="Bar">
              <Range bind={bind} label="Bar size" name="barSize" max={200} />
              <Color bind={bind} name="barForeground" label="Progress color" />
              <Color bind={bind} name="barBackground" label="Color" />
              <BoxShadow bind={bind} />
            </Panel>
          )}
        </>
      }
      advanced={
        <Panel title="Spacing" initialOpen>
          <Sides bind={bind} prefix="block" kind="Margin" />
          <Sides bind={bind} prefix="block" kind="Padding" />
        </Panel>
      }
    />
  );
};
