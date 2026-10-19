import {
  createCoreRegistry,
  cxdDocumentSchema,
  validateBlocks,
  type CxdBlock,
} from '@cleitext/blocks';
import { describe, expect, it } from 'vitest';
import { convertAny, type ImportMaps } from './convert.js';
import { JSON_LAYOUT, countJsonElements } from './json-layout.js';

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

// The shape of a real export: sections with columns, containers with widgets.
const page = [
  {
    id: 'a1',
    elType: 'section',
    settings: {
      stretch_section: 'section-stretched',
      background_background: 'classic',
      background_color: '#1F2937',
      padding: { unit: 'px', top: '60', right: '0', bottom: '60', left: '0' },
    },
    elements: [
      {
        id: 'c1',
        elType: 'column',
        settings: { _column_size: 50, _inline_size: 60 },
        elements: [
          {
            id: 'w1',
            elType: 'widget',
            widgetType: 'heading',
            settings: {
              title: 'Hello <b>world</b>',
              header_size: 'h1',
              align: 'center',
              title_color: '#FFFFFF',
            },
          },
          {
            id: 'w2',
            elType: 'widget',
            widgetType: 'text-editor',
            settings: {
              editor: '<p>First</p><p>Second <a href="https://old.test/contact/">us</a></p>',
            },
          },
        ],
      },
      {
        id: 'c2',
        elType: 'column',
        settings: { _column_size: 50, _inline_size: 40 },
        elements: [
          {
            id: 'w3',
            elType: 'widget',
            widgetType: 'image',
            settings: {
              image: {
                url: 'https://old.test/wp-content/uploads/2024/01/photo-300x200.jpg',
                id: 12,
              },
              link_to: 'file',
            },
          },
          {
            id: 'w4',
            elType: 'widget',
            widgetType: 'button',
            settings: {
              text: 'Call us',
              link: { url: 'https://old.test/contact/', is_external: 'on' },
              align: 'center',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'k1',
    elType: 'container',
    settings: { content_width: 'full', flex_direction: 'row' },
    elements: [
      {
        id: 'k2',
        elType: 'container',
        settings: { width: { unit: '%', size: 50 } },
        elements: [
          {
            id: 'w5',
            elType: 'widget',
            widgetType: 'icon-list',
            settings: { icon_list: [{ text: 'One' }, { text: 'Two', link: { url: '/two' } }] },
          },
        ],
      },
      {
        id: 'k3',
        elType: 'container',
        settings: { width: { unit: '%', size: 50 } },
        elements: [
          {
            id: 'w6',
            elType: 'widget',
            widgetType: 'tabs',
            settings: { tabs: [{ tab_title: 'A', tab_content: '<p>Alpha</p>' }] },
          },
          { id: 'w7', elType: 'widget', widgetType: 'form', settings: {} },
          {
            id: 'w8',
            elType: 'widget',
            widgetType: 'spacer',
            settings: { space: { unit: 'px', size: 40 } },
          },
        ],
      },
    ],
  },
];

const maps: ImportMaps = {
  origin: 'https://old.test',
  library: { 'photo.jpg': { id: 'm1', url: '/media/photo.jpg' } },
};

describe('pages kept as builder data', () => {
  it('counts the elements', () => {
    expect(countJsonElements(JSON.stringify(page))).toBe(14);
  });

  it('becomes native blocks: sections, columns with widths, widgets', () => {
    const { blocks, warnings } = convertAny(JSON_LAYOUT + JSON.stringify(page), maps, { newId });
    valid(blocks);
    expect(types(blocks)).toEqual([
      {
        group: [
          {
            columns: [
              { column: ['heading', 'paragraph', 'paragraph'] },
              { column: ['image', { buttons: ['button'] }] },
            ],
          },
        ],
      },
      {
        group: [
          {
            columns: [
              { column: [{ list: ['list-item', 'list-item'] }] },
              { column: ['heading', 'paragraph', 'spacer'] },
            ],
          },
        ],
      },
    ]);
    const [section] = blocks;
    expect(section!.attrs).toMatchObject({
      align: 'full',
      style: { color: { background: '#1F2937' } },
    });
    const [left, right] = section!.children![0]!.children!;
    expect(left!.attrs.width).toBe('60%');
    expect(left!.children![0]!.attrs).toMatchObject({
      level: 1,
      textAlign: 'center',
      style: { color: { text: '#FFFFFF' } },
    });
    // Links of the old site become paths; images come from the library.
    expect(JSON.stringify(left!.children![2]!.content)).toContain('"href":"/contact/"');
    expect(right!.children![0]!.attrs).toMatchObject({
      id: 'm1',
      url: '/media/photo.jpg',
      href: '/media/photo.jpg',
    });
    expect(right!.children![1]!.children![0]!.attrs).toMatchObject({
      url: '/contact/',
      linkTarget: '_blank',
    });
    expect(warnings).toEqual(
      expect.arrayContaining([
        { kind: 'simplified', tag: 'tabs', count: 1 },
        { kind: 'skipped', tag: 'form', count: 1 },
      ]),
    );
  });

  it('reports data it cannot read', () => {
    expect(convertAny(`${JSON_LAYOUT}{oops`).warnings[0]).toMatchObject({ kind: 'unknown' });
  });
});
