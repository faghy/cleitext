/**
 * Elementor widgets' secondary options (Fresco 2.3): hover animations,
 * entrance animations per device, text stroke and shadow, custom background
 * positions, the container overlay, Button, Image, Video, carousels, nested
 * tabs and accordions and the other free widgets.
 */
import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '../src/index.js';
import { elementorToFresco, type ElementorContext } from '../src/elementor.js';

const context = (warnings: string[]): ElementorContext => ({
  mediaRef: (id) => (id === 12 ? 'att:12' : id === 13 ? 'att:13' : undefined),
  warn: (m) => warnings.push(m),
});

/** One converted widget (inside the wrapper container). */
const widget = (
  widgetType: string,
  settings: Record<string, unknown>,
  elements: unknown[] = [],
) => {
  const warnings: string[] = [];
  const blocks = elementorToFresco(
    JSON.stringify([{ id: 'x', elType: 'widget', widgetType, settings, elements }]),
    context(warnings),
  )!;
  return { block: blocks[0]!.children![0]!, warnings };
};

const container = (settings: Record<string, unknown>): CxdBlock => {
  const blocks = elementorToFresco(
    JSON.stringify([{ id: 'k', elType: 'container', settings, elements: [] }]),
    context([]),
  )!;
  return blocks[0]!;
};

const shadow = (horizontal: number, vertical: number, blur: number, color: string) => ({
  horizontal,
  vertical,
  blur,
  color,
});

