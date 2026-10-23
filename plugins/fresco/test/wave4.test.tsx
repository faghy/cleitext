import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { atomicKitCss } from '../src/core/atomic.js';
import { rootProps } from '../src/core/common.js';
import {
  COMPONENT_TYPE,
  expandInstance,
  expandTree,
  makesCycle,
  normalizeComponent,
  normalizeComponents,
  setComponentSource,
  type Component,
} from '../src/core/components.js';
import { documentCss, withDefaults } from '../src/core/css.js';
import {
  classesByPriority,
  designUsage,
  duplicateClass,
  freeId,
  liveVariables,
  localStyleToClass,
  moveClass,
  variablesFromKit,
} from '../src/core/design-system.js';
import {
  interactionKeyframes,
  interactionsAttribute,
  normalizeInteractions,
  parseInteractionsAttribute,
} from '../src/core/interactions.js';
import { DEFAULT_KIT, normalizeKit } from '../src/core/kit.js';
import { DEFAULT_BREAKPOINTS, type FrescoNode, type RenderContext } from '../src/core/model.js';
import { getElement } from '../src/core/registry.js';
import { componentElementsAllowed, drawInstances } from '../src/components-server.js';
import { componentInstance } from '../src/elements/component.js';
import { registerFreeElements } from '../src/elements/index.js';

registerFreeElements();

const context = (editing = false): RenderContext => ({
  media: new Map(),
  locale: 'en',
  editing,
  site: { title: '', tagline: '', home: '/' },
});

const heading = (id: string, title: string, attrs: Record<string, unknown> = {}): FrescoNode => ({
  id,
  type: 'fresco/a-heading',
  v: 1,
  attrs: { title, ...attrs },
});

const card: Component = {
  id: 'card',
  title: 'Card',
  nodes: [
    {
      id: 'root',
      type: 'fresco/a-flexbox',
      v: 1,
      attrs: {
        _styles: [{ device: 'desktop', state: '', props: { gap: { size: 8, unit: 'px' } } }],
      },
      children: [
        heading('t', 'Title', {
          _styles: [{ device: 'desktop', state: '', props: { color: '#111111' } }],
        }),
        {
          id: 'img',
          type: 'fresco/a-image',
          v: 1,
          attrs: { image: { id: null, url: '/m/a.jpg' } },
        },
      ],
    },
  ],
  props: [
    { key: 'title', label: 'Title', nodeId: 't', setting: 'title' },
    { key: 'photo', label: 'Photo', nodeId: 'img', setting: 'image' },
  ],
};

const instance = (id: string, attrs: Record<string, unknown> = {}): FrescoNode => ({
  id,
  type: COMPONENT_TYPE,
  v: 1,
  attrs: { component: 'card', ...attrs },
});

describe('interactions', () => {
  it('keeps only what Fresco plays, with defaults', () => {
    const list = normalizeInteractions([
      { trigger: 'scrollIn', effect: 'slide', duration: 99999, easing: 'bogus' },
      { trigger: 'hover', effect: 'custom' },
      'nope',
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      trigger: 'scrollIn',
      effect: 'slide',
      direction: 'bottom',
      duration: 10000,
      easing: 'easeIn',
      type: 'in',
    });
    expect(list[1]).toMatchObject({ trigger: 'load', effect: 'fade' });
  });

  it('builds keyframes for in and out, keeping the transform', () => {
    const [from, to] = interactionKeyframes({
      ...normalizeInteractions([{ effect: 'scale', direction: 'left' }])[0]!,
    });
    expect(from).toEqual({ scale: '0', translate: '-100px 0px' });
    expect(to).toEqual({ scale: '1', translate: '0px 0px' });
    const out = interactionKeyframes(normalizeInteractions([{ effect: 'fade', type: 'out' }])[0]!);
    expect(out).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });

  it('goes to the page in data-fr-ia, round trip', () => {
    const value = [{ trigger: 'scrollIn', effect: 'fade', delay: 200 }];
    const text = interactionsAttribute(value)!;
    expect(parseInteractionsAttribute(text)[0]).toMatchObject({ trigger: 'scrollIn', delay: 200 });
    expect(parseInteractionsAttribute('{bad')).toEqual([]);
    expect(interactionsAttribute([])).toBeNull();
  });

  it('marks the element on the page only, and only when it has interactions', () => {
    const node = heading('h', 'Hi', { _interactions: [{ effect: 'fade' }] });
    const props = rootProps(node, node.attrs, 'fr-a', false);
    expect(props['data-fr-ia']).toBeTruthy();
    expect(props['data-fr-ia-wait']).toBe('');
    const editing = rootProps(node, node.attrs, 'fr-a', true);
    expect(editing['data-fr-ia']).toBeUndefined();
    const plain = rootProps(heading('p', 'x'), {}, 'fr-a', false);
    expect(Object.keys(plain).some((k) => k.startsWith('data-fr-ia'))).toBe(false);
    const out = rootProps(
      heading('o', 'x', { _interactions: [{ effect: 'fade', type: 'out' }] }),
      {},
      'fr-a',
      false,
    );
    expect(out['data-fr-ia-wait']).toBeUndefined();
  });
});

