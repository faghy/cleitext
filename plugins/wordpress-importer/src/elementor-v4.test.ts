import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '@cleitext/blocks';
import { elementorToFresco, type ElementorContext } from './elementor';
import {
  atomicClasses,
  atomicInteractions,
  atomicVariables,
  componentId,
} from './elementor-atomic';
import { componentInfo, convertComponent } from './elementor-components';
import { wxrToDocument } from './wxr';

const context = (warnings: string[], extra: Partial<ElementorContext> = {}): ElementorContext => ({
  mediaRef: (id) => (id === 12 ? 'att:12' : undefined),
  warn: (m) => warnings.push(m),
  ...extra,
});

const s = (value: string) => ({ $$type: 'string', value });

/** The overridable properties meta of a component (`_elementor_component_overridable_props`). */
const propsMeta = {
  props: {
    'prop-title': {
      overrideKey: 'prop-title',
      label: 'Card title',
      elementId: 'h1',
      elType: 'widget',
      widgetType: 'e-heading',
      propKey: 'title',
      groupId: 'g1',
    },
    'prop-photo': {
      overrideKey: 'prop-photo',
      label: 'Photo',
      elementId: 'im',
      elType: 'widget',
      widgetType: 'e-image',
      propKey: 'image',
      groupId: 'g1',
    },
  },
  groups: { items: {}, order: [] },
};

const componentData = JSON.stringify([
  {
    id: 'root',
    elType: 'e-flexbox',
    settings: {},
    elements: [
      {
        id: 'h1',
        elType: 'widget',
        widgetType: 'e-heading',
        settings: {
          title: {
            $$type: 'overridable',
            value: { override_key: 'prop-title', origin_value: s('Default title') },
          },
        },
      },
      {
        id: 'im',
        elType: 'widget',
        widgetType: 'e-image',
        settings: {
          image: {
            $$type: 'image',
            value: { src: { $$type: 'image-src', value: { id: 12, url: '/a.jpg' } } },
          },
        },
      },
    ],
  },
]);

