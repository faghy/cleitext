import { store as blockEditorStore } from '@wordpress/block-editor';
import { createBlock } from '@wordpress/blocks';
import { Button } from '@wordpress/components';
import { useDispatch } from '@wordpress/data';
import { plain, suffixed, type Bind } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color, Gradient } from '../../editor/controls/color';
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
import { BoxShadow } from '../../editor/controls/shadow';
import type { Inspector } from '../../editor/register';

const D = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? 'Desktop' : d === 'tablet' ? 'Tablet' : 'Mobile';
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const LIVE_ONLY = 'This takes effect on the site, not while editing.';

/** Background of the slider or of a slide: color, gradient or image with an overlay. */
function Background({ bind }: { bind: Bind }) {
  const a = { ...bind.defaults, ...bind.attributes };
  const type = a.backgroundType;
  return (
    <>
      <Select
        bind={bind}
        name="backgroundType"
        label="Type"
        options={[
          { value: 'none', label: 'None' },
          { value: 'color', label: 'Color' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'image', label: 'Image' },
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
          <Select
            bind={bind}
            name="overlayType"
            label="Overlay"
            options={[
              { value: 'none', label: 'None' },
              { value: 'color', label: 'Color' },
              { value: 'gradient', label: 'Gradient' },
            ]}
          />
          {a.overlayType === 'color' && (
            <Color bind={bind} name="backgroundImageColor" label="Overlay color" />
          )}
          {a.overlayType === 'gradient' && (
            <Gradient bind={bind} name="gradientValue" label="Overlay gradient" />
          )}
        </>
      )}
    </>
  );
}

function SpacingPanel({ bind }: { bind: Bind }) {
  return (
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
  );
}

export const SliderSettings: Inspector = ({ attributes, setAttributes, block, clientId }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const { insertBlock } = useDispatch(blockEditorStore) as unknown as {
    insertBlock(block: unknown, index: number | undefined, rootClientId: string): void;
  };
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Slider" initialOpen>
            <Button
              variant="secondary"
              onClick={() => insertBlock(createBlock('prisma/slide'), undefined, clientId)}
            >
              Add slide
            </Button>
            <Toggle bind={bind} name="autoplay" label="Autoplay" help={LIVE_ONLY} />
            {Boolean(a.autoplay) && (
              <>
                <Range
                  bind={bind}
                  label="Autoplay speed (ms)"
                  name="autoplaySpeed"
                  min={100}
                  max={15000}
                  step={100}
                />
                <Select
                  bind={bind}
                  name="pauseOn"
                  label="Pause on"
                  options={[
                    { value: 'hover', label: 'Hover' },
                    { value: 'click', label: 'Interaction' },
                    { value: 'none', label: 'None' },
                  ]}
                />
              </>
            )}
            <Toggle bind={bind} name="infiniteLoop" label="Infinite loop" help={LIVE_ONLY} />
            <Range
              bind={bind}
              label="Minimum height"
              keys={plain('minHeight')}
              min={100}
              max={1000}
            />
            <Select
              bind={bind}
              name="transitionEffect"
              label="Transition effect"
              options={[
                { value: 'slide', label: 'Slide' },
                { value: 'fade', label: 'Fade' },
                { value: 'flip', label: 'Flip' },
              ]}
            />
            <Range
              bind={bind}
              label="Transition speed (ms)"
              name="transitionSpeed"
              min={100}
              max={5000}
              step={50}
            />
          </Panel>
          <Panel title="Navigation">
            <Toggle bind={bind} name="displayArrows" label="Arrows" />
            <Toggle bind={bind} name="displayDots" label="Dots" />
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Content" initialOpen>
            <Choice
              bind={bind}
              name="verticalAlign"
              label="Vertical alignment"
              options={[
                { value: 'start', label: 'Top' },
                { value: 'center', label: 'Center' },
                { value: 'end', label: 'Bottom' },
              ]}
            />
          </Panel>
          <Panel title="Background">
            <Background bind={bind} />
          </Panel>
          <Panel title="Border">
            <Border bind={bind} prefix="slider" />
          </Panel>
          <Panel title="Box shadow">
            <Toggle bind={bind} name="useSeparateBoxShadows" label="Separate hover shadow" />
            <BoxShadow bind={bind} hover={Boolean(a.useSeparateBoxShadows)} />
          </Panel>
          {(Boolean(a.displayArrows) || Boolean(a.displayDots)) && (
            <Panel title="Arrows and dots">
              <Color bind={bind} name="arrowColor" label="Color" />
              {Boolean(a.displayArrows) && (
                <>
                  <Color bind={bind} name="arrowBgColor" label="Background color" />
                  <Range bind={bind} label="Size" keys={plain('arrowSize')} min={0} max={100} />
                  <Range
                    bind={bind}
                    label="Padding"
                    keys={plain('arrowPadding')}
                    min={0}
                    max={100}
                  />
                  <Range
                    bind={bind}
                    label="Arrow distance from edges"
                    keys={plain('arrowDistance')}
                    min={-100}
                    max={100}
                  />
                </>
              )}
              {Boolean(a.displayDots) && (
                <Range
                  bind={bind}
                  label="Distance of the dots from the bottom"
                  keys={plain('dotsMarginTop')}
                  min={-100}
                  max={100}
                />
              )}
            </Panel>
          )}
        </>
      }
      advanced={<SpacingPanel bind={bind} />}
    />
  );
};

export const SlideSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  return (
    <InspectorTabs
      style={
        <Panel title="Background" initialOpen>
          <Background bind={bind} />
        </Panel>
      }
      advanced={<SpacingPanel bind={bind} />}
    />
  );
};
