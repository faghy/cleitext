import { store as blockEditorStore } from '@wordpress/block-editor';
import { SelectControl, ToggleControl } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
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
} from '../../editor/controls/fields';
import { IconPicker } from '../../editor/controls/icon';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { formatDate } from './timeline';

const LAYOUT = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];
const DATE_FORMATS = [
  'M j, Y',
  'F j, Y',
  'm/d/Y',
  'm-d-Y',
  'm.d.Y',
  'd M Y',
  'd F Y',
  'd-m-Y',
  'd.m.Y',
  'd/m/Y',
  'Y-m-d',
  'Y.m.d',
  'Y/m/d',
  'M, Y',
  'M Y',
  'F, Y',
  'F Y',
];
const SAMPLE = '1/1/2019';

/** Attributes the timeline gives to its items, which draw them. */
type Shared = 'icon' | 'headingTag' | 'dateFormat' | 'displayPostDate';

export const ContentTimelineSettings: Inspector = ({
  attributes,
  setAttributes,
  block,
  clientId,
}) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const children = useSelect(
    (select) =>
      (
        select(blockEditorStore) as unknown as {
          getBlocks(id: string): { clientId: string }[];
        }
      )
        .getBlocks(clientId)
        .map((b) => b.clientId),
    [clientId],
  );
  const { updateBlockAttributes } = useDispatch(blockEditorStore) as unknown as {
    updateBlockAttributes(ids: string[], attrs: Record<string, unknown>): void;
  };
  /** Changes the timeline and every item. */
  const share = (name: Shared, value: unknown) => {
    setAttributes({ [name]: value });
    // An item's `displayPostDate` hides its date: the opposite of the timeline's.
    const itemValue = name === 'displayPostDate' ? !value : value;
    if (children.length) updateBlockAttributes(children, { [name]: itemValue });
  };
  const sharedBind = (name: Shared): Bind => ({
    ...bind,
    setAttributes: (v) => share(name, v[name]),
  });
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Layout" initialOpen>
            <Choice
              bind={bind}
              keys={plain('timelinAlignment')}
              label="Orientation"
              options={LAYOUT}
            />
            <Choice bind={bind} keys={plain('align')} label="Text alignment" options={LAYOUT} />
            <Choice
              bind={bind}
              name="arrowlinAlignment"
              label="Arrow alignment"
              options={[
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
                { value: 'center', label: 'Center' },
              ]}
            />
          </Panel>
          <Panel title="Date">
            <ToggleControl
              __nextHasNoMarginBottom
              label="Display date"
              checked={Boolean(a.displayPostDate)}
              onChange={(checked: boolean) => share('displayPostDate', checked)}
            />
            {Boolean(a.displayPostDate) && (
              <SelectControl
                __nextHasNoMarginBottom
                __next40pxDefaultSize
                label="Date format"
                value={String(a.dateFormat)}
                options={[
                  ...DATE_FORMATS.map((f) => ({ value: f, label: formatDate(f, SAMPLE) })),
                  { value: 'custom', label: 'Normal text' },
                ]}
                onChange={(v: string) => share('dateFormat', v)}
              />
            )}
          </Panel>
          <Panel title="Timeline item">
            <Select
              bind={sharedBind('headingTag')}
              name="headingTag"
              label="Heading tag"
              options={['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p'].map((t) => ({
                value: t,
                label: t.toUpperCase(),
              }))}
            />
          </Panel>
          <Panel title="Connector">
            <IconPicker bind={sharedBind('icon')} name="icon" label="Icon" />
            <Range bind={bind} label="Icon size" keys={plain('iconSize')} min={0} max={100} />
            <Range
              bind={bind}
              label="Icon background size"
              keys={plain('connectorBgsize')}
              min={0}
              max={100}
            />
            <Range bind={bind} label="Border width" name="borderwidth" min={0} max={10} />
            <Range bind={bind} label="Connector thickness" name="separatorwidth" min={1} max={10} />
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Heading" initialOpen>
            <Color bind={bind} name="headingColor" label="Color" />
            <Typography bind={bind} prefix="head" />
            <Range bind={bind} label="Bottom spacing" keys={plain('headSpace')} min={0} max={100} />
          </Panel>
          <Panel title="Description">
            <Color bind={bind} name="subHeadingColor" label="Color" />
            <Typography bind={bind} prefix="subHead" />
          </Panel>
          <Panel title="Timeline">
            <Range
              bind={bind}
              label="Border radius"
              keys={plain('borderRadius')}
              min={0}
              max={100}
            />
            <Color bind={bind} name="backgroundColor" label="Background color" />
          </Panel>
          {Boolean(a.displayPostDate) && (
            <Panel title="Date">
              <Color bind={bind} name="dateColor" label="Color" />
              <Typography bind={bind} prefix="date" />
              <Range
                bind={bind}
                label="Bottom spacing"
                keys={plain('dateBottomspace')}
                min={0}
                max={100}
              />
            </Panel>
          )}
          <Panel title="Connector">
            <States
              labels={['Normal', 'Focus']}
              normal={
                <>
                  <Color bind={bind} name="separatorColor" label="Connector color" />
                  <Color bind={bind} name="iconColor" label="Icon color" />
                  <Color bind={bind} name="separatorBg" label="Background color" />
                  <Color bind={bind} name="separatorBorder" label="Border color" />
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="separatorFillColor" label="Connector color" />
                  <Color bind={bind} name="iconFocus" label="Icon color" />
                  <Color bind={bind} name="iconBgFocus" label="Background color" />
                  <Color bind={bind} name="borderFocus" label="Border color" />
                </>
              }
            />
          </Panel>
        </>
      }
      advanced={
        <Panel title="Spacing" initialOpen>
          <Spacing
            bind={bind}
            label="Padding"
            keys={(side, d) =>
              d === 'desktop'
                ? `${side}Padding`
                : `${side}Padding${d === 'tablet' ? 'Tablet' : 'Mobile'}`
            }
            unitKeys={(d) => (d === 'desktop' ? 'paddingUnit' : `${d}PaddingUnit`)}
            linkName="paddingLink"
            units={['px', '%', 'em']}
          />
          <Range
            bind={bind}
            label="Timeline – marker gap"
            keys={plain('horizontalSpace')}
            unitKeys={plain('horizontalSpaceUnit')}
            units={['px', '%', 'em']}
            min={0}
            max={200}
          />
          <Range
            bind={bind}
            label="Timeline item gap"
            keys={plain('verticalSpace')}
            unitKeys={plain('verticalSpaceUnit')}
            units={['px', '%', 'em']}
            min={0}
            max={200}
          />
        </Panel>
      }
    />
  );
};

export const ContentTimelineItemSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  return (
    <InspectorTabs
      general={
        a.displayPostDate !== true ? (
          <Panel title="Date" initialOpen>
            <Text
              bind={bind}
              name="t_date"
              label={a.dateFormat === 'custom' ? 'Date' : 'Date (mm/dd/yyyy)'}
              placeholder={SAMPLE}
            />
          </Panel>
        ) : null
      }
    />
  );
};
