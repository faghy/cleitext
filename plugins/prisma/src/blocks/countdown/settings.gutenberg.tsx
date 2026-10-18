import { TextControl } from '@wordpress/components';
import { useEffect } from 'react';
import { plain, value, type Bind } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Text,
  Toggle,
} from '../../editor/controls/fields';
import { BoxShadow } from '../../editor/controls/shadow';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { NumberField, OneUnitTypography } from '../counter/settings.gutenberg';
import { Sides } from '../heading/settings.gutenberg';

const PLACEHOLDER_END = '2023-01-01T00:00:00Z';

const two = (n: number) => String(n).padStart(2, '0');

/** An ISO time as the local `YYYY-MM-DDTHH:MM` of a date-time field. */
function toLocal(iso: unknown): string {
  const d = new Date(String(iso ?? ''));
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** The timer's end, typed in the editor's local time and stored in UTC. */
function EndDate({ bind }: { bind: Bind }) {
  return (
    <TextControl
      __nextHasNoMarginBottom
      __next40pxDefaultSize
      type="datetime-local"
      label="Timer end date and time"
      value={toLocal(value(bind, 'endDateTime'))}
      onChange={(text: string) => {
        const d = new Date(text);
        if (Number.isNaN(d.getTime())) return;
        const iso = d.toISOString().replace(/\.\d{3}Z$/, 'Z');
        bind.setAttributes({ endDateTime: iso, displayEndDateTime: iso, timeModified: true });
      }}
    />
  );
}

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export const CountdownSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  // A new timer ends a week from now (the stored default is long past).
  useEffect(() => {
    if (!a.timeModified && a.endDateTime === PLACEHOLDER_END) {
      const iso = new Date(Date.now() + 7 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      setAttributes({ endDateTime: iso, displayEndDateTime: iso });
    }
    // Once, when the timer is first selected.
  }, []);
  const redirectUrl =
    a.redirectURL && typeof a.redirectURL === 'object'
      ? String((a.redirectURL as { url?: unknown }).url ?? '')
      : String(a.redirectURL ?? '');
  const row = (d: '' | 'Tablet' | 'Mobile') => a[`boxFlex${d}`] === 'row';
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="General" initialOpen>
            <Choice
              bind={bind}
              name="timerType"
              label="Timer type"
              options={[
                { value: 'date', label: 'Fixed date' },
                { value: 'evergreen', label: 'Evergreen' },
              ]}
            />
            {a.timerType === 'evergreen' ? (
              <>
                <NumberField bind={bind} name="evergreenDays" label="Days" min={0} />
                <NumberField bind={bind} name="evergreenHrs" label="Hours" min={0} />
                <NumberField bind={bind} name="evergreenMinutes" label="Minutes" min={0} />
                <NumberField
                  bind={bind}
                  name="resetDays"
                  label="Restart after (days)"
                  help="A visitor sees the timer start again after this many days."
                  min={1}
                />
                <Text
                  bind={bind}
                  name="campaignID"
                  label="Campaign ID"
                  help="Timers with the same ID share each visitor's end."
                />
              </>
            ) : (
              <EndDate bind={bind} />
            )}
            <Toggle bind={bind} name="showDays" label="Show days" />
            <Toggle bind={bind} name="showHours" label="Show hours" />
            <Toggle bind={bind} name="showMinutes" label="Show minutes" />
            <Toggle bind={bind} name="showSeconds" label="Show seconds" />
            <Select
              bind={bind}
              name="ariaLiveType"
              label="Aria live type"
              options={[
                { value: 'off', label: 'Off' },
                { value: 'polite', label: 'Polite' },
                { value: 'assertive', label: 'Assertive' },
              ]}
            />
          </Panel>
          <Panel title="When the time is up">
            <Select
              bind={bind}
              name="timerEndAction"
              label="Action"
              options={[
                { value: 'zero', label: 'Stay at zero' },
                { value: 'hide', label: 'Hide the timer' },
                { value: 'content', label: 'Show a message' },
                { value: 'redirect', label: 'Go to a page' },
              ]}
            />
            {a.timerEndAction === 'content' && (
              <p className="pr-help">The blocks added inside the timer show when it ends.</p>
            )}
            {a.timerEndAction === 'redirect' && (
              <TextControl
                __nextHasNoMarginBottom
                __next40pxDefaultSize
                label="Address"
                placeholder="https://"
                value={redirectUrl}
                onChange={(url: string) => setAttributes({ redirectURL: { url } })}
              />
            )}
          </Panel>
          <Panel title="Labels">
            <Toggle bind={bind} name="showLabels" label="Show labels" />
            {Boolean(a.showLabels) && (
              <>
                <Text bind={bind} name="labelDays" label="Days" />
                <Text bind={bind} name="labelHours" label="Hours" />
                <Text bind={bind} name="labelMinutes" label="Minutes" />
                <Text bind={bind} name="labelSeconds" label="Seconds" />
              </>
            )}
          </Panel>
          <Panel title="Separator">
            <Toggle bind={bind} name="showSeparator" label="Show separator" />
            {Boolean(a.showSeparator) && (
              <Select
                bind={bind}
                name="separatorType"
                label="Separator type"
                options={[
                  { value: ':', label: 'Colon' },
                  { value: '|', label: 'Line' },
                  { value: '/', label: 'Slash' },
                ]}
              />
            )}
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Box" initialOpen>
            <Toggle bind={bind} name="isSquareBox" label="Square shaped box" />
            <Choice bind={bind} keys={plain('align')} label="Overall alignment" options={ALIGN} />
            <Choice
              bind={bind}
              keys={plain('boxAlign')}
              label="Inner alignment"
              options={[
                { value: 'flex-start', label: 'Start' },
                { value: 'center', label: 'Center' },
                { value: 'flex-end', label: 'End' },
              ]}
            />
            <Choice
              bind={bind}
              keys={plain('boxFlex')}
              label="Label position"
              options={[
                { value: 'row', label: 'Row' },
                { value: 'column', label: 'Column' },
              ]}
            />
            {!a.isSquareBox && (row('') || row('Tablet') || row('Mobile')) && (
              <Choice
                bind={bind}
                keys={plain('labelVerticalAlignment')}
                label="Label vertical alignment"
                options={[
                  { value: 'start', label: 'Top' },
                  { value: 'center', label: 'Center' },
                  { value: 'end', label: 'Bottom' },
                ]}
              />
            )}
            <Choice
              bind={bind}
              name="boxBgType"
              label="Background type"
              options={[
                { value: 'transparent', label: 'Transparent' },
                { value: 'color', label: 'Color' },
              ]}
            />
            {a.boxBgType === 'color' && <Color bind={bind} name="boxBgColor" label="Color" />}
            <Range bind={bind} label="Box width" keys={plain('boxWidth')} max={500} />
            <Range bind={bind} label="Gap between boxes" keys={plain('boxSpacing')} max={200} />
            <Range
              bind={bind}
              label="Gap between digits and labels"
              keys={plain('internalBoxSpacing')}
              max={100}
            />
            <Sides bind={bind} prefix="box" kind="Padding" />
            <Border bind={bind} prefix="box" />
          </Panel>
          <Panel title="Digit">
            <Color bind={bind} name="digitColor" label="Color" />
            <Typography bind={bind} prefix="digit" />
          </Panel>
          {Boolean(a.showLabels) && (
            <Panel title="Label">
              <Color bind={bind} name="labelColor" label="Color" />
              <Typography bind={bind} prefix="label" />
            </Panel>
          )}
          {Boolean(a.showSeparator) && (
            <Panel title="Separator">
              <Color bind={bind} name="separatorColor" label="Color" />
              <OneUnitTypography bind={bind} prefix="separator" names={['LineHeight']} />
              <Range
                bind={bind}
                label="Separator right spacing"
                keys={plain('separatorRightSpacing')}
                min={-50}
                max={100}
              />
              <Range
                bind={bind}
                label="Separator top spacing"
                keys={plain('separatorTopSpacing')}
                min={-100}
                max={100}
              />
            </Panel>
          )}
          <Panel title="Box shadow">
            <Toggle bind={bind} name="useSeparateBoxShadows" label="Separate hover shadow" />
            <BoxShadow bind={bind} hover={Boolean(a.useSeparateBoxShadows)} />
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
