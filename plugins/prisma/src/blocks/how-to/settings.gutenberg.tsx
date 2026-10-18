import { store as blockEditorStore } from '@wordpress/block-editor';
import { Button, TextControl } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { useEffect } from 'react';
import { plain, type Bind } from '../../editor/controls/bind';
import { Color } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Text,
  Toggle,
} from '../../editor/controls/fields';
import { Media } from '../../editor/controls/media';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import type { Attrs } from '../../lib/types';
import { howToSchema, stepSchema } from '.';

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const SIZES = [
  { value: 'thumbnail', label: 'Thumbnail' },
  { value: 'medium', label: 'Medium' },
  { value: 'full', label: 'Large' },
];

/** A list of rich text items (`tools`, `materials`), its count kept in step as Spectra does. */
function Items({
  bind,
  list,
  count,
  itemKey,
  label,
  fresh,
}: {
  bind: Bind;
  list: string;
  count: string;
  itemKey: string;
  label: string;
  fresh: string;
}) {
  const raw = bind.attributes[list] ?? bind.defaults[list];
  const items = (Array.isArray(raw) ? raw : []) as Attrs[];
  const resize = (n: number) => {
    const next = items.slice(0, n);
    while (next.length < n) next.push({ [itemKey]: fresh });
    bind.setAttributes({ [list]: next, [count]: n });
  };
  const counted: Bind = {
    ...bind,
    setAttributes: (v) => resize(Math.max(1, Math.min(50, Number(v[count]) || 1))),
  };
  return (
    <>
      <Range bind={counted} label={`Number of ${label}`} name={count} min={1} max={50} />
      {items.map((item, i) => (
        <TextControl
          key={i}
          __nextHasNoMarginBottom
          __next40pxDefaultSize
          label={`${label[0]!.toUpperCase()}${label.slice(1, -1)} ${i + 1}`}
          value={String(item[itemKey] ?? '')}
          onChange={(text: string) =>
            bind.setAttributes({
              [list]: items.map((it, j) => (j === i ? { ...it, [itemKey]: text } : it)),
            })
          }
        />
      ))}
      <Button variant="secondary" onClick={() => resize(Math.min(50, items.length + 1))}>
        Add
      </Button>
    </>
  );
}

