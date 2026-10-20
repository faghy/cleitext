import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '@cleitext/blocks';
import { elementorToFresco, takeStretched, type ElementorContext } from './elementor';

// The shape of `_elementor_data`, as Elementor saves it (sections and containers).
const data = JSON.stringify([
  {
    id: 's1',
    elType: 'section',
    settings: {
      layout: 'full_width',
      stretch_section: 'section-stretched',
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
            widgetType: 'unknown-addon-widget',
            settings: { title: 'Kept text' },
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

const context = (warnings: string[], extra: Partial<ElementorContext> = {}): ElementorContext => ({
  mediaRef: (id) => (id === 12 ? 'att:12' : undefined),
  warn: (m) => warnings.push(m),
  ...extra,
});

/** One converted widget (inside the wrapper container). */
const one = (el: Record<string, unknown>, extra: Partial<ElementorContext> = {}) => {
  const warnings: string[] = [];
  const blocks = elementorToFresco(
    JSON.stringify([{ id: 'x', elType: 'widget', ...el }]),
    context(warnings, extra),
  )!;
  return { block: blocks[0]!.children![0]!, warnings };
};

const container = (settings: Record<string, unknown>, elements: unknown[] = []) => {
  const warnings: string[] = [];
  const blocks = elementorToFresco(
    JSON.stringify([{ id: 'k', elType: 'container', settings, elements }]),
    context(warnings),
  )!;
  return { block: blocks[0]!, warnings };
};

describe('Elementor pages to Fresco', () => {
  it('turns sections, columns, containers and widgets into Fresco elements', () => {
    const warnings: string[] = [];
    const blocks = elementorToFresco(data, context(warnings))!;
    expect(blocks.map((b) => b.type)).toEqual(['fresco/container', 'fresco/container']);
    const section = blocks[0]!;
    expect(section.attrs).toMatchObject({
      flex_direction: 'row',
      'flex_direction@mobile': 'column',
      content_width: 'full',
      // The section's own background group, not the Advanced one.
      background_type: 'classic',
      background_color: '#F5F5F5',
      _padding: { top: 40, right: 0, bottom: 40, left: 0, unit: 'px' },
      // Columns are spaced by their padding, not by a gap.
      gap: { size: 0, unit: 'px' },
    });
    expect(takeStretched(blocks)).toBe(true);
    expect(section.attrs.__stretched).toBeUndefined();
    const [left, right] = section.children!;
    expect(left!.attrs).toMatchObject({
      width: { size: 50, unit: '%' },
      // Stacked on phones, with Elementor's default column padding (10px).
      'width@mobile': { size: 100, unit: '%' },
      _padding: { top: 10, right: 10, bottom: 10, left: 10, unit: 'px' },
    });
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
      // Elementor's headings have a line height of 1.
      title_typography_line: { size: 1, unit: '' },
      _padding: { top: 0, right: 4, bottom: 0, left: 4, unit: '%' },
    });
    // Empty per-device values are not copied.
    expect(heading.attrs['_padding@tablet']).toBeUndefined();
    expect(left!.children![1]!.attrs).toMatchObject({
      image: { id: 'att:12', url: 'https://old.test/wp-content/uploads/a.jpg' },
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
      attrs: { content: '<p>Kept text</p>' },
    });
    expect(warnings.join('\n')).toContain('"unknown-addon-widget"');
    expect(blocks[1]!.attrs).toMatchObject({
      flex_direction: 'row',
      'flex_direction@mobile': 'column',
      gap: { size: 24, unit: 'px' },
      // Elementor's containers have 10px of padding, nested ones too.
      _padding: { top: 10, right: 10, bottom: 10, left: 10, unit: 'px' },
    });
  });

  it('gives up on unreadable data', () => {
    const warnings: string[] = [];
    expect(
      elementorToFresco('{oops', { mediaRef: () => undefined, warn: (m) => warnings.push(m) }),
    ).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it('keeps button styles on the button, with their hover states', () => {
    const { block } = one({
      widgetType: 'button',
      settings: {
        text: 'Go',
        background_background: 'classic',
        background_color: '#112233',
        button_background_hover_background: 'classic',
        button_background_hover_color: '#445566',
        button_text_color: '#ffffff',
        hover_color: '#000000',
        button_hover_border_color: '#ff0000',
        border_border: 'solid',
        border_width: { unit: 'px', top: '2', right: '2', bottom: '2', left: '2', isLinked: true },
        border_color: '#123456',
        border_radius: {
          unit: 'px',
          top: '30',
          right: '30',
          bottom: '30',
          left: '30',
          isLinked: true,
        },
        icon_align: 'row-reverse',
        selected_icon: { value: 'fas fa-arrow-right', library: 'fa-solid' },
      },
    });
    expect(block.attrs).toMatchObject({
      background_color: '#112233',
      'background_color:hover': '#445566',
      text_color: '#ffffff',
      'text_color:hover': '#000000',
      border_hover_color: '#ff0000',
      border_style: 'solid',
      border_color: '#123456',
      border_radius: { top: 30, unit: 'px' },
      icon_position: 'after',
    });
    // The button's background and border never go on its wrapper.
    expect(block.attrs._background_type).toBeUndefined();
    expect(block.attrs._border_style).toBeUndefined();
  });

  it('converts the Advanced tab: width, position, animation, shadow, motion, sticky, CSS', () => {
    const { block, warnings } = one({
      widgetType: 'heading',
      settings: {
        title: 'Big <strong>title</strong>',
        typography_typography: 'custom',
        typography_font_size: { unit: 'custom', size: 'clamp(2rem, 4vw, 4rem)' },
        _element_width: 'initial',
        _element_custom_width: { unit: '%', size: 50 },
        _flex_align_self: 'center',
        _flex_order: 'start',
        _position: 'absolute',
        _offset_orientation_h: 'end',
        _offset_x_end: { unit: 'px', size: 20 },
        _offset_y: { unit: 'px', size: 10 },
        _animation: 'zoomInLeft',
        _animation_delay: 300,
        animation_duration: 'slow',
        _box_shadow_box_shadow_type: 'yes',
        _box_shadow_box_shadow: {
          horizontal: 0,
          vertical: 4,
          blur: 12,
          spread: 0,
          color: 'rgba(0,0,0,0.2)',
        },
        _background_hover_background: 'classic',
        _background_hover_color: '#eeeeee',
        motion_fx_motion_fx_scrolling: 'yes',
        motion_fx_translateY_effect: 'yes',
        motion_fx_translateY_direction: 'negative',
        motion_fx_translateY_speed: { size: 3 },
        motion_fx_translateY_affectedRange: { unit: '%', sizes: { start: 20, end: 80 } },
        motion_fx_opacity_effect: 'yes',
        motion_fx_opacity_direction: 'out-in',
        sticky: 'top',
        sticky_on: ['desktop', 'tablet'],
        sticky_offset: 20,
        custom_css: 'selector { opacity: .9 }',
        _attributes: 'data-track|hero',
        hide_mobile: 'hidden-mobile',
        __dynamic__: {
          title:
            '[elementor-tag id="a1" name="post-title" settings="%7B%22before%22%3A%22%E2%80%94%20%22%7D"]',
        },
      },
    });
    expect(block.attrs).toMatchObject({
      title: 'Big title',
      title_typography_size: { size: 4, unit: 'rem' },
      _width: 'custom',
      _width_custom: { size: 50, unit: '%' },
      _align_self: 'center',
      _order: -99999,
      _position: 'absolute',
      _offset_right: { size: 20, unit: 'px' },
      _offset_top: { size: 10, unit: 'px' },
      _animation: 'zoom-in',
      _animation_delay: 300,
      _animation_duration: 'slow',
      _shadow: { x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.2)' },
      _background_hover_type: 'classic',
      _background_hover_color: '#eeeeee',
      _motion_scroll: true,
      _motion_y: -3,
      _motion_fade: 'in',
      _motion_range: '20-80',
      _sticky: 'top',
      _sticky_offset: 20,
      _sticky_mobile: false,
      _custom_css: 'selector { opacity: .9 }',
      _attributes: 'data-track|hero',
      _hide_mobile: true,
      __dynamic: { title: { tag: 'post-title', before: '— ', kind: 'text' } },
    });
    const report = warnings.join('\n');
    expect(report).toContain('inline formatting inside headings was removed');
    expect(report).toContain('clamp, calc');
  });

  it('converts container backgrounds, overlays, videos, gaps and phone defaults', () => {
    const { block, warnings } = container({
      container_type: 'flex',
      flex_direction: 'row',
      width: { unit: '%', size: 80 },
      flex_gap: { unit: 'px', column: '30', row: '10', isLinked: false },
      animation: 'fadeInUp',
      background_background: 'video',
      background_video_link: 'https://old.test/wp-content/uploads/loop.mp4',
      background_video_fallback: { id: 12, url: 'https://old.test/wp-content/uploads/a.jpg' },
      background_play_on_mobile: 'yes',
      background_overlay_background: 'classic',
      background_overlay_color: '#000000',
      background_overlay_opacity: { size: 0.4 },
      box_shadow_box_shadow_type: 'yes',
      box_shadow_box_shadow: { horizontal: 1, vertical: 2, blur: 3, spread: 4, color: '#000' },
      __globals__: { background_hover_color: 'globals/colors?id=secondary' },
      background_hover_background: 'classic',
    });
    expect(block.attrs).toMatchObject({
      flex_direction: 'row',
      width: { size: 80, unit: '%' },
      'width@mobile': { size: 100, unit: '%' },
      'flex_wrap@mobile': 'wrap',
      gap: { size: 30, unit: 'px' },
      _animation: 'fade-up',
      background_video: { id: null, url: 'https://old.test/wp-content/uploads/loop.mp4' },
      background_video_mobile: true,
      background_type: 'classic',
      background_image: { id: 'att:12' },
      overlay_color: '#000000',
      overlay_opacity: { size: 0.4, unit: '' },
      shadow: { x: 1, y: 2, blur: 3, spread: 4, color: '#000' },
      background_hover_color: 'var(--fr-c-secondary)',
    });
    // A different row gap, and the centering of a narrower top container.
    expect(block.attrs._custom_css).toContain('row-gap:10px');
    expect(block.attrs._custom_css).toContain('margin-left:auto');
    expect(warnings).toEqual([]);

    const slideshow = container({
      background_background: 'slideshow',
      background_slideshow_gallery: [{ id: 12, url: 'https://old.test/wp-content/uploads/a.jpg' }],
    });
    expect(slideshow.block.attrs).toMatchObject({
      background_type: 'classic',
      background_image: { id: 'att:12' },
    });
    expect(slideshow.warnings.join('\n')).toContain('slideshows show their first image');
  });

  it('converts gradient overlays, shape dividers and column margins as Elementor draws them', () => {
    const { block, warnings } = container({
      background_overlay_background: 'gradient',
      background_overlay_color: '#000000',
      background_overlay_gradient_angle: { unit: 'deg', size: 90 },
      background_overlay_opacity: { size: 0.7 },
      shape_divider_top: 'curve-asymmetrical',
      shape_divider_top_negative: 'yes',
      shape_divider_bottom: 'tilt',
      shape_divider_bottom_above_content: 'yes',
      shape_divider_bottom_height: { unit: 'px', size: 58 },
      __globals__: { shape_divider_bottom_color: 'globals/colors?id=primary' },
    });
    expect(block.attrs).toMatchObject({
      overlay_bg_type: 'gradient',
      overlay_bg_color: '#000000',
      // Elementor's default second color.
      overlay_bg_color_b: '#f2295b',
      overlay_bg_angle: { size: 90, unit: 'deg' },
      overlay_opacity: { size: 0.7, unit: '' },
      shape_top: 'curve-asymmetrical',
      shape_top_negative: true,
      shape_bottom: 'tilt',
      shape_bottom_front: true,
      shape_bottom_height: { size: 58, unit: 'px' },
      shape_bottom_color: 'var(--fr-c-primary)',
    });
    expect(block.attrs.overlay_color).toBeUndefined();
    expect(warnings).toEqual([]);
    const youtube = container({
      background_background: 'video',
      background_video_link: 'https://www.youtube.com/watch?v=J01iDyHq2p0',
      background_video_fallback: { id: 12, url: 'https://old.test/wp-content/uploads/a.jpg' },
    });
    expect(youtube.block.attrs).toMatchObject({
      background_video: { url: 'https://www.youtube.com/watch?v=J01iDyHq2p0' },
      background_image: { id: 'att:12' },
    });
    expect(youtube.warnings).toEqual([]);
    const other = container({ shape_divider_top: 'book' });
    expect(other.block.attrs.shape_top).toBeUndefined();
    expect(other.warnings.join('\n')).toContain('shape dividers "book" were not imported');

    // A column's margin is inside it (Elementor): the column keeps its width.
    const warnings2: string[] = [];
    const [section] = elementorToFresco(
      JSON.stringify([
        {
          id: 's',
          elType: 'section',
          settings: {},
          elements: [
            {
              id: 'c',
              elType: 'column',
              settings: {
                _column_size: 25,
                hide_mobile: 'hidden-phone',
                margin: {
                  unit: '%',
                  top: '0',
                  right: '0',
                  bottom: '0',
                  left: '20',
                  isLinked: false,
                },
              },
              elements: [
                { id: 'w', elType: 'widget', widgetType: 'heading', settings: { title: 'Hi' } },
              ],
            },
          ],
        },
      ]),
      context(warnings2),
    )!;
    // Without phone widths, columns stack on phones.
    expect(section!.attrs['flex_direction@mobile']).toBe('column');
    const [phone] = elementorToFresco(
      JSON.stringify([
        {
          id: 's2',
          elType: 'section',
          settings: { height: 'full' },
          elements: [
            {
              id: 'a',
              elType: 'column',
              settings: { _column_size: 50, _inline_size_mobile: 45 },
              elements: [],
            },
            {
              id: 'b',
              elType: 'column',
              settings: { _column_size: 50, _inline_size_mobile: 55 },
              elements: [],
            },
          ],
        },
      ]),
      context([]),
    )!;
    expect(phone!.attrs).toMatchObject({
      'flex_direction@mobile': 'row',
      'flex_wrap@mobile': 'wrap',
      // Fits the window, except on phones (as Elementor).
      min_height: { size: 100, unit: 'vh' },
      'min_height@mobile': { size: 0, unit: 'px' },
    });
    expect(phone!.children![0]!.attrs['width@mobile']).toEqual({ size: 45, unit: '%' });
    const column = section!.children![0]!;
    expect(column.attrs).toMatchObject({
      width: { size: 25, unit: '%' },
      _hide_mobile: true,
      _padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(column.attrs._margin).toBeUndefined();
    expect(column.attrs.__wrapped).toBeUndefined();
    const inner = column.children![0]!;
    expect(inner.type).toBe('fresco/container');
    expect(inner.attrs).toMatchObject({
      _margin: { left: 20, unit: '%' },
      _padding: { top: 10, right: 10, bottom: 10, left: 10, unit: 'px' },
    });
    expect(inner.attrs.width).toBeUndefined();
    expect(inner.attrs._hide_mobile).toBeUndefined();
    expect(inner.children![0]!.type).toBe('fresco/heading');
  });

  it('centers images, spaces menu links and opens popups from list items like Elementor', () => {
    expect(
      one({ widgetType: 'image', settings: { image: { id: 12, url: 'https://old.test/a.jpg' } } })
        .block.attrs.align,
    ).toBe('center');
    expect(
      one({
        widgetType: 'image',
        settings: { align: 'left', image: { url: 'https://old.test/a.jpg' } },
      }).block.attrs.align,
    ).toBe('left');
    const menu = one({
      widgetType: 'nav-menu',
      settings: { __globals__: { color_menu_item_hover: 'globals/colors?id=accent' } },
    }).block;
    expect(menu.attrs).toMatchObject({
      'link_color:hover': 'var(--fr-c-accent)',
      current_color: 'var(--fr-c-accent)',
      // Elementor's defaults: an underline in the accent color, a caret beside submenus.
      pointer: 'underline',
      pointer_color: 'var(--fr-c-accent)',
      toggle_bg: 'rgba(0,0,0,0.05)',
      toggle_size: { size: 22, unit: 'px' },
      toggle_align: 'center',
      indicator: { set: 'solid', name: 'caret-down' },
      typography_line: { size: 20, unit: 'px' },
      link_padding: { top: 13, right: 20, bottom: 13, left: 20, unit: 'px' },
    });
    const styled = one({
      widgetType: 'nav-menu',
      settings: {
        pointer: 'double-line',
        pointer_width: { unit: 'px', size: 1 },
        submenu_icon: { value: 'fas fa-angle-down', library: 'fa-solid' },
        __globals__: { pointer_color_menu_item_hover: 'globals/colors?id=secondary' },
      },
    }).block;
    expect(styled.attrs).toMatchObject({
      pointer: 'double',
      pointer_width: { size: 1, unit: 'px' },
      pointer_color: 'var(--fr-c-secondary)',
      indicator: { set: 'solid', name: 'angle-down' },
    });
    const plain = one({ widgetType: 'nav-menu', settings: { pointer: 'none', indicator: 'none' } });
    expect(plain.block.attrs.pointer).toBeUndefined();
    expect(plain.block.attrs.indicator).toBeUndefined();
    const entryRef = (id: number) => (id === 1162 ? 'post:1162' : undefined);
    const tag = (settings: string) =>
      `[elementor-tag id="a1" name="popup" settings="${encodeURIComponent(settings)}"]`;
    const list = one(
      {
        widgetType: 'icon-list',
        settings: {
          icon_list: [
            { _id: 'a', text: 'Weather', __dynamic__: { link: tag('{"popup":"1162"}') } },
            { _id: 'b', text: 'Close', __dynamic__: { link: tag('{"action":"close"}') } },
            { _id: 'c', text: 'Plain', link: { url: '/x' } },
          ],
        },
      },
      { entryRef },
    ).block;
    expect((list.attrs.items as { link?: unknown }[]).map((i) => i.link)).toEqual([
      { url: { $entry: 'post:1162', prefix: '#popup-' } },
      { url: '#popup-close' },
      { url: '/x' },
    ]);
    const close = one({
      widgetType: 'icon',
      settings: { __dynamic__: { link: tag('{"action":"close"}') } },
    });
    expect(close.block.attrs.__dynamic).toMatchObject({ link: { tag: 'popup', key: 'close' } });
    expect(close.warnings).toEqual([]);
  });

  it('turns price tables into classic ones with Elementor line breaks and fonts', () => {
    const { block } = one({
      widgetType: 'price-table',
      settings: {
        heading: 'Stagionale<br> dal 7 gennaio',
        period: 'gratuito <br>per ogni bambino',
        footer_additional_info: ' ',
        features_list: [{ _id: 'a', item_text: 'Sdraio <b>omaggio</b>' }],
      },
    });
    expect(block.attrs).toMatchObject({
      skin: 'classic',
      heading: 'Stagionale\ndal 7 gennaio',
      period: 'gratuito\nper ogni bambino',
      footer_info: '',
      features: [{ text: 'Sdraio omaggio', icon: { set: 'regular', name: 'circle-check' } }],
      heading_typography_global: 'primary',
      features_typo_global: 'text',
    });
  });

  it('converts slides and call-to-action graphics as Elementor shows them', () => {
    const slides = one({
      widgetType: 'slides',
      settings: {
        slides: [{ _id: 'a', heading: 'PRATO NEVOSO<br>SUMMER CAMP', button_text: 'Go' }],
        __globals__: { button_background_color: 'globals/colors?id=d25a2d9' },
      },
    }).block;
    expect(slides.attrs).toMatchObject({
      button_bg: 'var(--fr-c-d25a2d9)',
      arrows: false,
      dots: false,
    });
    expect((slides.attrs.items as { heading: string }[])[0]!.heading).toBe(
      'PRATO NEVOSO\nSUMMER CAMP',
    );
    const cta = one({
      widgetType: 'call-to-action',
      settings: {
        skin: 'cover',
        title: 'MTB',
        graphic_element: 'image',
        graphic_image: { id: 12, url: 'https://old.test/wp-content/uploads/a.png' },
        graphic_image_width: { unit: '%', size: 49 },
      },
    }).block;
    expect(cta.attrs).toMatchObject({
      graphic: { id: 'att:12' },
      graphic_width: { size: 49, unit: '%' },
    });
  });

  it('keeps the zoom of maps, Elementor’s default when unset', () => {
    expect(one({ widgetType: 'google_maps', settings: { address: 'Rome' } }).block.attrs.zoom).toBe(
      10,
    );
    expect(
      one({ widgetType: 'google_maps', settings: { address: 'Rome', zoom: { size: 18 } } }).block
        .attrs.zoom,
    ).toBe(18);
  });

  it('turns Elementor search forms into joined search forms with an icon button', () => {
    const { block } = one({
      widgetType: 'search-form',
      settings: {
        placeholder: 'Cerca...',
        button_text: 'Cerca',
        size: { unit: 'px', size: 29 },
        __globals__: { button_background_color: 'globals/colors?id=secondary' },
      },
    });
    expect(block.type).toBe('fresco-pro/search-form');
    expect(block.attrs).toMatchObject({
      placeholder: 'Cerca...',
      layout: 'joined',
      button_type: 'icon',
      size: { size: 29, unit: 'px' },
      button_bg: 'var(--fr-c-secondary)',
    });
  });

  it('turns Pro widgets into Fresco Pro elements', () => {
    const entryRef = (id: number) => (id === 40 ? 'post:40' : id === 41 ? 'post:41' : undefined);
    const term = (_taxonomy: string, id: number) =>
      id === 5 ? { taxonomy: 'category', slug: 'news' } : undefined;
    const form = one(
      {
        widgetType: 'form',
        settings: {
          form_name: 'Contact',
          form_fields: [
            {
              _id: 'a',
              custom_id: 'name',
              field_type: 'text',
              field_label: 'Name',
              required: 'true',
              width: '50',
            },
            {
              _id: 'b',
              custom_id: 'email',
              field_type: 'email',
              field_label: 'Email',
              required: 'true',
              width: '50',
            },
            { _id: 'c', custom_id: 'file', field_type: 'upload', field_label: 'CV' },
            // Captchas are left out (Fresco Pro's forms have their own spam protection).
            { _id: 'd', custom_id: 'captcha', field_type: 'recaptcha_v3' },
          ],
          submit_actions: ['email', 'redirect', 'popup'],
          email_to: 'info@example.com',
          redirect_to: '/thanks',
          popup_action: 'open',
          popup_action_popup_id: '41',
          button_text: 'Send it',
        },
      },
      { entryRef },
    );
    expect(form.block.type).toBe('fresco-pro/form');
    expect(form.block.attrs).toMatchObject({
      form_name: 'Contact',
      fields: [
        { type: 'text', field_id: 'name', label: 'Name', required: true, width: '50' },
        { type: 'email', field_id: 'email', required: true, width: '50' },
        { type: 'text', field_id: 'file' },
      ],
      act_email: true,
      email_to: 'info@example.com',
      act_redirect: true,
      redirect_url: '/thanks',
      act_popup: true,
      popup_action: 'open',
      popup_id: { $entry: 'post:41' },
      button_text: 'Send it',
      // Elementor's default button color: the kit's accent.
      button_bg: 'var(--fr-c-accent)',
    });
    expect((form.block.attrs.fields as unknown[]).length).toBe(3);
    expect(form.warnings.join('\n')).toContain('upload, recaptcha');

    const menu = one(
      {
        widgetType: 'nav-menu',
        settings: { menu: 'main-menu', dropdown: 'mobile', layout: 'horizontal' },
      },
      { menuLocation: (m) => (m === 'main-menu' ? 'main-menu' : undefined) },
    );
    expect(menu.block).toMatchObject({
      type: 'fresco/nav-menu',
      attrs: { location: 'main-menu', toggle: 'mobile' },
    });

    const loop = one(
      {
        widgetType: 'loop-grid',
        settings: {
          template_id: 40,
          columns: '2',
          posts_per_page: 4,
          post_query_post_type: 'post',
          post_query_include_term_ids: ['5'],
        },
      },
      { entryRef, term },
    );
    expect(loop.block).toMatchObject({
      type: 'fresco-pro/loop-grid',
      attrs: {
        template: { $entry: 'post:40' },
        columns: 2,
        per_page: 4,
        source: 'article',
        taxonomy: 'category',
        terms: 'news',
      },
    });

    const global = elementorToFresco(
      JSON.stringify([
        { id: 'g', elType: 'widget', widgetType: 'global', templateID: 40, settings: [] },
      ]),
      context([], { entryRef }),
    )!;
    expect(global[0]!.children![0]).toMatchObject({
      type: 'fresco-pro/template',
      attrs: { template: { $entry: 'post:40' } },
    });

    const price = one({
      widgetType: 'price-table',
      settings: {
        heading: 'Pro',
        price: '29',
        currency_symbol: 'euro',
        period: 'Monthly',
        features_list: [{ _id: 'f', item_text: 'All the things' }],
        button_text: 'Buy',
        link: { url: '/buy' },
      },
    });
    expect(price.block).toMatchObject({
      type: 'fresco-pro/price-table',
      attrs: {
        heading: 'Pro',
        price: '29',
        currency: '€',
        features: [{ text: 'All the things', included: true }],
      },
    });

    const slides = one({
      widgetType: 'slides',
      settings: {
        slides: [
          {
            _id: 's',
            heading: 'One',
            description: 'First',
            button_text: 'More',
            link: { url: '/one' },
            background_color: '#123',
            background_image: { id: 12, url: 'https://old.test/wp-content/uploads/a.jpg' },
            background_overlay: 'yes',
            background_overlay_color: 'rgba(0,0,0,0.3)',
          },
        ],
        autoplay: 'yes',
        autoplay_speed: 4000,
        navigation: 'dots',
      },
    });
    expect(slides.block).toMatchObject({
      type: 'fresco-pro/slides',
      attrs: {
        items: [
          {
            heading: 'One',
            bg_color: '#123',
            bg_image: { id: 'att:12' },
            overlay: 'rgba(0,0,0,0.3)',
          },
        ],
        autoplay: true,
        autoplay_speed: 4,
        arrows: false,
      },
    });

    // Dynamic tags pointing to a popup keep it as an entry reference.
    const button = one(
      {
        widgetType: 'button',
        settings: {
          text: 'Open',
          __dynamic__: {
            link: '[elementor-tag id="p" name="popup" settings="%7B%22popup%22%3A%2241%22%7D"]',
          },
        },
      },
      { entryRef },
    );
    expect(button.block.attrs.__dynamic).toEqual({
      link: { tag: 'popup', key: { $entry: 'post:41' }, kind: 'url' },
    });
  });

  it('converts atomic elements with their style variants', () => {
    const warnings: string[] = [];
    const blocks = elementorToFresco(
      JSON.stringify([
        {
          id: 'f1',
          elType: 'e-flexbox',
          settings: {
            classes: { $$type: 'classes', value: ['e-f1-aaa', 'g-brand'] },
            tag: { $$type: 'string', value: 'section' },
          },
          styles: {
            'e-f1-aaa': {
              id: 'e-f1-aaa',
              type: 'class',
              variants: [
                {
                  meta: { breakpoint: 'desktop', state: null },
                  props: {
                    padding: { $$type: 'size', value: { size: 24, unit: 'px' } },
                    background: {
                      $$type: 'background',
                      value: { color: { $$type: 'color', value: '#fafafa' } },
                    },
                    'flex-direction': { $$type: 'string', value: 'row' },
                  },
                },
                {
                  meta: { breakpoint: 'mobile', state: null },
                  props: { 'flex-direction': { $$type: 'string', value: 'column' } },
                },
              ],
            },
          },
          elements: [
            {
              id: 'h1',
              elType: 'widget',
              widgetType: 'e-heading',
              settings: {
                title: { $$type: 'string', value: 'Atomic' },
                tag: { $$type: 'string', value: 'h3' },
                classes: { $$type: 'classes', value: ['e-h1-bbb'] },
              },
              styles: {
                'e-h1-bbb': {
                  variants: [
                    {
                      meta: { breakpoint: 'desktop', state: 'hover' },
                      props: {
                        color: { $$type: 'global-color-variable', value: 'e-gv-brand' },
                        'font-size': { $$type: 'size', value: { size: 32, unit: 'px' } },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      ]),
      context(warnings),
    )!;
    const box = blocks[0]!.children![0]! as CxdBlock;
    expect(box.type).toBe('fresco/a-flexbox');
    expect(box.attrs).toMatchObject({
      tag: 'section',
      _classes: ['g-brand'],
      _styles: [
        {
          device: 'desktop',
          state: '',
          props: {
            padding: { top: 24, right: 24, bottom: 24, left: 24, unit: 'px' },
            backgroundColor: '#fafafa',
            flexDirection: 'row',
          },
        },
        { device: 'mobile', state: '', props: { flexDirection: 'column' } },
      ],
    });
    expect(box.children![0]).toMatchObject({
      type: 'fresco/a-heading',
      attrs: {
        title: 'Atomic',
        tag: 'h3',
        _styles: [
          {
            device: 'desktop',
            state: 'hover',
            props: { color: 'var(--fr-v-e-gv-brand)', fontSize: { size: 32, unit: 'px' } },
          },
        ],
      },
    });
  });

  it('keeps SVG icons and renamed Font Awesome icons', () => {
    const { block } = one({
      widgetType: 'icon-box',
      settings: {
        title_text: 'Call us',
        description_text: 'Any <strong>time</strong>',
        position: 'inline-start',
        selected_icon: {
          value: { id: 12, url: 'https://old.test/wp-content/uploads/phone.svg' },
          library: 'svg',
        },
      },
    });
    expect(block.attrs).toMatchObject({
      title: 'Call us',
      description: 'Any time',
      position: 'left',
      icon: { set: 'custom', url: 'https://old.test/wp-content/uploads/phone.svg', id: 'att:12' },
    });
    expect(
      one({
        widgetType: 'icon',
        settings: { selected_icon: { value: 'fas fa-map-marker-alt', library: 'fa-solid' } },
      }).block.attrs.icon,
    ).toEqual({
      set: 'solid',
      name: 'location-dot',
    });
  });
});
