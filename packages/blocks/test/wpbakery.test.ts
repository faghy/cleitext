import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '../src/index.js';
import {
  customCss,
  isWpBakeryLayout,
  parseWpBakery,
  vcEncoded,
  wpbakeryToFresco,
} from '../src/elementor.js';

describe('WPBakery layouts', () => {
  it('reads rows, columns and elements as a tree', () => {
    const tree = parseWpBakery(
      '[vc_row el_id="top"][vc_column width="1/2"][vc_column_text]<p>Hi [b]there[/b]</p>[/vc_column_text][vc_empty_space height="10px"][/vc_column][/vc_row]',
    );
    expect(tree).toHaveLength(1);
    const column = tree[0]!.children[0]!;
    expect(tree[0]!.attrs).toEqual({ el_id: 'top' });
    expect(column.attrs.width).toBe('1/2');
    expect(column.children.map((c) => c.tag)).toEqual(['vc_column_text', 'vc_empty_space']);
    expect(column.children[0]!.content).toBe('<p>Hi [b]there[/b]</p>');
    expect(isWpBakeryLayout('[vc_row]')).toBe(true);
    expect(isWpBakeryLayout('<p>[vc_column_text]</p>')).toBe(false);
  });

  it('reads custom CSS rules and encoded attributes', () => {
    expect(
      customCss(
        '.vc_custom_1{margin-top: 10px !important;background: #fff url(a.jpg?id=3) !important;}',
      ).get('vc_custom_1'),
    ).toEqual({ 'margin-top': '10px', background: '#fff url(a.jpg?id=3)' });
    const text = 'https://example.com/a/?x=1,https://example.com/b/';
    expect(vcEncoded(`#E-8_${Buffer.from(encodeURIComponent(text)).toString('base64')}`)).toBe(
      text,
    );
    expect(vcEncoded('plain')).toBe('plain');
  });
});

