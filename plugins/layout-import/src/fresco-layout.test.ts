import {
  createCoreRegistry,
  cxdDocumentSchema,
  validateBlocks,
  type CxdBlock,
} from '@cleitext/blocks';
import { describe, expect, it } from 'vitest';
import { convertAny } from './convert.js';
import {
  convertFresco,
  countFrescoElements,
  frescoSource,
  isFrescoDocument,
  type FrescoNode,
} from './fresco-layout.js';

let n = 0;
const newId = () => `b${n++}`;
const types = (blocks: CxdBlock[]): unknown[] =>
  blocks.map((b) =>
    b.children?.length ? { [b.type.slice(5)]: types(b.children) } : b.type.slice(5),
  );
const valid = (blocks: CxdBlock[]) => {
  const doc = cxdDocumentSchema.parse({ schema: 1, blocks });
  expect(validateBlocks(doc, createCoreRegistry())).toEqual([]);
};
const el = (type: string, attrs: Record<string, unknown> = {}, children?: FrescoNode[]) => ({
  id: `n${n++}`,
  type: `fresco/${type}`,
  v: 1,
  attrs,
  ...(children ? { children } : {}),
});

// A page as Fresco saves it: a full-width hero, a row of two boxes, a grid.
const page: FrescoNode[] = [
  el(
    'container',
    {
      content_width: 'full',
      background_type: 'classic',
      background_color: '#1f2937',
      _padding: { top: 60, right: 0, bottom: 60, left: 0, unit: 'px' },
      min_height: { size: 100, unit: 'vh' },
    },
    [
      el('heading', {
        title: 'Hello <b>world</b>',
        tag: 'h1',
        align: 'center',
        title_color: '#ffffff',
        title_typography_size: { size: 48, unit: 'px' },
      }),
      el('text', {
        content: '<p>First</p><p>Second <a href="https://old.test/contact/">us</a></p>',
      }),
      el('button', {
        text: 'Go',
        link: { url: 'https://old.test/go/', newTab: true },
        align: 'center',
      }),
    ],
  ),
  el('container', { flex_direction: 'row', align_items: 'center' }, [
    el('container', { width: { size: 60, unit: '%' } }, [
      el('image', {
        image: { id: 'm1', url: '/media/a.jpg', alt: 'A' },
        link_to: 'custom',
        link: { url: '/about/' },
        caption_source: 'custom',
        caption: 'Caption',
      }),
    ]),
    el('container', { width: { size: 40, unit: '%' } }, [
      el('icon-list', { items: [{ text: 'One', link: { url: '/one/' } }, { text: 'Two' }] }),
      el('spacer', { space: { size: 30, unit: 'px' } }),
      el('divider'),
    ]),
  ]),
  el('container', { container_type: 'grid', grid_columns: 2 }, [
    el('container', {}, [el('heading', { title: 'A', tag: 'h3' })]),
    el('container', {}, [el('heading', { title: 'B', tag: 'h3' })]),
    el('container', {}, [el('heading', { title: 'C', tag: 'h3' })]),
  ]),
];

