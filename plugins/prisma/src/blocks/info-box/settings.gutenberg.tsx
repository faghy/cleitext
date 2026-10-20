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
  Text,
  Toggle,
} from '../../editor/controls/fields';
import { IconPicker } from '../../editor/controls/icon';
import { Media } from '../../editor/controls/media';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { Sides } from '../heading/settings.gutenberg';

const TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span'].map((t) => ({
  value: t,
  label: t.toUpperCase(),
}));

/** Bottom space and top/left/right margins of a text part, with Spectra's names. */
function PartSpacing({ bind, p }: { bind: Bind; p: string }) {
  const P = p === 'seperator' ? 'separator' : p;
  return (
    <Spacing
      bind={bind}
      label="Margin"
      keys={(side, d) => {
        if (side === 'bottom')
          return d === 'desktop' ? `${p}Space` : `${p}${d === 'tablet' ? 'Tablet' : 'Mobile'}Space`;
        const S = side[0]!.toUpperCase() + side.slice(1);
        return d === 'desktop'
          ? `${P}${S}Margin`
          : `${P}Margin${S}${d === 'tablet' ? 'Tablet' : 'Mobile'}`;
      }}
      unitKeys={(d) =>
        d === 'desktop' ? `${p}SpaceUnit` : `${P}${d === 'tablet' ? 'Tablet' : 'Mobile'}MarginUnit`
      }
    />
  );
}