describe('WPBakery → Fresco', () => {
  const MEDIA: Record<number, string> = {
    1: 'https://old.example/wp-content/uploads/logo.png',
    2: 'https://old.example/wp-content/uploads/town.jpg',
  };
  const convert = (content: string, css = '', warnings: string[] = []) =>
    wpbakeryToFresco(content, css, {
      mediaRef: (n) => (MEDIA[n] ? `m${n}` : undefined),
      attachmentUrl: (n) => MEDIA[n],
      warn: (w) => warnings.push(w),
    }) ?? [];
  const walk = (blocks: CxdBlock[]): CxdBlock[] =>
    blocks.flatMap((b) => [b, ...walk(b.children ?? [])]);
  const of = (blocks: CxdBlock[], type: string) =>
    walk(blocks).filter((b) => b.type === `fresco/${type}`);

  it('keeps stretched rows with their background and spacing', () => {
    const out = convert(
      '[vc_row full_width="stretch_row_content_no_spaces" css=".vc_custom_1{margin-bottom: 75px !important;background-image: url(https://old.example/wp-content/uploads/town.jpg?id=2) !important;background-size: cover !important;}"][vc_column][vc_empty_space height="132px"][vc_single_image image="1" img_size="large" alignment="center"][/vc_column][/vc_row]',
    );
    const row = out[0]!;
    expect(row.attrs).toMatchObject({ content_width: 'full', background_size: 'cover' });
    expect(row.attrs._margin).toMatchObject({ bottom: 75 });
    const column = row.children![0]!;
    expect(column.attrs._padding).toMatchObject({ top: 35, right: 0, bottom: 0, left: 0 });
    expect(column.children!.map((b) => b.type)).toEqual(['fresco/spacer', 'fresco/image']);
    expect(column.children![1]!.attrs).toMatchObject({ align: 'center' });
    // WPBakery's 35px under elements, none under spacers.
    expect(column.children![1]!.attrs._margin).toMatchObject({ bottom: 35 });
    expect(column.children![0]!.attrs._margin).toBeUndefined();
  });

  it('gives columns WPBakery gutters and inner rows their widths', () => {
    const out = convert(
      '[vc_row][vc_column width="1/2"][vc_column_text]<p>A</p>[/vc_column_text][/vc_column][vc_column width="1/2"][vc_row_inner][vc_column_inner width="1/3"][vc_column_text]B[/vc_column_text][/vc_column_inner][vc_column_inner width="2/3"][/vc_column_inner][/vc_row_inner][/vc_column][/vc_row]',
    );
    const row = out[0]!;
    expect(row.attrs).toMatchObject({ flex_direction: 'row', 'flex_direction@mobile': 'column' });
    const [left, right] = row.children!;
    expect([left!.attrs.width, right!.attrs.width]).toEqual([
      { size: 50, unit: '%' },
      { size: 50, unit: '%' },
    ]);
    expect(left!.attrs._padding).toMatchObject({ left: 0, right: 15 });
    expect(right!.attrs._padding).toMatchObject({ left: 15, right: 0 });
    expect(left!.attrs['_padding@mobile']).toMatchObject({ left: 15, right: 15 });
    const inner = of(row.children![1]!.children!, 'container')[0]!;
    expect(inner.children!.map((c) => (c.attrs.width as { size: number }).size)).toEqual([
      33.333, 66.667,
    ]);
  });

  it('makes a text that is one heading a heading, and keeps paragraphs', () => {
    const out = convert(
      '[vc_row][vc_column][vc_column_text]</p>\n<h2 style="color: #94694e; text-align: center;"><strong>OUR TOWN</strong></h2>\n<p>[/vc_column_text][vc_column_text]First line.</p>\n<p>Second.[/vc_column_text][/vc_column][/vc_row]',
    );
    expect(of(out, 'heading')[0]!.attrs).toMatchObject({
      tag: 'h2',
      title: 'OUR TOWN',
      title_color: '#94694e',
      align: 'center',
    });
    expect(of(out, 'text')[0]!.attrs.content).toBe('<p>First line.</p>\n<p>Second.</p>');
  });

  it('converts buttons with their link, icon and outline', () => {
    const out = convert(
      '[vc_row][vc_column][vc_btn title="Gift" style="outline" align="center" i_icon_fontawesome="fa fa-gift" add_icon="true" link="url:%2Fgift%2F|||"][/vc_column][/vc_row]',
    );
    expect(of(out, 'button')[0]!.attrs).toMatchObject({
      text: 'Gift',
      link: { url: '/gift/' },
      align: 'center',
      icon: { set: 'solid', name: 'gift' },
      border_style: 'solid',
    });
  });

  it('crops images to their WPBakery size, and converts carousels and slideshows', () => {
    const out = convert(
      '[vc_row][vc_column][vc_single_image image="2" img_size="600x700" onclick="custom_link" link="/shop/"][vc_images_carousel images="1,2" autoplay="yes" slides_per_view="2"][vc_gallery interval="3" images="1,2" img_size="full"][/vc_column][/vc_row]',
    );
    const picture = of(out, 'image')[0]!.attrs;
    expect(picture.link).toEqual({ url: '/shop/' });
    expect(JSON.stringify(picture)).toMatch(/600/);
    const carousels = of(out, 'image-carousel');
    expect(carousels[0]!.attrs.per_view).toBe(2);
    expect(carousels[1]!.attrs).toMatchObject({ effect: 'fade', interval: 3000 });
  });

  it('offers other plugins’ shortcodes and reports elements without a counterpart', () => {
    const warnings: string[] = [];
    const out = convert(
      '[vc_row][vc_column][recent_products per_page="4"][vc_widget_sidebar sidebar_id="x"][/vc_column][/vc_row]',
      '',
      warnings,
    );
    expect(JSON.stringify(out)).toContain('recent_products');
    expect(warnings).toEqual([
      '1 WPBakery element(s) "vc_widget_sidebar" have no Fresco counterpart yet: their text, if any, was kept.',
    ]);
  });

  it('puts a column outside a row in a row', () => {
    const out = convert('[vc_column][vc_column_text]Lost[/vc_column_text][/vc_column]');
    expect(of(out, 'text')[0]!.attrs.content).toBe('<p>Lost</p>');
  });

  it('places maps of embeds by their coordinates, and icons with WPBakery’s defaults', () => {
    const frame =
      '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d8407.67!2d-73.988!3d40.744!2m3"></iframe>';
    const link = `#E-8_${Buffer.from(encodeURIComponent(frame)).toString('base64')}`;
    const out = convert(
      `[vc_row][vc_column][vc_gmaps link="${link}"][vc_icon][/vc_column][/vc_row]`,
    );
    expect(of(out, 'google-maps')[0]!.attrs.address).toBe('40.744,-73.988');
    expect(of(out, 'icon')[0]!.attrs).toMatchObject({
      icon: { set: 'solid', name: 'circle-half-stroke' },
      primary_color: '#5472d2',
    });
  });
});
