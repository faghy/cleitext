import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import plugin from './server';

interface Def {
  type: string;
  attributes: { name: string; default?: unknown; showIf?: unknown }[];
  render(props: Record<string, unknown>): ReactNode;
}

/** The blocks the plugin registers, with a context that only collects them. */
function blocks(): Map<string, Def> {
  const found = new Map<string, Def>();
  const ctx = {
    assets: { enqueue: () => {} },
    blocks: { register: (def: Def) => found.set(def.type, def) },
  };
  (plugin as unknown as { setup(ctx: unknown): void }).setup(ctx);
  return found;
}

/** The text of the widget's title (`Title`'s `text`, '' when it has none). */
function titleText(node: ReactNode): string | undefined {
  if (!isValidElement(node)) return undefined;
  const element = node as ReactElement<{ text?: string; children?: ReactNode }>;
  if (typeof element.type === 'function' && element.type.name === 'Title')
    return element.props.text ?? '';
  const children = element.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const text = titleText(child as ReactNode);
    if (text !== undefined) return text;
  }
  return undefined;
}

const context = { locale: 'en', page: { site: { home: '/' } } };

describe('the title of the widgets (Widgets 1.2.1)', () => {
  const defs = blocks();
  const render = (type: string, attrs: Record<string, unknown>, data: unknown) =>
    titleText(defs.get(type)!.render({ attrs, data, block: { id: 'b1' }, context }));
  const cases: [string, unknown, string][] = [
    ['widgets/recent-posts', { posts: [], link: null }, 'Recent posts'],
    ['widgets/recent-comments', [], 'Recent comments'],
    [
      'widgets/tag-cloud',
      { items: [{ id: 't', name: 'A', url: '/a', count: 1 }], min: 1, max: 1 },
      'Tags',
    ],
    [
      'widgets/categories',
      { items: [{ id: 'c', name: 'A', url: '/a', count: 1, children: [] }] },
      'Categories',
    ],
  ];

  it('has a "Show the title" switch, on by default, that hides the title fields when off', () => {
    for (const [type] of cases) {
      const attributes = defs.get(type)!.attributes;
      expect(attributes[0]).toMatchObject({ name: 'showTitle', default: true });
      expect(attributes.find((a) => a.name === 'title')?.showIf).toEqual({
        field: 'showTitle',
        not: false,
      });
    }
    const link = defs.get('widgets/recent-posts')!.attributes.find((a) => a.name === 'titleUrl');
    expect(link?.showIf).toEqual({ field: 'showTitle', not: false });
  });

  it('shows the written or default title, none when switched off or with "-"', () => {
    for (const [type, data, fallback] of cases) {
      expect(render(type, {}, data)).toBe(fallback);
      expect(render(type, { title: ' News ' }, data)).toBe('News');
      expect(render(type, { title: 'News', showTitle: true }, data)).toBe('News');
      expect(render(type, { title: 'News', showTitle: false }, data)).toBe('');
      // Older pages and imports: "-" still means none.
      expect(render(type, { title: '-' }, data)).toBe('');
      expect(render(type, { title: '-', showTitle: false }, data)).toBe('');
    }
  });
});
