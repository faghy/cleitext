import type { Bind } from '../../editor/controls/bind';
import { Color } from '../../editor/controls/color';
import { Choice, InspectorTabs, Panel, Range, Text, Toggle } from '../../editor/controls/fields';
import type { Inspector } from '../../editor/register';
import {
  BoxStyle,
  byDevice,
  Columns,
  ContentPanel,
  ImagePanel,
  LayoutStyle,
  PartsStyle,
  QueryFields,
  QueryOrder,
  ReadMorePanel,
} from '../post-grid/settings-shared';

export const PostCarouselSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="General" initialOpen>
            <QueryFields bind={bind} a={a} />
            <QueryOrder bind={bind} a={a} />
            <Columns bind={bind} />
            <Toggle bind={bind} name="equalHeight" label="Equal Height" />
            <Text bind={bind} name="postDisplaytext" label="Display Message" />
          </Panel>
          <Panel title="Carousel">
            <Toggle bind={bind} name="pauseOnHover" label="Pause On Hover" />
            <Toggle bind={bind} name="autoplay" label="Autoplay" />
            {Boolean(a.autoplay) && (
              <Range
                bind={bind}
                name="autoplaySpeed"
                label="Autoplay Speed (ms)"
                min={500}
                max={10000}
                step={100}
              />
            )}
            <Toggle bind={bind} name="infiniteLoop" label="Infinite Loop" />
            <Range
              bind={bind}
              name="transitionSpeed"
              label="Transition Speed (ms)"
              min={100}
              max={5000}
              step={50}
            />
            <Choice
              bind={bind}
              name="arrowDots"
              label="Arrows & Dots Type"
              options={[
                { value: 'arrows', label: 'Arrows' },
                { value: 'dots', label: 'Dots' },
                { value: 'arrows_dots', label: 'Both' },
              ]}
            />
          </Panel>
          <ImagePanel bind={bind} a={a} />
          <ContentPanel bind={bind} a={a} />
          <ReadMorePanel bind={bind} a={a} />
        </>
      }
      style={
        <>
          <LayoutStyle bind={bind} a={a} />
          <PartsStyle bind={bind} a={a} />
          <Panel title="Arrow and Dots">
            <Color bind={bind} name="arrowColor" label="Color" />
            {a.arrowDots !== 'dots' && (
              <>
                <Range bind={bind} name="arrowSize" label="Size" max={80} />
                <Range bind={bind} name="arrowBorderSize" label="Border Size" max={20} />
                <Range bind={bind} name="arrowBorderRadius" label="Border Radius" max={100} />
                <Range
                  bind={bind}
                  keys={byDevice('arrowDistance')}
                  label="Arrow Distance from Edges"
                  min={-100}
                  max={100}
                />
              </>
            )}
            {a.arrowDots !== 'arrows' && (
              <Range
                bind={bind}
                keys={byDevice('dotsMarginTop')}
                unitName="dotsMarginTopUnit"
                units={['px', 'em']}
                label="Top Margin for Dots"
                max={100}
              />
            )}
          </Panel>
          <BoxStyle bind={bind} />
        </>
      }
    />
  );
};
