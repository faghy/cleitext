/**
 * Widgets of Elementor themes' companion plugins → the free and Pro widgets
 * they are made of, then converted as those. Each theme widget is rewritten
 * as Elementor's own (a container with headings, a testimonial carousel, a
 * posts grid…), with the theme's look (its CSS defaults) written as
 * settings, so the page keeps its design without the theme.
 *
 * - John (john-core, wethemez): hero, section title, contact form, contact
 *   info, testimonials, blog.
 */
import type { CxdBlock } from '../cxd.js';
import type { Converter, ElementorNode } from './convert.js';
import { asSettings, colorOf, list, num, str, type Settings } from './values.js';

let counter = 0;
const id = () => `th${(counter++).toString(36)}`;

/** An Elementor widget node. */
const widget = (widgetType: string, settings: Settings): ElementorNode => ({
  id: id(),
  elType: 'widget',
  widgetType,
  settings,
  elements: [],
});

const px = (size: number) => ({ unit: 'px', size, sizes: [] });
const sizeOf = (value: unknown, fallback: number) => num(asSettings(value).size) ?? fallback;
const bottom = (size: number) => ({
  unit: 'px',
  top: '0',
  right: '0',
  bottom: String(size),
  left: '0',
  isLinked: false,
});

const DEVICES = [
  '',
  '_tablet',
  '_mobile',
  '_laptop',
  '_widescreen',
  '_tablet_extra',
  '_mobile_extra',
];

/**
 * A typography group of the theme widget (`<from>_typography`, `<from>_font_size`…)
 * as another group (`<to>_…`), over the theme's defaults.
 */
function typography(
  src: Settings,
  from: string,
  to: string,
  defaults: {
    family?: string;
    size?: number;
    weight?: string;
    letter?: number;
    transform?: string;
    line?: number;
  } = {},
): Settings {
  const out: Settings = { [`${to}_typography`]: 'custom' };
  if (defaults.family) out[`${to}_font_family`] = defaults.family;
  if (defaults.size) out[`${to}_font_size`] = px(defaults.size);
  if (defaults.weight) out[`${to}_font_weight`] = defaults.weight;
  if (defaults.letter !== undefined) out[`${to}_letter_spacing`] = px(defaults.letter);
  if (defaults.transform) out[`${to}_text_transform`] = defaults.transform;
  if (defaults.line) out[`${to}_line_height`] = px(defaults.line);
  if (src[`${from}_typography`] === 'custom') {
    for (const part of [
      'font_family',
      'font_size',
      'font_weight',
      'text_transform',
      'font_style',
      'text_decoration',
      'line_height',
      'letter_spacing',
      'word_spacing',
    ]) {
      for (const device of DEVICES) {
        const value = src[`${from}_${part}${device}`];
        if (
          value !== undefined &&
          value !== '' &&
          !(typeof value === 'object' && asSettings(value).size === '')
        )
          out[`${to}_${part}${device}`] = value;
      }
    }
  }
  const globals = asSettings(src.__globals__);
  if (str(globals[`${from}_typography`]))
    out.__globals__ = {
      ...asSettings(out.__globals__),
      [`${to}_typography`]: globals[`${from}_typography`],
    };
  return out;
}

/** A color setting of the theme widget (its own, or a global), else the theme's. */
function colorFrom(src: Settings, from: string, to: string, fallback?: string): Settings {
  const globals = asSettings(src.__globals__);
  const global = str(globals[from]);
  if (global) return { __globals__: { [to]: global } };
  const own = str(src[from]);
  if (own) return { [to]: own };
  return fallback ? { [to]: fallback } : {};
}

/** Merges settings, joining their `__globals__`. */
function merge(...parts: Settings[]): Settings {
  const out: Settings = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (key === '__globals__')
        out.__globals__ = { ...asSettings(out.__globals__), ...asSettings(value) };
      else out[key] = value;
    }
  }
  return out;
}

/** The enabled parts of a John ordering repeater (`<prefix>_ordering_data`), in order. */
function ordering(
  src: Settings,
  key: string,
  enable: string,
  idKey: string,
  fallback: string[],
): string[] {
  const rows = list(src[key]);
  if (!rows.length) return fallback;
  return rows
    .filter((row) => row[enable] !== '' && row[enable] !== 'no')
    .map((row) => str(row[idKey]));
}

// ---- John (john-core) ---------------------------------------------------------------------

