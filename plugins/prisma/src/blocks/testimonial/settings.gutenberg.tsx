import { TextareaControl } from '@wordpress/components';
import { plain, type Bind } from '../../editor/controls/bind';
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
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { items, type TestimonialItem } from '.';

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const EMPTY: TestimonialItem = {
  description:
    'I have been working with these guys for years now! With lots of hard work and timely communication, they made sure they delivered the best to me. Highly recommended!',
  name: 'John Doe ',
  company: 'Company Name',
  image: '',
};

/** `paddingTop`, `paddingTopTablet`… (the content's padding, Spectra's names). */
const paddingKey = (p: string) => (side: string, d: 'desktop' | 'tablet' | 'mobile') =>
  `${p}${side[0]!.toUpperCase()}${side.slice(1)}${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`;

export const TestimonialSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const list = items(a);
  const side = a.imagePosition === 'left' || a.imagePosition === 'right';
  const bgType = String(a.backgroundType);
  const setItem = (i: number, change: Partial<TestimonialItem>) =>
    setAttributes({ test_block: list.map((t, n) => (n === i ? { ...t, ...change } : t)) });
  /** A bind over one testimonial, for the media control. */
  const itemBind = (i: number): Bind => ({
    attributes: { image: list[i]?.image ?? '' },
    defaults: {},
    setAttributes: (change) => setItem(i, change as Partial<TestimonialItem>),
  });
  const setCount = (raw: unknown) => {
    const n = Math.min(Math.max(Math.round(Number(raw) || 1), 1), 30);
    const next = list.slice(0, n);
    while (next.length < n) next.push({ ...EMPTY });
    setAttributes({ test_item_count: n, test_block: next });
  };
  const countBind: Bind = {
    attributes: { test_item_count: list.length },
    defaults: {},
    setAttributes: (change) => setCount(change.test_item_count),
  };
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="General" initialOpen>
            <Range
              bind={countBind}
              label="Number of testimonials"
              name="test_item_count"
              min={1}
              max={30}
            />
            <Range
              bind={bind}
              label="Columns"
              keys={(d) => (d === 'desktop' ? 'columns' : d === 'tablet' ? 'tcolumns' : 'mcolumns')}
              min={1}
              max={Math.max(1, list.length)}
            />
            <Choice bind={bind} keys={plain('headingAlign')} label="Alignment" options={ALIGN} />
            <Toggle bind={bind} name="equalHeight" label="Equal height" />
            {Boolean(a.equalHeight) && (
              <Choice
                bind={bind}
                name="vAlignContent"
                label="Vertical alignment"
                options={[
                  { value: 'flex-start', label: 'Top' },
                  { value: 'center', label: 'Middle' },
                  { value: 'flex-end', label: 'Bottom' },
                ]}
              />
            )}
          </Panel>
          <Panel title="Testimonials">
            {list.map((t, i) => (
              <div key={i} className="pr-repeater__item">
                <TextareaControl
                  __nextHasNoMarginBottom
                  label={`Testimonial ${i + 1}`}
                  value={String(t.description ?? '')}
                  onChange={(v: string) => setItem(i, { description: v })}
                />
                <TextareaControl
                  __nextHasNoMarginBottom
                  label="Name"
                  rows={1}
                  value={String(t.name ?? '')}
                  onChange={(v: string) => setItem(i, { name: v })}
                />
                <TextareaControl
                  __nextHasNoMarginBottom
                  label="Company"
                  rows={1}
                  value={String(t.company ?? '')}
                  onChange={(v: string) => setItem(i, { company: v })}
                />
                <Media bind={itemBind(i)} name="image" label="Image" />
              </div>
            ))}
          </Panel>
          <Panel title="Image">
            <Select
              bind={bind}
              name="imagePosition"
              label="Position"
              options={[
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
              ]}
            />
            {side && (
              <>
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
            <Choice
              bind={bind}
              name="iconimgStyle"
              label="Style"
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'circle', label: 'Circle' },
                { value: 'square', label: 'Square' },
              ]}
            />
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
          </Panel>
          <Panel title="Carousel">
            <Toggle bind={bind} name="pauseOnHover" label="Pause on hover" />
            <Toggle bind={bind} name="autoplay" label="Autoplay" />
            {Boolean(a.autoplay) && (
              <Range
                bind={bind}
                label="Autoplay speed (ms)"
                name="autoplaySpeed"
                min={100}
                max={10000}
                step={100}
              />
            )}
            <Toggle bind={bind} name="infiniteLoop" label="Infinite loop" />
            <Range
              bind={bind}
              label="Transition speed (ms)"
              name="transitionSpeed"
              min={100}
              max={5000}
              step={50}
            />
            <Select
              bind={bind}
              name="arrowDots"
              label="Show arrows and dots"
              options={[
                { value: 'arrows', label: 'Arrows' },
                { value: 'dots', label: 'Dots' },
                { value: 'arrowDots', label: 'Both' },
              ]}
            />
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Name" initialOpen>
            <Color bind={bind} name="authorColor" label="Color" />
            <Typography bind={bind} prefix="name" />
            <Range
              bind={bind}
              label="Bottom margin"
              keys={plain('nameSpace')}
              unitName="nameSpaceType"
              units={['px', 'em']}
              max={100}
            />
          </Panel>
          <Panel title="Content">
            <Color bind={bind} name="descColor" label="Color" />
            <Typography bind={bind} prefix="desc" />
            <Range
              bind={bind}
              label="Bottom margin"
              keys={plain('descSpace')}
              unitName="descSpaceType"
              units={['px', 'em']}
              max={100}
            />
          </Panel>
          <Panel title="Company">
            <Color bind={bind} name="companyColor" label="Color" />
            <Typography bind={bind} prefix="company" />
          </Panel>
          <Panel title="Image">
            <Spacing
              bind={bind}
              label="Padding"
              keys={paddingKey('imgpadding')}
              unitKeys={(d) =>
                d === 'desktop'
                  ? 'imgpaddingUnit'
                  : d === 'tablet'
                    ? 'imgtabletPaddingUnit'
                    : 'imgmobilePaddingUnit'
              }
              linkName="imgspacingLink"
            />
          </Panel>
          <Panel title="Arrows and dots">
            <Color bind={bind} name="arrowColor" label="Color" />
            <Range bind={bind} label="Arrow size" name="arrowSize" max={100} />
            <Range bind={bind} label="Arrow border size" name="arrowBorderSize" max={20} />
            <Range bind={bind} label="Arrow border radius" name="arrowBorderRadius" max={100} />
          </Panel>
          <Panel title="Background">
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
            {bgType === 'color' && <Color bind={bind} name="backgroundColor" label="Color" />}
            {bgType === 'gradient' && (
              <Gradient bind={bind} name="gradientValue" label="Gradient" />
            )}
            {bgType === 'image' && (
              <>
                <Media bind={bind} name="backgroundImage" label="Image" />
                <Select
                  bind={bind}
                  name="backgroundPosition"
                  label="Position"
                  options={['top', 'center', 'bottom'].flatMap((v) =>
                    ['left', 'center', 'right'].map((h) => ({
                      value: `${v}-${h}`,
                      label: `${v} ${h}`,
                    })),
                  )}
                />
                <Select
                  bind={bind}
                  name="backgroundRepeat"
                  label="Repeat"
                  options={['no-repeat', 'repeat', 'repeat-x', 'repeat-y'].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
                <Select
                  bind={bind}
                  name="backgroundSize"
                  label="Size"
                  options={['auto', 'cover', 'contain'].map((v) => ({ value: v, label: v }))}
                />
                <Choice
                  bind={bind}
                  name="overlayType"
                  label="Overlay"
                  options={[
                    { value: 'color', label: 'Color' },
                    { value: 'gradient', label: 'Gradient' },
                  ]}
                />
                {a.overlayType === 'gradient' ? (
                  <Gradient bind={bind} name="gradientValue" label="Overlay gradient" />
                ) : (
                  <>
                    <Color bind={bind} name="backgroundImageColor" label="Overlay color" />
                    <Range
                      bind={bind}
                      label="Overlay opacity"
                      name="backgroundOpacity"
                      min={0}
                      max={100}
                    />
                  </>
                )}
              </>
            )}
          </Panel>
          <Panel title="Border">
            <Border bind={bind} prefix="overall" />
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
              label="Padding"
              keys={paddingKey('padding')}
              unitKeys={(d) =>
                d === 'desktop'
                  ? 'paddingUnit'
                  : d === 'tablet'
                    ? 'tabletPaddingUnit'
                    : 'mobilePaddingUnit'
              }
              linkName="spacingLink"
            />
          </Panel>
        </>
      }
      advanced={null}
    />
  );
};
