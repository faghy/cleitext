import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from '../src/core/common.js';
import { elementCss, withDefaults } from '../src/core/css.js';
import { MASK_SHAPES, MASK_URLS } from '../src/core/masks.js';
import { DEFAULT_BREAKPOINTS, type FrescoNode, type RenderContext } from '../src/core/model.js';
import { heading } from '../src/elements/basic.js';
import { container } from '../src/elements/container.js';
import { SHAPES } from '../src/elements/shapes.js';

const node = (
  type: string,
  attrs: Record<string, unknown>,
  children?: FrescoNode[],
): FrescoNode => ({ id: 'abc123', type, v: 1, attrs, ...(children ? { children } : {}) });

const context: RenderContext = {
  media: new Map(),
  locale: 'en',
  editing: false,
  site: { title: '', tagline: '', home: '/' },
};

const html = (definition: typeof heading, attrs: Record<string, unknown>) => {
  const n = node(definition.type, attrs, definition.container ? [] : undefined);
  return renderToStaticMarkup(
    <>{definition.render({ node: n, settings: withDefaults(definition, attrs), context })}</>,
  );
};
const css = (definition: typeof heading, attrs: Record<string, unknown>) =>
  elementCss(definition, node(definition.type, attrs), DEFAULT_BREAKPOINTS);

describe('flex and grid items', () => {
  it('writes order, size, basis and grid placement', () => {
    const out = css(heading, {
      _flex_order: 'start',
      '_flex_order@mobile': 'end',
      _order: 4,
      _flex_size: 'grow',
      '_flex_size@tablet': 'custom',
      _flex_basis_type: 'custom',
      _flex_basis: { size: 30, unit: '%' },
      _grid_column: '2',
      _grid_row: 'custom',
      _grid_row_custom: '1 / span 2',
    });
    expect(out).toContain(
      '.fr-e-abc123{order:-99999;flex-grow:1;flex-shrink:0;flex-basis:30%;grid-column:span 2;grid-row:1 / span 2}',
    );
    // A custom size on tablet writes nothing by itself (grow and shrink only show with it on desktop).
    expect(out).toContain('@media (max-width:767px){.fr-e-abc123{order:99999}}');
    // The order number is for "Custom" only.
    expect(out).not.toContain('order:4');
    expect(css(heading, { _flex_size: 'custom', _flex_grow: 3 })).toContain(
      'flex-grow:3;flex-shrink:1',
    );
  });

  it('gives containers align self and keeps unsafe grid lines out', () => {
    expect(css(container, { _align_self: 'center' })).toContain('align-self:center');
    const out = css(heading, { _grid_column: 'custom', _grid_column_custom: '1;color:red' });
    expect(out).not.toContain('grid-column');
  });
});

describe('transform', () => {
  it('writes variables, on hover too, and marks the element', () => {
    const attrs = {
      _transform_rotate_popover: true,
      _transform_rotateZ_effect: { size: 45, unit: 'deg' },
      '_transform_rotateZ_effect:hover': { size: 90, unit: 'deg' },
      '_transform_rotateZ_effect@mobile': { size: 10, unit: 'deg' },
      _transform_rotate_3d: true,
      _transform_perspective_effect: { size: 500, unit: 'px' },
      _transform_scale_popover: true,
      '_transform_scale_effect:hover': { size: 1.2, unit: '' },
      '_transform_flipX_effect:hover': true,
      _transform_transition_hover: { size: 600, unit: 'ms' },
      _transform_origin_x: 'left',
    };
    const out = css(heading, attrs);
    expect(out).toContain('--fr-tr-rotate:45deg');
    expect(out).toContain('--fr-tr-perspective:perspective(500px)');
    expect(out).toContain('--fr-tr-duration:600ms');
    expect(out).toContain('--fr-tr-origin-x:left');
    expect(out).toContain(
      '.fr-e-abc123:hover{--fr-tr-rotate:90deg;--fr-tr-scale:1.2;--fr-tr-flip-x:-1}',
    );
    expect(out).toContain('@media (max-width:767px){.fr-e-abc123{--fr-tr-rotate:10deg}}');
    expect(html(heading, attrs)).toContain('fr-transform');
  });

  it('writes nothing for a switched-off transform', () => {
    const attrs = { _transform_rotateZ_effect: { size: 45, unit: 'deg' } };
    expect(css(heading, attrs)).not.toContain('--fr-tr');
    expect(html(heading, attrs)).not.toContain('fr-transform');
    // Scale X and Y only when scaled apart.
    const scale = css(heading, {
      _transform_scale_popover: true,
      _transform_scale_effect: { size: 2, unit: '' },
      _transform_scaleX_effect: { size: 3, unit: '' },
    });
    expect(scale).toContain('--fr-tr-scale:2');
    expect(scale).not.toContain('--fr-tr-scale-x');
  });
});

