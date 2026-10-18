import { plain, value, type Bind } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color, Gradient, States } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Spacing,
  Text,
  Toggle,
} from '../../editor/controls/fields';
import { IconPicker } from '../../editor/controls/icon';
import { BoxShadow } from '../../editor/controls/shadow';
import type { Inspector } from '../../editor/register';

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const device = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile';

/** Padding or margin of the icon (`iconTopTabletPadding`, `iconTabletPaddingUnit`). */
function IconSides({ bind, kind }: { bind: Bind; kind: 'Padding' | 'Margin' }) {
  return (
    <Spacing
      bind={bind}
      label={kind}
      keys={(side, d) => `icon${side[0]!.toUpperCase()}${side.slice(1)}${device(d)}${kind}`}
      unitKeys={(d) => `icon${device(d)}${kind}Unit`}
      linkName={`icon${kind}Link`}
    />
  );
}

/** Background of a state: a color or a gradient. */
function Background({ bind, hover }: { bind: Bind; hover?: boolean }) {
  const p = hover ? 'iconHover' : 'icon';
  const type = String(value(bind, `${p}BackgroundColorType`) ?? 'classic');
  return (
    <>
      <Choice
        bind={bind}
        name={`${p}BackgroundColorType`}
        label="Background type"
        options={[
          { value: 'classic', label: 'Color' },
          { value: 'gradient', label: 'Gradient' },
        ]}
      />
      {type === 'gradient' ? (
        <Gradient bind={bind} name={`${p}BackgroundGradientColor`} label="Gradient" />
      ) : (
        <Color bind={bind} name={`${p}BackgroundColor`} label="Background" />
      )}
    </>
  );
}

export const IconSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  return (
    <InspectorTabs
      general={
        <Panel title="Icon" initialOpen>
          <IconPicker bind={bind} name="icon" />
          <Choice
            bind={bind}
            name="iconAccessabilityMode"
            label="Accessibility mode"
            options={[
              { value: 'svg', label: 'SVG' },
              { value: 'image', label: 'Image' },
              { value: 'presentation', label: 'Decorative' },
            ]}
          />
          {a.iconAccessabilityMode !== 'presentation' && (
            <Text bind={bind} name="iconAccessabilityDesc" label="Accessibility label" />
          )}
          <Range
            bind={bind}
            label="Size"
            keys={plain('iconSize')}
            unitName="iconSizeUnit"
            units={['px', 'em']}
            max={200}
          />
          <Choice bind={bind} keys={plain('align')} label="Alignment" options={ALIGN} />
          <Range
            bind={bind}
            label="Rotation"
            name="rotation"
            unitName="rotationUnit"
            units={['deg']}
            min={-180}
            max={180}
          />
          <Toggle bind={bind} name="disableLink" label="Link" />
          {Boolean(a.disableLink) && (
            <>
              <Text bind={bind} name="link" label="URL" placeholder="Enter URL" />
              <Toggle bind={bind} name="target" label="Open in a new tab" />
            </>
          )}
        </Panel>
      }
      style={
        <>
          <Panel title="Icon" initialOpen>
            <States
              normal={
                <>
                  <Color bind={bind} name="iconColor" label="Icon color" />
                  <Background bind={bind} />
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="iconHoverColor" label="Icon color" />
                  <Background bind={bind} hover />
                </>
              }
            />
            <Border bind={bind} prefix="icon" />
          </Panel>
          <Panel title="Drop shadow">
            <Color bind={bind} name="iconShadowColor" label="Color" />
            <Range bind={bind} label="Horizontal" name="iconShadowHOffset" min={-100} max={100} />
            <Range bind={bind} label="Vertical" name="iconShadowVOffset" min={-100} max={100} />
            <Range bind={bind} label="Blur" name="iconShadowBlur" max={100} />
          </Panel>
          <Panel title="Box shadow">
            <Toggle bind={bind} name="useSeparateBoxShadows" label="Separate hover shadow" />
            <BoxShadow bind={bind} prefix="icon" hover={Boolean(a.useSeparateBoxShadows)} />
          </Panel>
          <Panel title="Spacing">
            <IconSides bind={bind} kind="Padding" />
            <IconSides bind={bind} kind="Margin" />
          </Panel>
        </>
      }
    />
  );
};
