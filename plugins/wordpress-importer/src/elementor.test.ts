import { describe, expect, it } from 'vitest';
import { elementorToFresco } from './elementor';

// The shape of `_elementor_data`, as Elementor saves it (sections and containers).
const data = JSON.stringify([
  {
    id: 's1',
    elType: 'section',
    settings: {
      layout: 'full_width',
      background_background: 'classic',
      background_color: '#F5F5F5',
      padding: { unit: 'px', top: '40', right: '0', bottom: '40', left: '0', isLinked: false },
    },
    elements: [
      {
        id: 'c1',
        elType: 'column',
        settings: { _column_size: 50, _inline_size: null },
        elements: [
          {
            id: 'w1',
            elType: 'widget',
            widgetType: 'heading',
            settings: {
              title: 'Hello <br>world',
              header_size: 'h1',
              align: 'center',
              align_mobile: 'left',
              title_color: '#E46EC0',
              typography_typography: 'custom',
              typography_font_family: 'Assistant',
              typography_font_size: { unit: 'px', size: 48, sizes: [] },
              typography_font_size_mobile: { unit: 'px', size: 28, sizes: [] },
              typography_font_weight: '700',
              _padding: {
                unit: '%',
                top: '0',
                right: '4',
                bottom: '0',
                left: '4',
                isLinked: false,
              },
              _padding_tablet: {
                unit: '%',
                top: '',
                right: '',
                bottom: '',
                left: '',
                isLinked: true,
              },
            },
            elements: [],
          },
          {
            id: 'w2',
            elType: 'widget',
            widgetType: 'image',
            settings: {
              image: { id: 12, url: 'https://old.test/wp-content/uploads/a.jpg' },
              link_to: 'file',
            },
            elements: [],
          },
        ],
      },
      {
        id: 'c2',
        elType: 'column',
        settings: { _column_size: 50 },
        elements: [
          {
            id: 'w3',
            elType: 'widget',
            widgetType: 'button',
            settings: {
              text: 'Buy',
              link: { url: '/shop', is_external: 'on' },
              selected_icon: { value: 'fas fa-shopping-cart', library: 'fa-solid' },
              __globals__: { background_color: 'globals/colors?id=accent' },
            },
            elements: [],
          },
          {
            id: 'w4',
            elType: 'widget',
            widgetType: 'slides',
            settings: { title: 'Pro slider' },
            elements: [],
          },
        ],
      },
    ],
  },
  {
    id: 'k1',
    elType: 'container',
    settings: {
      content_width: 'boxed',
      flex_direction: 'row',
      flex_direction_mobile: 'column',
      flex_gap: { unit: 'px', size: 24, column: '24', row: '24' },
    },
    elements: [
      {
        id: 'w5',
        elType: 'widget',
        widgetType: 'text-editor',
        settings: { editor: '<p>Text</p>' },
        elements: [],
      },
    ],
  },
]);

describe('Elementor pages to Fresco', () => {
  it('turns sections, columns, containers and widgets into Fresco elements', () => {
    const warnings: string[] = [];
    const blocks = elementorToFresco(data, {
      mediaRef: (id) => (id === 12 ? 'media:12' : undefined),
      warn: (m) => warnings.push(m),
    })!;
    expect(blocks.map((b) => b.type)).toEqual(['fresco/container', 'fresco/container']);
    const section = blocks[0]!;
    expect(section.attrs).toMatchObject({
      flex_direction: 'row',
      'flex_direction@mobile': 'column',
      content_width: 'full',
      _background_type: 'classic',
      _background_color: '#F5F5F5',
      _padding: { top: 40, right: 0, bottom: 40, left: 0, unit: 'px' },
    });
    const [left, right] = section.children!;
    expect(left!.attrs.width).toEqual({ size: 50, unit: '%' });
    const heading = left!.children![0]!;
    expect(heading.type).toBe('fresco/heading');
    expect(heading.attrs).toMatchObject({
      title: 'Hello \nworld',
      tag: 'h1',
      align: 'center',
      'align@mobile': 'left',
      title_color: '#E46EC0',
      title_typography_family: 'Assistant',
      title_typography_size: { size: 48, unit: 'px' },
      'title_typography_size@mobile': { size: 28, unit: 'px' },
      title_typography_weight: '700',
      _padding: { top: 0, right: 4, bottom: 0, left: 4, unit: '%' },
    });
    // Empty per-device values are not copied.
    expect(heading.attrs['_padding@tablet']).toBeUndefined();
    expect(left!.children![1]!.attrs).toMatchObject({
      image: { id: 'media:12', url: 'https://old.test/wp-content/uploads/a.jpg' },
      link_to: 'file',
    });
    expect(right!.children![0]!.attrs).toMatchObject({
      text: 'Buy',
      link: { url: '/shop', newTab: true },
      icon: { set: 'solid', name: 'cart-shopping' },
      background_color: 'var(--fr-c-accent)',
    });
    // A widget with no counterpart keeps its text and is reported.
    expect(right!.children![1]!).toMatchObject({
      type: 'fresco/text',
      attrs: { content: '<p>Pro slider</p>' },
    });
    expect(warnings.join('\n')).toContain('"slides"');
    expect(blocks[1]!.attrs).toMatchObject({
      flex_direction: 'row',
      'flex_direction@mobile': 'column',
      gap: { size: 24, unit: 'px' },
    });
  });

  it('gives up on unreadable data', () => {
    const warnings: string[] = [];
    expect(
      elementorToFresco('{oops', { mediaRef: () => undefined, warn: (m) => warnings.push(m) }),
    ).toBeNull();
    expect(warnings).toHaveLength(1);
  });
});
