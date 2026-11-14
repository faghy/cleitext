import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '@cleitext/blocks';
import { wxrToDocument } from './wxr';

const cdata = (v: string) => `<![CDATA[${v}]]>`;
const meta = (key: string, value: string) =>
  `<wp:postmeta><wp:meta_key>${key}</wp:meta_key><wp:meta_value>${cdata(value)}</wp:meta_value></wp:postmeta>`;
const item = (id: number, type: string, slug: string, body: string, extra = '') =>
  `<item><title>${slug}</title><link>https://shop.example/${slug}/</link><dc:creator>ann</dc:creator><wp:post_id>${id}</wp:post_id><wp:post_name>${slug}</wp:post_name><wp:status>publish</wp:status><wp:post_type>${type}</wp:post_type><wp:post_date_gmt>2026-01-02 10:00:00</wp:post_date_gmt><content:encoded>${cdata(body)}</content:encoded>${extra}</item>`;

/** `#E-8_` + base64 of the URL-encoded text, as WPBakery writes links and frames. */
const encoded = (text: string) =>
  `#E-8_${Buffer.from(encodeURIComponent(text)).toString('base64')}`;

/** A synthetic shop page built with WPBakery (no client content). */
const PAGE = [
  '[vc_row full_width="stretch_row" css=".vc_custom_1{padding-top: 40px !important;padding-bottom: 40px !important;background-color: #94694e !important;border-bottom-width: 3px !important;border-bottom-style: solid !important;border-bottom-color: #000 !important;}"]',
  '[vc_column width="1/2" offset="vc_col-md-6"][vc_custom_heading text="Welcome" font_container="tag:h2|font_size:32|text_align:center|color:%23333333"][vc_column_text]<p>Hello <strong>there</strong></p>[/vc_column_text]',
  '[vc_btn title="Shop" align="center" link="url:https%3A%2F%2Fshop.example%2Fshop%2F|target:_blank" add_icon="true" i_icon_fontawesome="fa fa-gift"][/vc_column]',
  '[vc_column width="1/2"][vc_single_image image="11" img_size="full" alignment="center" onclick="img_link_large"][vc_empty_space height="24px"][vc_separator color="custom" accent_color="#cccccc"][/vc_column][/vc_row]',
  '[vc_row][vc_column][vc_row_inner][vc_column_inner width="1/3"][vc_column_text]A[/vc_column_text][/vc_column_inner][vc_column_inner width="2/3"][vc_column_text]B[/vc_column_text][/vc_column_inner][/vc_row_inner]',
  `[vc_images_carousel images="10,11" slides_per_view="2" autoplay="yes" onclick="custom_link" custom_links="${encoded('https://shop.example/a/,https://shop.example/b/')}"]`,
  '[vc_gallery type="image_grid" images="10,11"][recent_products limit="4"][vc_widget_sidebar sidebar_id="sidebar-1"]',
  `[vc_gmaps link="${encoded('<iframe src="https://maps.google.com/maps?q=Via+Roma+1%2C+Genova&output=embed"></iframe>')}" size="300"]`,
  '[vc_tta_tabs][vc_tta_section title="One"][vc_column_text]First[/vc_column_text][/vc_tta_section][vc_tta_section title="Two"][vc_column_text]Second[/vc_column_text][/vc_tta_section][/vc_tta_tabs]',
  '[/vc_column][/vc_row]',
].join('');