describe('hover border, transitions and mask', () => {
  it('writes the hover border, radius and shadow, and the transition variables', () => {
    const attrs = {
      _border_hover_style: 'solid',
      _border_hover_width: { top: 2, right: 2, bottom: 2, left: 2, unit: 'px' },
      _border_hover_color: '#ff0000',
      _border_hover_radius: { top: 8, right: 8, bottom: 8, left: 8, unit: 'px' },
      _shadow_hover: { x: 0, y: 8, blur: 20, spread: 0, color: '#000' },
      _border_hover_transition: { size: 0.4, unit: 's' },
      _background_hover_transition: { size: 0.3, unit: 's' },
    };
    const out = css(heading, attrs);
    expect(out).toContain(
      '.fr-e-abc123:hover{border-style:solid;border-width:2px 2px 2px 2px;border-color:#ff0000;border-radius:8px 8px 8px 8px;box-shadow:0px 8px 20px 0px #000}',
    );
    expect(out).toContain('--fr-bg-transition:0.3s');
    expect(out).toContain('--fr-border-transition:0.4s');
    expect(html(heading, attrs)).toContain('fr-transition');
    const box = css(container, {
      border_hover_color: '#00ff00',
      border_hover_style: 'dashed',
      border_hover_transition: { size: 1, unit: 's' },
    });
    expect(box).toContain('.fr-e-abc123:hover{border-style:dashed;border-color:#00ff00}');
    expect(html(container, { border_hover_transition: { size: 1, unit: 's' } })).toContain(
      'fr-transition',
    );
  });

  it('masks with a drawn shape or an image, only when switched on', () => {
    expect(css(heading, { _mask_shape: 'blob' })).not.toContain('mask');
    const out = css(heading, { _mask_switch: true, _mask_shape: 'flower' });
    expect(out).toContain('-webkit-mask-image:url("data:image/svg+xml,');
    expect(out).toContain('mask-size:contain');
    expect(out).toContain('mask-position:center center');
    expect(out).toContain('mask-repeat:no-repeat');
    expect(out).not.toMatch(/data:image\/svg\+xml,[^")]*;/);
    const custom = css(heading, {
      _mask_switch: true,
      _mask_shape: 'custom',
      _mask_image: { id: null, url: '/media/shape.svg' },
      _mask_size: 'custom',
      _mask_size_scale: { size: 80, unit: '%' },
      _mask_position: 'custom',
      _mask_position_x: { size: 10, unit: '%' },
    });
    expect(custom).toContain('mask-image:url("/media/shape.svg")');
    expect(custom).toContain('mask-size:80%');
    expect(custom).toContain('mask-position-x:10%');
    expect(custom).not.toContain('mask-size:custom');
    // Every listed shape has its drawing.
    for (const shape of MASK_SHAPES) expect(MASK_URLS[shape.value]).toBeDefined();
  });
});

describe('container', () => {
  it('writes separate gaps, align content and grid settings', () => {
    const out = css(container, {
      flex_wrap: 'wrap',
      align_content: 'space-between',
      gap: { size: 20, unit: 'px' },
      row_gap: { size: 40, unit: 'px' },
      column_gap: { size: 10, unit: 'px' },
    });
    expect(out).toContain(
      'flex-wrap:wrap;align-content:space-between;gap:20px;row-gap:40px;column-gap:10px',
    );
    const grid = css(container, {
      container_type: 'grid',
      grid_columns_custom: 'repeat(auto-fill, minmax(200px, 1fr))',
      'grid_columns_custom@mobile': '1fr',
      grid_rows_custom: '100px auto',
      grid_justify_content: 'center',
      grid_align_content: 'end',
    });
    expect(grid).toContain(
      'grid-template-columns:repeat(3, minmax(0, 1fr));grid-template-columns:repeat(auto-fill, minmax(200px, 1fr))',
    );
    expect(grid).toContain('grid-template-rows:100px auto');
    expect(grid).toContain('justify-content:center;align-content:end');
    expect(grid).toContain(
      '@media (max-width:767px){.fr-e-abc123 > .fr-container__in{grid-template-columns:1fr}}',
    );
    for (const bad of ['1fr; color: red', 'url(x)', '1fr }', 'expression(1)']) {
      expect(css(container, { container_type: 'grid', grid_columns_custom: bad })).not.toContain(
        bad.slice(0, 5),
      );
    }
  });

  it('draws every shape divider, layered ones with their opacities', () => {
    expect(Object.keys(SHAPES)).toHaveLength(18);
    const out = html(container, { shape_top: 'opacity-fan', shape_bottom: 'drops' });
    expect(out).toContain('opacity="0.33"');
    expect(out).toContain('preserveAspectRatio="xMidYMax slice"');
    const negative = html(container, { shape_top: 'book', shape_top_negative: true });
    expect(negative).toContain(`d="${SHAPES.book!.negative}"`);
    // Shapes without a negative keep drawing their line.
    expect(html(container, { shape_top: 'mountains', shape_top_negative: true })).toContain(
      'opacity="0.66"',
    );
  });

  it('renders a background slideshow', () => {
    const attrs = {
      background_slideshow_gallery: [
        { id: null, url: '/media/a.jpg' },
        { id: null, url: 'javascript:alert(1)' },
        { id: null, url: '/media/b.jpg' },
      ],
      background_slideshow_slide_transition: 'slide_left',
      background_slideshow_ken_burns: true,
      background_slideshow_loop: 'no',
      background_slideshow_slide_duration: 3000,
    };
    const out = html(container, attrs);
    expect(out).toContain('fr-has-slideshow');
    expect(out).toContain(
      'class="fr-bg-slideshow fr-bg-slideshow--slide_left fr-bg-slideshow--ken-in"',
    );
    expect(out).toContain('data-fr-handler="bg-slideshow"');
    expect(out).toContain('data-fr-duration="3000"');
    expect(out).toContain('data-fr-loop="no"');
    expect(out).toContain('--fr-ss-duration:3000ms');
    expect(out).toContain(
      '<div class="fr-bg-slide is-active"><div class="fr-bg-slide__img" style="background-image:url(&quot;/media/a.jpg&quot;)"></div></div>',
    );
    expect(out).not.toContain('javascript');
    expect(out.match(/fr-bg-slide__img/g)).toHaveLength(2);
    const lazy = html(container, { ...attrs, background_slideshow_lazyload: true });
    expect(lazy).toContain('data-fr-bg="/media/a.jpg"');
    expect(html(container, {})).not.toContain('fr-bg-slideshow');
    expect(
      container.media!(
        withDefaults(container, { background_slideshow_gallery: [{ id: 'm9', url: '/x.jpg' }] }),
      ),
    ).toContain('m9');
  });
});

describe('entrance animations', () => {
  it('offers Elementor’s whole list, each with its own keyframes', async () => {
    // `none` switches the animation off on a device: no keyframes.
    const values = ANIMATIONS.map((a) => a.value).filter((v) => v && v !== 'none');
    expect(values.length).toBeGreaterThanOrEqual(40);
    // Node's fs, without Node's types in this package.
    const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as {
      readFileSync(path: URL, encoding: 'utf8'): string;
    };
    const sheet = fs.readFileSync(new URL('../src/public/fresco.css', import.meta.url), 'utf8');
    for (const value of values) {
      expect(sheet).toContain(`[data-fr-anim='${value}']`);
      expect(sheet).toContain(`@keyframes fr-${value} `);
    }
  });
});
