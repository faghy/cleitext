import { plain, type Bind } from '../../editor/controls/bind';
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
import { Media } from '../../editor/controls/media';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { SOCIALS } from '.';

export const TeamSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const image = Boolean(
    a.image && typeof a.image === 'object' && (a.image as { url?: string }).url,
  );
  const side = a.imgPosition !== 'above';
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Image" initialOpen>
            <Media bind={bind} name="image" label="Image" />
            {image && (
              <>
                <Select
                  bind={bind}
                  name="imgPosition"
                  label="Position"
                  options={[
                    { value: 'above', label: 'Top' },
                    { value: 'left', label: 'Left' },
                    { value: 'right', label: 'Right' },
                  ]}
                />
                {side && (
                  <>
                    <Choice
                      bind={bind}
                      name="imgAlign"
                      label="Vertical alignment"
                      options={[
                        { value: 'top', label: 'Top' },
                        { value: 'middle', label: 'Middle' },
                      ]}
                    />
                    <Select
                      bind={bind}
                      name="stack"
                      label="Stack on"
                      options={[
                        { value: 'none', label: 'None' },
                        { value: 'tablet', label: 'Tablet' },
                        { value: 'mobile', label: 'Mobile' },
                      ]}
                    />
                  </>
                )}
                <Select
                  bind={bind}
                  name="imgStyle"
                  label="Style"
                  options={[
                    { value: 'normal', label: 'Normal' },
                    { value: 'circle', label: 'Circle' },
                    { value: 'square', label: 'Square' },
                  ]}
                />
              </>
            )}
          </Panel>
          <Panel title="Content">
            {!side && (
              <Choice
                bind={bind}
                name="align"
                label="Alignment"
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            )}
            <Select
              bind={bind}
              name="tag"
              label="Name tag"
              options={['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p', 'div'].map((t) => ({
                value: t,
                label: t.toUpperCase(),
              }))}
            />
          </Panel>
          <Panel title="Social profiles">
            <Toggle bind={bind} name="socialEnable" label="Enable" />
            {Boolean(a.socialEnable) && (
              <>
                <Toggle bind={bind} name="socialTarget" label="Open in a new tab" />
                {SOCIALS.map(([icon, link, label]) => (
                  <div key={icon} className="pr-team-social">
                    <IconPicker bind={bind} name={icon} label={`${label} icon`} />
                    <Text bind={bind} name={link} label={`${label} link`} placeholder="https://" />
                  </div>
                ))}
              </>
            )}
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Name" initialOpen>
            <Color bind={bind} name="titleColor" label="Color" />
            <Typography bind={bind} prefix="title" />
            <Range bind={bind} label="Bottom margin" keys={plain('titleSpace')} max={100} />
          </Panel>
          <Panel title="Designation">
            <Color bind={bind} name="prefixColor" label="Color" />
            <Typography bind={bind} prefix="prefix" />
            <Range bind={bind} label="Bottom margin" keys={plain('prefixSpace')} max={100} />
          </Panel>
          <Panel title="Description">
            <Color bind={bind} name="descColor" label="Color" />
            <Typography bind={bind} prefix="desc" />
            <Range bind={bind} label="Bottom margin" keys={plain('descSpace')} max={100} />
          </Panel>
          {Boolean(a.socialEnable) && (
            <Panel title="Social icons">
              <States
                normal={<Color bind={bind} name="socialColor" label="Color" />}
                hover={<Color bind={bind} name="socialHoverColor" label="Color" />}
              />
              <Range
                bind={bind}
                label="Size"
                keys={plain('socialFontSize')}
                unitName="socialFontSizeType"
                units={['px', 'em']}
                max={100}
              />
              <Range bind={bind} label="Spacing" keys={plain('socialSpace')} max={100} />
            </Panel>
          )}
          {image && (
            <Panel title="Image">
              <Range bind={bind} label="Width" keys={plain('imgWidth')} max={500} />
              <Spacing
                bind={bind}
                label="Margin"
                keys={(s) => `image${s[0]!.toUpperCase()}${s.slice(1)}Margin`}
                unitKeys={() => 'imageMarginUnit'}
                linkName="spacingLink"
              />
            </Panel>
          )}
        </>
      }
    />
  );
};
