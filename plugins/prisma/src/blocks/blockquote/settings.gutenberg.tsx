import { plain, type Bind } from '../../editor/controls/bind';
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
import { Media } from '../../editor/controls/media';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export const BlockquoteSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const quotation = a.skinStyle === 'quotation';
  const image = Boolean(
    a.authorImage && typeof a.authorImage === 'object' && (a.authorImage as { url?: string }).url,
  );
  const tweet = Boolean(a.enableTweet);
  const button = a.iconSkin !== 'link';
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Layout" initialOpen>
            <Choice
              bind={bind}
              name="skinStyle"
              label="Layout"
              options={[
                { value: 'border', label: 'Border' },
                { value: 'quotation', label: 'Quotation' },
              ]}
            />
            {quotation && (
              <>
                <Choice
                  bind={bind}
                  name="quoteStyle"
                  label="Quote style"
                  options={[
                    { value: 'style_1', label: 'Inline' },
                    { value: 'style_2', label: 'Floated' },
                  ]}
                />
                <Choice bind={bind} name="align" label="Alignment" options={ALIGN} />
              </>
            )}
          </Panel>
          <Panel title="Author image">
            <Media bind={bind} name="authorImage" label="Image" />
            {image && (
              <>
                <Select
                  bind={bind}
                  name="authorImgPosition"
                  label="Position"
                  options={[
                    { value: 'left', label: 'Left' },
                    { value: 'right', label: 'Right' },
                    { value: 'top', label: 'Top' },
                  ]}
                />
                {a.authorImgPosition !== 'top' && (
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
                )}
              </>
            )}
          </Panel>
          <Panel title="Share on X">
            <Toggle bind={bind} name="enableTweet" label="Enable" />
            {tweet && (
              <>
                <Select
                  bind={bind}
                  name="iconView"
                  label="View"
                  options={[
                    { value: 'icon_text', label: 'Icon and text' },
                    { value: 'icon', label: 'Icon' },
                    { value: 'text', label: 'Text' },
                  ]}
                />
                <Select
                  bind={bind}
                  name="iconSkin"
                  label="Style"
                  options={[
                    { value: 'classic', label: 'Classic' },
                    { value: 'bubble', label: 'Bubble' },
                    { value: 'link', label: 'Link' },
                  ]}
                />
                {a.iconView !== 'icon' && <Text bind={bind} name="iconLabel" label="Label" />}
                <Select
                  bind={bind}
                  name="iconTargetUrl"
                  label="Address shared"
                  options={[
                    { value: 'current', label: 'This page' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
                {a.iconTargetUrl !== 'current' && (
                  <Text bind={bind} name="customUrl" label="Address" placeholder="https://" />
                )}
                <Text
                  bind={bind}
                  name="iconShareVia"
                  label="Share via"
                  placeholder="@username"
                  help="The account mentioned with the post."
                />
              </>
            )}
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Quote" initialOpen>
            <Color bind={bind} name="descColor" label="Color" />
            <Typography bind={bind} prefix="desc" />
            <Range
              bind={bind}
              label="Bottom margin"
              keys={plain('descSpace')}
              unitName="descSpaceUnit"
              units={['px', 'em', 'rem']}
              max={200}
            />
          </Panel>
          {quotation ? (
            <Panel title="Quote icon">
              <States
                normal={
                  <>
                    <Color bind={bind} name="quoteColor" label="Color" />
                    <Color bind={bind} name="quoteBgColor" label="Background" />
                  </>
                }
                hover={
                  <>
                    <Color bind={bind} name="quoteHoverColor" label="Color" />
                    <Color bind={bind} name="quoteBgHoverColor" label="Background" />
                  </>
                }
              />
              <Range
                bind={bind}
                label="Size"
                keys={plain('quoteSize')}
                unitName="quoteSizeType"
                units={['px', 'em']}
                max={200}
              />
              <Range
                bind={bind}
                label="Background size"
                keys={plain('quotePadding')}
                unitName="quotePaddingType"
                units={['px', 'em']}
                max={200}
              />
              <Range
                bind={bind}
                label="Rounded corners"
                name="quoteBorderRadius"
                unitName="quoteBorderRadiusUnit"
                units={['%', 'px']}
              />
              <Spacing
                bind={bind}
                label="Margin"
                keys={(side, d) =>
                  `quote${side[0]!.toUpperCase()}${side.slice(1)}Margin${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`
                }
                unitKeys={(d) => (d === 'desktop' ? 'quoteUnit' : `quote${d}Unit`)}
              />
            </Panel>
          ) : (
            <Panel title="Border">
              <Select
                bind={bind}
                name="borderStyle"
                label="Style"
                options={['solid', 'dashed', 'dotted', 'double', 'none'].map((v) => ({
                  value: v,
                  label: v[0]!.toUpperCase() + v.slice(1),
                }))}
              />
              <States
                normal={<Color bind={bind} name="borderColor" label="Color" />}
                hover={<Color bind={bind} name="borderHoverColor" label="Color" />}
              />
              <Range
                bind={bind}
                label="Width"
                name="borderWidth"
                unitName="borderWidthUnit"
                units={['px']}
                max={50}
              />
              <Range
                bind={bind}
                label="Gap"
                keys={plain('borderGap')}
                unitName="borderGapUnit"
                units={['px', 'em']}
                max={200}
              />
              <Range
                bind={bind}
                label="Vertical padding"
                keys={plain('verticalPadding')}
                unitName="verticalPaddingUnit"
                units={['px', 'em']}
                max={200}
              />
            </Panel>
          )}
          <Panel title="Author">
            <Color bind={bind} name="authorColor" label="Color" />
            <Typography bind={bind} prefix="author" />
            {quotation && a.align === 'center' && (
              <Range bind={bind} label="Bottom margin" keys={plain('authorSpace')} max={200} />
            )}
          </Panel>
          {image && (
            <Panel title="Author image">
              <Range
                bind={bind}
                label="Width"
                keys={plain('authorImageWidth')}
                units={['px']}
                max={500}
              />
              <Range
                bind={bind}
                label="Rounded corners"
                keys={plain('authorImgBorderRadius')}
                units={['%']}
              />
              <Range
                bind={bind}
                label="Gap"
                keys={plain('authorImageGap')}
                unitName="authorImageGapUnit"
                units={['px', 'em']}
                max={200}
              />
            </Panel>
          )}
          {tweet && (
            <Panel title="Share button">
              <Typography bind={bind} prefix="tweetBtn" />
              <Range
                bind={bind}
                label="Icon size"
                keys={plain('tweetBtnFontSize')}
                unitName="tweetBtnFontSizeType"
                units={['px', 'em']}
                max={100}
              />
              {a.iconView === 'icon_text' && (
                <Range
                  bind={bind}
                  label="Icon spacing"
                  name="tweetIconSpacing"
                  unitName="tweetIconSpacingUnit"
                  units={['px', 'em']}
                  max={100}
                />
              )}
              {button ? (
                <>
                  <States
                    normal={
                      <>
                        <Color bind={bind} name="tweetBtnColor" label="Text" />
                        <Color bind={bind} name="tweetBtnBgColor" label="Background" />
                      </>
                    }
                    hover={
                      <>
                        <Color bind={bind} name="tweetBtnHoverColor" label="Text" />
                        <Color bind={bind} name="tweetBtnBgHoverColor" label="Background" />
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
                </>
              ) : (
                <States
                  normal={<Color bind={bind} name="tweetLinkColor" label="Color" />}
                  hover={<Color bind={bind} name="tweetBtnHoverColor" label="Color" />}
                />
              )}
            </Panel>
          )}
        </>
      }
    />
  );
};