describe('Elementor 4 components', () => {
  it('converts a component with its overridable properties', () => {
    const warnings: string[] = [];
    const out = convertComponent(
      { id: 77, title: 'Card', data: componentData, props: propsMeta },
      context(warnings),
    )!;
    expect(out.id).toBe('el-77');
    expect(out.nodes).toHaveLength(1);
    const root = out.nodes[0]!;
    expect(root.type).toBe('fresco/a-flexbox');
    const [title, image] = root.children as CxdBlock[];
    expect(title!.attrs.title).toBe('Default title');
    expect(title!.attrs.__elementor_id).toBeUndefined();
    expect(out.props).toEqual([
      { key: 'prop-title', label: 'Card title', nodeId: title!.id, setting: 'title' },
      { key: 'prop-photo', label: 'Photo', nodeId: image!.id, setting: 'image' },
    ]);
    expect(warnings).toEqual([]);
  });

  it('converts instances with their overrides, and leaves out unknown components', () => {
    const warnings: string[] = [];
    const components = new Map([['77', componentInfo(propsMeta)]]);
    const blocks = elementorToFresco(
      JSON.stringify([
        {
          id: 'c',
          elType: 'e-div-block',
          settings: {},
          elements: [
            {
              id: 'i1',
              elType: 'widget',
              widgetType: 'e-component',
              settings: {
                component_instance: {
                  $$type: 'component-instance',
                  value: {
                    component_id: { $$type: 'number', value: 77 },
                    overrides: {
                      $$type: 'overrides',
                      value: [
                        {
                          $$type: 'override',
                          value: {
                            override_key: 'prop-title',
                            override_value: s('Mine'),
                            schema_source: { type: 'component', id: 77 },
                          },
                        },
                        {
                          $$type: 'override',
                          value: {
                            override_key: 'unknown',
                            override_value: s('x'),
                            schema_source: { type: 'component', id: 77 },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
            {
              id: 'i2',
              elType: 'widget',
              widgetType: 'e-component',
              settings: {
                component_instance: {
                  $$type: 'component-instance',
                  value: { component_id: { $$type: 'number', value: 5 } },
                },
              },
            },
          ],
        },
      ]),
      context(warnings, { components }),
    )!;
    const box = blocks[0]!.children![0]!;
    expect(box.children).toHaveLength(1);
    expect(box.children![0]).toMatchObject({
      type: 'fresco/component',
      attrs: { component: componentId(77), overrides: { 'prop-title': 'Mine' } },
    });
    expect(warnings.join(' ')).toContain('component that is not in the export');
  });
});

describe('Elementor 4 interactions, classes and variables', () => {
  it('maps interactions, current and older formats', () => {
    const json = JSON.stringify({
      version: 1,
      items: [
        {
          $$type: 'interaction-item',
          value: {
            interaction_id: s('x-1'),
            trigger: s('scrollIn'),
            animation: {
              $$type: 'animation-preset-props',
              value: {
                effect: s('slide'),
                type: s('in'),
                direction: s('top-left'),
                timing_config: {
                  $$type: 'timing-config',
                  value: {
                    duration: { $$type: 'time-size', value: { size: 1.2, unit: 's' } },
                    delay: { $$type: 'time-size', value: { size: 150, unit: 'ms' } },
                  },
                },
                config: { $$type: 'animation-config', value: { easing: s('easeOut') } },
              },
            },
          },
        },
        {
          $$type: 'interaction-item',
          value: { trigger: s('hover'), animation: { effect: 'fade' } },
        },
        { animation: { animation_id: 'load-fade-in--800-100' } },
      ],
    });
    expect(atomicInteractions(json)).toEqual([
      {
        id: 'i1',
        trigger: 'scrollIn',
        effect: 'slide',
        type: 'in',
        direction: 'top',
        duration: 1200,
        delay: 150,
        easing: 'easeOut',
      },
      {
        id: 'i2',
        trigger: 'load',
        effect: 'fade',
        type: 'in',
        direction: '',
        duration: 800,
        delay: 100,
        easing: 'easeIn',
      },
    ]);
    expect(atomicInteractions('not json')).toEqual([]);
  });

  it('puts interactions on atomic elements', () => {
    const blocks = elementorToFresco(
      JSON.stringify([
        {
          id: 'h',
          elType: 'widget',
          widgetType: 'e-heading',
          settings: { title: s('Hi') },
          interactions: { items: [{ trigger: 'load', animation: { effect: 'fade' } }] },
        },
      ]),
      context([]),
    )!;
    expect(blocks[0]!.children![0]!.attrs._interactions).toEqual([
      expect.objectContaining({ trigger: 'load', effect: 'fade' }),
    ]);
  });

  it('keeps the priority of classes (Elementor lists the strongest first)', () => {
    const classes = atomicClasses({
      items: {
        strong: { label: 'Strong', variants: [] },
        weak: { label: 'Weak', variants: [] },
        extra: { label: 'Extra', variants: [] },
      },
      order: ['strong', 'weak'],
    });
    // In Fresco the last class wins.
    expect(classes.map((c) => c.id)).toEqual(['extra', 'weak', 'strong']);
  });

  it('reads variables of both formats, deleted ones kept', () => {
    const vars = atomicVariables({
      data: {
        'e-gv-1': { type: 'global-color-variable', label: 'Brand', value: '#ff0000', order: 2 },
        'e-gv-2': {
          type: 'global-size-variable',
          label: 'Gap',
          value: { $$type: 'size', value: { size: 16, unit: 'px' } },
          order: 1,
        },
        'e-gv-3': {
          type: 'global-color-variable',
          label: 'Old',
          value: { $$type: 'color', value: '#000000' },
          deleted_at: '2026-01-01 00:00:00',
        },
        'e-gv-4': { type: 'global-font-variable', label: 'Body', value: 'Inter', deleted: true },
      },
      watermark: 4,
      version: 2,
    });
    expect(vars).toEqual([
      { id: 'e-gv-3', label: 'Old', type: 'color', value: '#000000', deleted: true },
      { id: 'e-gv-4', label: 'Body', type: 'font', value: 'Inter', deleted: true },
      { id: 'e-gv-2', label: 'Gap', type: 'size', value: '16px' },
      { id: 'e-gv-1', label: 'Brand', type: 'color', value: '#ff0000' },
    ]);
  });
});

// ---- A WordPress export of an Elementor 4 site ------------------------------------------------

const meta = (key: string, value: string) =>
  `<wp:postmeta><wp:meta_key>${key}</wp:meta_key><wp:meta_value><![CDATA[${value}]]></wp:meta_value></wp:postmeta>`;

const item = (id: number, title: string, type: string, metas: string) =>
  `<item><title>${title}</title><dc:creator>ann</dc:creator><wp:post_id>${id}</wp:post_id><wp:post_date_gmt>2026-01-01 10:00:00</wp:post_date_gmt><wp:post_name>p${id}</wp:post_name><wp:post_type>${type}</wp:post_type><wp:status>publish</wp:status><content:encoded><![CDATA[]]></content:encoded>${metas}</item>`;

const v4site = `<?xml version="1.0"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>V4</title><link>https://v4.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://v4.example</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>ann</wp:author_login></wp:author>
${item(2, 'Kit', 'elementor_library', meta('_elementor_template_type', 'kit') + meta('_elementor_global_classes_order', JSON.stringify({ order: ['g-hero', 'g-base'] })) + meta('_elementor_global_variables', JSON.stringify({ data: { 'e-gv-a': { type: 'global-color-variable', label: 'Brand', value: { $$type: 'color', value: '#112233' } } }, watermark: 1, version: 2 })))}
${item(5, 'hero', 'e_global_class', meta('_elementor_global_class_id', 'g-hero') + meta('_elementor_global_class_data', JSON.stringify({ id: 'g-hero', label: 'hero', type: 'class', variants: [{ meta: { breakpoint: 'desktop', state: null }, props: { color: { $$type: 'color', value: '#ff0000' } } }] })))}
${item(6, 'base', 'e_global_class', meta('_elementor_global_class_id', 'g-base') + meta('_elementor_global_class_data', JSON.stringify({ id: 'g-base', label: 'base', type: 'class', variants: [] })))}
${item(77, 'Card', 'elementor_component', meta('_elementor_data', componentData) + meta('_elementor_component_overridable_props', JSON.stringify(propsMeta)))}
${item(10, 'Home', 'page', meta('_elementor_edit_mode', 'builder') + meta('_elementor_data', JSON.stringify([{ id: 'c', elType: 'e-div-block', settings: {}, elements: [{ id: 'i1', elType: 'widget', widgetType: 'e-component', settings: { component_instance: { $$type: 'component-instance', value: { component_id: { $$type: 'number', value: 77 } } } } }] }])))}
</channel></rss>`;

describe('An Elementor 4 site in a WordPress export', () => {
  const { document } = wxrToDocument(v4site, { locale: 'en' });

  it('gives Fresco the classes (by priority), the variables and the components', () => {
    const fresco = document.plugins?.fresco as {
      kit: { classes: { id: string; label: string }[]; variables: unknown[] };
      components: { id: string; title: string }[];
    };
    expect(fresco.kit.classes.map((c) => c.id)).toEqual(['g-base', 'g-hero']);
    expect(fresco.kit.classes[1]).toMatchObject({ label: 'hero' });
    expect(fresco.kit.variables).toEqual([
      { id: 'e-gv-a', label: 'Brand', type: 'color', value: '#112233' },
    ]);
    expect(fresco.components).toEqual([expect.objectContaining({ id: 'el-77', title: 'Card' })]);
  });

  it('turns instances into Fresco instances, and imports no entries for components and classes', () => {
    const page = document.entries!.find((e) => e.ref === 'post:10')!;
    expect(JSON.stringify(page.document)).toContain(
      '"type":"fresco/component","v":1,"attrs":{"component":"el-77"}',
    );
    expect(document.entries!.some((e) => ['post:5', 'post:6', 'post:77'].includes(e.ref))).toBe(
      false,
    );
  });
});
