import { ToggleControl } from '@wordpress/components';
import { plain, value, type Bind } from '../../editor/controls/bind';
import { Color } from '../../editor/controls/color';
import { Choice, InspectorTabs, Panel, Range, Select, Spacing } from '../../editor/controls/fields';
import { IconPicker } from '../../editor/controls/icon';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';

const dev = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile';

/** Paddings of the title or the text (`titleTopPaddingTablet`, `tabletTitlePaddingUnit`…). */
function PartPadding({ bind, p }: { bind: Bind; p: 'title' | 'content' }) {
  const P = p[0]!.toUpperCase() + p.slice(1);
  return (
    <Spacing
      bind={bind}
      label="Padding"
      keys={(side, d) => `${p}${side[0]!.toUpperCase()}${side.slice(1)}Padding${dev(d)}`}
      unitKeys={(d) => (d === 'desktop' ? `${p}PaddingUnit` : `${d}${P}PaddingUnit`)}
      linkName={`${p}PaddingLink`}
    />
  );
}

export const InlineNoticeSettings: Inspector = ({ attributes, setAttributes, block, clientId }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const closable = Boolean(a.noticeDismiss);
  return (
    <InspectorTabs
      general={
        <Panel title="General" initialOpen>
          <Choice
            bind={bind}
            name="layout"
            label="Layout"
            options={[
              { value: 'modern', label: 'Modern' },
              { value: 'simple', label: 'Border' },
            ]}
          />
          <Choice
            bind={bind}
            name="noticeAlignment"
            label="Alignment"
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
          />
          {a.layout === 'simple' && (
            <Range bind={bind} label="Border width" keys={plain('highlightWidth')} max={50} />
          )}
          <Select
            bind={bind}
            name="headingTag"
            label="Title tag"
            options={['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p'].map((t) => ({
              value: t,
              label: t.toUpperCase(),
            }))}
          />
          <Select
            bind={bind}
            name="noticeDismiss"
            label="Notice display"
            options={[
              { value: '', label: 'Always show' },
              {
                value: closable ? String(a.noticeDismiss) : 'dismissible',
                label: 'Dismissible',
              },
            ]}
          />
          {closable && (
            <>
              <IconPicker bind={bind} name="icon" label="Button icon" />
              <Range
                bind={bind}
                label="Button size"
                keys={(d) =>
                  d === 'desktop' ? 'iconSize' : d === 'tablet' ? 'iconSizeTab' : 'iconSizeMob'
                }
                unitName="iconSizeUnit"
                max={100}
              />
              <ToggleControl
                __nextHasNoMarginBottom
                label="Remember when closed"
                help="A visitor who closes the notice does not see it again for the chosen days."
                checked={Boolean(value(bind, 'cookies'))}
                onChange={(on: boolean) =>
                  // A new id: a notice closed before shows again to everyone.
                  setAttributes({
                    cookies: on,
                    c_id: `${clientId.slice(0, 8)}-${Date.now().toString(36)}`,
                  })
                }
              />
              {Boolean(a.cookies) && (
                <Range
                  bind={bind}
                  label="Show closed notice after (days)"
                  name="close_cookie_days"
                  max={50}
                />
              )}
            </>
          )}
        </Panel>
      }
      style={
        <>
          <Panel title="Title" initialOpen>
            <Color bind={bind} name="titleColor" label="Color" />
            <Color bind={bind} name="noticeColor" label="Border color" />
            {closable && <Color bind={bind} name="noticeDismissColor" label="Dismiss icon color" />}
            <Typography bind={bind} prefix="title" />
            <PartPadding bind={bind} p="title" />
          </Panel>
          <Panel title="Content">
            <Color bind={bind} name="textColor" label="Color" />
            <Color bind={bind} name="contentBgColor" label="Background color" />
            <Typography bind={bind} prefix="desc" />
            <PartPadding bind={bind} p="content" />
          </Panel>
        </>
      }
    />
  );
};
