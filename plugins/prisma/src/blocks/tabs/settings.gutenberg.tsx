import { store as blockEditorStore } from '@wordpress/block-editor';
import { createBlock } from '@wordpress/blocks';
import { BaseControl, Button, SelectControl, TextControl } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { arrowDown, arrowUp, plus, trash } from '@wordpress/icons';
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
import { headers } from '.';

interface Child {
  clientId: string;
  name: string;
  attributes: Record<string, unknown>;
}

interface EditorActions {
  updateBlockAttributes(id: string, attrs: Record<string, unknown>): void;
  insertBlock(block: unknown, index: number, rootClientId: string, select?: boolean): void;
  removeBlock(id: string, select?: boolean): void;
  moveBlockToPosition(id: string, from: string, to: string, index: number): void;
  __unstableMarkNextChangeAsNotPersistent?(): void;
}

const HORIZONTAL = [1, 2, 3, 4, 5].map((n) => ({
  value: `hstyle${n}`,
  label: `Horizontal style ${n}`,
}));
const VERTICAL = [6, 7, 8, 9, 10].map((n) => ({
  value: `vstyle${n}`,
  label: `Vertical style ${n}`,
}));
const STACKED = [1, 2, 3, 4].map((n) => ({ value: `stack${n}`, label: `Stack style ${n}` }));

const ALIGN = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const device = (d: 'desktop' | 'tablet' | 'mobile') =>
  d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile';
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Margin or padding of the titles or the body, with Spectra's names. */
function PartSpacing({
  bind,
  part,
  kind,
}: {
  bind: Bind;
  part: 'tabTitle' | 'tabBody';
  kind: 'Margin' | 'Padding';
}) {
  return (
    <Spacing
      bind={bind}
      label={kind}
      keys={(side, d) => `${part}${cap(side)}${kind}${device(d)}`}
      unitKeys={(d) => (d === 'desktop' ? `${part}${kind}Unit` : `${d}${part}${kind}Unit`)}
    />
  );
}

/** The block's element in the canvas (inside the editor's frame when there is one). */
export function blockElement(clientId: string): HTMLElement | null {
  const selector = `[data-block="${clientId}"]`;
  const here = document.querySelector<HTMLElement>(selector);
  if (here) return here;
  const frame = document.querySelector<HTMLIFrameElement>('iframe[name="editor-canvas"]');
  return frame?.contentDocument?.querySelector<HTMLElement>(selector) ?? null;
}

