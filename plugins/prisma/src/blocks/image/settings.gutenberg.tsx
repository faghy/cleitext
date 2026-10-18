import { MediaUpload } from '@wordpress/block-editor';
import { Button } from '@wordpress/components';
import type { Bind } from '../../editor/controls/bind';
import { plain } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color } from '../../editor/controls/color';
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
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

/** Four margins of a part, e.g. `headingTopMargin`… with `headingMarginUnit`. */
function Margins({
  bind,
  prefix,
  label = 'Margin',
}: {
  bind: Bind;
  prefix: string;
  label?: string;
}) {
  return (
    <Spacing
      bind={bind}
      label={label}
      keys={(side, d) =>
        `${prefix}${side[0]!.toUpperCase()}${side.slice(1)}Margin${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`
      }
      unitKeys={plain(`${prefix}MarginUnit`)}
      linkName={`${prefix}MarginLink`}
    />
  );
}

export const ImageSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const overlay = a.layout === 'overlay';
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Image" initialOpen>
            <MediaUpload
              allowedTypes={['image']}
              onSelect={(m: {
                id: string;
                url: string;
                alt?: string;
                width?: number;
                height?: number;
              }) =>
                setAttributes({
                  id: m.id,
                  url: m.url,
                  alt: m.alt ?? '',
                  naturalWidth: m.width ?? '',
                  naturalHeight: m.height ?? '',
                })
              }
              render={({ open }: { open: () => void }) => (
                <div className="pr-media__box">
                  {a.url ? (
                    <button
                      type="button"
                      className="pr-media__preview"
                      onClick={open}
                      aria-label="Replace image"
                    >
                      <img src={String(a.url)} alt="" />
                    </button>
                  ) : (
                    <Button variant="secondary" onClick={open}>
                      Select image
                    </Button>
                  )}
                </div>
              )}
            />
            <Text
              bind={bind}
              name="alt"
              label="Alternative text"
              help="Describe the image for people who cannot see it."
            />
            <Choice
              bind={bind}
              name="layout"
              label="Layout"
              options={[
                { value: 'default', label: 'Normal' },
                { value: 'overlay', label: 'Overlay' },
              ]}
            />
            <Choice bind={bind} keys={plain('align')} label="Alignment" options={ALIGN} />
            <Range bind={bind} label="Width" keys={plain('width')} max={2000} />
            <Toggle bind={bind} name="customHeightSetDesktop" label="Custom height on desktop" />
            <Toggle bind={bind} name="customHeightSetTablet" label="Custom height on tablet" />
            <Toggle bind={bind} name="customHeightSetMobile" label="Custom height on mobile" />
            <Range bind={bind} label="Height" keys={plain('height')} max={2000} />
            <Select
              bind={bind}
              keys={plain('objectFit')}
              label="Object fit"
              options={[
                { value: '', label: 'Default' },
                { value: 'fill', label: 'Fill' },
                { value: 'cover', label: 'Cover' },
                { value: 'contain', label: 'Contain' },
              ]}
            />
            {!overlay && <Toggle bind={bind} name="enableCaption" label="Caption" />}
            <Toggle bind={bind} name="disableLazyLoad" label="Load at once (no lazy loading)" />
          </Panel>
          <Panel title="Link">
            <Text bind={bind} name="href" label="Link" placeholder="https://" />
            <Toggle bind={bind} name="linkTarget" label="Open in a new tab" />
          </Panel>
          {overlay && (
            <Panel title="Overlay content">
              <Select
                bind={bind}
                name="overlayContentPosition"
                label="Position"
                options={[
                  'top left',
                  'top center',
                  'top right',
                  'center left',
                  'center center',
                  'center right',
                  'bottom left',
                  'bottom center',
                  'bottom right',
                ].map((v) => ({ value: v, label: v.replace(/^\w|\s\w/g, (c) => c.toUpperCase()) }))}
              />
              <Select
                bind={bind}
                name="headingTag"
                label="Heading tag"
                options={['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div'].map((t) => ({
                  value: t,
                  label: t.toUpperCase(),
                }))}
              />
              <Select
                bind={bind}
                name="headingShowOn"
                label="Show heading"
                options={[
                  { value: 'always', label: 'Always' },
                  { value: 'hover', label: 'On hover' },
                ]}
              />
              <Select
                bind={bind}
                name="captionShowOn"
                label="Show description"
                options={[
                  { value: 'always', label: 'Always' },
                  { value: 'hover', label: 'On hover' },
                ]}
              />
              <Select
                bind={bind}
                name="seperatorStyle"
                label="Separator"
                options={['none', 'solid', 'double', 'dashed', 'dotted'].map((v) => ({
                  value: v,
                  label: v[0]!.toUpperCase() + v.slice(1),
                }))}
              />
              <Select
                bind={bind}
                name="seperatorPosition"
                label="Separator position"
                options={[
                  { value: 'before_title', label: 'Before the heading' },
                  { value: 'after_title', label: 'After the heading' },
                  { value: 'after_sub_title', label: 'After the description' },
                ]}
              />
            </Panel>
          )}
          <Panel title="Mask">
            <Select
              bind={bind}
              name="maskShape"
              label="Shape"
              options={[
                'none',
                'circle',
                'diamond',
                'hexagon',
                'rounded',
                'blob1',
                'blob2',
                'blob3',
                'blob4',
                'custom',
              ].map((v) => ({
                value: v,
                label:
                  v === 'none'
                    ? 'None'
                    : v.replace(/^blob(\d)$/, 'Blob $1').replace(/^\w/, (c) => c.toUpperCase()),
              }))}
            />
            {a.maskShape === 'custom' && (
              <Media bind={bind} name="maskCustomShape" label="Mask image" />
            )}
            {a.maskShape !== 'none' && (
              <>
                <Select
                  bind={bind}
                  name="maskSize"
                  label="Size"
                  options={['auto', 'contain', 'cover'].map((v) => ({
                    value: v,
                    label: v[0]!.toUpperCase() + v.slice(1),
                  }))}
                />
                <Select
                  bind={bind}
                  name="maskPosition"
                  label="Position"
                  options={[
                    'center top',
                    'center center',
                    'center bottom',
                    'left top',
                    'left center',
                    'left bottom',
                    'right top',
                    'right center',
                    'right bottom',
                  ].map((v) => ({ value: v, label: v }))}
                />
                <Select
                  bind={bind}
                  name="maskRepeat"
                  label="Repeat"
                  options={['no-repeat', 'repeat', 'repeat-x', 'repeat-y'].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
              </>
            )}
          </Panel>
          <Panel title="Hover effect">
            <Select
              bind={bind}
              name="imageHoverEffect"
              label="Effect"
              options={[
                { value: 'static', label: 'Static' },
                { value: 'zoomin', label: 'Zoom in' },
                { value: 'slide', label: 'Slide' },
                { value: 'grayscale', label: 'Gray scale' },
                { value: 'blur', label: 'Blur' },
              ]}
            />
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Image" initialOpen>
            <Border bind={bind} prefix="image" />
            <BoxShadow bind={bind} prefix="image" />
          </Panel>
          {overlay && (
            <Panel title="Overlay">
              <Color bind={bind} name="overlayBackground" label="Color" />
              <Range
                bind={bind}
                label="Opacity"
                name="overlayOpacity"
                min={0}
                max={1}
                step={0.05}
              />
              <Range
                bind={bind}
                label="Opacity on hover"
                name="overlayHoverOpacity"
                min={0}
                max={1}
                step={0.05}
              />
              <Range
                bind={bind}
                label="Distance from the edge"
                name="overlayPositionFromEdge"
                unitName="overlayPositionFromEdgeUnit"
                units={['px', '%', 'em']}
              />
              <Border bind={bind} prefix="overlay" />
            </Panel>
          )}
          {overlay && (
            <Panel title="Heading">
              <Color bind={bind} name="headingColor" label="Color" />
              <Typography bind={bind} prefix="heading" />
              <Margins bind={bind} prefix="heading" />
            </Panel>
          )}
          <Panel title={overlay ? 'Description' : 'Caption'}>
            <Color bind={bind} name="captionColor" label="Color" />
            {!overlay && (
              <Choice
                bind={bind}
                name="captionAlign"
                label="Alignment"
                options={[
                  { value: 'start', label: 'Start' },
                  { value: 'center', label: 'Center' },
                  { value: 'end', label: 'End' },
                ]}
              />
            )}
            <Typography bind={bind} prefix="caption" />
            <Margins bind={bind} prefix="caption" />
          </Panel>
          {overlay && a.seperatorStyle !== 'none' && (
            <Panel title="Separator">
              <Color bind={bind} name="seperatorColor" label="Color" />
              <Range
                bind={bind}
                label="Width"
                name="seperatorWidth"
                unitName="separatorWidthType"
                units={['%', 'px']}
              />
              <Range
                bind={bind}
                label="Thickness"
                name="seperatorThickness"
                unitName="seperatorThicknessUnit"
                units={['px']}
                max={20}
              />
              <Margins bind={bind} prefix="seperator" />
            </Panel>
          )}
        </>
      }
      advanced={
        <Panel title="Spacing" initialOpen>
          <Margins bind={bind} prefix="image" />
        </Panel>
      }
    />
  );
};