/** «Parallax banner»: a full-height picture with the subtitle, title, text and social icons. */
function johnHero(src: Settings): ElementorNode {
  const children: ElementorNode[] = [];
  const subtitle = str(src.banner_subtitle);
  if (subtitle) {
    children.push(
      widget(
        'heading',
        merge(
          { title: subtitle, header_size: 'h5', align: 'center' },
          colorFrom(src, 'banner_subtitle_color', 'title_color', '#ffffff'),
          typography(src, 'banner_subtitle', 'typography', { size: 20, weight: '400', letter: 1 }),
          { _margin: bottom(sizeOf(src.banner_subtitle_spacing, 32)) },
        ),
      ),
    );
  }
  const title = str(src.banner_title);
  if (title) {
    children.push(
      widget(
        'heading',
        merge(
          { title, header_size: 'h2', align: 'center' },
          colorFrom(src, 'banner_title_color', 'title_color', '#ffffff'),
          // The theme's phones: 38px (its responsive.css), unless the widget sets its own.
          { typography_font_size_mobile: px(38) },
          typography(src, 'banner_title', 'typography', {
            family: 'Poppins',
            size: 55,
            weight: '700',
          }),
          { _margin: bottom(sizeOf(src.banner_title_spacing, 10)) },
        ),
      ),
    );
  }
  const text = str(src.banner_discription);
  if (text) {
    children.push(
      widget(
        'text-editor',
        merge(
          { editor: `<p>${text}</p>`, align: 'center' },
          colorFrom(src, 'banner_content_color', 'text_color', '#ffffff'),
          typography(src, 'banner_content', 'typography', {
            size: 24,
            letter: 3,
            transform: 'capitalize',
          }),
          { _margin: bottom(sizeOf(src.banner_content_spacing, 40)) },
        ),
      ),
    );
  }
  const icons = list(src.social_icons).filter((item) => str(asSettings(item.social_icon).value));
  if (icons.length) {
    const width = sizeOf(src.social_icon_width, 35);
    const iconSize = sizeOf(src.banner_icon_size, 14);
    children.push(
      widget('social-icons', {
        social_icon_list: icons.map((item) => ({
          _id: str(item._id) || id(),
          social_icon: item.social_icon,
          link: item.social_link,
        })),
        shape: 'circle',
        align: 'center',
        icon_color: 'custom',
        icon_primary_color: str(src.social_icon_background_color) || 'rgba(0,0,0,0.3)',
        icon_secondary_color: str(src.banner_icon_color) || '#ffffff',
        hover_primary_color: str(src.icon_hover_background_color) || '#ffffff',
        hover_secondary_color: str(src.banner_icon_hover_color) || '#040c2c',
        icon_size: px(iconSize),
        icon_padding: { unit: 'em', size: Math.max(0, (width - iconSize) / 2 / iconSize) },
        icon_spacing: px(6),
      }),
    );
  }
  // The section: the picture as background (per device), the theme's dark veil or its pattern.
  const background: Settings = { background_background: 'classic', background_color: '#000000' };
  for (const [key, value] of Object.entries(src)) {
    const match = /^banner_parallax_bg_(.+)$/.exec(key);
    if (match && match[1] !== 'background') background[`background_${match[1]}`] = value;
  }
  if (!background.background_size) background.background_size = 'cover';
  if (!background.background_position) background.background_position = 'center center';
  const overlay: Settings = {};
  if (str(asSettings(src.banner_overlay_bg_image).url)) {
    for (const [key, value] of Object.entries(src)) {
      const match = /^banner_overlay_bg_(.+)$/.exec(key);
      if (match) overlay[`background_overlay_${match[1]}`] = value;
    }
  } else {
    overlay.background_overlay_background = 'classic';
    overlay.background_overlay_color = 'rgba(0,0,0,0.07)';
  }
  return {
    id: id(),
    elType: 'container',
    settings: {
      content_width: 'full',
      min_height: { unit: 'vh', size: 100, sizes: [] },
      flex_direction: 'column',
      flex_justify_content: 'center',
      flex_align_items: 'center',
      flex_gap: { unit: 'px', size: 0, column: '0', row: '0', isLinked: true },
      padding: { unit: 'px', top: '100', right: '15', bottom: '100', left: '15', isLinked: false },
      ...background,
      ...overlay,
    },
    elements: children,
  };
}

