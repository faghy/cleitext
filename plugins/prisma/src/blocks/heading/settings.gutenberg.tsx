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
  Toggle,
} from '../../editor/controls/fields';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const device = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile';

/** Padding or margin of a part, Spectra's names (`blockTopPadding`, `blockPaddingUnit`…). */
export function Sides({
  bind,
  prefix,
  kind,
  label,
}: {
  bind: Bind;
  prefix: string;
  kind: 'Padding' | 'Margin';
  label?: string;
}) {
  return (
    <Spacing
      bind={bind}
      label={label ?? kind}
      keys={(side, d) => `${prefix}${side[0]!.toUpperCase()}${side.slice(1)}${kind}${device(d)}`}
      unitKeys={plain(`${prefix}${kind}Unit`)}
      linkName={`${prefix}${kind}Link`}
    />
  );
}

export const HeadingSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const separator = a.seperatorStyle !== 'none';
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Heading" initialOpen>
            <Select
              bind={bind}
              name="headingTag"
              label="Tag"
              options={['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div'].map((t) => ({
                value: t,
                label: t.toUpperCase(),
              }))}
            />
            <Choice bind={bind} keys={plain('headingAlign')} label="Alignment" options={ALIGN} />
            <Toggle bind={bind} name="headingTitleToggle" label="Heading" />
            <Toggle bind={bind} name="headingDescToggle" label="Description" />
            {Boolean(a.headingDescToggle) && (
              <Choice
                bind={bind}
                name="headingDescPosition"
                label="Description position"
                options={[
                  { value: 'above-heading', label: 'Above' },
                  { value: 'below-heading', label: 'Below' },
                ]}
              />
            )}
            <Select
              bind={bind}
              name="headingWrapper"
              label="Wrapper"
              options={[
                { value: 'div', label: 'div' },
                { value: 'header', label: 'header' },
              ]}
            />
          </Panel>
          <Panel title="Separator">
            <Select
              bind={bind}
              name="seperatorStyle"
              label="Style"
              options={['none', 'solid', 'double', 'dashed', 'dotted'].map((v) => ({
                value: v,
                label: v[0]!.toUpperCase() + v.slice(1),
              }))}
            />
            {separator && (
              <Select
                bind={bind}
                name="seperatorPosition"
                label="Position"
                options={[
                  { value: 'above-heading', label: 'Above the heading' },
                  { value: 'below-heading', label: 'Below the heading' },
                  { value: 'above-sub-heading', label: 'Above the description' },
                  { value: 'below-sub-heading', label: 'Below the description' },
                ]}
              />
            )}
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Heading" initialOpen>
            <Choice
              bind={bind}
              name="headingColorType"
              label="Color type"
              options={[
                { value: 'classic', label: 'Color' },
                { value: 'gradient', label: 'Gradient' },
              ]}
            />
            {a.headingColorType === 'gradient' ? (
              <Gradient bind={bind} name="headingGradientColor" label="Gradient" />
            ) : (
              <Color bind={bind} name="headingColor" label="Color" />
            )}
            <Typography bind={bind} prefix="head" />
            <Range
              bind={bind}
              label="Space below"
              keys={plain('headSpace')}
              unitKeys={plain('headSpaceType')}
              units={['px', 'em']}
            />
            <Color bind={bind} name="headShadowColor" label="Text shadow" />
            {Boolean(a.headShadowColor) && (
              <>
                <Range
                  bind={bind}
                  label="Shadow horizontal"
                  name="headShadowHOffset"
                  min={-50}
                  max={50}
                />
                <Range
                  bind={bind}
                  label="Shadow vertical"
                  name="headShadowVOffset"
                  min={-50}
                  max={50}
                />
                <Range bind={bind} label="Shadow blur" name="headShadowBlur" max={100} />
              </>
            )}
          </Panel>
          {Boolean(a.headingDescToggle) && (
            <Panel title="Description">
              <Color bind={bind} name="subHeadingColor" label="Color" />
              <Typography bind={bind} prefix="subHead" />
              <Range
                bind={bind}
                label="Space below"
                keys={plain('subHeadSpace')}
                unitKeys={plain('subHeadSpaceType')}
                units={['px', 'em']}
              />
            </Panel>
          )}
          <Panel title="Highlight">
            <Color bind={bind} name="highLightColor" label="Color" />
            <Color bind={bind} name="highLightBackground" label="Background" />
            <Typography bind={bind} prefix="highLight" />
            <Sides bind={bind} prefix="highLight" kind="Padding" />
            <Border bind={bind} prefix="highLight" />
          </Panel>
          {separator && (
            <Panel title="Separator">
              <Color bind={bind} name="separatorColor" label="Color" />
              <Range
                bind={bind}
                label="Thickness"
                name="separatorHeight"
                unitName="separatorHeightType"
                units={['px']}
                max={20}
              />
              <Range
                bind={bind}
                label="Width"
                keys={plain('separatorWidth')}
                unitKeys={plain('separatorWidthType')}
                units={['%', 'px']}
              />
              <Range
                bind={bind}
                label="Space below"
                keys={plain('separatorSpace')}
                unitKeys={plain('separatorSpaceType')}
                units={['px', 'em']}
              />
            </Panel>
          )}
          <Panel title="Links">
            <States
              normal={<Color bind={bind} name="linkColor" label="Color" />}
              hover={<Color bind={bind} name="linkHColor" label="Color" />}
            />
          </Panel>
          <Panel title="Background">
            <Choice
              bind={bind}
              name="blockBackgroundType"
              label="Type"
              options={[
                { value: 'classic', label: 'Color' },
                { value: 'gradient', label: 'Gradient' },
              ]}
            />
            {a.blockBackgroundType === 'gradient' ? (
              <Gradient bind={bind} name="blockGradientBackground" label="Gradient" />
            ) : (
              <Color bind={bind} name="blockBackground" label="Color" />
            )}
          </Panel>
        </>
      }
      advanced={
        <Panel title="Spacing" initialOpen>
          <Sides bind={bind} prefix="block" kind="Padding" />
          <Sides bind={bind} prefix="block" kind="Margin" />
        </Panel>
      }
    />
  );
};
