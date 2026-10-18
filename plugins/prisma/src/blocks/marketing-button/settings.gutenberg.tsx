import { plain, type Bind } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color, States } from '../../editor/controls/color';
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
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export const MarketingButtonSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const themed = Boolean(a.inheritFromTheme);
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Button" initialOpen>
            <Text bind={bind} name="link" label="Link" placeholder="https://" />
            <Toggle bind={bind} name="linkTarget" label="Open in a new tab" />
            <Toggle bind={bind} name="inheritFromTheme" label="Theme's button style" />
            <Choice
              bind={bind}
              name="align"
              label="Alignment"
              options={[...ALIGN, { value: 'full', label: 'Full' }]}
            />
            <Choice bind={bind} name="textAlign" label="Text alignment" options={ALIGN} />
          </Panel>
          <Panel title="Content">
            <Select
              bind={bind}
              name="titleTag"
              label="Heading tag"
              options={['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p'].map((t) => ({
                value: t,
                label: t.toUpperCase(),
              }))}
            />
            <Toggle bind={bind} name="showDescription" label="Description" />
          </Panel>
          <Panel title="Icon">
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
          </Panel>
        </>
      }
      style={
        <>
          {!themed && (
            <Panel title="Heading" initialOpen>
              <States
                normal={<Color bind={bind} name="titleColor" label="Color" />}
                hover={<Color bind={bind} name="titleHoverColor" label="Color" />}
              />
              <Typography bind={bind} prefix="title" />
            </Panel>
          )}
          {Boolean(a.showDescription) && (
            <Panel title="Description">
              {!themed && (
                <>
                  <States
                    normal={<Color bind={bind} name="prefixColor" label="Color" />}
                    hover={<Color bind={bind} name="prefixHoverColor" label="Color" />}
                  />
                  <Typography bind={bind} prefix="prefix" />
                </>
              )}
              <Range
                bind={bind}
                label="Space above"
                keys={plain('titleSpace')}
                unitName="titleSpaceUnit"
                units={['px']}
                max={100}
              />
            </Panel>
          )}
          {Boolean(a.icon) && (
            <Panel title="Icon">
              <Range
                bind={bind}
                label="Size"
                keys={plain('iconFontSize')}
                unitName="iconFontSizeType"
                units={['px', 'em']}
                max={200}
              />
              <Range bind={bind} label="Spacing" keys={plain('iconSpace')} max={100} />
              <States
                normal={<Color bind={bind} name="iconColor" label="Color" />}
                hover={<Color bind={bind} name="iconHoverColor" label="Color" />}
              />
            </Panel>
          )}
          {!themed && (
            <Panel title="Background">
              <Select
                bind={bind}
                name="backgroundType"
                label="Type"
                options={[
                  { value: 'transparent', label: 'Transparent' },
                  { value: 'color', label: 'Color' },
                  { value: 'gradient', label: 'Gradient' },
                ]}
              />
              {a.backgroundType === 'color' && (
                <States
                  normal={
                    <>
                      <Color bind={bind} name="backgroundColor" label="Color" />
                      <Range bind={bind} label="Opacity" name="backgroundOpacity" max={100} />
                    </>
                  }
                  hover={
                    <>
                      <Color bind={bind} name="backgroundHoverColor" label="Color" />
                      <Range bind={bind} label="Opacity" name="backgroundHoverOpacity" max={100} />
                    </>
                  }
                />
              )}
              {a.backgroundType === 'gradient' && (
                <>
                  <Color bind={bind} name="gradientColor1" label="Color 1" />
                  <Range
                    bind={bind}
                    label="Location 1"
                    keys={(d) =>
                      `gradientLocation${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}1`
                    }
                    units={['%']}
                  />
                  <Color bind={bind} name="gradientColor2" label="Color 2" />
                  <Range
                    bind={bind}
                    label="Location 2"
                    keys={(d) =>
                      `gradientLocation${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}2`
                    }
                    units={['%']}
                  />
                  <Choice
                    bind={bind}
                    name="gradientType"
                    label="Type"
                    options={[
                      { value: 'linear', label: 'Linear' },
                      { value: 'radial', label: 'Radial' },
                    ]}
                  />
                  {a.gradientType === 'linear' && (
                    <Range
                      bind={bind}
                      label="Angle"
                      keys={plain('gradientAngle')}
                      units={['deg']}
                      max={360}
                    />
                  )}
                  <Range bind={bind} label="Opacity" name="backgroundOpacity" max={100} />
                </>
              )}
            </Panel>
          )}
          {!themed && (
            <Panel title="Button">
              <Spacing
                bind={bind}
                label="Padding"
                keys={(s, d) =>
                  `paddingBtn${s[0]!.toUpperCase()}${s.slice(1)}${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`
                }
                unitKeys={(d) => (d === 'desktop' ? 'paddingBtnUnit' : `${d}PaddingBtnUnit`)}
                linkName="spacingLink"
              />
              <Border bind={bind} prefix="btn" />
            </Panel>
          )}
        </>
      }
    />
  );
};