/** Section title: subtitle, title, text and line, in the order chosen. */
function johnSectionTitle(src: Settings): ElementorNode[] {
  const align = ['left', 'center', 'right'].includes(str(src.section_alignment))
    ? str(src.section_alignment)
    : 'center';
  const parts = ordering(src, 'section_ordering_data', 'section_order_enable', 'section_order_id', [
    's_subtitle',
    's_title',
    's_content',
    's_border',
  ]);
  const out: ElementorNode[] = [];
  for (const part of parts) {
    if (part === 's_subtitle' && str(src.section_subtitle)) {
      out.push(
        widget(
          'heading',
          merge(
            { title: str(src.section_subtitle), header_size: 'h6', align },
            colorFrom(src, 'section_subtitle_color', 'title_color', '#222d39'),
            typography(src, 'section_subtitle', 'typography', {
              family: 'Poppins',
              size: 16,
              weight: '500',
            }),
            { _margin: bottom(sizeOf(src.section_subtitle_spacing, 30)) },
          ),
        ),
      );
    } else if (part === 's_title' && str(src.section_title)) {
      out.push(
        widget(
          'heading',
          merge(
            { title: str(src.section_title), header_size: 'h2', align },
            colorFrom(src, 'section_title_color', 'title_color', '#222d39'),
            // Bootstrap's h2 under the theme's font (the widget has no CSS of its own).
            typography(src, 'section_title', 'typography', {
              family: 'Poppins',
              size: 32,
              weight: '500',
            }),
            { _margin: bottom(sizeOf(src.section_title_spacing, 30)) },
          ),
        ),
      );
    } else if (part === 's_content' && str(src.section_text).trim()) {
      out.push(
        widget(
          'text-editor',
          merge(
            { editor: `<p>${str(src.section_text).trim().replace(/\n/g, '<br>')}</p>`, align },
            colorFrom(src, 'section_content_color', 'text_color', '#797979'),
            typography(src, 'section_content', 'typography', {
              family: 'Poppins',
              size: 16,
              line: 30,
            }),
            { _margin: bottom(sizeOf(src.section_content_spacing, 30)) },
          ),
        ),
      );
    } else if (
      part === 's_border' &&
      str(src.border_bg_color) &&
      sizeOf(src.section_border, 30) > 0
    ) {
      out.push(
        widget('divider', {
          width: px(sizeOf(src.section_border, 30)),
          weight: px(sizeOf(src.section_border_height, 2)),
          color: str(src.border_bg_color),
          align,
          gap: px(0),
          _margin: bottom(sizeOf(src.section_border_spacing, 0)),
        }),
      );
    }
  }
  // The block's own margin (section_title_gap) on the first and last element.
  const gap = asSettings(src.section_title_gap);
  if (out.length && (str(gap.top) || str(gap.bottom))) {
    const first = out[0]!.settings as Settings;
    const last = out[out.length - 1]!.settings as Settings;
    const unit = str(gap.unit) || 'px';
    if (num(gap.top))
      first._margin = { ...asSettings(first._margin), unit, top: str(gap.top), isLinked: false };
    if (num(gap.bottom))
      last._margin = {
        ...asSettings(last._margin),
        unit,
        bottom: str(gap.bottom),
        isLinked: false,
      };
  }
  return out;
}

/** Contact info: an icon list with the theme's sizes and colors. */
function johnContactInfo(src: Settings): ElementorNode {
  return widget(
    'icon-list',
    merge(
      {
        icon_list: list(src.contact_info_item).map((item) => {
          const title = str(item.contact_items_title).trim();
          const text = str(item.contact_items_text).trim();
          return {
            _id: str(item._id) || id(),
            text: title ? `<strong>${title}</strong><br>${text}` : text,
            selected_icon: item.contact_icon,
            ...(str(asSettings(item.contact_link).url) ? { link: item.contact_link } : {}),
          };
        }),
        icon_size: px(sizeOf(src.info_icon_size, 20)),
        text_indent: px(sizeOf(src.info_icon_gap, 15)),
        space_between: px(25),
        icon_self_vertical_align: 'flex-start',
      },
      colorFrom(src, 'info_icon_color', 'icon_color', '#494949'),
      colorFrom(src, 'info_text_color', 'text_color', '#797979'),
      typography(src, 'Info_text', 'icon_typography', { family: 'Poppins', size: 16, line: 26 }),
      src._padding ? { _padding: src._padding } : {},
      src._padding_tablet ? { _padding_tablet: src._padding_tablet } : {},
    ),
  );
}

