/**
 * Widgets of Elementor themes' companion plugins (John's john-core):
 * rewritten as Elementor's own widgets, then converted, with the theme's look.
 */
import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '../src/index.js';
import { elementorToFresco, type ElementorContext } from '../src/elementor.js';

const run = (widgetType: string, settings: Record<string, unknown>) => {
  const warnings: string[] = [];
  const context: ElementorContext = {
    mediaRef: (id) => `att:${id}`,
    entryRef: (id) => `post:${id}`,
    term: (_taxonomy, id) => (id === 7 ? { taxonomy: 'category', slug: 'articoli' } : undefined),
    warn: (m) => warnings.push(m),
  };
  const blocks = elementorToFresco(
    JSON.stringify([{ id: 'x', elType: 'widget', widgetType, settings, elements: [] }]),
    context,
  )!;
  return { blocks, warnings };
};

const all = (blocks: CxdBlock[]): CxdBlock[] =>
  blocks.flatMap((b) => [b, ...all(b.children ?? [])]);
const find = (blocks: CxdBlock[], type: string) => all(blocks).filter((b) => b.type === type);

describe('John (john-core) widgets', () => {
  it('turns the hero into a full-height section with its picture, texts and social icons', () => {
    const { blocks, warnings } = run('john-hero', {
      banner_subtitle: 'CONTATTAMI',
      banner_title: 'Dott.ssa Anna Rossi',
      banner_discription: 'La medicina',
      banner_title_color: '#FFFFFF',
      banner_title_spacing: { unit: 'px', size: 20 },
      banner_content_color: '#6FA1E1',
      banner_content_typography: 'custom',
      banner_content_letter_spacing: { unit: 'px', size: 6 },
      banner_parallax_bg_background: 'classic',
      banner_parallax_bg_image: { id: 5, url: 'https://example.com/banner.jpg' },
      banner_parallax_bg_image_mobile: { id: 6, url: 'https://example.com/banner-m.jpg' },
      banner_parallax_bg_position: 'center center',
      social_icons: [
        {
          _id: 'a',
          social_icon: { value: 'fab fa-facebook-f', library: 'fa-brands' },
          social_link: { url: 'https://facebook.com/x', is_external: true },
        },
      ],
    });
    expect(warnings.join(' ')).not.toContain('no Fresco counterpart');
    const section = all(blocks).find((b) => b.attrs.min_height)!;
    expect(section.attrs).toMatchObject({
      min_height: { size: 100, unit: 'vh' },
      background_type: 'classic',
      background_image: { id: 'att:5', url: 'https://example.com/banner.jpg' },
      'background_image@mobile': { id: 'att:6' },
    });
    const headings = find(blocks, 'fresco/heading');
    expect(headings.map((h) => [h.attrs.title, h.attrs.tag])).toEqual([
      ['CONTATTAMI', 'h5'],
      ['Dott.ssa Anna Rossi', 'h2'],
    ]);
    expect(headings[1]!.attrs).toMatchObject({
      title_color: '#FFFFFF',
      title_typography_size: { size: 55, unit: 'px' },
      _margin: { bottom: 20 },
    });
    const text = find(blocks, 'fresco/text')[0]!;
    expect(text.attrs).toMatchObject({
      color: '#6FA1E1',
      typography_letter: { size: 6, unit: 'px' },
    });
    const icons = find(blocks, 'fresco/social-icons')[0]!;
    expect(icons.attrs.items).toEqual([
      expect.objectContaining({ icon: { set: 'brands', name: 'facebook-f' } }),
    ]);
    expect(icons.attrs.shape).toBe('circle');
  });

  it('writes the section title parts in their order, leaving out the disabled ones', () => {
    const { blocks } = run('john-section-title', {
      section_subtitle: 'Hidden',
      section_title: 'LA MIA MISSIONE',
      section_text: 'Ricevo su appuntamento\n',
      section_ordering_data: [
        { section_order_enable: '', section_order_id: 's_subtitle' },
        { section_order_id: 's_content' },
        { section_order_id: 's_title' },
        { section_order_id: 's_border' },
      ],
      section_alignment: 'left',
      section_title_typography: 'custom',
      section_title_font_size: { unit: 'px', size: 38 },
      section_title_color: '#040C2C',
    });
    const parts = all(blocks).filter((b) =>
      ['fresco/heading', 'fresco/text', 'fresco/divider'].includes(b.type),
    );
    expect(parts.map((b) => b.type)).toEqual(['fresco/text', 'fresco/heading']);
    expect(parts[1]!.attrs).toMatchObject({
      title: 'LA MIA MISSIONE',
      align: 'left',
      title_color: '#040C2C',
      title_typography_size: { size: 38, unit: 'px' },
    });
  });

  it('keeps the widget’s paddings per device on the container it becomes', () => {
    const { blocks } = run('john-section-title', {
      section_title: 'CONSIGLI E ARTICOLI',
      section_text: 'Testo',
      _padding: { unit: 'px', top: '0', right: '250', bottom: '0', left: '250', isLinked: false },
      _padding_tablet: {
        unit: 'px',
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
        isLinked: false,
      },
    });
    const box = all(blocks).find(
      (b) => (b.attrs._padding as { right?: number } | undefined)?.right === 250,
    )!;
    expect(box.attrs['_padding@tablet']).toMatchObject({ right: 0, left: 0 });
  });

  it('turns contact info into an icon list, with Themify icons as Font Awesome ones', () => {
    const { blocks } = run('john-contactinfo', {
      contact_info_item: [
        {
          _id: 'a',
          contact_icon: { value: 'ti ti-location-pin', library: 'john_core_themify_icons' },
          contact_items_title: '',
          contact_items_text: 'Ferrara',
        },
        {
          _id: 'b',
          contact_icon: { value: 'ti ti-email' },
          contact_items_title: 'Email',
          contact_items_text: 'a@example.com',
          contact_link: { url: 'mailto:a@example.com' },
        },
      ],
      info_icon_color: '#494949',
      info_icon_size: { unit: 'px', size: 23 },
    });
    const list = find(blocks, 'fresco/icon-list')[0]!;
    expect(list.attrs.items).toEqual([
      expect.objectContaining({ text: 'Ferrara', icon: { set: 'solid', name: 'location-dot' } }),
      expect.objectContaining({
        text: '<strong>Email</strong><br>a@example.com',
        icon: { set: 'regular', name: 'envelope' },
        link: expect.objectContaining({ url: 'mailto:a@example.com' }),
      }),
    ]);
    expect(list.attrs).toMatchObject({
      icon_color: '#494949',
      icon_size: { size: 23, unit: 'px' },
    });
  });

  it('turns testimonials into Fresco Pro’s carousel with the parts shown', () => {
    const { blocks } = run('john-testimonial', {
      testimonial_ordering_data: [
        { testimonial_order_id: 'slider_image', testimonial_order_enable: '' },
        { testimonial_order_id: 'author_image', testimonial_order_enable: '' },
        { testimonial_order_id: 'slider_title' },
        { testimonial_order_id: 'slider_text' },
      ],
      testimonial_slider_item: [
        {
          _id: 't1',
          testimonial_slider_title: 'Sara',
          testimonial_slider_text: 'Grazie!\n',
          testimonial_slider_author_name: 'S.',
        },
      ],
      testimonial_content_color: '#FFFFFF',
    });
    const carousel = find(blocks, 'fresco-pro/testimonial-carousel')[0]!;
    expect(carousel.attrs.items).toEqual([
      expect.objectContaining({ content: 'Grazie!', name: 'Sara', title: '' }),
    ]);
    expect(carousel.attrs).toMatchObject({
      slides: 1,
      layout: 'top',
      arrows: false,
      content_color: '#FFFFFF',
    });
  });

  it('turns the blog into Fresco Pro’s posts grid with its categories and order', () => {
    const { blocks } = run('john-blog', {
      john_post_blog_queryby: 'categories',
      john_post_blog_categories: ['7'],
      john_post_blog_order: 'ASC',
      john_post_blog_limit: 3,
    });
    const posts = find(blocks, 'fresco-pro/posts')[0]!;
    expect(posts.attrs).toMatchObject({
      columns: 3,
      per_page: 3,
      source: 'article',
      taxonomy: 'category',
      terms: 'articoli',
      order: 'asc',
    });
  });

  it('leaves out a blog of categories that no longer exist, as WordPress shows nothing', () => {
    const { blocks, warnings } = run('john-blog', {
      john_post_blog_queryby: 'categories',
      john_post_blog_categories: ['99'],
    });
    expect(find(blocks, 'fresco-pro/posts')).toEqual([]);
    expect(warnings.join(' ')).toContain('categories that no longer exist');
  });

  it('turns the contact form into its Contact Form 7 shortcode', () => {
    const { blocks } = run('john-contact', {
      cf_shortcode: '[contact-form-7 id="2077" title="Contact form 1"]',
      form_button_bg: '#6CADFF',
    });
    expect(JSON.stringify(blocks)).toContain('"tag":"contact-form-7"');
    // John's form look and the widget's button color, as the block's own CSS.
    const css = JSON.stringify(blocks);
    expect(css).toContain('button[type=submit]{justify-self:start');
    expect(css).toContain('background:#6CADFF');
  });
});

describe('captions and theme icons', () => {
  it('writes the media library caption into images that show the attachment’s', () => {
    const blocks = elementorToFresco(
      JSON.stringify([
        {
          id: 'i',
          elType: 'widget',
          widgetType: 'image',
          settings: {
            image: { id: 44, url: 'https://example.com/ferrara.jpg' },
            caption_source: 'attachment',
          },
          elements: [],
        },
      ]),
      {
        mediaRef: (id) => `att:${id}`,
        imageInfo: (id) => (id === 44 ? { width: 0, height: 0, caption: 'Ferrara' } : undefined),
        warn: () => {},
      },
    )!;
    expect(find(blocks, 'fresco/image')[0]!.attrs).toMatchObject({
      caption_source: 'custom',
      caption: 'Ferrara',
    });
  });

  it('shows Themify icons as their Font Awesome counterparts in any widget', () => {
    const { blocks } = run('social-icons', {
      social_icon_list: [
        { _id: 'a', social_icon: { value: 'ti ti-instagram', library: 'john_core_themify_icons' } },
      ],
    });
    expect(find(blocks, 'fresco/social-icons')[0]!.attrs.items).toEqual([
      expect.objectContaining({ icon: { set: 'brands', name: 'instagram' } }),
    ]);
  });
});