export const InfoBoxSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const image = a.source_type === 'image';
  const side = a.iconimgPosition === 'left' || a.iconimgPosition === 'right';
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Icon or image" initialOpen>
            <Toggle bind={bind} name="showIcon" label="Show" />
            <Choice
              bind={bind}
              name="source_type"
              label="Type"
              options={[
                { value: 'icon', label: 'Icon' },
                { value: 'image', label: 'Image' },
              ]}
            />
            {image ? (
              <>
                <Media bind={bind} name="iconImage" label="Image" />
                <Text bind={bind} name="imageAlt" label="Alternative text" />
              </>
            ) : (
              <IconPicker bind={bind} name="icon" />
            )}
            <Select
              bind={bind}
              name="iconimgPosition"
              label="Position"
              options={[
                { value: 'above-title', label: 'Above the title' },
                { value: 'below-title', label: 'Below the title' },
                { value: 'left-title', label: 'Left of the title' },
                { value: 'right-title', label: 'Right of the title' },
                { value: 'left', label: 'Left of the text' },
                { value: 'right', label: 'Right of the text' },
              ]}
            />
            {side && (
              <>
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
                <Choice
                  bind={bind}
                  name="sourceAlign"
                  label="Vertical alignment"
                  options={[
                    { value: 'top', label: 'Top' },
                    { value: 'middle', label: 'Middle' },
                  ]}
                />
              </>
            )}
          </Panel>
          <Panel title="Content">
            <Toggle bind={bind} name="showPrefix" label="Prefix" />
            {Boolean(a.showPrefix) && (
              <Select bind={bind} name="prefixHeadingTag" label="Prefix tag" options={TAGS} />
            )}
            <Toggle bind={bind} name="showTitle" label="Title" />
            <Select bind={bind} name="headingTag" label="Title tag" options={TAGS} />
            <Toggle bind={bind} name="showDesc" label="Description" />
            {!side && (
              <Choice
                bind={bind}
                keys={plain('headingAlign')}
                label="Alignment"
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            )}
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
              ].map((t) => ({ value: t, label: t }))}
            />
          </Panel>
          <Panel title="Separator">
            <Select
              bind={bind}
              name="seperatorStyle"
              label="Style"
              options={['none', 'solid', 'double', 'dashed', 'dotted'].map((v) => ({
                value: v,
                label: v[0]!.toUpperCase() + v.slice(1),
              }))}
            />
            {a.seperatorStyle !== 'none' && (
              <Select
                bind={bind}
                name="seperatorPosition"
                label="Position"
                options={[
                  { value: 'after_icon', label: 'After the icon' },
                  { value: 'after_prefix', label: 'After the prefix' },
                  { value: 'after_title', label: 'After the title' },
                  { value: 'after_desc', label: 'After the description' },
                ]}
              />
            )}
          </Panel>
          <Panel title="Call to action">
            <Select
              bind={bind}
              name="ctaType"
              label="Type"
              options={[
                { value: 'none', label: 'None' },
                { value: 'text', label: 'Text' },
                { value: 'button', label: 'Button' },
                { value: 'all', label: 'Complete box' },
              ]}
            />
            {a.ctaType !== 'none' && (
              <>
                <Text bind={bind} name="ctaLink" label="Link" placeholder="https://" />
                <Toggle bind={bind} name="ctaTarget" label="Open in a new tab" />
              </>
            )}
            {(a.ctaType === 'text' || a.ctaType === 'button') && (
              <>
                <Toggle bind={bind} name="showCtaIcon" label="Icon" />
                {Boolean(a.showCtaIcon) && (
                  <>
                    <IconPicker bind={bind} name="ctaIcon" />
                    <Choice
                      bind={bind}
                      name="ctaIconPosition"
                      label="Icon position"
                      options={[
                        { value: 'before', label: 'Before' },
                        { value: 'after', label: 'After' },
                      ]}
                    />
                  </>
                )}
              </>
            )}
          </Panel>
        </>
      }
      style={
        <>
          {!image ? (
            <Panel title="Icon" initialOpen>
              <Range
                bind={bind}
                label="Size"
                keys={plain('iconSize')}
                unitName="iconSizeType"
                units={['px', 'em', '%']}
                max={300}
              />
              <States
                normal={<Color bind={bind} name="iconColor" label="Color" />}
                hover={<Color bind={bind} name="iconHover" label="Color" />}
              />
              <Select
                bind={bind}
                name="iconView"
                label="View"
                options={[
                  { value: 'none', label: 'Default' },
                  { value: 'Stacked', label: 'Stacked' },
                  { value: 'Framed', label: 'Framed' },
                ]}
              />
              {a.iconView !== 'none' && (
                <>
                  <Choice
                    bind={bind}
                    name="iconShape"
                    label="Shape"
                    options={[
                      { value: 'Circle', label: 'Circle' },
                      { value: 'Square', label: 'Square' },
                    ]}
                  />
                  <States
                    normal={
                      <Color
                        bind={bind}
                        name="iconBackgroundColor"
                        label={a.iconView === 'Framed' ? 'Frame' : 'Background'}
                      />
                    }
                    hover={
                      <Color
                        bind={bind}
                        name="iconBackgroundHoverColor"
                        label={a.iconView === 'Framed' ? 'Frame' : 'Background'}
                      />
                    }
                  />
                  {a.iconView === 'Framed' && (
                    <Range bind={bind} label="Frame width" name="iconBorderWidth" max={20} />
                  )}
                </>
              )}
              <Spacing
                bind={bind}
                label="Margin"
                keys={(s, d) => {
                  const S = s[0]!.toUpperCase() + s.slice(1);
                  return d === 'desktop'
                    ? `icon${S}Margin`
                    : `iconMargin${S}${d === 'tablet' ? 'Tablet' : 'Mobile'}`;
                }}
                unitKeys={(d) =>
                  d === 'desktop'
                    ? 'iconMarginUnit'
                    : `icon${d === 'tablet' ? 'Tablet' : 'Mobile'}MarginUnit`
                }
              />
            </Panel>
          ) : (
            <Panel title="Image" initialOpen>
              <Select
                bind={bind}
                name="imageRatio"
                label="Proportion"
                options={[
                  { value: '', label: 'Original' },
                  { value: '1/1', label: 'Square 1:1' },
                  { value: '4/3', label: '4:3' },
                  { value: '3/2', label: '3:2' },
                  { value: '16/9', label: '16:9' },
                  { value: '3/4', label: 'Portrait 3:4' },
                ]}
              />
              {Boolean(a.imageRatio) && (
                <Select
                  bind={bind}
                  name="imageFit"
                  label="Fit"
                  options={[
                    { value: 'cover', label: 'Crop to fill' },
                    { value: 'contain', label: 'Whole picture' },
                  ]}
                />
              )}
              <Toggle bind={bind} name="imageWidthType" label="Custom width" />
              {Boolean(a.imageWidthType) && (
                <Range
                  bind={bind}
                  label="Width"
                  keys={plain('imageWidth')}
                  unitKeys={plain('imageWidthUnit')}
                  units={['px', '%']}
                  max={1000}
                />
              )}
              <Range
                bind={bind}
                label="Rounded corners"
                name="iconimgBorderRadius"
                unitName="iconimgBorderRadiusUnit"
                units={['px', '%']}
              />
            </Panel>
          )}
          {Boolean(a.showPrefix) && (
            <Panel title="Prefix">
              <Color bind={bind} name="prefixColor" label="Color" />
              <Typography bind={bind} prefix="prefix" />
              <PartSpacing bind={bind} p="prefix" />
            </Panel>
          )}
          <Panel title="Title">
            <Color bind={bind} name="headingColor" label="Color" />
            <Typography bind={bind} prefix="head" />
            <PartSpacing bind={bind} p="head" />
          </Panel>
          <Panel title="Description">
            <Color bind={bind} name="subHeadingColor" label="Color" />
            <Typography bind={bind} prefix="subHead" />
            <PartSpacing bind={bind} p="subHead" />
          </Panel>
          {a.seperatorStyle !== 'none' && (
            <Panel title="Separator">
              <Color bind={bind} name="seperatorColor" label="Color" />
              <Range
                bind={bind}
                label="Width"
                keys={plain('seperatorWidth')}
                unitName="separatorWidthType"
                units={['%', 'px']}
              />
              <Range
                bind={bind}
                label="Thickness"
                name="seperatorThickness"
                unitName="thicknessUnit"
                units={['px']}
                max={20}
              />
              <PartSpacing bind={bind} p="seperator" />
            </Panel>
          )}
          {(a.ctaType === 'text' || a.ctaType === 'button') && (
            <Panel title="Call to action">
              <Typography bind={bind} prefix="cta" />
              <Range
                bind={bind}
                label="Icon spacing"
                keys={plain('ctaIconSpace')}
                unitName="ctaIconSpaceType"
                units={['px']}
                max={50}
              />
              {a.ctaType === 'text' ? (
                <States
                  normal={<Color bind={bind} name="ctaLinkColor" label="Color" />}
                  hover={<Color bind={bind} name="ctaLinkHoverColor" label="Color" />}
                />
              ) : (
                <>
                  <States
                    normal={
                      <>
                        <Color bind={bind} name="ctaBtnLinkColor" label="Text" />
                        <Color bind={bind} name="ctaBgColor" label="Background" />
                      </>
                    }
                    hover={
                      <>
                        <Color bind={bind} name="ctaLinkHoverColor" label="Text" />
                        <Color bind={bind} name="ctaBgHoverColor" label="Background" />
                      </>
                    }
                  />
                  <Spacing
                    bind={bind}
                    label="Padding"
                    keys={(s, d) =>
                      `paddingBtn${s[0]!.toUpperCase()}${s.slice(1)}${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`
                    }
                    unitKeys={(d) => (d === 'desktop' ? 'paddingBtnUnit' : `${d}PaddingBtnUnit`)}
                  />
                  <Border bind={bind} prefix="btn" />
                </>
              )}
            </Panel>
          )}
          <Panel title="Box border">
            <Border bind={bind} prefix="infobox" />
          </Panel>
        </>
      }
      advanced={
        <Panel title="Spacing" initialOpen>
          <Sides bind={bind} prefix="block" kind="Padding" />
          <Sides bind={bind} prefix="block" kind="Margin" />
        </Panel>
      }
    />
  );
};
