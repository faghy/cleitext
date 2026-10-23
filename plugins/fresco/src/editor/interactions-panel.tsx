/**
 * The Interactions tab of atomic elements (Elementor 4): animations started
 * when the page loads or when the element scrolls into view, with a preview
 * in the canvas.
 */
import { useT } from '@cleitext/admin-sdk';
import {
  DIRECTIONS,
  EASINGS,
  EFFECTS,
  TRIGGERS,
  easingCss,
  interactionKeyframes,
  newInteraction,
  normalizeInteractions,
  type Interaction,
} from '../core/interactions.js';
import type { FrescoNode } from '../core/model.js';
import { newId } from '../core/ids.js';
import { Svg } from './controls.js';
import type { Store } from './store.js';

const TRIGGER_NAMES: Record<string, string> = {
  load: 'On page load',
  scrollIn: 'On scroll into view',
};
const EFFECT_NAMES: Record<string, string> = { fade: 'Fade', slide: 'Slide', scale: 'Scale' };
const DIRECTION_NAMES: Record<string, string> = {
  '': 'None',
  left: 'From the left',
  right: 'From the right',
  top: 'From the top',
  bottom: 'From the bottom',
};
const EASING_NAMES: Record<string, string> = {
  easeIn: 'Ease in',
  easeOut: 'Ease out',
  easeInOut: 'Ease in and out',
  linear: 'Linear',
};

/** Plays an interaction on the element in the canvas (once, without its trigger). */
function preview(nodeId: string, item: Interaction): void {
  const frame = document.querySelector<HTMLIFrameElement>('.fre-iframe');
  const element = frame?.contentDocument?.querySelector<HTMLElement>(
    `[data-fr-id="${CSS.escape(nodeId)}"]`,
  );
  if (!element || typeof element.animate !== 'function') return;
  element.animate(interactionKeyframes(item), {
    duration: item.duration,
    delay: item.delay,
    easing: easingCss(item.easing),
  });
}

export function InteractionsPanel({
  store,
  node,
  readOnly,
}: {
  store: Store;
  node: FrescoNode;
  readOnly: boolean;
}) {
  const { t } = useT();
  const list = normalizeInteractions(node.attrs._interactions);
  const write = (next: Interaction[], merge?: string) =>
    store.actions.setSettings(
      node.id,
      { _interactions: next.length ? next : undefined },
      merge ?? 'interactions',
    );
  const change = (index: number, patch: Partial<Interaction>) =>
    write(
      list.map((item, i) =>
        i !== index
          ? item
          : // A slide needs a direction: from the bottom, unless one is chosen.
            {
              ...item,
              ...patch,
              ...(patch.effect === 'slide' && !item.direction
                ? { direction: 'bottom' as const }
                : {}),
            },
      ),
      `interactions:${index}:${Object.keys(patch)[0] ?? ''}`,
    );
  const select = <K extends keyof Interaction>(
    index: number,
    key: K,
    label: string,
    options: readonly string[],
    names: Record<string, string>,
  ) => (
    <label className="fre-ia__field">
      <span>{t(label)}</span>
      <select
        className="fre-input"
        disabled={readOnly}
        value={String(list[index]![key])}
        onChange={(e) => change(index, { [key]: e.target.value } as Partial<Interaction>)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {t(names[o] ?? o)}
          </option>
        ))}
      </select>
    </label>
  );
  const number = (index: number, key: 'duration' | 'delay', label: string) => (
    <label className="fre-ia__field">
      <span>{t(label)}</span>
      <input
        className="fre-input fre-input--number"
        type="number"
        min={0}
        max={10000}
        step={50}
        disabled={readOnly}
        value={list[index]![key]}
        onChange={(e) => change(index, { [key]: Number(e.target.value) || 0 })}
      />
    </label>
  );
  return (
    <div className="fre-ia">
      <p className="fre-help">
        {t(
          'Animations that bring the element in (or take it out) when the page loads or when it scrolls into view.',
        )}
      </p>
      {list.map((item, index) => (
        <section key={item.id} className="fre-ia__item" data-fr-ia-item={index}>
          <div className="fre-ia__head">
            <strong>
              {t(EFFECT_NAMES[item.effect]!)} · {t(TRIGGER_NAMES[item.trigger]!)}
            </strong>
            <button
              type="button"
              className="fre-iconbtn"
              title={t('Play')}
              aria-label={t('Play the animation')}
              onClick={() => preview(node.id, item)}
            >
              <Svg path="M7 4l13 8-13 8z" size={13} />
            </button>
            <button
              type="button"
              className="fre-iconbtn"
              disabled={readOnly}
              aria-label={t('Remove the interaction')}
              onClick={() => write(list.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </div>
          {select(index, 'trigger', 'Trigger', TRIGGERS, TRIGGER_NAMES)}
          {select(index, 'effect', 'Effect', EFFECTS, EFFECT_NAMES)}
          {select(index, 'type', 'Type', ['in', 'out'], { in: 'In', out: 'Out' })}
          {select(index, 'direction', 'Direction', DIRECTIONS, DIRECTION_NAMES)}
          {number(index, 'duration', 'Duration (ms)')}
          {number(index, 'delay', 'Delay (ms)')}
          {select(index, 'easing', 'Easing', EASINGS, EASING_NAMES)}
        </section>
      ))}
      <button
        type="button"
        className="fre-button"
        disabled={readOnly || list.length >= 10}
        onClick={() => {
          const item = newInteraction(`i${newId()}`.slice(0, 40));
          write([...list, item]);
          preview(node.id, item);
        }}
      >
        + {t('Add interaction')}
      </button>
    </div>
  );
}