const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Shop</title><link>https://shop.example</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://shop.example</wp:base_blog_url>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>ann</wp:author_login><wp:author_email>ann@example.com</wp:author_email><wp:author_display_name>Ann</wp:author_display_name></wp:author>
${item(10, 'attachment', 'logo', '', '<wp:attachment_url>https://shop.example/wp-content/uploads/logo.png</wp:attachment_url>')}
${item(11, 'attachment', 'bottle', '', '<wp:attachment_url>https://shop.example/wp-content/uploads/bottle.jpg</wp:attachment_url>')}
${item(20, 'page', 'home', PAGE, meta('_wpb_vc_js_status', 'true'))}
${item(21, 'page', 'loose', '[vc_column width="1/2"][vc_column_text]Left[/vc_column_text][/vc_column][vc_column width="1/2"][vc_column_text]Right[/vc_column_text][/vc_column][vc_row][vc_column][vc_column_text]Row[/vc_column_text][/vc_column][/vc_row]')}
${item(22, 'page', 'plain', '<p>No builder [vc_column_text]</p>')}
${item(30, 'product', 'bottle', '<p>A bottle.</p>', `<excerpt:encoded>${cdata('<p>Soft <strong>notes</strong></p>')}</excerpt:encoded>${meta('_sku', 'BOT-1')}${meta('_regular_price', '10')}`)}
${item(23, 'page', 'chosen', '[vc_row][vc_column][products ids="30" columns="1"][add_to_cart id="31"][/vc_column][/vc_row]')}
</channel></rss>`;

const find = (blocks: CxdBlock[], type: string): CxdBlock[] =>
  blocks.flatMap((b) => [...(b.type === type ? [b] : []), ...find(b.children ?? [], type)]);

describe('a WPBakery site', () => {
  const { document, warnings } = wxrToDocument(xml, { locale: 'en' });
  const page = (slug: string) => document.entries!.find((e) => e.slug === slug)!;

  it('imports pages built with WPBakery as Fresco pages', () => {
    const home = page('home');
    expect(home.document!.editor).toEqual({ id: 'fresco' });
    const blocks = home.document!.blocks as CxdBlock[];
    // Rows: background, spacing and border from the `css` rules.
    expect(blocks[0]!.attrs).toMatchObject({
      background_color: '#94694e',
      border_style: 'solid',
      border_color: '#000',
      border_width: { top: 0, right: 0, bottom: 3, left: 0, unit: 'px' },
    });
    // Columns with their widths, on desktop and tablet.
    const columns = blocks[0]!.children!;
    expect(columns.map((c) => c.attrs.width)).toEqual([
      { size: 50, unit: '%' },
      { size: 50, unit: '%' },
    ]);
    expect(find(blocks, 'fresco/heading')[0]!.attrs).toMatchObject({ title: 'Welcome', tag: 'h2' });
    expect(find(blocks, 'fresco/text')[0]!.attrs.content).toContain('<strong>there</strong>');
    expect(find(blocks, 'fresco/button')[0]!.attrs).toMatchObject({
      text: 'Shop',
      link: { url: '/shop/', newTab: true },
      icon: { set: 'solid', name: 'gift' },
    });
    expect(find(blocks, 'fresco/image')[0]!.attrs.image).toEqual({
      id: 'att:11',
      url: 'https://shop.example/wp-content/uploads/bottle.jpg',
    });
    expect(find(blocks, 'fresco/spacer')).toHaveLength(1);
    expect(find(blocks, 'fresco/divider')).toHaveLength(1);
    // Inner rows keep their columns.
    const inner = find(blocks, 'fresco/text').filter((b) =>
      /^[AB]$/.test(String(b.attrs.content).replace(/<[^>]+>/g, '')),
    );
    expect(inner).toHaveLength(2);
    expect(find(blocks, 'fresco/image-carousel')[0]!.attrs.images).toHaveLength(2);
    expect(find(blocks, 'fresco/gallery')[0]!.attrs.images).toHaveLength(2);
    expect(find(blocks, 'fresco/google-maps')[0]!.attrs.address).toBe('Via Roma 1, Genova');
    expect(find(blocks, 'fresco/tabs')).toHaveLength(1);
    // Other plugins' shortcodes are offered to them; the rest is reported, never lost silently.
    expect(JSON.stringify(blocks)).toContain('[recent_products limit=\\"4\\"]');
    expect(warnings).toContain(
      'home: 1 WPBakery element(s) "vc_widget_sidebar" have no Fresco counterpart yet: their text, if any, was kept.',
    );
    expect(
      warnings.some((w) => w.includes('https://shop.example/a/, https://shop.example/b/')),
    ).toBe(true);
    expect(warnings).toContain(
      '3 page(s) built with WPBakery were imported as Fresco pages: activate the Fresco plugin to show and edit them.',
    );
  });

  it('chooses products by their codes, and keeps formatted short descriptions for Cleishop', () => {
    const text = JSON.stringify(page('chosen').document!.blocks);
    expect(text).toContain('[products skus=\\"BOT-1\\" columns=\\"1\\"]');
    // A product that is not in the export keeps its id.
    expect(text).toContain('[add_to_cart id=\\"31\\"]');
    expect(page('bottle').excerpt).toBe('Soft notes');
    const shop = (document.plugins as { shop: { products: { excerpt?: string }[] } }).shop;
    expect(shop.products[0]!.excerpt).toBe('<p>Soft <strong>notes</strong></p>');
  });

  it('puts columns outside a row in one row, and leaves other pages as they were', () => {
    const blocks = page('loose').document!.blocks as CxdBlock[];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.children).toHaveLength(2);
    expect(page('plain').document!.editor).toBeUndefined();
  });
});