/** Testimonials: Fresco Pro's carousel, one at a time with dots, as the theme's slider. */
function johnTestimonial(src: Settings): ElementorNode {
  const parts = ordering(
    src,
    'testimonial_ordering_data',
    'testimonial_order_enable',
    'testimonial_order_id',
    ['slider_image', 'author_image', 'slider_title', 'slider_text'],
  );
  const showTitle = parts.includes('slider_title');
  const showAuthor = parts.includes('author_image');
  const titleFirst = parts.indexOf('slider_title') < parts.indexOf('slider_text');
  const padding = asSettings(src.section__padding);
  return widget(
    'testimonial-carousel',
    merge(
      {
        slides: list(src.testimonial_slider_item).map((item) => {
          const image = asSettings(item.testimonial_author_image);
          return {
            _id: str(item._id) || id(),
            content: str(item.testimonial_slider_text).trim(),
            ...(showAuthor && str(image.url) ? { image } : {}),
            name: showTitle
              ? str(item.testimonial_slider_title)
              : str(item.testimonial_slider_author_name),
            title: showAuthor ? str(item.testimonial_slider_author_desc) : '',
          };
        }),
        slides_per_view: String(num(src.john_testimonial_perpage) ?? 1),
        layout: titleFirst ? 'image_above' : 'image_inline',
        show_arrows: src.john_testimonial_nav === 'yes' ? 'yes' : '',
        pagination: src.john_testimonial_dots === 'no' ? '' : 'bullets',
        autoplay: src.john_testimonial_autoplay === 'yes' ? 'yes' : '',
        ...(num(src.john_testimonial_auto_delay)
          ? { autoplay_speed: num(src.john_testimonial_auto_delay) }
          : {}),
        alignment: 'center',
        ...(str(src.testimonial_slider_button_color)
          ? { pagination_color: str(src.testimonial_slider_button_color) }
          : {}),
        ...(str(padding.right) || str(padding.left) ? { _padding: padding } : {}),
        ...(src.section__padding_tablet ? { _padding_tablet: src.section__padding_tablet } : {}),
      },
      colorFrom(src, 'testimonial_content_color', 'content_color', '#797979'),
      colorFrom(src, 'testimonial_title_color', 'name_color', '#222d39'),
      colorFrom(src, 'testimonial_position_color', 'title_color'),
      typography(src, 'testimonial_content', 'content_typography', {
        family: 'Poppins',
        size: 16,
        line: 30,
      }),
      typography(src, 'testimonial_title', 'name_typography', {
        family: 'Poppins',
        size: 20,
        weight: '600',
      }),
    ),
  );
}

/** Blog: Fresco Pro's posts grid, with the query of the theme widget. */
function johnBlog(src: Settings): ElementorNode {
  const columns = Math.max(1, Math.round(12 / (num(src.column_grid) ?? 4)));
  return widget(
    'posts',
    merge(
      {
        _skin: 'classic',
        classic_columns: String(columns),
        classic_posts_per_page: num(src.john_post_blog_limit) ?? 3,
        posts_post_type: 'post',
        ...(src.john_post_blog_queryby === 'categories'
          ? {
              posts_include_term_ids: Array.isArray(src.john_post_blog_categories)
                ? src.john_post_blog_categories
                : [],
            }
          : {}),
        ...(str(src.john_post_blog_order_by)
          ? { posts_orderby: str(src.john_post_blog_order_by) }
          : {}),
        ...(str(src.john_post_blog_order)
          ? { posts_order: str(src.john_post_blog_order).toLowerCase() }
          : {}),
        classic_show_read_more: 'yes',
        classic_read_more_text: 'Leggi di più',
        classic_title_tag: 'h3',
      },
      colorFrom(src, 'blog_title_color', 'classic_title_color', '#040c2c'),
      typography(src, 'blog_content_title', 'classic_title_typography', {
        family: 'Poppins',
        size: 20,
        weight: '600',
      }),
    ),
  );
}

