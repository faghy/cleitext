import { plain, type Bind } from '../../editor/controls/bind';
import { Color, States } from '../../editor/controls/color';
import { Choice, InspectorTabs, Panel, Range, Select } from '../../editor/controls/fields';
import { IconPicker } from '../../editor/controls/icon';
import { Media } from '../../editor/controls/media';
import type { Inspector } from '../../editor/register';
import { NETWORKS } from '.';

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export const SocialShareSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  return (
    <InspectorTabs
      general={
        <Panel title="General" initialOpen>
          <Choice
            bind={bind}
            name="social_layout"
            label="Layout"
            options={[
              { value: 'horizontal', label: 'Horizontal' },
              { value: 'vertical', label: 'Vertical' },
            ]}
          />
          {a.social_layout === 'horizontal' && (
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
          )}
          <Choice bind={bind} keys={plain('align')} label="Alignment" options={ALIGN} />
        </Panel>
      }
      style={
        <>
          <Panel title="Icon" initialOpen>
            <Range
              bind={bind}
              label="Size"
              keys={plain('size')}
              unitName="sizeType"
              units={['px', 'em']}
              max={500}
            />
            <Range bind={bind} label="Background size" name="bgSize" max={100} />
            <Range bind={bind} label="Border radius" keys={plain('borderRadius')} max={100} />
            <Range bind={bind} label="Gap between items" keys={plain('gap')} max={100} />
          </Panel>
          <Panel title="Colors">
            <States
              normal={
                <>
                  <Color bind={bind} name="iconColor" label="Color" />
                  <Color bind={bind} name="iconBgColor" label="Background" />
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="iconHoverColor" label="Color" />
                  <Color bind={bind} name="iconBgHoverColor" label="Background" />
                </>
              }
            />
          </Panel>
        </>
      }
      advanced={null}
    />
  );
};

export const SocialShareItemSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  // Choosing a network also shows its icon, as long as the icon followed the network.
  const typeBind: Bind = {
    ...bind,
    setAttributes: (change) => {
      const type = String(change.type ?? '');
      const following = a.icon === NETWORKS[String(a.type)]?.icon || a.icon === a.type;
      setAttributes(
        following && NETWORKS[type] ? { ...change, icon: NETWORKS[type].icon } : change,
      );
    },
  };
  return (
    <InspectorTabs
      general={
        <Panel title="General" initialOpen>
          <Select
            bind={typeBind}
            name="type"
            label="Type"
            options={Object.entries(NETWORKS).map(([value, n]) => ({ value, label: n.label }))}
          />
          <Choice
            bind={bind}
            name="image_icon"
            label="Show"
            options={[
              { value: 'icon', label: 'Icon' },
              { value: 'image', label: 'Image' },
            ]}
          />
          {a.image_icon === 'image' ? (
            <Media bind={bind} name="image" label="Image" />
          ) : (
            <IconPicker bind={bind} name="icon" />
          )}
        </Panel>
      }
      style={
        <Panel title="Colors" initialOpen>
          <States
            normal={
              <>
                <Color bind={bind} name="icon_color" label="Color" />
                <Color bind={bind} name="icon_bg_color" label="Background" />
              </>
            }
            hover={
              <>
                <Color bind={bind} name="icon_hover_color" label="Color" />
                <Color bind={bind} name="icon_bg_hover_color" label="Background" />
              </>
            }
          />
        </Panel>
      }
      advanced={null}
    />
  );
};
