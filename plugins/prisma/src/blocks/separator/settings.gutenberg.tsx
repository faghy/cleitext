import { plain, type Bind } from '../../editor/controls/bind';
import { Color } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Spacing,
  Text,
} from '../../editor/controls/fields';
import { IconPicker } from '../../editor/controls/icon';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { MASK_STYLES } from '.';

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const dev = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile';

/** Padding or margin of the separator (`blockTopPadding`, `blockPaddingUnitTablet`…). */
function BlockSpacing({ bind, kind }: { bind: Bind; kind: 'Padding' | 'Margin' }) {
  return (
    <Spacing
      bind={bind}
      label={kind}
      keys={(side, d) => `block${side[0]!.toUpperCase()}${side.slice(1)}${kind}${dev(d)}`}
      unitKeys={(d) => `block${kind}Unit${dev(d)}`}
      linkName={`block${kind}Link`}
    />
  );
}

export const SeparatorSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const element = a.elementType === 'text' || a.elementType === 'icon';
  return (
    <InspectorTabs
      general={
        <Panel title="Separator" initialOpen>
          <Select
            bind={bind}
            name="separatorStyle"
            label="Style"
            options={[
              { value: 'none', label: 'None' },
              { value: 'dotted', label: 'Dotted' },
              { value: 'dashed', label: 'Dashed' },
              { value: 'double', label: 'Double' },
              { value: 'solid', label: 'Solid' },
              { value: 'rectangles', label: 'Rectangles' },
              { value: 'parallelogram', label: 'Parallelogram' },
              { value: 'slash', label: 'Slash' },
              { value: 'leaves', label: 'Leaves' },
            ]}
          />
          <Choice
            bind={bind}
            name="elementType"
            label="Add element"
            options={[
              { value: 'none', label: 'None' },
              { value: 'text', label: 'Text' },
              { value: 'icon', label: 'Icon' },
            ]}
          />
          {a.elementType === 'text' && (
            <>
              <Text bind={bind} name="separatorText" label="Text" />
              <Select
                bind={bind}
                name="separatorTextTag"
                label="Heading tag"
                options={['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p'].map((t) => ({
                  value: t,
                  label: t.toUpperCase(),
                }))}
              />
            </>
          )}
          {a.elementType === 'icon' && <IconPicker bind={bind} name="separatorIcon" />}
        </Panel>
      }
      style={
        <>
          <Panel title="Separator" initialOpen>
            <Choice bind={bind} keys={plain('separatorAlign')} label="Alignment" options={ALIGN} />
            <Range
              bind={bind}
              label="Width"
              keys={plain('separatorWidth')}
              unitName="separatorWidthType"
              units={['%', 'px']}
            />
            {MASK_STYLES.includes(String(a.separatorStyle)) && (
              <Range
                bind={bind}
                label="Size"
                keys={plain('separatorSize')}
                unitName="separatorSizeType"
                units={['px', '%']}
                max={100}
              />
            )}
            <Range
              bind={bind}
              label="Separator height"
              keys={plain('separatorBorderHeight')}
              unitName="separatorBorderHeightUnit"
              units={['px', '%']}
              max={50}
            />
            <Color bind={bind} name="separatorColor" label="Color" />
          </Panel>
          {element && (
            <Panel title={a.elementType === 'text' ? 'Text' : 'Icon'}>
              <Choice bind={bind} name="elementPosition" label="Alignment" options={ALIGN} />
              <Color bind={bind} name="elementColor" label="Color" />
              {a.elementType === 'text' ? (
                <Typography bind={bind} prefix="elementText" />
              ) : (
                <Range
                  bind={bind}
                  label="Icon size"
                  keys={plain('elementIconWidth')}
                  unitName="elementIconWidthType"
                  units={['px', 'em']}
                  max={100}
                />
              )}
              <Range
                bind={bind}
                label="Spacing"
                keys={plain('elementSpacing')}
                unitName="elementSpacingUnit"
                max={100}
              />
            </Panel>
          )}
          <Panel title="Spacing">
            <BlockSpacing bind={bind} kind="Padding" />
            <BlockSpacing bind={bind} kind="Margin" />
          </Panel>
        </>
      }
    />
  );
};
