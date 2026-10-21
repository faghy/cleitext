/**
 * Widgets of Elementor Pro (and a few free ones built like them) → Fresco
 * Pro's elements (`fresco-pro/*`) and Fresco's nav menu and gallery: their
 * contents, main options and colors. Fresco Pro has to be active for the
 * Pro elements to show; their settings are kept either way.
 */
import type { CxdBlock } from '@cleitext/blocks';
import type { Converter, ElementorNode } from './elementor.js';
import { plainTitle } from './elementor.js';
import {
  asSettings,
  box,
  color,
  colorOf,
  copy,
  hasLineHeight,
  itemLink,
  link,
  list,
  num,
  size,
  str,
  yes,
  type Settings,
} from './elementor-values.js';

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'p']);
const tag = (value: unknown, fallback: string) =>
  HEADING_TAGS.has(str(value)) ? str(value) : fallback;
const text = (value: unknown) => plainTitle(str(value)).text;
/** Plain text keeping the line breaks (`<br>`) as new lines. */
const lines = (value: unknown) => text(value).replace(/[ \t]*\n[ \t]*/g, '\n');

/** Elementor's `Y-m-d H:i` → the date control's `YYYY-MM-DDTHH:mm`. */
const dateTime = (value: unknown) => {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(str(value));
  return match ? `${match[1]}T${match[2] ?? '00:00'}` : undefined;
};

/** Elementor carousels: the shared slides/arrows/autoplay settings. */
function carousel(out: Settings, src: Settings): void {
  copy(out, src, 'slides_per_view', 'slides', (v) => num(v) ?? undefined);
  // Elementor shows whole slides on phones (one unless set), never part of the next.
  out.peek = false;
  if (!out['slides@mobile']) out['slides@mobile'] = 1;
  if (src.show_arrows === '' || src.navigation === 'dots' || src.navigation === 'none')
    out.arrows = false;
  if (src.pagination === '' || src.navigation === 'arrows' || src.navigation === 'none')
    out.dots = false;
  out.autoplay = src.autoplay !== '' && src.autoplay !== 'no';
  if (num(src.autoplay_speed))
    out.autoplay_speed = Math.max(1, Math.round(num(src.autoplay_speed)! / 1000));
  if (src.loop === '' || src.infinite === 'no') out.loop = false;
  color(out, src, 'arrows_color', 'arrow_color');
  // Elementor's arrows are plain chevrons (no round box), 20px unless set.
  out.arrow_bg = 'transparent';
  out.arrow_size = size(src.arrows_size) ?? { size: 20, unit: 'px' };
  color(out, src, 'pagination_color', 'dot_active');
}

/** The query of a posts or loop widget (`prefix` is its query group). */
function query(c: Converter, out: Settings, src: Settings, prefix: string): void {
  const type = str(src[`${prefix}_post_type`]);
  if (type && type !== 'current_query' && type !== 'by_id') {
    const own = type === 'post' ? 'article' : type === 'page' ? 'page' : c.ctx.typeSlug?.(type);
    if (own) out.source = own;
  }
  if (type === 'current_query')
    c.note('posts widgets showing the current query show the latest entries');
  const ids = Array.isArray(src[`${prefix}_include_term_ids`])
    ? (src[`${prefix}_include_term_ids`] as unknown[])
    : [];
  const terms = ids
    .map((id) => (num(id) !== null ? c.ctx.term?.('', num(id)!) : undefined))
    .filter((t): t is { taxonomy: string; slug: string } => Boolean(t));
  if (terms.length) {
    out.taxonomy = terms[0]!.taxonomy;
    out.terms = terms
      .filter((t) => t.taxonomy === terms[0]!.taxonomy)
      .map((t) => t.slug)
      .join(',');
  }
  const orderBy = str(src[`${prefix}_orderby`]);
  if (orderBy === 'title' || orderBy === 'modified') out.order_by = orderBy;
  else if (orderBy === 'rand') out.order_by = 'random';
  if (str(src[`${prefix}_order`]).toLowerCase() === 'asc') out.order = 'asc';
  if (num(src[`${prefix}_offset`])) out.offset = num(src[`${prefix}_offset`]);
  const exclude = src[`${prefix}_exclude`];
  if (Array.isArray(exclude) && !exclude.includes('current_post')) out.exclude_current = false;
}

function pagination(out: Settings, src: Settings): void {
  const type = str(src.pagination_type);
  if (type === 'numbers') out.pagination = 'numbers';
  else if (type === 'prev_next') out.pagination = 'prev-next';
  else if (type === 'numbers_and_prev_next') out.pagination = 'both';
  else if (type === 'load_more_on_click' || type === 'load_more_infinite_scroll')
    out.pagination = 'more';
  if (str(src.pagination_prev_label)) out.prev_text = str(src.pagination_prev_label);
  if (str(src.pagination_next_label)) out.next_text = str(src.pagination_next_label);
  if (str(src.load_more_button_text)) out.more_text = str(src.load_more_button_text);
}

/** Children of a nested widget (mega menu, carousel), each a container with a title. */
function items(c: Converter, el: ElementorNode, titles: string[]): CxdBlock[] {
  return (el.elements ?? []).map((child, i) => {
    const converted = c.element(child);
    const first = converted[0];
    if (converted.length === 1 && first?.type === 'fresco/container') {
      first.attrs = { ...first.attrs, _title: titles[i] ?? `Item ${i + 1}`, content_width: 'full' };
      return first;
    }
    return c.node(
      'container',
      { _title: titles[i] ?? `Item ${i + 1}`, content_width: 'full' },
      converted,
    );
  });
}

const FIELD_TYPES = new Set([
  'text',
  'email',
  'textarea',
  'tel',
  'url',
  'number',
  'date',
  'time',
  'select',
  'radio',
  'checkbox',
  'acceptance',
  'password',
  'hidden',
  'html',
  'step',
]);

/**
 * A Pro widget → its Fresco blocks; undefined when it is not one this file
 * knows, null when it is left out on purpose.
 */
