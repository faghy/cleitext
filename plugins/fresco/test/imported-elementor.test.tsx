/**
 * What pages imported from Elementor need to look as WordPress showed them
 * (Fresco 2.9): global fonts with all their values, headings in the theme's
 * font, cropped image sizes, custom shape dividers and imported custom CSS
 * without Fresco Pro.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { elementCss, withDefaults } from '../src/core/css.js';
import { extensions, resetExtensions } from '../src/core/extensions.js';
import { kitCss, normalizeKit } from '../src/core/kit.js';
import { DEFAULT_BREAKPOINTS, type FrescoNode, type RenderContext } from '../src/core/model.js';
import { heading, image } from '../src/elements/basic.js';
import { container } from '../src/elements/container.js';

const node = (type: string, attrs: Record<string, unknown>): FrescoNode => ({
  id: 'abc123',
  type,
  v: 1,
  attrs,
});

const context: RenderContext = {
  media: new Map(),
  locale: 'en',
  editing: false,
  site: { title: '', tagline: '', home: '/' },
};

afterEach(() => resetExtensions());

describe('Elementor pages in Fresco', () => {
  it('gives an element every value of its global font, per device through the kit', () => {
    const css = elementCss(
      heading,
      node('fresco/heading', {
        title_typography_global: 'heading-sub',
        title_typography_global_all: true,
        title_typography_style: 'italic',
      }),
      DEFAULT_BREAKPOINTS,
    );
    for (const decl of [
      'font-family:var(--fr-t-heading-sub-family)',
      'font-size:var(--fr-t-heading-sub-size)',
      'font-weight:var(--fr-t-heading-sub-weight)',
      'text-transform:var(--fr-t-heading-sub-transform)',
      'line-height:var(--fr-t-heading-sub-line)',
      'letter-spacing:var(--fr-t-heading-sub-letter)',
      'word-spacing:var(--fr-t-heading-sub-word)',
      'text-decoration:var(--fr-t-heading-sub-decoration)',
    ]) {
      expect(css).toContain(decl);
    }
    // A value the global font does not set: the element's own, after it.
    expect(css.indexOf('font-style:italic')).toBeGreaterThan(
      css.indexOf('font-style:var(--fr-t-heading-sub-style)'),
    );
    const kit = kitCss(
      normalizeKit({
        fonts: [
          {
            id: 'heading-sub',
            title: 'Heading Sub',
            family: 'Inter',
            weight: '700',
            letter: { size: 3.5, unit: 'px' },
            devices: {
              mobile: { letter: { size: 2, unit: 'px' }, size: { size: 11, unit: 'px' } },
            },
          },
        ],
      }),
    );
    expect(kit).toContain('--fr-t-heading-sub-letter:3.5px');
    expect(kit).toMatch(/@media[^{]*\{:root\{[^}]*--fr-t-heading-sub-letter:2px/);
    expect(kit).toMatch(/@media[^{]*\{:root\{[^}]*--fr-t-heading-sub-size:11px/);
  });

  it('leaves a heading to the theme’s font when asked', () => {
    const html = renderToStaticMarkup(
      heading.render({
        node: node('fresco/heading', {}),
        settings: withDefaults(heading, { title: 'Corsi', title_theme_font: true }),
        children: null,
        context,
      }) as React.ReactElement,
    );
    expect(html).toContain('class="fr-heading__title fr-heading__title--theme"');
    const plain = renderToStaticMarkup(
      heading.render({
        node: node('fresco/heading', {}),
        settings: withDefaults(heading, { title: 'Corsi' }),
        children: null,
        context,
      }) as React.ReactElement,
    );
    expect(plain).toContain('class="fr-heading__title"');
  });

  it('crops an image to an aspect ratio', () => {
    const css = elementCss(
      image,
      node('fresco/image', {
        width: { size: 820, unit: 'px' },
        aspect_ratio: '820/580',
        object_fit: 'cover',
      }),
      DEFAULT_BREAKPOINTS,
    );
    expect(css).toContain('aspect-ratio:820/580');
    expect(css).toContain('object-fit:cover');
    expect(css).toContain('width:820px');
    // Nothing else gets through.
    const bad = elementCss(
      image,
      node('fresco/image', { aspect_ratio: '1/1;background:url(x)' }),
      DEFAULT_BREAKPOINTS,
    );
    expect(bad).not.toContain('aspect-ratio');
  });

  it('draws a custom shape divider from an SVG file, in its color', () => {
    const attrs = {
      shape_bottom: 'custom',
      shape_bottom_svg: { id: 'm1', url: '/uploads/custom-1.svg' },
      shape_bottom_color: '#e36b28',
      shape_bottom_height: { size: 30, unit: 'px' },
      shape_bottom_negative: true,
    };
    const html = renderToStaticMarkup(
      container.render({
        node: node('fresco/container', attrs),
        settings: withDefaults(container, attrs),
        children: null,
        context,
      }) as React.ReactElement,
    );
    expect(html).toContain(
      'class="fr-shape fr-shape--bottom fr-shape--negative fr-shape--custom" aria-hidden="true"><span class="fr-shape__custom">',
    );
    const css = elementCss(container, node('fresco/container', attrs), DEFAULT_BREAKPOINTS);
    expect(css).toContain(';mask-image:url("/uploads/custom-1.svg")');
    expect(css).toMatch(/fr-shape--bottom \.fr-shape__custom\{[^}]*background-color:#e36b28/);
    expect(css).toContain('height:30px');
    expect(container.media?.(attrs)).toContain('m1');
    // No file yet: nothing drawn.
    const empty = renderToStaticMarkup(
      container.render({
        node: node('fresco/container', { shape_top: 'custom' }),
        settings: withDefaults(container, { shape_top: 'custom' }),
        children: null,
        context,
      }) as React.ReactElement,
    );
    expect(empty).not.toContain('fr-shape');
  });

  it('draws imported custom CSS without Fresco Pro, and leaves it to Fresco Pro when on', () => {
    const attrs = {
      title: 'T',
      _custom_css: 'selector{margin-left:auto}</style>',
      _custom_css_imported: true,
    };
    const css = elementCss(heading, node('fresco/heading', attrs), DEFAULT_BREAKPOINTS);
    expect(css).toContain('.fr-e-abc123{margin-left:auto}/style>');
    // Custom CSS written in Fresco (a Fresco Pro field) stays Fresco Pro's.
    const own = elementCss(
      heading,
      node('fresco/heading', { title: 'T', _custom_css: 'selector{color:red}' }),
      DEFAULT_BREAKPOINTS,
    );
    expect(own).not.toContain('color:red');
    // Fresco Pro on: its field draws it, once.
    extensions().controls.push(() => [
      { name: '_custom_css', type: 'code', label: 'Custom CSS', tab: 'advanced', section: 'CSS' },
    ]);
    const pro = elementCss(heading, node('fresco/heading', attrs), DEFAULT_BREAKPOINTS);
    expect(pro).not.toContain('margin-left:auto');
  });
});