describe('components', () => {
  const lookup = (id: string) => (id === 'card' ? card : undefined);

  it('normalizes components and drops unknown property targets', () => {
    const c = normalizeComponent({
      ...card,
      props: [...card.props, { key: 'x', label: 'X', nodeId: 'missing', setting: 'title' }],
    });
    expect(c?.props.map((p) => p.key)).toEqual(['title', 'photo']);
    expect(normalizeComponent({ ...card, nodes: [] })).toBeNull();
    expect(normalizeComponent({ ...card, id: 'Bad Id' })).toBeNull();
    expect(normalizeComponents({ items: [card, card, null] })).toHaveLength(1);
  });

  it('draws an instance as the root with its id, prefixed ids and overrides', () => {
    const out = expandInstance(instance('i1', { overrides: { title: 'Mine' } }), lookup)!;
    expect(out.id).toBe('i1');
    expect(out.type).toBe('fresco/a-flexbox');
    expect(out.children!.map((c) => c.id)).toEqual(['i1-t', 'i1-img']);
    expect(out.children![0]!.attrs.title).toBe('Mine');
    expect(out.children![1]!.attrs.image).toEqual({ id: null, url: '/m/a.jpg' });
    // The component itself is unchanged.
    expect(card.nodes[0]!.children![0]!.attrs.title).toBe('Title');
  });

  it('draws nested instances and never a component inside itself', () => {
    const outer: Component = {
      id: 'outer',
      title: 'Outer',
      nodes: [
        {
          id: 'box',
          type: 'fresco/a-div',
          v: 1,
          attrs: {},
          children: [instance('in'), { ...instance('self'), attrs: { component: 'outer' } }],
        },
      ],
      props: [],
    };
    const find = (id: string) => (id === 'outer' ? outer : lookup(id));
    const out = expandInstance({ ...instance('o'), attrs: { component: 'outer' } }, find)!;
    expect(out.children!.map((c) => c.id)).toEqual(['o-in']);
    expect(out.children![0]!.children!.map((c) => c.id)).toEqual(['o-in-t', 'o-in-img']);
    expect(makesCycle('outer', outer.nodes, find)).toBe(true);
    expect(makesCycle('card', card.nodes, find)).toBe(false);
  });

  it('leaves out instances of missing components', () => {
    const tree = expandTree(
      [
        {
          id: 'c',
          type: 'fresco/a-div',
          v: 1,
          attrs: {},
          children: [instance('x', { component: 'gone' })],
        },
      ],
      lookup,
    );
    expect(tree[0]!.children).toEqual([]);
  });

  it('styles instances from their component (editor CSS)', () => {
    setComponentSource(lookup);
    const css = documentCss([instance('i9')], getElement, DEFAULT_BREAKPOINTS);
    expect(css).toContain('.fr-e-i9{gap:8px}');
    expect(css).toContain('.fr-e-i9-t{color:#111111}');
    setComponentSource(null);
  });

  it('renders like the component, in the editor and from loaded data', () => {
    setComponentSource(lookup);
    const node = instance('i2', { overrides: { title: 'Hello' } });
    const editing = renderToStaticMarkup(
      componentInstance.render({
        node,
        settings: withDefaults(componentInstance, node.attrs),
        context: context(true),
      }),
    );
    // The root is selectable as the instance; the elements inside are not.
    expect(editing).toContain('data-fr-id="i2"');
    expect(editing).not.toContain('data-fr-id="i2-t"');
    expect(editing).toContain('Hello');
    setComponentSource(null);
    const page = renderToStaticMarkup(
      componentInstance.render({
        node,
        settings: {},
        context: context(),
        data: { components: { card }, breakpoints: DEFAULT_BREAKPOINTS },
      }),
    );
    expect(page).toContain('fr-e-i2-t');
    expect(page).toContain('<style>');
    expect(page).not.toContain('data-fr-id');
    const missing = renderToStaticMarkup(
      componentInstance.render({ node, settings: {}, context: context() }),
    );
    expect(missing).toBe('');
  });

  it('holds atomic elements only, and pages get their instances drawn', async () => {
    expect(componentElementsAllowed(card.nodes)).toBe(true);
    expect(componentElementsAllowed([{ id: 'x', type: 'fresco/heading', v: 1, attrs: {} }])).toBe(
      false,
    );
    const tags: string[] = [];
    const ctx = {
      storage: { get: async () => ({ items: [card] }) },
    } as never;
    const blocks = [
      { id: 'c', type: 'fresco/container', v: 1, attrs: {}, children: [instance('k')] },
    ];
    const out = (await drawInstances(ctx, 'site-a', blocks, (t) => tags.push(t))) as FrescoNode[];
    expect(out[0]!.children![0]!.id).toBe('k');
    expect(out[0]!.children![0]!.type).toBe('fresco/a-flexbox');
    expect(tags).toEqual(['fresco:components']);
    // Pages without instances are given back as they are.
    const plain = [heading('h', 'x')];
    expect(await drawInstances(ctx, 'site-a', plain, () => {})).toBe(plain);
  });
});

