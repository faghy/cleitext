import type { Bind } from '../../editor/controls/bind';
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
import { BoxShadow } from '../../editor/controls/shadow';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { byDevice, QueryFields } from '../post-grid/settings-shared';

const side = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div'].map((t) => ({
  value: t,
  label: t === 'div' ? 'Div' : t.toUpperCase(),
}));

export const TaxonomyListSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const grid = a.layout !== 'list';
  const dropdown = !grid && a.listDisplayStyle === 'dropdown';
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Query" initialOpen>
            <QueryFields bind={bind} a={a} terms={false} />
            <Text bind={bind} name="noTaxDisplaytext" label="Display Message" />
            <Toggle bind={bind} name="showEmptyTaxonomy" label="Show Empty Taxonomy" />
            <Toggle bind={bind} name="showCount" label="Show Posts Count" />
            {!grid && !dropdown && (
              <Toggle bind={bind} name="showhierarchy" label="Show Hierarchy" />
            )}
          </Panel>
          <Panel title="Layout">
            <Choice
              bind={bind}
              name="layout"
              label="Layout"
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'list', label: 'List' },
              ]}
            />
            {!dropdown && (
              <Select
                bind={bind}
                name="titleTag"
                label="Heading Tag"
                options={[{ value: '', label: 'Default' }, ...TAGS]}
              />
            )}
            {grid ? (
              <>
                <Range
                  bind={bind}
                  label="Columns"
                  keys={(d) =>
                    d === 'desktop' ? 'columns' : d === 'tablet' ? 'tcolumns' : 'mcolumns'
                  }
                  min={1}
                  max={8}
                />
                <Choice
                  bind={bind}
                  name="alignment"
                  label="Alignment"
                  options={[
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' },
                  ]}
                />
              </>
            ) : (
              <>
                <Choice
                  bind={bind}
                  name="listDisplayStyle"
                  label="Display Style"
                  options={[
                    { value: 'list', label: 'List' },
                    { value: 'dropdown', label: 'Dropdown' },
                  ]}
                />
                {!dropdown && (
                  <Select
                    bind={bind}
                    name="listStyle"
                    label="List Style"
                    options={[
                      { value: 'disc', label: 'Bullet' },
                      { value: 'decimal', label: 'Numbers' },
                      { value: 'none', label: 'None' },
                    ]}
                  />
                )}
              </>
            )}
          </Panel>
        </>
      }
      style={
        grid ? (
          <>
            <Panel title="Title" initialOpen>
              <Typography bind={bind} prefix="title" />
              <Color bind={bind} name="titleColor" label="Color" />
              <Range
                bind={bind}
                keys={byDevice('titleBottomSpace')}
                label="Bottom Spacing"
                max={100}
              />
            </Panel>
            {Boolean(a.showCount) && (
              <Panel title="Count">
                <Typography bind={bind} prefix="count" />
                <Color bind={bind} name="countColor" label="Color" />
              </Panel>
            )}
            <Panel title="Background">
              <Color bind={bind} name="bgColor" label="Color" />
            </Panel>
            <Panel title="Border">
              <Border bind={bind} prefix="overall" />
            </Panel>
            <Panel title="Box Shadow">
              <BoxShadow bind={bind} hover={false} />
            </Panel>
            <Panel title="Spacing">
              <Range bind={bind} keys={byDevice('rowGap')} label="Row Gap" max={100} />
              <Range bind={bind} keys={byDevice('columnGap')} label="Column Gap" max={100} />
              <Spacing
                bind={bind}
                label="Padding"
                keys={(s, d) => `content${side(s)}Padding${d === 'desktop' ? '' : side(d)}`}
                unitKeys={(d) =>
                  d === 'desktop' ? 'contentPaddingUnit' : `${d}ContentPaddingUnit`
                }
                linkName="contentPaddingLink"
                min={0}
              />
            </Panel>
          </>
        ) : (
          <>
            <Panel title="List" initialOpen>
              <Typography bind={bind} prefix="list" />
              <States
                normal={
                  <>
                    <Color bind={bind} name="listTextColor" label="Text Color" />
                    <Color bind={bind} name="listStyleColor" label="Bullet/Numbers Color" />
                  </>
                }
                hover={
                  <>
                    <Color bind={bind} name="hoverlistTextColor" label="Text Color" />
                    <Color bind={bind} name="hoverlistStyleColor" label="Bullet/Numbers Color" />
                  </>
                }
              />
            </Panel>
            {!dropdown && (
              <Panel title="Separator">
                <Select
                  bind={bind}
                  name="seperatorStyle"
                  label="Separator Style"
                  options={[
                    'none',
                    'solid',
                    'dotted',
                    'dashed',
                    'double',
                    'groove',
                    'inset',
                    'outset',
                    'ridge',
                  ].map((v) => ({ value: v, label: side(v) }))}
                />
                {a.seperatorStyle !== 'none' && (
                  <>
                    <Range
                      bind={bind}
                      name="seperatorWidth"
                      label="Separator Width (%)"
                      max={100}
                    />
                    <Range
                      bind={bind}
                      name="seperatorThickness"
                      label="Separator Thickness"
                      max={20}
                    />
                    <Color bind={bind} name="seperatorColor" label="Color" />
                    <Color bind={bind} name="seperatorHoverColor" label="Hover Color" />
                  </>
                )}
              </Panel>
            )}
            <Panel title="Spacing">
              <Range bind={bind} name="listBottomMargin" label="Bottom Margin" max={100} />
            </Panel>
          </>
        )
      }
    />
  );
};