export function proWidget(
  c: Converter,
  el: ElementorNode,
  src: Settings,
): CxdBlock[] | null | undefined {
  const out: Settings = {};
  const type = el.widgetType ?? '';
  const media = (value: unknown) => c.media(value);
  switch (type) {
    // ---- Site and theme -----------------------------------------------------------------
    case 'nav-menu': {
      const location = c.ctx.menuLocation?.(str(src.menu));
      if (location) out.location = location;
      else c.note('nav menus whose menu is not in the export show the "primary" menu');
      out.layout =
        src.layout === 'vertical' || src.layout === 'dropdown' ? 'vertical' : 'horizontal';
      copy(out, src, 'align_items', 'align', (v) =>
        v === 'left'
          ? 'flex-start'
          : v === 'right'
            ? 'flex-end'
            : v === 'center'
              ? 'center'
              : v === 'justify'
                ? 'space-between'
                : undefined,
      );
      const dropdown = str(src.dropdown) || 'tablet';
      out.toggle = dropdown === 'none' ? 'none' : dropdown === 'mobile' ? 'mobile' : 'tablet';
      c.typography(out, src, 'menu_typography', 'typography');
      color(out, src, 'color_menu_item', 'link_color', 'color_menu_item_hover');
      color(out, src, 'color_menu_item_active', 'current_color');
      // Elementor shows the current page's item in the hover color unless it has its own.
      if (!out.current_color) color(out, src, 'color_menu_item_hover', 'current_color');
      color(out, src, 'background_color_dropdown_item', 'sub_bg');
      color(out, src, 'color_dropdown_item', 'sub_color');
      // The phone toggle as Elementor draws it: a light box, 22px icon, centered.
      color(out, src, 'toggle_color', 'toggle_color');
      if (!out.toggle_color) color(out, src, 'color_menu_item', 'toggle_color');
      out.toggle_bg = colorOf(src, 'toggle_background_color') ?? 'rgba(0,0,0,0.05)';
      out.toggle_size = size(src.toggle_size) ?? { size: 22, unit: 'px' };
      out.toggle_padding = { size: 0.25, unit: 'em' };
      out.toggle_radius = size(src.toggle_border_radius) ?? { size: 3, unit: 'px' };
      const toggleAlign = str(src.toggle_align);
      out.toggle_align = toggleAlign === 'left' || toggleAlign === 'right' ? toggleAlign : 'center';
      // Elementor's menu links: 13px 20px around a 20px line unless set otherwise.
      if (!hasLineHeight(src, 'menu_typography')) out.typography_line = { size: 20, unit: 'px' };
      const x = size(src.padding_horizontal_menu_item);
      const y = size(src.padding_vertical_menu_item);
      out.link_padding = {
        top: y?.size ?? 13,
        right: x?.size ?? 20,
        bottom: y?.size ?? 13,
        left: x?.size ?? 20,
        unit: 'px',
        linked: false,
      };
      copy(out, src, 'menu_space_between', 'spacing', (v) => size(v, c));
      // Pointer of the top links (Elementor's default: an underline in the accent color).
      const pointer = str(src.pointer) || 'underline';
      const pointers: Record<string, string> = {
        underline: 'underline',
        overline: 'overline',
        'double-line': 'double',
        framed: 'framed',
        background: 'background',
      };
      if (pointers[pointer]) {
        out.pointer = pointers[pointer];
        out.pointer_color =
          colorOf(src, 'pointer_color_menu_item_active') ??
          colorOf(src, 'pointer_color_menu_item_hover') ??
          'var(--fr-c-accent)';
        const width = size(src.pointer_width);
        if (width) out.pointer_width = width;
      }
      // Submenu indicator, in the link: its icon (Elementor's default: a caret).
      const indicator =
        c.icon(src.submenu_icon) ??
        (
          {
            classic: { set: 'solid', name: 'caret-down' },
            chevron: { set: 'solid', name: 'chevron-down' },
            angle: { set: 'solid', name: 'angle-down' },
            plus: { set: 'solid', name: 'plus' },
          } as Record<string, Settings>
        )[str(src.indicator) || 'classic'];
      if (indicator && str(src.indicator) !== 'none') out.indicator = indicator;
      return [c.node('nav-menu', out)];
    }
    case 'theme-site-logo': {
      const logo = media(src.image);
      if (logo) out.logo = logo;
      if (src.link_to === 'none') out.link = false;
      copy(out, src, 'align', 'align', (v) => str(v) || undefined);
      copy(out, src, 'width', 'width', (v) => size(v, c));
      return [c.node('fresco-pro/site-logo', out)];
    }
    case 'theme-site-title':
    case 'theme-post-title':
    case 'theme-page-title':
    case 'theme-archive-title': {
      const target =
        type === 'theme-site-title'
          ? 'site-title'
          : type === 'theme-archive-title'
            ? 'archive-title'
            : 'post-title';
      out.tag = tag(src.header_size, type === 'theme-site-title' ? 'div' : 'h1');
      if (link(src.link, c.ctx.origin) || src.link_to === 'home') out.link = true;
      copy(out, src, 'align', 'align', (v) => str(v) || undefined);
      color(out, src, 'title_color', 'title_color');
      c.typography(out, src, 'typography', 'title_typography');
      return [c.node(`fresco-pro/${target}`, out)];
    }
    case 'theme-post-excerpt':
      copy(out, src, 'align', 'align', (v) => str(v) || undefined);
      color(out, src, 'text_color', 'color');
      c.typography(out, src, 'typography', 'typography');
      return [c.node('fresco-pro/post-excerpt', out)];
    case 'theme-post-content':
      return [{ ...c.node('cleitext/entry-content', {}), attrs: { __common: true } }];
    case 'theme-post-featured-image':
      if (str(src.image_size))
        out.size = ['thumbnail', 'medium', 'large', 'full'].includes(str(src.image_size))
          ? str(src.image_size).replace('thumbnail', 'thumb')
          : 'large';
      copy(out, src, 'width', 'width', (v) => size(v, c));
      copy(out, src, 'height', 'height', (v) => size(v, c));
      return [c.node('fresco-pro/featured-image', out)];
    case 'post-info': {
      const kinds = list(src.icon_list).map((item) => str(item.type));
      out.show_date = kinds.includes('date');
      out.show_author = kinds.includes('author');
      out.show_terms = kinds.includes('terms');
      color(out, src, 'text_color', 'link_color');
      return [c.node('fresco-pro/post-info', out)];
    }
    case 'post-navigation':
      if (src.show_label === '') out.labels = false;
      if (str(src.prev_label)) out.prev_label = str(src.prev_label);
      if (str(src.next_label)) out.next_label = str(src.next_label);
      if (src.show_title === '') out.titles = false;
      if (src.show_arrow === '') out.arrows = false;
      if (yes(src.in_same_term)) {
        const taxonomy = Array.isArray(src.in_same_term_taxonomy)
          ? str(src.in_same_term_taxonomy[0])
          : str(src.in_same_term_taxonomy);
        out.in_term = taxonomy === 'post_tag' ? 'tag' : taxonomy || 'category';
      }
      color(out, src, 'label_color', 'label_color');
      color(out, src, 'text_color', 'title_color', 'hover_color');
      return [c.node('fresco-pro/post-navigation', out)];
    case 'archive-posts': {
      const skin = str(src._skin) || 'archive_classic';
      copy(out, src, `${skin}_columns`, 'columns', (v) => num(v) ?? undefined);
      if (src[`${skin}_thumbnail`] === 'none') out.show_image = false;
      if (src[`${skin}_show_excerpt`] === '') out.show_excerpt = false;
      return [c.node('fresco-pro/archive-posts', out)];
    }
    case 'breadcrumbs':
      return [c.node('fresco-pro/breadcrumbs', out)];
    case 'search-form':
    case 'search':
      out.placeholder = str(src.placeholder) || 'Search…';
      if (str(src.button_text)) out.button = str(src.button_text);
      if (type === 'search-form') {
        // Elementor's skins draw the field and its button as one box; the
        // button shows an icon unless set to text; `size` is the box height.
        out.layout = 'joined';
        out.button_type = str(src.button_type) === 'text' ? 'text' : 'icon';
        const height = size(src.size);
        if (height) out.size = height;
        const radius = size(src.border_radius);
        if (radius) out.radius = radius;
        color(out, src, 'input_background_color', 'input_bg');
        color(out, src, 'input_text_color', 'input_color');
        if (str(src.skin) === 'full_screen')
          c.note('full-screen search forms were imported as a plain search form');
      }
      color(out, src, 'button_background_color', 'button_bg');
      color(out, src, 'button_text_color', 'button_color');
      return [c.node('fresco-pro/search-form', out)];
    case 'author-box':
      if (str(src.author_bio)) out.bio = str(src.author_bio);
      return [c.node('fresco-pro/author-box', out)];
    case 'sitemap':
      return [c.node('fresco-pro/sitemap', out)];
    case 'login':
      if (src.show_labels === '') out.show_labels = false;
      if (src.show_remember_me === '') out.remember = false;
      if (src.show_lost_password === '') out.lost_password = false;
      if (str(src.button_text)) out.button_text = str(src.button_text);
      if (yes(src.custom_labels)) {
        if (str(src.user_label)) out.email_label = str(src.user_label);
        if (str(src.password_label)) out.password_label = str(src.password_label);
      }
      if (yes(src.redirect_after_login) && link(src.redirect_url, c.ctx.origin))
        out.redirect = link(src.redirect_url, c.ctx.origin)!.url as string;
      color(out, src, 'button_text_color', 'button_color');
      color(out, src, 'field_background_color', 'field_bg');
      color(out, src, 'field_border_color', 'field_border');
      return [c.node('fresco-pro/login', out)];
    case 'template': {
      const ref =
        num(src.template_id) !== null ? c.ctx.entryRef?.(num(src.template_id)!) : undefined;
      if (!ref) {
        c.note('Template widgets whose template is not in the export were left out');
        return null;
      }
      return [c.node('fresco-pro/template', { template: { $entry: ref } })];
    }

    // ---- Loops and posts -------------------------------------------------------------------
    case 'loop-grid':
    case 'loop-carousel': {
      const ref =
        num(src.template_id) !== null ? c.ctx.entryRef?.(num(src.template_id)!) : undefined;
      if (ref) out.template = { $entry: ref };
      else c.note('loops whose item template is not in the export show stand-ins');
      query(c, out, src, 'post_query');
      if (num(src.posts_per_page)) out.per_page = num(src.posts_per_page);
      if (type === 'loop-grid') {
        copy(out, src, 'columns', 'columns', (v) => num(v) ?? undefined);
        copy(out, src, 'column_gap', 'column_gap', (v) => size(v, c));
        copy(out, src, 'row_gap', 'row_gap', (v) => size(v, c));
        pagination(out, src);
      } else {
        carousel(out, src);
        copy(out, src, 'image_spacing_custom', 'gap', (v) => size(v, c), false);
      }
      return [c.node(`fresco-pro/${type}`, out)];
    }
    case 'posts':
    case 'portfolio': {
      const skin = type === 'portfolio' ? '' : `${str(src._skin) || 'classic'}_`;
      copy(out, src, `${skin}columns`, 'columns', (v) => num(v) ?? undefined);
      copy(out, src, `${skin}column_gap`, 'column_gap', (v) => size(v, c));
      copy(out, src, `${skin}row_gap`, 'row_gap', (v) => size(v, c));
      if (num(src[`${skin}posts_per_page`])) out.per_page = num(src[`${skin}posts_per_page`]);
      query(c, out, src, 'posts');
      if (type === 'posts') {
        if (src[`${skin}thumbnail`] === 'none') out.show_image = false;
        if (src[`${skin}show_title`] === '') c.note('posts without titles show them');
        out.title_tag = tag(src[`${skin}title_tag`], 'h3');
        if (src[`${skin}show_excerpt`] === '') out.show_excerpt = false;
        if (num(src[`${skin}excerpt_length`]))
          out.excerpt_words = num(src[`${skin}excerpt_length`]);
        out.read_more =
          src[`${skin}show_read_more`] === ''
            ? ''
            : str(src[`${skin}read_more_text`]) || 'Read More »';
        const meta = src[`${skin}meta_data`];
        if (Array.isArray(meta) && meta.length === 0) out.show_meta = false;
        color(out, src, `${skin}title_color`, 'title_color');
        color(out, src, `${skin}excerpt_color`, 'excerpt_color');
        color(out, src, `${skin}meta_color`, 'meta_color');
        if (skin === 'cards_') color(out, src, 'cards_card_bg_color', 'card_bg');
        c.typography(out, src, `${skin}title_typography`, 'title_typography');
        pagination(out, src);
      } else {
        if (src.show_filter_bar === '') out.filter_bar = false;
        const taxonomy = str(src.taxonomy);
        if (taxonomy) out.filter_taxonomy = taxonomy === 'post_tag' ? 'tag' : taxonomy;
      }
      return [c.node(`fresco-pro/${type}`, out)];
    }
    case 'gallery': {
      const images = list(src.gallery)
        .map((image) => media(image))
        .filter(Boolean);
      if (src.gallery_type === 'multiple') {
        for (const gallery of list(src.galleries)) {
          images.push(
            ...list(gallery.multiple_gallery)
              .map((image) => media(image))
              .filter(Boolean),
          );
        }
        c.note('galleries with several tabs became one gallery');
      }
      out.images = images;
      if (num(src.columns) !== null) out.columns = num(src.columns);
      copy(out, src, 'gap', 'gap', (v) => size(v, c), false);
      if (src.link_to === 'none') out.link_to = 'none';
      const ratio = str(src.aspect_ratio).replace(':', '/');
      if (['1/1', '3/2', '4/3', '16/9', '9/16', '21/9'].includes(ratio)) out.ratio = ratio;
      if (src.gallery_layout && src.gallery_layout !== 'grid')
        c.note('masonry and justified galleries became grids');
      return [c.node('gallery', out)];
    }

    // ---- Content ---------------------------------------------------------------------------
    case 'form': {
      // Captchas and honeypots: Fresco Pro's forms have their own spam protection.
      const ANTISPAM = new Set(['recaptcha', 'recaptcha_v3', 'honeypot', 'hcaptcha', 'turnstile']);
      const fields = list(src.form_fields).filter((f) => !ANTISPAM.has(str(f.field_type)));
      out.fields = fields.map((field, i) => {
        const fieldType = str(field.field_type) || 'text';
        const width = num(field.width) ?? 100;
        return {
          _id: str(field._id) || `f${i}`,
          type: FIELD_TYPES.has(fieldType) ? fieldType : 'text',
          label: str(field.field_label),
          field_id: str(field.custom_id) || `field_${i + 1}`,
          ...(str(field.placeholder) ? { placeholder: str(field.placeholder) } : {}),
          ...(yes(field.required) || field.required === 'true' ? { required: true } : {}),
          ...(str(field.field_options) ? { options: str(field.field_options) } : {}),
          ...(yes(field.allow_multiple) ? { multiple: true } : {}),
          width: width >= 75 ? '100' : width >= 50 ? '50' : width >= 33 ? '33' : '25',
          ...(str(field.field_value) ? { value: str(field.field_value) } : {}),
          ...(num(field.rows) ? { rows: num(field.rows) } : {}),
          ...(fieldType === 'html' ? { text: str(field.field_html) } : {}),
          ...(fieldType === 'acceptance'
            ? { text: str(field.acceptance_text) || str(field.field_label) }
            : {}),
        };
      });
      if (fields.some((f) => !FIELD_TYPES.has(str(f.field_type) || 'text'))) {
        c.note('form fields of other kinds (upload, recaptcha…) became text fields');
      }
      out.form_name = str(src.form_name) || 'New form';
      if (src.show_labels === '') out.show_labels = false;
      if (yes(src.mark_required)) out.required_mark = true;
      if (['sm', 'md', 'lg'].includes(str(src.input_size))) out.input_size = str(src.input_size);
      else if (['xs'].includes(str(src.input_size))) out.input_size = 'sm';
      else if (['xl'].includes(str(src.input_size))) out.input_size = 'lg';
      out.button_text = str(src.button_text) || 'Send';
      const buttonIcon = c.icon(src.selected_button_icon);
      if (buttonIcon) out.button_icon = buttonIcon;
      const buttonWidth = num(src.button_width) ?? 100;
      out.button_width =
        buttonWidth >= 75 ? '100' : buttonWidth >= 50 ? '50' : buttonWidth >= 33 ? '33' : '25';
      const align = str(src.button_align);
      if (align)
        out.button_align =
          align === 'start'
            ? 'start'
            : align === 'end'
              ? 'end'
              : align === 'center'
                ? 'center'
                : 'stretch';
      const actions = Array.isArray(src.submit_actions) ? src.submit_actions.map(str) : ['email'];
      if (actions.includes('email')) {
        out.act_email = true;
        if (str(src.email_to)) out.email_to = str(src.email_to);
        if (str(src.email_subject)) out.email_subject = str(src.email_subject);
        if (str(src.email_content)) out.email_message = str(src.email_content);
        if (str(src.email_reply_to))
          out.email_reply_to = str(src.email_reply_to).replace(/^\[field id="([\w-]+)"\]$/, '$1');
      }
      if (actions.includes('email2')) {
        out.act_email2 = true;
        if (str(src.email_to_2)) out.email2_to = str(src.email_to_2);
        if (str(src.email_subject_2)) out.email2_subject = str(src.email_subject_2);
        if (str(src.email_content_2)) out.email2_message = str(src.email_content_2);
      }
      if (actions.includes('redirect') && str(src.redirect_to)) {
        out.act_redirect = true;
        out.redirect_url = str(src.redirect_to);
      }
      if (actions.includes('webhook') && /^https:\/\//.test(str(src.webhooks))) {
        out.act_webhook = true;
        out.webhook_url = str(src.webhooks);
      }
      if (actions.includes('mailchimp') && str(src.mailchimp_list)) {
        out.act_mailchimp = true;
        out.mailchimp_list = str(src.mailchimp_list);
      }
      if (actions.includes('popup')) {
        out.act_popup = true;
        out.popup_action = src.popup_action === 'open' ? 'open' : 'close';
        const ref =
          num(src.popup_action_popup_id) !== null
            ? c.ctx.entryRef?.(num(src.popup_action_popup_id)!)
            : undefined;
        if (ref) out.popup_id = { $entry: ref };
      }
      const others = actions.filter(
        (a) =>
          ![
            'email',
            'email2',
            'redirect',
            'webhook',
            'mailchimp',
            'popup',
            'collect_submissions',
          ].includes(a),
      );
      if (others.length)
        c.note(`form actions "${others.join('", "')}" need setting up again in the form`);
      if (yes(src.custom_messages)) {
        if (str(src.success_message)) out.msg_success = str(src.success_message);
        if (str(src.error_message)) out.msg_error = str(src.error_message);
        if (str(src.required_field_message)) out.msg_required = str(src.required_field_message);
        if (str(src.invalid_message)) out.msg_invalid = str(src.invalid_message);
      }
      copy(out, src, 'column_gap', 'column_gap', (v) => size(v, c), false);
      copy(out, src, 'row_gap', 'row_gap', (v) => size(v, c), false);
      color(out, src, 'label_color', 'label_color');
      color(out, src, 'field_text_color', 'field_text');
      color(out, src, 'field_background_color', 'field_bg');
      color(out, src, 'field_border_color', 'field_border');
      copy(
        out,
        src,
        'field_border_radius',
        'field_radius',
        (v) => {
          const b = box(v);
          return b && b.top !== '' ? { size: b.top, unit: b.unit } : undefined;
        },
        false,
      );
      c.typography(out, src, 'field_typography', 'field_typo');
      color(out, src, 'button_text_color', 'button_color');
      // Elementor's form button: the kit's accent color unless set.
      out.button_bg = colorOf(src, 'button_background_color') ?? 'var(--fr-c-accent)';
      const bgHover = colorOf(src, 'button_background_hover_color');
      if (bgHover) out['button_bg:hover'] = bgHover;
      copy(out, src, 'button_text_padding', 'button_padding', (v) => box(v, c), false);
      c.typography(out, src, 'button_typography', 'button_typo');
      // The import's spam protection (whatever the original had: its captcha field is dropped).
      if (c.ctx.formCaptcha) {
        out.captcha = c.ctx.formCaptcha;
        c.ctx.protectedForm?.();
      }
      return [c.node('fresco-pro/form', out)];
    }
    case 'slides':
      out.items = list(src.slides).map((slide, i) => {
        const bg = media(slide.background_image);
        const overlay = yes(slide.background_overlay)
          ? (colorOf(slide, 'background_overlay_color') ?? 'rgba(0,0,0,0.5)')
          : undefined;
        return {
          _id: str(slide._id) || `s${i}`,
          heading: text(slide.heading),
          description: text(slide.description),
          button_text: str(slide.button_text),
          ...(link(slide.link, c.ctx.origin) ? { link: link(slide.link, c.ctx.origin) } : {}),
          ...(slide.link_click === 'slide' && link(slide.link, c.ctx.origin)
            ? { whole_link: true }
            : {}),
          ...(bg ? { bg_image: bg } : {}),
          ...(colorOf(slide, 'background_color')
            ? { bg_color: colorOf(slide, 'background_color') }
            : {}),
          ...(overlay ? { overlay } : {}),
          ...(yes(slide.background_ken_burns) ? { ken_burns: true } : {}),
        };
      });
      copy(out, src, 'slides_height', 'height', (v) => size(v, c));
      copy(
        out,
        src,
        'slides_horizontal_position',
        'h_position',
        (v) =>
          v === 'left'
            ? 'flex-start'
            : v === 'right'
              ? 'flex-end'
              : v === 'center'
                ? 'center'
                : undefined,
        false,
      );
      copy(
        out,
        src,
        'slides_vertical_position',
        'v_position',
        (v) =>
          v === 'top'
            ? 'flex-start'
            : v === 'bottom'
              ? 'flex-end'
              : v === 'middle'
                ? 'center'
                : undefined,
        false,
      );
      copy(out, src, 'slides_text_align', 'text_align', (v) => str(v) || undefined, false);
      copy(out, src, 'content_max_width', 'content_width', (v) => size(v, c), false);
      carousel(out, src);
      color(out, src, 'heading_color', 'heading_color');
      c.typography(out, src, 'heading_typography', 'heading_typography');
      color(out, src, 'description_color', 'desc_color');
      c.typography(out, src, 'description_typography', 'desc_typography');
      color(out, src, 'button_text_color', 'button_color', 'button_hover_text_color');
      color(out, src, 'button_background_color', 'button_bg', 'button_hover_background_color');
      color(out, src, 'button_border_color', 'button_border');
      // One slide: Elementor shows no arrows nor dots.
      if ((out.items as unknown[]).length < 2) {
        out.arrows = false;
        out.dots = false;
      }
      return [c.node('fresco-pro/slides', out)];
    case 'call-to-action': {
      out.skin = src.skin === 'cover' ? 'cover' : 'classic';
      const image = media(src.bg_image);
      if (image) out.image = image;
      const position = str(src.layout);
      if (position === 'left' || position === 'right') out.image_position = position;
      out.title = text(src.title);
      out.description = text(src.description);
      // A graphic above the title (Elementor's "graphic element": image).
      if (src.graphic_element === 'image') {
        const graphic = media(src.graphic_image);
        if (graphic) out.graphic = graphic;
        copy(out, src, 'graphic_image_width', 'graphic_width', (v) => size(v, c), false);
      } else if (src.graphic_element === 'icon') {
        c.note('icons above call-to-action titles were left out');
      }
      out.button_text = str(src.button);
      if (link(src.link, c.ctx.origin)) out.button_link = link(src.link, c.ctx.origin);
      if (src.link_click === 'box') out.whole_link = true;
      if (str(src.ribbon_title)) {
        out.ribbon = true;
        out.ribbon_title = str(src.ribbon_title);
      }
      const hover = str(src.transformation);
      out.hover = ['zoom-in', 'zoom-out', 'move-left', 'move-up'].includes(hover) ? hover : 'none';
      copy(out, src, 'min-height', 'min_height', (v) => size(v, c));
      copy(out, src, 'min_height', 'min_height', (v) => size(v, c));
      // Elementor's classic skin: the image covers a box 200px high unless set otherwise.
      if (out.skin === 'classic' && image) {
        copy(out, src, 'image_min_height', 'image_height', (v) => size(v, c));
        if (!out.image_height) out.image_height = { size: 200, unit: 'px' };
      }
      color(out, src, 'content_bg_color', 'content_bg');
      color(out, src, 'overlay_color', 'overlay', 'overlay_color_hover');
      color(out, src, 'title_color', 'title_color');
      color(out, src, 'description_color', 'desc_color');
      c.typography(out, src, 'title_typography', 'title_typography');
      c.typography(out, src, 'description_typography', 'desc_typography');
      color(out, src, 'button_text_color', 'button_color', 'button_hover_text_color');
      color(out, src, 'button_background_color', 'button_bg', 'button_hover_background_color');
      c.typography(out, src, 'button_typography', 'button_typo');
      copy(out, src, 'padding', 'content_padding', (v) => box(v, c), false);
      copy(out, src, 'alignment', 'align', (v) => str(v) || undefined);
      return [c.node('fresco-pro/call-to-action', out)];
    }
    case 'flip-box': {
      const front = c.icon(src.selected_icon);
      if (src.graphic_element === 'image') {
        const image = media(src.image);
        if (image) out.front_image = image;
      } else if (src.graphic_element !== 'none' && front) out.front_icon = front;
      out.front_title = text(src.title_text_a);
      out.front_text = text(src.description_text_a);
      out.back_title = text(src.title_text_b);
      out.back_text = text(src.description_text_b);
      out.button_text = str(src.button_text);
      if (link(src.link, c.ctx.origin)) out.button_link = link(src.link, c.ctx.origin);
      const effect = str(src.flip_effect) || 'flip';
      out.effect = ['flip', 'slide', 'push', 'zoom-in', 'zoom-out', 'fade'].includes(effect)
        ? effect
        : 'flip';
      if (str(src.flip_direction)) out.direction = str(src.flip_direction);
      if (yes(src.flip_3d)) out.flip_3d = true;
      copy(out, src, 'height', 'height', (v) => size(v, c));
      copy(out, src, 'border_radius', 'radius', (v) => size(v, c), false);
      for (const [side, to] of [
        ['a', 'front'],
        ['b', 'back'],
      ] as const) {
        const bgType = str(src[`background_${side}_background`]);
        if (bgType === 'classic' || bgType === 'gradient') {
          out[`${to}_bg_type`] = bgType;
          color(out, src, `background_${side}_color`, `${to}_bg_color`);
          const bgImage = media(src[`background_${side}_image`]);
          if (bgImage) out[`${to}_bg_image`] = bgImage;
          if (bgType === 'gradient')
            color(out, src, `background_${side}_color_b`, `${to}_bg_color_b`);
        }
        color(out, src, `title_color_${side}`, `${to}_color`);
      }
      return [c.node('fresco-pro/flip-box', out)];
    }
    case 'price-table': {
      // Elementor's look: bands, centered features with dividers, its default fonts.
      out.skin = 'classic';
      // Line breaks (`<br>`) stay as new lines.
      out.heading = lines(src.heading);
      out.sub_heading = lines(src.sub_heading);
      out.tag = tag(src.heading_tag, 'h3');
      const symbols: Record<string, string> = {
        dollar: '$',
        euro: '€',
        baht: '฿',
        franc: '₣',
        guilder: 'ƒ',
        krona: 'kr',
        lira: '₤',
        peseta: '₧',
        peso: '₱',
        pound: '£',
        real: 'R$',
        ruble: '₽',
        rupee: '₨',
        indian_rupee: '₹',
        shekel: '₪',
        yen: '¥',
        won: '₩',
      };
      out.currency =
        src.currency_symbol === 'custom'
          ? str(src.currency_symbol_custom)
          : src.currency_symbol === ''
            ? ''
            : (symbols[str(src.currency_symbol) || 'dollar'] ?? '$');
      out.price = str(src.price);
      if (src.currency_position === 'after') out.currency_position = 'after';
      if (yes(src.sale)) {
        out.sale = true;
        out.original_price = str(src.original_price);
      }
      out.period = lines(src.period);
      out.features = list(src.features_list).map((item, i) => ({
        _id: str(item._id) || `f${i}`,
        text: text(item.item_text),
        included: true,
        // Elementor's default icon: a check in a circle.
        icon: c.icon(item.selected_item_icon) ?? { set: 'regular', name: 'circle-check' },
      }));
      out.button_text = str(src.button_text);
      if (link(src.link, c.ctx.origin)) out.button_link = link(src.link, c.ctx.origin);
      out.footer_info = text(src.footer_additional_info).trim();
      if (yes(src.show_ribbon) && str(src.ribbon_title)) {
        out.ribbon = true;
        out.ribbon_title = str(src.ribbon_title);
      }
      color(out, src, 'header_bg_color', 'header_bg');
      color(out, src, 'heading_color', 'heading_color');
      color(out, src, 'sub_heading_color', 'sub_color');
      color(out, src, 'pricing_element_bg_color', 'pricing_bg');
      color(out, src, 'price_color', 'price_color');
      color(out, src, 'currency_color', 'currency_color');
      copy(out, src, 'currency_size', 'currency_size', (v) => {
        const n = num(asSettings(v).size);
        return n === null ? undefined : { size: n, unit: '' };
      });
      color(out, src, 'period_color', 'period_color');
      color(out, src, 'features_list_bg_color', 'features_bg');
      color(out, src, 'features_list_color', 'features_color');
      color(out, src, 'item_icon_color', 'icon_color');
      color(out, src, 'divider_color', 'divider_color');
      color(out, src, 'footer_bg_color', 'footer_bg');
      color(out, src, 'ribbon_bg_color', 'ribbon_bg');
      // Elementor's default fonts of each part (the kit's), unless set on the widget.
      for (const [from, to, global] of [
        ['heading_typography', 'heading_typography', 'primary'],
        ['sub_heading_typography', 'sub_typography', 'secondary'],
        ['price_typography', 'price_typo', 'primary'],
        ['period_typography', 'period_typography', 'secondary'],
        ['features_list_typography', 'features_typo', 'text'],
      ] as const) {
        c.typography(out, src, from, to);
        if (src[`${from}_typography`] !== 'custom' && !out[`${to}_global`])
          out[`${to}_global`] = global;
      }
      return [c.node('fresco-pro/price-table', out)];
    }
    case 'price-list':
      out.items = list(src.price_list).map((item, i) => ({
        _id: str(item._id) || `p${i}`,
        title: str(item.title),
        price: str(item.price),
        description: text(item.item_description),
        ...(media(item.image) ? { image: media(item.image) } : {}),
        ...(itemLink(item, c.ctx.entryRef, c.ctx.origin)
          ? { link: itemLink(item, c.ctx.entryRef, c.ctx.origin) }
          : {}),
      }));
      if (['dotted', 'dashed', 'solid', 'double'].includes(str(src.separator_style))) {
        out.separator = str(src.separator_style) === 'double' ? 'solid' : str(src.separator_style);
      }
      copy(out, src, 'row_gap', 'item_gap', (v) => size(v, c), false);
      return [c.node('fresco-pro/price-list', out)];
    case 'countdown': {
      out.mode = src.countdown_type === 'evergreen' ? 'evergreen' : 'date';
      const due = dateTime(src.due_date);
      if (due) out.due = due;
      if (num(src.evergreen_counter_hours) !== null) out.hours = num(src.evergreen_counter_hours);
      if (num(src.evergreen_counter_minutes) !== null)
        out.minutes = num(src.evergreen_counter_minutes);
      for (const unit of ['days', 'hours', 'minutes', 'seconds']) {
        if (src[`show_${unit}`] === '') out[`show_${unit}`] = false;
        if (yes(src.custom_labels) && str(src[`label_${unit}`]))
          out[`label_${unit}`] = str(src[`label_${unit}`]);
      }
      if (src.show_labels === '') out.labels = false;
      const actions = Array.isArray(src.expire_actions) ? src.expire_actions.map(str) : [];
      if (actions.includes('redirect')) {
        out.expire = 'redirect';
        out.expire_url = str(asSettings(src.expire_redirect_url).url);
      } else if (actions.includes('message')) {
        out.expire = 'message';
        out.expire_message = text(src.message_after_expire);
      } else if (actions.includes('hide')) out.expire = 'hide';
      else out.expire = 'none';
      color(out, src, 'box_background_color', 'box_bg');
      copy(out, src, 'box_spacing', 'box_gap', (v) => size(v, c), false);
      return [c.node('fresco-pro/countdown', out)];
    }
    case 'animated-headline': {
      out.kind = src.headline_style === 'rotate' ? 'rotate' : 'highlight';
      const shapes: Record<string, string> = {
        underline_zigzag: 'underline-zigzag',
        double_underline: 'double-underline',
      };
      const shape = str(src.marker) || 'circle';
      out.shape = shapes[shape] ?? shape;
      const animation = str(src.animation_type) || 'typing';
      out.animation = animation.replace('_', '-');
      out.before = str(src.before_text);
      if (out.kind === 'highlight') out.highlighted = str(src.highlighted_text);
      else out.rotating = str(src.rotating_text);
      out.after = str(src.after_text);
      if (src.loop === '') out.loop = false;
      const duration =
        out.kind === 'rotate'
          ? num(src.rotate_iteration_delay)
          : num(src.highlight_animation_duration);
      if (duration) out.duration = duration;
      if (link(src.link, c.ctx.origin)) out.link = link(src.link, c.ctx.origin);
      out.tag = tag(src.tag, 'h3');
      copy(out, src, 'alignment', 'align', (v) => str(v) || undefined);
      color(out, src, 'title_color', 'text_color');
      c.typography(out, src, 'title_typography', 'text_typography');
      color(out, src, 'words_color', 'anim_color');
      c.typography(out, src, 'words_typography', 'anim_typography');
      color(out, src, 'marker_color', 'shape_color');
      return [c.node('fresco-pro/animated-headline', out)];
    }
    case 'blockquote':
      out.skin = ['border', 'quotation', 'boxed', 'clean'].includes(str(src.blockquote_skin))
        ? str(src.blockquote_skin)
        : 'border';
      out.quote = text(src.blockquote_content);
      out.author = str(src.author_name);
      if (yes(src.tweet_button)) {
        out.share = true;
        if (str(src.tweet_button_label)) out.share_label = str(src.tweet_button_label);
      }
      copy(out, src, 'alignment', 'align', (v) => str(v) || undefined);
      color(out, src, 'border_color', 'accent');
      color(out, src, 'box_background_color', 'box_bg');
      color(out, src, 'content_text_color', 'quote_color');
      return [c.node('fresco-pro/blockquote', out)];
    case 'table-of-contents': {
      out.title = str(src.title);
      const tags = Array.isArray(src.headings_by_tags)
        ? src.headings_by_tags.map(str)
        : ['h2', 'h3', 'h4', 'h5', 'h6'];
      out.headings = tags.join(',');
      if (str(src.container)) out.container = str(src.container);
      const exclude = Array.isArray(src.exclude_headings_by_selector)
        ? src.exclude_headings_by_selector.map(str).join(',')
        : str(src.exclude_headings_by_selector);
      if (exclude) out.exclude = exclude;
      out.marker = src.marker_view === 'bullets' ? 'bullets' : 'numbers';
      if (src.hierarchical_view === '') out.hierarchical = false;
      if (yes(src.minimize_box)) out.collapsible = true;
      color(out, src, 'background_color', 'box_bg');
      color(out, src, 'item_text_color_normal', 'link_color');
      color(out, src, 'item_text_color_active', 'active_color');
      return [c.node('fresco-pro/table-of-contents', out)];
    }
    case 'share-buttons':
      out.networks = list(src.share_buttons).map((item, i) => {
        const network = str(item.button) === 'twitter' ? 'x' : str(item.button);
        return {
          _id: str(item._id) || `n${i}`,
          network,
          ...(str(item.text) ? { label: str(item.text) } : {}),
        };
      });
      out.view = ['icon-text', 'icon', 'text'].includes(str(src.view))
        ? str(src.view)
        : 'icon-text';
      out.skin =
        src.skin === 'framed' || src.skin === 'boxed'
          ? 'outline'
          : src.skin === 'minimal'
            ? 'minimal'
            : src.skin === 'flat'
              ? 'flat'
              : 'solid';
      out.shape =
        src.shape === 'circle' ? 'circle' : src.shape === 'rounded' ? 'rounded' : 'square';
      copy(out, src, 'alignment', 'align', (v) =>
        v === 'left'
          ? 'flex-start'
          : v === 'right'
            ? 'flex-end'
            : v === 'center'
              ? 'center'
              : undefined,
      );
      if (src.color_source === 'custom') {
        out.official = false;
        color(out, src, 'primary_color', 'color');
      }
      copy(out, src, 'column_gap', 'gap', (v) => size(v, c), false);
      return [c.node('fresco-pro/share-buttons', out)];
    case 'code-highlight':
      out.language = str(src.language) || 'javascript';
      out.code = str(src.code);
      if (src.line_numbers === '') out.line_numbers = false;
      if (src.copy_to_clipboard === '') out.copy = false;
      if (str(src.highlight_lines)) out.highlight_lines = str(src.highlight_lines);
      if (str(src.word_wrap)) out.word_wrap = true;
      out.theme =
        ['dark', 'okaidia', 'tomorrow', 'twilight', 'solarizedlight'].includes(str(src.theme)) &&
        src.theme !== 'solarizedlight'
          ? 'dark'
          : 'light';
      copy(out, src, 'height', 'max_height', (v) => size(v, c), false);
      return [c.node('fresco-pro/code-highlight', out)];
    case 'hotspot': {
      const image = media(src.image);
      if (image) out.image = image;
      out.spots = list(src.hotspot).map((spot, i) => {
        const x = num(asSettings(spot.hotspot_offset_x).size) ?? 50;
        const y = num(asSettings(spot.hotspot_offset_y).size) ?? 50;
        return {
          _id: str(spot._id) || `h${i}`,
          label: str(spot.hotspot_label),
          ...(c.icon(spot.hotspot_icon) ? { icon: c.icon(spot.hotspot_icon) } : {}),
          x: spot.hotspot_horizontal === 'right' ? 100 - x : x,
          y: spot.hotspot_vertical === 'bottom' ? 100 - y : y,
          tooltip: text(spot.hotspot_tooltip_content),
          ...(link(spot.hotspot_link, c.ctx.origin)
            ? { link: link(spot.hotspot_link, c.ctx.origin) }
            : {}),
        };
      });
      out.trigger =
        src.tooltip_trigger === 'mouseenter'
          ? 'hover'
          : src.tooltip_trigger === 'none'
            ? 'always'
            : 'click';
      if (['top', 'bottom', 'left', 'right'].includes(str(src.tooltip_position)))
        out.position = str(src.tooltip_position);
      if (src.hotspot_animation === 'none') out.pulse = false;
      color(out, src, 'style_hotspot_color', 'spot_color');
      color(out, src, 'style_hotspot_box_color', 'spot_bg');
      color(out, src, 'style_tooltip_color', 'tip_bg');
      color(out, src, 'style_tooltip_text_color', 'tip_color');
      return [c.node('fresco-pro/hotspot', out)];
    }
    case 'media-carousel': {
      const images = list(src.slides)
        .filter((slide) => str(slide.type || 'image') === 'image')
        .map((slide) => media(slide.image))
        .filter(Boolean);
      if (list(src.slides).some((slide) => slide.type === 'video'))
        c.note('videos in media carousels were left out');
      out.images = images;
      carousel(out, src);
      if (src.image_link_to_type === '' || src.open_lightbox === 'no') out.lightbox = false;
      if (src.skin === 'slideshow' || src.skin === 'coverflow')
        c.note('media carousels of the slideshow or coverflow kind became carousels');
      return [c.node('fresco-pro/media-carousel', out)];
    }
    case 'testimonial-carousel':
    case 'reviews':
      out.items = list(src.slides).map((slide, i) => ({
        _id: str(slide._id) || `t${i}`,
        content: text(slide.content),
        ...(media(slide.image) ? { image: media(slide.image) } : {}),
        name: str(slide.name),
        title: str(slide.title),
        ...(type === 'reviews' && num(slide.rating) !== null ? { rating: num(slide.rating) } : {}),
        ...(type === 'reviews' && link(slide.link, c.ctx.origin)
          ? { link: link(slide.link, c.ctx.origin) }
          : {}),
      }));
      carousel(out, src);
      if (type === 'testimonial-carousel') {
        // Elementor's layouts: the photo beside the text, above it, or inline with the name below.
        const layout = str(src.layout) || 'image_inline';
        out.layout =
          layout === 'image_left'
            ? 'left'
            : layout === 'image_right'
              ? 'right'
              : layout === 'image_above'
                ? 'top'
                : 'bottom';
        copy(out, src, 'image_size', 'photo_size', (v) => size(v, c));
        copy(out, src, 'image_border_radius', 'photo_radius', (v) => size(v, c), false);
        copy(out, src, 'content_gap', 'photo_gap', (v) => size(v, c));
        // No card of its own: Elementor's testimonials sit on the page.
        if (!colorOf(src, 'background_color')) out.card_bg = 'transparent';
        out.card_padding = { top: 0, right: 0, bottom: 0, left: 0, unit: 'px', linked: true };
        c.typography(out, src, 'content_typography', 'content_typography');
        c.typography(out, src, 'name_typography', 'name_typography');
        color(out, src, 'title_color', 'role_color');
        c.typography(out, src, 'title_typography', 'role_typography');
      }
      copy(out, src, 'alignment', 'align', (v) => str(v) || undefined, false);
      color(out, src, 'background_color', 'card_bg');
      color(out, src, 'content_color', 'content_color');
      color(out, src, 'name_color', 'name_color');
      return [c.node(`fresco-pro/${type}`, out)];
    case 'lottie': {
      if (src.source === 'external_url') out.src = str(asSettings(src.source_external_url).url);
      else {
        const file = media(src.source_json);
        if (file) out.file = file;
      }
      const trigger = str(src.trigger);
      out.trigger =
        trigger === 'on_hover'
          ? 'hover'
          : trigger === 'none'
            ? 'load'
            : trigger === 'bind_to_scroll'
              ? 'scroll'
              : 'view';
      if (yes(src.loop)) out.loop = true;
      if (yes(src.reverse_animation)) out.reverse = true;
      const speed = num(asSettings(src.play_speed).size);
      if (speed) out.speed = speed;
      if (src.link_to === 'custom' && link(src.custom_link, c.ctx.origin))
        out.link = link(src.custom_link, c.ctx.origin);
      copy(out, src, 'align', 'align', (v) => str(v) || undefined);
      copy(out, src, 'width', 'width', (v) => size(v, c));
      return [c.node('fresco-pro/lottie', out)];
    }
    case 'video-playlist':
      out.title = str(src.playlist_title);
      out.videos = list(src.tabs).map((video, i) => {
        const kind = str(video.type) || 'youtube';
        const file = kind === 'hosted' ? media(video.hosted_url) : undefined;
        return {
          _id: str(video._id) || `v${i}`,
          title: str(video.title),
          ...(kind === 'youtube' || kind === 'vimeo' ? { url: str(video[`${kind}_url`]) } : {}),
          ...(file ? { video: file } : {}),
          ...(str(video.duration) ? { duration: str(video.duration) } : {}),
          ...(media(video.thumbnail) ? { thumbnail: media(video.thumbnail) } : {}),
        };
      });
      if (yes(src.autoplay_next)) out.autoplay_next = true;
      return [c.node('fresco-pro/video-playlist', out)];
    case 'facebook-page':
    case 'facebook-embed':
    case 'facebook-button':
    case 'facebook-comments':
      out.kind =
        type === 'facebook-page'
          ? 'page'
          : type === 'facebook-button'
            ? 'like'
            : type === 'facebook-comments'
              ? 'comments'
              : src.type === 'video'
                ? 'video'
                : 'post';
      out.url = str(src.url) || str(src.post_url) || str(src.video_url);
      if (num(asSettings(src.height).size)) out.height = num(asSettings(src.height).size);
      return [c.node('fresco-pro/facebook', out)];
    case 'paypal-button':
      out.account = str(src.email);
      out.item = str(src.product_name);
      out.sku = str(src.product_sku);
      if (num(src.product_price) !== null) out.price = num(src.product_price);
      if (str(src.currency)) out.currency = str(src.currency);
      out.kind =
        src.type === 'donation' ? 'donate' : src.type === 'subscription' ? 'subscribe' : 'buy';
      if (str(src.text)) out.text = str(src.text);
      return [c.node('fresco-pro/paypal-button', out)];
    case 'progress-tracker':
      out.kind = src.type === 'circular' ? 'circle' : 'bar';
      if (src.relative_to === 'selector') {
        out.target = 'content';
        out.selector = str(src.selector);
      } else if (src.relative_to === 'post_content') out.target = 'content';
      if (yes(src.percentage)) out.percent = true;
      color(out, src, 'progress_color', 'fill');
      color(out, src, 'tracker_background_color', 'track');
      return [c.node('fresco-pro/progress-tracker', out)];
    case 'taxonomy-filter':
      if (str(src.taxonomy))
        out.filter_taxonomy = str(src.taxonomy) === 'post_tag' ? 'tag' : str(src.taxonomy);
      return [c.node('fresco-pro/taxonomy-filter', out)];

    // ---- Nested widgets ------------------------------------------------------------------------
    case 'mega-menu': {
      const titles = list(src.menu_items).map((item) => str(item.item_title));
      const children = items(c, el, titles);
      return [c.node('fresco-pro/mega-menu', out, children)];
    }
    case 'nested-carousel': {
      const titles = list(src.carousel_items).map((item) => str(item.slide_title));
      carousel(out, src);
      return [c.node('fresco-pro/nested-carousel', out, items(c, el, titles))];
    }
    case 'off-canvas': {
      const children = c.children(el);
      return [c.node('fresco-pro/off-canvas', out, children)];
    }
    default:
      if (/^(contact-buttons|floating-bars)-var-\d+$/.test(type)) {
        c.note('floating contact buttons need setting up again (Floating buttons element)');
        return null;
      }
      if (/^(woocommerce|wc)-/.test(type)) {
        c.unknown(type);
        return null;
      }
      return undefined;
  }
}
