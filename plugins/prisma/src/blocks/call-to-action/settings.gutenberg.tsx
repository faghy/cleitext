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
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';

const D = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile';
const S = (side: string) => side[0]!.toUpperCase() + side.slice(1);

const STACK = [
  { value: 'none', label: 'None' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'mobile', label: 'Mobile' },
];

const ICON_POSITION = [
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
];

/** Padding of the box or of the second button (`overallBlockTopTabletPadding`…). */
function SidePadding({ bind, prefix, kind }: { bind: Bind; prefix: string; kind: string }) {
  return (
    <Spacing
      bind={bind}
      label={kind}
      keys={(side, d) => `${prefix}${S(side)}${D(d)}${kind}`}
      unitKeys={(d) => `${prefix}${D(d)}${kind}Unit`}
      linkName={`${prefix}${kind}Link`}
    />
  );
}

export const CallToActionSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const linked = a.ctaType === 'text' || a.ctaType === 'button';
  const button = a.ctaType === 'button';
  const second = button && Boolean(a.enabledSecondCtaButton);
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Layout" initialOpen>
            <Choice
              bind={bind}
              name="ctaPosition"
              label="Button position"
              options={[
                { value: 'right', label: 'Next to the text' },
                { value: 'below-title', label: 'Below the text' },
              ]}
            />
            {a.ctaPosition === 'right' && linked && (
              <>
                <Select bind={bind} name="stack" label="Stack on" options={STACK} />
                <Choice
                  bind={bind}
                  name="buttonAlign"
                  label="Vertical alignment"
                  options={[
                    { value: 'top', label: 'Top' },
                    { value: 'middle', label: 'Middle' },
                  ]}
                />
              </>
            )}
            <Choice
              bind={bind}
              keys={(d) => `textAlign${D(d)}`}
              label="Alignment"
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ]}
            />
            <Select
              bind={bind}
              name="htmlTag"
              label="HTML tag"
              options={['div', 'section', 'article', 'aside', 'header', 'footer', 'main'].map(
                (t) => ({ value: t, label: t }),
              )}
            />
          </Panel>
          <Panel title="Content">
            <Select
              bind={bind}
              name="titleTag"
              label="Title tag"
              options={['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((t) => ({
                value: t,
                label: t.toUpperCase(),
              }))}
            />
            <Toggle
              bind={bind}
              name="enableMultilineParagraph"
              label="Description with several paragraphs"
            />
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
            {linked && (
              <>
                <Toggle bind={bind} name="showIcon" label="Icon" />
                {Boolean(a.showIcon) && (
                  <>
                    <IconPicker bind={bind} name="ctaIcon" />
                    <Choice
                      bind={bind}
                      name="ctaIconPosition"
                      label="Icon position"
                      options={ICON_POSITION}
                    />
                  </>
                )}
              </>
            )}
            {button && <Toggle bind={bind} name="inheritFromTheme" label="Theme's button style" />}
          </Panel>
          {button && (
            <Panel title="Second button">
              <Toggle bind={bind} name="enabledSecondCtaButton" label="Enable" />
              {second && (
                <>
                  <Text bind={bind} name="secondCtaLink" label="Link" placeholder="https://" />
                  <Toggle bind={bind} name="secondCtaTarget" label="Open in a new tab" />
                  <Toggle bind={bind} name="showSecondIcon" label="Icon" />
                  {Boolean(a.showSecondIcon) && (
                    <>
                      <IconPicker bind={bind} name="secondCtaIcon" />
                      <Choice
                        bind={bind}
                        name="secondCtaIconPosition"
                        label="Icon position"
                        options={ICON_POSITION}
                      />
                    </>
                  )}
                  <Toggle bind={bind} name="secInheritFromTheme" label="Theme's button style" />
                  <Select bind={bind} name="stackBtn" label="Stack buttons on" options={STACK} />
                </>
              )}
            </Panel>
          )}
        </>
      }
      style={
        <>
          <Panel title="Title" initialOpen>
            <Color bind={bind} name="titleColor" label="Color" />
            <Typography bind={bind} prefix="title" />
            <Range
              bind={bind}
              label="Bottom margin"
              keys={plain('titleSpace')}
              unitName="titleSpaceType"
              units={['px', 'em']}
              max={200}
            />
          </Panel>
          <Panel title="Description">
            <Color bind={bind} name="descColor" label="Color" />
            <Typography bind={bind} prefix="desc" />
            <Range
              bind={bind}
              label="Bottom margin"
              keys={plain('descSpace')}
              unitName="descSpaceType"
              units={['px', 'em']}
              max={200}
            />
          </Panel>
          {linked && !(button && a.inheritFromTheme) && (
            <Panel title={button ? 'Button' : 'Link'}>
              <Typography bind={bind} prefix="cta" />
              {Boolean(a.showIcon) && (
                <Range bind={bind} label="Icon spacing" keys={plain('ctaIconSpace')} max={100} />
              )}
              {button ? (
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
                    keys={(side, d) => `cta${S(side)}Padding${D(d)}`}
                    unitKeys={(d) => (d === 'desktop' ? 'ctaPaddingUnit' : `${d}CTAPaddingUnit`)}
                    linkName="ctaPaddingLink"
                  />
                  <Border bind={bind} prefix="btn" />
                </>
              ) : (
                <States
                  normal={<Color bind={bind} name="ctaBtnLinkColor" label="Color" />}
                  hover={<Color bind={bind} name="ctaLinkHoverColor" label="Color" />}
                />
              )}
            </Panel>
          )}
          {second && !a.secInheritFromTheme && (
            <Panel title="Second button">
              <Typography bind={bind} prefix="secondCta" />
              {Boolean(a.showSecondIcon) && (
                <Range
                  bind={bind}
                  label="Icon spacing"
                  keys={plain('secondCtaIconSpace')}
                  max={100}
                />
              )}
              <States
                normal={
                  <>
                    <Color bind={bind} name="secondCtaColor" label="Text" />
                    <Color bind={bind} name="secondCtaBackground" label="Background" />
                  </>
                }
                hover={
                  <>
                    <Color bind={bind} name="secondCtaHoverColor" label="Text" />
                    <Color bind={bind} name="secondCtaHoverBackground" label="Background" />
                  </>
                }
              />
              <SidePadding bind={bind} prefix="secondCta" kind="Padding" />
              <Border bind={bind} prefix="secondCta" />
            </Panel>
          )}
          {linked && (
            <Panel title="Spacing">
              {a.ctaPosition === 'right' && (
                <Range
                  bind={bind}
                  label="Text width"
                  keys={plain('contentWidth')}
                  unitName="contentWidthType"
                  units={['%']}
                />
              )}
              {second && (
                <>
                  <Range
                    bind={bind}
                    label="Buttons width"
                    keys={plain('btncontentWidth')}
                    unitName="btncontentWidthType"
                    units={['%']}
                  />
                  <Range bind={bind} label="Gap between buttons" keys={plain('gapBtn')} max={200} />
                </>
              )}
              {a.stack === 'none' && (
                <Range
                  bind={bind}
                  label="Text and buttons gap"
                  keys={plain('buttonRightSpace')}
                  unitName="buttonRightSpaceType"
                  max={200}
                />
              )}
            </Panel>
          )}
        </>
      }
      advanced={
        <Panel title="Spacing" initialOpen>
          <SidePadding bind={bind} prefix="overallBlock" kind="Padding" />
          <SidePadding bind={bind} prefix="overallBlock" kind="Margin" />
        </Panel>
      }
    />
  );
};