describe('Elementor widgets: secondary options', () => {
  it('keeps every hover animation, on the widgets that have one', () => {
    for (const [type, animation] of [
      ['image', 'wobble-top'],
      ['button', 'buzz-out'],
      ['icon', 'hang'],
      ['icon-box', 'grow-rotate'],
      ['image-box', 'skew-forward'],
      ['social-icons', 'pulse-shrink'],
    ] as const) {
      expect(widget(type, { hover_animation: animation }).block.attrs.hover_effect).toBe(animation);
    }
    expect(
      widget('button', { hover_animation: 'unknown' }).block.attrs.hover_effect,
    ).toBeUndefined();
  });

  it('converts entrance animations per device, and "none" on a device', () => {
    const { attrs } = widget('heading', {
      title: 'Hi',
      _animation: 'fadeInUp',
      _animation_tablet: 'zoomIn',
      _animation_mobile: 'none',
      _animation_delay: 300,
    }).block;
    expect(attrs).toMatchObject({
      _animation: 'fade-up',
      '_animation@tablet': 'zoom-in',
      '_animation@mobile': 'none',
      _animation_delay: 300,
    });
    // Only on phones: no desktop animation, the delay is kept.
    const phone = widget('heading', {
      title: 'Hi',
      _animation_mobile: 'bounceIn',
      _animation_delay: 200,
    }).block.attrs;
    expect(phone._animation).toBeUndefined();
    expect(phone).toMatchObject({ '_animation@mobile': 'bounce-in', _animation_delay: 200 });
  });

  it('converts text stroke and text shadow groups', () => {
    const { attrs } = widget('heading', {
      title: 'Hi',
      text_stroke_text_stroke_type: 'yes',
      text_stroke_text_stroke: { unit: 'px', size: 2 },
      text_stroke_text_stroke_mobile: { unit: 'px', size: 1 },
      text_stroke_stroke_color: '#ff0000',
      text_shadow_text_shadow_type: 'yes',
      text_shadow_text_shadow: shadow(1, 2, 3, 'rgba(0,0,0,0.5)'),
    }).block;
    expect(attrs).toMatchObject({
      title_stroke: { size: 2, unit: 'px' },
      'title_stroke@mobile': { size: 1, unit: 'px' },
      title_stroke_color: '#ff0000',
      title_shadow: { x: 1, y: 2, blur: 3, color: 'rgba(0,0,0,0.5)' },
    });
    // The counter's number and title, the testimonial's texts.
    const counter = widget('counter', {
      number_stroke_text_stroke_type: 'yes',
      number_stroke_text_stroke: { unit: 'px', size: 1 },
      title_shadow_text_shadow_type: 'yes',
      title_shadow_text_shadow: shadow(0, 1, 2, '#000000'),
    }).block.attrs;
    expect(counter).toMatchObject({
      number_stroke: { size: 1, unit: 'px' },
      number_stroke_color: '#000',
      title_shadow: { x: 0, y: 1, blur: 2, color: '#000000' },
    });
    const quote = widget('testimonial', {
      name_shadow_text_shadow_type: 'yes',
      name_shadow_text_shadow: shadow(1, 1, 1, '#111111'),
    }).block.attrs;
    expect(quote.name_shadow).toEqual({ x: 1, y: 1, blur: 1, color: '#111111' });
  });

  it('converts custom background positions and sizes, and gradients per device', () => {
    const block = container({
      background_background: 'classic',
      background_color: '#ffffff',
      background_position: 'initial',
      background_xpos: { unit: 'px', size: 20 },
      background_ypos: { unit: '%', size: 40 },
      background_position_mobile: 'top-left',
      background_size: 'initial',
      background_bg_width: { unit: '%', size: 60 },
      background_hover_background: 'gradient',
      background_hover_color: '#000000',
      background_hover_color_b: '#ffffff',
      background_hover_gradient_angle: { unit: 'deg', size: 90 },
      background_hover_gradient_angle_mobile: { unit: 'deg', size: 180 },
      background_hover_color_stop_tablet: { unit: '%', size: 20 },
    });
    expect(block.attrs).toMatchObject({
      background_position: 'custom',
      background_xpos: { size: 20, unit: 'px' },
      background_ypos: { size: 40, unit: '%' },
      'background_position@mobile': 'top left',
      background_size: 'custom',
      background_bg_width: { size: 60, unit: '%' },
      background_hover_type: 'gradient',
      background_hover_angle: { size: 90, unit: 'deg' },
      'background_hover_angle@mobile': { size: 180, unit: 'deg' },
      'background_hover_stop@tablet': { size: 20, unit: '%' },
    });
  });

  it('converts the overlay: color, hover, CSS filters, blend mode and transition', () => {
    const block = container({
      background_overlay_background: 'classic',
      background_overlay_color: '#000000',
      background_overlay_opacity: { unit: 'px', size: 0.4 },
      background_overlay_hover_background: 'gradient',
      background_overlay_hover_color: '#111111',
      background_overlay_hover_color_b: '#222222',
      background_overlay_hover_opacity: { unit: 'px', size: 0.8 },
      css_filters_css_filter: 'custom',
      css_filters_blur: { unit: 'px', size: 2 },
      css_filters_hover_css_filter: 'custom',
      css_filters_hover_brightness: { unit: 'px', size: 120 },
      overlay_blend_mode: 'multiply',
      background_overlay_hover_transition: { unit: 'px', size: 0.5 },
    });
    expect(block.attrs).toMatchObject({
      overlay_bg_type: 'classic',
      overlay_bg_color: '#000000',
      overlay_opacity: { size: 0.4, unit: '' },
      overlay_hover_bg_type: 'gradient',
      overlay_hover_bg_color: '#111111',
      overlay_hover_opacity: { size: 0.8, unit: '' },
      overlay_filters_blur: { size: 2, unit: 'px' },
      overlay_hover_filters_brightness: { size: 120, unit: '%' },
      overlay_blend: 'multiply',
      overlay_hover_transition: { size: 0.5, unit: 's' },
    });
    expect(block.attrs.overlay_color).toBeUndefined();
  });

  it('converts the button: type, content alignment, gradients, hover shadow and transition', () => {
    const { block, warnings } = widget('button', {
      text: 'Go',
      button_type: 'success',
      align: 'justify',
      content_align: 'space-between',
      content_align_mobile: 'start',
      background_background: 'gradient',
      background_color: '#111111',
      background_color_b: '#222222',
      button_background_hover_background: 'gradient',
      button_background_hover_color: '#333333',
      button_background_hover_color_b: '#444444',
      button_hover_box_shadow_box_shadow_type: 'yes',
      button_hover_box_shadow_box_shadow: {
        horizontal: 0,
        vertical: 4,
        blur: 8,
        spread: 0,
        color: '#000000',
      },
      button_hover_transition_duration: { unit: 'ms', size: 400 },
      selected_icon: { value: 'fas fa-arrow-right', library: 'fa-solid' },
      icon_align: 'row-reverse',
      icon_indent: { unit: 'px', size: 12 },
    });
    expect(block.attrs).toMatchObject({
      button_type: 'success',
      content_align: 'space-between',
      'content_align@mobile': 'flex-start',
      button_background_type: 'gradient',
      button_background_color: '#111111',
      button_background_color_b: '#222222',
      button_background_hover_type: 'gradient',
      button_background_hover_color_b: '#444444',
      shadow_hover: { x: 0, y: 4, blur: 8, spread: 0, color: '#000000' },
      hover_transition: { size: 0.4, unit: 's' },
      icon_position: 'after',
      icon_spacing: { size: 12, unit: 'px' },
    });
    expect(warnings.join(' ')).not.toContain('gradient');
  });

  it('converts the image: object position, hover opacity and filters, captions', () => {
    const { attrs } = widget('image', {
      image: { id: 12, url: 'https://old.test/a.jpg' },
      'object-fit': 'cover',
      'object-position': 'top center',
      opacity_hover: { unit: 'px', size: 0.7 },
      css_filters_hover_css_filter: 'custom',
      css_filters_hover_saturate: { unit: 'px', size: 0 },
      background_hover_transition: { unit: 'px', size: 0.6 },
      caption_source: 'attachment',
      caption_align: 'center',
      text_color: '#555555',
      caption_space: { unit: 'px', size: 10 },
    }).block;
    expect(attrs).toMatchObject({
      object_fit: 'cover',
      object_position: 'top center',
      'opacity:hover': { size: 0.7, unit: '' },
      filters_hover_saturate: { size: 0, unit: '%' },
      hover_transition: { size: 0.6, unit: 's' },
      caption_source: 'attachment',
      caption_align: 'center',
      caption_color: '#555555',
      caption_space: { size: 10, unit: 'px' },
    });
  });

  it('converts image and icon boxes: bottom position, image options, transitions', () => {
    const image = widget('image-box', {
      title_text: 'T',
      position: 'block-end',
      image_height: { unit: 'px', size: 200 },
      image_object_fit: 'cover',
      image_object_position: 'center left',
      image_opacity_hover: { unit: 'px', size: 0.5 },
      title_stroke_text_stroke_type: 'yes',
      title_stroke_text_stroke: { unit: 'px', size: 1 },
    });
    expect(image.block.attrs).toMatchObject({
      position: 'bottom',
      image_height: { size: 200, unit: 'px' },
      image_object_fit: 'cover',
      image_object_position: 'center left',
      'image_opacity:hover': { size: 0.5, unit: '' },
      title_stroke: { size: 1, unit: 'px' },
    });
    expect(image.warnings.join(' ')).not.toContain('below the text');
    const icon = widget('icon-box', {
      title_text: 'T',
      rotate: { unit: 'deg', size: 45 },
      hover_icon_colors_transition_duration: { unit: 's', size: 0.3 },
    }).block.attrs;
    expect(icon).toMatchObject({
      icon_rotate: { size: 45, unit: 'deg' },
      icon_hover_transition: { size: 0.3, unit: 's' },
    });
  });

  it('converts the video: Dailymotion, end, Vimeo options, play icon and lightbox', () => {
    const dm = widget('video', {
      video_type: 'dailymotion',
      dailymotion_url: 'https://www.dailymotion.com/video/x8abc12',
      end: 30,
      logo: '',
      color: '#ff0000',
    }).block.attrs;
    expect(dm).toMatchObject({
      source: 'dailymotion',
      url: 'https://www.dailymotion.com/video/x8abc12',
      end: 30,
      logo: false,
      player_color: '#ff0000',
    });
    const vimeo = widget('video', {
      video_type: 'vimeo',
      vimeo_url: 'https://vimeo.com/123',
      vimeo_title: '',
      vimeo_byline: '',
      show_image_overlay: 'yes',
      image_overlay: { id: 12, url: 'https://old.test/a.jpg' },
      show_play_icon: 'yes',
      play_icon: { value: 'fas fa-play', library: 'fa-solid' },
      lightbox: 'yes',
      lightbox_color: '#000000',
      play_icon_color: '#ffffff',
    }).block.attrs;
    expect(vimeo).toMatchObject({
      source: 'vimeo',
      vimeo_title: false,
      vimeo_byline: false,
      poster: { id: 'att:12' },
      lightbox: true,
      lightbox_color: '#000000',
      play_icon_color: '#ffffff',
    });
    expect(vimeo.play_icon).toBeTruthy();
    const hosted = widget('video', {
      video_type: 'hosted',
      insert_url: 'yes',
      external_url: { url: 'https://cdn.test/v.mp4' },
      preload: 'auto',
    }).block.attrs;
    expect(hosted).toMatchObject({
      source: 'hosted',
      external: true,
      external_url: 'https://cdn.test/v.mp4',
      preload: 'auto',
      download: false,
    });
  });

  it('converts the image carousel: scroll, fade, speed, arrows, dots and captions', () => {
    const { block, warnings } = widget('image-carousel', {
      carousel: [{ id: 12, url: 'https://old.test/a.jpg' }],
      slides_to_scroll: '2',
      slides_to_scroll_mobile: '1',
      autoplay_speed: 3000,
      pause_on_interaction: 'yes',
      effect: 'fade',
      speed: 800,
      navigation_previous_icon: { value: 'fas fa-chevron-left', library: 'fa-solid' },
      arrows_position: 'outside',
      arrows_size: { unit: 'px', size: 30 },
      dots_position: 'inside',
      dots_color: '#ff0000',
      caption_type: 'caption',
      caption_text_color: '#333333',
      link_to: 'custom',
      link: { url: 'https://example.com/' },
    });
    expect(block.attrs).toMatchObject({
      per_scroll: 2,
      'per_scroll@mobile': 1,
      interval: 3000,
      pause_interaction: true,
      effect: 'fade',
      speed: 800,
      arrows_position: 'outside',
      arrows_size: { size: 30, unit: 'px' },
      dots_position: 'inside',
      dot_active: '#ff0000',
      caption_type: 'attachment',
      caption_color: '#333333',
      link_to: 'custom',
      link: { url: 'https://example.com/' },
    });
    expect(block.attrs.prev_icon).toBeTruthy();
    expect(warnings).toEqual([]);
  });

  it('converts nested tabs: direction, icons, states and content box', () => {
    const { block } = widget(
      'nested-tabs',
      {
        tabs: [
          { tab_title: 'One', tab_icon: { value: 'fas fa-star', library: 'fa-solid' } },
          { tab_title: 'Two' },
        ],
        tabs_direction: 'inline-start',
        tabs_direction_mobile: 'block-end',
        horizontal_scroll: 'enable',
        title_alignment: 'center',
        title_text_color_active: '#ff0000',
        tabs_title_background_color_hover_background: 'classic',
        tabs_title_background_color_hover_color: '#eeeeee',
        tabs_title_border_active_border: 'solid',
        tabs_title_border_active_width: { unit: 'px', top: 1, right: 1, bottom: 1, left: 1 },
        title_text_stroke_text_stroke_type: 'yes',
        title_text_stroke_text_stroke: { unit: 'px', size: 1 },
        icon_position: 'block-start',
        icon_color_active: '#00ff00',
        hover_animation: 'grow',
      },
      [
        { id: 'a', elType: 'container', settings: {}, elements: [] },
        { id: 'b', elType: 'container', settings: {}, elements: [] },
      ],
    );
    expect(block.type).toBe('fresco/tabs');
    expect(block.attrs).toMatchObject({
      tabs_direction: 'left',
      'tabs_direction@mobile': 'bottom',
      horizontal_scroll: true,
      title_align: 'center',
      active_color: '#ff0000',
      'title_bg:hover': '#eeeeee',
      title_border_active_style: 'solid',
      title_stroke: { size: 1, unit: 'px' },
      icon_position: 'top',
      icon_active_color: '#00ff00',
      hover_effect: 'grow',
    });
    expect(block.children![0]!.attrs).toMatchObject({ _title: 'One' });
    expect(block.children![0]!.attrs._icon).toBeTruthy();
    expect(block.children![1]!.attrs._icon).toBeUndefined();
  });

  it('converts nested accordions: item position, states, icons and animation', () => {
    const { block } = widget(
      'nested-accordion',
      {
        items: [{ item_title: 'Q1' }],
        accordion_item_title_position_horizontal: 'stretch',
        accordion_item_title_icon_position: 'start',
        n_accordion_animation_duration: { unit: 'ms', size: 300 },
        default_state: 'all_collapsed',
        max_items_expended: 'multiple',
        accordion_border_active_border: 'solid',
        active_title_color: '#ff0000',
        hover_icon_color: '#00ff00',
        title_active_text_shadow_text_shadow_type: 'yes',
        title_active_text_shadow_text_shadow: shadow(0, 0, 4, '#000000'),
      },
      [{ id: 'a', elType: 'container', settings: {}, elements: [] }],
    );
    expect(block.type).toBe('fresco/accordion');
    expect(block.attrs).toMatchObject({
      title_align: 'stretch',
      icon_position: 'start',
      animation_duration: 300,
      open: 'none',
      multiple: true,
      title_border_open_style: 'solid',
      title_open_color: '#ff0000',
      icon_hover_color: '#00ff00',
      title_open_text_shadow: { x: 0, y: 0, blur: 4, color: '#000000' },
    });
  });

  it('converts the other free widgets’ options', () => {
    expect(
      widget('icon-list', {
        icon_list: [],
        link_click: 'inline',
        divider: 'yes',
        divider_style: 'dashed',
        icon_self_vertical_align: 'flex-start',
        icon_vertical_offset: { unit: 'px', size: 2 },
      }).block.attrs,
    ).toMatchObject({
      link_click: 'inline',
      divider_style: 'dashed',
      icon_self_vertical_align: 'flex-start',
      icon_vertical_offset: { size: 2, unit: 'px' },
    });
    expect(
      widget('counter', {
        thousand_separator_char: '.',
        title_tag: 'h3',
        title_position: 'start',
        title_vertical_alignment: 'end',
      }).block.attrs,
    ).toMatchObject({
      separator_char: '.',
      title_tag: 'h3',
      title_position: 'start',
      title_vertical_align: 'flex-end',
    });
    expect(
      widget('progress', { progress_type: 'danger', title_display: '', title_tag: 'h4' }).block
        .attrs,
    ).toMatchObject({ progress_type: 'danger', show_title: false, title_tag: 'h4' });
    expect(
      widget('social-icons', {
        social_icon_list: [
          {
            _id: 'a',
            social_icon: { value: 'fab fa-facebook', library: 'fa-brands' },
            item_icon_color: 'custom',
            item_icon_primary_color: '#ff0000',
          },
        ],
        columns: '3',
        hover_border_color: '#00ff00',
      }).block.attrs,
    ).toMatchObject({
      items: [{ item_color: 'custom', item_primary: '#ff0000' }],
      columns: 3,
      hover_border_color: '#00ff00',
    });
    expect(
      widget('alert', {
        alert_title: 'A',
        dismiss_icon: { value: 'fas fa-times', library: 'fa-solid' },
        dismiss_icon_hover_color: '#ff0000',
        'border_left-width': { unit: 'px', size: 8 },
      }).block.attrs,
    ).toMatchObject({
      'dismiss_color:hover': '#ff0000',
      border_left_width: { size: 8, unit: 'px' },
    });
    expect(
      widget('rating', {
        rating_scale: { unit: 'px', size: 7 },
        rating_value: 6,
        icon_color: '#ffaa00',
      }).block.attrs,
    ).toMatchObject({ scale: '7', rating: 6, color: '#ffaa00' });
    expect(
      widget('star-rating', { star_style: 'star_unicode', unmarked_star_style: 'outline' }).block
        .attrs,
    ).toMatchObject({ star_style: 'unicode', unmarked_style: 'outline' });
    expect(
      widget('text-path', {
        text: 'Hi',
        path: 'spiral',
        text_path_direction: 'rtl',
        show_path: 'yes',
        stroke_color_hover: '#ff0000',
        hover_animation: 'float',
      }).block.attrs,
    ).toMatchObject({
      path: 'spiral',
      text_direction: 'rtl',
      show_path: true,
      'stroke:hover': '#ff0000',
      hover_effect: 'float',
    });
    expect(
      widget('audio', {
        link: { url: 'https://soundcloud.com/a/b' },
        sc_buying: '',
        sc_show_user: '',
      }).block.attrs,
    ).toMatchObject({ sc_buying: false, sc_show_user: false });
    expect(
      widget('image-gallery', { wp_gallery: [], gallery_rand: 'rand' }).block.attrs.random,
    ).toBe(true);
    expect(
      widget('google_maps', {
        address: 'Roma',
        css_filters_hover_css_filter: 'custom',
        css_filters_hover_contrast: { unit: 'px', size: 150 },
      }).block.attrs.filters_hover_contrast,
    ).toEqual({ size: 150, unit: '%' });
  });
});