export const HowToSettings: Inspector = ({ attributes, setAttributes, block, clientId }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };

  // The structured data follows the block and its steps, as the page shows them.
  const steps = useSelect(
    (select) =>
      (
        select(blockEditorStore) as unknown as {
          getBlocks(id: string): { name: string; attributes: Attrs }[];
        }
      ).getBlocks(clientId),
    [clientId],
  );
  const schema = JSON.stringify(
    howToSchema(
      a,
      steps.filter((s) => s.name === 'prisma/how-to-step').map((s) => stepSchema(s.attributes)),
    ),
  );
  useEffect(() => {
    if (attributes.schema !== schema) setAttributes({ schema });
  }, [schema, attributes.schema, setAttributes]);

  const minutes = a.timeInMins === '' || a.timeInMins === undefined ? a.time : a.timeInMins;
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Title" initialOpen>
            <Select
              bind={bind}
              name="headingTag"
              label="Tag"
              options={['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((t) => ({
                value: t,
                label: t.toUpperCase(),
              }))}
            />
            <Choice bind={bind} name="overallAlignment" label="Text alignment" options={ALIGN} />
          </Panel>
          <Panel title="Image">
            <Media bind={bind} name="mainimage" label="Image" />
            {Boolean((a.mainimage as { url?: string } | null)?.url) && (
              <Select bind={bind} name="imgSize" label="Image size" options={SIZES} />
            )}
          </Panel>
          <Panel title="Time">
            <Toggle
              bind={bind}
              name="showTotaltime"
              label="Show total time"
              help="Search engines recommend the total time: keep it on."
            />
            {Boolean(a.showTotaltime) && (
              <>
                <Range bind={bind} label="Years" name="timeInYears" min={1} max={10} />
                <Range bind={bind} label="Months" name="timeInMonths" min={1} max={12} />
                <Range bind={bind} label="Days" name="timeInDays" min={1} max={31} />
                <Range bind={bind} label="Hours" name="timeInHours" min={1} max={24} />
                <Range
                  bind={{ ...bind, attributes: { ...attributes, timeInMins: minutes } }}
                  label="Minutes"
                  name="timeInMins"
                  min={1}
                  max={60}
                />
              </>
            )}
          </Panel>
          <Panel title="Cost">
            <Toggle
              bind={bind}
              name="showEstcost"
              label="Show estimated cost"
              help="Search engines recommend the cost: keep it on. Write the currency as its ISO code (EUR, USD…)."
            />
          </Panel>
          <Panel title="Tools">
            <Toggle bind={bind} name="showTools" label="Show tools" />
            {Boolean(a.showTools) && (
              <Items
                bind={bind}
                list="tools"
                count="tools_count"
                itemKey="add_required_tools"
                label="tools"
                fresh="- A tool"
              />
            )}
          </Panel>
          <Panel title="Materials">
            <Toggle bind={bind} name="showMaterials" label="Show materials" />
            {Boolean(a.showMaterials) && (
              <Items
                bind={bind}
                list="materials"
                count="material_count"
                itemKey="add_required_materials"
                label="materials"
                fresh="- A material"
              />
            )}
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Heading" initialOpen>
            <Color bind={bind} name="headingColor" label="Color" />
            <Typography bind={bind} prefix="head" />
          </Panel>
          <Panel title="Secondary headings">
            <Color bind={bind} name="showTotaltimecolor" label="Color" />
            <Typography bind={bind} prefix="price" />
          </Panel>
          <Panel title="Description">
            <Color bind={bind} name="subHeadingColor" label="Color" />
            <Typography bind={bind} prefix="subHead" />
          </Panel>
          <Panel title="Spacing">
            {Boolean(a.showTotaltime) && (
              <Range bind={bind} label="Time margin" name="timeSpace" max={50} />
            )}
            {Boolean(a.showEstcost) && (
              <Range bind={bind} label="Cost margin" name="costSpace" max={50} />
            )}
            <Range
              bind={bind}
              label="Row gap"
              keys={(d) => (d === 'desktop' ? 'row_gap' : plain('rowGap')(d))}
              max={200}
            />
            <Range bind={bind} label="Gap between steps" name="step_gap" max={200} />
          </Panel>
        </>
      }
    />
  );
};

export const HowToStepSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const type = String(a.urlType);
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Image" initialOpen>
            <Media bind={bind} name="image" label="Image" />
            {Boolean((a.image as { url?: string } | null)?.url) && (
              <>
                <Select bind={bind} name="imageSize" label="Image size" options={SIZES} />
                <Select
                  bind={bind}
                  name="imgPosition"
                  label="Position"
                  options={[
                    { value: 'above-title', label: 'Above the title' },
                    { value: 'left-title', label: 'Left of the title' },
                    { value: 'right-title', label: 'Right of the title' },
                  ]}
                />
              </>
            )}
          </Panel>
          <Panel title="Link">
            <Select
              bind={bind}
              name="urlType"
              label="Type"
              options={[
                { value: 'text', label: 'Text' },
                { value: 'all', label: 'Whole step' },
                { value: 'none', label: 'None' },
              ]}
            />
            {type === 'text' && <Text bind={bind} name="urlText" label="Text" />}
            {type !== 'none' && (
              <>
                <Text bind={bind} name="url" label="Link" placeholder="https://" />
                <Toggle bind={bind} name="urlTarget" label="Open in a new tab" />
              </>
            )}
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Title" initialOpen>
            <Typography bind={bind} prefix="title" />
            <Color bind={bind} name="titleColor" label="Color" />
          </Panel>
          <Panel title="Description">
            <Typography bind={bind} prefix="description" />
            <Color bind={bind} name="descriptionColor" label="Color" />
          </Panel>
          {type === 'text' && (
            <Panel title="Link">
              <Typography bind={bind} prefix="url" />
              <Color bind={bind} name="urlColor" label="Color" />
            </Panel>
          )}
        </>
      }
    />
  );
};
