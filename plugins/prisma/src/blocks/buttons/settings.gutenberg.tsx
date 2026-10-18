import { plain, type Bind } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color, Gradient, States } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Spacing,
  Text,
  Toggle,
} from '../../editor/controls/fields';
import { IconPicker } from '../../editor/controls/icon';
import { BoxShadow } from '../../editor/controls/shadow';
import type { Inspector } from '../../editor/register';

const SIZES = [
  { value: 'default', label: 'Default' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'extralarge', label: 'Extra large' },
];

const dev = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile';
const S = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Padding with Spectra's button names (`topPadding`, `topTabletPadding`, `paddingUnit`, `tabletPaddingUnit`). */
function ButtonPadding({ bind }: { bind: Bind }) {
  return (
    <Spacing
      bind={bind}
      label="Padding"
      keys={(side, d) => (d === 'desktop' ? `${side}Padding` : `${side}${dev(d)}Padding`)}
      unitKeys={(d) => (d === 'desktop' ? 'paddingUnit' : `${d}PaddingUnit`)}
    />
  );
}

function ButtonMargin({ bind }: { bind: Bind }) {
  return (
    <Spacing
      bind={bind}
      label="Margin"
      keys={(side, d) => `${side}Margin${dev(d)}`}
      unitKeys={() => 'marginType'}
    />
  );
}

export const ButtonsSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  return (
    <InspectorTabs
      general={
        <Panel title="Buttons" initialOpen>
          <Choice
            bind={bind}
            keys={plain('align')}
            label="Alignment"
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
              { value: 'full', label: 'Full' },
            ]}
          />
          <Choice
            bind={bind}
            name="verticalAlignment"
            label="Vertical alignment"
            options={[
              { value: 'top', label: 'Top' },
              { value: 'center', label: 'Center' },
              { value: 'bottom', label: 'Bottom' },
            ]}
          />
          <Select
            bind={bind}
            name="stack"
            label="Stack on"
            options={[
              { value: 'none', label: 'None' },
              { value: 'desktop', label: 'Desktop' },
              { value: 'tablet', label: 'Tablet' },
              { value: 'mobile', label: 'Mobile' },
            ]}
          />
          <Range bind={bind} label="Gap" keys={plain('gap')} max={100} />
          <Toggle bind={bind} name="flexWrap" label="Wrap" />
          <Select bind={bind} keys={plain('buttonSize')} label="Size" options={SIZES} />
        </Panel>
      }
      style={
        <Panel title="Text" initialOpen>
          <ButtonPadding bind={bind} />
        </Panel>
      }
      advanced={
        <Panel title="Spacing" initialOpen>
          <ButtonMargin bind={bind} />
        </Panel>
      }
    />
  );
};

export const ButtonSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const bg = (type: string, color: string, gradient: string, label: string) => (
    <>
      <Choice
        bind={bind}
        name={type}
        label={label}
        options={[
          { value: 'transparent', label: 'None' },
          { value: 'color', label: 'Color' },
          { value: 'gradient', label: 'Gradient' },
        ]}
      />
      {a[type] === 'color' && <Color bind={bind} name={color} label="Color" />}
      {a[type] === 'gradient' && <Gradient bind={bind} name={gradient} label="Gradient" />}
    </>
  );
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Link" initialOpen>
            <Text bind={bind} name="link" label="Link" placeholder="https://" />
            <Toggle bind={bind} name="opensInNewTab" label="Open in a new tab" />
            <Toggle bind={bind} name="noFollow" label="Add nofollow" />
          </Panel>
          <Panel title="Icon">
            <Toggle bind={bind} name="showIcon" label="Icon" />
            {Boolean(a.showIcon) && (
              <>
                <IconPicker bind={bind} name="icon" />
                <Choice
                  bind={bind}
                  name="iconPosition"
                  label="Position"
                  options={[
                    { value: 'before', label: 'Before' },
                    { value: 'after', label: 'After' },
                  ]}
                />
                <Toggle bind={bind} name="removeText" label="Icon only" />
              </>
            )}
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Button" initialOpen>
            <States
              normal={
                <>
                  <Color bind={bind} name="color" label="Text" />
                  {bg('backgroundType', 'background', 'gradientValue', 'Background')}
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="hColor" label="Text" />
                  {bg('hoverbackgroundType', 'hBackground', 'hovergradientValue', 'Background')}
                </>
              }
            />
            <ButtonPadding bind={bind} />
          </Panel>
          <Panel title="Text">
            <Select
              bind={bind}
              name="fontWeight"
              label="Weight"
              options={['', '300', '400', '500', '600', '700', '800'].map((w) => ({
                value: w,
                label: w || 'Default',
              }))}
            />
            <Range
              bind={bind}
              label="Size"
              keys={plain('size')}
              unitName="sizeType"
              units={['px', 'em', 'rem']}
              max={100}
            />
            <Range
              bind={bind}
              label="Line height"
              keys={plain('lineHeight')}
              unitName="lineHeightType"
              units={['em', 'px']}
              max={10}
            />
            <Range
              bind={bind}
              label="Letter spacing"
              keys={plain('letterSpacing')}
              unitName="letterSpacingType"
              units={['px', 'em']}
              min={-5}
              max={20}
            />
            <Select
              bind={bind}
              name="transform"
              label="Transform"
              options={['', 'none', 'capitalize', 'uppercase', 'lowercase'].map((v) => ({
                value: v,
                label: v ? S(v) : 'Default',
              }))}
            />
          </Panel>
          {Boolean(a.showIcon) && (
            <Panel title="Icon">
              <Range bind={bind} label="Size" keys={plain('iconSize')} max={100} />
              <Range bind={bind} label="Spacing" keys={plain('iconSpace')} max={100} />
              <States
                normal={<Color bind={bind} name="iconColor" label="Color" />}
                hover={<Color bind={bind} name="iconHColor" label="Color" />}
              />
            </Panel>
          )}
          <Panel title="Border">
            <Border bind={bind} prefix="btn" />
          </Panel>
          <Panel title="Box shadow">
            <BoxShadow bind={bind} />
          </Panel>
        </>
      }
      advanced={
        <Panel title="Spacing" initialOpen>
          <ButtonMargin bind={bind} />
        </Panel>
      }
    />
  );
};
