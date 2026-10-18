import type { Bind } from '../../editor/controls/bind';
import { Color, States } from '../../editor/controls/color';
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
import { IconPicker } from '../../editor/controls/icon';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import {
  byDevice,
  IMAGE_SIZES,
  QueryFields,
  QueryOrder,
  TITLE_TAGS,
} from '../post-grid/settings-shared';

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];
const side = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const dev = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile';

export const PostTimelineSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Query" initialOpen>
            <QueryFields bind={bind} a={a} />
            <Range bind={bind} name="postsToShow" label="Posts Per Page" min={1} max={100} />
            <QueryOrder bind={bind} a={a} count={false} />
          </Panel>
          <Panel title="Layout">
            <Choice
              bind={bind}
              keys={(d) => `timelinAlignment${dev(d)}`}
              label="Orientation"
              options={ALIGN}
            />
            <Choice
              bind={bind}
              keys={(d) => `align${dev(d)}`}
              label="Text Alignment"
              options={ALIGN}
            />
            <Choice
              bind={bind}
              name="arrowlinAlignment"
              label="Arrow Alignment"
              options={[
                { value: 'top', label: 'Top' },
                { value: 'center', label: 'Center' },
                { value: 'bottom', label: 'Bottom' },
              ]}
            />
          </Panel>
          <Panel title="Image">
            <Toggle bind={bind} name="displayPostImage" label="Display Featured Image" />
            {Boolean(a.displayPostImage) && (
              <Select bind={bind} name="imageSize" label="Image Size" options={IMAGE_SIZES} />
            )}
          </Panel>
          <Panel title="Content">
            <Select bind={bind} name="headingTag" label="Heading Tag" options={TITLE_TAGS} />
            <Toggle bind={bind} name="displayPostAuthor" label="Display Post Author" />
            <Toggle bind={bind} name="displayPostDate" label="Display Post Date" />
            {Boolean(a.displayPostDate) && (
              <Select
                bind={bind}
                name="dateFormat"
                label="Date Format"
                options={[
                  { value: 'F j, Y', label: 'October 18, 2026' },
                  { value: 'Y-m-d', label: '2026-10-18' },
                  { value: 'm/d/Y', label: '10/18/2026' },
                  { value: 'd/m/Y', label: '18/10/2026' },
                  { value: 'j F Y', label: '18 October 2026' },
                  { value: 'M j, Y', label: 'Oct 18, 2026' },
                ]}
              />
            )}
            <Toggle bind={bind} name="displayPostExcerpt" label="Display Post Excerpt" />
            {Boolean(a.displayPostExcerpt) && (
              <Range bind={bind} name="exerptLength" label="Excerpt Length" min={1} max={500} />
            )}
            <Toggle bind={bind} name="displayPostLink" label="Display Continue Reading Link" />
            {Boolean(a.displayPostLink) && (
              <>
                <Text bind={bind} name="readMoreText" label="CTA Text" />
                <Toggle bind={bind} name="linkTarget" label="Open link in New Tab" />
                <Toggle bind={bind} name="inheritFromTheme" label="Inherit From Theme" />
                {Boolean(a.inheritFromTheme) && (
                  <Choice
                    bind={bind}
                    name="buttonType"
                    label="Button Type"
                    options={[
                      { value: 'primary', label: 'Primary' },
                      { value: 'secondary', label: 'Secondary' },
                    ]}
                  />
                )}
              </>
            )}
          </Panel>
          <Panel title="Connector">
            <IconPicker bind={bind} name="icon" />
            <Range bind={bind} name="iconSize" label="Icon Size" max={100} />
            <Range bind={bind} name="connectorBgsize" label="Icon Background Size" max={100} />
            <Range bind={bind} name="borderwidth" label="Border Width" max={10} />
            <Range bind={bind} name="separatorwidth" label="Connector Thickness" max={20} />
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Heading" initialOpen>
            <Typography bind={bind} prefix="head" />
            <Color bind={bind} name="headingColor" label="Color" />
            <Range bind={bind} keys={byDevice('headTopSpacing')} label="Top Spacing" max={100} />
            <Range bind={bind} keys={byDevice('headSpace')} label="Bottom Spacing" max={100} />
          </Panel>
          {Boolean(a.displayPostAuthor) && (
            <Panel title="Author">
              <Typography bind={bind} prefix="author" />
              <Color bind={bind} name="authorColor" label="Color" />
              <Range bind={bind} keys={byDevice('authorSpace')} label="Bottom Spacing" max={100} />
            </Panel>
          )}
          {Boolean(a.displayPostExcerpt) && (
            <Panel title="Content">
              <Typography bind={bind} prefix="subHead" />
              <Color bind={bind} name="subHeadingColor" label="Color" />
              <Range bind={bind} name="contentSpace" label="Bottom Spacing" max={100} />
            </Panel>
          )}
          {Boolean(a.displayPostDate) && (
            <Panel title="Date">
              <Typography bind={bind} prefix="date" />
              <Color bind={bind} name="dateColor" label="Color" />
              <Range
                bind={bind}
                keys={byDevice('dateBottomspace')}
                label="Bottom Spacing"
                max={100}
              />
            </Panel>
          )}
          {Boolean(a.displayPostLink) && !a.inheritFromTheme && (
            <Panel title="CTA">
              <Typography bind={bind} prefix="cta" />
              <Color bind={bind} name="ctaColor" label="Color" />
              <Color bind={bind} name="ctaBackground" label="Background Color" />
              <Range
                bind={bind}
                keys={byDevice('ctaBottomSpacing')}
                label="Bottom Spacing"
                max={100}
              />
            </Panel>
          )}
          <Panel title="Background">
            <Color bind={bind} name="backgroundColor" label="Background Color" />
            <Range bind={bind} keys={byDevice('borderRadius')} label="Border Radius" max={100} />
          </Panel>
          <Panel title="Connector">
            <Color bind={bind} name="separatorColor" label="Connector Color" />
            <States
              normal={
                <>
                  <Color bind={bind} name="iconColor" label="Icon Color" />
                  <Color bind={bind} name="separatorBg" label="Icon Background Color" />
                  <Color bind={bind} name="separatorBorder" label="Border Color" />
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="separatorFillColor" label="Connector Color" />
                  <Color bind={bind} name="iconFocus" label="Icon Color" />
                  <Color bind={bind} name="iconBgFocus" label="Icon Background Color" />
                  <Color bind={bind} name="borderFocus" label="Border Color" />
                </>
              }
            />
          </Panel>
          <Panel title="Spacing">
            <Spacing
              bind={bind}
              label="Post Padding"
              keys={(s, d) => (d === 'desktop' ? `${s}Padding` : `${s}Padding${side(d)}`)}
              unitKeys={(d) => (d === 'desktop' ? 'paddingUnit' : `${d}PaddingUnit`)}
              linkName="paddingLink"
              min={0}
            />
            <Range
              bind={bind}
              keys={byDevice('verticalSpace')}
              unitKeys={(d) => `verticalSpaceUnit${dev(d)}`}
              units={['px', 'em']}
              label="Gap Between Posts"
              max={200}
            />
            <Range
              bind={bind}
              keys={byDevice('horizontalSpace')}
              unitKeys={(d) => `horizontalSpaceUnit${dev(d)}`}
              units={['px', 'em']}
              label="Post - Marker Gap"
              max={200}
            />
          </Panel>
        </>
      }
    />
  );
};