describe('class and variables managers', () => {
  const classes = [
    { id: 'a', label: 'A', variants: [] },
    { id: 'b', label: 'B', variants: [] },
    { id: 'c', label: 'C', variants: [] },
  ];

  it('lists classes by priority (the last in the CSS first) and moves them', () => {
    expect(classesByPriority(classes).map((c) => c.id)).toEqual(['c', 'b', 'a']);
    // "a" to the top of the priority list: last in the kit.
    expect(moveClass(classes, 2, 0).map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(moveClass(classes, 5, 0)).toBe(classes);
  });

  it('duplicates, converts local styles and picks free ids', () => {
    const next = duplicateClass(classes, 'a', 'A copy');
    expect(next.map((c) => c.id)).toEqual(['a', 'a-copy', 'b', 'c']);
    expect(freeId('Card', ['card', 'card-2'])).toBe('card-3');
    expect(freeId('Àccènt!', [])).toBe('accent');
    const styles = [{ device: 'desktop', state: '', props: { color: '#000000' } }];
    const result = localStyleToClass({ classes }, { _styles: styles, _classes: ['b'] }, 'Hero')!;
    expect(result.classes.at(-1)).toEqual({ id: 'hero', label: 'Hero', variants: styles });
    expect(result.attrs).toEqual({ _styles: undefined, _classes: ['b', 'hero'] });
    expect(localStyleToClass({ classes }, {}, 'X')).toBeNull();
  });

  it('counts the use of classes and variables', () => {
    const usage = designUsage(
      [
        {
          blocks: [
            heading('1', 'x', {
              _classes: ['a', 'b'],
              _styles: [{ device: 'desktop', state: '', props: { color: 'var(--fr-v-brand)' } }],
            }),
            heading('2', 'y', { _classes: ['a'] }),
          ],
        },
        { blocks: [heading('3', 'z', { _classes: ['a'] })] },
        { blocks: 'not a tree' },
      ],
      {
        classes: [
          {
            id: 'a',
            label: 'A',
            variants: [{ device: 'desktop', state: '', props: { color: 'var(--fr-v-brand)' } }],
          },
        ],
      },
    );
    expect(usage.documents).toBe(2);
    expect(usage.classes.a).toEqual({ elements: 3, documents: 2 });
    expect(usage.classes.b).toEqual({ elements: 1, documents: 1 });
    expect(usage.variables.brand).toEqual({ uses: 2, documents: 1 });
  });

  it('imports the global colors and fonts once, and keeps deleted variables in the CSS', () => {
    const kit = normalizeKit(DEFAULT_KIT);
    const imported = variablesFromKit(kit);
    expect(imported.map((v) => v.id)).toContain('color-primary');
    expect(imported.find((v) => v.id === 'font-text')).toMatchObject({
      type: 'font',
      value: 'Inter',
    });
    expect(variablesFromKit({ ...kit, variables: imported })).toEqual([]);
    const withDeleted = normalizeKit({
      ...DEFAULT_KIT,
      variables: [
        { id: 'old', label: 'Old', type: 'color', value: '#123456', deleted: true },
        { id: 'new', label: 'New', type: 'color', value: '#654321', deleted: 'yes' },
      ],
    });
    expect(withDeleted.variables[0]!.deleted).toBe(true);
    expect(withDeleted.variables[1]!.deleted).toBeUndefined();
    expect(liveVariables(withDeleted.variables, 'color').map((v) => v.id)).toEqual(['new']);
    expect(atomicKitCss([], withDeleted.variables, DEFAULT_BREAKPOINTS)).toContain(
      '--fr-v-old:#123456',
    );
  });
});