/** Contact form: its Contact Form 7 shortcode, converted like any other. */
function johnContact(src: Settings): ElementorNode | null {
  const shortcode = str(src.cf_shortcode).trim();
  if (!shortcode) return null;
  // John's form look (its .form_class rules and the widget's colors), on the form it becomes.
  const color = (key: string, fallback: string) => colorOf(src, key) ?? fallback;
  const radius = num(asSettings(src.form_button_border_radius).size);
  const border = asSettings(src.form_button_border_width);
  const borderColor = colorOf(src, 'form_button_border_color');
  const field =
    'selector .contact-form .cf-field input:not([type=checkbox]):not([type=radio]),' +
    'selector .contact-form .cf-field select,selector .contact-form .cf-field textarea';
  const css = [
    `${field}{font:400 14px/24px "Poppins",sans-serif;color:${color('Input_color', '#494949')};` +
      `background:${color('input_bg_color', '#ffffff')};border:1px solid #ededed;border-radius:` +
      `${num(asSettings(src.input_border_radius).size) ?? 0}px;padding:10px 20px;min-height:44px;box-shadow:none}`,
    `selector .contact-form .cf-field textarea{height:142px;resize:none}`,
    `selector .contact-form ::placeholder{color:${color('Input_placeholder_color', '#797979')}}`,
    `selector .contact-form .cf-field input:focus,selector .contact-form .cf-field textarea:focus{border-color:#ff4a4a;outline:none}`,
    `selector .contact-form button[type=submit]{justify-self:start;font:500 16px "Montserrat",sans-serif;` +
      `background:${color('form_button_bg', '#494949')};color:${color('button_font_color', '#ffffff')};` +
      `padding:14px 38px 14px 42px;cursor:pointer;` +
      (str(src.form_button_border_border) && str(src.form_button_border_border) !== 'none'
        ? `border:${num(border.top) ?? 1}px ${str(src.form_button_border_border)} ${borderColor ?? 'currentColor'};`
        : 'border:0;') +
      `border-radius:${radius ?? 0}px}`,
    `selector .contact-form button[type=submit]:hover{` +
      `${colorOf(src, 'button_hover_color') ? `color:${colorOf(src, 'button_hover_color')};` : ''}` +
      `${colorOf(src, 'form_button_hover_bg') ? `background:${colorOf(src, 'form_button_hover_bg')};` : ''}}`,
  ]
    .filter((rule) => !rule.endsWith('{}'))
    .join('\n');
  return widget('shortcode', { shortcode, custom_css: css });
}

/**
 * A theme widget → its Fresco blocks; undefined when it is not one this file
 * knows, null when it is left out on purpose.
 */
export function themeWidget(c: Converter, el: ElementorNode): CxdBlock[] | null | undefined {
  const src = asSettings(el.settings);
  const common = (node: ElementorNode): ElementorNode => {
    // The widget's own advanced settings (margins, CSS id, animation…) on what it became.
    const own = Object.fromEntries(
      Object.entries(src).filter(([key]) => key.startsWith('_') && key !== '__globals__'),
    );
    return { ...node, settings: { ...own, ...asSettings(node.settings) } };
  };
  const wrap = (nodes: ElementorNode[]): CxdBlock[] => {
    if (nodes.length === 1) return c.element(common(nodes[0]!));
    // Several elements: one container, with the widget's advanced settings.
    const own = Object.fromEntries(
      Object.entries(src).filter(([key]) => key.startsWith('_') && key !== '__globals__'),
    );
    return c.element({
      id: id(),
      elType: 'container',
      settings: {
        content_width: 'full',
        flex_gap: { unit: 'px', size: 0, column: '0', row: '0', isLinked: true },
        padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
        // The widget's margins and paddings on every device (`_padding_tablet`…).
        ...Object.fromEntries(
          Object.entries(own)
            .filter(([key]) => /^_(margin|padding)(_|$)/.test(key))
            .map(([key, value]) => [key.slice(1), value]),
        ),
        ...(own._element_id ? { _element_id: own._element_id } : {}),
      },
      elements: nodes,
    });
  };
  switch (el.widgetType) {
    case 'john-hero': {
      const node = johnHero(src);
      if (str(src.style) && str(src.style) !== '1')
        c.note(
          'John heroes of the «Freelancer» and «Developer» presets became the parallax banner',
        );
      return c.element(node);
    }
    case 'john-section-title': {
      const nodes = johnSectionTitle(src);
      return nodes.length ? wrap(nodes) : null;
    }
    case 'john-contactinfo':
      return wrap([johnContactInfo(src)]);
    case 'john-testimonial':
      return wrap([johnTestimonial(src)]);
    case 'john-blog': {
      // Categories that no longer exist: WordPress shows an empty grid, so nothing here either.
      const categories = Array.isArray(src.john_post_blog_categories)
        ? (src.john_post_blog_categories as unknown[])
        : [];
      if (
        src.john_post_blog_queryby === 'categories' &&
        categories.length &&
        !categories.some((id) => num(id) !== null && c.ctx.term?.('category', num(id)!))
      ) {
        c.note(
          'John blog widgets of categories that no longer exist showed nothing and were left out',
        );
        return null;
      }
      return wrap([johnBlog(src)]);
    }
    case 'john-contact': {
      const node = johnContact(src);
      return node ? c.element(node) : null;
    }
    default:
      return undefined;
  }
}
