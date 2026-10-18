import { store as blockEditorStore } from '@wordpress/block-editor';
import { useDispatch, useSelect } from '@wordpress/data';
import { useEffect } from 'react';
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
import { Sides } from '../heading/settings.gutenberg';
import { buildSchema, FAQ_SHARED } from '.';

interface Child {
  clientId: string;
  name: string;
  attributes: Record<string, unknown>;
}

interface EditorActions {
  updateBlockAttributes(id: string, attrs: Record<string, unknown>): void;
  __unstableMarkNextChangeAsNotPersistent?(): void;
}

const D = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? 'Desktop' : d === 'tablet' ? 'Tablet' : 'Mobile';
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export const FaqSettings: Inspector = ({ attributes, setAttributes, block, clientId }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const grid = a.layout === 'grid';
  const children = useSelect(
    (select) =>
      (select(blockEditorStore) as unknown as { getBlocks(id: string): Child[] }).getBlocks(
        clientId,
      ),
    [clientId],
  );
  const actions = useDispatch(blockEditorStore) as unknown as EditorActions;

  // The items draw the parent's icons, question tag and layout; the schema follows their texts.
  useEffect(() => {
    for (const child of children) {
      if (child.name !== 'prisma/faq-item') continue;
      const changes = Object.fromEntries(
        FAQ_SHARED.filter((k) => child.attributes[k] !== a[k]).map((k) => [k, a[k]]),
      );
      if (Object.keys(changes).length) {
        actions.__unstableMarkNextChangeAsNotPersistent?.();
        actions.updateBlockAttributes(child.clientId, changes);
      }
    }
    const schema = buildSchema(
      children
        .filter((c) => c.name === 'prisma/faq-item')
        .map((c) => ({
          question: c.attributes.question ?? 'What is FAQ?',
          answer: c.attributes.answer ?? '',
        })),
    );
    if (schema !== a.schema) {
      actions.__unstableMarkNextChangeAsNotPersistent?.();
      setAttributes({ schema });
    }
  }, [children, a.icon, a.iconActive, a.headingTag, a.layout, a.schema]);

  return (
    <InspectorTabs
      general={
        <>
          <Panel title="General" initialOpen>
            <Choice
              bind={bind}
              name="layout"
              label="Layout"
              options={[
                { value: 'accordion', label: 'Accordion' },
                { value: 'grid', label: 'Grid' },
              ]}
            />
            {!grid && (
              <>
                <Toggle bind={bind} name="inactiveOtherItems" label="Collapse other items" />
                <Toggle bind={bind} name="expandFirstItem" label="Expand first item" />
                <Toggle bind={bind} name="enableToggle" label="Enable toggle" />
              </>
            )}
            <Toggle bind={bind} name="enableSchemaSupport" label="Enable schema support" />
            <Toggle bind={bind} name="enableSeparator" label="Enable separator" />
            <Select
              bind={bind}
              name="headingTag"
              label="Question tag"
              options={['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p'].map((t) => ({
                value: t,
                label: t.length === 2 ? t.toUpperCase() : cap(t),
              }))}
            />
            {grid && (
              <>
                <Range
                  bind={bind}
                  label="Columns"
                  keys={(d) =>
                    d === 'desktop' ? 'columns' : d === 'tablet' ? 'tcolumns' : 'mcolumns'
                  }
                  min={1}
                  max={4}
                />
                <Choice
                  bind={bind}
                  name="align"
                  label="Alignment"
                  options={['left', 'center', 'right'].map((v) => ({ value: v, label: cap(v) }))}
                />
              </>
            )}
          </Panel>
          {!grid && (
            <Panel title="Icon">
              <IconPicker bind={bind} name="icon" label="Inactive icon" />
              <IconPicker bind={bind} name="iconActive" label="Active icon" />
              <Choice
                bind={bind}
                name="iconAlign"
                label="Icon alignment"
                options={[
                  { value: 'row', label: 'Left' },
                  { value: 'row-reverse', label: 'Right' },
                ]}
              />
            </Panel>
          )}
        </>
      }
      style={
        <>
          <Panel title="Container" initialOpen>
            <States
              normal={
                <>
                  <Select
                    bind={bind}
                    name="boxBgType"
                    label="Background type"
                    options={[
                      { value: 'transparent', label: 'Transparent' },
                      { value: 'color', label: 'Color' },
                    ]}
                  />
                  {a.boxBgType === 'color' && (
                    <Color bind={bind} name="boxBgColor" label="Background color" />
                  )}
                </>
              }
              hover={
                <>
                  <Select
                    bind={bind}
                    name="boxBgHoverType"
                    label="Background type"
                    options={[
                      { value: 'transparent', label: 'Transparent' },
                      { value: 'color', label: 'Color' },
                    ]}
                  />
                  {a.boxBgHoverType === 'color' && (
                    <Color bind={bind} name="boxBgHoverColor" label="Background color" />
                  )}
                </>
              }
            />
            <Range
              bind={bind}
              label="Rows gap"
              keys={plain('rowsGap')}
              unitName="rowsGapUnit"
              max={100}
            />
            {grid && (
              <>
                <Range
                  bind={bind}
                  label="Columns gap"
                  keys={plain('columnsGap')}
                  unitName="columnsGapUnit"
                  max={100}
                />
                <Toggle bind={bind} name="equalHeight" label="Equal height" />
              </>
            )}
            <Border bind={bind} prefix="overall" />
          </Panel>
          {!grid && (
            <Panel title="Icon">
              <Range
                bind={bind}
                label="Size"
                keys={plain('iconSize')}
                unitName="iconSizeType"
                units={['px', '%']}
                max={100}
              />
              <Range
                bind={bind}
                label="Background size"
                keys={plain('iconBgSize')}
                unitName="iconBgSizeType"
                units={['px', '%']}
                max={100}
              />
              <Range
                bind={bind}
                label="Gap between icon and question"
                keys={plain('gapBtwIconQUestion')}
                max={100}
              />
              <Color bind={bind} name="iconColor" label="Color" />
              <Color bind={bind} name="iconActiveColor" label="Active color" />
              <Color bind={bind} name="iconBgColor" label="Background color" />
              <Border bind={bind} prefix="icon" />
            </Panel>
          )}
          <Panel title="Question">
            <Typography bind={bind} prefix="question" />
            <States
              labels={['Normal', 'Active/Hover']}
              normal={
                <>
                  <Color bind={bind} name="questionTextColor" label="Text color" />
                  <Color bind={bind} name="questionTextBgColor" label="Background color" />
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="questionTextActiveColor" label="Text color" />
                  <Color bind={bind} name="questionTextActiveBgColor" label="Background color" />
                </>
              }
            />
            <Spacing
              bind={bind}
              label="Padding"
              units={['px', '%']}
              keys={(side, d) =>
                side === 'top'
                  ? `vquestionPadding${D(d)}`
                  : side === 'right'
                    ? `hquestionPadding${D(d)}`
                    : `question${cap(side)}Padding${D(d)}`
              }
              unitKeys={(d) => `questionPaddingType${D(d)}`}
            />
          </Panel>
          <Panel title="Answer">
            <Color bind={bind} name="answerTextColor" label="Text color" />
            <Typography bind={bind} prefix="answer" />
            <Spacing
              bind={bind}
              label="Padding"
              units={['px', '%']}
              keys={(side, d) => `answer${cap(side)}Padding${d === 'desktop' ? '' : D(d)}`}
              unitKeys={(d) => `answerPaddingType${D(d)}`}
            />
          </Panel>
        </>
      }
      advanced={
        <Panel title="Spacing">
          <Sides bind={bind} prefix="block" kind="Padding" />
          <Sides bind={bind} prefix="block" kind="Margin" />
        </Panel>
      }
    />
  );
};

/** An item takes its look from its FAQ block. */
export const FaqItemSettings: Inspector = () => (
  <InspectorTabs
    general={
      <Panel title="FAQ item" initialOpen>
        <p>Colors, sizes and icons are set on the FAQ block.</p>
      </Panel>
    }
  />
);
