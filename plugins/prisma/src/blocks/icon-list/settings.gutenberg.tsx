import { createBlock } from '@wordpress/blocks';
import { useDispatch, useSelect } from '@wordpress/data';
import { useEffect } from 'react';
import { plain, type Bind } from '../../editor/controls/bind';
import { Color, States } from '../../editor/controls/color';
import { Choice, InspectorTabs, Panel, Range, Text, Toggle } from '../../editor/controls/fields';
import { IconPicker } from '../../editor/controls/icon';
import { Media } from '../../editor/controls/media';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { Sides } from '../heading/settings.gutenberg';

type Attrs = Record<string, unknown>;

interface EditorStore {
  getBlockOrder(clientId: string): string[];
  getBlockRootClientId(clientId: string): string | null;
  getBlockAttributes(clientId: string): Attrs | null;
}
interface EditorActions {
  updateBlockAttributes(clientIds: string | string[], attrs: Attrs): void;
  replaceInnerBlocks(clientId: string, blocks: unknown[]): void;
}

const store = (select: unknown) => (select as (name: string) => EditorStore)('core/block-editor');

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

/** Lists already given their first items in this session. */
const seeded = new Set<string>();

/** What the items take from their list: its icon, hidden labels and image size. */
const inherited = (a: Attrs): Attrs => ({
  fromParentIcon: a.parentIcon,
  hideLabel: Boolean(a.hideLabel),
  imageSizeChild: a.size,
});

export const IconListSettings: Inspector = ({ attributes, setAttributes, block, clientId }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const order = useSelect((select) => store(select).getBlockOrder(clientId), [clientId]);
  const { updateBlockAttributes, replaceInnerBlocks } = useDispatch(
    'core/block-editor',
  ) as unknown as EditorActions;
  // A new list starts with three items, as the blocks it replaces did.
  useEffect(() => {
    if (seeded.has(clientId)) return;
    seeded.add(clientId);
    if (order.length === 0) {
      replaceInnerBlocks(
        clientId,
        [1, 2, 3].map(() => createBlock('prisma/icon-list-item', inherited(a))),
      );
    }
    // Only when the list first shows its settings.
  }, [clientId]);
  useEffect(() => {
    if (order.length) updateBlockAttributes(order, inherited(a));
  }, [a.parentIcon, a.hideLabel, a.size, order.length]);
  const hide = Boolean(a.hideLabel);
  const decorated = Boolean(
    a.iconBgColor || a.iconBgHoverColor || a.border || a.borderTablet || a.borderMobile,
  );
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Icon" initialOpen>
            <IconPicker bind={bind} name="parentIcon" />
          </Panel>
          <Panel title="Content">
            <Choice
              bind={bind}
              keys={(d) =>
                d === 'desktop'
                  ? 'icon_layout'
                  : d === 'tablet'
                    ? 'iconLayoutTablet'
                    : 'iconLayoutMobile'
              }
              label="Layout"
              options={[
                { value: 'horizontal', label: 'Horizontal' },
                { value: 'vertical', label: 'Vertical' },
              ]}
            />
            <Choice bind={bind} keys={plain('align')} label="Alignment" options={ALIGN} />
            {!hide && (
              <Choice
                bind={bind}
                keys={plain('iconPosition')}
                label="Icon alignment"
                options={[
                  { value: 'top', label: 'Top' },
                  { value: 'middle', label: 'Middle' },
                ]}
              />
            )}
            <Toggle bind={bind} name="hideLabel" label="Hide labels" />
            {!hide && (
              <Choice
                bind={bind}
                name="iconPlacement"
                label="Icon position"
                options={[
                  { value: 'before', label: 'Before' },
                  { value: 'after', label: 'After' },
                ]}
              />
            )}
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Icon or image" initialOpen>
            <Range
              bind={bind}
              label="Size"
              keys={plain('size')}
              unitName="sizeType"
              units={['px', 'em']}
              max={200}
            />
            <Range
              bind={bind}
              label="Background size"
              keys={plain('bgSize')}
              unitName="bgSizeType"
              units={['px']}
              max={50}
              help="Useful when the icons have a background color."
            />
            <Range
              bind={bind}
              label="Border"
              keys={plain('border')}
              unitName="borderType"
              units={['px']}
              max={10}
            />
            {decorated && (
              <Range
                bind={bind}
                label="Border radius"
                keys={plain('borderRadius')}
                unitName="borderRadiusType"
                units={['px']}
                max={100}
              />
            )}
            <States
              normal={
                <>
                  <Color bind={bind} name="iconColor" label="Icon color" />
                  <Color bind={bind} name="iconBgColor" label="Background color" />
                  <Color bind={bind} name="iconBorderColor" label="Border color" />
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="iconHoverColor" label="Icon color" />
                  <Color bind={bind} name="iconBgHoverColor" label="Background color" />
                  <Color bind={bind} name="iconBorderHoverColor" label="Border color" />
                </>
              }
            />
          </Panel>
          {!hide && (
            <Panel title="Label">
              <Range
                bind={bind}
                label="Gap between icon and label"
                keys={(d) =>
                  d === 'desktop'
                    ? 'inner_gap'
                    : d === 'tablet'
                      ? 'innerGapTablet'
                      : 'innerGapMobile'
                }
                unitName="innerGapType"
                units={['px']}
                min={-100}
                max={100}
              />
              <States
                normal={<Color bind={bind} name="labelColor" label="Color" />}
                hover={<Color bind={bind} name="labelHoverColor" label="Color" />}
              />
              <ListTypography bind={bind} />
            </Panel>
          )}
          <Panel title="Spacing">
            <Range
              bind={bind}
              label="Gap between items"
              keys={plain('gap')}
              unitName="gapType"
              units={['px']}
              max={100}
            />
            <Sides bind={bind} prefix="block" kind="Margin" />
            <Sides bind={bind} prefix="block" kind="Padding" />
          </Panel>
        </>
      }
    />
  );
};

