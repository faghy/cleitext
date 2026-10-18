import { ToggleControl } from '@wordpress/components';
import { plain, type Bind } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color, States } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Spacing,
  Toggle,
} from '../../editor/controls/fields';
import { IconPicker } from '../../editor/controls/icon';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];
const D = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? 'Desktop' : d === 'tablet' ? 'Tablet' : 'Mobile';
const S = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile';
/**
 * The list's typography has no prefix (`fontFamily`, `fontTransform`…):
 * the typography control's names (`FontFamily`, `Transform`…) are mapped.
 */
function listTypography(bind: Bind): Bind {
  const name = (key: string) =>
    key === 'Transform' || key === 'Decoration'
      ? `font${key}`
      : key[0]!.toLowerCase() + key.slice(1);
  const proxy = (source: Record<string, unknown>) =>
    new Proxy(source, {
      get: (target, key) => (typeof key === 'string' ? target[name(key)] : undefined),
      has: (target, key) => typeof key === 'string' && name(key) in target,
    });
  return {
    attributes: proxy(bind.attributes),
    defaults: proxy(bind.defaults),
    setAttributes: (values) =>
      bind.setAttributes(Object.fromEntries(Object.entries(values).map(([k, v]) => [name(k), v]))),
  };
}
const FRONT_ONLY = 'This takes effect on the site, not while editing.';

