import { store as blockEditorStore } from '@wordpress/block-editor';
import { useSelect } from '@wordpress/data';
import { useEffect } from 'react';
import { plain, suffixed, type Bind } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color, Gradient, States } from '../../editor/controls/color';
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
import { Media } from '../../editor/controls/media';
import { BoxShadow } from '../../editor/controls/shadow';
import { SHAPE_TYPES } from '../../lib/shapes';
import type { Inspector } from '../../editor/register';

const D = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? 'Desktop' : d === 'tablet' ? 'Tablet' : 'Mobile';
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

const DIRECTIONS = [
  { value: 'row', label: 'Row' },
  { value: 'column', label: 'Column' },
  { value: 'row-reverse', label: 'Row reverse' },
  { value: 'column-reverse', label: 'Column reverse' },
];
const ALIGN = [
  { value: 'flex-start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'flex-end', label: 'End' },
  { value: 'stretch', label: 'Stretch' },
];
const JUSTIFY = [
  { value: 'flex-start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'flex-end', label: 'End' },
  { value: 'space-between', label: 'Between' },
  { value: 'space-around', label: 'Around' },
  { value: 'space-evenly', label: 'Evenly' },
];

function Divider({ bind, side }: { bind: Bind; side: 'top' | 'bottom' }) {
  const type = String(bind.attributes[`${side}Type`] ?? bind.defaults[`${side}Type`]);
  return (
    <>
      <Select
        bind={bind}
        name={`${side}Type`}
        label="Type"
        options={['none', ...SHAPE_TYPES].map((t) => ({
          value: t,
          label: t === 'none' ? 'None' : t.split('_').map(cap).join(' '),
        }))}
      />
      {type !== 'none' && (
        <>
          <Color bind={bind} name={`${side}Color`} label="Color" />
          <Range bind={bind} label="Width (%)" name={`${side}Width`} min={100} max={300} />
          <Range bind={bind} label="Height" keys={plain(`${side}Height`)} max={500} />
          <Toggle bind={bind} name={`${side}Flip`} label="Flip" />
          <Toggle bind={bind} name={`${side}Invert`} label="Invert" />
          <Toggle bind={bind} name={`${side}ContentAboveShape`} label="Content above the shape" />
        </>
      )}
    </>
  );
}

export const ContainerSettings: Inspector = ({ attributes, setAttributes, block, clientId }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  // A container not inside another container is a root: it sets the page's width.
  const isRoot = useSelect(
    (select) => {
      const editor = select(blockEditorStore) as unknown as {
        getBlockParentsByBlockName(id: string, name: string): string[];
      };
      return editor.getBlockParentsByBlockName(clientId, 'prisma/container').length === 0;
    },
    [clientId],
  );
  useEffect(() => {
    if (Boolean(attributes.isBlockRootParent) !== isRoot)
      setAttributes({ isBlockRootParent: isRoot });
  }, [isRoot, attributes.isBlockRootParent, setAttributes]);

  const grid = a.layout === 'grid';
  const type = a.backgroundType;
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Layout" initialOpen>
            <Choice
              bind={bind}
              name="layout"
              label="Layout"
              options={[
                { value: 'flex', label: 'Flex' },
                { value: 'grid', label: 'Grid' },
              ]}
            />
            {!grid && (
              <>
                <Choice
                  bind={bind}
                  keys={suffixed('direction')}
                  label="Direction"
                  options={DIRECTIONS}
                />
                <Choice
                  bind={bind}
                  keys={suffixed('alignItems')}
                  label="Align items"
                  options={ALIGN}
                />
                <Select
                  bind={bind}
                  keys={suffixed('justifyContent')}
                  label="Justify content"
                  options={JUSTIFY}
                />
                <Choice
                  bind={bind}
                  keys={suffixed('wrap')}
                  label="Wrap"
                  options={[
                    { value: 'nowrap', label: 'No wrap' },
                    { value: 'wrap', label: 'Wrap' },
                  ]}
                />
                <Choice
                  bind={bind}
                  keys={suffixed('childrenWidth')}
                  label="Children width"
                  options={[
                    { value: 'equal', label: 'Full' },
                    { value: 'auto', label: 'Auto' },
                  ]}
                />
              </>
            )}
            {grid && (
              <>
                <Select
                  bind={bind}
                  keys={suffixed('gridAlignItems')}
                  label="Align items"
                  options={['stretch', 'start', 'center', 'end'].map((v) => ({
                    value: v,
                    label: cap(v),
                  }))}
                />
                <Select
                  bind={bind}
                  keys={suffixed('gridJustifyItems')}
                  label="Justify items"
                  options={['stretch', 'start', 'center', 'end'].map((v) => ({
                    value: v,
                    label: cap(v),
                  }))}
                />
              </>
            )}
            <Range
              bind={bind}
              label="Row gap"
              keys={suffixed('rowGap')}
              unitKeys={plain('rowGapType')}
              units={['px', '%', 'em', 'rem']}
            />
            <Range
              bind={bind}
              label="Column gap"
              keys={suffixed('columnGap')}
              unitKeys={plain('columnGapType')}
              units={['px', '%', 'em', 'rem']}
            />
          </Panel>
          <Panel title="Container">
            {a.isBlockRootParent ? (
              <>
                <Select
                  bind={bind}
                  name="contentWidth"
                  label="Container width"
                  options={[
                    { value: 'alignfull', label: 'Full width' },
                    { value: 'alignwide', label: 'Wide' },
                    { value: 'default', label: 'Custom' },
                  ]}
                />
                {a.contentWidth === 'alignfull' && (
                  <Select
                    bind={bind}
                    name="innerContentWidth"
                    label="Content width"
                    options={[
                      { value: 'alignwide', label: 'Boxed' },
                      { value: 'alignfull', label: 'Full width' },
                    ]}
                  />
                )}
                {a.contentWidth === 'alignfull' && a.innerContentWidth === 'alignwide' && (
                  <Range
                    bind={bind}
                    label="Content box width"
                    keys={suffixed('innerContentCustomWidth')}
                    unitKeys={plain('innerContentCustomWidthType')}
                    units={['px', '%', 'vw']}
                    max={2000}
                  />
                )}
                {a.contentWidth === 'default' && (
                  <Range
                    bind={bind}
                    label="Width"
                    keys={suffixed('width')}
                    unitKeys={plain('widthType')}
                    units={['%', 'px', 'vw']}
                  />
                )}
              </>
            ) : (
              <Range
                bind={bind}
                label="Width"
                keys={suffixed('width')}
                unitKeys={plain('widthType')}
                units={['%', 'px', 'vw']}
              />
            )}
            <Range
              bind={bind}
              label="Minimum height"
              keys={suffixed('minHeight')}
              unitKeys={plain('minHeightType')}
              units={['px', 'vh', 'vw', '%']}
              max={1600}
            />
            <Select
              bind={bind}
              name="htmlTag"
              label="HTML tag"
              options={[
                'div',
                'header',
                'footer',
                'main',
                'article',
                'section',
                'aside',
                'nav',
                'a',
              ].map((t) => ({
                value: t,
                label: t === 'a' ? 'Link (a)' : t,
              }))}
            />
            {a.htmlTag === 'a' && (
              <Text
                bind={{
                  ...bind,
                  attributes: { url: (a.htmlTagLink as { url?: string })?.url ?? '' },
                  defaults: { url: '' },
                  setAttributes: (v) =>
                    setAttributes({ htmlTagLink: { ...(a.htmlTagLink as object), url: v.url } }),
                }}
                name="url"
                label="Link"
                placeholder="https://"
              />
            )}
            <Select
              bind={bind}
              name="overflow"
              label="Overflow"
              options={[
                { value: 'visible', label: 'Visible' },
                { value: 'hidden', label: 'Hidden' },
                { value: 'auto', label: 'Auto' },
              ]}
            />
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Background" initialOpen>
            <Select
              bind={bind}
              name="backgroundType"
              label="Type"
              options={[
                { value: 'none', label: 'None' },
                { value: 'color', label: 'Color' },
                { value: 'gradient', label: 'Gradient' },
                { value: 'image', label: 'Image' },
                { value: 'video', label: 'Video' },
              ]}
            />
            {type === 'color' && <Color bind={bind} name="backgroundColor" label="Color" />}
            {type === 'gradient' && <Gradient bind={bind} name="gradientValue" label="Gradient" />}
            {type === 'image' && (
              <>
                <Media bind={bind} name="backgroundImageDesktop" label="Image" />
                <Media bind={bind} name="backgroundImageTablet" label="Image on tablets" />
                <Media bind={bind} name="backgroundImageMobile" label="Image on phones" />
                <Select
                  bind={bind}
                  keys={suffixed('backgroundSize')}
                  label="Size"
                  options={['auto', 'cover', 'contain'].map((v) => ({ value: v, label: cap(v) }))}
                />
                <Select
                  bind={bind}
                  keys={suffixed('backgroundRepeat')}
                  label="Repeat"
                  options={['no-repeat', 'repeat', 'repeat-x', 'repeat-y'].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
                <Select
                  bind={bind}
                  keys={suffixed('backgroundAttachment')}
                  label="Attachment"
                  options={['scroll', 'fixed'].map((v) => ({ value: v, label: cap(v) }))}
                />
              </>
            )}
            {type === 'video' && (
              <>
                <Media bind={bind} name="backgroundVideo" label="Video" allowed={['video']} />
                <Media
                  bind={bind}
                  name="backgroundVideoFallbackImage"
                  label="Image while it loads"
                />
              </>
            )}
            {(type === 'image' || type === 'video') && (
              <>
                <Select
                  bind={bind}
                  name="overlayType"
                  label="Overlay"
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'color', label: 'Color' },
                    { value: 'gradient', label: 'Gradient' },
                    { value: 'image', label: 'Image' },
                  ]}
                />
                {a.overlayType === 'color' && (
                  <Color
                    bind={bind}
                    name={type === 'video' ? 'backgroundVideoColor' : 'backgroundImageColor'}
                    label="Overlay color"
                  />
                )}
                {a.overlayType === 'gradient' && (
                  <Gradient bind={bind} name="gradientValue" label="Overlay gradient" />
                )}
                {a.overlayType === 'image' && (
                  <Media bind={bind} name="backgroundOverlayImageDesktop" label="Overlay image" />
                )}
                {a.overlayType !== 'none' && (
                  <Range
                    bind={bind}
                    label="Overlay opacity"
                    name="overlayOpacity"
                    min={0}
                    max={1}
                    step={0.05}
                  />
                )}
              </>
            )}
          </Panel>
          <Panel title="Border">
            <Border bind={bind} prefix="container" />
          </Panel>
          <Panel title="Box shadow">
            <BoxShadow bind={bind} />
          </Panel>
          <Panel title="Colors">
            <Color bind={bind} name="textColor" label="Text" />
            <States
              normal={<Color bind={bind} name="linkColor" label="Links" />}
              hover={<Color bind={bind} name="linkHoverColor" label="Links" />}
            />
          </Panel>
          <Panel title="Shape dividers">
            <States
              labels={['Top', 'Bottom']}
              normal={<Divider bind={bind} side="top" />}
              hover={<Divider bind={bind} side="bottom" />}
            />
          </Panel>
        </>
      }
      advanced={
        <>
          <Panel title="Spacing" initialOpen>
            <Spacing
              bind={bind}
              label="Padding"
              keys={(side, d) => `${side}Padding${D(d)}`}
              unitKeys={plain('paddingType')}
              linkName="paddingLink"
              units={['px', '%', 'em', 'vw']}
            />
            <Spacing
              bind={bind}
              label="Margin"
              keys={(side, d) => `${side}Margin${D(d)}`}
              unitKeys={plain('marginType')}
              linkName="marginLink"
              units={['px', '%', 'em', 'vw']}
            />
          </Panel>
          <Panel title="Position">
            <Select
              bind={bind}
              keys={suffixed('order')}
              label="Order"
              options={[
                { value: 'initial', label: 'Default' },
                { value: '-99999', label: 'Start' },
                { value: '99999', label: 'End' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            <Range
              bind={bind}
              label="Custom order"
              keys={suffixed('customOrder')}
              min={-100}
              max={100}
            />
            <Range bind={bind} label="Z-index" keys={plain('zIndex')} min={-100} max={1000} />
          </Panel>
        </>
      }
    />
  );
};