describe('Fresco pages to blocks', () => {
  it('turns containers into full-width groups and columns, widgets into blocks', () => {
    const { blocks, warnings } = convertFresco(page, { origin: 'https://old.test' }, { newId });
    valid(blocks);
    expect(types(blocks)).toEqual([
      { group: ['heading', 'paragraph', 'paragraph', { buttons: ['button'] }] },
      {
        group: [
          {
            columns: [
              { column: ['image'] },
              { column: [{ list: ['list-item', 'list-item'] }, 'spacer', 'separator'] },
            ],
          },
        ],
      },
      {
        group: [
          { columns: [{ column: ['heading'] }, { column: ['heading'] }] },
          { columns: [{ column: ['heading'] }] },
        ],
      },
    ]);
    const hero = blocks[0]!;
    expect(hero.attrs).toEqual({
      tagName: 'section',
      align: 'full',
      style: {
        color: { background: '#1f2937' },
        spacing: { padding: { top: '60px', right: '0', bottom: '60px', left: '0' } },
      },
      layout: { type: 'default' },
    });
    expect(blocks[1]!.attrs).toMatchObject({ align: 'full', layout: { type: 'constrained' } });
    const [heading, , second, buttons] = hero.children!;
    expect(heading!.attrs).toEqual({
      level: 1,
      textAlign: 'center',
      style: { color: { text: '#ffffff' }, typography: { fontSize: '48px' } },
    });
    expect(JSON.stringify(heading!.content)).toContain('"bold"');
    // Links to the old site become paths of this one.
    expect(JSON.stringify(second!.content)).toContain('"href":"/contact/"');
    expect(buttons!.attrs).toEqual({ layout: { type: 'flex', justifyContent: 'center' } });
    expect(buttons!.children![0]!.attrs).toEqual({ url: '/go/', linkTarget: '_blank' });
    const columns = blocks[1]!.children![0]!;
    expect(columns.attrs).toEqual({ verticalAlignment: 'center' });
    expect(columns.children!.map((c) => c.attrs.width)).toEqual(['60%', '40%']);
    expect(columns.children![0]!.children![0]!.attrs).toMatchObject({
      id: 'm1',
      url: '/media/a.jpg',
      alt: 'A',
      href: '/about/',
    });
    expect(warnings).toEqual([{ kind: 'simplified', tag: 'minimum height', count: 1 }]);
  });

  it('shows tabs, counters and carousels with simpler blocks and reports what has no block', () => {
    const { blocks, warnings } = convertFresco(
      [
        el('container', {}, [
          el('tabs', {}, [
            el('container', { _title: 'First' }, [el('text', { content: '<p>One</p>' })]),
            el('container', { _title: 'Second' }, [el('text', { content: '<p>Two</p>' })]),
          ]),
          el('counter', { end: 250, suffix: '+', title: 'Clients' }),
          el('image-carousel', { images: [{ id: 'm1', url: '/a.jpg' }, { url: '/b.jpg' }] }),
          el('google-maps', { address: 'Rome' }),
          el('nav-menu', {}),
          { id: 'f', type: 'fresco-pro/form', v: 1, attrs: {} },
          el('heading', { title: 'Phones only', _hide_desktop: true }),
          el('testimonial', { content: 'Great', name: 'Ann', job: 'CEO' }),
          el('html', { code: '<b>raw</b>' }),
          el('container', { background_type: 'classic', background_image: { url: '/bg.jpg' } }, [
            el('text', { content: '<p>Inside</p>' }),
          ]),
        ]),
      ],
      {},
      { newId },
    );
    valid(blocks);
    expect(types(blocks[0]!.children!)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'paragraph',
      'heading',
      'paragraph',
      { gallery: ['image', 'image'] },
      { quote: ['paragraph'] },
      'html',
      'paragraph',
    ]);
    expect(blocks[0]!.children![4]!.content).toEqual([{ text: '250+' }]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        { kind: 'simplified', tag: 'tabs', count: 1 },
        { kind: 'simplified', tag: 'counter', count: 1 },
        { kind: 'simplified', tag: 'image-carousel', count: 1 },
        { kind: 'skipped', tag: 'google-maps', count: 1 },
        { kind: 'skipped', tag: 'nav-menu', count: 1 },
        { kind: 'skipped', tag: 'fresco-pro/form', count: 1 },
        { kind: 'skipped', tag: 'hidden on computers', count: 1 },
        { kind: 'background', tag: 'background image', count: 1 },
      ]),
    );
  });

  it('keeps the blocks of other plugins and drops boxes left empty', () => {
    const plugin = { id: 'p', type: 'maps/map', v: 1, attrs: { address: 'Rome' } };
    const { blocks } = convertFresco(
      [
        el('container', { flex_direction: 'row' }, [
          el('container', {}, [el('block', {}, [plugin])]),
          el('container', {}, [el('nav-menu')]),
        ]),
      ],
      {},
      { newId },
    );
    // The empty column goes, and a row of one column becomes its content.
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.children).toEqual([plugin]);
  });

  it('is reached through convertAny, and recognises Fresco documents', () => {
    expect(isFrescoDocument({ schema: 1, blocks: page, editor: { id: 'fresco' } })).toBe(true);
    expect(isFrescoDocument({ schema: 1, blocks: [] })).toBe(false);
    expect(countFrescoElements(page)).toBe(18);
    const { blocks } = convertAny(frescoSource(page), {}, { newId });
    expect(blocks).toHaveLength(3);
    expect(convertAny(`${frescoSource([]).slice(0, -1)}{`).warnings[0]!.kind).toBe('unknown');
  });
});