describe('Elementor sites as WordPress showed them', () => {
  /** One widget converted with a kit and the attachments the import knows. */
  const convert = (
    widgetType: string,
    settings: Record<string, unknown>,
    extra: Partial<ElementorContext> = {},
  ) => {
    const warnings: string[] = [];
    const blocks = elementorToFresco(
      JSON.stringify([{ id: 'x', elType: 'widget', widgetType, settings, elements: [] }]),
      { ...context(warnings), ...extra },
    )!;
    return { block: blocks[0]!.children![0]!, warnings };
  };
  // A theme's kit: its own system fonts instead of Elementor's (no "primary").
  const kit = {
    fonts: {
      'heading-title': ['family', 'size', 'weight', 'transform', 'line'],
      'heading-sub': ['family', 'size', 'weight', 'transform', 'line', 'letter'],
      'only-family': ['family', 'weight'],
    },
  };

  it('writes global ids with underscores as the kit keeps them (hyphens)', () => {
    const { block } = convert(
      'heading',
      {
        title: 'Title',
        typography_typography: 'custom',
        __globals__: {
          title_color: 'globals/colors?id=primary_hover',
          typography_typography: 'globals/typography?id=heading_title',
        },
      },
      { kit },
    );
    expect(block.attrs).toMatchObject({
      title_color: 'var(--fr-c-primary-hover)',
      title_typography_global: 'heading-title',
      title_typography_global_all: true,
    });
    const button = convert('button', {
      text: 'Go',
      __globals__: {
        background_color: 'globals/colors?id=Accent_2',
        typography_typography: 'globals/typography?id=heading_sub',
      },
    }).block;
    expect(JSON.stringify(button.attrs)).toContain('var(--fr-c-accent-2)');
    expect(JSON.stringify(button.attrs)).toContain('"heading-sub"');
  });

  it('lets a global font win over the element’s own values, which fill only what it does not set', () => {
    const { block } = convert(
      'heading',
      {
        title: 'Title',
        typography_typography: 'custom',
        typography_font_family: 'Inter',
        typography_font_size: { unit: 'px', size: 36 },
        typography_font_size_mobile: { unit: 'px', size: 20 },
        typography_font_weight: '700',
        typography_letter_spacing: { unit: 'px', size: 1 },
        typography_font_style: 'italic',
        __globals__: { typography_typography: 'globals/typography?id=heading_title' },
      },
      { kit },
    );
    expect(block.attrs).toMatchObject({
      title_typography_global: 'heading-title',
      title_typography_global_all: true,
      // Not set by the global font: the element's own.
      title_typography_letter: { size: 1, unit: 'px' },
      title_typography_style: 'italic',
    });
    for (const key of [
      'title_typography_family',
      'title_typography_size',
      'title_typography_size@mobile',
      'title_typography_weight',
      // The global font sets a line height: no line height of 1.
      'title_typography_line',
    ]) {
      expect(block.attrs[key]).toBeUndefined();
    }
    // Without the kit's details, the global font gives everything.
    const bare = convert('heading', {
      title: 'Title',
      typography_typography: 'custom',
      typography_font_size: { unit: 'px', size: 36 },
      __globals__: { typography_typography: 'globals/typography?id=heading_title' },
    }).block;
    expect(bare.attrs.title_typography_size).toBeUndefined();
    expect(bare.attrs.title_typography_global).toBe('heading-title');
  });

  it('turns a line break typed in a heading into a space, keeping <br>', () => {
    const { block } = convert('heading', { title: 'Corso\nbase<br>di sopravvivenza' });
    expect(block.attrs.title).toBe('Corso base\ndi sopravvivenza');
    const box = convert('icon-box', { title_text: 'Two\r\n  lines', description_text: 'A\nB' });
    expect(box.block.attrs).toMatchObject({ title: 'Two lines' });
  });

  it('leaves headings without a font to the theme when the kit has no primary font', () => {
    const own = convert('heading', { title: 'Title' }, { kit });
    expect(own.block.attrs.title_theme_font).toBe(true);
    expect(own.block.attrs.title_typography_global).toBeUndefined();
    expect(own.block.attrs.title_typography_line).toEqual({ size: 1, unit: '' });
    // Its own family: no need.
    const family = convert(
      'heading',
      { title: 'Title', typography_typography: 'custom', typography_font_family: 'Rubik' },
      { kit },
    );
    expect(family.block.attrs.title_theme_font).toBeUndefined();
    // A kit with a primary font: Elementor's default for headings, with its size.
    const primary = convert(
      'heading',
      { title: 'Title' },
      { kit: { fonts: { primary: ['family', 'weight', 'size', 'line'] } } },
    );
    expect(primary.block.attrs).toMatchObject({
      title_typography_global: 'primary',
      title_typography_global_all: true,
    });
    expect(primary.block.attrs.title_theme_font).toBeUndefined();
    expect(primary.block.attrs.title_typography_line).toBeUndefined();
    // Only a family and weight: Fresco's default for headings (the primary font) is the same.
    const plain = convert(
      'heading',
      { title: 'Title' },
      { kit: { fonts: { primary: ['family', 'weight'] } } },
    );
    expect(plain.block.attrs.title_typography_global).toBeUndefined();
    expect(plain.block.attrs.title_theme_font).toBeUndefined();
    // No kit at all: as before.
    const none = convert('heading', { title: 'Title' });
    expect(none.block.attrs.title_theme_font).toBeUndefined();
  });

  it("gives headings no default font when Elementor's default fonts were off", () => {
    const fonts = { primary: ['family', 'weight', 'size', 'line'] };
    const off = convert('heading', { title: 'Title' }, { kit: { fonts, themeFonts: true } });
    // The kit's flag leaves them to the theme: no global font, no own family.
    expect(off.block.attrs.title_typography_global).toBeUndefined();
    expect(off.block.attrs.title_theme_font).toBeUndefined();
    expect(off.block.attrs.title_typography_line).toEqual({ size: 1, unit: '' });
    // A global font chosen on the heading stays.
    const chosen = convert(
      'heading',
      { title: 'Title', __globals__: { typography_typography: 'globals/typography?id=primary' } },
      { kit: { fonts, themeFonts: true } },
    );
    expect(chosen.block.attrs.title_typography_global).toBe('primary');
    // Old kits (line heights only): no default either.
    const old = convert(
      'heading',
      { title: 'Title' },
      { kit: { fontsWithLine: ['primary'], themeFonts: true } },
    );
    expect(old.block.attrs.title_typography_global).toBeUndefined();
  });

  it('keeps the width and crop of WordPress, theme and custom image sizes', () => {
    const image = { id: 12, url: 'https://old.test/wp-content/uploads/a.jpg' };
    const imageInfo = (id: number) =>
      id === 12
        ? {
            width: 2000,
            height: 1500,
            sizes: {
              'activland-post-grid': { width: 820, height: 580 },
              medium_large: { width: 768, height: 576 },
            },
          }
        : undefined;
    const theme = convert(
      'image',
      { image, image_size: 'activland-post-grid' },
      { imageInfo },
    ).block;
    expect(theme.attrs).toMatchObject({
      image_size: 'large',
      width: { size: 820, unit: 'px' },
      aspect_ratio: '820/580',
      object_fit: 'cover',
    });
    const mediumLarge = convert('image', { image, image_size: 'medium_large' }, { imageInfo });
    expect(mediumLarge.block.attrs).toMatchObject({ width: { size: 768, unit: 'px' } });
    expect(mediumLarge.block.attrs.aspect_ratio).toBeUndefined();
    const custom = convert(
      'image',
      { image, image_size: 'custom', image_custom_dimension: { width: '400', height: '400' } },
      { imageInfo },
    );
    expect(custom.block.attrs).toMatchObject({
      image_size: 'full',
      width: { size: 400, unit: 'px' },
      aspect_ratio: '400/400',
      object_fit: 'cover',
    });
    // WordPress's own sizes, without the import's details.
    const thumb = convert('image', { image, image_size: 'thumbnail' });
    expect(thumb.block.attrs).toMatchObject({
      image_size: 'thumb',
      width: { size: 150, unit: 'px' },
      aspect_ratio: '150/150',
    });
    const medium = convert('image', { image, image_size: 'medium' }, { imageInfo });
    expect(medium.block.attrs).toMatchObject({
      image_size: 'medium',
      width: { size: 300, unit: 'px' },
    });
    // The element's own width and height win.
    const sized = convert(
      'image',
      {
        image,
        image_size: 'activland-post-grid',
        width: { unit: '%', size: 100 },
        height: { unit: 'px', size: 300 },
      },
      { imageInfo },
    );
    expect(sized.block.attrs.width).toEqual({ size: 100, unit: '%' });
    expect(sized.block.attrs.aspect_ratio).toBeUndefined();
    // A theme size the import does not know: large, reported.
    const unknown = convert('image', { image, image_size: 'theme-wide' });
    expect(unknown.block.attrs.image_size).toBe('large');
    expect(unknown.warnings.join('\n')).toContain('"theme-wide"');
    expect(convert('image', { image, image_size: 'full' }).block.attrs.width).toBeUndefined();
  });

  it('marks imported custom CSS so Fresco draws it without Fresco Pro', () => {
    const { block } = convert('heading', { title: 'T', custom_css: 'selector{opacity:.5}' });
    expect(block.attrs).toMatchObject({
      _custom_css: 'selector{opacity:.5}',
      _custom_css_imported: true,
    });
  });

  it('keeps a theme’s shape dividers as custom shapes with their SVG file', () => {
    const blocks = elementorToFresco(
      JSON.stringify([
        {
          id: 'k',
          elType: 'container',
          settings: {
            shape_divider_bottom: 'custom-shape-1',
            shape_divider_bottom_negative: 'yes',
            shape_divider_bottom_color: '#ffffff',
            shape_divider_bottom_width: { unit: '%', size: 120 },
          },
          elements: [],
        },
      ]),
      {
        ...context([]),
        shapeFile: (name, negative) =>
          name === 'custom-shape-1' && negative
            ? { id: 'att:30', url: '/uploads/custom-shape-1-negative.svg' }
            : undefined,
      },
    )!;
    expect(blocks[0]!.attrs).toMatchObject({
      shape_bottom: 'custom',
      shape_bottom_name: 'custom-shape-1',
      shape_bottom_svg: { id: 'att:30', url: '/uploads/custom-shape-1-negative.svg' },
      shape_bottom_negative: true,
      shape_bottom_color: '#ffffff',
      shape_bottom_width: { size: 120, unit: '%' },
    });
  });

  it('turns WordPress’s emoji images back into characters', () => {
    const img =
      '<img draggable="false" role="img" class="emoji" alt="🔥" src="https://s.w.org/images/core/emoji/15.0.3/svg/1f525.svg">';
    const text = convert('text-editor', { editor: `<p>Hot ${img} news</p>` }).block;
    expect(text.attrs.content).toBe('<p>Hot 🔥 news</p>');
    const heading = convert('heading', { title: `Fire ${img}` }).block;
    expect(heading.attrs.title).toBe('Fire 🔥');
    // Other images stay.
    const photo = '<p><img class="size-full" alt="Photo" src="/a.jpg"></p>';
    expect(convert('text-editor', { editor: photo }).block.attrs.content).toBe(photo);
  });
});
