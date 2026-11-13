import { describe, expect, it } from 'vitest';
import { customCss, isWpBakeryLayout, parseWpBakery, vcEncoded } from '../src/elementor.js';

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
