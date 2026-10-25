/**
 * The Booking widget of Fresco: an element of its own in the panel, whose
 * settings are the service and the kind of calendar. The page draws it with
 * Agenda's block, which has the same type; Fresco's canvas shows the
 * server's drawing. Fresco's API is on `globalThis`, set when Fresco loads:
 * admin entries load in parallel, so the element waits in its queue when
 * Agenda comes first.
 */
import type { ReactNode } from 'react';
import { BLOCK_TYPE } from '../config';
import { agendaApi } from './api';

interface FrescoNode {
  id: string;
  type: string;
  v: number;
  attrs: Record<string, unknown>;
}

interface FrescoApi {
  registerElement(definition: unknown): void;
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

export const CALENDAR_ICON =
  'M8 3v3 M16 3v3 M4 8h16 M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M9 14l2 2 4-4';

export function registerFrescoWidget(): void {
  onFresco((fresco) => {
    try {
      fresco.extensions().optionSources['agenda-services'] = () =>
        agendaApi<{ value: string; label: string; status: string }[]>('GET', '/options').then(
          (list) =>
            list
              .filter((o) => o.status !== 'archived')
              .map((o) => ({ value: o.value, label: o.label })),
        );
      fresco.registerElement({
        type: BLOCK_TYPE,
        title: 'Booking',
        icon: CALENDAR_ICON,
        category: 'general',
        keywords: ['booking', 'appointment', 'calendar', 'agenda', 'prenotazione', 'appuntamento'],
        controls: [
          {
            name: 'service',
            type: 'select',
            label: 'Service',
            tab: 'content',
            section: 'Booking',
            source: 'agenda-services',
            options: [{ value: '', label: 'The visitor chooses' }],
            noCss: true,
            help: 'Services are set up in Agenda, in the admin’s menu.',
          },
          {
            name: 'view',
            type: 'select',
            label: 'Calendar',
            tab: 'content',
            section: 'Booking',
            options: [
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
            ],
            noCss: true,
          },
          {
            name: 'heading',
            type: 'text',
            label: 'Heading',
            tab: 'content',
            section: 'Booking',
            noCss: true,
          },
        ],
        create: () => ({ type: BLOCK_TYPE, v: 1, attrs: { service: '', view: 'month' } }),
        render: ({
          node,
          context,
        }: {
          node: FrescoNode;
          context: { editing: boolean; pluginBlock?: (block: FrescoNode) => ReactNode };
        }) => (context.editing ? (context.pluginBlock?.(node) ?? null) : null),
      });
    } catch (error) {
      console.error('Agenda: the Fresco widget could not be added', error);
    }
  });
}