export const TableOfContentsSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const mapping = Array.isArray(a.mappingHeaders)
    ? (a.mappingHeaders as unknown[])
    : [true, true, true, true, true, true];
  const separator = a.separatorStyle !== 'none';
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Choose heading tags to generate the table" initialOpen>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <ToggleControl
                key={i}
                __nextHasNoMarginBottom
                label={`H${i + 1}`}
                checked={mapping[i] !== false}
                onChange={(checked: boolean) => {
                  const next = [0, 1, 2, 3, 4, 5].map((j) =>
                    j === i ? checked : mapping[j] !== false,
                  );
                  setAttributes({ mappingHeaders: next, [`considerH${i + 1}`]: checked });
                }}
              />
            ))}
          </Panel>
          <Panel title="Content">
            <Choice bind={bind} name="overallAlign" label="Overall alignment" options={ALIGN} />
            <Choice bind={bind} name="headingAlignment" label="Title alignment" options={ALIGN} />
            <Choice bind={bind} name="align" label="List alignment" options={ALIGN} />
            <Range bind={bind} label="Columns" keys={(d) => `tColumns${D(d)}`} min={1} max={3} />
            <Range
              bind={bind}
              label="Gap between lists"
              keys={(d) => `contentPadding${D(d)}`}
              unitKeys={(d) => `contentPaddingType${D(d)}`}
              units={['px', '%']}
              min={0}
              max={100}
            />
            <Toggle
              bind={bind}
              name="customWidth"
              label="Custom width"
              help="Without it, the table is as wide as its content."
            />
            {Boolean(a.customWidth) && (
              <Range
                bind={bind}
                label="Width"
                keys={(d) => `width${D(d)}`}
                unitKeys={(d) => `widthType${D(d)}`}
                units={['px', '%']}
                min={0}
                max={1500}
              />
            )}
            <Toggle bind={bind} name="disableBullets" label="Disable marker" />
            {!a.disableBullets && (
              <Select
                bind={bind}
                name="markerView"
                label="Marker view"
                options={[
                  { value: 'disc', label: 'Bullets' },
                  { value: 'decimal', label: 'Numbers' },
                ]}
              />
            )}
            <Toggle bind={bind} name="makeCollapsible" label="Make content collapsible" />
            {Boolean(a.makeCollapsible) && (
              <>
                <Toggle
                  bind={bind}
                  name="initialCollapse"
                  label="Keep collapsed initially"
                  help={FRONT_ONLY}
                />
                <IconPicker bind={bind} name="icon" label="Icon" />
                <Range bind={bind} label="Icon size" name="iconSize" min={0} max={100} />
              </>
            )}
            <Select
              bind={bind}
              name="separatorStyle"
              label="Separator style"
              options={[
                { value: 'none', label: 'None' },
                { value: 'solid', label: 'Solid' },
                { value: 'double', label: 'Double' },
                { value: 'dashed', label: 'Dashed' },
                { value: 'dotted', label: 'Dotted' },
              ]}
            />
            <Toggle
              bind={bind}
              name="enableCollapsableList"
              label="Make list collapsible"
              help={FRONT_ONLY}
            />
            {Boolean(a.enableCollapsableList) && (
              <>
                <Range
                  bind={bind}
                  label="Collapsible level"
                  name="collapsibleListDepth"
                  min={1}
                  max={5}
                  help="With 1, only first-level headings with sub-headings get a toggle; higher values add deeper levels."
                />
                <Toggle
                  bind={bind}
                  name="initiallyCollapseList"
                  label="Initially collapsed"
                  help={FRONT_ONLY}
                />
              </>
            )}
          </Panel>
          <Panel title="Scroll">
            <Toggle bind={bind} name="smoothScroll" label="Smooth scroll" help={FRONT_ONLY} />
            {Boolean(a.smoothScroll) && (
              <Range
                bind={bind}
                label="Smooth scroll offset"
                name="smoothScrollOffset"
                min={0}
                max={1000}
              />
            )}
            <Toggle
              bind={bind}
              name="scrollToTop"
              label="Show scroll to top"
              help="Adds a button that goes back to the top at the bottom of the page."
            />
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="General" initialOpen>
            <Color bind={bind} name="backgroundColor" label="Background" />
            <Spacing
              bind={bind}
              label="Padding"
              keys={(side, d) => `${side}Padding${S(d)}`}
              unitKeys={(d) => `paddingType${D(d)}`}
              linkName="paddingLink"
              units={['px', '%', 'em']}
            />
            <Border bind={bind} prefix="overall" />
          </Panel>
          <Panel title="Title">
            <Color bind={bind} name="headingColor" label="Color" />
            <Typography bind={bind} prefix="heading" />
            <Range
              bind={bind}
              label="Bottom spacing"
              keys={plain('headingBottom')}
              min={0}
              max={100}
            />
            {Boolean(a.makeCollapsible) && (
              <Color bind={bind} name="iconColor" label="Icon color" />
            )}
          </Panel>
          <Panel title="List">
            <States
              normal={<Color bind={bind} name="linkColor" label="Color" />}
              hover={<Color bind={bind} name="linkHoverColor" label="Color" />}
            />
            <Typography bind={listTypography(bind)} prefix="" />
            <Spacing
              bind={bind}
              label="Inner content spacing"
              keys={(side, d) => `${side}Margin${S(d)}`}
              unitKeys={(d) => `marginType${D(d)}`}
              linkName="marginLink"
              units={['px', '%', 'em']}
            />
            {!a.disableBullets && <Color bind={bind} name="bulletColor" label="Marker color" />}
          </Panel>
          {Boolean(a.scrollToTop) && (
            <Panel title="Scroll to top">
              <Color bind={bind} name="scrollToTopColor" label="Icon color" />
              <Color bind={bind} name="scrollToTopBgColor" label="Background color" />
            </Panel>
          )}
          {separator && (
            <Panel title="Separator">
              <Range
                bind={bind}
                label="Thickness"
                name="separatorHeight"
                min={0}
                max={20}
                help="Set at least 3px to see a double border."
              />
              <States
                normal={<Color bind={bind} name="separatorColor" label="Color" />}
                hover={<Color bind={bind} name="separatorHColor" label="Color" />}
              />
              <Range
                bind={bind}
                label="Bottom spacing"
                keys={plain('separatorSpace')}
                min={0}
                max={100}
              />
            </Panel>
          )}
        </>
      }
    />
  );
};