export const TabsSettings: Inspector = ({ attributes, setAttributes, block, clientId }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const titles = headers(a);
  const children = useSelect(
    (select) =>
      (select(blockEditorStore) as unknown as { getBlocks(id: string): Child[] }).getBlocks(
        clientId,
      ),
    [clientId],
  );
  const actions = useDispatch(blockEditorStore) as unknown as EditorActions;
  const quietly = () => actions.__unstableMarkNextChangeAsNotPersistent?.();

  // A new block gets one panel per title; then panels and titles stay in step.
  useEffect(() => {
    if (children.length === 0) {
      titles.forEach((_, i) =>
        actions.insertBlock(
          createBlock('prisma/tab', { id: i }, [createBlock('core/paragraph')]),
          i,
          clientId,
          false,
        ),
      );
      return;
    }
    children.forEach((child, i) => {
      if (child.name === 'prisma/tab' && child.attributes.id !== i) {
        quietly();
        actions.updateBlockAttributes(child.clientId, { id: i });
      }
    });
    if (titles.length !== children.length) {
      quietly();
      setAttributes({ tabHeaders: children.map((_, i) => titles[i] ?? `Tab ${i + 1}`) });
    }
  }, [children, titles.length]);

  // A click on a title in the canvas shows its panel.
  useEffect(() => {
    let element: HTMLElement | null = null;
    const onClick = (event: Event) => {
      const link = (event.target as Element | null)?.closest?.('.pr-tabs__link');
      const list = link?.closest('.pr-tabs__panel');
      if (!link || !list || list.closest('[data-block]') !== element) return;
      const index = [...list.querySelectorAll('.pr-tabs__link')].indexOf(link);
      if (index >= 0) setAttributes({ tabActive: index });
    };
    const attach = () => {
      element = blockElement(clientId);
      element?.addEventListener('click', onClick);
    };
    attach();
    const retry = element ? 0 : window.setTimeout(attach, 500);
    return () => {
      window.clearTimeout(retry);
      element?.removeEventListener('click', onClick);
    };
  }, [clientId, setAttributes]);

  const setTitle = (i: number, title: string) =>
    setAttributes({ tabHeaders: titles.map((t, j) => (j === i ? title : t)) });
  const add = () => {
    const i = children.length;
    actions.insertBlock(
      createBlock('prisma/tab', { id: i }, [createBlock('core/paragraph')]),
      i,
      clientId,
      false,
    );
    setAttributes({ tabHeaders: [...titles, `Tab ${i + 1}`], tabActive: i });
  };
  const remove = (i: number) => {
    const child = children[i];
    if (!child || children.length < 2) return;
    const next = titles.filter((_, j) => j !== i);
    setAttributes({
      tabHeaders: next,
      tabActive: Math.min(Number(a.tabActive) || 0, next.length - 1),
      tabActiveFrontend: Math.min(Number(a.tabActiveFrontend) || 0, next.length - 1),
    });
    actions.removeBlock(child.clientId, false);
  };
  const move = (i: number, to: number) => {
    const child = children[i];
    if (!child || to < 0 || to >= children.length) return;
    const next = [...titles];
    [next[i], next[to]] = [next[to]!, next[i]!];
    setAttributes({ tabHeaders: next, tabActive: to });
    actions.moveBlockToPosition(child.clientId, clientId, clientId, to);
  };

  const options = titles.map((t, i) => ({ value: String(i), label: t || `Tab ${i + 1}` }));
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Tabs" initialOpen>
            {titles.map((title, i) => (
              <BaseControl key={i} __nextHasNoMarginBottom className="pr-tabs-editor__row">
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ flex: 1 }}>
                    <TextControl
                      __nextHasNoMarginBottom
                      __next40pxDefaultSize
                      label={`Tab ${i + 1}`}
                      value={title}
                      onChange={(v: string) => setTitle(i, v)}
                      onFocus={() => setAttributes({ tabActive: i })}
                    />
                  </div>
                  <Button
                    size="small"
                    icon={arrowUp}
                    label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  />
                  <Button
                    size="small"
                    icon={arrowDown}
                    label="Move down"
                    disabled={i === titles.length - 1}
                    onClick={() => move(i, i + 1)}
                  />
                  <Button
                    size="small"
                    icon={trash}
                    label="Remove tab"
                    isDestructive
                    disabled={titles.length < 2}
                    onClick={() => remove(i)}
                  />
                </div>
              </BaseControl>
            ))}
            <Button variant="secondary" icon={plus} onClick={add}>
              Add tab
            </Button>
          </Panel>
          <Panel title="Layout">
            <Select
              bind={bind}
              keys={(d) =>
                d === 'desktop' ? 'tabsStyleD' : d === 'tablet' ? 'tabsStyleT' : 'tabsStyleM'
              }
              label="Style"
              options={[...HORIZONTAL, ...VERTICAL, ...STACKED]}
            />
            <SelectControl
              __nextHasNoMarginBottom
              __next40pxDefaultSize
              label="Initial open tab"
              value={String(a.tabActiveFrontend ?? 0)}
              options={options}
              onChange={(v: string) =>
                setAttributes({ tabActiveFrontend: Number(v), tabActive: Number(v) })
              }
            />
            <Choice bind={bind} name="tabAlign" label="Tab alignment" options={ALIGN} />
            <Choice bind={bind} name="titleAlign" label="Text alignment" options={ALIGN} />
            <Toggle bind={bind} name="showIcon" label="Enable icon" />
            {Boolean(a.showIcon) && (
              <>
                <IconPicker bind={bind} name="icon" label="Tab icon" />
                <Select
                  bind={bind}
                  name="iconPosition"
                  label="Icon position"
                  options={['left', 'right', 'top', 'bottom'].map((v) => ({
                    value: v,
                    label: cap(v),
                  }))}
                />
              </>
            )}
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Title" initialOpen>
            <States
              labels={['Normal', 'Active']}
              normal={
                <>
                  <Color bind={bind} name="headerTextColor" label="Text color" />
                  <Color bind={bind} name="headerBgColor" label="Background color" />
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="activeTabTextColor" label="Text color" />
                  <Color bind={bind} name="activeTabBgColor" label="Background color" />
                </>
              }
            />
            <Typography bind={bind} prefix="title" />
            <PartSpacing bind={bind} part="tabTitle" kind="Margin" />
            <PartSpacing bind={bind} part="tabTitle" kind="Padding" />
          </Panel>
          {Boolean(a.showIcon) && (
            <Panel title="Icon">
              <Range bind={bind} label="Size" keys={plain('iconSize')} max={100} />
              <States
                labels={['Normal', 'Active']}
                normal={<Color bind={bind} name="iconColor" label="Color" />}
                hover={<Color bind={bind} name="activeiconColor" label="Color" />}
              />
              <Range bind={bind} label="Spacing" keys={plain('iconSpacing')} max={100} />
            </Panel>
          )}
          <Panel title="Body">
            <Color bind={bind} name="bodyTextColor" label="Text color" />
            <Color bind={bind} name="bodyBgColor" label="Background color" />
            <PartSpacing bind={bind} part="tabBody" kind="Margin" />
            <PartSpacing bind={bind} part="tabBody" kind="Padding" />
          </Panel>
          <Panel title="Border">
            <Border bind={bind} prefix="tab" />
          </Panel>
        </>
      }
    />
  );
};

/** A panel takes its title and look from its tabs block. */
export const TabSettings: Inspector = () => (
  <InspectorTabs
    general={
      <Panel title="Tab" initialOpen>
        <p>The title and the style of this tab are set on the Tabs block.</p>
      </Panel>
    }
  />
);
