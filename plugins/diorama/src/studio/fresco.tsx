/**
 * The Slider widget of Fresco: an element of its own in the panel (Media),
 * whose only setting is the slider, chosen from the site's. The page draws
 * it with Diorama's block, which has the same type; Fresco's canvas shows
 * the server's rendering of it. Fresco's API is on `globalThis`, set when
 * Fresco loads: admin entries load in parallel, so the element waits in its
 * queue when Diorama comes first.
 */
import type { ReactNode } from 'react';
import { BLOCK_TYPE } from '../transfer';
import { dioramaApi } from './api';

interface FrescoNode {
  id: string;
  type: string;
  v: number;
  attrs: Record<string, unknown>;
}

interface FrescoApi {
  registerElement(definition: unknown): void;
  getElement?(type: string): unknown;
  extensions(): {
    optionSources: Record<string, () => Promise<{ value: string; label: string }[]>>;
  };
}

const KEY = Symbol.for('cleitext.fresco');
const QUEUE = Symbol.for('cleitext.fresco.queue');

function onFresco(callback: (api: FrescoApi) => void): void {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  const api = holder[KEY] as FrescoApi | undefined;
  if (api) {
    callback(api);
    return;
  }
  const queue = (holder[QUEUE] as ((api: FrescoApi) => void)[] | undefined) ?? [];
  queue.push(callback);
  holder[QUEUE] = queue;
}

export const SLIDER_ICON =
  'M3 5h18v12H3z M7 21h.01 M12 21h.01 M17 21h.01 M8 11l-2 2 2 2 M16 11l2 2-2 2';

export function registerFrescoWidget(): void {
  onFresco((fresco) => {
    try {
      fresco.extensions().optionSources['diorama-sliders'] = () =>
        dioramaApi<{ value: string; label: string }[]>('GET', '/options').then((list) =>
          list.map((o) => ({ value: o.value, label: o.label })),
        );
      fresco.registerElement({
        type: BLOCK_TYPE,
        title: 'Slider',
        icon: SLIDER_ICON,
        category: 'media',
        keywords: ['slider', 'carousel', 'hero', 'slideshow', 'diorama', 'carosello'],
        controls: [
          {
            name: 'slider',
            type: 'select',
            label: 'Slider',
            tab: 'content',
            section: 'Slider',
            source: 'diorama-sliders',
            options: [{ value: '', label: 'The first slider of the site' }],
            noCss: true,
            help: 'Sliders are made in Diorama, in the admin’s menu.',
          },
        ],
        create: () => ({ type: BLOCK_TYPE, v: 1, attrs: { slider: '' } }),
        render: ({
          node,
          context,
        }: {
          node: FrescoNode;
          context: { editing: boolean; pluginBlock?: (block: FrescoNode) => ReactNode };
        }) => (context.editing ? (context.pluginBlock?.(node) ?? null) : null),
      });
    } catch (error) {
      console.error('Diorama: the Fresco widget could not be added', error);
    }
  });
}
