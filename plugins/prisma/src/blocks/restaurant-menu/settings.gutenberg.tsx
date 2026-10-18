import { useDispatch, useSelect } from '@wordpress/data';
import { useEffect } from 'react';
import { plain, type Attrs, type Bind } from '../../editor/controls/bind';
import { Color } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Spacing,
  Toggle,
} from '../../editor/controls/fields';
import { Media } from '../../editor/controls/media';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { SHARED } from '.';

interface BlockEditorSelect {
  getBlockOrder(clientId: string): string[];
  getBlockRootClientId(clientId: string): string | null;
  getBlockAttributes(clientId: string): Attrs | null;
}

/** The shared settings among some changed attributes. */
function shared(change: Attrs): Attrs {
  return Object.fromEntries(
    Object.entries(change).filter(([key]) => (SHARED as readonly string[]).includes(key)),
  );
}

/** `contentPaddingTop`, `imgPaddingTopTablet`… (Spectra's names). */
const sideKey = (p: 'content' | 'img') => (side: string, d: 'desktop' | 'tablet' | 'mobile') =>
  `${p}Padding${side[0]!.toUpperCase()}${side.slice(1)}${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`;

const unitKey = (p: 'content' | 'img') => (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? `${p}PaddingUnit` : `${p}${d === 'tablet' ? 'Tablet' : 'Mobile'}PaddingUnit`;

const TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span'].map((t) => ({
  value: t,
  label: t.toUpperCase(),
}));

export const RestaurantMenuSettings: Inspector = ({
  attributes,
  setAttributes,
  block,
  clientId,
}) => {
  const children = useSelect(
    (select) => (select('core/block-editor') as BlockEditorSelect).getBlockOrder(clientId),
    [clientId],
  );
  const { updateBlockAttributes } = useDispatch('core/block-editor') as {
    updateBlockAttributes: (ids: string[], attrs: Attrs) => void;
  };
  // The items draw themselves from a copy of the layout settings, as in Spectra.
  const set = (change: Attrs) => {
    setAttributes(change);
    const copy = shared(change);
    if (Object.keys(copy).length && children.length) updateBlockAttributes(children, copy);
  };
  const bind: Bind = { attributes, setAttributes: set, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const side = a.imgAlign === 'side';
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="General" initialOpen>
            <Range
              bind={bind}
              label="Columns"
              keys={(d) => (d === 'desktop' ? 'columns' : d === 'tablet' ? 'tcolumns' : 'mcolumns')}
              min={1}
              max={4}
            />
            <Choice
              bind={bind}
              name="headingAlign"
              label="Alignment"
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ]}
            />
            <Select bind={bind} name="headingTag" label="Title tag" options={TAGS} />
          </Panel>
          <Panel title="Image">
            <Toggle bind={bind} name="showImage" label="Show image" />
            {Boolean(a.showImage) && (
              <>
                <Choice
                  bind={bind}
                  name="imgAlign"
                  label="Layout"
                  options={[
                    { value: 'top', label: 'Top' },
                    { value: 'side', label: 'Side' },
                  ]}
                />
                {side && (
                  <>
                    <Choice
                      bind={bind}
                      name="imagePosition"
                      label="Position"
                      options={[
                        { value: 'left', label: 'Left' },
                        { value: 'right', label: 'Right' },
                      ]}
                    />
                    <Choice
                      bind={bind}
                      name="imageAlignment"
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
                  name="imageSize"
                  label="Size"
                  options={[
                    { value: 'thumbnail', label: 'Thumbnail' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'large', label: 'Large' },
                    { value: 'full', label: 'Full' },
                  ]}
                />
                <Range
                  bind={bind}
                  label="Width"
                  keys={plain('imageWidth')}
                  unitName="imageWidthType"
                  max={500}
                />
              </>
            )}
          </Panel>
          <Panel title="Separator">
            <Select
              bind={bind}
              name="seperatorStyle"
              label="Style"
              options={[
                'none',
                'solid',
                'dotted',
                'dashed',
                'double',
                'groove',
                'inset',
                'outset',
                'ridge',
              ].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))}
            />
            {a.seperatorStyle !== 'none' && (
              <>
                <Range
                  bind={bind}
                  label="Width"
                  keys={plain('seperatorWidth')}
                  unitName="seperatorWidthType"
                  units={['%', 'px', 'em']}
                />
                <Range bind={bind} label="Thickness" name="seperatorThickness" max={20} />
                <Color bind={bind} name="seperatorColor" label="Color" />
              </>
            )}
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Title" initialOpen>
            <Color bind={bind} name="titleColor" label="Color" />
            <Typography bind={bind} prefix="title" />
            <Range
              bind={bind}
              label="Bottom margin"
              keys={plain('titleSpace')}
              unitName="titleSpaceType"
              units={['px', 'em']}
              max={100}
            />
          </Panel>
          <Panel title="Description">
            <Color bind={bind} name="descColor" label="Color" />
            <Typography bind={bind} prefix="desc" />
            <Range bind={bind} label="Bottom margin" name="descSpace" max={100} />
          </Panel>
          <Panel title="Price">
            <Color bind={bind} name="priceColor" label="Color" />
            <Typography bind={bind} prefix="price" />
          </Panel>
          <Panel title="Spacing">
            <Range
              bind={bind}
              label="Row gap"
              keys={plain('rowGap')}
              unitName="rowGapType"
              max={200}
            />
            <Range
              bind={bind}
              label="Column gap"
              keys={plain('columnGap')}
              unitName="columnGapType"
              max={200}
            />
            <Spacing
              bind={bind}
              label="Content padding"
              keys={sideKey('content')}
              unitKeys={unitKey('content')}
              linkName="contentSpacingLink"
            />
            {Boolean(a.showImage) && (
              <Spacing
                bind={bind}
                label="Image padding"
                keys={sideKey('img')}
                unitKeys={unitKey('img')}
                linkName="imgSpacingLink"
              />
            )}
          </Panel>
        </>
      }
      advanced={null}
    />
  );
};

export const RestaurantMenuItemSettings: Inspector = ({
  attributes,
  setAttributes,
  block,
  clientId,
}) => {
  const parent = useSelect(
    (select) => {
      const store = select('core/block-editor') as BlockEditorSelect;
      const root = store.getBlockRootClientId(clientId);
      return root ? store.getBlockAttributes(root) : null;
    },
    [clientId],
  );
  // A new item takes the layout of its price list.
  useEffect(() => {
    if (!parent) return;
    const change: Attrs = {};
    for (const key of SHARED) {
      // The group's defaults for these are the item's own.
      const wanted = parent[key] ?? block.defaults[key];
      if (wanted !== (attributes[key] ?? block.defaults[key])) change[key] = wanted;
    }
    if (Object.keys(change).length) setAttributes(change);
  }, [parent, attributes, block.defaults, setAttributes]);
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  return (
    <InspectorTabs
      general={
        <Panel title="Image" initialOpen>
          <Media bind={bind} name="image" label="Image" />
        </Panel>
      }
      advanced={null}
    />
  );
};
