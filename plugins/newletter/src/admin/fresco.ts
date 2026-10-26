/**
 * The Newsletter widget of Fresco: an element in its panel whose settings
 * are those of the signup block (same type), drawn on the page by the
 * block; Fresco's canvas shows the server's drawing. Fresco's API is on
 * `globalThis`, set when Fresco loads; admin entries load in parallel, so
 * the element waits in its queue when NewLetter comes first.
 */
import { pluginApi } from '@cleitext/admin-sdk';
import type { ReactNode } from 'react';
import { BLOCK_TYPE, SLUG } from '../config';

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

export const MAIL_ICON = 'M4 6h16v12H4z M4 7l8 6 8-6';

const content = (name: string, type: string, label: string, extra: object = {}) => ({
  name,
  type,
  label,
  tab: 'content',
  section: 'Newsletter',
  noCss: true,
  ...extra,
});

export function registerFrescoWidget(): void {
  onFresco((fresco) => {
    try {
      fresco.extensions().optionSources[`${SLUG}-lists`] = () =>
        pluginApi(SLUG)<{ id: string; name: string }[]>('GET', '/lists')
          .then((lists) => lists.map((l) => ({ value: l.id, label: l.name })))
          .catch(() => []);
      fresco.registerElement({
        type: BLOCK_TYPE,
        title: 'Newsletter',
        icon: MAIL_ICON,
        category: 'general',
        keywords: ['newsletter', 'subscribe', 'signup', 'email', 'iscrizione', 'iscriviti'],
        controls: [
          content('heading', 'text', 'Heading'),
          content('text', 'textarea', 'Text'),
          content('fields', 'select', 'Fields', {
            options: [
              { value: 'email', label: 'Email only' },
              { value: 'name', label: 'Name and email' },
              { value: 'name-surname', label: 'Name, surname and email' },
              { value: 'all', label: 'All fields' },
            ],
          }),
          content('layout', 'select', 'Layout', {
            options: [
              { value: 'stacked', label: 'Stacked' },
              { value: 'inline', label: 'On one line' },
            ],
          }),
          content('lists', 'select', 'List', {
            source: `${SLUG}-lists`,
            options: [{ value: '', label: 'The default lists' }],
            help: 'The service and its lists are set up in NewLetter, in the admin’s menu.',
          }),
          content('buttonLabel', 'text', 'Button text'),
          content('successMessage', 'text', 'Message after subscribing'),
          content('doubleOptIn', 'select', 'Double opt-in', {
            options: [
              { value: 'default', label: 'As in the settings' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ],
          }),
        ],
        create: () => ({
          type: BLOCK_TYPE,
          v: 1,
          attrs: { fields: 'email', layout: 'stacked', doubleOptIn: 'default' },
        }),
        render: ({
          node,
          context,
        }: {
          node: FrescoNode;
          context: { editing: boolean; pluginBlock?: (block: FrescoNode) => ReactNode };
        }) => (context.editing ? (context.pluginBlock?.(node) ?? null) : null),
      });
    } catch (error) {
      console.error('NewLetter: the Fresco widget could not be added', error);
    }
  });
}
