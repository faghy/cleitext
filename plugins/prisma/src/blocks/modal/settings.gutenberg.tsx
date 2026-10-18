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
import { IconPicker } from '../../editor/controls/icon';
import { Media } from '../../editor/controls/media';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const side = (s: string) => cap(s);

/** Padding of the popup or of the button (`paddingModalTop`, `tabletPaddingModalUnit`…). */
function Padding({ bind, p }: { bind: Bind; p: 'Modal' | 'Btn' }) {
  return (
    <Spacing
      bind={bind}
      label="Padding"
      units={['px', '%']}
      keys={(s, d) => `padding${p}${side(s)}${d === 'desktop' ? '' : cap(d)}`}
      unitKeys={(d) => (d === 'desktop' ? `padding${p}Unit` : `${d}Padding${p}Unit`)}
      linkName={p === 'Modal' ? 'modalSpacingLink' : 'btnSpacingLink'}
    />
  );
}

export const ModalSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const trigger = String(a.modalTrigger);
  const type = a.backgroundType;
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Trigger" initialOpen>
            <Select
              bind={bind}
              name="modalTrigger"
              label="Modal trigger"
              options={[
                { value: 'button', label: 'Button' },
                { value: 'icon', label: 'Icon' },
                { value: 'image', label: 'Image' },
                { value: 'text', label: 'Text' },
                { value: 'custom-class', label: 'Custom class' },
                { value: 'custom-id', label: 'Custom ID' },
                { value: 'automatic', label: 'Automatic' },
              ]}
            />
            {trigger === 'icon' && <IconPicker bind={bind} name="icon" />}
            {trigger === 'image' && (
              <>
                <Media bind={bind} name="iconImage" label="Image" />
                <Toggle
                  bind={bind}
                  name="imageWidthType"
                  label="Custom width"
                  help="Off: the image keeps its own width."
                />
              </>
            )}
            {trigger === 'button' && (
              <>
                <Toggle bind={bind} name="inheritFromTheme" label="Inherit from theme" />
                <Toggle bind={bind} name="showBtnIcon" label="Enable icon" />
                {Boolean(a.showBtnIcon) && (
                  <>
                    <IconPicker bind={bind} name="buttonIcon" label="Button icon" />
                    <Choice
                      bind={bind}
                      name="buttonIconPosition"
                      label="Position"
                      options={[
                        { value: 'before', label: 'Before text' },
                        { value: 'after', label: 'After text' },
                      ]}
                    />
                  </>
                )}
              </>
            )}
            {trigger === 'custom-class' && (
              <Text
                bind={bind}
                name="triggerClass"
                label="Class"
                help="Any element with this class opens the modal."
                placeholder="open-offer"
              />
            )}
            {trigger === 'custom-id' && (
              <Text
                bind={bind}
                name="triggerID"
                label="ID"
                help="The element with this id opens the modal."
              />
            )}
            {trigger === 'automatic' && (
              <>
                <Toggle bind={bind} name="showAfterSeconds" label="Open after a delay" />
                {Boolean(a.showAfterSeconds) && (
                  <Range bind={bind} label="Seconds" name="noOfSecondsToShow" min={0} max={120} />
                )}
                <Toggle
                  bind={bind}
                  name="exitIntent"
                  label="Open on exit intent"
                  help="When the pointer leaves the window towards the top."
                />
                <Toggle bind={bind} name="enableCookies" label="Show once" />
                {Boolean(a.enableCookies) && (
                  <>
                    <Range bind={bind} label="Hide for days" name="hideForDays" min={0} max={365} />
                    <Select
                      bind={bind}
                      name="setCookiesOn"
                      label="Remember when"
                      options={[
                        { value: 'close-action', label: 'It is closed' },
                        { value: 'page-refresh', label: 'It is shown' },
                      ]}
                    />
                  </>
                )}
              </>
            )}
            {['button', 'icon', 'image', 'text'].includes(trigger) && (
              <Choice
                bind={bind}
                keys={plain('modalAlign')}
                label="Alignment"
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                  ...(trigger === 'button' ? [{ value: 'full', label: 'Full width' }] : []),
                ]}
              />
            )}
          </Panel>
          <Panel title="Container">
            <Range
              bind={bind}
              label="Modal width"
              keys={plain('modalWidth')}
              unitKeys={plain('modalWidthType')}
              units={['px', '%']}
            />
            <Choice
              bind={bind}
              name="modalBoxHeight"
              label="Modal height"
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {a.modalBoxHeight === 'custom' ? (
              <Range
                bind={bind}
                label="Modal popup height"
                keys={plain('modalHeight')}
                unitKeys={plain('modalHeightType')}
                units={['px', '%']}
              />
            ) : (
              <Range
                bind={bind}
                label="Max height"
                keys={plain('maxHeight')}
                unitName="maxHeightType"
                units={['vh']}
              />
            )}
          </Panel>
          <Panel title="Close button">
            <IconPicker bind={bind} name="closeIcon" />
            <Select
              bind={bind}
              name="closeIconPosition"
              label="Icon position"
              options={[
                { value: 'popup-top-left', label: 'Top left' },
                { value: 'popup-top-right', label: 'Top right' },
                { value: 'window-top-left', label: 'Window top left' },
                { value: 'window-top-right', label: 'Window top right' },
              ]}
            />
            <Toggle bind={bind} name="escPress" label="Close on Escape" />
            <Toggle bind={bind} name="overlayClick" label="Close on overlay click" />
          </Panel>
        </>
      }
      style={
        <>
          {trigger === 'icon' && (
            <Panel title="Trigger" initialOpen>
              <Range bind={bind} label="Icon size" name="iconSize" max={200} />
              <Color bind={bind} name="iconColor" label="Icon color" />
            </Panel>
          )}
          {trigger === 'text' && (
            <Panel title="Trigger" initialOpen>
              <Color bind={bind} name="textColor" label="Text color" />
              <Typography bind={bind} prefix="text" />
            </Panel>
          )}
          {trigger === 'image' && (
            <Panel title="Trigger" initialOpen>
              {Boolean(a.imageWidthType) && (
                <Range
                  bind={bind}
                  label="Width"
                  keys={plain('imageWidth')}
                  unitKeys={(d) => (d === 'desktop' ? 'imageWidthUnit' : `imageWidthUnit${cap(d)}`)}
                  units={['px', '%', 'em']}
                />
              )}
              <Range
                bind={bind}
                label="Border radius"
                name="iconimgBorderRadius"
                unitName="iconimgBorderRadiusUnit"
                units={['px', 'em']}
              />
            </Panel>
          )}
          {trigger === 'button' && !a.inheritFromTheme && (
            <Panel title="Trigger" initialOpen>
              {Boolean(a.showBtnIcon) && (
                <Range
                  bind={bind}
                  label="Icon spacing"
                  keys={plain('buttonIconSpace')}
                  unitName="buttonIconSpaceType"
                  units={['px', 'em']}
                />
              )}
              <States
                normal={
                  <>
                    <Color bind={bind} name="btnLinkColor" label="Text color" />
                    <Select
                      bind={bind}
                      name="modalTriggerBgType"
                      label="Background type"
                      options={[
                        { value: 'transparent', label: 'Transparent' },
                        { value: 'color', label: 'Color' },
                      ]}
                    />
                    {a.modalTriggerBgType === 'color' && (
                      <Color bind={bind} name="btnBgColor" label="Background color" />
                    )}
                  </>
                }
                hover={
                  <>
                    <Color bind={bind} name="btnLinkHoverColor" label="Text color" />
                    <Select
                      bind={bind}
                      name="modalTriggerBgHoverType"
                      label="Background type"
                      options={[
                        { value: 'transparent', label: 'Transparent' },
                        { value: 'color', label: 'Color' },
                      ]}
                    />
                    {a.modalTriggerBgHoverType === 'color' && (
                      <Color bind={bind} name="btnBgHoverColor" label="Background color" />
                    )}
                  </>
                }
              />
              <Typography bind={bind} prefix="btn" />
              <Padding bind={bind} p="Btn" />
              <Border bind={bind} prefix="btn" />
            </Panel>
          )}
          <Panel title="Container">
            <Color bind={bind} name="overlayColor" label="Overlay color" />
            <Padding bind={bind} p="Modal" />
            <Border bind={bind} prefix="content" />
          </Panel>
          <Panel title="Close button">
            <Range bind={bind} label="Icon size" name="closeIconSize" max={100} />
            <Color bind={bind} name="closeIconColor" label="Icon color" />
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
          </Panel>
        </>
      }
    />
  );
};
