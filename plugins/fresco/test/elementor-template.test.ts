/**
 * Elementor template files (`.json`, from Elementor's Templates → Export)
 * imported as Fresco templates, next to Fresco's own files.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { FrescoNode } from '../src/core/model.js';
import { getElement, registerElement, unregisterElement } from '../src/core/registry.js';
import { externalImages, isElementorTemplate } from '../src/editor/elementor-template.js';
import {
  importNotes,
  parseTemplateFile,
  readTemplateFile,
  templateFile,
} from '../src/editor/library.js';
import { registerFreeElements } from '../src/elements/index.js';

beforeAll(() => {
  registerFreeElements();
});

/** An Elementor template file as Elementor exports it. */
const elementorFile = (type: string, content: unknown[], title = 'Hero') =>
  JSON.stringify({ version: '0.4', title, type, content, page_settings: [] });

const widget = (widgetType: string, settings: Record<string, unknown>, id = widgetType) => ({
  id,
  elType: 'widget',
  widgetType,
  isInner: false,
  settings,
  elements: [],
});

const types = (nodes: FrescoNode[]): unknown[] =>
  nodes.map((node) => (node.children ? [node.type, types(node.children)] : node.type));

describe('Elementor template files', () => {
  it('converts a section and its column with a heading, text, image and button', () => {
    const imported = readTemplateFile(
      elementorFile('page', [
        {
          id: 's1',
          elType: 'section',
          settings: { background_background: 'classic', background_color: '#112233' },
          elements: [
            {
              id: 'c1',
              elType: 'column',
              settings: { _column_size: 100 },
              elements: [
                widget('heading', { title: 'Welcome', header_size: 'h1' }),
                widget('text-editor', { editor: '<p>Some <strong>text</strong></p>' }),
                widget('image', {
                  image: { id: 42, url: 'https://old.example/wp-content/uploads/cat.jpg' },
                }),
                widget('button', {
                  text: 'Contact us',
                  link: { url: 'https://example.com/contact', is_external: 'on' },
                }),
              ],
            },
          ],
        },
      ]),
    );
    expect(imported.source).toBe('elementor');
    expect(imported.file.format).toBe('fresco-template');
    expect(imported.file.title).toBe('Hero');
    expect(imported.file.kind).toBe('page');
    const [section] = imported.file.blocks;
    expect(section!.type).toBe('fresco/container');
    const all: FrescoNode[] = [];
    const walk = (nodes: FrescoNode[]) =>
      nodes.forEach((node) => {
        all.push(node);
        if (node.children) walk(node.children);
      });
    walk(imported.file.blocks);
    const byType = (type: string) => all.find((node) => node.type === type)!;
    expect(byType('fresco/heading').attrs).toMatchObject({ title: 'Welcome', tag: 'h1' });
    expect(byType('fresco/text').attrs.content).toBe('<p>Some <strong>text</strong></p>');
    // Not in this site's library: the image keeps its address.
    expect(byType('fresco/image').attrs.image).toEqual({
      id: null,
      url: 'https://old.example/wp-content/uploads/cat.jpg',
    });
    expect(byType('fresco/button').attrs).toMatchObject({
      text: 'Contact us',
      link: { url: 'https://example.com/contact', newTab: true },
    });
    expect(imported).toMatchObject({ skipped: 0, unconverted: 0, externalImages: 1 });
    expect(importNotes(imported)).toHaveLength(1);
  });

  it('converts a container with nested containers, as a section', () => {
    const imported = readTemplateFile(
      elementorFile('container', [
        {
          id: 'outer',
          elType: 'container',
          settings: { flex_direction: 'row' },
          elements: [
            {
              id: 'a',
              elType: 'container',
              isInner: true,
              settings: {},
              elements: [widget('heading', { title: 'Left' })],
            },
            {
              id: 'b',
              elType: 'container',
              isInner: true,
              settings: {
                background_background: 'classic',
                background_image: { id: '', url: '//cdn.example/bg.png' },
              },
              elements: [widget('heading', { title: 'Right' })],
            },
          ],
        },
      ]),
    );
    expect(imported.file.kind).toBe('section');
    expect(types(imported.file.blocks)).toEqual([
      [
        'fresco/container',
        [
          ['fresco/container', ['fresco/heading']],
          ['fresco/container', ['fresco/heading']],
        ],
      ],
    ]);
    expect(imported.externalImages).toBe(1);
  });

  it('keeps Pro widgets when Fresco Pro is active, and leaves them out otherwise', () => {
    const file = elementorFile('section', [
      widget('heading', { title: 'Path' }),
      widget('breadcrumbs', {}),
    ]);
    const without = readTemplateFile(file);
    expect(types(without.file.blocks)).toEqual([['fresco/container', ['fresco/heading']]]);
    expect(without.skipped).toBe(1);
    expect(importNotes(without)[0]).toContain('1');

    registerElement({ ...getElement('fresco/heading')!, type: 'fresco-pro/breadcrumbs' });
    try {
      const withPro = readTemplateFile(file);
      expect(types(withPro.file.blocks)).toEqual([
        ['fresco/container', ['fresco/heading', 'fresco-pro/breadcrumbs']],
      ]);
      expect(withPro.skipped).toBe(0);
    } finally {
      unregisterElement('fresco-pro/breadcrumbs');
    }
  });

  it('keeps the text of widgets with no counterpart and counts them', () => {
    const imported = readTemplateFile(
      elementorFile('section', [
        widget('some-addon-widget', { title: 'Kept text' }),
        widget('another-addon', {}),
      ]),
    );
    expect(imported.unconverted).toBe(2);
    const text = imported.file.blocks[0]!.children!;
    expect(text.map((node) => node.type)).toEqual(['fresco/text']);
    expect(text[0]!.attrs.content).toBe('<p>Kept text</p>');
    expect(importNotes(imported)).toEqual([expect.stringContaining('2')]);
  });

  it('turns standalone shortcodes back into their text', () => {
    const imported = readTemplateFile(
      elementorFile('section', [widget('shortcode', { shortcode: '[contact-form id="3"]' })]),
    );
    const json = JSON.stringify(imported.file.blocks);
    expect(json).not.toContain('core/imported');
    expect(json).toContain('[contact-form id=\\"3\\"]');
  });

  it('gives an empty title its default and rejects empty templates', () => {
    expect(
      readTemplateFile(elementorFile('page', [widget('heading', { title: 'x' })], '  ')).file.title,
    ).toBe('Imported template');
    expect(() => readTemplateFile(elementorFile('page', []))).toThrow(/empty/);
  });

  it('tells files of neither format apart', () => {
    expect(() => readTemplateFile('PK\u0003\u0004 zip')).toThrow(/neither/);
    expect(() => readTemplateFile('{"title":"x"}')).toThrow(/neither/);
    expect(() => readTemplateFile('[]')).toThrow(/neither/);
    expect(isElementorTemplate({ version: '0.4', content: [] })).toBe(true);
    expect(isElementorTemplate({ format: 'fresco-template', blocks: [] })).toBe(false);
  });

  it('finds images by address only, not those of the media library', () => {
    const node = (attrs: Record<string, unknown>): FrescoNode => ({
      id: 'x',
      type: 'fresco/image',
      v: 1,
      attrs,
    });
    expect(
      externalImages([
        node({ image: { id: null, url: 'https://a.example/1.jpg' } }),
        node({ image: { id: 'att:3', url: 'https://a.example/2.jpg' } }),
        node({ gallery: [{ id: null, url: 'https://a.example/1.jpg' }] }),
      ]).size,
    ).toBe(1);
  });
});

describe('Fresco template files', () => {
  it('still import as before, with nothing to report', () => {
    const blocks: FrescoNode[] = [
      { id: 'c', type: 'fresco/container', v: 1, attrs: {}, children: [] },
      { id: 'u', type: 'unknown/thing', v: 1, attrs: {} },
    ];
    const text = JSON.stringify(templateFile({ title: 'Mine', kind: 'page', blocks }));
    const imported = readTemplateFile(text);
    expect(imported).toMatchObject({ source: 'fresco', skipped: 1, unconverted: 0 });
    expect(parseTemplateFile(text)).toEqual({
      format: 'fresco-template',
      version: 1,
      title: 'Mine',
      kind: 'page',
      blocks: [blocks[0]],
    });
    expect(() => parseTemplateFile('{"format":"fresco-template"}')).toThrow(/Fresco/);
  });
});