/**
 * The label's typography: the list keeps Spectra's own names (`fontSize`,
 * `fontTransform`, `labelLetterSpacing`), so the shared control is given
 * the attributes under the names it expects.
 */
function ListTypography({ bind }: { bind: Bind }) {
  const MAP: Record<string, string> = {
    labelFontFamily: 'fontFamily',
    labelFontWeight: 'fontWeight',
    labelFontStyle: 'fontStyle',
    labelTransform: 'fontTransform',
    labelDecoration: 'fontDecoration',
    labelLoadGoogleFonts: 'loadGoogleFonts',
    labelFontSize: 'fontSize',
    labelFontSizeTablet: 'fontSizeTablet',
    labelFontSizeMobile: 'fontSizeMobile',
    labelFontSizeType: 'fontSizeType',
    labelFontSizeTypeTablet: 'fontSizeType',
    labelFontSizeTypeMobile: 'fontSizeType',
    labelLineHeight: 'lineHeight',
    labelLineHeightTablet: 'lineHeightTablet',
    labelLineHeightMobile: 'lineHeightMobile',
    labelLineHeightType: 'lineHeightType',
    labelLineHeightTypeTablet: 'lineHeightType',
    labelLineHeightTypeMobile: 'lineHeightType',
    labelLetterSpacing: 'labelLetterSpacing',
    labelLetterSpacingTablet: 'labelLetterSpacingTablet',
    labelLetterSpacingMobile: 'labelLetterSpacingMobile',
    labelLetterSpacingType: 'labelLetterSpacingType',
    labelLetterSpacingTypeTablet: 'labelLetterSpacingType',
    labelLetterSpacingTypeMobile: 'labelLetterSpacingType',
  };
  return <Typography bind={renamed(bind, MAP)} prefix="label" />;
}

/** A bind that shows attributes under other names (`shown` → `stored`). */
export function renamed(bind: Bind, map: Record<string, string>): Bind {
  const to = (key: string) => map[key] ?? key;
  const view = (source: Attrs) =>
    new Proxy(source, {
      get: (target, key) => (typeof key === 'string' ? target[to(key)] : undefined),
      has: (target, key) => typeof key === 'string' && to(key) in target,
    });
  return {
    attributes: view(bind.attributes),
    defaults: view(bind.defaults),
    setAttributes: (attrs) =>
      bind.setAttributes(Object.fromEntries(Object.entries(attrs).map(([k, v]) => [to(k), v]))),
  };
}

// ---- Item ------------------------------------------------------------------------------------

export const IconListItemSettings: Inspector = ({ attributes, setAttributes, block, clientId }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  // A new item takes its list's icon, hidden labels and image size.
  const parent = useSelect(
    (select) => {
      const root = store(select).getBlockRootClientId(clientId);
      return root ? store(select).getBlockAttributes(root) : null;
    },
    [clientId],
  );
  useEffect(() => {
    if (!parent) return;
    const want = inherited({ parentIcon: 'circle-arrow-right', size: 16, ...parent });
    if (Object.entries(want).some(([k, v]) => a[k] !== v)) setAttributes(want);
  }, [parent?.parentIcon, parent?.hideLabel, parent?.size]);
  return (
    <InspectorTabs
      general={
        <Panel title="Item" initialOpen>
          <Choice
            bind={bind}
            name="image_icon"
            label="Type"
            options={[
              { value: 'icon', label: 'Icon' },
              { value: 'image', label: 'Image' },
              { value: 'none', label: 'None' },
            ]}
          />
          {a.image_icon === 'icon' && <IconPicker bind={bind} name="icon" />}
          {a.image_icon === 'image' && <Media bind={bind} name="image" label="Image" />}
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
          {!a.hideLabel && (
            <Panel title="Label" initialOpen>
              <States
                normal={<Color bind={bind} name="label_color" label="Color" />}
                hover={<Color bind={bind} name="label_hover_color" label="Color" />}
              />
            </Panel>
          )}
          <Panel title="Icon">
            <States
              normal={
                <>
                  <Color bind={bind} name="icon_color" label="Icon color" />
                  <Color bind={bind} name="icon_bg_color" label="Background color" />
                  <Color bind={bind} name="icon_border_color" label="Border color" />
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="icon_hover_color" label="Icon color" />
                  <Color bind={bind} name="icon_bg_hover_color" label="Background color" />
                  <Color bind={bind} name="icon_border_hover_color" label="Border color" />
                </>
              }
            />
          </Panel>
          <Panel title="Spacing">
            <Sides bind={bind} prefix="child" kind="Margin" />
            <Sides bind={bind} prefix="child" kind="Padding" />
          </Panel>
        </>
      }
    />
  );
};
